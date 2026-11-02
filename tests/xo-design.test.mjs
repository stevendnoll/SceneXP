// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-design.test.mjs
 *
 * A PLAY THE VISITOR DREW HAS TO BE A PLAY (specs/custom-plays-PRD, Phase 1).
 * The book's plays are slugs the ported formation library turns into
 * procedural routes. A designed play is a base formation plus a line per
 * player, and design.js, one `case` in routes.js and `lineUp` in play.js are
 * what make the simulation run it. These cases are the proof, in the only
 * place a drawn route can be proved: a headless play, ticked, measured.
 *
 * Two kinds of case. The pure geometry (following a line, the record's shape)
 * is tested as plain numbers. The simulation is lined up on a designed play
 * and ticked for five seconds with the defense benched, so that what is being
 * measured is the follower and not a cornerback, and each man's trace is
 * compared with the line he was drawn. The thresholds are in FIELD UNITS,
 * 200 to a line interval of seven metres, so 20 units is 0.7 m, under half a
 * body width at the figure scale.
 *
 * And the guarantee the port's "deliberately unchanged" note now rests on: a
 * play from the book never reaches the new code at all.
 */
import { describe, test, expect, afterEach } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { installThree } from './helpers/three-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scene = join(here, '..', 'www', 'xo', 'js');

installThree();

const D = await import(join(scene, 'design.js'));
const {
    resolvePlay, toSim, toNormalized, normalizeLine, normalizeRecord, isCustomId,
    newPlayId, pathState, followPath, approachSpeed, MAX_POINTS, MAX_NAME,
    PATH_PLAYERS, QB_BEHIND,
} = D;
const { XO_CONFIG: CFG, SIM, measurements } = await import(join(scene, 'config.js'));
const P = await import(join(scene, 'play.js'));
const { createPlay, lineUp, snap, tick, isDone, OFFENSIVE_PLAYS } = P;
const { benchedIn, sitsOut } = await import(join(scene, 'playas.js'));

const M = measurements();
const HZ = CFG.simHz;
/** One line interval, as a fraction of the field's length. */
const LI = M.lineInterval / M.width;

// ---- Seeding ---------------------------------------------------------------

const realRandom = Math.random;
afterEach(() => { Math.random = realRandom; });

/** mulberry32, so a line-up's speed rolls are the same every run. */
function seed(n) {
    let s = n | 0;
    Math.random = () => {
        s = s + 0x6D2B79F5 | 0;
        let t = Math.imul(s ^ s >>> 15, 1 | s);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// ---- Fixtures --------------------------------------------------------------

/** Where pass4 stands everybody, in normalized units, read off a real line-up
 *  rather than typed, so the drawn lines begin where the men are. */
function spotsOf(base) {
    const probe = createPlay();
    lineUp(probe, base, 'cover2');
    const at = {};
    for (const o of probe.game.objects) {
        if (o.settings.team === 0) at[o.settings.position] = toNormalized(o.coords.x, o.coords.y, M);
    }
    return at;
}

/**
 * THE DESIGNED PLAY UNDER TEST: on Four Verticals, B runs an out (up 1.6
 * intervals, then to the near sideline), C a post (up 1.2, then a diagonal
 * to the middle of the field three intervals on), D a comeback (up two, back
 * 0.6 and in), A is not drawn a line, and the quarterback drops and rolls
 * toward the far sideline.
 */
function designed(at) {
    return {
        id: 'custom-test1',
        name: 'Out post comeback',
        base: 'pass4',
        routes: {
            wr2: [at.wr2, [at.wr2[0] + 1.6 * LI, at.wr2[1]], [at.wr2[0] + 1.6 * LI, 0.06]],
            wr3: [at.wr3, [at.wr3[0] + 1.2 * LI, at.wr3[1]], [at.wr3[0] + 3.2 * LI, 0.5]],
            wr4: [at.wr4, [at.wr4[0] + 2.0 * LI, at.wr4[1]], [at.wr4[0] + 1.4 * LI, at.wr4[1] + 0.06]],
            qb: [at.qb, [at.qb[0] - 0.35 * LI, at.qb[1]], [at.qb[0] - 0.2 * LI, at.qb[1] + 0.3]],
        },
    };
}

/** Take the defense off the field, so a trace measures the follower alone. */
function benchDefense(play) {
    for (const o of play.game.objects) {
        if (o.settings.team === 1) {
            o.settings.benched = true;
            o.coords.x = -1e4;
            o.coords.y = -1e4;
        }
    }
}

const byPosition = (play, pos) => play.routes.getObjectByPosition(play.game.objects, pos);

/** Distance from a point to a polyline. */
function offLine(p, pts) {
    if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i];
        const b = pts[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
    }
    return best;
}

/** Line up, bench the defense, snap, tick `seconds`, and keep each watched
 *  man's worst distance from his line and his closest approach to its end. */
function trace(record, who, seconds, seedValue = 7) {
    seed(seedValue);
    const play = createPlay();
    lineUp(play, record, 'cover3');
    benchDefense(play);
    snap(play);
    const watch = {};
    for (const pos of who) {
        const o = byPosition(play, pos);
        watch[pos] = { o, pts: o.settings.route.path.points, maxOff: 0, nearestEnd: Infinity };
    }
    for (let f = 0; f < HZ * seconds; f += 1) {
        tick(play);
        for (const w of Object.values(watch)) {
            // Once the quarterback's line has settled him, the port's own
            // pocket wander has him, and that is not the line's to answer for.
            if (!w.o.settings.route.path.settled) w.maxOff = Math.max(w.maxOff, offLine(w.o.coords, w.pts));
            const end = w.pts[w.pts.length - 1];
            w.nearestEnd = Math.min(w.nearestEnd, Math.hypot(w.o.coords.x - end.x, w.o.coords.y - end.y));
        }
    }
    for (const w of Object.values(watch)) {
        const end = w.pts[w.pts.length - 1];
        w.endAt = Math.hypot(w.o.coords.x - end.x, w.o.coords.y - end.y);
        w.speed = Math.hypot(w.o.state.xSpeed, w.o.state.ySpeed);
    }
    return { play, watch };
}

// ---- The record ------------------------------------------------------------

describe('what lineUp is being asked for', () => {
    test('a slug is itself, with the ported routes untouched', () => {
        expect(resolvePlay('pass4')).toEqual({ id: 'pass4', base: 'pass4', routes: null });
        expect(resolvePlay('')).toEqual({ id: '', base: '', routes: null });
        expect(resolvePlay(undefined)).toEqual({ id: '', base: '', routes: null });
    });

    test('a record is its base and its lines, and no lines is an empty set, not the ported ones', () => {
        const r = resolvePlay({ id: 'custom-a', base: 'pass2', routes: { wr1: [[0.2, 0.1]] } });
        expect(r).toEqual({ id: 'custom-a', base: 'pass2', routes: { wr1: [[0.2, 0.1]] } });
        expect(resolvePlay({ id: 'custom-b', base: 'run1' }).routes).toEqual({});
        // A record with no id of its own is called by its base.
        expect(resolvePlay({ base: 'run1' }).id).toBe('run1');
    });

    test('ids are prefixed so they can never be a slug, and are made from the clock', () => {
        expect(isCustomId('custom-abc')).toBe(true);
        expect(isCustomId('custom-')).toBe(false);
        expect(isCustomId('pass4')).toBe(false);
        expect(isCustomId(4)).toBe(false);
        const id = newPlayId(1762100000000);
        expect(isCustomId(id)).toBe(true);
        expect(id).toBe(`custom-${(1762100000000).toString(36)}`);
        expect(OFFENSIVE_PLAYS.includes(id)).toBe(false);
    });

    test('normalized units round trip through the simulation', () => {
        const p = toSim([0.25, 0.5], M);
        expect(p).toEqual({ x: 0.25 * M.width, y: 0.5 * M.height });
        const back = toNormalized(p.x, p.y, M);
        expect(back[0]).toBeCloseTo(0.25, 12);
        expect(back[1]).toBeCloseTo(0.5, 12);
    });

    test('a line is made safe: clamped, capped, or refused', () => {
        expect(normalizeLine(null)).toBeNull();
        expect(normalizeLine([])).toBeNull();
        expect(normalizeLine([[0.1]])).toBeNull();
        expect(normalizeLine([[0.1, 'x']])).toBeNull();
        expect(normalizeLine([[0.1, NaN]])).toBeNull();
        expect(normalizeLine([[-1, 2], ['0.5', 0.25]])).toEqual([[0, 1], [0.5, 0.25]]);
        const long = Array.from({ length: MAX_POINTS + 5 }, (_, i) => [i / 30, 0.5]);
        expect(normalizeLine(long)).toHaveLength(MAX_POINTS);
    });

    test('a record is made safe, or refused, and an unknown base falls back rather than failing', () => {
        const bases = OFFENSIVE_PLAYS;
        expect(normalizeRecord(null, bases)).toBeNull();
        expect(normalizeRecord('custom-a', bases)).toBeNull();
        expect(normalizeRecord({ id: 'pass4', name: 'x', base: 'pass4' }, bases)).toBeNull();
        expect(normalizeRecord({ id: 'custom-a', name: '   ', base: 'pass4' }, bases)).toBeNull();
        expect(normalizeRecord({ id: 'custom-a', name: 'x', base: 'pass4' }, [])).toBeNull();
        const r = normalizeRecord({
            id: 'custom-a', name: `  ${'n'.repeat(MAX_NAME + 10)}  `, base: 'nope',
            routes: { wr2: [[0.2, 0.3], [0.5, 0.3]], db1: [[0, 0]], wr3: 'junk' },
            created: '2026-11-02T00:00:00Z', hidden: 'yes',
        }, bases);
        expect(r.name).toBe('n'.repeat(MAX_NAME));
        expect(r.base).toBe('pass4');
        expect(Object.keys(r.routes)).toEqual(['wr2']);
        expect(r.created).toBe('2026-11-02T00:00:00Z');
        expect(r.hidden).toBe(false);
        expect(normalizeRecord({ id: 'custom-a', name: 'x', base: 'nope' }, ['run1']).base).toBe('run1');
        expect(normalizeRecord({ id: 'custom-a', name: 'x', base: 'jumbo2', hidden: true }, bases).hidden).toBe(true);
    });
});

// ---- Following a line, as numbers ------------------------------------------

describe('following a line', () => {
    test('no points is no path, and one point is its own end', () => {
        expect(followPath(pathState([]), 0, 0, 10)).toBeNull();
        expect(followPath(null, 0, 0, 10)).toBeNull();
        const one = followPath(pathState([{ x: 5, y: 6 }]), 8, 10, 10);
        expect(one).toEqual({ x: 5, y: 6, toEnd: 5, end: true });
    });

    test('on a straight line the carrot is the lookahead ahead of where he projects', () => {
        const path = pathState([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
        // Standing a little off the line, the target is on it, ahead.
        const t = followPath(path, 30, 4, 20);
        expect(t.x).toBeCloseTo(50);
        expect(t.y).toBeCloseTo(0);
        expect(t.end).toBe(false);
        // Within a lookahead of the end, the end itself.
        const near = followPath(path, 90, 0, 20);
        expect(near).toMatchObject({ x: 100, y: 0, end: true });
        expect(near.toEnd).toBeCloseTo(10);
    });

    test('a corner is turned, the segment index only ever advances, and a late carrot is on the next segment', () => {
        const path = pathState([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
        expect(followPath(path, 50, 0, 20).y).toBeCloseTo(0);
        expect(path.seg).toBe(0);
        // Ten short of the corner with a twenty lookahead: the carrot is ten
        // round the corner, so he begins to turn before he reaches it.
        const turning = followPath(path, 90, 0, 20);
        expect(turning.x).toBeCloseTo(100);
        expect(turning.y).toBeCloseTo(10);
        expect(path.seg).toBe(0);
        // Past the corner: the next segment.
        followPath(path, 101, 5, 20);
        expect(path.seg).toBe(1);
        // Shoved back beside the first segment, he does not run it again.
        followPath(path, 60, 2, 20);
        expect(path.seg).toBe(1);
    });

    test('a comeback corner is taken when he is within the lookahead of it, a right angle is not', () => {
        // A doubling back: he can stand on the carrot without passing the corner.
        const back = pathState([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 40, y: 20 }]);
        followPath(back, 85, 2, 20);
        expect(back.seg).toBe(1);
        // The same spot before a right-angle corner stays on the first segment.
        const right = pathState([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
        followPath(right, 85, 2, 20);
        expect(right.seg).toBe(0);
        // With no lookahead there is no early corner at all.
        const none = pathState([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 40, y: 20 }]);
        followPath(none, 85, 2, 0);
        expect(none.seg).toBe(0);
    });

    test('a zero-length segment is skipped rather than divided by', () => {
        const path = pathState([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 80 }]);
        const t = followPath(path, 50, 1, 20);
        expect(Number.isFinite(t.x) && Number.isFinite(t.y)).toBe(true);
        expect(t.x).toBeCloseTo(50);
        expect(t.y).toBeGreaterThan(1);
    });

    test('speed moves toward what is wanted by accel when speeding up and decel otherwise, and never overshoots', () => {
        expect(approachSpeed(0, 2, 0.2, 1.5)).toBeCloseTo(0.2);
        expect(approachSpeed(1.9, 2, 0.2, 1.5)).toBeCloseTo(2);
        expect(approachSpeed(2, 0, 0.2, 1.5)).toBeCloseTo(0.5);
        expect(approachSpeed(0.5, 0, 0.2, 1.5)).toBe(0);
        // Turning back is a brake, not an acceleration.
        expect(approachSpeed(2, -2, 0.2, 1.5)).toBeCloseTo(0.5);
        expect(approachSpeed(-0.1, 2, 0.2, 1.5)).toBeCloseTo(1.4);
        expect(approachSpeed(1, 1, 0.2, 1.5)).toBe(1);
    });
});

// ---- The simulation runs what was drawn --------------------------------------

describe('a designed play in the simulation', () => {
    test('the book never reaches the new code: no path on anybody, and the follower is never called', () => {
        seed(1);
        for (const slug of OFFENSIVE_PLAYS) {
            const play = createPlay();
            lineUp(play, slug, 'cover3');
            expect(play.offense).toBe(slug);
            expect(play.base).toBe(slug);
            for (const o of play.game.objects) {
                if (!o.settings.route) continue;
                expect(o.settings.route.path).toBeUndefined();
                expect(o.settings.route.type).not.toBe('path');
            }
            let called = 0;
            play.routes.runPath = () => { called += 1; return true; };
            snap(play);
            for (let f = 0; f < 60; f += 1) tick(play);
            expect(called).toBe(0);
        }
    });

    test('it lines up on its base, and the line-up says so', () => {
        seed(2);
        const at = spotsOf('pass4');
        const record = designed(at);
        const play = createPlay();
        lineUp(play, record, 'cover3');
        expect(play.offense).toBe('custom-test1');
        expect(play.base).toBe('pass4');
        for (const pos of ['wr1', 'wr2', 'wr3', 'wr4']) {
            const o = byPosition(play, pos);
            // The after-the-catch switches read the base, so a designed play
            // runs on from a catch the way its formation does.
            expect(o.state.formation).toBe('pass4');
            expect(o.settings.route.type).toBe('path');
            // Every line begins where its man actually stands.
            expect(o.settings.route.path.points[0]).toEqual({ x: o.coords.x, y: o.coords.y });
            // The whole field, with the two zero edges the ported wall reads as "none".
            expect(o.settings.route.boundaries).toEqual({ top: 0, left: 0, right: M.width, bottom: M.height });
        }
        // A is not drawn a line: a line of one point, his own spot.
        expect(byPosition(play, 'wr1').settings.route.path.points).toHaveLength(1);
        // A hand-edited record whose line starts somewhere else still begins
        // at the man: the first point is where the line-up put him, not where
        // the record says.
        const edited = createPlay();
        lineUp(edited, { id: 'custom-edited', base: 'pass4', routes: { wr2: [[0.5, 0.5], [0.7, 0.5]] } }, 'cover3');
        const b = byPosition(edited, 'wr2');
        expect(b.settings.route.path.points[0]).toEqual({ x: b.coords.x, y: b.coords.y });
        expect(b.settings.route.path.points[1]).toEqual({ x: 0.7 * M.width, y: 0.5 * M.height });
        // The quarterback keeps his ported route and gains the line beside it.
        const qb = byPosition(play, 'qb');
        expect(qb.settings.route.type).toBe('qb');
        expect(qb.settings.route.path.points).toHaveLength(3);
        // The defense is the library's own business.
        for (const o of play.game.objects) {
            if (o.settings.team === 1 && o.settings.route) expect(o.settings.route.path).toBeUndefined();
        }
        // And so is a receiver the base formation benches: he is not drawn a
        // hold on the sideline, he is simply not in this play.
        const heavy = createPlay();
        lineUp(heavy, { id: 'custom-heavy', base: 'jumbo1', routes: { wr3: [[0.2, 0.5], [0.6, 0.5]] } }, 'cover3');
        const outs = heavy.game.objects.filter((o) => o.settings.team === 0 && o.settings.benched && PATH_PLAYERS.includes(o.settings.position));
        expect(outs.length).toBeGreaterThan(0);
        for (const o of outs) expect(o.settings.route && o.settings.route.path).toBeUndefined();
    });

    test('a line drawn past the line of scrimmage is held behind it, for the quarterback only', () => {
        seed(3);
        const at = spotsOf('pass4');
        const record = {
            id: 'custom-los', base: 'pass4',
            routes: { qb: [at.qb, [0.9, at.qb[1]]], wr2: [at.wr2, [0.9, at.wr2[1]]] },
        };
        const play = createPlay();
        lineUp(play, record, 'cover3');
        const limit = M.lineInterval * QB_BEHIND;
        for (const p of byPosition(play, 'qb').settings.route.path.points) expect(p.x).toBeLessThanOrEqual(limit);
        expect(byPosition(play, 'wr2').settings.route.path.points[1].x).toBeCloseTo(0.9 * M.width);
    });

    test('receivers run the lines they were drawn, and stop where the lines stop', () => {
        const at = spotsOf('pass4');
        const { watch } = trace(designed(at), ['wr1', 'wr2', 'wr3', 'wr4'], 5);
        // A corner is rounded by about the lookahead and no more: 20 units is
        // 0.7 m. The out (a right angle at a sprint) is the worst of them.
        for (const pos of ['wr2', 'wr3', 'wr4']) {
            expect(watch[pos].maxOff).toBeLessThan(20);
            // Settled on the last point, standing still, well inside five seconds.
            expect(watch[pos].endAt).toBeLessThan(10);
            expect(watch[pos].speed).toBeLessThan(0.1);
        }
        // The comeback actually came back: his end is nearer the line of
        // scrimmage than his corner, and he reached it.
        const d = watch.wr4.pts;
        expect(d[2].x).toBeLessThan(d[1].x);
        // And the man with no line held at the line of scrimmage.
        expect(watch.wr1.maxOff).toBeLessThan(10);
    });

    test('a different roll of the dice runs the same lines', () => {
        const at = spotsOf('pass4');
        for (const s of [11, 12, 13]) {
            const { watch } = trace(designed(at), ['wr2', 'wr3', 'wr4'], 5, s);
            for (const pos of ['wr2', 'wr3', 'wr4']) {
                expect(watch[pos].maxOff).toBeLessThan(20);
                expect(watch[pos].endAt).toBeLessThan(10);
            }
        }
    });

    test('the quarterback runs his line, stops at its end, and the pocket moves to where he stopped', () => {
        const at = spotsOf('pass4');
        const { play, watch } = trace(designed(at), ['qb'], 5);
        const qb = watch.qb;
        // On his line until it ends, and he reached the end of it.
        expect(qb.maxOff).toBeLessThan(20);
        expect(qb.nearestEnd).toBeLessThan(10);
        const route = qb.o.settings.route;
        expect(route.path.done).toBe(true);
        expect(route.path.settled).toBe(true);
        // The pocket is the port's own size, around the end of the line, and
        // its far wall was not moved past where the formation had it. Where
        // the ported wander takes him from there is the book's own business:
        // measured, the book's quarterback overruns his pocket walls by
        // fifty units or more in most plays (2026-11-02).
        const end = qb.pts[qb.pts.length - 1];
        const gy = SIM.gutter;
        expect(route.boundaries.left).toBeCloseTo(Math.max(0, end.x - M.lineInterval * 0.25));
        expect(route.boundaries.right).toBeLessThanOrEqual(M.lineInterval * QB_BEHIND);
        expect(route.boundaries.top).toBeCloseTo(end.y - gy * 12);
        expect(route.boundaries.bottom).toBeCloseTo(end.y + gy * 12);
        // Nothing ended the play: no throw, no run, no whistle.
        expect(isDone(play)).toBe(false);
    });

    test('with no lines at all, every receiver holds at the line of scrimmage', () => {
        /**
         * HELD, GIVE OR TAKE A SHOVE FROM HIS OWN LINE. The two outside
         * receivers have nobody near them and stand on their spots. The two
         * inside ones start a body width from a lineman, and the ported
         * linemen drift back with the quarterback and walk through anybody
         * standing there: measured, B is carried two metres along the line
         * and comes back once the lineman has passed (2026-11-02). That is
         * the port's collision response and the hold is still a hold: nobody
         * runs a route, and everybody is back on his spot by three seconds.
         */
        const { watch } = trace({ id: 'custom-hold', base: 'pass4', routes: {} }, ['wr1', 'wr2', 'wr3', 'wr4'], 3);
        for (const pos of ['wr1', 'wr2', 'wr3', 'wr4']) {
            expect(watch[pos].pts).toHaveLength(1);
            // Never downfield: a hold is not a route.
            expect(watch[pos].o.coords.x - watch[pos].pts[0].x).toBeLessThan(20);
            expect(watch[pos].endAt).toBeLessThan(10);
        }
        expect(watch.wr1.maxOff).toBeLessThan(10);
        expect(watch.wr4.maxOff).toBeLessThan(10);
        expect(watch.wr2.maxOff).toBeLessThan(80);
        expect(watch.wr3.maxOff).toBeLessThan(80);
    });

    test('a drawn diagonal is as fast as a ported one', () => {
        // The port caps each axis separately, so every ported diagonal runs
        // at root two of top speed. A drawn post that ran at top speed along
        // its line would be slower than the book's and slower than the man
        // covering it. C is drawn a forty-five degree line here, 300 units
        // downfield and 300 across, in simulation units rather than the
        // normalized ones, because the field is not square.
        seed(5);
        const at = spotsOf('pass4');
        const slant = [at.wr3, [at.wr3[0] + 300 / M.width, at.wr3[1] - 300 / M.height]];
        const play = createPlay();
        lineUp(play, { id: 'custom-slant', base: 'pass4', routes: { wr3: slant } }, 'cover3');
        benchDefense(play);
        snap(play);
        const c = byPosition(play, 'wr3');
        let fastest = 0;
        for (let f = 0; f < HZ * 4; f += 1) {
            tick(play);
            fastest = Math.max(fastest, Math.hypot(c.state.xSpeed, c.state.ySpeed));
        }
        expect(fastest).toBeGreaterThan(c.physics.maxSpeed * 1.15);
        expect(fastest).toBeLessThanOrEqual(c.physics.maxSpeed * Math.SQRT2 + 1e-9);
    });

    test('against a real defense the lines are still run', () => {
        // The follower under contact: man coverage jams, shoves and chases, so
        // the bar is lower and it is a median over the defenses the library
        // runs rather than every one. A receiver taken off his line by a
        // defender is football, a receiver who cannot find it again is a bug.
        //
        // THE QUARTERBACK CANNOT BE SACKED HERE. Holding the ball for five
        // seconds against a blitz is a sack in most plays (36 of 57, measured),
        // and a whistle at two seconds says nothing about whether a receiver
        // finished his line. His tackle threshold is raised out of reach so
        // the routes run their length under real coverage.
        const at = spotsOf('pass4');
        const record = designed(at);
        const offs = [];
        const ends = [];
        for (const [i, def] of ['cover2', 'cover3', 'cover13', 'zone4', 'zone8', 'zone11'].entries()) {
            seed(100 + i);
            const play = createPlay();
            lineUp(play, record, def);
            byPosition(play, 'qb').settings.tackled = 1e9;
            snap(play);
            const men = ['wr2', 'wr3', 'wr4'].map((pos) => byPosition(play, pos));
            const worst = men.map(() => 0);
            for (let f = 0; f < HZ * 5 && !isDone(play); f += 1) {
                tick(play);
                men.forEach((o, k) => { worst[k] = Math.max(worst[k], offLine(o.coords, o.settings.route.path.points)); });
            }
            offs.push(...worst);
            men.forEach((o) => {
                const pts = o.settings.route.path.points;
                const end = pts[pts.length - 1];
                ends.push(Math.hypot(o.coords.x - end.x, o.coords.y - end.y));
            });
        }
        const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
        expect(median(offs)).toBeLessThan(45);
        expect(median(ends)).toBeLessThan(45);
    });
});

// ---- Who sits out ------------------------------------------------------------

describe('a designed play benches whoever its base benches', () => {
    test('the record and its base agree, and a receiver the base benches sits out', () => {
        const record = { id: 'custom-heavy', base: 'jumbo1', routes: {} };
        const viaRecord = benchedIn(record);
        const viaSlug = benchedIn('jumbo1');
        expect([...viaRecord].sort()).toEqual([...viaSlug].sort());
        expect(viaRecord.size).toBeGreaterThan(0);
        const benched = [...viaSlug].find((p) => PATH_PLAYERS.includes(p));
        expect(benched).toBeDefined();
        expect(sitsOut(benched, record)).toBe(true);
        expect(sitsOut('qb', record)).toBe(false);
        // An unknown base benches nobody, as an unknown slug always has.
        expect(benchedIn({ id: 'custom-x', base: 'nope', routes: {} }).size).toBe(0);
    });
});

// ---- From a finger to a line (Phase 2) ----------------------------------------

describe('from a finger to a line', () => {
    const { smoothSample, simplifyLine, strokeToLine, STROKE, describePlay, layoutFor, drawDesign, FORMATION_TEMPLATES } = D;

    test('the running average takes the first sample whole and then only steps worth keeping', () => {
        const s = {};
        expect(smoothSample(s, [0.5, 0.5])).toEqual([0.5, 0.5]);
        // A wobble smaller than a step is swallowed.
        expect(smoothSample(s, [0.501, 0.5])).toBeNull();
        expect(smoothSample(s, [0.502, 0.501])).toBeNull();
        // A real move comes through, lagging the finger.
        const kept = smoothSample(s, [0.6, 0.5]);
        expect(kept).not.toBeNull();
        expect(kept[0]).toBeGreaterThan(0.5);
        expect(kept[0]).toBeLessThan(0.6);
    });

    test('a jittery straight line simplifies to its two ends, and an L keeps its corner', () => {
        const wobbly = Array.from({ length: 40 }, (_, i) => [i / 40, 0.5 + (i % 2 ? 0.004 : -0.004)]);
        expect(simplifyLine(wobbly, STROKE.epsilon)).toEqual([wobbly[0], wobbly[39]]);
        const ell = [...Array.from({ length: 20 }, (_, i) => [i / 40, 0.5]), ...Array.from({ length: 20 }, (_, i) => [0.5, 0.5 - i / 60])];
        const out = simplifyLine(ell, STROKE.epsilon);
        expect(out).toHaveLength(3);
        expect(out[1]).toEqual([0.5, 0.5]);
        expect(simplifyLine([[0, 0]], 1)).toEqual([[0, 0]]);
        expect(simplifyLine(null, 1)).toEqual([]);
    });

    test('a stroke becomes a line anchored to the man, clamped, capped, or refused when it is a tap', () => {
        const start = [0.2, 0.3];
        expect(strokeToLine([[0.21, 0.3], [0.22, 0.3]], start)).toBeNull();
        expect(strokeToLine(null, start)).toBeNull();
        expect(strokeToLine([[0.5, 0.3]], null)).toBeNull();
        const line = strokeToLine([[0.25, 0.31], [0.5, 0.3], [0.5, -0.2], ['x', 1], [NaN, 0]], start);
        expect(line[0]).toEqual(start);
        expect(line[line.length - 1]).toEqual([0.5, 0]);
        expect(line.length).toBeLessThanOrEqual(MAX_POINTS);
        // A long zigzag is simplified harder until it fits.
        // A zigzag that calms down, so raising the tolerance drops the small
        // wobbles first and keeps the big ones.
        const zig = Array.from({ length: 60 }, (_, i) => [0.2 + i * 0.012, 0.3 + (i % 2 ? 1 : -1) * 0.12 * (1 - i / 60)]);
        const fitted = strokeToLine(zig, start);
        expect(fitted.length).toBeLessThanOrEqual(MAX_POINTS);
        expect(fitted.length).toBeGreaterThanOrEqual(2);
        // ...and a shape with fewer corners than the cap keeps every one.
        const stairs = [];
        for (let i = 1; i <= 6; i += 1) stairs.push([0.2 + i * 0.1, 0.3 + (i % 2) * 0.3], [0.2 + i * 0.1, 0.3 + ((i + 1) % 2) * 0.3]);
        const kept = strokeToLine(stairs, start);
        expect(kept).toHaveLength(13);
    });

    test('the words for a drawing: depth and direction, grouped, blocking for no line, a drop or a rollout for the quarterback', () => {
        const spots = { wr1: [0.19, 0.08], wr2: [0.2, 0.37], wr3: [0.2, 0.58], wr4: [0.2, 0.89], qb: [0.16, 0.49] };
        expect(describePlay({}, spots)).toBe('A, B, C and D blocking');
        expect(describePlay({
            wr1: [[0.19, 0.08], [0.9, 0.08]],          // 3.5 intervals, straight
            wr2: [[0.2, 0.37], [0.45, 0.1]],            // 1.25 intervals, left
            wr3: [[0.2, 0.58], [0.6, 0.9]],             // 2 intervals, right
            qb: [[0.16, 0.49], [0.1, 0.49]],
        }, spots)).toBe('A deep straight, B short left, C medium right, D blocking, QB drop');
        expect(describePlay({ wr1: [[0.19, 0.08], [0.9, 0.08]], wr4: [[0.2, 0.89], [0.9, 0.89]], qb: [[0.16, 0.49], [0.12, 0.95]] }, spots))
            .toBe('A and D deep straight, B and C blocking, QB rollout right');
        // Only the men the formation stands are spoken of.
        expect(describePlay({}, { wr1: [0.19, 0.08], wr2: [0.2, 0.37] })).toBe('A and B blocking');
        expect(describePlay({}, {})).toBe('');
    });

    test('the layout puts the field on the canvas both ways round, and back', () => {
        const flat = layoutFor(300, 150, false);
        const c = flat.toCanvas([0.5, 0]);
        expect(c[0]).toBeCloseTo(150);
        expect(c[1]).toBeCloseTo(150 * 0.08);
        const back = flat.fromCanvas(c[0], c[1]);
        expect(back[0]).toBeCloseTo(0.5);
        expect(back[1]).toBeCloseTo(0);
        // Upright: downfield runs UP the screen, across runs left to right.
        const tall = layoutFor(300, 500, true);
        const bottom = tall.toCanvas([0, 0]);
        const top = tall.toCanvas([1, 0]);
        expect(top[1]).toBeLessThan(bottom[1]);
        const right = tall.toCanvas([0, 1]);
        expect(right[0]).toBeGreaterThan(bottom[0]);
        const again = tall.fromCanvas(...tall.toCanvas([0.3, 0.7]));
        expect(again[0]).toBeCloseTo(0.3);
        expect(again[1]).toBeCloseTo(0.7);
    });

    test('the painter draws the lines, the men in their inks, the ring on the chosen one and the bar where a line stops', () => {
        const calls = [];
        const ctx = new Proxy({ canvas: { width: 300, height: 150 } }, {
            get(t, prop) {
                if (prop in t) return t[prop];
                return (...args) => { calls.push([prop, ...args]); };
            },
            set(t, prop, value) { calls.push(['set', prop, value]); return true; },
        });
        const ink = { ground: '#161d28', lines: 'L', scrimmage: 'S', letters: '#12171f', linemen: 'X', players: { wr1: 'A', wr2: 'B', wr3: 'C', wr4: 'D', qb: 'Q' } };
        const spots = { wr1: [0.19, 0.08], wr2: [0.2, 0.37], qb: [0.16, 0.49], x1: [0.19, 0.44] };
        const routes = { wr2: [[0.2, 0.37], [0.5, 0.37], [0.5, 0.1]] };
        const L = drawDesign(ctx, 300, 150, { spots, routes, ink, selected: 'wr2' });
        expect(L.rotate).toBe(false);
        const strokes = calls.filter((c) => c[0] === 'set' && c[1] === 'strokeStyle').map((c) => c[2]);
        // The scrimmage line, the other lines, B's route in B's ink, and B's ring.
        expect(strokes).toContain('S');
        expect(strokes).toContain('L');
        expect(strokes.filter((s) => s === 'B').length).toBeGreaterThanOrEqual(2);
        expect(strokes).not.toContain('A');
        const fills = calls.filter((c) => c[0] === 'set' && c[1] === 'fillStyle').map((c) => c[2]);
        expect(fills).toContain('A');
        expect(fills).toContain('Q');
        expect(fills).toContain('X');
        const texts = calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
        expect(texts).toEqual(expect.arrayContaining(['A', 'B', 'Q', 'X']));
        expect(texts).not.toContain('C');
        // The bar at the end of B's line: a stroke after the last lineTo.
        const lineTos = calls.filter((c) => c[0] === 'lineTo');
        expect(lineTos.length).toBeGreaterThan(0);
        // An unfinished stroke is dashed and has no bar.
        calls.length = 0;
        drawDesign(ctx, 300, 150, { spots, routes: {}, ink, selected: 'wr1', extra: [[0.19, 0.08], [0.4, 0.08], [0.5, 0.2]] });
        expect(calls.some((c) => c[0] === 'setLineDash' && c[1].length === 2)).toBe(true);
    });

    test('every starting formation is a play the simulation knows, and stands the men somewhere', async () => {
        const { formationSpots } = await import(join(scene, 'playas.js'));
        for (const t of FORMATION_TEMPLATES) {
            expect(OFFENSIVE_PLAYS).toContain(t.base);
            const spots = formationSpots(t.base);
            for (const pos of ['qb', 'wr1', 'wr2']) {
                expect(spots[pos]).toBeDefined();
                expect(spots[pos][0]).toBeGreaterThan(0);
                expect(spots[pos][0]).toBeLessThan(0.3);
            }
        }
        // A record resolves to its base's spots; an unknown base to none.
        expect(formationSpots({ id: 'custom-x', base: 'jumbo1', routes: {} })).toEqual(formationSpots('jumbo1'));
        expect(formationSpots('nope')).toEqual({});
        // The spots are the line-up's own, not a copy that drifts.
        const probe = createPlay();
        seed(9);
        lineUp(probe, 'pass4', 'cover2');
        const b = byPosition(probe, 'wr2');
        const spots = formationSpots('pass4');
        expect(spots.wr2[0]).toBeCloseTo(b.coords.x / M.width, 6);
        expect(spots.wr2[1]).toBeCloseTo(b.coords.y / M.height, 6);
    });
});
