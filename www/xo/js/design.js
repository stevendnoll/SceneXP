// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * design.js - A play the visitor drew (specs/custom-plays-PRD).
 *
 * THE BOOK'S PLAYS ARE SLUGS. formations.js turns a slug into positions and a
 * procedural route for every man ("go", "stop" with a break point, "low-deep"
 * with a defender to evade), and routes.js runs those shapes. A play the
 * visitor designs is different in kind: a FORMATION to line up on, borrowed
 * from one of the seventeen, and a LINE for each player who was given one. This
 * file is the shape of that record and the geometry of following a line.
 *
 * PURE, AND IT IMPORTS NOTHING. play.js, routes.js and the designer's screen
 * all lean on it, so it can depend on none of them. Coordinates in a record are
 * NORMALIZED FIELD UNITS, `[along, across]` from 0 to 1, `along` measured from
 * the offense's own end line and `across` from the sideline the simulation
 * calls y = 0. They are independent of the screen, its orientation, and the
 * simulation's unit scale, and `toSim` is the one conversion.
 *
 * WHERE A LINE ENDS IS WHERE THE MAN STOPS (PRD Decision 5). A receiver runs
 * his line, settles at its end and waits for the ball. One who should keep
 * going is drawn to the edge of the field. That is a rule the visitor can see,
 * which is the point: nothing here infers an intention from the shape of the
 * last segment.
 */

/** A designed play's id starts with this, so it can never be one of the
 *  book's slugs. */
export const PLAY_ID_PREFIX = 'custom-';

/** The players who can be given a line. The linemen and the defense keep the
 *  base formation's own behavior. */
export const PATH_PLAYERS = Object.freeze(['wr1', 'wr2', 'wr3', 'wr4', 'qb']);

/** A line is at most this many points once simplified: enough for any route
 *  tree, few enough that a record stays a few hundred bytes. */
export const MAX_POINTS = 16;

/** A play name as typed, at most. */
export const MAX_NAME = 24;

/** How many designed plays the browser keeps before the oldest hidden ones
 *  go, then a polite refusal. */
export const MAX_PLAYS = 50;

/**
 * HOW FAR BEHIND THE LINE OF SCRIMMAGE THE QUARTERBACK'S LINE MUST STAY, as a
 * fraction of a line interval, the way the ported pockets are written: every
 * `formationRouteQb` case puts his `right` boundary at 0.8 or 0.9 of an
 * interval, and the line of scrimmage is at one. A rollout drawn across it is
 * clamped back to this, so a designed play cannot walk him over the line before
 * the visitor has decided anything.
 */
export const QB_BEHIND = 0.9;

export function isCustomId(id) {
    return typeof id === 'string' && id.startsWith(PLAY_ID_PREFIX) && id.length > PLAY_ID_PREFIX.length;
}

/** A fresh id, from the clock the caller hands in so a test can pin it. */
export function newPlayId(now = Date.now()) {
    return `${PLAY_ID_PREFIX}${Math.floor(now).toString(36)}`;
}

/**
 * WHAT `lineUp` IS BEING ASKED FOR, from either shape a play arrives in.
 *
 * A slug resolves to itself with `routes: null`, which means "the ported
 * routes, untouched", and is how every play in the book has always run. A
 * record resolves to its base formation and its lines, where `routes: {}`
 * means a designed play in which nobody was given a line: every receiver holds
 * at the line of scrimmage, which is the visible answer for a line that was
 * not drawn (PRD Decision 3).
 */
export function resolvePlay(play) {
    if (play && typeof play === 'object') {
        const base = typeof play.base === 'string' && play.base ? play.base : '';
        const id = typeof play.id === 'string' && play.id ? play.id : base;
        const routes = play.routes && typeof play.routes === 'object' ? play.routes : {};
        return { id, base, routes };
    }
    const slug = typeof play === 'string' ? play : '';
    return { id: slug, base: slug, routes: null };
}

/** `measurements()` from config.js is the only shape this needs: the
 *  downfield extent as `width` and sideline to sideline as `height`. */
export function toSim(point, m) {
    return { x: point[0] * m.width, y: point[1] * m.height };
}

export function toNormalized(x, y, m) {
    return [x / m.width, y / m.height];
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * One drawn line made safe: an array of 1 to MAX_POINTS `[along, across]`
 * pairs, every number finite and inside the field. Null for anything else,
 * because a record is a string a visitor could have edited by hand and a point
 * that is not a number would put a receiver at NaN for the rest of a play.
 */
export function normalizeLine(raw) {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const out = [];
    for (const p of raw.slice(0, MAX_POINTS)) {
        if (!Array.isArray(p) || p.length < 2) return null;
        const a = Number(p[0]);
        const b = Number(p[1]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        out.push([clamp01(a), clamp01(b)]);
    }
    return out;
}

/**
 * A stored play made safe, or null. `bases` is the list of formations the
 * simulation knows (play.js's OFFENSIVE_PLAYS, handed in rather than imported
 * so this file stays free of the simulation). An unknown base falls back to
 * the first of them rather than to nothing, because a play the visitor named
 * and drew is worth more than the formation it happened to start from.
 */
export function normalizeRecord(raw, bases = [], fallbackBase = 'pass4') {
    if (!raw || typeof raw !== 'object') return null;
    if (!isCustomId(raw.id)) return null;
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_NAME) : '';
    if (!name) return null;
    let base = typeof raw.base === 'string' ? raw.base : '';
    if (!bases.includes(base)) base = bases.includes(fallbackBase) ? fallbackBase : (bases[0] || '');
    if (!base) return null;
    const routes = {};
    if (raw.routes && typeof raw.routes === 'object') {
        for (const who of PATH_PLAYERS) {
            const line = normalizeLine(raw.routes[who]);
            if (line) routes[who] = line;
        }
    }
    const created = typeof raw.created === 'string' ? raw.created : '';
    return { id: raw.id, name, base, routes, created, hidden: raw.hidden === true };
}

// ---- Following a line --------------------------------------------------------

/**
 * The state a line carries through one play: its points in simulation units,
 * and how far along it the man has come. `seg` is the segment he is on and it
 * only ever advances, so a shove that puts him beside an earlier part of his
 * own route cannot send him back to run it again.
 */
export function pathState(points) {
    return { points: points.map((p) => ({ x: p.x, y: p.y })), seg: 0, done: false };
}

/** Where along segment a-b the point (x, y) projects, 0 at a, 1 at b, not
 *  clamped. A zero-length segment projects everything to its end. */
function projection(a, b, x, y) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (!(len2 > 0)) return 1;
    return ((x - a.x) * dx + (y - a.y) * dy) / len2;
}

/** Segment lengths and their running total, measured once per path. */
function measure(path) {
    if (path.lengths) return;
    const pts = path.points;
    path.lengths = [];
    path.cum = [0];
    for (let i = 0; i < pts.length - 1; i += 1) {
        const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        path.lengths.push(l);
        path.cum.push(path.cum[i] + l);
    }
    path.total = path.cum[path.cum.length - 1];
}

/** The point `s` units along the line, clamped to its ends. */
function pointAt(path, s) {
    const pts = path.points;
    if (s <= 0) return pts[0];
    if (s >= path.total) return pts[pts.length - 1];
    let i = 0;
    while (i < path.lengths.length - 1 && path.cum[i + 1] <= s) i += 1;
    const l = path.lengths[i];
    const t = l > 0 ? (s - path.cum[i]) / l : 1;
    return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
}

/**
 * WHERE A MAN AT (x, y) SHOULD BE HEADING, which is a point on his line a
 * little way ahead of where he is, and how far he has left.
 *
 * A carrot ahead on the line rather than the next corner, because the ported
 * steer is per axis: aimed at a corner, a man on a shallow diagonal runs the
 * diagonal at forty-five degrees and then straight, and a drawn twenty-degree
 * line is run as something else. Aimed at a point always `lookahead` ahead on
 * the line itself he is pulled onto the line and along it, and the line he
 * runs is the line that was drawn, with corners rounded by about the
 * lookahead. That rounding is the one thing the test in tests/xo-design
 * measures.
 *
 * `seg` advances when he has passed the end of his current segment, never
 * retreats, and skips a zero-length segment. It ALSO advances when he is
 * within `lookahead` of a corner whose next segment turns back toward him,
 * which is a COMEBACK: there his carrot sits `lookahead` along that next
 * segment, close enough for him to reach, while his projection on the
 * segment he is on still says he has not arrived. He then stands on the
 * carrot, wanting nothing, a stride short of the turn. Measured before this
 * rule: receiver D on a drawn comeback stalled at the corner for the rest of
 * the play. Limited to corners sharper than a right angle because at a right
 * angle or less he cannot reach the carrot early, and advancing him anyway
 * moved his carrot further round the corner and had him cut it by half a
 * metre more than before (measured on a drawn out route, 8 units to 14.6).
 *
 * Returns the target, the straight distance to the line's last point
 * (`toEnd`, which is what the braking law wants), and `end` once the carrot
 * is the last point itself. Null for a path with no points, which is not a
 * path.
 */
export function followPath(path, x, y, lookahead = 0) {
    const pts = path && path.points;
    if (!pts || pts.length === 0) return null;
    const last = pts[pts.length - 1];
    const toEnd = Math.hypot(last.x - x, last.y - y);
    if (pts.length === 1) return { x: last.x, y: last.y, toEnd, end: true };
    measure(path);
    let i = path.seg || 0;
    while (i < pts.length - 2) {
        const corner = pts[i + 1];
        const turnsBack = (corner.x - pts[i].x) * (pts[i + 2].x - corner.x)
            + (corner.y - pts[i].y) * (pts[i + 2].y - corner.y) < 0;
        const atCorner = turnsBack && lookahead > 0
            && Math.hypot(corner.x - x, corner.y - y) <= lookahead;
        if (!atCorner && projection(pts[i], corner, x, y) < 1) break;
        i += 1;
    }
    path.seg = i;
    const t = Math.max(0, Math.min(1, projection(pts[i], pts[i + 1], x, y)));
    const s = path.cum[i] + t * path.lengths[i];
    const ahead = s + Math.max(0, lookahead);
    const target = pointAt(path, ahead);
    const end = ahead >= path.total;
    return { x: target.x, y: target.y, toEnd, end };
}

/**
 * ONE AXIS OF SPEED MOVED TOWARD WHAT THE LINE WANTS, by the port's own
 * numbers: `accel` a frame when speeding up along the direction he is already
 * going, `decel` a frame when slowing or turning back, never overshooting the
 * wanted value. The same two numbers every ported accel and decel uses, so a
 * drawn route is run by the same man who runs the book's.
 */
export function approachSpeed(speed, wanted, accel, decel) {
    const diff = wanted - speed;
    if (diff === 0) return speed;
    const speedingUp = Math.abs(wanted) > Math.abs(speed) && (speed === 0 || Math.sign(wanted) === Math.sign(speed));
    const step = speedingUp ? accel : decel;
    if (Math.abs(diff) <= step) return wanted;
    return speed + Math.sign(diff) * step;
}
