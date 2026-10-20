// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * profile.js - the pencil line a builder draws on the block (M4, PRD Shaping
 * the body), and the car it cuts.
 *
 * A CARVE is the line's points, one an inch along the block (config
 * workshop.grid), each a height or a width in meters:
 *
 *   { top: [...], bottom: [...], width: [...] }    // nose to tail
 *
 * `top` and `bottom` are the side profile (above the block's bottom face),
 * `width` the top profile (the body's full width there). The points move
 * up and down only, which is all a finger or an arrow key needs.
 *
 * THE CURVE THROUGH THEM NEVER OVERSHOOTS (a monotone cubic, Fritsch and
 * Carlson): between two points it stays between their two values. So every
 * limit kept at the points is kept all along the car, and the editor only
 * has to check the points. `setPoint` holds a moved point inside its limits
 * AND against its neighbors (a top never comes within the least thickness
 * of the bottom either side of it), which is what makes the whole curve
 * hold together, not just the points.
 *
 * THE CUT CAR IS STATIONS, the same [x, bottom, top, width] rows car.js
 * weighs (sampled every `workshop.sample`), so carving changes nothing in
 * the physics: a carved car and a starting design are the same kind of
 * thing (PLANNING, A build is plain data). The top profile is the stations'
 * width column.
 *
 * PURE, and only + - * / like car.js: a carved car must weigh the same on
 * every device, and the stations are what it is weighed from.
 */

import { DERBY_CONFIG, IN } from './config.min.js';
import { profileAt } from './car.min.js';

const EPS = 1e-12;
const lo = (a, b) => (a < b ? a : b);
const hi = (a, b) => (a > b ? a : b);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** The grid's x positions, in meters. */
export function gridX(C = DERBY_CONFIG) {
    return C.workshop.grid.map((g) => g * IN);
}

/**
 * Whether grid point `i` is held by an axle slot: it is an end of a span of
 * the line that reaches the slot, or sits in it.
 */
export function isLocked(i, C = DERBY_CONFIG) {
    const xs = gridX(C);
    const reach = C.workshop.slot * IN;
    for (const axle of [C.kit.frontAxle, C.kit.rearAxle]) {
        const a = axle - reach;
        const b = axle + reach;
        if (xs[i] >= a && xs[i] <= b) return true;
        if (i > 0 && xs[i - 1] < b && xs[i] > a) return true;
        if (i < xs.length - 1 && xs[i] < b && xs[i + 1] > a) return true;
    }
    return false;
}

/**
 * The limits of each point, from the block, the slots and the least
 * thickness, before its neighbors are counted: { locked, top: [min, max],
 * bottom: [min, max], width: [min, max] }.
 */
export function limitsOf(i, C = DERBY_CONFIG) {
    const K = C.kit;
    const W = C.workshop;
    const t = W.minThickness * IN;
    if (isLocked(i, C)) {
        return { locked: true, top: [W.axleWood * IN, K.height], bottom: [0, 0], width: [K.width, K.width] };
    }
    return { locked: false, top: [t, K.height], bottom: [0, K.height - t], width: [W.minWidth * IN, K.width] };
}

/** Every point inside its limits and its neighbors: bottoms first, then
 *  each top raised clear of the bottoms either side of it. */
export function clampCarve(carve, C = DERBY_CONFIG) {
    const n = C.workshop.grid.length;
    const t = C.workshop.minThickness * IN;
    const bottom = [];
    const width = [];
    for (let i = 0; i < n; i++) {
        const L = limitsOf(i, C);
        bottom.push(clamp(carve.bottom[i], L.bottom[0], L.bottom[1]));
        width.push(clamp(carve.width[i], L.width[0], L.width[1]));
    }
    const top = [];
    for (let i = 0; i < n; i++) {
        const L = limitsOf(i, C);
        let floor = bottom[i];
        if (i > 0) floor = hi(floor, bottom[i - 1]);
        if (i < n - 1) floor = hi(floor, bottom[i + 1]);
        top.push(clamp(carve.top[i], hi(L.top[0], floor + t), L.top[1]));
    }
    return { top, bottom, width };
}

/** Whether a stored carve has the right shape (and numbers) to be one. */
export function isCarve(raw, C = DERBY_CONFIG) {
    const n = C.workshop.grid.length;
    if (!raw || typeof raw !== 'object') return false;
    for (const k of ['top', 'bottom', 'width']) {
        const a = raw[k];
        if (!Array.isArray(a) || a.length !== n) return false;
        for (const v of a) if (typeof v !== 'number' || !(v === v) || v === Infinity || v === -Infinity) return false;
    }
    return true;
}

/** The line a car already has, read at the grid and held to the limits: a
 *  starting design (or an earlier cut) is where the pencil starts. */
export function carveFrom(stations, C = DERBY_CONFIG) {
    const top = [];
    const bottom = [];
    const width = [];
    for (const x of gridX(C)) {
        const [b, t, w] = profileAt(stations, x);
        top.push(t);
        bottom.push(b);
        width.push(w);
    }
    return clampCarve({ top, bottom, width }, C);
}

/**
 * Move one point (`edge` 'top', 'bottom' or 'width', point `i`) to `value`,
 * held inside its limits and its neighbors: a top no lower than the least
 * thickness above the bottoms either side, a bottom no higher than the
 * least thickness under the tops either side. The other points stay put.
 */
export function setPoint(carve, edge, i, value, C = DERBY_CONFIG) {
    const n = C.workshop.grid.length;
    const t = C.workshop.minThickness * IN;
    const L = limitsOf(i, C);
    let v = clamp(value, L[edge][0], L[edge][1]);
    if (edge === 'top') {
        let floor = carve.bottom[i];
        if (i > 0) floor = hi(floor, carve.bottom[i - 1]);
        if (i < n - 1) floor = hi(floor, carve.bottom[i + 1]);
        v = clamp(v, hi(L.top[0], floor + t), L.top[1]);
    } else if (edge === 'bottom') {
        let ceiling = carve.top[i];
        if (i > 0) ceiling = lo(ceiling, carve.top[i - 1]);
        if (i < n - 1) ceiling = lo(ceiling, carve.top[i + 1]);
        v = clamp(v, L.bottom[0], lo(L.bottom[1], ceiling - t));
    }
    const next = { top: carve.top.slice(), bottom: carve.bottom.slice(), width: carve.width.slice() };
    next[edge][i] = v;
    return next;
}

/** The slopes of the monotone cubic through equally spaced `ys` (spacing
 *  `h`): zero at a peak, a valley or a flat, the harmonic mean of the two
 *  spans' slopes elsewhere (never more than twice the smaller), and each
 *  end's own span's slope. That keeps each span between its two ends. */
function slopes(ys, h) {
    const n = ys.length;
    const d = [];
    for (let k = 0; k < n - 1; k++) d.push((ys[k + 1] - ys[k]) / h);
    const m = [d[0]];
    for (let k = 1; k < n - 1; k++) {
        m.push(d[k - 1] * d[k] <= 0 ? 0 : 2 / (1 / d[k - 1] + 1 / d[k]));
    }
    m.push(d[n - 2]);
    return m;
}

/** The curve through equally spaced points, read at `x`. */
export function curveAt(xs, ys, m, x) {
    const n = xs.length;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let k = 0;
    while (k < n - 2 && x > xs[k + 1]) k++;
    const h = xs[k + 1] - xs[k];
    const s = (x - xs[k]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[k] + (s3 - 2 * s2 + s) * h * m[k] + (-2 * s3 + 3 * s2) * ys[k + 1] + (s3 - s2) * h * m[k + 1];
}

/** Read a carve's three curves anywhere: { top(x), bottom(x), width(x) }. */
export function curvesOf(carve, C = DERBY_CONFIG) {
    const xs = gridX(C);
    const h = xs[1] - xs[0];
    const make = (ys) => {
        const m = slopes(ys, h);
        return (x) => curveAt(xs, ys, m, x);
    };
    return { top: make(carve.top), bottom: make(carve.bottom), width: make(carve.width) };
}

/**
 * The car a carve cuts: stations every `workshop.sample` from the nose to
 * the tail, [x, bottom, top, width], the rows car.js weighs.
 */
export function stationsFrom(carve, C = DERBY_CONFIG) {
    const c = curvesOf(carve, C);
    const step = C.workshop.sample * IN;
    const n = Math.round(C.kit.length / step);
    const out = [];
    for (let k = 0; k <= n; k++) {
        const x = k === n ? C.kit.length : k * step;
        const b = c.bottom(x);
        out.push([x, b, hi(c.top(x), b), c.width(x)]);
    }
    return out;
}

/** Whether two carves are the same line (to a hundredth of a millimeter). */
export function sameCarve(a, b) {
    if (!a || !b) return false;
    for (const k of ['top', 'bottom', 'width']) {
        for (let i = 0; i < a[k].length; i++) {
            const d = a[k][i] - b[k][i];
            if (d > 1e-5 || d < -1e-5) return false;
        }
    }
    return true;
}

/** A point's value one key press along: `steps` of the small or big step,
 *  up (positive) or down. */
export function nudge(value, steps, big, C = DERBY_CONFIG) {
    return value + steps * (big ? C.workshop.bigStep : C.workshop.step) * IN;
}
