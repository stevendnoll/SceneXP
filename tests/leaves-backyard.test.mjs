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
    // The hedge as drawn: 0.9 m thick behind its wall, back to the houses.
    const hedge = { minX: wall.at - 0.9, maxX: wall.at, minZ: wall.from, maxZ: Y.sidewalk.minZ };
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
