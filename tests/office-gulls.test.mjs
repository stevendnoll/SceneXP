// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The gulls over Corner Office's waterfront (gulls.js): Steve asked for them
 * only "if we could nail the motion", so what is held here is the motion of
 * a gull on a waterfront breeze. It glides far more than it beats, at a
 * gull's pace, banked into its turns as far as the turn asks, and its beats
 * come in short bursts at a gull's rate, rippling from the arm to the hand.
 */
import * as gulls from '../www/office/js/gulls.js';

const { GULLS, GLIDE, flock, gullAt, gullPose, flapping, gullShape, posePoint, flockTriangles, JOINTS } = gulls;
const DEG = Math.PI / 180;
const HOUR = 3600;

/** Every pose of a gull at `fps` over `seconds`. */
const poses = (g, seconds, fps = 10, from = 0) => Array.from({ length: Math.round(seconds * fps) }, (_, i) => gullPose(g, from + i / fps));

describe('the flock', () => {
    test('one gull for each center, each its own, made once', () => {
        expect(flock()).toHaveLength(GULLS.centers.length);
        expect(flock()).toBe(flock());
        const radii = new Set(flock().map((g) => g.radius));
        expect(radii.size).toBe(flock().length);
        // Some wheel one way and some the other.
        expect(new Set(flock().map((g) => g.turn)).size).toBe(2);
    });

    test('none ever comes nearer the office than GULLS.nearest, all near its height, and never over the office', () => {
        for (const g of flock()) {
            for (let t = 0; t < HOUR; t += 1.5) {
                const [x, y, z] = gullAt(g, t);
                // The office's eye is 195 m over the water, at the room's origin.
                expect(Math.hypot(x, y - 195, z)).toBeGreaterThan(GULLS.nearest);
                expect(y).toBeGreaterThan(15);
                // About the office's own height, so they are seen level,
                // against the land rather than the water's sheen.
                expect(Math.abs(y - 195)).toBeLessThan(60);
                // Out over the waterfront and the bay, west of the office.
                expect(z).toBeLessThan(-250);
            }
        }
    });
});

describe('the glide', () => {
    test('at a gull’s pace, steady, never stalling or darting', () => {
        for (const g of flock()) {
            const speeds = [];
            for (let t = 0; t < 600; t += 0.5) {
                const a = gullAt(g, t);
                const b = gullAt(g, t + 0.1);
                speeds.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.1);
            }
            expect(Math.min(...speeds)).toBeGreaterThan(5);
            expect(Math.max(...speeds)).toBeLessThan(15);
        }
    });

    test('banked into every turn, about as far as a coordinated turn asks, and never past 45 degrees', () => {
        for (const g of flock()) {
            const all = poses(g, 300, 4);
            const banks = all.map((p) => p.bank);
            expect(Math.max(...banks.map(Math.abs))).toBeLessThan(45 * DEG);
            // A wheel is a steady turn one way: the bank keeps its sign, and
            // is the turn's own (tan(bank) = v ω / g), a little over.
            const typical = banks.reduce((s, b) => s + b, 0) / banks.length;
            const expected = Math.atan((g.speed * g.speed) / (g.radius * 9.81));
            expect(Math.abs(typical)).toBeGreaterThan(expected * 0.8);
            expect(Math.abs(typical)).toBeLessThan(expected * 2);
            expect(banks.every((b) => Math.sign(b) === Math.sign(typical))).toBe(true);
        }
    });

    test('into the turn: the wing on the inside is the lower, and the nose points where it is going', () => {
        for (const g of flock()) {
            for (const t of [10, 55, 130]) {
                const pose = gullPose(g, t);
                const at = { ...pose, ...GLIDE };
                const tipL = posePoint([0.72, 0.02, -0.16], 'hand-left', at);
                const tipR = posePoint([-0.72, 0.02, -0.16], 'hand-right', at);
                // Where the turn goes: the center of its wheel.
                const ahead = gullAt(g, t + 3);
                const nose = posePoint([0, 0.01, 0.34], 'body', at);
                const tail = posePoint([0, 0.01, -0.22], 'body', at);
                const heading = [nose[0] - tail[0], nose[2] - tail[2]];
                const toAhead = [ahead[0] - pose.x, ahead[2] - pose.z];
                expect(heading[0] * toAhead[0] + heading[1] * toAhead[1]).toBeGreaterThan(0);
                // The side the turn goes to: left of the heading is (hz, -hx).
                const leftward = heading[1] * toAhead[0] - heading[0] * toAhead[1];
                const inside = leftward > 0 ? tipL : tipR;
                const outside = leftward > 0 ? tipR : tipL;
                expect(inside[1]).toBeLessThan(outside[1]);
            }
        }
    });

    test('held in the gull-wing shape: the arm raised from the shoulder, the hand drooping from the wrist', () => {
        const g = flock()[0];
        const glide = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0, ...GLIDE };
        const shoulder = posePoint([JOINTS.shoulder, 0.02, 0], 'arm-left', glide, 1);
        const wrist = posePoint([JOINTS.wrist, 0.02, 0], 'arm-left', glide, 1);
        const tip = posePoint([0.72, 0.02, -0.16], 'hand-left', glide, 1);
        expect(wrist[1]).toBeGreaterThan(shoulder[1] + 0.02);
        expect(tip[1]).toBeLessThan(wrist[1] - 0.03);
        // The wrist is where the arm and hand meet: the hand's root and the
        // arm's end are one point.
        expect(posePoint([JOINTS.wrist, 0.02, 0.08], 'hand-left', glide, 1)).toEqual(
            posePoint([JOINTS.wrist, 0.02, 0.08], 'arm-left', glide, 1).map((v) => expect.closeTo(v, 9)));
        expect(gullPose(g, 1).arm).toBeGreaterThan(0);
    });
});

describe('the beats', () => {
    test('mostly gliding: a burst now and then, each a second or two', () => {
        for (const g of flock()) {
            const all = poses(g, 1200, 10);
            const share = all.filter((p) => p.beating).length / all.length;
            expect(share).toBeGreaterThan(0.03);
            expect(share).toBeLessThan(0.2);
            // Each burst's length.
            let run = 0;
            const runs = [];
            for (const p of all) {
                if (p.beating) run++;
                else if (run) {
                    runs.push(run / 10);
                    run = 0;
                }
            }
            for (const r of runs) {
                expect(r).toBeGreaterThanOrEqual(GULLS.flap.seconds[0] - 0.11);
                expect(r).toBeLessThanOrEqual(GULLS.flap.seconds[1] + 0.11);
            }
        }
    });

    test('at a gull’s rate, the hand a moment behind the arm, and eased in and out of the glide', () => {
        const g = flock()[1];
        // The first long burst.
        let t0 = 0;
        while (!(flapping(g, t0) && flapping(g, t0)[1] > 1.3)) t0 += 0.05;
        const [, length] = flapping(g, t0);
        const fps = 120;
        const burst = poses(g, length, fps, t0 + 0.001);
        // Strokes: the arm's upward crossings of its glide angle.
        let ups = 0;
        for (let i = 1; i < burst.length; i++) if (burst[i - 1].arm < GLIDE.arm && burst[i].arm >= GLIDE.arm) ups++;
        expect(ups / length).toBeGreaterThan(GULLS.flap.hz * 0.6);
        expect(ups / length).toBeLessThan(GULLS.flap.hz * 1.4);
        expect(GULLS.flap.hz).toBeGreaterThan(2);
        expect(GULLS.flap.hz).toBeLessThan(4);
        // The hand peaks after the arm.
        const peak = (key) => {
            let best = 0;
            for (let i = 1; i < fps / GULLS.flap.hz; i++) if (burst[i + Math.round(0.3 * fps)][key] > burst[best + Math.round(0.3 * fps)][key]) best = i;
            return best;
        };
        expect(peak('hand')).toBeGreaterThan(peak('arm'));
        // No jump at either end of the burst, at 60 frames a second.
        const edges = [...poses(g, 0.5, 60, t0 - 0.25), ...poses(g, 0.5, 60, t0 + length - 0.25)];
        for (let i = 1; i < 30; i++) expect(Math.abs(edges[i].arm - edges[i - 1].arm)).toBeLessThan(0.15);
    });
});

describe('the flock as triangles', () => {
    test('every gull drawn larger than life, whole, its normals unit length', () => {
        const shape = gullShape();
        const all = flock().map((g) => gullPose(g, 42));
        const out = new Float32Array(all.length * shape.length * 9);
        const normals = new Float32Array(out.length);
        expect(flockTriangles(all, -195, out, normals, shape)).toBe(out.length);
        for (let i = 0; i < out.length; i++) expect(Number.isFinite(out[i])).toBe(true);
        for (let i = 0; i < normals.length; i += 3) expect(Math.hypot(normals[i], normals[i + 1], normals[i + 2])).toBeCloseTo(1, 5);
        // A gull's span at GULLS.scale times its 1.44 m.
        const one = new Float32Array(shape.length * 9);
        flockTriangles([{ ...all[0], yaw: 0, pitch: 0, bank: 0, arm: 0, hand: 0 }], 0, one, new Float32Array(one.length), shape);
        const xs = [];
        for (let i = 0; i < one.length; i += 3) xs.push(one[i]);
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1.44 * GULLS.scale, 2);
        expect(GULLS.scale).toBeGreaterThan(1.5);
        // The two wings mirror each other.
        expect(shape.filter(([part]) => part.endsWith('left'))).toHaveLength(shape.filter(([part]) => part.endsWith('right')).length);
    });
});
