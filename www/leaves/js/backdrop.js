// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * backdrop.js - the rest of the neighborhood, behind the block (Steve's QA,
 * 2026-10-08: "could we add more background details in the area to the left
 * of the user's house behind the green shed and fence? ... the area still
 * looks too empty", and "the goal is to make the rest of the environment
 * feel as real and life-like as possible").
 *
 * The top of the view looks some 45 m back, and the block's lawn stopped at
 * 20, so a seventh of the screen was haze. Now, from near to far:
 *   - the back lot line: a weathered board fence along it, and wooden
 *     utility poles with crossarms, insulators, a transformer and sagging
 *     wires, the way a suburb's power runs behind its houses;
 *   - in the sage house's back yard, behind the green shed's fence, a swing
 *     set and a trampoline (and a tall pine, config.yard.trees);
 *   - the next street's houses, their backs to us: one and two stories, a
 *     gable either way, rows of windows, decks with sliding doors, brick
 *     chimneys, and side fences between their lots;
 *   - a treeline along the horizon in October colors with evergreens among
 *     them, soft in the fog.
 *
 * ALL OF IT IS FAR PAST THE SIM'S GROUND, so no leaf meets it, and none of it
 * casts a shadow (it is outside the sun's shadow box anyway). Built from a
 * handful of instanced meshes, so it costs a few draws, not hundreds.
 *
 * PURE PARTS (backHouses, treeline, poleWires) are plain numbers.
 */
import { makeRandom } from './sim.min.js';

const TAU = Math.PI * 2;
const pick = (list, random) => list[Math.floor(random() * list.length) % list.length];

/**
 * The next street's houses, their backs facing us: one a lot of `B.lot`
 * meters from `B.from` to `B.to`. Each { x (middle), back (its back wall's
 * z), w, d, stories, wall, ridge, along ('x' a ridge across, 'z' a gable end
 * toward us), siding, roof, deck, chimney (-1, 0, 1: which side) }.
 */
export function backHouses(B) {
    const random = makeRandom(B.seed);
    const out = [];
    for (let x = B.from; x <= B.to + 1e-6; x += B.lot) {
        const stories = random() < 0.55 ? 2 : 1;
        const wall = stories === 2 ? 5.6 : 3;
        const w = B.width[0] + random() * (B.width[1] - B.width[0]);
        const along = random() < 0.75 ? 'x' : 'z';
        out.push({
            x: x + (random() * 2 - 1) * 0.8,
            back: B.backZ + (random() * 2 - 1) * B.jitter,
            w,
            d: 9 + random() * 1.5,
            stories,
            wall,
            ridge: wall + (along === 'x' ? 2.4 : 3) + random() * 0.6,
            along,
            siding: pick(B.sidings, random),
            roof: pick(B.roofs, random),
            deck: random() < 0.55,
            chimney: random() < 0.4 ? (random() < 0.5 ? -1 : 1) : 0
        });
    }
    return out;
}

/** The treeline's crowns: rows back from `T.near` to `T.far`, from `T.minX`
 *  to `T.maxX`, in clumps. Each { x, y, z, r, color, evergreen }. */
export function treeline(T) {
    const random = makeRandom(T.seed);
    const out = [];
    for (let k = 0; k < T.count; k++) {
        const x = T.minX + random() * (T.maxX - T.minX);
        const z = T.near + random() * (T.far - T.near);
        const evergreen = random() < T.evergreens;
        const r = T.size[0] + random() * (T.size[1] - T.size[0]);
        const tall = r * (evergreen ? 2.4 : 1.15);
        out.push({
            x, z, r, evergreen,
            y: T.trunk + tall * 0.55 + random() * 1.5,
            tall,
            color: evergreen ? pick(T.greens, random) : pick(T.autumn, random)
        });
    }
    return out;
}

/** A wire hung from a to b ({ x, y, z }), sagging `sag` at its middle, as
 *  `n` straight pieces: [[x, y, z], ...]. */
export function sagLine(a, b, sag, n = 12) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
        const u = i / n;
        pts.push([a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u - sag * 4 * u * (1 - u), a.z + (b.z - a.z) * u]);
    }
    return pts;
}

/** The wires between the poles (`P`): three on the crossarm and a cable
 *  lower down, pole to pole. Returns a list of sagging lines. */
export function poleWires(P) {
    const lines = [];
    const heights = [
        { dx: -P.arm / 2 + 0.1, y: P.height - 0.55 },
        { dx: 0, y: P.height - 0.1 },
        { dx: P.arm / 2 - 0.1, y: P.height - 0.55 },
        { dx: 0, y: P.cable }
    ];
    for (let k = 0; k + 1 < P.xs.length; k++) {
        for (const h of heights) {
            lines.push(sagLine({ x: P.xs[k] + h.dx, y: h.y, z: P.z }, { x: P.xs[k + 1] + h.dx, y: h.y, z: P.z }, h.y === P.cable ? P.sag * 1.4 : P.sag));
        }
    }
    return lines;
}

// ---- Drawing -------------------------------------------------------------------

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

/** Boxes, one instanced mesh, each { x, y, z, w, h, d, color, turn }. */
function boxes(list, material, name) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, Math.max(1, list.length));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    list.forEach((b, i) => {
        q.setFromAxisAngle(up, b.turn || 0);
        m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
        mesh.setMatrixAt(i, m);
        if (b.color !== undefined) mesh.setColorAt(i, c.setHex(b.color));
    });
    mesh.count = list.length;
    mesh.name = name;
    return mesh;
}

/** A gable prism one unit each way, its ridge along x at y = 1, its eaves
 *  at y = 0 and z = +-0.5. */
function prismGeometry() {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0);
    shape.lineTo(0.5, 0);
    shape.lineTo(0, 1);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    // The shape is in x-y, extruded along z: turn it so the ridge runs along
    // x and the slopes face +z and -z, centered.
    g.translate(0, 0, -0.5);
    g.rotateY(Math.PI / 2);
    return g;
}

/** The next street's houses, as a handful of instanced meshes. */
function buildHouses(B, look) {
    const group = new THREE.Group();
    group.name = 'back-houses';
    const houses = backHouses(B);
    const walls = [];
    const roofs = [];
    const glass = [];
    const trim = [];
    const wood = [];
    const brick = [];
    const over = 0.35;
    for (const h of houses) {
        const cz = h.back - h.d / 2;
        walls.push({ x: h.x, y: h.wall / 2, z: cz, w: h.w, h: h.wall, d: h.d, color: h.siding });
        // A gable end toward us has a triangle of wall over the back wall.
        if (h.along === 'x') {
            roofs.push({ x: h.x, y: h.wall, z: cz, w: h.w + over * 2, h: h.ridge - h.wall, d: h.d + over * 2, color: h.roof, turn: 0 });
        } else {
            roofs.push({ x: h.x, y: h.wall, z: cz, w: h.d + over * 2, h: h.ridge - h.wall, d: h.w + over * 2, color: h.roof, turn: Math.PI / 2 });
        }
        // Windows across the back, story by story, white framed.
        for (let s = 0; s < h.stories; s++) {
            const y = 1.6 + s * 2.7;
            const n = Math.max(1, Math.floor((h.w - 1.6) / 2.6));
            for (let k = 0; k < n; k++) {
                const x = h.x - h.w / 2 + 0.8 + (k + 0.5) * ((h.w - 1.6) / n);
                // The ground floor's middle is the deck's sliding door.
                if (s === 0 && h.deck && k === Math.floor(n / 2)) continue;
                trim.push({ x, y, z: h.back + 0.03, w: 1.26, h: 1.46, d: 0.06, color: 0xf2efe8 });
                glass.push({ x, y, z: h.back + 0.05, w: 1.1, h: 1.3, d: 0.04 });
            }
        }
        if (h.deck) {
            const dx = h.x;
            trim.push({ x: dx, y: 1.15, z: h.back + 0.03, w: 2.0, h: 2.3, d: 0.06, color: 0xf2efe8 });
            glass.push({ x: dx, y: 1.15, z: h.back + 0.05, w: 1.84, h: 2.14, d: 0.04 });
            const dw = 4.8;
            const dd = 3.2;
            wood.push({ x: dx, y: 0.28, z: h.back + dd / 2, w: dw, h: 0.12, d: dd, color: B.deck });
            // A rail round the deck's three open sides, and its posts.
            wood.push({ x: dx, y: 1.0, z: h.back + dd, w: dw, h: 0.06, d: 0.06, color: B.deck });
            for (const s of [-1, 1]) wood.push({ x: dx + (s * dw) / 2, y: 1.0, z: h.back + dd / 2, w: 0.06, h: 0.06, d: dd, color: B.deck });
            for (const px of [-dw / 2, -dw / 6, dw / 6, dw / 2]) wood.push({ x: dx + px, y: 0.62, z: h.back + dd, w: 0.08, h: 0.8, d: 0.08, color: B.deck });
            for (const s of [-1, 1]) wood.push({ x: dx + (s * dw) / 2, y: 0.62, z: h.back + 0.4, w: 0.08, h: 0.8, d: 0.08, color: B.deck });
        } else {
            // A plain back door and its step.
            trim.push({ x: h.x + h.w * 0.22, y: 1.1, z: h.back + 0.03, w: 1.05, h: 2.15, d: 0.06, color: B.door });
        }
        if (h.chimney) {
            const x = h.x + h.chimney * (h.w / 2 + 0.25);
            brick.push({ x, y: (h.ridge + 0.7) / 2, z: cz, w: 0.6, h: h.ridge + 0.7, d: 0.9 });
        }
    }
    const meshes = [
        boxes(walls, lambert(0xffffff), 'back-walls'),
        boxes(trim, lambert(0xffffff), 'back-trim'),
        boxes(glass, new THREE.MeshLambertMaterial({ color: look.glass }), 'back-glass'),
        boxes(wood, lambert(0xffffff), 'back-decks'),
        boxes(brick, lambert(look.brick), 'back-chimneys')
    ];
    const prism = prismGeometry();
    const roofMesh = new THREE.InstancedMesh(prism, lambert(0xffffff), roofs.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    roofs.forEach((r, i) => {
        q.setFromAxisAngle(up, r.turn);
        m.compose(new THREE.Vector3(r.x, r.y, r.z), q, new THREE.Vector3(r.w, r.h, r.d));
        roofMesh.setMatrixAt(i, m);
        roofMesh.setColorAt(i, c.setHex(r.color));
    });
    roofMesh.name = 'back-roofs';
    meshes.push(roofMesh);
    // A gable end toward us: the wall's triangle under the roof's end.
    const gables = houses.filter((h) => h.along === 'z');
    if (gables.length) {
        const tri = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]));
        const ends = new THREE.InstancedMesh(tri, lambert(0xffffff, { side: THREE.DoubleSide }), gables.length);
        gables.forEach((h, i) => {
            m.compose(new THREE.Vector3(h.x, h.wall, h.back + 0.01), new THREE.Quaternion(), new THREE.Vector3(h.w, h.ridge - h.wall, 1));
            ends.setMatrixAt(i, m);
            ends.setColorAt(i, c.setHex(h.siding));
        });
        ends.name = 'back-gables';
        meshes.push(ends);
    }
    meshes.forEach((mesh) => {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        group.add(mesh);
    });
    return group;
}

/**
 * Where the back lot line's fence runs, as [[x0, x1], ...]: from B.minX to
 * B.maxX, except across the next street's lot that `openAt` (an x) falls
 * in. The swing set and the trampoline stand in front of that lot's house,
 * and a fence between them and it read as an extra fence (Steve's QA,
 * 2026-10-08), so that yard runs open up to them, between its side fences.
 */
export function lotLineRuns(B, openAt = null) {
    if (openAt === null) return [[B.minX, B.maxX]];
    const first = B.from - B.lot / 2;
    const k = Math.floor((openAt - first) / B.lot);
    const x0 = first + k * B.lot;
    const x1 = x0 + B.lot;
    return [[B.minX, x0], [x1, B.maxX]].filter(([a, b]) => b > a);
}

/** Board fences: along the back lot line (open behind `openAt`), and
 *  between the next street's lots back to their houses. Panels `F.panel`
 *  meters long, a post at each. */
function buildFences(B, F, openAt = null) {
    const random = makeRandom(B.seed + 5);
    const panels = [];
    const posts = [];
    const run = (x0, z0, x1, z1) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const n = Math.max(1, Math.round(len / F.panel));
        const turn = Math.atan2(-(z1 - z0), x1 - x0);
        for (let k = 0; k < n; k++) {
            const u = (k + 0.5) / n;
            const shade = 1 + (random() * 2 - 1) * 0.08;
            const c = new THREE.Color(F.color).multiplyScalar(shade).getHex();
            panels.push({ x: x0 + (x1 - x0) * u, y: F.height / 2, z: z0 + (z1 - z0) * u, w: len / n - 0.02, h: F.height, d: 0.035, color: c, turn });
        }
        for (let k = 0; k <= n; k++) {
            const u = k / n;
            posts.push({ x: x0 + (x1 - x0) * u, y: (F.height + 0.1) / 2, z: z0 + (z1 - z0) * u, w: 0.1, h: F.height + 0.1, d: 0.1, color: new THREE.Color(F.color).multiplyScalar(0.8).getHex() });
        }
    };
    for (const [x0, x1] of lotLineRuns(B, openAt)) run(x0, F.z, x1, F.z);
    for (let x = B.from - B.lot / 2; x <= B.to + B.lot / 2 + 1e-6; x += B.lot) run(x, F.z, x, B.backZ - 1);
    const group = new THREE.Group();
    group.name = 'back-fences';
    group.add(boxes(panels, lambert(0xffffff), 'fence-panels'));
    group.add(boxes(posts, lambert(0xffffff), 'fence-posts'));
    return group;
}

/** The utility poles and their wires. */
function buildPoles(P) {
    const group = new THREE.Group();
    group.name = 'utility-poles';
    const wood = lambert(P.wood);
    const n = P.xs.length;
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.15, P.height, 8), wood, n);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(P.arm, 0.11, 0.11), wood, n * 2);
    const insulators = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.06, 0.2, 8), lambert(P.insulator), n * 3);
    const m = new THREE.Matrix4();
    P.xs.forEach((x, k) => {
        poles.setMatrixAt(k, m.makeTranslation(x, P.height / 2, P.z));
        arms.setMatrixAt(k * 2, m.makeTranslation(x, P.height - 0.65, P.z));
        // A shorter brace arm under it for the cable's bracket.
        arms.setMatrixAt(k * 2 + 1, m.compose(new THREE.Vector3(x, P.cable, P.z), new THREE.Quaternion(), new THREE.Vector3(0.25, 1, 1)));
        insulators.setMatrixAt(k * 3, m.makeTranslation(x - P.arm / 2 + 0.1, P.height - 0.5, P.z));
        insulators.setMatrixAt(k * 3 + 1, m.makeTranslation(x, P.height + 0.02, P.z));
        insulators.setMatrixAt(k * 3 + 2, m.makeTranslation(x + P.arm / 2 - 0.1, P.height - 0.5, P.z));
    });
    for (const mesh of [poles, arms, insulators]) group.add(mesh);
    // A transformer on one of them.
    const T = P.transformer;
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.95, 14), lambert(P.can));
    can.position.set(P.xs[T] + 0.42, P.height - 2.4, P.z);
    group.add(can);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 14), lambert(P.can));
    lid.position.set(P.xs[T] + 0.42, P.height - 1.9, P.z);
    group.add(lid);
    // The wires, one line drawing.
    const pts = [];
    for (const line of poleWires(P)) {
        for (let i = 0; i + 1 < line.length; i++) pts.push(...line[i], ...line[i + 1]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: P.wire })));
    group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    return group;
}

/** A swing set: an A-frame each end, a top bar, two swings on chains. */
function swingSet(S) {
    const group = new THREE.Group();
    const metal = lambert(S.frame);
    const half = S.width / 2;
    const legs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, S.height / Math.cos(0.32), 8), metal, 4);
    const m = new THREE.Matrix4();
    let k = 0;
    for (const x of [-half, half]) {
        for (const s of [-1, 1]) {
            m.compose(new THREE.Vector3(x, S.height / 2, (s * Math.tan(0.32) * S.height) / 2),
                new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), s * 0.32), new THREE.Vector3(1, 1, 1));
            legs.setMatrixAt(k++, m);
        }
    }
    group.add(legs);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, S.width + 0.2, 8), metal);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = S.height;
    group.add(bar);
    const chains = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.008, S.height - 0.5, 4), lambert(0x6d6f72), 4);
    const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.04, 0.22), lambert(S.seat), 2);
    k = 0;
    [-S.width / 4, S.width / 4].forEach((x, i) => {
        for (const s of [-0.22, 0.22]) chains.setMatrixAt(k++, m.makeTranslation(x + s, (S.height + 0.5) / 2, 0));
        seats.setMatrixAt(i, m.makeTranslation(x, 0.5, 0));
    });
    group.add(chains);
    group.add(seats);
    group.position.set(S.x, 0, S.z);
    group.rotation.y = S.turn;
    return group;
}

/** A round trampoline with its padded rim, legs, and a dark safety net. */
function trampoline(T) {
    const group = new THREE.Group();
    const mat = new THREE.Mesh(new THREE.CircleGeometry(T.r * 0.92, 32), lambert(0x1c1d1f));
    mat.rotation.x = -Math.PI / 2;
    mat.position.y = 0.85;
    group.add(mat);
    const pad = new THREE.Mesh(new THREE.TorusGeometry(T.r, 0.09, 6, 36), lambert(T.pad));
    pad.rotation.x = Math.PI / 2;
    pad.position.y = 0.86;
    group.add(pad);
    const legs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), lambert(0x8a8d90), 6);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 6), lambert(0x1c1d1f), 6);
    const m = new THREE.Matrix4();
    for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        legs.setMatrixAt(k, m.makeTranslation(Math.cos(a) * T.r, 0.425, Math.sin(a) * T.r));
        poles.setMatrixAt(k, m.makeTranslation(Math.cos(a) * T.r, 1.7, Math.sin(a) * T.r));
    }
    group.add(legs);
    group.add(poles);
    const net = new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r, 1.6, 32, 1, true),
        new THREE.MeshLambertMaterial({ color: 0x1c1d1f, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
    net.position.y = 0.85 + 0.8;
    group.add(net);
    group.position.set(T.x, 0, T.z);
    return group;
}

/** The treeline's crowns, one instanced mesh, in the fog. */
function buildTreeline(T) {
    const crowns = treeline(T);
    const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), lambert(0xffffff), crowns.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    crowns.forEach((t, i) => {
        m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.evergreen ? t.r * 0.7 : t.r, t.tall * 0.55, t.evergreen ? t.r * 0.7 : t.r));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.setHex(t.color));
    });
    mesh.name = 'treeline';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
}

/** Everything behind the block. `config.yard.backdrop` says where. Returns
 *  the group, named 'backdrop'. */
export function buildBackdrop(config) {
    const B = config.yard.backdrop;
    const look = config.look;
    const group = new THREE.Group();
    group.name = 'backdrop';
    group.add(buildHouses(B.houses, look));
    // Open behind the swing set and the trampoline, which belong to the
    // house there.
    group.add(buildFences(B.houses, B.fence, (B.swingSet.x + B.trampoline.x) / 2));
    group.add(buildPoles(B.poles));
    group.add(buildTreeline(B.treeline));
    const play = new THREE.Group();
    play.name = 'play';
    play.add(swingSet(B.swingSet));
    play.add(trampoline(B.trampoline));
    play.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    group.add(play);
    return group;
}
