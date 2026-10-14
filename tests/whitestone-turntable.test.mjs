// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The camera on the house (www/whitestone/js/turntable.js): the frame holds
 * the turntable and the house on every screen shape and at every tilt and
 * zoom, a phone's frame sits above its bottom sheet, the house turns (the
 * camera never orbits), a released drag carries on and slows, the house
 * drifts only when left alone, the arrival eases in, and opening a floor
 * turns its open front to the visitor. Checked against the real three.js
 * where a projection says more than arithmetic.
 */
import { loadRealThree } from './helpers/real-three.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import {
    smoothstep, turnPoint, frameFor, subjectPoints, aimFor, fitDistance, framePose, createTurntable, frameHeight
} from '../www/whitestone/js/turntable.js';

const V = CONFIG.view;
const T = CONFIG.stage.turntable;
const ASPECTS = [21 / 9, 16 / 10, 4 / 3, 1, 0.75, 390 / 844, 0.45];
const HEIGHTS = [0.4, 0.9, 1.6];

describe('the frame (pure)', () => {
    test('eased: still at both ends, half way at the middle, and clamped', () => {
        expect(smoothstep(0)).toBe(0);
        expect(smoothstep(1)).toBe(1);
        expect(smoothstep(0.5)).toBeCloseTo(0.5, 12);
        expect(smoothstep(-2)).toBe(0);
        expect(smoothstep(3)).toBe(1);
        expect(smoothstep(0.05)).toBeLessThan(0.05);
    });

    test('an upright screen is tall, everything else wide', () => {
        expect(frameFor(390 / 844, V)).toBe(V.tall);
        expect(frameFor(0.99, V)).toBe(V.tall);
        expect(frameFor(1, V)).toBe(V.wide);
        expect(frameFor(16 / 10, V)).toBe(V.wide);
        expect(frameFor(0, V)).toBe(V.wide);
    });

    test("each frame's share of the screen stays on the screen, shifted as it says", () => {
        for (const f of [V.wide, V.tall]) {
            for (let i = 0; i < 2; i++) {
                const middle = 0.5 - f.shift[i];
                expect(middle - f.use[i] / 2).toBeGreaterThanOrEqual(0);
                expect(middle + f.use[i] / 2).toBeLessThanOrEqual(1);
            }
        }
        // A phone's subject sits in the top part, above the bottom sheet.
        expect(0.5 - V.tall.shift[1] + V.tall.use[1] / 2).toBeLessThanOrEqual(0.55);
        // A wide screen's sits left of center, for Maya and the panel.
        expect(V.wide.shift[0]).toBeGreaterThan(0);
    });

    test('the subject is the turntable at its foot and top, and a ring at the house\'s height', () => {
        const pts = subjectPoints(T, 1, 8);
        expect(pts).toHaveLength(24);
        const ys = [...new Set(pts.map((p) => +p[1].toFixed(9)))].sort((a, b) => a - b);
        expect(ys).toEqual([0, T.height, T.height + 1]);
        for (const p of pts) expect(Math.hypot(p[0], p[2])).toBeCloseTo(T.radius, 9);
        expect(aimFor(T, 1)).toEqual([0, (T.height + 1) / 2, 0]);
        expect(subjectPoints(T, -1, 4).every((p) => p[1] <= T.height)).toBe(true);
    });

    test('the fit is exact: every point inside, and at least one on the edge', () => {
        const pts = subjectPoints(T, 0.9);
        const aim = aimFor(T, 0.9);
        const back = [0, Math.sin(0.4), Math.cos(0.4)];
        const d = fitDistance(pts, aim, back, 0.3, 0.2);
        const right = [1, 0, 0];
        const up = [0, Math.cos(0.4), -Math.sin(0.4)];
        let worst = 0;
        for (const p of pts) {
            const q = p.map((v, i) => v - aim[i]);
            const ahead = d - (q[0] * back[0] + q[1] * back[1] + q[2] * back[2]);
            expect(ahead).toBeGreaterThan(0);
            const x = Math.abs(q[0] * right[0] + q[1] * right[1] + q[2] * right[2]) / ahead / 0.3;
            const y = Math.abs(q[0] * up[0] + q[1] * up[1] + q[2] * up[2]) / ahead / 0.2;
            expect(x).toBeLessThanOrEqual(1 + 1e-9);
            expect(y).toBeLessThanOrEqual(1 + 1e-9);
            worst = Math.max(worst, x, y);
        }
        expect(worst).toBeCloseTo(1, 9);
    });

    test('a pose looks at the subject from above and in front, its lens and shift the frame\'s', () => {
        for (const aspect of ASPECTS) {
            const p = framePose(aspect, 0.9, { tilt: V.tilt.start, zoom: 1 }, CONFIG);
            const f = frameFor(aspect, V);
            expect(p.fov).toBe(f.fov);
            expect(p.offset).toEqual(f.shift);
            expect(p.eye[0]).toBeCloseTo(0, 12);
            expect(p.eye[2]).toBeGreaterThan(T.radius);
            expect(p.eye[1]).toBeGreaterThan(p.aim[1]);
            const d = Math.hypot(...p.eye.map((v, i) => v - p.aim[i]));
            expect(d).toBeCloseTo(p.distance, 9);
            expect(Math.asin((p.eye[1] - p.aim[1]) / d)).toBeCloseTo(V.tilt.start, 9);
        }
    });

    test('zoom and tilt stay within their limits, however asked', () => {
        const base = framePose(16 / 10, 0.9, { tilt: V.tilt.start, zoom: 1 }, CONFIG).distance;
        expect(framePose(16 / 10, 0.9, { tilt: V.tilt.start, zoom: 99 }, CONFIG).distance).toBeCloseTo(base * V.zoom.max, 9);
        expect(framePose(16 / 10, 0.9, { tilt: V.tilt.start, zoom: 0 }, CONFIG).distance).toBeCloseTo(base * V.zoom.min, 9);
        const steep = framePose(16 / 10, 0.9, { tilt: 3, zoom: 1 }, CONFIG);
        const d = steep.distance;
        expect(Math.asin((steep.eye[1] - steep.aim[1]) / d)).toBeCloseTo(V.tilt.max, 9);
        expect(V.tilt.min).toBeGreaterThan(0);
        expect(V.tilt.open).toBeGreaterThanOrEqual(V.tilt.min);
        expect(V.tilt.open).toBeLessThanOrEqual(V.tilt.start);
    });

    test('a point is turned as three turns it', () => {
        const p = [0.4, 0.2, -0.3];
        expect(turnPoint(p, 0)).toEqual(p);
        const q = turnPoint(p, Math.PI / 2);
        expect(q[0]).toBeCloseTo(-0.3, 12);
        expect(q[1]).toBe(0.2);
        expect(q[2]).toBeCloseTo(-0.4, 12);
    });
});

describe('the frame with the real three.js', () => {
    let REAL;
    beforeAll(async () => {
        REAL = await loadRealThree();
    });

    /** Where a world point lands on a screen of this aspect, in shares of
     *  its width and height from the top left, through a camera set as
     *  main.js sets it (applyPose). */
    function onScreen(pose, aspect, point) {
        const W = 1000 * aspect;
        const H = 1000;
        const cam = new REAL.PerspectiveCamera(pose.fov, aspect, 0.05, 120);
        cam.position.set(...pose.eye);
        cam.setViewOffset(W, H, pose.offset[0] * W, pose.offset[1] * H, W, H);
        cam.updateProjectionMatrix();
        cam.lookAt(...pose.aim);
        cam.updateMatrixWorld();
        const v = new REAL.Vector3(...point).project(cam);
        return [(v.x + 1) / 2, (1 - v.y) / 2, v.z];
    }

    test.each(ASPECTS)('at %f the turntable and the house fill their share of the screen and no more', (aspect) => {
        for (const height of HEIGHTS) {
            for (const tilt of [V.tilt.min, V.tilt.start, V.tilt.max]) {
                const pose = framePose(aspect, height, { tilt, zoom: 1 }, CONFIG);
                const f = frameFor(aspect, V);
                const pts = subjectPoints(T, frameHeight(height, f, CONFIG)).map((p) => onScreen(pose, aspect, p));
                const xs = pts.map((p) => p[0]);
                const ys = pts.map((p) => p[1]);
                for (const p of pts) expect(p[2]).toBeLessThan(1);
                const lo = (i) => 0.5 - f.shift[i] - f.use[i] / 2 - 1e-6;
                const hi = (i) => 0.5 - f.shift[i] + f.use[i] / 2 + 1e-6;
                expect(Math.min(...xs)).toBeGreaterThanOrEqual(lo(0));
                expect(Math.max(...xs)).toBeLessThanOrEqual(hi(0));
                expect(Math.min(...ys)).toBeGreaterThanOrEqual(lo(1));
                expect(Math.max(...ys)).toBeLessThanOrEqual(hi(1));
                // Fitted and centered, not lost in the middle or pushed to
                // one edge: it fills its share one way or the other.
                const fill = Math.max((Math.max(...xs) - Math.min(...xs)) / f.use[0], (Math.max(...ys) - Math.min(...ys)) / f.use[1]);
                expect(fill).toBeGreaterThan(0.99);
            }
        }
    });

    test('a point on the turntable turned by yaw lands where three puts it', () => {
        const group = new REAL.Group();
        const child = new REAL.Object3D();
        child.position.set(0.4, 0.5, -0.3);
        group.add(child);
        for (const yaw of [-2, -0.55, 0, 1.1, 3]) {
            group.rotation.y = yaw;
            group.updateMatrixWorld(true);
            const w = new REAL.Vector3().setFromMatrixPosition(child.matrixWorld);
            const t = turnPoint([0.4, 0.5, -0.3], yaw);
            expect(t[0]).toBeCloseTo(w.x, 9);
            expect(t[1]).toBeCloseTo(w.y, 9);
            expect(t[2]).toBeCloseTo(w.z, 9);
        }
    });
});

describe('the controller', () => {
    const steps = (tt, seconds, opts = {}, dt = 1 / 60) => {
        let moved = 0;
        for (let t = 0; t < seconds - 1e-9; t += dt) if (tt.step(dt, opts)) moved++;
        return moved;
    };

    test('it starts at the three-quarter view, level-ish, framed', () => {
        const tt = createTurntable(CONFIG);
        expect(tt.yaw).toBe(V.yaw.start);
        expect(tt.tilt).toBe(V.tilt.start);
        expect(tt.zoom).toBe(1);
        expect(tt.pose(16 / 10)).toEqual(framePose(16 / 10, 0, { tilt: V.tilt.start, zoom: 1 }, CONFIG));
    });

    test('a sideways drag turns the house, an upright one tilts the view, and a small screen turns as far', () => {
        const tt = createTurntable(CONFIG);
        tt.drag(100, 0, 800);
        expect(tt.yaw).toBeCloseTo(V.yaw.start + 100 * V.turn.perPixel, 12);
        expect(tt.tilt).toBe(V.tilt.start);
        tt.drag(0, 20, 800);
        expect(tt.tilt).toBeCloseTo(V.tilt.start + 20 * V.turn.tiltPerPixel, 12);
        tt.drag(0, 100000, 800);
        expect(tt.tilt).toBe(V.tilt.max);
        tt.drag(0, -100000, 800);
        expect(tt.tilt).toBe(V.tilt.min);
        // Half the screen, half the pixels: the same turn.
        const a = createTurntable(CONFIG);
        const b = createTurntable(CONFIG);
        a.drag(200, 0, 800);
        b.drag(100, 0, 400);
        expect(a.yaw).toBeCloseTo(b.yaw, 12);
    });

    test('a released drag carries on and slows to a stop, unless the finger rested first', () => {
        const tt = createTurntable(CONFIG);
        tt.drag(30, 0, 800, 1 / 60);
        // Held: nothing moves on its own.
        const held = tt.yaw;
        expect(tt.step(1 / 60)).toBe(false);
        expect(tt.yaw).toBe(held);
        tt.release(0);
        expect(tt.step(1 / 60)).toBe(true);
        expect(tt.yaw).toBeGreaterThan(held);
        steps(tt, 3);
        const stopped = tt.yaw;
        expect(tt.step(1 / 60)).toBe(false);
        expect(tt.yaw).toBe(stopped);
        // It went on less far than a second at the drag's pace.
        expect(stopped - held).toBeLessThan(30 * V.turn.perPixel * 60);

        const rest = createTurntable(CONFIG);
        rest.drag(30, 0, 800, 1 / 60);
        rest.release(V.turn.hold + 0.05);
        const at = rest.yaw;
        expect(rest.step(1 / 60)).toBe(false);
        expect(rest.yaw).toBe(at);
    });

    test('a fling is capped, and none carries on under reduced motion or behind a card', () => {
        const tt = createTurntable(CONFIG);
        tt.drag(5000, 0, 800, 1 / 120);
        tt.release(0);
        const from = tt.yaw;
        tt.step(0.01);
        expect(tt.yaw - from).toBeLessThanOrEqual(V.turn.maxSpeed * 0.01 + 1e-12);
        for (const opts of [{ reducedMotion: true }, { locked: true }]) {
            const t2 = createTurntable(CONFIG);
            t2.drag(30, 0, 800);
            t2.release(0);
            const y = t2.yaw;
            t2.step(1 / 60, opts);
            expect(t2.yaw).toBe(y);
            expect(t2.step(1 / 60)).toBe(false);
        }
    });

    test('left alone it drifts round slowly, and stops at a touch', () => {
        const tt = createTurntable(CONFIG);
        expect(steps(tt, V.idle.after - 0.1)).toBe(0);
        expect(tt.drifting).toBe(false);
        const y = tt.yaw;
        steps(tt, 1);
        expect(tt.drifting).toBe(true);
        expect(tt.yaw).toBeGreaterThan(y);
        expect(tt.yaw - y).toBeLessThan(V.idle.speed * 1.01);
        tt.touch();
        expect(tt.drifting).toBe(false);
        const z = tt.yaw;
        expect(tt.step(1 / 60)).toBe(false);
        expect(tt.yaw).toBe(z);
    });

    test.each([
        ['reduced motion', { reducedMotion: true }],
        ['a card open', { locked: true }],
        ['a floor open', { drift: false }]
    ])('it never drifts with %s', (_name, opts) => {
        const tt = createTurntable(CONFIG);
        const y = tt.yaw;
        expect(steps(tt, V.idle.after + 5, opts)).toBe(0);
        expect(tt.yaw).toBe(y);
        expect(tt.drifting).toBe(false);
    });

    test('the wheel, a pinch or a key zooms within the limits', () => {
        const tt = createTurntable(CONFIG);
        expect(tt.zoomBy(-0.5)).toBeCloseTo(Math.pow(2, -0.5), 12);
        expect(tt.zoomBy(-50)).toBe(V.zoom.min);
        expect(tt.zoomBy(50)).toBe(V.zoom.max);
        const near = createTurntable(CONFIG);
        near.zoomBy(-0.5);
        const far = createTurntable(CONFIG);
        far.zoomBy(0.4);
        expect(near.pose(16 / 10).distance).toBeLessThan(far.pose(16 / 10).distance);
    });

    test('the arrival starts farther out and eases in, and a touch ends it', () => {
        const tt = createTurntable(CONFIG);
        tt.setHeight(0.9, true);
        const framed = tt.pose(16 / 10).distance;
        tt.arrive();
        expect(tt.arriving).toBe(true);
        expect(tt.pose(16 / 10).distance).toBeCloseTo(framed * V.arrival.from, 9);
        const seen = [];
        for (let t = 0; t < V.arrival.seconds + 0.1; t += 0.1) {
            tt.step(0.1);
            seen.push(tt.pose(16 / 10).distance);
        }
        for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThanOrEqual(seen[i - 1] + 1e-12);
        expect(tt.arriving).toBe(false);
        expect(tt.pose(16 / 10).distance).toBeCloseTo(framed, 9);
        // Gentle at the start: the first tenth of the time covers less than a
        // tenth of the way.
        const again = createTurntable(CONFIG);
        again.setHeight(0.9, true);
        again.arrive();
        again.step(V.arrival.seconds / 10);
        const gone = (framed * V.arrival.from - again.pose(16 / 10).distance) / (framed * (V.arrival.from - 1));
        expect(gone).toBeLessThan(0.1);
        again.touch();
        expect(again.arriving).toBe(false);
        expect(again.pose(16 / 10).distance).toBeCloseTo(framed, 9);
        // Reduced motion: no arrival at all.
        const cut = createTurntable(CONFIG);
        cut.arrive();
        cut.step(1 / 60, { reducedMotion: true });
        expect(cut.arriving).toBe(false);
    });

    test('a taller house is framed farther back, eased to rather than jumped', () => {
        const tt = createTurntable(CONFIG);
        // Taller than Maya, who sets the least height of a wide frame.
        tt.setHeight(1.5, true);
        const low = tt.pose(16 / 10).distance;
        tt.setHeight(2.2);
        expect(tt.pose(16 / 10).distance).toBeCloseTo(low, 9);
        tt.step(V.subject.ease / 2);
        const mid = tt.pose(16 / 10).distance;
        expect(mid).toBeGreaterThan(low);
        steps(tt, V.subject.ease);
        expect(tt.height).toBeCloseTo(2.2, 12);
        expect(tt.pose(16 / 10).distance).toBeGreaterThan(mid);
        // At once when asked, or under reduced motion.
        tt.setHeight(0.5);
        tt.step(1 / 60, { reducedMotion: true });
        expect(tt.height).toBe(0.5);
    });

    test("a wide frame is never shorter than Maya, so her head is never cut off; a phone's is the house's own", () => {
        const least = CONFIG.cast.maya.height - T.height;
        expect(frameHeight(0.3, V.wide, CONFIG)).toBeCloseTo(least, 12);
        expect(frameHeight(least + 0.4, V.wide, CONFIG)).toBeCloseTo(least + 0.4, 12);
        expect(frameHeight(0.3, V.tall, CONFIG)).toBe(0.3);
        expect(frameHeight(-1, V.tall, CONFIG)).toBe(0);
        expect(framePose(16 / 10, 0.3, { tilt: V.tilt.start, zoom: 1 }, CONFIG).host).toBe(true);
        expect(framePose(0.45, 0.3, { tilt: V.tilt.start, zoom: 1 }, CONFIG).host).toBe(false);
    });

    test('opening a floor turns the front to the visitor the shorter way, and lowers a high view', () => {
        const tt = createTurntable(CONFIG);
        tt.turnBy(Math.PI * 2 * 3 - 0.4);   // three turns round, less a little
        tt.tiltBy(1);
        tt.faceFront(V.turn.face);
        steps(tt, V.turn.face + 0.1);
        expect(tt.yaw).toBeCloseTo(Math.PI * 2 * 3, 9);
        expect(tt.tilt).toBeCloseTo(V.tilt.open, 9);
        // A view already low enough stays.
        const low = createTurntable(CONFIG);
        low.tiltBy(-1);
        low.faceFront(0);
        expect(low.tilt).toBe(V.tilt.min);
        expect(low.yaw).toBeCloseTo(0, 12);
        // A drag on the way takes over.
        const busy = createTurntable(CONFIG);
        busy.faceFront(V.turn.face);
        busy.step(0.1);
        busy.drag(50, 0, 800);
        const y = busy.yaw;
        busy.release(1);
        steps(busy, 1);
        expect(busy.yaw).toBe(y);
    });

    test('a turn from the keys stops any carry-on', () => {
        const tt = createTurntable(CONFIG);
        tt.drag(30, 0, 800);
        tt.release(0);
        tt.turnBy(0.3);
        const y = tt.yaw;
        expect(tt.step(1 / 60)).toBe(false);
        expect(tt.yaw).toBe(y);
    });
});
