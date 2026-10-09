// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * house.js - the two houses and the street in front of them (M5).
 *
 * OURS IS MODERN: white board and batten, black window frames, a stone base,
 * a charcoal roof, a covered porch on black steel posts, a black door with a
 * glass sidelight and an autumn wreath, pumpkins on the porch, and a stone
 * walk out to the sidewalk. Clean modern materials (white, black, stone,
 * aluminum) suit the house Steve would want to come home to.
 *
 * THE NEIGHBOR'S IS TRADITIONAL, on purpose, so the two read as two houses at
 * a glance: butter yellow lap siding, white trim, white windows with navy
 * shutters, a brick chimney. His front door and step are yard.js's, since
 * the door opens.
 *
 * WHAT IS SOLID IS DRAWN FROM THE CONFIG. The porch, its step, the posts,
 * the pumpkins, the mailbox and the car are config.yard.boxes and
 * config.yard.pumpkins, the same boxes the sim's leaves land on and the
 * person walks round, so the two can never disagree.
 *
 * DOWN THE BLOCK (M6 QA), a house past the hedge and one past the
 * neighbor's, each with a garage and a driveway, so a view that slides or
 * widens shows a street rather than the edge of the world.
 *
 * Plain boxes and a few spheres and tori. Battens and siding lines are each
 * one instanced mesh.
 */

import { paving } from './surfaces.min.js';

const material = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

/** A material showing `pave` (surfaces.js: { map, tileX, tileZ }) over a
 *  flat w by d, or plain `color` with no picture to show. */
function paved(pave, color, w, d, extra = {}) {
    if (!pave || !pave.map) return material(color, extra);
    const map = pave.map.clone();
    map.repeat.set(w / pave.tileX, d / pave.tileZ);
    map.needsUpdate = true;
    return material(0xffffff, { map, ...extra });
}

/** A flat paved top laid on a box (the porch, a step), a hair over it, so
 *  the box keeps its plain sides and only what a leaf lands on is paved. */
function pavedTop(minX, maxX, minZ, maxZ, y, pave, color) {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
        paved(pave, color, w, d, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    top.rotation.x = -Math.PI / 2;
    top.position.set((minX + maxX) / 2, y + 0.0005, (minZ + maxZ) / 2);
    top.receiveShadow = true;
    return top;
}

/** The neighbor's front windows' middles in x, either side of his door
 *  (decorations.js puts a figure in one): 1.1 wide, 1.5 tall, at 1.75. */
export function neighborWindows(doorX) {
    return [doorX - 1.9, doorX + 1.9, doorX + 4.6];
}

/** Where a house's front wall is drawn: `setBack` behind the line its
 *  lawn's leaves rest against (`edge`, the sim's wall), so nothing on its
 *  face stands in front of a leaf (M6 QA). */
export function facadeZ(edge, H) {
    return edge - (H.setBack || 0);
}

/** A config box drawn reaching back to the house's face where it stands
 *  against the sim's wall at `edge` (the porch, a step), so no gap shows
 *  between it and the set back wall. */
const toFace = (b, edge, face) => (b.minZ <= edge + 1e-6 ? { ...b, minZ: face } : b);

/** The bed along a house's foot, from its face out to where the lawn
 *  starts, a hair over the ground under it. */
function bed(minX, maxX, face, edge, color) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, edge - face),
        material(color, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((minX + maxX) / 2, 0.002, (face + edge) / 2);
    mesh.receiveShadow = true;
    return mesh;
}

/** Mark a mesh drawn from a config box the leaves already treat as solid
 *  (the porch, a step, a post, a pumpkin), for the test that nothing else
 *  stands where a leaf can lie. */
function solidMark(mesh) {
    mesh.userData.solid = true;
    mesh.traverse((o) => { o.userData.solid = true; });
    return mesh;
}

/** Our house's front windows: their middles in x from the house's middle,
 *  how high, and how big (decorations.js puts silhouettes in two). */
export const OUR_WINDOWS = Object.freeze({ xs: [-6.4, -3.6, 3.2, 6.0], y: 1.75, w: 1.3, h: 1.7 });

function box(w, h, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

/** A config box ({ minX, maxX, minZ, maxZ, height }) as a mesh, from the
 *  ground up (or from `from` up). */
function solid(b, mat, from = 0) {
    return box(b.maxX - b.minX, b.height - from, b.maxZ - b.minZ, mat,
        (b.minX + b.maxX) / 2, (b.height + from) / 2, (b.minZ + b.maxZ) / 2);
}

/** The yard's boxes with this name. */
const named = (Y, name) => (Y.boxes || []).filter((b) => b.name === name);

/** A gable roof over the walls, the ridge along x, as a prism. */
function gableRoof(h, cz, mat) {
    const over = 0.4;
    const shape = new THREE.Shape();
    shape.moveTo(-h.depth / 2 - over, -0.05);
    shape.lineTo(h.depth / 2 + over, -0.05);
    shape.lineTo(0, h.ridge - h.wall);
    shape.closePath();
    const w = h.maxX - h.minX;
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: w + over * 2, bevelEnabled: false }), mat);
    roof.rotation.y = Math.PI / 2;
    roof.position.set(h.minX - over, h.wall, cz);
    roof.castShadow = true;
    roof.receiveShadow = true;
    return roof;
}

/** The same thin box repeated at each of `positions`, as one instanced mesh. */
function rows(geometry, mat, positions) {
    const mesh = new THREE.InstancedMesh(geometry, mat, positions.length);
    const m = new THREE.Matrix4();
    positions.forEach((p, k) => {
        m.makeTranslation(p[0], p[1], p[2]);
        mesh.setMatrixAt(k, m);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

/** A window on the wall at z = front: a frame, glass, and a cross of
 *  mullions. */
function windowAt(group, x, y, front, { w = 1.3, h = 1.7, frame, glass }) {
    group.add(box(w, h, 0.07, frame, x, y, front + 0.04));
    const pane = box(w - 0.14, h - 0.14, 0.05, glass, x, y, front + 0.07);
    pane.castShadow = false;
    group.add(pane);
    group.add(box(0.05, h - 0.14, 0.06, frame, x, y, front + 0.09));
    group.add(box(w - 0.14, 0.05, 0.06, frame, x, y, front + 0.09));
}

/** A pumpkin ({ x, z, y, r, color }): a squashed sphere and a stem. */
export function pumpkin(p) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(p.r, 16, 10), material(p.color));
    body.scale.set(1, 0.72, 1);
    body.position.y = p.r * 0.72;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.1, p.r * 0.14, p.r * 0.45, 6), material(0x5a5a2e));
    stem.position.y = p.r * 1.5;
    stem.rotation.z = 0.2;
    group.add(stem);
    group.position.set(p.x, p.y, p.z);
    return group;
}

/**
 * Our house, its front wall `setBack` behind z = Y.lawn.minZ (where the
 * leaves rest against it). `L` is config.look. Returns
 * the group.
 */
export function buildOurHouse(Y, L) {
    const H = Y.house;
    const edge = Y.lawn.minZ;
    const front = facadeZ(edge, H);
    const group = new THREE.Group();
    group.name = 'our-house';
    const w = H.maxX - H.minX;
    const cx = (H.minX + H.maxX) / 2;
    const cz = front - H.depth / 2;
    const white = material(L.siding);
    const black = material(L.frame);
    const glass = new THREE.MeshStandardMaterial({ color: L.glass, metalness: 0.35, roughness: 0.15 });
    const roofing = material(L.roofModern);

    group.add(box(w, H.wall, H.depth, white, cx, H.wall / 2, cz));
    // Board and batten: a batten every 45 cm across the front.
    const battens = [];
    for (let x = H.minX + 0.2; x < H.maxX - 0.1; x += 0.45) battens.push([x, H.wall / 2, front + 0.02]);
    group.add(rows(new THREE.BoxGeometry(0.06, H.wall, 0.04), white, battens));
    // The stone base, and a black fascia under the eaves.
    group.add(box(w + 0.12, 0.5, 0.14, material(L.stone), cx, 0.25, front + 0.05));
    group.add(box(w + 0.8, 0.16, 0.12, black, cx, H.wall - 0.05, front + 0.38));
    group.add(gableRoof(H, cz, roofing));

    // Windows: two each side of the porch, black framed.
    const door = H.door;
    const W = OUR_WINDOWS;
    for (const x of W.xs) windowAt(group, cx + x, W.y, front, { w: W.w, h: W.h, frame: black, glass });

    // The porch, its step and posts, and a flat roof over them all.
    const stone = material(L.porch);
    const pave = paving(L);
    for (const b of [...named(Y, 'porch'), ...named(Y, 'step')]) {
        if (b.maxX > H.maxX) continue;
        const drawn = toFace(b, edge, front);
        group.add(solidMark(solid(drawn, stone)));
        // Smooth large pavers on top (2026-10-08), where the leaves land.
        group.add(pavedTop(drawn.minX, drawn.maxX, drawn.minZ, drawn.maxZ, b.height, pave.porch, L.porch));
    }
    const posts = named(Y, 'post');
    for (const b of posts) group.add(solidMark(solid(b, black)));
    group.add(bed(H.minX, H.maxX, front, edge, L.gravel));
    const porch = named(Y, 'porch')[0];
    if (porch) {
        const top = posts.length ? posts[0].height : 2.8;
        group.add(box(porch.maxX - porch.minX + 0.3, 0.14, porch.maxZ - front + 0.25, roofing,
            (porch.minX + porch.maxX) / 2, top + 0.07, (front + porch.maxZ + 0.25) / 2));
    }
    // The door: black, a tall glass sidelight, an aluminum pull, two lamps.
    group.add(box(1.0, 2.2, 0.08, black, door, 0.28 + 1.1, front + 0.05));
    const side = box(0.34, 2.2, 0.06, glass, door + 0.72, 0.28 + 1.1, front + 0.05);
    side.castShadow = false;
    group.add(side);
    group.add(box(0.03, 0.5, 0.05, material(L.aluminum), door - 0.36, 1.35, front + 0.12));
    for (const s of [-1, 1]) group.add(box(0.14, 0.28, 0.12, black, door + s * 1.05, 2.2, front + 0.1));
    // An autumn wreath on the door.
    const wreath = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 8, 18), material(L.wreath));
    wreath.position.set(door, 1.8, front + 0.14);
    wreath.castShadow = true;
    group.add(wreath);
    for (const p of Y.pumpkins || []) group.add(solidMark(pumpkin(p)));
    if (Y.rake) group.add(buildRake(Y, L));

    // The stone walk from the step to the sidewalk, laid flat on the lawn,
    // a hair above it and drawn over it.
    const step = named(Y, 'step').find((b) => b.maxX <= H.maxX);
    const from = step ? step.maxZ : front;
    const len = Y.sidewalk.minZ - from;
    // Poured concrete, slab by slab, a crack or two (surfaces.js, Steve's
    // QA 2026-10-08: "It just looks a little too flat").
    const path = new THREE.Mesh(new THREE.PlaneGeometry(1.1, len),
        paved(pave.walk(len), L.walk, 1.1, len, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    path.rotation.x = -Math.PI / 2;
    path.position.set(door, 0.002, from + len / 2);
    path.receiveShadow = true;
    group.add(path);
    return group;
}

/**
 * Where the rake's fan of tines lies on the tarp, as a box ({ minX, maxX,
 * minZ, maxZ, height }): the dive keeps the person's body off it (main.js),
 * though the leaves do not meet it, and heap round it. Null with no rake.
 */
export function rakeFootprint(Y) {
    const R = Y.rake;
    if (!R) return null;
    const face = facadeZ(Y.lawn.minZ, Y.house);
    return { name: 'rake', minX: R.x - R.width / 2, maxX: R.x + R.width / 2, minZ: face, maxZ: face + R.reach, height: 0.15 };
}

/**
 * A leaf rake leaning against our house's left end (Steve's QA, 2026-10-08:
 * "the rake's teeth would be resting on the tarp. We just want to make sure
 * the rake's handle isn't resting against a window"): an ash handle from the
 * wall down to a steel collar, and a fan of steel tines spreading from it
 * across the tarp, a spring bar across them. Named 'rake'.
 */
export function buildRake(Y, L) {
    const R = Y.rake;
    const group = new THREE.Group();
    group.name = 'rake';
    const face = facadeZ(Y.lawn.minZ, Y.house);
    // The handle, from the wall to the collar low over the tarp.
    const top = new THREE.Vector3(R.x, R.top, face + 0.03);
    const collar = new THREE.Vector3(R.x, 0.12, face + R.reach * 0.55);
    const span = collar.clone().sub(top);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, span.length(), 8), material(R.handle));
    handle.position.copy(top).addScaledVector(span, 0.5);
    handle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.clone().normalize());
    handle.castShadow = true;
    group.add(handle);
    const steel = new THREE.MeshStandardMaterial({ color: R.steel, metalness: 0.6, roughness: 0.45 });
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.09, 8), steel);
    ferrule.position.copy(collar).addScaledVector(span.clone().normalize(), -0.03);
    ferrule.quaternion.copy(handle.quaternion);
    group.add(ferrule);
    // The fan: tines from the collar to their tips on the tarp, spread
    // across `width`, each tip turned down a little.
    const tine = new THREE.BoxGeometry(0.008, 0.004, 1);
    const tines = new THREE.InstancedMesh(tine, steel, R.tines);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const along = new THREE.Vector3(0, 0, 1);
    for (let k = 0; k < R.tines; k++) {
        const u = R.tines > 1 ? k / (R.tines - 1) - 0.5 : 0;
        const tip = new THREE.Vector3(R.x + u * R.width, 0.006, face + R.reach - Math.abs(u) * 0.12);
        const d = tip.clone().sub(collar);
        q.setFromUnitVectors(along, d.clone().normalize());
        m.compose(collar.clone().addScaledVector(d, 0.5), q, new THREE.Vector3(1, 1, d.length()));
        tines.setMatrixAt(k, m);
    }
    tines.castShadow = true;
    group.add(tines);
    // The spring bar across the fan, two thirds of the way out.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(R.width * 0.62, 0.006, 0.012), steel);
    bar.position.set(R.x, 0.12 * 0.33 + 0.006, collar.z + (face + R.reach - collar.z) * 0.62);
    bar.rotation.x = Math.atan2(0.12, R.reach * 0.45) * 0.9;
    group.add(bar);
    return group;
}

/**
 * The neighbor's house, its front wall `setBack` behind z = Y.neighbor.minZ,
 * with room
 * left for the door yard.js hangs at `doorX`.
 */
export function buildNeighborHouse(Y, L, doorX) {
    const H = Y.neighborHouse;
    const front = facadeZ(Y.neighbor.minZ, H);
    const group = new THREE.Group();
    group.name = 'neighbor-house';
    group.add(bed(H.minX, H.maxX, front, Y.neighbor.minZ, L.mulch));
    const w = H.maxX - H.minX;
    const cx = (H.minX + H.maxX) / 2;
    const cz = front - H.depth / 2;
    const trim = material(L.trim);
    group.add(box(w, H.wall, H.depth, material(L.neighborSiding), cx, H.wall / 2, cz));
    // Lap siding: a shadow line every 22 cm up the front.
    const laps = [];
    for (let y = 0.2; y < H.wall - 0.1; y += 0.22) laps.push([cx, y, front + 0.012]);
    group.add(rows(new THREE.BoxGeometry(w, 0.025, 0.025), material(L.neighborLap), laps));
    // White corner boards and trim, a brick chimney, a warm gray roof.
    for (const x of [H.minX + 0.08, H.maxX - 0.08]) group.add(box(0.16, H.wall, 0.06, trim, x, H.wall / 2, front + 0.03));
    group.add(box(w + 0.8, 0.18, 0.12, trim, cx, H.wall - 0.05, front + 0.38));
    group.add(gableRoof(H, cz, material(L.neighborRoof)));
    group.add(box(0.8, 3.6, 0.8, material(L.brick), H.maxX - 1.6, H.ridge - 0.6, cz + 0.6));
    // White windows with navy shutters either side of his door.
    const glass = new THREE.MeshStandardMaterial({ color: L.glass, metalness: 0.35, roughness: 0.15 });
    const shutter = material(L.shutter);
    for (const x of neighborWindows(doorX)) {
        windowAt(group, x, 1.75, front, { w: 1.1, h: 1.5, frame: trim, glass });
        for (const s of [-1, 1]) group.add(box(0.4, 1.5, 0.05, shutter, x + s * 0.8, 1.75, front + 0.04));
    }
    return group;
}

/** OUR MAILBOX (M6 QA: "more like a real mailbox - maybe with a wooden
 *  post"): a classic arched box on a plank on a cedar post. Its size, and
 *  where it sits on the post (`m`, the config box): its floor on the plank
 *  and its middle a little toward the street. decorations.js wraps the
 *  mummy round the same arch. */
export const MAILBOX = Object.freeze({ w: 0.23, side: 0.13, long: 0.48, plank: 0.04, out: 0.1 });

export function mailboxSpot(m) {
    return { x: (m.minX + m.maxX) / 2, y: m.height + MAILBOX.plank, z: (m.minZ + m.maxZ) / 2 + MAILBOX.out };
}

/** The mailbox's end-on outline, `grow` bigger all round: straight sides
 *  and a half round top, its floor at y = -grow. */
export function mailboxShape(grow = 0) {
    const r = MAILBOX.w / 2 + grow;
    const s = new THREE.Shape();
    s.moveTo(-r, -grow);
    s.lineTo(r, -grow);
    s.lineTo(r, MAILBOX.side);
    s.absarc(0, MAILBOX.side, r, 0, Math.PI, false);
    s.lineTo(-r, -grow);
    return s;
}

/** A rectangle with rounded corners, in the plane of a car's side. */
function roundedRect(x0, y0, x1, y1, r) {
    const s = new THREE.Shape();
    s.moveTo(x0 + r, y0);
    s.lineTo(x1 - r, y0);
    s.quadraticCurveTo(x1, y0, x1, y0 + r);
    s.lineTo(x1, y1 - r);
    s.quadraticCurveTo(x1, y1, x1 - r, y1);
    s.lineTo(x0 + r, y1);
    s.quadraticCurveTo(x0, y1, x0, y1 - r);
    s.lineTo(x0, y0 + r);
    s.quadraticCurveTo(x0, y0, x0 + r, y0);
    return s;
}

/**
 * A side profile (a Shape in x and y) extruded across a car from z0 to z1,
 * with a bevel `bt` that rounds every edge along its length. The profile is
 * drawn `bt` inside the box it fills, since a bevel grows a shape outward by
 * as much, so the panel's bounds are exactly the box's (M6 QA, after the
 * extruded panels in www/interstate's SUV).
 */
function carPanel(shape, z0, z1, bt, mat) {
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: z1 - z0 - 2 * bt, bevelEnabled: bt > 0, bevelThickness: bt, bevelSize: bt, bevelSegments: 3, curveSegments: 10
    });
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.z = z0 + bt;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

/**
 * The street (M5): a curb along the sidewalk, a double yellow line down the
 * middle, our mailbox, and a car parked at the curb. Returns the group.
 */
export function buildStreet(Y, L) {
    const group = new THREE.Group();
    group.name = 'street';
    const b = Y.bounds;
    const flat = (w, d, color, x, y, z) => {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material(color));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, y, z);
        mesh.receiveShadow = true;
        return mesh;
    };
    const length = b.maxX - b.minX + 120;
    const mid = (b.minX + b.maxX) / 2;
    group.add(flat(length, 0.22, L.curb, mid, 0.012, Y.sidewalk.maxZ + 0.11));
    const line = Y.sidewalk.maxZ + Y.centerLine;
    for (const dz of [-0.07, 0.07]) group.add(flat(length, 0.08, L.centerLine, mid, -0.015, line + dz));

    // Our mailbox: a cedar post (the box the leaves meet), a plank on top,
    // and an arched black box on it, its door toward the street, a red flag
    // down on its side.
    const black = material(L.frame);
    const cedar = material(L.cedar);
    for (const m of named(Y, 'mailbox')) {
        group.add(solid(m, cedar));
        const at = mailboxSpot(m);
        group.add(box(MAILBOX.w + 0.03, MAILBOX.plank, MAILBOX.long + 0.06, cedar, at.x, m.height + MAILBOX.plank / 2, at.z));
        const steel = new THREE.MeshStandardMaterial({ color: L.frame, metalness: 0.5, roughness: 0.45 });
        const body = new THREE.Mesh(new THREE.ExtrudeGeometry(mailboxShape(), { depth: MAILBOX.long, bevelEnabled: false, curveSegments: 12 }), steel);
        body.position.set(at.x, at.y, at.z - MAILBOX.long / 2);
        body.castShadow = true;
        group.add(body);
        // The door: a lip a hair proud of the front, and a little pull.
        const door = new THREE.Mesh(new THREE.ExtrudeGeometry(mailboxShape(0.008), { depth: 0.012, bevelEnabled: false, curveSegments: 12 }), steel);
        door.position.set(at.x, at.y, at.z + MAILBOX.long / 2 - 0.004);
        group.add(door);
        group.add(box(0.04, 0.02, 0.02, material(L.aluminum), at.x, at.y + MAILBOX.side, at.z + MAILBOX.long / 2 + 0.015));
        // The flag, down, on the side away from the walk.
        const red = material(L.flag);
        group.add(box(0.012, 0.025, 0.2, red, at.x + MAILBOX.w / 2 + 0.008, at.y + 0.07, at.z - 0.04));
        group.add(box(0.012, 0.08, 0.07, red, at.x + MAILBOX.w / 2 + 0.008, at.y + 0.07, at.z + 0.07));
        // A house number plaque on the post.
        group.add(box(0.12, 0.16, 0.012, material(L.trim), at.x, m.height - 0.3, m.maxZ + 0.006));
    }

    // The car (rounded at M6 QA: "Could we make the car's edges a little
    // more rounded"): an aluminum body with soft corners and rounded long
    // edges, a cabin with a raked windshield (it faces +x) and a sloped back,
    // dark glass all round under a painted roof, lights and mirrors, and four
    // tires. The body and the cabin fill their config boxes exactly, so what
    // a leaf lands on is what is drawn.
    const car = named(Y, 'car')[0];
    const cabin = named(Y, 'cabin')[0];
    if (car) {
        const paint = new THREE.MeshStandardMaterial({ color: L.car, metalness: 0.6, roughness: 0.35 });
        const bt = 0.06;
        group.add(carPanel(roundedRect(car.minX + bt, 0.3 + bt, car.maxX - bt, car.height - bt, 0.18), car.minZ, car.maxZ, bt, paint));
        if (cabin) {
            const h0 = car.height;
            const h1 = cabin.height;
            const c = 0.05;
            // The cabin's side: the windshield raked back from the front (+x),
            // the back window less so, the roof's corners rounded. A short
            // upright at the belt line each end keeps the corners square, so
            // the bevel cannot poke out past the box like a mitre.
            const rake = 0.6;
            const back = 0.35;
            const profile = (x0, x1, y0, y1, inset) => {
                const s = new THREE.Shape();
                s.moveTo(x0 + inset, y0 + inset);
                s.lineTo(x1 - inset, y0 + inset);
                s.lineTo(x1 - inset, y0 + 0.07);
                s.lineTo(x1 - rake - inset * 0.5, y1 - 0.1 - inset);
                s.quadraticCurveTo(x1 - rake - 0.05, y1 - inset, x1 - rake - 0.2, y1 - inset);
                s.lineTo(x0 + back + 0.2, y1 - inset);
                s.quadraticCurveTo(x0 + back + 0.05, y1 - inset, x0 + back + inset * 0.5, y1 - 0.1 - inset);
                s.lineTo(x0 + inset, y0 + 0.07);
                s.closePath();
                return s;
            };
            const shell = carPanel(profile(cabin.minX, cabin.maxX, h0, h1, c), cabin.minZ, cabin.maxZ, c, paint);
            group.add(shell);
            // Dark glass, a hair proud of the shell on every side, from the
            // belt line to just under the roof.
            const tinted = new THREE.MeshStandardMaterial({ color: L.carGlass, metalness: 0.4, roughness: 0.1 });
            const glass = carPanel(profile(cabin.minX - 0.012, cabin.maxX + 0.012, h0 + 0.06, h1 - 0.07, 0.01),
                cabin.minZ - 0.012, cabin.maxZ + 0.012, 0.01, tinted);
            glass.castShadow = false;
            group.add(glass);
            // A pillar between the doors, in the paint.
            group.add(box(0.08, h1 - h0 - 0.12, cabin.maxZ - cabin.minZ + 0.03, paint, (cabin.minX + cabin.maxX) / 2 - 0.1, (h0 + h1) / 2 - 0.02, (cabin.minZ + cabin.maxZ) / 2));
        }
        // Lights at each end, and a mirror each side ahead of the cabin.
        const midZ = (car.minZ + car.maxZ) / 2;
        const lamp = (color, emissive) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.4, roughness: 0.3 });
        for (const s of [-1, 1]) {
            const z = midZ + s * ((car.maxZ - car.minZ) / 2 - 0.3);
            group.add(box(0.04, 0.1, 0.32, lamp(0xeef4ff, 0x334455), car.maxX + 0.005, car.height - 0.17, z));
            group.add(box(0.04, 0.1, 0.36, lamp(0x8e1b1b, 0x330a0a), car.minX - 0.005, car.height - 0.17, z));
            if (cabin) group.add(box(0.14, 0.09, 0.06, paint, cabin.maxX - 0.15, car.height + 0.1, s > 0 ? car.maxZ + 0.04 : car.minZ - 0.04));
        }
        const tire = material(L.tire);
        const wheel = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14);
        for (const x of [car.minX + 0.8, car.maxX - 0.8]) {
            for (const z of [car.minZ + 0.1, car.maxZ - 0.1]) {
                const mesh = new THREE.Mesh(wheel, tire);
                mesh.rotation.x = Math.PI / 2;
                mesh.position.set(x, 0.32, z);
                mesh.castShadow = true;
                group.add(mesh);
            }
        }
    }
    return group;
}

/** Where a street house's garage (`gx`, `gw` wide) and front door
 *  (`doorX`) are, and the stretch of front the door shares with the windows
 *  (`rest`). Pure: decorations.js dresses its step from it. */
export function streetHouseParts(h) {
    const gw = 3.2;
    const gx = h.garage > 0 ? h.maxX - 0.4 - gw / 2 : h.minX + 0.4 + gw / 2;
    const rest = h.garage > 0 ? { from: h.minX, to: gx - gw / 2 } : { from: gx + gw / 2, to: h.maxX };
    return { gw, gx, rest, doorX: (rest.from + rest.to) / 2 };
}

/**
 * A house down the block (M6), from `h` in config.yard.street: its front
 * wall at z = h.front, lap siding, white trim and windows, a front door and
 * step, a garage door on the side `h.garage` names (-1 left, 1 right), and a
 * driveway from it to the sidewalk. Returns the group.
 */
export function buildStreetHouse(h, L, Y) {
    const group = new THREE.Group();
    group.name = `house-${h.name}`;
    const w = h.maxX - h.minX;
    const cx = (h.minX + h.maxX) / 2;
    const cz = h.front - h.depth / 2;
    const trim = material(L.trim);
    const { gw, gx, rest, doorX } = streetHouseParts(h);
    group.add(box(w, h.wall, h.depth, material(h.siding), cx, h.wall / 2, cz));
    const laps = [];
    for (let y = 0.2; y < h.wall - 0.1; y += 0.22) laps.push([cx, y, h.front + 0.012]);
    group.add(rows(new THREE.BoxGeometry(w, 0.025, 0.025), material(h.lap), laps));
    for (const x of [h.minX + 0.08, h.maxX - 0.08]) group.add(box(0.16, h.wall, 0.06, trim, x, h.wall / 2, h.front + 0.03));
    group.add(box(w + 0.8, 0.18, 0.12, trim, cx, h.wall - 0.05, h.front + 0.38));
    group.add(gableRoof(h, cz, material(h.roof)));
    // The garage at one end, the door and windows across the rest.
    group.add(box(gw + 0.2, 2.35, 0.06, trim, gx, 1.175, h.front + 0.03));
    group.add(box(gw, 2.2, 0.06, material(h.garageDoor), gx, 1.1, h.front + 0.05));
    const panels = [];
    for (let y = 0.45; y < 2.1; y += 0.5) panels.push([gx, y, h.front + 0.085]);
    group.add(rows(new THREE.BoxGeometry(gw - 0.1, 0.03, 0.02), material(h.lap), panels));
    group.add(box(1.0, 2.1, 0.06, material(h.door), doorX, 1.05 + 0.15, h.front + 0.05));
    group.add(box(1.6, 0.15, 0.7, material(L.porch), doorX, 0.075, h.front + 0.35));
    const glass = new THREE.MeshStandardMaterial({ color: L.glass, metalness: 0.35, roughness: 0.15 });
    for (const x of [(rest.from + doorX) / 2, (doorX + rest.to) / 2]) windowAt(group, x, 1.75, h.front, { w: 1.2, h: 1.5, frame: trim, glass });
    // The driveway, from the garage to the sidewalk, a hair over the lawn.
    const len = Y.sidewalk.minZ - h.front;
    const drive = new THREE.Mesh(new THREE.PlaneGeometry(gw + 0.4, len),
        paved(paving(L).drive, L.walk, gw + 0.4, len, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    drive.rotation.x = -Math.PI / 2;
    drive.position.set(gx, 0.004, h.front + len / 2);
    drive.receiveShadow = true;
    group.add(drive);
    return group;
}
