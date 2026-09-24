// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * room.js - The office itself, as geometry.
 *
 * A CORNER OFFICE, as the name promises. The back wall and the right wall are
 * both mostly window, meeting at the back right corner. The windows are
 * openings: the city beyond them is world.js's own scene, drawn first. The
 * desk stands against the back wall just left of the corner.
 *
 * THE THINGS YOU CAN TOUCH carry `userData.pick`, a key main.js turns into an
 * action: the monitor opens the computer, the in-tray starts a new
 * application, the out-tray opens backups and exports, the wastebasket opens
 * itself, the lamp switches, an open folder on the desk reopens its card, the
 * wall calendar opens the calendar, the sticky notes open today's list, the
 * filing cabinet opens itself and a folder in it opens on the desk, the
 * corkboard opens itself (its cards drag between columns), the Rolodex opens
 * the people, the whiteboard opens its numbers (and its goal line the weekly
 * goal), the departures board opens the week, and the printer prints a prep
 * sheet. `pickOf` walks up from whatever a ray hit to the nearest of these.
 *
 * NO CANVAS IN HERE. The monitor's face, the wall calendar, the sticky notes
 * and the rest take optional textures (`textures.screen`, `.calendar`,
 * `.notes` and so on) that main.js paints, so this file builds the same room
 * under real three in node:vm, where there is no canvas, and a test can
 * measure what the eye sees.
 *
 * Builds and returns `{ group, picks, lamp, folder, screen, calendar,
 * cabinet, board, rolodex, departures, whiteboard, notes }`. It adds nothing
 * to a scene itself and reads no clock.
 */

/* global THREE */

const COLORS = {
    wall: 0xe9e0d0,
    trim: 0xf6f1e8,
    floor: 0x7a5236,
    rug: 0x3f4f5f,
    ceiling: 0xf3eee6,
    desk: 0x6b4128,
    deskDark: 0x4a2c1a,
    metal: 0x2b2d31,
    screenOff: 0x0e1622,
    tray: 0x8c6a45,
    paper: 0xf7f3ea,
    manila: 0xe4c07a,
    basket: 0x3b3f45,
    shade: 0x1f5c4a,
    mug: 0xc8553d,
    plant: 0x2f6b3a,
    pot: 0xb86b45,
        chair: 0x26282c
};

function mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });
}

/** A box by its min and max corners, which reads far better than centers
 *  and sizes for walls with holes in them. */
function slab(x0, y0, z0, x1, y1, z1, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return mesh;
}

function box(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    return mesh;
}

function tag(object, key) {
    object.userData.pick = key;
    object.name = key;
    return object;
}

/**
 * An invisible box around a thin thing, so a fingertip finds it. The lamp is
 * an arm two centimeters wide, and a tap between the arm and the shade used
 * to reach the wall behind it (tests/office-room.test.mjs). The material is
 * not drawn, but the mesh is still `visible`, so a ray still meets it.
 */
function addHitBox(group, pad = 0.03) {
    group.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(group);
    const size = b.getSize(new THREE.Vector3());
    const center = b.getCenter(new THREE.Vector3());
    const proxy = new THREE.Mesh(
        new THREE.BoxGeometry(size.x + pad * 2, size.y + pad, size.z + pad * 2),
        new THREE.MeshBasicMaterial({ visible: false })
    );
    // Grown upward only, so it never sinks into what the thing stands on.
    // The box was measured in the world, so its center is brought back into
    // the group's own frame: a group placed away from the origin (the
    // Rolodex) would otherwise get its hit box twice as far away.
    group.worldToLocal(center);
    proxy.position.set(center.x, center.y + pad / 2, center.z);
    proxy.name = `${group.userData.pick}-hit`;
    group.add(proxy);
    return proxy;
}

/** The nearest ancestor (or the object itself) that carries a pick key. */
export function pickOf(object) {
    let o = object;
    while (o) {
        if (o.userData && o.userData.pick) return o.userData.pick;
        o = o.parent;
    }
    return null;
}

/** The window openings, shared by the walls, the frames and the tests. */
export function windowsOf(config) {
    const { width, depth } = config.room;
    return {
        sill: 0.95,
        head: 2.45,
        back: { x0: 0.1, x1: width / 2 - 0.1 },
        right: { z0: -depth / 2 + 0.1, z1: 0.3 }
    };
}

function buildShell(group, config) {
    const { width, depth, height } = config.room;
    const w = windowsOf(config);
    const hw = width / 2;
    const hd = depth / 2;
    const T = 0.1;
    const wall = mat(COLORS.wall);
    const trim = mat(COLORS.trim);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat(COLORS.floor, { roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), mat(COLORS.rug, { roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0.7, 0.004, -1.4);
    group.add(rug);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat(COLORS.ceiling));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = height;
    group.add(ceiling);

    // Back wall: solid left of the window, a band below and above it.
    group.add(slab(-hw, 0, -hd - T, w.back.x0, height, -hd, wall));
    group.add(slab(w.back.x0, 0, -hd - T, hw, w.sill, -hd, wall));
    group.add(slab(w.back.x0, w.head, -hd - T, hw, height, -hd, wall));
    // Right wall: solid in front of the window, a band below and above it.
    group.add(slab(hw, 0, w.right.z1, hw + T, height, hd, wall));
    group.add(slab(hw, 0, -hd, hw + T, w.sill, w.right.z1, wall));
    group.add(slab(hw, w.head, -hd, hw + T, height, w.right.z1, wall));
    // The narrow pier at the corner, between the two windows.
    group.add(slab(w.back.x1, w.sill, -hd - T, hw + T, w.head, -hd + 0.1, wall));
    group.add(slab(hw - 0.1, w.sill, -hd, hw + T, w.head, w.right.z0, wall));
    // Left wall, solid.
    group.add(slab(-hw - T, 0, -hd, -hw, height, hd, wall));
    // Front wall, with the door in it.
    const door = config.room.door;
    const d0 = door.x - door.width / 2;
    const d1 = door.x + door.width / 2;
    group.add(slab(-hw, 0, hd, d0, height, hd + T, wall));
    group.add(slab(d1, 0, hd, hw, height, hd + T, wall));
    group.add(slab(d0, door.height, hd, d1, height, hd + T, wall));
    const doorWood = mat(0x6b4a33, { roughness: 0.6 });
    group.add(slab(d0 + 0.01, 0, hd + 0.02, d1 - 0.01, door.height - 0.01, hd + 0.06, doorWood));
    group.add(slab(d0 - 0.05, 0, hd - 0.02, d0, door.height + 0.05, hd + 0.02, trim));
    group.add(slab(d1, 0, hd - 0.02, d1 + 0.05, door.height + 0.05, hd + 0.02, trim));
    group.add(slab(d0 - 0.05, door.height, hd - 0.02, d1 + 0.05, door.height + 0.05, hd + 0.02, trim));
    group.add(box(0.12, 0.025, 0.04, mat(COLORS.metal, { metalness: 0.6, roughness: 0.3 }), d1 - 0.12, 1.02, hd + 0.005));

    // Window frames: sills, heads and mullions.
    const f = 0.05;
    group.add(slab(w.back.x0, w.sill - 0.02, -hd - 0.02, w.back.x1, w.sill + 0.03, -hd + 0.14, trim));
    group.add(slab(w.back.x0, w.head - f, -hd - 0.02, w.back.x1, w.head, -hd + 0.03, trim));
    for (const x of [w.back.x0, (w.back.x0 + w.back.x1) / 2, w.back.x1]) {
        group.add(slab(x - f / 2, w.sill, -hd - 0.02, x + f / 2, w.head, -hd + 0.03, trim));
    }
    group.add(slab(hw - 0.14, w.sill - 0.02, w.right.z0, hw + 0.02, w.sill + 0.03, w.right.z1, trim));
    group.add(slab(hw - 0.03, w.head - f, w.right.z0, hw + 0.02, w.head, w.right.z1, trim));
    for (const z of [w.right.z0, (w.right.z0 + w.right.z1) / 2, w.right.z1]) {
        group.add(slab(hw - 0.03, w.sill, z - f / 2, hw + 0.02, w.head, z + f / 2, trim));
    }
}

/**
 * The wall calendar: a board with a painted month on it (textures.calendar)
 * and a binder clip at the top.
 */
function buildCalendar(group, config, texture, picks) {
    const c = config.room.calendar;
    const back = -config.room.depth / 2;
    const cal = tag(new THREE.Group(), 'calendar');
    cal.add(slab(c.x - c.width / 2 - 0.02, c.y - c.height / 2 - 0.02, back, c.x + c.width / 2 + 0.02, c.y + c.height / 2 + 0.02, back + 0.012, mat(0x8a6a4a)));
    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(c.width, c.height),
        texture ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }) : mat(0xf8f5ee, { roughness: 0.9 })
    );
    face.position.set(c.x, c.y, back + 0.014);
    cal.add(face);
    cal.add(box(0.12, 0.035, 0.02, mat(COLORS.metal, { metalness: 0.5, roughness: 0.3 }), c.x, c.y + c.height / 2 + 0.005, back + 0.02));
    group.add(cal);
    picks.calendar = cal;
    return face;
}

/**
 * The filing cabinet: a low frame holding a row of open-topped drawers, each
 * with a label card on its front (textures.drawerLabels), and every folder in
 * the office standing in them. The folders are TWO instanced meshes, the
 * manila bodies and the colored tabs, so a hundred folders cost two draw
 * calls. main.js places them (cabinet.js decides where).
 *
 * The drawers live in `drawers`, a group main.js slides out when the visitor
 * comes over. The folders are drawn in the cabinet's own frame: x across,
 * y up from the floor, z out toward the room from the cabinet's middle.
 */
function buildCabinet(group, config, labels, picks) {
    const c = config.room.cabinet;
    const cabinet = tag(new THREE.Group(), 'cabinet');
    cabinet.position.set(c.x, 0, c.z);
    const steel = mat(0x55606b, { roughness: 0.5, metalness: 0.35 });
    const inside = mat(0x3a424b, { roughness: 0.8, metalness: 0.2 });
    const hw = c.width / 2;
    const hd = c.depth / 2;
    // The frame: a plinth up to the drawers' floor, and end panels.
    cabinet.add(slab(-hw, 0, -hd, hw, c.floor, hd, steel));
    cabinet.add(slab(-hw - 0.02, 0, -hd, -hw, c.height, hd, steel));
    cabinet.add(slab(hw, 0, -hd, hw + 0.02, c.height, hd, steel));
    cabinet.add(slab(-hw, c.floor, -hd - 0.02, hw, c.height, -hd, steel));

    const drawers = new THREE.Group();
    drawers.name = 'drawers';
    const w = c.width / c.drawers;
    const faces = [];
    for (let i = 0; i < c.drawers; i++) {
        const x0 = -hw + w * i + 0.01;
        const x1 = -hw + w * (i + 1) - 0.01;
        drawers.add(slab(x0, c.floor, -hd, x1, c.floor + 0.012, hd, inside));
        drawers.add(slab(x0, c.floor, -hd, x0 + 0.01, c.height - 0.02, hd, inside));
        drawers.add(slab(x1 - 0.01, c.floor, -hd, x1, c.height - 0.02, hd, inside));
        // The front: a panel with a label card and a handle.
        drawers.add(slab(x0, c.floor, hd - 0.012, x1, c.height - 0.02, hd + 0.01, steel));
        const face = new THREE.Mesh(
            new THREE.PlaneGeometry(w * 0.62, 0.075),
            labels && labels[i] ? new THREE.MeshBasicMaterial({ map: labels[i] }) : new THREE.MeshBasicMaterial({ color: 0xf4efe4 })
        );
        face.position.set((x0 + x1) / 2, c.height - 0.08, hd + 0.0115);
        drawers.add(face);
        faces.push(face);
        drawers.add(box(w * 0.3, 0.018, 0.02, mat(COLORS.metal, { metalness: 0.6, roughness: 0.3 }), (x0 + x1) / 2, c.height - 0.16, hd + 0.02));
    }
    cabinet.add(drawers);

    // The folders: instanced, allocated to `capacity` and grown by
    // ensureCapacity. The bodies are tinted per instance (a dim for folders
    // a search passed over) and the tabs by status.
    const folders = buildFolderMeshes(c, c.capacity);
    drawers.add(folders.bodies, folders.tabs);
    group.add(cabinet);
    picks.cabinet = cabinet;
    return { group: cabinet, drawers, faces, ...folders };
}

function buildFolderMeshes(c, capacity) {
    const bodies = new THREE.InstancedMesh(
        new THREE.BoxGeometry(c.width / c.drawers - 0.08, c.folderHeight, 0.006),
        mat(0xffffff, { roughness: 0.9 }),
        capacity
    );
    const tabs = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.1, 0.035, 0.007),
        mat(0xffffff, { roughness: 0.7 }),
        capacity
    );
    for (const mesh of [bodies, tabs]) {
        mesh.count = 0;
        mesh.userData.pick = 'cabinet-folder';
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    bodies.name = 'folder-bodies';
    tabs.name = 'folder-tabs';
    // Colors exist from the start, so the first frame is not all white.
    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < capacity; i++) {
        bodies.setColorAt(i, white);
        tabs.setColorAt(i, white);
    }
    return { bodies, tabs, capacity };
}

/**
 * Make sure the cabinet can hold `n` folders, rebuilding its instanced
 * meshes at double the size when it cannot. Returns true when it rebuilt.
 */
export function ensureCapacity(cabinet, n, config) {
    if (n <= cabinet.capacity) return false;
    let capacity = cabinet.capacity;
    while (capacity < n) capacity *= 2;
    const next = buildFolderMeshes(config.room.cabinet, capacity);
    cabinet.drawers.remove(cabinet.bodies, cabinet.tabs);
    cabinet.bodies.geometry.dispose();
    cabinet.tabs.geometry.dispose();
    cabinet.drawers.add(next.bodies, next.tabs);
    Object.assign(cabinet, next);
    return true;
}

/**
 * The corkboard on the left wall: a cork panel in a wooden frame, a strip of
 * column names across the top (textures.boardHeader), and every card as ONE
 * mesh of quads over one atlas (textures.boardCards), which setBoardQuads
 * rewrites as cards move. One draw call for the whole board.
 */
function buildBoard(group, config, textures, picks) {
    const b = config.room.board;
    const wallX = -config.room.width / 2;
    const board = tag(new THREE.Group(), 'board');
    const cork = mat(0xb98a5a, { roughness: 1 });
    const wood = mat(0x6b4128, { roughness: 0.6 });
    const z0 = b.z - b.width / 2;
    const z1 = b.z + b.width / 2;
    const y0 = b.y - b.height / 2;
    const y1 = b.y + b.height / 2;
    board.add(slab(wallX, y0, z0, b.x - 0.003, y1, z1, cork));
    const f = 0.045;
    board.add(slab(wallX, y1, z0 - f, b.x + 0.01, y1 + f, z1 + f, wood));
    board.add(slab(wallX, y0 - f, z0 - f, b.x + 0.01, y0, z1 + f, wood));
    board.add(slab(wallX, y0, z0 - f, b.x + 0.01, y1, z0, wood));
    board.add(slab(wallX, y0, z1, b.x + 0.01, y1, z1 + f, wood));

    const header = new THREE.Mesh(
        new THREE.PlaneGeometry(b.width, b.header),
        textures.boardHeader ? new THREE.MeshBasicMaterial({ map: textures.boardHeader }) : new THREE.MeshBasicMaterial({ color: 0xf4efe4 })
    );
    // A plane faces +z. Turned a quarter to face +x, its right runs to -z,
    // which is the screen's right when the camera faces the wall.
    header.rotation.y = Math.PI / 2;
    header.position.set(b.x + 0.002, y1 - b.header / 2, b.z);
    board.add(header);

    const cards = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshStandardMaterial({ map: textures.boardCards || null, roughness: 0.9, side: THREE.DoubleSide })
    );
    cards.userData.pick = 'board-card';
    cards.name = 'board-cards';
    cards.frustumCulled = false;
    board.add(cards);
    group.add(board);
    picks.board = board;
    return { group: board, header, cards };
}

/**
 * Lay the cards: `quads` is a list of `{ corners, depth, uvs }` in the
 * wall's frame (corners `[y, z]`, board.js cardCorners). The geometry is
 * reused when the count is unchanged, so a card being carried or dragged
 * costs one attribute upload a frame.
 */
export function setBoardQuads(cards, quads, config) {
    const x = config.room.board.x;
    const n = quads.length;
    let geometry = cards.geometry;
    const fits = Boolean(geometry && geometry.attributes && geometry.attributes.position
        && geometry.attributes.position.count === n * 4);
    if (!fits) {
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 8), 2));
        geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 12), 3));
        const index = [];
        for (let i = 0; i < n; i++) {
            const base = i * 4;
            index.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
        geometry.setIndex(index);
        const normals = geometry.attributes.normal;
        for (let i = 0; i < n * 4; i++) normals.setXYZ(i, 1, 0, 0);
        if (cards.geometry) cards.geometry.dispose();
        cards.geometry = geometry;
    }
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    quads.forEach((q, i) => {
        for (let k = 0; k < 4; k++) {
            pos.setXYZ(i * 4 + k, x + q.depth, q.corners[k][0], q.corners[k][1]);
            uv.setXY(i * 4 + k, q.uvs[k][0], q.uvs[k][1]);
        }
    });
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    geometry.computeBoundingSphere();
    cards.visible = n > 0;
    return geometry;
}

/**
 * The Rolodex: a base, two side wheels on an axle, a knob, and a ring of
 * lettered cards (textures.rolodex, one cell per letter) that turns about
 * the axle. The ring is one merged mesh, and turning it is turning its
 * group, so a spin costs nothing but a rotation.
 */
function buildRolodex(group, config, texture, picks, quad, uvs, count) {
    const r = config.room.rolodex;
    const top = config.room.desk.height;
    const rolodex = tag(new THREE.Group(), 'rolodex');
    rolodex.position.set(r.x, top, r.z);
    const dark = mat(0x2d2a28, { roughness: 0.5, metalness: 0.2 });
    rolodex.add(box(r.width, 0.03, 0.15, dark, 0, 0.015, 0));
    for (const side of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r.wheel, r.wheel, 0.012, 28), dark);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * (r.width / 2 - 0.006), r.axle, 0);
        rolodex.add(wheel);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, r.width + 0.03, 10), mat(COLORS.metal, { metalness: 0.6, roughness: 0.3 }));
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, r.axle, 0);
    rolodex.add(axle);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.025, 16), mat(0xc8553d, { roughness: 0.4 }));
    knob.rotation.z = Math.PI / 2;
    knob.position.set(r.width / 2 + 0.025, r.axle, 0);
    rolodex.add(knob);

    const ring = new THREE.Group();
    ring.name = 'rolodex-ring';
    ring.position.set(0, r.axle, 0);
    const positions = [];
    const uv = [];
    const index = [];
    for (let i = 0; i < count; i++) {
        const q = quad(i);
        const t = uvs(i);
        for (let k = 0; k < 4; k++) {
            positions.push(...q[k]);
            uv.push(...t[k]);
        }
        const base = i * 4;
        index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    const cards = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        map: texture || null, color: texture ? 0xffffff : 0xf6f1e6, roughness: 0.9, side: THREE.DoubleSide
    }));
    cards.name = 'rolodex-cards';
    ring.add(cards);
    rolodex.add(ring);
    addHitBox(rolodex, 0.02);
    group.add(rolodex);
    picks.rolodex = rolodex;
    return { group: rolodex, ring, cards };
}

/**
 * The departures board over the door: a dark frame holding one plane, whose
 * face is the split-flap board painted by main.js (textures.departures).
 * The plane faces into the room, its right toward -x, which is the screen's
 * right for a camera looking at the front wall.
 */
function buildDepartures(group, config, texture, picks) {
    const b = config.room.departures;
    const front = config.room.depth / 2;
    const board = tag(new THREE.Group(), 'departures');
    board.add(slab(b.x - b.width / 2 - 0.04, b.y - b.height / 2 - 0.04, front - 0.05, b.x + b.width / 2 + 0.04, b.y + b.height / 2 + 0.04, front, mat(0x2b2d31, { roughness: 0.5, metalness: 0.3 })));
    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(b.width, b.height),
        new THREE.MeshBasicMaterial(texture ? { map: texture, toneMapped: false } : { color: 0x16181c })
    );
    face.rotation.y = Math.PI;
    face.position.set(b.x, b.y, front - 0.052);
    board.add(face);
    group.add(board);
    picks.departures = board;
    return face;
}

/**
 * The whiteboard on the left wall: a white panel in a thin frame with a
 * marker tray, its face painted by main.js (textures.whiteboard). It faces
 * +x, so its right runs to -z, the screen's right from the room. A raycast's
 * uv on it is how a tap on the goal line is recognized (whiteboard.js).
 */
function buildWhiteboard(group, config, texture, picks) {
    const w = config.room.whiteboard;
    const wallX = -config.room.width / 2;
    const board = tag(new THREE.Group(), 'whiteboard');
    const frame = mat(0xb8bcc2, { roughness: 0.35, metalness: 0.6 });
    const z0 = w.z - w.width / 2;
    const z1 = w.z + w.width / 2;
    const y0 = w.y - w.height / 2;
    const y1 = w.y + w.height / 2;
    board.add(slab(wallX, y0 - 0.03, z0 - 0.03, w.x - 0.004, y1 + 0.03, z1 + 0.03, frame));
    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(w.width, w.height),
        new THREE.MeshBasicMaterial(texture ? { map: texture, toneMapped: false } : { color: 0xf7f7f4 })
    );
    face.rotation.y = Math.PI / 2;
    face.position.set(w.x, w.y, w.z);
    board.add(face);
    board.add(slab(wallX, y0 - 0.06, z0 + 0.2, w.x + 0.05, y0 - 0.035, z1 - 0.2, frame));
    board.add(box(0.02, 0.02, 0.13, mat(0x2b5fa8, { roughness: 0.4 }), w.x + 0.03, y0 - 0.025, w.z - 0.1));
    board.add(box(0.02, 0.02, 0.13, mat(0xc8392b, { roughness: 0.4 }), w.x + 0.03, y0 - 0.025, w.z + 0.08));
    group.add(board);
    picks.whiteboard = board;
    return face;
}

/** The printer, on a small stand under the right-hand window, with a page
 *  in its tray and a green light that says it is ready. */
function buildPrinter(group, config, picks) {
    const p = config.room.printer;
    const printer = tag(new THREE.Group(), 'printer');
    printer.position.set(p.x, 0, p.z);
    const standMat = mat(0x3f454d, { roughness: 0.6, metalness: 0.3 });
    printer.add(box(0.5, p.stand, 0.44, standMat, 0, p.stand / 2, 0));
    const body = mat(0xe6e4df, { roughness: 0.5 });
    printer.add(box(0.44, 0.17, 0.36, body, 0, p.stand + 0.085, 0));
    printer.add(box(0.44, 0.03, 0.3, mat(0x2b2d31, { roughness: 0.5 }), 0, p.stand + 0.185, 0.02));
    printer.add(box(0.3, 0.012, 0.14, body, -0.02, p.stand + 0.03, 0.24));
    printer.add(box(0.22, 0.004, 0.12, mat(COLORS.paper), -0.02, p.stand + 0.04, 0.24));
    printer.add(box(0.02, 0.012, 0.012, new THREE.MeshBasicMaterial({ color: 0x5dd37a }), 0.17, p.stand + 0.14, 0.181));
    addHitBox(printer, 0.03);
    group.add(printer);
    picks.printer = printer;
    return printer;
}

/**
 * The sticky notes: ONE mesh whose geometry holds a quad per note, each
 * mapped to its own cell of one atlas (notes.js). `setNotes` rebuilds the
 * geometry when the number of notes changes.
 */
function buildNotes(group, config, texture, picks) {
    const d = config.room.desk;
    const notes = tag(new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshStandardMaterial({ map: texture || null, color: texture ? 0xffffff : 0xfbe38e, roughness: 0.95, side: THREE.DoubleSide })
    ), 'notes');
    // On the bezel's face, just in front of it: the screen's center.
    notes.position.set(d.x + 0.05, d.height + 0.36, d.z - d.depth / 2 + 0.22 + 0.021);
    notes.visible = false;
    group.add(notes);
    picks.notes = notes;
    return notes;
}

/**
 * Show `count` notes, laid out by `corners(i)` and `uvs(i)` (notes.js). The
 * mesh hides when there are none, so an empty day has a clean monitor.
 */
export function setNotes(notes, count, corners, uvs) {
    const positions = [];
    const uv = [];
    const index = [];
    for (let i = 0; i < count; i++) {
        const q = corners(i);
        const t = uvs(i);
        const base = i * 4;
        for (let k = 0; k < 4; k++) {
            // Each note a hair in front of the one before, so overlaps never
            // flicker.
            positions.push(q[k][0], q[k][1], i * 0.0004);
            uv.push(t[k][0], t[k][1]);
        }
        index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    if (notes.geometry) notes.geometry.dispose();
    notes.geometry = geometry;
    notes.visible = count > 0;
    return geometry;
}

function buildDesk(group, config, picks) {
    const d = config.room.desk;
    const x0 = d.x - d.width / 2;
    const x1 = d.x + d.width / 2;
    const z0 = d.z - d.depth / 2;
    const z1 = d.z + d.depth / 2;
    const top = d.height;
    const wood = mat(COLORS.desk, { roughness: 0.55 });
    const dark = mat(COLORS.deskDark, { roughness: 0.6 });
    const desk = new THREE.Group();
    desk.name = 'desk';
    desk.add(slab(x0, top - 0.04, z0, x1, top, z1, wood));
    desk.add(slab(x0, 0, z0 + 0.04, x0 + 0.04, top - 0.04, z1 - 0.04, dark));
    desk.add(slab(x1 - 0.04, 0, z0 + 0.04, x1, top - 0.04, z1 - 0.04, dark));
    desk.add(slab(x0 + 0.04, 0.3, z0 + 0.02, x1 - 0.04, top - 0.04, z0 + 0.05, dark));
    group.add(desk);

    // The monitor, which is the computer station.
    const metal = mat(COLORS.metal, { roughness: 0.4, metalness: 0.3 });
    const computer = tag(new THREE.Group(), 'computer');
    const mx = d.x + 0.05;
    const mz = z0 + 0.22;
    computer.add(box(0.24, 0.015, 0.16, metal, mx, top + 0.008, mz));
    computer.add(box(0.04, 0.16, 0.03, metal, mx, top + 0.09, mz - 0.03));
    const bezel = box(0.66, 0.41, 0.035, metal, mx, top + 0.36, mz);
    computer.add(bezel);
    computer.add(box(0.44, 0.015, 0.14, mat(0x3a3d42), mx, top + 0.008, z1 - 0.2));
    group.add(computer);
    picks.computer = computer;

    // The monitor's face: a plane just in front of the bezel, painted by
    // main.js when there is a canvas.
    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.37),
        new THREE.MeshBasicMaterial({ color: COLORS.screenOff })
    );
    screen.position.set(mx, top + 0.36, mz + 0.019);
    computer.add(screen);

    // The trays, at the left end: in at the back, out at the front.
    const trayMat = mat(COLORS.tray, { roughness: 0.5 });
    const paper = mat(COLORS.paper, { roughness: 0.95 });
    const tray = (key, z, sheets) => {
        const g = tag(new THREE.Group(), key);
        const tx = x0 + 0.24;
        g.add(box(0.34, 0.012, 0.26, trayMat, tx, top + 0.006, z));
        g.add(box(0.34, 0.06, 0.012, trayMat, tx, top + 0.03, z - 0.124));
        g.add(box(0.34, 0.035, 0.012, trayMat, tx, top + 0.018, z + 0.124));
        g.add(box(0.012, 0.06, 0.26, trayMat, tx - 0.164, top + 0.03, z));
        g.add(box(0.012, 0.06, 0.26, trayMat, tx + 0.164, top + 0.03, z));
        for (let i = 0; i < sheets; i++) g.add(box(0.3, 0.004, 0.22, paper, tx, top + 0.016 + i * 0.006, z));
        group.add(g);
        picks[key] = g;
    };
    tray('intray', z0 + 0.2, 2);
    tray('outtray', z1 - 0.18, 1);

    // The lamp, at the right end, which the visitor can switch.
    const lampGroup = tag(new THREE.Group(), 'lamp');
    // Far enough toward the corner that its hit box stays clear of the
    // monitor's edge, where the sticky notes are (tests/office-room).
    const lx = x1 - 0.13;
    const lz = z0 + 0.22;
    lampGroup.add(box(0.16, 0.02, 0.16, metal, lx, top + 0.01, lz));
    lampGroup.add(box(0.02, 0.42, 0.02, metal, lx, top + 0.22, lz));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.14, 20, 1, true), mat(COLORS.shade, { side: THREE.DoubleSide }));
    shade.position.set(lx - 0.07, top + 0.44, lz + 0.05);
    shade.rotation.z = 0.5;
    lampGroup.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1c9 }));
    bulb.position.set(lx - 0.1, top + 0.4, lz + 0.05);
    lampGroup.add(bulb);
    const light = new THREE.PointLight(0xffd9a0, 1.6, 3.5, 2);
    light.position.copy(bulb.position);
    lampGroup.add(light);
    addHitBox(lampGroup);
    group.add(lampGroup);
    picks.lamp = lampGroup;

    // A mug, for company, between the monitor and the lamp.
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 16), mat(COLORS.mug, { roughness: 0.35 }));
    mug.position.set(x1 - 0.37, top + 0.05, d.z + 0.07);
    group.add(mug);

    // The open folder, lying on the desk while its card is open. Two covers
    // side by side, and a few pages on the right one.
    const folder = tag(new THREE.Group(), 'folder');
    const manila = mat(COLORS.manila, { roughness: 0.9 });
    const fx = d.x + 0.02;
    const fz = z1 - 0.2;
    folder.add(box(0.22, 0.004, 0.3, manila, fx - 0.112, top + 0.002, fz));
    folder.add(box(0.22, 0.004, 0.3, manila, fx + 0.112, top + 0.002, fz));
    folder.add(box(0.2, 0.006, 0.27, paper, fx + 0.112, top + 0.007, fz));
    folder.visible = false;
    group.add(folder);
    picks.folder = folder;

    return { screen, light, bulb, folder, lampGroup };
}

function buildFloorThings(group, config, picks) {
    const d = config.room.desk;
    // The wastebasket, beside the desk on the corner side.
    const basket = tag(new THREE.Group(), 'wastebasket');
    const bx = d.x + d.width / 2 + 0.26;
    const bz = d.z + 0.05;
    const wire = mat(COLORS.basket, { roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.36, 24, 1, true), wire);
    shell.position.set(bx, 0.18, bz);
    basket.add(shell);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), wire);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(bx, 0.01, bz);
    basket.add(bottom);
    // A crumpled page, so it reads as a wastebasket at a glance.
    const crumple = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), mat(COLORS.paper, { flatShading: true }));
    crumple.position.set(bx + 0.02, 0.3, bz - 0.02);
    basket.add(crumple);
    addHitBox(basket, 0.02);
    group.add(basket);
    picks.wastebasket = basket;

    // The chair, pushed back from the desk's right end as if just left. It
    // stood at the left end until M6, where it hid the printer from the desk.
    const chair = new THREE.Group();
    chair.name = 'chair';
    const cm = mat(COLORS.chair, { roughness: 0.7 });
    chair.add(box(0.48, 0.07, 0.46, cm, 0, 0.47, 0));
    chair.add(box(0.46, 0.5, 0.06, cm, 0, 0.78, 0.22));
    chair.add(box(0.05, 0.42, 0.05, mat(COLORS.metal), 0, 0.22, 0));
    chair.add(box(0.5, 0.03, 0.08, mat(COLORS.metal), 0, 0.02, 0));
    chair.add(box(0.08, 0.03, 0.5, mat(COLORS.metal), 0, 0.02, 0));
    chair.position.set(d.x + d.width / 2 + 0.25, 0, d.z + 0.95);
    chair.rotation.y = -0.7;
    group.add(chair);

    // A plant in the front right corner, where it has the window's light and
    // is clear of the corkboard and the whiteboard.
    const plant = new THREE.Group();
    plant.name = 'plant';
    const hw = config.room.width / 2;
    const px = hw - 0.4;
    const pz = config.room.depth / 2 - 0.45;
    plant.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.38, 20), mat(COLORS.pot)));
    plant.children[0].position.set(px, 0.19, pz);
    const leaves = mat(COLORS.plant, { flatShading: true });
    for (const [dx, dy, dz, r] of [[0, 0.75, 0, 0.3], [0.12, 1.0, 0.05, 0.22], [-0.1, 0.95, -0.08, 0.2], [0, 1.2, 0, 0.16]]) {
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leaves);
        leaf.position.set(px + dx, dy, pz + dz);
        plant.add(leaf);
    }
    group.add(plant);
}

/**
 * Build the office. `textures` may carry `screen` (the monitor's face),
 * `calendar`, `notes`,
 * `drawerLabels` (one per drawer), `boardHeader`, `boardCards`, `rolodex`,
 * `departures` and `whiteboard`, all optional. `rolodexRing` is the Rolodex's card layout
 * (`{ quad(i), uvs(i), count }`, from rolodex.js), and without it there is
 * no Rolodex.
 */
export function buildRoom(config, textures = {}) {
    const group = new THREE.Group();
    group.name = 'room';
    const picks = {};
    buildShell(group, config);
    const desk = buildDesk(group, config, picks);
    buildFloorThings(group, config, picks);
    const calendar = buildCalendar(group, config, textures.calendar || null, picks);
    const cabinet = buildCabinet(group, config, textures.drawerLabels || null, picks);
    const board = buildBoard(group, config, textures, picks);
    const departures = buildDepartures(group, config, textures.departures || null, picks);
    const whiteboard = buildWhiteboard(group, config, textures.whiteboard || null, picks);
    buildPrinter(group, config, picks);
    const ringOf = textures.rolodexRing || null;
    const rolodex = ringOf ? buildRolodex(group, config, textures.rolodex || null, picks, ringOf.quad, ringOf.uvs, ringOf.count) : null;
    const notes = buildNotes(group, config, textures.notes || null, picks);
    if (textures.screen) {
        desk.screen.material = new THREE.MeshBasicMaterial({ map: textures.screen, toneMapped: false });
    }
    return {
        group,
        picks,
        screen: desk.screen,
        folder: desk.folder,
        calendar,
        cabinet,
        board,
        rolodex,
        departures,
        whiteboard,
        notes,
        lamp: { light: desk.light, bulb: desk.bulb, group: desk.lampGroup }
    };
}

/** Switch the lamp. The bulb dims with it, so the lamp reads as off. */
export function setLamp(lamp, on) {
    lamp.light.visible = on;
    lamp.bulb.material.color.setHex(on ? 0xfff1c9 : 0x6b6356);
}
