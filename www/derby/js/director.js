// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * director.js - the cameras (M1): which shot a moment of the race day
 * wants, and where that shot puts the camera on this screen.
 *
 * FOUR SHOTS. `start`: at the gate, the four cars at the pin. `chase`:
 * behind and above the leader as the field comes down the slope. `finish`:
 * past the line, low and to the side, the field coming at it. `photo`:
 * straight down on the line, for a close finish's slow replay. Reduced
 * motion keeps every shot still: no chase, the finish camera for the whole
 * run, no replay (playback.planDay leaves it out).
 *
 * EVERY SHOT HOLDS THE FOUR LANES, however narrow the screen: a shot names
 * what it looks at, the direction it looks from, and how wide a strip it
 * must show, and the camera backs off until a portrait phone holds it
 * (`fitDistance`).
 *
 * THE CROWD SHOT (M6, Steve's QA: "I never see the faces"). Every shot
 * above is built for 18 cm cars, so it looks down at the track from a
 * meter away, and a standing person is legs. `crowdFraming` stands back at
 * a person's eye height on the near side and looks across at a family by
 * the finish, the bleachers behind them, for the heat's times (the winner's
 * family jumping) and behind the results.
 *
 * PURE: plain { x, y, z } in, plain { position, target } out.
 */

import { DERBY_CONFIG } from './config.min.js';

/** The distance at which a camera with vertical field of view `fovDeg` on a
 *  screen of `aspect` (width over height) shows `halfWidth` either side of
 *  its target. */
export function fitDistance(halfWidth, fovDeg, aspect) {
    const halfV = (fovDeg * Math.PI) / 360;
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    return halfWidth / Math.tan(halfH);
}

function unit(x, y, z) {
    const l = Math.hypot(x, y, z) || 1;
    return { x: x / l, y: y / l, z: z / l };
}

/** The shots, each { dir (from the target to the camera), minDistance,
 *  halfWidth, ahead (meters along the track past the point it follows) }. */
export const SHOTS = Object.freeze({
    start: Object.freeze({ dir: unit(0.85, -0.05, 0.55), minDistance: 0.75, halfWidth: 0.28, lift: 0.02 }),
    chase: Object.freeze({ dir: unit(-0.9, 0.6, 0.42), minDistance: 0.95, halfWidth: 0.3, ahead: 0.35 }),
    finish: Object.freeze({ dir: unit(0.6, 0.42, 0.5), minDistance: 0.85, halfWidth: 0.3, ahead: -0.3 }),
    photo: Object.freeze({ dir: unit(0.1, 1, 0.03), minDistance: 0.45, halfWidth: 0.26, ahead: 0 })
});

/**
 * Which shot a moment wants: `segment` is playback's segment kind, `leadS`
 * the leading car's nose along the track.
 */
export function shotFor(kind, leadS, { reducedMotion = false } = {}, C = DERBY_CONFIG) {
    if (kind === 'staging' || kind === 'gate') return 'start';
    if (kind === 'replay') return 'photo';
    if (kind === 'times') return 'finish';
    if (reducedMotion) return 'finish';
    return leadS >= C.track.courseLength - C.camera.finishFrom ? 'finish' : 'chase';
}

/**
 * Where the camera goes for a shot: `path` is track.pathOf's, `leadS` the
 * point the chase follows. Returns { position, target } in the hall.
 */
export function framing(shot, path, leadS, aspect, C = DERBY_CONFIG) {
    const S = SHOTS[shot] || SHOTS.finish;
    let at;
    if (shot === 'start') at = path.at(0);
    else if (shot === 'chase') at = path.at(leadS + S.ahead);
    else at = path.at(C.track.courseLength + S.ahead);
    const target = { x: at.x, y: at.y + (S.lift || 0.01), z: 0 };
    const d = Math.max(S.minDistance, fitDistance(S.halfWidth, C.camera.fov, aspect));
    return {
        target,
        position: { x: target.x + S.dir.x * d, y: target.y + S.dir.y * d, z: target.z + S.dir.z * d }
    };
}

/** The crowd shot's settings: looking from the near side, a little up the
 *  track (away from the timer's gantry), at a face's height. */
export const CROWD_SHOT = Object.freeze({ dir: unit(-0.22, 0.1, 1), height: 1.0, halfWidth: 1.3, minDistance: 3.2 });

/**
 * Where the camera goes to see the people: `focus` is the { x, z } of the
 * family to center (the heat's winner's, or the visitor's), held with its
 * neighbors either side, heads and all, however narrow the screen.
 */
export function crowdFraming(focus, aspect, C = DERBY_CONFIG) {
    const S = CROWD_SHOT;
    const target = { x: focus.x, y: S.height, z: focus.z - 0.3 };
    const d = Math.max(S.minDistance, fitDistance(S.halfWidth, C.camera.fov, aspect));
    return { target, position: { x: target.x + S.dir.x * d, y: target.y + S.dir.y * d, z: target.z + S.dir.z * d } };
}

/** The dance shot's settings: from the crowd shot's side, the dancer in the
 *  middle, the floor to a hand held high (2.25 m) and an arm out level
 *  either side, however narrow the screen. */
export const DANCE_SHOT = Object.freeze({ height: 1.12, halfHeight: 1.3, halfWidth: 1.1, minDistance: 2.6 });

/** Where the camera goes to watch the dancer standing at `at` ({ x, z }). */
export function danceFraming(at, aspect, C = DERBY_CONFIG) {
    const S = DANCE_SHOT;
    const dir = CROWD_SHOT.dir;
    const target = { x: at.x, y: S.height, z: at.z };
    const tall = S.halfHeight / Math.tan((C.camera.fov * Math.PI) / 360);
    const d = Math.max(S.minDistance, tall, fitDistance(S.halfWidth, C.camera.fov, aspect));
    return { target, position: { x: target.x + dir.x * d, y: target.y + dir.y * d, z: target.z + dir.z * d } };
}
