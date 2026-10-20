// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The shared crowd (www/shared/js/crowd-1.0.0.js), promoted from
 * www/xo/js/fans.js on 2026-10-19. X's and O's own suites (xo-fans,
 * xo-crowd) hold its fans to what they were; this holds the part itself,
 * from source, against REAL three: the stub has no vertices, so a crowd
 * baked under it is empty (the "measure a model against real three"
 * lesson).
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealThree } from './helpers/real-three.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let THREE;
let Crowd;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    Crowd = await import(join(root, 'www/shared/js/crowd-1.0.0.js'));
});

const box = (g) => {
    g.computeBoundingBox();
    return g.boundingBox;
};

describe('the parts', () => {
    let parts;
    beforeAll(() => {
        parts = Crowd.buildCrowdParts({ scale: 0.9, poses: ['down', 'up', 'clap'] });
    });

    test('every piece is there, standing on the floor, at the scale asked for', () => {
        expect(Object.keys(parts.body).sort()).toEqual(['fixed', 'pants', 'shirt', 'skin']);
        expect(Object.keys(parts.hair).sort()).toEqual([...Crowd.HAIR].sort());
        expect(Object.keys(parts.arms)).toEqual(['down', 'up', 'clap']);
        const low = Math.min(...Object.values(parts.body).map((g) => box(g).min.y));
        expect(low).toBeCloseTo(0, 6);
        // A 1.75 m figure at 0.9: its head's top near 1.6 m.
        expect(parts.top).toBeGreaterThan(1.5);
        expect(parts.top).toBeLessThan(1.7);
        expect(parts.eyeHeight).toBeLessThan(parts.top);
        expect(parts.body.fixed.attributes.color).toBeTruthy();
        expect(parts.body.shirt.attributes.color).toBeUndefined();
    });

    test('the hands are where each pose puts them', () => {
        const [a, b] = parts.hands.down;
        // Down: at the sides, below the shoulders, either side of the body.
        expect(a[1]).toBeLessThan(parts.eyeHeight * 0.6);
        expect(Math.sign(a[0])).toBe(-Math.sign(b[0]));
        // Up: above the head.
        for (const h of parts.hands.up) expect(h[1]).toBeGreaterThan(parts.top);
        // Clap: in front, below the chin, the hands touching.
        const [c, d] = parts.hands.clap;
        expect(c[2]).toBeGreaterThan(0.1);
        expect(Math.hypot(c[0] - d[0], c[1] - d[1], c[2] - d[2])).toBeLessThan(0.08);
        expect(c[1]).toBeGreaterThan(parts.eyeHeight * 0.6);
        expect(c[1]).toBeLessThan(parts.eyeHeight);
        // The pieces themselves reach where the hands are said to be.
        expect(box(parts.arms.up.hand).max.y).toBeGreaterThan(parts.top);
    });

    test('a member is affordable', () => {
        const cost = Crowd.crowdCost(parts);
        expect(cost.vertices).toBeLessThan(4000);
        expect(cost.triangles).toBeGreaterThan(500);
        expect(Crowd.crowdCost(parts, 'up', 'long').triangles).toBeGreaterThan(0);
    });

    test('the defaults are X\'s and O\'s', () => {
        expect(Crowd.POSES).toEqual(['down', 'up', 'cards']);
        expect(Crowd.FIGURE).toEqual({ role: 'customer', shoulderRound: 0.35, handScale: 1.3 });
        const xo = Crowd.buildCrowdParts();
        expect(Object.keys(xo.arms)).toEqual(['down', 'up', 'cards']);
    });
});

describe('the pieces it is made from', () => {
    test('every kind of primitive is rebuilt lighter, and anything else is left alone', () => {
        const cases = [
            new THREE.SphereGeometry(0.2, 32, 24), new THREE.SphereGeometry(0.01, 16, 12), new THREE.SphereGeometry(0.05, 16, 12),
            new THREE.CylinderGeometry(0.1, 0.1, 0.3, 32), new THREE.ConeGeometry(0.1, 0.2, 32), new THREE.TorusGeometry(0.1, 0.02, 16, 48)
        ];
        for (const g of cases) {
            const light = Crowd.lighter(g);
            expect(light).not.toBe(g);
            expect(light.attributes.position.count).toBeLessThan(g.attributes.position.count);
        }
        const plain = new THREE.BufferGeometry();
        expect(Crowd.lighter(plain)).toBe(plain);
        const box2 = new THREE.BoxGeometry(1, 1, 1);
        expect(Crowd.lighter(box2)).toBe(box2);
        const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 1)]);
        const ex = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelSegments: 6, curveSegments: 12 });
        ex.translate(3, 0, 0);
        const lex = Crowd.lighter(ex);
        expect(box(lex).getCenter(new THREE.Vector3()).x).toBeCloseTo(box(ex).getCenter(new THREE.Vector3()).x, 6);
    });

    test('merging keeps every piece, indexed or not, coloured if asked', () => {
        const a = new THREE.BoxGeometry(1, 1, 1);
        const b = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
        const merged = Crowd.mergePieces([{ geometry: a, colour: new THREE.Color(1, 0, 0) }, { geometry: b, colour: null }], { lift: 2, vertexColours: true });
        expect(merged.attributes.position.count).toBe(24 + 36);
        expect(merged.index.count).toBe(36 + 36);
        expect(box(merged).min.y).toBeCloseTo(1.5, 6);
        const c = merged.attributes.color.array;
        expect([c[0], c[1], c[2]]).toEqual([1, 0, 0]);
        expect(c[c.length - 1]).toBe(1);
        // A big crowd piece takes a 32-bit index.
        const big = new THREE.SphereGeometry(1, 300, 300);
        expect(Crowd.mergePieces([{ geometry: big, colour: null }]).index.array).toBeInstanceOf(Uint32Array);
    });

    test('under a stand-in three with no geometry, there is nothing to bake', () => {
        const real = globalThis.THREE;
        globalThis.THREE = { ...real, SphereGeometry: function SphereGeometry() { return { attributes: {} }; } };
        try {
            expect(Crowd.buildCrowdParts()).toBeNull();
        } finally {
            globalThis.THREE = real;
        }
    });
});

// ---- Promoted from www/derby, 2026-10-20 ------------------------------------

describe('more arm poses, measured', () => {
    test('each cheer pose puts the hands where it says: high together, wide and up, out ahead, at the shoulders', () => {
        const parts = Crowd.buildCrowdParts({ poses: ['down', 'hold', 'apart', 'clap', ...Crowd.CHEER_POSES] });
        const hands = parts.hands;
        const gap = (p) => Math.hypot(hands[p][0][0] - hands[p][1][0], hands[p][0][1] - hands[p][1][1], hands[p][0][2] - hands[p][1][2]);
        const low = (p) => Math.min(hands[p][0][1], hands[p][1][1]);
        expect(gap('clapHigh')).toBeLessThan(0.15);
        expect(low('clapHigh')).toBeGreaterThan(parts.top);
        expect(gap('flex')).toBeGreaterThan(0.75);
        expect(low('flex')).toBeGreaterThan(1.45);
        expect(Math.min(hands.point[0][2], hands.point[1][2])).toBeGreaterThan(0.4);
        expect(low('roof')).toBeGreaterThan(1.25);
        expect(low('roof')).toBeLessThan(low('flex'));
        // The sign's grip: just over the head, 0.57 m apart; a clap's hands apart.
        expect(gap('hold')).toBeCloseTo(0.57, 1);
        // The same grip at the chest, held out in front: the sign pumped.
        const lowParts = Crowd.buildCrowdParts({ poses: ['down', 'hold', 'holdLow'] });
        const lg = (p) => Math.hypot(...[0, 1, 2].map((k) => lowParts.hands[p][0][k] - lowParts.hands[p][1][k]));
        expect(Math.abs(lg('holdLow') - lg('hold'))).toBeLessThan(0.03);
        expect(lowParts.hands.hold[0][1] - lowParts.hands.holdLow[0][1]).toBeGreaterThan(0.4);
        expect(lowParts.hands.holdLow[0][2]).toBeGreaterThan(0.25);
        expect(low('hold')).toBeGreaterThan(parts.top - 0.05);
        expect(gap('apart')).toBeGreaterThan(gap('clap') + 0.2);
        // Only the poses asked for are baked: X's and O's three stay its three.
        expect(Object.keys(Crowd.buildCrowdParts({ poses: Crowd.POSES }).arms)).toEqual(['down', 'up', 'cards']);
    });
});

describe('cheering, pure', () => {
    test('a cheer for each moment, never the same twice running, every one of them in time', () => {
        let r = 0.37;
        const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280;
        const seen = new Set();
        let last = 'jump';
        for (let k = 0; k < 300; k++) {
            const run = Crowd.pickCheers(5, rand, last);
            expect(run[0]).not.toBe(last);
            for (let i = 1; i < run.length; i++) expect(run[i]).not.toBe(run[i - 1]);
            run.forEach((c) => seen.add(c));
            last = run[run.length - 1];
        }
        expect([...seen].sort()).toEqual([...Crowd.CHEERS].sort());
    });

    test('each cheer moves its own way in the poses it names, and reduced motion holds each one still', () => {
        const sig = (id, opts = {}) => {
            const out = [];
            for (let t = 0; t < 2.6; t += 1 / 30) {
                const p = Crowd.cheerAt(id, { t, phase: 0.3, ...opts });
                expect(['down', ...Crowd.CHEER_POSES]).toContain(p.pose);
                out.push(`${p.pose}:${p.hop.toFixed(2)}:${p.lean.toFixed(2)}`);
            }
            return out.join('|');
        };
        expect(new Set(Crowd.CHEERS.map((c) => sig(c))).size).toBe(Crowd.CHEERS.length);
        expect(sig('wave', { rank: 0 })).not.toBe(sig('wave', { rank: 2 }));
        expect(Crowd.cheerAt('nonsense', { t: 0.1 }).pose).toBe('up');
        for (const id of Crowd.CHEERS) {
            const held = new Set();
            for (let t = 0; t < 2; t += 0.05) {
                const p = Crowd.cheerAt(id, { t, still: true });
                expect(p.hop).toBe(0);
                expect(p.lean).toBe(0);
                held.add(p.pose);
            }
            expect(held.size).toBe(1);
        }
        // A clap: together and apart in turn, together under reduced motion.
        const claps = new Set([0, 0.05, 0.1, 0.15, 0.2, 0.25].map((t) => Crowd.clapAt(t, { phase: 0.1 })));
        expect(claps).toEqual(new Set(['clap', 'apart']));
        expect(Crowd.clapAt(0.15, { still: true })).toBe('clap');
    });
});

describe('the crowd on screen (createCrowdView)', () => {
    const poses = ['down', 'up', 'hold'];
    const look = { shirt: 0xc8322b, pants: 0x3b4f7a, skin: 0xc68642, hair: 0x2b1d14, style: 'short', scale: 1 };

    test('a dozen pieces and two a pose, each member posed by the scene: hop, sway, arms; redrawn only on a change', () => {
        const parts = Crowd.buildCrowdParts({ poses });
        let calls = 0;
        const view = Crowd.createCrowdView({
            parts, poses, hopHeight: 0.1,
            poseOf: (m, moment, i) => {
                calls++;
                return i === 0 ? { pose: moment.arms, hop: moment.hop, lean: moment.lean } : { pose: 'down', hop: 0 };
            }
        });
        expect(view.ready).toBe(true);
        const meshes = view.group.children.filter((o) => o.isInstancedMesh);
        expect(meshes).toHaveLength(4 + Crowd.HAIR.length + 2 * poses.length);
        view.set([{ look, at: { x: 1, y: 0.4, z: -2, ry: 0.3 } }, { look: { ...look, style: null, scale: 0.6 }, at: { x: 2, y: 0, z: 0 } }], { arms: 'up', hop: 1, lean: 0.1 });
        const mat = new THREE.Matrix4();
        const at = (mesh, i) => {
            mesh.getMatrixAt(i, mat);
            const p = new THREE.Vector3();
            const q = new THREE.Quaternion();
            const s = new THREE.Vector3();
            mat.decompose(p, q, s);
            // (decompose calls a zero-scale matrix degenerate and says 1.)
            return { p, s: new THREE.Vector3().setFromMatrixScale(mat), e: new THREE.Euler().setFromQuaternion(q, 'YXZ') };
        };
        const byGeo = (g) => meshes.find((m) => m.geometry === g);
        const shirt = byGeo(parts.body.shirt);
        // Up a hop, swaying, turned the way it stands, in the arms asked for.
        expect(at(shirt, 0).p.y).toBeCloseTo(0.5, 6);
        expect(at(shirt, 0).e.y).toBeCloseTo(0.3, 6);
        expect(at(shirt, 0).e.z).toBeCloseTo(0.1, 6);
        expect(at(byGeo(parts.arms.up.sleeve), 0).s.x).toBeCloseTo(1, 6);
        expect(at(byGeo(parts.arms.down.sleeve), 0).s.x).toBe(0);
        // A child's size; no hair for no style.
        expect(at(shirt, 1).s.x).toBeCloseTo(0.6, 6);
        expect(Object.keys(parts.hair).every((h) => at(byGeo(parts.hair[h]), 1).s.x === 0)).toBe(true);
        // The same moment again redraws nothing.
        shirt.instanceMatrix.needsUpdate = false;
        const v = shirt.instanceMatrix.version;
        view.pose({ arms: 'up', hop: 1, lean: 0.1 });
        expect(shirt.instanceMatrix.version).toBe(v);
        expect(calls).toBeGreaterThan(2);
        view.dispose();
    });

    test('props in hand, stepping aside for a dancer, a prop left behind for the scene to move', () => {
        const parts = Crowd.buildCrowdParts({ poses });
        const made = [];
        const view = Crowd.createCrowdView({
            parts, poses,
            poseOf: () => ({ pose: 'hold', hop: 0 }),
            propFor: (m) => {
                if (!m.sign) return null;
                const geo = new THREE.BoxGeometry(view.grip('hold') + 0.09, 0.3, 0.01);
                made.push(geo);
                return { mesh: new THREE.Mesh(geo), pose: 'hold', hand: 'both', made: [geo] };
            }
        });
        expect(view.grip('hold')).toBeCloseTo(0.57, 1);
        view.set([{ look, at: { x: 0, y: 0, z: 0 }, sign: true }, { look, at: { x: 1, y: 0, z: 0 } }]);
        const sign = view.propOf(0);
        expect(sign).not.toBeNull();
        expect(view.propOf(1)).toBeNull();
        // Between the two hands of the pose, over the head.
        const [a, b] = parts.hands.hold;
        expect(sign.position.y).toBeCloseTo((a[1] + b[1]) / 2, 6);
        const shirt = view.group.children.find((o) => o.isInstancedMesh && o.geometry === parts.body.shirt);
        const scaleOf = (i) => {
            const m = new THREE.Matrix4();
            shirt.getMatrixAt(i, m);
            return new THREE.Vector3().setFromMatrixScale(m).x;
        };
        // Stepped aside: drawn as nobody, the prop gone with them...
        view.stepAside([0, 1]);
        view.pose({});
        expect(scaleOf(0)).toBe(0);
        expect(scaleOf(1)).toBe(0);
        expect(sign.visible).toBe(false);
        // ...or left behind, where the scene can move it.
        view.stepAside([0], { drop: [0] });
        view.pose({});
        expect(sign.visible).toBe(true);
        sign.position.set(9, 0, 9);
        view.pose({});
        expect(sign.position.x).toBe(9);
        // Everyone back, the prop in hand again.
        view.stepAside(-1);
        view.pose({});
        expect(scaleOf(0)).toBeCloseTo(1, 6);
        expect(sign.position.x).not.toBe(9);
        view.dispose();
    });

    test('with nothing to bake, a view that draws nothing and is safe to call', () => {
        const view = Crowd.createCrowdView({ parts: null, poses, poseOf: () => ({ pose: 'down', hop: 0 }) });
        expect(view.ready).toBe(false);
        expect(() => {
            view.set([{ look }]);
            view.pose({});
            view.stepAside(0);
            view.dispose();
        }).not.toThrow();
        expect(view.propOf(0)).toBeNull();
        expect(view.grip('up')).toBe(0);
    });
});

describe('a cheer with something held up in both hands', () => {
    test('every cheer its own move with the sign, in the two holding poses, held still under reduced motion', () => {
        const sig = (id) => {
            const out = [];
            for (let t = 0; t < 2.6; t += 1 / 30) {
                const p = Crowd.heldCheerAt(id, { t, phase: 0.3 });
                expect(Crowd.HELD_POSES).toContain(p.pose);
                out.push(`${p.pose}:${p.hop.toFixed(2)}:${p.lean.toFixed(2)}:${p.pitch.toFixed(2)}`);
            }
            return out.join('|');
        };
        // All different, so two cheers running never move the sign alike.
        expect(new Set(Crowd.CHEERS.map(sig)).size).toBe(Crowd.CHEERS.length);
        // Pumped: both holds. Tipped: a pitch. Waved: a lean.
        const poses = (id) => new Set(sig(id).split('|').map((x) => x.split(':')[0]));
        expect(poses('clapHigh')).toEqual(new Set(['hold', 'holdLow']));
        expect(sig('point')).toMatch(/:0\.[1-4]\d$|:0\.[1-4]\d\|/);
        expect(Math.max(...sig('wave').split('|').map((x) => Math.abs(Number(x.split(':')[2]))))).toBeGreaterThan(0.2);
        for (const id of Crowd.CHEERS) {
            const held = new Set();
            for (let t = 0; t < 2; t += 0.05) {
                const p = Crowd.heldCheerAt(id, { t, still: true });
                expect([p.hop, p.lean, p.pitch]).toEqual([0, 0, 0]);
                held.add(p.pose);
            }
            expect(held.size).toBe(1);
        }
    });

    test('the hands stay on what they hold: leaning with the figure, tipped about the line between them', () => {
        const poses = ['down', 'hold', 'holdLow'];
        const parts = Crowd.buildCrowdParts({ poses });
        let now = { pose: 'hold', hop: 0, lean: 0, pitch: 0 };
        const view = Crowd.createCrowdView({
            parts, poses, hopHeight: 0.07,
            poseOf: () => now,
            propFor: () => ({ mesh: new THREE.Group(), pose: 'hold', hand: 'both', made: [] })
        });
        const look = { shirt: 1, pants: 2, skin: 3, hair: 4, style: 'short', scale: 0.62 };
        view.set([{ look, at: { x: 2, y: 0, z: -1, ry: 0.4 } }]);
        const shirt = view.group.children.find((o) => o.isInstancedMesh && o.geometry === parts.body.shirt);
        const prop = view.propOf(0);
        const body = new THREE.Matrix4();
        for (const p of [{ pose: 'hold', hop: 0.6, lean: 0.2, pitch: 0 }, { pose: 'holdLow', hop: 0, lean: -0.15, pitch: 0.45 }, { pose: 'hold', hop: 0.3, lean: 0.07, pitch: 0.3 }]) {
            now = p;
            view.pose({});
            shirt.getMatrixAt(0, body);
            prop.updateMatrixWorld(true);
            // Both hands, where the figure's own matrix puts them.
            const [a, b] = parts.hands[p.pose].map((h) => new THREE.Vector3(...h).applyMatrix4(body));
            // The prop's grip is between them...
            expect(prop.position.distanceTo(a.clone().add(b).multiplyScalar(0.5))).toBeLessThan(1e-6);
            // ...and its own left-right runs through both, however it is tipped.
            const along = new THREE.Vector3(1, 0, 0).transformDirection(prop.matrixWorld);
            const hands = b.clone().sub(a).normalize();
            expect(Math.abs(along.dot(hands))).toBeGreaterThan(0.995);
            // Tipped toward the front by its pitch: its up leans the way the
            // figure faces by that much.
            const upward = new THREE.Vector3(0, 1, 0).transformDirection(prop.matrixWorld);
            const facing = new THREE.Vector3(Math.sin(0.4), 0, Math.cos(0.4));
            expect(upward.dot(facing)).toBeCloseTo(Math.sin(p.pitch), 3);
        }
        view.dispose();
    });
});
