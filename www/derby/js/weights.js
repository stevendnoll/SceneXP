// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * weights.js - the pockets along a car and the weights in them (M3, PRD
 * Weights): where a builder can drill, how much tungsten each pocket holds,
 * placing and taking out a weight by hand, and Auto-weigh into the pockets.
 *
 * A POCKET HOLDS STACKS. It is a row of drilled holes across the body, as
 * many as its width takes, and tungsten goes into each piece on piece, each
 * taking its `depth`, above a floor of wood left under it. So a deep, wide
 * body holds more than a thin one, and a pocket at a wedge's sharp nose
 * holds nothing (config bench.pockets). An Outlaw car may stack its tungsten proud
 * of the body, since nothing on its sheet forbids it. Zinc strips stick on
 * underneath, a couple to a spot. Putty, the last few hundredths, is Auto-
 * weigh's alone.
 *
 * A WEIGHT IS IN A POCKET by where it sits: a build's weights are plain
 * { kind, x, mass? } (car.js), and a weight at a pocket's x is in that
 * pocket. So car.js weighs exactly what this file placed, and a build stays
 * plain data.
 *
 * AUTO-WEIGH HERE places every piece in a real pocket, one at a time, each
 * where it brings the car's balance closest to the asked-for point. car.js
 * has its own autoWeigh, all at one spot, which the neighbors' cars are
 * built with (D13) and which stays as it was, so their golden times do too.
 *
 * PURE.
 */

import { DERBY_CONFIG, IN, OZ } from './config.min.js';
import { describeCar, profileAt, weightMass } from './car.min.js';

/** A weight this close to a pocket's x is in it. */
const NEAR = 0.05 * IN;
const EPS = 1e-12;

/** How deep a piece of `kind` sits in a pocket (meters), or 0 for one that
 *  takes no depth (a strip underneath, putty pressed in). */
export function depthOf(kind, C = DERBY_CONFIG) {
    const d = C.bench.pockets.depth[kind];
    return typeof d === 'number' ? d * IN : 0;
}

/**
 * The pockets along a build and what is in each: { spots, loose }. Each spot
 * is { index, x, inches, wood (the body's height there), across (its holes
 * side by side), room (the depth one hole can take inside the wood), deep
 * (that, plus the Outlaw's proud stack), budget (every hole's deep), used,
 * pieces, strips, putty }. `loose` holds any weight that is in no
 * pocket (a car weighed by car.js's autoWeigh, say).
 */
export function pocketsOf(build, C = DERBY_CONFIG) {
    const P = C.bench.pockets;
    const outlaw = build.rules === 'outlaw';
    const spots = P.at.map((inches, index) => {
        const x = inches * IN;
        const [bottom, top, width] = profileAt(build.stations, x);
        const wood = top - bottom > 0 && width > 0 ? top - bottom : 0;
        const across = wood > 0 ? Math.max(1, Math.floor((width + P.wall * IN) / ((P.diameter + P.wall) * IN))) : 0;
        const room = Math.max(0, wood - P.floor * IN);
        // How deep one hole's stack can go: inside the wood, or proud of it.
        const deep = room > 0 ? room + (outlaw ? P.proud * IN : 0) : 0;
        return { index, x, inches, wood, across, room, deep, budget: across * deep, used: 0, pieces: [], strips: 0, putty: 0 };
    });
    const loose = [];
    for (const w of build.weights || []) {
        const spot = spotAt(spots, w.x);
        if (!spot) {
            loose.push(w);
            continue;
        }
        spot.pieces.push(w);
        if (w.kind === 'strip') spot.strips++;
        else if (w.kind === 'putty') spot.putty += weightMass(w, C);
        else spot.used += depthOf(w.kind, C);
    }
    return { spots, loose };
}

function spotAt(spots, x) {
    for (const s of spots) if (Math.abs(s.x - x) <= NEAR) return s;
    return null;
}

/** Whether a spot can take one more piece of `kind`: 'ok', 'no-wood',
 *  'full', or 'unknown' for a kind that does not exist. */
export function fitOf(spot, kind, C = DERBY_CONFIG) {
    if (!C.weights[kind]) return 'unknown';
    if (spot.wood <= 0) return 'no-wood';
    if (kind === 'strip') return spot.strips < C.bench.pockets.strips ? 'ok' : 'full';
    if (kind === 'putty') return 'ok';
    const d = depthOf(kind, C);
    if (spot.deep < d - EPS) return 'no-wood';
    return spot.used + d <= spot.budget + EPS ? 'ok' : 'full';
}

/** Whether any hole at a spot is deep enough for a piece of tungsten. */
export function holdsTungsten(spot, C = DERBY_CONFIG) {
    return spot.deep >= Math.min(depthOf('cylinder', C), depthOf('cube', C)) - EPS;
}

/** How many more cylinders a spot can take, for its label: none where no
 *  one hole is deep enough, however many shallow ones there are. */
export function roomLeft(spot, C = DERBY_CONFIG) {
    const d = depthOf('cylinder', C);
    if (spot.deep < d - EPS) return 0;
    return Math.max(0, Math.floor((spot.budget - spot.used + EPS) / d));
}

/** Place one piece of `kind` in pocket `index` by hand. Returns the new
 *  weights, or null with the reason ({ weights: null, why }). */
export function addWeight(build, index, kind, C = DERBY_CONFIG) {
    const { spots } = pocketsOf(build, C);
    const spot = spots[index];
    if (!spot) return { weights: null, why: 'unknown' };
    if (kind === 'putty') return { weights: null, why: 'unknown' };
    const why = fitOf(spot, kind, C);
    if (why !== 'ok') return { weights: null, why };
    return { weights: (build.weights || []).concat([{ kind, x: spot.x }]), why: 'ok' };
}

/** Take the last piece placed in pocket `index` back out. Returns the new
 *  weights, or null when the pocket is empty. */
export function removeWeight(build, index, C = DERBY_CONFIG) {
    const spot = pocketsOf(build, C).spots[index];
    if (!spot || !spot.pieces.length) return null;
    const last = spot.pieces[spot.pieces.length - 1];
    const weights = (build.weights || []).slice();
    weights.splice(weights.lastIndexOf(last), 1);
    return weights;
}

/**
 * A build's weights placed again in its pockets after its shape or class
 * changed, in the order they went in: what still fits stays, the rest come
 * out (and so do any loose weights, which no pocket shows). Returns
 * { weights, dropped }.
 */
export function fitWeights(build, C = DERBY_CONFIG) {
    const empty = pocketsOf({ ...build, weights: [] }, C);
    const kept = [];
    let dropped = 0;
    for (const w of build.weights || []) {
        const spot = spotAt(empty.spots, w.x);
        if (!spot || fitOf(spot, w.kind, C) !== 'ok') {
            dropped++;
            continue;
        }
        if (w.kind === 'strip') spot.strips++;
        else if (w.kind !== 'putty') spot.used += depthOf(w.kind, C);
        kept.push(w);
    }
    return { weights: kept, dropped };
}

/**
 * Auto-weigh into the pockets (PRD, Weights): the weights that bring a build
 * to `mass` ounces with its balance point `balance` inches in front of the
 * rear axle. Tungsten cylinders first, then a cube, a zinc strip and a lump
 * of putty for the last hundredths, as car.js's autoWeigh chooses them,
 * each placed in whichever pocket that can take it brings the balance
 * closest to the mark. A body that cannot reach the mark, or hold the
 * weight, comes as close as it can. Replaces any weights the build had.
 */
export function autoWeighPockets(build, { mass, balance }, C = DERBY_CONFIG) {
    const K = C.kit;
    const W = C.weights;
    const bare = describeCar({ ...build, weights: [] }, C);
    const target = mass * OZ;
    if (target <= bare.mass + EPS) return [];
    const want = K.rearAxle - balance * IN;
    // What a piece really adds, its pocket's wood taken back out.
    const net = (kind, m) => (W[kind].pocket ? m - (m / W[kind].density) * K.woodDensity : m);
    const { spots } = pocketsOf({ ...build, weights: [] }, C);
    let M = bare.mass;
    let moment = bare.mass * bare.comX;
    const out = [];
    const place = (kind, m) => {
        const n = net(kind, m);
        let best = null;
        let err = Infinity;
        for (const s of spots) {
            if (fitOf(s, kind, C) !== 'ok') continue;
            const e = Math.abs((moment + n * s.x) / (M + n) - want);
            if (e < err - EPS) {
                best = s;
                err = e;
            }
        }
        if (!best) return false;
        if (kind === 'strip') best.strips++;
        else if (kind !== 'putty') best.used += depthOf(kind, C);
        M += n;
        moment += n * best.x;
        out.push(kind === 'putty' ? { kind, x: best.x, mass: m } : { kind, x: best.x });
        return true;
    };
    let need = target - M;
    for (const kind of ['cylinder', 'cube', 'strip']) {
        const each = net(kind, W[kind].mass);
        while (need >= each - EPS && place(kind, W[kind].mass)) need -= each;
    }
    if (need > 1e-9) place('putty', need < W.putty.mass ? need : W.putty.mass);
    return out;
}

/**
 * The balance a build would have with every weight it carries moved to its
 * rearmost pocket that holds tungsten: the furthest back its weight can go.
 * A body whose best is still well in front of the sweet spot is too bulky
 * for rear weight (M4.6, PRD A lesson the model found on its own): its own
 * wood holds the balance forward. Meters in front of the rear axle.
 */
export function bestBalance(build, C = DERBY_CONFIG) {
    const { spots } = pocketsOf({ ...build, weights: [] }, C);
    let rear = null;
    for (const s of spots) if (holdsTungsten(s, C)) rear = s;
    const x = rear ? rear.x : C.kit.rearAxle;
    return describeCar({ ...build, weights: (build.weights || []).map((w) => ({ ...w, x })) }, C).balance;
}

/** The weight Auto-weigh aims for: the car's own sheet's limit, in ounces. */
export function autoTarget(rules, C = DERBY_CONFIG) {
    const R = C.rules[rules] || C.rules.standard;
    return { mass: Math.round((R.maxMass / OZ) * 100) / 100, balance: C.bench.autoBalance };
}
