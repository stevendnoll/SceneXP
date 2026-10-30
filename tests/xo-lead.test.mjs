// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-lead.test.mjs - leading the receiver (Steve's QA, 2026-10-30, lead.js).
 *
 * The ported throw landed the ball at the receiver's position plus hand-tuned
 * multipliers that knew nothing of the flight time, so a crossing receiver saw
 * it land upfield of him and turned off his route to get it. The intercept
 * solves for where he will be when it lands. Held three ways: the solve on its
 * own, the ball a real play throws, and the same measurement that found the
 * fault, run over every play in the book with the solve on and off, so the
 * suite fails if the old numbers come back.
 */
import { jest, describe, test, expect } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';

jest.setTimeout(120000);

const here = dirname(fileURLToPath(import.meta.url));
const scene = join(here, '..', 'www', 'xo', 'js');

installThree();

const { XO_CONFIG: CFG, UNITS_TO_METRES } = await import(join(scene, 'config.js'));
const L = await import(join(scene, 'lead.js'));
const P = await import(join(scene, 'play.js'));

const HZ = CFG.simHz;

function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function withSeed(seed, fn) {
    const orig = Math.random;
    Math.random = seeded(seed);
    try { return fn(); } finally { Math.random = orig; }
}

describe('the intercept', () => {
    const start = { x: 196, y: 314 };

    test('a man running straight downfield is met on his line when the ball gets there', () => {
        const at = { x: 400, y: 300 };
        const heading = { x: 2, y: 0 };
        const land = L.interceptTarget({ start, at, heading, throttle: 5 });
        // Flight t: the ball covers (land.x - start.x) at 5 a tick, he covers 2 a tick.
        expect(land.ticks).toBeCloseTo((land.x - start.x) / 5, 9);
        expect(land.x).toBeCloseTo(at.x + 2 * land.ticks, 9);
        expect(land.y).toBe(300);
        expect(land.x).toBeGreaterThan(at.x);
    });

    test('a man crossing the field is met across it: the landing is on his line, however far across he goes', () => {
        const at = { x: 400, y: 200 };
        const heading = { x: 1, y: 2.5 };
        const land = L.interceptTarget({ start, at, heading, throttle: 5 });
        expect(land.ticks).toBeCloseTo((land.x - start.x) / 5, 9);
        expect(land.x).toBeCloseTo(at.x + heading.x * land.ticks, 9);
        expect(land.y).toBeCloseTo(at.y + heading.y * land.ticks, 9);
        // In stride, by its own definition.
        expect(L.strideError({ at, heading, land, flightTicks: land.ticks })).toBeCloseTo(0, 9);
        // Faster ball, shorter lead.
        const quick = L.interceptTarget({ start, at, heading, throttle: 7 });
        expect(quick.ticks).toBeLessThan(land.ticks);
        expect(Math.abs(quick.y - at.y)).toBeLessThan(Math.abs(land.y - at.y));
    });

    test('a man standing still, or with no heading yet, gets the ball where he is', () => {
        const at = { x: 400, y: 260 };
        expect(L.interceptTarget({ start, at, heading: { x: 0, y: 0 }, throttle: 5 })).toMatchObject({ x: 400, y: 260 });
        expect(L.interceptTarget({ start, at, heading: null, throttle: 5 })).toMatchObject({ x: 400, y: 260 });
        expect(L.interceptTarget({ start, at, throttle: 5 }).ticks).toBeCloseTo((400 - 196) / 5, 9);
    });

    test('a defender on his heels buys a step more along his line', () => {
        const at = { x: 400, y: 200 };
        const heading = { x: 1, y: 2 };
        const plain = L.interceptTarget({ start, at, heading, throttle: 5 });
        const more = L.interceptTarget({ start, at, heading, throttle: 5, extra: 10 });
        expect(more.ticks).toBeCloseTo(plain.ticks, 9);
        expect(more.x - plain.x).toBeCloseTo(10 * heading.x, 9);
        expect(more.y - plain.y).toBeCloseTo(10 * heading.y, 9);
    });

    test('a man outrunning the ball downfield gets it as far as the longest flight goes', () => {
        const at = { x: 300, y: 300 };
        const land = L.interceptTarget({ start, at, heading: { x: 6, y: 0 }, throttle: 5, maxTicks: 120 });
        expect(land.ticks).toBe(120);
        expect(land.x).toBe(300 + 6 * 120);
        // Nearly as fast: a long flight, held to the cap too.
        expect(L.interceptTarget({ start, at, heading: { x: 4.9999, y: 0 }, throttle: 5, maxTicks: 120 }).ticks).toBe(120);
        expect(L.interceptTarget({ start, at, heading: { x: 4, y: 0 }, throttle: 5, maxTicks: 120 }).ticks).toBeLessThan(120);
    });

    test('a man behind the thrower gets the ball where he is, as the port had it', () => {
        const land = L.interceptTarget({ start, at: { x: 150, y: 330 }, heading: { x: -1, y: 1 }, throttle: 5 });
        expect(land.ticks).toBe(0);
        expect(land).toMatchObject({ x: 150, y: 330 });
    });

    test('the stride error is the gap at the ball\'s own arrival', () => {
        expect(L.strideError({ at: { x: 0, y: 0 }, heading: { x: 1, y: 1 }, land: { x: 10, y: 10 }, flightTicks: 10 })).toBe(0);
        expect(L.strideError({ at: { x: 0, y: 0 }, heading: { x: 1, y: 1 }, land: { x: 10, y: 0 }, flightTicks: 10 })).toBe(10);
        expect(L.strideError({ at: { x: 0, y: 0 }, heading: null, land: { x: 3, y: 4 }, flightTicks: 10 })).toBe(5);
    });
});

/**
 * Snap `slug`, run `at` seconds, throw to receiver `pick`, and hand back what
 * the throw was aimed at and what he was doing. `lead` is the play's own lead
 * settings, so the port's and the solve's throws come from identical plays.
 */
function thrown(slug, at, pick, lead, seed, before = null) {
    return withSeed(seed, () => {
        const play = P.createPlay();
        P.lineUp(play, slug, 'cover2');
        play.lead = lead;
        P.snap(play);
        for (let f = 0; f < HZ * at; f += 1) P.tick(play);
        const list = P.eligibleReceivers(play);
        if (pick >= list.length) return null;
        const who = list[pick];
        const rec = play.game.objects.find((o) => o.settings.position === who);
        if (before) before(play, rec);
        const heading = rec.state.heading || { x: rec.state.xSpeed, y: rec.state.ySpeed };
        const atNow = { x: rec.coords.x, y: rec.coords.y };
        if (!P.throwTo(play, who)) return null;
        const ball = play.game.objects.find((o) => o.settings.position === 'ball');
        // The port keeps the ball in bounds: a landing on the field's edge was
        // pulled there, and the receiver turns for it whatever the lead said.
        const c = play.formations.state.container;
        const yMin = c.gutters.y * 12;
        const yMax = c.height - c.gutters.y * 10;
        const land = { x: ball.coords.targetX, y: ball.coords.targetY };
        return {
            play, who, heading, at: atNow, land,
            flightTicks: ball.coords.list.length,
            start: { x: ball.coords.startX, y: ball.coords.startY },
            clamped: land.y <= yMin + 1e-9 || land.y >= yMax - 1e-9 || land.x >= play.playState.state.measurements.width - 1e-9,
        };
    });
}

const median = (list) => { const s = [...list].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const metres = (units) => units * UNITS_TO_METRES;
/** Degrees off his heading to the landing spot. */
function turn(t) {
    const speed = Math.hypot(t.heading.x, t.heading.y);
    const to = { x: t.land.x - t.at.x, y: t.land.y - t.at.y };
    const far = Math.hypot(to.x, to.y);
    if (speed < 0.3 || far < 1) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (to.x * t.heading.x + to.y * t.heading.y) / (far * speed)))) * 180 / Math.PI;
}

describe('a real play\'s throw', () => {
    test('with the solve on, the ball lands on the receiver\'s line, where he will be when it gets there', () => {
        // Two receivers, two moments, no trailing-defender step so the arrival
        // is exactly the solve's.
        const lead = { ...CFG.lead, intercept: true, trail: 0 };
        let seen = 0;
        for (const [slug, at, pick] of [['pass2', 1.2, 0], ['pass2', 1.2, 1], ['slant1', 1.0, 0], ['pass7', 1.6, 1]]) {
            const t = thrown(slug, at, pick, lead, 7);
            if (!t) continue;
            seen += 1;
            // The ball's own path is the solve's flight, give or take the port's
            // sampling of the line (a step either way).
            const err = L.strideError(t);
            expect(metres(err)).toBeLessThan(0.25);
            expect(turn(t)).toBeLessThan(6);
        }
        expect(seen).toBeGreaterThanOrEqual(3);
    });

    test('with the solve off, the port\'s multipliers come back exactly', () => {
        const port = { ...CFG.lead, intercept: false };
        const t = thrown('pass2', 1.2, 0, port, 7);
        // The port's lead is its own arithmetic; what is held here is that it
        // is NOT the solve, so the switch really switches.
        const solved = L.interceptTarget({
            start: t.start, at: t.at, heading: t.heading, throttle: 5, extra: 0,
        });
        expect(Math.hypot(t.land.x - solved.x, t.land.y - solved.y)).toBeGreaterThan(5);
    });

    test('a play that says nothing throws the config\'s way, which is the solve', () => {
        expect(CFG.lead.intercept).toBe(true);
        const plain = thrown('pass2', 1.2, 0, undefined, 7);
        const solved = thrown('pass2', 1.2, 0, { ...CFG.lead }, 7);
        expect(plain.land).toEqual(solved.land);
        expect(plain.flightTicks).toBe(solved.flightTicks);
        const port = thrown('pass2', 1.2, 0, { ...CFG.lead, intercept: false }, 7);
        expect(Math.hypot(plain.land.x - port.land.x, plain.land.y - port.land.y)).toBeGreaterThan(5);
    });
});

/**
 * THE MEASUREMENT THAT FOUND THE FAULT, KEPT AS A TEST. Every play in the
 * book, every eligible receiver, at two moments after the snap: how far the
 * landing spot is from in stride, and how far the receiver has to turn off his
 * route to reach it, with the solve and with the port. The port's numbers are
 * the ones from the QA session (crossing routes: a median 1.24 m, 25 degrees).
 */
describe('over the whole book', () => {
    function sweep(lead) {
        const rows = [];
        for (const slug of P.OFFENSIVE_PLAYS) {
            for (const at of [1.0, 1.8]) {
                for (const pick of [0, 1, 2, 3]) {
                    const t = thrown(slug, at, pick, lead, slug.length * 131 + at * 100 + pick);
                    if (!t) continue;
                    const speed = Math.hypot(t.heading.x, t.heading.y);
                    rows.push({
                        err: metres(L.strideError(t)), turn: turn(t), clamped: t.clamped,
                        land: t.land, heading: t.heading,
                        crossing: speed > 0.3 && Math.abs(t.heading.y) > 0.35 * speed,
                    });
                }
            }
        }
        return rows;
    }

    test('the solve lands within a step of in stride on crossing routes; the port landed a median metre off', () => {
        const solved = sweep({ ...CFG.lead, intercept: true, trail: 0 });
        const port = sweep({ ...CFG.lead, intercept: false });
        expect(solved.length).toBeGreaterThan(100);
        expect(port.length).toBe(solved.length);
        const crossing = (rows) => rows.filter((r) => r.crossing);
        expect(crossing(solved).length).toBeGreaterThan(40);
        // In stride, and on his line. The only hard turns left are the port's
        // own: a receiver lined up on the sideline whose spot was pulled back
        // in bounds, which no lead can help.
        expect(median(crossing(solved).map((r) => r.err))).toBeLessThan(0.15);
        expect(median(crossing(solved).map((r) => r.turn))).toBeLessThan(3);
        const hard = crossing(solved).filter((r) => r.turn > 45);
        expect(hard.every((r) => r.clamped)).toBe(true);
        expect(hard.length).toBeLessThan(8);
        expect(crossing(solved).filter((r) => !r.clamped && r.turn > 10)).toHaveLength(0);
        // Which the port was not: this is the fault, and the suite fails if it
        // comes back.
        expect(median(crossing(port).map((r) => r.err))).toBeGreaterThan(0.8);
        expect(median(crossing(port).map((r) => r.turn))).toBeGreaterThan(15);
    });

    test('a defender on the receiver\'s heels buys a step more along his line', () => {
        expect(CFG.lead.trail).toBeGreaterThan(0);
        // A defender put right behind receiver A the moment before the throw,
        // which is the port's own test for "on his heels" (within 30 units of
        // the spot 20 behind him).
        const heels = (play, rec) => {
            const db = play.game.objects.find((o) => o.settings.position === 'db1');
            db.coords.x = rec.coords.x - 18;
            db.coords.y = rec.coords.y;
        };
        const plain = thrown('pass2', 1.2, 0, { ...CFG.lead, intercept: true, trail: 0 }, 7, heels);
        const stepped = thrown('pass2', 1.2, 0, { ...CFG.lead, intercept: true, trail: CFG.lead.trail }, 7, heels);
        expect(plain.clamped).toBe(false);
        expect(stepped.clamped).toBe(false);
        // The same solve, carried on along his line by the configured ticks.
        expect(stepped.land.x - plain.land.x).toBeCloseTo(CFG.lead.trail * plain.heading.x, 6);
        expect(stepped.land.y - plain.land.y).toBeCloseTo(CFG.lead.trail * plain.heading.y, 6);
        expect(Math.hypot(stepped.land.x - plain.land.x, stepped.land.y - plain.land.y)).toBeGreaterThan(1);
        // Nobody behind him: no step.
        const alone = thrown('pass2', 1.2, 0, { ...CFG.lead, intercept: true, trail: CFG.lead.trail }, 7, (play) => {
            for (const o of play.game.objects) {
                if (o.settings.team === 1 && !o.settings.benched) o.coords.x += 400;
            }
        });
        const aloneFlat = thrown('pass2', 1.2, 0, { ...CFG.lead, intercept: true, trail: 0 }, 7, (play) => {
            for (const o of play.game.objects) {
                if (o.settings.team === 1 && !o.settings.benched) o.coords.x += 400;
            }
        });
        expect(alone.land).toEqual(aloneFlat.land);
    });
});
