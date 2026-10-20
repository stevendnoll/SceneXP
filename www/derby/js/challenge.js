// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * challenge.js - challenge links (M8, Steve 2026-10-20: "the best way to
 * share the Derby Day game with friends... it makes it personal").
 *
 * THE CAR TRAVELS IN THE LINK. "Challenge a friend" makes a link whose
 * fragment holds the visitor's car and, if they typed one, their first name:
 *
 *   https://scenexp.com/derby/#challenge=1.<base64url of a compact JSON>
 *
 * The friend's browser decodes it and races its own car against that one,
 * head to head, four heats, every car in every lane. No server is needed: a
 * browser never sends a URL's fragment anywhere, so the car and the name are
 * never in a request, a log or a referrer, and nothing is stored but what
 * the friend chooses to keep. The sim is deterministic (only + - * / sqrt),
 * so the challenger's car posts the same times on every device: "beat my
 * 3.191" is honest.
 *
 * A LINK IS UNTRUSTED INPUT. Anyone can write one by hand. So a link is
 * capped in length before it is decoded at all, decoded inside a try, and
 * every field goes through the garage's own `normalizeBuild` (clamped to the
 * block, unknown fields dropped), then the car must be legal under its own
 * sheet. Names lose control and direction-changing characters and are cut
 * short, and are only ever set with textContent. A link carries a car, never
 * a time: times are always the friend's browser's own.
 *
 * EXACT, THEN COMPACT. Every number goes as it is, never rounded: a car
 * rounded to a tenth of a millimeter runs a few microseconds differently,
 * and a board that reads to the thousandth could then show the friend a
 * different time from the one the challenger saw. Kinds are kept as their
 * names (so a config reordered later cannot change what an old link
 * means), keys are one letter, a stack of identical weights goes as one
 * entry with a count, and a car on Auto-weigh sends no weights at all when
 * Auto-weigh would place them exactly so again on arrival. A stock car is
 * about 200 characters, a carved and decorated one about 700, and 900
 * with its weights placed by hand.
 *
 * PURE: no DOM, no three.js.
 */

import { DERBY_CONFIG } from './config.min.js';
import { normalizeBuild, weighAuto, cleanFrom, FROM_MAX } from './garage.min.js';
import { describeCar, isLegal } from './car.min.js';
import { neutralTime } from './sim.min.js';

export const CHALLENGE = Object.freeze({
    key: 'challenge',
    version: 1,
    /** No link longer than this is decoded at all (a car is ~400). */
    maxLength: 4000,
    /** The challenger's name, at most this many characters. */
    fromMax: FROM_MAX,
    /** The rival's id in a race (garage ids are 4 to 16 of [a-z0-9]). */
    rivalId: 'rival'
});

const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : NaN);

/** The challenger's first name, cleaned as the garage keeps it (control
 *  and direction-changing characters gone, at most FROM_MAX). */
export { cleanFrom };

/** A build as the link carries it. */
export function packBuild(b, C = DERBY_CONFIG) {
    const design = C.designs[b.design];
    const sameStations = !b.carve && design && JSON.stringify(design.stations) === JSON.stringify(b.stations);
    // Auto-weigh's own placing, if that is exactly where the weights are.
    const auto = b.ballast === 'auto' && JSON.stringify(weighAuto(b, C).weights) === JSON.stringify(b.weights);
    return {
        d: b.design,
        r: b.rules === 'outlaw' ? 1 : 0,
        c: b.carve ? [b.carve.top, b.carve.bottom, b.carve.width] : 0,
        s: b.carve || sameStations ? 0 : b.stations,
        b: b.ballast === 'hand' ? 1 : 0,
        w: auto ? 0 : packWeights(b.weights),
        t: [b.tune.deburr ? 1 : 0, b.tune.polish, b.tune.graphite ? 1 : 0, b.tune.align ? 1 : 0, b.tune.sand],
        p: [b.paint.body, b.paint.stripe === null ? -1 : b.paint.stripe, b.paint.finish],
        k: b.decals.map((d) => [d.kind, d.x, d.y, d.size]),
        n: b.name || '',
        u: b.number === null ? -1 : b.number
    };
}

/** Weights as [kind, x, count] (and a putty's mass), a stack one entry. */
function packWeights(weights) {
    const out = [];
    for (const w of weights) {
        const last = out[out.length - 1];
        if (last && w.kind !== 'putty' && last[0] === w.kind && last[1] === w.x && last.length === 3) last[2]++;
        else out.push(w.kind === 'putty' ? [w.kind, w.x, 1, w.mass] : [w.kind, w.x, 1]);
    }
    return out;
}

/** A packed build back to a raw one, for normalizeBuild to make valid. */
export function unpackBuild(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const arr = (v) => (Array.isArray(v) ? v : []);
    const nums = (v) => arr(v).map(num);
    const t = arr(o.t);
    const p = arr(o.p);
    const carve = Array.isArray(o.c) ? { top: nums(o.c[0]), bottom: nums(o.c[1]), width: nums(o.c[2]) } : null;
    return {
        id: CHALLENGE.rivalId,
        design: o.d,
        rules: o.r === 1 ? 'outlaw' : 'standard',
        carve,
        stations: Array.isArray(o.s) ? arr(o.s).map(nums) : undefined,
        ballast: o.b === 1 ? 'hand' : 'auto',
        // Weights to place again (Auto-weigh's) when none came.
        reweigh: !Array.isArray(o.w),
        weights: unpackWeights(o.w),
        tune: { deburr: t[0] === 1, polish: t[1], graphite: t[2] === 1, align: t[3] === 1, sand: num(t[4]) },
        paint: { body: p[0], stripe: p[1] === -1 ? null : p[1], finish: p[2] },
        decals: arr(o.k).map((d) => {
            const a = arr(d);
            return { kind: a[0], x: num(a[1]), y: num(a[2]), size: a[3] };
        }),
        name: typeof o.n === 'string' ? o.n : '',
        number: o.u
    };
}

/** Packed weights back to one entry a piece. A count is capped, so a
 *  hand-written link cannot ask for a million weights. */
function unpackWeights(raw) {
    const out = [];
    for (const w of Array.isArray(raw) ? raw : []) {
        const a = Array.isArray(w) ? w : [];
        const count = Number.isInteger(a[2]) ? Math.max(0, Math.min(a[2], 128)) : 0;
        for (let i = 0; i < count && out.length < 128; i++) {
            out.push(a[0] === 'putty' ? { kind: a[0], x: num(a[1]), mass: num(a[3]) } : { kind: a[0], x: num(a[1]) });
        }
    }
    return out;
}

function toBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** The fragment a challenge goes in (without the '#'). */
export function encodeChallenge(build, from = '', C = DERBY_CONFIG) {
    const body = { car: packBuild(build, C) };
    const name = cleanFrom(from);
    if (name) body.from = name;
    return `${CHALLENGE.key}=${CHALLENGE.version}.${toBase64Url(JSON.stringify(body))}`;
}

/** The whole link: the page's own address (no query, no fragment) and the
 *  challenge. `base` is location.href or any URL of the page. */
export function challengeUrl(base, build, from = '', C = DERBY_CONFIG) {
    const u = new URL(base);
    u.search = '';
    u.hash = encodeChallenge(build, from, C);
    return u.href;
}

/** Whether a fragment (with or without its '#') is a challenge at all,
 *  before any of it is decoded. */
export function isChallenge(hash) {
    return typeof hash === 'string' && hash.replace(/^#/, '').startsWith(`${CHALLENGE.key}=`);
}

/**
 * A challenge from a fragment: { build, from } with the build valid and
 * legal, or null for anything that is not one (or not one this page can
 * trust). Never throws.
 */
export function decodeChallenge(hash, C = DERBY_CONFIG) {
    if (!isChallenge(hash)) return null;
    const text = hash.replace(/^#/, '');
    if (text.length > CHALLENGE.maxLength) return null;
    const m = /^challenge=1\.([A-Za-z0-9_-]+)$/.exec(text);
    if (!m) return null;
    let body;
    try {
        body = JSON.parse(fromBase64Url(m[1]));
    } catch (e) {
        return null;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const raw = unpackBuild(body.car);
    if (!raw) return null;
    let build = normalizeBuild(raw, C, { rand: () => 0 });
    if (!build) return null;
    build = { ...build, id: CHALLENGE.rivalId };
    // No weights came: Auto-weigh places them again, exactly as it did on
    // the challenger's bench.
    if (raw.reweigh) build = { ...weighAuto(build, C), id: CHALLENGE.rivalId };
    const car = describeCar(build, C);
    if (!isLegal(car, build.rules, C)) return null;
    return { build, from: cleanFrom(body.from) };
}

/** How the rival is named on the board and by the announcer. */
export function rivalName(carName, from) {
    return from ? `${from}’s ${carName}` : carName;
}

/**
 * What made the difference between two cars (head to head): of the
 * winner's tune-ups the loser does not have, the one worth most on the
 * LOSER's own car (its lane-neutral time with that one step changed to the
 * winner's). Returns { id, level, worth } (seconds) or null when no tune-up
 * differs that way.
 */
export function biggestEdge(winner, loser, C = DERBY_CONFIG) {
    const base = neutralTime(describeCar(loser, C), C);
    let best = null;
    for (const id of ['deburr', 'polish', 'graphite', 'align', 'sand']) {
        const w = winner.tune[id];
        const l = loser.tune[id];
        const better = id === 'polish' || id === 'sand' ? w > l : w === true && l !== true;
        if (!better) continue;
        const worth = base - neutralTime(describeCar({ ...loser, tune: { ...loser.tune, [id]: w } }, C), C);
        if (worth > 0 && (!best || worth > best.worth)) best = { id, level: w, worth };
    }
    return best;
}
