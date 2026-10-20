// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * garage.js - the visitor's cars, kept in this browser (M3, D6): up to four
 * builds, the one on the bench, each car's best result in every event, the
 * last race, the trophies, and the settings (units, the sound).
 *
 * A BUILD IS PLAIN DATA (PLANNING, The data), versioned `v: 1`:
 *
 *   { v, id, name, number, design, rules, stations, plan, weights, ballast,
 *     tune, paint: { body, stripe, finish }, decals }
 *
 * `normalizeBuild` makes anything stored valid, field by field, clamped to
 * the block, the way cast.normalizeChoice does: a stale garage, a hand-
 * edited one, or (V1.1) a challenge link all come through it. A car's name
 * is the visitor's, so it is only ever set with textContent (board.js).
 *
 * THREE KEYS (PLANNING, The garage): `derby-garage` (the cars, the bench,
 * the results), `derby-settings`, `derby-trophies`. Every read and write is
 * wrapped, so a browser that refuses storage (a private window) still gets
 * a whole visit, simply not a remembered one. Disclosed in www/privacy.html,
 * whose test (tests/privacy.test.mjs) names this file as a writer.
 *
 * PURE apart from those storage calls.
 */

import { DERBY_CONFIG } from './config.min.js';
import { buildFromDesign, describeCar, isLegal } from './car.min.js';
import { autoWeighPockets, autoTarget } from './weights.min.js';
import { normalizeUnits } from './units.min.js';

export const KEYS = Object.freeze({ garage: 'derby-garage', settings: 'derby-settings', trophies: 'derby-trophies' });

/** The events a result or a trophy can be for. */
export const EVENT_IDS = Object.freeze(['easy', 'medium', 'hard', 'trial', 'outlaw']);
export const TROPHY_EVENTS = Object.freeze(['easy', 'medium', 'hard', 'outlaw']);

export const NAME_MAX = 24;
const MAX_STATIONS = 24;
const MAX_WEIGHTS = 128;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** A short random id for a car. */
export function newId(rand = Math.random) {
    let id = '';
    for (let i = 0; i < 10; i++) id += Math.floor(rand() * 36).toString(36);
    return id;
}

/** A car's name as typed: control characters out, trimmed, capped. */
export function cleanName(raw) {
    if (typeof raw !== 'string') return '';
    return raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
}

function normalizeStations(raw, C) {
    if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_STATIONS) return null;
    const K = C.kit;
    const out = [];
    let lastX = -1;
    for (const s of raw) {
        if (!Array.isArray(s) || s.length !== 4 || !s.every(isNum)) return null;
        const x = clamp(s[0], 0, K.length);
        if (x < lastX) return null;
        lastX = x;
        const bottom = clamp(s[1], 0, K.height);
        out.push([x, bottom, clamp(s[2], bottom, K.height), clamp(s[3], 0, K.width)]);
    }
    return out;
}

function normalizeWeights(raw, C) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const w of raw.slice(0, MAX_WEIGHTS)) {
        if (!w || typeof w !== 'object' || !Object.prototype.hasOwnProperty.call(C.weights, w.kind) || !isNum(w.x)) continue;
        const piece = { kind: w.kind, x: clamp(w.x, 0, C.kit.length) };
        if (w.kind === 'putty') piece.mass = isNum(w.mass) ? clamp(w.mass, 0, C.weights.putty.mass) : C.weights.putty.mass;
        out.push(piece);
    }
    return out;
}

const isColor = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffff;

/**
 * Any stored or decoded car made a valid build, or null when it is not a car
 * at all. Unknown fields are dropped, every number clamped, and a profile
 * that does not hold together falls back to its design's.
 */
export function normalizeBuild(raw, C = DERBY_CONFIG, { rand = Math.random } = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const design = C.bench.designs.includes(raw.design) ? raw.design : C.bench.designs[0];
    const t = raw.tune && typeof raw.tune === 'object' ? raw.tune : {};
    const p = raw.paint && typeof raw.paint === 'object' ? raw.paint : {};
    const first = C.paint.colors.find((c) => c.id === C.bench.newColors[0]) || C.paint.colors[0];
    return {
        v: 1,
        id: typeof raw.id === 'string' && /^[a-z0-9]{4,16}$/.test(raw.id) ? raw.id : newId(rand),
        name: cleanName(raw.name),
        number: Number.isInteger(raw.number) && raw.number >= 0 && raw.number <= 99 ? raw.number : null,
        design,
        rules: raw.rules === 'outlaw' ? 'outlaw' : 'standard',
        stations: normalizeStations(raw.stations, C) || C.designs[design].stations.map((s) => [...s]),
        // The top profile joins in M4 (PLANNING): none yet, full width.
        plan: null,
        weights: normalizeWeights(raw.weights, C),
        ballast: raw.ballast === 'hand' ? 'hand' : 'auto',
        tune: {
            deburr: t.deburr === true,
            polish: Number.isInteger(t.polish) ? clamp(t.polish, 0, C.physics.axleFriction.polish.length) : 0,
            graphite: t.graphite === true,
            align: t.align === true,
            sand: isNum(t.sand) ? clamp(t.sand, 0, 1) : 0
        },
        paint: {
            body: isColor(p.body) ? p.body : first.color,
            stripe: isColor(p.stripe) ? p.stripe : null,
            finish: Object.prototype.hasOwnProperty.call(C.paint.finishes, p.finish) ? p.finish : 'gloss'
        },
        // Decals arrive with the workshop (M4).
        decals: []
    };
}

/** Put the weights back where Auto-weigh would, for a car weighed by it. */
export function weighAuto(build, C = DERBY_CONFIG) {
    return { ...build, ballast: 'auto', weights: autoWeighPockets(build, autoTarget(build.rules, C), C) };
}

/**
 * A new car: a starting design (a wedge unless told), the next paint of the
 * new colors, the axles as they come, Auto-weighed (PRD, Time to first race:
 * legal and sensible from the first tap).
 */
export function newCar(C = DERBY_CONFIG, { design = C.bench.designs[0], index = 0, rand = Math.random } = {}) {
    const ids = C.bench.newColors;
    const color = C.paint.colors.find((c) => c.id === ids[index % ids.length]) || C.paint.colors[0];
    const base = buildFromDesign(design, {}, C);
    return weighAuto(normalizeBuild({ ...base, design, id: newId(rand), paint: { body: color.color, stripe: null, finish: 'gloss' } }, C, { rand }), C);
}

/**
 * Whether a car may enter an event (PRD, What a visitor can enter): 'ok',
 * 'illegal' (it fails its own sheet), 'outlawOnly' (an Outlaw car, in a
 * division) or 'standardOnly' (a Standard car, in the Outlaw exhibition).
 * Time Trial takes either class.
 */
export function canEnter(build, eventId, C = DERBY_CONFIG) {
    if (!isLegal(describeCar(build, C), build.rules, C)) return 'illegal';
    if (eventId === 'trial') return 'ok';
    if (eventId === 'outlaw') return build.rules === 'outlaw' ? 'ok' : 'standardOnly';
    return build.rules === 'outlaw' ? 'outlawOnly' : 'ok';
}

/** The palette's name for a color: its own, or the nearest one's. */
export function colorName(color, C = DERBY_CONFIG) {
    let best = C.paint.colors[0];
    let bestD = Infinity;
    for (const c of C.paint.colors) {
        const dr = ((c.color >> 16) & 255) - ((color >> 16) & 255);
        const dg = ((c.color >> 8) & 255) - ((color >> 8) & 255);
        const db = (c.color & 255) - (color & 255);
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) {
            best = c;
            bestD = d;
        }
    }
    return best.label;
}

/**
 * The name a car goes by: the visitor's own (M4), or its paint and shape
 * ("Blue Wedge"), with a number after it when an earlier car in the garage
 * already goes by that name.
 */
export function nameOf(build, cars = [], C = DERBY_CONFIG) {
    const plain = (b) => b.name || `${colorName(b.paint.body, C)} ${C.designs[b.design].label}`;
    const name = plain(build);
    const before = [];
    for (const c of cars) {
        if (c.id === build.id) break;
        before.push(c);
    }
    const same = before.filter((c) => plain(c) === name).length;
    return same ? `${name} ${same + 1}` : name;
}

function normalizeResult(raw) {
    if (!raw || typeof raw !== 'object' || !isNum(raw.average) || raw.average <= 0 || raw.average > 60) return null;
    const place = Number.isInteger(raw.place) && raw.place >= 1 && raw.place <= 4 ? raw.place : null;
    return { place, average: raw.average };
}

/** A result is better with a better place, then a faster average. */
export function isBetter(next, prev) {
    if (!prev) return true;
    if (next.place !== null && prev.place !== null && next.place !== prev.place) return next.place < prev.place;
    return next.average < prev.average;
}

/** A stored garage made valid: { v, cars, bench, results, last }, with at
 *  least one car on the bench. */
export function normalizeGarage(raw, C = DERBY_CONFIG, { rand = Math.random } = {}) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const cars = [];
    for (const c of Array.isArray(src.cars) ? src.cars : []) {
        if (cars.length >= C.bench.cars) break;
        const b = normalizeBuild(c, C, { rand });
        if (b && !cars.some((x) => x.id === b.id)) cars.push(b);
    }
    if (!cars.length) cars.push(newCar(C, { rand }));
    const bench = cars.some((c) => c.id === src.bench) ? src.bench : cars[0].id;
    const results = {};
    const rawResults = src.results && typeof src.results === 'object' ? src.results : {};
    for (const car of cars) {
        const r = rawResults[car.id];
        if (!r || typeof r !== 'object') continue;
        for (const e of EVENT_IDS) {
            const n = normalizeResult(r[e]);
            if (n) (results[car.id] ||= {})[e] = n;
        }
    }
    let last = null;
    const L = src.last;
    if (L && typeof L === 'object' && cars.some((c) => c.id === L.car) && EVENT_IDS.includes(L.event)) {
        const n = normalizeResult(L);
        if (n) last = { car: L.car, event: L.event, ...n };
    }
    return { v: 1, cars, bench, results, last };
}

export function normalizeSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return { units: normalizeUnits(src.units), sound: src.sound === true };
}

export function normalizeTrophies(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    for (const e of TROPHY_EVENTS) out[e] = typeof src[e] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(src[e]) ? src[e] : null;
    return out;
}

function read(key) {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
        return { raw: raw ? JSON.parse(raw) : null, found: Boolean(raw) };
    } catch (e) {
        return { raw: null, found: false };
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * The garage, loaded from this browser. `now` gives today's date for a
 * trophy. Returns the API main.js and bench.js use; every change is saved
 * at once.
 */
export function createGarage({ C = DERBY_CONFIG, now = () => new Date(), rand = Math.random } = {}) {
    const stored = read(KEYS.garage);
    let garage = normalizeGarage(stored.raw, C, { rand });
    let settings = normalizeSettings(read(KEYS.settings).raw);
    let trophies = normalizeTrophies(read(KEYS.trophies).raw);
    // A first visit: nothing kept yet, so the host introduces the car.
    const firstVisit = !stored.found;
    const saveGarage = () => write(KEYS.garage, garage);

    const api = {
        firstVisit,
        cars: () => garage.cars,
        bench: () => garage.cars.find((c) => c.id === garage.bench) || garage.cars[0],
        nameOf: (build) => nameOf(build, garage.cars, C),
        isFull: () => garage.cars.length >= C.bench.cars,
        setBench(id) {
            if (!garage.cars.some((c) => c.id === id)) return false;
            garage.bench = id;
            saveGarage();
            return true;
        },
        /** Keep a changed car (matched by its id). */
        save(build) {
            const b = normalizeBuild(build, C, { rand });
            const i = garage.cars.findIndex((c) => c.id === b.id);
            if (i < 0) return null;
            garage.cars[i] = b;
            saveGarage();
            return b;
        },
        /** A car into the garage and onto the bench, or null when full. */
        add(build) {
            if (api.isFull()) return null;
            const b = normalizeBuild({ ...build, id: newId(rand) }, C, { rand });
            garage.cars.push(b);
            garage.bench = b.id;
            saveGarage();
            return b;
        },
        /** A car out of the garage, its results with it. The last car is
         *  never removed: an empty garage has nothing on the bench. */
        remove(id) {
            if (garage.cars.length <= 1) return false;
            const i = garage.cars.findIndex((c) => c.id === id);
            if (i < 0) return false;
            garage.cars.splice(i, 1);
            delete garage.results[id];
            if (garage.last && garage.last.car === id) garage.last = null;
            if (garage.bench === id) garage.bench = garage.cars[Math.min(i, garage.cars.length - 1)].id;
            saveGarage();
            return true;
        },
        results: (id) => garage.results[id] || {},
        last: () => garage.last,
        /** A race's result for a car: kept as its last, and as its best in
         *  that event when it is. Returns whether it was a new best. */
        record(carId, event, { place = null, average }) {
            if (!garage.cars.some((c) => c.id === carId) || !EVENT_IDS.includes(event)) return false;
            const n = normalizeResult({ place, average });
            if (!n) return false;
            garage.last = { car: carId, event, ...n };
            const mine = (garage.results[carId] ||= {});
            const better = isBetter(n, mine[event]);
            if (better) mine[event] = n;
            saveGarage();
            return better;
        },
        trophies: () => ({ ...trophies }),
        /** A division won: its trophy, dated the first time. Returns whether
         *  it is new. */
        award(event) {
            if (!TROPHY_EVENTS.includes(event) || trophies[event]) return false;
            const d = now();
            trophies[event] = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            write(KEYS.trophies, trophies);
            return true;
        },
        settings: () => ({ ...settings }),
        setSetting(key, value) {
            settings = normalizeSettings({ ...settings, [key]: value });
            write(KEYS.settings, settings);
            return settings;
        },
        /** Forget everything (the Forget my cars button): every key gone, a
         *  fresh car on the bench. */
        forget() {
            for (const key of Object.values(KEYS)) {
                try {
                    localStorage.removeItem(key);
                } catch (e) { /* storage refused */ }
            }
            garage = normalizeGarage(null, C, { rand });
            settings = normalizeSettings(null);
            trophies = normalizeTrophies(null);
            return api.bench();
        },
        /** The first save of a first visit: the car the host introduced. */
        keep: () => saveGarage()
    };
    return api;
}
