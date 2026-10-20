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
    if (kind === 'replay' || kind === 'photo') return 'photo';
    if (kind === 'times') return 'finish';
    if (reducedMotion) return 'finish';
    return leadS >= C.track.courseLength - C.camera.finishFrom ? 'finish' : 'chase';
}

/**
 * Where the camera goes for a shot: `path` is track.pathOf's, `leadS` the
 * point the chase follows. Returns { position, target } in the hall.
 * `pullBack` stands it further back than the lanes need (config camera;
 * the share clip keeps 1, its 9:16 frame already backed off for the lanes).
 */
export function framing(shot, path, leadS, aspect, C = DERBY_CONFIG, { pullBack = C.camera.pullBack || 1 } = {}) {
    const S = SHOTS[shot] || SHOTS.finish;
    let at;
    if (shot === 'start') at = path.at(0);
    else if (shot === 'chase') at = path.at(leadS + S.ahead);
    else at = path.at(C.track.courseLength + S.ahead);
    const target = { x: at.x, y: at.y + (S.lift || 0.01), z: 0 };
    const d = Math.max(S.minDistance, fitDistance(S.halfWidth, C.camera.fov, aspect)) * pullBack;
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

/** The winning finale's shot (Steve, 2026-10-20): the grown-up and the kid
 *  dancing side by side, centered, wider than the one dancer's shot, high
 *  enough to see the front of the bleachers behind them, where a few of the
 *  crowd dance too. */
export const DUET_SHOT = Object.freeze({ height: 1.35, halfHeight: 1.55, halfWidth: 1.5, minDistance: 3.2 });
/** On a portrait phone: a little closer across, and aimed higher, so the
 *  height the screen has to spare shows the bleachers, not the floor. */
export const DUET_PORTRAIT = Object.freeze({ height: 1.95, halfWidth: 1.05 });

/** Where the camera goes for the winning finale, the pair's middle `at`. */
export function duetFraming(at, aspect, C = DERBY_CONFIG) {
    const S = DUET_SHOT;
    const portrait = aspect < 1;
    const dir = CROWD_SHOT.dir;
    const target = { x: at.x, y: portrait ? DUET_PORTRAIT.height : S.height, z: at.z };
    const tall = S.halfHeight / Math.tan((C.camera.fov * Math.PI) / 360);
    const d = Math.max(S.minDistance, tall, fitDistance(portrait ? DUET_PORTRAIT.halfWidth : S.halfWidth, C.camera.fov, aspect));
    return { target, position: { x: target.x + dir.x * d, y: target.y + dir.y * d, z: target.z + dir.z * d } };
}

/**
 * Where point `p` lands on a screen of `aspect` seen by `shot` ({ position,
 * target }, the camera upright): { x, y } from -1 to 1 across and up the
 * screen, or null behind the camera. The same projection three's camera
 * makes, done by hand, so who is on screen can be chosen without three.
 */
export function screenPoint(shot, aspect, p, C = DERBY_CONFIG) {
    const P = shot.position;
    const f = unit(shot.target.x - P.x, shot.target.y - P.y, shot.target.z - P.z);
    // Right is forward crossed with up; the camera's up is right crossed with forward.
    const r = unit(-f.z, 0, f.x);
    const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
    const d = { x: p.x - P.x, y: p.y - P.y, z: p.z - P.z };
    const depth = d.x * f.x + d.y * f.y + d.z * f.z;
    if (depth <= 0) return null;
    const tv = Math.tan((C.camera.fov * Math.PI) / 360);
    return {
        x: (d.x * r.x + d.y * r.y + d.z * r.z) / (depth * tv * aspect),
        y: (d.x * u.x + d.y * u.y + d.z * u.z) / (depth * tv)
    };
}

/** Where a box in the hall ({ min, max } corners) is on the screen: the
 *  box { x0, x1, y0, y1 } around its eight corners, or null when any of
 *  them is behind the camera. Pure. */
export function boxOnScreen(shot, aspect, { min, max }, C = DERBY_CONFIG) {
    const pts = [];
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) pts.push(screenPoint(shot, aspect, { x, y, z }, C));
    if (pts.some((p) => !p)) return null;
    return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) };
}

/** Where a standing figure is on the screen, as a box, from its feet at
 *  `at` to `tall` above them, `half` meters either side. Pure. */
export function figureBox(shot, aspect, at, { tall = 1.8, half = 0.28 } = {}, C = DERBY_CONFIG) {
    return boxOnScreen(shot, aspect, { min: { x: at.x - half, y: at.y, z: at.z - half }, max: { x: at.x + half, y: at.y + tall, z: at.z + half } }, C);
}

const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * The bleachers' dancers for the winning finale: up to `count` grown-ups
 * from `members` (the crowd's, { index, at, look }) seen whole in `shot`,
 * from the waist up (`upper` meters above the feet), none of that hidden
 * behind anything in front (`avoid`: screen boxes of the families by the
 * track and the timer's gantry), spread across the picture at least
 * `spread` apart, the front rows first. Returns the chosen members. Pure.
 */
export function pickCrowdDancers(members, shot, aspect, { count = 3, avoid = [], margin = 0.9, spread = 0.28, upper = 0.85 } = {}, C = DERBY_CONFIG) {
    const seen = [];
    for (const m of members) {
        if (m.look.scale < 1) continue;
        // The upper body is what dances: legs behind a chair or a front
        // row are fine, the arms and the face are not.
        const box = boxOnScreen(shot, aspect, { min: { x: m.at.x - 0.28, y: m.at.y + upper, z: m.at.z - 0.28 }, max: { x: m.at.x + 0.28, y: m.at.y + 1.85, z: m.at.z + 0.28 } }, C);
        if (!box || box.x0 < -margin || box.x1 > margin || box.y0 < -margin || box.y1 > margin) continue;
        if (avoid.some((a) => overlaps(box, a))) continue;
        seen.push({ m, x: (box.x0 + box.x1) / 2, row: m.at.y });
    }
    // Spread: the one nearest each of `count` evenly spaced places across
    // the screen, the front rows preferred, never two close together.
    const picked = [];
    for (let k = 0; k < count; k++) {
        const want = count === 1 ? 0 : -margin + (2 * margin * k) / (count - 1);
        let best = null;
        let bestScore = Infinity;
        for (const s of seen) {
            if (picked.includes(s) || picked.some((p) => Math.abs(p.x - s.x) < spread)) continue;
            const score = Math.abs(s.x - want) + s.row * 0.4;
            if (score < bestScore) {
                best = s;
                bestScore = score;
            }
        }
        if (best) picked.push(best);
    }
    return picked.map((s) => s.m);
}
