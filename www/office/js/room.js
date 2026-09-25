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
 * sticky notes open today's list, the
 * filing cabinet opens itself and a folder in it opens on the desk, the
 * corkboard opens itself (its cards drag between columns), the whiteboard
 * opens its numbers (and its goal line the weekly
 * goal), the departures board opens the week, and the printer prints a prep
 * sheet. `pickOf` walks up from whatever a ray hit to the nearest of these.
 *
 * NO CANVAS IN HERE. The monitor's face, the sticky notes
 * and the rest take optional textures (`textures.screen`, `.notes` and so
 * on) that main.js paints, so this file builds the same room
 * under real three in node:vm, where there is no canvas, and a test can
 * measure what the eye sees.
 *
 * Builds and returns `{ group, picks, lamp, folder, screen,
 * cabinet, board, departures, whiteboard, notes, rain }`. It adds nothing
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
    shade: 0x1f6f4a,
    brass: 0xc9a04a,
    plant: 0x2f6b3a,
    pot: 0xb86b45,
    chair: 0x26282c,
    caster: 0x151618
};

/** How far the in-tray stands over the out-tray it is stacked on. */
export const TRAY_RISE = 0.11;

/** How brightly the lamp shade's white glass glows while the lamp is on. */
export const LAMP_GLOW = 0.7;

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

/**
 * A box, its edges and corners rounded by `r` (QA, 2026-09-25: edges sharp
 * as a knife were much of what read as computer-made). A rounded rectangle
 * extruded along the box's thinnest side, with a quarter-round bevel that
 * starts `r` inside the outline and ends on it, so the box's outside is
 * exactly `w` by `h` by `d`, as the square box's was. Centered on the origin.
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
    // The bevel round the two broad faces is a little smaller than the
    // corners' radius: the broad faces are triangulated on the outline and
    // then drawn stepped in by the bevel, and stepped in by the whole
    // radius the corners' arcs close to points and triangles right across
    // the face fold over, inside out (measured 2026-09-25).
    const bevel = round * 0.6;
    const g = new THREE.ExtrudeGeometry(shape, {
        depth: size[axis] - 2 * bevel,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelOffset: -bevel,
        bevelSegments: 3,
        curveSegments: 3
    });
    // Onto the box's own axes: the outline's x and y to the two wide sides,
    // the extrusion to the thin one. That is a permutation of the axes, and
    // an odd one would turn every face inside out, so one axis is flipped
    // to keep it a rotation (the box is symmetric, so nothing moves).
    const odd = axis === 1;
    const basis = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    basis[0].setComponent(a, 1);
    basis[1].setComponent(b, odd ? -1 : 1);
    basis[2].setComponent(axis, 1);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(basis[0], basis[1], basis[2]));
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z);
    return g;
}

/** A slab by its corners, as `slab`, with its edges rounded by `r`. */
function roundedSlab(x0, y0, z0, x1, y1, z1, r, material) {
    const mesh = new THREE.Mesh(roundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, r), material);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return mesh;
}

/** A box by its size and middle, as `box`, with its edges rounded by `r`. */
function roundedBox(w, h, d, r, material, x, y, z) {
    const mesh = new THREE.Mesh(roundedBoxGeometry(w, h, d, r), material);
    mesh.position.set(x, y, z);
    return mesh;
}

/** An upright cylinder of radius `r` and height `h`, centered on a point. */
function cylinder(r, h, material, x, y, z, segments = 12) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), material);
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
    // printer) would otherwise get its hit box twice as far away.
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

/** How far the chair is turned from square to the back wall, toward the
 *  desk's right end (radians, positive turns its seat toward -x). */
export const CHAIR_TURN = 0.6;

/** The chair's base: how many legs, how far each reaches from the column,
 *  and the radius of the caster at its end. Meters. */
export const CHAIR_LEGS = { count: 5, reach: 0.3, wheel: 0.03 };

/** The window openings, shared by the walls, the frames and the tests. */
export function windowsOf(config) {
    const { width, depth, backWindow } = config.room;
    return {
        sill: 0.95,
        head: 2.45,
        back: { x0: backWindow.x0, x1: width / 2 - 0.1, mullions: backWindow.mullions },
        right: { z0: -depth / 2 + 0.1, z1: 0.3 }
    };
}

/**
 * Fold meshes that share a material into one mesh each, their places baked
 * in. The room's shell is a few dozen boxes and planes in a handful of
 * materials, and every mesh is a draw call on every frame, which on a
 * phone is the budget the scenery outside would rather spend.
 */
export function mergeByMaterial(meshes) {
    const byMaterial = new Map();
    for (const mesh of meshes) {
        mesh.updateMatrix();
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        g.applyMatrix4(mesh.matrix);
        if (!byMaterial.has(mesh.material)) byMaterial.set(mesh.material, []);
        byMaterial.get(mesh.material).push(g);
    }
    return [...byMaterial].map(([material, parts]) => {
        const merged = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'uv']) {
            if (!parts.every((p) => p.attributes[name])) continue;
            const arrays = parts.map((p) => p.attributes[name].array);
            const array = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
            let at = 0;
            for (const a of arrays) {
                array.set(a, at);
                at += a.length;
            }
            merged.setAttribute(name, new THREE.BufferAttribute(array, parts[0].attributes[name].itemSize));
        }
        const mesh = new THREE.Mesh(merged, material);
        mesh.name = 'shell';
        return mesh;
    });
}

function buildShell(room, config) {
    // Built loose, then folded by material into a few meshes (mergeByMaterial).
    const group = new THREE.Group();
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
    group.add(roundedSlab(d0 - 0.05, 0, hd - 0.02, d0, door.height + 0.05, hd + 0.02, 0.008, trim));
    group.add(roundedSlab(d1, 0, hd - 0.02, d1 + 0.05, door.height + 0.05, hd + 0.02, 0.008, trim));
    group.add(roundedSlab(d0 - 0.05, door.height, hd - 0.02, d1 + 0.05, door.height + 0.05, hd + 0.02, 0.008, trim));
    group.add(box(0.12, 0.025, 0.04, mat(COLORS.metal, { metalness: 0.6, roughness: 0.3 }), d1 - 0.12, 1.02, hd + 0.005));

    // Window frames: sills, heads and mullions.
    const f = 0.05;
    group.add(roundedSlab(w.back.x0, w.sill - 0.02, -hd - 0.02, w.back.x1, w.sill + 0.03, -hd + 0.14, 0.014, trim));
    group.add(slab(w.back.x0, w.head - f, -hd - 0.02, w.back.x1, w.head, -hd + 0.03, trim));
    for (const x of [w.back.x0, ...w.back.mullions, w.back.x1]) {
        group.add(roundedSlab(x - f / 2, w.sill, -hd - 0.02, x + f / 2, w.head, -hd + 0.03, 0.008, trim));
    }
    group.add(roundedSlab(hw - 0.14, w.sill - 0.02, w.right.z0, hw + 0.02, w.sill + 0.03, w.right.z1, 0.014, trim));
    group.add(slab(hw - 0.03, w.head - f, w.right.z0, hw + 0.02, w.head, w.right.z1, trim));
    for (const z of [w.right.z0, (w.right.z0 + w.right.z1) / 2, w.right.z1]) {
        group.add(roundedSlab(hw - 0.03, w.sill, z - f / 2, hw + 0.02, w.head, z + f / 2, 0.008, trim));
    }
    for (const mesh of mergeByMaterial(group.children)) room.add(mesh);
}

/** How much glass one painted tile of drops covers, in meters. */
export const RAIN_TILE = 0.6;

/**
 * Rain on the glass: a pane in each window opening wearing the painted
 * drops (textures.rainGlass), clear until it rains (`set(level)`). The
 * panes are there to be seen, never to be hit: a tap or a census ray passes
 * through them to the city.
 */
function buildRainPanes(group, config, texture) {
    const w = windowsOf(config);
    const hw = config.room.width / 2;
    const hd = config.room.depth / 2;
    const height = w.head - w.sill;
    if (texture) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
    }
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff, map: texture, transparent: true, opacity: 0, depthWrite: false, roughness: 0.15
    });
    // The drops tile the glass at RAIN_TILE meters a tile, so a drop is a
    // few millimeters however near the eye is (the Window station stands a
    // hand's breadth from the back pane).
    const pane = (width) => {
        const g = new THREE.PlaneGeometry(width, height);
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * width) / RAIN_TILE, (uv.getY(i) * height) / RAIN_TILE);
        return g;
    };
    const back = new THREE.Mesh(pane(w.back.x1 - w.back.x0), material);
    back.position.set((w.back.x0 + w.back.x1) / 2, (w.sill + w.head) / 2, -hd + 0.01);
    const right = new THREE.Mesh(pane(w.right.z1 - w.right.z0), material);
    right.position.set(hw - 0.01, (w.sill + w.head) / 2, (w.right.z0 + w.right.z1) / 2);
    right.rotation.y = -Math.PI / 2;
    const panes = [back, right];
    for (const pane of panes) {
        pane.name = 'rain-glass';
        pane.visible = false;
        pane.raycast = () => {};
        group.add(pane);
    }
    return {
        panes,
        set(level) {
            material.opacity = texture ? Math.min(1, level * 1.2) : 0;
            for (const pane of panes) pane.visible = level > 0.02 && !!texture;
        }
    };
}

/**
 * The soft dark where things meet what they stand on: under the desk, the
 * cabinet, the printer, the wastebasket, the chair and the plant, and on the
 * desk under the monitor, the keyboard, the trays and the lamp (QA,
 * 2026-09-25: with no shade where they touched down, things floated). Each
 * patch is `{ x, z, y, w, d, soft, alpha }`: a rounded rectangle, dark
 * `alpha` in its middle, fading to nothing over its outer `soft` meters.
 * All of them are ONE mesh, black with the fade in its vertex colors, laid a
 * few millimeters over the surface (and over the rug), and a tap or a ray
 * passes through it.
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

/** How high over the surface under it a contact patch lies, in meters. */
export const CONTACT_LIFT = 0.006;

function buildContactShadows(group, patches) {
    const positions = [];
    const colors = [];
    const index = [];
    for (const patch of patches) {
        const { xs, zs, fade } = contactGrid(patch);
        const base = positions.length / 3;
        for (const v of zs) {
            for (const u of xs) {
                positions.push(patch.x + u, patch.y + CONTACT_LIFT, patch.z + v);
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
    group.add(mesh);
    return mesh;
}

/**
 * The glass as a faint mirror by night (QA, 2026-09-25): a pane in each
 * window opening, a hair inside the rain's, wearing the room as seen in the
 * glass (main.js renders it, interior.js works out the mirror's camera and
 * lays the picture onto the pane). Added onto the city behind, so it only
 * shows once the city outside is darker than the room. The panes are a fine
 * grid, because the picture is laid on by each corner's own place in it,
 * and a pane in two triangles would bend it. Clear by day; a tap or a ray
 * passes through.
 */
export const MIRROR_GRID = [24, 10];

function buildReflectionPanes(group, config) {
    const w = windowsOf(config);
    const hw = config.room.width / 2;
    const hd = config.room.depth / 2;
    const height = w.head - w.sill;
    const y = (w.sill + w.head) / 2;
    const pane = (width, name) => {
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height, MIRROR_GRID[0], MIRROR_GRID[1]),
            new THREE.MeshBasicMaterial({
                color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
            })
        );
        mesh.name = name;
        mesh.visible = false;
        mesh.raycast = () => {};
        group.add(mesh);
        return mesh;
    };
    const back = pane(w.back.x1 - w.back.x0, 'mirror-back');
    back.position.set((w.back.x0 + w.back.x1) / 2, y, -hd + 0.012);
    const right = pane(w.right.z1 - w.right.z0, 'mirror-right');
    right.position.set(hw - 0.012, y, (w.right.z0 + w.right.z1) / 2);
    right.rotation.y = -Math.PI / 2;
    const panes = [
        { mesh: back, normal: [0, 0, 1], point: back.position.toArray() },
        { mesh: right, normal: [-1, 0, 0], point: right.position.toArray() }
    ];
    return {
        panes,
        /** How strongly the glass mirrors the room, 0 (not at all) to 1. */
        set(level) {
            for (const p of panes) {
                p.mesh.material.opacity = level;
                p.mesh.visible = level > 0.01 && !!p.mesh.material.map;
            }
        }
    };
}

/**
 * Every solid thing casts a shadow and takes one, walls and ceiling too, so
 * the sun comes in by the windows only (interior.js sunbeam). What is
 * see-through or painted flat (the panes, the contact patches, the notes
 * and cards, the invisible hit boxes) casts none. Returns the materials
 * that should mirror the room (metals, and the desk's lacquer): each is
 * given the room's environment by main.js.
 */
function castShadows(group) {
    const shiny = new Set();
    group.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        const solid = m.visible !== false && !m.transparent && !m.isMeshBasicMaterial
            && !['notes', 'board-cards'].includes(o.name);
        o.castShadow = solid;
        o.receiveShadow = !m.isMeshBasicMaterial;
        if (m.isMeshStandardMaterial && (m.metalness >= 0.25 || m.clearcoat > 0)) shiny.add(m);
    });
    return [...shiny];
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
    cabinet.add(roundedSlab(-hw, 0, -hd, hw, c.floor, hd, 0.006, steel));
    cabinet.add(roundedSlab(-hw - 0.02, 0, -hd, -hw, c.height, hd, 0.006, steel));
    cabinet.add(roundedSlab(hw, 0, -hd, hw + 0.02, c.height, hd, 0.006, steel));
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
        drawers.add(roundedSlab(x0, c.floor, hd - 0.012, x1, c.height - 0.02, hd + 0.01, 0.006, steel));
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
 * The departures board over the door: a dark frame holding one plane, whose
 * face is the split-flap board painted by main.js (textures.departures).
 * The plane faces into the room, its right toward -x, which is the screen's
 * right for a camera looking at the front wall.
 */
function buildDepartures(group, config, texture, picks) {
    const b = config.room.departures;
    const front = config.room.depth / 2;
    const board = tag(new THREE.Group(), 'departures');
    board.add(roundedSlab(b.x - b.width / 2 - 0.04, b.y - b.height / 2 - 0.04, front - 0.05, b.x + b.width / 2 + 0.04, b.y + b.height / 2 + 0.04, front, 0.01, mat(0x2b2d31, { roughness: 0.5, metalness: 0.3 })));
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
    board.add(roundedSlab(wallX, y0 - 0.03, z0 - 0.03, w.x - 0.004, y1 + 0.03, z1 + 0.03, 0.008, frame));
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
    printer.add(roundedBox(0.5, p.stand, 0.44, 0.012, standMat, 0, p.stand / 2, 0));
    const body = mat(0xe6e4df, { roughness: 0.5 });
    printer.add(roundedBox(0.44, 0.17, 0.36, 0.025, body, 0, p.stand + 0.085, 0));
    printer.add(roundedBox(0.44, 0.03, 0.3, 0.01, mat(0x2b2d31, { roughness: 0.5 }), 0, p.stand + 0.185, 0.02));
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

function buildDesk(group, config, picks, contacts) {
    const d = config.room.desk;
    const x0 = d.x - d.width / 2;
    const x1 = d.x + d.width / 2;
    const z0 = d.z - d.depth / 2;
    const z1 = d.z + d.depth / 2;
    const top = d.height;
    // Lacquered: a clear coat over the grain that gives back the windows
    // (it reflects the room's environment, interior.js).
    const wood = new THREE.MeshPhysicalMaterial({ color: COLORS.desk, roughness: 0.55, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.14 });
    const dark = mat(COLORS.deskDark, { roughness: 0.6 });
    const desk = new THREE.Group();
    desk.name = 'desk';
    desk.add(roundedSlab(x0, top - 0.04, z0, x1, top, z1, 0.014, wood));
    desk.add(roundedSlab(x0, 0, z0 + 0.04, x0 + 0.04, top - 0.04, z1 - 0.04, 0.008, dark));
    desk.add(roundedSlab(x1 - 0.04, 0, z0 + 0.04, x1, top - 0.04, z1 - 0.04, 0.008, dark));
    desk.add(roundedSlab(x0 + 0.04, 0.3, z0 + 0.02, x1 - 0.04, top - 0.04, z0 + 0.05, 0.006, dark));
    group.add(desk);

    // The monitor, which is the computer station.
    const metal = mat(COLORS.metal, { roughness: 0.4, metalness: 0.3 });
    const computer = tag(new THREE.Group(), 'computer');
    const mx = d.x + 0.05;
    const mz = z0 + 0.22;
    computer.add(roundedBox(0.24, 0.015, 0.16, 0.006, metal, mx, top + 0.008, mz));
    computer.add(box(0.04, 0.16, 0.03, metal, mx, top + 0.09, mz - 0.03));
    const bezel = roundedBox(0.66, 0.41, 0.035, 0.012, metal, mx, top + 0.36, mz);
    computer.add(bezel);
    computer.add(roundedBox(0.44, 0.015, 0.14, 0.005, mat(0x3a3d42), mx, top + 0.008, z1 - 0.2));
    // Where the desk, the monitor's foot and the keyboard meet what they
    // stand on.
    contacts.push(
        { x: d.x, z: d.z, y: 0, w: d.width + 0.14, d: d.depth + 0.12, soft: 0.2, alpha: 0.42 },
        { x: mx, z: mz, y: top, w: 0.32, d: 0.24, soft: 0.07, alpha: 0.4 },
        { x: mx, z: z1 - 0.2, y: top, w: 0.5, d: 0.2, soft: 0.05, alpha: 0.22 }
    );
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

    // The trays, stacked at the left end on four brass posts (QA,
    // 2026-09-25): the out-tray on the desk, the in-tray (a new
    // application) over it. The gap between them is wide enough that the
    // desk's eye sees the out-tray's page over its front lip, so each
    // tray is still a tap of its own.
    const trayMat = mat(COLORS.tray, { roughness: 0.5 });
    const paper = mat(COLORS.paper, { roughness: 0.95 });
    const tx = x0 + 0.24;
    const tz = z0 + 0.2;
    const tray = (key, y, sheets) => {
        const g = tag(new THREE.Group(), key);
        g.add(box(0.34, 0.012, 0.26, trayMat, tx, y + 0.006, tz));
        g.add(box(0.34, 0.06, 0.012, trayMat, tx, y + 0.03, tz - 0.124));
        g.add(box(0.34, 0.035, 0.012, trayMat, tx, y + 0.018, tz + 0.124));
        g.add(box(0.012, 0.06, 0.26, trayMat, tx - 0.164, y + 0.03, tz));
        g.add(box(0.012, 0.06, 0.26, trayMat, tx + 0.164, y + 0.03, tz));
        for (let i = 0; i < sheets; i++) g.add(box(0.3, 0.004, 0.22, paper, tx, y + 0.016 + i * 0.006, tz));
        group.add(g);
        picks[key] = g;
        return g;
    };
    tray('outtray', top, 1);
    contacts.push({ x: tx, z: tz, y: top, w: 0.42, d: 0.34, soft: 0.07, alpha: 0.32 });
    const intray = tray('intray', top + TRAY_RISE, 2);
    // The posts stand on the out-tray's side walls and belong to the tray
    // they hold up.
    // Truly metal now that it has a room to reflect (interior.js).
    const brass = mat(COLORS.brass, { roughness: 0.3, metalness: 0.85 });
    const post = TRAY_RISE - 0.06;
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            intray.add(box(0.012, post, 0.012, brass, tx + sx * 0.164, top + 0.06 + post / 2, tz + sz * 0.112));
        }
    }

    // The lamp, at the right end, which the visitor can switch: a banker's
    // lamp (QA, 2026-09-25, after the one in Steve's own office scene), an
    // oval brass base and stem under a green glass shade lying on its side,
    // white glass inside, tipped so its light falls toward the chair.
    // Its left end stays clear of the monitor's edge, where the sticky notes
    // are (tests/office-room).
    const lampGroup = tag(new THREE.Group(), 'lamp');
    const lx = x1 - 0.2;
    const lz = z0 + 0.2;
    contacts.push({ x: lx, z: lz, y: top, w: 0.28, d: 0.2, soft: 0.07, alpha: 0.38 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.106, 0.024, 32), brass);
    base.scale.set(1, 1, 0.62);
    base.position.set(lx, top + 0.012, lz);
    lampGroup.add(base);
    const step = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.022, 24), brass);
    step.scale.set(1, 1, 0.75);
    step.position.set(lx, top + 0.035, lz);
    lampGroup.add(step);
    lampGroup.add(cylinder(0.009, 0.28, brass, lx, top + 0.186, lz));
    // The shade, in a frame of its own: along x, tipped back.
    const shadeY = top + 0.35;
    const shadeFrame = new THREE.Group();
    shadeFrame.position.set(lx, shadeY, lz + 0.03);
    shadeFrame.rotation.x = -0.3;
    const glass = new THREE.CylinderGeometry(0.075, 0.075, 0.27, 24, 1, true, 0, Math.PI);
    const outside = new THREE.Mesh(glass, mat(COLORS.shade, { roughness: 0.25, metalness: 0.1 }));
    outside.rotation.z = Math.PI / 2;
    shadeFrame.add(outside);
    const glow = new THREE.Mesh(glass, mat(0xf4ecd6, { side: THREE.BackSide, emissive: 0xffe3a8, emissiveIntensity: LAMP_GLOW }));
    glow.rotation.z = Math.PI / 2;
    shadeFrame.add(glow);
    for (const end of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16, 0, Math.PI), mat(COLORS.shade, { roughness: 0.25, side: THREE.DoubleSide }));
        cap.rotation.y = Math.PI / 2;
        cap.position.x = end * 0.135;
        shadeFrame.add(cap);
    }
    // A brass rim along the shade's lower edges, and the finial on top.
    for (const side of [-1, 1]) {
        const rim = cylinder(0.005, 0.275, brass, 0, 0, side * 0.075);
        rim.rotation.z = Math.PI / 2;
        shadeFrame.add(rim);
    }
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), brass);
    finial.position.y = 0.082;
    shadeFrame.add(finial);
    lampGroup.add(shadeFrame);
    // The pull chain, hanging from the shade's front rim (which the tip
    // lifts 2 cm and brings 7 cm forward of the frame), and its bead.
    lampGroup.add(cylinder(0.002, 0.07, brass, lx + 0.07, shadeY - 0.013, lz + 0.1));
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), brass);
    bead.position.set(lx + 0.07, shadeY - 0.052, lz + 0.1);
    lampGroup.add(bead);
    // The light, up inside the shade. No bulb is drawn: under the shade's
    // open side it showed as a white ball (QA, 2026-09-25), and the glowing
    // white glass inside says the lamp is on.
    const light = new THREE.PointLight(0xffd9a0, 1.6, 3.5, 2);
    light.position.set(lx, shadeY - 0.015, lz + 0.035);
    lampGroup.add(light);
    addHitBox(lampGroup);
    group.add(lampGroup);
    picks.lamp = lampGroup;

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

    return { screen, light, glow, folder, lampGroup };
}

function buildFloorThings(group, config, picks, contacts) {
    const d = config.room.desk;
    // The wastebasket, beside the desk on the corner side.
    const basket = tag(new THREE.Group(), 'wastebasket');
    const bx = d.x + d.width / 2 + 0.26;
    const bz = d.z + 0.05;
    contacts.push({ x: bx, z: bz, y: 0, w: 0.46, d: 0.46, soft: 0.16, alpha: 0.45 });
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

    // The chair, pushed back from the desk's right end and turned toward it,
    // as if just left (its seat faces the desk, its back the right-hand
    // window). It stood at the left end until M6, where it hid the printer
    // from the desk. The seat faces the chair's own -z.
    const chair = new THREE.Group();
    chair.name = 'chair';
    const cm = mat(COLORS.chair, { roughness: 0.7 });
    const steel = mat(COLORS.metal, { roughness: 0.45, metalness: 0.3 });
    chair.add(roundedBox(0.48, 0.07, 0.46, 0.03, cm, 0, 0.47, 0));
    chair.add(roundedBox(0.46, 0.5, 0.06, 0.028, cm, 0, 0.78, 0.22));
    chair.add(cylinder(0.025, 0.34, steel, 0, 0.27, 0));
    chair.add(cylinder(0.05, 0.05, steel, 0, 0.105, 0, 16));
    // Five legs, each with a caster at its end (QA, 2026-09-25): a twin
    // wheel on its side under a little fork, turned along the leg.
    const caster = mat(COLORS.caster, { roughness: 0.6 });
    for (let i = 0; i < CHAIR_LEGS.count; i++) {
        const a = (i / CHAIR_LEGS.count) * Math.PI * 2;
        const leg = new THREE.Group();
        leg.rotation.y = a;
        leg.add(box(0.045, 0.035, CHAIR_LEGS.reach, steel, 0, 0.09, CHAIR_LEGS.reach / 2));
        leg.add(box(0.04, 0.03, 0.04, steel, 0, 0.065, CHAIR_LEGS.reach - 0.01));
        const wheel = cylinder(CHAIR_LEGS.wheel, 0.03, caster, 0, CHAIR_LEGS.wheel, CHAIR_LEGS.reach - 0.01, 14);
        wheel.rotation.z = Math.PI / 2;
        leg.add(wheel);
        chair.add(leg);
    }
    chair.position.set(d.x + d.width / 2 + 0.25, 0, d.z + 0.95);
    contacts.push({ x: chair.position.x, z: chair.position.z, y: 0, w: 0.8, d: 0.8, soft: 0.34, alpha: 0.32 });
    chair.rotation.y = CHAIR_TURN;
    group.add(chair);

    // A plant in the front right corner, where it has the window's light and
    // is clear of the corkboard and the whiteboard.
    const plant = new THREE.Group();
    plant.name = 'plant';
    const hw = config.room.width / 2;
    const px = hw - 0.4;
    const pz = config.room.depth / 2 - 0.45;
    contacts.push({ x: px, z: pz, y: 0, w: 0.5, d: 0.5, soft: 0.16, alpha: 0.45 });
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
 * `notes`, `drawerLabels` (one per drawer), `boardHeader`,
 * `boardCards`, `departures`, `whiteboard` and `rainGlass`, all optional.
 */
export function buildRoom(config, textures = {}) {
    const group = new THREE.Group();
    group.name = 'room';
    const picks = {};
    buildShell(group, config);
    const contacts = [];
    const desk = buildDesk(group, config, picks, contacts);
    buildFloorThings(group, config, picks, contacts);
    const cabinet = buildCabinet(group, config, textures.drawerLabels || null, picks);
    const board = buildBoard(group, config, textures, picks);
    const departures = buildDepartures(group, config, textures.departures || null, picks);
    const whiteboard = buildWhiteboard(group, config, textures.whiteboard || null, picks);
    buildPrinter(group, config, picks);
    const notes = buildNotes(group, config, textures.notes || null, picks);
    const rain = buildRainPanes(group, config, textures.rainGlass || null);
    if (textures.screen) {
        desk.screen.material = new THREE.MeshBasicMaterial({ map: textures.screen, toneMapped: false });
    }
    const { cabinet: cab, printer } = config.room;
    contacts.push(
        { x: cab.x, z: cab.z, y: 0, w: cab.width + 0.14, d: cab.depth + 0.14, soft: 0.16, alpha: 0.5 },
        { x: printer.x, z: printer.z, y: 0, w: 0.58, d: 0.52, soft: 0.13, alpha: 0.5 }
    );
    const contactShadows = buildContactShadows(group, contacts);
    const reflections = buildReflectionPanes(group, config);
    const shiny = castShadows(group);
    return {
        group,
        picks,
        screen: desk.screen,
        folder: desk.folder,
        cabinet,
        board,
        departures,
        whiteboard,
        notes,
        rain,
        contactShadows,
        reflections,
        shiny,
        lamp: { light: desk.light, glow: desk.glow, group: desk.lampGroup }
    };
}

/** Switch the lamp. The shade's white glass inside stops glowing with it,
 *  so the lamp reads as off. */
export function setLamp(lamp, on) {
    lamp.light.visible = on;
    lamp.glow.material.emissiveIntensity = on ? LAMP_GLOW : 0;
}
