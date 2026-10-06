// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The leaf blower's round (www/leaves/js/round.js) and its score
 * (www/leaves/js/score.js), measured.
 *
 * The round is a pure state machine, so its rules are checked by driving
 * it: the clock waits for the first blow, runs out at exactly sixty seconds,
 * and the result waits for the leaves to land. The score is checked on real
 * yards: a fresh one is all lawn, every leaf is counted once, and the words
 * on the end card keep the house style.
 */
import { installThree } from './helpers/three-stub.mjs';

installThree();
const R = await import('../www/leaves/js/round.js');
const Sc = await import('../www/leaves/js/score.js');
const S = await import('../www/leaves/js/sim.js');
const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');

const RC = C.round;
const tallyOf = (o) => ({ lawn: 0, tarp: 0, street: 0, neighbor: 0, ...o, total: 1000 });

describe('the round', () => {
    test('waits for the first blow, however long the visitor takes', () => {
        const round = R.createRound(RC);
        expect(round.phase).toBe('ready');
        for (let i = 0; i < 600; i++) expect(R.stepRound(round, 0.1, { blowing: false, moving: 0 }, RC)).toBe(null);
        expect(R.timeLeft(round)).toBe(RC.seconds);
        expect(R.stepRound(round, 0.1, { blowing: true, moving: 0 }, RC)).toBe('start');
        expect(round.phase).toBe('playing');
    });

    test('runs for exactly its minute, blowing or not', () => {
        const round = R.createRound(RC);
        R.stepRound(round, 1 / 60, { blowing: true, moving: 0 }, RC);
        let event = null;
        let frames = 0;
        while (!event && frames < 100000) {
            event = R.stepRound(round, 1 / 60, { blowing: frames % 2 === 0, moving: 50 }, RC);
            frames++;
        }
        expect(event).toBe('time-up');
        // Sixty seconds of frames, give or take the one a float sum lands on.
        expect(Math.abs(frames - RC.seconds * 60)).toBeLessThanOrEqual(1);
        expect(R.timeLeft(round)).toBe(0);
        expect(round.phase).toBe('settling');
        expect(R.canBlow(round)).toBe(false);
    });

    test('counts the result only once the leaves have landed, and never waits forever', () => {
        const round = R.createRound(RC);
        R.stepRound(round, 0.1, { blowing: true, moving: 0 }, RC);
        R.stepRound(round, RC.seconds, { blowing: false, moving: 0 }, RC);
        expect(round.phase).toBe('settling');
        // Still, but not yet for the minimum.
        expect(R.stepRound(round, RC.settleMin / 2, { blowing: false, moving: 0 }, RC)).toBe(null);
        expect(R.stepRound(round, RC.settleMin / 2, { blowing: false, moving: 0 }, RC)).toBe('done');
        expect(round.phase).toBe('done');

        // Leaves that never stop moving still get a result at the cap.
        const busy = R.createRound(RC);
        R.stepRound(busy, 0.1, { blowing: true, moving: 0 }, RC);
        R.stepRound(busy, RC.seconds, { blowing: false, moving: 0 }, RC);
        let t = 0;
        let event = null;
        while (!event) {
            event = R.stepRound(busy, 0.1, { blowing: false, moving: 300 }, RC);
            t += 0.1;
        }
        expect(event).toBe('done');
        expect(t).toBeGreaterThan(RC.settleMax - 1e-9);
        expect(t).toBeLessThan(RC.settleMax + 0.15);
    });

    test('the blower runs before and during the round and in free play, never after', () => {
        const round = R.createRound(RC);
        expect(R.canBlow(round)).toBe(true);
        R.stepRound(round, 0.1, { blowing: true, moving: 0 }, RC);
        expect(R.canBlow(round)).toBe(true);
        R.stepRound(round, RC.seconds + 1, { blowing: true, moving: 0 }, RC);
        expect(R.canBlow(round)).toBe(false);
        R.stepRound(round, RC.settleMax, { blowing: true, moving: 0 }, RC);
        expect(round.phase).toBe('done');
        expect(R.canBlow(round)).toBe(false);
        R.freePlay(round);
        expect(R.canBlow(round)).toBe(true);
        // Free play has no clock to run out.
        expect(R.stepRound(round, 1000, { blowing: true, moving: 0 }, RC)).toBe(null);
        expect(round.phase).toBe('free');
        R.resetRound(round);
        expect(round).toEqual(R.createRound(RC));
    });
});

describe('where the leaves are', () => {
    const Y = C.yard;

    test('every region is where the yard says it is', () => {
        expect(Sc.regionOf(0, 0, Y)).toBe('lawn');
        expect(Sc.regionOf(-7, -4, Y)).toBe('tarp');
        expect(Sc.regionOf(12, 0, Y)).toBe('neighbor');
        expect(Sc.regionOf(0, 8, Y)).toBe('street');
        expect(Sc.regionOf(14, 10, Y)).toBe('street');
        // The tarp sits in the back-left corner, against the house and the hedge.
        expect(Y.tarp.minX).toBeLessThan(Y.lawn.minX + 0.1);
        expect(Y.tarp.minZ).toBeLessThan(Y.lawn.minZ + 0.1);
    });

    test('a fresh yard is all lawn, and every leaf is counted once', () => {
        const sim = S.createSim(2000, C);
        S.scatterLeaves(sim, C);
        const t = Sc.tally(sim, Y);
        expect(t).toEqual({ lawn: 2000, tarp: 0, street: 0, neighbor: 0, total: 2000 });
        expect(Sc.clearedShare(t)).toBe(0);
        // Moved leaves are counted where they went.
        sim.px[0] = -7; sim.pz[0] = -4;
        sim.px[1] = 13; sim.pz[1] = 2;
        sim.px[2] = 1; sim.pz[2] = 9;
        const moved = Sc.tally(sim, Y);
        expect(moved).toEqual({ lawn: 1997, tarp: 1, street: 1, neighbor: 1, total: 2000 });
        expect(Sc.clearedShare(moved)).toBeCloseTo(3 / 2000, 12);
    });

    test('a new round lays the very same yard back down', () => {
        const sim = S.createSim(1500, C);
        S.scatterLeaves(sim, C);
        const pose = Float32Array.from(sim.pose);
        const volume = S.pileVolume(sim);
        const blow = S.makeJet(C.blower, 0, 3, 0, -1, true);
        for (let f = 0; f < 60; f++) S.stepSim(sim, 1 / 60, blow);
        expect(sim.stats.woken).toBeGreaterThan(0);
        S.resetSim(sim);
        expect(sim.activeCount).toBe(0);
        expect(S.pileVolume(sim)).toBe(0);
        S.scatterLeaves(sim, C);
        expect(Array.from(sim.pose)).toEqual(Array.from(pose));
        expect(S.pileVolume(sim)).toBeCloseTo(volume, 9);
        expect(S.dirtyRange(sim)).toEqual({ from: 0, to: sim.count });
    });
});

describe('the numbers on the screen', () => {
    test('the cleared share rounds down, so 100% means every leaf', () => {
        expect(Sc.percent(0.999)).toBe(99);
        expect(Sc.percent(1)).toBe(100);
        expect(Sc.percent(0.29)).toBe(29);
        expect(Sc.percent(-0.1)).toBe(0);
    });

    test('the clock counts whole seconds and only reads 0:00 when time is up', () => {
        expect(Sc.clockText(60)).toBe('1:00');
        expect(Sc.clockText(41.2)).toBe('0:42');
        expect(Sc.clockText(9)).toBe('0:09');
        expect(Sc.clockText(0.2)).toBe('0:01');
        expect(Sc.clockText(0)).toBe('0:00');
    });

    test('counts are written the way people read them', () => {
        expect(Sc.formatCount(4210)).toBe('4,210');
        expect(Sc.leaves(1)).toBe('1 leaf');
        expect(Sc.leaves(312)).toBe('312 leaves');
    });
});

describe('what the end card says', () => {
    test('the headline follows how much of the lawn is clear', () => {
        expect(Sc.verdict(tallyOf({ lawn: 50, tarp: 950 })).key).toBe('spotless');
        expect(Sc.verdict(tallyOf({ lawn: 250, tarp: 750 })).key).toBe('great');
        expect(Sc.verdict(tallyOf({ lawn: 500, tarp: 500 })).key).toBe('good');
        expect(Sc.verdict(tallyOf({ lawn: 700, tarp: 300 })).key).toBe('start');
        expect(Sc.verdict(tallyOf({ lawn: 900, tarp: 100 })).key).toBe('leaves');
    });

    test('sending the neighbor a quarter of the yard is the story, however clean the lawn', () => {
        const v = Sc.verdict(tallyOf({ lawn: 0, tarp: 700, neighbor: 300 }));
        expect(v.key).toBe('neighbor');
        expect(v.title).toBe('The neighbors are talking');
    });

    test('the street shortcut is noticed, kindly', () => {
        const street = Sc.verdict(tallyOf({ lawn: 300, tarp: 100, street: 600 }));
        expect(street.line).toMatch(/into the street/);
        const tidy = Sc.verdict(tallyOf({ lawn: 300, tarp: 600, street: 100 }));
        expect(tidy.line).not.toMatch(/street/);
    });

    test('the share sentence leads with the result and tells the better story', () => {
        expect(Sc.shareText(tallyOf({ lawn: 190, tarp: 498, street: 0, neighbor: 312 }), 60))
            .toBe('I cleared 81% of my yard in 60 seconds. 312 leaves went to the neighbor. A leaf blower game on SceneXP.');
        expect(Sc.shareText(tallyOf({ lawn: 600, tarp: 400 }), 60))
            .toBe('I cleared 40% of my yard in 60 seconds. 400 leaves made it onto the tarp. A leaf blower game on SceneXP.');
        expect(Sc.shareText(tallyOf({ lawn: 1000 }), 60))
            .toBe('I cleared 0% of my yard in 60 seconds. A leaf blower game on SceneXP.');
    });

    test('the rows read tarp, street, fence, lawn', () => {
        expect(Sc.resultRows(tallyOf({ lawn: 1, tarp: 2, street: 3, neighbor: 4 })).map((r) => [r.key, r.value]))
            .toEqual([['tarp', '2'], ['street', '3'], ['neighbor', '4'], ['lawn', '1']]);
    });

    test('a screen reader hears the whole result in one sentence', () => {
        expect(Sc.resultSentence(tallyOf({ lawn: 500, tarp: 300, street: 199, neighbor: 1 })))
            .toBe('Respectable work. 50 percent of the lawn cleared, with 300 leaves on the tarp, 199 leaves in the street, and 1 leaf over the fence.');
    });

    test('every word keeps the house style: no em dashes, no semicolons, American spelling', () => {
        const tallies = [
            tallyOf({ lawn: 50, tarp: 950 }), tallyOf({ lawn: 250, tarp: 750 }), tallyOf({ lawn: 500, tarp: 500 }),
            tallyOf({ lawn: 700, tarp: 300 }), tallyOf({ lawn: 900, tarp: 100 }), tallyOf({ tarp: 700, neighbor: 300 }),
            tallyOf({ lawn: 300, tarp: 100, street: 600 })
        ];
        const copy = tallies.flatMap((t) => {
            const v = Sc.verdict(t);
            return [v.title, v.line, Sc.shareText(t, 60), Sc.resultSentence(t), ...Sc.resultRows(t).map((r) => r.label)];
        });
        for (const text of copy) {
            expect(text).not.toMatch(/[—;]/);
            expect(text).not.toMatch(/\b(colour|neighbour|centre|grey|metre)s?\b/i);
        }
    });
});
