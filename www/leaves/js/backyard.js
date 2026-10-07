// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * backyard.js - the side yard behind our hedge (M6, Steve's QA: "Could we add
 * more environment details to the back left of the scene behind the row of
 * hedges on the left?").
 *
 * It belongs to the sage house down the block, and it is somebody's autumn:
 * a garden shed, a wooden privacy fence along the back, two raised cedar
 * beds put to bed for the year and a pumpkin patch still on the vine, a fire
 * pit with two white Adirondack chairs drawn up to it and a curl of smoke, a
 * birdbath, a wheelbarrow heaped with leaves, and stepping stones from the
 * house to the shed. A blue spruce stands among it (config.yard.trees).
 *
 * ALL OF IT IS PAST THE SIM'S GROUND (x below yard.bounds.minX), so no leaf
 * meets it, and it is plain drawing: boxes, cylinders and a few spheres.
 */
import { pumpkin } from './house.min.js';
import { makeRandom } from './sim.min.js';

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function mesh(geometry, material, x, y, z, shadow = true) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
}

const box = (w, h, d, mat, x, y, z, shadow) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, shadow);

/** A garden shed facing the street: walls, a gable roof, white trim, a
 *  door and a window. */
function shed(S, trim) {
    const group = new THREE.Group();
    group.add(box(S.w, S.wall, S.d, lambert(S.siding), 0, S.wall / 2, 0));
    const shape = new THREE.Shape();
    const over = 0.15;
    shape.moveTo(-S.w / 2 - over, 0);
    shape.lineTo(S.w / 2 + over, 0);
    shape.lineTo(0, S.ridge - S.wall);
    shape.closePath();
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: S.d + over * 2, bevelEnabled: false }), lambert(S.roof));
    roof.position.set(0, S.wall - 0.02, -S.d / 2 - over);
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
    const front = S.d / 2;
    group.add(box(1.0, 1.85, 0.05, lambert(S.door), -0.4, 0.95, front + 0.025));
    group.add(box(1.1, 0.06, 0.06, trim, -0.4, 1.9, front + 0.03));
    group.add(box(0.6, 0.5, 0.05, lambert(0x3a4a56), 0.75, 1.35, front + 0.025, false));
    group.add(box(0.7, 0.06, 0.07, trim, 0.75, 1.07, front + 0.035));
    for (const x of [-S.w / 2 + 0.04, S.w / 2 - 0.04]) group.add(box(0.08, S.wall, 0.06, trim, x, S.wall / 2, front + 0.03));
    return group;
}

/** A board fence from x = from to x = to at z, `height` tall, boards every
 *  14 cm as one instanced mesh, with two rails behind. */
function fence(F) {
    const group = new THREE.Group();
    const length = F.to - F.from;
    const count = Math.floor(length / 0.145);
    const boards = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, F.height, 0.025), lambert(F.color), count);
    const m = new THREE.Matrix4();
    for (let k = 0; k < count; k++) {
        m.makeTranslation(F.from + (k + 0.5) * 0.145, F.height / 2, F.z);
        boards.setMatrixAt(k, m);
    }
    boards.castShadow = true;
    boards.receiveShadow = true;
    group.add(boards);
    for (const y of [0.35, F.height - 0.3]) group.add(box(length, 0.08, 0.04, lambert(F.color), (F.from + F.to) / 2, y, F.z - 0.035));
    return group;
}

/** A raised cedar bed of dark soil, a few spent stalks left standing. */
function bed(B, L, random) {
    const group = new THREE.Group();
    const cedar = lambert(L.cedar);
    const h = 0.32;
    for (const s of [-1, 1]) {
        group.add(box(B.w, h, 0.06, cedar, 0, h / 2, s * (B.d / 2 - 0.03)));
        group.add(box(0.06, h, B.d, cedar, s * (B.w / 2 - 0.03), h / 2, 0));
    }
    group.add(box(B.w - 0.1, 0.02, B.d - 0.1, lambert(L.soil), 0, h - 0.04, 0, false));
    const stalk = lambert(0x8a7a4a);
    for (let k = 0; k < 9; k++) {
        const x = (random() - 0.5) * (B.w - 0.3);
        const z = (random() - 0.5) * (B.d - 0.3);
        const tall = 0.2 + random() * 0.35;
        group.add(mesh(new THREE.CylinderGeometry(0.008, 0.012, tall, 4), stalk, x, h + tall / 2 - 0.03, z, false));
    }
    return group;
}

/** A pumpkin patch: vines and broad leaves over the ground, and pumpkins
 *  ripe among them. */
function patch(P, L, random) {
    const group = new THREE.Group();
    const vine = lambert(L.vine);
    for (let k = 0; k < 16; k++) {
        const leaf = mesh(new THREE.SphereGeometry(0.16 + random() * 0.08, 8, 6), vine,
            (random() - 0.5) * P.w, 0.075, (random() - 0.5) * P.d, false);
        leaf.scale.y = 0.3;
        group.add(leaf);
    }
    const colors = [0xe0701f, 0xd9832a, 0xe8892b, 0xefe3c4];
    for (let k = 0; k < 6; k++) {
        group.add(pumpkin({ x: (random() - 0.5) * (P.w - 0.4), z: (random() - 0.5) * (P.d - 0.4), y: 0, r: 0.14 + random() * 0.14, color: colors[k % colors.length] }));
    }
    return group;
}

/** A stone fire pit with logs and a glow of embers, and a curl of smoke. */
function firePit(P, L) {
    const group = new THREE.Group();
    const ring = mesh(new THREE.TorusGeometry(P.r, 0.11, 6, 18), lambert(L.stone), 0, 0.1, 0);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    group.add(mesh(new THREE.CylinderGeometry(P.r - 0.05, P.r - 0.05, 0.04, 16), lambert(0x2a2420), 0, 0.03, 0, false));
    // Three logs lying across it, a third of a turn apart.
    for (let k = 0; k < 3; k++) {
        const turn = new THREE.Group();
        turn.rotation.y = (k / 3) * Math.PI;
        const log = mesh(new THREE.CylinderGeometry(0.05, 0.05, P.r * 1.3, 6), lambert(L.wood), 0, 0.1 + k * 0.03, 0);
        log.rotation.z = Math.PI / 2;
        turn.add(log);
        group.add(turn);
    }
    group.add(mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: L.ember }), 0, 0.12, 0, false));
    const smoke = [];
    for (let k = 0; k < 4; k++) {
        const puff = mesh(new THREE.SphereGeometry(0.12 + k * 0.05, 8, 6), new THREE.MeshLambertMaterial({ color: 0xcfcac2, transparent: true, opacity: 0.35 - k * 0.07, depthWrite: false }), 0, 0.5 + k * 0.45, 0, false);
        group.add(puff);
        smoke.push(puff);
    }
    return { group, smoke };
}

/** A white Adirondack chair, facing +z. */
function chair(L) {
    const group = new THREE.Group();
    const white = lambert(L.chair);
    for (let k = 0; k < 4; k++) group.add(box(0.62, 0.025, 0.11, white, 0, 0.38 - k * 0.02, 0.2 - k * 0.13));
    const back = new THREE.Group();
    back.position.set(0, 0.36, -0.22);
    back.rotation.x = -0.35;
    for (let k = -2; k <= 2; k++) back.add(box(0.1, 0.75 - Math.abs(k) * 0.05, 0.025, white, k * 0.12, 0.37, 0));
    group.add(back);
    for (const s of [-1, 1]) {
        group.add(box(0.12, 0.025, 0.7, white, s * 0.38, 0.6, 0.02));
        group.add(box(0.05, 0.6, 0.05, white, s * 0.38, 0.3, 0.32));
        group.add(box(0.05, 0.38, 0.05, white, s * 0.33, 0.19, -0.2));
    }
    return group;
}

/** A birdbath: a pedestal and a shallow bowl of water. */
function birdbath(L) {
    const group = new THREE.Group();
    const stone = lambert(L.stone);
    group.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 12), stone, 0, 0.04, 0));
    group.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.7, 10), stone, 0, 0.43, 0));
    group.add(mesh(new THREE.CylinderGeometry(0.32, 0.18, 0.1, 16), stone, 0, 0.82, 0));
    group.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.01, 16), new THREE.MeshStandardMaterial({ color: 0x5f7f96, roughness: 0.1, metalness: 0.2 }), 0, 0.87, 0, false));
    return group;
}

/** A wheelbarrow heaped with autumn leaves, facing +z. */
function wheelbarrow(L, random) {
    const group = new THREE.Group();
    const tray = mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.3, 4, 1, true), lambert(0x4a6b5a, { side: THREE.DoubleSide }), 0, 0.5, 0);
    tray.rotation.y = Math.PI / 4;
    tray.scale.set(1, 1, 1.4);
    group.add(tray);
    const leaves = [0xc8321f, 0xe0662a, 0xd9a43a, 0x9c6430];
    for (let k = 0; k < 10; k++) {
        const heap = mesh(new THREE.SphereGeometry(0.12, 6, 5), lambert(leaves[k % leaves.length]), (random() - 0.5) * 0.4, 0.62 + random() * 0.08, (random() - 0.5) * 0.6, false);
        heap.scale.y = 0.45;
        group.add(heap);
    }
    const wheel = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 14), lambert(L.iron), 0, 0.17, 0.62);
    wheel.rotation.z = Math.PI / 2;
    group.add(wheel);
    for (const s of [-1, 1]) {
        const handle = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6), lambert(L.wood), s * 0.22, 0.42, -0.25);
        handle.rotation.x = Math.PI / 2 - 0.25;
        group.add(handle);
        group.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), lambert(L.iron), s * 0.2, 0.17, -0.3));
    }
    return group;
}

/** Build the side yard. Returns { group, update(time, motion) } (the smoke
 *  drifts). */
export function buildBackyard(config) {
    const Y = config.yard;
    const K = Y.backyard;
    const L = K.look;
    const group = new THREE.Group();
    group.name = 'backyard';
    const random = makeRandom(4243);
    const trim = lambert(config.look.trim);
    const s = shed(K.shed, trim);
    s.position.set(K.shed.x, 0, K.shed.z);
    group.add(s);
    group.add(fence(K.fence));
    for (const b of K.beds) {
        const g = bed(b, L, random);
        g.position.set(b.x, 0, b.z);
        group.add(g);
    }
    const p = patch(K.patch, L, random);
    p.position.set(K.patch.x, 0, K.patch.z);
    group.add(p);
    const pit = firePit(K.firePit, L);
    pit.group.position.set(K.firePit.x, 0, K.firePit.z);
    group.add(pit.group);
    for (const c of K.chairs) {
        const g = chair(L);
        g.position.set(c.x, 0, c.z);
        g.rotation.y = c.turn;
        group.add(g);
    }
    const bath = birdbath(L);
    bath.position.set(K.birdbath.x, 0, K.birdbath.z);
    group.add(bath);
    const barrow = wheelbarrow(L, random);
    barrow.position.set(K.wheelbarrow.x, 0, K.wheelbarrow.z);
    barrow.rotation.y = K.wheelbarrow.turn;
    group.add(barrow);
    const st = K.stones;
    for (let k = 0; k < st.count; k++) {
        const u = (k + 0.5) / st.count;
        const stone = mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.04, 9), lambert(L.stone),
            st.from.x + (st.to.x - st.from.x) * u, 0.01, st.from.z + (st.to.z - st.from.z) * u, false);
        stone.rotation.y = random() * 3;
        group.add(stone);
    }

    function update(time, motion = 1) {
        pit.smoke.forEach((puff, k) => {
            const u = ((time * 0.25 * motion + k / pit.smoke.length) % 1 + 1) % 1;
            puff.position.set(0.15 * Math.sin(time * 0.4 + k), 0.4 + u * 1.8, 0.1 * u);
            puff.scale.setScalar(0.8 + u * 1.2);
            puff.material.opacity = 0.32 * (1 - u);
        });
    }
    update(0, 1);
    return { group, update };
}
