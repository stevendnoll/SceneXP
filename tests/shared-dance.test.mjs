// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The shared dances (shared/js/dance-1.0.0.js, promoted from www/derby on
 * 2026-10-20): the choreography, pure, and the jointing of the shared
 * person, against real three (the stub has no vertices).
 *
 * What is held here, and why:
 * - A DANCE LOOPS AND NEVER JUMPS: every joint comes back to where it began,
 *   and no joint moves further in one frame than a dancer's arm can.
 * - JOINTING MOVES NOTHING: a figure from createPerson, given a waist and a
 *   neck, draws exactly where it did, and its head turns on the neck.
 * - THE CONTACT POSES TOUCH: a hand on the head is on the head, the YMCA's
 *   letters read as letters, and no arm passes through the body or the
 *   floor at any moment of any dance.
 *
 * Derby Day's own dancer (dressing a crowd member, who dances, the shot) is
 * tests/derby-dance.test.mjs.
 */
import { jest } from '@jest/globals';
import { loadRealThree } from './helpers/real-three.mjs';

const Dn = await import('../www/shared/js/dance-1.0.0.js');

const FPS = 60;
const joints = (p) => Object.entries(p).flatMap(([part, j]) => Object.entries(j).map(([k, v]) => [`${part}.${k}`, v]));

describe('the dances, pure', () => {
    test('eight dances, each named as a scene says it, every pose whole', () => {
        expect(Dn.DANCES.map((d) => d.id)).toEqual(['robot', 'chicken', 'ymca', 'macarena', 'floss', 'sprinkler', 'disco', 'dab']);
        const names = Dn.DANCES.map((d) => d.name);
        expect(names).toEqual(['the Robot', 'the Chicken Dance', 'the YMCA', 'the Macarena', 'the Floss', 'the Sprinkler', 'the Disco Point', 'the Dab']);
        const restKeys = joints(Dn.REST).map(([k]) => k);
        for (const d of Dn.DANCES) {
            expect(d.keys.length).toBeGreaterThanOrEqual(4);
            expect(d.hold).toBeGreaterThanOrEqual(0);
            expect(d.hold).toBeLessThan(1);
            for (const key of d.keys) {
                expect(joints(key).map(([k]) => k)).toEqual(restKeys);
                for (const [, v] of joints(key)) expect(Number.isFinite(v)).toBe(true);
            }
            // Long enough to read, short enough to see once round.
            expect(Dn.loopOf(d)).toBeGreaterThan(0.75);
            expect(Dn.loopOf(d)).toBeLessThanOrEqual(7);
        }
        expect(Dn.danceOf('nope')).toBeNull();
    });

    test('a dance comes back round to its first pose, and no joint jumps in a frame', () => {
        for (const d of Dn.DANCES) {
            const loop = Dn.loopOf(d);
            const a = joints(Dn.danceAt(d, 0));
            const b = joints(Dn.danceAt(d, loop));
            a.forEach(([k, v], i) => {
                // A turn may come round a whole circle.
                const diff = b[i][1] - v;
                const off = k === 'root.ry' ? Math.abs(Math.sin(diff / 2)) : Math.abs(diff);
                expect(off).toBeLessThan(1e-9);
            });
            let last = joints(Dn.danceAt(d, 0));
            let fastest = 0;
            for (let t = 1 / FPS; t <= loop * 2; t += 1 / FPS) {
                const now = joints(Dn.danceAt(d, t));
                now.forEach(([k, v], i) => {
                    if (k.startsWith('root.') && ['x', 'y', 'z'].includes(k.slice(5))) return;
                    // A turn may come round a whole circle.
                    const step = k === 'root.ry' ? Math.abs(Math.asin(Math.sin(v - last[i][1]))) : Math.abs(v - last[i][1]);
                    fastest = Math.max(fastest, step);
                });
                last = now;
            }
            // A quarter turn in a frame at most, even the Robot's snaps.
            expect(fastest).toBeLessThan(0.3);
        }
    });

    test('a beat is held, then eased into the next pose, landing on the beat', () => {
        const robot = Dn.danceOf('robot');
        const held = Dn.danceAt(robot, robot.beat * robot.hold * 0.9);
        expect(held).toEqual(Dn.danceAt(robot, 0));
        const landed = Dn.danceAt(robot, robot.beat - 1e-9);
        expect(landed.armR.z).toBeCloseTo(robot.keys[1].armR.z, 6);
        // The bounce lifts between beats and lands on them.
        const dab = Dn.danceOf('dab');
        expect(Dn.danceAt(dab, dab.beat * 0.5).root.y).toBeGreaterThan(Dn.danceAt(dab, 0).root.y);
        expect(Dn.danceAt(dab, -1)).toEqual(Dn.danceAt(dab, 0));
    });

    test('a mirrored move is the same move on the other side', () => {
        const spec = { armR: { x: -0.2, z: 2.4 }, armL: { x: 0.2, z: 0.8, y: -1.1, fore: -1.5 }, neck: { y: -0.4, x: 0.2, z: 0.1 }, waist: { z: -0.1, y: 0.2 }, root: { x: -0.04, rz: -0.05, ry: 0.3, y: 0.02 }, legL: { x: 0.1, z: 0.2 } };
        const m = Dn.mirror(spec);
        expect(m.armL).toEqual(spec.armR);
        expect(m.armR).toEqual(spec.armL);
        expect(m.legR).toEqual(spec.legL);
        expect(m.neck).toEqual({ y: 0.4, x: 0.2, z: -0.1 });
        expect(m.waist).toEqual({ z: 0.1, y: -0.2 });
        expect(m.root).toEqual({ x: 0.04, rz: 0.05, ry: -0.3, y: 0.02 });
        expect(Dn.mirror(Dn.mirror(spec))).toEqual(spec);
        expect(Dn.mirror({})).toEqual({});
    });

    test('a dance is picked at random, never the last one twice running', () => {
        const seen = new Set();
        for (let r = 0; r < 1; r += 0.01) {
            const id = Dn.pickDance(r, 'robot');
            expect(id).not.toBe('robot');
            seen.add(id);
        }
        expect(seen.size).toBe(Dn.DANCES.length - 1);
        expect(Dn.pickDance(0.9999)).toBe('dab');
        expect(Dn.pickDance(0)).toBe('robot');
    });

});

describe('the jointing, against real three', () => {
    let THREE;
    let D;
    let people;
    beforeAll(async () => {
        THREE = await loadRealThree();
    });
    beforeEach(async () => {
        jest.resetModules();
        globalThis.THREE = THREE;
        D = await import('../www/shared/js/dance-1.0.0.js');
        people = await import('../www/shared/js/people-1.0.0.js');
    });

    const LOOK = { shirt: 0xc8322b, pants: 0x3b4f7a, skin: 0xc68642, hair: 0x2b1d14, style: 'long', scale: 1 };
    /** A figure as any scene builds one, jointed. */
    const figure = (look = LOOK) => D.jointPerson(people.createPerson({ shirtColor: look.shirt, pantsColor: look.pants, skinTone: look.skin, hairColor: look.hair, hairStyle: look.style, shoulderRound: 0.35 }));
    const world = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
    const handOf = (arm) => {
        let hand = null;
        arm.userData.forearm.traverse((o) => {
            if (o.isMesh && o.geometry.type === 'SphereGeometry' && o.position.y < -0.2) hand = o;
        });
        return hand;
    };
    /** The figure in `p`, measured: each arm's shoulder, elbow and hand,
     *  and the head's middle. */
    function measure(rig, p) {
        D.applyPose(rig, p);
        rig.root.updateMatrixWorld(true);
        const out = {};
        for (const k of ['L', 'R']) {
            const arm = rig.arms[k];
            out[k] = { shoulder: world(arm), elbow: world(arm.userData.forearm), hand: world(handOf(arm)) };
        }
        let head = null;
        rig.neck.traverse((o) => {
            if (o.isMesh && o.geometry.type === 'SphereGeometry' && o.material.color.getHex() === LOOK.skin
                && (!head || o.geometry.parameters.radius > head.geometry.parameters.radius)) head = o;
        });
        out.head = world(head);
        return out;
    }

    test('jointing a figure from createPerson moves nothing, and the head is the neck\'s', async () => {
        const rig = figure();
        const plain = people.createPerson({ shirtColor: LOOK.shirt, pantsColor: LOOK.pants, skinTone: LOOK.skin, hairColor: LOOK.hair, hairStyle: LOOK.style, shoulderRound: 0.35 });
        plain.position.set(0, rig.person.position.y, 0);
        plain.updateMatrixWorld(true);
        D.applyPose(rig, Dn.REST);
        rig.root.updateMatrixWorld(true);
        const points = (root) => {
            const out = [];
            root.traverse((o) => {
                if (o.isMesh) out.push(world(o).toArray().map((v) => +v.toFixed(6)).join(','));
            });
            return out.sort();
        };
        expect(points(rig.root)).toEqual(points(plain));
        // The head, its face and its hair turn on the neck; the torso does not.
        const inNeck = [];
        rig.neck.traverse((o) => o.isMesh && inNeck.push(o));
        const sphereR = inNeck.filter((o) => o.geometry.type === 'SphereGeometry' && o.material.color.getHex() === LOOK.skin).map((o) => o.geometry.parameters.radius);
        expect(Math.max(...sphereR)).toBeCloseTo(0.12, 6);
        expect(inNeck.some((o) => o.material.color.getHex() === LOOK.hair)).toBe(true);
        expect(inNeck.every((o) => world(o).y > D.RIG.neck)).toBe(true);
        expect(inNeck.length).toBeGreaterThan(6);
        // Soles on the floor.
        const box = new THREE.Box3().setFromObject(rig.root);
        expect(box.min.y).toBeCloseTo(0, 6);
        expect(rig.legs.L).toBeDefined();
        expect(rig.legs.R).toBeDefined();
        // Its left is its +x side (it faces +z).
        expect(world(rig.arms.L).x).toBeGreaterThan(0);
    });

    test('a joint turns the way the module says: a nod forward, a turn to the left, an arm out, an elbow bent forward', () => {
        const rig = figure();
        const rest = measure(rig, Dn.REST);
        const nod = measure(rig, Dn.pose({ neck: { x: 0.4 } }));
        let nose = null;
        rig.neck.traverse((o) => o.isMesh && o.geometry.type === 'ConeGeometry' && (nose = o));
        const noseAt = (p) => {
            D.applyPose(rig, p);
            rig.root.updateMatrixWorld(true);
            return world(nose);
        };
        expect(noseAt(Dn.pose({ neck: { x: 0.4 } })).y).toBeLessThan(noseAt(Dn.REST).y);
        expect(nod.head.z).toBeGreaterThan(rest.head.z);
        expect(noseAt(Dn.pose({ neck: { y: 0.6 } })).x).toBeGreaterThan(0.03);
        expect(measure(rig, Dn.pose({ waist: { z: 0.3 } })).head.x).toBeLessThan(-0.1);
        expect(measure(rig, Dn.pose({ waist: { x: 0.3 } })).head.z).toBeGreaterThan(0.1);
        const out = measure(rig, Dn.pose({ armL: { x: 0, z: 1.57 }, armR: { x: 0, z: 1.57 } }));
        expect(out.L.hand.x).toBeGreaterThan(0.7);
        expect(out.R.hand.x).toBeLessThan(-0.7);
        const fwd = measure(rig, Dn.pose({ armL: { x: -1.57, z: 0 } }));
        expect(fwd.L.hand.z).toBeGreaterThan(0.5);
        const bent = measure(rig, Dn.pose({ armL: { x: 0, z: 0, fore: -1.57 } }));
        expect(bent.L.hand.z).toBeGreaterThan(0.25);
        expect(bent.L.hand.y).toBeCloseTo(bent.L.elbow.y, 1);
        // A twist turns which way the elbow bends: up, for the Robot's post.
        const post = measure(rig, Dn.pose({ armL: { x: 0, z: 1.57, y: 1.57, fore: -1.57 } }));
        expect(post.L.hand.y).toBeGreaterThan(post.L.elbow.y + 0.25);
        // A step is the dancer's own, turned with the way it faces.
        D.applyPose(rig, Dn.pose({ root: { x: 0.1 } }), { x: 2, y: 0, z: 1, ry: Math.PI / 2 });
        expect(rig.root.position.x).toBeCloseTo(2, 6);
        expect(rig.root.position.z).toBeCloseTo(0.9, 6);
    });

    test('the contact poses touch: the YMCA\'s letters, the Macarena\'s hands, a hand on the hip', () => {
        const rig = figure();
        const at = (id, i) => {
            const d = Dn.danceOf(id);
            return measure(rig, d.keys[i]);
        };
        const near = (a, b) => a.distanceTo(b);
        // Y: hands high and wide. M: both hands on top of the head.
        const y = at('ymca', 0);
        expect(y.L.hand.y).toBeGreaterThan(1.75);
        expect(y.L.hand.x - y.R.hand.x).toBeGreaterThan(0.8);
        const m = at('ymca', 1);
        for (const k of ['L', 'R']) {
            expect(near(m[k].hand, m.head)).toBeLessThan(0.2);
            expect(m[k].hand.y).toBeGreaterThan(m.head.y + 0.08);
            expect(Math.abs(m[k].elbow.x)).toBeGreaterThan(0.3);
        }
        // C (Steve's QA, 2026-10-20: it read as a hand to the forehead): a
        // lean to the right, the left arm arched OVER the head (its elbow
        // up beside the head, its hand past it), the right curled in below.
        const c = at('ymca', 2);
        expect(c.head.x).toBeLessThan(-0.15);
        expect(c.L.elbow.y).toBeGreaterThan(c.head.y);
        expect(c.L.hand.x).toBeLessThan(c.head.x);
        expect(c.L.hand.y).toBeGreaterThan(c.head.y + 0.1);
        expect(c.R.elbow.x).toBeLessThan(-0.5);
        expect(c.R.hand.x).toBeGreaterThan(c.R.elbow.x + 0.15);
        expect(c.R.hand.y).toBeLessThan(c.R.elbow.y);
        // A (the same QA: bent elbows made a U): arms all but straight, the
        // hands meeting in a peak over the head.
        const a = at('ymca', 3);
        expect(near(a.L.hand, a.R.hand)).toBeLessThan(0.1);
        expect(a.L.hand.y).toBeGreaterThan(a.head.y + 0.25);
        for (const k of ['L', 'R']) expect(near(a[k].hand, a[k].shoulder)).toBeGreaterThan(0.53);
        // The Macarena: out in front, apart enough to read from the front
        // (the same QA), then crossed to the shoulders, behind the head, the
        // hips.
        const out = at('macarena', 1);
        for (const k of ['L', 'R']) expect(out[k].hand.z).toBeGreaterThan(0.45);
        expect(out.L.hand.x - out.R.hand.x).toBeGreaterThan(0.65);
        const crossed = at('macarena', 5);
        // The shoulder's pivot is inside the arm: a hand on its front is
        // a little over 0.2 m from it.
        expect(near(crossed.R.hand, crossed.L.shoulder)).toBeLessThan(0.23);
        expect(near(crossed.L.hand, crossed.R.shoulder)).toBeLessThan(0.23);
        const behind = at('macarena', 7);
        for (const k of ['L', 'R']) {
            expect(near(behind[k].hand, behind.head)).toBeLessThan(0.2);
            expect(behind[k].hand.z).toBeLessThan(behind.head.z - 0.05);
        }
        const front = at('macarena', 11);
        for (const k of ['L', 'R']) {
            expect(front[k].hand.y).toBeLessThan(1.0);
            expect(front[k].hand.z).toBeGreaterThan(0.1);
        }
        const back = at('macarena', 15);
        for (const k of ['L', 'R']) {
            expect(back[k].hand.y).toBeLessThan(0.95);
            expect(back[k].hand.z).toBeLessThan(-0.1);
        }
        // The Disco Point's hand on the hip, the elbow out.
        const disco = at('disco', 0);
        expect(Math.abs(disco.L.hand.y - 0.9)).toBeLessThan(0.08);
        expect(disco.L.elbow.x).toBeGreaterThan(0.35);
        expect(disco.R.hand.y).toBeGreaterThan(1.75);
        // The Dab: the face in one elbow, the other arm up and out.
        const dab = at('dab', 2);
        expect(near(dab.L.elbow, dab.head)).toBeLessThan(0.25);
        expect(dab.R.hand.x).toBeLessThan(-0.6);
        expect(dab.R.hand.y).toBeGreaterThan(1.6);
    });

    test('no arm passes through the body or the floor, at any moment of any dance', () => {
        const rig = figure();
        // The torso, a little inside its skin (0.38 by 0.55 by 0.22 m).
        const inTorso = (q) => Math.abs(q.x) < 0.15 && q.y > 0.86 && q.y < 1.28 && Math.abs(q.z) < 0.07;
        for (const d of Dn.DANCES) {
            for (let t = 0; t < Dn.loopOf(d); t += 1 / 30) {
                const p = Dn.danceAt(d, t);
                // Measured in the dancer's own frame: the torso box turns with it.
                const still = { ...p, root: { ...p.root, x: 0, z: 0, ry: 0, rx: 0, rz: 0 }, waist: { x: 0, y: 0, z: 0 } };
                const at = measure(rig, still);
                for (const k of ['L', 'R']) {
                    for (const [u, w] of [[at[k].shoulder, at[k].elbow], [at[k].elbow, at[k].hand]]) {
                        for (let f = 0.34; f <= 1.001; f += 0.33) {
                            const q = u.clone().lerp(w, f);
                            if (inTorso(q)) throw new Error(`${d.id} at ${t.toFixed(2)} s: arm ${k} through the torso at ${q.toArray().map((v) => v.toFixed(2))}`);
                        }
                    }
                }
                // And with every lean and bend: nothing under the floor.
                D.applyPose(rig, p);
                rig.root.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(rig.root);
                expect(box.min.y).toBeGreaterThan(-0.03);
            }
        }
    });

});

describe('baked for a crowd, against real three', () => {
    let THREE;
    let D;
    let people;
    beforeAll(async () => {
        THREE = await loadRealThree();
    });
    beforeEach(async () => {
        jest.resetModules();
        globalThis.THREE = THREE;
        D = await import('../www/shared/js/dance-1.0.0.js');
        people = await import('../www/shared/js/people-1.0.0.js');
    });
    const figure = () => D.jointPerson(people.createPerson({ shirtColor: 0xc8322b, sleeveColor: 0xc8322b, pantsColor: 0x3b4f7a, skinTone: 0xc68642, hairColor: 0x2b1d14, hairStyle: 'long', shoulderRound: 0.35, handScale: 1.3 }));
    const meshes = (rig) => {
        const out = [];
        rig.root.traverse((o) => o.isMesh && out.push(o));
        return out;
    };

    test('one mesh a joint: nine draw calls at most, the same figure to a hair, at rest and dancing', () => {
        const plain = figure();
        const baked = D.bakeJoints(figure());
        expect(meshes(plain).length).toBeGreaterThan(30);
        expect(meshes(baked).length).toBeLessThanOrEqual(9);
        const box = (r) => new THREE.Box3().setFromObject(r.root, true);
        for (const [id, t] of [[null, 0], ['ymca', 0.3], ['macarena', 2.5], ['dab', 1.1], ['robot', 0.9], ['floss', 0.33]]) {
            const p = id ? D.danceAt(D.danceOf(id), t) : D.REST;
            for (const r of [plain, baked]) {
                D.applyPose(r, p);
                r.root.updateMatrixWorld(true);
            }
            const a = box(plain);
            const b = box(baked);
            for (const k of ['x', 'y', 'z']) {
                expect(Math.abs(a.min[k] - b.min[k])).toBeLessThan(1e-6);
                expect(Math.abs(a.max[k] - b.max[k])).toBeLessThan(1e-6);
            }
        }
    });

    test('every part keeps its own color, one material shared between figures, the joints still the joints', () => {
        const plainColors = new Set();
        figure().root.traverse((o) => o.isMesh && o.material.color && plainColors.add(o.material.color.getHex()));
        const material = new THREE.MeshStandardMaterial({ vertexColors: true });
        const a = D.bakeJoints(figure(), { material });
        const b = D.bakeJoints(figure(), { material });
        const seen = new Set();
        for (const m of meshes(a)) {
            expect(m.material).toBe(material);
            const c = m.geometry.attributes.color;
            for (let i = 0; i < c.count; i += 7) seen.add(new THREE.Color(c.getX(i), c.getY(i), c.getZ(i)).getHex());
        }
        for (const hex of seen) expect(plainColors.has(hex)).toBe(true);
        expect(seen.has(0xc8322b)).toBe(true);
        expect(seen.has(0x2b1d14)).toBe(true);
        expect(meshes(b)[0].material).toBe(material);
        // The rig's joints are where they were, so applyPose drives it as before.
        for (const k of ['L', 'R']) {
            expect(a.arms[k].userData.forearm.children.filter((o) => o.isMesh)).toHaveLength(1);
            expect(a.legs[k].children.filter((o) => o.isMesh)).toHaveLength(1);
        }
        expect(a.neck.children.filter((o) => o.isMesh)).toHaveLength(1);
        // Lighter, for a figure far off: fewer triangles, the same shape near enough.
        const light = D.bakeJoints(figure(), { light: true });
        const tris = (r) => meshes(r).reduce((n, m) => n + m.geometry.index.count / 3, 0);
        expect(tris(light)).toBeLessThan(tris(a));
    });
});

describe('picking and easing', () => {
    test('several dances, all different, none excluded, as many as there are', () => {
        let r = 0;
        const rand = () => ((r += 0.37) % 1);
        const three = Dn.pickDances(3, rand, ['robot']);
        expect(three).toHaveLength(3);
        expect(new Set(three).size).toBe(3);
        expect(three).not.toContain('robot');
        expect(Dn.pickDances(20, () => 0)).toHaveLength(Dn.DANCES.length);
        expect(Dn.pickDances(2, () => 0.99, Dn.DANCES.map((d) => d.id))).toEqual([]);
    });

    test('blending two poses: each end itself, a turn the short way round', () => {
        const a = Dn.pose({ armL: { z: 3 }, root: { ry: 3.0 } });
        const b = Dn.pose({ armL: { z: 0.2 }, root: { ry: -3.0 } });
        expect(Dn.blendPoses(a, b, 0)).toEqual(a);
        expect(Dn.blendPoses(a, b, 1).armL.z).toBeCloseTo(0.2, 12);
        expect(Dn.blendPoses(a, b, 0.5).armL.z).toBeCloseTo(1.6, 12);
        // 3.0 to -3.0 is 0.28 rad the short way, through pi, not six radians back.
        expect(Math.abs(Dn.blendPoses(a, b, 0.5).root.ry)).toBeGreaterThan(3.1);
    });
});

describe('dancers in a scene, against real three', () => {
    let THREE;
    let D;
    beforeAll(async () => {
        THREE = await loadRealThree();
    });
    beforeEach(async () => {
        jest.resetModules();
        globalThis.THREE = THREE;
        D = await import('../www/shared/js/dance-1.0.0.js');
    });
    const look = { shirt: 0xc8322b, pants: 0x3b4f7a, skin: 0xc68642, hair: 0x2b1d14, style: 'long', scale: 1 };
    const colorsOf = (root) => {
        const out = new Set();
        root.traverse((o) => o.isMesh && o.material.color && out.add(o.material.color.getHex()));
        return out;
    };

    test('dressed from a crowd member\'s look: its colors, long sleeves in the shirt\'s, no hair for none', () => {
        const p = D.dressedPerson(look);
        const c = colorsOf(p);
        for (const hex of [look.shirt, look.pants, look.skin, look.hair]) expect(c.has(hex)).toBe(true);
        expect(colorsOf(D.dressedPerson({ ...look, style: null })).has(look.hair)).toBe(false);
        expect(colorsOf(D.dressedPerson({ ...look, sleeve: 0x00ff00 })).has(0x00ff00)).toBe(true);
        // A scene's own figure options go through.
        const muscled = D.dressedPerson(look, { muscular: true });
        expect(new THREE.Box3().setFromObject(muscled).getSize(new THREE.Vector3()).x).toBeGreaterThan(new THREE.Box3().setFromObject(p).getSize(new THREE.Vector3()).x);
    });

    test('a pool of dancers: built ahead, in step on one clock, eased in, a figure kept while its look is the same', () => {
        const pool = D.createDancers();
        expect(pool.dancing()).toBe(false);
        const ahead = pool.prepare(0, look);
        expect(ahead.root.visible).toBe(false);
        // Baked: nine draw calls at most.
        let n = 0;
        ahead.root.traverse((o) => o.isMesh && n++);
        expect(n).toBeLessThanOrEqual(9);
        const kid = { ...look, scale: 0.6 };
        pool.start(look, { x: 1, y: 0, z: 0, ry: 0 }, 'ymca', { slot: 0 });
        expect(pool.rig(0)).toBe(ahead);
        const intro = { pose: D.pose({ armL: { z: 3 }, armR: { z: 3 } }), seconds: 0.5 };
        pool.start(kid, { x: 2, y: 0, z: 0, ry: 0 }, 'ymca', { slot: 1, intro });
        expect(pool.count()).toBe(2);
        expect(pool.danceIn(1)).toBe('ymca');
        expect(pool.rig(1).root.scale.x).toBeCloseTo(0.6, 9);
        // At first the kid is in the intro's pose, not the dance's.
        pool.pose(0);
        expect(pool.rig(1).arms.L.rotation.z).toBeCloseTo(3, 6);
        expect(pool.rig(0).arms.L.rotation.z).not.toBeCloseTo(3, 2);
        // After it, in step with the other.
        pool.pose(1.3);
        expect(pool.rig(1).arms.L.rotation.z).toBeCloseTo(pool.rig(0).arms.L.rotation.z, 9);
        // Stopped: hidden, not thrown away.
        pool.stop();
        expect(pool.dancing()).toBe(false);
        pool.start(look, { x: 1, y: 0, z: 0 }, 'dab');
        expect(pool.rig(0)).toBe(ahead);
        pool.start({ ...look, shirt: 0x2f6fd6 }, { x: 1, y: 0, z: 0 }, 'dab');
        expect(pool.rig(0)).not.toBe(ahead);
        expect(pool.group.children).toHaveLength(2);
        pool.dispose();
        expect(pool.group.children).toHaveLength(0);
        expect(pool.rig(0)).toBeNull();
        // An unknown dance: nobody dances.
        pool.start(look, { x: 0, y: 0, z: 0 }, 'nope');
        expect(pool.dancing()).toBe(false);
    });

    test('who a camera sees: the hand-made projection is three\'s, and the picker keeps its rules', () => {
        const shot = { position: { x: 0, y: 1.6, z: 4 }, target: { x: 0.4, y: 1.2, z: 0 } };
        for (const aspect of [16 / 9, 0.46]) {
            const cam = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
            cam.position.set(shot.position.x, shot.position.y, shot.position.z);
            cam.lookAt(shot.target.x, shot.target.y, shot.target.z);
            cam.updateMatrixWorld(true);
            for (const p of [{ x: 0, y: 0, z: 0 }, { x: 1.5, y: 2.2, z: -2 }, { x: -1, y: 0.4, z: 1 }]) {
                const ours = D.screenPoint(shot, aspect, p, 50);
                const theirs = new THREE.Vector3(p.x, p.y, p.z).project(cam);
                expect(ours.x).toBeCloseTo(theirs.x, 9);
                expect(ours.y).toBeCloseTo(theirs.y, 9);
            }
        }
        expect(D.screenPoint(shot, 1, { x: 0, y: 1.6, z: 6 }, 50)).toBeNull();
        expect(D.boxOnScreen(shot, 1, { min: { x: -1, y: 0, z: 5 }, max: { x: 1, y: 1, z: 6 } }, 50)).toBeNull();
        // A row of grown-ups (and a child) behind one standing in front.
        const members = [];
        for (let x = -3; x <= 3; x += 0.5) members.push({ at: { x, y: 0.5, z: -2 }, look: { scale: 1 } });
        members.push({ at: { x: 0.2, y: 0.5, z: -2 }, look: { scale: 0.6 } });
        const front = D.figureBox(shot, 16 / 9, { x: 0.4, y: 0, z: 0 }, {}, 50);
        const picked = D.pickInView(members, shot, 16 / 9, { count: 3, avoid: [front], fov: 50 });
        expect(picked.length).toBe(3);
        const xs = picked.map((m) => D.screenPoint(shot, 16 / 9, { x: m.at.x, y: m.at.y + 1.4, z: m.at.z }, 50).x).sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(0.28);
        for (const m of picked) {
            expect(m.look.scale).toBe(1);
            const up = D.boxOnScreen(shot, 16 / 9, { min: { x: m.at.x - 0.28, y: m.at.y + 0.85, z: m.at.z - 0.28 }, max: { x: m.at.x + 0.28, y: m.at.y + 1.85, z: m.at.z + 0.28 } }, 50);
            expect(up.x0 < front.x1 && front.x0 < up.x1 && up.y0 < front.y1 && front.y0 < up.y1).toBe(false);
        }
        expect(D.pickInView([], shot, 1)).toEqual([]);
        // Grown-ups only: a child in plain view is never one of them.
        const spot = { x: -1.2, y: 0.5, z: -2 };
        expect(D.pickInView([{ at: spot, look: { scale: 1 } }], shot, 16 / 9, { fov: 50 })).toHaveLength(1);
        expect(D.pickInView([{ at: spot, look: { scale: 0.6 } }], shot, 16 / 9, { fov: 50 })).toEqual([]);
    });
});

describe('under the stub', () => {
    test('jointing is safe with no geometry at all', async () => {
        jest.resetModules();
        const { installThree } = await import('./helpers/three-stub.mjs');
        installThree();
        const D = await import('../www/shared/js/dance-1.0.0.js');
        const { createPerson } = await import('../www/shared/js/people-1.0.0.js');
        expect(() => {
            const rig = D.jointPerson(createPerson({}));
            D.applyPose(rig, D.danceAt(D.danceOf('dab'), 1));
        }).not.toThrow();
    });
});
