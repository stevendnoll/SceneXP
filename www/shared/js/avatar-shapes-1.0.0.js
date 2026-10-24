// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * avatar-shapes.js - the solids the avatar's hair and hats are made of
 * (specs/avatar, 2026-10-24).
 *
 * EVERY SHAPE HERE IS CLOSED. A beard drawn as a single shell stood off the
 * face with air under its edges, and the rig's short hair is a bowl with a
 * hard rim (Steve's QA, 2026-10-24). A closed solid has no edge to see
 * through: hair can thin to nothing at the hairline and still lie on the
 * scalp, and a hat's brim has a top, an underside and an edge.
 *
 *   solidGrid   two surfaces a grid apart (an inner and an outer), joined by
 *               walls round the grid's edge: a scalp of hair, a brim, a fin
 *   taperTube   a tube along a curve, its radius changing as it goes,
 *               capped at both ends: a ponytail, a braid's strand, a loc
 *
 * Uses the global THREE. Pure otherwise.
 */

/**
 * A closed solid from a grid. `at(i, j, side)` gives the point [x, y, z] for
 * column `i` (0 to `nu`), row `j` (0 to `nv`) on the inner (`side` 0) or
 * outer (1) surface. `wrap` joins the last column to the first (a full turn
 * round, the first and last columns at the same place), so no walls are
 * built along those two edges; `pole` says the first row meets at one point
 * (the crown), so no wall is built along it either. Returns a
 * BufferGeometry with three groups: 0 the outer surface, 1 the inner, 2 the
 * walls, for a mesh that colors them apart (a brim's underside).
 */
export function solidGrid(nu, nv, at, { wrap = false, pole = false } = {}) {
    const positions = [];
    const index = [];
    const groups = [];
    const surface = (side, flip) => {
        const base = positions.length / 3;
        const start = index.length;
        for (let i = 0; i <= nu; i++) {
            for (let j = 0; j <= nv; j++) {
                positions.push(...at(i, j, side));
                if (i > 0 && j > 0) {
                    const p = base + i * (nv + 1) + j;
                    const q = base + (i - 1) * (nv + 1) + j;
                    if (flip) index.push(q - 1, p, p - 1, q - 1, q, p);
                    else index.push(q - 1, p - 1, p, q - 1, p, q);
                }
            }
        }
        groups.push([start, index.length - start]);
    };
    surface(1, false);
    surface(0, true);
    // The walls, inner to outer, round the parts of the edge left open.
    const edge = [];
    const sides = [];
    if (!pole) sides.push(Array.from({ length: nu + 1 }, (_, i) => [i, 0]));
    if (!wrap) sides.push(Array.from({ length: nv + 1 }, (_, j) => [nu, j]));
    sides.push(Array.from({ length: nu + 1 }, (_, i) => [nu - i, nv]));
    if (!wrap) sides.push(Array.from({ length: nv + 1 }, (_, j) => [0, nv - j]));
    const start = index.length;
    for (const run of sides) {
        for (let k = 0; k < run.length - 1; k++) edge.push([run[k], run[k + 1]]);
    }
    for (const [[i0, j0], [i1, j1]] of edge) {
        const base = positions.length / 3;
        positions.push(...at(i0, j0, 0), ...at(i0, j0, 1), ...at(i1, j1, 0), ...at(i1, j1, 1));
        index.push(base, base + 1, base + 3, base, base + 3, base + 2);
    }
    groups.push([start, index.length - start]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    groups.forEach(([s, n], g) => geometry.addGroup(s, n, g));
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * A tube along the curve through `points` ([x, y, z] each), its radius
 * `radius(s)` at `s` 0 (the start) to 1 (the end), `segments` rings along
 * it of `radial` sides each, closed at both ends.
 */
export function taperTube(points, radius, { segments = 24, radial = 10 } = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const frames = curve.computeFrenetFrames(segments, false);
    const positions = [];
    const index = [];
    const p = new THREE.Vector3();
    for (let i = 0; i <= segments; i++) {
        const s = i / segments;
        curve.getPointAt(s, p);
        const r = Math.max(0, radius(s));
        const n = frames.normals[i];
        const b = frames.binormals[i];
        for (let k = 0; k < radial; k++) {
            const t = (k / radial) * Math.PI * 2;
            positions.push(
                p.x + r * (Math.cos(t) * n.x + Math.sin(t) * b.x),
                p.y + r * (Math.cos(t) * n.y + Math.sin(t) * b.y),
                p.z + r * (Math.cos(t) * n.z + Math.sin(t) * b.z)
            );
        }
        if (i > 0) {
            const a = (i - 1) * radial;
            const c = i * radial;
            for (let k = 0; k < radial; k++) {
                const k1 = (k + 1) % radial;
                index.push(a + k, c + k, c + k1, a + k, c + k1, a + k1);
            }
        }
    }
    // The two ends, each closed by a fan from its middle.
    for (const [i, flip] of [[0, true], [segments, false]]) {
        curve.getPointAt(i / segments, p);
        const middle = positions.length / 3;
        positions.push(p.x, p.y, p.z);
        const ring = i * radial;
        for (let k = 0; k < radial; k++) {
            const k1 = (k + 1) % radial;
            if (flip) index.push(middle, ring + k1, ring + k);
            else index.push(middle, ring + k, ring + k1);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry;
}

/** A point on a sphere of radius `r` about the origin, `a` round from
 *  straight ahead (+z) toward +x, `t` down from the top. */
export function onSphere(r, a, t) {
    return [r * Math.sin(t) * Math.sin(a), r * Math.cos(t), r * Math.sin(t) * Math.cos(a)];
}

/** The open edges of a geometry: edges used by other than two triangles,
 *  matching corners by place (to a micrometer). 0 for a closed solid. */
export function openEdges(geometry) {
    const pos = geometry.attributes.position;
    const key = (i) => `${Math.round(pos.getX(i) * 1e6)},${Math.round(pos.getY(i) * 1e6)},${Math.round(pos.getZ(i) * 1e6)}`;
    const edges = new Map();
    const index = geometry.index.array;
    for (let i = 0; i < index.length; i += 3) {
        const keys = [key(index[i]), key(index[i + 1]), key(index[i + 2])];
        // A triangle with two corners in one place (where a grid's rows meet
        // at the crown) covers nothing and closes nothing.
        if (keys[0] === keys[1] || keys[1] === keys[2] || keys[2] === keys[0]) continue;
        for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
            const ka = keys[a];
            const kb = keys[b];
            const e = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
            edges.set(e, (edges.get(e) || 0) + 1);
        }
    }
    return [...edges.values()].filter((n) => n !== 2).length;
}

/**
 * Call `fn(v)` for every vertex of `objects` (meshes, and groups), in the
 * coordinates of the first object's parent, for the meshes `keep` keeps.
 * Every matrix on the way is brought up to date first: a mesh's own matrix
 * is stale until updated, and a measure that skips it silently drops the
 * mesh's whole offset (2026-10-24, the hats came out too small).
 */
export function eachVertex(objects, fn, keep = () => true) {
    const v = new THREE.Vector3();
    for (const o of objects) {
        o.updateMatrix();
        o.traverse((m) => {
            if (!m.isMesh || !keep(m)) return;
            m.updateMatrix();
            const matrix = m.matrix.clone();
            for (let p = m.parent; p && p !== o.parent; p = p.parent) {
                p.updateMatrix();
                matrix.premultiply(p.matrix);
            }
            const pos = m.geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) fn(v.fromBufferAttribute(pos, i).applyMatrix4(matrix));
        });
    }
}
