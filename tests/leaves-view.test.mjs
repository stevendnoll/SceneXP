// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * What the camera shows (www/leaves/js/view.js) and what is under it
 * (groundRects in www/leaves/js/yard.js), measured through a real three.js
 * camera. Both tests come from Steve's M6 QA:
 *
 * 1. "I'm not able to walk all the way to the row of hedges on the left."
 *    The view was fitted to the lawn at the middle of the yard, and a view
 *    looking down narrows toward the camera, so near the front the lawn's
 *    sides were off screen, and a pointer has to aim the blower's standoff
 *    past where the person should stop. So here a pointer is held at the
 *    very edge of the screen, at the person's own row, frame after frame, as
 *    a visitor would, and the person must get all the way to the hedge (and
 *    to the fence), from the back of the lawn to the sidewalk, on a phone
 *    and on a wide screen.
 *
 * 2. "The grass of his lawn does not extend the full width of his yard...
 *    an empty blue void." Every ray through the screen that meets the ground
 *    in front of the far edge of the block must meet ground that is drawn,
 *    for every view the camera takes: the person anywhere, the neighbor
 *    anywhere he walks.
 */
import { loadRealThree } from './helpers/real-three.mjs';

const V = await import('../www/leaves/js/view.js');
const Op = await import('../www/leaves/js/blower.js');
const S = await import('../www/leaves/js/sim.js');
const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');

let THREE;
let groundRects;
beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    ({ groundRects } = await import('../www/leaves/js/yard.js'));
});
afterAll(() => { delete globalThis.THREE; });

const cam = C.camera;
const lawn = C.yard.lawn;
const B = C.blower;
// main.js's walkArea().
const area = { minX: lawn.minX + 0.5, maxX: lawn.maxX - 0.4, minZ: lawn.minZ + 0.6, maxZ: C.yard.sidewalk.maxZ };
const solids = S.solidBoxes(C.yard);
const ASPECTS = [0.46, 0.75, 1.33, 1.6, 1.78, 2.2];

/** A real camera standing where cameraFor() says. */
function cameraAt(view, aspect) {
    const camera = new THREE.PerspectiveCamera(cam.fovDegrees, aspect, cam.near, cam.far);
    camera.position.set(view.position.x, view.position.y, view.position.z);
    camera.lookAt(view.target.x, view.target.y, view.target.z);
    camera.updateMatrixWorld(true);
    return camera;
}

/** Where the ray through the screen point (nx, ny), -1 to 1, meets the
 *  ground, or null. */
function groundAt(camera, nx, ny) {
    const p = new THREE.Vector3(nx, ny, 0.5).unproject(camera);
    const dir = p.sub(camera.position).normalize();
    return V.rayToGround(camera.position, dir);
}

describe('walking to the edges of the yard with a pointer', () => {
    /** Hold a pointer at the screen's edge (`side` -1 left, 1 right) on the
     *  person's own row, for `seconds`, the camera following. Returns the
     *  person. */
    function holdAtEdge(aspect, start, side, seconds = 14) {
        const op = { ...Op.createOperator(B), x: start.x, z: start.z };
        for (let t = 0; t < seconds; t += 1 / 30) {
            const camera = cameraAt(V.cameraFor(aspect, cam, lawn, op), aspect);
            const row = new THREE.Vector3(op.x, 0, op.z).project(camera).y;
            const aim = groundAt(camera, side * 0.97, row);
            Op.stepOperator(op, aim && { mode: 'point', x: aim.x, z: aim.z }, 1 / 30, B, area, solids);
        }
        return op;
    }

    for (const aspect of ASPECTS) {
        test(`on a screen ${aspect} wide to 1 tall, the person reaches the hedge and the fence, back, middle and front`, () => {
            // Rows clear of the porch and the maple's trunk, which a person
            // walks round rather than through.
            for (const z of [-2.4, 2, 6.5, area.maxZ - 0.2]) {
                const left = holdAtEdge(aspect, { x: 0, z }, -1);
                expect(left.x).toBeLessThan(area.minX + 0.05);
                const right = holdAtEdge(aspect, { x: 0, z }, 1);
                expect(right.x).toBeGreaterThan(area.maxX - 0.05);
            }
        });
    }

    test('a wide screen still holds steady while the person is out in the middle', () => {
        for (const aspect of [1.6, 1.78]) {
            const v = V.cameraFor(aspect, cam, lawn, { x: 3, z: 2 });
            expect(Math.abs(v.target.x - cam.target.x)).toBeLessThan(1.5);
        }
    });
});

describe('the ground under every view', () => {
    function covered(p, rects) {
        return rects.some((r) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ);
    }

    test('every ray that meets the block in front of its far edge meets drawn ground', () => {
        const rects = groundRects(C).map((g) => g.rect);
        const block = C.yard.block;
        const people = [];
        for (const x of [area.minX, -4, 0, 4, area.maxX]) {
            for (const z of [area.minZ, 2, area.maxZ]) people.push({ x, z });
        }
        // The neighbor anywhere he walks: his door, his far line, the fence.
        const neighbors = [null, { x: C.neighbor.door.x, z: -5 }, { x: C.neighbor.lineMax, z: -4.8 },
            { x: C.neighbor.lineMax, z: 6.4 }, { x: C.neighbor.nearLine, z: 0 }];
        let rays = 0;
        const holes = [];
        for (const aspect of ASPECTS) {
            for (const person of people) {
                for (const nb of neighbors) {
                    const camera = cameraAt(V.cameraFor(aspect, cam, lawn, person, nb), aspect);
                    for (let i = 0; i <= 16; i++) {
                        for (let j = 0; j <= 16; j++) {
                            const p = groundAt(camera, -1 + i / 8, -1 + j / 8);
                            if (!p || p.z < block.minZ) continue;
                            rays++;
                            if (!covered(p, rects)) holes.push({ aspect, person, nb, p });
                        }
                    }
                }
            }
        }
        expect(rays).toBeGreaterThan(10000);
        expect(holes.slice(0, 3)).toEqual([]);
    });

    test('the block reaches past both houses down the street, and behind every house', () => {
        const block = C.yard.block;
        for (const h of C.yard.street) {
            expect(h.minX).toBeGreaterThan(block.minX + 5);
            expect(h.maxX).toBeLessThan(block.maxX - 5);
        }
        for (const h of [C.yard.house, C.yard.neighborHouse]) expect(C.yard.lawn.minZ - h.depth).toBeGreaterThan(block.minZ);
    });
});
