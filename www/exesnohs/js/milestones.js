// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * milestones.js - The shows a good game earns, and when it has earned them.
 *
 * Every hundred points plays a short show between plays, the first time the
 * running total reaches it, and each one wakes a little more of the stadium up
 * for the rest of the game. This file owns the RULES (which show is due) and
 * the TIMELINES (what every part of a show is doing at time `t`). spectacle.js
 * draws it and main.js decides when.
 *
 * PURE, AND FOR THE SAME REASON THE CAMERA IS. "Where is the camera 2.4 seconds
 * into the lights show on a phone held upright" is a question with a numeric
 * answer, and it is exactly the kind that goes wrong in portrait without anybody
 * being able to say why. So every shot is SOLVED against the things it has to
 * contain (`fitShot`) rather than placed by hand for one screen shape, and a
 * test can ask whether the four floodlight towers are all in frame.
 *
 * A FRAME IS A DESCRIPTION, NOT AN INSTRUCTION. `showFrame` returns what should
 * be true now, never what should change, so a skipped show, a dropped frame and
 * a half-second stall all land in the right place.
 */
import { EXESNOHS_CONFIG as CFG, FIELD } from './config.min.js';
import { playDriver } from './camera.min.js';
import { pylonSpots, boardSpot } from './field.min.js';

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (t) => { const c = clamp01(t); return c * c * (3 - 2 * c); };
const lerp = (a, b, t) => a + (b - a) * t;
const span = (t, [from, to]) => clamp01((t - from) / Math.max(1e-6, to - from));

const M = CFG.milestones;
/** Seconds for a lamp to strike up to its flare. */
const STRIKE = 0.05;

// ---- The rules ----------------------------------------------------------------

/** The best running total the game has reached so far, which is not the score:
 *  a sack can take a game back below a line it has already crossed. */
export function highWater(results = []) {
    let total = 0;
    let best = 0;
    for (const r of results) {
        total += Number(r && r.points) || 0;
        if (total > best) best = total;
    }
    return best;
}

/** The highest threshold this game has reached, built or not, or 0. */
export function reachedLevel(results = []) {
    const best = highWater(results);
    return M.thresholds.filter((t) => t <= best).reduce((a, t) => Math.max(a, t), 0);
}

/**
 * THE SHOW THAT IS DUE NOW, or 0.
 *
 * `shown` is the highest level already played (or already passed on a resumed
 * game). Only a BUILT show can be due, so a game that reaches 300 before stage
 * two exists plays nothing rather than a show with no timeline.
 *
 * A play is worth at most fifty, so no play can cross two lines at once. If
 * that ever changed, the highest wins: two shows back to back between the same
 * two plays is one too many.
 */
export function milestoneDue(results = [], shown = 0) {
    const best = highWater(results);
    const due = M.built.filter((t) => t > shown && t <= best);
    return due.length ? Math.max(...due) : 0;
}

/** How many of the board's stars are lit for a stadium woken up to `level`. */
export function litStars(level = 0) {
    return M.thresholds.filter((t) => t <= level).length;
}

/** The kind of show a level plays. */
export function showKind(level) {
    return { 100: 'lights', 200: 'fireworks' }[level] || '';
}

export function showLength(level) {
    const kind = showKind(level);
    return kind ? M[kind].length : 0;
}

// ---- Shots ----------------------------------------------------------------------

/**
 * WHERE A POINT LANDS IN A SHOT, in normalised device coordinates (-1 to 1 on
 * both axes, `depth` in metres in front of the camera). Three's own
 * construction: `lookAt` with +y up, and `fov` is the VERTICAL angle.
 */
export function projectPoint(shot, aspect, p) {
    const f = shot.position;
    const t = shot.target;
    let fx = t.x - f.x;
    let fy = t.y - f.y;
    let fz = t.z - f.z;
    const fn = Math.hypot(fx, fy, fz) || 1;
    fx /= fn; fy /= fn; fz /= fn;
    // right = forward x up, up' = right x forward
    let rx = -fz;
    let rz = fx;
    const rn = Math.hypot(rx, rz) || 1;
    rx /= rn; rz /= rn;
    const ux = -rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy;
    const dx = p.x - f.x;
    const dy = p.y - f.y;
    const dz = p.z - f.z;
    const depth = dx * fx + dy * fy + dz * fz;
    const tanH = Math.tan((shot.fov * Math.PI) / 360);
    return {
        x: (dx * rx + dz * rz) / (depth * tanH * aspect),
        y: (dx * ux + dy * uy + dz * uz) / (depth * tanH),
        depth,
    };
}

/**
 * THE CLOSEST SHOT THAT STILL CONTAINS EVERYTHING IT MUST.
 *
 * The camera stands on a ray out of `target` along `from` and backs away until
 * every point in `points` sits inside the frame with `margin` to spare. On a
 * phone held upright that is a long way back, because `fov` is vertical and a
 * tall frame is narrow; that is the whole reason this is solved rather than
 * written down.
 *
 * `floor` keeps the camera above the grass, which a shot looking UP at the sky
 * would otherwise walk it under as it backs away.
 */
export function fitShot({ target, from, fov, points, aspect, margin = 0.08, floor = 2 }) {
    const n = Math.hypot(from.x, from.y, from.z) || 1;
    const dir = { x: from.x / n, y: from.y / n, z: from.z / n };
    const edge = 1 - margin * 2;
    const shotAt = (d) => {
        const position = {
            x: target.x + dir.x * d,
            y: Math.max(floor, target.y + dir.y * d),
            z: target.z + dir.z * d,
        };
        return { position, target: { ...target }, fov };
    };
    const inside = (shot) => points.every((p) => {
        const s = projectPoint(shot, aspect, p);
        return s.depth > 1 && Math.abs(s.x) <= edge && Math.abs(s.y) <= edge;
    });
    let lo = 2;
    let hi = 800;
    if (!inside(shotAt(hi))) return shotAt(hi);
    for (let i = 0; i < 40; i += 1) {
        const mid = (lo + hi) / 2;
        if (inside(shotAt(mid))) hi = mid; else lo = mid;
    }
    return shotAt(hi);
}

const shotCache = new Map();
function cached(name, aspect, build) {
    const key = `${name}:${aspect.toFixed(3)}`;
    if (!shotCache.has(key)) shotCache.set(key, build());
    return shotCache.get(key);
}

/** The four lamp banks, and a little of each, because a bank half out of frame
 *  is a bank that has not been seen to come on. */
function bankCorners() {
    const out = [];
    for (const p of pylonSpots()) {
        for (const dz of [-3, 3]) for (const dy of [-1.5, 1.5]) out.push({ x: p.x, y: p.y + dy, z: p.z + dz });
    }
    return out;
}

function boardCorners(pad = 0) {
    const b = boardSpot();
    const out = [];
    for (const z of [-b.width / 2 - pad, b.width / 2 + pad]) {
        for (const y of [b.bottom - pad * 0.4, b.top + pad]) out.push({ x: b.x, y, z });
    }
    return out;
}

/** Wide enough for all four towers and the board, from above the near end. */
export function stadiumShot(aspect) {
    return cached('stadium', aspect, () => {
        const len = FIELD.lineInterval * FIELD.segments;
        return fitShot({
            target: { x: len * 0.5, y: 9, z: 0 },
            from: { x: -1, y: 0.62, z: 0 },
            fov: 42,
            points: [...bankCorners(), ...boardCorners()],
            aspect,
            margin: 0.05,
        });
    });
}

/** Square on to the scoreboard, near enough to fill the frame with it. */
export function boardShot(aspect) {
    return cached('board', aspect, () => {
        const b = boardSpot();
        return fitShot({
            target: { x: b.x, y: (b.bottom + b.top) / 2, z: 0 },
            from: { x: -1, y: 0.24, z: 0 },
            fov: 30,
            points: boardCorners(0.8),
            aspect,
            margin: 0.07,
        });
    });
}

/** Where the finale bursts, which the sky shot is built around. */
export function finaleCentre() {
    const b = boardSpot();
    const F = M.fireworks;
    return { x: b.x + F.finale.beyond, y: F.finale.y, z: 0 };
}

/** Up over the scoreboard, into the night, with the numerals and the top of the
 *  board both in frame so the sky is anchored to the stadium. */
export function skyShot(aspect) {
    return cached('sky', aspect, () => {
        const c = finaleCentre();
        const F = M.fireworks;
        const wide = (F.digitHeight * (3 * 0.62 + 2 * 0.3)) / 2 + 2.5;
        const tall = F.digitHeight / 2 + 2.5;
        const b = boardSpot();
        return fitShot({
            target: { ...c },
            from: { x: -1, y: -0.12, z: 0 },
            fov: 50,
            points: [
                { x: c.x, y: c.y + tall, z: -wide }, { x: c.x, y: c.y + tall, z: wide },
                { x: c.x, y: c.y - tall, z: -wide }, { x: c.x, y: c.y - tall, z: wide },
                { x: b.x, y: b.top, z: 0 },
            ],
            aspect,
            margin: 0.06,
            floor: 4,
        });
    });
}

/** Part of the way from one shot to another, eased at both ends. */
export function blendShot(a, b, t) {
    const f = smooth(t);
    const mix = (p, q) => ({ x: lerp(p.x, q.x, f), y: lerp(p.y, q.y, f), z: lerp(p.z, q.z, f) });
    return { position: mix(a.position, b.position), target: mix(a.target, b.target), fov: lerp(a.fov, b.fov, f) };
}

/**
 * A MOVE, OR A CUT FOR SOMEBODY WHO ASKED NOT TO BE MOVED ABOUT.
 *
 * A camera flying across a stadium is precisely the motion that preference is
 * about. A cut is not motion, so the calm version of every move is the same two
 * shots with nothing between them, switched at the move's midpoint.
 */
function move(a, b, t, window, calm) {
    const f = span(t, window);
    if (calm) return f < 0.5 ? a : b;
    return blendShot(a, b, f);
}

// ---- The shows ------------------------------------------------------------------

/**
 * WHAT A SHOW LOOKS LIKE AT TIME `t`.
 *
 *   shot      { position, target, fov } for the camera
 *   light     0 to about 1: the scene's lights, as a fraction of normal
 *   banks     one number per floodlight bank as a multiple of its normal glow,
 *             or null to leave them as the stadium already has them
 *   cones     one opacity per bank's light cone, or null
 *   board     { value, glow } to take the scoreboard over, or null
 *   sparks    true when the fireworks are running
 *   title     0 to 1, how visible the title card is
 *   reveal    true from the moment the number lands: the whistle, the star
 *   done      true once `t` has run past the end
 */
export function showFrame(level, t, { aspect = 1.78, calm = false } = {}) {
    const kind = showKind(level);
    const length = showLength(level);
    const base = {
        shot: playDriver(aspect), light: 1, banks: null, cones: null,
        board: null, sparks: false, title: 0, reveal: false, done: t >= length, fog: 1,
    };
    let frame = { ...base, done: true };
    if (kind === 'lights') frame = { ...base, ...lightsAt(level, t, aspect, calm) };
    if (kind === 'fireworks') frame = { ...base, ...fireworksAt(t, aspect, calm) };
    return { ...frame, fog: fogFor(frame.shot, aspect) };
}

/**
 * HOW FAR THE FOG HAS TO STAND BACK FOR THIS SHOT, as a multiple of normal.
 *
 * The fog is tuned for the play camera, 83m from what it looks at. A phone held
 * upright has to back the stadium shot off to about 160m to fit four towers
 * across a narrow frame, and at the normal fog that is a field three quarters
 * gone. Scaled by the shot's own distance, every shot sees its subject exactly
 * as clearly as the play camera sees the field, and a close shot changes
 * nothing.
 */
export function fogFor(shot, aspect) {
    const dist = (s) => Math.hypot(s.position.x - s.target.x, s.position.y - s.target.y,
        s.position.z - s.target.z);
    return Math.max(1, dist(shot) / Math.max(1, dist(playDriver(aspect))));
}

/** In over `titleFade` from `from`, and out again ending at `to`. */
function titleAt(t, from, to) {
    const fade = M.titleFade;
    return clamp01((t - from) / fade) * clamp01((to - t) / fade);
}

/**
 * 100, LIGHTS ON.
 *
 * The power goes, the four towers strike back up one at a time with a flare
 * each, and the board counts to 100. Each strike is `flashGap` after the last,
 * which is the photosensitivity ceiling doing the choreography.
 */
function lightsAt(level, t, aspect, calm) {
    const T = M.lights;
    const play = playDriver(aspect);
    const wide = stadiumShot(aspect);
    const board = boardShot(aspect);

    let shot;
    if (t < T.toBoard[0]) shot = move(play, wide, t, T.toWide, calm);
    else if (t < T.back[0]) shot = move(wide, board, t, T.toBoard, calm);
    else shot = move(board, play, t, T.back, calm);

    const cut = span(t, T.powerCut);
    const banks = [];
    const cones = [];
    let lit = 0;
    for (let i = 0; i < 4; i += 1) {
        const strike = T.igniteFrom + i * M.flashGap;
        const since = t - strike;
        let glow;
        if (since < 0) {
            glow = 1 - smooth(cut);
        } else if (calm) {
            glow = T.awakeBanks;
        } else if (since < STRIKE) {
            // Up to the flare in a few hundredths...
            glow = T.flare * (since / STRIKE);
        } else {
            // ...then settling to its new resting glow, which is brighter than
            // it was before the show.
            glow = lerp(T.flare, T.awakeBanks, smooth((since - STRIKE) / T.flareFor));
        }
        if (since >= 0) lit += 1;
        banks.push(glow);
        cones.push(since >= 0
            ? T.cone * clamp01(since / 0.2) * (1 - span(t, T.conesOut))
            : 0);
    }

    // The field goes dark with the power and comes back a tower at a time.
    const light = t < T.igniteFrom
        ? lerp(1, T.dimTo, smooth(cut))
        : lerp(T.dimTo, 1, lit / 4);

    const counting = t >= T.count[0] && t < T.back[1];
    const value = Math.round(level * (calm ? 1 : 1 - (1 - span(t, T.count)) ** 3));
    return {
        shot,
        light,
        banks,
        cones,
        board: counting ? { value: `${value}`, glow: t >= T.reveal ? 1 : 0.55 } : null,
        title: titleAt(t, T.reveal, T.length - 0.15),
        reveal: t >= T.reveal,
    };
}

/**
 * 200, FIREWORKS.
 *
 * The camera looks up over the board, a volley goes up from behind it and from
 * the far towers, and the finale opens straight out into "200". The sparks
 * themselves are fireworks.js; this is the camera, the lights and the title.
 */
function fireworksAt(t, aspect, calm) {
    const T = M.fireworks;
    const play = playDriver(aspect);
    const sky = skyShot(aspect);
    const shot = t < T.back[0] ? move(play, sky, t, T.toSky, calm) : move(sky, play, t, T.back, calm);
    const reveal = T.finaleLaunch + T.rise + T.gather;
    const light = t < T.back[0]
        ? lerp(1, T.dimTo, smooth(span(t, T.toSky)))
        : lerp(T.dimTo, 1, smooth(span(t, T.back)));
    return {
        shot,
        light,
        sparks: true,
        title: titleAt(t, reveal, T.length - 0.15),
        reveal: t >= reveal,
    };
}

/**
 * WHERE THE FIREWORKS COME FROM AND WHERE THE FINALE GOES, for
 * `fireworks.planFireworks`. Rockets go up from behind the scoreboard and from
 * the two far towers, so they rise out of the stadium rather than out of the
 * dark.
 */
export function fireworksSetup(level) {
    const b = boardSpot();
    const towers = pylonSpots().filter((p) => p.x > FIELD.lineInterval * FIELD.segments / 2);
    return {
        text: `${level}`,
        centre: finaleCentre(),
        origins: [
            { x: b.x + 3, y: b.top, z: -6 },
            ...towers.map((p) => ({ x: p.x, y: p.y + 2, z: p.z })),
            { x: b.x + 3, y: b.top, z: 6 },
            { x: b.x + 3, y: b.top, z: 0 },
        ],
    };
}
