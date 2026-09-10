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
} = await import(join(scene, 'config.js'));
const {
    pointsForPosition, ladderBands, bandAt,
} = await import(join(scene, 'scoring.js'));
const { markerGeometry } = await import(join(scene, 'markers.js'));
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
