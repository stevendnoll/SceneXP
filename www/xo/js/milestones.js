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
import { XO_CONFIG as CFG, FIELD } from './config.min.js';
import { playDriver } from './camera.min.js';
import { pylonSpots, boardSpot, standLayout } from './field.min.js';

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
    return { 100: 'lights', 200: 'fireworks', 300: 'blimp', 400: 'turf', 500: 'finale' }[level] || '';
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
 *   blimp     { x, y, z, heading, lit } while a show is flying it, or null
 *   bulbs     true while the numerals on the turf are running
 *   crowd     true while the finale's fans and card stunt are running
 *   confetti  true while it is falling
 *   trophy    { rise, spin } once the gold ball is up, or null
 *   done      true once `t` has run past the end
 */
export function showFrame(level, t, { aspect = 1.78, calm = false } = {}) {
    const kind = showKind(level);
    const length = showLength(level);
    const base = {
        shot: playDriver(aspect), light: 1, banks: null, cones: null,
        board: null, sparks: false, title: 0, reveal: false, done: t >= length, fog: 1,
        blimp: null, bulbs: false, crowd: false, confetti: false, trophy: null,
    };
    let frame = { ...base, done: true };
    if (kind === 'lights') frame = { ...base, ...lightsAt(level, t, aspect, calm) };
    if (kind === 'fireworks') frame = { ...base, ...fireworksAt(t, aspect, calm) };
    if (kind === 'blimp') frame = { ...base, ...blimpShowAt(t, aspect, calm) };
    if (kind === 'turf') frame = { ...base, ...turfAt(t, aspect, calm) };
    if (kind === 'finale') frame = { ...base, ...finaleAt(t, aspect, calm) };
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

// ---- 300, the blimp ---------------------------------------------------------------

const LEN = () => FIELD.lineInterval * FIELD.segments;

/** When the blimp is overhead, which is when its number lands. */
export function blimpReveal() {
    const B = M.blimp;
    return (B.cross[0] + B.cross[1]) / 2;
}

/**
 * WHERE THE BLIMP IS DURING ITS SHOW. It crosses the field on a cubic, fast at
 * the edges and slow through the middle without ever stopping, nose along +z,
 * so its lit side faces the camera, which looks down +x.
 *
 * Somebody who asked not to be moved about sees it parked overhead instead.
 */
export function blimpShowPosition(t, { calm = false } = {}) {
    const B = M.blimp;
    const s = calm ? 0 : span(t, B.cross) * 2 - 1;
    return {
        x: LEN() * B.along,
        y: B.altitude,
        z: B.reach * s * s * s + B.drift * s,
        heading: 0,
    };
}

/**
 * WHERE IT IS AFTER ITS SHOW, for the rest of the game: a slow circle high over
 * the stadium, clear of the play camera (the suite holds it to that). `elapsed`
 * is any running clock.
 */
export function blimpOrbitPosition(elapsed) {
    const O = M.blimp.orbit;
    const a = (Math.PI * 2 * elapsed) / O.period;
    return {
        x: LEN() / 2 + Math.cos(a) * O.radius,
        y: O.altitude,
        z: Math.sin(a) * O.radius,
        // Facing along the circle: the velocity is (-sin a, cos a).
        heading: Math.atan2(-Math.sin(a), Math.cos(a)),
    };
}

/** Looking up from behind the offense, with the blimp overhead and a strip of
 *  the field along the bottom so the players waving are in it. */
export function upShot(aspect) {
    return cached('up', aspect, () => {
        const B = M.blimp;
        const at = blimpShowPosition(blimpReveal());
        const half = B.size.long / 2 + 2;
        const girth = B.size.girth / 2 + 1;
        return fitShot({
            target: { x: at.x, y: at.y * 0.62, z: 0 },
            from: { x: -1, y: -0.08, z: 0 },
            fov: 55,
            points: [
                { x: at.x, y: at.y + girth, z: -half }, { x: at.x, y: at.y + girth, z: half },
                { x: at.x, y: at.y - girth, z: -half }, { x: at.x, y: at.y - girth, z: half },
                { x: LEN() * 0.4, y: 0, z: -6 }, { x: LEN() * 0.4, y: 0, z: 6 },
            ],
            aspect,
            margin: 0.05,
            floor: 5,
        });
    });
}

function blimpShowAt(t, aspect, calm) {
    const B = M.blimp;
    const play = playDriver(aspect);
    const up = upShot(aspect);
    const shot = t < B.back[0] ? move(play, up, t, B.toUp, calm) : move(up, play, t, B.back, calm);
    const reveal = blimpReveal();
    return {
        shot,
        blimp: { ...blimpShowPosition(t, { calm }), lit: t >= reveal },
        title: titleAt(t, reveal, B.length - 0.15),
        reveal: t >= reveal,
    };
}

// ---- 400, the numbers on the turf --------------------------------------------------

/** The middle of the field, where the numerals are laid. */
export function turfCentre() {
    return { x: LEN() / 2, z: 0 };
}

/** Straight down on the middle of the field, from a little behind it so the
 *  numerals read the right way up (downfield is the top of the frame). */
export function overheadShot(aspect) {
    return cached('overhead', aspect, () => {
        const c = turfCentre();
        const w = FIELD.width / 2;
        return fitShot({
            target: { x: c.x, y: 0, z: 0 },
            from: { x: -0.32, y: 1, z: 0 },
            fov: 45,
            points: [
                { x: LEN() * 0.18, y: 0, z: -w }, { x: LEN() * 0.18, y: 0, z: w },
                { x: LEN() * 0.82, y: 0, z: -w }, { x: LEN() * 0.82, y: 0, z: w },
                { x: c.x, y: 4, z: 0 },
            ],
            aspect,
            margin: 0.04,
        });
    });
}

function turfAt(t, aspect, calm) {
    const T = M.turf;
    const play = playDriver(aspect);
    const top = overheadShot(aspect);
    const shot = t < T.back[0] ? move(play, top, t, T.toTop, calm) : move(top, play, t, T.back, calm);
    const reveal = T.walk[1];
    const light = t < T.back[0]
        ? lerp(1, T.dimTo, smooth(span(t, T.toTop)))
        : lerp(T.dimTo, 1, smooth(span(t, T.back)));
    return {
        shot,
        light,
        bulbs: true,
        title: titleAt(t, reveal, T.length - 0.15),
        reveal: t >= reveal,
    };
}

// ---- 500, the perfect game -----------------------------------------------------------

/** Where the gold ball hangs, over the two teams. */
export function trophySpot() {
    return { x: LEN() / 2, y: 9.5, z: -2.5 };
}

/** The two rows the teams celebrate in, in front of the far stand. */
export function finaleRows(count) {
    const out = [];
    const perRow = Math.ceil(count / 2);
    for (let i = 0; i < count; i += 1) {
        const row = i < perRow ? 0 : 1;
        const inRow = row === 0 ? perRow : count - perRow;
        const k = row === 0 ? i : i - perRow;
        out.push({
            x: LEN() / 2 + (k - (inRow - 1) / 2) * 2.4 + row * 1.2,
            z: row === 0 ? -5 : -1.4,
        });
    }
    return out;
}

/** Across the field at the far stand, square on to its cards, with the teams
 *  in front and room above the stand for the fireworks. */
export function sideShot(aspect) {
    return cached('side', aspect, () => {
        const S = standLayout();
        const c = LEN() / 2;
        const message = 17.5;
        // The top of the cards, which the fans hold up in front of their faces.
        const cardsTop = CFG.crowd.cardsAt + 0.2;
        return fitShot({
            target: { x: c, y: 4, z: S.half + 3 },
            from: { x: 0, y: 0.4, z: -1 },
            fov: 42,
            points: [
                { x: c - message, y: S.top(0), z: S.out(0) }, { x: c + message, y: S.top(0), z: S.out(0) },
                { x: c - message, y: S.top(S.rows - 1) + cardsTop, z: S.out(S.rows - 1) },
                { x: c + message, y: S.top(S.rows - 1) + cardsTop, z: S.out(S.rows - 1) },
                { x: c, y: 15, z: S.out(S.rows - 1) + 6 },
                { x: c - 9, y: 0, z: -5.5 }, { x: c + 9, y: 0, z: -5.5 },
            ],
            aspect,
            margin: 0.05,
        });
    });
}

/** Round the gold ball: `u` 0 to 1 across the sweep. */
export function orbitShot(aspect, u) {
    const F = M.finale;
    const c = trophySpot();
    const side = sideShot(aspect);
    const a0 = Math.atan2(side.position.x - c.x, side.position.z - c.z);
    const a = a0 + F.orbit.sweep * smooth(u);
    return {
        position: { x: c.x + Math.sin(a) * F.orbit.radius, y: c.y + F.orbit.height, z: c.z + Math.cos(a) * F.orbit.radius },
        target: { ...c },
        fov: 40,
    };
}

function finaleAt(t, aspect, calm) {
    const F = M.finale;
    const play = playDriver(aspect);
    const side = sideShot(aspect);
    const [t0, t1] = F.trophy;
    let shot;
    if (t < t0) {
        shot = move(play, side, t, F.toSide, calm);
    } else if (t < F.back[0]) {
        const approach = [t0, t0 + 1.0];
        const u = span(t, [t0 + 1.0, t1]);
        const round = calm ? orbitShot(aspect, 0) : orbitShot(aspect, u);
        shot = t < approach[1] ? move(side, orbitShot(aspect, 0), t, approach, calm) : round;
    } else {
        shot = move(calm ? orbitShot(aspect, 0) : orbitShot(aspect, 1), play, t, F.back, calm);
    }

    let light = 1;
    if (t < F.brighten[0]) light = lerp(1, F.dimTo, smooth(span(t, F.dim)));
    else if (t < F.back[0]) light = lerp(F.dimTo, F.brightTo, smooth(span(t, F.brighten)));
    else light = lerp(F.brightTo, 1, smooth(span(t, F.back)));

    return {
        shot,
        light,
        crowd: true,
        sparks: true,
        confetti: !calm && t >= F.confetti.from,
        trophy: t >= t0 ? { rise: calm ? 1 : smooth((t - t0) / 0.8), spin: calm ? 0 : (t - t0) * 1.4 } : null,
        title: titleAt(t, F.reveal, F.length - 0.15),
        reveal: t >= F.reveal,
    };
}

/** The finale's volley: from behind the far stand, bursting over it, and with
 *  no numerals, because the cards are already saying the number. */
export function finaleFireworksSetup() {
    const S = standLayout();
    const c = LEN() / 2;
    const back = S.out(S.rows - 1) + 3;
    return {
        text: '',
        centre: { x: c, y: 12.5, z: back + 5 },
        origins: [-14, -5, 5, 14].map((dx) => ({ x: c + dx, y: S.top(S.rows - 1) + 2, z: back })),
    };
}

// ---- The players in a show ---------------------------------------------------------------

/** Whether a show sends the players anywhere. */
export function showUsesTeam(level) {
    return ['blimp', 'turf', 'finale'].includes(showKind(level));
}

/**
 * GIVE EACH SPOT THE NEAREST MAN STILL WITHOUT ONE. Greedy rather than optimal,
 * because the only thing the eye can object to is two men swapping places
 * across the field, and nearest-first rarely asks for that.
 */
function assign(men, spots) {
    const free = [...men];
    const out = new Map();
    for (const spot of spots) {
        if (!free.length) break;
        let best = 0;
        let bestD = Infinity;
        free.forEach((m, i) => {
            const d = Math.hypot(m.x - spot.x, m.z - spot.z);
            if (d < bestD) { bestD = d; best = i; }
        });
        const [man] = free.splice(best, 1);
        out.set(man.position, { x: spot.x, z: spot.z });
    }
    return out;
}

/**
 * THE MOST SPREAD OUT `count` POINTS OF A SET, no two closer than `apart`: start
 * from the first and keep taking whichever point is furthest from everything
 * already taken. On the numerals that puts a man on every digit before it puts
 * a second man on any of them.
 */
export function spreadPoints(points, count, apart = 0) {
    if (!points.length || count <= 0) return [];
    const chosen = [points[0]];
    while (chosen.length < count) {
        let best = null;
        let bestD = -1;
        for (const p of points) {
            const d = Math.min(...chosen.map((c) => Math.hypot(p.x - c.x, p.z - c.z)));
            if (d > bestD) { bestD = d; best = p; }
        }
        if (!best || bestD < apart) break;
        chosen.push(best);
    }
    return chosen;
}

/**
 * WHAT A SHOW DOES WITH THE PLAYERS.
 *
 * `men` is every visible figure, where it is DRAWN: { position, team, x, z }.
 * `numerals` is the 400 show's bulb positions. Returns the spots to stage them
 * to, when the run starts and how long it takes, and the celebration to hand
 * `celebration.teamCelebration` once they are there. A calm show runs nobody:
 * the walk collapses to an instant on the camera's own cut.
 */
export function stageTeam(level, men, { calm = false, numerals = [] } = {}) {
    const kind = showKind(level);
    const offense = men.filter((m) => m.team === 0);
    const defense = men.filter((m) => m.team !== 0);
    const stay = new Map(men.map((m) => [m.position, { x: m.x, z: m.z }]));
    const at = (list, spots) => list.map((m) => ({ ...m, ...spots.get(m.position) }));

    if (kind === 'blimp') {
        const B = M.blimp;
        const hero = offense[0];
        return {
            spots: stay, delay: 0, walk: 0,
            celebrate: hero ? {
                hero, mates: offense.slice(1), rivals: [],
                faceAt: { x: blimpShowPosition(blimpReveal()).x, z: 0 },
                wait: B.wave, cap: 2.2,
            } : null,
        };
    }

    if (kind === 'turf') {
        const T = M.turf;
        const onNumbers = assign(offense, spreadPoints(numerals, offense.length, T.apart));
        /**
         * THE DEFENSE STANDS OFF THE NUMBERS IN TWO SHORT ROWS, one above them
         * and one below. It was the sidelines first, and "400" is nearly as
         * wide as the field, so a man on the sideline stood 0.74m from the end of
         * a zero. Above and below, there is a clear three metres either way.
         */
        const c = turfCentre();
        const clear = T.digitHeight / 2 + 3.2;
        const perRow = Math.ceil(defense.length / 2);
        const sideline = defense.map((_, i) => {
            const row = i < perRow ? -1 : 1;
            const n = row < 0 ? perRow : defense.length - perRow;
            const k = row < 0 ? i : i - perRow;
            return { x: c.x + row * clear, z: c.z + (k - (n - 1) / 2) * 3.2 };
        });
        const offSide = assign(defense, sideline);
        const spots = new Map([...stay, ...onNumbers, ...offSide]);
        const hero = offense.find((m) => onNumbers.has(m.position));
        return {
            spots,
            delay: calm ? (T.toTop[0] + T.toTop[1]) / 2 : T.walk[0],
            walk: calm ? 0 : T.walk[1] - T.walk[0],
            celebrate: hero ? {
                hero: { ...hero, ...onNumbers.get(hero.position) },
                mates: at(offense.filter((m) => m !== hero && onNumbers.has(m.position)), onNumbers),
                rivals: at(defense, offSide),
                faceAt: { x: -60, z: 0 },
                watchAt: turfCentre(),
                wait: T.walk[1],
                cap: 2.4,
            } : null,
        };
    }

    if (kind === 'finale') {
        const F = M.finale;
        const everybody = [...offense, ...defense];
        const rows = assign(everybody, finaleRows(everybody.length));
        const spots = new Map([...stay, ...rows]);
        const placed = at(everybody.filter((m) => rows.has(m.position)), rows);
        return {
            spots,
            delay: calm ? (F.toSide[0] + F.toSide[1]) / 2 : F.walk[0],
            walk: calm ? 0 : F.walk[1] - F.walk[0],
            celebrate: placed.length ? {
                hero: placed[0], mates: placed.slice(1), rivals: [],
                faceAt: { x: LEN() / 2, z: -80 },
                wait: F.walk[1], cap: 4.0, dances: F.dances,
            } : null,
        };
    }
    return null;
}

/** The 400 show's bulbs, for `fireworks.planBulbs`. */
export function turfSetup(level = 400) {
    const T = M.turf;
    return { text: `${level}`, centre: turfCentre(), height: T.digitHeight, spacing: T.spacing };
}
