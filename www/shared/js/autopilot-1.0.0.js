// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * autopilot.js - hands-free guided tour (shared engine part)
 *
 * Walks the player camera along an experience-authored route of waypoints,
 * pausing to look at the sights, like a patient guide showing a friend
 * around. The route is experience content, injected at init:
 *
 *   initAutopilot({
 *       speed: 2.1,                     // m/s stroll (default below)
 *       route: [{
 *           x, z,                       // where to walk to
 *           lookAt: { x, z, y },        // optional: face this on arrival
 *           pause: seconds              // optional: dwell time at the node
 *       }, ...]
 *   })
 *
 * The camera is driven purely through the controls part's public setters,
 * so the standard input pipeline (and its collision checks) is not
 * consulted while engaged: routes must be authored along clear ground,
 * which also guarantees the tour only visits places worth visiting.
 *
 * The conductor (main.js) calls updateAutopilot(dt) each frame during
 * active play only. Pausing the game or opening a modal simply stops the
 * calls, so the tour holds its place and resumes when play does. The
 * conductor is also responsible for disengaging on movement input, so a
 * visitor who grabs the controls always wins instantly.
 *
 * Engaging joins the route at the nearest node rather than node zero, so
 * flipping the tour on deep in the scene never marches the visitor all the
 * way back to the start.
 */

import {
    setPlayerPosition, setPlayerRotation,
    getPlayerPosition, getPlayerRotation, CONTROLS_CONFIG
} from './controls-1.0.0.min.js';

const DEFAULT_SPEED = 2.1;    // m/s: an unhurried guide
const TURN_RATE = 2.2;        // rad/s: camera easing toward its target
const ARRIVE_RADIUS = 0.25;   // m: close enough to count as "at the node"
const FACE_BEFORE_WALK = 0.9; // rad: turn roughly toward the path before striding
const JOIN_RADIUS = 2.0;      // m: engaging this close to a stop starts its
                              // gaze in place, instead of shuffle-turning to
                              // stand on its exact spot and turning back

let route = [];
let speed = DEFAULT_SPEED;
let enabled = false;
let nodeIndex = 0;
let graceNode = -1;           // node joined within JOIN_RADIUS (skip its walk)
let dwellLeft = null;         // null: dwell not started at the current node
const listeners = [];

/** Yaw that faces from (fromX, fromZ) toward (toX, toZ), in the controls
 *  part's convention (yaw 0 looks down -Z; due east (+X) is -PI/2). */
function yawToward(fromX, fromZ, toX, toZ) {
    return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

/** Signed shortest rotation from one yaw to another (wraps at PI). */
function shortestTurn(from, to) {
    let delta = to - from;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
}

/** Install the experience's route. Safe to call once at init. */
export function initAutopilot(config = {}) {
    route = Array.isArray(config.route) ? config.route : [];
    speed = (typeof config.speed === 'number' && config.speed > 0) ? config.speed : DEFAULT_SPEED;
    enabled = false;
    nodeIndex = 0;
    graceNode = -1;
    dwellLeft = null;
}

export function isAutopilotEnabled() {
    return enabled;
}

/** Subscribe to engage/disengage (drives the toggle button's pressed state). */
export function onAutopilotChange(cb) {
    if (typeof cb === 'function') listeners.push(cb);
}

function notify() {
    listeners.forEach((cb) => { try { cb(enabled); } catch (e) { /* keep going */ } });
}

export function setAutopilotEnabled(on) {
    const want = !!on && route.length > 0;
    if (want === enabled) return enabled;
    enabled = want;
    if (enabled) {
        // Join the tour at the nearest stop.
        const pos = getPlayerPosition();
        let best = 0;
        let bestDist = Infinity;
        route.forEach((node, i) => {
            const d = (node.x - pos.x) ** 2 + (node.z - pos.z) ** 2;
            if (d < bestDist) { bestDist = d; best = i; }
        });
        nodeIndex = best;
        graceNode = (bestDist <= JOIN_RADIUS * JOIN_RADIUS) ? best : -1;
        dwellLeft = null;
    }
    notify();
    return enabled;
}

export function toggleAutopilot() {
    return setAutopilotEnabled(!enabled);
}

/**
 * Advance the tour one frame. Call only during active play (not paused, no
 * modal open); withholding the call is exactly what suspends the tour.
 */
export function updateAutopilot(deltaTime) {
    if (!enabled || route.length === 0) return;

    const pos = getPlayerPosition();
    // getPlayerRotation returns a THREE.Euler clone: yaw is .y, pitch is .x
    // (positive pitch looks up).
    const rot = getPlayerRotation();
    const yaw = rot.y;
    const pitch = rot.x;
    const node = route[nodeIndex];

    const dx = node.x - pos.x;
    const dz = node.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    let targetYaw = yaw;
    let targetPitch = 0;

    const arriveRadius = (nodeIndex === graceNode) ? JOIN_RADIUS : ARRIVE_RADIUS;

    if (dist > arriveRadius) {
        // Traveling: face the way we're going, then stride. Holding the walk
        // until mostly turned reads as a person, not a strafing camera.
        targetYaw = yawToward(pos.x, pos.z, node.x, node.z);
        if (Math.abs(shortestTurn(yaw, targetYaw)) < FACE_BEFORE_WALK) {
            const step = Math.min(speed * deltaTime, dist);
            setPlayerPosition(
                pos.x + (dx / dist) * step,
                CONTROLS_CONFIG.eyeHeight,
                pos.z + (dz / dist) * step
            );
        }
    } else {
        // Arrived: face the sight (if any), hold, then move on.
        if (dwellLeft === null) {
            dwellLeft = (typeof node.pause === 'number') ? node.pause : (node.lookAt ? 2 : 0);
        }
        if (node.lookAt) {
            targetYaw = yawToward(pos.x, pos.z, node.lookAt.x, node.lookAt.z);
            const lookY = (typeof node.lookAt.y === 'number') ? node.lookAt.y : 1.2;
            const lookDist = Math.max(0.001, Math.hypot(node.lookAt.x - pos.x, node.lookAt.z - pos.z));
            targetPitch = Math.max(-0.9, Math.min(0.9, Math.atan2(lookY - CONTROLS_CONFIG.eyeHeight, lookDist)));
        }
        dwellLeft -= deltaTime;
        if (dwellLeft <= 0) {
            nodeIndex = (nodeIndex + 1) % route.length;
            graceNode = -1;   // the grace only ever applies to the joined stop
            dwellLeft = null;
        }
    }

    // Ease the camera toward its target orientation.
    const maxTurn = TURN_RATE * deltaTime;
    const yawStep = Math.max(-maxTurn, Math.min(maxTurn, shortestTurn(yaw, targetYaw)));
    const pitchStep = Math.max(-maxTurn, Math.min(maxTurn, targetPitch - pitch));
    setPlayerRotation(yaw + yawStep, pitch + pitchStep);
}

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = { yawToward, shortestTurn, DEFAULT_SPEED };
