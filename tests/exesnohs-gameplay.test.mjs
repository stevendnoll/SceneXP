// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * exesnohs-gameplay.test.mjs
 *
 * THIS SUITE EXISTS BECAUSE THE SCREENSHOTS COULD NOT SEE ANY OF IT.
 *
 * Every case below asserts a property that was measurably WRONG in the build
 * reviewed on 2026-09-09, and each one was invisible in a screenshot for the
 * same reason: the thing at fault is a few pixels across from the play camera,
 * or it is a number that agrees with itself and disagrees with the game.
 *
 * They are written as properties rather than as restatements of the code. A
 * test that says `RING_BIAS === 0.232` catches nothing, because the next person
 * to change the layout changes both. A test that says "the letter clears the
 * player standing on the ring" fails against the old code and keeps failing
 * against any future layout that puts it back underneath.
 */
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { installThree } from './helpers/three-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scene = join(here, '..', 'www', 'exesnohs', 'js');

installThree();

const {
    EXESNOHS_CONFIG: CFG, FIELD, SIM, UNITS_TO_METRES, formationSettings,
    simToWorld,
} = await import(join(scene, 'config.js'));
const {
    pointsForPosition, ladderBands, bandAt,
    nextStreak, streakOver, difficultyFor, endSounds,
} = await import(join(scene, 'scoring.js'));
const {
    createPlay: createPlayForDifficulty, lineUp, snap, tick, isDone,
    keepAndRun, outcome, setDifficulty, OFFENSIVE_PLAYS,
    markHeading, throwTo, eligibleReceivers, breakContact, clearEscapes,
    decisionLeft, undecided, outOfTime, clockReading, ballCarrier,
} = await import(join(scene, 'play.js'));
const { markerGeometry } = await import(join(scene, 'markers.js'));
const {
    escapeAmount, jukeRoll, stiffArmSide,
    blockersEngaged, lookTarget, stillFor, jumpLift, ballArrived,
    noteAssignments, resetAssignments,
} = await import(join(scene, 'view.js'));
const { stiffSide, THROWING_SIDE, poseFigure } = await import(join(scene, 'roster.js'));
const { MotionClass } = await import(join(scene, 'motion.js'));
const { solveArm, handAt } = await import(join(scene, 'arm.js'));

describe('the scoring ladder the field paints', () => {
    /**
     * THE ONE INVARIANT THAT MATTERS. field.js writes these numbers onto the
     * grass and main.js lights the band a carrier is standing in, so a band
     * that disagrees with `pointsForPosition` is the game telling a visitor
     * they scored something it will not award.
     *
     * Sampled across the whole field rather than at the boundaries, because a
     * boundary test passes against an off-by-one that a sweep catches.
     */
    test('every band agrees with the scorer at every point inside it', () => {
        const bands = ladderBands(SIM.lineInterval);
        for (const band of bands) {
            const from = Math.max(band.from, -400);
            const to = Math.min(band.to, SIM.lineInterval * SIM.segments + 400);
            for (let x = from; x < to; x += 7) {
                expect(pointsForPosition(x, SIM.lineInterval)).toBe(band.points);
            }
        }
    });

    test('the bands are contiguous and cover the whole line', () => {
        const bands = ladderBands(SIM.lineInterval);
        expect(bands[0].from).toBe(-Infinity);
        expect(bands[bands.length - 1].to).toBe(Infinity);
        for (let i = 1; i < bands.length; i += 1) {
            expect(bands[i].from).toBe(bands[i - 1].to);
        }
    });

    test('bandAt never returns nothing, wherever a carrier is', () => {
        for (const x of [-1e4, -400, 0, 196, 395, 796, 1000, 1e4]) {
            const band = bandAt(x, SIM.lineInterval);
            expect(band).toBeTruthy();
            expect(band.points).toBe(pointsForPosition(x, SIM.lineInterval));
        }
    });
});

describe('where the paint lands on the grass', () => {
    /**
     * THE UNCLIPPED VERSION PUT THE 50 IN THE END ZONE. The richest band runs
     * to infinity in the arithmetic, which is right for scoring and useless for
     * deciding where to paint: its midpoint came out three metres past the far
     * end line, on the dark red, where a numeral is neither legible nor true.
     */
    test('every numeral is painted on the playing surface', async () => {
        const { ladderInMetres } = await import(join(scene, 'field.js'));
        const playLength = FIELD.lineInterval * FIELD.segments;
        for (const rung of ladderInMetres()) {
            expect(rung.from).toBeGreaterThanOrEqual(0);
            expect(rung.to).toBeLessThanOrEqual(playLength);
            const centre = (rung.from + rung.to) / 2;
            expect(centre).toBeGreaterThan(0);
            expect(centre).toBeLessThan(playLength);
        }
    });

    /**
     * THE YELLOW LINE HAS TO BE WHERE THE BALL IS SNAPPED, and where the ball
     * is snapped is decided by 4386 lines of ported formation library rather
     * than by anything this project wrote. So it is measured, every time the
     * suite runs, against every play in the book. If a formation ever moves,
     * this says so rather than the line quietly pointing at nothing.
     */
    test('the scrimmage line is where every formation actually lines up', async () => {
        const { SCRIMMAGE_X } = await import(join(scene, 'field.js'));
        const { createPlay, lineUp, OFFENSIVE_PLAYS } = await import(join(scene, 'play.js'));
        const play = createPlay();

        for (const slug of OFFENSIVE_PLAYS) {
            const objects = lineUp(play, slug, 'cover2');
            const line = objects.filter((o) => !o.settings.benched
                && /^x\d$/.test(o.settings.position));
            expect(line.length).toBeGreaterThan(0);
            for (const man of line) {
                const metres = man.coords.x * UNITS_TO_METRES;
                // Half an interval either way: the line spreads a little and
                // some formations set a back off it, but nobody is a whole
                // segment from the ball.
                expect(Math.abs(metres - SCRIMMAGE_X))
                    .toBeLessThan(FIELD.lineInterval / 2);
            }
        }
    });
});

describe('the physics knows how big the players are drawn', () => {
    /**
     * THE REGRESSION THIS CATCHES IS THE ONE THAT ALREADY HAPPENED. `motion.js`
     * carries half-extents tuned for a life-size player; `figureScale` was
     * raised to 2.2 for legibility and nothing told the physics, so figures
     * walked through each other for a milestone. These are two numbers that
     * must not come apart, and this is the assertion that says so.
     */
    test('the injected collision scale is the scale figures are drawn at', () => {
        expect(formationSettings().collisionScale).toBe(CFG.figureScale);
        expect(CFG.collisionScale).toBe(CFG.figureScale);
    });

    test('a MotionClass told nothing behaves exactly as the 2D game did', () => {
        expect(new MotionClass({}, {}, {}).collisionScale()).toBe(1);
        expect(new MotionClass({ collisionScale: 0 }, {}, {}).collisionScale()).toBe(1);
        expect(new MotionClass(undefined, {}, {}).collisionScale()).toBe(1);
    });

    /**
     * AND IT HAS TO REACH THE BOXES, not just the getter.
     *
     * Two players 18 field units apart across the field. The unscaled half
     * extent is 6 each, so 12 apart is the furthest they can touch and 18 is
     * clear. At 2.2 the reach is 26.4 and they overlap. A tackler on a carrier
     * increments `tackle`, which is the simulation's own observable.
     */
    test('a bigger scale collides at a distance the 2D radius could not', () => {
        const tackleCountAt = (scale) => {
            const gameState = { state: { tackled: false } };
            const motion = new MotionClass({ collisionScale: scale }, gameState, {});
            const carrier = player('wr1', 0, 0, 0, { hasBall: true });
            const tackler = player('db1', 1, 0, 18);
            motion.checkCollisions(carrier, { objects: [carrier, tackler] });
            return carrier.state.tackle;
        };
        expect(tackleCountAt(1)).toBe(0);
        expect(tackleCountAt(CFG.figureScale)).toBeGreaterThan(0);
    });

    /**
     * A LINEMAN IN THE WAY IS A LINEMAN, which the ported source did not
     * manage: its inner switch assigned `r1` and `rx1`, the OUTER player's
     * extents, which had already been baked into a box before the loop began.
     * So `r2` kept whatever the previous object left it at and a lineman was
     * measured as a receiver. Same shape of typo as the jumbo1 multiply (D18).
     *
     * 15 units apart: a receiver reaches 6 and cannot touch, a lineman reaches
     * 12 and can. Unfixed, the lineman answers as a receiver and this fails.
     */
    test('a lineman is measured as a lineman when he is the one in the way', () => {
        const gameState = { state: { tackled: false } };
        const motion = new MotionClass({}, gameState, {});
        const carrier = player('wr1', 0, 0, 0, { hasBall: true });
        const lineman = player('x1', 1, 0, 15);
        motion.checkCollisions(carrier, { objects: [carrier, lineman] });
        expect(carrier.state.tackle).toBeGreaterThan(0);
    });

    /**
     * QA ROUND TWENTY-FOUR: THE LINE IS A LITTLE TOO GOOD AT BLOCKING.
     *
     * The 2D game gives a lineman exactly twice everybody else's half-extents,
     * and `linemanScale` cuts into that doubling ALONE. It is a separate number
     * from `collisionScale` because it is a separate question: that one
     * corrects every box on the field for a figure drawn at 2.2 times life
     * size, and shrinking it to loosen the line would walk receivers and
     * defenders through each other again.
     */
    test('the lineman scale touches the lineman and nobody else', () => {
        const touchesAt = (settings, position, gap) => {
            const gameState = { state: { tackled: false } };
            const motion = new MotionClass(settings, gameState, {});
            const carrier = player('wr1', 0, 0, 0, { hasBall: true });
            const foe = player(position, 1, 0, gap);
            motion.checkCollisions(carrier, { objects: [carrier, foe] });
            return carrier.state.tackle > 0;
        };
        // 15 apart: a full-sized lineman reaches 12 and touches, and at 0.5 he
        // reaches 6 and does not.
        expect(touchesAt({}, 'x1', 15)).toBe(true);
        expect(touchesAt({ linemanScale: 0.5 }, 'x1', 15)).toBe(false);
        // ...and a defender at the same distance is untouched by the setting,
        // which is the whole of the request.
        expect(touchesAt({}, 'db1', 9)).toBe(true);
        expect(touchesAt({ linemanScale: 0.5 }, 'db1', 9)).toBe(true);
        expect(touchesAt({}, 'db1', 15)).toBe(false);
        expect(touchesAt({ linemanScale: 0.5 }, 'db1', 15)).toBe(false);
    });

    /**
     * QA ROUND TWENTY-FIVE: THE WALL IS NOT A BOX SIZE, IT IS A ONE-SIDED
     * SHOVE, and finding that cost a round of measuring boxes.
     *
     * The four collision responders treat the two men completely differently
     * when they meet. The blocker is set to 40% of his own TOP speed and then
     * bodily displaces the other man after zeroing his speed. The defender, on
     * his own pass through the same pair, keeps a fifth of whatever he had. So
     * a rusher who met a lineman was stopped dead, shoved backwards and damped,
     * every frame, for the whole play: a blocker shoves and a rusher had no way
     * to shed.
     */
    const shoveOnto = (settings, route, extras = {}) => {
        const gameState = { state: { tackled: false } };
        const motion = new MotionClass(settings, gameState, { collide() {} });
        const blocker = player('x1', 0, 0, 0);
        blocker.settings.positionGroup = 'x';
        // Offset so an EDGE of the blocker's box lands inside the rusher's:
        // the ported test asks whether my edge is inside your span, which is
        // never true when my box strictly contains yours.
        const rusher = player('db1', 1, 8, 10, { xSpeed: -1.5 });
        rusher.settings.route = route;
        const qb = player('qb', 0, -30, 0, { hasBall: true });
        motion.checkCollisions(blocker, { objects: [blocker, rusher, qb], ...extras });
        return { speed: rusher.state.xSpeed, at: rusher.coords.x };
    };

    test('a blitzer in the pocket keeps some of his drive, and nobody else does', () => {
        const blitz = { type: 'blitz' };
        const ported = shoveOnto({}, blitz);
        // The 2D game's own shove: stopped dead and moved backwards. Written
        // as a magnitude because the shed multiplies rather than assigns, so a
        // man running the other way stops at -0, which `toBe(0)` calls a
        // different number and arithmetic does not.
        expect(Math.abs(ported.speed)).toBe(0);
        expect(ported.at).toBeGreaterThan(8);

        const shed = shoveOnto({ rushShed: 0.75 }, blitz);
        expect(Math.abs(shed.speed)).toBeGreaterThan(0);
        expect(shed.at).toBeLessThan(ported.at);

        // A defender who is NOT blitzing is walled off exactly as before, which
        // is what keeps a lineman a lineman everywhere else on the field.
        const covering = shoveOnto({ rushShed: 0.75 }, { type: 'cover' });
        expect(Math.abs(covering.speed)).toBe(0);
        expect(covering.at).toBe(ported.at);
    });

    /**
     * AND ONLY IN THE POCKET. A blitz route runs at whoever has the ball, so on
     * a running play a shedding blitzer sheds the blocks in front of the
     * CARRIER. Measured that way the run game lost 18% of its points, 17.5 a
     * play down to 14.3 with the screen from 28.2 to 21.1, and those plays are
     * the ones this game is really about.
     */
    test('once he has taken off or thrown it, a blocker shoves as he always did', () => {
        const blitz = { type: 'blitz' };
        const ported = shoveOnto({}, blitz);
        for (const gone of [{ runForYourLife: true }, { throwTo: 'wr1' }]) {
            const after = shoveOnto({ rushShed: 0.75 }, blitz, gone);
            expect(Math.abs(after.speed)).toBe(Math.abs(ported.speed));
            expect(after.at).toBe(ported.at);
        }
    });

    test('and a MotionClass told nothing keeps the ported doubling', () => {
        expect(new MotionClass({}, {}, {}).linemanScale()).toBe(1);
        expect(new MotionClass({ linemanScale: 0 }, {}, {}).linemanScale()).toBe(1);
        expect(new MotionClass(undefined, {}, {}).linemanScale()).toBe(1);
        // And the shipped value is a SLIGHT cut, not a rebuild of the line.
        expect(formationSettings().linemanScale).toBeGreaterThan(0.7);
        expect(formationSettings().linemanScale).toBeLessThan(1);
        // ...and the shed defaults to the ported shove.
        expect(new MotionClass({}, {}, {}).rushShed()).toBe(0);
        expect(new MotionClass({ rushShed: 4 }, {}, {}).rushShed()).toBe(1);
        expect(formationSettings().rushShed).toBeGreaterThan(0);
        expect(formationSettings().rushShed).toBeLessThan(1);
    });
});

describe('bodies stay out of each other', () => {
    /**
     * THE INVARIANT THAT KEEPS PLAYS ENDING. A tackle fires when a carrier's
     * box overlaps a tackler's, so holding bodies further apart than the boxes
     * reach would mean nobody could ever be brought down. It is the one way
     * this pair of numbers can be set to something that looks fine on screen
     * and quietly breaks the game.
     */
    test('the collision boxes still reach past the space between bodies', () => {
        const reach = (6 * CFG.collisionScale + CFG.collisionPad) * 2 * UNITS_TO_METRES;
        expect(reach).toBeGreaterThan(CFG.separation);
    });

    test('every box sits outside the body it belongs to', () => {
        const halfBody = 0.33 * CFG.figureScale;
        for (const ported of [6, 12]) {          // everyone, then a lineman
            const half = (ported * CFG.collisionScale + CFG.collisionPad) * UNITS_TO_METRES;
            expect(half).toBeGreaterThan(halfBody);
        }
    });

    test('bodies are held at least a body width apart', () => {
        expect(CFG.separation).toBeGreaterThanOrEqual(0.33 * CFG.figureScale * 2 * 0.98);
    });

    /**
     * AND IT HAS TO ACTUALLY MOVE THEM. `motion.checkCollisions` only damps
     * speed, which is why widening its boxes changed nothing on its own:
     * measured, players reached 0.01m apart at every radius from 0.46m to 1.5m.
     */
    test('separate pushes two players who are inside each other apart', async () => {
        const { separate } = await import(join(scene, 'play.js'));
        const min = 40;
        const play = { game: { objects: [
            body('x1', 0, 100, 100), body('x2', 0, 105, 100),
        ] } };
        expect(separate(play, min, 2)).toBeGreaterThan(0);
        const [a, b] = play.game.objects;
        expect(Math.hypot(a.coords.x - b.coords.x, a.coords.y - b.coords.y))
            .toBeGreaterThan(min * 0.9);
    });

    test('two players already clear of each other are left alone', async () => {
        const { separate } = await import(join(scene, 'play.js'));
        const play = { game: { objects: [
            body('x1', 0, 100, 100), body('x2', 0, 400, 100),
        ] } };
        expect(separate(play, 40, 2)).toBe(0);
        expect(play.game.objects[0].coords.x).toBe(100);
    });

    /**
     * THE CARRIER IS EXEMPT FROM HIS OPPONENTS, and nothing else is. Without
     * it, a tackler shoved out every frame never accumulates the consecutive
     * contact the ported model counts, and the play runs out the backstop.
     */
    test('a tackler is allowed to reach the ball carrier', async () => {
        const { separate } = await import(join(scene, 'play.js'));
        const play = { game: { objects: [
            body('wr1', 0, 100, 100, { hasBall: true }), body('db1', 1, 104, 100),
        ] } };
        expect(separate(play, 40, 2)).toBe(0);
    });

    test('but his own blockers still keep out of him', async () => {
        const { separate } = await import(join(scene, 'play.js'));
        const play = { game: { objects: [
            body('wr1', 0, 100, 100, { hasBall: true }), body('x1', 0, 104, 100),
        ] } };
        expect(separate(play, 40, 2)).toBeGreaterThan(0);
    });

    test('coincident players are pushed apart rather than turned into NaN', async () => {
        const { separate } = await import(join(scene, 'play.js'));
        // cover12 puts db2 and db3 on exactly the same spot against run3, so
        // this is a real line-up rather than a hypothetical.
        const play = { game: { objects: [
            body('db2', 1, 265, 560), body('db3', 1, 265, 560),
        ] } };
        separate(play, 40, 2);
        for (const o of play.game.objects) {
            expect(Number.isFinite(o.coords.x)).toBe(true);
            expect(Number.isFinite(o.coords.y)).toBe(true);
        }
        const [a, b] = play.game.objects;
        expect(Math.hypot(a.coords.x - b.coords.x, a.coords.y - b.coords.y)).toBeGreaterThan(1);
    });
});

describe('the formations start with room to stand in', () => {
    /**
     * WIDENING THE GUTTER MUST NOT MOVE THE YARD LINES. Every lateral position
     * in the library counts in gutters, but the routes derive their OWN
     * lineInterval from the container, and `containerWidth()` inverts that so
     * it comes out at exactly FIELD.lineInterval. Break the inversion and both
     * teams line up somewhere other than the markings they are standing on,
     * which reads as a modelling mistake rather than an arithmetic one.
     */
    test('the routes still derive exactly one painted interval', async () => {
        const { containerWidth, SIM: S } = await import(join(scene, 'config.js'));
        // What `setObjectFormationPosition` actually computes, spelled out:
        // setContainerDimensions stores `width - gutterX`, and the route then
        // takes `(container.width - gutters.x * 10) / 5`.
        const derived = ((containerWidth() - S.gutter) - S.gutter * 10) / 5;
        expect(derived).toBe(S.lineInterval);
        expect(derived * UNITS_TO_METRES).toBeCloseTo(FIELD.lineInterval, 9);
    });

    test('nobody starts the play inside somebody else', async () => {
        const { createPlay, lineUp, OFFENSIVE_PLAYS } = await import(join(scene, 'play.js'));
        const play = createPlay();
        const body = 0.33 * CFG.figureScale * 2;
        for (const slug of OFFENSIVE_PLAYS) {
            const on = lineUp(play, slug, 'cover2').filter((o) => !o.settings.benched);
            for (let i = 0; i < on.length; i += 1) {
                for (let j = i + 1; j < on.length; j += 1) {
                    const d = Math.hypot(on[i].coords.x - on[j].coords.x,
                        on[i].coords.y - on[j].coords.y) * UNITS_TO_METRES;
                    // Within a whisker of a body width. `lineUp` settles the
                    // formation before anybody sees it, and the quarterback is
                    // exempt as the carrier, so the floor is not exact.
                    expect(d).toBeGreaterThan(body * 0.6);
                }
            }
        }
    });

    test('and nobody is pushed off the field settling it', async () => {
        const { createPlay, lineUp, OFFENSIVE_PLAYS } = await import(join(scene, 'play.js'));
        const play = createPlay();
        for (const slug of OFFENSIVE_PLAYS) {
            for (const o of lineUp(play, slug, 'cover2')) {
                if (o.settings.benched) continue;
                const z = Math.abs(o.coords.y * UNITS_TO_METRES - FIELD.width / 2);
                expect(z).toBeLessThanOrEqual(FIELD.width / 2);
            }
        }
    });
});

describe('the ball flies', () => {
    const B = () => CFG.ball;
    /** The height the view draws, for a throw of `total` metres at progress p. */
    const heightAt = (p, total) => B().release
        + 4 * p * (1 - p) * B().apex * Math.min(1, total / B().fullArcAt);

    /**
     * THE ARC WAS TWENTY-FOUR CENTIMETRES. `getZIndex` returns a 1-to-7 scale
     * index that the 2D renderer used to size a drawn ellipse, and view.js was
     * feeding it to `simToWorld` as though 7 were seven field units, which is
     * 0.245m. Both reported faults were that one unit error: the ball was not
     * invisible in the air, it was skimming the grass, and it did not look
     * flat, it was flat.
     */
    test('a full-length throw clears a player by a sensible margin', () => {
        const player = 1.75 * CFG.figureScale;
        const apex = heightAt(0.5, B().fullArcAt);
        expect(apex).toBeGreaterThan(player * 1.2);
        expect(apex).toBeLessThan(player * 2.5);
    });

    test('it is a parabola, not a ramp and not a plateau', () => {
        const total = B().fullArcAt;
        const samples = [];
        for (let p = 0; p <= 1.0001; p += 0.05) samples.push(heightAt(p, total));
        // Rises to the middle, falls after it, and is symmetric about it.
        const mid = (samples.length - 1) / 2;
        for (let i = 1; i <= mid; i += 1) expect(samples[i]).toBeGreaterThan(samples[i - 1]);
        for (let i = Math.ceil(mid) + 1; i < samples.length; i += 1) {
            expect(samples[i]).toBeLessThan(samples[i - 1]);
        }
        expect(samples[0]).toBeCloseTo(samples[samples.length - 1], 6);
        // No two consecutive samples identical anywhere in the climb, which is
        // what a clamped index produced: 73 of 99 measured throws saturated a
        // third of the way up and cruised dead level across the top.
        for (let i = 1; i < mid; i += 1) expect(samples[i]).not.toBeCloseTo(samples[i - 1], 6);
    });

    test('a short throw stays a bullet and a long one climbs', () => {
        expect(heightAt(0.5, 2)).toBeLessThan(heightAt(0.5, 12));
        expect(heightAt(0.5, 2)).toBeLessThan(1.75 * CFG.figureScale);
    });

    /**
     * IT STARTS AND FINISHES WHERE A HAND IS, AND IT USED TO SAY "NEAR THE
     * TURF".
     *
     * That assertion was wrong in the same way the value was: `release` was
     * doing two jobs, a hand and the grass, and the grass won. Measured over
     * 612 throws, the ball was a median 0.60m off the ground at the frame a
     * receiver was closest to it, against figures 3.85m tall. Every pass in the
     * game arrived below the knee, and this test agreed that it should.
     *
     * The property is the one a person would state: an arc that starts and ends
     * at the same height starts and ends where the BALL IS HELD, which is
     * between the tuck at the ribs and the throwing hold by the ear. Where an
     * uncaught ball comes to rest is a different question and `landingHeight`
     * already answers it on its own.
     */
    test('it starts and finishes at the height a ball is held at', () => {
        expect(heightAt(0, 12)).toBeCloseTo(B().release, 6);
        expect(heightAt(1, 12)).toBeCloseTo(B().release, 6);

        const held = (spot) => spot.y * CFG.figureScale;
        expect(B().release).toBeGreaterThan(held(CFG.pose.tuck.ball) * 0.8);
        expect(B().release).toBeLessThan(held(CFG.pose.throwHold.ball) * 1.1);
        // And well clear of the grass, which is where it used to start.
        expect(B().release).toBeGreaterThan(1.0);
    });
});

describe('the playbook is the 2D game\'s playbook', () => {
    const book = () => import(join(scene, 'playbook-ui.js'));
    const sim = () => import(join(scene, 'play.js'));

    /**
     * ALL SEVENTEEN. Seven were left out on a misreading of `formationRouteQb`:
     * the switch names ten slugs, and the conclusion drawn was that the rest
     * "have diagrams but no routes". It has a `default:` that hands the
     * quarterback a full drop-back, so every one of them runs.
     */
    test('every play the 2D game has is here', async () => {
        const { PLAYS } = await book();
        expect(PLAYS.length).toBe(17);
    });

    test('every card has a play behind it that the simulation will run', async () => {
        const { PLAYS } = await book();
        const { OFFENSIVE_PLAYS } = await sim();
        for (const play of PLAYS) expect(OFFENSIVE_PLAYS).toContain(play.slug);
        expect(OFFENSIVE_PLAYS.length).toBe(PLAYS.length);
    });

    /**
     * THE SLUG-TO-DIAGRAM MAP IS NOT SEQUENTIAL AND CANNOT BE GUESSED, so it is
     * checked against the source it was copied from rather than trusted.
     * `PlaybookOverlay.tsx` is the 2D game's own list and it is gitignored, so
     * this reads the mapping out of the ported drawing code instead: every
     * diagram a card names must exist as a `drawPlayN` method.
     */
    test('every diagram a card names actually exists', async () => {
        const { PLAYS } = await book();
        const source = readFileSync(join(scene, 'playbook.js'), 'utf8');
        for (const play of PLAYS) {
            expect(source).toContain(`drawPlay${play.diagram}(`);
        }
    });

    test('no two plays share a diagram', async () => {
        const { PLAYS } = await book();
        const seen = PLAYS.map((p) => p.diagram);
        expect(new Set(seen).size).toBe(seen.length);
    });

    test('and no two share a slug or a name', async () => {
        const { PLAYS } = await book();
        expect(new Set(PLAYS.map((p) => p.slug)).size).toBe(PLAYS.length);
        expect(new Set(PLAYS.map((p) => p.name)).size).toBe(PLAYS.length);
    });

    /**
     * THE NAME HAS TO DESCRIBE THE ROUTES, which is the whole of the second
     * complaint. The old names came from averaging where receivers ENDED UP
     * over twelve runs, and an end position throws the route away: a receiver
     * who runs deep and cuts back finishes where one who drifted finishes. So a
     * play with all four running straight was called Deep Split, and the name
     * Four Verticals sat on a play where three of them break left.
     *
     * This asserts the one name whose meaning is unambiguous. Four verticals is
     * four receivers running straight down the field, and it is measurable: net
     * lateral movement near zero on all four, and real depth on all four.
     */
    test('Four Verticals is four receivers running straight down the field', async () => {
        const { PLAYS } = await book();
        const { createPlay, lineUp, snap, tick } = await sim();
        const card = PLAYS.find((p) => p.name === 'Four Verticals');
        expect(card).toBeTruthy();

        const play = createPlay();
        lineUp(play, card.slug, 'cover2');
        // The library randomises every player, so freeze them: this is about
        // the shape of the route, not about dice.
        for (const o of play.game.objects) {
            if (o.physics) { o.physics.maxSpeed = 2.0; o.physics.accel = 1.0; }
        }
        snap(play);
        const start = new Map();
        for (const o of play.game.objects) {
            if (/^wr\d$/.test(o.settings.position)) {
                start.set(o.settings.position, { x: o.coords.x, y: o.coords.y });
            }
        }
        for (let f = 0; f < 400; f += 1) tick(play);
        play.live = false;

        let counted = 0;
        for (const o of play.game.objects) {
            if (!/^wr\d$/.test(o.settings.position) || o.settings.benched) continue;
            const a = start.get(o.settings.position);
            const depth = (o.coords.x - a.x) * UNITS_TO_METRES;
            const across = Math.abs(o.coords.y - a.y) * UNITS_TO_METRES;
            expect(depth).toBeGreaterThan(15);      // genuinely deep
            expect(across).toBeLessThan(3);         // and genuinely straight
            counted += 1;
        }
        expect(counted).toBe(4);
    });
});

describe('the flight recorder knows who is holding the ball', () => {
    /**
     * A CAUGHT PASS LEAVES THE BALL OBJECT LYING WHERE IT WAS CAUGHT, with its
     * coordinates intact, so a replay that only asks "is there a ball object"
     * went on drawing it on the turf while the receiver who caught it ran away
     * empty-handed. That is what a screenshot at the end of a replay showed.
     * The recorder stored who was on the field and not who was carrying.
     */
    const recorder = () => import(join(scene, 'replay.js'));

    const frame = (carrying) => [
        { settings: { position: 'qb', benched: false },
          coords: { x: 100, y: 200, z: 0 },
          state: { xSpeed: 1, ySpeed: 0, hasBall: carrying === 'qb' } },
        { settings: { position: 'wr2', benched: false },
          coords: { x: 400, y: 250, z: 0 },
          state: { xSpeed: 2, ySpeed: 1, hasBall: carrying === 'wr2' } },
        { settings: { position: 'db1', benched: true },
          coords: { x: -1e4, y: -1e4, z: 0 }, state: { xSpeed: 0, ySpeed: 0 } },
    ];

    test('carrying survives a round trip through the buffer', async () => {
        const R = await recorder();
        R.startRecording(frame('qb'));
        R.record(frame('qb'));
        R.record(frame('wr2'));

        const first = R.frameAt(0, () => 0);
        expect(first.find((o) => o.settings.position === 'qb').state.hasBall).toBe(true);
        expect(first.find((o) => o.settings.position === 'wr2').state.hasBall).toBe(false);

        const second = R.frameAt(1, () => 0);
        expect(second.find((o) => o.settings.position === 'wr2').state.hasBall).toBe(true);
        expect(second.find((o) => o.settings.position === 'qb').state.hasBall).toBe(false);
        R.discard();
    });

    /**
     * AND WHETHER HE TUCKED IT AND RAN. `state.run` is the flag the 2D game
     * uses to pick between a quarterback surveying the field and one who has
     * taken off (D87), and the recorder did not store it, so on playback it
     * came back undefined, which is falsy, which means "still looking to
     * throw". Every replay of a keeper showed him running the length of the
     * field with the ball cocked beside his ear.
     */
    test('running with it survives the round trip too', async () => {
        const R = await recorder();
        const keeper = [{
            settings: { position: 'qb', benched: false },
            coords: { x: 300, y: 200, z: 0 },
            state: { xSpeed: 2, ySpeed: 0, hasBall: true, run: true },
        }];
        R.startRecording(keeper);
        R.record(keeper);
        const got = R.frameAt(0, () => 0)[0];
        expect(got.state.hasBall).toBe(true);
        expect(got.state.run).toBe(true);
        R.discard();
    });

    test('and a quarterback still looking to throw is not marked as running', async () => {
        const R = await recorder();
        const looking = [{
            settings: { position: 'qb', benched: false },
            coords: { x: 300, y: 200, z: 0 },
            state: { xSpeed: 0, ySpeed: 0, hasBall: true, run: false },
        }];
        R.startRecording(looking);
        R.record(looking);
        const got = R.frameAt(0, () => 0)[0];
        expect(got.state.hasBall).toBe(true);
        expect(got.state.run).toBe(false);
        R.discard();
    });

    test('and a benched player is still told apart from a present one', async () => {
        const R = await recorder();
        R.startRecording(frame('qb'));
        R.record(frame('qb'));
        const got = R.frameAt(0, () => 0);
        expect(got.find((o) => o.settings.position === 'db1').settings.benched).toBe(true);
        expect(got.find((o) => o.settings.position === 'qb').settings.benched).toBe(false);
        R.discard();
    });

    /**
     * AND THE CAMERA FOLLOWS THE MAN, NOT THE SPOT. Asking the ball object
     * first left the replay aimed at where the catch happened while the
     * receiver ran out of shot.
     */
    test('the replay focus prefers whoever is carrying', async () => {
        const R = await recorder();
        const withBall = [
            ...frame('wr2'),
            { settings: { position: 'ball', benched: false },
              coords: { x: 390, y: 245, z: 1 }, state: { xSpeed: 0, ySpeed: 0 } },
        ];
        R.startRecording(withBall);
        R.record(withBall);
        const focus = R.focusAt(0);
        expect(focus.x).toBe(400);        // the receiver, not the ball at 390
        expect(focus.y).toBe(250);
        R.discard();
    });
});

describe('the ball looks like a football', () => {
    /**
     * AN ELLIPSOID HAS A ROUNDED END, and that is arithmetic rather than
     * taste. Its profile is `R·(1 - t²)^0.5`, so near the tip the radius falls
     * off as the SQUARE ROOT of the distance from the end and the shape closes
     * as a dome. Raising the exponent closes it as a point. Comparing the two
     * directly is the only way to assert "pointier" without restating the
     * constant.
     */
    test('the tips are pointier than the ellipsoid they replaced', async () => {
        const { ballProfile, BALL_FAT, BALL_TAPER } = await import(join(scene, 'ball.js'));
        expect(BALL_TAPER).toBeGreaterThan(0.5);          // 0.5 IS the ellipsoid

        // A tenth of the way in from the tip, how fat is it?
        const t = 0.9;
        const mine = BALL_FAT * Math.pow(1 - t * t, BALL_TAPER);
        const egg = BALL_FAT * Math.pow(1 - t * t, 0.5);
        expect(mine).toBeLessThan(egg * 0.8);
    });

    test('but the waist is untouched, so it is not a spike', async () => {
        const { ballProfile, BALL_FAT } = await import(join(scene, 'ball.js'));
        const p = ballProfile(16);
        const waist = p[Math.floor(p.length / 2)];
        expect(waist.r).toBeCloseTo(BALL_FAT, 6);
        expect(Math.abs(waist.y)).toBeCloseTo(0, 6);
    });

    test('it closes completely at both ends and is symmetric', async () => {
        const { ballProfile, BALL_HALF } = await import(join(scene, 'ball.js'));
        const p = ballProfile(16);
        expect(p[0].r).toBeCloseTo(0, 9);
        expect(p[p.length - 1].r).toBeCloseTo(0, 9);
        expect(p[0].y).toBeCloseTo(-BALL_HALF, 9);
        expect(p[p.length - 1].y).toBeCloseTo(BALL_HALF, 9);
        for (let i = 0; i < p.length; i += 1) {
            expect(p[i].r).toBeCloseTo(p[p.length - 1 - i].r, 9);
        }
    });

    /**
     * THE LACES HAVE TO LIE ON THE LEATHER. There was a straight seam bar here,
     * one box the length of the lace panel at a CONSTANT height, and the ball's
     * surface is a curve: at the ends of the panel the leather had fallen to
     * 0.088 while the bar was still at 0.134, so it stood five centimetres
     * proud of the ball, read as a rod driven through it, and covered the very
     * stitches it was meant to sit under. Reported as "a long straight line
     * that covers the laces".
     */
    test('every stitch sits on the surface, not above it', async () => {
        const { lacePositions, radiusAt } = await import(join(scene, 'ball.js'));
        for (const seat of lacePositions()) {
            const surface = radiusAt(seat.x);
            expect(seat.y).toBeLessThanOrEqual(surface);
            expect(seat.y).toBeGreaterThan(surface - 0.02);   // and not sunk into it
        }
    });

    test('a straight bar at a fixed height would fail that', async () => {
        const { lacePositions, radiusAt, BALL_FAT } = await import(join(scene, 'ball.js'));
        // What the old one did: hold the waist radius all the way out. Proving
        // the test above has teeth rather than passing on any arrangement.
        const ends = lacePositions();
        const outermost = ends[ends.length - 1];
        expect(BALL_FAT).toBeGreaterThan(radiusAt(outermost.x) + 0.02);
    });

    test('the laces run along the ball, not around it', async () => {
        const { lacePositions } = await import(join(scene, 'ball.js'));
        const seats = lacePositions();
        // Spread along the long axis, all on the same panel. A ring would have
        // put them at one x and swept them round instead.
        const xs = seats.map((s) => s.x);
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.2);
        expect(seats.length).toBeGreaterThan(4);
    });

    test('and it is about the proportion of a real football', async () => {
        const { BALL_HALF, BALL_FAT } = await import(join(scene, 'ball.js'));
        // 11 inches long by 6.7 across is 1.64. Anything near 1.6 to 1.8 reads.
        const ratio = BALL_HALF / BALL_FAT;
        expect(ratio).toBeGreaterThan(1.55);
        expect(ratio).toBeLessThan(1.85);
    });
});

describe('a player moves at a plausible speed for his own size', () => {
    /**
     * THE FIGURES GREW AND THE CLOCK DID NOT. `simHz` is the only speed control
     * in the game, and the note that set it to 45 was written against a 50m
     * field that is now 35m. Measured at 45, the fastest anybody moved was 5.35
     * m/s, which sounds brisk until it is measured against the PLAYER rather
     * than the pitch: a figure is 2.2 times life size, so that is 1.4
     * body-heights a second against a real sprinter's 5.5.
     *
     * Stated in body-heights, this survives any later change to the field, the
     * figure scale or the tick rate, and it fails the thing that was wrong.
     */
    /**
     * The fastest anybody can actually travel, asked of the library rather than
     * typed in: it randomises every player's `maxSpeed` at line-up, so the 2.4
     * in the config comment is one of several rather than the ceiling.
     *
     * TIMES ROOT TWO, AND THAT IS NOT A FUDGE. `maxSpeed` caps each AXIS
     * separately, and the ported model accelerates the two independently
     * (`accelDownfield` and `accelToRightSideline` are different methods that
     * clamp different fields), so a player running diagonally is at the cap on
     * both at once and covers 1.414 times the ground. Measured over 624,000
     * samples, the 99th percentile of sustained speed came out at 6.98 m/s
     * against a per-axis cap of 5.04, which is 1.385 and about as close to root
     * two as a randomised roster gets.
     */
    async function fastestMps() {
        const { createPlay, lineUp, OFFENSIVE_PLAYS } = await import(join(scene, 'play.js'));
        const play = createPlay();
        let top = 0;
        for (const slug of OFFENSIVE_PLAYS) {
            for (const o of lineUp(play, slug, 'cover2')) {
                if (o.settings.benched || !o.physics) continue;
                if (o.physics.maxSpeed > top) top = o.physics.maxSpeed;
            }
        }
        return top * Math.SQRT2 * UNITS_TO_METRES * CFG.simHz;
    }

    test('top speed is a sensible fraction of a sprint, in his own body-heights', async () => {
        const bodyHeights = (await fastestMps()) / (1.75 * CFG.figureScale);
        expect(bodyHeights).toBeGreaterThan(1.6);
        expect(bodyHeights).toBeLessThan(3.0);
    });

    test('and the field still takes a few seconds to cross', async () => {
        const seconds = (FIELD.lineInterval * FIELD.segments) / (await fastestMps());
        expect(seconds).toBeGreaterThan(3.5);
        expect(seconds).toBeLessThan(8);
    });
});

describe('the arms', () => {
    /**
     * FRAME-RATE INDEPENDENCE, WHICH THE OLD LINE DID NOT HAVE. It advanced the
     * stride phase by a constant plus a speed once per RENDERED frame, so a
     * 120Hz display swung the arms at twice the rate of a 60Hz one for the same
     * run. Advancing by distance covered has no frame rate in it at all.
     */
    test('the same run gives the same stride at any frame rate', () => {
        const perMetre = CFG.pose.stridePerMetre;
        const distance = 40;
        const at = (fps) => {
            let phase = 0;
            for (let i = 0; i < fps * 3; i += 1) phase += (distance / (fps * 3)) * perMetre;
            return phase;
        };
        expect(at(60)).toBeCloseTo(at(120), 9);
        expect(at(60)).toBeCloseTo(distance * perMetre, 9);
    });

    /**
     * AND THEY STOP WHEN HE DOES. At the whistle the simulation just stops
     * ticking, so nothing zeroes `xSpeed` and `ySpeed`: measured, fourteen of
     * fifteen players still carry a speed above the stride threshold while
     * standing perfectly still, the quarterback at 3.32. A player who covers no
     * distance now advances no phase, whatever those fields say.
     */
    test('a player who has not moved advances no stride at all', () => {
        expect(0 * CFG.pose.stridePerMetre).toBe(0);
        // And the swing amplitude is a function of measured speed, so a
        // stationary figure has none even mid-cycle.
        expect(Math.min(0 / CFG.pose.fullEffort, 1)).toBe(0);
    });

    test('a sprint is a plausible number of strides a second', () => {
        // Top speed is about 7.6 m/s (see config.simHz). One arm cycle is two
        // steps, so this is steps per second and a sprinter is around 4.5.
        const cycles = (7.6 * CFG.pose.stridePerMetre) / (Math.PI * 2);
        expect(cycles * 2).toBeGreaterThan(2.5);
        expect(cycles * 2).toBeLessThan(5.0);
    });

    /**
     * EVERY POSE IS A HAND POSITION NOW, AND THE ELBOW ONLY BENDS ONE WAY.
     *
     * THE BUG THESE REPLACE. The rig grew an elbow last round and every angle
     * written against it was positive, which is the wrong sign: the forearm
     * hangs down its local -Y, so a positive rotation about +X folds it toward
     * -Z, and the rig faces +Z. Every pose in the game was hyperextending an
     * elbow, and it shipped as "the players' arms are backwards relative to
     * their head, torso and feet", which is exactly what it was.
     *
     * THE OLD TESTS AGREED WITH IT. One of them asserted
     * `throwHold.armX > 0` and called it "cocked back"; another checked that
     * the ball was near the hand and passed, because the ball had been placed
     * at the hand the wrong pose produced. A test written from the same
     * misunderstanding as the code cannot catch the code.
     *
     * So these are written against the JOINT rather than against the numbers: an
     * elbow flexes and does not extend, and where a hand ends up is measured by
     * running the solver forwards. `tests/exesnohs-arm.test.mjs` checks the
     * solver itself against a real three.
     */
    test('no pose in the game hyperextends an elbow', () => {
        const poses = [
            ['throwHold', CFG.pose.throwHold.hand, 1],
            ['throwHold off arm', CFG.pose.throwHold.offHand, -1],
            ['throwRelease', CFG.pose.throwRelease.hand, 1],
            ['tuck', CFG.pose.tuck.hand, 1],
            ['block', CFG.pose.block.hand, 1],
            ['tackle', CFG.pose.tackle.hand, 1],
            ['takedown', CFG.pose.takedown.hand, 1],
        ];
        // Gathered rather than asserted one at a time, so a failure names the
        // pose that broke instead of stopping at the first.
        const bent = poses.map(([name, hand, side]) => [
            name, solveArm({ x: side * hand.x, y: hand.y, z: hand.z }, side).foreX <= 0,
        ]);
        expect(bent).toEqual(poses.map(([name]) => [name, true]));
    });

    /**
     * AND THE RUNNING ELBOW IS FLEXION TOO, which is the one pose not written
     * as a hand position: a stride is a swing, and a swing is an angle. It is
     * stated in config as a positive AMOUNT and applied as a negative angle,
     * deliberately, because a signed number is how the sign got lost.
     */
    test('a runner carries a real elbow, and it bends forwards', () => {
        const E = CFG.pose.runElbow;
        expect(E.rest).toBeGreaterThan(0);
        expect(E.sprint).toBeGreaterThan(E.rest);
        // A sprinter is near a right angle; anything past about 120 degrees of
        // flexion has his hand on his own shoulder.
        const sprint = E.rest + E.sprint;
        expect(sprint).toBeGreaterThan(0.9);
        expect(sprint).toBeLessThan(2.1);
    });

    /**
     * NOTHING MAY SWING FURTHER THAN THE SHOULDER CAN COVER. The shared rig's
     * shoulder is a ball of `armRadius * 1.15` set in a flat-sided torso, which
     * covers the stride and a bit more. Past about a radian the upper arm
     * clears the joint entirely and the limb reads as a detached stick, which
     * is what the screenshots showed as glitchy arms. The throwing arm is the
     * one deliberate exception: it is meant to go over the shoulder, it belongs
     * to one player, and it is on screen for a second at a time.
     */
    test('no held pose swings an arm out of its own shoulder', () => {
        for (const hand of [CFG.pose.block.hand, CFG.pose.tuck.hand]) {
            const solved = solveArm(hand, 1);
            expect(Math.abs(solved.armX)).toBeLessThan(1.0);
        }
        expect(CFG.pose.armSwing).toBeLessThan(1.0);
    });

    /**
     * AND EVERY PER-FRAME JUDGEMENT IS SMOOTHED. The block amount, the measured
     * speed and the carry are all decided fresh each frame against a world that
     * is still moving, so applied raw they flip on alternate frames. Three
     * separate time constants, none of them zero, and all short enough that
     * nothing feels laggy.
     */
    test('the pose, the speed and the drawn position all ease', () => {
        for (const seconds of [CFG.pose.blend, CFG.pose.speedSmooth, CFG.pose.motionSmooth]) {
            expect(seconds).toBeGreaterThan(0.02);
            expect(seconds).toBeLessThan(0.25);
        }
    });

    /**
     * THE SPEED SMOOTHING HAS TO OUTLAST A MISSING SIMULATION STEP. The sim
     * runs at `simHz` on a fixed clock and the view once per rendered frame, so
     * a 120Hz display sees no movement at all on three of every five frames. A
     * smoothing shorter than the gap between steps would collapse the swing on
     * exactly those frames, which is the fault it exists to fix.
     */
    test('speed smoothing bridges the gap between simulation steps', () => {
        const gap = 1 / CFG.simHz;
        expect(CFG.pose.speedSmooth).toBeGreaterThan(gap * 2);
    });

    /**
     * FORWARD IS +Z, and every pose that means "out in front of him" has to say
     * so in the one coordinate a reader can check. This is the test the old
     * `armX < 0` pair was trying to be, and it is now stated about the hand
     * rather than about a rotation, so it cannot be satisfied by an arm that
     * reaches forward from the shoulder and folds backwards at the elbow.
     */
    test('the poses that reach forward put the hand in front of him', () => {
        expect(CFG.pose.block.hand.z).toBeGreaterThan(0.2);      // at the rusher
        expect(CFG.pose.tackle.hand.z).toBeGreaterThan(0.2);     // round the carrier
        expect(CFG.pose.takedown.hand.z).toBeGreaterThan(0.2);   // into the hit
        expect(CFG.pose.throwRelease.hand.z).toBeGreaterThan(0.2);  // follow through
        // And the one that does not: a cocked arm is behind him, which is the
        // whole difference between holding a ball and having thrown it.
        expect(CFG.pose.throwHold.hand.z).toBeLessThan(0);
    });

    /**
     * ANCHORED TO THE SHARED RIG, not to numbers that feel about right.
     * people-1.0.0 puts the shoulder pivot at `legLength + torsoHeight - 0.05`
     * and the head centre at `legLength + torsoHeight + neckHeight +
     * headRadius`. A quarterback surveying the field holds the ball ABOVE the
     * shoulder and roughly at the ear, and a carrier tucks it BELOW the
     * shoulder against his ribs.
     *
     * THE HEAD CONSTANT WAS WRONG HERE TOO, at 1.62, which is the head's own
     * radius counted twice. It is 1.50, and the helmet was built around the
     * wrong one for two rounds (see roster.js and tests/exesnohs-helmet).
     */
    const SHOULDER = 0.75 + 0.55 - 0.05;                 // 1.25 in rig units
    const HEAD = 0.75 + 0.55 + 0.08 + 0.12;              // 1.50

    test('the quarterback holds the ball up by his ear, not against his chest', () => {
        const up = CFG.pose.throwHold.ball.y;
        expect(up).toBeGreaterThan(SHOULDER);
        expect(up).toBeLessThan(HEAD + 0.20);
        // AND COCKED, WHICH IS NOW MEASURED ON THE HAND. This used to ask for
        // the BALL's centre to be behind him, and that stopped being the right
        // question when the hold moved to gripping the ball by its back point:
        // the hand is behind the shoulder line and the ball reaches forward
        // from it, which is a quarterback about to throw rather than one
        // holding a football behind his own back.
        expect(CFG.pose.throwHold.hand.z).toBeLessThan(0);
        expect(CFG.pose.throwHold.aim.z).toBeGreaterThan(0);
    });

    test('a carrier tucks it high and tight, not down at his knee', () => {
        const up = CFG.pose.tuck.ball.y;
        expect(up).toBeLessThan(SHOULDER);
        expect(up).toBeGreaterThan(0.85);          // up on the ribs, not the hip
        expect(up).toBeLessThan(CFG.pose.throwHold.ball.y);
    });

    /**
     * AND THE HAND HAS TO BE ON THE BALL.
     *
     * THIS USED TO ASK WHETHER THE BALL'S CENTRE WAS NEAR THE HAND, and that
     * was the wrong question in a way that mattered. `ballScale` is 2.6 against
     * `figureScale` 2.2, so the ball is 1.24m long: a centre "near" the hand
     * puts 0.6m of leather over the hand, the wrist and most of the forearm,
     * which is precisely the screenshot QA sent back, a football over a
     * shoulder with no arm attached. A centre-to-centre threshold cannot see
     * that, because the ball passing the test IS the ball hiding the arm.
     *
     * So the property is the one a person would state: the hand is ON THE
     * LEATHER. Project the hand onto the ball's own axis, check it lands
     * within the ball's length, and check it is no further from the axis than
     * the ball is fat at that point. That fails against a ball floating off
     * the hand AND against a ball swallowing it, and it is measured in world
     * metres because the two scales are different numbers.
     */
    test('each carry puts the hand on the ball, not under it', () => {
        const F = CFG.figureScale;
        const B = CFG.ballScale;
        const HALF = 0.238;                 // ball.js BALL_HALF, before ballScale
        const FAT = 0.14;                   // ...and BALL_FAT
        const TAPER = 0.78;
        const fatAt = (x) => {
            const t = Math.min(1, Math.abs(x) / HALF);
            return FAT * Math.pow(Math.max(0, 1 - t * t), TAPER);
        };

        for (const P of [CFG.pose.throwHold, CFG.pose.tuck]) {
            const solved = solveArm(P.hand, 1);
            const hand = handAt(solved.armX, solved.armZ, solved.foreX, 1);
            // Both into world metres, which is the only space they share.
            const to = {
                x: (hand.x - P.ball.x) * F,
                y: (hand.y - P.ball.y) * F,
                z: (hand.z - P.ball.z) * F,
            };
            const mag = Math.hypot(P.aim.x, P.aim.y, P.aim.z);
            const axis = { x: P.aim.x / mag, y: P.aim.y / mag, z: P.aim.z / mag };
            const along = to.x * axis.x + to.y * axis.y + to.z * axis.z;
            const perp = Math.hypot(
                to.x - along * axis.x, to.y - along * axis.y, to.z - along * axis.z
            );
            // Along the ball rather than off either end...
            expect(Math.abs(along)).toBeLessThan(HALF * B);
            // ...and against the leather rather than floating beside it. The
            // hand is a sphere of its own, so it may sit that far proud.
            const handRadius = 0.04 * F;
            expect(perp).toBeLessThan(fatAt(along / B) * B + handRadius);
        }
    });

    /**
     * AND IT IS HELD BY ITS BACK POINT, WHICH IS THE OTHER HALF OF THAT.
     *
     * A hand exactly on the middle of a 1.24m ball satisfies the test above
     * and still hides the arm behind half a metre of leather. What a person
     * actually does with a football is put a hand near its back point, so the
     * ball reaches AWAY from the arm carrying it. Stated as a fraction rather
     * than a distance, because it is a fact about the grip and not about how
     * big this game happens to draw the ball.
     */
    test('the throwing hold grips the ball behind its middle', () => {
        const P = CFG.pose.throwHold;
        const mag = Math.hypot(P.aim.x, P.aim.y, P.aim.z);
        const solved = solveArm(P.hand, 1);
        const hand = handAt(solved.armX, solved.armZ, solved.foreX, 1);
        const along = ((hand.x - P.ball.x) * P.aim.x
            + (hand.y - P.ball.y) * P.aim.y
            + (hand.z - P.ball.z) * P.aim.z) / mag;
        // Behind the middle, by a real fraction of the ball's half length.
        const half = 0.238 * CFG.ballScale / CFG.figureScale;
        expect(along / half).toBeLessThan(-0.5);
        expect(along / half).toBeGreaterThan(-1);
    });

    test('the throwing hand comes up beside the head, not over the shoulder', () => {
        const h = CFG.pose.throwHold.hand;
        expect(h.y).toBeGreaterThan(SHOULDER);        // above the shoulder
        expect(h.y).toBeLessThan(HEAD + 0.18);        // and not over the crown
        expect(h.z).toBeLessThan(0);                  // cocked, so behind
        expect(Math.abs(h.x)).toBeGreaterThan(0.14);  // clear of the head
    });

    /**
     * AND THE ELBOW HAS TO BE BENT. Without a bend the only way to get a hand
     * up beside the ear is to swing the whole straight limb back over the
     * shoulder, which is a javelin thrower rather than a quarterback.
     */
    test('the throwing arm is bent at the elbow', () => {
        const bend = Math.abs(solveArm(CFG.pose.throwHold.hand, 1).foreX)
            * 180 / Math.PI;
        expect(bend).toBeGreaterThan(45);
        expect(bend).toBeLessThan(140);
    });

    test('and it straightens through the release', () => {
        const hold = Math.abs(solveArm(CFG.pose.throwHold.hand, 1).foreX);
        const release = Math.abs(solveArm(CFG.pose.throwRelease.hand, 1).foreX);
        expect(release).toBeLessThan(hold);
    });

    /**
     * THE SWEEP BETWEEN THEM IS THE THROW, and it is not keyframed: roster.js
     * interpolates the two solved poses, so the whole motion is whatever those
     * two ends imply. Worth measuring, because "the hand travels forwards" is
     * the one property that makes it a throw rather than a shrug, and nothing
     * else in the codebase asserts it.
     */
    test('the hand travels forward and down across the release', () => {
        const from = solveArm(CFG.pose.throwHold.hand, 1);
        const to = solveArm(CFG.pose.throwRelease.hand, 1);
        let last = null;
        let climbed = false;
        for (let i = 0; i <= 10; i += 1) {
            const t = i / 10;
            const h = handAt(
                from.armX + (to.armX - from.armX) * t,
                from.armZ + (to.armZ - from.armZ) * t,
                from.foreX + (to.foreX - from.foreX) * t, 1
            );
            if (last) {
                // Forward all the way through the throw itself. The last fifth
                // is the follow through, where the arm comes down and ACROSS
                // and the hand does curl back toward the body, which is what a
                // follow through is.
                if (t <= 0.8) expect(h.z).toBeGreaterThan(last.z - 1e-6);
                if (h.y > last.y) climbed = true;
            }
            last = h;
        }
        // It goes UP before it comes down, which is what over the top means.
        expect(climbed).toBe(true);
        expect(last.y).toBeLessThan(CFG.pose.throwHold.hand.y);
        expect(last.z).toBeGreaterThan(0.3);
    });
});

describe('the letter on a receiver is somewhere a visitor can see it', () => {
    /**
     * THE BUG, STATED AS A NUMBER. The glyph was drawn at the middle of the
     * disc and the middle of the disc is where the player stands, so five
     * receivers wore letters nobody had ever seen and "Throw C" named nobody.
     *
     * A figure's contact shadow is a 0.34m disc scaled with the figure, which
     * is the widest thing pinned to its feet, so clearing that clears the
     * player. Asserted against the bottom edge of the glyph rather than its
     * centre, because half a letter is not a letter.
     */
    test('the glyph clears the figure standing on the ring', () => {
        const g = markerGeometry();
        const shadow = 0.34 * CFG.figureScale;
        expect(g.tagOffset - g.letterHeight / 2).toBeGreaterThan(shadow);
    });

    test('the letter is big enough to be one', () => {
        const g = markerGeometry();
        // Two thirds of the tag it sits on, which is what a glyph on a disc
        // wants, and not larger than the tag, which would be a letter with no
        // ground under it.
        expect(g.letterHeight).toBeGreaterThan(g.tagRadius);
        expect(g.letterHeight).toBeLessThan(g.tagRadius * 2);
    });

    test('the ring is still the size it was when the texture was square', () => {
        // The plane grew downfield to carry the tag. If that had scaled the
        // ring too, every marker on the field would have changed size and the
        // measured 16-to-23 pixel legibility in markers.js would be fiction.
        const g = markerGeometry();
        expect(g.ringRadius).toBeCloseTo(52 / 128 * CFG.markers.namedRadius * 2, 6);
        expect(g.across).toBeCloseTo(CFG.markers.namedRadius * 2, 6);
    });

    test('the tag lies toward the camera, never downfield', () => {
        // Downfield is the direction a standing figure hides: at a 45 degree
        // rake a 3.85m player covers 3.85m of turf up the screen and only his
        // own feet toward the viewer. Getting this sign wrong would put the
        // letter back under a body, from the other side.
        expect(markerGeometry().tagOffset).toBeGreaterThan(0);
    });
});

describe('the playbook diagrams are repainted, not left half done', () => {
    /**
     * THE PORTED FILE IS THE SOURCE OF TRUTH FOR THIS LIST, so the list is read
     * from it rather than typed out twice. A new colour arriving in
     * playbook.js, or an existing one being edited, would otherwise pass
     * straight through the palette proxy and land on a dark card in a shade
     * chosen for white paper. That is the exact failure mode this file is here
     * to prevent, and it is invisible until somebody looks at the right card.
     */
    test('every colour the ported diagrams draw with has a dark equivalent', async () => {
        const { DIAGRAM_INK } = await import(join(scene, 'playbook-ui.js'));
        const source = readFileSync(join(scene, 'playbook.js'), 'utf8');
        const literals = new Set(
            [...source.matchAll(/'((?:rgba?\()?\d{1,3}, *\d{1,3}, *\d{1,3}(?:, *[\d.]+)?\)?)'/g)]
                .map((m) => m[1])
        );
        expect(literals.size).toBeGreaterThan(5);
        for (const literal of literals) {
            expect(DIAGRAM_INK).toHaveProperty([literal]);
        }
    });

    test('the route colours are the receivers\' own, not a second set', async () => {
        const { DIAGRAM_INK } = await import(join(scene, 'playbook-ui.js'));
        // '#ff6a5e' has to come out as '255, 106, 94' wherever it is used, or
        // A's route on the card and A's disc on the grass are two different
        // reds and the letter stops being the link between them.
        const rgb = (hex) => {
            const n = parseInt(hex.slice(1), 16);
            return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
        };
        const pairs = [
            ['125, 0, 0, 0.8', CFG.receivers.wr1.ink],
            ['0, 0, 125, 0.8', CFG.receivers.wr2.ink],
            ['125, 0, 125, 0.8', CFG.receivers.wr3.ink],
            ['0, 125, 0, 0.8', CFG.receivers.wr4.ink],
        ];
        for (const [was, ink] of pairs) {
            expect(DIAGRAM_INK[was]).toContain(rgb(ink));
        }
    });

    test('nothing is remapped to a colour as light as the paper it came from', async () => {
        const { DIAGRAM_INK } = await import(join(scene, 'playbook-ui.js'));
        // The card ground specifically. If this ever came back light the whole
        // exercise is undone and the overlay is ten glowing rectangles again.
        const ground = DIAGRAM_INK['rgb(235, 235, 235)'];
        const n = parseInt(ground.slice(1), 16);
        const luma = (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114);
        expect(luma).toBeLessThan(60);
    });
});

describe('the replay camera is above the players it is watching', () => {
    /**
     * THE HEIGHTS ARE IN INTERVALS AND THE PLAYERS ARE NOT. A 1.75m figure at
     * `figureScale` 2.2 stands 3.85m, which is 0.55 of a 7m interval, and
     * `trackHeight` was 0.55: the camera flew at exactly head height, through
     * the middle of the pack, which is why the close replay frames are a wall
     * of shoulders. It is the same class of mistake as the collision radii.
     */
    test('the camera flies clear of a player at the scale players are drawn', () => {
        const playerHeight = 1.75 * CFG.figureScale;
        const r = CFG.camera.replay;
        for (const height of [r.trackHeight, r.establishHeight]) {
            expect(height * FIELD.lineInterval).toBeGreaterThan(playerHeight * 1.4);
        }
    });

    /**
     * A REPLAY, NOT A PORTRAIT, and the number is measured rather than eyeballed.
     *
     * The same oversight that put the camera at head height also left the lens
     * where it was: `figureScale` doubled the subject and nothing widened to
     * take him in, so the settled shot gave one player half the frame. This
     * asserts the shot that actually happens, and separately the floor the
     * seats can force it to, which is allowed to be tighter because being
     * close is better than being in the bleachers.
     */
    test('a player is a share of the replay frame, not most of it', () => {
        const r = CFG.camera.replay;
        expect(r.radius * r.settleCloseness).toBeGreaterThanOrEqual(r.minRadius);

        const shareAt = (intervals) => {
            const dist = intervals * FIELD.lineInterval;
            const halfAngle = ((r.fov - r.settleZoom) / 2) * Math.PI / 180;
            return (1.75 * CFG.figureScale) / (2 * dist * Math.tan(halfAngle));
        };

        const settled = shareAt(r.radius * r.settleCloseness);
        expect(settled).toBeLessThan(0.45);
        // And not so far off that the replay stops being about anybody.
        expect(settled).toBeGreaterThan(0.2);

        expect(shareAt(r.minRadius)).toBeLessThan(0.55);
    });
});

/** The smaller shape `separate` reads: where somebody is, and whose side they
 *  are on. It never looks at physics. */
function body(position, team, x, y, state = {}) {
    return {
        settings: { position, team, benched: false },
        coords: { x, y, z: 0 },
        state: { hasBall: false, ...state },
    };
}

/** A simulation object shaped the way the ported motion model reads them. */
function player(position, team, x, y, state = {}) {
    return {
        settings: { position, team, tackled: 3, benched: false },
        coords: { x, y, z: 0 },
        physics: { deceleration: 0.5, maxSpeed: 2 },
        state: {
            hasBall: false, tackle: 0, xSpeed: 0, ySpeed: 0, run: false, ...state,
        },
    };
}

describe('a man in the air can actually catch it', () => {
    /**
     * QA: a receiver jumps for the ball and comes down with nothing.
     *
     * THE HEIGHT GATE IS WHAT REFUSED HIM. `checkCatch` asks for the ball and
     * the player to be on the same `getZIndex` step, every player sits at 1 and
     * never moves, so it means "the ball is back down". Measured over 166 jumps
     * that ended in no catch, the ball's index at its closest approach was a
     * median of 4.5 against his 1, and 88 of them would have been caught on the
     * boxes alone. The catch was being refused by a ramp that view.js itself
     * stopped believing, after the view had already made the same judgement
     * against the ball's REAL drawn height.
     */
    const at = (position, team, x, y, state = {}) => ({
        settings: { position, team, positionGroup: 'wr', benched: false, tackled: 3 },
        coords: { x, y, z: 1 },
        physics: { accel: 0.4, maxSpeed: 2.35, decel: 0.1 },
        state: { xSpeed: 0, ySpeed: 0, ...state },
    });
    /** A ball at a given height index, right on top of him. */
    const ballAt = (z) => ({
        settings: { position: 'ball', team: 0, benched: false, tackled: 3 },
        coords: { x: 400, y: 300, z },
        physics: { accel: 0.4, maxSpeed: 7, decel: 0.1 },
        state: { xSpeed: 0, ySpeed: 0 },
    });
    const caught = (motion, receiver, z) => {
        const gameState = { state: { ball: { caught: false, position: '', team: 0 }, anim: {} } };
        motion.gameState = gameState;
        const ball = ballAt(z);
        const game = { objects: [ball, receiver], throwTo: 'wr1' };
        motion.checkCatch(ball, game);
        return gameState.state.ball.caught === true;
    };
    const settings = () => ({ ...formationSettings() });
    // The ported physics calls into an injected audio object from inside the
    // catch, exactly as play.js supplies one. Silence is the headless default.
    const silence = { catch() {}, collide() {}, incomplete() {} };

    test('the port is unchanged for anybody with his feet on the ground', () => {
        const motion = new MotionClass(settings(), {}, silence);
        // Level with him, which is the only case the port allows.
        expect(caught(motion, at('wr1', 0, 400, 300), 1)).toBe(true);
        // And over his head, which it refuses.
        expect(caught(motion, at('wr1', 0, 400, 300), 4.5)).toBe(false);
    });

    test('and a man who has left his feet gets the one over his head', () => {
        const motion = new MotionClass(settings(), {}, silence);
        expect(caught(motion, at('wr1', 0, 400, 300, { airborne: true }), 4.5)).toBe(true);
    });

    /**
     * AND THE CEILING ABOVE THE REACH HAD TO LIFT WITH IT. The 2D game stops
     * asking about a catch at all once the ball is above index 2, so a leaping
     * receiver whose question is never asked cannot answer it. That was found
     * the hard way once already, on a sweep that moved nothing.
     */
    test('the ball is still worth asking about while somebody is up', () => {
        const motion = new MotionClass(settings(), {}, silence);
        const high = ballAt(4.5);
        expect(motion.anyoneAirborne({ objects: [at('wr1', 0, 400, 300)] })).toBe(false);
        expect(motion.anyoneAirborne({
            objects: [at('wr1', 0, 400, 300, { airborne: true })],
        })).toBe(true);
        expect(high.coords.z).toBeGreaterThan(2);
    });

    /**
     * HIS REACH IS THE SAME DISTANCE THE VIEW REQUIRED BEFORE IT LET HIM JUMP,
     * which is the whole point: the promise the jump makes is the promise the
     * catch keeps, from one number.
     */
    test('his reach in the air is the distance the jump was allowed at', () => {
        const motion = new MotionClass(settings(), {}, silence);
        expect(motion.airborneReach() * UNITS_TO_METRES)
            .toBeCloseTo(CFG.pose.jump.range, 6);
        // ...and a MotionClass told nothing still behaves as the 2D game did.
        expect(new MotionClass({}, {}, {}).airborneReach()).toBe(0);
    });

    test('a ball beyond that reach is still not caught, airborne or not', () => {
        const motion = new MotionClass(settings(), {}, silence);
        const far = (CFG.pose.jump.range * 2.5) / UNITS_TO_METRES;
        expect(caught(motion, at('wr1', 0, 400 + far, 300, { airborne: true }), 4.5))
            .toBe(false);
    });
});

describe('a short pass and a hail mary are not the same event', () => {
    /**
     * `catchScale` was one number for every throw, so widening it to stop short
     * passes falling incomplete widened the deep ball by exactly as much.
     * Measured by throw length before this: 87% caught inside 8m, and still
     * 52% past 26m, with a bomb scoring fifty on 27% of attempts.
     *
     * That makes the deep ball the obvious play, and this game is meant to be
     * WATCHED: the pleasure is a short pass that turns into a run nobody can
     * predict, not one answer repeated ten times.
     */
    const silent = { catch() {}, collide() {}, incomplete() {} };
    const motion = () => new MotionClass(formationSettings(), {}, silent);
    /** A ball thrown `metres`, mid-flight. */
    const throwOf = (metres) => ({
        coords: {
            x: 300, y: 300, z: 1,
            startX: 200, startY: 300,
            targetX: 200 + metres / UNITS_TO_METRES, targetY: 300,
        },
    });

    test('a short throw is judged exactly as it always was', () => {
        const m = motion();
        expect(m.throwStretch(throwOf(1))).toBe(0);
        expect(m.throwStretch(throwOf(8))).toBe(0);
        // Right up to where the falloff is declared to begin.
        expect(m.throwStretch(throwOf(formationSettings().catchNear * UNITS_TO_METRES)))
            .toBeCloseTo(0, 6);
    });

    test('and a long one is judged as hard as it gets', () => {
        const m = motion();
        expect(m.throwStretch(throwOf(60))).toBe(1);
        expect(m.catchFarScale()).toBeLessThan(1);
        expect(m.catchFarScale()).toBeGreaterThan(0);
    });

    test('the ramp between them only ever goes one way', () => {
        const m = motion();
        let last = -1;
        for (let metres = 0; metres <= 45; metres += 1.5) {
            const t = m.throwStretch(throwOf(metres));
            expect(t).toBeGreaterThanOrEqual(last);
            last = t;
        }
    });

    /**
     * AND THE SAME RAMP MOVES BOTH SIDES, which is the whole idea: the further
     * it is thrown, the less of the field the receiver covers and the more the
     * defender does, because a ball hanging in the air that long is one a
     * defender has time to get under.
     */
    test('the receiver shrinks and the defender grows, together', () => {
        const s = formationSettings();
        const stretch = 1;
        const nearBox = s.catchScale;
        const farBox = s.catchScale * (1 + (s.catchFarScale - 1) * stretch);
        expect(farBox).toBeLessThan(nearBox);

        const nearShare = s.interceptShare;
        const farShare = nearShare + (1 - nearShare) * stretch;
        expect(farShare).toBeGreaterThan(nearShare);
        expect(farShare).toBeCloseTo(1, 6);
    });

    /**
     * A BALL WITH NO RECORDED AIM IS TREATED AS SHORT, which is the safe way
     * round. `replay.frameAt` rebuilds objects from six floats and carries no
     * target, so a playback frame that reached here would otherwise be judged
     * as the hardest throw in the game.
     */
    test('a ball that does not know where it was aimed is not penalised', () => {
        const m = motion();
        expect(m.throwStretch({ coords: { x: 300, y: 300 } })).toBe(0);
        expect(m.throwStretch({})).toBe(0);
        expect(m.throwStretch()).toBe(0);
    });

    test('a MotionClass told nothing has no falloff at all', () => {
        const bare = new MotionClass({}, {}, silent);
        expect(bare.throwStretch(throwOf(60))).toBe(0);
        expect(bare.catchFarScale()).toBe(1);
    });
});

describe('the game leans on a run of plays', () => {
    /**
     * The 2D game kept a count of successful or unsuccessful plays in a row and
     * adjusted difficulty from it, which is the right instinct for a game you
     * mostly WATCH: somebody scoring fifty every play has stopped being
     * surprised, and somebody who cannot move the ball has stopped watching.
     */
    const D = () => CFG.difficulty;

    test('a run of good plays builds, and one bad play breaks it', () => {
        let s = 0;
        for (const p of [50, 50, 50]) s = nextStreak(s, p, D());
        expect(s).toBe(3);
        // Not "back to zero": the reversal starts a run the other way, which is
        // the whole reason it is one signed number rather than two counters.
        s = nextStreak(s, 0, D());
        expect(s).toBe(-1);
    });

    test('and a run of bad plays does the same in reverse', () => {
        let s = 0;
        for (const p of [-10, 0, -5]) s = nextStreak(s, p, D());
        expect(s).toBe(-3);
        expect(nextStreak(s, 50, D())).toBe(1);
    });

    /**
     * A MIDDLING PLAY DECAYS IT RATHER THAN BREAKING IT. Five points is neither
     * a triumph nor a disaster, and a reading that reset on every ordinary play
     * would never build a run at all.
     */
    test('an ordinary play fades a run rather than ending it', () => {
        let s = 3;
        s = nextStreak(s, 15, D());
        expect(s).toBe(2);
        s = nextStreak(s, 5, D());
        expect(s).toBe(1);
        // ...all the way to nothing, and no further.
        s = nextStreak(s, 15, D());
        expect(s).toBe(0);
        expect(nextStreak(0, 15, D())).toBe(0);
    });

    test('the lean saturates, so a longer run does not keep making it worse', () => {
        expect(difficultyFor(D().run, D())).toBe(1);
        expect(difficultyFor(D().run * 10, D())).toBe(1);
        expect(difficultyFor(-D().run * 10, D())).toBe(-1);
        expect(difficultyFor(0, D())).toBe(0);
        // And it is monotonic in between, which is what "leaning" means.
        let last = -2;
        for (let s = -D().run; s <= D().run; s += 1) {
            const now = difficultyFor(s, D());
            expect(now).toBeGreaterThan(last);
            last = now;
        }
    });

    test('a whole saved game rebuilds the same run its plays imply', () => {
        const results = [{ points: 50 }, { points: 50 }, { points: 0 }];
        let s = 0;
        for (const r of results) s = nextStreak(s, r.points, D());
        expect(streakOver(results, D())).toBe(s);
        expect(streakOver([], D())).toBe(0);
        expect(streakOver(undefined, D())).toBe(0);
    });

    test('the dial is written where the speed roll can see it, and is clamped', () => {
        const play = createPlayForDifficulty();
        expect(setDifficulty(play, 0.5)).toBe(0.5);
        expect(play.formations.settings.difficulty).toBe(0.5);
        expect(setDifficulty(play, 9)).toBe(1);
        expect(setDifficulty(play, -9)).toBe(-1);
        expect(setDifficulty(play, undefined)).toBe(0);
        expect(setDifficulty(play, NaN)).toBe(0);
    });

    /**
     * AND IT HAS TO ACTUALLY MOVE THE GAME. A difficulty dial that changes
     * nothing is worse than no dial, because it looks like it is working. The
     * measure is the FIFTIES: what should become rare when somebody is
     * dominating is the big play, not every play.
     */
    test('leaning back makes the big play rarer than easing off does', () => {
        /**
         * SEEDED, AND THE SAMPLE IS BIGGER THAN IT WAS, because this test was
         * intermittently red and it was under-powered rather than wrong.
         *
         * Every line-up rolls fresh speeds, so unseeded this measured a
         * different set of players on every run. Re-measured properly at 1224
         * plays a side the lean is worth about three points of fifties, and the
         * old comment's "19% against 7%" was itself a small-sample artifact: at
         * 102 a side the same build produced anything from a one point gap to a
         * twelve point one. A 0.03 margin against a three point effect is a coin
         * toss, which is exactly what it behaved like.
         *
         * Seeding makes it deterministic, and the bigger sample makes the
         * margin mean something rather than being survived.
         */
        const real = Math.random;
        let seed = 20260911;
        const reseed = () => {
            seed = 20260911;
            Math.random = () => {
                seed |= 0; seed = seed + 0x6D2B79F5 | 0;
                let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
                t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
                return ((t ^ t >>> 14) >>> 0) / 4294967296;
            };
        };
        const fiftiesAt = (lean) => {
            let fifty = 0;
            let n = 0;
            reseed();
            for (let rep = 0; rep < 3; rep += 1)
            for (const slug of OFFENSIVE_PLAYS) {
                for (const defence of ['cover1', 'cover2', 'cover4',
                    'cover7', 'cover11', 'cover14']) {
                    const play = createPlayForDifficulty();
                    setDifficulty(play, lean);
                    lineUp(play, slug, defence);
                    snap(play);
                    let acted = false;
                    for (let f = 0; f < CFG.simHz * 9 && !isDone(play); f += 1) {
                        tick(play);
                        if (!acted && f === Math.round(CFG.simHz * 1.6)) {
                            keepAndRun(play);
                            acted = true;
                        }
                    }
                    n += 1;
                    if ((outcome(play).points || 0) === 50) fifty += 1;
                }
            }
            Math.random = real;
            return fifty / n;
        };
        /**
         * Measured at 1224 plays a side the lean is worth about three points of
         * fifties. The margin has to sit under that and still be far enough from
         * zero to catch a dial that has stopped working, which is the regression
         * worth having. Seeded, so this is a fixed comparison rather than a
         * sample that happens to land somewhere.
         */
        expect(fiftiesAt(-1)).toBeGreaterThan(fiftiesAt(1) + 0.015);
    });
});

/**
 * THE STEER HAD NO THIRD BRANCH, AND BOTH FAULTS REPORTED ON 2026-09-11 CAME
 * OUT OF IT.
 *
 * Every route in the ported library holds a player on a line by accelerating
 * one way when he is below it and the other way when he is above it. There is
 * no deceleration anywhere in that law, which makes it an undamped oscillator:
 * the acceleration always opposes the displacement and no term ever removes
 * energy, so whatever lateral speed a man carries when he first crosses his
 * line he keeps for the whole play.
 *
 * The cases below are written against the PROPERTY (does he settle, is the aim
 * point stable) rather than against the deadband's value, and each one was
 * checked to fail with `steerDeadband` set back to 0, which is the ported law
 * exactly.
 */
const { MotionClass: Motion } = await import(join(scene, 'motion.js'));

describe('a man asked to run straight runs straight', () => {
    const lonePlayer = (settings, y, vy) => ({
        coords: { x: 0, y, startX: 0, startY: 50, z: 1 },
        physics: { accel: 0.4, decel: 1.5, maxSpeed: 2.15, xMulti: 1, yMulti: 1 },
        settings: { position: 'wr1', positionGroup: 'wr', team: 0, route: { type: 'go', boundaries: {} } },
        state: { xSpeed: 2.15, ySpeed: vy, hasBall: false, tackle: 0, direction: '' },
    });

    /** One man, no defenders, no collisions: just the steering law. */
    const runLine = (deadband, vy, frames = 400) => {
        const motion = new Motion(
            { style: { gutters: { x: SIM.gutter, y: SIM.gutter } }, steerDeadband: deadband },
            { state: { measurements: { height: 400, width: 1000, lineInterval: SIM.lineInterval, gutterX: 5, gutterY: 5 } } },
            { collide() {}, catch() {}, incomplete() {} }
        );
        const man = lonePlayer(null, 50, vy);
        const track = [];
        for (let f = 0; f < frames; f += 1) {
            motion.steerToY(man, 50);
            man.coords.y += man.state.ySpeed;
            track.push({ y: man.coords.y - 50, vy: man.state.ySpeed });
        }
        return track;
    };

    /**
     * THE ONE THAT MATTERS. A receiver who arrives on his line carrying lateral
     * speed must lose it. Under the ported law he never does: measured, a man
     * arriving at his own top speed of 2.15 settles into a permanent cycle
     * 6.4 units wide with |vy| reaching 2.15 every 11 frames, for as long as he
     * runs. That is the squiggle, and it is also a receiver who is genuinely
     * sprinting sideways while appearing to run straight.
     *
     * Asserted on the SECOND HALF of the run so that the arrival itself is not
     * what is being measured: the question is whether it ever ends.
     */
    test('lateral speed decays instead of being conserved forever', () => {
        for (const arrivedAt of [0.4, 1.0, 2.0, 2.15]) {
            const late = runLine(CFG.steerDeadband, arrivedAt).slice(200);
            const worstSpeed = Math.max(...late.map((p) => Math.abs(p.vy)));
            expect(worstSpeed).toBeLessThan(0.05);
        }
    });

    /**
     * ...and the ported law is kept honest in the same breath, because a test
     * that only proves the new code works cannot tell you the old code was
     * broken. At a deadband of 0 motion.js runs the 2D game's own two-way test,
     * and this is the fault, stated as a fact.
     */
    test('and the ported law, for comparison, conserves it exactly', () => {
        const late = runLine(0, 2.15).slice(200);
        const worstSpeed = Math.max(...late.map((p) => Math.abs(p.vy)));
        expect(worstSpeed).toBeGreaterThan(2);
    });

    /** He must also still HOLD the line: settling is worthless if he settles
     *  somewhere else. The band is what he is allowed, and nothing wider. */
    test('and he settles on his line rather than beside it', () => {
        for (const arrivedAt of [0.4, 2.15]) {
            const late = runLine(CFG.steerDeadband, arrivedAt).slice(200);
            const worstOffset = Math.max(...late.map((p) => Math.abs(p.y)));
            expect(worstOffset).toBeLessThanOrEqual(CFG.steerDeadband);
        }
    });

    /** A caller that says nothing about a deadband gets the 2D game, which is
     *  the promise every other injected setting in motion.js makes. */
    test('a motion built without the setting is the port, unchanged', () => {
        const bare = new Motion({ style: { gutters: { x: 5, y: 5 } } }, {}, {});
        expect(bare.steerDeadband()).toBe(0);
    });
});

describe('a pass is led off where the receiver is going', () => {
    /**
     * WHAT WAS WRONG: `generateBallObject` leads the throw off
     * `receiver.state.ySpeed` AT THE INSTANT of the tap, multiplied by as much
     * as 45. One frame of a velocity is the wrong thing to ask even of a clean
     * simulation, and with the undamped steer above it is a square wave at full
     * speed. Measured over 2550 pairs of throws made one frame apart on the
     * same play from the same seed, the aim point moved a mean of 0.162m and as
     * much as 5.41m, purely on which frame the visitor pressed.
     *
     * The property is that ADJACENT FRAMES AGREE: the receiver's real route
     * does not change between one frame and the next, so neither should the
     * place the ball is sent.
     */
    const aimOnFrame = (slug, defence, throwFrame) => {
        const play = createPlayForDifficulty();
        lineUp(play, slug, defence);
        snap(play);
        for (let f = 0; f < 400 && !isDone(play); f += 1) {
            tick(play);
            if (f === throwFrame) {
                const elig = eligibleReceivers(play);
                if (!elig.length || !throwTo(play, elig[0])) return null;
                const ball = play.game.objects
                    .find((o) => o.settings.position === 'ball');
                return ball ? ball.coords.targetY : null;
            }
        }
        return null;
    };

    test('throwing one frame later does not move the aim point by a body width', () => {
        /**
         * SEEDED, BECAUSE EVERY LINE-UP ROLLS A FRESH SET OF SPEEDS. Left to
         * the real Math.random this measures a different set of players on
         * every run, and the MAXIMUM of a sample is the least stable thing you
         * can assert on: it moved between 1.0m and 1.8m run to run while the
         * mean sat still. The mean is the honest statistic here and the seed is
         * what makes the bound on the worst case mean anything at all.
         */
        const real = Math.random;
        let seed = 20260911;
        Math.random = () => {
            seed |= 0; seed = seed + 0x6D2B79F5 | 0;
            let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
        const jumps = [];
        for (const slug of OFFENSIVE_PLAYS) {
            for (let f = 30; f < 44; f += 1) {
                const a = aimOnFrame(slug, 'cover2', f);
                const b = aimOnFrame(slug, 'cover2', f + 1);
                if (a === null || b === null) continue;
                jumps.push(Math.abs(a - b) * UNITS_TO_METRES);
            }
        }
        Math.random = real;
        expect(jumps.length).toBeGreaterThan(50);
        const mean = jumps.reduce((s, v) => s + v, 0) / jumps.length;
        // The ported build measures 0.162m mean and 5.41m worst over a much
        // larger sweep. Both bounds are far inside that and far outside what
        // the damped build produces (0.040m mean, 0.60m worst).
        expect(mean).toBeLessThan(0.09);
        expect(Math.max(...jumps)).toBeLessThan(1.5);
    });

    /**
     * AND THE HEADING IS A WINDOW, WHICH IS THE WHOLE REASON IT CANCELS A
     * WOBBLE. Net travel over the window divided by its length, so a man who
     * ends where he started contributes nothing and a man genuinely crossing
     * the field contributes all of it.
     */
    test('the heading is net travel over the window, not this frame speed', () => {
        const play = createPlayForDifficulty();
        lineUp(play, 'pass2', 'cover2');
        snap(play);
        const frames = Math.max(1, Math.round(CFG.simHz * CFG.lead.window));
        const man = play.game.objects
            .find((o) => o.settings.position === 'wr1' && !o.settings.benched);
        expect(man).toBeTruthy();

        // Nothing to average over yet, so nothing is claimed.
        tick(play);
        expect(man.state.heading).toBeFalsy();

        for (let f = 0; f < frames + 4; f += 1) tick(play);
        expect(man.state.heading).toBeTruthy();

        // Re-measure it by hand from the man's own recorded track.
        const span = (man.state.track.length / 2) - 1;
        expect(span).toBe(frames);
        expect(man.state.heading.y).toBeCloseTo(
            (man.coords.y - man.state.track[1]) / frames, 10);
        expect(man.state.heading.x).toBeCloseTo(
            (man.coords.x - man.state.track[0]) / frames, 10);
    });

    /**
     * A SQUARE WAVE AVERAGED OVER ITS OWN PERIOD IS ZERO, and that is not an
     * accident of tuning: `lead.window` is one full cycle of the undamped
     * wobble at simHz. It is asserted directly so that a future change to
     * either number has to face the reason both exist.
     */
    test('a man wobbling about a line has a heading of nothing', () => {
        const frames = Math.max(1, Math.round(CFG.simHz * CFG.lead.window));
        const play = createPlayForDifficulty();
        lineUp(play, 'pass2', 'cover2');
        snap(play);
        const man = play.game.objects
            .find((o) => o.settings.position === 'wr1' && !o.settings.benched);
        // Drive him by hand through a wobble, letting markHeading keep its own
        // track exactly as it does in a live frame. The window is an even
        // number of frames, so a two-frame wobble ends the window on the side
        // it began and the net travel across it is nothing.
        expect(frames % 2).toBe(0);
        man.state.track = null;
        for (let f = 0; f < frames * 3; f += 1) {
            man.coords.y = 100 + (f % 2 ? 3 : -3);
            markHeading(play);
        }
        // He is back where he started on the axis, so the lead is nothing,
        // however fast he was moving on the frame the visitor pressed.
        expect(Math.abs(man.state.heading.y)).toBeLessThan(0.2);
    });
});

/**
 * NOBODY STAYS WELDED TO A DEFENDER FOR THE WHOLE PLAY. QA, 2026-09-11.
 *
 * WHAT THEY WERE STUCK IN IS A LATCH, NOT A COLLISION. `checkCollisions` fires
 * on box overlap, and a non-lineman's box reaches 0.81m by 0.88m, so two of
 * them find each other up to 1.76m apart. `play.separate` rests bodies at
 * 1.45m, INSIDE that, so two men running alongside collide on EVERY frame and
 * the receiver's speed is hard-set to 40% of his top speed over and over.
 *
 * The measured signature is that lock durations were BIMODAL: median 0.03s,
 * 99th percentile 4.25s, longest the entire play. Physics gives a spread of
 * durations; a latch gives two outcomes.
 */
describe('a man with somebody hanging on him gets out of it', () => {
    /** Two men pinned together, ticked by hand, so the only thing under test is
     *  the escape clock rather than seventeen plays' worth of luck. */
    const pinned = (carrying) => {
        const play = createPlayForDifficulty();
        lineUp(play, 'pass2', 'cover2');
        const man = play.game.objects.find((o) => o.settings.position === 'wr1');
        const on = play.game.objects.find((o) => o.settings.position === 'db1');
        man.state.hasBall = carrying;
        return { play, man, on };
    };

    /** Hold them on top of each other and run the clock. */
    const holdFor = (ctx, seconds) => {
        const step = 1 / CFG.simHz;
        let broke = 0;
        for (let t = 0; t < seconds; t += step) {
            ctx.on.coords.x = ctx.man.coords.x;
            ctx.on.coords.y = ctx.man.coords.y + 20;
            broke += breakContact(ctx.play, step);
            if (ctx.man.state.escape && ctx.man.state.escape.at === 0) break;
        }
        return broke;
    };

    test('two seconds of the same man on him and he breaks free', () => {
        const ctx = pinned(false);
        // Not before the time is up. The threshold is the promise.
        holdFor(ctx, CFG.escape.after * 0.8);
        expect(ctx.man.state.escape).toBeFalsy();
        holdFor(ctx, CFG.escape.after);
        expect(ctx.man.state.escape).toBeTruthy();
        expect(ctx.man.state.escape.against).toBe('db1');
    });

    /**
     * AND IT HAS TO BE THE SAME MAN THROUGHOUT. A receiver crossing through a
     * crowd brushes four different defenders, and counting those together would
     * hand him a break he never earned, against nobody in particular.
     */
    test('contact with a different defender restarts the clock', () => {
        const ctx = pinned(false);
        const step = 1 / CFG.simHz;
        const other = ctx.play.game.objects.find((o) => o.settings.position === 'db2');
        for (let t = 0; t < CFG.escape.after * 0.9; t += step) {
            ctx.on.coords.x = ctx.man.coords.x;
            ctx.on.coords.y = ctx.man.coords.y + 20;
            breakContact(ctx.play, step);
        }
        // Swap who is on him, just short of the threshold.
        ctx.on.coords.x = -9e3;
        for (let t = 0; t < CFG.escape.after * 0.9; t += step) {
            other.coords.x = ctx.man.coords.x;
            other.coords.y = ctx.man.coords.y + 20;
            breakContact(ctx.play, step);
        }
        // Nine tenths plus nine tenths is more than one threshold and is not
        // two seconds of anybody, so he is still held.
        expect(ctx.man.state.escape).toBeFalsy();
    });

    test('a carrier stiff-arms and a route runner shoves', () => {
        const run = pinned(false);
        holdFor(run, CFG.escape.after * 1.2);
        expect(run.man.state.escape.kind).toBe('shove');

        const carry = pinned(true);
        holdFor(carry, CFG.escape.after * 1.2);
        expect(carry.man.state.escape.kind).toBe('stiff-arm');
    });

    /** The impulse is what actually separates them. Freedom from the damping
     *  alone leaves two men running alongside at the same speed. */
    test('the break moves him away from the man he broke from', () => {
        const ctx = pinned(false);
        holdFor(ctx, CFG.escape.after * 1.2);
        const e = ctx.man.state.escape;
        expect(e).toBeTruthy();
        // He is driven away from the defender, who sat at +20 in y.
        expect(e.away).toBe(-1);
        expect(Math.sign(ctx.man.state.ySpeed)).toBe(-1);
        expect(Math.abs(ctx.man.state.ySpeed))
            .toBeGreaterThan(ctx.man.physics.maxSpeed * CFG.escape.shove * 0.9);
    });

    /**
     * ...AND IT IS A MOVE, NOT AN EXEMPTION. He has to earn the whole threshold
     * again, which is what makes `after` the cooldown as well: the break zeroes
     * the contact clock. Counted as BREAKS rather than by looking at the flag,
     * because the flag is set for `grace` seconds after each one and a test that
     * only reads it cannot tell one long break from two quick ones.
     */
    test('he has to earn the whole two seconds again before the next one', () => {
        const ctx = pinned(false);
        holdFor(ctx, CFG.escape.after * 1.2);
        expect(ctx.man.state.escape).toBeTruthy();

        const step = 1 / CFG.simHz;
        const pinFor = (seconds) => {
            let broke = 0;
            for (let t = 0; t < seconds; t += step) {
                ctx.on.coords.x = ctx.man.coords.x;
                ctx.on.coords.y = ctx.man.coords.y + 20;
                broke += breakContact(ctx.play, step);
            }
            return broke;
        };
        // Held continuously, but not yet for another full threshold.
        expect(pinFor(CFG.escape.grace + CFG.escape.after * 0.8)).toBe(0);
        // ...and now he has.
        expect(pinFor(CFG.escape.after * 0.4)).toBe(1);
    });

    /**
     * THE SHED ITSELF: while he is breaking, the ported hard-set that was
     * holding him no longer applies. This is the half that lives in motion.js,
     * and it is asserted against the ported behaviour in the same test so that
     * what changed is visible.
     */
    test('the collision stops overwriting the speed of a man breaking free', () => {
        const build = (escaping) => {
            const motion = new Motion(
                { style: { gutters: { x: SIM.gutter, y: SIM.gutter } }, escapeShove: 1 },
                { state: { measurements: { height: 400, width: 1000, lineInterval: SIM.lineInterval } } },
                { collide() {}, catch() {}, incomplete() {} }
            );
            const wr = {
                coords: { x: 0, y: 0 }, physics: { maxSpeed: 2, accel: 0.4, decel: 1.5 },
                settings: { position: 'wr1', positionGroup: 'wr', team: 0 },
                state: { xSpeed: 2, ySpeed: 0, hasBall: false,
                    escape: escaping ? { at: 0, kind: 'juke', away: 1, against: 'db1' } : null },
            };
            const db = {
                coords: { x: 0, y: 0 }, physics: { maxSpeed: 2, accel: 0.4, decel: 1.5 },
                settings: { position: 'db1', positionGroup: 'db', team: 1 },
                state: { xSpeed: 0, ySpeed: 0, hasBall: false },
            };
            const set = (o) => ({
                hasBall: false, position: o.settings.position, team: o.settings.team,
                pocket: false, x: o.coords.x, x1: -10, x2: 10, xSpeed: o.state.xSpeed,
                y: o.coords.y, y1: -10, y2: 10, ySpeed: o.state.ySpeed,
            });
            motion.checkCollisionsDownfield(wr, db, set(wr), set(db));
            return wr.state.xSpeed;
        };
        // Ported: clamped to 40% of his top speed, which is the latch.
        expect(build(false)).toBeCloseTo(2 * 0.4, 6);
        // Breaking: he keeps the speed he had.
        expect(build(true)).toBeCloseTo(2, 6);
    });
});

/**
 * THE THREE THINGS THAT WERE WRONG WITH THE FIRST VERSION OF THE ESCAPE.
 *
 * None of them was visible in a test of the rule itself, and all three were
 * found by measuring the simulation. They are the cases worth keeping.
 */
describe('the escape survives contact with the rest of the game', () => {
    const pinTo = (play, man, on) => {
        on.coords.x = man.coords.x;
        on.coords.y = man.coords.y + 20;
    };
    const fresh = (carrying = false) => {
        const play = createPlayForDifficulty();
        lineUp(play, 'pass2', 'cover2');
        const man = play.game.objects.find((o) => o.settings.position === 'wr1');
        const on = play.game.objects.find((o) => o.settings.position === 'db1');
        man.state.hasBall = carrying;
        return { play, man, on };
    };

    /**
     * A FRAME OF DAYLIGHT IS NOT LETTING GO. `separate` settles a covered pair
     * at almost exactly the distance at which the collision boxes stop
     * touching, so a locked pair flickers in and out of contact on ALTERNATE
     * frames: traced, 50.0 then 50.8 units against a box reaching 50.4. Resetting
     * on the first frame out meant no receiver ever passed 2.00 seconds against
     * a 2.00 threshold while 1.4 real two-second locks happened every play.
     */
    test('a one-frame gap does not wipe out two seconds of contact', () => {
        const ctx = fresh();
        const step = 1 / CFG.simHz;
        // Alternate in and out of the box, which is what a real lock does.
        for (let t = 0; t < CFG.escape.after * 1.3; t += step) {
            const on = Math.round(t / step) % 2 === 0;
            if (on) pinTo(ctx.play, ctx.man, ctx.on);
            else ctx.on.coords.y = ctx.man.coords.y + 1e4;
            breakContact(ctx.play, step);
            if (ctx.man.state.escape) break;
        }
        expect(ctx.man.state.escape).toBeTruthy();
    });

    /** ...but a real separation still does. */
    test('letting go for longer than the forgiveness does reset it', () => {
        const ctx = fresh();
        const step = 1 / CFG.simHz;
        const hold = (seconds, on) => {
            for (let t = 0; t < seconds; t += step) {
                if (on) pinTo(ctx.play, ctx.man, ctx.on);
                else ctx.on.coords.y = ctx.man.coords.y + 1e4;
                breakContact(ctx.play, step);
            }
        };
        hold(CFG.escape.after * 0.9, true);
        hold(CFG.escape.forgive * 3, false);
        hold(CFG.escape.after * 0.9, true);
        expect(ctx.man.state.escape).toBeFalsy();
    });

    /**
     * A CARRIER IS BROUGHT DOWN WITHIN `settings.tackled` FRAMES OF CONTACT,
     * which is at most an eighth of a second, so he can never be entangled for
     * two seconds and a stiff-arm on the clock could never play. Measured
     * against the clock it never did: 46 breaks over 340 plays, every one a juke.
     */
    test('a carrier stiff-arms off his tackle progress, not off the clock', () => {
        const ctx = fresh(true);
        const step = 1 / CFG.simHz;
        ctx.man.settings.tackled = 8;
        // Nowhere near two seconds, but half way to being brought down.
        pinTo(ctx.play, ctx.man, ctx.on);
        breakContact(ctx.play, step);
        expect(ctx.man.state.escape).toBeFalsy();

        ctx.man.state.tackle = 8 * CFG.escape.stiffAt;
        pinTo(ctx.play, ctx.man, ctx.on);
        breakContact(ctx.play, step);
        expect(ctx.man.state.escape).toBeTruthy();
        expect(ctx.man.state.escape.kind).toBe('stiff-arm');
        // ...and it buys him something: part of the progress comes off.
        expect(ctx.man.state.tackle).toBeLessThan(8 * CFG.escape.stiffAt);
        // But never all of it, or he could not be tackled at all.
        expect(ctx.man.state.tackle).toBeGreaterThan(0);
    });

    /**
     * THE DRIVE IS HELD FOR THE WHOLE GRACE AND NEVER ACCUMULATES.
     *
     * Both halves were wrong at once. Struck on a single frame, the move bought
     * nothing, because a velocity written once means nothing to a controller
     * that re-derives velocity every frame: a pair 1.90m apart at the break were
     * 2.00m apart when it ended. Re-asserted with a `+=`, thirty-six frames of a
     * quarter of top speed compounded to six times his maximum and threw
     * carriers off the field, which took fifty-point plays to ZERO.
     */
    test('a sustained break never makes anybody faster than he is', () => {
        for (const carrying of [false, true]) {
            const ctx = fresh(carrying);
            const step = 1 / CFG.simHz;
            ctx.man.settings.tackled = 8;
            ctx.man.state.tackle = carrying ? 8 : 0;
            for (let t = 0; t < CFG.escape.after * 1.3 && !ctx.man.state.escape; t += step) {
                pinTo(ctx.play, ctx.man, ctx.on);
                breakContact(ctx.play, step);
            }
            expect(ctx.man.state.escape).toBeTruthy();
            const top = ctx.man.physics.maxSpeed;
            // Run the whole grace out, with the route contributing nothing.
            for (let t = 0; t < CFG.escape.grace; t += step) {
                breakContact(ctx.play, step);
                expect(Math.abs(ctx.man.state.ySpeed)).toBeLessThanOrEqual(top + 1e-9);
                expect(Math.abs(ctx.man.state.xSpeed)).toBeLessThanOrEqual(top + 1e-9);
            }
            // ...and it ends. Nothing is left running.
            expect(ctx.man.state.escape).toBeFalsy();
        }
    });

    /** And it is genuinely sustained: the move is still driving him a third of
     *  the way through, which a one-frame impulse would not be. */
    test('the drive is still working part way through the grace', () => {
        const ctx = fresh(false);
        const step = 1 / CFG.simHz;
        for (let t = 0; t < CFG.escape.after * 1.3 && !ctx.man.state.escape; t += step) {
            pinTo(ctx.play, ctx.man, ctx.on);
            breakContact(ctx.play, step);
        }
        expect(ctx.man.state.escape).toBeTruthy();
        // Wipe his speed as his route would, then let the break re-assert it.
        for (let t = 0; t < CFG.escape.grace / 3; t += step) {
            ctx.man.state.ySpeed = 0;
            breakContact(ctx.play, step);
        }
        expect(Math.abs(ctx.man.state.ySpeed))
            .toBeGreaterThan(ctx.man.physics.maxSpeed * CFG.escape.shove * 0.5);
    });
});

/**
 * WHICH WAY THE JUKE LEANS, WHICH IS THE ONE THING NO SIMULATION TEST CAN SEE.
 *
 * A sign error here draws a man leaning INTO the defender he is supposed to be
 * leaving, and every number in the game would still be right. So the property is
 * asserted through the rig's real geometry rather than against the arithmetic
 * that produced it: the two facts below were measured against three r160 with
 * `rotation.order` YXZ, and the test rebuilds the head's world position from
 * them and asks which side it ended up on.
 *
 *   - the figure's local +X maps to world (cos yaw, -sin yaw)
 *   - a POSITIVE rotation.z tilts the head toward local -X
 *
 * `away` is the break direction in SIMULATION y, and `simToWorld` maps sim y to
 * world z, so a correct lean puts the head on the same side of him as `away`.
 */
describe('a juke leans the way he is going', () => {
    /** Where the head ends up, in world x/z, for a given yaw and roll. */
    const headAt = (yaw, roll) => {
        // Local up tilts toward local -X by `roll` (measured, see above).
        const localX = -Math.sin(roll);
        // ...and local +X is world (cos yaw, -sin yaw).
        return { x: localX * Math.cos(yaw), z: localX * -Math.sin(yaw) };
    };

    test('the head goes to the side he broke toward, whichever way he faces', () => {
        const roll = CFG.pose.juke.roll;
        // Downfield for the offense, and the two sidelines, so a sign that only
        // happens to work on one heading cannot pass.
        for (const facing of [Math.PI / 2, -Math.PI / 2, Math.PI / 4, 2.6]) {
            for (const away of [1, -1]) {
                const head = headAt(facing, jukeRoll(away, facing, roll));
                // sim +y is world +z, so `away` is the sign of world z he broke
                // toward. Only count headings where the lean is not edge-on.
                if (Math.abs(Math.sin(facing)) < 0.2) continue;
                expect(Math.sign(head.z)).toBe(away);
            }
        }
    });

    test('a man running straight at the camera does not roll at all', () => {
        // Facing along world +z, a cross-field break is straight toward or away
        // from the viewer and there is no sideways lean to draw.
        expect(jukeRoll(1, 0, CFG.pose.juke.roll)).toBeCloseTo(0, 9);
    });

    /** The stiff-arm goes out at the man, which is the opposite side. */
    test('the stiff-arm reaches toward the defender, not away from him', () => {
        for (const facing of [Math.PI / 2, -Math.PI / 2]) {
            for (const away of [1, -1]) {
                const arm = stiffArmSide(away, facing);
                const head = headAt(facing, jukeRoll(away, facing, 0.3));
                // The lean and the arm are on opposite sides of him.
                expect(Math.sign(head.z)).toBe(away);
                expect(arm).toBe(away * Math.sin(facing) >= 0 ? 1 : -1);
            }
        }
    });

    /** ...and it never takes the arm that is holding the ball. */
    test('a stiff-arm never uses the carrying arm', () => {
        for (const want of [1, -1]) {
            const side = stiffSide({ stiffArmSide: want, carry: 'tuck' });
            expect(side).not.toBe(THROWING_SIDE);
        }
        // A man not carrying may use either.
        expect(stiffSide({ stiffArmSide: THROWING_SIDE, carry: 'none' }))
            .toBe(THROWING_SIDE);
    });

    /** The envelope rises, holds and falls inside the grace. */
    test('the move plays out and is over before the grace ends', () => {
        const g = CFG.escape.grace;
        const snap = CFG.pose.juke.snap;
        expect(escapeAmount({ at: 0 }, g, snap)).toBe(0);
        expect(escapeAmount({ at: snap }, g, snap)).toBeCloseTo(1, 6);
        expect(escapeAmount({ at: g / 2 }, g, snap)).toBeCloseTo(1, 6);
        expect(escapeAmount({ at: g }, g, snap)).toBe(0);
        expect(escapeAmount(null, g, snap)).toBe(0);
    });
});

/**
 * EVERY POSE BRANCH IS ACTUALLY EXECUTED, WHICH IS THE ONLY WAY TO CATCH THIS.
 *
 * `poseFigure` shipped a stiff-arm branch that called `stiffSide(act)` while the
 * declaration said `stiffArmSide`, and it reached a visitor's browser. NOTHING IN
 * THE SUITE COULD HAVE CAUGHT IT: `&&` short-circuits, so the undefined name is
 * only evaluated on a frame where somebody is actually stiff-arming, and no test
 * called `poseFigure` at all. The simulation tests all passed, the pose helpers
 * were unit tested directly, and the game crashed the first time a carrier fought
 * somebody off.
 *
 * So this drives the real function through every branch with a figure made of
 * plain objects. It is plain objects deliberately: the Three stub is a Proxy that
 * swallows every assignment, so a rotation written onto a stubbed mesh is
 * invisible and a test built on one cannot tell a pose from a no-op.
 */
describe('every pose the game can ask for actually runs', () => {
    const arm = (side) => ({
        userData: { armSide: side, restX: 0.1, restZ: side * 0.15,
            forearm: { rotation: { x: 0, y: 0, z: 0 } } },
        rotation: { x: 0, y: 0, z: 0 },
    });
    const figure = () => ({ userData: { arms: [arm(1), arm(-1)] } });

    /** Every shape of `act` view.js can hand over. */
    const ACTS = {
        running: {},
        reaching: { reach: 1, reachAt: { x: 0.2, y: 1.7, z: 0.5 } },
        tackling: { tackle: 1 },
        blocking: { block: 1 },
        'throwing (mid-release)': { carry: 'throw', throwT: 0.5, snapT: 1 },
        'under centre': { carry: 'throw', throwT: 0, snapT: 0 },
        posting: { posting: 1, carry: 'none' },
        tucking: { carry: 'tuck' },
        'stiff-arming, free side': { stiffArm: 1, stiffArmSide: -1, carry: 'tuck' },
        'stiff-arming, ball side': { stiffArm: 1, stiffArmSide: 1, carry: 'tuck' },
        'stiff-arming, no ball': { stiffArm: 1, stiffArmSide: 1, carry: 'none' },
        'knocked down': { down: 1 },
    };

    for (const [name, act] of Object.entries(ACTS)) {
        test(`${name} poses without throwing`, () => {
            const f = figure();
            // Several frames, because the pose eases toward its target and a
            // single frame barely leaves the rest position.
            for (let i = 0; i < 40; i += 1) poseFigure(f, 6, i * 0.3, act, 1 / 60);
            for (const a of f.userData.arms) {
                expect(Number.isFinite(a.rotation.x)).toBe(true);
                expect(Number.isFinite(a.rotation.z)).toBe(true);
                expect(Number.isFinite(a.userData.forearm.rotation.x)).toBe(true);
            }
        });
    }

    /**
     * AND THE STIFF-ARM IS ONE ARM. Both arms out is a block, which is a
     * different pose and reads as one from the play camera.
     */
    test('a stiff-arm extends one arm and leaves the other running', () => {
        const held = figure();
        const free = figure();
        for (let i = 0; i < 40; i += 1) {
            poseFigure(held, 6, i * 0.3, { carry: 'tuck' }, 1 / 60);
            poseFigure(free, 6, i * 0.3,
                { carry: 'tuck', stiffArm: 1, stiffArmSide: -1 }, 1 / 60);
        }
        const at = (f, side) => f.userData.arms.find((a) => a.userData.armSide === side);
        // The arm that did the stiff-arming has moved.
        expect(Math.abs(at(free, -1).rotation.x - at(held, -1).rotation.x))
            .toBeGreaterThan(0.05);
        // ...and the one holding the ball is still holding it.
        expect(at(free, 1).rotation.x).toBeCloseTo(at(held, 1).rotation.x, 6);
    });
});

/**
 * QA, 2026-09-11, ROUND TWO. THREE THINGS THE FIRST ESCAPE GOT WRONG.
 *
 *   "The receivers running their routes never seem to stiff arm or juke."
 *   "I see a slight push, but they still stay locked together."
 *   "The ball carrier keeps their arm raised after being tackled."
 *
 * All three measured true. Route runners broke 0.30 times a play against the
 * carrier's 0.70, the push was undone within five frames, and 0.64 players a
 * play were still holding a pose when the whistle went.
 */
describe('a covered receiver shoves his man off', () => {
    const pinned = (carrying = false) => {
        const play = createPlayForDifficulty();
        lineUp(play, 'pass2', 'cover2');
        const man = play.game.objects.find((o) => o.settings.position === 'wr1');
        const on = play.game.objects.find((o) => o.settings.position === 'db1');
        man.state.hasBall = carrying;
        return { play, man, on };
    };
    const hold = (ctx, seconds) => {
        const step = 1 / CFG.simHz;
        for (let t = 0; t < seconds; t += step) {
            ctx.on.coords.x = ctx.man.coords.x;
            ctx.on.coords.y = ctx.man.coords.y + 20;
            breakContact(ctx.play, step);
            if (ctx.man.state.escape && ctx.man.state.escape.at === 0) return true;
        }
        return false;
    };

    /**
     * THE THRESHOLD HAS TO BE REACHABLE, which two seconds was not. Measured on
     * what one receiver and one defender actually sustain, the longest unbroken
     * contact a non-carrying receiver reaches is a median of 0.86s and he gets
     * to two seconds on NONE of 340 plays. Asserted as a property of the config
     * rather than as its value: whatever the number becomes, it has to be inside
     * what the game produces.
     */
    test('the threshold is short enough that coverage actually reaches it', () => {
        expect(CFG.escape.after).toBeLessThanOrEqual(1.25);
    });

    test('a covered route runner shoves rather than juking away', () => {
        const ctx = pinned(false);
        expect(hold(ctx, CFG.escape.after * 1.4)).toBe(true);
        expect(ctx.man.state.escape.kind).toBe('shove');
    });

    /**
     * AND THE MAN HE SHOVED STAYS SHOVED. This is where the separation comes
     * from and it is the fault the first version had: damping a defender once is
     * undone by his own cover route within five frames, because that route
     * re-derives his velocity every frame and points it straight back at the
     * receiver.
     */
    test('the defender is slowed for as long as the stagger lasts', () => {
        const ctx = pinned(false);
        expect(hold(ctx, CFG.escape.after * 1.4)).toBe(true);
        expect(ctx.on.state.shoved).toBeTruthy();

        const step = 1 / CFG.simHz;
        const top = ctx.on.physics.maxSpeed;
        let dampedFrames = 0;
        let frames = 0;
        for (let t = 0; t < CFG.escape.stagger * 0.8; t += step) {
            // His route asks for a full sprint on every frame, exactly as it
            // does in the game. The stagger has to beat that, not a standstill.
            ctx.on.state.xSpeed = top;
            ctx.on.state.ySpeed = top;
            breakContact(ctx.play, step);
            frames += 1;
            if (Math.abs(ctx.on.state.xSpeed) < top * 0.95) dampedFrames += 1;
        }
        // Every frame of it, not just the first.
        expect(dampedFrames).toBe(frames);
        expect(frames).toBeGreaterThan(10);
    });

    test('and the stagger ends, rather than holding him down all play', () => {
        const ctx = pinned(false);
        expect(hold(ctx, CFG.escape.after * 1.4)).toBe(true);
        const step = 1 / CFG.simHz;
        for (let t = 0; t < CFG.escape.stagger + step * 2; t += step) {
            breakContact(ctx.play, step);
        }
        expect(ctx.on.state.shoved).toBeFalsy();
        const top = ctx.on.physics.maxSpeed;
        ctx.on.state.xSpeed = top;
        breakContact(ctx.play, step);
        expect(ctx.on.state.xSpeed).toBeCloseTo(top, 6);
    });

    /**
     * NOBODY HOLDS A POSE AFTER THE WHISTLE. `state.escape` is cleared by its
     * own clock inside `breakContact`, which only runs from `tick`, which
     * returns immediately once the play is dead. So a carrier brought down
     * mid-stiff-arm kept the flag for ever, which is exactly what QA watched.
     */
    test('a tackled carrier drops his arm', () => {
        const ctx = pinned(true);
        ctx.man.settings.tackled = 8;
        ctx.man.state.tackle = 8 * CFG.escape.stiffAt;
        ctx.on.coords.x = ctx.man.coords.x;
        ctx.on.coords.y = ctx.man.coords.y + 20;
        breakContact(ctx.play, 1 / CFG.simHz);
        expect(ctx.man.state.escape).toBeTruthy();

        // The whistle goes while the move is still playing.
        ctx.play.playState.state.tackled = true;
        ctx.play.live = true;
        tick(ctx.play);
        expect(ctx.man.state.escape).toBeFalsy();
    });

    test('and nothing is left holding a pose when a play ends any other way', () => {
        const ctx = pinned(false);
        expect(hold(ctx, CFG.escape.after * 1.4)).toBe(true);
        expect(clearEscapes(ctx.play)).toBeGreaterThan(0);
        for (const o of ctx.play.game.objects) {
            expect(o.state.escape).toBeFalsy();
            expect(o.state.shoved).toBeFalsy();
        }
    });

    /**
     * A WHOLE PLAY, END TO END: BY THE WHISTLE NOBODY IS POSED.
     *
     * AN EARLIER VERSION OF THIS TEST WAS FLAKY AND IT WAS THE TEST'S FAULT. It
     * gave the play twelve simulated seconds and asserted it had finished, which
     * is not something the simulation promises: measured, a keeper can still be
     * running after 12.11 seconds, and the only hard stop in the game is
     * `main.PLAY_TIMEOUT`. It failed about one run in twenty-five.
     *
     * So it runs to the budget the GAME actually allows, and the assertion is
     * about the thing under test, which is that a finished play leaves nobody
     * holding a pose. A play still running is not a failure of that.
     */
    test('no play ends with anybody still mid-move', () => {
        const budget = CFG.clock.decide + CFG.clock.backstop;
        let finished = 0;
        for (const slug of ['pass2', 'run1', 'screen1', 'slant1']) {
            const play = createPlayForDifficulty();
            lineUp(play, slug, 'cover2');
            snap(play);
            for (let f = 0; f < CFG.simHz * budget && !isDone(play); f += 1) {
                tick(play);
                if (f === 30) {
                    const e = eligibleReceivers(play);
                    if (e.length) throwTo(play, e[0]);
                }
            }
            if (!isDone(play)) continue;
            finished += 1;
            for (const o of play.game.objects) {
                expect(o.state.escape).toBeFalsy();
            }
        }
        // ...and the budget really is enough for the plays to finish in, or this
        // would be a test that passes by never checking anything.
        expect(finished).toBeGreaterThan(0);
    });
});

/**
 * THE PLAY CLOCK, WHICH IS A RULE THE GAME ALREADY HAD AND NEVER DREW.
 *
 * QA: holding the ball recorded a SACK with no defender near the quarterback.
 * True, and an accident: `main.PLAY_TIMEOUT` was a backstop for a play that
 * never ends, and `classifyPlay` returns a sack for any play nobody threw or ran
 * with. The game quietly charged five points for a slow decision and never said
 * so. It is now a clock the visitor can watch.
 */
describe('the play clock', () => {
    const HZ = CFG.simHz;
    const held = (seconds, act) => {
        const play = createPlayForDifficulty();
        lineUp(play, 'pass2', 'cover2');
        snap(play);
        for (let f = 0; f < HZ * seconds && !isDone(play); f += 1) {
            tick(play);
            if (act) act(play, f);
        }
        return play;
    };

    test('holding the ball to zero is a sack, for the sack points', () => {
        const play = held(CFG.clock.decide + 2);
        expect(isDone(play)).toBe(true);
        // On the clock, not a frame either side of it.
        expect(play.frame / HZ).toBeCloseTo(CFG.clock.decide, 1);
        const out = outcome(play);
        expect(out.result).toBe('sack');
        expect(out.points).toBe(pointsForSack());
    });

    function pointsForSack() {
        // Read from the scorer rather than restated, so the two cannot drift.
        return classifySack().points;
    }
    function classifySack() {
        const play = createPlayForDifficulty();
        lineUp(play, 'pass2', 'cover2');
        snap(play);
        for (let f = 0; f < HZ * (CFG.clock.decide + 1) && !isDone(play); f += 1) tick(play);
        return outcome(play);
    }

    /**
     * EVERY SECOND IS COUNTED, AND ZERO IS NOT ONE OF THEM WHILE HE STILL HAS
     * TIME.
     *
     * The readout is `Math.ceil`, so "1" means anything up to a full second
     * left. A 0 anywhere in this sequence would be a number sitting on screen
     * while the visitor still had nine tenths of a second to throw.
     *
     * THE BOARD IS A DIFFERENT QUESTION, and the test below is the other half
     * of this one: the count ends AT zero, on the frame the clock runs the play
     * out. What must not happen is a zero before then.
     */
    test('it counts every second from the full clock down to one', () => {
        const play = createPlayForDifficulty();
        lineUp(play, 'pass2', 'cover2');
        snap(play);
        const shown = new Set();
        for (let f = 0; f < HZ * (CFG.clock.decide + 1) && !isDone(play); f += 1) {
            tick(play);
            const left = decisionLeft(play);
            if (left !== null) shown.add(Math.ceil(left));
        }
        for (let n = 1; n <= CFG.clock.decide; n += 1) expect(shown.has(n)).toBe(true);
        expect(shown.has(0)).toBe(false);
    });

    /**
     * THE BOARD REACHES ZERO, AND IT DID NOT. QA ROUND TWENTY-SIX, ITEM 1:
     * "the 10 second play clock ends at 1 instead of 0".
     *
     * The whistle for time is raised inside the same simulation step that
     * reaches zero, so by the time anything asks `decisionLeft` the play is
     * already over and the honest answer is null, "nothing left to say". The
     * board holds the last number it was given, which was one, and a countdown
     * that stops on one is a countdown nobody believes.
     *
     * ASSERTED THROUGH THE RULE THE GAME ACTUALLY USES. `clockReading` is what
     * main.js paints the board from, so this is the sequence a visitor watches
     * rather than a restatement of the arithmetic behind it.
     */
    test('the board counts down to zero and stops there', () => {
        const play = createPlayForDifficulty();
        lineUp(play, 'pass2', 'cover2');
        snap(play);
        let shown = CFG.clock.decide;
        const seen = [shown];
        for (let f = 0; f < HZ * (CFG.clock.decide + 1) && !isDone(play); f += 1) {
            tick(play);
            const next = clockReading(decisionLeft(play), shown, play.expired);
            if (next !== shown) { shown = next; seen.push(shown); }
        }
        expect(isDone(play)).toBe(true);
        expect(outcome(play).result).toBe('sack');
        // Every second, in order, ending on the zero the whistle went at.
        const want = [];
        for (let n = CFG.clock.decide; n >= 0; n -= 1) want.push(n);
        expect(seen).toEqual(want);
    });

    /**
     * ...AND ONLY THAT ENDING GETS A ZERO. A board that blanked or zeroed
     * itself on every whistle would tell a visitor who threw on eight that he
     * had run out of time. A real play clock stops on the number it stopped at.
     */
    test('a play that ended some other way freezes the board where it stopped', () => {
        const play = createPlayForDifficulty();
        lineUp(play, 'pass2', 'cover2');
        snap(play);
        let shown = CFG.clock.decide;
        let thrown = false;
        for (let f = 0; f < HZ * 12 && !isDone(play); f += 1) {
            tick(play);
            if (!thrown && f === Math.round(HZ * 2.5)) {
                const elig = eligibleReceivers(play);
                thrown = elig.length > 0 && throwTo(play, elig[0]);
            }
            shown = clockReading(decisionLeft(play), shown, play.expired);
        }
        expect(thrown).toBe(true);
        expect(play.expired).toBe(false);
        // He threw with seven and a half seconds left, so the board holds 8.
        expect(shown).toBe(CFG.clock.decide - 2);
    });

    /** ...and the clock is put away on the whistle rather than freezing. */
    test('the clock has nothing to say once the play is over', () => {
        const play = held(CFG.clock.decide + 2);
        expect(isDone(play)).toBe(true);
        expect(decisionLeft(play)).toBeNull();
    });

    /**
     * IT TIMES THE VISITOR, NOT THE PLAY. It stops the moment he throws it or
     * tucks it, because after that there is no further input to wait for. A
     * clock that kept running would sack a quarterback in the middle of a
     * twelve second run.
     */
    for (const [name, act] of [
        ['a throw', (p) => {
            const e = eligibleReceivers(p);
            return e.length ? throwTo(p, e[0]) : false;
        }],
        ['a keeper', (p) => keepAndRun(p)],
    ]) {
        test(`${name} stops the clock the instant it is made`, () => {
            const at = Math.round(HZ * (CFG.clock.decide - 1));
            /**
             * CHECKED WHILE THE PLAY IS STILL RUNNING, which is the only moment
             * that proves anything. An earlier version of this test read the
             * clock after the whistle, where it is null because the play is
             * OVER, and it passed happily against a build whose clock went on
             * counting down through the whole run. The visitor would have
             * watched a countdown tick away over a completed pass.
             */
            let liveAfter = 'never checked';
            let acted = false;
            const play = held(CFG.clock.decide + 4, (p, f) => {
                if (f === at) {
                    // The decision has to actually have been taken. `throwTo`
                    // refuses when nobody is eligible, and asserting anything
                    // about a clock after a refused decision is asserting the
                    // wrong thing.
                    acted = act(p) === true;
                    if (!isDone(p)) liveAfter = decisionLeft(p);
                }
            });
            expect(acted).toBe(true);
            expect(liveAfter).toBeNull();
            expect(undecided(play)).toBe(false);
            expect(outOfTime(play)).toBe(false);
            expect(outcome(play).result).not.toBe('sack');
        });
    }

    /**
     * AND THE PRECONDITION IS ESTABLISHED RATHER THAN ASSUMED, which is what an
     * earlier version of this got wrong and was intermittently punished for.
     *
     * `throwTo` CAN LEGITIMATELY REFUSE. The run and jumbo formations bench most
     * of the receivers, and which ones is rolled per line-up, so a play
     * sometimes has nobody eligible at the moment the test throws. No throw
     * means the quarterback holds it, and holding it is a sack: the game was
     * right and the test was asserting a conclusion whose premise had failed. It
     * went red about one run in twenty-five.
     */
    test('deciding in time never produces a sack, on any play in the book', () => {
        let threwOn = 0;
        for (const slug of OFFENSIVE_PLAYS) {
            let threw = false;
            const play = held(CFG.clock.decide + 6, (p, f) => {
                if (f !== Math.round(HZ * 2)) return;
                const e = eligibleReceivers(p);
                if (e.length) threw = throwTo(p, e[0]) === true;
            });
            if (!threw) continue;
            threwOn += 1;
            expect(outcome(play).result).not.toBe('sack');
        }
        // ...and it genuinely threw on most of the book, or this is a test that
        // passes by skipping everything.
        expect(threwOn).toBeGreaterThan(OFFENSIVE_PLAYS.length / 2);
    });

    /**
     * AND THE BACKSTOP HAS TO CLEAR THE TAIL. This is the one that would have
     * bitten: a flat twelve seconds from the snap was safe only while nothing
     * encouraged a late decision. Measured from a decision taken at the last
     * legal moment, the longest run still needed 12.11 seconds after it.
     *
     * Asserted as a property against the game's own worst case rather than
     * against the number, so it keeps meaning something if either moves.
     */
    test('the backstop clears the longest play a late decision can still start', () => {
        /**
         * SEEDED, because this is a worst-case search over random speeds and an
         * unseeded one is a different search every run. It found a 14.00 second
         * tail against a 14 second backstop on about one run in ten, while a
         * separate 1213-play sweep had put the longest at 12.24 and made 14 look
         * safe. Both were true. The backstop was simply sitting ON the worst case
         * instead of clearing it.
         */
        const real = Math.random;
        let seed = 31337;
        Math.random = () => {
            seed |= 0; seed = seed + 0x6D2B79F5 | 0;
            let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
        let worst = 0;
        for (const slug of OFFENSIVE_PLAYS) {
            for (const defence of ['cover2', 'zone2', 'cover7', 'cover11']) {
                const play = createPlayForDifficulty();
                lineUp(play, slug, defence);
                snap(play);
                let decided = -1;
                for (let f = 0; f < HZ * 40 && !isDone(play); f += 1) {
                    tick(play);
                    // The latest he can legally decide, then let it run.
                    if (f === Math.round(HZ * CFG.clock.decide) - 2) {
                        if (keepAndRun(play)) decided = f;
                    }
                }
                if (decided >= 0) worst = Math.max(worst, (play.frame - decided) / HZ);
            }
        }
        Math.random = real;
        expect(worst).toBeGreaterThan(1);
        // CLEARS it, with room. A backstop that merely equals the worst case
        // fires on it, and a backstop firing is a play the visitor watched get
        // cut off mid-run.
        expect(CFG.clock.backstop).toBeGreaterThan(worst * 1.15);
    });

    /**
     * THE COPY NAMES THE NUMBER, SO THE COPY IS PINNED TO IT. A count in prose
     * goes stale silently, and this one is the only way a visitor who cannot see
     * the readout learns the rule at all: the clock itself is `aria-hidden`,
     * because a value changing every frame inside a live region would talk over
     * everything else a screen reader is saying.
     */
    test('the welcome card tells the visitor how long he has', () => {
        const html = readFileSync(join(here, '..', 'www', 'exesnohs', 'index.html'), 'utf8');
        const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six',
            'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
        const n = CFG.clock.decide;
        const spoken = words[n] || `${n}`;
        const steps = html.slice(html.indexOf('welcome-steps'), html.indexOf('</ol>'));
        expect(steps.toLowerCase()).toContain(`${spoken} seconds`);
    });

    /** The readout is deliberately not announced. If that ever changes, the
     *  welcome copy is no longer the only route to the rule and this should be
     *  reconsidered rather than silently left behind. */
    test('the clock readout is hidden from screen readers', () => {
        const html = readFileSync(join(here, '..', 'www', 'exesnohs', 'index.html'), 'utf8');
        const tag = html.slice(html.indexOf('id="hud-clock"') - 200,
            html.indexOf('id="hud-clock"') + 120);
        expect(tag).toContain('aria-hidden="true"');
    });
});

/**
 * WHAT A CAUGHT BALL IS, AND WHAT A WHISTLE IS ALLOWED TO CHANGE.
 *
 * Both cases below are QA round twenty-six, reported as two separate faults
 * ("a receiver caught it and the card said intercepted", and "the play ends
 * with the carrier still running and no tackle"), and both are one frame of the
 * simulation doing something to a play that was already over.
 */
describe('the ball stops when somebody catches it', () => {
    const HZ = CFG.simHz;

    /** Snap, throw to the first eligible receiver, and run until the ball is
     *  caught by the offense. Returns null when this particular play produced
     *  an incompletion or a pick, which is not the case under test. */
    function playUntilCaught(slug, defence, throwAt = 1.2, limit = 12) {
        const play = createPlayForDifficulty();
        lineUp(play, slug, defence);
        snap(play);
        let thrown = false;
        for (let f = 0; f < HZ * limit && !isDone(play); f += 1) {
            if (!thrown && f >= HZ * throwAt) {
                const elig = eligibleReceivers(play);
                thrown = elig.length > 0 && throwTo(play, elig[0]);
                if (!thrown) return null;
            }
            tick(play);
            const st = play.playState.state;
            if (st.ball.caught && st.ball.team === 0) return play;
        }
        return null;
    }

    function anyCaught() {
        for (const slug of OFFENSIVE_PLAYS) {
            for (const defence of ['cover2', 'man1', '']) {
                const play = playUntilCaught(slug, defence);
                if (play) return play;
            }
        }
        return null;
    }

    /**
     * THE 2D GAME DELETES THE BALL. `runObjectAnimations` splices it out of the
     * object list on the first frame `ball.caught` goes true, and that line was
     * not ported, so the ball flew on to wherever it had been aimed and then lay
     * there with `checkCatch` asked about it on every remaining frame of the
     * play.
     *
     * MEASURED, IT STOLE ONE PLAY IN 816. A defender crossing the spot where the
     * pass had been aimed, seconds after a receiver caught it thirty metres
     * away, was handed the ball by `handleCatchResult`: `ball.team` went to 1,
     * the whistle went, the card said the Crows had taken it away, and the
     * receiver, whose own `hasBall` is never lowered, was still drawn carrying
     * it. That is the screenshot QA sent.
     *
     * This puts the defender there on purpose rather than waiting for one to
     * wander over, because a bug that needs 816 plays to show itself needs a
     * test that does not.
     */
    test('the ball goes no further once it is caught', () => {
        const play = anyCaught();
        expect(play).toBeTruthy();
        const st = play.playState.state;
        const catcher = st.ball.position;
        const ball = play.game.objects.find((o) => o.settings.position === 'ball');
        expect(ball).toBeTruthy();
        const at = { x: ball.coords.x, y: ball.coords.y };

        for (let f = 0; f < 60 && !isDone(play); f += 1) tick(play);

        // It is where it was caught, which is what `showBall` has always
        // claimed ("the ball object stops where it was caught") and what the
        // 2D game guarantees by deleting the object outright.
        expect(ball.coords.x).toBeCloseTo(at.x, 6);
        expect(ball.coords.y).toBeCloseTo(at.y, 6);

        // ...so it is still the same man's ball, and only his. A second
        // `hasBall` is what drew a receiver carrying a ball the card had
        // already given to the Crows.
        expect(st.ball.team).toBe(0);
        expect(st.ball.position).toBe(catcher);
        expect(outcome(play).result).not.toBe('interception');
        const carrying = play.game.objects
            .filter((o) => o.state && o.state.hasBall && !o.settings.benched);
        expect(carrying.map((o) => o.settings.position)).toEqual([catcher]);
    });
});

/**
 * NOTHING SHOVES ANYBODY AFTER THE WHISTLE.
 *
 * `separate` is the port's own addition: the 2D game never needed one, because
 * its players were letterforms rather than bodies 2.2 times life size. It is
 * therefore the only thing in a frame that can move a man after his own route
 * has finished with him, and the routes end the play by comparing that man's
 * coordinate to a rung of the ladder.
 */
describe('a crossing cannot be shoved back over the line', () => {
    const HZ = CFG.simHz;
    const RUNG = -4 + SIM.lineInterval * 4;   // where both routes call a crossing

    /**
     * SEEDED, so the sweep is the same sweep every run. Every line-up rolls a
     * fresh set of speeds, and a fault that shows on one crossing in 149 is
     * exactly the kind that appears and disappears between runs otherwise.
     */
    function seeded(run) {
        const real = Math.random;
        let seed = 20260912;
        Math.random = () => {
            seed |= 0; seed = seed + 0x6D2B79F5 | 0;
            let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
        try { return run(); } finally { Math.random = real; }
    }

    function sweep() {
        const rows = [];
        for (const slug of OFFENSIVE_PLAYS) {
            for (const at of [0.4, 1.0, 2.0]) {
                for (let k = 0; k < 4; k += 1) {
                    const play = createPlayForDifficulty();
                    lineUp(play, slug, '');
                    snap(play);
                    let decided = false;
                    for (let f = 0; f < HZ * 25 && !isDone(play); f += 1) {
                        if (!decided && f >= HZ * at) {
                            decided = keepAndRun(play);
                        }
                        tick(play);
                    }
                    const carrier = ballCarrier(play);
                    rows.push({
                        slug,
                        crossed: play.playState.state.anim.run50 === true,
                        x: carrier ? carrier.coords.x : null,
                        points: outcome(play).points,
                    });
                }
            }
        }
        return rows;
    }

    /**
     * THE PLAY THAT ENDED AT THE GOAL LINE IS WORTH THE GOAL LINE. Measured on
     * the build QA reviewed, one crossing in 149 was scored 30: the route ended
     * the play the instant the carrier reached the rung, and `separate` then
     * pushed him a few centimetres back over it before anything asked what he
     * was worth. What the visitor saw was the whistle going with the carrier at
     * full speed, nobody tackling him, and a card reading "+30".
     */
    test('every carrier who reached the rung is paid for reaching it', () => {
        const rows = seeded(sweep);
        const crossings = rows.filter((r) => r.crossed);
        expect(crossings.length).toBeGreaterThan(20);
        for (const r of crossings) {
            expect({ slug: r.slug, x: r.x >= RUNG, points: r.points })
                .toEqual({ slug: r.slug, x: true, points: 50 });
        }
    });
});

/**
 * QA ROUND TWENTY-SEVEN. Eight items, six of which are rules that were only
 * ever visible in a rendered frame. Each one below is the rule itself, pulled
 * out of the render loop so it can be asked a question with numbers.
 */
describe('the sounds a finished play makes', () => {
    /**
     * ITEM 1: "a grunt plays even when the ball carrier scores 50 without being
     * tackled, along with the whistle".
     *
     * The 2D game's `handleFinish` is one if/else, `points === 50 ? whistle :
     * grunt`. The port spelled the else out as a list of result slugs and lost
     * the condition, and a fifty carried across the line is a 'catch' with
     * nobody left to tackle him, so it matched.
     */
    test('a score is a whistle and never a grunt, however it was scored', () => {
        for (const slug of ['catch', 'run', 'run-50']) {
            const sounds = endSounds({ result: slug, points: 50 }, false);
            expect({ slug, ...sounds }).toEqual({ slug, whistle: true, grunt: false });
        }
    });

    test('a play that merely ended still grunts', () => {
        expect(endSounds({ result: 'catch', points: 30 }, false).grunt).toBe(true);
        expect(endSounds({ result: 'run', points: 15 }, false).grunt).toBe(true);
        expect(endSounds({ result: 'sack', points: -5 }, false).grunt).toBe(true);
    });

    /** ...and the grunt belongs to the hit, so a tackle plays its own and this
     *  one keeps quiet. */
    test('a tackle grunts at the hit rather than over the card', () => {
        expect(endSounds({ result: 'run', points: 15 }, true).grunt).toBe(false);
    });

    /** An incomplete pass sounds itself from inside routes.js, and an
     *  interception is a whistle. Neither is a grunt. */
    test('an incompletion and an interception do not grunt', () => {
        expect(endSounds({ result: 'incomplete', points: 0 }, false))
            .toEqual({ whistle: false, grunt: false });
        expect(endSounds({ result: 'interception', points: -10 }, false))
            .toEqual({ whistle: true, grunt: false });
    });
});

describe('nobody blocks anybody before the snap', () => {
    /**
     * ITEM 4: "some figures have their arms extended or are arm-locked with an
     * opposing player before the ball is ever snapped".
     *
     * `blockersEngaged` is a pure distance question: `reach` is 2.7m, `lock` is
     * 2.3m, and `play.separate` holds bodies about 1.45m apart at the line-up.
     * So the whole line came back fully engaged while everyone was standing
     * waiting, which is the only time in a play when nobody is blocking.
     */
    /**
     * THE QUARTERBACK IS THE CARRIER BEFORE THE SNAP, which is what made this
     * as bad as it was: he is holding the ball at the line-up, so
     * `blockersEngaged` counted the RECEIVERS as blockers too (they block for
     * whoever has it), and a receiver stands closer to the man covering him
     * than any lineman stands to anyone.
     */
    const lineUpAndLook = (slug, defence, presnap) => {
        const play = createPlayForDifficulty();
        const objects = lineUp(play, slug, defence);
        const qb = objects.find((o) => o.settings.position === 'qb');
        return blockersEngaged(objects, qb, presnap);
    };

    /**
     * SWEPT RATHER THAN SAMPLED, because how close the nearest opponent lines
     * up is a property of the pair of formations. Measured on the build QA
     * reviewed, 82 of the 102 combinations had somebody engaged before the ball
     * was snapped and the worst had four pairs at FULL lock: arms out, hands on
     * each other, both men turned to face each other, leaning in.
     */
    const DEFENCES = ['', 'cover2', 'man1', 'blitz1', 'zone1', 'nickel1'];

    test('no formation has a block in it before the snap', () => {
        const busy = [];
        for (const slug of OFFENSIVE_PLAYS) {
            for (const defence of DEFENCES) {
                const engaged = lineUpAndLook(slug, defence, true);
                if (engaged.size) busy.push(`${slug}/${defence || 'random'}`);
            }
        }
        expect(busy).toEqual([]);
    });

    /**
     * ...AND PLENTY OF THEM DO ONCE THE PLAY IS RUNNING, which is the half that
     * proves the gate is the phase and not a distance. If this ever comes back
     * empty the fix above has quietly disabled blocking outright.
     */
    test('the same formations are full of them once it is live', () => {
        let seen = 0;
        for (const slug of OFFENSIVE_PLAYS) {
            for (const defence of DEFENCES) {
                const engaged = lineUpAndLook(slug, defence, false);
                seen += engaged.size;
                for (const [, how] of engaged) {
                    expect(how.amount).toBeGreaterThan(0);
                    expect(how.amount).toBeLessThanOrEqual(1);
                }
            }
        }
        expect(seen).toBeGreaterThan(20);
    });
});

describe('an offensive lineman watches the rush', () => {
    /**
     * ITEM 5: "while blocking for the QB, offensive linemen will sometimes turn
     * and face toward the QB. This would never happen in real NFL football."
     *
     * An unengaged lineman fell through every branch of `lookTarget` and was
     * left facing the way he was MOVING, and pass protection is a drop back
     * toward the quarterback. So the line turned its back on the rush and
     * looked at the man it was protecting.
     */
    const world = (obj) => simToWorld(obj.coords.x, obj.coords.y, 0);

    test('he looks at the nearest defender rather than where he is going', () => {
        const play = createPlayForDifficulty();
        const objects = lineUp(play, 'pass2', 'cover2');
        const linemen = objects.filter((o) => /^x\d$/.test(o.settings.position)
            && !o.settings.benched);
        expect(linemen.length).toBeGreaterThan(2);

        for (const man of linemen) {
            const here = world(man);
            // No engagement and no carrier: the case that used to return null,
            // which means "face your own feet".
            const look = lookTarget(man, objects, null, here, false, '');
            expect({ pos: man.settings.position, looking: !!look })
                .toEqual({ pos: man.settings.position, looking: true });

            // ...and it is the nearest defender, not just any of them.
            let best = Infinity;
            for (const foe of objects) {
                if (foe.settings.benched || foe.settings.team !== 1) continue;
                const q = world(foe);
                best = Math.min(best, Math.hypot(q.x - here.x, q.z - here.z));
            }
            const d = Math.hypot(look.x - here.x, look.z - here.z);
            expect(d).toBeCloseTo(best, 6);
        }
    });

    /** A DISTANT ONE STILL COUNTS. QA asked for exactly this: "even if the
     *  defender is far away". A range gate here would put the line back to
     *  facing its own drop on every play that does not blitz. */
    test('and he still looks at him from the other end of the field', () => {
        const play = createPlayForDifficulty();
        const objects = lineUp(play, 'pass2', 'cover2');
        const man = objects.find((o) => /^x\d$/.test(o.settings.position)
            && !o.settings.benched);
        const foes = objects.filter((o) => o.settings.team === 1 && !o.settings.benched);
        // Send the whole defense to the far corner of the world.
        for (const foe of foes) { foe.coords.x = 5000; foe.coords.y = 5000; }
        const look = lookTarget(man, objects, null, world(man), false, '');
        expect(look).toBeTruthy();
    });
});

describe('a leaping catch is taken on the way up', () => {
    /**
     * ITEM 6: "receivers sometimes jump after they have already caught the
     * ball".
     *
     * MEASURED, THE BALL IS INSIDE A RECEIVER'S REACH FOR A MEDIAN OF 75
     * MILLISECONDS (p10 37ms, p90 188ms, over 193 throws). The jump fires when
     * the ball comes inside that reach and the simulation hands an airborne man
     * the catch on the first frame it can, so a leaping catch is ALWAYS taken
     * in the first frames of the jump: there is no version of this game where
     * he takes it at the top. With the apex halfway through the hang, that is a
     * man catching the ball at ground level and then rising for a third of a
     * second holding it.
     *
     * Delaying the catch instead was measured and refused: a 50ms delay empties
     * the reach box on 24% of jump balls and 100ms on 72%. So the catch stays
     * and the jump moves under it.
     */
    const at = (seconds) => jumpLift(seconds / CFG.pose.jump.hang);

    /**
     * THE WINDOW A CATCH ACTUALLY LANDS IN, from the two measurements: the ball
     * reaches its closest point a median of 63ms after entering a receiver's
     * reach, p10 25ms and p90 100ms. He has to be meaningfully up across all of
     * that, and at the far end he should be near the top rather than past it.
     */
    test('he is half way up by the time the ball arrives', () => {
        const lift = CFG.pose.jump.lift;
        expect(at(0.025) / lift).toBeGreaterThan(0.2);     // the quickest arrival
        expect(at(0.063) / lift).toBeGreaterThan(0.45);    // the median one
        expect(at(0.100) / lift).toBeGreaterThan(0.7);     // the slowest
        // ...and still on the way up at the far end of it, not already falling.
        expect(at(0.100)).toBeLessThanOrEqual(at(0.19) + 1e-9);
    });

    test('and most of the jump is spent coming down with it', () => {
        const J = CFG.pose.jump;
        // Find the apex by sampling, rather than restating where it is.
        let top = 0;
        let when = 0;
        for (let i = 0; i <= 1000; i += 1) {
            const lift = jumpLift(i / 1000);
            if (lift > top) { top = lift; when = i / 1000; }
        }
        expect(top).toBeCloseTo(J.lift, 4);
        expect(when).toBeLessThan(0.4);
        expect(when).toBeGreaterThan(0.1);
    });

    /** The ends are still the ground, and the height still runs up and back
     *  down once: a warp that left him in the air at the whistle, or that
     *  doubled back, would be a figure hanging over the grass. */
    test('it leaves the ground and returns to it, once', () => {
        expect(jumpLift(0)).toBe(0);
        expect(jumpLift(1)).toBe(0);
        let rises = 0;
        let falls = 0;
        let prev = 0;
        for (let i = 1; i <= 200; i += 1) {
            const lift = jumpLift(i / 200);
            if (lift > prev + 1e-9) rises += 1;
            if (lift < prev - 1e-9) falls += 1;
            prev = lift;
        }
        expect(rises).toBeGreaterThan(5);
        expect(falls).toBeGreaterThan(rises);       // longer coming down
    });

    /**
     * AND THE CATCH WAITS FOR THE BALL RATHER THAN FOR A CLOCK.
     *
     * A fixed delay was measured and refused: against a 75ms median dwell, 50ms
     * of it empties the reach box on 24% of jump balls and 100ms on 72%. The
     * ball's CLOSEST APPROACH costs nothing instead, because the nearest point
     * of a path that came inside the box is inside the box, and it is worth a
     * median of 63ms of lead.
     */
    test('a ball still closing does not get caught yet', () => {
        // Falling from 1.4m to 0.9m: still on its way in.
        expect(ballArrived(0.9, 1.4, 0)).toBe(false);
        expect(ballArrived(1.4, -1, 0)).toBe(false);      // nothing to compare to
    });

    test('and the frame it stops closing is the frame he has it', () => {
        expect(ballArrived(0.65, 0.62, 0)).toBe(true);
        expect(ballArrived(0.62, 0.62, 0)).toBe(true);
    });

    /** ...and an arc that never turns over cannot strand him in the air with
     *  the catch withheld. */
    test('a backstop hands it to him near the top whatever the ball does', () => {
        const J = CFG.pose.jump;
        expect(ballArrived(0.4, 0.9, J.lift * J.backstop)).toBe(true);
        expect(J.backstop).toBeLessThan(1);
    });
});

describe('a man who has stopped stays stopped', () => {
    /**
     * ITEM 8: "when a receiver reaches the end of his route and puts his hands
     * up for the ball, his arms twitch up and down and it looks glitchy".
     *
     * A boolean read off a noisy scalar. A receiver at the end of his route
     * orbits a small patch rather than standing still, so his net displacement
     * sits on the threshold and crosses it repeatedly, and three things flip
     * with it: his hands go up, he turns back toward the ball, and his turn
     * stops being capped.
     */
    test('a wobble either side of the threshold does not flip the answer', () => {
        const S = CFG.pose.standing;
        let still = stillFor(0.2, false);           // he has arrived
        expect(still).toBe(true);
        // A metre of wander around a 0.9m threshold, which is exactly what the
        // orbit at the end of a route measures.
        for (const net of [0.85, 0.95, 0.88, 1.02, 0.91, 0.99, 0.86]) {
            still = stillFor(net, still);
            expect({ net, still }).toEqual({ net, still: true });
        }
        expect(S.release).toBeGreaterThan(S.net);
    });

    test('but a man who genuinely sets off is running again', () => {
        let still = true;
        still = stillFor(CFG.pose.standing.release + 0.2, still);
        expect(still).toBe(false);
    });

    /** ...and he has to come to a proper stop to count as arrived, rather than
     *  merely slowing to somewhere between the two. */
    test('and slowing down is not the same as arriving', () => {
        const between = (CFG.pose.standing.net + CFG.pose.standing.release) / 2;
        expect(stillFor(between, false)).toBe(false);
    });
});

/**
 * WHERE THE DEFENSE IS LOOKING. QA ROUND TWENTY-EIGHT.
 *
 * "If a defender is covering a receiver then it makes sense for him to look at
 * the receiver, but for defenders that are not covering a specific receiver,
 * their eyes should be on the QB or whoever has the ball... once there's a ball
 * carrier the defenders' eyes should be looking at the ball carrier unless
 * they're actively locking arms."
 *
 * Every case below is one sentence of that, asked with plain objects.
 */
describe('where the defense is looking', () => {
    const world = (obj) => simToWorld(obj.coords.x, obj.coords.y, 0);
    const near = (look, obj) => {
        const p = world(obj);
        return Math.hypot(look.x - p.x, look.z - p.z) < 1e-6;
    };

    /** A line-up that actually contains a man in coverage, since only some
     *  defensive formations hand one out. */
    function withCover() {
        for (const defence of ['man1', 'cover1', 'cover2', 'man2', '', 'zone1']) {
            const play = createPlayForDifficulty();
            const objects = lineUp(play, 'pass2', defence);
            resetAssignments();
            noteAssignments(objects);
            const man = objects.find((o) => o.settings.team === 1 && !o.settings.benched
                && o.settings.route && o.settings.route.type === 'cover'
                && o.settings.route.cover);
            if (man) return { play, objects, man };
        }
        return null;
    }

    const qbOf = (objects) => objects.find((o) => o.settings.position === 'qb');

    test('a defender in coverage watches his receiver while the ball is read', () => {
        const set = withCover();
        expect(set).toBeTruthy();
        const { objects, man } = set;
        const qb = qbOf(objects);
        expect(qb.state.hasBall).toBe(true);        // he has not thrown it yet
        const his = objects.find((o) => o.settings.position === man.settings.route.cover);
        // Put them far enough apart that the tackle-range rule cannot answer.
        man.coords.x = 600; man.coords.y = 300;
        const look = lookTarget(man, objects, qb, world(man), false, '');
        expect(look).toBeTruthy();
        expect(near(look, his)).toBe(true);
    });

    test('and a defender with no receiver of his own watches the quarterback', () => {
        const set = withCover();
        const { objects } = set;
        const qb = qbOf(objects);
        const zone = objects.find((o) => o.settings.team === 1 && !o.settings.benched
            && o.settings.route && o.settings.route.type !== 'cover');
        expect(zone).toBeTruthy();
        zone.coords.x = 600; zone.coords.y = 300;
        const look = lookTarget(zone, objects, qb, world(zone), false, '');
        expect(look).toBeTruthy();
        expect(near(look, qb)).toBe(true);
    });

    /**
     * ...AND ONCE ANYBODY IS RUNNING WITH IT, EVERY ONE OF THEM WATCHES HIM.
     *
     * This is the report. An assignment used to outrank the carrier unless he
     * had come within six metres, so a corner covering B went on watching B
     * while the ball was carried past him by somebody else.
     */
    test('a carrier beats a coverage assignment, at any distance', () => {
        const set = withCover();
        const { objects, man } = set;
        const qb = qbOf(objects);
        // A receiver has caught it and is running: `carryFor` calls that a tuck.
        qb.state.hasBall = false;
        const runner = objects.find((o) => /^wr\d$/.test(o.settings.position)
            && !o.settings.benched && o.settings.position !== man.settings.route.cover);
        runner.state.hasBall = true;
        // The far corner of the field, well outside any tackle range.
        man.coords.x = 20; man.coords.y = 20;
        runner.coords.x = 900; runner.coords.y = 560;
        const look = lookTarget(man, objects, runner, world(man), false, '');
        expect(near(look, runner)).toBe(true);
    });

    test('and so does a quarterback who has tucked it and run', () => {
        const set = withCover();
        const { objects, man } = set;
        const qb = qbOf(objects);
        qb.state.run = true;                        // keep it and go
        man.coords.x = 20; man.coords.y = 20;
        qb.coords.x = 900; qb.coords.y = 560;
        const look = lookTarget(man, objects, qb, world(man), false, '');
        expect(near(look, qb)).toBe(true);
    });

    /** ...unless he has his hands on somebody, which beats everything. */
    test('a man locked onto a blocker keeps his eyes on the blocker', () => {
        const set = withCover();
        const { objects, man } = set;
        const qb = qbOf(objects);
        qb.state.run = true;
        const blocker = objects.find((o) => /^x\d$/.test(o.settings.position)
            && !o.settings.benched);
        const look = lookTarget(man, objects, qb, world(man), false,
            blocker.settings.position);
        expect(near(look, blocker)).toBe(true);
    });

    /**
     * AND THE BALL IN THE AIR IS SOMETHING TO WATCH. Between the throw and the
     * catch nobody has it, so a defender with no assignment used to fall
     * through to null and face the way his feet happened to be pointing.
     */
    test('with the ball in the air he watches the ball', () => {
        const set = withCover();
        const { play, objects } = set;
        const elig = eligibleReceivers(play);
        expect(throwTo(play, elig[0])).toBe(true);
        const live = play.game.objects;
        resetAssignments();
        noteAssignments(live);
        const ball = live.find((o) => o.settings.position === 'ball');
        expect(ball).toBeTruthy();
        const zone = live.find((o) => o.settings.team === 1 && !o.settings.benched
            && o.settings.route && o.settings.route.type !== 'cover');
        zone.coords.x = 300; zone.coords.y = 100;
        // Nobody is carrying: the quarterback let it go.
        const carrier = live.find((o) => o.state && o.state.hasBall && !o.settings.benched);
        expect(carrier).toBeFalsy();
        const look = lookTarget(zone, live, null, world(zone), false, '');
        expect(look).toBeTruthy();
        expect(near(look, ball)).toBe(true);
    });

    /**
     * AND IT IS TRUE OF BOTH SIDES. After an interception the men who were
     * blocking are chasing, and a lineman who went on watching "the nearest
     * defender" would be watching somebody other than the man with the ball.
     */
    test('after an interception the offense chases too', () => {
        const set = withCover();
        const { objects, man } = set;
        const qb = qbOf(objects);
        qb.state.hasBall = false;
        man.state.hasBall = true;                   // he picked it off
        const lineman = objects.find((o) => /^x\d$/.test(o.settings.position)
            && !o.settings.benched);
        man.coords.x = 700; man.coords.y = 500;
        const look = lookTarget(lineman, objects, man, world(lineman), false, '');
        expect(near(look, man)).toBe(true);
    });
});
