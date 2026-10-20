// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Derby Day's dances (Steve, 2026-10-20): after the last heat, the day's
 * winner's grown-up steps out of the crowd and dances. dances.js (the
 * choreography, pure), dancer.js (the figure, jointed), the dance on the
 * day's timeline, the announcer's line, and the shot.
 *
 * What is held here, and why:
 * - A DANCE LOOPS AND NEVER JUMPS: every joint comes back to where it began,
 *   and no joint moves further in one frame than a dancer's arm can.
 * - THE FIGURE IS THE MEMBER IT REPLACES: jointing it moves nothing, and it
 *   stands as tall as the crowd's baked person, soles on the floor.
 * - THE CONTACT POSES TOUCH: a hand on the head is on the head (measured
 *   against real three, the stub has no vertices), and no arm passes
 *   through the body or the floor at any moment of any dance.
 * - THE SHOT HOLDS THE DANCER, head, hands held high and feet, on a phone
 *   and on a computer, all the way through.
 */
import { jest } from '@jest/globals';
import { loadRealThree } from './helpers/real-three.mjs';
import { installThree } from './helpers/three-stub.mjs';

const { DERBY_CONFIG: C } = await import('../www/derby/js/config.js');
const Dn = await import('../www/derby/js/dances.js');
const Copy = await import('../www/derby/js/copy.js');
const Crowd = await import('../www/derby/js/crowd.js');

const style = (s) => {
    expect(s).not.toMatch(/[—;]/);
    expect(s).not.toMatch(/pinewood/i);
};
const FPS = 60;
const joints = (p) => Object.entries(p).flatMap(([part, j]) => Object.entries(j).map(([k, v]) => [`${part}.${k}`, v]));

describe('the dances, pure', () => {
    test('eight dances, each named for the announcer, every pose whole', () => {
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
            // A dance fills the shot at least once round.
            expect(Dn.loopOf(d)).toBeGreaterThan(0.75);
            expect(Dn.loopOf(d)).toBeLessThanOrEqual(C.timing.dance + 0.5);
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

    test('the grown-up dances (Steve): one with empty hands if the family has one, and every family has one', () => {
        const kid = C.crowd.kidScale;
        const fam = (list) => list.map(([scale, prop]) => ({ look: { scale }, prop }));
        expect(Dn.dancerOf(fam([[kid, 'sign'], [1, null]]), kid)).toBe(1);
        expect(Dn.dancerOf(fam([[1, 'thermos'], [1, null]]), kid)).toBe(1);
        expect(Dn.dancerOf(fam([[1, 'thermos'], [kid, null]]), kid)).toBe(0);
        expect(Dn.dancerOf(fam([[kid, null]]), kid)).toBe(-1);
        expect(Dn.dancerOf([], kid)).toBe(-1);
        for (const id of Object.keys(C.families)) {
            const members = Crowd.familyOf(id, C);
            const i = Dn.dancerOf(members, kid);
            expect(i).toBeGreaterThanOrEqual(0);
            expect(members[i].look.scale).toBe(1);
        }
    });

    test('the announcer names the dance, the visitor\'s family its own way', () => {
        expect(Copy.CALLS.dance('The Comet', 'the Robot', false)).toBe('The Comet wins the day, and here comes the Robot!');
        expect(Copy.CALLS.dance('Blue Wedge', 'the YMCA', true)).toBe('Blue Wedge wins the day, and your family breaks out the YMCA!');
        for (const d of Dn.DANCES) {
            style(Copy.CALLS.dance('Blue Wedge', d.name, true));
            style(Copy.CALLS.dance('The Comet', d.name, false));
        }
    });

    test('the winner\'s family cheers the dance, the bleachers too', () => {
        const member = (group, keen = false) => ({ group, keen, phase: 0.4, look: { scale: 1 } });
        const moment = { kind: 'dance', t: 0.2, won: 'comet' };
        const cheer = Crowd.poseAt(member('comet'), moment);
        expect(cheer.pose).toBe('up');
        expect(cheer.hop).toBeGreaterThan(0);
        expect(Crowd.poseAt(member('owl'), moment)).toEqual({ pose: 'down', hop: 0 });
        expect(['up', 'clap']).toContain(Crowd.poseAt(member('crowd', true), moment).pose);
        expect(['clap', 'apart']).toContain(Crowd.poseAt(member('crowd'), moment).pose);
    });
});

describe('the dance on the day', () => {
    let P;
    let race;
    beforeAll(async () => {
        installThree();
        P = await import('../www/derby/js/playback.js');
        const Car = await import('../www/derby/js/car.js');
        const Sim = await import('../www/derby/js/sim.js');
        const cars = [Car.describeCar(Car.buildFromDesign('wedge')), ...C.divisions.easy.map((id) => Car.describeCar(Car.buildFromField(C.field[id])))];
        race = Sim.runRace(cars, C, { record: C.timing.record });
    });

    test('the last heat ends with the dance, never under reduced motion, and only when asked', () => {
        const plan = P.planDay(race, { focus: 0, dance: true });
        const last = plan.heats[plan.heats.length - 1];
        const seg = last.segments[last.segments.length - 1];
        expect(seg.kind).toBe('dance');
        expect(seg.to - seg.from).toBeCloseTo(C.timing.dance, 9);
        expect(plan.total).toBeCloseTo(seg.to, 9);
        // Only once a day.
        expect(plan.heats.flatMap((h) => h.segments).filter((s) => s.kind === 'dance')).toHaveLength(1);
        // The cars stay where the last heat left them.
        const m = P.momentAt(plan, (seg.from + seg.to) / 2);
        expect(m.segment.kind).toBe('dance');
        const run = last.segments.find((s) => s.kind === 'run');
        expect(m.runTime).toBeCloseTo(run.to - run.from, 9);
        for (const opts of [{ focus: 0 }, { focus: 0, dance: true, reducedMotion: true }]) {
            expect(P.planDay(race, opts).heats.flatMap((h) => h.segments).some((s) => s.kind === 'dance')).toBe(false);
        }
    });
});

describe('the dancer, against real three', () => {
    let THREE;
    let D;
    beforeAll(async () => {
        THREE = await loadRealThree();
    });
    beforeEach(async () => {
        jest.resetModules();
        globalThis.THREE = THREE;
        D = await import('../www/derby/js/dancer.js');
    });

    const LOOK = { shirt: 0xc8322b, pants: 0x3b4f7a, skin: 0xc68642, hair: 0x2b1d14, style: 'long', scale: 1 };
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

    test('jointing the figure moves nothing, the head is the neck\'s, and it stands as the crowd\'s person does', async () => {
        const rig = D.buildDancer(LOOK);
        const { createPerson } = await import('../www/shared/js/people-1.0.0.js');
        const { FIGURE } = await import('../www/shared/js/crowd-1.0.0.js');
        const plain = createPerson({ ...FIGURE, shirtColor: LOOK.shirt, sleeveColor: LOOK.shirt, pantsColor: LOOK.pants, skinTone: LOOK.skin, hairColor: LOOK.hair, hairStyle: LOOK.style });
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
        // As tall as the crowd's baked person, soles on the floor.
        const box = new THREE.Box3().setFromObject(rig.root);
        expect(box.min.y).toBeCloseTo(0, 6);
        const parts = (await import('../www/shared/js/crowd-1.0.0.js')).buildCrowdParts({ poses: ['down'] });
        const head = measure(rig, Dn.REST).head;
        expect(head.y).toBeCloseTo(parts.eyeHeight, 2);
        expect(rig.legs.L).toBeDefined();
        expect(rig.legs.R).toBeDefined();
        // Its left is its +x side (it faces +z).
        expect(world(rig.arms.L).x).toBeGreaterThan(0);
    });

    test('a joint turns the way dances.js says: a nod forward, a turn to the left, an arm out, an elbow bent forward', () => {
        const rig = D.buildDancer(LOOK);
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
        const rig = D.buildDancer(LOOK);
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
        // C: both hands to the dancer's right, one over the head.
        const c = at('ymca', 2);
        expect(c.L.hand.x).toBeLessThan(c.head.x);
        expect(c.L.hand.y).toBeGreaterThan(c.head.y);
        expect(c.R.elbow.x).toBeLessThan(-0.3);
        // A: the hands meet over the head.
        const a = at('ymca', 3);
        expect(near(a.L.hand, a.R.hand)).toBeLessThan(0.2);
        expect(a.L.hand.y).toBeGreaterThan(a.head.y + 0.2);
        // The Macarena: crossed to the shoulders, behind the head, the hips.
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
        const rig = D.buildDancer(LOOK);
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

    test('the dance shot holds the dancer, head, hands and feet, on a phone and a computer, all the way through', async () => {
        const Dir = await import('../www/derby/js/director.js');
        const spot = { x: C.track.courseLength - C.crowd.familyFrom, y: 0, z: C.crowd.familyZ, ry: 0 };
        const rig = D.buildDancer(LOOK);
        for (const aspect of [16 / 9, 4 / 3, 390 / 844]) {
            const shot = Dir.danceFraming(spot, aspect, C);
            const cam = new THREE.PerspectiveCamera(C.camera.fov, aspect, C.camera.near, C.camera.far);
            cam.position.set(shot.position.x, shot.position.y, shot.position.z);
            cam.lookAt(shot.target.x, shot.target.y, shot.target.z);
            cam.updateMatrixWorld(true);
            // In front of the track, from the near side, looking a little down.
            expect(shot.position.z).toBeGreaterThan(1);
            for (const d of Dn.DANCES) {
                for (let t = 0; t < Dn.loopOf(d); t += 0.1) {
                    D.applyPose(rig, Dn.danceAt(d, t), spot);
                    rig.root.updateMatrixWorld(true);
                    const box = new THREE.Box3().setFromObject(rig.root);
                    for (const x of [box.min.x, box.max.x]) {
                        for (const yy of [box.min.y, box.max.y]) {
                            const v = new THREE.Vector3(x, yy, (box.min.z + box.max.z) / 2).project(cam);
                            expect(Math.abs(v.x)).toBeLessThan(0.97);
                            expect(Math.abs(v.y)).toBeLessThan(0.97);
                        }
                    }
                }
            }
        }
    });

    test('in the hall: hidden until it dances, one figure a look, and safe to stop and let go', () => {
        const dancer = D.createDancer();
        expect(dancer.dancing()).toBe(false);
        expect(() => dancer.pose(1)).not.toThrow();
        const spot = { x: 13, y: 0, z: -0.55, ry: 0 };
        dancer.start(LOOK, spot, 'robot');
        expect(dancer.dancing()).toBe(true);
        const first = dancer.rig();
        expect(first.root.position.x).toBeCloseTo(13, 6);
        expect(dancer.group.children).toEqual([first.root]);
        dancer.pose(0.4);
        dancer.stop();
        expect(dancer.dancing()).toBe(false);
        expect(first.root.visible).toBe(false);
        // The same look again builds nothing; a new look replaces it.
        dancer.start(LOOK, spot, 'ymca');
        expect(dancer.rig()).toBe(first);
        dancer.start({ ...LOOK, shirt: 0x2f6fd6, style: null }, spot, 'floss');
        expect(dancer.rig()).not.toBe(first);
        expect(dancer.group.children).toHaveLength(1);
        let hair = 0;
        dancer.rig().root.traverse((o) => o.isMesh && o.material.color.getHex() === LOOK.hair && hair++);
        expect(hair).toBe(0);
        dancer.dispose();
        expect(dancer.group.children).toHaveLength(0);
    });
});

describe('under the stub', () => {
    test('a dancer is safe with no geometry at all', async () => {
        jest.resetModules();
        installThree();
        const D = await import('../www/derby/js/dancer.js');
        const dancer = D.createDancer();
        expect(() => {
            dancer.start({ shirt: 1, pants: 2, skin: 3, hair: 4, style: 'short', scale: 1 }, { x: 0, y: 0, z: 0, ry: 0 }, 'dab');
            dancer.pose(1);
            dancer.stop();
            dancer.dispose();
        }).not.toThrow();
    });
});
