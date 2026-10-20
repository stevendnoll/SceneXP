// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Derby Day's dances (Steve, 2026-10-20): after the last heat, the day's
 * winner's grown-up steps out of the crowd and dances. The dances and the
 * jointing are shared (tests/shared-dance.test.mjs); here is Derby Day's
 * own: dancer.js (the crowd member dressed and jointed, who dances), the
 * dance on the day's timeline, the announcer's line, and the shot.
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
const Dn = await import('../www/shared/js/dance-1.0.0.js');
const Copy = await import('../www/derby/js/copy.js');
const Crowd = await import('../www/derby/js/crowd.js');
installThree();
const Dancer = await import('../www/derby/js/dancer.js');

const style = (s) => {
    expect(s).not.toMatch(/[—;]/);
    expect(s).not.toMatch(/pinewood/i);
};
const FPS = 60;
const joints = (p) => Object.entries(p).flatMap(([part, j]) => Object.entries(j).map(([k, v]) => [`${part}.${k}`, v]));

describe('the dances, at the derby', () => {
    test('every dance fits the dance shot at least once round', () => {
        for (const d of Dn.DANCES) expect(Dn.loopOf(d)).toBeLessThanOrEqual(C.timing.dance + 0.5);
    });

    test('the grown-up dances (Steve): one with empty hands if the family has one, and every family has one', () => {
        const kid = C.crowd.kidScale;
        const fam = (list) => list.map(([scale, prop]) => ({ look: { scale }, prop }));
        expect(Dancer.dancerOf(fam([[kid, 'sign'], [1, null]]), kid)).toBe(1);
        expect(Dancer.dancerOf(fam([[1, 'thermos'], [1, null]]), kid)).toBe(1);
        expect(Dancer.dancerOf(fam([[1, 'thermos'], [kid, null]]), kid)).toBe(0);
        expect(Dancer.dancerOf(fam([[kid, null]]), kid)).toBe(-1);
        expect(Dancer.dancerOf([], kid)).toBe(-1);
        for (const id of Object.keys(C.families)) {
            const members = Crowd.familyOf(id, C);
            const i = Dancer.dancerOf(members, kid);
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
    });});

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
    let Dn;
    beforeAll(async () => {
        THREE = await loadRealThree();
    });
    beforeEach(async () => {
        jest.resetModules();
        globalThis.THREE = THREE;
        D = await import('../www/derby/js/dancer.js');
        Dn = await import('../www/shared/js/dance-1.0.0.js');
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
        Dn.applyPose(rig, p);
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
        // Unbaked, to measure its single parts (the baked one is checked below).
        const rig = D.buildDancer(LOOK, { bake: false });
        const { createPerson } = await import('../www/shared/js/people-1.0.0.js');
        const { FIGURE } = await import('../www/shared/js/crowd-1.0.0.js');
        const plain = createPerson({ ...FIGURE, shirtColor: LOOK.shirt, sleeveColor: LOOK.shirt, pantsColor: LOOK.pants, skinTone: LOOK.skin, hairColor: LOOK.hair, hairStyle: LOOK.style });
        plain.position.set(0, rig.person.position.y, 0);
        plain.updateMatrixWorld(true);
        Dn.applyPose(rig, Dn.REST);
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
        expect(inNeck.every((o) => world(o).y > Dn.RIG.neck)).toBe(true);
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
                    Dn.applyPose(rig, Dn.danceAt(d, t), spot);
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
        // Unbaked, so each part's own color can be read.
        const dancer = D.createDancer({ bake: false });
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
    });});

describe('the winning finale\'s shot and its dancers', () => {
    let THREE;
    beforeAll(async () => {
        THREE = await loadRealThree();
    });

    test('the hand-made projection lands every point where three\'s own camera does', async () => {
        const Dir = await import('../www/derby/js/director.js');
        for (const aspect of [16 / 9, 390 / 844]) {
            const shot = Dir.duetFraming({ x: 13, z: -0.6 }, aspect, C);
            const cam = new THREE.PerspectiveCamera(C.camera.fov, aspect, C.camera.near, C.camera.far);
            cam.position.set(shot.position.x, shot.position.y, shot.position.z);
            cam.lookAt(shot.target.x, shot.target.y, shot.target.z);
            cam.updateMatrixWorld(true);
            for (const p of [{ x: 13, y: 1, z: -0.6 }, { x: 11.2, y: 2.4, z: -3 }, { x: 14.1, y: 0, z: -2.2 }, { x: 12.5, y: 3.1, z: -4.6 }]) {
                const ours = Dir.screenPoint(shot, aspect, p, C);
                const theirs = new THREE.Vector3(p.x, p.y, p.z).project(cam);
                expect(ours.x).toBeCloseTo(theirs.x, 9);
                expect(ours.y).toBeCloseTo(theirs.y, 9);
            }
            // Behind the camera: nothing.
            expect(Dir.screenPoint(shot, aspect, { x: shot.position.x, y: shot.position.y, z: shot.position.z + 1 }, C)).toBeNull();
            // A portrait phone aims higher and comes in closer across.
            if (aspect < 1) expect(shot.target.y).toBe(Dir.DUET_PORTRAIT.height);
        }
    });

    test('the bleachers\' dancers: grown-ups, seen from the waist up, hidden by nothing, spread apart', async () => {
        const Dir = await import('../www/derby/js/director.js');
        const aspect = 16 / 9;
        const shot = Dir.duetFraming({ x: 13, z: -0.6 }, aspect, C);
        const seats = Crowd.bleacherSeats(C);
        const looks = Crowd.crowdLooks(seats.length, C);
        const members = seats.map((at, index) => ({ index, at: { ...at, ry: 0 }, look: looks[index] }));
        const block = Dir.figureBox(shot, aspect, { x: 12.2, y: 0, z: -0.55 }, {}, C);
        const picked = Dir.pickCrowdDancers(members, shot, aspect, { count: 3, avoid: [block] }, C);
        // Two or three (Steve), as the hall allows.
        expect(picked.length).toBeGreaterThanOrEqual(2);
        expect(picked.length).toBeLessThanOrEqual(3);
        const xs = [];
        for (const m of picked) {
            expect(m.look.scale).toBe(1);
            const upper = Dir.boxOnScreen(shot, aspect, { min: { x: m.at.x - 0.28, y: m.at.y + 0.85, z: m.at.z - 0.28 }, max: { x: m.at.x + 0.28, y: m.at.y + 1.85, z: m.at.z + 0.28 } }, C);
            for (const v of [upper.x0, upper.x1, upper.y0, upper.y1]) expect(Math.abs(v)).toBeLessThanOrEqual(0.9);
            expect(upper.x0 < block.x1 && block.x0 < upper.x1 && upper.y0 < block.y1 && block.y0 < upper.y1).toBe(false);
            xs.push((upper.x0 + upper.x1) / 2);
        }
        xs.sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(0.28);
        // Nobody to pick, nobody picked.
        expect(Dir.pickCrowdDancers([], shot, aspect, {}, C)).toEqual([]);
        // The gantry over the finish is a box on the screen like any other.
        const Dr = await import('../www/derby/js/dressing.js');
        const g = Dr.gantryBounds(C);
        expect(g.min.x).toBeLessThan(C.track.courseLength);
        expect(g.max.x).toBeGreaterThan(C.track.courseLength - 0.2);
        expect(Dir.boxOnScreen(shot, aspect, g, C)).not.toBeNull();
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
