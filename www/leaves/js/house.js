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

const material = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

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
function pumpkin(p) {
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
 * Our house, its front wall at z = Y.lawn.minZ. `L` is config.look. Returns
 * the group.
 */
export function buildOurHouse(Y, L) {
    const H = Y.house;
    const front = Y.lawn.minZ;
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
    for (const x of [-6.4, -3.6, 3.2, 6.0]) windowAt(group, cx + x, 1.75, front, { frame: black, glass });

    // The porch, its step and posts, and a flat roof over them all.
    const stone = material(L.porch);
    for (const b of [...named(Y, 'porch'), ...named(Y, 'step')]) {
        if (b.maxX <= H.maxX) group.add(solid(b, stone));
    }
    const posts = named(Y, 'post');
    for (const b of posts) group.add(solid(b, black));
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
    for (const p of Y.pumpkins || []) group.add(pumpkin(p));

    // The stone walk from the step to the sidewalk, laid flat on the lawn,
    // a hair above it and drawn over it.
    const step = named(Y, 'step').find((b) => b.maxX <= H.maxX);
    const from = step ? step.maxZ : front;
    const len = Y.sidewalk.minZ - from;
    const path = new THREE.Mesh(new THREE.PlaneGeometry(1.1, len),
        material(L.walk, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    path.rotation.x = -Math.PI / 2;
    path.position.set(door, 0.002, from + len / 2);
    path.receiveShadow = true;
    group.add(path);
    return group;
}

/**
 * The neighbor's house, its front wall at z = Y.neighbor.minZ, with room
 * left for the door yard.js hangs at `doorX`.
 */
export function buildNeighborHouse(Y, L, doorX) {
    const H = Y.neighborHouse;
    const front = Y.neighbor.minZ;
    const group = new THREE.Group();
    group.name = 'neighbor-house';
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
    for (const x of [doorX - 1.9, doorX + 1.9, doorX + 4.6]) {
        windowAt(group, x, 1.75, front, { w: 1.1, h: 1.5, frame: trim, glass });
        for (const s of [-1, 1]) group.add(box(0.4, 1.5, 0.05, shutter, x + s * 0.8, 1.75, front + 0.04));
    }
    return group;
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
    const line = Y.sidewalk.maxZ + 4.2;
    for (const dz of [-0.07, 0.07]) group.add(flat(length, 0.08, L.centerLine, mid, -0.015, line + dz));

    // Our mailbox: a black box on a black post.
    const black = material(L.frame);
    for (const m of named(Y, 'mailbox')) {
        group.add(solid(m, black));
        group.add(box(0.26, 0.24, 0.5, black, (m.minX + m.maxX) / 2, m.height + 0.1, (m.minZ + m.maxZ) / 2 + 0.1));
    }

    // The car: an aluminum body and a cabin with dark glass, and four tires.
    const car = named(Y, 'car')[0];
    const cabin = named(Y, 'cabin')[0];
    if (car) {
        const paint = new THREE.MeshStandardMaterial({ color: L.car, metalness: 0.6, roughness: 0.35 });
        group.add(solid(car, paint, 0.3));
        if (cabin) {
            group.add(solid(cabin, paint, car.height));
            const tinted = new THREE.MeshStandardMaterial({ color: L.carGlass, metalness: 0.4, roughness: 0.1 });
            const glassBox = solid({ ...cabin, minX: cabin.minX - 0.02, maxX: cabin.maxX + 0.02,
                minZ: cabin.minZ - 0.02, maxZ: cabin.maxZ + 0.02, height: cabin.height - 0.08 }, tinted, car.height + 0.08);
            glassBox.castShadow = false;
            group.add(glassBox);
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
    group.add(box(w, h.wall, h.depth, material(h.siding), cx, h.wall / 2, cz));
    const laps = [];
    for (let y = 0.2; y < h.wall - 0.1; y += 0.22) laps.push([cx, y, h.front + 0.012]);
    group.add(rows(new THREE.BoxGeometry(w, 0.025, 0.025), material(h.lap), laps));
    for (const x of [h.minX + 0.08, h.maxX - 0.08]) group.add(box(0.16, h.wall, 0.06, trim, x, h.wall / 2, h.front + 0.03));
    group.add(box(w + 0.8, 0.18, 0.12, trim, cx, h.wall - 0.05, h.front + 0.38));
    group.add(gableRoof(h, cz, material(h.roof)));
    // The garage at one end, the door and windows across the rest.
    const gw = 3.2;
    const gx = h.garage > 0 ? h.maxX - 0.4 - gw / 2 : h.minX + 0.4 + gw / 2;
    group.add(box(gw + 0.2, 2.35, 0.06, trim, gx, 1.175, h.front + 0.03));
    group.add(box(gw, 2.2, 0.06, material(h.garageDoor), gx, 1.1, h.front + 0.05));
    const panels = [];
    for (let y = 0.45; y < 2.1; y += 0.5) panels.push([gx, y, h.front + 0.085]);
    group.add(rows(new THREE.BoxGeometry(gw - 0.1, 0.03, 0.02), material(h.lap), panels));
    const rest = h.garage > 0 ? { from: h.minX, to: gx - gw / 2 } : { from: gx + gw / 2, to: h.maxX };
    const doorX = (rest.from + rest.to) / 2;
    group.add(box(1.0, 2.1, 0.06, material(h.door), doorX, 1.05 + 0.15, h.front + 0.05));
    group.add(box(1.6, 0.15, 0.7, material(L.porch), doorX, 0.075, h.front + 0.35));
    const glass = new THREE.MeshStandardMaterial({ color: L.glass, metalness: 0.35, roughness: 0.15 });
    for (const x of [(rest.from + doorX) / 2, (doorX + rest.to) / 2]) windowAt(group, x, 1.75, h.front, { w: 1.2, h: 1.5, frame: trim, glass });
    // The driveway, from the garage to the sidewalk, a hair over the lawn.
    const len = Y.sidewalk.minZ - h.front;
    const drive = new THREE.Mesh(new THREE.PlaneGeometry(gw + 0.4, len),
        material(L.walk, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    drive.rotation.x = -Math.PI / 2;
    drive.position.set(gx, 0.004, h.front + len / 2);
    drive.receiveShadow = true;
    group.add(drive);
    return group;
}
