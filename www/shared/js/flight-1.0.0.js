// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * flight.js - Throttle-and-look flight for space scenes (shared engine part).
 *
 * The movement model for a ship, and every input source that can drive it:
 * keyboard, pointer-locked mouse, a touch throttle, a touch look joystick, and
 * a gamepad. The terrestrial counterpart is controls.js, which walks a person
 * around a room; nothing here is shared with it and nothing there is changed.
 *
 * NO THREE AT ALL. This module owns plain numbers and hands them out through
 * getFlightState(). The caller applies them to whatever camera or mesh it
 * likes. That keeps every line of the maths testable with real values instead
 * of through a stub, and it means a future space game can drive something
 * other than a camera without touching this file.
 *
 * TWO THROTTLE MODES, because a lever and a spring-loaded stick are different
 * instruments and a phone can only really offer the second one.
 *
 *   SPEED MODE (the default, and what a keyboard gets). The throttle sets a
 *   TARGET SPEED and the ship accelerates toward it. Not Newtonian drift: at
 *   zero throttle the ship coasts to a stop. There is no boost and no brake,
 *   because the throttle IS the speed selector, so a visitor slows down for
 *   close work and opens up for travel without being told to. A key is a
 *   momentary contact driving a value that persists, which is exactly a lever.
 *
 *   THRUST MODE (`thrustThrottle`, which the touch UI turns on). The throttle
 *   commands ACCELERATION. Push it up and the ship gains speed for as long as
 *   it is held, let go and the ship keeps the speed it has. Push it down to
 *   slow, and past a stop into astern. This exists because a touch control
 *   cannot be a lever: there is no detent under a thumb, no way to feel where
 *   the stick was left, and a finger lifted off glass is indistinguishable from
 *   a finger holding still. A stick that springs home and means "more" while it
 *   is held asks nothing of a sense the glass cannot provide.
 *
 * A ship coasting under no thrust cannot stop by releasing anything, so thrust
 * mode gives the double tap that used to close the throttle a real job: it
 * brakes to a standstill, and lets go the moment the pilot touches the stick.
 *
 * YAW AND PITCH ONLY, NO ROLL. The orientation is rebuilt from two angles
 * every frame rather than accumulated, because accumulating is exactly how
 * roll creeps into a scene that is supposed to have none, and it is very hard
 * to remove afterwards. Pitch is clamped short of vertical so nobody inverts.
 *
 * ON INPUT PRECEDENCE. There is none, and none is needed. The throttle is one
 * persistent number: the touch slider writes it absolutely (it is a physical
 * control that stays where it is put), while the keyboard and gamepad nudge it
 * at a rate. A self-centring stick therefore leaves the throttle alone when
 * released, which is what a throttle should do, and no two sources ever fight
 * over the same value. Look input is a per-frame delta that simply sums.
 */

const DEFAULTS = {
    maxForward: 4000,
    maxReverse: 1000,
    accelTime: 6,           // seconds from rest to maxForward
    decelTime: 4,           // seconds from maxForward back to rest
    turnRate: 1.3,          // radians/second at full stick or key deflection
    pitchClamp: 1.48,       // just short of vertical (85 degrees)
    mouseSensitivity: 0.0022,
    lookSensitivity: 1.0,
    invertPitch: false,
    throttleRate: 0.8,      // throttle fraction per second for key/pad nudges
    gamepadDeadzone: 0.15,
    doubleTapMs: 320,
    thrustThrottle: false   // false: the throttle picks a speed. true: it accelerates
};

const TAU = Math.PI * 2;

let cfg = { ...DEFAULTS };
let accelRate = 0;
let decelRate = 0;

const state = {
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    speed: 0,
    targetSpeed: 0,
    throttle: 0         // -1 .. 1, persistent
};

// Per-frame input accumulators.
const lookDelta = { x: 0, y: 0 };   // instantaneous (mouse), consumed each frame
const lookRate = { x: 0, y: 0 };    // held (keys, joystick, pad), scaled by dt
const keys = new Set();
// `lookHold` is the joystick's CURRENT DEFLECTION, and it is persistent on
// purpose. A thumb resting at full deflection is a held control that emits no
// events at all: `touchmove` fires when a finger MOVES, so writing the turn
// rate from inside that handler turned the ship on the frames an event happened
// to land on and on no others. Measured at 60fps, a stick held hard over for a
// second yawed the ship 1.2 degrees where the same second on a held key yawed
// it 74.5. The stick is now read every frame, like the keys and the pad.
const touch = {
    throttleId: null, lookId: null, lookOrigin: null,
    lookHold: { x: 0, y: 0 },
    lastTapAt: 0
};

// Thrust mode only: a full stop, asked for by a double tap and held until the
// ship is still or the pilot takes the stick back. It is deliberately NOT part
// of `state`, because it is a request in progress rather than something the
// experience should be reading or drawing.
let braking = false;

let perimeter = null;               // { centre, radius, fade }
let outsidePerimeter = false;
let perimeterCallback = null;
let constrainPosition = null;
let paused = false;
let pointerLocked = false;
let controller = null;
let elements = {};

// ---- Pure core --------------------------------------------------------------

/** Wrap an angle into [-PI, PI], so yaw cannot grow without bound over a long
 *  session and comparisons stay meaningful. */
export function wrapAngle(a) {
    let x = (a + Math.PI) % TAU;
    if (x < 0) x += TAU;
    return x - Math.PI;
}

/** Map the throttle fraction to a target speed. Deliberately ASYMMETRIC: full
 *  forward and full reverse are different speeds, because a ship that reverses
 *  as fast as it flies feels wrong and makes the reverse stop feel weightless. */
export function throttleToTargetSpeed(fraction, maxForward, maxReverse) {
    const f = Math.max(-1, Math.min(1, fraction || 0));
    return f >= 0 ? f * maxForward : f * maxReverse;
}

/** Move `current` toward `target` without ever overshooting it.
 *
 *  Speeding up and slowing down use different rates, so a ship builds speed
 *  gently and sheds it briskly. "Speeding up" means growing in magnitude, so a
 *  throttle slammed from full ahead to full astern decelerates through zero
 *  first and only then accelerates backwards, which is what a pilot expects. */
export function stepSpeed(current, target, accelRateIn, decelRateIn, dt) {
    const delta = target - current;
    if (delta === 0 || dt <= 0) return current;
    const rate = Math.abs(target) > Math.abs(current) ? accelRateIn : decelRateIn;
    const step = rate * dt;
    if (Math.abs(delta) <= step) return target;      // arrive exactly, never past
    return current + Math.sign(delta) * step;
}

/** THRUST MODE's step. `command` is the stick, -1 to 1, and it is an
 *  acceleration rather than a destination.
 *
 *  NO COMMAND MEANS NO CHANGE, which is the whole character of this mode: a
 *  released stick leaves the ship flying at whatever speed it had. That is the
 *  one thing speed mode cannot express, and the reason this exists.
 *
 *  A command opposing the way the ship is going is BRAKING and gets the faster
 *  rate, the same asymmetry `stepSpeed` uses, so shedding speed stays brisker
 *  than building it however the throttle is being read. */
export function stepThrust(current, command, accelRateIn, decelRateIn, dt) {
    const c = Math.max(-1, Math.min(1, command || 0));
    if (c === 0 || dt <= 0) return current;
    const braking_ = current !== 0 && Math.sign(c) !== Math.sign(current);
    return current + c * (braking_ ? decelRateIn : accelRateIn) * dt;
}

/** Apply a look delta to yaw and pitch, with sensitivity, optional pitch
 *  inversion, a pitch clamp, and yaw wrapping. Returns a new pair rather than
 *  mutating, so it is trivially testable. */
export function stepLook(yaw, pitch, dYaw, dPitch, opts = {}) {
    const sensitivity = opts.sensitivity === undefined ? 1 : opts.sensitivity;
    const clamp = opts.pitchClamp === undefined ? DEFAULTS.pitchClamp : opts.pitchClamp;
    const invert = opts.invertPitch ? -1 : 1;

    const nextYaw = wrapAngle(yaw - dYaw * sensitivity);
    const rawPitch = pitch - dPitch * sensitivity * invert;
    return { yaw: nextYaw, pitch: Math.max(-clamp, Math.min(clamp, rawPitch)) };
}

/** The unit forward vector for a yaw/pitch pair, in the same convention the
 *  renderer uses: yaw 0 and pitch 0 look straight down -Z. */
export function forwardFrom(yaw, pitch) {
    const cp = Math.cos(pitch);
    return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/** How much forward authority survives at `distance` from the perimeter centre.
 *  1 inside, falling to 0 across `fade`, never negative. This is a damping
 *  factor and not a wall: the caller applies it only to motion heading further
 *  out, so a visitor can always fly home at full speed. */
export function perimeterDamping(distance, radius, fade) {
    if (distance <= radius) return 1;
    if (!fade || fade <= 0) return 0;
    return Math.max(0, 1 - (distance - radius) / fade);
}

// ---- Setup ------------------------------------------------------------------

export function initFlight(options = {}) {
    disposeFlight();
    cfg = { ...DEFAULTS, ...(options.flight || options) };
    accelRate = cfg.maxForward / (cfg.accelTime || 1);
    decelRate = cfg.maxForward / (cfg.decelTime || 1);

    const spawn = options.spawn || {};
    state.position = { x: 0, y: 0, z: 0, ...(spawn.position || {}) };
    state.yaw = spawn.yaw || 0;
    state.pitch = spawn.pitch || 0;
    state.speed = 0;
    state.targetSpeed = 0;
    state.throttle = 0;
    braking = false;

    lookDelta.x = lookDelta.y = 0;
    lookRate.x = lookRate.y = 0;
    keys.clear();
    // Touch bookkeeping must reset too. Leaving a stale finger id behind means
    // the first drag after a restart is ignored, because the module is still
    // waiting for a finger that lifted before the reset.
    touch.throttleId = null;
    touch.lookId = null;
    touch.lookOrigin = null;
    touch.lookHold.x = touch.lookHold.y = 0;
    touch.lastTapAt = 0;
    paused = false;
    outsidePerimeter = false;

    elements = options.elements || {};
    // READ THE LOCK RATHER THAN ASSUMING IT IS OFF. init is called again on a
    // respawn and on a restart, and the pointer lock survives both: the browser
    // has no reason to fire pointerlockchange, so assuming false here would
    // leave the module waiting for an event that never comes and mouse look
    // would be dead for the rest of the session.
    pointerLocked = typeof document !== 'undefined' && !!elements.canvas &&
        document.pointerLockElement === elements.canvas;
    controller = new AbortController();
    wireKeyboard(controller.signal);
    wireMouse(controller.signal);
    wireTouch(controller.signal);

    syncThrottleUi();
    return getFlightState();
}

export function disposeFlight() {
    if (controller) controller.abort();
    controller = null;
    keys.clear();
    elements = {};
    perimeterCallback = null;
    constrainPosition = null;
    perimeter = null;
}

// ---- The frame --------------------------------------------------------------

export function updateFlight(deltaTime) {
    if (paused || !deltaTime) return;
    const dt = Math.min(deltaTime, 0.1);

    pollGamepad(dt);
    applyHeldKeys(dt);
    applyTouchLook();

    // Look: instantaneous deltas (mouse) plus held rates (keys, stick, pad).
    const dYaw = lookDelta.x + lookRate.x * cfg.turnRate * dt;
    const dPitch = lookDelta.y + lookRate.y * cfg.turnRate * dt;
    const look = stepLook(state.yaw, state.pitch, dYaw, dPitch, {
        sensitivity: cfg.lookSensitivity,
        pitchClamp: cfg.pitchClamp,
        invertPitch: cfg.invertPitch
    });
    state.yaw = look.yaw;
    state.pitch = look.pitch;
    lookDelta.x = lookDelta.y = 0;
    lookRate.x = lookRate.y = 0;

    // Speed.
    const forward = forwardFrom(state.yaw, state.pitch);
    if (cfg.thrustThrottle) stepThrustMode(forward, dt);
    else {
        state.targetSpeed = applyPerimeter(
            throttleToTargetSpeed(state.throttle, cfg.maxForward, cfg.maxReverse), forward);
        state.speed = stepSpeed(state.speed, state.targetSpeed, accelRate, decelRate, dt);
    }

    // Move.
    const travel = state.speed * dt;
    let next = {
        x: state.position.x + forward.x * travel,
        y: state.position.y + forward.y * travel,
        z: state.position.z + forward.z * travel
    };
    if (constrainPosition) next = constrainPosition(next, state.position) || next;
    state.position = next;

    notePerimeterCrossing();
}

/** One frame of thrust mode: brake, integrate, clamp, then answer to the
 *  perimeter.
 *
 *  THE PERIMETER IS A SPEED CEILING HERE, not a target. In speed mode it damps
 *  the number the throttle asked for, but a thrust throttle asks for nothing to
 *  damp, so what it damps instead is how fast the ship is allowed to be while
 *  heading further out. The ship is walked down to that ceiling at the braking
 *  rate rather than clamped onto it, so the edge of the world stays a hand on
 *  the shoulder rather than a wall. Inside the perimeter the ceiling is the
 *  ship's own maximum and none of this is reachable.
 *
 *  `targetSpeed` is reported as the current speed, because in this mode there
 *  genuinely is no target: the speedometer's demand marker rides with the ship
 *  and its ghost band closes to nothing, which is an honest drawing of a
 *  control that commands change rather than a destination. */
function stepThrustMode(forward, dt) {
    if (braking) {
        state.speed = stepSpeed(state.speed, 0, accelRate, decelRate, dt);
        if (state.speed === 0) braking = false;
    } else {
        state.speed = stepThrust(state.speed, state.throttle, accelRate, decelRate, dt);
        state.speed = Math.max(-cfg.maxReverse, Math.min(cfg.maxForward, state.speed));
    }

    const ceiling = applyPerimeter(
        state.speed >= 0 ? cfg.maxForward : -cfg.maxReverse, forward);
    if (Math.abs(state.speed) > Math.abs(ceiling)) {
        state.speed = stepSpeed(state.speed, ceiling, accelRate, decelRate, dt);
    }
    state.targetSpeed = state.speed;
}

/** Damp only motion that is heading further out. Turning and the trip home
 *  keep full authority, so nobody ever feels the controls fighting them. */
function applyPerimeter(target, forward) {
    if (!perimeter) return target;
    const c = perimeter.centre;
    const dx = state.position.x - c.x, dy = state.position.y - c.y, dz = state.position.z - c.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const damp = perimeterDamping(dist, perimeter.radius, perimeter.fade);
    if (damp >= 1) return target;

    const dir = target !== 0 ? Math.sign(target) : Math.sign(state.speed);
    const outward = ((forward.x * dx + forward.y * dy + forward.z * dz) / dist) * dir;
    return outward > 0 ? target * damp : target;
}

function notePerimeterCrossing() {
    if (!perimeter || !perimeterCallback) return;
    const c = perimeter.centre;
    const dist = Math.hypot(
        state.position.x - c.x, state.position.y - c.y, state.position.z - c.z);
    const now = dist > perimeter.radius;
    if (now !== outsidePerimeter) {
        outsidePerimeter = now;
        perimeterCallback(now, dist);
    }
}

// ---- Public setters ---------------------------------------------------------

export function getFlightState() {
    return {
        position: { ...state.position },
        yaw: state.yaw,
        pitch: state.pitch,
        speed: state.speed,
        targetSpeed: state.targetSpeed,
        throttle: state.throttle,
        forward: forwardFrom(state.yaw, state.pitch)
    };
}

/** Set the throttle absolutely, -1 (full astern) to 1 (full ahead). In thrust
 *  mode that is a demand for acceleration rather than for a speed.
 *
 *  ANY DELIBERATE THROTTLE INPUT CANCELS A BRAKE. A pilot reaching for the
 *  stick during a stop wants the stick, and a control that ignores a hand on it
 *  for the next four seconds is a control that feels broken. */
export function setTargetSpeedFraction(fraction) {
    state.throttle = Math.max(-1, Math.min(1, fraction || 0));
    braking = false;
    syncThrottleUi();
}

/** Move the throttle by a delta, the way a key press or a stick does. */
export function nudgeThrottle(delta) {
    setTargetSpeedFraction(state.throttle + delta);
}

export function setLookSensitivity(s) { cfg.lookSensitivity = s; }
export function setInvertPitch(on) { cfg.invertPitch = !!on; }

export function setPerimeter(centre, radius, fade) {
    perimeter = { centre: { ...centre }, radius, fade };
}

export function onPerimeterChange(cb) { perimeterCallback = cb; }

/** A hook for the experience to keep the ship out of solid things. Receives
 *  the proposed and previous positions, returns the position to accept. */
export function setConstrainPosition(fn) { constrainPosition = fn; }

/** Freeze input and motion. Clears the pending mouse delta too, so unpausing
 *  does not snap the view by however far the cursor travelled meanwhile. */
export function setPaused(on) {
    paused = !!on;
    if (paused) {
        lookDelta.x = lookDelta.y = 0;
        lookRate.x = lookRate.y = 0;
        // The stick is released along with the keys, and for the same reason:
        // nothing a visitor was holding when they paused should still be held
        // when they come back. A finger still on the glass re-arms it with its
        // next move, and a finger that lifted meanwhile is handled by `onLookEnd`.
        touch.lookHold.x = touch.lookHold.y = 0;
        keys.clear();
        // A spring-loaded throttle is held input too, so it comes home with the
        // rest. Written directly rather than through the setter, because a
        // pause should not cancel a brake that was already under way.
        if (cfg.thrustThrottle && state.throttle !== 0) {
            state.throttle = 0;
            syncThrottleUi();
        }
    }
}

export function isPaused() { return paused; }
export function isPointerLocked() { return pointerLocked; }

// ---- Keyboard ---------------------------------------------------------------
//
// Built first, and deliberately complete: throttle, yaw, and pitch are all
// reachable without a mouse, so keyboard-only is a first-class way to play
// rather than something bolted on at the accessibility pass.

const THROTTLE_UP = new Set(['KeyW', 'ArrowUp']);
const THROTTLE_DOWN = new Set(['KeyS', 'ArrowDown']);
const YAW_LEFT = new Set(['KeyA', 'ArrowLeft']);
const YAW_RIGHT = new Set(['KeyD', 'ArrowRight']);
const PITCH_UP = new Set(['KeyQ']);
const PITCH_DOWN = new Set(['KeyE']);
const THROTTLE_ZERO = new Set(['KeyX', 'Space']);

function wireKeyboard(signal) {
    if (typeof document === 'undefined') return;
    document.addEventListener('keydown', (e) => {
        if (paused) return;
        if (THROTTLE_ZERO.has(e.code)) {
            setTargetSpeedFraction(0);
            e.preventDefault();
            return;
        }
        if (isFlightKey(e.code)) {
            keys.add(e.code);
            e.preventDefault();
        }
    }, { signal });
    document.addEventListener('keyup', (e) => keys.delete(e.code), { signal });
    // A window blur while a key is held would otherwise leave the ship turning
    // forever, because the keyup lands somewhere else.
    if (typeof window !== 'undefined') {
        window.addEventListener('blur', () => keys.clear(), { signal });
    }
}

function isFlightKey(code) {
    return THROTTLE_UP.has(code) || THROTTLE_DOWN.has(code) ||
        YAW_LEFT.has(code) || YAW_RIGHT.has(code) ||
        PITCH_UP.has(code) || PITCH_DOWN.has(code);
}

function applyHeldKeys(dt) {
    let throttleDelta = 0;
    for (const code of keys) {
        if (THROTTLE_UP.has(code)) throttleDelta += cfg.throttleRate * dt;
        else if (THROTTLE_DOWN.has(code)) throttleDelta -= cfg.throttleRate * dt;
        else if (YAW_LEFT.has(code)) lookRate.x -= 1;
        else if (YAW_RIGHT.has(code)) lookRate.x += 1;
        else if (PITCH_UP.has(code)) lookRate.y -= 1;
        else if (PITCH_DOWN.has(code)) lookRate.y += 1;
    }
    // A rate, not a jump: holding W eases the throttle open the way a lever
    // moves, instead of snapping to full ahead on the first frame.
    if (throttleDelta) nudgeThrottle(throttleDelta);
}

// ---- Mouse ------------------------------------------------------------------

function wireMouse(signal) {
    if (typeof document === 'undefined') return;
    const canvas = elements.canvas;
    if (canvas && canvas.addEventListener) {
        canvas.addEventListener('click', () => {
            if (!paused && canvas.requestPointerLock) canvas.requestPointerLock();
        }, { signal });
    }
    document.addEventListener('pointerlockchange', () => {
        pointerLocked = document.pointerLockElement === canvas;
        // Losing the lock (tab switch, Esc, a browser gesture) must not leave a
        // half-applied delta behind to be spent on the next frame.
        if (!pointerLocked) lookDelta.x = lookDelta.y = 0;
    }, { signal });
    document.addEventListener('mousemove', (e) => {
        if (!pointerLocked || paused) return;
        lookDelta.x += (e.movementX || 0) * cfg.mouseSensitivity;
        lookDelta.y += (e.movementY || 0) * cfg.mouseSensitivity;
    }, { signal });
}

// ---- Touch ------------------------------------------------------------------
//
// The throttle is a vertical track, and WHAT IT DOES WHEN THE THUMB LIFTS is
// the one thing `thrustThrottle` changes.
//
// In speed mode it keeps its position, which is what makes it a lever, and what
// lets a visitor cross to the Moon without pinning a thumb to the glass. A
// double tap returns it to zero.
//
// In thrust mode it springs home. Nothing is left behind to be forgotten about,
// and the ship carries on at the speed it reached, which is what "let go and it
// stops pushing" has to mean in a place with nothing to slow down against. The
// double tap becomes the brake, since coasting is now a state a pilot can be in
// and needs a way out of.

function wireTouch(signal) {
    const zone = elements.throttleZone;
    const look = elements.lookZone;
    if (zone && zone.addEventListener) {
        zone.addEventListener('touchstart', onThrottleStart, { signal, passive: false });
        zone.addEventListener('touchmove', onThrottleMove, { signal, passive: false });
        zone.addEventListener('touchend', onThrottleEnd, { signal, passive: false });
        zone.addEventListener('touchcancel', onThrottleEnd, { signal, passive: false });
    }
    if (look && look.addEventListener) {
        look.addEventListener('touchstart', onLookStart, { signal, passive: false });
        look.addEventListener('touchmove', onLookMove, { signal, passive: false });
        look.addEventListener('touchend', onLookEnd, { signal, passive: false });
        look.addEventListener('touchcancel', onLookEnd, { signal, passive: false });
    }
}

/** Where a Y coordinate falls on the throttle track: 1 at the top, 0 at the
 *  centre detent, -1 at the bottom. */
export function throttleFractionAt(clientY, rect) {
    if (!rect || !rect.height) return 0;
    const t = (clientY - rect.top) / rect.height;
    return Math.max(-1, Math.min(1, 1 - t * 2));
}

function trackRect() {
    const el = elements.throttleTrack || elements.throttleZone;
    return el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
}

function onThrottleStart(e) {
    if (paused) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t || touch.throttleId !== null) return;
    e.preventDefault();

    // A double tap only counts when there was a REAL first tap. Testing the
    // elapsed time alone treats the very first touch of a session as a double
    // tap, because lastTapAt starts at zero and so does the clock.
    const now = nowMs();
    const sinceLastTap = now - touch.lastTapAt;
    if (touch.lastTapAt > 0 && sinceLastTap >= 0 && sinceLastTap < cfg.doubleTapMs) {
        // "Stop" in both modes, which is two different instructions. Closing a
        // lever stops a ship whose speed the lever chooses. A coasting ship
        // needs its speed taken off it, so here the tap starts a brake.
        setTargetSpeedFraction(0);
        if (cfg.thrustThrottle) braking = true;
        touch.lastTapAt = 0;
        return;
    }
    touch.lastTapAt = now;
    touch.throttleId = t.identifier;
    setTargetSpeedFraction(throttleFractionAt(t.clientY, trackRect()));
}

function onThrottleMove(e) {
    if (touch.throttleId === null || paused) return;
    const t = findTouch(e.changedTouches, touch.throttleId);
    if (!t) return;
    e.preventDefault();
    // A drag is a deliberate move, never a double tap.
    touch.lastTapAt = 0;
    setTargetSpeedFraction(throttleFractionAt(t.clientY, trackRect()));
}

function onThrottleEnd(e) {
    if (touch.throttleId === null) return;
    if (!findTouch(e.changedTouches, touch.throttleId)) return;
    touch.throttleId = null;
    // Speed mode: the throttle STAYS where it was left, which is the whole
    // point of a lever. Thrust mode: it springs back to the detent and the ship
    // stops accelerating, keeping the speed it has.
    //
    // Note this runs on `touchcancel` too. A stick left at full ahead because a
    // notification interrupted the gesture would be a ship accelerating on its
    // own with nothing on screen explaining why.
    if (cfg.thrustThrottle) setTargetSpeedFraction(0);
}

function onLookStart(e) {
    if (paused) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t || touch.lookId !== null) return;
    e.preventDefault();
    touch.lookId = t.identifier;
    touch.lookOrigin = { x: t.clientX, y: t.clientY };
}

function onLookMove(e) {
    if (touch.lookId === null || paused) return;
    const t = findTouch(e.changedTouches, touch.lookId);
    if (!t || !touch.lookOrigin) return;
    e.preventDefault();
    const radius = cfg.lookJoystickRadius || 55;
    // Recorded, not applied. `applyTouchLook` spends it once a frame for as
    // long as the thumb stays there. See the note on `touch`.
    touch.lookHold.x = clampUnit((t.clientX - touch.lookOrigin.x) / radius);
    touch.lookHold.y = clampUnit((t.clientY - touch.lookOrigin.y) / radius);
    setLookThumb(touch.lookHold.x * radius, touch.lookHold.y * radius);
}

/** Spend the joystick's held deflection into this frame's turn rate.
 *
 *  Additive, so a stick, a key and a pad stick pushed at once compose the way
 *  two keys do rather than the last writer winning. */
function applyTouchLook() {
    if (touch.lookId === null) return;
    lookRate.x += touch.lookHold.x;
    lookRate.y += touch.lookHold.y;
}

function onLookEnd(e) {
    if (touch.lookId === null) return;
    if (!findTouch(e.changedTouches, touch.lookId)) return;
    touch.lookId = null;
    touch.lookOrigin = null;
    touch.lookHold.x = touch.lookHold.y = 0;
    lookRate.x = lookRate.y = 0;
    setLookThumb(0, 0);
}

function findTouch(list, id) {
    if (!list) return null;
    for (let i = 0; i < list.length; i++) {
        if (list[i].identifier === id) return list[i];
    }
    return null;
}

const clampUnit = (v) => Math.max(-1, Math.min(1, v));

// ---- Gamepad ----------------------------------------------------------------

function pollGamepad(dt) {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    if (!pads) return;
    for (const pad of pads) {
        if (!pad || !pad.axes || pad.axes.length < 4) continue;
        const dead = cfg.gamepadDeadzone;
        // Left stick Y nudges the throttle, matching the keyboard. A stick that
        // self-centres must not drag a persistent throttle back to zero when it
        // is released, so it moves the value rather than setting it.
        const ly = Math.abs(pad.axes[1]) > dead ? -pad.axes[1] : 0;
        if (ly) nudgeThrottle(ly * cfg.throttleRate * dt);

        const rx = Math.abs(pad.axes[2]) > dead ? pad.axes[2] : 0;
        const ry = Math.abs(pad.axes[3]) > dead ? pad.axes[3] : 0;
        if (rx) lookRate.x += rx;
        if (ry) lookRate.y += ry;
        break;   // one pilot, one pad
    }
}

// ---- UI sync ----------------------------------------------------------------

function syncThrottleUi() {
    const fill = elements.throttleFill;
    const thumb = elements.throttleThumb;
    const readout = elements.throttleReadout;
    const f = state.throttle;

    // The fill grows from the centre detent, up for ahead and down for astern,
    // so the setting is readable at a glance without looking away from the
    // reticle.
    if (fill && fill.style) {
        const pct = Math.abs(f) * 50;
        fill.style.height = `${pct}%`;
        fill.style.bottom = f >= 0 ? '50%' : `${50 - pct}%`;
    }
    if (thumb && thumb.style) {
        thumb.style.bottom = `${50 + f * 50}%`;
    }
    if (readout) {
        readout.textContent = `${Math.round(f * 100)}%`;
    }
}

function setLookThumb(x, y) {
    const thumb = elements.lookThumb;
    if (thumb && thumb.style) thumb.style.transform = `translate(${x}px, ${y}px)`;
}

function nowMs() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return 0;
}

// Exposed for unit tests only.
export const __test__ = { findTouch, isFlightKey, applyHeldKeys, keys, syncThrottleUi };
