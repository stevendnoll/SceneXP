// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-photo.test.mjs - the photographer's shot of a moment and the picture
 * drawn through it (specs/xo-photos-plan, Step 4).
 *
 * The shot is pure and is swept across the field: every body whole in frame,
 * the photographer always on the grass. The drawing is run on a real three
 * with a renderer that writes down what it is asked, because the borrow has
 * one job that matters more than the picture: the live field and the renderer
 * are given back EXACTLY as they were, whatever happens.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealThree } from './helpers/real-three.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scene = join(here, '..', 'www', 'xo', 'js');

let THREE;
let P;
let CFG;
let FIELD;
let projectPoint;

beforeAll(async () => {
    THREE = await loadRealThree({ console });
    globalThis.THREE = THREE;
    P = await import(join(scene, 'photo.js'));
    ({ XO_CONFIG: CFG, FIELD } = await import(join(scene, 'config.js')));
    ({ projectPoint } = await import(join(scene, 'milestones.js')));
});

const LIFT = 0.12;
const RIGHT = Math.PI / 2;   // facing downfield, +x

/** Positions across the whole field, every way a man can face, alone and in
 *  a tackle (the tackler diving at him), standing and in the air. */
function sweep() {
    const out = [];
    // Both goal lines and the middle, both touchlines and either side of the
    // middle: the edges are where a photographer runs out of grass. Kept to
    // 144 because the suite's sandbox runs the solve thirty times slower
    // than a browser does (about 1 ms a shot in plain Node).
    for (const x of [0, 17.5, 35]) {
        for (const z of [-10, -3, 3, 10]) {
            for (const yaw of [0, RIGHT, Math.PI, -Math.PI / 4]) {
                for (const up of [0, 1.4]) {
                    out.push({ bodies: [{ x, y: LIFT + up, z, yaw, pitch: 0 }], others: [] });
                }
                out.push({
                    bodies: [
                        { x, y: LIFT, z, yaw, pitch: -0.6 },
                        { x: x + Math.sin(yaw + 2.5) * 1.6, y: LIFT, z: z + Math.cos(yaw + 2.5) * 1.6, yaw: yaw + Math.PI, pitch: 1.2 },
                    ],
                    others: [],
                });
            }
        }
    }
    return out;
}

/** The sweep's shots, solved once for the tests that read them: the solve is
 *  a few milliseconds a moment, and the suite's sandbox makes it more. */
let solved = null;
const sweptShots = () => (solved ||= sweep().map((m) => ({ m, shot: P.photoShot(m) })));

describe('the photographer\'s shot', () => {
    test('every body whole and inside the margin, from the grass, across the field', () => {
        const C = CFG.photo;
        const edge = 1 - C.margin * 2 + 1e-6;
        expect(sweptShots().length).toBe(144);
        for (const { m, shot } of sweptShots()) {
            const where = `${m.bodies.length} at ${m.bodies[0].x},${m.bodies[0].z}`;
            expect(`${where} ${P.onTheGrass(shot.position)}`).toBe(`${where} true`);
            expect(shot.position.y).toBeGreaterThanOrEqual(C.floor);
            expect(shot.fov).toBeGreaterThanOrEqual(C.fov);
            expect(shot.fov).toBeLessThanOrEqual(C.maxFov);
            for (const s of P.framed(m, shot)) {
                expect(s.depth).toBeGreaterThan(1);
                expect(Math.abs(s.x)).toBeLessThanOrEqual(edge);
                expect(Math.abs(s.y)).toBeLessThanOrEqual(edge);
            }
        }
    });

    test('in the middle of the field the lens is within a step of the longest, so the picture is tight', () => {
        // Not the longest itself: the field is 21 m across, and from the best
        // angle the longest lens would stand the photographer in the stand,
        // so the score takes one step wider over the next angle round.
        const shot = P.photoShot({ bodies: [{ x: 17.5, y: LIFT, z: 0, yaw: RIGHT, pitch: 0 }], others: [] });
        expect(shot.fov).toBeLessThanOrEqual(CFG.photo.fov * CFG.photo.widen + 1e-9);
        // And he fills the frame: from his feet to his raised hands is most of it.
        const ys = P.framed({ bodies: [{ x: 17.5, y: LIFT, z: 0, yaw: RIGHT }] }, shot).map((s) => s.y);
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1.5);
    });

    test('room to run into: a man running across the frame is placed behind its middle', () => {
        let checked = 0;
        for (const { m, shot } of sweptShots().filter((x) => x.m.bodies.length === 1)) {
            const b = m.bodies[0];
            const at = projectPoint(shot, 0.8, { x: b.x, y: b.y + 2, z: b.z });
            const ahead = projectPoint(shot, 0.8, { x: b.x + Math.sin(b.yaw), y: b.y + 2, z: b.z + Math.cos(b.yaw) });
            const across = ahead.x - at.x;
            if (Math.abs(across) < 0.02) continue;      // running at or away from the lens
            checked += 1;
            // Moving toward the middle of the frame, never toward the edge.
            expect(Math.sign(across)).toBe(-Math.sign(at.x));
        }
        expect(checked).toBeGreaterThan(40);
    });

    test('a player in the way of the best side sends the photographer round to another', () => {
        const hero = { x: 17.5, y: LIFT, z: 0, yaw: RIGHT, pitch: 0 };
        const open = P.photoShot({ bodies: [hero], others: [] });
        // Stand somebody half way along that line of sight.
        const blocker = {
            x: (open.position.x + open.target.x) / 2,
            z: (open.position.z + open.target.z) / 2,
        };
        const moved = P.photoShot({ bodies: [hero], others: [blocker] });
        expect(moved.position).not.toEqual(open.position);
        const d = (s) => {
            const t = 0.5;
            return Math.hypot(s.position.x + (s.target.x - s.position.x) * t - blocker.x,
                s.position.z + (s.target.z - s.position.z) * t - blocker.z);
        };
        expect(d(moved)).toBeGreaterThan(CFG.photo.clear);
        // A player who IS the picture never counts as being in the way of it.
        const self = P.photoShot({ bodies: [hero], others: [{ x: hero.x, z: hero.z }] });
        expect(self.position).toEqual(open.position);
    });

    test('a diving tackler is contained head to foot along the way he dived', () => {
        const flat = { x: 20, y: LIFT, z: 0, yaw: RIGHT, pitch: 1.4 };
        const pts = P.bodyPoints([flat]);
        const xs = pts.map((p) => p.x);
        // Nearly the whole reach of a man lies along the field, not up it.
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(CFG.photo.reach * CFG.figureScale * 0.9);
        expect(Math.max(...pts.map((p) => p.y))).toBeLessThan(1.2);
    });
});

/**
 * THE DRAWING. A renderer that writes down what it is asked, a real scene of
 * real objects, and a canvas whose 2D context writes down what it is asked.
 */
describe('drawing a moment, and giving everything back', () => {
    let S;
    beforeAll(async () => {
        S = await import(join(scene, 'snapshot.js'));
    });

    function fakeRenderer({ throwOnRender = false, seen = null } = {}) {
        const calls = [];
        let ratio = 1.5;
        let size = { x: 390, y: 844 };
        return {
            calls,
            getPixelRatio: () => ratio,
            setPixelRatio: (r) => { calls.push(['ratio', r]); ratio = r; },
            getSize: (v) => v.set(size.x, size.y),
            setSize: (w, h, style) => { calls.push(['size', w, h, style]); size = { x: w, y: h }; },
            render: (s, cam) => {
                calls.push(['render', cam.fov, cam.aspect]);
                if (seen) seen();
                if (throwOnRender) throw new Error('context lost');
            },
            now: () => ({ ratio, size }),
        };
    }

    function fakeDoc() {
        const drawn = [];
        return {
            drawn,
            createElement: () => ({
                width: 0,
                height: 0,
                getContext: () => new Proxy({}, {
                    get: (t, k) => (k in t ? t[k] : (...args) => drawn.push([k, ...args])),
                    set: (t, k, v) => { t[k] = v; return true; },
                }),
            }),
        };
    }

    function world() {
        const roster = new THREE.Group();
        const hero = new THREE.Group();
        hero.add(new THREE.Object3D());
        roster.add(hero);
        const rings = new THREE.Group();
        rings.add(new THREE.Object3D());
        const spot = new THREE.Group();
        const sceneRoot = new THREE.Scene();
        sceneRoot.add(roster, rings, spot);
        return { roster, hero, rings, spot, sceneRoot };
    }

    test('the moment is on the field for the render and only for it, at twice the size, drawn down, stamped', () => {
        const w = world();
        // The moment: the hero mid-leap, turned and leaning.
        w.hero.position.set(20, 1.5, -2);
        w.hero.rotation.set(0.3, 4.0, 0);
        const snapshot = S.captureDrawn([w.roster, w.rings]);
        // The live field afterwards: somewhere else entirely, the spot up.
        w.hero.position.set(28, 0.12, 6);
        w.hero.rotation.set(0, 1.2, 0);
        w.spot.visible = true;
        const before = S.captureDrawn([w.roster, w.rings, w.spot]);

        let during = null;
        const renderer = fakeRenderer({
            seen: () => {
                during = {
                    hero: w.hero.position.toArray(), yaw: w.hero.rotation.y,
                    rings: w.rings.visible, spot: w.spot.visible,
                };
            },
        });
        const doc = fakeDoc();
        const canvas = { id: 'game-canvas' };
        const moment = {
            kind: 'catch', snapshot, others: [],
            bodies: [{ x: 20, y: 1.5, z: -2, yaw: 4.0, pitch: 0.3 }],
        };
        const picture = P.drawPhoto({
            renderer, scene: w.sceneRoot, canvas, moment,
            roots: [w.roster, w.rings], hide: [w.spot, w.rings], doc,
        });

        // During the render: the moment, with the rings and the spot hidden.
        expect(during).toEqual({ hero: [20, 1.5, -2], yaw: 4.0, rings: false, spot: false });
        // After it: the live field exactly, the spot back up.
        const after = S.captureDrawn([w.roster, w.rings, w.spot]);
        expect(Array.from(after.data)).toEqual(Array.from(before.data));
        expect(w.spot.visible).toBe(true);

        const C = CFG.photo;
        const ss = C.supersample;
        expect(renderer.calls[0]).toEqual(['ratio', 1]);
        expect(renderer.calls[1]).toEqual(['size', C.width * ss, C.height * ss, false]);
        expect(renderer.calls[2][0]).toBe('render');
        expect(renderer.calls[2][2]).toBeCloseTo(C.width / C.height, 9);
        // The renderer as it was, and the CSS size never touched.
        expect(renderer.now()).toEqual({ ratio: 1.5, size: { x: 390, y: 844 } });
        expect(renderer.calls.filter((c) => c[0] === 'size').every((c) => c[3] === false)).toBe(true);

        expect(picture.width).toBe(C.width);
        expect(picture.height).toBe(C.height);
        const draw = doc.drawn.find((c) => c[0] === 'drawImage');
        expect(draw).toEqual(['drawImage', canvas, 0, 0, C.width * ss, C.height * ss, 0, 0, C.width, C.height]);
        const words = doc.drawn.filter((c) => c[0] === 'fillText').map((c) => c[1]);
        expect(words).toEqual([C.wordmark]);
        // Drawn after the picture, so it is on top of it.
        expect(doc.drawn.findIndex((c) => c[0] === 'fillText')).toBeGreaterThan(doc.drawn.indexOf(draw));
    });

    test('a render that fails gives back the field and the renderer all the same, and no picture', () => {
        const w = world();
        const snapshot = S.captureDrawn([w.roster]);
        w.hero.position.set(5, 0.12, 5);
        const before = S.captureDrawn([w.roster, w.rings, w.spot]);
        const renderer = fakeRenderer({ throwOnRender: true });
        const picture = P.drawPhoto({
            renderer, scene: w.sceneRoot, canvas: {},
            moment: { kind: 'tackle', snapshot, bodies: [{ x: 5, y: 0.12, z: 5, yaw: 0 }] },
            roots: [w.roster], hide: [w.spot, w.rings], doc: fakeDoc(),
        });
        expect(picture).toBeNull();
        expect(Array.from(S.captureDrawn([w.roster, w.rings, w.spot]).data)).toEqual(Array.from(before.data));
        expect(renderer.now()).toEqual({ ratio: 1.5, size: { x: 390, y: 844 } });
    });

    test('nothing to draw with draws nothing', () => {
        expect(P.drawPhoto({})).toBeNull();
        expect(P.drawPhoto({ renderer: fakeRenderer(), scene: {}, canvas: {}, moment: { kind: 'catch' }, roots: [], doc: fakeDoc() })).toBeNull();
    });
});

describe('the file', () => {
    test('a JPEG at the configured quality, or nothing where the browser cannot make one', async () => {
        const C = CFG.photo;
        const asked = [];
        const blob = { size: 123456, type: C.type };
        const picture = { toBlob: (cb, type, quality) => { asked.push([type, quality]); cb(blob); } };
        await expect(P.photoBlob(picture)).resolves.toBe(blob);
        expect(asked).toEqual([[C.type, C.quality]]);
        await expect(P.photoBlob({ toBlob: (cb) => cb(null) })).resolves.toBeNull();
        await expect(P.photoBlob({ toBlob: () => { throw new Error('tainted'); } })).resolves.toBeNull();
        await expect(P.photoBlob({})).resolves.toBeNull();
        await expect(P.photoBlob(null)).resolves.toBeNull();
    });

    test('named for the moment and the size', () => {
        expect(P.photoName('catch')).toBe('scenexp-xo-catch-1080x1350.jpg');
        expect(P.photoName('')).toBe('scenexp-xo-photo-1080x1350.jpg');
        expect(CFG.photo.wordmark).toBe('SceneXP.com/xo');
    });
});
