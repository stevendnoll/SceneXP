// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The leaf blower's round (www/leaves/js/round.js) and its score
 * (www/leaves/js/score.js), measured.
 *
 * The round is a pure state machine, so its rules are checked by driving
 * it: the clock waits for the first blow, runs out at exactly five minutes
 * (or the moment every leaf is off the lawn),
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

    test('runs for exactly its five minutes, blowing or not, then goes straight to the dive', () => {
        const round = R.createRound(RC);
        R.stepRound(round, 1 / 60, { blowing: true }, RC);
        let event = null;
        let frames = 0;
        while (!event && frames < 100000) {
            event = R.stepRound(round, 1 / 60, { blowing: frames % 2 === 0 }, RC);
            frames++;
        }
        // STEVE'S M4 QA: "once the time runs out, we can just start the dive
        // celebration". No wait for the leaves, and no last word.
        expect(event).toBe('finale');
        // Five minutes of frames, give or take the one a float sum lands on.
        expect(Math.abs(frames - RC.seconds * 60)).toBeLessThanOrEqual(1);
        expect(R.timeLeft(round)).toBe(0);
        expect(round.phase).toBe('finale');
        expect(R.isOver(round)).toBe(true);
        expect(R.canBlow(round)).toBe(false);
    });

    test('the blower runs before and during the round and in free play, never after', () => {
        const round = R.createRound(RC);
        expect(R.canBlow(round)).toBe(true);
        R.stepRound(round, 0.1, { blowing: true }, RC);
        expect(R.canBlow(round)).toBe(true);
        R.stepRound(round, RC.seconds + 1, { blowing: true }, RC);
        expect(round.phase).toBe('finale');
        expect(R.canBlow(round)).toBe(false);
        R.stepRound(round, 0.1, { finaleDone: true }, RC);
        expect(round.phase).toBe('done');
        expect(R.canBlow(round)).toBe(false);
        R.freePlay(round);
        expect(R.canBlow(round)).toBe(true);
        // Free play has no clock to run out.
        expect(R.stepRound(round, 1000, { blowing: true }, RC)).toBe(null);
        expect(round.phase).toBe('free');
        expect(R.isOver(round)).toBe(false);
        R.resetRound(round);
        expect(round).toEqual(R.createRound(RC));
    });
});

// STEVE'S QA, 2026-10-08: "a timed round should end early if the user reaches
// 100%", and the round is three minutes so that they can.
describe('every leaf off the lawn (2026-10-08)', () => {
    // Five minutes since Steve's next QA (2026-10-08): "The goal is for the
    // user to finish, not for it to be super challenging."
    test('the round is five minutes', () => {
        expect(RC.seconds).toBe(300);
    });

    test('ends the round early, into the dive, with the time it took', () => {
        const round = R.createRound(RC);
        R.stepRound(round, 0.1, { blowing: true, spotless: false }, RC);
        for (let i = 0; i < 100; i++) expect(R.stepRound(round, 0.5, { blowing: true, spotless: false }, RC)).toBe(null);
        expect(R.stepRound(round, 0.5, { blowing: true, spotless: true }, RC)).toBe('finale');
        expect(round.spotless).toBe(true);
        expect(round.elapsed).toBeCloseTo(50.5, 6);
        expect(R.timeLeft(round)).toBeCloseTo(RC.seconds - 50.5, 6);
        expect(R.stepRound(round, 0.1, { finaleDone: true }, RC)).toBe('done');
        // A round without a dive goes straight to the card.
        const plain = { ...RC, finale: false };
        const quick = R.createRound(plain);
        R.stepRound(quick, 0.1, { blowing: true }, plain);
        expect(R.stepRound(quick, 1, { spotless: true }, plain)).toBe('done');
    });

    test('only a running clock ends early: not before the first blow, not in free play', () => {
        const round = R.createRound(RC);
        expect(R.stepRound(round, 1, { blowing: false, spotless: true }, RC)).toBe(null);
        expect(round.phase).toBe('ready');
        R.freePlay(round);
        expect(R.stepRound(round, 1, { blowing: true, spotless: true }, RC)).toBe(null);
        expect(round.phase).toBe('free');
        expect(round.spotless).toBe(false);
    });

    test('a new round, or free play, forgets the early finish', () => {
        const round = R.createRound(RC);
        R.stepRound(round, 0.1, { blowing: true }, RC);
        R.stepRound(round, 1, { spotless: true }, RC);
        expect(round.spotless).toBe(true);
        R.resetRound(round);
        expect(round).toEqual(R.createRound(RC));
        R.stepRound(round, 0.1, { blowing: true }, RC);
        R.stepRound(round, 1, { spotless: true }, RC);
        R.freePlay(round);
        expect(round.spotless).toBe(false);
    });

    // STEVE'S QA, 2026-10-08: "1 single leaf will keep the score at 99%.
    // Maybe we can have a slight margin of error where a few leaves don't
    // block 100%?" A tenth of a percent, with a countdown at 99%. Half a
    // percent since his QA of 2026-10-09.
    test('clear means no more than half a percent of the leaves left on the lawn', () => {
        const yard = (lawn, total) => ({ lawn, tarp: total - lawn, street: 0, neighbor: 0, total });
        expect(Sc.SPOTLESS_SHARE).toBe(0.005);
        expect(Sc.leavesAllowed(12000)).toBe(60);
        expect(Sc.leavesAllowed(600)).toBe(3);
        expect(Sc.leavesAllowed(100)).toBe(0);
        expect(Sc.isSpotless(yard(60, 12000))).toBe(true);
        expect(Sc.isSpotless(yard(61, 12000))).toBe(false);
        expect(Sc.isSpotless(yard(3, 600))).toBe(true);
        expect(Sc.isSpotless(yard(4, 600))).toBe(false);
        expect(Sc.isSpotless(yard(0, 100))).toBe(true);
        expect(Sc.isSpotless(yard(1, 100))).toBe(false);
        expect(Sc.isSpotless({ lawn: 0, total: 0 })).toBe(false);
        // 100% exactly when it is clear, and never before.
        expect(Sc.clearedPercent(yard(60, 12000))).toBe(100);
        expect(Sc.clearedPercent(yard(0, 12000))).toBe(100);
        expect(Sc.clearedPercent(yard(61, 12000))).toBe(99);
        expect(Sc.clearedPercent(yard(120, 12000))).toBe(99);
        expect(Sc.clearedPercent(yard(121, 12000))).toBe(98);
        expect(Sc.clearedPercent(yard(12000, 12000))).toBe(0);
    });

    test('at 99% the last few are counted down, and not before or after', () => {
        const yard = (lawn, total) => ({ lawn, tarp: total - lawn, street: 0, neighbor: 0, total });
        expect(Sc.leavesToGo(yard(72, 12000))).toBe(12);
        expect(Sc.toGoText(yard(72, 12000))).toBe('12 leaves to go');
        expect(Sc.toGoText(yard(120, 12000))).toBe('60 leaves to go');
        expect(Sc.toGoText(yard(61, 12000))).toBe('1 leaf to go');
        expect(Sc.toGoText(yard(60, 12000))).toBe('');
        expect(Sc.toGoText(yard(121, 12000))).toBe('');
        expect(Sc.toGoText(yard(1, 100))).toBe('1 leaf to go');
    });

    test('the end card and the share brag about it', () => {
        const v = Sc.verdict(tallyOf({ lawn: 0, tarp: 700, street: 300 }));
        expect(v.key).toBe('perfect');
        expect(v.title).toBe('Not a leaf in sight');
        expect(v.line).not.toMatch(/next door/);
        // A few may be left within the margin, so it never says every last one.
        expect(v.line).not.toMatch(/every last/i);
        expect(Sc.shareText(tallyOf({ lawn: 0, tarp: 1000 }), 167, true))
            .toBe('I cleared 100% of my yard in 2 minutes and 47 seconds. I landed the dive into a pile of 1,000 leaves. A leaf blower game on SceneXP.');
    });

    test('times read the way people say them', () => {
        expect(Sc.durationText(180)).toBe('3 minutes');
        expect(Sc.durationText(60)).toBe('1 minute');
        expect(Sc.durationText(61)).toBe('1 minute and 1 second');
        expect(Sc.durationText(167.4)).toBe('2 minutes and 47 seconds');
        expect(Sc.durationText(47)).toBe('47 seconds');
        expect(Sc.durationText(1)).toBe('1 second');
    });
});

describe('the finale in the round (M3)', () => {
    test('waits for the dive before the end card', () => {
        const round = R.createRound(RC);
        R.stepRound(round, 0.1, { blowing: true }, RC);
        expect(R.stepRound(round, RC.seconds, {}, RC)).toBe('finale');
        for (let i = 0; i < 40; i++) expect(R.stepRound(round, 0.1, { finaleDone: false }, RC)).toBe(null);
        expect(R.stepRound(round, 0.1, { finaleDone: true }, RC)).toBe('done');
    });

    test('never holds the end card past its cap, and a round without one goes straight to it', () => {
        const round = R.createRound(RC);
        R.stepRound(round, 0.1, { blowing: true }, RC);
        R.stepRound(round, RC.seconds, {}, RC);
        let t = 0;
        let event = null;
        while (!event) { event = R.stepRound(round, 0.5, { finaleDone: false }, RC); t += 0.5; }
        expect(event).toBe('done');
        expect(t).toBeLessThan(RC.finaleMax + 0.6);
        const plain = { ...RC, finale: false };
        const quick = R.createRound(plain);
        R.stepRound(quick, 0.1, { blowing: true }, plain);
        expect(R.stepRound(quick, RC.seconds, {}, plain)).toBe('done');
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
        expect(t).toMatchObject({ lawn: 2000, tarp: 0, street: 0, neighbor: 0, total: 2000, sent: 0 });
        expect(Sc.clearedShare(t)).toBe(0);
        // Moved leaves are counted where they went.
        sim.px[0] = -7; sim.pz[0] = -4;
        sim.px[1] = 13; sim.pz[1] = 2;
        sim.px[2] = 1; sim.pz[2] = 9;
        const moved = Sc.tally(sim, Y);
        expect(moved).toMatchObject({ lawn: 1997, tarp: 1, street: 1, neighbor: 1, total: 2000 });
        // Where ours lie on his lawn, for him to aim at.
        expect(moved).toMatchObject({ nearZ: 2, farZ: 2, deepX: 13 });
        expect(Sc.clearedShare(moved)).toBeCloseTo(3 / 2000, 12);
    });

    test('every leaf that went over the fence is counted, even once it has been blown back', () => {
        const sim = S.createSim(500, C);
        S.scatterLeaves(sim, C);
        const sent = new Uint8Array(sim.count);
        sim.px[0] = 12; sim.pz[0] = 1;
        sim.px[1] = 14; sim.pz[1] = -2;
        expect(Sc.tally(sim, Y, sent)).toMatchObject({ neighbor: 2, sent: 2 });
        // He blows one back.
        sim.px[1] = 3;
        const after = Sc.tally(sim, Y, sent);
        expect(after).toMatchObject({ neighbor: 1, sent: 2 });
        // Without the flags, sent is simply who is over there now.
        expect(Sc.tally(sim, Y)).toMatchObject({ neighbor: 1, sent: 1 });
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
        // Six left of a thousand: just short of clear (five may stay).
        const v = Sc.verdict(tallyOf({ lawn: 6, tarp: 694, neighbor: 300 }));
        expect(v.key).toBe('neighbor');
        expect(v.title).toBe('The neighbors are talking');
        // Until it is every last leaf: then that is the headline, and the
        // neighbor gets the line (2026-10-08).
        const all = Sc.verdict(tallyOf({ lawn: 0, tarp: 700, neighbor: 300 }));
        expect(all.key).toBe('perfect');
        expect(all.line).toMatch(/yard next door/);
    });

    test('the street shortcut is noticed, kindly', () => {
        const street = Sc.verdict(tallyOf({ lawn: 300, tarp: 100, street: 600 }));
        expect(street.line).toMatch(/into the street/);
        const tidy = Sc.verdict(tallyOf({ lawn: 300, tarp: 600, street: 100 }));
        expect(tidy.line).not.toMatch(/street/);
    });

    test('the share sentence leads with the result and tells the better story', () => {
        expect(Sc.shareText(tallyOf({ lawn: 190, tarp: 498, street: 0, neighbor: 312 }), 180))
            .toBe('I cleared 81% of my yard in 3 minutes. 312 leaves went to the neighbor. A leaf blower game on SceneXP.');
        expect(Sc.shareText(tallyOf({ lawn: 600, tarp: 400 }), 180))
            .toBe('I cleared 40% of my yard in 3 minutes. 400 leaves made it onto the tarp. A leaf blower game on SceneXP.');
        expect(Sc.shareText(tallyOf({ lawn: 1000 }), 180))
            .toBe('I cleared 0% of my yard in 3 minutes. A leaf blower game on SceneXP.');
    });

    test('the rows read tarp, street, fence, lawn', () => {
        expect(Sc.resultRows(tallyOf({ lawn: 1, tarp: 2, street: 3, neighbor: 4 })).map((r) => [r.key, r.value]))
            .toEqual([['tarp', '2'], ['street', '3'], ['neighbor', '4'], ['lawn', '1']]);
    });

    test('a screen reader hears the whole result in one sentence', () => {
        expect(Sc.resultSentence(tallyOf({ lawn: 500, tarp: 300, street: 199, neighbor: 1 })))
            .toBe('Respectable work. 50 percent of the lawn cleared, with 300 leaves on the tarp, 199 leaves in the street, and 1 leaf sent over the fence.');
    });

    test('every word keeps the house style: no em dashes, no semicolons, American spelling', () => {
        const tallies = [
            tallyOf({ lawn: 50, tarp: 950 }), tallyOf({ lawn: 250, tarp: 750 }), tallyOf({ lawn: 500, tarp: 500 }),
            tallyOf({ lawn: 700, tarp: 300 }), tallyOf({ lawn: 900, tarp: 100 }), tallyOf({ tarp: 700, neighbor: 300 }),
            tallyOf({ lawn: 300, tarp: 100, street: 600 }), tallyOf({ lawn: 0, tarp: 1000 }),
            tallyOf({ lawn: 0, tarp: 600, neighbor: 400 })
        ];
        const copy = tallies.flatMap((t) => [null, true, false].flatMap((landed) => {
            const v = Sc.verdict(t);
            return [v.title, v.line, Sc.shareText(t, 167, landed), Sc.resultSentence(t, landed), Sc.diveLine(landed),
                ...Sc.resultRows(t).map((r) => r.label)];
        }));
        for (const text of copy) {
            expect(text).not.toMatch(/[—;]/);
            expect(text).not.toMatch(/\b(colour|neighbour|centre|grey|metre)s?\b/i);
        }
    });
});
