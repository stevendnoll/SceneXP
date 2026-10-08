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
const ASPECTS = [0.46, 0.75, 1.33, 1.6, 1.78, 2.2, 2.4, 3.56];
// The visitor's zoom: all the way out, the usual view, halfway, all the way in.
const ZOOMS = [cam.zoom.min, 1, 1.8, cam.zoom.max];

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
    /** Hold a mouse at the screen's edge (`side` -1 left, 1 right) on the
     *  person's own row, for `seconds`, the camera following, the aim worked
     *  out again each frame from what is under the cursor (main.js), with
     *  the neighbor out at `nb` if given. Returns the person. */
    function holdAtEdge(aspect, start, side, seconds = 14, nb = null, zoom = 1) {
        const op = { ...Op.createOperator(B), x: start.x, z: start.z };
        for (let t = 0; t < seconds; t += 1 / 30) {
            const camera = cameraAt(V.cameraFor(aspect, cam, lawn, op, nb, zoom), aspect);
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

    test('with the neighbor out and the view widened for him, the person still reaches the hedge', () => {
        const visits = [{ x: C.neighbor.nearLine, z: 0 }, { x: C.neighbor.lineMax, z: -4.8 }, { x: C.neighbor.door.x, z: -5.4 }];
        for (const aspect of ASPECTS) {
            for (const nb of visits) {
                for (const z of [-2.4, 2, area.maxZ - 0.2]) {
                    expect(holdAtEdge(aspect, { x: 0, z }, -1, 14, nb).x).toBeLessThan(area.minX + 0.05);
                }
            }
        }
    });

    test('zoomed all the way in or out, the person still reaches the hedge and the fence', () => {
        for (const aspect of [0.46, 1.33, 1.78, 2.4]) {
            for (const zoom of [cam.zoom.min, cam.zoom.max]) {
                for (const z of [-2.4, area.maxZ - 0.2]) {
                    expect(holdAtEdge(aspect, { x: 0, z }, -1, 14, null, zoom).x).toBeLessThan(area.minX + 0.05);
                    expect(holdAtEdge(aspect, { x: 0, z }, 1, 14, null, zoom).x).toBeGreaterThan(area.maxX - 0.05);
                }
            }
        }
    });

    test('a wide screen still holds steady while the person is out in the middle', () => {
        for (const aspect of [1.6, 1.78]) {
            const v = V.cameraFor(aspect, cam, lawn, { x: 3, z: 2 });
            expect(Math.abs(v.target.x - cam.target.x)).toBeLessThan(1.5);
        }
    });
});

describe('the frame on any screen, at any zoom (Steve\'s QA, 2026-10-08)', () => {
    /** Where the bottom middle of the screen meets the ground. */
    function bottomZ(aspect, person = null, nb = null, zoom = 1) {
        const camera = cameraAt(V.cameraFor(aspect, cam, lawn, person, nb, zoom), aspect);
        return groundAt(camera, 0, -1).z;
    }

    test('"the street isn\'t visible": every landscape screen shows the sidewalk and the curb', () => {
        // Before: the bottom edge sat at z 8.1 on 16:9 (mid-sidewalk) and 6.3
        // on 21:9, the sidewalk gone. The street starts at the sidewalk's
        // far edge.
        for (const aspect of [1.33, 1.6, 1.78, 2.2, 2.4, 3.56]) {
            for (const person of [null, { x: 0, z: 2 }, { x: -8, z: -4 }, { x: 8, z: 8 }]) {
                expect(bottomZ(aspect, person)).toBeGreaterThan(C.yard.sidewalk.maxZ + 1);
            }
        }
    });

    test('a 4:3 screen and a phone held upright frame just as they did', () => {
        const before = (aspect) => {
            const noFront = { ...cam, frontZ: undefined };
            return V.cameraFor(aspect, noFront, lawn, { x: 0, z: 2 });
        };
        for (const aspect of [0.46, 0.75, 1.0, 1.33]) {
            const now = V.cameraFor(aspect, cam, lawn, { x: 0, z: 2 });
            expect(now.distance).toBeCloseTo(before(aspect).distance, 1);
        }
    });

    test('the person stays well on screen at every zoom, anywhere they stand', () => {
        const off = [];
        for (const aspect of ASPECTS) {
            for (const zoom of ZOOMS) {
                for (const person of [{ x: 0, z: 2 }, { x: area.minX, z: area.minZ }, { x: area.maxX, z: area.maxZ }, { x: area.minX, z: area.maxZ }]) {
                    const camera = cameraAt(V.cameraFor(aspect, cam, lawn, person, null, zoom), aspect);
                    // Their feet and their head.
                    for (const y of [0, 1.8]) {
                        const p = new THREE.Vector3(person.x, y, person.z).project(camera);
                        if (Math.abs(p.x) > 0.95 || Math.abs(p.y) > 0.95) off.push({ aspect, zoom, person, y, x: p.x, sy: p.y });
                    }
                }
            }
        }
        expect(off).toEqual([]);
    });

    test('zooming in comes closer and zooming out stands back, within the range', () => {
        for (const aspect of [0.46, 1.33, 1.78, 2.4]) {
            const at = (zoom) => V.cameraFor(aspect, cam, lawn, { x: 0, z: 2 }, null, zoom).distance;
            expect(at(1.8)).toBeLessThan(at(1));
            expect(at(cam.zoom.max)).toBeLessThanOrEqual(at(1.8));
            expect(at(cam.zoom.min)).toBeGreaterThan(at(1));
            // Past the ends of the range is the ends of the range.
            expect(at(cam.zoom.max * 4)).toBeCloseTo(at(cam.zoom.max), 6);
            expect(at(0.01)).toBeCloseTo(at(cam.zoom.min), 6);
            expect(at(NaN)).toBeCloseTo(at(1), 6);
            // Never narrower than minSpan across.
            expect(V.cameraFor(aspect, cam, lawn, { x: 0, z: 2 }, null, cam.zoom.max).span).toBeGreaterThan(cam.zoom.minSpan - 1e-6);
        }
    });

    test('a visitor who has zoomed keeps their view when the neighbor comes out', () => {
        const nb = { x: C.neighbor.lineMax, z: 0 };
        const person = { x: 0, z: 2 };
        for (const aspect of [0.75, 1.33, 1.78]) {
            // The usual view slides (and on a narrow screen widens) for him.
            const usual = V.cameraFor(aspect, cam, lawn, person, nb);
            expect(usual.target.x).toBeGreaterThan(V.cameraFor(aspect, cam, lawn, person).target.x + 0.5);
            // A zoomed one does not move at all.
            for (const zoom of [cam.zoom.min, 1.5, cam.zoom.max]) {
                const alone = V.cameraFor(aspect, cam, lawn, person, null, zoom);
                const withHim = V.cameraFor(aspect, cam, lawn, person, nb, zoom);
                expect(withHim.position).toEqual(alone.position);
                expect(withHim.target).toEqual(alone.target);
            }
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
        // And every zoom, which never widens for the neighbor.
        for (const aspect of ASPECTS) {
            for (const person of people) {
                for (const zoom of [cam.zoom.min, cam.zoom.max]) {
                    const camera = cameraAt(V.cameraFor(aspect, cam, lawn, person, null, zoom), aspect);
                    for (let i = 0; i <= 16; i++) {
                        for (let j = 0; j <= 16; j++) {
                            const p = groundAt(camera, -1 + i / 8, -1 + j / 8);
                            if (!p || p.z < block.minZ) continue;
                            rays++;
                            if (!covered(p, rects)) holes.push({ aspect, person, zoom, p });
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

describe('the celebration\'s orbit (2026-10-08)', () => {
    test('swings the camera round its target, the same distance off and as high, still looking at it', () => {
        const v = V.cameraOn({ x: 2, z: 1 }, 1.6, cam, 14);
        const o = V.orbitView(v, 0.5);
        expect(o.target).toEqual(v.target);
        expect(o.position.y).toBe(v.position.y);
        const d = (p) => Math.hypot(p.x - v.target.x, p.z - v.target.z);
        expect(d(o.position)).toBeCloseTo(d(v.position), 9);
        const angle = Math.atan2(o.position.x - v.target.x, o.position.z - v.target.z) - Math.atan2(v.position.x - v.target.x, v.position.z - v.target.z);
        expect(angle).toBeCloseTo(0.5, 9);
        expect(V.orbitView(v, 0).position).toEqual(v.position);
    });
});
