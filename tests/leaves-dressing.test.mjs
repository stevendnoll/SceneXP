// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The hedge, the side gate and the leaves resting on the roofs (Steve's QA,
 * 2026-10-08), measured on the real three.js against what is drawn:
 *
 * 2. "The row of hedges on the left could use more detail. They have very
 *    sharp 90 degree corners and just look like a green rectangle."
 * 3. "The fence connecting the user's house with the neighbor's house could
 *    use more detail. It currently just looks like a white rectangle."
 * 4. "Could we add a few more resting leaves to the houses' roofs?"
 */
import { loadRealThree } from './helpers/real-three.mjs';

const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');
const S = await import('../www/leaves/js/sim.js');

let THREE;
let Hd;
let Rt;
let Yd;
let Ho;
beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    Hd = await import('../www/leaves/js/hedge.js');
    Rt = await import('../www/leaves/js/rooftops.js');
    Yd = await import('../www/leaves/js/yard.js');
    Ho = await import('../www/leaves/js/house.js');
});
afterAll(() => { delete globalThis.THREE; });

const Y = C.yard;
const H = Y.hedgeShape;
const wall = Y.walls.find((w) => w.axis === 'x' && w.height >= 1.2);
const z0 = Y.hedgeBack;
const z1 = Y.sidewalk.minZ;

describe('the hedge', () => {
    function vertices() {
        const s = Hd.hedgeSurface(wall, H, z0, z1);
        const out = [];
        for (let k = 0; k < s.position.length; k += 3) out.push({ x: s.position[k], y: s.position[k + 1], z: s.position[k + 2] });
        return { s, v: out };
    }

    test('no clump reaches past the sim\'s wall, where the leaves bank against it', () => {
        const { v } = vertices();
        const past = v.filter((p) => p.x > wall.at - 0.005);
        expect(past).toEqual([]);
        // But it stands close to it, a hedge along the line, not a gap.
        expect(Math.max(...v.map((p) => p.x))).toBeGreaterThan(wall.at - 0.06);
    });

    test('"very sharp 90 degree corners": its shoulders are rounded and its top narrower than its foot', () => {
        const F = Hd.hedgeFrame(wall, H);
        const profile = Hd.hedgeProfile(F);
        // No point of the outline stands at the full height and the full
        // width at once: the box's corner is cut away by the shoulder.
        const corner = profile.filter((p) => Math.abs(p.u) > F.top - F.shoulder * 0.3 && p.y > F.height - F.shoulder * 0.3);
        expect(corner).toEqual([]);
        expect(F.top).toBeLessThan(F.foot);
        // Outward normals: sideways on the sides, up on the top.
        expect(profile[0].nu).toBeGreaterThan(0.9);
        expect(profile[profile.length - 1].nu).toBeLessThan(-0.9);
        const top = profile.filter((p) => p.y === F.height).sort((a, b) => Math.abs(a.u) - Math.abs(b.u))[0];
        expect(top.ny).toBeGreaterThan(0.99);
    });

    test('"a green rectangle": its top is lumpy along its length and its ends are rounded off', () => {
        const F = Hd.hedgeFrame(wall, H);
        const tops = [];
        for (let z = -6; z < 7; z += 0.1) tops.push(Hd.hedgeTopAt(wall, H, F.cx, z));
        expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(0.05);
        expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2 * (H.bump + H.fine) + 1e-6);
        // At the sidewalk end, a few centimeters in, it is much narrower than
        // in the middle: rounded in plan.
        const { v } = vertices();
        const width = (zz) => {
            const near = v.reduce((a, p) => (Math.abs(p.z - zz) < Math.abs(a - zz) ? p.z : a), Infinity);
            const ring = v.filter((p) => p.z === near);
            return Math.max(...ring.map((p) => p.x)) - Math.min(...ring.map((p) => p.x));
        };
        const ends = Hd.ringZs(z0, z1, H.round, H.spacing);
        expect(width(ends[ends.length - 2])).toBeLessThan(0.5 * width(0));
        expect(width(0)).toBeGreaterThan(H.width - 2 * (H.bump + H.fine));
    });

    test('the mesh is what the pure shape says, sits on the ground, and runs from the back to the sidewalk', () => {
        const mesh = Hd.buildHedge(wall, H, z0, z1, C.look);
        expect(mesh.name).toBe('hedge');
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        expect(box.min.y).toBeCloseTo(0, 5);
        expect(box.max.z).toBeCloseTo(z1, 5);
        expect(box.min.z).toBeCloseTo(z0, 5);
        const normals = mesh.geometry.getAttribute('normal').array;
        expect([...normals].every(Number.isFinite)).toBe(true);
        // Its colors run from shade at the foot to sun on top.
        const colors = mesh.geometry.getAttribute('color').array;
        const pos = mesh.geometry.getAttribute('position').array;
        let low = 0;
        let high = 0;
        let nl = 0;
        let nh = 0;
        for (let k = 0; k < pos.length; k += 3) {
            const lum = colors[k] + colors[k + 1] + colors[k + 2];
            if (pos[k + 1] < 0.3) { low += lum; nl++; }
            if (pos[k + 1] > wall.height - 0.05) { high += lum; nh++; }
        }
        expect(high / nh).toBeGreaterThan(1.5 * (low / nl));
    });

    test('the outside faces out: a ray from the lawn meets its front face', () => {
        const mesh = Hd.buildHedge(wall, H, z0, z1, C.look);
        const ray = new THREE.Raycaster(new THREE.Vector3(0, 1, 2), new THREE.Vector3(-1, 0, 0));
        const hit = ray.intersectObject(mesh)[0];
        expect(hit).toBeTruthy();
        expect(hit.face.normal.x).toBeGreaterThan(0.5);
        // And from above, its top.
        const down = new THREE.Raycaster(new THREE.Vector3(-10.46, 5, 2), new THREE.Vector3(0, -1, 0));
        const top = down.intersectObject(mesh)[0];
        expect(top.face.normal.y).toBeGreaterThan(0.5);
        expect(top.point.y).toBeCloseTo(Hd.hedgeTopAt(wall, H, -10.46, 2), 1);
    });
});

describe('the side gate', () => {
    test('posts with caps, boards with gaps, rails, a gate with black hinges and a latch, all between the houses', () => {
        const gate = Yd.sideGate(Y, C.look);
        gate.updateMatrixWorld(true);
        expect(gate.name).toBe('side-gate');
        const box = new THREE.Box3().setFromObject(gate, true);
        expect(box.min.x).toBeGreaterThanOrEqual(Y.house.maxX - 1e-6);
        expect(box.max.x).toBeLessThanOrEqual(Y.neighborHouse.minX + 1e-6);
        expect(box.max.y).toBeGreaterThan(Y.gate.height + 0.1);
        let boards = 0;
        let cones = 0;
        let black = 0;
        gate.traverse((o) => {
            if (o.isInstancedMesh) boards += o.count;
            if (o.isMesh && o.geometry.type === 'ConeGeometry') cones++;
            if (o.isMesh && o.material.color && o.material.color.getHex() === C.look.frame) black++;
        });
        expect(cones).toBe(3);
        // Some 18 boards across 2.5 m, not one slab.
        expect(boards).toBeGreaterThan(14);
        // Two strap hinges with their knuckles, a latch and a ring pull.
        expect(black).toBe(6);
    });

    test('nothing of it stands in front of the neighbor\'s set back face, where the leaves bank', () => {
        const gate = Yd.sideGate(Y, C.look);
        gate.updateMatrixWorld(true);
        const face = Ho.facadeZ(Y.neighbor.minZ, Y.neighborHouse);
        const box = new THREE.Box3().setFromObject(gate, true);
        // Half the largest leaf at 12,000, as tests/leaves-houses measures it.
        const halfLeaf = 0.5 * S.leafSize(12000, S.areaOf(Y.lawn), C.leaves) * (1 + C.leaves.sizeJitter);
        expect(box.max.z).toBeLessThan(Y.lawn.minZ - halfLeaf);
        expect(box.max.z).toBeLessThan(face + 0.06);
    });
});

describe('the leaves resting on the roofs and the hedge', () => {
    const base = S.leafSize(24000, S.areaOf(Y.lawn), C.leaves);

    test('each surface has its leaves, and the front slopes the camera sees have the most', () => {
        const r = Rt.scatterResting(C, base);
        const surfaces = Rt.restingSurfaces(C);
        const per = surfaces.map((s, i) => ({ name: s.name, n: [...r.at].filter((a) => a === i).length, want: Y.resting.counts[s.name] ?? Y.resting.counts[s.kind] }));
        for (const s of per) expect(s.n).toBe(s.want);
        expect(r.count).toBe(per.reduce((a, s) => a + s.n, 0));
        expect(surfaces.map((s) => s.name)).toEqual(['ours', 'neighbor', 'street-left', 'street-right', 'porch', 'hedge']);
    });

    test('a leaf on a roof lies on the roof that is drawn, turned flat to its slope, thickest along the gutter', () => {
        const r = Rt.scatterResting(C, base);
        const surfaces = Rt.restingSurfaces(C);
        const houses = [
            Ho.buildOurHouse(Y, C.look), Ho.buildNeighborHouse(Y, C.look, C.neighbor.door.x),
            ...Y.street.map((h) => Ho.buildStreetHouse(h, C.look, Y))
        ];
        const scene = new THREE.Scene();
        houses.forEach((h) => scene.add(h));
        scene.updateMatrixWorld(true);
        const ray = new THREE.Raycaster();
        const off = [];
        const turned = [];
        let low = 0;
        let high = 0;
        for (let i = 0; i < r.count; i++) {
            const s = surfaces[r.at[i]];
            if (s.kind !== 'slope') continue;
            const [x, y, z, yaw, pitch, roll] = r.pose.subarray(i * 6, i * 6 + 6);
            // Straight down onto what is drawn under the leaf.
            ray.set(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0));
            const hit = ray.intersectObjects(scene.children, true)[0];
            if (!hit || Math.abs(hit.point.y - y) > 0.04) off.push({ s: s.name, x, y, z, hit: hit && hit.point.y });
            // The leaf's face, through three's own Euler, against the slope's.
            const n = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
            const tilt = Rt.slopeTilt(s);
            const want = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
            if (Math.abs(n.dot(want)) < Math.cos(0.35)) turned.push({ s: s.name, n: n.toArray() });
            const t = (s.eaveZ - z) / (s.eaveZ - s.ridgeZ);
            if (t < 0.33) low++;
            else if (t > 0.67) high++;
        }
        expect(off.slice(0, 3)).toEqual([]);
        expect(turned.slice(0, 3)).toEqual([]);
        expect(low).toBeGreaterThan(2 * high);
    });

    test('none sits on his chimney, and the hedge\'s and the porch roof\'s leaves lie on their tops', () => {
        const r = Rt.scatterResting(C, base);
        const surfaces = Rt.restingSurfaces(C);
        const chimney = surfaces.find((s) => s.name === 'neighbor').avoid[0];
        for (let i = 0; i < r.count; i++) {
            const s = surfaces[r.at[i]];
            const [x, y, z] = r.pose.subarray(i * 6, i * 6 + 3);
            if (s.name === 'neighbor') expect(x >= chimney.minX && x <= chimney.maxX && z >= chimney.minZ && z <= chimney.maxZ).toBe(false);
            if (s.kind === 'flat') {
                expect(y).toBeCloseTo(s.y + Y.resting.lift, 5);
                expect(x).toBeGreaterThanOrEqual(s.rect.minX);
                expect(x).toBeLessThanOrEqual(s.rect.maxX);
            }
            if (s.kind === 'hedge') {
                expect(y).toBeCloseTo(Hd.hedgeTopAt(wall, H, x, z) + Y.resting.lift, 5);
                expect(x).toBeLessThan(wall.at - H.inset);
            }
        }
    });

    test('a leaf turned to a slope reads back the same turn through three.js', () => {
        for (const [tilt, spin, flip, side] of [[0, 0, false, 0], [0.6, 1.2, false, 0.1], [0.6, 4, true, -0.2], [0.2, 2.5, true, 0]]) {
            const t = Rt.slopeTurn(tilt, spin, flip, side);
            const e = new THREE.Euler(t.pitch, t.yaw, t.roll, 'YXZ');
            const want = new THREE.Matrix4().makeRotationX(tilt)
                .multiply(new THREE.Matrix4().makeRotationZ(side))
                .multiply(new THREE.Matrix4().makeRotationY(spin))
                .multiply(new THREE.Matrix4().makeRotationZ(flip ? Math.PI : 0));
            const got = new THREE.Matrix4().makeRotationFromEuler(e);
            got.elements.forEach((v, k) => expect(v).toBeCloseTo(want.elements[k], 6));
        }
    });

    test('they are the yard\'s leaves, a little weathered, and never in the sim', () => {
        const r = Rt.scatterResting(C, base);
        for (let i = 0; i < r.count; i++) {
            const o = i * 6;
            expect(r.look[o + 3]).toBeGreaterThanOrEqual(0);
            expect(r.look[o + 3]).toBeLessThan(Object.keys(C.look.palettes).length);
            expect(r.look[o + 4]).toBeGreaterThan(base * (1 - C.leaves.sizeJitter) - 1e-6);
            expect(r.look[o + 4]).toBeLessThan(base * (1 + C.leaves.sizeJitter) + 1e-6);
        }
        // The same every time (a seeded scatter).
        expect(Array.from(Rt.scatterResting(C, base).pose)).toEqual(Array.from(r.pose));
        // And every one of them off the sim's ground or above anything a
        // blown leaf reaches.
        for (let i = 0; i < r.count; i++) {
            const [x, y, z] = r.pose.subarray(i * 6, i * 6 + 3);
            const inSim = x >= Y.bounds.minX && x <= Y.bounds.maxX && z >= Y.bounds.minZ && z <= Y.bounds.maxZ;
            if (inSim) expect(y).toBeGreaterThan(2.5);
        }
        const built = Rt.buildResting(C, base, { shadows: true });
        expect(built.mesh.name).toBe('resting-leaves');
        expect(built.mesh.geometry.instanceCount).toBe(r.count);
        expect(built.mesh.castShadow).toBe(true);
    });
});
