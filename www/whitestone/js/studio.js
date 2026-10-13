// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * studio.js - The Whitestone studio: the room and everything standing in it
 * (PLANNING 6.1).
 *
 * A bright, modern room of white plaster, pale stone and brushed aluminum,
 * 12 m by 8 m. Across the room from the arrival view, a curtain wall of
 * floor-to-ceiling glass looks out on the street (street.js), and the
 * morning sun comes in through it. In the middle of the room stands the
 * plinth that carries the house model (model.js, M2 piece 3). The service
 * menu hangs on the plaster pier left of the glass and the plan board on
 * the pier to its right, both facing the room. The reception desk is near
 * the entrance on the left, the printer on its console on the right, slim
 * linear pendants hang over the plinth and the desk, and plants in white
 * stone planters soften the corners.
 *
 * DRAWN IN FEW MESHES. Everything that never moves or changes is folded
 * into one mesh per material (mergeByMaterial), so the whole room is a
 * handful of draw calls on a phone. The things a visitor can pick (the
 * plinth, the desk, the printer, the menu, the board) stay groups of their
 * own, each merged inside, and carry their pick key for M2 piece 4.
 *
 * The layout is plain numbers first (shellBoxes, footprints), so the tests
 * check the room is closed where it should be and open at the glass, and
 * that nothing stands where a camera does, without a renderer.
 *
 * Every number is in CONFIG.room and CONFIG.studio, or named here.
 */

/** How thick the walls, floor and ceiling are, outward from the room. Only
 *  the glass side's edge is ever seen, from the street. */
export const WALL = 0.2;

/** The room's finishes. Steve's modern palette: white, aluminum, stone. */
export const FINISH = {
    white: '#F6F5F2',
    stone: '#ECE9E3',
    aluminum: '#C9CCD0',
    graphite: '#2A2D31',
    soil: '#3B342E',
    screen: '#FAFAF8',
    diffuser: '#FFF6E8',
    stem: '#5B544C',
    leaves: ['#4F7A3E', '#5E8A47', '#6E9852', '#3F6A35']
};

// ---- The shell (pure) -------------------------------------------------------

/** Where the glass's mullions stand: every `mullionEvery` meters from x0,
 *  and always at both ends. */
export function mullionXs(glass) {
    const xs = [];
    const span = glass.x1 - glass.x0;
    const n = Math.max(1, Math.round(span / glass.mullionEvery));
    for (let i = 0; i <= n; i++) xs.push(glass.x0 + (span * i) / n);
    return xs;
}

/**
 * The studio's shell as boxes by their corners: `{ name, finish, min, max }`,
 * meters. The floor and ceiling, the two end walls and the entrance wall
 * (+z) whole, the glass wall (-z) as two plaster piers either side of the
 * opening, the aluminum frame of the curtain wall, and a dark shadow-gap
 * reveal where every wall meets the floor.
 */
export function shellBoxes(room) {
    const hw = room.width / 2;
    const hd = room.depth / 2;
    const h = room.height;
    const T = WALL;
    const g = room.glass;
    const f = g.frame / 2;
    const fd = g.frameDepth / 2;
    const r = room.reveal;
    const boxes = [
        { name: 'floor', finish: 'floor', min: [-hw - T, -T, -hd - T], max: [hw + T, 0, hd + T] },
        { name: 'ceiling', finish: 'ceiling', min: [-hw - T, h, -hd - T], max: [hw + T, h + T, hd + T] },
        { name: 'left', finish: 'walls', min: [-hw - T, 0, -hd - T], max: [-hw, h, hd + T] },
        { name: 'right', finish: 'walls', min: [hw, 0, -hd - T], max: [hw + T, h, hd + T] },
        { name: 'entrance', finish: 'walls', min: [-hw, 0, hd], max: [hw, h, hd + T] },
        { name: 'pier-left', finish: 'walls', min: [-hw, 0, -hd - T], max: [g.x0, h, -hd] },
        { name: 'pier-right', finish: 'walls', min: [g.x1, 0, -hd - T], max: [hw, h, -hd] },
        { name: 'head', finish: 'aluminum', min: [g.x0, h - g.frame, -hd - fd], max: [g.x1, h, -hd + fd] },
        { name: 'sill', finish: 'aluminum', min: [g.x0, 0, -hd - fd], max: [g.x1, g.frame, -hd + fd] },
        // The reveals, a few millimeters proud of each wall.
        { name: 'reveal-left', finish: 'reveal', min: [-hw, 0, -hd], max: [-hw + 0.004, r, hd] },
        { name: 'reveal-right', finish: 'reveal', min: [hw - 0.004, 0, -hd], max: [hw, r, hd] },
        { name: 'reveal-entrance', finish: 'reveal', min: [-hw, 0, hd - 0.004], max: [hw, r, hd] },
        { name: 'reveal-pier-left', finish: 'reveal', min: [-hw, 0, -hd], max: [g.x0, r, -hd + 0.004] },
        { name: 'reveal-pier-right', finish: 'reveal', min: [g.x1, 0, -hd], max: [hw, r, -hd + 0.004] }
    ];
    mullionXs(g).forEach((x, i) => {
        boxes.push({ name: `mullion-${i}`, finish: 'aluminum', min: [x - f, 0, -hd - fd], max: [x + f, h, -hd + fd] });
    });
    return boxes;
}

/** The glass opening: what the street is seen through. */
export function glassOpening(room) {
    return { x0: room.glass.x0, x1: room.glass.x1, y0: 0, y1: room.height, z: -room.depth / 2 };
}

/**
 * What stands on the floor, as rectangles on the floor plan: `{ name, x0,
 * x1, z0, z1, top }`. The tests keep every station's eye out of them and
 * every one of them inside the room.
 */
export function footprints(config) {
    const s = config.studio;
    const rect = (name, x, z, w, d, top) => ({ name, x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, top });
    const out = [
        rect('plinth', s.plinth.x, s.plinth.z, s.plinth.width, s.plinth.depth, s.plinth.height),
        rect('desk', s.desk.x, s.desk.z, s.desk.length, s.desk.depth, s.desk.height),
        rect('console', s.console.x, s.console.z, s.console.length, s.console.depth, s.console.height + s.printer.height)
    ];
    s.plants.forEach(([kind, x, z], i) => {
        const p = PLANTS[kind];
        out.push(rect(`plant-${i}`, x, z, p.width, p.depth, p.top));
    });
    return out;
}

/**
 * Where each touch point's halo sits, in world meters (marks.js): over the
 * desk where the concierge will stand (M6 moves it to the concierge's
 * head), on the faces of the menu and the board, and over the printer. The
 * model's halo follows the model (model.js anchor).
 */
export function anchorsFor(config) {
    const { room, studio: s } = config;
    const wall = -room.depth / 2;
    return {
        desk: [s.desk.x, s.desk.height + 0.38, s.desk.z - 0.12],
        menu: [s.menu.x, s.menu.y, wall + 0.05],
        board: [s.board.x, s.board.y, wall + 0.08],
        printer: [s.console.x, s.console.height + s.printer.height + 0.12, s.console.z]
    };
}

/**
 * What a ray's hits (nearest first) say was tapped: the first one shown
 * decides, so a wall in front of the menu is a wall. Returns `{ key, hit }`
 * or null. A hit on something hidden (three's raycaster does not skip
 * them) is passed over.
 */
export function firstPick(hits) {
    for (const hit of hits || []) {
        let shown = true;
        for (let o = hit.object; o; o = o.parent) if (o.visible === false) { shown = false; break; }
        if (!shown) continue;
        const key = pickOf(hit.object);
        return key ? { key, hit } : null;
    }
    return null;
}

/**
 * Whether something stands between `eye` and `point` (THREE.Vector3s),
 * other than the thing whose key is `key`: a halo behind the desk is hidden,
 * a halo on the menu's own face is not. `objects` are what can stand in the
 * way. Stops a few centimeters short of the point.
 */
export function hiddenFrom(raycaster, eye, point, objects, key) {
    const to = point.clone().sub(eye);
    const far = to.length();
    raycaster.set(eye, to.normalize());
    raycaster.far = Math.max(0, far - 0.03);
    const hits = raycaster.intersectObjects(objects, true);
    raycaster.far = Infinity;
    return hits.some((hit) => pickOf(hit.object) !== key);
}

/** The pick key of the nearest ancestor (or the object itself) that has
 *  one, or null. */
export function pickOf(object) {
    for (let o = object; o; o = o.parent) {
        if (o.userData && o.userData.pick) return o.userData.pick;
    }
    return null;
}

/** The planters' sizes, meters: a round planter for a small tree, a long
 *  low trough for grasses. `top` is the plant's height. */
export const PLANTS = {
    tree: { width: 0.5, depth: 0.5, planter: 0.5, top: 2.0 },
    grass: { width: 0.9, depth: 0.38, planter: 0.4, top: 1.0 }
};

/** A seeded random number (mulberry32), so every plant has the same leaves
 *  on every visit. */
export function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---- Contact shadows (pure), Corner Office's ---------------------------------

/**
 * A soft dark patch under a thing that stands on the floor, where the sun's
 * shadows do not reach: a grid of `w` by `d` meters whose darkness `alpha`
 * fades to nothing over its outer `soft` meters. Returns the grid's x and z
 * stops (fine at the edges, none needed across the flat middle) and the
 * fade at any point.
 */
export function contactGrid(patch) {
    const { w, d, soft, alpha } = patch;
    const stops = (half) => {
        const s = Math.min(soft, half);
        return [-half, -half + s / 2, -half + s, 0, half - s, half - s / 2, half].filter((v, i, all) => i === 0 || v > all[i - 1] + 1e-9);
    };
    const xs = stops(w / 2);
    const zs = stops(d / 2);
    const fade = (u, v) => {
        const dx = Math.max(0, Math.abs(u) - (w / 2 - soft));
        const dz = Math.max(0, Math.abs(v) - (d / 2 - soft));
        const t = Math.min(1, Math.hypot(dx, dz) / soft);
        return alpha * (1 - t * t * (3 - 2 * t));
    };
    return { xs, zs, fade };
}

/** How high over the floor a contact patch lies, meters. */
export const CONTACT_LIFT = 0.004;

// ---- Building it (three) ------------------------------------------------------

function mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });
}

/** A box by its min and max corners. */
function slab(min, max, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]), material);
    mesh.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    return mesh;
}

function box(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    return mesh;
}

/**
 * A box with its edges and corners rounded by `r` (Corner Office: knife-sharp
 * edges are much of what reads as computer-made). A rounded rectangle
 * extruded along the box's thinnest side with a bevel inside the outline,
 * so the outside is exactly `w` by `h` by `d`. Centered on the origin.
 */
export function roundedBoxGeometry(w, h, d, r) {
    const size = [w, h, d];
    const axis = size.indexOf(Math.min(...size));
    const [a, b] = [0, 1, 2].filter((i) => i !== axis);
    const round = Math.max(0.0005, Math.min(r, size[a] * 0.49, size[b] * 0.49, size[axis] * 0.49));
    const [sw, sh] = [size[a], size[b]];
    const shape = new THREE.Shape();
    const x0 = -sw / 2;
    const y0 = -sh / 2;
    shape.moveTo(x0 + round, y0);
    shape.lineTo(x0 + sw - round, y0);
    shape.quadraticCurveTo(x0 + sw, y0, x0 + sw, y0 + round);
    shape.lineTo(x0 + sw, y0 + sh - round);
    shape.quadraticCurveTo(x0 + sw, y0 + sh, x0 + sw - round, y0 + sh);
    shape.lineTo(x0 + round, y0 + sh);
    shape.quadraticCurveTo(x0, y0 + sh, x0, y0 + sh - round);
    shape.lineTo(x0, y0 + round);
    shape.quadraticCurveTo(x0, y0, x0 + round, y0);
    // A bevel a little under the corners' radius, or the broad faces fold
    // over at the corners (measured in Corner Office, 2026-09-25).
    const bevel = round * 0.6;
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: size[axis] - 2 * bevel,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelOffset: -bevel,
        bevelSegments: 3,
        curveSegments: 3
    });
    // Onto the box's own axes, one flipped where the permutation is odd so
    // no face turns inside out.
    const odd = axis === 1;
    const basis = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    basis[0].setComponent(a, 1);
    basis[1].setComponent(b, odd ? -1 : 1);
    basis[2].setComponent(axis, 1);
    geometry.applyMatrix4(new THREE.Matrix4().makeBasis(basis[0], basis[1], basis[2]));
    geometry.computeBoundingBox();
    const c = geometry.boundingBox.getCenter(new THREE.Vector3());
    geometry.translate(-c.x, -c.y, -c.z);
    return geometry;
}

function roundedBox(w, h, d, r, material, x, y, z) {
    const mesh = new THREE.Mesh(roundedBoxGeometry(w, h, d, r), material);
    mesh.position.set(x, y, z);
    return mesh;
}

function cylinder(rTop, rBottom, h, material, x, y, z, segments = 16) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
    mesh.position.set(x, y, z);
    return mesh;
}

/**
 * Fold meshes that share a material into one mesh each, their places baked
 * in (Corner Office's). Every mesh is a draw call on every frame, which on a
 * phone is a budget better spent elsewhere.
 */
export function mergeByMaterial(meshes, name = 'merged') {
    const byMaterial = new Map();
    for (const mesh of meshes) {
        mesh.updateMatrix();
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        g.applyMatrix4(mesh.matrix);
        const material = mesh.material;
        if (!byMaterial.has(material)) byMaterial.set(material, []);
        byMaterial.get(material).push(g);
    }
    return [...byMaterial].map(([material, parts]) => {
        const merged = new THREE.BufferGeometry();
        for (const attr of ['position', 'normal', 'uv']) {
            if (!parts.every((p) => p.attributes[attr])) continue;
            const arrays = parts.map((p) => p.attributes[attr].array);
            const array = new Float32Array(arrays.reduce((n, x) => n + x.length, 0));
            let at = 0;
            for (const x of arrays) {
                array.set(x, at);
                at += x.length;
            }
            merged.setAttribute(attr, new THREE.BufferAttribute(array, parts[0].attributes[attr].itemSize));
        }
        for (const p of parts) p.dispose();
        const mesh = new THREE.Mesh(merged, material);
        mesh.name = name;
        return mesh;
    });
}

function tag(group, key) {
    group.userData.pick = key;
    group.name = key;
    return group;
}

/** A group of meshes merged by material, tagged with a pick key. */
function pickable(key, meshes) {
    const group = new THREE.Group();
    for (const m of mergeByMaterial(meshes, key)) group.add(m);
    return tag(group, key);
}

/** The room's materials, one each, shared by everything that wears them. */
function materials(room) {
    const physical = (color, roughness, clearcoat, name) => {
        const m = new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat, clearcoatRoughness: 0.3 });
        m.name = name;
        return m;
    };
    return {
        floor: mat(room.floor, { roughness: 0.5 }),
        walls: mat(room.walls, { roughness: 0.92 }),
        ceiling: mat(room.ceiling, { roughness: 0.95 }),
        reveal: mat(FINISH.graphite, { roughness: 0.9 }),
        aluminum: new THREE.MeshPhysicalMaterial({ color: FINISH.aluminum, metalness: 1, roughness: 0.32 }),
        white: physical(FINISH.white, 0.42, 0.15, 'white'),
        stone: physical(FINISH.stone, 0.35, 0.3, 'stone'),
        graphite: mat(FINISH.graphite, { roughness: 0.5, metalness: 0.3 }),
        soil: mat(FINISH.soil, { roughness: 1 }),
        stem: mat(FINISH.stem, { roughness: 0.9 }),
        diffuser: mat(FINISH.diffuser, { roughness: 0.6, emissive: FINISH.diffuser, emissiveIntensity: 0.55 }),
        leaves: FINISH.leaves.map((c) => mat(c, { roughness: 0.75, flatShading: true }))
    };
}

/** The plinth for the house model: a block of white stone floating on a
 *  dark recessed toe, its top at `plinth.height`. */
function buildPlinth(p, m) {
    const toe = 0.07;
    const inset = 0.05;
    return pickable('model', [
        roundedBox(p.width, p.height - toe, p.depth, 0.025, m.stone, p.x, toe + (p.height - toe) / 2, p.z),
        box(p.width - 2 * inset, toe, p.depth - 2 * inset, m.reveal, p.x, toe / 2, p.z)
    ]);
}

/**
 * The reception desk, facing the entrance (+z): a tall white front panel
 * with a stone ledge along its top, and behind it a lower work surface on
 * aluminum end panels.
 */
function buildDesk(d, m) {
    const front = 0.24;
    const ledge = 0.05;
    const work = 0.74;
    const zFront = d.z + d.depth / 2;
    const body = d.height - ledge;
    const meshes = [
        roundedBox(d.length, body - 0.06, front, 0.02, m.white, d.x, 0.06 + (body - 0.06) / 2, zFront - front / 2),
        box(d.length - 0.08, 0.06, front - 0.05, m.reveal, d.x, 0.03, zFront - front / 2 - 0.02),
        roundedBox(d.length + 0.04, ledge, front + 0.12, 0.012, m.stone, d.x, body + ledge / 2, zFront - front / 2 + 0.02),
        roundedBox(d.length - 0.04, 0.03, d.depth - front, 0.008, m.white, d.x, work, d.z - front / 2)
    ];
    for (const side of [-1, 1]) {
        meshes.push(box(0.03, work - 0.015, d.depth - front, m.aluminum, d.x + side * (d.length / 2 - 0.035), (work - 0.015) / 2, d.z - front / 2));
    }
    return pickable('desk', meshes);
}

/** The printer on its low white console, both facing the room (+z). */
function buildPrinter(c, p, m) {
    const toe = 0.06;
    const zFront = c.z + c.depth / 2;
    const meshes = [
        roundedBox(c.length, c.height - toe, c.depth, 0.02, m.white, c.x, toe + (c.height - toe) / 2, c.z),
        box(c.length - 0.08, toe, c.depth - 0.06, m.reveal, c.x, toe / 2, c.z),
        // Two shadow-gap reveals across the front: three drawers.
        box(c.length - 0.06, 0.006, 0.004, m.reveal, c.x, c.height * 0.36, zFront + 0.001),
        box(c.length - 0.06, 0.006, 0.004, m.reveal, c.x, c.height * 0.66, zFront + 0.001)
    ];
    const y = c.height;
    meshes.push(
        roundedBox(p.width, p.height, p.depth, 0.025, m.white, c.x, y + p.height / 2, c.z - 0.02),
        // Its dark top panel and the slot the pages come out of.
        box(p.width - 0.06, 0.004, p.depth * 0.5, m.graphite, c.x, y + p.height + 0.001, c.z - 0.02 - p.depth * 0.18),
        box(p.width * 0.7, 0.012, 0.02, m.graphite, c.x, y + p.height * 0.62, c.z - 0.02 + p.depth / 2 + 0.002),
        // The output tray, aluminum, with a page waiting on it.
        box(p.width * 0.66, 0.006, 0.12, m.aluminum, c.x, y + p.height * 0.45, c.z - 0.02 + p.depth / 2 + 0.06),
        box(0.21, 0.004, 0.1, m.stone, c.x, y + p.height * 0.45 + 0.005, c.z - 0.02 + p.depth / 2 + 0.055)
    );
    return pickable('printer', meshes);
}

/**
 * The service menu: a slim graphite display on the left pier, its face
 * painted in M2 piece 3 (boards.js). The face is drawn flat and bright, as a
 * screen is, so it reads the same in sun or shade.
 */
function buildMenu(s, room, m) {
    const z = -room.depth / 2;
    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(s.width - 0.04, s.height - 0.04),
        new THREE.MeshBasicMaterial({ color: FINISH.screen, toneMapped: false })
    );
    face.name = 'menu-face';
    face.position.set(s.x, s.y, z + 0.032);
    const group = pickable('menu', [roundedBox(s.width, s.height, 0.03, 0.01, m.graphite, s.x, s.y, z + 0.016)]);
    group.add(face);
    return { group, face };
}

/** The plan board: a frosted panel held off the right pier on four
 *  aluminum standoffs, its face printed in M2 piece 3. */
function buildBoard(s, room, m) {
    const z = -room.depth / 2;
    const stand = 0.05;
    const meshes = [roundedBox(s.width, s.height, 0.012, 0.008, m.white, s.x, s.y, z + stand + 0.006)];
    for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
            const post = cylinder(0.012, 0.012, stand + 0.016, m.aluminum, s.x + sx * (s.width / 2 - 0.06), s.y + sy * (s.height / 2 - 0.06), z + (stand + 0.016) / 2, 12);
            post.rotation.x = Math.PI / 2;
            meshes.push(post);
        }
    }
    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(s.width - 0.05, s.height - 0.05),
        new THREE.MeshStandardMaterial({ color: FINISH.white, roughness: 0.6 })
    );
    face.name = 'board-face';
    face.position.set(s.x, s.y, z + stand + 0.0125);
    const group = pickable('board', meshes);
    group.add(face);
    return { group, face };
}

/** Slim linear pendants: an aluminum body with a softly glowing diffuser
 *  under it, hung on two fine cables. */
function buildPendants(p, room, m, out) {
    const y = room.height - p.drop;
    for (const [x, z, length] of p.list) {
        out.push(roundedBox(length, p.height, p.width, 0.008, m.aluminum, x, y, z));
        out.push(box(length - 0.02, 0.003, p.width - 0.012, m.diffuser, x, y - p.height / 2 - 0.001, z));
        for (const side of [-1, 1]) {
            out.push(cylinder(0.0015, 0.0015, p.drop - p.height / 2, m.graphite, x + side * (length / 2 - 0.12), y + p.height / 2 + (p.drop - p.height / 2) / 2, z, 6));
        }
    }
}

/** A plant in a white stone planter: a small tree (a slender stem and a
 *  loose crown) or a trough of tall grass. Seeded by its place in the list. */
function buildPlant(kind, x, z, seed, m, out) {
    const rand = seeded(seed * 7919 + 17);
    const p = PLANTS[kind];
    if (kind === 'tree') {
        const r = p.width / 2;
        out.push(cylinder(r, r * 0.82, p.planter, m.stone, x, p.planter / 2, z, 28));
        out.push(cylinder(r * 0.9, r * 0.9, 0.02, m.soil, x, p.planter - 0.02, z, 20));
        const crown = p.top - 0.45;
        out.push(cylinder(0.018, 0.026, crown - p.planter, m.stem, x, (p.planter + crown) / 2, z, 8));
        for (let i = 0; i < 9; i++) {
            const a = rand() * Math.PI * 2;
            const reach = 0.08 + rand() * 0.26;
            const size = 0.16 + rand() * 0.13;
            const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 1), m.leaves[i % m.leaves.length]);
            leaf.position.set(x + Math.cos(a) * reach, crown + (rand() - 0.3) * 0.5, z + Math.sin(a) * reach);
            leaf.scale.set(1, 0.8, 1);
            out.push(leaf);
        }
        return;
    }
    out.push(roundedBox(p.width, p.planter, p.depth, 0.02, m.stone, x, p.planter / 2, z));
    out.push(box(p.width - 0.05, 0.02, p.depth - 0.05, m.soil, x, p.planter - 0.015, z));
    for (let i = 0; i < 26; i++) {
        const h = 0.35 + rand() * 0.3;
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.025, h, 3), m.leaves[(i + 1) % m.leaves.length]);
        blade.position.set(x + (rand() - 0.5) * (p.width - 0.12), p.planter + h / 2 - 0.02, z + (rand() - 0.5) * (p.depth - 0.1));
        blade.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.5);
        out.push(blade);
    }
}

/** The contact patches as one mesh of soft dark grids (contactGrid). */
function buildContactShadows(patches) {
    const positions = [];
    const colors = [];
    const index = [];
    for (const patch of patches) {
        const { xs, zs, fade } = contactGrid(patch);
        const base = positions.length / 3;
        for (const v of zs) {
            for (const u of xs) {
                positions.push(patch.x + u, CONTACT_LIFT, patch.z + v);
                colors.push(0, 0, 0, fade(u, v));
            }
        }
        const n = xs.length;
        for (let j = 0; j < zs.length - 1; j++) {
            for (let i = 0; i < n - 1; i++) {
                const a = base + j * n + i;
                // Wound to face up.
                index.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
            }
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geometry.setIndex(index);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: 0xffffff, vertexColors: true, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    }));
    mesh.name = 'contact-shadows';
    mesh.raycast = () => {};
    mesh.renderOrder = -1;
    return mesh;
}

/** The patches under what stands on the floor, a little larger than each
 *  footprint and softest under the plants. */
export function contactPatches(config) {
    return footprints(config).map((f) => {
        const plant = f.name.startsWith('plant');
        const grow = plant ? 0.12 : 0.16;
        return {
            x: (f.x0 + f.x1) / 2, z: (f.z0 + f.z1) / 2,
            w: f.x1 - f.x0 + grow, d: f.z1 - f.z0 + grow,
            soft: plant ? 0.14 : 0.18, alpha: plant ? 0.4 : 0.45
        };
    });
}

/**
 * Every solid thing casts the sun's shadow and takes one, the walls and
 * ceiling too, so the sun comes in by the glass only. What is see-through or
 * drawn flat (the glass, the contact patches, the screen) casts none.
 * Returns the materials that should mirror the room (the metals and the
 * clear-coated stone), for main.js to give the room's reflection.
 */
export function castShadows(group) {
    const shiny = new Set();
    group.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        o.castShadow = m.visible !== false && !m.transparent && !m.isMeshBasicMaterial;
        o.receiveShadow = !m.isMeshBasicMaterial;
        if (m.isMeshStandardMaterial && (m.metalness >= 0.25 || m.clearcoat > 0)) shiny.add(m);
    });
    return [...shiny];
}

/**
 * Build the studio. Returns `{ group, picks, faces, glass, shiny,
 * plinthTop }`: `picks` the pickable groups by key, `faces` the menu's and
 * the board's faces for boards.js to paint, and `plinthTop` the point the
 * house model stands on.
 */
export function buildStudio(config) {
    const { room, studio } = config;
    const m = materials(room);
    const group = new THREE.Group();
    group.name = 'studio';

    const still = shellBoxes(room).map((b) => {
        const mesh = slab(b.min, b.max, m[b.finish]);
        mesh.name = b.name;
        return mesh;
    });
    buildPendants(studio.pendants, room, m, still);
    studio.plants.forEach(([kind, x, z], i) => buildPlant(kind, x, z, i + 1, m, still));
    for (const mesh of mergeByMaterial(still, 'shell')) group.add(mesh);

    // The glass: one faint pane, seen through, never in a ray's way.
    const g = glassOpening(room);
    const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(g.x1 - g.x0, g.y1 - g.y0),
        new THREE.MeshPhysicalMaterial({
            color: room.glass.tint, transparent: true, opacity: room.glass.opacity,
            roughness: 0.05, metalness: 0, depthWrite: false
        })
    );
    glass.name = 'glass';
    glass.position.set((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, g.z);
    glass.raycast = () => {};
    group.add(glass);

    const menu = buildMenu(studio.menu, room, m);
    const board = buildBoard(studio.board, room, m);
    const picks = {
        model: buildPlinth(studio.plinth, m),
        desk: buildDesk(studio.desk, m),
        printer: buildPrinter(studio.console, studio.printer, m),
        menu: menu.group,
        board: board.group
    };
    for (const key of Object.keys(picks)) group.add(picks[key]);

    group.add(buildContactShadows(contactPatches(config)));
    const shiny = castShadows(group);
    // The glass and the screen faces take no shadow and cast none.
    glass.castShadow = false;
    glass.receiveShadow = false;
    return {
        group,
        picks,
        faces: { menu: menu.face, board: board.face },
        glass,
        shiny,
        plinthTop: [studio.plinth.x, studio.plinth.height, studio.plinth.z]
    };
}
