// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The side yard behind our hedge (www/leaves/js/backyard.js), on the real
 * three.js. Steve's M6 QA, 2026-10-07: "Could we add more environment details
 * to the back left of the scene behind the row of hedges on the left?"
 *
 * All of it must be past the sim's ground (no leaf ever meets it), clear of
 * the houses, the hedge and the trees' trunks, standing on the ground, and,
 * the point of it, on screen when a visitor walks over to the hedge.
 */
import { loadRealThree } from './helpers/real-three.mjs';

const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');
const V = await import('../www/leaves/js/view.js');

let THREE;
let Bk;
beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    Bk = await import('../www/leaves/js/backyard.js');
});
afterAll(() => { delete globalThis.THREE; });

const Y = C.yard;

function pieces() {
    const { group } = Bk.buildBackyard(C);
    group.updateMatrixWorld(true);
    const out = [];
    group.traverse((o) => { if (o.isMesh) out.push({ o, box: new THREE.Box3().setFromObject(o, true) }); });
    return { group, out };
}

const overlaps = (box, r) => box.max.x > r.minX && box.min.x < r.maxX && box.max.z > r.minZ && box.min.z < r.maxZ;

test('all of it is past the sim\'s ground, behind the hedge or behind the houses', () => {
    const wall = Y.walls.find((w) => w.axis === 'x' && w.height >= 1.2);
    // The hedge as drawn: 0.9 m thick behind its wall, back along the
    // property line to `hedgeBack`.
    const hedge = { minX: wall.at - 0.9, maxX: wall.at, minZ: Y.hedgeBack, maxZ: Y.sidewalk.minZ };
    const { out } = pieces();
    expect(out.length).toBeGreaterThan(40);
    for (const { box } of out) {
        expect(box.max.x < Y.bounds.minX || box.max.z < Y.bounds.minZ).toBe(true);
        expect(overlaps(box, hedge)).toBe(false);
    }
});

test('clear of every house and every tree trunk, and standing on the ground', () => {
    const houses = [
        { minX: Y.house.minX, maxX: Y.house.maxX, minZ: Y.lawn.minZ - Y.house.setBack - Y.house.depth, maxZ: Y.lawn.minZ },
        ...Y.street.map((h) => ({ minX: h.minX, maxX: h.maxX, minZ: h.front - h.depth, maxZ: h.front }))
    ];
    const trunks = Y.trees.map((t) => ({ minX: t.x - t.trunk - 0.15, maxX: t.x + t.trunk + 0.15, minZ: t.z - t.trunk - 0.15, maxZ: t.z + t.trunk + 0.15 }));
    const { out } = pieces();
    for (const { box } of out) {
        for (const h of houses) expect(overlaps(box, h)).toBe(false);
        for (const t of trunks) expect(overlaps(box, t)).toBe(false);
        expect(box.min.y).toBeGreaterThan(-0.02);
        expect(box.max.y).toBeLessThan(4);
    }
});

test('a visitor who walks over to the hedge sees the shed, the beds, the fire pit and the patch', () => {
    const K = Y.backyard;
    const things = [K.shed, ...K.beds, K.firePit, K.patch, K.wheelbarrow];
    // A phone held upright follows the person closely and shows little past
    // the lawn, so this is the wide screen's view.
    for (const aspect of [1.33, 1.6, 1.78]) {
        const person = { x: Y.lawn.minX + 0.5, z: 1 };
        const view = V.cameraFor(aspect, C.camera, Y.lawn, person);
        const camera = new THREE.PerspectiveCamera(C.camera.fovDegrees, aspect, C.camera.near, C.camera.far);
        camera.position.set(view.position.x, view.position.y, view.position.z);
        camera.lookAt(view.target.x, view.target.y, view.target.z);
        camera.updateMatrixWorld(true);
        const seen = things.filter((t) => {
            const p = new THREE.Vector3(t.x, 0.6, t.z).project(camera);
            return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
        });
        expect(seen.length).toBe(things.length);
    }
});

// Steve's M6 QA: the hedge "ended pretty abruptly" at the front of the house.
test('the hedge runs back along the property line past the houses, and the side yard\'s fence meets it', async () => {
    const Yd = await import('../www/leaves/js/yard.js');
    const scene = new THREE.Scene();
    Yd.buildYard(scene, C, { shadows: false });
    scene.updateMatrixWorld(true);
    const hedge = new THREE.Box3().setFromObject(scene.getObjectByName('hedge'));
    // Past the back of our house.
    expect(hedge.min.z).toBeLessThan(Y.lawn.minZ - Y.house.setBack - Y.house.depth + 0.5);
    expect(hedge.max.z).toBeCloseTo(Y.sidewalk.minZ, 5);
    const F = Y.backyard.fence;
    expect(F.z).toBeGreaterThan(hedge.min.z);
    expect(Math.abs(F.to - hedge.min.x)).toBeLessThan(0.05);
});

// Steve's M6 QA: "Could we add more environment details to the area between
// the main house and the neighbor's house?"
describe('between the houses', () => {
    test('behind the sim\'s wall, inside the gap, and seen over the gate from the street', async () => {
        const Gp = await import('../www/leaves/js/gap.js');
        const group = Gp.buildGap(C);
        group.updateMatrixWorld(true);
        const left = Y.house.maxX;
        const right = Y.neighborHouse.minX;
        let pieces = 0;
        const all = new THREE.Box3();
        group.traverse((o) => {
            if (!o.isMesh && !o.isLine) return;
            const box = new THREE.Box3().setFromObject(o, true);
            pieces++;
            all.union(box);
            expect(box.max.z).toBeLessThan(Y.bounds.minZ);
            expect(box.min.x).toBeGreaterThan(left - 0.05);
            expect(box.max.x).toBeLessThan(right + 0.05);
        });
        expect(pieces).toBeGreaterThan(15);
        // Its top shows over the gate in the view a visitor starts with.
        const aspect = 1.6;
        const view = V.cameraFor(aspect, C.camera, Y.lawn, C.blower.start);
        const camera = new THREE.PerspectiveCamera(C.camera.fovDegrees, aspect, C.camera.near, C.camera.far);
        camera.position.set(view.position.x, view.position.y, view.position.z);
        camera.lookAt(view.target.x, view.target.y, view.target.z);
        camera.updateMatrixWorld(true);
        const top = new THREE.Vector3((left + right) / 2, all.max.y, all.max.z).project(camera);
        expect(Math.abs(top.x)).toBeLessThan(1);
        expect(Math.abs(top.y)).toBeLessThan(1);
        expect(all.max.y).toBeGreaterThan(2.5);
    });
});
