// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-crossing.test.mjs - two receivers whose routes cross (Steve's QA,
 * 2026-10-31, `yieldToCrossing` in play.js and `crossing` in config.js).
 *
 * On five plays the two receivers running across the field met in the middle
 * of it on most snaps. The playbook staggers their breaks and that cannot
 * help: both men start on the same yard line and run downfield at the same
 * speed, so the crosser reaches his team-mate's lane where his team-mate is.
 * The fix is a downfield speed difference, made on demand: the man behind (the
 * later breaker, when level) jogs until the other has crossed in front.
 *
 * Held three ways. The rule on its own, on two men whose speeds the test
 * controls, so every clause (who, when, who yields, until) is a property with
 * a number. The settle's exemption, because a jogging man would otherwise
 * read as arrived. And the measurement that found the fault, run over the
 * five plays named against every defense with the rule on and off, so the
 * suite fails if the stalls come back, and so does the matched throw sweep
 * if the trade stops being the one that was taken.
 */
import { describe, test, expect } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';
import { outside } from './helpers/outside.mjs';

/** Room for the sweeps run outside the sandbox (outside.mjs): a few seconds
 *  each in plain Node, and more on a loaded machine. */
const OUTSIDE_TIMEOUT = 120000;

const here = dirname(fileURLToPath(import.meta.url));
const scene = join(here, '..', 'www', 'xo', 'js');

installThree();

const { XO_CONFIG: CFG, UNITS_TO_METRES } = await import(join(scene, 'config.js'));
const {
    yieldToCrossing, nearestApproach, settleArrived,
} = await import(join(scene, 'play.js'));

const C = CFG.crossing;
const HZ = CFG.simHz;
const U = (metres) => metres / UNITS_TO_METRES;
/** The same box `motion.checkCollisions` builds for a receiver, in units. */
const HX = 5 * CFG.collisionScale + CFG.collisionPad;
const HY = 6 * CFG.collisionScale + CFG.collisionPad;
const TOP = 2.2;
const ACCEL = 0.4;

/** A receiver as the ported library shapes him: settings, state, coords and
 *  physics on a plain object. */
function man(position, x, y, vx, vy, brk = 1.5, extra = {}) {
    return {
        settings: { position, positionGroup: 'wr', team: 0, benched: false, route: { break: brk }, ...extra },
        state: { xSpeed: vx, ySpeed: vy, hasBall: false },
        coords: { x, y },
        physics: { maxSpeed: TOP, accel: ACCEL, decel: 1.5 },
    };
}

function fakePlay(objects, game = {}, ball = {}) {
    return {
        game: { objects, throwTo: '', runForYourLife: false, ...game },
        playState: { state: { ball: { caught: false, position: 'qb', team: 0, ...ball }, measurements: { height: U(21) } } },
        frame: 0,
    };
}

/**
 * One frame of a route, the way the ported routes drive a man after his
 * break: each axis accelerates by one step toward its target speed and the
 * man moves by his speed. `dir` is each man's lateral direction (+1, -1 or 0).
 * The yield runs first, as it does in `tick` (after the shove and the clamp,
 * before the settle), so a cap it writes is what the route accelerates from.
 */
function frame(play, dirs) {
    const held = yieldToCrossing(play);
    for (const o of play.game.objects) {
        const s = o.state;
        s.xSpeed = Math.min(TOP, s.xSpeed + ACCEL);
        const d = dirs[o.settings.position] || 0;
        if (d > 0) s.ySpeed = Math.min(TOP, s.ySpeed + ACCEL);
        else if (d < 0) s.ySpeed = Math.max(-TOP, s.ySpeed - ACCEL);
        else s.ySpeed = 0;
        o.coords.x += s.xSpeed;
        o.coords.y += s.ySpeed;
    }
    play.frame += 1;
    return held;
}

/** Two men on the same yard line, `metres` apart across the field, both past
 *  their breaks and running at each other's lanes at full speed. At 12.6 m
 *  they start two frames outside the horizon; at 9 m the first frame is a
 *  course. */
function crossingPair(dxUnits = 0, breaks = [1.2, 2.0], metres = 12.6) {
    const a = man('wr1', 400, 100, TOP, TOP, breaks[0]);
    const b = man('wr3', 400 + dxUnits, 100 + U(metres), TOP, -TOP, breaks[1]);
    return { a, b, play: fakePlay([a, b]), dirs: { wr1: 1, wr3: -1 } };
}

/** Run the course until somebody yields, which the rule's own confirmation
 *  decides (`frames` of course that close the gap by `shrink`), and return
 *  the number of frames that took, or -1 if nobody did inside the limit. */
function engage(play, dirs, limit = HZ * 0.5) {
    for (let f = 0; f < limit; f += 1) {
        frame(play, dirs);
        if (play.game.objects.some((o) => o.state.yielding)) return f + 1;
    }
    return -1;
}

describe('the closest approach of two running men', () => {
    test('head on, they meet when the gap closes at their closing speed', () => {
        const a = man('wr1', 0, 0, 0, 2);
        const b = man('wr2', 0, 200, 0, -2);
        const ap = nearestApproach(a, b, 1000);
        expect(ap.t).toBeCloseTo(50, 6);
        expect(ap.miss).toBeCloseTo(0, 6);
        expect(ap.closing).toBeLessThan(0);
        expect(ap.now).toBe(200);
    });

    test('already separating, the nearest they will be is where they are now', () => {
        const a = man('wr1', 0, 0, 0, -2);
        const b = man('wr2', 0, 200, 0, 2);
        const ap = nearestApproach(a, b, 1000);
        expect(ap).toMatchObject({ t: 0, miss: 200, now: 200 });
        expect(ap.closing).toBeGreaterThan(0);
    });

    test('an approach beyond the horizon is reported at the horizon', () => {
        const a = man('wr1', 0, 0, 0, 1);
        const b = man('wr2', 0, 1000, 0, -1);
        const ap = nearestApproach(a, b, 80);
        expect(ap.t).toBe(80);
        expect(ap.miss).toBeCloseTo(1000 - 160, 6);
    });

    test('a step across is a miss, not a meeting', () => {
        const a = man('wr1', 0, 0, 0, 2);
        const b = man('wr2', 60, 200, 0, -2);
        expect(nearestApproach(a, b, 1000).miss).toBeCloseTo(60, 6);
    });
});

describe('who yields, and when', () => {
    test('level on the same yard line, the later breaker yields and the first crosses in front', () => {
        const { a, b, play, dirs } = crossingPair(0, [1.2, 2.0]);
        let engagedAt = -1;
        let boxClear = true;
        let crossed = false;
        for (let f = 0; f < HZ * 3 && !crossed; f += 1) {
            frame(play, dirs);
            if (engagedAt < 0 && b.state.yielding) engagedAt = f;
            expect(a.state.yielding).toBe(false);
            const dx = Math.abs(b.coords.x - a.coords.x);
            const dy = Math.abs(b.coords.y - a.coords.y);
            // Inside each other's box is the fault: the ported jostle fires there.
            if (dx <= 2 * HX && dy <= 2 * HY) boxClear = false;
            if (b.coords.y < a.coords.y) crossed = true;
        }
        expect(crossed).toBe(true);
        // He was engaged, and not on the first frame of the course.
        expect(engagedAt).toBeGreaterThanOrEqual(C.frames - 1);
        expect(engagedAt).toBeLessThan(HZ * 0.5);
        expect(boxClear).toBe(true);
        // The first breaker is ahead by at least the clear gap when they pass.
        expect(a.coords.x - b.coords.x).toBeGreaterThanOrEqual(U(C.clear) - TOP);
    });

    test('and with the rule gone the same two men meet inside the box', () => {
        // The same pair, the yield never run. This is the measurement the fix
        // was made against, in miniature: same yard line, same speed, they
        // arrive at the same spot.
        const { a, b } = crossingPair(0);
        let met = false;
        for (let f = 0; f < HZ * 3; f += 1) {
            for (const o of [a, b]) { o.coords.x += o.state.xSpeed; o.coords.y += o.state.ySpeed; }
            const dx = Math.abs(b.coords.x - a.coords.x);
            const dy = Math.abs(b.coords.y - a.coords.y);
            if (dx <= 2 * HX && dy <= 2 * HY) met = true;
        }
        expect(met).toBe(true);
    });

    test('the man behind yields whatever the breaks say, once the gap is past level', () => {
        // b is the EARLIER breaker but trails by more than `level`: he yields.
        const { a, b, play, dirs } = crossingPair(-(U(C.level) + 4), [2.0, 1.2]);
        expect(engage(play, dirs)).toBeGreaterThan(0);
        expect({ a: a.state.yielding, b: b.state.yielding }).toEqual({ a: false, b: true });
    });

    test('inside the level band the later breaker yields, and a tie goes to the higher number', () => {
        const later = crossingPair(2, [2.0, 1.2]);
        expect(engage(later.play, later.dirs)).toBeGreaterThan(0);
        expect(later.a.state.yielding).toBe(true);
        expect(later.b.state.yielding).toBe(false);

        const tie = crossingPair(2, [1.5, 1.5]);
        expect(engage(tie.play, tie.dirs)).toBeGreaterThan(0);
        expect(tie.a.state.yielding).toBe(false);
        expect(tie.b.state.yielding).toBe(true);
    });

    test('the yielder is held on both axes to the configured fraction of his speed', () => {
        const { b, play, dirs } = crossingPair(0, [1.2, 2.0]);
        expect(engage(play, dirs)).toBeGreaterThan(0);
        // Read the cap as the rule leaves it, before the route's next step.
        yieldToCrossing(play);
        expect(b.state.yielding).toBe(true);
        expect(Math.abs(b.state.xSpeed)).toBeLessThanOrEqual(C.speed * TOP + 1e-9);
        expect(Math.abs(b.state.ySpeed)).toBeLessThanOrEqual(C.speed * TOP + 1e-9);
        // ...and keeps the direction he was running in.
        expect(b.state.ySpeed).toBeLessThanOrEqual(0);
    });

    test('the course has to hold for the configured frames: a one-frame kick is not a crossing', () => {
        // Nine metres apart, inside the horizon, so the one frame IS a course
        // and is counted as one. Then b runs straight.
        const { a, b, play, dirs } = crossingPair(0, [1.2, 2.0], 9);
        frame(play, dirs);
        expect(play.crossing.pending['wr1-wr3']).toMatchObject({ n: 1 });
        expect(b.state.yielding).toBe(false);
        for (let f = 0; f < 10; f += 1) {
            frame(play, { wr1: 1, wr3: 0 });
            b.state.ySpeed = 0;
        }
        expect(a.state.yielding || b.state.yielding).toBe(false);
        expect(Object.keys(play.crossing.pairs)).toHaveLength(0);
    });

    test('and a course that closes no ground is not one either, however long the speeds say it will', () => {
        // A defender's jam kicks a man sideways at a run and his steer brings
        // him back: his speed says he will meet the man in the next lane and
        // he never gets any closer. Modelled as a pair whose speeds converge
        // on every frame while their positions never change, for four times
        // the frames a course needs.
        const { a, b, play, dirs } = crossingPair(-20, [1.2, 2.0], 9);
        for (let f = 0; f < C.frames * 4; f += 1) yieldToCrossing(play);
        expect(a.state.yielding || b.state.yielding).toBe(false);
        expect(Object.keys(play.crossing.pairs)).toHaveLength(0);
        // The same pair, once the ground closes, is engaged: it was the
        // ground that was missing.
        expect(engage(play, dirs)).toBeGreaterThan(0);
        expect(b.state.yielding).toBe(true);
    });

    test('two men running parallel are left alone, and so are two already bunched', () => {
        const parallel = fakePlay([man('wr1', 400, 200, TOP, 0), man('wr2', 400, 260, TOP, 0)]);
        for (let f = 0; f < 10; f += 1) frame(parallel, {});
        expect(parallel.game.objects.some((o) => o.state.yielding)).toBe(false);

        // Inside `miss` already: a bunched line-up, the jostle's business.
        const bunched = fakePlay([man('wr1', 400, 200, TOP, TOP), man('wr2', 400, 200 + U(C.miss) - 6, TOP, -TOP)]);
        for (let f = 0; f < C.frames + 2; f += 1) yieldToCrossing(bunched);
        expect(bunched.game.objects.some((o) => o.state.yielding)).toBe(false);
    });

    test('a course converging too slowly across the field is not a crossing', () => {
        // Same yard line, converging at a quarter of the lateral threshold:
        // two men drifting, not one running across.
        const slow = C.lateral / UNITS_TO_METRES / HZ / 4;
        const a = man('wr1', 400, 100, TOP, slow / 2);
        const b = man('wr2', 400, 160, TOP, -slow / 2);
        const play = fakePlay([a, b]);
        for (let f = 0; f < C.frames + 2; f += 1) yieldToCrossing(play);
        expect(a.state.yielding || b.state.yielding).toBe(false);
    });

    test('nobody yields once the visitor has decided, and a man with the ball never does', () => {
        for (const [game, ball] of [
            [{ throwTo: 'wr1' }, {}],
            [{ runForYourLife: true }, {}],
            [{}, { caught: true, position: 'wr1' }],
        ]) {
            const a = man('wr1', 400, 100, TOP, TOP);
            const b = man('wr3', 400, 100 + U(12.6), TOP, -TOP);
            const play = fakePlay([a, b], game, ball);
            for (let f = 0; f < C.frames + 2; f += 1) yieldToCrossing(play);
            expect(a.state.yielding || b.state.yielding).toBe(false);
        }
        const a = man('wr1', 400, 100, TOP, TOP);
        a.state.hasBall = true;
        const b = man('wr3', 400, 100 + U(12.6), TOP, -TOP);
        const play = fakePlay([a, b]);
        for (let f = 0; f < C.frames + 2; f += 1) yieldToCrossing(play);
        expect(a.state.yielding || b.state.yielding).toBe(false);
    });

    test('a yield in progress is dropped on the frame the ball is thrown', () => {
        const { a, b, play, dirs } = crossingPair(0, [1.2, 2.0]);
        expect(engage(play, dirs)).toBeGreaterThan(0);
        expect(b.state.yielding).toBe(true);
        play.game.throwTo = 'wr1';
        expect(yieldToCrossing(play)).toBe(0);
        expect(a.state.yielding || b.state.yielding).toBe(false);
        expect(Object.keys(play.crossing.pairs)).toHaveLength(0);
    });

    test('the defense and the line are not receivers running routes', () => {
        const db = man('db1', 400, 100, TOP, TOP, 0, { positionGroup: 'db', team: 1 });
        const wr = man('wr3', 400, 100 + U(12.6), TOP, -TOP);
        const x = man('x1', 400, 100 + U(12.6), TOP, -TOP, 1.5, { positionGroup: 'x' });
        const play = fakePlay([db, wr, x]);
        for (let f = 0; f < C.frames + 2; f += 1) yieldToCrossing(play);
        expect([db, wr, x].some((o) => o.state.yielding)).toBe(false);
    });

    test('the brake lets go at the clear gap, and the released man is not engaged again by the same cross', () => {
        const { a, b, play, dirs } = crossingPair(0, [1.2, 2.0]);
        let released = -1;
        let engagements = 0;
        let was = false;
        for (let f = 0; f < HZ * 3; f += 1) {
            frame(play, dirs);
            if (b.state.yielding && !was) engagements += 1;
            if (!b.state.yielding && was && released < 0) {
                released = f;
                // Released at the clear gap, not short of it and not by the hold.
                expect(a.coords.x - b.coords.x).toBeGreaterThanOrEqual(U(C.clear) - TOP);
            }
            was = b.state.yielding;
        }
        expect(released).toBeGreaterThan(0);
        expect(engagements).toBe(1);
    });

    test('a yield never outlasts the hold, and a hold that ran out is followed by a cooldown', () => {
        // A course that never resolves: the pair is engaged on a live course,
        // and from then on the geometry is frozen and both men are given
        // their running speeds back after every frame, as if the leader were
        // held on a defender and the yielder's jog bought nothing. The hold
        // is the only way out, so the yield lasts exactly that long, and it
        // must not be followed by an immediate re-engagement, or the cap
        // means nothing.
        const { a, b, play, dirs } = crossingPair(-20, [1.2, 2.0]);   // b a step behind: he yields
        const hold = Math.round(HZ * C.hold);
        expect(engage(play, dirs)).toBeGreaterThan(0);
        expect(b.state.yielding).toBe(true);
        const step = () => {
            yieldToCrossing(play);
            a.state.xSpeed = TOP; a.state.ySpeed = TOP;
            b.state.xSpeed = TOP; b.state.ySpeed = -TOP;
        };
        let frames = 1;   // the frame that engaged him
        for (let f = 0; f < hold * 3; f += 1) {
            step();
            if (!b.state.yielding) break;
            frames += 1;
        }
        expect(a.state.yielding).toBe(false);
        expect(frames).toBeGreaterThanOrEqual(hold);
        expect(frames).toBeLessThanOrEqual(hold + 1);
        // Cooldown: the same pair, sent straight back on a live course (far
        // enough apart to still be clear when it ends), is left alone for as
        // long again and THEN engaged, which is what shows it was the
        // cooldown holding them off rather than a course that had died.
        b.coords.x = a.coords.x - 20;
        b.coords.y = a.coords.y + U(15);
        let quiet = 0;
        let again = -1;
        for (let g = 0; g < hold * 2 && again < 0; g += 1) {
            frame(play, dirs);
            if (b.state.yielding) again = g + 1;
            else quiet += 1;
        }
        expect(quiet).toBeGreaterThanOrEqual(hold);
        expect(again).toBeGreaterThan(hold);
        expect(again).toBeLessThan(hold + HZ * 0.25);
    });

    test('the rule is inert with no hold, told per play the way the lead is', () => {
        const { a, b, play, dirs } = crossingPair(0);
        play.crossing = { pairs: {}, pending: {}, rules: { ...C, hold: 0 } };
        for (let f = 0; f < HZ; f += 1) frame(play, dirs);
        expect(a.state.yielding || b.state.yielding).toBeFalsy();
    });
});

describe('the settle leaves a yielding man alone', () => {
    /** A receiver whose last half second covered under the settle's `net`,
     *  which is what a jogging yielder looks like. */
    function arrived(yielding) {
        const o = man('wr2', 400, 300, TOP, 0);
        o.state.yielding = yielding;
        const window = Math.round(HZ * CFG.settle.window);
        o.state.arrival = [];
        for (let i = 0; i <= window; i += 1) o.state.arrival.push(400 - 0.1 * (window - i), 300);
        return o;
    }

    test('a man who has stopped is capped, a man who is yielding is not, and his history is dropped', () => {
        const stopped = arrived(false);
        const yielding = arrived(true);
        const play = fakePlay([stopped, yielding]);
        settleArrived(play);
        expect(stopped.state.xSpeed).toBeLessThanOrEqual(CFG.settle.speed * TOP + 1e-9);
        expect(yielding.state.xSpeed).toBe(TOP);
        expect(yielding.state.arrival).toBeNull();
    });
});

/**
 * THE MEASUREMENT THAT FOUND THE FAULT, run with the rule on and off. Every
 * defense against the five plays named, the quarterback holding for 4.5 s so
 * the routes run their length, seeded. A STALL is a pair of receivers who
 * started clear of each other spending eight consecutive frames (0.1 s)
 * inside each other's collision boxes; that is the ported jostle firing on
 * both of them, which is what a visitor sees as two men running into each
 * other. Also counted: how often anybody yields and for how long, because a
 * rule that engages for a few frames at a time is a flicker, not a yield.
 */
async function stallJob({ on }, load) {
    (await load('tests/helpers/three-stub.mjs')).installThree();
    const { XO_CONFIG: CFG } = await load('www/xo/js/config.js');
    const P = await load('www/xo/js/play.js');
    const { DEFENSES } = await load('www/xo/js/playbook-ui.js');
    // play.js reads the min build's config, so the switch is per play.
    const rules = on ? null : { ...CFG.crossing, hold: 0 };
    const HZ = CFG.simHz;
    const HX = 5 * CFG.collisionScale + CFG.collisionPad;
    const HY = 6 * CFG.collisionScale + CFG.collisionPad;
    let seed = 20261031;
    Math.random = () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    const out = {};
    for (const slug of ['pass7', 'pass3', 'pass1', 'slant1', 'slant2']) {
        const stat = { plays: 0, stalled: 0, yields: 0, yieldFrames: 0 };
        out[slug] = stat;
        for (const def of DEFENSES) {
            for (let k = 0; k < 4; k += 1) {
                const play = P.createPlay();
                P.lineUp(play, slug, def);
                play.crossing.rules = rules;
                P.snap(play);
                const wrs = play.game.objects.filter((o) => o.settings.positionGroup === 'wr' && o.settings.team === 0 && !o.settings.benched);
                const pairs = [];
                for (let i = 0; i < wrs.length; i += 1) {
                    for (let j = i + 1; j < wrs.length; j += 1) {
                        const a = wrs[i]; const b = wrs[j];
                        const d = Math.hypot(b.coords.x - a.coords.x, b.coords.y - a.coords.y);
                        pairs.push({ a, b, clear: d >= 60, run: 0, stalled: false });
                    }
                }
                let engaged = new Set();
                for (let f = 0; f < HZ * 4.5 && !P.isDone(play); f += 1) {
                    P.tick(play);
                    const now = new Set(Object.keys(play.crossing.pairs));
                    for (const key of now) if (!engaged.has(key)) stat.yields += 1;
                    stat.yieldFrames += now.size;
                    engaged = now;
                    for (const p of pairs) {
                        if (!p.clear) continue;
                        const dx = Math.abs(p.b.coords.x - p.a.coords.x);
                        const dy = Math.abs(p.b.coords.y - p.a.coords.y);
                        if (dx <= 2 * HX && dy <= 2 * HY) {
                            p.run += 1;
                            if (p.run === 8) p.stalled = true;
                        } else p.run = 0;
                    }
                }
                stat.plays += 1;
                if (pairs.some((p) => p.stalled)) stat.stalled += 1;
            }
        }
    }
    return out;
}

/**
 * THE TRADE, matched seed for seed: a throw at 2.2 s to every eligible
 * receiver on the five plays named, every defense, with the rule on and off.
 * Receivers who no longer stall are easier to hit, so this may only make the
 * game a little easier, never harder, and not by much.
 */
async function throwJob({ on }, load) {
    (await load('tests/helpers/three-stub.mjs')).installThree();
    const { XO_CONFIG: CFG } = await load('www/xo/js/config.js');
    const P = await load('www/xo/js/play.js');
    const { DEFENSES } = await load('www/xo/js/playbook-ui.js');
    const rules = on ? null : { ...CFG.crossing, hold: 0 };
    const HZ = CFG.simHz;
    const seeded = (seed) => () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    // Keyed by throw, so the test can compare only the throws BOTH runs made:
    // a sack before 2.2 s can land on one side of the pair and not the other.
    const out = {};
    for (const slug of ['pass7', 'pass3', 'pass1', 'slant1', 'slant2']) {
        for (const def of DEFENSES) {
            for (const who of ['wr1', 'wr2', 'wr3', 'wr4']) {
                // THE SAME SEED FOR BOTH HALVES OF THE PAIR, reseeded before each run.
                Math.random = seeded(slug.length * 1000 + DEFENSES.indexOf(def) * 10 + Number(who[2]));
                const play = P.createPlay();
                P.lineUp(play, slug, def);
                play.crossing.rules = rules;
                P.snap(play);
                let thrown = false;
                for (let f = 0; f < HZ * 14 && !P.isDone(play); f += 1) {
                    if (!thrown && f >= HZ * 2.2) {
                        thrown = P.throwTo(play, who);
                        if (!thrown) break;
                    }
                    P.tick(play);
                }
                if (!thrown) continue;
                const st = play.playState.state;
                out[`${slug}/${def}/${who}`] = {
                    caught: !!(st.ball && st.ball.caught && st.ball.team === 0),
                    points: P.outcome(play).points,
                };
            }
        }
    }
    return out;
}

describe('over the five plays named, the crossing receivers no longer run into each other', () => {
    test('the stalls are gone where they were crossings, and the yield is a yield rather than a flicker', async () => {
        const [off, on] = await Promise.all([outside(stallJob, { on: false }), outside(stallJob, { on: true })]);
        const rate = (r) => Object.values(r).reduce((s, p) => s + p.stalled / p.plays, 0) / Object.keys(r).length;
        // The numbers ride along in the assertion so a failure shows them.
        const rates = Object.fromEntries(Object.keys(on).map((slug) => [slug,
            `${(100 * off[slug].stalled / off[slug].plays).toFixed(0)}% -> ${(100 * on[slug].stalled / on[slug].plays).toFixed(0)}%`]));
        // The floor is measured, not remembered: with the rule off, nearly
        // half of these five plays stall (46% over four seeds on 2026-10-31,
        // and 46% with this one). If that ever stops being true the rule is
        // being measured against nothing. With it on, 12% over four seeds
        // and 16% with this one; the band here is for 76 plays a play.
        expect({ rates, off: rate(off) > 0.3, on: rate(on) < 0.22 }).toEqual({ rates, off: true, on: true });
        // The three plays whose only fault was the crossing lose most of it:
        // 18% to 5%, 37% to 1% and 68% to 11% over four seeds, and 13% to
        // 8%, 37% to 3% and 75% to 20% with this one. They are pooled (95
        // stalls to 23 here) because Stack Right's baseline on one seed is
        // ten stalls in 76 plays, too few for a ratio of its own: its 10 to
        // 6 reads as 0.60 where four seeds put it at 0.28. Each still has to
        // lose stalls on its own. Split Verticals keeps a parallel pair and
        // Deep Crossers a scrum at the line, which are different faults, so
        // they are held only to the mean above.
        const clean = ['pass7', 'pass3', 'slant1'];
        const pooled = (r) => clean.reduce((s, slug) => s + r[slug].stalled, 0);
        expect({ rates, cut: pooled(on) <= 0.35 * pooled(off) }).toEqual({ rates, cut: true });
        for (const slug of clean) {
            expect({ slug, rate: rates[slug], fewer: on[slug].stalled < off[slug].stalled })
                .toEqual({ slug, rate: rates[slug], fewer: true });
        }
        // Nobody yields with the rule off, and with it on a yield is a few a
        // play lasting a fraction of a second (3.2 a play of 0.26 s on these
        // five plays, 1.6 over every play): a flicker (7 a play of 0.08 s,
        // the velocity-based release) would fail the duration floor.
        for (const p of Object.values(off)) expect(p.yields).toBe(0);
        const yields = Object.values(on).reduce((s, p) => s + p.yields, 0);
        const plays = Object.values(on).reduce((s, p) => s + p.plays, 0);
        const frames = Object.values(on).reduce((s, p) => s + p.yieldFrames, 0);
        expect(yields / plays).toBeGreaterThan(0.5);
        expect(yields / plays).toBeLessThan(6);
        expect(frames / yields / HZ).toBeGreaterThan(0.1);
        expect(frames / yields / HZ).toBeLessThan(0.5);
    }, OUTSIDE_TIMEOUT);

    test('and the trade is a slightly easier catch, never a harder one', async () => {
        const [off, on] = await Promise.all([outside(throwJob, { on: false }), outside(throwJob, { on: true })]);
        const keys = Object.keys(off).filter((k) => on[k]);
        expect(keys.length).toBeGreaterThan(200);
        const sum = (r, field) => keys.reduce((s, k) => s + Number(r[k][field]), 0) / keys.length;
        const offRate = sum(off, 'caught');
        const onRate = sum(on, 'caught');
        const rates = `caught ${(100 * offRate).toFixed(1)}% -> ${(100 * onRate).toFixed(1)}%, points ${sum(off, 'points').toFixed(2)} -> ${sum(on, 'points').toFixed(2)}`;
        // Measured 48.9% to 51.6% on these five plays at three throw times
        // (6,954 matched throws over every play); one time and one seed here
        // give 52.6% to 57.0% over 344, so the band is wide and the sign is
        // the claim.
        expect({ rates, ok: onRate > offRate - 0.03 && onRate < offRate + 0.15 }).toEqual({ rates, ok: true });
        expect({ rates, ok: sum(on, 'points') > 0.9 * sum(off, 'points') && sum(on, 'points') < 1.25 * sum(off, 'points') })
            .toEqual({ rates, ok: true });
    }, OUTSIDE_TIMEOUT);
});
