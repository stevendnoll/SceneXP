// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The solids the avatar's hair and hats are made of
 * (shared/js/avatar-shapes-1.0.0.js), from SOURCE, on the real three.js.
 *
 * What is held here, and why: EVERY SHAPE IS CLOSED. A beard drawn as a
 * single shell, and the rig's short hair, stood off the head with air under
 * their edges (Steve's QA, 2026-10-24). A closed solid has every edge shared
 * by two triangles, and `openEdges` counts the ones that are not, so it must
 * see a plain open sheet as open, or it proves nothing.
 */
import { loadRealThree } from './helpers/real-three.mjs';

let THREE;
let S;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    S = await import('../www/shared/js/avatar-shapes-1.0.0.js');
});
afterAll(() => {
    delete globalThis.THREE;
});

test('openEdges sees a flat sheet as open, and a ball as closed', () => {
    expect(S.openEdges(new THREE.PlaneGeometry(1, 1, 3, 3))).toBeGreaterThan(0);
    expect(S.openEdges(new THREE.SphereGeometry(1, 16, 12))).toBe(0);
    expect(S.openEdges(new THREE.BoxGeometry(1, 1, 1))).toBe(0);
});

test('a solid grid is closed, flat or wrapped round or meeting at a crown', () => {
    // Flat: a slab 2 by 1, 0.1 thick.
    const slab = S.solidGrid(6, 3, (i, j, side) => [i / 3, j / 3, side * 0.1]);
    expect(S.openEdges(slab)).toBe(0);
    expect(slab.groups.map((g) => g.materialIndex)).toEqual([0, 1, 2]);
    // Wrapped all the way round: a ring.
    const ring = S.solidGrid(24, 2, (i, j, side) => {
        const a = (i / 24) * Math.PI * 2;
        const r = 1 + side * 0.1;
        return [r * Math.cos(a), j * 0.1, r * Math.sin(a)];
    }, { wrap: true });
    expect(S.openEdges(ring)).toBe(0);
    // Round and meeting at the top: a cap, as the hair's scalp is.
    const cap = S.solidGrid(24, 6, (i, j, side) => S.onSphere(1 + side * 0.1, -Math.PI + (2 * Math.PI * i) / 24, (j / 6) * 1.2), { wrap: true, pole: true });
    expect(S.openEdges(cap)).toBe(0);
    // Left without its walls, the cap is open: the check can fail.
    const open = S.solidGrid(24, 6, (i, j, side) => S.onSphere(1 + side * 0.1, -Math.PI + (2 * Math.PI * i) / 24, (j / 6) * 1.2), { wrap: true, pole: true });
    open.setIndex(Array.from(open.index.array).slice(0, open.groups[2].start));
    expect(S.openEdges(open)).toBeGreaterThan(0);
});

test('a tapered tube is closed at both ends and thins as asked', () => {
    const tube = S.taperTube([[0, 0, 0], [0, -0.1, 0.02], [0, -0.2, 0]], (s) => 0.02 * (1 - s) + 0.002, { segments: 16, radial: 8 });
    expect(S.openEdges(tube)).toBe(0);
    tube.computeBoundingBox();
    expect(tube.boundingBox.min.y).toBeCloseTo(-0.2, 2);
    // Wider at its start than at its end.
    const pos = tube.attributes.position;
    const width = (ring) => {
        let w = 0;
        for (let k = 0; k < 8; k++) w = Math.max(w, Math.abs(pos.getX(ring * 8 + k)));
        return w;
    };
    expect(width(0)).toBeGreaterThan(width(16) * 3);
});

test('a point on the sphere: ahead is +z, round is toward +x, down from the top', () => {
    const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-12);
    expect(near(S.onSphere(2, 0, 0), [0, 2, 0])).toBe(true);
    expect(near(S.onSphere(2, 0, Math.PI / 2), [0, 0, 2])).toBe(true);
    expect(near(S.onSphere(2, Math.PI / 2, Math.PI / 2), [2, 0, 0])).toBe(true);
});

test('eachVertex reads every vertex where it is, offsets and all', () => {
    const group = new THREE.Group();
    const inner = new THREE.Group();
    inner.position.set(0, 1, 0);
    group.add(inner);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
    // Never brought up to date by hand: eachVertex must do it.
    mesh.position.set(1, 0, 0);
    inner.add(mesh);
    const outer = new THREE.Group();
    outer.add(group);
    let maxX = -Infinity;
    let minY = Infinity;
    S.eachVertex([group], (v) => {
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
    });
    // (Positions are kept in 32-bit floats.)
    expect(maxX).toBeCloseTo(1.1, 6);
    expect(minY).toBeCloseTo(0.9, 6);
    // And a mesh `keep` turns away is not read.
    let n = 0;
    S.eachVertex([group], () => n++, () => false);
    expect(n).toBe(0);
});
