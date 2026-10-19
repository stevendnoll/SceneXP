// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * car.js - a derby car from its build: the body's volume and balance from
 * its side profile, its mass with the wheels, axles, paint and weights, the
 * drag its shape costs, the friction its axles have left after the tune-ups,
 * the rule sheet's checks, and Auto-weigh.
 *
 * A BUILD is plain data, the shape the workshop saves (PRD, Saving):
 *
 *   { rules: 'standard' | 'outlaw',
 *     stations: [[x, bottom, top, width], ...],   // meters, nose to tail
 *     weights: [{ kind, x, mass? }, ...],         // x from the nose
 *     tune: { deburr, polish, graphite, align, sand } }
 *
 * The side profile is a list of stations along the car, linearly joined, as
 * a builder draws it on the block (PRD, Shaping the body). Every quantity
 * here comes out of that profile, so the starting designs, the neighbors'
 * cars and a visitor's own carving are all the same kind of thing.
 *
 * A CAR is what the sim needs, in SI units: mass, the rotating mass of the
 * wheels, where the center of mass sits, the drag area, and the friction
 * coefficients, plus the dimensions the rule sheet checks.
 *
 * PURE, and only + - * / and sqrt anywhere (PRD, Determinism), so a build
 * weighs and runs the same in every browser.
 */

import { DERBY_CONFIG, IN, OZ } from './config.min.js';

/** The profile at `x` from the nose: linearly between the stations, the end
 *  station's beyond them. Returns [bottom, top, width]. */
export function profileAt(stations, x) {
    if (x <= stations[0][0]) return [stations[0][1], stations[0][2], stations[0][3]];
    for (let i = 1; i < stations.length; i++) {
        const b = stations[i];
        if (x <= b[0]) {
            const a = stations[i - 1];
            const f = b[0] > a[0] ? (x - a[0]) / (b[0] - a[0]) : 1;
            return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
        }
    }
    const z = stations[stations.length - 1];
    return [z[1], z[2], z[3]];
}

/** The cross-section's area at `x` (zero where the profile pinches shut). */
export function areaAt(stations, x) {
    const [bottom, top, width] = profileAt(stations, x);
    const h = top - bottom;
    return h > 0 && width > 0 ? h * width : 0;
}

/**
 * The body alone, integrated over `slices` slices of the block's length:
 * its volume, the x of its centroid, its largest cross-section (the frontal
 * area air meets), its tallest top, widest width and lowest bottom, and how
 * blunt its nose and tail are (the area there over the largest, 0 to 1).
 */
export function bodyOf(stations, C = DERBY_CONFIG) {
    const L = C.kit.length;
    const n = C.physics.slices;
    const dx = L / n;
    let volume = 0;
    let moment = 0;
    let maxArea = 0;
    let top = 0;
    let width = 0;
    let bottom = Infinity;
    for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * dx;
        const a = areaAt(stations, x);
        volume += a * dx;
        moment += a * dx * x;
        if (a > maxArea) maxArea = a;
        const [b, t, w] = profileAt(stations, x);
        if (a > 0) {
            if (t > top) top = t;
            if (w > width) width = w;
            if (b < bottom) bottom = b;
        }
    }
    const D = C.physics.drag;
    return {
        volume,
        centroidX: volume > 0 ? moment / volume : L / 2,
        frontalArea: maxArea,
        top,
        width,
        bottom: bottom === Infinity ? 0 : bottom,
        nose: maxArea > 0 ? areaAt(stations, D.noseAt * L) / maxArea : 1,
        tail: maxArea > 0 ? areaAt(stations, D.tailAt * L) / maxArea : 1
    };
}

/** A weight's mass: its kind's, or its own for putty. */
export function weightMass(w, C = DERBY_CONFIG) {
    const kind = C.weights[w.kind];
    if (!kind) return 0;
    return typeof w.mass === 'number' && w.mass >= 0 ? (w.mass < kind.mass ? w.mass : kind.mass) : kind.mass;
}

/** The axle friction coefficient left after the tune-ups. */
export function axleFrictionOf(tune, C = DERBY_CONFIG) {
    const A = C.physics.axleFriction;
    const t = tune || C.stockTune;
    let mu = A.stock;
    if (t.deburr) mu *= A.deburred;
    const steps = t.polish > 0 ? (t.polish < A.polish.length ? t.polish : A.polish.length) : 0;
    for (let i = 0; i < steps; i++) mu *= A.polish[i];
    if (t.graphite) mu *= A.graphite;
    return mu;
}

/** The drag coefficient of a body's shape, after sanding. */
export function dragCoefficientOf(body, sand, C = DERBY_CONFIG) {
    const D = C.physics.drag;
    const blunt = D.noseWeight * body.nose + (1 - D.noseWeight) * body.tail;
    const s = sand > 0 ? (sand < 1 ? sand : 1) : 0;
    return (D.teardrop + (D.block - D.teardrop) * blunt) * (1 - D.sanding * s);
}

/**
 * The physical car a build makes. Mass and balance count the body (less the
 * wood each tungsten pocket took out), the paint over it, the four wheels
 * and axles at their slots, and every weight. `balance` is how far the
 * center of mass sits in front of the rear axle, the number every derby
 * builder watches.
 */
export function describeCar(build, C = DERBY_CONFIG) {
    const K = C.kit;
    const body = bodyOf(build.stations, C);
    let mass = 0;
    let moment = 0;
    const add = (m, x) => {
        mass += m;
        moment += m * x;
    };
    add(body.volume * K.woodDensity, body.centroidX);
    add(K.paintMass, body.centroidX);
    const wheelSet = 2 * (K.wheel.mass + K.axle.mass);
    add(wheelSet, K.frontAxle);
    add(wheelSet, K.rearAxle);
    let ballast = 0;
    for (const w of build.weights || []) {
        const kind = C.weights[w.kind];
        if (!kind) continue;
        const m = weightMass(w, C);
        add(m, w.x);
        ballast += m;
        // The pocket the tungsten sits in was wood.
        if (kind.pocket) add(-(m / kind.density) * K.woodDensity, w.x);
    }
    const comX = mass > 0 ? moment / mass : K.length / 2;
    const tune = { ...C.stockTune, ...(build.tune || {}) };
    const D = C.physics.drag;
    const R = C.physics.sideRub;
    const wheelGap = Math.min(profileAt(build.stations, K.frontAxle)[2], profileAt(build.stations, K.rearAxle)[2]);
    const wheelsOut = 2 * (K.wheel.thickness + 0.04 * IN);
    const clearance = K.wheel.radius - K.axleHeight + body.bottom;
    return {
        rules: build.rules === 'outlaw' ? 'outlaw' : 'standard',
        mass,
        ballast,
        // Each wheel spins as it rolls: I over r squared is k times its mass.
        rotatingMass: 4 * K.wheel.inertiaK * K.wheel.mass,
        comX,
        balance: K.rearAxle - comX,
        frontAxle: K.frontAxle,
        rearAxle: K.rearAxle,
        axleMu: axleFrictionOf(tune, C),
        axleRatio: K.axle.radius / K.wheel.radius,
        sideRub: tune.align ? R.aligned : R.misaligned,
        cdA: dragCoefficientOf(body, tune.sand, C) * body.frontalArea + D.wheelCd * D.wheelArea,
        tune,
        body,
        dims: {
            length: K.length,
            width: (body.width > wheelGap + wheelsOut ? body.width : wheelGap + wheelsOut),
            height: clearance + body.top,
            clearance,
            wheelGap
        }
    };
}

/** A figure as the scale or the gauge shows it: ounces to two places,
 *  inches to three. */
const shown = (value, unit, places) => {
    const p = places === 2 ? 100 : 1000;
    return Math.round((value / unit) * p) / p;
};

/**
 * The rule sheet's checks on a car, each { rule, ok, value, limit } in the
 * sheet's own units (ounces and inches), judged on the figure the scale or
 * gauge would show. `rules` is a sheet name, or the car's own by default.
 */
export function checkRules(car, rules = car.rules, C = DERBY_CONFIG) {
    const R = C.rules[rules] || C.rules.standard;
    const d = car.dims;
    const checks = [
        { rule: 'mass', value: shown(car.mass, OZ, 2), limit: shown(R.maxMass, OZ, 2), max: true },
        { rule: 'length', value: shown(d.length, IN, 3), limit: shown(R.maxLength, IN, 3), max: true },
        { rule: 'width', value: shown(d.width, IN, 3), limit: shown(R.maxWidth, IN, 3), max: true },
        { rule: 'wheelGap', value: shown(d.wheelGap, IN, 3), limit: shown(R.minWheelGap, IN, 3), max: false },
        { rule: 'clearance', value: shown(d.clearance, IN, 3), limit: shown(R.minClearance, IN, 3), max: false }
    ];
    return checks.map(({ rule, value, limit, max }) => ({ rule, value, limit, ok: max ? value <= limit : value >= limit }));
}

/** Whether a car passes every check of a sheet. */
export function isLegal(car, rules = car.rules, C = DERBY_CONFIG) {
    return checkRules(car, rules, C).every((c) => c.ok);
}

/**
 * Auto-weigh (PRD, Weights): the weights that bring a build to `mass`
 * ounces with its balance point `balance` inches in front of the rear axle.
 * Tungsten cylinders first, then cubes, a zinc strip, and putty for the
 * last hundredths, all at one spot along the car (the scene spreads them
 * about it for the eye). The spot stays on the body, so a balance the
 * body cannot reach comes as close as it can. Replaces any weights the
 * build had. Returns the weights.
 */
export function autoWeigh(build, { mass, balance }, C = DERBY_CONFIG) {
    const K = C.kit;
    const bare = describeCar({ ...build, weights: [] }, C);
    const target = mass * OZ;
    if (target <= bare.mass) return [];
    const W = C.weights;
    // What a piece really adds, its pocket's wood taken back out.
    const net = (kind, m) => (W[kind].pocket ? m - (m / W[kind].density) * K.woodDensity : m);
    const pieces = [];
    let need = target - bare.mass;
    for (const kind of ['cylinder', 'cube', 'strip']) {
        const each = net(kind, W[kind].mass);
        while (need >= each - 1e-12) {
            pieces.push({ kind });
            need -= each;
        }
    }
    if (need > 1e-9) pieces.push({ kind: 'putty', mass: need < W.putty.mass ? need : W.putty.mass });
    let added = 0;
    for (const p of pieces) added += net(p.kind, weightMass(p, C));
    const want = K.rearAxle - balance * IN;
    let x = ((bare.mass + added) * want - bare.mass * bare.comX) / added;
    const lo = 0.3 * IN;
    const hi = K.length - 0.3 * IN;
    if (x < lo) x = lo;
    if (x > hi) x = hi;
    return pieces.map((p) => ({ ...p, x }));
}

/** A build from one of the starting designs, weighed if asked. */
export function buildFromDesign(designId, { rules = 'standard', tune = null, ballast = null } = {}, C = DERBY_CONFIG) {
    const design = C.designs[designId] || C.designs.block;
    const build = { rules, stations: design.stations.map((s) => [...s]), weights: [], tune: { ...C.stockTune, ...(tune || {}) } };
    if (ballast) build.weights = autoWeigh(build, ballast, C);
    return build;
}

/** A neighbor's car (config `field`), built and weighed as its entry says. */
export function buildFromField(entry, C = DERBY_CONFIG) {
    return buildFromDesign(entry.design, { tune: entry.tune, ballast: entry.ballast }, C);
}
