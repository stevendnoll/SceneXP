// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-celebration.test.mjs
 *
 * WHAT HAPPENS AFTER THE TWO WHISTLES THAT HAVE NO TACKLE IN THEM.
 *
 * Every case here asserts a property that was measurably WRONG in the first
 * build of celebration.js, and not one of them would have shown up in a
 * screenshot, because the whole thing is four seconds of movement on figures
 * about thirty pixels tall. They were found by driving the real simulation
 * headlessly over four thousand pass plays and reading the numbers out, which
 * is the only reason they were found at all:
 *
 *   - two of the six hand poses were UNREACHABLE, landing the hand 167mm and
 *     139mm from where the pose asked for it, because "inside the arm's reach"
 *     is the wrong test for a sideways target (see `hands` in config.js)
 *   - `fit` shortened a celebration to fit the time budget and wrote the new
 *     duration over the NAME of the dance, so the animation went on running at
 *     the old length and would have been cut off by the result card
 *   - two men mobbing from the same direction were sent to the same point on
 *     the ring and stood 0.00m apart, with nothing left running to separate
 *     them once the play is dead
 *   - clamping to the touchline AFTER separating undid the separating, leaving
 *     a pair 0.05m apart on the paint
 *   - reduced motion got a shorter celebration rather than a still one, hops
 *     and all
 *   - a man whose destination was five centimetres away was given no time to
 *     travel and therefore took the whole five centimetres on one frame
 *
 * The suite is written as properties rather than as restatements. Nothing here
 * asserts that `ring` is 1.95; it asserts that nobody ends up standing inside
 * anybody, which keeps failing whatever the layout becomes.
 */
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { installThree } from './helpers/three-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scene = join(here, '..', 'www', 'xo', 'js');

installThree();

const { XO_CONFIG: CFG, FIELD, simToWorld } = await import(join(scene, 'config.js'));
const {
    chooseCelebration, celebrationAt, celebrationLength, weightedPick, DANCES, MODES,
    occasionFor, OCCASIONS,
} = await import(join(scene, 'celebration.js'));
const { takedownRest, takedownAt, tacklerFor } = await import(join(scene, 'takedown.js'));
const { solveArm, handAt, elbowAt, RIG, reach } = await import(join(scene, 'arm.js'));
const { carryHold, sackerRise } = await import(join(scene, 'view.js'));
const { poseFigure, THROWING_SIDE } = await import(join(scene, 'roster.js'));
const { endSounds } = await import(join(scene, 'scoring.js'));
const {
    createPlay, lineUp, snap, tick, isDone, throwTo, outcome, eligibleReceivers,
    ballCarrier,
} = await import(join(scene, 'play.js'));

const C = CFG.pose.celebration;
const FIELD_LEN = FIELD.lineInterval * FIELD.segments;
const BOUNDS = {
    minX: -FIELD.endZone + 0.8,
    maxX: FIELD_LEN + FIELD.endZone - 0.8,
    halfZ: FIELD.width / 2 - 0.6,
};

/** A repeatable stream, so a failure can be reproduced from its seed rather
 *  than being a different celebration every run. */
function rolls(seed) {
    let s = seed;
    return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
    };
}

/** A plan over invented but plausible people, for the cases that are about the
 *  arithmetic rather than about the game. */
function planFor({ roll, scored = false, calm = false, mates = 9, spread = 9 } = {}) {
    const pick = roll || rolls(7);
    const hero = { position: 'db1', x: 16, z: 1.5 };
    const team = [];
    for (let i = 0; i < mates; i += 1) {
        // Deterministic, and deliberately crowded: several of them start well
        // inside a body width of each other.
        const a = (i / mates) * Math.PI * 2;
        team.push({
            position: `m${i}`,
            x: hero.x + Math.cos(a) * (2 + (i % 3) * spread * 0.3),
            z: hero.z + Math.sin(a) * (1.4 + (i % 4) * spread * 0.25),
        });
    }
    return chooseCelebration({
        hero,
        mates: team,
        // A FULL OTHER TEAM, not a token two, because the stagger is capped at
        // `staggerMax` and two men never reach the cap. The first version of
        // this fixture had two, and a shake whose window was a fixed stretch
        // rather than "whatever is left" passed every case here while leaving
        // the men at the back of a real eleven frozen mid-swing.
        rivals: [
            { position: 'qb', x: 4, z: 0 },
            ...Array.from({ length: 10 }, (_, i) => ({
                position: `r${i}`,
                x: 6 + i * 1.7,
                z: -6 + ((i * 2.3) % 12),
            })),
        ],
        homeX: -FIELD.endZone + C.endZoneDepth,
        toward: -1,
        blameAt: { x: 4, z: 0 },
        crowdAt: { x: -FIELD.endZone - 8, z: hero.z },
        bounds: BOUNDS,
        scored,
        calm,
        roll: pick,
    });
}

/** One of every mode and dance, so no case below depends on a lucky roll. */
function everyPlan(opts = {}) {
    const out = [];
    for (let seed = 1; seed <= 60; seed += 1) {
        const plan = planFor({ ...opts, roll: rolls(seed * 977) });
        if (plan) out.push(plan);
    }
    return out;
}

const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const closestPair = (points) => {
    let worst = Infinity;
    for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
            worst = Math.min(worst, gap(points[i], points[j]));
        }
    }
    return worst;
};

// ---------------------------------------------------------------------------

describe('every hand the celebration asks for is one the arm can reach', () => {
    /**
     * THE TEST THAT WAS WRITTEN FIRST AND WAS THE WRONG TEST.
     *
     * "Is the target inside `reach()`" passes for all six poses, and two of
     * them were still 150mm out. `solveArm` clamps `armZ` at a right angle, and
     * at a right angle the hand's SIDEWAYS offset comes from the upper-arm term
     * alone rather than from the whole limb, which shrinks fast as the elbow
     * bends. The only honest question is where the hand actually lands, so this
     * runs the solver and then runs it backwards.
     */
    const poses = { ...C.hands, raise: CFG.pose.raise.hand };

    for (const [name, hand] of Object.entries(poses)) {
        test(`the ${name} pose puts the hand where it asked for it`, () => {
            for (const side of [1, -1]) {
                const target = { x: side * hand.x, y: hand.y, z: hand.z };
                const a = solveArm(target, side);
                const got = handAt(a.armX, a.armZ, a.foreX, side);
                const miss = Math.hypot(got.x - target.x, got.y - target.y,
                    got.z - target.z);
                expect(miss).toBeLessThan(0.001);
                // AND THE ELBOW IS NOT IN HIS CHEST. Every hand sits outside
                // its own shoulder, which is what a 2-DOF shoulder needs in
                // order to get there without carrying the upper arm across the
                // body (see `throwHold` in config.js for the round that cost).
                expect(Math.abs(hand.x)).toBeGreaterThan(RIG.shoulderX - 0.001);
            }
        });
    }

    test('nothing is asked for at a fully locked arm', () => {
        // A target at exactly full stretch is a straight arm and a division by
        // very nearly zero, which arm.js says in as many words.
        for (const hand of Object.values(poses)) {
            const d = Math.hypot(hand.x - RIG.shoulderX, hand.y - RIG.shoulderY, hand.z);
            expect(d).toBeLessThan(reach() - 0.005);
        }
    });
});

describe('the plan fits the time it says it does', () => {
    test('no celebration outlasts the agreed budget', () => {
        for (const plan of everyPlan()) {
            expect(celebrationLength(plan)).toBeLessThanOrEqual(C.cap + 1e-9);
            expect(celebrationLength(plan)).toBeGreaterThan(C.beat + C.danceFloor);
        }
    });

    /**
     * THE ONE THAT CATCHES THE NAME COLLISION.
     *
     * `fit` shortens the dance so the whole thing lands inside `cap`, and it
     * used to write those seconds over the plan's `dance`, which was the NAME
     * of the dance. Nothing threw. The animation went on being drawn against
     * the CONFIGURED duration while the game held the frame for the SHORTENED
     * one, so a squeezed celebration was cut off by the result card partway
     * through: a man frozen mid-spin, facing the wrong way, under the card.
     *
     * Asked as the property that matters rather than as "is dance a string":
     * at the moment the plan says it is over, nobody is still moving.
     */
    test('when the plan says it is over, everybody has landed and stopped', () => {
        for (const plan of everyPlan()) {
            const end = celebrationAt(celebrationLength(plan), plan);
            expect(end.size).toBeGreaterThan(0);
            for (const [position, part] of end) {
                expect(Math.abs(part.y)).toBeLessThan(1e-6);
                expect(Math.abs(part.roll)).toBeLessThan(1e-6);
                expect(part.running).toBe(false);
                // A spin ends on a whole number of turns, so the man is facing
                // the way the plan meant him to rather than three quarters of
                // the way round it.
                const turns = (part.spin || 0) / (Math.PI * 2);
                expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-6);
                expect(position).toBeTruthy();
            }
        }
    });

    test('nobody is still travelling once the dance has started', () => {
        for (const plan of everyPlan()) {
            for (const part of plan.parts) {
                const arrived = plan.beat + part.delay + part.travel;
                const at = celebrationAt(arrived + 1e-6, plan).get(part.position);
                expect(at.running).toBe(false);
                // ...and he is exactly where he was sent, not most of the way.
                expect(Math.abs(at.x - part.dx)).toBeLessThan(1e-6);
                expect(Math.abs(at.z - part.dz)).toBeLessThan(1e-6);
            }
        }
    });

    /**
     * NOBODY MOVES ON THE FRAME THE WHISTLE GOES.
     *
     * A destination under five centimetres away is treated as no journey, so
     * the man is not charged `travel.min` for standing still. That left the
     * five centimetres in the offset, and a part with no duration counts as
     * having arrived, so those men took the whole distance on frame one.
     * Measured, 38 of 400 plans had somebody do it.
     */
    test('the first frame of a celebration moves nobody', () => {
        for (const plan of everyPlan()) {
            for (const part of celebrationAt(0, plan).values()) {
                expect(Math.hypot(part.x, part.z)).toBeLessThan(1e-9);
                expect(part.y).toBeLessThan(1e-9);
                expect(part.amount).toBeLessThan(1e-9);
            }
        }
    });
});

describe('nobody ends up standing inside anybody', () => {
    /**
     * NOTHING SEPARATES BODIES AFTER THE WHISTLE, and that is the whole reason
     * this has to be checked here. `play.separate` runs from `tick`, `tick`
     * returns the moment the play is dead, and a celebration is the only time
     * in this game that men move with nothing keeping them apart.
     *
     * Asserted against where they STARTED rather than against a flat number,
     * because the simulation itself leaves pairs about 1.3m apart at the
     * whistle (it deliberately skips its own separation pass on that frame, see
     * `play.tick`). The celebration may not make that worse.
     */
    /**
     * NINE TENTHS OF A BODY, OR AT LEAST AS FAR APART AS THEY STARTED.
     *
     * `relax` is a relaxation: each pass closes half of every overlap it finds,
     * so it approaches a body width rather than reaching it. `play.separate` is
     * the same algorithm and its own note records the same behaviour measured
     * against the live game, 1.4m held against a 1.5m request. Demanding the
     * whole body here would be demanding more of the celebration than the game
     * asks of itself while the play is running.
     *
     * The second half of the bar is the one that cannot be argued with: a
     * celebration may never make the crowding WORSE, whatever it inherited.
     */
    const roomEnough = (plan) => {
        const before = closestPair(plan.parts.map((p) => p.from));
        const after = closestPair(plan.parts.map((p) => p.to));
        expect(after).toBeGreaterThan(Math.min(before, C.body * 0.9) - 0.01);
    };

    test('a celebration never leaves the field more crowded than it found it', () => {
        for (const plan of everyPlan()) roomEnough(plan);
    });

    test('a mob rings the man rather than piling on him', () => {
        // Nine men coming from every direction, several of them from nearly the
        // same bearing, which is the case that put two on the same ring point.
        for (const plan of everyPlan()) {
            if (plan.mode !== 'mob') continue;
            const hero = plan.parts.find((p) => p.lead);
            const joined = plan.parts.filter((p) => !p.lead
                && gap(p.to, hero.to) < C.ring + 0.01);
            for (const man of joined) {
                expect(gap(man.to, hero.to)).toBeGreaterThan(C.body * 0.5);
            }
            expect(closestPair(joined.map((p) => p.to)))
                .toBeGreaterThan(joined.length > 1 ? C.body - 0.01 : 0);
        }
    });

    test('nobody is sent off the paint', () => {
        for (const plan of everyPlan()) {
            for (const part of plan.parts) {
                expect(part.to.x).toBeGreaterThanOrEqual(BOUNDS.minX - 1e-9);
                expect(part.to.x).toBeLessThanOrEqual(BOUNDS.maxX + 1e-9);
                expect(Math.abs(part.to.z)).toBeLessThanOrEqual(
                    Math.max(BOUNDS.halfZ, Math.abs(part.from.z)) + 1e-9
                );
            }
        }
    });

    /**
     * AND THE TOUCHLINE IS PART OF THE SEPARATING RATHER THAN SOMETHING DONE
     * AFTERWARDS.
     *
     * Clamping once at the end undid the separation: two men near the same
     * sideline were both pulled back to the same z, so a pair that had just
     * been pushed a body apart finished 5cm apart instead. This drives men who
     * are ALREADY outside the paint, which is the shape that found it.
     */
    test('men pulled back onto the field are still pushed apart', () => {
        const hero = { position: 'db1', x: 18, z: 0 };
        const crowd = [];
        for (let i = 0; i < 6; i += 1) {
            crowd.push({ position: `m${i}`, x: 22 + i * 0.05, z: -(11 + i * 0.4) });
        }
        const plan = chooseCelebration({
            hero, mates: crowd, rivals: [],
            homeX: -FIELD.endZone + C.endZoneDepth, toward: -1,
            bounds: BOUNDS,
            // Every mode, because each one lands these men differently.
            roll: rolls(31),
        });
        const before = closestPair([hero, ...crowd]);
        const after = closestPair(plan.parts.map((p) => p.to));
        // They start inside each other AND outside the touchline, which is the
        // combination that matters: pulling them back onto the paint is what
        // squeezes them from 0.40m down to 0.05m, and a separation that runs
        // before the clamp rather than between the clamps never sees it.
        expect(before).toBeLessThan(C.body);
        for (const man of crowd) expect(Math.abs(man.z)).toBeGreaterThan(BOUNDS.halfZ);
        /**
         * NINE TENTHS OF A BODY, AND NOT A WHOLE ONE, AND THAT IS THE RIGHT BAR
         * RATHER THAN A CLIMBDOWN.
         *
         * This is a relaxation: each pass closes half of every overlap, so it
         * approaches the request rather than reaching it. `play.separate` is the
         * same algorithm and its own note records the same result measured
         * against the live game, 1.4m against a 1.5m request. Six men stacked
         * five centimetres apart OUTSIDE the touchline is well past anything the
         * simulation produces, and getting them from 0.05m to within a tenth of
         * a body is the honest thing to ask of it.
         *
         * The bar that matters for real play is the case above, which asks that
         * a celebration never leaves the field more crowded than it found it,
         * and is driven by the actual simulation further down.
         */
        expect(after).toBeGreaterThan(C.body * 0.9);
    });
});

describe('a man pinned on the touchline', () => {
    /**
     * FOUND BY THE REAL-PLAY CASE BELOW, ONE RUN IN TWENTY. A mob's hero stood
     * just inside the touchline and a mate's ring spot fell outside it, so the
     * fence put the mate on the line 1.28m from the hero. Every relaxation pass
     * then pushed the mate straight back out, away from a hero who is pinned,
     * and every fence put him straight back. Nobody moved, and the pair finished
     * inside the bar. Its simplest form is rebuilt here, so it no longer depends
     * on the simulation happening to roll it, and it fails against the old
     * relaxation at 1.27m.
     */
    test('is pushed along the line rather than into it', () => {
        const hero = { position: 'wr1', x: 27.88, z: -8.63 };
        // Straight toward the line from him, which is the shape that sticks: the
        // push has no sideways part at all to creep free with.
        const mate = { position: 'x1', x: 27.88, z: -9.6 };
        // 0.5 is a mob, then any dance.
        const seq = [0.5, 0.1];
        const plan = chooseCelebration({
            hero, mates: [mate], rivals: [], homeX: FIELD_LEN, toward: 1,
            bounds: BOUNDS, roll: () => (seq.length ? seq.shift() : 0.5),
        });
        expect(plan.mode).toBe('mob');
        const to = plan.parts.map((p) => p.to);
        expect(closestPair(to)).toBeGreaterThan(C.body * 0.9);
        for (const p of to) expect(Math.abs(p.z)).toBeLessThanOrEqual(BOUNDS.halfZ + 1e-9);
    });
});

describe('somebody who asked not to be moved about is not moved about', () => {
    test('a calm celebration travels nowhere and never leaves the ground', () => {
        for (let seed = 1; seed <= 20; seed += 1) {
            const plan = planFor({ calm: true, roll: rolls(seed * 13) });
            expect(plan.mode).toBe('solo');
            for (const part of plan.parts) {
                expect(Math.hypot(part.dx, part.dz)).toBe(0);
                expect(part.travel).toBe(0);
            }
            for (let t = 0; t <= plan.length; t += 0.02) {
                for (const at of celebrationAt(t, plan).values()) {
                    expect(Math.abs(at.y)).toBe(0);
                    expect(Math.abs(at.spin)).toBe(0);
                    expect(Math.abs(at.roll)).toBe(0);
                }
            }
        }
    });

    test('...but he is still told what happened', () => {
        const plan = planFor({ calm: true, roll: rolls(5) });
        const at = celebrationAt(plan.length, plan);
        // Arms up, held, which is the pose doing the work the motion would
        // otherwise have done.
        expect(at.get('db1').arms).toBe('up');
        expect(at.get('db1').amount).toBeCloseTo(1, 6);
    });
});

describe('who celebrates, and what the ball does while they do', () => {
    test('only the man holding it can hold it up, and only in one dance', () => {
        /**
         * THE INVARIANT `carryHold` DEPENDS ON. The ball is pinned to a fixed
         * point in the rig's own space rather than to the hand, so an arm that
         * leaves the tuck while still carrying leaves the ball hanging beside a
         * man who is plainly not holding it. It is the same rule the stiff-arm
         * follows (`stiffSide` in roster.js).
         */
        for (const plan of everyPlan()) {
            for (let t = 0; t <= plan.length; t += 0.05) {
                for (const [position, at] of celebrationAt(t, plan)) {
                    if (!at.raised) continue;
                    expect(position).toBe(plan.hero);
                    expect(plan.dance).toBe('bow');
                    expect(at.arms).toBe('up');
                }
            }
        }
    });

    test('the ball rises with the arm rather than jumping to the top', () => {
        const tuck = carryHold('tuck', 1).ball;
        const top = carryHold('raise', 1, 1).ball;
        // At no lift at all it is exactly where a tucked ball sits, so the
        // first frame of a celebration does not move it.
        expect(carryHold('raise', 1, 0).ball).toMatchObject({ y: tuck.y });
        expect(top.y).toBeCloseTo(CFG.pose.raise.ball.y, 6);
        let last = -Infinity;
        for (let t = 0; t <= 1.0001; t += 0.1) {
            const y = carryHold('raise', 1, t).ball.y;
            expect(y).toBeGreaterThanOrEqual(last - 1e-9);
            last = y;
        }
        expect(top.y).toBeGreaterThan(tuck.y);
    });

    /**
     * THE LOSING TEAM MAY NOT LOOK LIKE IT IS CELEBRATING, WHICH IS QA ROUND
     * TWENTY-EIGHT ITEMS 2 AND 3, REPORTED TWICE BECAUSE IT HAPPENS BOTH WAYS.
     *
     * The first version put their hands on their helmets, which is the picture
     * a person imagines and is the wrong one to DRAW: at 34 pixels a hand
     * beside the head and a hand raised in triumph are the same silhouette. QA
     * saw the offense appear to celebrate its own interception, and then the
     * defense appear to celebrate a touchdown against it.
     *
     * The gate is the property that broke rather than the pose that replaced
     * it: nothing about a man who has just lost the ball may go UP.
     */
    test('nothing about the losing team goes up', () => {
        const hand = (h) => {
            const a = solveArm({ x: h.x, y: h.y, z: h.z }, 1);
            return handAt(a.armX, a.armZ, a.foreX, 1);
        };
        const grief = hand(C.hands.slump);
        const joy = hand(C.hands.up);

        // Below the shoulder, so it can never read as a raised arm...
        expect(grief.y).toBeLessThan(RIG.shoulderY);
        // ...and a long way below where a celebrant's hand is.
        expect(joy.y - grief.y).toBeGreaterThan(0.5);

        // ...and it arrives slower than the celebration does, because shoulders
        // come down more slowly than arms go up.
        expect(C.dejection.sink).toBeGreaterThan(C.blend * 2);
    });

    /**
     * AND NOTHING ELSE ABOUT HIM GOES UP EITHER, WHICH IS NOW THE WHOLE OF IT.
     *
     * A forward pitch was tried, at 0.16 and then at 0.40, because the
     * arithmetic said the arms could not carry this on their own: a running arm
     * already hangs lower than any reachable dejected pose. QA watched the 0.40
     * version and asked for it gone, because the rig has no waist and a lean is
     * the whole body tipping about its feet, which at 23 degrees reads as
     * falling over. `dejection.lean` is 0.
     *
     * So the property is no longer "he sinks", it is "he does none of the four
     * things a celebrant does". He does not rise, he does not travel, he does
     * not turn away, and his hands stay below his shoulders. That is the
     * contrast, and it holds whatever the lean is set to later.
     */
    test('a dejected man does none of the things a celebrant does', () => {
        for (const plan of everyPlan()) {
            for (let t = 0; t <= plan.length; t += 0.05) {
                const at = celebrationAt(t, plan);
                for (const s of plan.slump) {
                    const man = at.get(s.position);
                    expect(man.y).toBe(0);                       // never leaves the ground
                    expect(Math.hypot(man.x, man.z)).toBe(0);    // never travels
                    expect(man.running).toBe(false);
                    expect(man.raised).toBe(false);              // never holds the ball up
                    expect(man.arms).toBe('slump');
                }
            }
        }
        // ...and a celebrant does at least one of them, or there is no contrast
        // to have. The hop is the one every celebration has.
        expect(C.hop.height).toBeGreaterThan(0.2);
    });

    /**
     * AND HE STAYS UPRIGHT, WHICH IS A CEILING RATHER THAN A VALUE.
     *
     * Asserting `lean === 0` would be a restatement of the config and would
     * catch nothing, because the next person to change it changes both. The
     * real property is that the rig has NO WAIST: a lean tips the whole figure
     * about its feet, so past a certain angle it stops reading as sagging and
     * starts reading as falling over. QA met that at 0.40 and asked for it
     * gone.
     *
     * The ceiling is the largest lean any STANDING pose in this game already
     * asks for. A man waiting at a whistle may not be pitched further forward
     * than a man actively driving into a block, which leaves room for a subtle
     * version if anybody wants one and fails against both amounts that were
     * tried and rejected.
     */
    test('a man watching a whistle is not leaning further than a man blocking', () => {
        const standing = Math.max(
            CFG.pose.block.lean, CFG.pose.stiffArm.lean, CFG.pose.underCentre.lean
        );
        expect(C.dejection.lean).toBeLessThanOrEqual(standing);
    });

    /**
     * ...AND THE ELBOW IS CHECKED, NOT ONLY THE HAND, WHICH IS THE SECOND TIME
     * THIS POSE HAS BEEN WRONG.
     *
     * The hands-on-hips version passed every assertion above: the hand sat at
     * the waist, well below the shoulder, exactly where it was asked for. Its
     * ELBOW landed 0.02m ABOVE the shoulder and 0.23m behind it, which is a
     * horizontal upper arm jutting backwards, and QA reported it as "their arms
     * out behind them". A hand position says nothing about where the limb went,
     * and at 34 pixels the upper arm is the bigger part of the outline.
     */
    test('the dejected upper arm hangs, rather than jutting out behind him', () => {
        const limb = (h) => {
            const a = solveArm({ x: h.x, y: h.y, z: h.z }, 1);
            return { hand: handAt(a.armX, a.armZ, a.foreX, 1), elbow: elbowAt(a.armX, a.armZ, 1) };
        };
        const grief = limb(C.hands.slump);
        // The upper arm points DOWN, by most of its own length, which is what
        // "hanging toward the ground" means for a limb rather than for a hand.
        const drop = RIG.shoulderY - grief.elbow.y;
        expect(drop).toBeGreaterThan(RIG.upper * 0.75);
        // ...and it is not swung out behind him either.
        expect(Math.abs(grief.elbow.z)).toBeLessThan(RIG.upper * 0.5);

        // A celebrating arm is the opposite on both counts, which is the
        // contrast the whole pose exists to make.
        const joy = limb(C.hands.up);
        expect(joy.elbow.y).toBeGreaterThan(grief.elbow.y);
        expect(joy.hand.y).toBeGreaterThan(grief.hand.y + 0.5);
    });

    /**
     * NOBODY IS LEFT FACING THE WRONG WAY.
     *
     * The head shake is the whole body, because the shared rig has no neck
     * joint, and it is applied through the same `spin` the celebration's turn
     * uses. The pose is HELD through the settle, so a shake that stops mid
     * swing freezes a man turned away from everything for the rest of the card.
     * The window each man gets is what remains after he has finished sinking,
     * which differs per man because they are staggered.
     */
    test('a head shake always finishes square', () => {
        for (const plan of everyPlan()) {
            const end = celebrationAt(plan.length, plan);
            for (const s of plan.slump) {
                const man = end.get(s.position);
                expect(Math.abs(man.spin)).toBeLessThan(1e-6);
                // ...and he is fully sunk by then rather than still on his way.
                // Whatever the lean is set to, it has fully arrived by now
                // rather than still easing in. It is 0 today; this keeps
                // working if it is ever turned back up.
                expect(man.lean).toBeCloseTo(C.dejection.lean, 6);
                expect(man.amount).toBeCloseTo(1, 6);
            }
        }
    });

    test('the shake never runs past the end of the plan', () => {
        for (const plan of everyPlan()) {
            for (const s of plan.slump) {
                // Sampled right through, the swing has to peak and come back
                // inside the plan rather than being cut off at its edge.
                let last = 0;
                let turned = 0;
                for (let t = 0; t <= plan.length; t += 0.02) {
                    last = celebrationAt(t, plan).get(s.position).spin;
                    turned = Math.max(turned, Math.abs(last));
                }
                expect(Math.abs(last)).toBeLessThan(C.dejection.shake.yaw * 0.25);
                expect(turned).toBeLessThanOrEqual(C.dejection.shake.yaw + 1e-9);
            }
        }
    });

    test('a calm celebration shakes nobody', () => {
        const plan = planFor({ calm: true, roll: rolls(9) });
        for (let t = 0; t <= plan.length; t += 0.02) {
            for (const s of plan.slump) {
                expect(celebrationAt(t, plan).get(s.position).spin).toBe(0);
            }
        }
        // The POSTURE still arrives, because that is not motion for its own
        // sake, it is what happened.
        expect(celebrationAt(plan.length, plan).get('qb').lean)
            .toBeCloseTo(C.dejection.lean, 6);
    });

    test('the other team watches rather than joining in', () => {
        const plan = planFor({ roll: rolls(3) });
        const celebrating = new Set(plan.parts.map((p) => p.position));
        const watching = new Set(plan.slump.map((s) => s.position));
        expect(watching.size).toBeGreaterThan(0);
        for (const position of watching) expect(celebrating.has(position)).toBe(false);

        const at = celebrationAt(plan.length, plan);
        for (const position of watching) {
            const man = at.get(position);
            // Arms down and held, and standing exactly where the whistle left
            // him. No lean any more: see the case above for why that term is 0.
            expect(man.arms).toBe('slump');
            expect(man.amount).toBeCloseTo(1, 6);
            expect(Math.hypot(man.x, man.z)).toBe(0);
            // He is given a POINT to look at rather than an angle, because only
            // the caller knows where a man who has not moved is standing.
            expect(man.face).toBeNull();
            expect(man.watch).toBeTruthy();
        }
    });

    test('a fifty is never celebrated by running to an end zone he is in', () => {
        expect(C.scoredWeights.house).toBe(0);
        for (let seed = 1; seed <= 80; seed += 1) {
            const plan = planFor({ scored: true, roll: rolls(seed * 101) });
            expect(plan.mode).not.toBe('house');
        }
    });
});

describe('the modes and dances come up, and only the ones that should', () => {
    test('a weight of zero never comes up and every other one does', () => {
        const weights = { a: 3, b: 0, c: 1 };
        const seen = new Set();
        for (let i = 0; i <= 200; i += 1) seen.add(weightedPick(weights, i / 200));
        expect(seen.has('b')).toBe(false);
        expect(seen.has('a')).toBe(true);
        expect(seen.has('c')).toBe(true);
        // Roughly in proportion, which is what makes the run home rare.
        let as = 0;
        for (let i = 0; i < 1000; i += 1) if (weightedPick(weights, i / 1000) === 'a') as += 1;
        expect(as / 1000).toBeCloseTo(0.75, 1);
        expect(weightedPick({ a: 0 }, 0.5)).toBe('');
    });

    test('a visitor who keeps intercepting sees more than one of each', () => {
        const modes = new Set();
        const dances = new Set();
        for (const plan of everyPlan()) {
            modes.add(plan.mode);
            dances.add(plan.dance);
        }
        // The replayability this exists for: every mode and every dance is
        // reachable, so a second interception is not the first one again.
        // The modes a PICK can come up as, which is every weighted one. `team`
        // belongs to a play clock running out and is checked with it.
        const weighted = Object.keys(C.weights).filter((k) => C.weights[k] > 0);
        expect([...modes].sort()).toEqual(weighted.sort());
        expect(MODES).toEqual(expect.arrayContaining(weighted));
        expect([...dances].sort()).toEqual([...DANCES].sort());
    });

    test('every dance is one poseFigure can actually run', () => {
        /**
         * DRIVEN AGAINST A FIGURE OF PLAIN OBJECTS, for the reason
         * xo-gameplay.test.mjs gives at length: the Three stub is a Proxy
         * that swallows every assignment, so a pose written onto a stubbed mesh
         * is invisible and a test built on one cannot tell a pose from a no-op.
         *
         * A dance whose `arms` name has no entry in `hands` would silently fall
         * back to the bow rather than throwing, so the check is that the arms
         * MOVED and landed somewhere finite.
         */
        const arm = (side) => ({
            userData: {
                armSide: side,
                restX: 0.1,
                restZ: side * 0.15,
                forearm: { rotation: { x: 0, y: 0, z: 0 } },
            },
            rotation: { x: 0, y: 0, z: 0 },
        });
        const build = () => ({ userData: { arms: [arm(1), arm(-1)] } });

        const names = new Set(['up', 'wide', 'point', 'low', 'slump']);
        for (const arms of names) {
            for (const carry of ['none', 'tuck', 'raise']) {
                const f = build();
                const still = build();
                for (let i = 0; i < 40; i += 1) {
                    poseFigure(f, 0, 0, { carry, celebrate: { arms, amount: 1 } }, 1 / 60);
                    poseFigure(still, 0, 0, { carry }, 1 / 60);
                }
                const free = f.userData.arms.find((a) => a.userData.armSide !== THROWING_SIDE);
                const was = still.userData.arms.find((a) => a.userData.armSide !== THROWING_SIDE);
                for (const a of f.userData.arms) {
                    expect(Number.isFinite(a.rotation.x)).toBe(true);
                    expect(Number.isFinite(a.rotation.z)).toBe(true);
                    expect(Number.isFinite(a.userData.forearm.rotation.x)).toBe(true);
                }
                // The free arm celebrated rather than standing there.
                expect(Math.abs(free.rotation.x - was.rotation.x)
                    + Math.abs(free.rotation.z - was.rotation.z)).toBeGreaterThan(0.05);
            }
        }
    });

    test('a carrying arm keeps the ball, and a raising one takes it with him', () => {
        const arm = (side) => ({
            userData: {
                armSide: side,
                restX: 0.1,
                restZ: side * 0.15,
                forearm: { rotation: { x: 0, y: 0, z: 0 } },
            },
            rotation: { x: 0, y: 0, z: 0 },
        });
        const build = () => ({ userData: { arms: [arm(1), arm(-1)] } });
        const ballArm = (f) => f.userData.arms.find((a) => a.userData.armSide === THROWING_SIDE);

        const tucked = build();
        const celebrating = build();
        const raising = build();
        for (let i = 0; i < 60; i += 1) {
            poseFigure(tucked, 0, 0, { carry: 'tuck' }, 1 / 60);
            poseFigure(celebrating, 0, 0,
                { carry: 'tuck', celebrate: { arms: 'wide', amount: 1 } }, 1 / 60);
            poseFigure(raising, 0, 0,
                { carry: 'raise', celebrate: { arms: 'up', amount: 1 } }, 1 / 60);
        }
        // A man dancing with the ball clamped has not moved the arm holding it.
        expect(ballArm(celebrating).rotation.x).toBeCloseTo(ballArm(tucked).rotation.x, 6);
        expect(ballArm(celebrating).rotation.z).toBeCloseTo(ballArm(tucked).rotation.z, 6);
        // ...and a man holding it up plainly has.
        expect(Math.abs(ballArm(raising).rotation.x - ballArm(tucked).rotation.x))
            .toBeGreaterThan(0.2);
    });
});

/**
 * THE WHISTLE SOUNDS AT THE WHISTLE. QA ROUND TWENTY-EIGHT, ITEMS 1 AND 4.
 *
 * Both are the same shape: a sound that belongs to a MOMENT was being raised
 * from a function that runs much later, or raised at all for a play in which
 * the thing it depicts never happened.
 */
describe('the sounds belong to the moment the play ended', () => {
    /**
     * ITEM 4. A PLAY CLOCK RUNNING OUT IS A SACK WITH NOBODY IN IT.
     *
     * `classifyPlay` calls it a sack, correctly, because nobody threw it and
     * nobody ran with it. `endSounds` then handed every untackled sack a grunt,
     * so the game played the sound of a man being driven into the turf over a
     * play in which the quarterback stood untouched in the pocket while the
     * clock reached zero.
     */
    test('a play clock running out whistles and does not grunt', () => {
        const timedOut = endSounds({ result: 'sack', points: -5 }, false, true);
        expect(timedOut.whistle).toBe(true);
        expect(timedOut.grunt).toBe(false);
    });

    test('...and a real sack still does both', () => {
        // A quarterback brought down holding it: `state.tackled` is set, so a
        // takedown runs and the grunt plays on the frame of contact instead.
        expect(endSounds({ result: 'sack', points: -5 }, true, false).grunt).toBe(false);
        // And one with no takedown to hang it on keeps the grunt it always had,
        // which is the case this rule must not have broken.
        expect(endSounds({ result: 'sack', points: -5 }, false, false).grunt).toBe(true);
    });

    test('the clock only ever silences the grunt, never the whistle', () => {
        for (const slug of ['sack', 'run', 'catch', 'interception', 'incomplete']) {
            for (const points of [-10, -5, 0, 15, 50]) {
                const result = { result: slug, points };
                const normal = endSounds(result, false, false);
                const expired = endSounds(result, false, true);
                expect(expired.whistle).toBe(normal.whistle);
                expect(expired.grunt === false || normal.grunt === true).toBe(true);
            }
        }
    });

    /**
     * ITEM 1, AND THIS ONE IS STRUCTURAL BECAUSE THE FAULT IS.
     *
     * Nothing is wrong with what `endSounds` decides. What was wrong is WHERE
     * it was asked: `finishPlay` runs after the entire settle hold, so a fifty
     * played the whistle once the celebration was over, four seconds after the
     * play it was whistling. It is the same fault the grunt already had and the
     * same fix `startTakedown` made for it.
     *
     * There is no behavioural seam to assert this through: `main.js` reaches
     * the path only with a renderer, a roster and a live simulation behind it,
     * and a headless boot builds none of those (tests/xo-pose.test.mjs
     * has the long note on why). So the gate reads the source, extracts
     * `finishPlay`'s body by matching braces rather than by guessing at an
     * index, and asserts the sounds are not in it. It fails against the build
     * QA heard.
     */
    test('finishPlay raises no sounds, because it is not the whistle', () => {
        const source = readFileSync(join(scene, 'main.js'), 'utf8');
        const body = (name) => {
            const at = source.indexOf(`function ${name}(`);
            expect(at).toBeGreaterThan(-1);
            let depth = 0;
            let start = -1;
            for (let i = at; i < source.length; i += 1) {
                if (source[i] === '{') { if (depth === 0) start = i; depth += 1; }
                else if (source[i] === '}') {
                    depth -= 1;
                    if (depth === 0) return source.slice(start, i + 1);
                }
            }
            return '';
        };
        // Long enough that the extraction plainly worked, which is the check a
        // brace scan needs before anything is concluded from what it found.
        const finish = body('finishPlay');
        expect(finish.length).toBeGreaterThan(200);
        expect(finish).toContain('saveGame');
        expect(finish).not.toMatch(/playSound\s*\(/);
        expect(finish).not.toMatch(/endSounds\s*\(/);

        // ...and the settle, which IS the whistle, does raise them.
        const settle = body('beginSettle');
        expect(settle.length).toBeGreaterThan(200);
        expect(settle).toMatch(/endTheDown\s*\(/);
        expect(body('endTheDown')).toMatch(/playSound\s*\(\s*'whistle'/);
    });
});

/**
 * AND THE SAME QUESTIONS AGAINST THE REAL GAME, because everything above is
 * driven by invented people standing in invented places.
 *
 * This runs the ported simulation until it produces the two endings that have
 * no tackle in them, and builds the plan main.js would have built. It is the
 * only case here that can catch a celebration that is correct in the abstract
 * and impossible on this field.
 */
describe('against real interceptions and real fifties', () => {
    const PLAYS = ['pass1', 'pass2', 'pass3', 'pass4', 'pass5', 'pass6', 'pass7', 'pass8'];

    function harvest(want, limit) {
        const play = createPlay();
        const out = [];
        const roll = rolls(20260914);
        for (let i = 0; i < 2500 && out.length < limit; i += 1) {
            lineUp(play, PLAYS[i % PLAYS.length], '');
            snap(play);
            let thrown = false;
            const wait = 20 + Math.floor(roll() * 60);
            for (let f = 0; f < 1200 && !isDone(play); f += 1) {
                if (!thrown && f >= wait) {
                    const able = eligibleReceivers(play);
                    if (able.length) {
                        throwTo(play, able[Math.floor(roll() * able.length)]);
                        thrown = true;
                    }
                }
                tick(play);
            }
            const result = outcome(play);
            const scored = result.points === 50;
            const picked = result.result === 'interception';
            if (want === 'fifty' ? !scored : !picked) continue;
            const carrier = ballCarrier(play);
            if (!carrier) continue;

            const at = (o) => {
                const w = simToWorld(o.coords.x, o.coords.y, 0);
                return { position: o.settings.position, x: w.x, z: w.z };
            };
            const on = play.game.objects.filter((o) => !o.settings.benched
                && o.settings.position !== 'ball');
            const side = carrier.settings.team;
            const qb = play.game.objects.find(
                (o) => o.settings.position === 'qb' && !o.settings.benched
            );
            const hero = at(carrier);
            const plan = chooseCelebration({
                hero,
                mates: on.filter((o) => o !== carrier && o.settings.team === side).map(at),
                rivals: on.filter((o) => o.settings.team !== side).map(at),
                homeX: side === 0
                    ? FIELD_LEN + FIELD.endZone - C.endZoneDepth
                    : -FIELD.endZone + C.endZoneDepth,
                toward: side === 0 ? 1 : -1,
                blameAt: picked && qb ? at(qb) : null,
                crowdAt: { x: -FIELD.endZone - 8, z: hero.z },
                bounds: BOUNDS,
                scored,
                roll,
            });
            if (plan) out.push({ plan, side });
        }
        return out;
    }

    const picks = harvest('pick', 40);
    const fifties = harvest('fifty', 40);

    test('the simulation still produces both endings to celebrate', () => {
        // If this ever goes empty the two cases below are passing vacuously,
        // which is how a suite ends up guarding nothing at all.
        expect(picks.length).toBeGreaterThan(20);
        expect(fifties.length).toBeGreaterThan(20);
    });

    test('a real celebration fits the budget and leaves everybody on the grass', () => {
        for (const { plan } of [...picks, ...fifties]) {
            expect(plan.length).toBeLessThanOrEqual(C.cap + 1e-9);
            for (const at of celebrationAt(plan.length, plan).values()) {
                expect(Math.abs(at.y)).toBeLessThan(1e-6);
                expect(at.running).toBe(false);
            }
            const before = closestPair(plan.parts.map((p) => p.from));
            const after = closestPair(plan.parts.map((p) => p.to));
            // Same bar as the invented people above, and the same reasoning.
            expect(after).toBeGreaterThan(Math.min(before, C.body * 0.9) - 0.01);
        }
    });

    /**
     * A RUN HOME RUNS TOWARD THE CAMERA, WHICH IS THE WHOLE REASON THE MODE IS
     * AFFORDABLE.
     *
     * The play camera stands beyond the near end line at negative x, so a
     * defense breaking for its own end zone grows in the frame the whole way.
     * Reversed, the mode costs the same four seconds and spends them on eleven
     * men shrinking into the distance.
     */
    test('a defense running home runs at the near end line, never away from it', () => {
        const homes = picks.filter(({ plan }) => plan.mode === 'house');
        for (const { plan } of homes) {
            for (const part of plan.parts) {
                expect(part.to.x).toBeLessThanOrEqual(part.from.x + 1e-9);
                expect(part.to.x).toBeGreaterThanOrEqual(-FIELD.endZone);
            }
        }
    });

    test('an interception is addressed to the man who threw it', () => {
        for (const { plan } of picks) {
            if (plan.mode === 'house') continue;   // that one faces the crowd
            const hero = plan.parts.find((p) => p.lead);
            // He ends up looking back upfield at the quarterback rather than
            // downfield at nobody.
            expect(hero.faceAt.x).toBeLessThan(hero.to.x);
        }
    });
});

/**
 * THE DEFENSE'S TWO: A SACK, AND A PLAY CLOCK RUNNING OUT.
 *
 * Both are what `classifyPlay` calls a sack, and they are opposite pictures. A
 * sack is a tackle, so the takedown plays first and the party waits for it,
 * which is the part most likely to go wrong without anybody seeing why: any
 * entry the celebration hands the view during the dive takes over the diving
 * man's facing, his block and his lunge. An expired clock has nobody in it at
 * all and gets the small version on purpose, so its properties are all about
 * what it does NOT do.
 *
 * Driven by the real simulation with a quarterback who never throws, which is
 * how both endings are made: measured, 61% of those plays are sacked and the
 * rest run out the clock.
 */
describe('the defense celebrates a sack and a play clock running out', () => {
    const S = C.sack;
    const E = C.expired;

    /** The plan main.js builds at the whistle, for the two defensive endings. */
    function defensivePlan(play, roll) {
        const result = outcome(play);
        const qb = ballCarrier(play);
        const objs = play.game.objects;
        const tackled = play.playState.state.tackled && qb ? tacklerFor(objs, qb) : '';
        const occasion = occasionFor(result, !!tackled, !!play.expired);
        if (occasion !== 'sack' && occasion !== 'expired') return null;
        const at = (o) => {
            const w = simToWorld(o.coords.x, o.coords.y, 0);
            return { position: o.settings.position, x: w.x, z: w.z };
        };
        const on = objs.filter((o) => !o.settings.benched && o.settings.position !== 'ball');
        const name = occasion === 'sack' ? tackled : tacklerFor(objs, qb);
        const sacker = on.find((o) => o.settings.position === name);
        const mates = on.filter((o) => o !== sacker && o.settings.team === sacker.settings.team).map(at);
        const rivals = on.filter((o) => o.settings.team !== sacker.settings.team);
        if (occasion === 'expired') {
            return {
                occasion,
                qb: at(qb),
                plan: chooseCelebration({
                    occasion, hero: at(sacker), mates, rivals: rivals.map(at), roll,
                }),
            };
        }
        const rest = takedownRest(at(sacker), at(qb));
        const floor = S.floor.map((d) => ({ x: rest.carrier.x - d, z: rest.carrier.z }));
        return {
            occasion,
            rest,
            floor,
            plan: chooseCelebration({
                occasion,
                hero: { position: sacker.settings.position, ...rest.tackler },
                mates,
                rivals: rivals.filter((o) => o !== qb).map(at),
                blameAt: rest.carrier,
                floor,
                bounds: BOUNDS,
                wait: rest.length,
                roll,
            }),
        };
    }

    const sacks = [];
    const clocks = [];
    {
        const play = createPlay();
        const roll = rolls(20260915);
        const PLAYS = ['pass1', 'pass2', 'pass3', 'pass4', 'pass5', 'pass6', 'pass7', 'pass8'];
        for (let i = 0; i < 400 && (sacks.length < 40 || clocks.length < 25); i += 1) {
            lineUp(play, PLAYS[i % PLAYS.length], '');
            snap(play);
            for (let f = 0; f < 1200 && !isDone(play); f += 1) tick(play);
            const got = defensivePlan(play, roll);
            if (!got || !got.plan) continue;
            if (got.occasion === 'sack' && sacks.length < 40) sacks.push(got);
            if (got.occasion === 'expired' && clocks.length < 25) clocks.push(got);
        }
    }

    test('the simulation still produces both endings', () => {
        // Or every case below passes against nothing.
        expect(sacks.length).toBeGreaterThan(20);
        expect(clocks.length).toBeGreaterThan(10);
    });

    test('a sack and an expired clock are told apart, and nothing else is either', () => {
        const sack = { result: 'sack', points: -5 };
        expect(occasionFor(sack, true, false)).toBe('sack');
        expect(occasionFor(sack, false, true)).toBe('expired');
        // A hit on the frame the clock runs out is a hit: it is what is drawn.
        expect(occasionFor(sack, true, true)).toBe('sack');
        // The render loop's own backstop ending a play earned nobody anything.
        expect(occasionFor(sack, false, false)).toBe('');
        expect(occasionFor({ result: 'interception', points: -10 }, true, false)).toBe('pick');
        expect(occasionFor({ result: 'catch', points: 50 })).toBe('fifty');
        expect(occasionFor({ result: 'catch', points: 15 }, true)).toBe('');
        expect(occasionFor({ result: 'incomplete', points: 0 }, false, true)).toBe('');
        expect(occasionFor(null)).toBe('');
        for (const o of ['pick', 'fifty', 'sack', 'expired']) expect(OCCASIONS).toContain(o);
    });

    /**
     * NOBODY IS HANDED ANYTHING WHILE THE TACKLE IS STILL HAPPENING.
     *
     * Not "zero offsets", NOTHING: the view reads any entry at all as "this man
     * is celebrating", which clears his lunge and hands his facing to the plan.
     * A map of zeroes through the wait would turn the sacker round mid-dive.
     */
    test('the party waits for the tackle, and hands the view nothing until it ends', () => {
        for (const { plan, rest } of sacks) {
            expect(plan.wait).toBeCloseTo(rest.length, 9);
            for (let t = 0; t < plan.wait; t += 0.02) {
                expect(celebrationAt(t, plan).size).toBe(0);
            }
            expect(celebrationAt(plan.wait + 1e-6, plan).size).toBeGreaterThan(0);
        }
    });

    test('a sack fits its own shorter budget, tackle included', () => {
        for (const { plan } of sacks) {
            expect(plan.length).toBeLessThanOrEqual(S.cap + 1e-9);
            // ...and still has room to get up and put his arms up.
            expect(plan.length).toBeGreaterThan(plan.wait + S.rise + C.danceFloor);
            expect(S.cap).toBeLessThan(C.cap);
            const end = celebrationAt(plan.length, plan);
            for (const at of end.values()) {
                expect(Math.abs(at.y)).toBeLessThan(1e-6);
                expect(at.running).toBe(false);
            }
        }
    });

    /**
     * HE IS UP BEFORE HE CELEBRATES. A man doing the bow face down on the grass
     * is the picture this guards against: the takedown's pitch would still be
     * holding him flat while his arms went up.
     */
    test('the sacker gets all the way up before his arms go up, and only he gets up', () => {
        for (const { plan } of sacks) {
            let last = -1;
            for (let t = plan.wait; t <= plan.length; t += 0.02) {
                const at = celebrationAt(t, plan);
                const hero = at.get(plan.hero);
                expect(hero.stand).toBeGreaterThanOrEqual(last - 1e-9);
                last = hero.stand;
                if (hero.arms) expect(hero.stand).toBeCloseTo(1, 6);
                for (const [position, man] of at) {
                    if (position !== plan.hero) expect(man.stand).toBeUndefined();
                }
            }
            expect(last).toBeCloseTo(1, 6);
        }
    });

    test('nobody on the defense lifts a ball the quarterback is still holding', () => {
        for (const { plan } of [...sacks, ...clocks]) {
            for (let t = 0; t <= plan.length; t += 0.05) {
                for (const man of celebrationAt(t, plan).values()) {
                    expect(man.raised).toBe(false);
                }
            }
        }
    });

    test('the sacker is addressing the quarterback he put down, who is left lying there', () => {
        for (const { plan, rest } of sacks) {
            const hero = plan.parts.find((p) => p.lead);
            expect(hero.faceAt).toEqual(rest.carrier);
            // He celebrates from where he landed rather than walking off it.
            expect(Math.hypot(hero.dx, hero.dz)).toBe(0);
            // The quarterback is in nobody's part and nobody's slump, so the
            // view leaves him on his back.
            expect(celebrationAt(plan.length, plan).has('qb')).toBe(false);
        }
    });

    /**
     * NOBODY IS SENT TO STAND ON HIM. Same nine tenths of a body the rest of
     * this suite uses, for the same reason, and only for men the plan MOVED:
     * one who was standing there at the whistle and is sent nowhere is the
     * simulation's placement, not the celebration's.
     */
    test('nobody is sent to stand on the quarterback lying on the grass', () => {
        let moved = 0;
        for (const { plan, floor } of sacks) {
            for (const part of plan.parts) {
                if (part.lead || (part.dx === 0 && part.dz === 0)) continue;
                moved += 1;
                const before = Math.min(...floor.map((f) => gap(part.from, f)));
                const after = Math.min(...floor.map((f) => gap(part.to, f)));
                expect(after).toBeGreaterThan(Math.min(before, C.body * 0.9) - 0.01);
            }
        }
        expect(moved).toBeGreaterThan(0);
    });

    test('the sacker getting up unwinds the dive, and nothing else changes it', () => {
        const lean = CFG.pose.takedown.tacklerLean;
        // No party: the tackle is drawn exactly as it always was.
        expect(sackerRise(lean, null)).toEqual({ stand: 0, pitch: lean, tackle: 1 });
        // A party entry with no `stand` in it is nothing to do with him.
        expect(sackerRise(lean, { lean: 0.13 }).pitch).toBe(lean);
        // Halfway up is halfway up, and all the way up is upright, plus a jab.
        expect(sackerRise(lean, { stand: 0.5 }).pitch).toBeCloseTo(lean / 2, 9);
        expect(sackerRise(lean, { stand: 1, lean: 0.13 })).toEqual({ stand: 1, pitch: 0.13, tackle: 0 });
        // And he is not left lying there by the takedown itself, which holds its
        // pitch however long after the whistle it is asked.
        expect(takedownAt(60, { x: 0, z: 0 }, { x: 1.8, z: 0 }).tackler.lean).toBeCloseTo(lean, 9);
    });

    /**
     * THE SMALL ONE STAYS SMALL. Every property here is a thing it does not do,
     * because nobody made a play: no lead dance, no travel, no turning, no run.
     */
    test('an expired clock is arms up where they stand, and over quickly', () => {
        for (const { plan, qb } of clocks) {
            expect(plan.mode).toBe('team');
            expect(plan.length).toBeLessThanOrEqual(E.cap + 1e-9);
            expect(E.cap).toBeLessThan(S.cap);
            for (const part of plan.parts) {
                expect(part.travel).toBe(0);
                expect(Math.hypot(part.dx, part.dz)).toBe(0);
                expect(part.dance).toBe('bow');
            }
            const end = celebrationAt(plan.length, plan);
            for (const part of plan.parts) {
                const man = end.get(part.position);
                expect(man.arms).toBe('up');
                expect(man.face).toBeNull();
                expect(man.stand).toBeUndefined();
            }
            // The quarterback stood there untouched, so he sags with the rest.
            expect(end.get(qb.position).arms).toBe('slump');
            for (const s of plan.slump) expect(end.get(s.position).watch).toBeFalsy();
        }
    });

    test('an expired clock under reduced motion does not hop', () => {
        for (const { plan } of clocks.slice(0, 5)) {
            const calm = chooseCelebration({
                occasion: 'expired',
                hero: { position: plan.hero, ...plan.parts.find((p) => p.lead).from },
                mates: plan.parts.filter((p) => !p.lead).map((p) => ({ position: p.position, ...p.from })),
                rivals: [],
                calm: true,
            });
            for (let t = 0; t <= calm.length; t += 0.02) {
                for (const man of celebrationAt(t, calm).values()) expect(man.y).toBe(0);
            }
        }
    });
});
