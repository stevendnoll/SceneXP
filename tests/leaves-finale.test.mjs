// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The leaf blower's finale (www/leaves/js/finale.js): the dive into the
 * tarp's pile, measured.
 *
 * The plan and the motion are pure, so they are checked by sampling them: a
 * tall enough pile is landed in and anything less finds the lawn, the
 * run-up stays on the lawn, the body moves without jumps, lies on what it
 * lands on, and ends waist-deep in a good pile or bent over with a hand on
 * its back after a flop. Then the sim's side of it (pilePeak, burst) for
 * real, and the poses on the real three.js.
 */
import { loadRealThree } from './helpers/real-three.mjs';

const Fn = await import('../www/leaves/js/finale.js');
const S = await import('../www/leaves/js/sim.js');
const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');

const F = C.finale;
const area = { minX: -9.5, maxX: 9.6, minZ: -5.4, maxZ: 9 };
const corner = { x: -9.55, z: -5.55 };
const good = Fn.planFinale({ x: 2, z: 3 }, { ...corner, height: 0.6 }, F, area);
const flop = Fn.planFinale({ x: 2, z: 3 }, { ...corner, height: 0.12 }, F, area);

/** Every pose through a plan at 60 samples a second. */
function sample(plan) {
    const out = [];
    for (let t = 0; t <= plan.total + 0.5; t += 1 / 60) out.push({ t, ...Fn.finaleAt(plan, t) });
    return out;
}

describe('the plan', () => {
    test('a pile as tall as the line is landed in, and anything less is not', () => {
        expect(good.success).toBe(true);
        expect(flop.success).toBe(false);
        expect(Fn.planFinale({ x: 0, z: 0 }, { ...corner, height: F.diveHeight }, F, area).success).toBe(true);
        expect(Fn.planFinale({ x: 0, z: 0 }, { ...corner, height: F.diveHeight - 0.01 }, F, area).success).toBe(false);
        // Nothing on the tarp at all is a flop onto bare tarp.
        expect(Fn.planFinale({ x: 0, z: 0 }, { x: -7, z: -4, height: 0 }, F, area).success).toBe(false);
    });

    test('the run-up comes from the lawn, straight at the pile', () => {
        for (const p of [good.runFrom, good.takeoff]) {
            expect(p.x).toBeGreaterThanOrEqual(area.minX);
            expect(p.z).toBeGreaterThanOrEqual(area.minZ);
        }
        // Run-up, takeoff and landing on one line toward the peak, in order.
        const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
        expect(d(good.runFrom, good.land)).toBeGreaterThan(d(good.takeoff, good.land));
        expect(d(good.runFrom, good.takeoff) + d(good.takeoff, good.land)).toBeCloseTo(d(good.runFrom, good.land), 6);
        // Facing the pile.
        const f = { x: Math.sin(good.heading), z: Math.cos(good.heading) };
        const toPeak = { x: corner.x - good.land.x, z: corner.z - good.land.z };
        expect(f.x * toPeak.x + f.z * toPeak.z).toBeGreaterThan(0);
    });

    test('it all fits well inside the round\'s cap on the finale', () => {
        const t = good.t;
        expect(t.pause).toBeLessThan(t.walk);
        expect(t.walk).toBeLessThan(t.run);
        expect(t.run).toBeLessThan(t.air);
        expect(t.air).toBeLessThan(t.down);
        expect(t.down).toBeLessThan(t.end);
        for (const plan of [good, flop, Fn.planFinale({ x: 9, z: 9 }, { ...corner, height: 0.6 }, F, area)]) {
            expect(plan.total).toBeLessThan(C.round.finaleMax - 2);
        }
    });
});

describe('the motion', () => {
    test('goes through every phase in order, and never jumps', () => {
        for (const plan of [good, flop]) {
            const poses = sample(plan);
            const order = ['pause', 'walk', 'run', 'air', 'down', 'roll', 'end'];
            const seen = [...new Set(poses.map((p) => p.phase))];
            expect(seen).toEqual(order);
            let worst = 0;
            for (let k = 1; k < poses.length; k++) {
                const a = poses[k - 1];
                const b = poses[k];
                worst = Math.max(worst, Math.hypot(b.x - a.x, b.z - a.z, b.lift - a.lift));
            }
            // Under 12 cm in a sixtieth of a second: 7.2 m/s at the most, a
            // running dive (it peaks near 6), and no teleports.
            expect(worst).toBeLessThan(0.12);
        }
    });

    test('the leap rises above both ends, arms first', () => {
        const air = sample(good).filter((p) => p.phase === 'air');
        const top = Math.max(...air.map((p) => p.lift));
        expect(top).toBeGreaterThan(air[0].lift + 0.3);
        expect(top).toBeGreaterThan(air[air.length - 1].lift + 0.3);
        expect(air.every((p) => p.arms === 'up')).toBe(true);
        // Body level by the landing.
        expect(air[air.length - 1].pitch).toBeGreaterThan(Math.PI / 2 - 0.05);
    });

    test('a good dive sinks into the pile and rolls part way over, arms still overhead', () => {
        const down = Fn.finaleAt(good, good.t.air + 0.1);
        // Lying face down, the hips on the surface it landed on, sunk in.
        expect(down.pitch).toBeCloseTo(Math.PI / 2, 9);
        expect(down.roll).toBe(0);
        expect(down.lift + Fn.PIVOT).toBeCloseTo(good.surface + 0.12, 9);
        expect(good.surface).toBeLessThan(0.6);
        const end = Fn.finaleAt(good, good.total + 1);
        expect(end.phase).toBe('end');
        expect(Math.abs(end.roll)).toBeCloseTo(F.roll, 9);
        expect(end.arms).toBe('up');
    });

    // STEVE'S M3 QA: "we don't need the character to stand back up".
    test('nobody stands back up: from the landing on they stay lying where they landed', () => {
        for (const plan of [good, flop]) {
            const after = sample(plan).filter((p) => p.t >= plan.t.air);
            for (const p of after) {
                expect(p.pitch).toBeCloseTo(Math.PI / 2, 9);
                expect(p.lift).toBeCloseTo(after[0].lift, 9);
                expect(p.x).toBe(plan.land.x);
                expect(p.z).toBe(plan.land.z);
            }
        }
    });

    test('a flop lies on the lawn and rolls over with a hand on the back', () => {
        const down = Fn.finaleAt(flop, flop.t.air + 0.1);
        expect(down.lift + Fn.PIVOT).toBeCloseTo(0.12 + 0.12, 6);
        const end = Fn.finaleAt(flop, flop.total + 1);
        expect(end.arms).toBe('back');
        expect(Math.abs(end.roll)).toBeCloseTo(F.roll, 9);
    });

    test('it is short: well under the round\'s cap, wherever they finished', () => {
        for (const from of [{ x: -5, z: -1 }, { x: 9, z: 9 }]) {
            for (const height of [0.6, 0.1]) {
                expect(Fn.planFinale(from, { ...corner, height }, F, area).total).toBeLessThan(6.5);
            }
        }
    });

    test('reduced motion makes it a gentle hop', () => {
        const calm = Fn.planFinale({ x: 2, z: 3 }, { ...corner, height: 0.6 }, F, area, { reduced: true });
        expect(calm.arc).toBeLessThan(good.arc * 0.5);
    });
});

describe('the pile and the burst, in the real sim', () => {
    /** A small yard with `n` leaves heaped in the tarp's corner. */
    function heap(n) {
        const sim = S.createSim(Math.max(n, 200) + 200, C);
        S.scatterLeaves(sim, C);
        for (let i = 0; i < n; i++) S.wake(sim, i);
        sim.activeCount = 0;
        sim.activeAt.fill(-1);
        for (let i = 0; i < n; i++) S.layDown(sim, i, -9.6 + (i % 7) * 0.05, -5.6 + (i % 5) * 0.05);
        return sim;
    }

    test('the peak is the top of the pile on the tarp, and the tarp\'s middle when it is bare', () => {
        const sim = heap(400);
        const peak = S.pilePeak(sim, C.yard.tarp);
        let tallest = 0;
        for (const h of sim.height) tallest = Math.max(tallest, h);
        expect(peak.height).toBeCloseTo(tallest, 9);
        expect(peak.x).toBeLessThan(-8);
        const bare = S.createSim(10, C);
        expect(S.pilePeak(bare, C.yard.tarp)).toEqual({ x: -7.5, z: -3.75, height: 0 });
    });

    test('a few hundred leaves heap tall enough to land in', () => {
        const sim = heap(600);
        expect(S.pilePeak(sim, C.yard.tarp).height).toBeGreaterThanOrEqual(F.diveHeight);
    });

    test('the burst throws the pile up and out, touches nothing else, and it all comes down again', () => {
        const sim = heap(600);
        const far = 650;
        const before = { x: sim.px[far], z: sim.pz[far] };
        const n = S.burst(sim, -9.3, -5.3, F.burstRadius, F.burstSpeed);
        expect(n).toBeGreaterThan(400);
        expect(sim.activeCount).toBe(n);
        let rising = 0;
        for (let a = 0; a < sim.activeCount; a++) if (sim.vy[sim.active[a]] > 0) rising++;
        expect(rising).toBe(n);
        // A leaf out on the lawn is left alone.
        expect(sim.awake[far]).toBe(0);
        let highest = 0;
        for (let f = 0; f < 60 * 6; f++) {
            S.stepSim(sim, 1 / 60, null);
            for (let a = 0; a < sim.activeCount; a++) highest = Math.max(highest, sim.py[sim.active[a]]);
        }
        // Riding the landing's gust to above a person's head (alone, thrown,
        // they reached 0.69 m: drag stops a leaf within centimeters).
        expect(highest).toBeGreaterThan(1.6);
        expect(sim.activeCount).toBe(0);
        expect({ x: sim.px[far], z: sim.pz[far] }).toEqual(before);
    });
});

describe('the dive poses, on the real three.js', () => {
    let THREE;
    let saved;
    let Op;

    beforeAll(async () => {
        saved = globalThis.THREE;
        THREE = await loadRealThree();
        globalThis.THREE = THREE;
        Op = await import('../www/leaves/js/blower.js');
    });
    afterAll(() => { globalThis.THREE = saved; });

    function measure(op, arms) {
        const fig = Op.createOperatorFigure(C.blower, C.look, { person: { shoulderRound: 0.4 } });
        fig.update({ x: 0, z: 0, heading: 0, speed: 0, stride: 0, ...op }, false, 0, arms);
        fig.group.updateMatrixWorld(true);
        const at = {};
        fig.group.traverse((o) => {
            if (o.userData && o.userData.isArm) {
                const f = o.userData.forearm;
                at[o.userData.armSide === -1 ? 'right' : 'left'] = new THREE.Vector3().setFromMatrixPosition(f.children[f.children.length - 1].matrixWorld);
            }
        });
        // Only what is drawn: three's Box3 counts hidden objects too, and the
        // blower put away for the dive would stretch it.
        const box = new THREE.Box3();
        fig.group.traverse((o) => {
            if (!o.isMesh) return;
            for (let p = o; p; p = p.parent) if (!p.visible) return;
            box.expandByObject(o);
        });
        return { ...at, box };
    }

    test('arms up puts both hands above the head', () => {
        const { left, right } = measure({}, 'up');
        expect(left.y).toBeGreaterThan(1.75);
        expect(right.y).toBeGreaterThan(1.75);
    });

    test('a hand on the back is behind the body at the waist', () => {
        const { right } = measure({}, 'back');
        expect(right.z).toBeLessThan(-0.1);
        expect(right.y).toBeGreaterThan(0.8);
        expect(right.y).toBeLessThan(1.05);
    });

    test('rolled over at the end, the face turns toward the camera, whichever way the run came in', () => {
        // The camera looks at the pile from the street and above (view.cameraOn).
        const len = Math.hypot(C.camera.height, C.camera.back);
        const toCamera = new THREE.Vector3(0, C.camera.height / len, C.camera.back / len);
        for (const from of [{ x: 2, z: 3 }, { x: -9, z: 6 }, { x: 8, z: -4 }, { x: -6, z: -5 }]) {
            const plan = Fn.planFinale(from, { ...corner, height: 0.6 }, F, area);
            const end = Fn.finaleAt(plan, plan.total + 1);
            const fig = Op.createOperatorFigure(C.blower, C.look, { person: { shoulderRound: 0.4 } });
            fig.update({ ...end, hideBlower: true }, false, 0, end.arms);
            fig.group.updateMatrixWorld(true);
            // The face: from the head's middle out through the nose.
            let head = null;
            let nose = null;
            fig.group.traverse((o) => {
                if (!o.isMesh || !o.geometry || !o.geometry.parameters) return;
                const p = o.geometry.parameters;
                if (o.geometry.type === 'SphereGeometry' && Math.abs(p.radius - 0.12) < 1e-9) head = o;
            });
            fig.group.traverse((o) => {
                if (!o.isMesh || !head || o.parent !== head.parent) return;
                const local = o.position;
                if (Math.abs(local.x) < 1e-6 && local.z > 0.1 && Math.abs(local.y - head.position.y) < 0.05 && o !== head) nose = o;
            });
            expect(head).not.toBe(null);
            expect(nose).not.toBe(null);
            const a = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
            const b = new THREE.Vector3().setFromMatrixPosition(nose.matrixWorld);
            const face = b.sub(a).normalize();
            expect(face.dot(toCamera)).toBeGreaterThan(0.3);
        }
    });

    test('tipped face down and lowered, the body lies flat at the height the finale asks for', () => {
        const surface = 0.3;
        const { box } = measure({ pitch: Math.PI / 2, lift: surface + 0.12 - Fn.PIVOT, hideBlower: true }, 'up');
        // Lying along the ground, well over a meter long and low.
        expect(box.max.z - box.min.z).toBeGreaterThan(1.5);
        expect(box.max.y - box.min.y).toBeLessThan(0.6);
        // Its underside at the surface, give or take an arm's thickness.
        expect(Math.abs(box.min.y - surface)).toBeLessThan(0.12);
    });
});
