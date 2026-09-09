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
