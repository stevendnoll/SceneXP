// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The leaf lab's leaves (www/leaves/js/sim.js), measured.
 *
 * The sim is pure, so these run the real thing on small yards: a leaf
 * dropped in still air falls at a leaf's speed and goes to sleep where it
 * lands, the jet's air is strongest down its middle, blowing moves leaves
 * downwind and leaves the rest alone, a pile keeps its angle of repose, a
 * buried leaf waits for the ones above it, and the fence stops what is below
 * its top rail. Also the pure helpers around it: the person's walk
 * (blower.js), the camera's framing (view.js), the lab's settings (lab.js)
 * and the leaf card and outlines (leafmesh.js).
 *
 * THE YARDS ARE SMALL ON PURPOSE. Jest's sandbox runs hot math many times
 * slower than a browser, and every rule here holds at any count.
 */
import { installThree } from './helpers/three-stub.mjs';
import { loadRealThree } from './helpers/real-three.mjs';

installThree();
const S = await import('../www/leaves/js/sim.js');
const { LEAVES_CONFIG } = await import('../www/leaves/js/config.js');
const V = await import('../www/leaves/js/view.js');
const Lab = await import('../www/leaves/js/lab.js');
const Op = await import('../www/leaves/js/blower.js');
const M = await import('../www/leaves/js/leafmesh.js');

const C = LEAVES_CONFIG;

/** A yard of `count` leaves, scattered. */
function yard(count = 1500) {
    const sim = S.createSim(count, C);
    const out = S.scatterLeaves(sim, C);
    return { sim, ...out };
}

/** Step the sim for `seconds` at 60 fps with a fixed jet (or still air). */
function run(sim, seconds, jet = null) {
    for (let f = 0; f < Math.round(seconds * 60); f++) S.stepSim(sim, 1 / 60, jet);
}

const inside = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

describe('scattering the leaves', () => {
    test('every leaf starts asleep on our lawn, none on the tarp, all drawn', () => {
        const { sim, look } = yard(2000);
        expect(sim.activeCount).toBe(0);
        for (let i = 0; i < sim.count; i++) {
            expect(sim.awake[i]).toBe(0);
            expect(inside(C.yard.lawn, sim.px[i], sim.pz[i])).toBe(true);
            expect(inside(C.yard.tarp, sim.px[i], sim.pz[i])).toBe(false);
            expect(sim.bucketOf[i]).toBeGreaterThanOrEqual(0);
        }
        expect(look).toHaveLength(sim.count * 6);
        expect(sim.pose.every(Number.isFinite)).toBe(true);
        // Every leaf was written, so the first upload covers them all.
        expect(S.dirtyRange(sim)).toEqual({ from: 0, to: sim.count });
    });

    test('the same seed scatters the same yard', () => {
        const a = yard(800).sim;
        const b = yard(800).sim;
        expect(Array.from(a.px)).toEqual(Array.from(b.px));
        expect(Array.from(a.pose)).toEqual(Array.from(b.pose));
    });

    test('fewer leaves are bigger leaves, within the clamp', () => {
        const area = S.areaOf(C.yard.lawn);
        const L = C.leaves;
        expect(S.leafSize(12000, area, L)).toBeGreaterThan(S.leafSize(24000, area, L));
        expect(S.leafSize(10, area, L)).toBe(L.maxSize);
        expect(S.leafSize(1e7, area, L)).toBe(L.minSize);
        // Between the clamps, the leaves' total area is coverage times the lawn's.
        const s = S.leafSize(24000, area, L);
        expect((24000 * s * s * L.fill) / area).toBeCloseTo(L.coverage, 6);
    });

    test('leaves are numbered so neighbors in the yard are neighbors in the buffer', () => {
        const { sim } = yard(3000);
        // Walking the buffer in order, the next leaf is usually close by: the
        // mean step is far shorter than for leaves numbered at random.
        let step = 0;
        for (let i = 1; i < sim.count; i++) step += Math.hypot(sim.px[i] - sim.px[i - 1], sim.pz[i] - sim.pz[i - 1]);
        expect(step / (sim.count - 1)).toBeLessThan(1.5);
        expect(S.morton(1, 0)).toBe(1);
        expect(S.morton(0, 1)).toBe(2);
        expect(S.morton(3, 3)).toBe(15);
    });

    test('colors are converted to linear light for the shader', () => {
        expect(S.srgbToLinear(0)).toBe(0);
        expect(S.srgbToLinear(1)).toBeCloseTo(1, 9);
        expect(S.srgbToLinear(0.5)).toBeCloseTo(0.214, 3);
    });
});

describe('a single leaf in still air', () => {
    test('falls at about a real leaf\'s speed, swings as it falls, and sleeps where it lands', () => {
        const { sim } = yard(400);
        const i = 7;
        const x = 2;
        const z = 1;
        S.dropLeaf(sim, i, x, 3, z);
        expect(sim.awake[i]).toBe(1);
        let fastest = 0;
        let wandered = 0;
        for (let f = 0; f < 60 * 6 && sim.awake[i]; f++) {
            S.stepSim(sim, 1 / 60, null);
            fastest = Math.max(fastest, -sim.vy[i]);
            wandered = Math.max(wandered, Math.hypot(sim.px[i] - x, sim.pz[i] - z));
        }
        // Terminal speed is sqrt(gravity / drag), give or take the leaf's own drag.
        const terminal = Math.sqrt(C.physics.gravity / C.physics.drag);
        expect(fastest).toBeGreaterThan(terminal * 0.7);
        expect(fastest).toBeLessThan(terminal * 1.35);
        // It drifted with its swing, but came down near where it was let go.
        expect(wandered).toBeGreaterThan(0.02);
        expect(wandered).toBeLessThan(1.2);
        expect(sim.awake[i]).toBe(0);
        expect(sim.py[i]).toBeLessThan(0.3);
        expect(sim.activeCount).toBe(0);
    });

    // FAILED BEFORE THE FIX OF 2026-10-06. A leaf left a few millimeters above
    // the surface counted as on the ground (so it felt no gravity) but not as
    // landed (so it could never sleep), and hung there awake forever. Every
    // leaf the blower woke and let go of ended up that way.
    test('a leaf resting just above the surface still goes back to sleep', () => {
        const { sim } = yard(400);
        const i = 3;
        const top = S.surfaceAt(sim, 2, 1);
        S.dropLeaf(sim, i, 2, top + 0.0045, 1);
        run(sim, 1);
        expect(sim.awake[i]).toBe(0);
        expect(sim.activeCount).toBe(0);
    });

    test('waking a leaf takes its volume out of the pile, and sleeping puts it back', () => {
        const { sim } = yard(600);
        const before = S.pileVolume(sim);
        const i = 100;
        const own = sim.size[i] * sim.size[i] * C.pile.loft;
        S.wake(sim, i);
        expect(S.pileVolume(sim)).toBeCloseTo(before - own, 6);
        expect(sim.bucketOf[i]).toBe(-1);
        run(sim, 1.5);
        expect(sim.awake[i]).toBe(0);
        expect(S.pileVolume(sim)).toBeCloseTo(before, 6);
    });
});

describe('the blower\'s air', () => {
    const jet = S.makeJet(C.blower, 0, 2, 0, -1, true);
    const out = new Float32Array(3);
    const at = (along, lateral) => S.airAt(jet, jet.ix + lateral, 0.01, jet.iz - along, 0, out);

    test('lands ahead of the person, off to their right hand', () => {
        // Facing -z (toward the house), the right hand is toward +x.
        expect(jet.nx).toBeCloseTo(C.blower.side, 9);
        expect(jet.iz).toBeLessThan(jet.nz);
        expect(jet.iz).toBeGreaterThan(2 - C.blower.reach - 2);
    });

    test('is strongest down the middle, fades to the sides and with distance, and is still behind', () => {
        expect(at(1, 0)).toBeGreaterThan(at(1, 0.8));
        expect(at(1, 0.8)).toBeGreaterThan(at(1, 2));
        expect(at(0.5, 0)).toBeGreaterThan(at(3, 0));
        expect(at(3, 0)).toBeGreaterThan(at(6, 0));
        // It still moves leaves a few meters out, and none past its range.
        expect(at(3, 0)).toBeGreaterThan(C.physics.wakeSpeed);
        expect(at(C.blower.range + 0.5, 0)).toBe(0);
        // Nothing behind the person.
        expect(S.airAt(jet, 0, 0.01, 4, 0, out)).toBe(0);
    });

    test('blows away from the person, and kicks upward where it lands', () => {
        at(0.6, 0);
        expect(out[2]).toBeLessThan(0);
        expect(out[1]).toBeGreaterThan(0);
        // Fanning out: to the right of the line it bends right.
        at(2, 1);
        expect(out[0]).toBeGreaterThan(0);
    });

    test('a switched-off blower moves nothing', () => {
        const off = S.makeJet(C.blower, 0, 2, 0, -1, false);
        expect(S.airAt(off, off.ix, 0.01, off.iz - 1, 0, out)).toBe(0);
        expect(S.airAt(null, 0, 0, 0, 0, out)).toBe(0);
    });

    test('blowing moves leaves downwind, leaves the yard behind alone, and they settle', () => {
        const { sim } = yard(3000);
        const x0 = Float32Array.from(sim.px);
        const z0 = Float32Array.from(sim.pz);
        const blowing = S.makeJet(C.blower, 0, 4, 0, -1, true);
        run(sim, 1.5, blowing);
        expect(sim.stats.woken).toBeGreaterThan(30);
        run(sim, 4, null);
        expect(sim.activeCount).toBe(0);
        let moved = 0;
        let downwind = 0;
        let behind = 0;
        for (let i = 0; i < sim.count; i++) {
            const dz = sim.pz[i] - z0[i];
            const d = Math.hypot(sim.px[i] - x0[i], dz);
            if (d < 0.2) continue;
            moved++;
            if (dz < 0) downwind++;
            if (z0[i] > 4.5) behind++;
        }
        expect(moved).toBeGreaterThan(20);
        expect(downwind / moved).toBeGreaterThan(0.9);
        expect(behind).toBe(0);
        expect(sim.pose.every(Number.isFinite)).toBe(true);
    });

    test('some leaves are thrown up into the air, and none fly away', () => {
        const { sim } = yard(3000);
        let highest = 0;
        for (let f = 0; f < 90; f++) {
            const jetNow = S.makeJet(C.blower, 3 - f * 0.03, 3, -0.6, -0.8, true);
            S.stepSim(sim, 1 / 60, jetNow);
            for (let a = 0; a < sim.activeCount; a++) {
                const i = sim.active[a];
                highest = Math.max(highest, sim.py[i] - S.surfaceAt(sim, sim.px[i], sim.pz[i]));
            }
        }
        expect(highest).toBeGreaterThan(0.3);
        expect(highest).toBeLessThan(4);
    });
});

describe('piles', () => {
    test('a heap dropped on one spot keeps its angle of repose', () => {
        const sim = S.createSim(600, C);
        S.scatterLeaves(sim, C);
        // Wake every leaf and lay them all down on the same spot.
        for (let i = 0; i < sim.count; i++) S.wake(sim, i);
        sim.activeCount = 0;
        sim.activeAt.fill(-1);
        for (let i = 0; i < sim.count; i++) S.layDown(sim, i, 0.05, 0.05);
        // The deepest cell, and how steep the pile is anywhere: never steeper
        // than the repose slope, give or take the last leaf's own deposit.
        let top = 0;
        let steepest = 0;
        const deposit = (C.pile.loft * 4 * Math.max(...sim.size) ** 2) / (16 * sim.cell * sim.cell);
        for (let z = 1; z < sim.nz - 1; z++) {
            for (let x = 1; x < sim.nx - 1; x++) {
                const c = z * sim.nx + x;
                top = Math.max(top, sim.height[c]);
                steepest = Math.max(steepest, sim.height[c] - sim.height[c + 1], sim.height[c] - sim.height[c + sim.nx]);
            }
        }
        expect(top).toBeGreaterThan(0.1);
        expect(steepest).toBeLessThanOrEqual(sim.maxStep + deposit * 1.01);
        // And it really is a heap: wider than one cell.
        let covered = 0;
        for (const h of sim.height) if (h > 0.02) covered++;
        expect(covered).toBeGreaterThan(9);
    });

    test('a leaf buried in a pile waits for the ones above it', () => {
        const sim = S.createSim(400, C);
        S.scatterLeaves(sim, C);
        for (let i = 0; i < sim.count; i++) S.wake(sim, i);
        sim.activeCount = 0;
        sim.activeAt.fill(-1);
        // A stack of 60 on one spot (the rest far away), bottom leaf first.
        for (let i = 0; i < 60; i++) S.layDown(sim, i, 4.05, 3.05);
        for (let i = 60; i < sim.count; i++) S.layDown(sim, i, -8 + (i % 30) * 0.3, -5 + Math.floor(i / 30) * 0.3);
        // FAILED BEFORE THE FIX OF 2026-10-06, when each leaf woken uncovered
        // the next within the same frame and all sixty went at once.
        const blow = S.makeJet(C.blower, 4.05 - C.blower.side, 5.2, 0, -1, true);
        S.stepSim(sim, 1 / 60, blow);
        const woke = [];
        for (let i = 0; i < 60; i++) if (sim.awake[i]) woke.push(i);
        expect(woke.length).toBeGreaterThan(0);
        expect(woke.length).toBeLessThan(60);
        // The bottom leaf is still there.
        expect(sim.awake[0]).toBe(0);
    });
});

describe('walls', () => {
    test('the picket fence stops a leaf below its top rail, and one above sails over', () => {
        const { sim } = yard(400);
        const fence = C.yard.walls.find((w) => w.axis === 'x' && w.at === 10);
        S.dropLeaf(sim, 1, 9.6, 0.3, 0);
        sim.vx[1] = 8;
        S.dropLeaf(sim, 2, 9.6, fence.height + 1.2, 1);
        sim.vx[2] = 8;
        sim.vy[2] = 2;
        run(sim, 3);
        expect(sim.px[1]).toBeLessThan(fence.at);
        expect(sim.px[2]).toBeGreaterThan(fence.at);
    });

    test('nothing leaves the yard\'s bounds', () => {
        const { sim } = yard(400);
        S.dropLeaf(sim, 5, -9.5, 0.5, 0);
        sim.vx[5] = -20;
        S.dropLeaf(sim, 6, 0, 0.5, 11.5);
        sim.vz[6] = 20;
        run(sim, 2);
        const b = C.yard.bounds;
        expect(sim.px[5]).toBeGreaterThanOrEqual(b.minX);
        expect(sim.pz[6]).toBeLessThanOrEqual(b.maxZ);
    });
});

describe('what gets uploaded', () => {
    test('only the leaves that moved are marked, and clearing empties the mark', () => {
        const { sim } = yard(500);
        S.clearDirty(sim);
        expect(S.dirtyRange(sim)).toBe(null);
        run(sim, 0.5);
        expect(S.dirtyRange(sim)).toBe(null);
        S.dropLeaf(sim, 40, 0, 1, 0);
        S.dropLeaf(sim, 90, 1, 1, 0);
        S.stepSim(sim, 1 / 60, null);
        expect(S.dirtyRange(sim)).toEqual({ from: 40, to: 91 });
    });

    test('a tumbling leaf is lifted by half its tip, so it rolls over the lawn', () => {
        const { sim } = yard(300);
        const i = 12;
        S.dropLeaf(sim, i, 0, 0.003, 0);
        sim.pitch[i] = Math.PI / 2;
        sim.roll[i] = 0;
        S.stepSim(sim, 1 / 90, null);
        const y = sim.pose[i * 6 + 1];
        expect(y - sim.py[i]).toBeGreaterThan(sim.size[i] * 0.4);
    });

    test('angles stay folded into one turn', () => {
        expect(S.wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI, 9);
        expect(S.wrapAngle(-0.5)).toBeCloseTo(-0.5, 12);
        expect(S.wrapAngle(7)).toBeCloseTo(7 - Math.PI * 2, 9);
    });
});

describe('the person with the blower', () => {
    const area = { minX: -9.5, maxX: 9.6, minZ: -5.4, maxZ: 9 };

    test('walks toward a pointed spot, stops short of it, and faces it', () => {
        const op = Op.createOperator(C.blower);
        const target = { mode: 'point', x: -4, z: -3 };
        for (let f = 0; f < 600; f++) Op.stepOperator(op, target, 1 / 60, C.blower, area);
        const gap = Math.hypot(target.x - op.x, target.z - op.z);
        expect(gap).toBeGreaterThan(C.blower.standoff - 0.05);
        expect(gap).toBeLessThan(C.blower.standoff + 0.3);
        const f = Op.facing(op.heading);
        expect((f.x * (target.x - op.x) + f.z * (target.z - op.z)) / gap).toBeGreaterThan(0.99);
        expect(op.speed).toBe(0);
    });

    test('a nearby spot turns them without walking them', () => {
        const op = Op.createOperator(C.blower);
        const start = { x: op.x, z: op.z };
        for (let f = 0; f < 60; f++) Op.stepOperator(op, { mode: 'point', x: op.x + 1, z: op.z }, 1 / 60, C.blower, area);
        expect(op.x).toBe(start.x);
        expect(Op.facing(op.heading).x).toBeCloseTo(1, 3);
    });

    test('the keys walk them at walking speed, and the yard\'s edge holds them', () => {
        const op = Op.createOperator(C.blower);
        Op.stepOperator(op, { mode: 'keys', x: 1, z: 0 }, 0.1, C.blower, area);
        expect(op.speed).toBeCloseTo(C.blower.walkSpeed, 6);
        for (let f = 0; f < 600; f++) Op.stepOperator(op, { mode: 'keys', x: 1, z: 0 }, 1 / 60, C.blower, area);
        expect(op.x).toBe(area.maxX);
        Op.stepOperator(op, null, 0.1, C.blower, area);
        expect(op.speed).toBe(0);
    });
});

describe('the camera', () => {
    const cam = C.camera;

    test('a phone held upright sees a narrower span than a landscape screen', () => {
        expect(V.spanFor(0.46, cam)).toBe(cam.narrowSpan);
        expect(V.spanFor(1.78, cam)).toBe(cam.wideSpan);
        expect(V.spanFor(0.9, cam)).toBeGreaterThan(cam.narrowSpan);
    });

    test('stands far enough back to fit the span across', () => {
        const aspect = 1.6;
        const d = V.distanceFor(20, aspect, cam.fovDegrees);
        const half = Math.atan(Math.tan((cam.fovDegrees * Math.PI) / 360) * aspect);
        expect(2 * d * Math.tan(half)).toBeCloseTo(20, 9);
    });

    test('follows the person on a narrow screen, but never past the lawn', () => {
        const lawn = C.yard.lawn;
        const near = V.cameraFor(0.46, cam, lawn, { x: 3, z: 2 });
        expect(near.target.x).toBe(3);
        const far = V.cameraFor(0.46, cam, lawn, { x: 40, z: 2 });
        expect(far.target.x).toBeLessThan(lawn.maxX);
        // A wide screen shows the whole lawn and hardly moves.
        const wide = V.cameraFor(1.78, cam, lawn, { x: 8, z: 2 });
        expect(Math.abs(wide.target.x)).toBeLessThan(1.5);
        expect(wide.position.y).toBeGreaterThan(0);
        expect(wide.position.z).toBeGreaterThan(wide.target.z);
    });

    test('a pointer ray meets the lawn, and one aimed at the sky does not', () => {
        expect(V.rayToGround({ x: 0, y: 10, z: 10 }, { x: 0, y: -1, z: -1 })).toEqual({ x: 0, z: 0 });
        expect(V.rayToGround({ x: 0, y: 10, z: 10 }, { x: 0, y: 0.1, z: -1 })).toBe(null);
        expect(V.ease(0, 10, 3, 100)).toBeCloseTo(10, 6);
        expect(V.ease(0, 10, 3, 0)).toBe(0);
    });
});

describe('the lab', () => {
    test('a QA host is this machine or the house network, never the public site', () => {
        expect(Lab.isQaHost({ hostname: 'localhost' })).toBe(true);
        expect(Lab.isQaHost({ hostname: '192.168.1.20' })).toBe(true);
        expect(Lab.isQaHost({ hostname: '10.0.0.4' })).toBe(true);
        expect(Lab.isQaHost({ hostname: '172.20.1.1' })).toBe(true);
        expect(Lab.isQaHost({ hostname: 'steves-mac.local' })).toBe(true);
        expect(Lab.isQaHost({ hostname: 'www.scenexp.com' })).toBe(false);
        expect(Lab.isQaHost({ hostname: '172.40.1.1' })).toBe(false);
        expect(Lab.isQaHost(null)).toBe(false);
    });

    test('the address picks the count and the shadows, within the config\'s range', () => {
        expect(Lab.labOptions('', C, false)).toEqual({ count: C.leaves.desktop, shadows: true, ratio: null });
        expect(Lab.labOptions('', C, true).count).toBe(C.leaves.mobile);
        expect(Lab.labOptions('?leaves=36000&shadows=0', C, true)).toEqual({ count: 36000, shadows: false, ratio: null });
        expect(Lab.labOptions('?leaves=5', C, false).count).toBe(C.leaves.minCount);
        expect(Lab.labOptions('?leaves=9999999', C, false).count).toBe(C.leaves.maxCount);
        expect(Lab.labOptions('?leaves=', C, false).count).toBe(C.leaves.desktop);
        expect(Lab.labOptions('?leaves=lots', C, false).count).toBe(C.leaves.desktop);
        expect(Lab.labOptions('?ratio=1', C, false).ratio).toBe(1);
        expect(Lab.labOptions('?ratio=9', C, false).ratio).toBe(null);
    });

    test('a lab button changes one setting and keeps the rest', () => {
        expect(Lab.labSearch('?leaves=12000&shadows=0', { leaves: 24000 })).toBe('?leaves=24000&shadows=0');
        expect(Lab.labSearch('', { shadows: 0 })).toBe('?shadows=0');
        expect(Lab.labSearch('?shadows=0', { shadows: null })).toBe('');
    });

    test('the readout says what was measured', () => {
        const lines = Lab.statsLines({
            fps: 59.94, frameMs: 16.7, simMs: 2.04, count: 24000, active: 812, uploaded: 9000,
            calls: 31, triangles: 120400, ratio: 2, shadows: true, cleared: 0.123, tarp: 450
        });
        expect(lines[0]).toBe('59.9 fps · frame 16.7 ms · sim 2.0 ms');
        expect(lines[1]).toBe('24k leaves · 812 moving · 9000 sent');
        expect(lines[2]).toBe('31 draws · 120k tris · ratio 2.00 · shadows on');
        expect(lines[3]).toBe('lawn 12% clear · 450 on the tarp');
        expect(Lab.shortCount(1500)).toBe('1.5k');
        expect(Lab.shortCount(800)).toBe('800');
        expect(Lab.fpsOf(30, 0.5)).toBe(60);
        expect(Lab.fpsOf(30, 0)).toBe(0);
    });
});

describe('the leaf card and its shader', () => {
    test('the card faces up on every triangle and cups along its middle column', () => {
        const g = M.leafGeometry();
        const p = (k) => [g.position[k * 3], g.position[k * 3 + 1], g.position[k * 3 + 2]];
        for (let t = 0; t < g.index.length; t += 3) {
            const [a, b, c] = [p(g.index[t]), p(g.index[t + 1]), p(g.index[t + 2])];
            const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
            // The cross product's y, the face normal's up component.
            expect(u[2] * v[0] - u[0] * v[2]).toBeGreaterThan(0);
        }
        expect(g.index).toHaveLength(12);
    });

    test('every outline stays inside its cell, closed round a leaf-sized area', () => {
        for (const kind of M.KINDS) {
            const pts = M.leafOutline(kind);
            let area = 0;
            pts.forEach(([x, y], i) => {
                expect(x).toBeGreaterThanOrEqual(0);
                expect(x).toBeLessThanOrEqual(1);
                expect(y).toBeGreaterThanOrEqual(0);
                expect(y).toBeLessThanOrEqual(1);
                const [nx, ny] = pts[(i + 1) % pts.length];
                area += x * ny - nx * y;
            });
            area = Math.abs(area) / 2;
            expect(area).toBeGreaterThan(0.1);
            expect(area).toBeLessThan(0.7);
        }
        expect(M.KINDS).toEqual(Object.keys(C.look.palettes));
    });

    test('the patch finds every chunk it replaces in three\'s Lambert and depth shaders', async () => {
        const THREE = await loadRealThree();
        const lambert = { vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} };
        const depth = { vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: THREE.ShaderLib.depth.fragmentShader, uniforms: {} };
        M.patchLeafShader(lambert, { lit: true, underside: 0.7 });
        M.patchLeafShader(depth, { lit: false });
        for (const chunk of ['#include <begin_vertex>', '#include <beginnormal_vertex>']) {
            expect(lambert.vertexShader).not.toContain(chunk);
        }
        expect(lambert.vertexShader).toContain('attribute vec4 iPos;');
        expect(lambert.vertexShader).toContain('vMapUv = (uv + vec2(');
        expect(lambert.fragmentShader).toContain('diffuseColor.rgb *= leafColor;');
        expect(lambert.uniforms.uUnderside.value).toBe(0.7);
        expect(depth.vertexShader).toContain('transformed = leafTurn * transformed + iPos.xyz;');
        expect(depth.vertexShader).not.toContain('#include <begin_vertex>');
        // The depth pass has no color, so its fragment shader is untouched.
        expect(depth.fragmentShader).toBe(THREE.ShaderLib.depth.fragmentShader);
    });
});
