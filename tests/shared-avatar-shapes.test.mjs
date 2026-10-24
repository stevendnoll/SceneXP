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

test('every triangle of a solid grid faces out of it, whichever way the grid runs', () => {
    // The same cap built with its columns running the other way round, and
    // its rows the other way up: the same solid either way.
    const cap = (turn, down) => S.solidGrid(24, 6, (i, j, side) => S.onSphere(1 + side * 0.1, turn * (-Math.PI + (2 * Math.PI * i) / 24), (down ? j / 6 : 1 - j / 6) * 1.2), { wrap: true, pole: down });
    expect(S.facesOutward(cap(1, true))).toBe(true);
    expect(S.facesOutward(cap(-1, true))).toBe(true);
    expect(S.facesOutward(cap(1, false))).toBe(true);
    const slab = (flip) => S.solidGrid(6, 3, (i, j, side) => [i / 3, (flip ? -1 : 1) * j / 3, side * 0.1]);
    expect(S.facesOutward(slab(false))).toBe(true);
    expect(S.facesOutward(slab(true))).toBe(true);
    // The check can fail: a solid turned inside out (every triangle flipped),
    // and one whose walls run against its surfaces (the 2026-10-24 defect).
    const inside = slab(false);
    const index = Array.from(inside.index.array);
    for (let k = 0; k < index.length; k += 3) [index[k + 1], index[k + 2]] = [index[k + 2], index[k + 1]];
    inside.setIndex(index);
    expect(S.openEdges(inside)).toBe(0);
    expect(S.facesOutward(inside)).toBe(false);
    const walls = slab(false);
    const w = Array.from(walls.index.array);
    const start = walls.groups[2].start;
    for (let k = start; k < w.length; k += 3) [w[k + 1], w[k + 2]] = [w[k + 2], w[k + 1]];
    walls.setIndex(w);
    expect(S.openEdges(walls)).toBe(0);
    expect(S.facesOutward(walls)).toBe(false);
    // three's own closed shapes pass it, and its vertex normals follow the
    // winding, so they point out of the solid too.
    expect(S.facesOutward(new THREE.SphereGeometry(1, 16, 12))).toBe(true);
    expect(S.facesOutward(new THREE.BoxGeometry(1, 1, 1))).toBe(true);
    const shell = cap(1, true);
    const pos = shell.attributes.position;
    const nrm = shell.attributes.normal;
    const outer = shell.groups[0];
    let inward = 0;
    for (let k = outer.start; k < outer.start + outer.count; k++) {
        const i = shell.index.getX(k);
        const p = new THREE.Vector3().fromBufferAttribute(pos, i);
        if (new THREE.Vector3().fromBufferAttribute(nrm, i).dot(p) < 0) inward++;
    }
    expect(inward).toBe(0);
});

test('a wrapped grid\'s seam and its crown share one normal, so no crease runs down the back', () => {
    const cap = S.solidGrid(24, 6, (i, j, side) => S.onSphere(1 + side * 0.1, -Math.PI + (2 * Math.PI * i) / 24, (j / 6) * 1.2), { wrap: true, pole: true });
    const n = cap.attributes.normal;
    const at = (i) => new THREE.Vector3().fromBufferAttribute(n, i);
    // Column 0 and column 24 of the outer surface lie in the same place.
    for (let j = 1; j <= 6; j++) expect(at(j).distanceTo(at(24 * 7 + j))).toBeLessThan(1e-6);
    // Every crown vertex: straight up, and none of them left with no normal.
    for (let i = 0; i <= 24; i++) {
        expect(at(i * 7).y).toBeGreaterThan(0.99);
        expect(at(7 * 25 + i * 7).y).toBeLessThan(-0.99);
    }
    // And the normal at the seam is the average of both sides, not one of
    // them: it points nearly straight back (-z; the quads' diagonals lean
    // it a hair), where a one-sided normal leans several degrees.
    expect(Math.abs(at(3).x)).toBeLessThan(0.01);
});

test('a tapered tube is closed at both ends, faces outward, and thins as asked', () => {
    const tube = S.taperTube([[0, 0, 0], [0, -0.1, 0.02], [0, -0.2, 0]], (s) => 0.02 * (1 - s) + 0.002, { segments: 16, radial: 8 });
    expect(S.openEdges(tube)).toBe(0);
    expect(S.facesOutward(tube)).toBe(true);
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
