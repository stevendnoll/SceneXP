// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * finale.js - The shot a run ends on, before the card that says what happened.
 *
 * THE CARD IS THE RECEIPT, NOT THE ENDING. Winning used to be a dialog with a
 * clock on it, and so did losing, which meant six minutes of flying resolved
 * into a change of opacity. Every ending here is now a real third-person shot
 * first, and the panel arrives when it finishes.
 *
 * TAKING THE CAMERA IS FREE HERE, AND ONLY HERE. The installation replay is a
 * corner window precisely because an installation falls while the visitor is
 * flying, under fire, and nowhere near it, so a cut would confiscate a moment
 * they did nothing wrong in. When the run is OVER there is no ship left to fly
 * and no decision left to take, so the same objection does not apply and the
 * shot can have the whole frame.
 *
 * ONE MECHANISM, THREE ENDINGS. All three are an orbit around a subject plus a
 * schedule of particle emissions at a list of source points. What separates a
 * celebration from a graveyard is entirely in config: speed, gravity, life,
 * colour and whether anything climbs before it blooms. There is no branch in
 * this file on which ending is playing except the one that chooses the preset,
 * which is the point. A fourth ending would be a config block.
 *
 *   won        fireworks launched from the four Earth installations
 *   lost-line  slow fires at the same four points, and no launches
 *   lost-ship  the visitor's wreck, continuing out of the replay already
 *              orbiting it, pulling away until it is a speck
 *
 * THE CAMERA PATH IS `orbitEye` FROM replay.js rather than a second copy of the
 * same trigonometry. That module already solved "stand off a subject and drift
 * around it" and already has the tests to prove it, so this one composes.
 *
 * NOTHING HERE IS RANDOM. The shell cadence, the sites they launch from, the
 * lateral offsets and the directions the sparks fly are all derived from an
 * index, exactly like the fleet's formation scatter and the aftershock
 * directions. An ending that looked different every time it was watched could
 * not be assented to in a test, and more to the point a visitor who wins twice
 * should see the same celebration twice.
 */

import { EARTHDEFENSE_CONFIG } from './config.min.js';
import { orbitEye, perpendicularTo, smoothstep } from './replay.min.js';

const WORLD_UP = { x: 0, y: 1, z: 0 };

// The golden angle. Successive multiples of it never repeat and never clump,
// which is what turns an index into an even spread over a sphere without a
// random number anywhere near it.
const GOLDEN_ANGLE = 2.399963229728653;

// Where a shell sits relative to the site that launched it. Fixed, cycled by
// index, so four shells from one installation over a five second win go up in
// four different places instead of stacking into one thick column.
const SHELL_OFFSETS = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0.3 },
    { x: -0.7, y: 0, z: 0.9 },
    { x: 0.4, y: 0, z: -1 },
    { x: -1, y: 0, z: -0.5 }
];
const SHELL_SPREAD = 260;

let cfg = null;
let preset = null;
let group = null;
let points = null;
let geometry = null;
let material = null;
let positions = null;
let colours = null;
let positionAttr = null;
let colourAttr = null;

// The pool. Every flare is built once at init and revived in place: a spark is
// twelve numbers, and a win throws about six hundred of them.
let pool = [];
let drawCount = 0;
let cursor = 0;
// The last frame's live count, kept so an idle run can skip the pool entirely.
let liveFlares = 0;

const shot = { running: false, kind: '', elapsed: 0, seconds: 0 };

// What the shot orbits, and the frame it orbits in.
const subject = { x: 0, y: 0, z: 0 };
const axis = { x: 0, y: 1, z: 0 };
const side = { x: 1, y: 0, z: 0 };
let elevation = 0;

// Where flares come from. Held by reference on purpose: an installation's aim
// point is rewritten in place every frame as Earth turns, so a shell launched
// four seconds in leaves from where that site IS rather than from where it was
// when the run ended.
let sources = [];

// Emission events, sorted, drained by the frame clock like the aftershocks.
let schedule = [];

const eye = { x: 0, y: 0, z: 0, look: { x: 0, y: 0, z: 0 } };
const scratch = { x: 0, y: 0, z: 0 };
const spark = { x: 0, y: 0, z: 0 };

let onBurst = null;

// ---- Pure core --------------------------------------------------------------

/** The `i`th of `count` directions spread evenly over a sphere.
 *
 *  A Fibonacci spiral rather than `count` random directions. Random ones clump,
 *  and a burst with a clump in it reads as a burst with a hole opposite the
 *  clump. This is even at any count, and it is the same every time. */
export function sphereDirection(i, count, out = { x: 0, y: 0, z: 0 }) {
    const total = Math.max(1, count);
    const y = 1 - (2 * i + 1) / total;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * GOLDEN_ANGLE;
    out.x = Math.cos(theta) * ring;
    out.y = y;
    out.z = Math.sin(theta) * ring;
    return out;
}

/** The average of a list of `up` vectors, normalised.
 *
 *  This is what aims the two planet shots. The four Earth installations sit
 *  between 40 and 64 degrees north and across a third of the globe in
 *  longitude, so the mean of their surface normals points at the middle of the
 *  region they occupy: put the camera along it and all four are in frame with
 *  the limb underneath. Aiming at Earth's centre instead would be a coin toss
 *  on whether any of them were on the near side at all. */
export function meanNormal(list, out = { x: 0, y: 1, z: 0 }) {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < list.length; i++) {
        const up = list[i] && list[i].up;
        if (!up) continue;
        x += up.x; y += up.y; z += up.z;
    }
    const length = Math.hypot(x, y, z);
    if (length < 1e-6) { out.x = WORLD_UP.x; out.y = WORLD_UP.y; out.z = WORLD_UP.z; return out; }
    out.x = x / length; out.y = y / length; out.z = z / length;
    return out;
}

/** Every emission in the shot, in order, decided before the first frame.
 *
 *  Built up front rather than rolled each frame so the whole ending is one
 *  value a test can read: how many shells, from which site, at what second, and
 *  which of them bloom. `lift` is a climbing streak and `bloom` is the shell
 *  going off, and a preset with no climb (the two losses) emits only blooms.
 *
 *  Shells stop being scheduled a spark's lifetime before the end, so the shot
 *  never cuts to a panel with a firework half way through opening. */
export function buildSchedule(spec, siteCount, seconds) {
    const events = [];
    if (siteCount <= 0) return events;
    const every = Math.max(0.05, spec.shellEvery || 0.5);
    const climb = Math.max(0, spec.riseSeconds || 0);
    const last = seconds - Math.min(seconds, (spec.sparkLife || 1) * 0.65) - climb;
    let index = 0;
    for (let at = 0; at <= last + 1e-9; at += every, index++) {
        const shell = {
            at,
            index,
            source: index % siteCount,
            colour: index % (spec.colours ? spec.colours.length : 1)
        };
        if (climb > 0 && (spec.liftTrail || 0) > 0) {
            events.push({ ...shell, kind: 'lift' });
        }
        events.push({ ...shell, at: at + climb, kind: 'bloom' });
    }
    events.sort((a, b) => a.at - b.at);
    return events;
}

/** How high a shell has climbed after `t` seconds, under the same constant
 *  pull the sparks then fall against. Exported because it is the one number
 *  that decides whether a launch reads as a launch, and it should be checkable
 *  without a renderer. */
export function liftHeight(speed, gravity, t) {
    return (speed || 0) * t - 0.5 * (gravity || 0) * t * t;
}

/** One flare, one frame. Drag first, then the pull, then the move.
 *
 *  Drag is what keeps a firework from being a starburst that expands forever:
 *  the sparks throw hard, stall, and hang, which is the shape of the real
 *  thing. It is exponential rather than linear so a large frame step cannot
 *  push a flare backwards. */
export function stepFlare(flare, dt) {
    flare.age += dt;
    const keep = Math.exp(-(flare.drag || 0) * dt);
    flare.vx = flare.vx * keep + flare.gx * dt;
    flare.vy = flare.vy * keep + flare.gy * dt;
    flare.vz = flare.vz * keep + flare.gz * dt;
    flare.x += flare.vx * dt;
    flare.y += flare.vy * dt;
    flare.z += flare.vz * dt;
    return flare.age < flare.life;
}

/** What is left of a flare's brightness, 1 at birth and 0 at the end.
 *
 *  Squared, so a spark holds most of its light for the first half of its life
 *  and then goes quickly. A linear fade on an additive point looks like a
 *  dimmer being turned rather than something burning out. */
export function flareFade(age, life) {
    if (!(life > 0)) return 0;
    const left = 1 - age / life;
    return left <= 0 ? 0 : left * left;
}

// ---- Setup ------------------------------------------------------------------

/** Build the flare pool and hang it in the scene.
 *
 *  ADDITIVE AND DEPTH-WRITING DISABLED, like every other effect here: flares
 *  are light, and light does not occlude the light behind it. Without the
 *  depth write a bloom on the limb also stops punching a hole in Earth. */
export function initFinale(scene, config = EARTHDEFENSE_CONFIG) {
    disposeFinale(scene);
    cfg = (config && config.finale) || {};

    const total = Math.max(1, cfg.flarePool || 520);
    pool = [];
    for (let i = 0; i < total; i++) {
        pool.push({
            x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, gx: 0, gy: 0, gz: 0,
            r: 0, g: 0, b: 0, age: 0, life: 0, drag: 0, live: false
        });
    }
    drawCount = total;

    if (typeof THREE === 'undefined' || !THREE.Points) return false;

    positions = new Float32Array(total * 3);
    colours = new Float32Array(total * 3);
    geometry = new THREE.BufferGeometry();
    positionAttr = new THREE.BufferAttribute(positions, 3);
    colourAttr = new THREE.BufferAttribute(colours, 3);
    geometry.setAttribute('position', positionAttr);
    geometry.setAttribute('color', colourAttr);

    material = new THREE.PointsMaterial({
        size: 220,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    points = new THREE.Points(geometry, material);
    points.name = 'finale-flares';
    // The positions are rewritten every frame and the bounding sphere is not,
    // so leaving culling on would let the whole show vanish the moment the
    // stale sphere left the frustum.
    points.frustumCulled = false;
    points.visible = false;

    group = new THREE.Group();
    group.name = 'finale';
    group.add(points);
    if (scene && typeof scene.add === 'function') scene.add(group);
    return true;
}

export function disposeFinale(scene) {
    if (group && scene && typeof scene.remove === 'function') scene.remove(group);
    if (geometry && geometry.dispose) geometry.dispose();
    if (material && material.dispose) material.dispose();
    group = null;
    points = null;
    geometry = null;
    material = null;
    positions = null;
    colours = null;
    positionAttr = null;
    colourAttr = null;
    pool = [];
    cursor = 0;
    drawCount = 0;
    liveFlares = 0;
    cfg = null;
    preset = null;
    sources = [];
    schedule = [];
    onBurst = null;
    shot.running = false;
    shot.kind = '';
    shot.elapsed = 0;
}

/** How many of the pool to draw, in the same "built full, partly used" spirit
 *  as the starfield and the burst pools, so the setting takes effect on the
 *  frame it is ticked rather than on the next reload. */
export function setFinaleReduced(on) {
    if (!cfg || !pool.length) return drawCount;
    drawCount = on
        ? Math.min(pool.length, Math.max(1, cfg.reducedPool || 180))
        : pool.length;
    // Anything past the new range is put out rather than left burning. Only
    // reachable by ticking the box during an ending, and a flare outside the
    // draw range is stepped by nothing and drawn by nothing, so it would sit
    // there as a live slot that never comes back.
    for (let i = drawCount; i < pool.length; i++) pool[i].live = false;
    if (cursor >= drawCount) cursor = 0;
    return drawCount;
}

/** Told when a shell goes off, so the scene can make a noise about it. The
 *  sound is reinforcement and nothing else, as everywhere: it duplicates a
 *  bloom that is already on screen. */
export function onFinaleBurst(fn) { onBurst = fn; }

// ---- Starting a shot --------------------------------------------------------

function presetFor(kind) {
    if (!cfg) return null;
    if (kind === 'won') return cfg.won || null;
    if (kind === 'lost-line') return cfg.lostLine || null;
    if (kind === 'lost-ship') return cfg.lostShip || null;
    return null;
}

/** Begin an ending.
 *
 *  `context.sources` is a list of `{ position, up }` held by reference, and
 *  `context.subject` is what the camera looks at. `context.side` is optional
 *  and is what makes the wreck shot continuous: passing the direction the
 *  camera is ALREADY standing in puts angle zero exactly where the replay left
 *  off, so a preset that opens at the distance the replay closed at produces no
 *  cut at all. Without it the frame is derived from the sources, which is what
 *  aims the two planet shots at the hemisphere the installations are on.
 *
 *  Returns the length of the shot in seconds, or 0 if it could not start. */
export function startFinale(kind, context = {}) {
    const spec = presetFor(kind);
    if (!spec) return 0;
    const list = context.sources || [];
    if (!list.length) return 0;

    preset = spec;
    sources = list;

    const at = context.subject || (list[0] && list[0].position);
    if (!at) return 0;
    subject.x = at.x; subject.y = at.y; subject.z = at.z;

    axis.x = WORLD_UP.x; axis.y = WORLD_UP.y; axis.z = WORLD_UP.z;
    if (context.side) {
        normalise(side, context.side.x, context.side.y, context.side.z);
        elevation = spec.rise || 0;
    } else {
        meanNormal(list, scratch);
        // Flattened into the equatorial plane, so the orbit axis stays the
        // world's up and the camera's height comes from the elevation instead.
        // Orbiting around the mean normal itself would roll the horizon as the
        // shot drifted.
        if (Math.hypot(scratch.x, scratch.z) < 1e-6) perpendicularTo(WORLD_UP, side);
        else normalise(side, scratch.x, 0, scratch.z);
        // The sites' own latitude, so the camera looks at them square on, plus
        // whatever the preset wants on top. Clamped short of the pole, where
        // the orbit would collapse to a point and the drift would vanish.
        elevation = clamp(Math.asin(clamp(scratch.y, -1, 1)), -1.2, 1.2) + (spec.rise || 0);
    }

    shot.running = true;
    shot.kind = kind;
    shot.elapsed = 0;
    shot.seconds = Math.max(0.1, spec.seconds || 4);
    schedule = buildSchedule(spec, list.length, shot.seconds);
    // Once per shot rather than once per frame. A spark is sized in world units
    // and the two planet shots stand three times further off than the wreck
    // shot, so the presets do not agree about it.
    if (material) material.size = spec.size || 220;
    if (points) points.visible = true;
    writeEye();
    return shot.seconds;
}

/** Stop early and leave nothing behind. This is what a restart calls, so a new
 *  run can never open on the last one's embers. */
export function endFinale() {
    shot.running = false;
    shot.kind = '';
    shot.elapsed = 0;
    schedule = [];
    sources = [];
    for (let i = 0; i < pool.length; i++) pool[i].live = false;
    liveFlares = 0;
    if (points) points.visible = false;
    writeBuffers();
}

// ---- One frame --------------------------------------------------------------

/** Advance the shot: fire what is due, move what is alive, place the camera.
 *
 *  Runs on the frame clock like every other timed thing here, so a backgrounded
 *  tab cannot leave an ending half played or strand a visitor without a card.
 *
 *  The flares are stepped for a beat AFTER the camera stops, which is why the
 *  visible check is separate from the running one: a shot that ended with
 *  sparks still in the air used to blink them out at the cut, and the panel is
 *  translucent enough that the last of them reads through it. */
export function updateFinale(deltaTime) {
    const dt = deltaTime || 0;
    // NOTHING RUNNING IS THE COMMON CASE, and this is called on every frame of
    // every run. Without this the whole pool would be walked and both attributes
    // re-uploaded sixty times a second for the entire game to draw nothing.
    if (!shot.running && liveFlares === 0) return 0;
    if (shot.running) {
        shot.elapsed += dt;
        drainSchedule();
        if (shot.elapsed >= shot.seconds) shot.running = false;
        else writeEye();
    }
    liveFlares = stepFlares(dt);
    if (points) points.visible = liveFlares > 0;
    return liveFlares;
}

function drainSchedule() {
    while (schedule.length && shot.elapsed >= schedule[0].at) {
        const event = schedule.shift();
        if (event.kind === 'lift') emitLift(event);
        else emitBloom(event);
    }
}

/** The climbing streak. A handful of points spaced along the first fraction of
 *  the climb rather than one, so it reads as a trail with a head on it. */
function emitLift(event) {
    const site = sources[event.source];
    if (!site) return;
    const count = preset.liftTrail || 0;
    const speed = preset.liftSpeed || 0;
    shellOrigin(site, event.index, scratch);
    for (let i = 0; i < count; i++) {
        const back = (i / count) * 0.22;
        const flare = take();
        flare.x = scratch.x - site.up.x * speed * back;
        flare.y = scratch.y - site.up.y * speed * back;
        flare.z = scratch.z - site.up.z * speed * back;
        flare.vx = site.up.x * speed;
        flare.vy = site.up.y * speed;
        flare.vz = site.up.z * speed;
        setGravity(flare, site.up, preset.gravity);
        flare.drag = 0;
        flare.life = Math.max(0.05, (preset.riseSeconds || 0.5) - back);
        flare.age = 0;
        // Always the warm end of the palette, whatever the shell will be: a
        // launch is a burning fuse and the colour is the payload.
        setColour(flare, 0xffd9a0);
        flare.live = true;
    }
}

/** The shell going off, or for the two losses simply a fire starting. */
function emitBloom(event) {
    const site = sources[event.source];
    if (!site) return;
    const count = Math.max(1, preset.sparks || 12);
    const palette = preset.colours || [0xffffff];
    const colour = palette[event.colour % palette.length];
    const height = liftHeight(preset.liftSpeed, preset.gravity, preset.riseSeconds || 0);

    shellOrigin(site, event.index, scratch);
    scratch.x += site.up.x * height;
    scratch.y += site.up.y * height;
    scratch.z += site.up.z * height;

    for (let i = 0; i < count; i++) {
        sphereDirection(i, count, spark);
        const flare = take();
        flare.x = scratch.x;
        flare.y = scratch.y;
        flare.z = scratch.z;
        flare.vx = spark.x * preset.sparkSpeed;
        flare.vy = spark.y * preset.sparkSpeed;
        flare.vz = spark.z * preset.sparkSpeed;
        setGravity(flare, site.up, preset.gravity);
        flare.drag = preset.sparkDrag || 0;
        flare.life = Math.max(0.1, preset.sparkLife || 1);
        flare.age = 0;
        setColour(flare, colour);
        flare.live = true;
    }
    if (onBurst) onBurst(event);
}

/** Where this shell leaves from: the site, nudged sideways by a fixed offset so
 *  a site's fourth shell is not standing in its first one's smoke. */
function shellOrigin(site, index, out) {
    const offset = SHELL_OFFSETS[index % SHELL_OFFSETS.length];
    // The offsets are written in the world's axes and the sites are on a
    // sphere, so they are projected onto the local surface: a site near the
    // pole would otherwise have its shells shoved into the ground.
    const dot = offset.x * site.up.x + offset.y * site.up.y + offset.z * site.up.z;
    out.x = site.position.x + (offset.x - site.up.x * dot) * SHELL_SPREAD;
    out.y = site.position.y + (offset.y - site.up.y * dot) * SHELL_SPREAD;
    out.z = site.position.z + (offset.z - site.up.z * dot) * SHELL_SPREAD;
    return out;
}

function setGravity(flare, up, amount) {
    const g = amount || 0;
    flare.gx = -up.x * g;
    flare.gy = -up.y * g;
    flare.gz = -up.z * g;
}

function setColour(flare, hex) {
    flare.r = ((hex >> 16) & 255) / 255;
    flare.g = ((hex >> 8) & 255) / 255;
    flare.b = (hex & 255) / 255;
}

/** The next slot. A ring rather than a search: the pool is sized for the
 *  busiest shot with headroom, and taking the next one along means the flare
 *  that gets overwritten in an overflow is the oldest, which is the one nobody
 *  is looking at. */
function take() {
    const flare = pool[cursor % Math.max(1, drawCount)];
    cursor = (cursor + 1) % Math.max(1, drawCount);
    return flare;
}

function stepFlares(dt) {
    let alive = 0;
    for (let i = 0; i < drawCount; i++) {
        const flare = pool[i];
        if (!flare.live) continue;
        if (!stepFlare(flare, dt)) { flare.live = false; continue; }
        alive++;
    }
    writeBuffers();
    return alive;
}

/** Positions and colours into the two attributes.
 *
 *  A DEAD FLARE IS WRITTEN BLACK rather than moved away or removed. The
 *  material is additive, so black contributes exactly nothing to the frame:
 *  that buys per-particle fading, which `PointsMaterial` has no other way to
 *  do, and it means the pool never has to be compacted. */
function writeBuffers() {
    if (!positions) return;
    for (let i = 0; i < drawCount; i++) {
        const flare = pool[i];
        const at = i * 3;
        if (!flare.live) {
            colours[at] = 0; colours[at + 1] = 0; colours[at + 2] = 0;
            continue;
        }
        positions[at] = flare.x;
        positions[at + 1] = flare.y;
        positions[at + 2] = flare.z;
        const fade = flareFade(flare.age, flare.life);
        colours[at] = flare.r * fade;
        colours[at + 1] = flare.g * fade;
        colours[at + 2] = flare.b * fade;
    }
    positionAttr.needsUpdate = true;
    colourAttr.needsUpdate = true;
    if (geometry && geometry.setDrawRange) geometry.setDrawRange(0, drawCount);
}

function writeEye() {
    const u = smoothstep(shot.elapsed / shot.seconds);
    const from = preset.startDistance || 15000;
    const to = preset.endDistance || from;
    orbitEye(subject, axis, side, from + (to - from) * u,
        (preset.swing || 0) * u, elevation, eye);
    eye.look.x = subject.x;
    eye.look.y = subject.y;
    eye.look.z = subject.z;
}

// ---- What the caller reads --------------------------------------------------

/** The eye this shot wants, or null when it is not running. Reused between
 *  frames, so read it rather than hold it. */
export function finaleEye() { return shot.running ? eye : null; }

export function isFinaleRunning() { return shot.running; }

export function getFinaleKind() { return shot.kind; }

/** The body class this ending's wash belongs on, or '' when there is nothing to
 *  tint for.
 *
 *  TIED TO THE FLARES RATHER THAN TO THE CAMERA, because the sparks outlive the
 *  camera move by design: the card arrives while the last shell is still going
 *  out, and dropping the colour on the exact frame the camera stopped would
 *  leave those embers sitting on a plain black sky. */
export function finaleWash() {
    if (!preset) return '';
    return shot.running || liveFlares > 0 ? (preset.wash || '') : '';
}

// ---- Small helpers ----------------------------------------------------------

function normalise(out, x, y, z) {
    const length = Math.hypot(x, y, z);
    if (length < 1e-9) { out.x = 1; out.y = 0; out.z = 0; return out; }
    out.x = x / length; out.y = y / length; out.z = z / length;
    return out;
}

function clamp(v, low, high) { return v < low ? low : (v > high ? high : v); }

export const __test__ = {
    shot, subject, side, axis, eye,
    pool: () => pool,
    schedule: () => schedule,
    drawCount: () => drawCount,
    elevation: () => elevation,
    liveCount: () => pool.filter(f => f.live).length,
    SHELL_OFFSETS, SHELL_SPREAD
};
