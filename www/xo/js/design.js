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

// ---- From a finger to a line --------------------------------------------------

/**
 * THE FORMATIONS OFFERED AS A STARTING POINT, by friendly name. In the MVP each
 * is the starting positions of a play in the book with its routes stripped
 * (PRD Decision 2), so the linemen, the benching and the quarterback's pocket
 * stay consistent with the simulation at no cost. `from` is the book play the
 * label admits to.
 */
export const FORMATION_TEMPLATES = Object.freeze([
    Object.freeze({ id: 'spread', name: 'Spread', base: 'pass4', from: 'Four Verticals' }),
    Object.freeze({ id: 'bunch', name: 'Bunch', base: 'pass2', from: 'Flood Left' }),
    Object.freeze({ id: 'screen', name: 'Screen', base: 'run3', from: 'Run Middle' }),
]);

/**
 * The smoothing a finger needs, in normalized field units. `alpha` is the
 * weight of a new sample in the running average (lower is smoother and lags
 * more), `minStep` the distance a sample must have moved from the last one
 * kept, `epsilon` how far the simplified line may stray from the smoothed one
 * (0.012 of the field is 12 units, 0.42 m, under a stride), and `minLength` how
 * long a stroke has to be before it is a route rather than a tap: 60 units is
 * 2.1 m, a short flat route, and nothing a resting finger draws.
 */
export const STROKE = Object.freeze({ alpha: 0.35, minStep: 0.004, epsilon: 0.012, minLength: 0.06 });

/** The across axis is 600 units to the along axis's 1000, so a distance in
 *  normalized units has to be measured with the field's shape in it. */
const ASPECT = 0.6;
const span = (a, b) => Math.hypot(b[0] - a[0], (b[1] - a[1]) * ASPECT);

/**
 * AN EXPONENTIAL MOVING AVERAGE OF THE POINTER, kept while the finger is down.
 * Each call returns the point to add to the stroke, or null when the finger has
 * not moved far enough from the last point kept. The first sample is taken
 * whole, so the average does not start from the origin.
 */
export function smoothSample(state, point, opts = STROKE) {
    if (!state.last) {
        state.ema = [point[0], point[1]];
        state.last = [point[0], point[1]];
        return state.last;
    }
    const a = opts.alpha;
    state.ema = [state.ema[0] + (point[0] - state.ema[0]) * a, state.ema[1] + (point[1] - state.ema[1]) * a];
    if (span(state.last, state.ema) < opts.minStep) return null;
    state.last = [state.ema[0], state.ema[1]];
    return state.last;
}

/** Distance from point p to the segment a-b, in the field's own shape. */
function offSegment(p, a, b) {
    const ax = a[0]; const ay = a[1] * ASPECT;
    const bx = b[0]; const by = b[1] * ASPECT;
    const px = p[0]; const py = p[1] * ASPECT;
    const dx = bx - ax; const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/**
 * RAMER-DOUGLAS-PEUCKER: keep the points that matter, drop the ones that only
 * trace a line between them. The corners survive, the wobble does not.
 */
export function simplifyLine(points, epsilon) {
    if (!Array.isArray(points) || points.length <= 2) return points ? points.slice() : [];
    const keep = new Array(points.length).fill(false);
    keep[0] = true;
    keep[points.length - 1] = true;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [from, to] = stack.pop();
        let worst = 0;
        let at = -1;
        for (let i = from + 1; i < to; i += 1) {
            const d = offSegment(points[i], points[from], points[to]);
            if (d > worst) { worst = d; at = i; }
        }
        if (at >= 0 && worst > epsilon) {
            keep[at] = true;
            stack.push([from, at], [at, to]);
        }
    }
    return points.filter((_, i) => keep[i]);
}

/**
 * A FINISHED STROKE MADE INTO A ROUTE: anchored at the player's own spot,
 * simplified to at most `MAX_POINTS`, each point inside the field. Null when
 * the stroke is shorter than `minLength`, which is a tap or a slip and not a
 * route. The anchor is the first point whatever the finger did, because on a
 * phone the finger covers the disc it is drawing from (PRD 4.4).
 */
export function strokeToLine(samples, start, opts = STROKE) {
    if (!Array.isArray(samples) || !start) return null;
    const pts = [[clamp01(start[0]), clamp01(start[1])]];
    for (const s of samples) {
        if (!Array.isArray(s) || !Number.isFinite(s[0]) || !Number.isFinite(s[1])) continue;
        pts.push([clamp01(s[0]), clamp01(s[1])]);
    }
    let length = 0;
    for (let i = 1; i < pts.length; i += 1) length += span(pts[i - 1], pts[i]);
    if (length < opts.minLength) return null;
    let eps = opts.epsilon;
    let line = simplifyLine(pts, eps);
    while (line.length > MAX_POINTS) {
        eps *= 1.5;
        line = simplifyLine(pts, eps);
    }
    if (line.length < 2) return null;
    return line;
}

// ---- Words for a drawing --------------------------------------------------------

/** The receivers' letters, the order they are read in. The quarterback is
 *  named outright. */
const LETTERS = Object.freeze({ wr1: 'A', wr2: 'B', wr3: 'C', wr4: 'D' });

/** One line interval along, and the across axis in intervals. */
const ALONG_INTERVAL = 0.2;
const ACROSS_INTERVALS = 3;

/**
 * THE WORDS A SCREEN READER HEARS FOR A DRAWING, and a card's blurb: the same
 * measurement the book's own names came from, depth and net lateral travel,
 * not where anybody ends up. Depth is the line's end past its start in
 * intervals (short under 1.5, medium under 3, deep otherwise), direction its
 * net travel across (straight within half an interval, else left toward the
 * sideline the simulation calls zero, which is the viewer's left from behind
 * the offense). Players who share a phrase are read together, receivers with
 * no line are blocking, and the quarterback's line is a drop or a rollout.
 */
export function describePlay(routes = {}, spots = {}) {
    const phrases = new Map();
    const say = (who, phrase) => {
        if (!phrases.has(phrase)) phrases.set(phrase, []);
        phrases.get(phrase).push(who);
    };
    for (const pos of ['wr1', 'wr2', 'wr3', 'wr4']) {
        if (!spots[pos]) continue;
        const line = routes[pos];
        if (!Array.isArray(line) || line.length < 2) { say(LETTERS[pos], 'blocking'); continue; }
        const start = line[0];
        const end = line[line.length - 1];
        const depth = (end[0] - start[0]) / ALONG_INTERVAL;
        const lateral = (end[1] - start[1]) * ACROSS_INTERVALS;
        const d = depth < 1.5 ? 'short' : depth < 3 ? 'medium' : 'deep';
        const dir = Math.abs(lateral) < 0.5 ? 'straight' : lateral < 0 ? 'left' : 'right';
        say(LETTERS[pos], `${d} ${dir}`);
    }
    const parts = [];
    for (const [phrase, who] of phrases) {
        const names = who.length === 1 ? who[0]
            : `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}`;
        parts.push(`${names} ${phrase}`);
    }
    const qb = routes.qb;
    if (Array.isArray(qb) && qb.length >= 2 && spots.qb) {
        const lateral = (qb[qb.length - 1][1] - qb[0][1]) * ACROSS_INTERVALS;
        parts.push(Math.abs(lateral) > 1 ? `QB rollout ${lateral < 0 ? 'left' : 'right'}` : 'QB drop');
    }
    return parts.join(', ');
}

// ---- Drawing the field, the men and their lines ---------------------------------

/** How the field sits on a canvas of w by h pixels: `rotate` runs the offense
 *  up the screen, for a phone held upright, else left to right like the
 *  playbook's cards. `margin` is a fraction of the shorter side. */
export function layoutFor(w, h, rotate = false, margin = 0.08) {
    const m = Math.min(w, h) * margin;
    if (!rotate) {
        const sx = w - 2 * m;
        const sy = h - 2 * m;
        return {
            rotate: false, m,
            toCanvas: (p) => [m + p[0] * sx, m + p[1] * sy],
            fromCanvas: (x, y) => [(x - m) / sx, (y - m) / sy],
        };
    }
    const sx = w - 2 * m;
    const sy = h - 2 * m;
    return {
        rotate: true, m,
        // Across runs left to right, along runs up from the bottom.
        toCanvas: (p) => [m + p[1] * sx, h - m - p[0] * sy],
        fromCanvas: (x, y) => [(h - m - y) / sy, (x - m) / sx],
    };
}

/**
 * PAINT A DESIGN. The same painter draws the designer's canvas and a saved
 * play's card, so what was drawn, what is shown and what is run agree. Takes a
 * context rather than a canvas, and so stays free of the document: the
 * playbook's palette map is handed in as `ink`.
 *
 *   spots     every on-field offensive player's spot, by position
 *   routes    lines by position
 *   ink       { ground, lines, scrimmage, letters, linemen, players: { wr1..qb } }
 *   selected  a position to ring, or ''
 *   rotate    see `layoutFor`
 *   extra     an unfinished stroke to show under the finger, as points
 */
export function drawDesign(ctx, w, h, { spots = {}, routes = {}, ink, selected = '', rotate = false, extra = null } = {}) {
    const L = layoutFor(w, h, rotate);
    const u = Math.max(0.6, Math.min(w, h) / 150);
    ctx.save();
    ctx.fillStyle = ink.ground;
    ctx.fillRect(0, 0, w, h);
    // The offense's own end line, the five painted lines (the first of them
    // the line of scrimmage) and the far end line: six, so the field is
    // closed at both ends (Steve, 2026-11-02: the near end was missing).
    ctx.lineWidth = 1 * u;
    for (let k = 0; k <= 5; k += 1) {
        const along = k * ALONG_INTERVAL;
        const a = L.toCanvas([along, 0]);
        const b = L.toCanvas([along, 1]);
        ctx.strokeStyle = k === 1 ? ink.scrimmage : ink.lines;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
    }
    // The touchlines.
    ctx.strokeStyle = ink.lines;
    for (const across of [0, 1]) {
        const a = L.toCanvas([0, across]);
        const b = L.toCanvas([1, across]);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
    }
    // The routes, under the men.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const drawLine = (pts, color, width, dashed) => {
        if (!pts || pts.length < 2) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        if (dashed && ctx.setLineDash) ctx.setLineDash([4 * u, 4 * u]);
        ctx.beginPath();
        pts.forEach((p, i) => {
            const c = L.toCanvas(p);
            if (i === 0) ctx.moveTo(c[0], c[1]);
            else ctx.lineTo(c[0], c[1]);
        });
        ctx.stroke();
        if (dashed && ctx.setLineDash) ctx.setLineDash([]);
        // Where the line stops, a bar across it: the man stops here.
        const a = L.toCanvas(pts[pts.length - 2]);
        const b = L.toCanvas(pts[pts.length - 1]);
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const n = Math.hypot(dx, dy) || 1;
        const px = -dy / n * 4 * u;
        const py = dx / n * 4 * u;
        if (!dashed) {
            ctx.beginPath();
            ctx.moveTo(b[0] - px, b[1] - py);
            ctx.lineTo(b[0] + px, b[1] + py);
            ctx.stroke();
        }
    };
    for (const pos of PATH_PLAYERS) {
        if (routes[pos] && spots[pos]) drawLine(routes[pos], ink.players[pos], 2 * u, false);
    }
    if (extra && extra.length >= 2 && selected) drawLine(extra, ink.players[selected], 1.4 * u, true);
    // The linemen, small and quiet.
    ctx.font = `bold ${9 * u}px Tahoma, Geneva, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink.linemen;
    for (const pos of Object.keys(spots)) {
        if (!pos.startsWith('x')) continue;
        const c = L.toCanvas(spots[pos]);
        ctx.fillText('X', c[0], c[1]);
    }
    // The receivers and the quarterback: a disc in their ink, the letter on it.
    for (const pos of PATH_PLAYERS) {
        if (!spots[pos]) continue;
        const c = L.toCanvas(spots[pos]);
        const r = 7 * u;
        if (pos === selected) {
            ctx.strokeStyle = ink.players[pos];
            ctx.lineWidth = 2 * u;
            ctx.beginPath();
            ctx.arc(c[0], c[1], r + 4 * u, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.fillStyle = ink.players[pos];
        ctx.beginPath();
        ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ink.letters;
        ctx.font = `bold ${9 * u}px Tahoma, Geneva, sans-serif`;
        ctx.fillText(pos === 'qb' ? 'Q' : LETTERS[pos], c[0], c[1] + 0.5 * u);
    }
    ctx.restore();
    return L;
}
