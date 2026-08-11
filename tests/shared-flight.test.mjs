// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/flight-1.0.0.js — the throttle-and-look flight
 * model and every input source that drives it.
 *
 * There is no THREE stub here at all, because the module does not use THREE.
 * That is the payoff of the pure-core design: the flight maths is tested with
 * real numbers, and a failure points at arithmetic rather than at a proxy.
 *
 * The properties worth the most care, in order:
 *   1. stepSpeed never overshoots its target, in either direction, at any dt.
 *      An overshoot is a ship that oscillates around its throttle setting.
 *   2. The throttle KEEPS ITS POSITION when a touch ends. That single
 *      behaviour is what makes it a throttle rather than a stick, and it is
 *      the design decision the M2 gate exists to question.
 *   3. Perimeter damping applies only to motion heading further out, so the
 *      trip home is never fought.
 */
import { jest } from '@jest/globals';

let mod;

// ---- A minimal DOM ---------------------------------------------------------

function makeElement() {
    return {
        listeners: new Map(),
        style: {},
        addEventListener(type, fn) {
            if (!this.listeners.has(type)) this.listeners.set(type, []);
            this.listeners.get(type).push(fn);
        },
        fire(type, event = {}) {
            (this.listeners.get(type) || []).forEach(fn => fn({ preventDefault() {}, ...event }));
        },
        getBoundingClientRect() {
            return { top: 100, left: 0, width: 60, height: 200, bottom: 300, right: 60 };
        },
        requestPointerLock() { this.locked = true; }
    };
}

let dom;

function installDom() {
    dom = {
        document: makeElement(),
        window: makeElement(),
        elements: {}
    };
    for (const name of ['canvas', 'throttleZone', 'throttleTrack', 'throttleFill',
        'throttleThumb', 'lookZone', 'lookThumb', 'throttleReadout']) {
        dom.elements[name] = makeElement();
    }
    dom.document.pointerLockElement = null;
    globalThis.document = dom.document;
    globalThis.window = dom.window;
    globalThis.performance = { now: () => dom.now || 0 };
}

const touchEvent = (id, x, y) => ({ changedTouches: [{ identifier: id, clientX: x, clientY: y }] });

beforeEach(async () => {
    installDom();
    jest.resetModules();
    mod = await import('../www/shared/js/flight-1.0.0.js');
});

afterEach(() => {
    if (mod) mod.disposeFlight();
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.navigator;
    delete globalThis.performance;
});

const FLIGHT = {
    maxForward: 4000, maxReverse: 1000,
    accelTime: 6, decelTime: 4,
    turnRate: 1.3, pitchClamp: 1.48,
    throttleRate: 0.8, mouseSensitivity: 0.002,
    lookSensitivity: 1, gamepadDeadzone: 0.15, doubleTapMs: 320
};

const start = (overrides = {}) => mod.initFlight({
    flight: { ...FLIGHT, ...(overrides.flight || {}) },
    spawn: overrides.spawn || { position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 },
    elements: dom.elements
});

// ---- stepSpeed --------------------------------------------------------------

describe('stepSpeed', () => {
    test('accelerates at the acceleration rate', () => {
        expect(mod.stepSpeed(0, 4000, 100, 500, 1)).toBeCloseTo(100);
    });

    test('decelerates at the DIFFERENT deceleration rate', () => {
        // Slowing down means shrinking in magnitude, which uses decelRate.
        expect(mod.stepSpeed(1000, 0, 100, 500, 1)).toBeCloseTo(500);
    });

    test('never overshoots when speeding up', () => {
        // A huge dt must land exactly on the target, not sail past it.
        expect(mod.stepSpeed(0, 4000, 100, 500, 999)).toBe(4000);
    });

    test('never overshoots when slowing down', () => {
        expect(mod.stepSpeed(4000, 0, 100, 500, 999)).toBe(0);
    });

    test('never overshoots in reverse either', () => {
        expect(mod.stepSpeed(0, -1000, 100, 500, 999)).toBe(-1000);
        expect(mod.stepSpeed(-1000, 0, 100, 500, 999)).toBe(0);
    });

    test('slams from full ahead to full astern by decelerating through zero first', () => {
        // While still moving forward faster than the reverse target, magnitude
        // is shrinking, so the DECEL rate governs. That is what a pilot expects
        // and it is why the rate is chosen by magnitude rather than by sign.
        const s = mod.stepSpeed(4000, -1000, 100, 500, 1);
        expect(s).toBeCloseTo(3500);
        // Once below the target's magnitude it is building speed again.
        expect(mod.stepSpeed(-500, -1000, 100, 500, 1)).toBeCloseTo(-600);
    });

    test('is a no-op at zero dt or when already there', () => {
        expect(mod.stepSpeed(123, 456, 100, 500, 0)).toBe(123);
        expect(mod.stepSpeed(200, 200, 100, 500, 1)).toBe(200);
    });
});

// ---- throttleToTargetSpeed --------------------------------------------------

describe('throttleToTargetSpeed', () => {
    test('is asymmetric: full astern is not full ahead', () => {
        expect(mod.throttleToTargetSpeed(1, 4000, 1000)).toBe(4000);
        expect(mod.throttleToTargetSpeed(-1, 4000, 1000)).toBe(-1000);
    });

    test('is zero at the detent and linear between', () => {
        expect(mod.throttleToTargetSpeed(0, 4000, 1000)).toBe(0);
        expect(mod.throttleToTargetSpeed(0.5, 4000, 1000)).toBe(2000);
        expect(mod.throttleToTargetSpeed(-0.5, 4000, 1000)).toBe(-500);
    });

    test('clamps beyond the ends and tolerates rubbish', () => {
        expect(mod.throttleToTargetSpeed(9, 4000, 1000)).toBe(4000);
        expect(mod.throttleToTargetSpeed(-9, 4000, 1000)).toBe(-1000);
        expect(mod.throttleToTargetSpeed(undefined, 4000, 1000)).toBe(0);
    });
});

// ---- stepLook ---------------------------------------------------------------

describe('stepLook', () => {
    test('clamps pitch at both ends so nobody can invert', () => {
        expect(mod.stepLook(0, 0, 0, -99, { pitchClamp: 1.48 }).pitch).toBeCloseTo(1.48);
        expect(mod.stepLook(0, 0, 0, 99, { pitchClamp: 1.48 }).pitch).toBeCloseTo(-1.48);
    });

    test('wraps yaw into [-PI, PI] instead of growing forever', () => {
        const { yaw } = mod.stepLook(3.0, 0, -1.0, 0, {});
        expect(yaw).toBeGreaterThanOrEqual(-Math.PI);
        expect(yaw).toBeLessThanOrEqual(Math.PI);
        expect(yaw).toBeCloseTo(4.0 - 2 * Math.PI);
    });

    test('sensitivity scales BOTH axes', () => {
        const slow = mod.stepLook(0, 0, 0.1, 0.1, { sensitivity: 1 });
        const fast = mod.stepLook(0, 0, 0.1, 0.1, { sensitivity: 2 });
        expect(fast.yaw).toBeCloseTo(slow.yaw * 2);
        expect(fast.pitch).toBeCloseTo(slow.pitch * 2);
    });

    test('invert flips pitch ONLY, never yaw', () => {
        const normal = mod.stepLook(0, 0, 0.1, 0.1, {});
        const inverted = mod.stepLook(0, 0, 0.1, 0.1, { invertPitch: true });
        expect(inverted.pitch).toBeCloseTo(-normal.pitch);
        expect(inverted.yaw).toBeCloseTo(normal.yaw);
    });

    test('defaults are usable with no options at all', () => {
        expect(mod.stepLook(0, 0, 0, 0)).toEqual({ yaw: 0, pitch: 0 });
    });
});

describe('wrapAngle', () => {
    // The property is "lands in range, still points the same way". Asserting a
    // literal is arbitrary at the endpoints, where -PI and +PI are the same
    // direction and either answer is correct.
    test.each([[0], [Math.PI], [-Math.PI], [Math.PI + 0.5], [-Math.PI - 0.5], [7 * Math.PI], [-40]])(
        'wraps %p into range without changing the direction it names', (input) => {
            const out = mod.wrapAngle(input);
            expect(out).toBeGreaterThanOrEqual(-Math.PI - 1e-9);
            expect(out).toBeLessThanOrEqual(Math.PI + 1e-9);
            expect(Math.cos(out)).toBeCloseTo(Math.cos(input), 9);
            expect(Math.sin(out)).toBeCloseTo(Math.sin(input), 9);
        });
});

// ---- forwardFrom ------------------------------------------------------------

describe('forwardFrom', () => {
    test('yaw 0, pitch 0 looks straight down -Z, matching the spawn heading', () => {
        const f = mod.forwardFrom(0, 0);
        expect(f.x).toBeCloseTo(0);
        expect(f.y).toBeCloseTo(0);
        expect(f.z).toBeCloseTo(-1);
    });

    test('positive yaw swings toward -X, positive pitch lifts the nose', () => {
        expect(mod.forwardFrom(Math.PI / 2, 0).x).toBeCloseTo(-1);
        expect(mod.forwardFrom(0, Math.PI / 2).y).toBeCloseTo(1);
    });

    test('is always a unit vector', () => {
        for (const yaw of [-2, 0, 1.1, 3]) {
            for (const pitch of [-1.4, 0, 0.7]) {
                const f = mod.forwardFrom(yaw, pitch);
                expect(Math.hypot(f.x, f.y, f.z)).toBeCloseTo(1, 9);
            }
        }
    });
});

// ---- perimeterDamping -------------------------------------------------------

describe('perimeterDamping', () => {
    test('is full authority inside the perimeter', () => {
        expect(mod.perimeterDamping(0, 1000, 100)).toBe(1);
        expect(mod.perimeterDamping(1000, 1000, 100)).toBe(1);
    });

    test('fades to nothing across the fade band, and never goes negative', () => {
        expect(mod.perimeterDamping(1050, 1000, 100)).toBeCloseTo(0.5);
        expect(mod.perimeterDamping(1100, 1000, 100)).toBeCloseTo(0);
        expect(mod.perimeterDamping(9999, 1000, 100)).toBe(0);
    });

    test('is monotonic across the band', () => {
        let previous = 1.1;
        for (let d = 1000; d <= 1100; d += 10) {
            const v = mod.perimeterDamping(d, 1000, 100);
            expect(v).toBeLessThanOrEqual(previous);
            previous = v;
        }
    });

    test('a zero fade is a hard edge rather than a divide by zero', () => {
        expect(mod.perimeterDamping(1001, 1000, 0)).toBe(0);
    });
});

// ---- Integration: state and motion -----------------------------------------

describe('the flight state', () => {
    test('starts at the spawn transform, stopped', () => {
        start({ spawn: { position: { x: 0, y: 7361, z: 4250 }, yaw: 0, pitch: 0 } });
        const s = mod.getFlightState();
        expect(s.position).toEqual({ x: 0, y: 7361, z: 4250 });
        expect(s.speed).toBe(0);
        expect(s.throttle).toBe(0);
    });

    test('reaches close to full speed in about the configured time', () => {
        start();
        mod.setTargetSpeedFraction(1);
        for (let i = 0; i < 6 / 0.05; i++) mod.updateFlight(0.05);
        expect(mod.getFlightState().speed).toBeCloseTo(4000, -1);
    });

    test('flies along its heading and coasts to a stop at zero throttle', () => {
        start();
        mod.setTargetSpeedFraction(1);
        for (let i = 0; i < 200; i++) mod.updateFlight(0.05);
        const flown = mod.getFlightState();
        expect(flown.position.z).toBeLessThan(-1000);   // travelled down -Z
        expect(flown.position.x).toBeCloseTo(0);

        mod.setTargetSpeedFraction(0);
        for (let i = 0; i < 200; i++) mod.updateFlight(0.05);
        expect(mod.getFlightState().speed).toBe(0);
    });

    test('reverse is a genuine backward translation, not a turnaround', () => {
        start();
        mod.setTargetSpeedFraction(-1);
        const yawBefore = mod.getFlightState().yaw;
        for (let i = 0; i < 100; i++) mod.updateFlight(0.05);
        const s = mod.getFlightState();
        expect(s.position.z).toBeGreaterThan(0);   // moved backwards, up +Z
        expect(s.yaw).toBeCloseTo(yawBefore);      // without turning around
    });

    test('returns a copy, so a caller cannot mutate the ship by accident', () => {
        start();
        const s = mod.getFlightState();
        s.position.x = 999;
        expect(mod.getFlightState().position.x).toBe(0);
    });

    test('a paused ship neither moves nor turns', () => {
        start();
        mod.setTargetSpeedFraction(1);
        mod.updateFlight(0.1);
        const moving = mod.getFlightState();
        mod.setPaused(true);
        for (let i = 0; i < 20; i++) mod.updateFlight(0.1);
        expect(mod.getFlightState().position.z).toBeCloseTo(moving.position.z);
        expect(mod.isPaused()).toBe(true);
        mod.setPaused(false);
        expect(mod.isPaused()).toBe(false);
    });

    test('ignores a zero or missing frame time', () => {
        start();
        mod.setTargetSpeedFraction(1);
        mod.updateFlight(0);
        expect(mod.getFlightState().speed).toBe(0);
    });

    test('clamps an enormous frame time so a stalled tab cannot teleport', () => {
        start();
        mod.setTargetSpeedFraction(1);
        mod.updateFlight(30);
        // Capped at 0.1s, so the ship gains one frame of speed, not thirty
        // seconds of it.
        expect(mod.getFlightState().speed).toBeCloseTo((4000 / 6) * 0.1);
    });
});

// ---- The perimeter ----------------------------------------------------------

describe('the soft perimeter', () => {
    test('damps thrust heading outward but never the trip home', () => {
        start({ spawn: { position: { x: 0, y: 0, z: -1100 }, yaw: 0, pitch: 0 } });
        mod.setPerimeter({ x: 0, y: 0, z: 0 }, 1000, 100);

        // Nose still pointing out along -Z, past the perimeter: damped to zero.
        mod.setTargetSpeedFraction(1);
        mod.updateFlight(0.05);
        expect(mod.getFlightState().targetSpeed).toBe(0);

        // Turned around to face home: full authority restored.
        mod.setTargetSpeedFraction(0);
        mod.updateFlight(0.05);
        start({ spawn: { position: { x: 0, y: 0, z: -1100 }, yaw: Math.PI, pitch: 0 } });
        mod.setPerimeter({ x: 0, y: 0, z: 0 }, 1000, 100);
        mod.setTargetSpeedFraction(1);
        mod.updateFlight(0.05);
        expect(mod.getFlightState().targetSpeed).toBeCloseTo(4000);
    });

    test('reversing outward is damped too, not just forward thrust', () => {
        // Nose toward home, engines astern: still heading out, still damped.
        start({ spawn: { position: { x: 0, y: 0, z: -1100 }, yaw: Math.PI, pitch: 0 } });
        mod.setPerimeter({ x: 0, y: 0, z: 0 }, 1000, 100);
        mod.setTargetSpeedFraction(-1);
        mod.updateFlight(0.05);
        expect(mod.getFlightState().targetSpeed).toBe(-0);
    });

    test('announces each crossing exactly once, in both directions', () => {
        const crossings = [];
        start({ spawn: { position: { x: 0, y: 0, z: -990 }, yaw: 0, pitch: 0 } });
        mod.setPerimeter({ x: 0, y: 0, z: 0 }, 1000, 100000);
        mod.onPerimeterChange((outside) => crossings.push(outside));

        mod.setTargetSpeedFraction(1);
        for (let i = 0; i < 40; i++) mod.updateFlight(0.05);
        expect(crossings).toEqual([true]);          // once, not once per frame

        // Reversing all the way back across the sphere leaves and re-enters,
        // so the count is not fixed. The invariant that matters is that the
        // callback ALTERNATES: one report per real crossing, never a repeat.
        mod.setTargetSpeedFraction(-1);
        for (let i = 0; i < 400; i++) mod.updateFlight(0.05);
        expect(crossings.length).toBeGreaterThanOrEqual(2);
        expect(crossings[1]).toBe(false);
        crossings.forEach((v, i) => {
            if (i > 0) expect(v).not.toBe(crossings[i - 1]);
        });
    });

    test('does nothing at all when no perimeter is set', () => {
        start({ spawn: { position: { x: 0, y: 0, z: -999999 }, yaw: 0, pitch: 0 } });
        mod.setTargetSpeedFraction(1);
        mod.updateFlight(0.05);
        expect(mod.getFlightState().targetSpeed).toBeCloseTo(4000);
    });
});

// ---- The position constraint ------------------------------------------------

describe('setConstrainPosition', () => {
    test('lets the experience veto a move', () => {
        start();
        mod.setConstrainPosition(() => ({ x: 1, y: 2, z: 3 }));
        mod.setTargetSpeedFraction(1);
        mod.updateFlight(0.1);
        expect(mod.getFlightState().position).toEqual({ x: 1, y: 2, z: 3 });
    });

    test('a constraint returning nothing leaves the move alone', () => {
        start();
        mod.setConstrainPosition(() => null);
        mod.setTargetSpeedFraction(1);
        mod.updateFlight(0.1);
        expect(mod.getFlightState().position.z).toBeLessThan(0);
    });
});

// ---- Keyboard ---------------------------------------------------------------

describe('keyboard input', () => {
    const key = (code) => ({ code, preventDefault() {} });

    test('W eases the throttle open as a RATE, not a jump', () => {
        start();
        dom.document.fire('keydown', key('KeyW'));
        mod.updateFlight(0.1);
        // One tenth of a second at 0.8/s is 0.08, not full ahead.
        expect(mod.getFlightState().throttle).toBeCloseTo(0.08);
        for (let i = 0; i < 20; i++) mod.updateFlight(0.1);
        expect(mod.getFlightState().throttle).toBe(1);   // and it clamps
    });

    test('S winds it back and through into reverse', () => {
        start();
        dom.document.fire('keydown', key('KeyS'));
        for (let i = 0; i < 30; i++) mod.updateFlight(0.1);
        expect(mod.getFlightState().throttle).toBe(-1);
    });

    test('X and Space stop the ship immediately', () => {
        start();
        mod.setTargetSpeedFraction(1);
        dom.document.fire('keydown', key('KeyX'));
        expect(mod.getFlightState().throttle).toBe(0);
        mod.setTargetSpeedFraction(1);
        dom.document.fire('keydown', key('Space'));
        expect(mod.getFlightState().throttle).toBe(0);
    });

    test('a full flight is possible with no mouse at all', () => {
        // The accessibility promise, as a test: throttle, yaw, and pitch all
        // reachable from the keyboard alone.
        start();
        dom.document.fire('keydown', key('KeyW'));
        dom.document.fire('keydown', key('KeyD'));
        dom.document.fire('keydown', key('KeyQ'));
        for (let i = 0; i < 10; i++) mod.updateFlight(0.05);
        const s = mod.getFlightState();
        expect(s.throttle).toBeGreaterThan(0);
        expect(s.yaw).not.toBeCloseTo(0);
        expect(s.pitch).not.toBeCloseTo(0);
    });

    test('A and D turn opposite ways, Q and E pitch opposite ways', () => {
        start();
        dom.document.fire('keydown', key('KeyA'));
        mod.updateFlight(0.1);
        const left = mod.getFlightState().yaw;
        dom.document.fire('keyup', key('KeyA'));

        start();
        dom.document.fire('keydown', key('KeyD'));
        mod.updateFlight(0.1);
        expect(Math.sign(mod.getFlightState().yaw)).toBe(-Math.sign(left));
    });

    test('Q climbs and E dives, by the same amount', () => {
        start();
        dom.document.fire('keydown', key('KeyQ'));
        mod.updateFlight(0.1);
        const climbed = mod.getFlightState().pitch;
        expect(climbed).toBeGreaterThan(0);

        start();
        dom.document.fire('keydown', key('KeyE'));
        mod.updateFlight(0.1);
        expect(mod.getFlightState().pitch).toBeCloseTo(-climbed);
    });

    test('releasing a key stops the input', () => {
        start();
        dom.document.fire('keydown', key('KeyW'));
        mod.updateFlight(0.1);
        const held = mod.getFlightState().throttle;
        dom.document.fire('keyup', key('KeyW'));
        mod.updateFlight(0.1);
        expect(mod.getFlightState().throttle).toBeCloseTo(held);
    });

    test('losing window focus releases every held key', () => {
        // Otherwise the keyup lands in another window and the ship turns for ever.
        start();
        dom.document.fire('keydown', key('KeyD'));
        dom.window.fire('blur');
        mod.updateFlight(0.1);
        expect(mod.getFlightState().yaw).toBeCloseTo(0);
    });

    test('keys are ignored while paused', () => {
        start();
        mod.setPaused(true);
        dom.document.fire('keydown', key('KeyW'));
        mod.setPaused(false);
        mod.updateFlight(0.1);
        expect(mod.getFlightState().throttle).toBe(0);
    });

    test('unrelated keys are left for the rest of the page', () => {
        start();
        dom.document.fire('keydown', key('KeyZ'));
        mod.updateFlight(0.1);
        expect(mod.getFlightState().throttle).toBe(0);
        expect(mod.__test__.isFlightKey('KeyZ')).toBe(false);
    });
});

// ---- Mouse ------------------------------------------------------------------

describe('mouse input', () => {
    test('does nothing until the pointer is locked', () => {
        start();
        dom.document.fire('mousemove', { movementX: 100, movementY: 0 });
        mod.updateFlight(0.05);
        expect(mod.getFlightState().yaw).toBeCloseTo(0);
    });

    test('turns the ship once locked', () => {
        start();
        dom.document.pointerLockElement = dom.elements.canvas;
        dom.document.fire('pointerlockchange');
        expect(mod.isPointerLocked()).toBe(true);

        dom.document.fire('mousemove', { movementX: 100, movementY: 50 });
        mod.updateFlight(0.05);
        const s = mod.getFlightState();
        expect(s.yaw).toBeCloseTo(-0.2);
        expect(s.pitch).toBeCloseTo(-0.1);
    });

    test('clicking the canvas asks for the lock', () => {
        start();
        dom.elements.canvas.fire('click');
        expect(dom.elements.canvas.locked).toBe(true);
    });

    test('losing the lock discards any pending delta', () => {
        // Otherwise the view snaps by however far the cursor moved on the way out.
        start();
        dom.document.pointerLockElement = dom.elements.canvas;
        dom.document.fire('pointerlockchange');
        dom.document.fire('mousemove', { movementX: 500, movementY: 0 });

        dom.document.pointerLockElement = null;
        dom.document.fire('pointerlockchange');
        mod.updateFlight(0.05);
        expect(mod.getFlightState().yaw).toBeCloseTo(0);
        expect(mod.isPointerLocked()).toBe(false);
    });
});

// ---- Touch: the throttle ----------------------------------------------------

describe('the touch throttle', () => {
    test('maps the track top to full ahead and the bottom to full astern', () => {
        const rect = { top: 100, height: 200 };
        expect(mod.throttleFractionAt(100, rect)).toBeCloseTo(1);
        expect(mod.throttleFractionAt(200, rect)).toBeCloseTo(0);
        expect(mod.throttleFractionAt(300, rect)).toBeCloseTo(-1);
        expect(mod.throttleFractionAt(-500, rect)).toBe(1);   // clamped
        expect(mod.throttleFractionAt(9999, rect)).toBe(-1);
        expect(mod.throttleFractionAt(150, null)).toBe(0);    // no track yet
    });

    test('a touch sets the throttle absolutely', () => {
        start();
        dom.elements.throttleZone.fire('touchstart', touchEvent(1, 30, 150));
        expect(mod.getFlightState().throttle).toBeCloseTo(0.5);
    });

    test('KEEPS ITS POSITION when the thumb lifts', () => {
        // The decision the M2 gate exists to question, pinned as a test so it
        // cannot change by accident.
        start();
        dom.elements.throttleZone.fire('touchstart', touchEvent(1, 30, 150));
        dom.elements.throttleZone.fire('touchend', touchEvent(1, 30, 150));
        mod.updateFlight(0.1);
        expect(mod.getFlightState().throttle).toBeCloseTo(0.5);
    });

    test('follows a drag', () => {
        start();
        dom.elements.throttleZone.fire('touchstart', touchEvent(1, 30, 200));
        dom.elements.throttleZone.fire('touchmove', touchEvent(1, 30, 120));
        expect(mod.getFlightState().throttle).toBeCloseTo(0.8);
    });

    test('a double tap returns it to zero', () => {
        start();
        dom.now = 1000;
        dom.elements.throttleZone.fire('touchstart', touchEvent(1, 30, 120));
        dom.elements.throttleZone.fire('touchend', touchEvent(1, 30, 120));
        expect(mod.getFlightState().throttle).toBeCloseTo(0.8);

        dom.now = 1100;   // inside the double-tap window
        dom.elements.throttleZone.fire('touchstart', touchEvent(2, 30, 120));
        expect(mod.getFlightState().throttle).toBe(0);
    });

    test('two slow taps are not a double tap', () => {
        start();
        dom.now = 1000;
        dom.elements.throttleZone.fire('touchstart', touchEvent(1, 30, 120));
        dom.elements.throttleZone.fire('touchend', touchEvent(1, 30, 120));
        dom.now = 5000;   // well outside the window
        dom.elements.throttleZone.fire('touchstart', touchEvent(2, 30, 160));
        expect(mod.getFlightState().throttle).toBeCloseTo(0.4);
    });

    test('a drag is never mistaken for a double tap', () => {
        start();
        dom.now = 1000;
        dom.elements.throttleZone.fire('touchstart', touchEvent(1, 30, 120));
        dom.elements.throttleZone.fire('touchmove', touchEvent(1, 30, 140));
        dom.elements.throttleZone.fire('touchend', touchEvent(1, 30, 140));
        dom.now = 1100;
        dom.elements.throttleZone.fire('touchstart', touchEvent(2, 30, 160));
        expect(mod.getFlightState().throttle).toBeCloseTo(0.4);
    });

    test('a second finger does not hijack the throttle', () => {
        start();
        dom.elements.throttleZone.fire('touchstart', touchEvent(1, 30, 150));
        dom.elements.throttleZone.fire('touchstart', touchEvent(2, 30, 110));
        expect(mod.getFlightState().throttle).toBeCloseTo(0.5);
    });

    test('paints the fill, the thumb, and nothing else', () => {
        start();
        mod.setTargetSpeedFraction(0.5);
        expect(dom.elements.throttleFill.style.height).toBe('25%');
        expect(dom.elements.throttleFill.style.bottom).toBe('50%');
        expect(dom.elements.throttleThumb.style.bottom).toBe('75%');

        mod.setTargetSpeedFraction(-1);
        expect(dom.elements.throttleFill.style.height).toBe('50%');
        expect(dom.elements.throttleFill.style.bottom).toBe('0%');
    });

    test('is inert while paused', () => {
        start();
        mod.setPaused(true);
        dom.elements.throttleZone.fire('touchstart', touchEvent(1, 30, 120));
        expect(mod.getFlightState().throttle).toBe(0);
    });
});

// ---- Thrust mode ------------------------------------------------------------
//
// What the touch UI runs. The throttle commands ACCELERATION rather than
// picking a speed, and it springs home when the thumb lifts. Reported from an
// iPhone: a lever is the wrong instrument for glass, because a setting left
// behind on a touch slider can be read but never felt.

describe('the thrust throttle', () => {
    const thrust = (overrides = {}) =>
        start({ ...overrides, flight: { ...(overrides.flight || {}), thrustThrottle: true } });

    // A second at full throttle, in the frames a real one would arrive in.
    const fly = (seconds, step = 0.1) => {
        for (let i = 0; i < Math.round(seconds / step); i++) mod.updateFlight(step);
    };

    describe('stepThrust', () => {
        test('NO COMMAND MEANS NO CHANGE, which is the whole point', () => {
            expect(mod.stepThrust(2500, 0, 667, 1000, 0.1)).toBe(2500);
            expect(mod.stepThrust(2500, undefined, 667, 1000, 0.1)).toBe(2500);
            expect(mod.stepThrust(2500, 1, 667, 1000, 0)).toBe(2500);
        });

        test('adds speed at the acceleration rate while held', () => {
            expect(mod.stepThrust(0, 1, 667, 1000, 0.1)).toBeCloseTo(66.7);
            expect(mod.stepThrust(0, 0.5, 667, 1000, 0.1)).toBeCloseTo(33.35);
        });

        test('a command against the way you are going brakes, and brakes harder', () => {
            // The same asymmetry stepSpeed uses: speed is shed faster than it is
            // built, whichever way the throttle is being read.
            expect(mod.stepThrust(1000, -1, 667, 1000, 0.1)).toBeCloseTo(900);
            expect(mod.stepThrust(-1000, 1, 667, 1000, 0.1)).toBeCloseTo(-900);
            // Still accelerating once through zero, at the gentler rate.
            expect(mod.stepThrust(-50, -1, 667, 1000, 0.1)).toBeCloseTo(-116.7);
        });

        test('a stick beyond its own travel is clamped, not trusted', () => {
            expect(mod.stepThrust(0, 5, 667, 1000, 0.1)).toBeCloseTo(66.7);
        });
    });

    test('A RELEASED STICK KEEPS THE SHIP AT SPEED. This is the request.', () => {
        thrust();
        dom.elements.throttleZone.fire('touchstart', touchEvent(1, 30, 100));  // full up
        fly(3);
        const reached = mod.getFlightState().speed;
        expect(reached).toBeCloseTo(2000, 0);          // 3s at 4000/6

        dom.elements.throttleZone.fire('touchend', touchEvent(1, 30, 100));
        fly(5);
        const s = mod.getFlightState();
        expect(s.throttle).toBe(0);                     // sprung home
        expect(s.speed).toBeCloseTo(reached, 6);        // and still flying
    });

    test('in SPEED mode the same release leaves the lever open', () => {
        // The contrast, so the two models cannot quietly become one. There the
        // lift changes nothing at all and the ship carries on to the speed the
        // lever picked. Closing the lever is what stops it.
        start();
        dom.elements.throttleZone.fire('touchstart', touchEvent(1, 30, 100));
        fly(3);
        dom.elements.throttleZone.fire('touchend', touchEvent(1, 30, 100));
        expect(mod.getFlightState().throttle).toBeCloseTo(1);   // stays put
        fly(5);
        expect(mod.getFlightState().speed).toBe(FLIGHT.maxForward);

        mod.setTargetSpeedFraction(0);
        fly(6);
        expect(mod.getFlightState().speed).toBe(0);
    });

    test('held wide open it reaches full ahead and stops there', () => {
        thrust();
        dom.elements.throttleZone.fire('touchstart', touchEvent(1, 30, 100));
        fly(20);
        expect(mod.getFlightState().speed).toBe(FLIGHT.maxForward);
    });

    test('pulling down sheds speed, then carries on into astern', () => {
        thrust();
        mod.setTargetSpeedFraction(1);
        fly(3);
        expect(mod.getFlightState().speed).toBeCloseTo(2000, 0);

        mod.setTargetSpeedFraction(-1);
        fly(2);                                  // 2s of braking at 1000/s
        expect(mod.getFlightState().speed).toBeCloseTo(0, 0);
        fly(20);
        expect(mod.getFlightState().speed).toBe(-FLIGHT.maxReverse);
    });

    test('the speedometer is told there is no target, because there is none', () => {
        thrust();
        mod.setTargetSpeedFraction(1);
        fly(2);
        const s = mod.getFlightState();
        expect(s.targetSpeed).toBe(s.speed);
    });

    test('a double tap brakes a coasting ship to a standstill', () => {
        // In speed mode the double tap closes the lever, which stops the ship
        // because the lever chose its speed. Coasting needs the speed taken off
        // it instead, so the gesture keeps its promise a different way.
        thrust();
        dom.now = 1000;
        mod.setTargetSpeedFraction(1);
        fly(3);
        expect(mod.getFlightState().speed).toBeGreaterThan(1000);

        dom.elements.throttleZone.fire('touchstart', touchEvent(1, 30, 200));
        dom.elements.throttleZone.fire('touchend', touchEvent(1, 30, 200));
        dom.now = 1100;
        dom.elements.throttleZone.fire('touchstart', touchEvent(2, 30, 200));
        fly(5);
        expect(mod.getFlightState().speed).toBe(0);
    });

    test('the brake lets go the moment the pilot takes the stick back', () => {
        // A control that ignores a hand on it for four seconds feels broken.
        thrust();
        dom.now = 1000;
        mod.setTargetSpeedFraction(1);
        fly(3);
        const coasting = mod.getFlightState().speed;

        dom.elements.throttleZone.fire('touchstart', touchEvent(1, 30, 200));
        dom.elements.throttleZone.fire('touchend', touchEvent(1, 30, 200));
        dom.now = 1100;
        dom.elements.throttleZone.fire('touchstart', touchEvent(2, 30, 200));   // braking
        mod.updateFlight(0.1);
        dom.elements.throttleZone.fire('touchstart', touchEvent(3, 30, 100));   // hand back on
        fly(1);
        expect(mod.getFlightState().speed).toBeGreaterThan(coasting - 100);
    });

    test('an interrupted gesture springs the stick home too', () => {
        // touchcancel is what a notification looks like from in here. A stick
        // left at full ahead would be a ship accelerating on its own with
        // nothing on screen to explain it.
        thrust();
        dom.elements.throttleZone.fire('touchstart', touchEvent(1, 30, 100));
        expect(mod.getFlightState().throttle).toBeCloseTo(1);
        dom.elements.throttleZone.fire('touchcancel', touchEvent(1, 30, 100));
        expect(mod.getFlightState().throttle).toBe(0);
    });

    test('pausing releases the stick, like it releases the keys', () => {
        thrust();
        dom.elements.throttleZone.fire('touchstart', touchEvent(1, 30, 100));
        mod.setPaused(true);
        expect(mod.getFlightState().throttle).toBe(0);
    });

    test('the perimeter still bites, as a ceiling rather than a target', () => {
        // Nothing to damp when the throttle asks for no particular speed, so
        // what gets damped is how fast the ship may be while heading out.
        thrust({ spawn: { position: { x: 0, y: 0, z: -900 }, yaw: 0, pitch: 0 } });
        mod.setPerimeter({ x: 0, y: 0, z: 0 }, 1000, 100);
        mod.setTargetSpeedFraction(1);
        fly(30);
        expect(mod.getFlightState().speed).toBe(0);
        // And the way home is never damped.
        expect(mod.getFlightState().position.z).toBeLessThan(-1000);
    });

    test('a ship that stops accelerating still coasts out of the world', () => {
        // The perimeter has to hold a coasting ship, not just a thrusting one:
        // in this mode letting go is the normal way to travel.
        thrust({ spawn: { position: { x: 0, y: 0, z: -900 }, yaw: 0, pitch: 0 } });
        mod.setPerimeter({ x: 0, y: 0, z: 0 }, 1000, 100);
        mod.setTargetSpeedFraction(1);
        fly(1);
        mod.setTargetSpeedFraction(0);              // let go, still moving out
        fly(30);
        expect(mod.getFlightState().speed).toBe(0);
    });
});

// ---- Touch: the look joystick ----------------------------------------------

describe('the touch look joystick', () => {
    test('turns the ship while dragged and stops when released', () => {
        start();
        dom.elements.lookZone.fire('touchstart', touchEvent(1, 300, 300));
        dom.elements.lookZone.fire('touchmove', touchEvent(1, 355, 300));
        mod.updateFlight(0.1);
        expect(mod.getFlightState().yaw).toBeLessThan(0);

        dom.elements.lookZone.fire('touchend', touchEvent(1, 355, 300));
        const held = mod.getFlightState().yaw;
        mod.updateFlight(0.1);
        expect(mod.getFlightState().yaw).toBeCloseTo(held);
        expect(dom.elements.lookThumb.style.transform).toBe('translate(0px, 0px)');
    });

    test('saturates at the joystick radius', () => {
        start();
        dom.elements.lookZone.fire('touchstart', touchEvent(1, 300, 300));
        dom.elements.lookZone.fire('touchmove', touchEvent(1, 9999, 300));
        mod.updateFlight(0.1);
        expect(mod.getFlightState().yaw).toBeCloseTo(-1.3 * 0.1);
    });

    test('ignores a move for a finger it is not tracking', () => {
        start();
        dom.elements.lookZone.fire('touchstart', touchEvent(1, 300, 300));
        dom.elements.lookZone.fire('touchmove', touchEvent(7, 400, 300));
        mod.updateFlight(0.1);
        expect(mod.getFlightState().yaw).toBeCloseTo(0);
    });

    // THE ONE THAT MATTERS ON A PHONE. `touchmove` fires when a finger moves,
    // so a thumb resting at full deflection emits nothing at all. Reading the
    // stick inside that handler meant the ship turned only on the frames an
    // event landed on: a second of full right stick came to 1.2 degrees of yaw
    // against 74.5 for the same second on a held key, and it read as the game
    // stuttering rather than as the controls being dead, because the only time
    // anything moved was the moment the thumb did.
    //
    // Every test above this one calls `updateFlight` exactly once per
    // `touchmove`, which is the one cadence at which the old code was right.
    test('a thumb held still keeps turning the ship', () => {
        start();
        dom.elements.lookZone.fire('touchstart', touchEvent(1, 300, 300));
        dom.elements.lookZone.fire('touchmove', touchEvent(1, 400, 300));
        for (let i = 0; i < 60; i++) mod.updateFlight(1 / 60);

        // A full second of saturated stick is a full second of turnRate.
        expect(mod.getFlightState().yaw).toBeCloseTo(-1.3, 5);
    });

    test('a held stick matches a held key over the same second', () => {
        start();
        dom.elements.lookZone.fire('touchstart', touchEvent(1, 300, 300));
        dom.elements.lookZone.fire('touchmove', touchEvent(1, 400, 300));
        for (let i = 0; i < 60; i++) mod.updateFlight(1 / 60);
        const stick = mod.getFlightState().yaw;

        mod.disposeFlight();
        start();
        dom.document.fire('keydown', { code: 'ArrowRight' });
        for (let i = 0; i < 60; i++) mod.updateFlight(1 / 60);

        expect(stick).toBeCloseTo(mod.getFlightState().yaw, 5);
    });

    test('pausing releases the stick, like it releases the keys', () => {
        start();
        dom.elements.lookZone.fire('touchstart', touchEvent(1, 300, 300));
        dom.elements.lookZone.fire('touchmove', touchEvent(1, 400, 300));
        mod.setPaused(true);
        mod.setPaused(false);
        const held = mod.getFlightState().yaw;
        for (let i = 0; i < 60; i++) mod.updateFlight(1 / 60);
        expect(mod.getFlightState().yaw).toBeCloseTo(held);

        // And the next move of the same finger arms it again.
        dom.elements.lookZone.fire('touchmove', touchEvent(1, 400, 300));
        mod.updateFlight(0.1);
        expect(mod.getFlightState().yaw).toBeLessThan(held);
    });

    test('a lifted finger stops the turn even without a move', () => {
        start();
        dom.elements.lookZone.fire('touchstart', touchEvent(1, 300, 300));
        dom.elements.lookZone.fire('touchmove', touchEvent(1, 400, 300));
        mod.updateFlight(1 / 60);
        const held = mod.getFlightState().yaw;

        dom.elements.lookZone.fire('touchend', touchEvent(1, 400, 300));
        for (let i = 0; i < 60; i++) mod.updateFlight(1 / 60);
        expect(mod.getFlightState().yaw).toBeCloseTo(held);
    });
});

// ---- Gamepad ----------------------------------------------------------------

describe('gamepad input', () => {
    const pad = (axes) => ({ axes });

    test('the left stick nudges the throttle rather than setting it', () => {
        // A self-centring stick must not drag a persistent throttle back to
        // zero the moment it is released.
        start();
        globalThis.navigator = { getGamepads: () => [pad([0, -1, 0, 0])] };
        // Five frames at the 0.1s cap: updateFlight clamps dt, so a single
        // huge step would not do what the arithmetic suggests.
        for (let i = 0; i < 5; i++) mod.updateFlight(0.1);
        expect(mod.getFlightState().throttle).toBeCloseTo(0.4);

        globalThis.navigator = { getGamepads: () => [pad([0, 0, 0, 0])] };
        for (let i = 0; i < 5; i++) mod.updateFlight(0.1);
        expect(mod.getFlightState().throttle).toBeCloseTo(0.4);   // held, not reset
    });

    test('the right stick looks around', () => {
        start();
        globalThis.navigator = { getGamepads: () => [pad([0, 0, 1, 0])] };
        mod.updateFlight(0.1);
        expect(mod.getFlightState().yaw).toBeCloseTo(-0.13);
    });

    test('respects the deadzone', () => {
        start();
        globalThis.navigator = { getGamepads: () => [pad([0, 0.1, 0.1, 0.1])] };
        mod.updateFlight(0.5);
        const s = mod.getFlightState();
        expect(s.throttle).toBe(0);
        expect(s.yaw).toBeCloseTo(0);
    });

    test('copes with no pad, no API, and empty slots', () => {
        start();
        expect(() => mod.updateFlight(0.1)).not.toThrow();
        globalThis.navigator = { getGamepads: () => null };
        expect(() => mod.updateFlight(0.1)).not.toThrow();
        globalThis.navigator = { getGamepads: () => [null, { axes: [0] }] };
        expect(() => mod.updateFlight(0.1)).not.toThrow();
    });
});

// ---- Settings and teardown --------------------------------------------------

describe('settings', () => {
    test('look sensitivity takes effect live', () => {
        start();
        dom.document.pointerLockElement = dom.elements.canvas;
        dom.document.fire('pointerlockchange');

        mod.setLookSensitivity(2);
        dom.document.fire('mousemove', { movementX: 100, movementY: 0 });
        mod.updateFlight(0.05);
        expect(mod.getFlightState().yaw).toBeCloseTo(-0.4);
    });

    test('invert pitch takes effect live', () => {
        start();
        dom.document.pointerLockElement = dom.elements.canvas;
        dom.document.fire('pointerlockchange');

        mod.setInvertPitch(true);
        dom.document.fire('mousemove', { movementX: 0, movementY: 100 });
        mod.updateFlight(0.05);
        expect(mod.getFlightState().pitch).toBeGreaterThan(0);
    });
});

describe('lifecycle', () => {
    test('init returns the starting state and can run twice cleanly', () => {
        const first = start();
        expect(first.speed).toBe(0);
        mod.setTargetSpeedFraction(1);
        const second = start();
        expect(second.throttle).toBe(0);
    });

    test('dispose is safe before init and twice over', () => {
        expect(() => mod.disposeFlight()).not.toThrow();
        start();
        mod.disposeFlight();
        expect(() => mod.disposeFlight()).not.toThrow();
    });

    test('survives being built with no elements and no DOM hooks', () => {
        const bare = mod.initFlight({ flight: FLIGHT, spawn: {} });
        expect(bare.position).toEqual({ x: 0, y: 0, z: 0 });
        expect(() => mod.updateFlight(0.1)).not.toThrow();
    });

    test('findTouch returns null for an empty list', () => {
        expect(mod.__test__.findTouch(null, 1)).toBeNull();
    });
});
