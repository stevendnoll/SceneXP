// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * gap.js - between our house and the neighbor's (M6, Steve's QA: "Could we
 * add more environment details to the area between the main house and the
 * neighbor's house?").
 *
 * The gap is 2.5 m wide, closed at the front by the side gate (yard.js),
 * and the camera looks down over the gate from the street: the ground just
 * behind it is hidden, and only what stands above about 2.5 m, or further
 * back, shows. So the details are high: a white arbor over the gate with
 * autumn ivy climbing it, cafe lights strung back and forth between the two
 * eaves, and on the neighbor's side wall, which faces us, a little shuttered
 * window, a downspout, and ivy. A Japanese maple stands behind the houses,
 * framed by the gap (config.yard.trees).
 *
 * ALL OF IT IS BEHIND THE SIM'S WALL along the house fronts, so no leaf
 * meets it. Plain drawing.
 */
import { facadeZ } from './house.min.js';
import { makeRandom } from './sim.min.js';

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function mesh(geometry, material, x, y, z, shadow = true) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
}

/** Clumps of ivy leaves along a line from a to b (each [x, y, z]), as one
 *  instanced mesh per color. */
function ivyAlong(points, colors, random, size = 0.11) {
    const group = new THREE.Group();
    const geometry = new THREE.IcosahedronGeometry(size, 0);
    const byColor = colors.map(() => []);
    points.forEach((p) => byColor[Math.floor(random() * colors.length)].push(p));
    byColor.forEach((list, c) => {
        if (!list.length) return;
        const m = new THREE.InstancedMesh(geometry, lambert(colors[c]), list.length);
        const at = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        list.forEach((p, k) => {
            q.setFromEuler(new THREE.Euler(random() * 3, random() * 3, random() * 3));
            const s = 0.7 + random() * 0.6;
            at.compose(new THREE.Vector3(...p), q, new THREE.Vector3(s, s * 0.7, s));
            m.setMatrixAt(k, at);
        });
        m.castShadow = true;
        group.add(m);
    });
    return group;
}

/** Points scattered along the segment a to b, `n` of them, jittered. */
function along(a, b, n, random, jitter = 0.08) {
    const out = [];
    for (let k = 0; k < n; k++) {
        const u = (k + random()) / n;
        out.push(a.map((v, i) => v + (b[i] - v) * u + (random() - 0.5) * jitter * 2));
    }
    return out;
}

/** Build the gap between the houses. Returns the group. */
export function buildGap(config) {
    const Y = config.yard;
    const G = Y.gap;
    const group = new THREE.Group();
    group.name = 'gap';
    const random = makeRandom(6029);
    const left = Y.house.maxX;
    const right = Y.neighborHouse.minX;
    const ourFace = facadeZ(Y.lawn.minZ, Y.house);
    const hisFace = facadeZ(Y.neighbor.minZ, Y.neighborHouse);
    // The gate stands at his set back face (yard.js).
    const gateZ = hisFace;
    const mid = (left + right) / 2;

    // The arbor: four posts behind the gate, beams across, an arched top,
    // and slats, ivy climbing up the front posts and over.
    const A = G.arbor;
    const white = lambert(A.color);
    const front = gateZ - 0.1;
    const back = front - A.depth;
    const xs = [left + 0.18, right - 0.18];
    for (const x of xs) {
        for (const z of [front, back]) group.add(mesh(new THREE.BoxGeometry(A.post, A.height, A.post), white, x, A.height / 2, z));
    }
    for (const z of [front, back]) group.add(mesh(new THREE.BoxGeometry(right - left, 0.1, 0.06), white, mid, A.height, z));
    const arch = mesh(new THREE.TorusGeometry((right - left) / 2 - 0.1, 0.04, 6, 20, Math.PI), white, mid, A.height, front);
    group.add(arch);
    for (let k = 0; k < 6; k++) {
        const x = left + 0.3 + (k / 5) * (right - left - 0.6);
        group.add(mesh(new THREE.BoxGeometry(0.05, 0.05, A.depth + 0.2), white, x, A.height + 0.08, (front + back) / 2));
    }
    const ivyPoints = [
        ...along([xs[0], 0.4, front + 0.05], [xs[0], A.height, front + 0.05], 14, random),
        ...along([xs[1], 0.4, front + 0.05], [xs[1], A.height, front + 0.05], 14, random),
        ...along([left + 0.2, A.height + 0.12, front], [right - 0.2, A.height + 0.12, front], 18, random, 0.12),
        ...along([left + 0.2, A.height + 0.14, back], [mid, A.height + 0.14, back], 8, random, 0.12)
    ];
    group.add(ivyAlong(ivyPoints, G.ivy, random));

    // Cafe lights, back and forth between the eaves.
    const L = G.lights;
    const wire = [];
    const bulbs = [];
    L.rows.forEach((z, k) => {
        const from = { x: k % 2 ? right : left, z };
        const to = { x: k % 2 ? left : right, z: L.rows[k + 1] ?? z };
        for (let i = 0; i <= 16; i++) {
            const u = i / 16;
            const p = [from.x + (to.x - from.x) * u, L.y - L.sag * 4 * u * (1 - u), from.z + (to.z - from.z) * u];
            wire.push(new THREE.Vector3(...p));
            if (i % 3 === 1) bulbs.push(p);
        }
    });
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: 0x1c1d1f })));
    const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: L.bulb }), bulbs.length);
    const at = new THREE.Matrix4();
    bulbs.forEach((p, k) => {
        at.makeTranslation(p[0], p[1] - 0.05, p[2]);
        bulbMesh.setMatrixAt(k, at);
    });
    group.add(bulbMesh);

    // His side wall, facing us: a little window with navy shutters, a
    // downspout at the front corner, ivy up the wall.
    const W = G.sideWindow;
    const face = right - 0.005;
    const trim = lambert(config.look.trim);
    group.add(mesh(new THREE.BoxGeometry(0.06, W.h + 0.12, W.w + 0.12), trim, face - 0.03, W.y, W.z));
    group.add(mesh(new THREE.BoxGeometry(0.05, W.h, W.w), new THREE.MeshStandardMaterial({ color: config.look.glass, metalness: 0.35, roughness: 0.15 }), face - 0.05, W.y, W.z, false));
    for (const s of [-1, 1]) group.add(mesh(new THREE.BoxGeometry(0.04, W.h, 0.3), lambert(config.look.shutter), face - 0.03, W.y, W.z + s * (W.w / 2 + 0.2)));
    group.add(mesh(new THREE.BoxGeometry(0.08, Y.neighborHouse.wall, 0.08), lambert(G.downspout), face - 0.05, Y.neighborHouse.wall / 2, hisFace - 0.12));
    // Hugging the wall, not sunk into it.
    group.add(ivyAlong(along([face - 0.1, 0.3, hisFace - 1.4], [face - 0.1, 2.6, hisFace - 2.4], 22, random, 0.02), G.ivy, random, 0.08));
    return group;
}
