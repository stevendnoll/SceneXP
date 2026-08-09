// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * replay.js - Watching something be destroyed from outside it.
 *
 * Two shots, and they are deliberately different KINDS of thing rather than one
 * mechanism used twice.
 *
 * THE SHIP REPLAY TAKES THE CAMERA. When the visitor's own ship is destroyed
 * the flight model is already frozen for the length of the wreck, so there is
 * no agency to take away: the camera was going to sit still and watch a burst
 * happen at the eye, which is to say watch almost nothing, since the world
 * camera's near plane is 100 units and the burst starts inside it. Stepping
 * outside and orbiting the wreck spends a beat the game was already paying for.
 *
 * THE INSTALLATION REPLAY DOES NOT. An installation falls while the visitor is
 * flying, being shot at, and nowhere near it. Cutting the camera 63,000 units
 * to the Moon and back would take the controls away at a moment they did
 * nothing wrong, and seven installations can fall in one run. So it is a window
 * in the corner instead: the same scene drawn a second time from a camera
 * standing over the wreck, while the visitor keeps flying. Nothing about the
 * simulation changes, and looking away costs nothing.
 *
 * NO THREE IN THE MATHS. The camera path is `orbitEye`, which takes numbers and
 * returns numbers, so where a shot points can be tested with real values. The
 * only THREE in this file is the one PerspectiveCamera the inset needs, and it
 * is built once.
 *
 * THE PATHS ARE ORBITS, and both pull back as they run. A shot that holds still
 * reads as a frozen frame with an animation playing in it. A shot that moves
 * says the camera is somewhere, which is the whole difference between a replay
 * and an effect.
 */

import { EARTHDEFENSE_CONFIG } from './config.min.js';

const WORLD_UP = { x: 0, y: 1, z: 0 };

let cfg = null;
let insetCam = null;

// One shot of each kind, at most. A second destruction while one is running
// takes it over rather than queueing: the news that matters is the newest, and
// a queue would still be playing the first loss a quarter of a minute later.
const shipShot = { running: false, elapsed: 0, seconds: 0 };
const insetShot = { running: false, elapsed: 0, seconds: 0, label: '' };

// Where each shot is looking, and the basis it orbits in. Held rather than
// recomputed, because the subject does not move: an installation's wreck is
// anchored to a body, and the visitor's is a cloud that is going nowhere.
const shipAt = { x: 0, y: 0, z: 0 };
const shipSide = { x: 1, y: 0, z: 0 };
const insetAt = { x: 0, y: 0, z: 0 };
const insetUp = { x: 0, y: 1, z: 0 };
const insetSide = { x: 1, y: 0, z: 0 };

// The eye the ship shot wants this frame, handed to main.js rather than applied
// here: the world camera belongs to space.js and there should be exactly one
// place that writes it.
const eye = { x: 0, y: 0, z: 0, look: { x: 0, y: 0, z: 0 } };

const scratch = { x: 0, y: 0, z: 0 };

// ---- Pure core --------------------------------------------------------------

/** Ease a 0..1 progress so a pull-back leaves and arrives gently.
 *
 *  Smoothstep rather than a linear ramp. A camera that starts at full speed and
 *  stops dead reads as a jump cut with extra steps, and this costs two
 *  multiplies. */
export function smoothstep(u) {
    const t = u < 0 ? 0 : (u > 1 ? 1 : u);
    return t * t * (3 - 2 * t);
}

/** Where a camera orbiting `subject` stands.
 *
 *  `up` is the axis it goes around and `side` is where the angle is measured
 *  from, so a shot can be aimed by choosing those two: the world's up and the
 *  ship's own back for a wreck in open space, the surface normal and any
 *  tangent for something standing on a planet.
 *
 *  `elevation` is measured off the plane rather than off the axis, so zero is
 *  level with the subject and positive is above it. Above is nearly always what
 *  a replay wants: it puts the ground under the wreck. */
export function orbitEye(subject, up, side, distance, angle, elevation, out = {}) {
    // The third axis, so the circle is a circle rather than a line.
    const bx = up.y * side.z - up.z * side.y;
    const by = up.z * side.x - up.x * side.z;
    const bz = up.x * side.y - up.y * side.x;

    const ring = Math.cos(elevation);
    const rise = Math.sin(elevation);
    const c = Math.cos(angle) * ring;
    const s = Math.sin(angle) * ring;

    out.x = subject.x + (side.x * c + bx * s + up.x * rise) * distance;
    out.y = subject.y + (side.y * c + by * s + up.y * rise) * distance;
    out.z = subject.z + (side.z * c + bz * s + up.z * rise) * distance;
    return out;
}

/** Any unit vector at right angles to `v`, picking the axis it leans on least
 *  so the cross product never lands on zero. */
export function perpendicularTo(v, out = { x: 0, y: 0, z: 0 }) {
    const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
    const axisX = ax <= ay && ax <= az ? 1 : 0;
    const axisY = axisX === 0 && ay <= az ? 1 : 0;
    const axisZ = axisX === 0 && axisY === 0 ? 1 : 0;
    return normalise(out,
        v.y * axisZ - v.z * axisY,
        v.z * axisX - v.x * axisZ,
        v.x * axisY - v.y * axisX);
}

function normalise(out, x, y, z) {
    const length = Math.hypot(x, y, z);
    if (length < 1e-9) { out.x = 1; out.y = 0; out.z = 0; return out; }
    out.x = x / length; out.y = y / length; out.z = z / length;
    return out;
}

function blend(from, to, u) { return from + (to - from) * u; }

// ---- Setup ------------------------------------------------------------------

export function initReplay(config = EARTHDEFENSE_CONFIG) {
    disposeReplay();
    cfg = (config && config.replay) || {};

    // Built once and reused. The aspect is a placeholder: `renderInset` takes it
    // from the window it is drawn into, so a resize cannot leave it stretched.
    if (typeof THREE !== 'undefined' && THREE.PerspectiveCamera) {
        const near = cfg.insetNear || 10;
        const far = cfg.insetFar || 500000;
        insetCam = new THREE.PerspectiveCamera(cfg.insetFov || 55, 1.6, near, far);
    }
    return true;
}

export function disposeReplay() {
    cfg = null;
    insetCam = null;
    shipShot.running = false;
    shipShot.elapsed = 0;
    insetShot.running = false;
    insetShot.elapsed = 0;
    insetShot.label = '';
}

// ---- Starting a shot --------------------------------------------------------

/** Watch the visitor's own ship go. `forward` is where it was pointing, which
 *  is what puts the camera BEHIND the wreck for the opening frame: a shot that
 *  starts looking the way the ship was flying reads as continuous with the view
 *  the visitor just lost. */
export function startShipReplay(position, forward, seconds) {
    if (!cfg) return 0;
    shipAt.x = position.x; shipAt.y = position.y; shipAt.z = position.z;

    // Behind the ship, flattened into the horizontal plane so the orbit is
    // level. A ship destroyed while climbing steeply would otherwise be watched
    // from a camera lying on its side.
    const flatX = -(forward ? forward.x : 0);
    const flatZ = -(forward ? forward.z : -1);
    if (Math.hypot(flatX, flatZ) < 1e-6) perpendicularTo(WORLD_UP, shipSide);
    else normalise(shipSide, flatX, 0, flatZ);

    shipShot.running = true;
    shipShot.elapsed = 0;
    shipShot.seconds = Math.max(0.1, seconds || cfg.shipSeconds || 2.2);
    writeShipEye();
    return shipShot.seconds;
}

/** Watch an installation go, in the corner, without touching the camera the
 *  visitor is flying with. `up` is the surface normal, so the shot orbits in the
 *  local sky rather than through the body underneath. */
export function startInsetReplay(position, up, label) {
    if (!cfg) return 0;
    insetAt.x = position.x; insetAt.y = position.y; insetAt.z = position.z;
    if (up) normalise(insetUp, up.x, up.y, up.z);
    else normalise(insetUp, position.x, position.y, position.z);
    perpendicularTo(insetUp, insetSide);

    insetShot.running = true;
    insetShot.elapsed = 0;
    insetShot.seconds = Math.max(0.1, cfg.insetSeconds || 2.6);
    insetShot.label = label || '';
    writeInsetCamera();
    return insetShot.seconds;
}

// ---- One frame --------------------------------------------------------------

/** Advance both shots. Called every frame, INCLUDING the frames where the game
 *  is not being played: the last life lost ends the run on the same frame the
 *  ship is destroyed, and a replay that only ran while playing would be the one
 *  death nobody ever gets to see. */
export function updateReplay(deltaTime) {
    const dt = deltaTime || 0;
    if (shipShot.running) {
        shipShot.elapsed += dt;
        if (shipShot.elapsed >= shipShot.seconds) shipShot.running = false;
        else writeShipEye();
    }
    if (insetShot.running) {
        insetShot.elapsed += dt;
        if (insetShot.elapsed >= insetShot.seconds) insetShot.running = false;
        else writeInsetCamera();
    }
}

function writeShipEye() {
    const u = smoothstep(shipShot.elapsed / shipShot.seconds);
    orbitEye(shipAt, WORLD_UP, shipSide,
        blend(cfg.shipStartDistance || 260, cfg.shipEndDistance || 620, u),
        (cfg.shipSwing || 0.85) * u,
        cfg.shipRise || 0.3,
        eye);
    eye.look.x = shipAt.x; eye.look.y = shipAt.y; eye.look.z = shipAt.z;
}

function writeInsetCamera() {
    if (!insetCam) return;
    const u = smoothstep(insetShot.elapsed / insetShot.seconds);
    orbitEye(insetAt, insetUp, insetSide,
        blend(cfg.insetStartDistance || 520, cfg.insetEndDistance || 900, u),
        (cfg.insetSwing || 0.55) * u,
        cfg.insetRise || 0.3,
        scratch);
    insetCam.position.set(scratch.x, scratch.y, scratch.z);
    insetCam.lookAt(insetAt.x, insetAt.y, insetAt.z);
}

// ---- What the caller reads --------------------------------------------------

/** The eye the ship shot wants, or null when it is not running. Reused between
 *  frames, so read it rather than hold it. */
export function shipReplayEye() {
    return shipShot.running ? eye : null;
}

export function getInsetCamera() { return insetShot.running ? insetCam : null; }

export function getInsetLabel() { return insetShot.running ? insetShot.label : ''; }

export function isShipReplayRunning() { return shipShot.running; }

export function isInsetRunning() { return insetShot.running; }

export function isReplayRunning() { return shipShot.running || insetShot.running; }

export const __test__ = { shipShot, insetShot, shipAt, insetAt, insetUp, eye };
