// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * exesnohs-jersey.test.mjs - the X and the O on the shirt, measured.
 *
 * QA ITEM 4 asked for the marks to be "bold and take up at least half the
 * players' torsos, similar to the size of players' numbers on the backs of real
 * NFL jerseys". That is a number, and a number is worth an assertion.
 *
 * IT NEEDS A REAL THREE, for the reason the helmet suite needs one: the test
 * stub models no geometry, so every Box3 through it is empty and it will
 * cheerfully agree that a mark of no size at all covers half a shirt. The whole
 * question here is how big a shape is against another shape, so it is asked
 * against the real library in a node:vm.
 *
 * AND IT IS ASKED ON A REAL PLAYER. Sizing a mark off numbers written down in
 * roster.js and then asserting those same numbers is the exact fault that let a
 * floating helmet ship twice (see exesnohs-helmet). So this builds a figure
 * with `createPerson`, finds the torso it actually has, and measures the mark
 * against that.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let THREE;
let roster;
let CFG;
let box;
/** A built figure and its measured torso, for each of the two builds the game
 *  puts on the field: a lineman is `muscular` and everybody else is not. */
const builds = {};

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console });
    vm.runInContext(readFileSync(join(root, 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;

    roster = await import(join(root, 'www/exesnohs/js/roster.js'));
    ({ EXESNOHS_CONFIG: CFG } = await import(join(root, 'www/exesnohs/js/config.js')));
    const people = await import(join(root, 'www/shared/js/people-1.0.0.js'));
    box = (o) => {
        o.updateMatrixWorld(true);
        return new THREE.Box3().setFromObject(o);
    };

    for (const muscular of [false, true]) {
        const person = people.createPerson({
            role: 'customer', shoulderRound: 0.35, muscular,
        });
        builds[muscular ? 'lineman' : 'skill'] = {
            person,
            torso: roster.measureTorso(person, muscular),
            muscular,
        };
    }
});

const marks = (glyph, build) => {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (const part of roster.buildJerseyParts(glyph, build.torso, mat)) {
        group.add(part);
    }
    return group;
};

describe('the torso a mark is sized from', () => {
    /**
     * THE MEASUREMENT ITSELF, FIRST, because everything below rests on it and
     * because its fallback is the thing most likely to go quietly wrong: under
     * the test stub `measureTorso` cannot read a bounding box and returns
     * written-down numbers instead, and if those drifted from the rig nothing
     * anywhere would say so.
     */
    test('is read off the figure rather than written down', () => {
        for (const [name, build] of Object.entries(builds)) {
            const real = box(build.person.children.find((c) => c.isMesh
                && c.castShadow && c.geometry.type === 'ExtrudeGeometry'));
            expect(build.torso.width).toBeCloseTo(real.max.x - real.min.x, 3);
            expect(build.torso.height).toBeCloseTo(real.max.y - real.min.y, 3);
            expect(build.torso.depth).toBeCloseTo(real.max.z - real.min.z, 3);
            expect(build.torso.y).toBeCloseTo((real.max.y + real.min.y) / 2, 3);
            expect(name).toBeTruthy();
        }
    });

    test('and the written-down fallback still matches the rig it describes', () => {
        // What a suite running under the stub would get. It has to agree with
        // the figure, or every assertion below is measuring a fiction.
        for (const [name, build] of Object.entries(builds)) {
            const blind = roster.measureTorso({}, build.muscular);
            expect(blind.width).toBeCloseTo(build.torso.width, 2);
            expect(blind.height).toBeCloseTo(build.torso.height, 2);
            expect(blind.depth).toBeCloseTo(build.torso.depth, 2);
            expect(blind.y).toBeCloseTo(build.torso.y, 2);
            expect(name).toBeTruthy();
        }
    });
});

describe('the mark on the shirt', () => {
    test('covers at least half the torso, which is what QA asked for', () => {
        for (const glyph of ['X', 'O']) {
            for (const build of Object.values(builds)) {
                const b = box(marks(glyph, build));
                expect((b.max.y - b.min.y) / build.torso.height)
                    .toBeGreaterThanOrEqual(0.5);
                expect((b.max.x - b.min.x) / build.torso.width)
                    .toBeGreaterThanOrEqual(0.5);
            }
        }
    });

    /**
     * AND STAYS ON THE SHIRT. A mark wider than the chest is a mark with its
     * arms sticking out past the player, and one that runs past the top or the
     * bottom is a mark on his collar and his belt.
     */
    test('does not overhang the shirt it is painted on', () => {
        for (const glyph of ['X', 'O']) {
            for (const build of Object.values(builds)) {
                const b = box(marks(glyph, build));
                const t = build.torso;
                expect(b.max.x).toBeLessThan(t.width / 2);
                expect(b.min.x).toBeGreaterThan(-t.width / 2);
                expect(b.max.y).toBeLessThan(t.y + t.height / 2);
                expect(b.min.y).toBeGreaterThan(t.y - t.height / 2);
            }
        }
    });

    /**
     * AND CLEARS THE ARMS, which is the failure a bigger mark would produce and
     * the reason the width stops where it does. people-1.0.0 hangs each arm at
     * half the torso's width plus half an arm radius, so the inner face of the
     * sleeve is INSIDE the torso's own outline: a mark sized to the full chest
     * would be buried under a hanging arm at rest.
     */
    test('clears the sleeves hanging at the sides', () => {
        for (const glyph of ['X', 'O']) {
            for (const build of Object.values(builds)) {
                const arm = build.person.children.find((c) => c.userData
                    && c.userData.isArm);
                const upper = arm.children.find((c) => c.isMesh
                    && c.geometry.type === 'CylinderGeometry');
                const radius = upper.geometry.parameters.radiusBottom;
                const inner = Math.abs(arm.position.x) - radius;
                const b = box(marks(glyph, build));
                expect(b.max.x).toBeLessThan(inner);
            }
        }
    });

    /**
     * BOTH SIDES. "White X's on the front AND back of the orange jerseys."
     * A mark on the front only is invisible for most of a play, because a
     * receiver running a route is running away from the camera.
     */
    test('is on the front and the back, and proud of the shirt on both', () => {
        for (const glyph of ['X', 'O']) {
            for (const build of Object.values(builds)) {
                const parts = roster.buildJerseyParts(glyph, build.torso,
                    new THREE.MeshStandardMaterial({ color: 0xffffff }));
                const front = parts.filter((p) => p.position.z > 0);
                const back = parts.filter((p) => p.position.z < 0);
                expect(front.length).toBeGreaterThan(0);
                expect(back.length).toBe(front.length);
                for (const p of parts) {
                    expect(Math.abs(p.position.z))
                        .toBeGreaterThan(build.torso.depth / 2);
                }
            }
        }
    });

    /**
     * AND IT IS BOLD. A hairline X reads as a scratch at 45m, and the whole
     * point of putting the game's own letters on the shirts is that they can be
     * read. Stated against the mark's own height so it survives a resize.
     */
    test('is drawn in a bold stroke rather than a hairline', () => {
        const height = builds.skill.torso.height * CFG.jersey.height;
        for (const glyph of ['X', 'O']) {
            const parts = roster.buildJerseyParts(glyph, builds.skill.torso,
                new THREE.MeshStandardMaterial({ color: 0xffffff }));
            // The thinnest dimension of any piece is the stroke.
            const stroke = Math.min(...parts.map((p) => {
                const g = p.geometry.parameters;
                return g.width !== undefined ? g.width : g.tube * 2;
            }));
            expect(stroke / height).toBeGreaterThan(0.10);
        }
    });

    test('an unknown glyph gets no mark rather than a wrong one', () => {
        expect(roster.buildJerseyParts('', builds.skill.torso,
            new THREE.MeshStandardMaterial())).toEqual([]);
        expect(roster.buildJerseyParts('Q', builds.skill.torso,
            new THREE.MeshStandardMaterial())).toEqual([]);
    });

    /**
     * THE TWO TEAMS GET THE TWO LETTERS, and it comes from the one place that
     * already knows: `TEAMS`, which the 2D game's own colours came from. A
     * roster that picks its glyphs anywhere else can disagree with the name of
     * the game.
     */
    test('the orange team wears X and the blue team wears O', () => {
        expect(roster.TEAMS[0].glyph).toBe('X');
        expect(roster.TEAMS[1].glyph).toBe('O');
        expect(roster.TEAMS[0].color).not.toBe(roster.TEAMS[1].color);
    });
});
