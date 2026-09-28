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
 * action: the monitor opens the computer, the wastebasket opens
 * itself, the lamp switches, an open folder on the desk reopens its card, the
 * sticky notes open today's list, the
 * filing cabinet opens itself and a folder in it opens on the desk, the
 * corkboard opens itself (its cards drag between columns), the whiteboard
 * opens its numbers (and its goal line the weekly
 * goal), and the printer prints a prep
 * sheet. `pickOf` walks up from whatever a ray hit to the nearest of these.
 *
 * NO CANVAS IN HERE. The monitor's face, the sticky notes
 * and the rest take optional textures (`textures.screen`, `.notes` and so
 * on) that main.js paints, so this file builds the same room
 * under real three in node:vm, where there is no canvas, and a test can
 * measure what the eye sees.
 *
 * Builds and returns `{ group, picks, lamp, folder, screen,
 * cabinet, board, whiteboard, notes, rain }`. It adds nothing
 * to a scene itself and reads no clock.
 */

/* global THREE */

/**
 * The room's palette: modern luxury in white and aluminum (QA, 2026-09-29:
 * the walnut, brass and banker's lamp had "a cheap 90's living room computer
 * desk feel"; Steve asked what a company like Apple would furnish a corner
 * office with, and chose white and aluminum for the whole room). Few
 * materials, used with restraint: a matte warm white, satin aluminum, a
 * pale stone floor, a light wool rug, graphite for the few dark parts, and
 * pale gray leather. No hardware on the fronts. The view is the hero.
 */
const COLORS = {
    wall: 0xf3f2ef,
    trim: 0x3a3936,
    floor: 0xcfcbc4,
    rug: 0xb7b1a7,
    ceiling: 0xb9b8b3,
    door: 0xe9e7e3,
    white: 0xf1f0ed,
    aluminum: 0xc8cbcf,
    graphite: 0x2b2d31,
    reveal: 0x16171a,
    felt: 0xcfccc6,
    leather: 0x2e3034,
    chairLeather: 0xc2beb8,
    chairShell: 0x8e8a85,
    metal: 0x2b2d31,
    screenOff: 0x0e1622,
    paper: 0xf7f3ea,
    manila: 0xe4c07a,
    plant: 0x2f6b3a,
    pot: 0xe4e2de,
    caster: 0x151618
};

/** How brightly the lamp's strip of light glows while the lamp is on. */
export const LAMP_GLOW = 0.7;

/** The LED lamp's parts, meters: its round base, its post's height, and
 *  the head reaching forward from the top of it (`length` along the desk's
 *  depth). */
export const LAMP = {
    base: { radius: 0.07, height: 0.012 },
    post: 0.34,
    head: { length: 0.3, width: 0.04, thick: 0.014 }
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

/** A bar `length` long along +z from the origin, `width` by `height` at its
 *  root, its tip `taper` of that and dropped `drop` lower: a chair's leg. */
export function taperedBar(length, width, height, taper, drop) {
    const g = new THREE.BoxGeometry(width, height, length);
    g.translate(0, 0, length / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const t = pos.getZ(i) / length;
        const k = 1 + (taper - 1) * t;
        pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k - drop * t, pos.getZ(i));
    }
    g.computeVertexNormals();
    return g;
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

/** Where the reveals run across the printer cabinet's front, meters up:
 *  under the top drawer, and between the two. */
export const PRINTER_DRAWERS = [0.575, 0.33];

/**
 * The executive chair (QA, 2026-09-29: the furniture should "look really
 * expensive"; in pale gray leather and polished aluminum since the room went
 * white and aluminum). Meters, in the chair's own frame
 * (the seat faces -z). `seat` its cushion's top and size, `channels` how
 * many stitched pads run across it front to back, `back` the backrest's
 * foot, height, width, how many pads run up it and how far it reclines
 * (radians), `arm` the armrests' height and length.
 */
export const CHAIR = {
    seat: { top: 0.52, width: 0.5, depth: 0.48, channels: 4 },
    back: { foot: 0.56, height: 0.62, width: 0.5, channels: 5, recline: 0.16 },
    arm: { top: 0.68, length: 0.3, x: 0.29 }
};

/**
 * The crumpled pages in the wastebasket: where each sits in the basket (off
 * its center, meters) and how big. As many show as what is in it calls for
 * (wastePages), and none when it is empty (QA, 2026-09-28: a page in an empty
 * basket said there was something to find).
 */
export const WASTE_PAGES = [
    { dx: 0.02, y: 0.3, dz: -0.02, r: 0.06 },
    { dx: -0.06, y: 0.27, dz: 0.04, r: 0.055 },
    { dx: 0.05, y: 0.32, dz: 0.06, r: 0.05 }
];

/** How many crumpled pages show for `count` things in the wastebasket: none
 *  when empty, one for a few, two from three, all three from six. */
export function wastePages(count) {
    if (!(count > 0)) return 0;
    return count >= 6 ? 3 : count >= 3 ? 2 : 1;
}

/**
 * The window openings, shared by the walls, the frames and the tests. Floor
 * to ceiling (QA, 2026-09-28: the wall under the windows "takes up too much
 * premium screen real estate"): the glass rises from a slim ledge a hand
 * off the floor to just under the ceiling, as a modern tower's curtain wall
 * does, so the cabinet, the printer and the wastebasket stand in front of
 * it and the desk looks straight down to the street.
 */
export function windowsOf(config) {
    const { width, depth, backWindow } = config.room;
    return {
        sill: 0.1,
        head: 2.65,
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

/** The exposed concrete ceiling's formwork panel, meters: one painted
 *  tile (paint.js drawConcrete) covers one panel. */
export const CONCRETE_PANEL = [1.2, 2.4];

/**
 * The ceiling's fittings (QA, 2026-09-29: an exposed concrete ceiling,
 * Steve's choice, remembering the exposed structure of a high rise he
 * worked in): a white `soffit` dropped round the two window walls, `depth`
 * into the room and `drop` below the concrete (it carries the window's
 * blinds and hides the edge of the slab), and slim linear pendants hung
 * `drop` below the concrete: `pendants` each [x, z, length along x].
 */
export const CEILING = {
    soffit: { depth: 0.45, drop: 0.12 },
    pendant: { drop: 0.55, width: 0.055, height: 0.035 },
    pendants: [[0.9, -1.55, 1.4], [-1.3, 0.2, 1.2]]
};

function buildShell(room, config, textures = {}) {
    // Built loose, then folded by material into a few meshes (mergeByMaterial).
    const group = new THREE.Group();
    const { width, depth, height } = config.room;
    const w = windowsOf(config);
    const hw = width / 2;
    const hd = depth / 2;
    const T = 0.1;
    const wall = mat(COLORS.wall);
    const trim = mat(COLORS.trim);

    // Honed stone: pale, with a little of the windows' light in it.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat(COLORS.floor, { roughness: 0.45 }));
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), mat(COLORS.rug, { roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0.7, 0.004, -1.4);
    group.add(rug);
    // Exposed concrete, board-formed: its formwork panels, their joints and
    // tie holes painted (paint.js drawConcrete), a panel a tile.
    const concreteMap = textures.concrete || null;
    if (concreteMap) {
        concreteMap.wrapS = THREE.RepeatWrapping;
        concreteMap.wrapT = THREE.RepeatWrapping;
        concreteMap.repeat.set(width / CONCRETE_PANEL[0], depth / CONCRETE_PANEL[1]);
    }
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth),
        mat(concreteMap ? 0xffffff : COLORS.ceiling, { map: concreteMap, roughness: 0.92 }));
    ceiling.name = 'ceiling';
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = height;
    group.add(ceiling);
    // The white soffit round the two window walls.
    const { depth: sd, drop } = CEILING.soffit;
    group.add(slab(-hw, height - drop, -hd, hw, height, -hd + sd, wall));
    group.add(slab(hw - sd, height - drop, -hd + sd, hw, height, hd, wall));

    // Back wall: solid left of the window, a band below and above it.
    group.add(slab(-hw, 0, -hd - T, w.back.x0, height, -hd, wall));
    group.add(slab(w.back.x0, 0, -hd - T, hw, w.sill, -hd, wall));
    group.add(slab(w.back.x0, w.head, -hd - T, hw, height, -hd, wall));
    // Right wall: solid in front of the window, a band below and above it.
    group.add(slab(hw, 0, w.right.z1, hw + T, height, hd, wall));
    group.add(slab(hw, 0, -hd, hw + T, w.sill, w.right.z1, wall));
    group.add(slab(hw, w.head, -hd, hw + T, height, w.right.z1, wall));
    // The narrow pier at the corner, between the two windows: dark bronze,
    // as the frames are, so the glass reads as one curtain wall.
    group.add(slab(w.back.x1, w.sill, -hd - T, hw + T, w.head, -hd + 0.1, trim));
    group.add(slab(hw - 0.1, w.sill, -hd, hw + T, w.head, w.right.z0, trim));
    // Left wall, solid.
    group.add(slab(-hw - T, 0, -hd, -hw, height, hd, wall));
    // Front wall, with the door in it.
    const door = config.room.door;
    const d0 = door.x - door.width / 2;
    const d1 = door.x + door.width / 2;
    group.add(slab(-hw, 0, hd, d0, height, hd + T, wall));
    group.add(slab(d1, 0, hd, hw, height, hd + T, wall));
    group.add(slab(d0, door.height, hd, d1, height, hd + T, wall));
    // A shadow gap where the walls meet the floor, in place of a skirting
    // board: a slim dark reveal.
    const gap = mat(COLORS.reveal, { roughness: 0.8 });
    const g = 0.025;
    group.add(slab(-hw, 0, -hd, -hw + 0.006, g, hd, gap));
    group.add(slab(-hw, 0, hd - 0.006, d0, g, hd, gap));
    group.add(slab(d1, 0, hd - 0.006, hw, g, hd, gap));
    group.add(slab(hw - 0.006, 0, w.right.z1, hw, g, hd, gap));
    const doorFace = mat(COLORS.door, { roughness: 0.4 });
    group.add(slab(d0 + 0.01, 0, hd + 0.02, d1 - 0.01, door.height - 0.01, hd + 0.06, doorFace));
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
function buildCabinet(group, config, labels, picks, m) {
    const c = config.room.cabinet;
    const cabinet = tag(new THREE.Group(), 'cabinet');
    cabinet.position.set(c.x, 0, c.z);
    // A low white credenza (QA, 2026-09-29): flush drawer fronts with no
    // hardware (they open with a push), the gaps between them dark, on a
    // brushed aluminum kick set back so it floats; the drawers lined dark.
    const inside = mat(0x2a2b2e, { roughness: 0.9 });
    const hw = c.width / 2;
    const hd = c.depth / 2;
    const kick = 0.05;
    // The frame: a white base up to the drawers' floor over the kick, white
    // ends and a back.
    cabinet.add(box(c.width - 0.04, kick, c.depth - 0.05, m.aluminum, 0, kick / 2, -0.015));
    cabinet.add(roundedBox(c.width, c.floor - kick, c.depth, 0.006, m.white, 0, (c.floor + kick) / 2, 0));
    cabinet.add(roundedBox(0.02, c.height, c.depth, 0.006, m.white, -hw - 0.01, c.height / 2, 0));
    cabinet.add(roundedBox(0.02, c.height, c.depth, 0.006, m.white, hw + 0.01, c.height / 2, 0));
    cabinet.add(box(c.width, c.height - c.floor, 0.02, m.white, 0, (c.height + c.floor) / 2, -hd - 0.01));

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
        // The front: flush white, with its label printed small on it.
        const cx = (x0 + x1) / 2;
        drawers.add(roundedSlab(x0, c.floor, hd - 0.012, x1, c.height - 0.02, hd + 0.01, 0.004, m.white));
        const face = new THREE.Mesh(
            new THREE.PlaneGeometry(w * 0.62, 0.075),
            // Card, lit by the room like everything else: unlit, it glowed
            // white in the dark office (QA, 2026-09-29).
            labels && labels[i] ? mat(0xffffff, { map: labels[i], roughness: 0.9 }) : mat(0xf4efe4, { roughness: 0.9 })
        );
        face.position.set(cx, c.height - 0.08, hd + 0.0115);
        drawers.add(face);
        faces.push(face);
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
    // A frameless tack panel of light-gray wool felt (QA, 2026-09-29: the
    // cork and then a felt board in a frame did not suit the room), its
    // edges softened, standing a little off the wall.
    const felt = mat(COLORS.felt, { roughness: 1 });
    const z0 = b.z - b.width / 2;
    const z1 = b.z + b.width / 2;
    const y0 = b.y - b.height / 2;
    const y1 = b.y + b.height / 2;
    const m = 0.04;
    board.add(roundedSlab(wallX, y0 - m, z0 - m, b.x - 0.003, y1 + m, z1 + m, 0.008, felt));

    const header = new THREE.Mesh(
        new THREE.PlaneGeometry(b.width, b.header),
        textures.boardHeader ? mat(0xffffff, { map: textures.boardHeader, roughness: 0.9 }) : mat(0xfafafa, { roughness: 0.9 })
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
 * The whiteboard on the left wall: a white panel in a thin frame with a
 * marker tray, its face painted by main.js (textures.whiteboard). It faces
 * +x, so its right runs to -z, the screen's right from the room. A raycast's
 * uv on it is how a tap on the goal line is recognized (whiteboard.js).
 */
function buildWhiteboard(group, config, texture, picks) {
    const w = config.room.whiteboard;
    const wallX = -config.room.width / 2;
    const board = tag(new THREE.Group(), 'whiteboard');
    // Frameless white glass (QA, 2026-09-29), on four brushed aluminum
    // standoffs, its thin edge catching the light; no tray.
    const z0 = w.z - w.width / 2;
    const z1 = w.z + w.width / 2;
    const y0 = w.y - w.height / 2;
    const y1 = w.y + w.height / 2;
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xe9efec, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 });
    const m = 0.04;
    board.add(roundedSlab(w.x - 0.013, y0 - m, z0 - m, w.x - 0.001, y1 + m, z1 + m, 0.004, glass));
    const standoff = new THREE.MeshPhysicalMaterial({ color: COLORS.aluminum, metalness: 1, roughness: 0.3 });
    for (const y of [y0 - m + 0.05, y1 + m - 0.05]) {
        for (const z of [z0 - m + 0.05, z1 + m - 0.05]) {
            const post = cylinder(0.011, w.x - wallX + 0.004, standoff, (wallX + w.x) / 2 + 0.002, y, z, 16);
            post.rotation.z = Math.PI / 2;
            board.add(post);
        }
    }
    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(w.width, w.height),
        // Lit by the room, and glossy as glass is: unlit, it shone in the
        // dark office, and its reflection hung in the night glass.
        new THREE.MeshPhysicalMaterial({
            color: texture ? 0xffffff : 0xf7f7f4, map: texture || null, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05
        })
    );
    face.rotation.y = Math.PI / 2;
    face.position.set(w.x, w.y, w.z);
    board.add(face);
    group.add(board);
    picks.whiteboard = board;
    return face;
}

/** The printer, on a small stand under the right-hand window, with a page
 *  in its tray and a green light that says it is ready. */
function buildPrinter(group, config, picks, m) {
    const p = config.room.printer;
    const printer = tag(new THREE.Group(), 'printer');
    printer.position.set(p.x, 0, p.z);
    // A white side cabinet (QA, 2026-09-29): two flush drawers facing the
    // room, the reveals between them the only lines on it (a single
    // upright seam read as a drawer turned on its side), on a brushed
    // aluminum kick set back.
    const kick = 0.05;
    printer.add(roundedBox(0.5, p.stand - kick, 0.44, 0.012, m.white, 0, (p.stand + kick) / 2, 0));
    printer.add(box(0.46, kick, 0.4, m.aluminum, 0, kick / 2, -0.01));
    for (const y of PRINTER_DRAWERS) printer.add(box(0.48, 0.003, 0.003, m.reveal, 0, y, 0.2205));
    // The printer: white, with a lid of dark glass, an aluminum output
    // tray, the page in it and its light.
    const glassLid = new THREE.MeshPhysicalMaterial({ color: 0x1d1f22, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
    printer.add(roundedBox(0.44, 0.17, 0.36, 0.025, m.white, 0, p.stand + 0.085, 0));
    printer.add(roundedBox(0.44, 0.03, 0.3, 0.01, glassLid, 0, p.stand + 0.185, 0.02));
    printer.add(box(0.3, 0.012, 0.14, m.aluminum, -0.02, p.stand + 0.03, 0.24));
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

/**
 * The desk's parts, meters: a slim white slab `top` thick with softened
 * edges, on two brushed aluminum sled frames (`leg`: the profile's width
 * and depth, and how far in from the ends), joined by a slim `beam` under
 * the back; a drawer floating under the top at the right (`drawer`: its
 * width, depth down and the gap under the top), flush, with no hardware;
 * and a stitched graphite leather pad under the keyboard (`pad`, its width
 * and depth, and how far in from the desk's front edge).
 */
export const DESK = {
    top: 0.03,
    leg: { width: 0.06, depth: 0.03, inset: 0.1 },
    beam: { width: 0.03, height: 0.04 },
    drawer: { width: 0.5, depth: 0.065, gap: 0.006 },
    pad: { width: 0.8, depth: 0.42, front: 0.02, thick: 0.004 }
};

/**
 * Lay a texture on a mesh in meters: `toGrain(x, y, z, face)` gives each
 * vertex's meters along and across the texture from its place in the room
 * and the axis its face turns to ('x', 'y' or 'z'), and `size` how many
 * meters one texture covers. So the grain keeps its scale on every part,
 * and parts that meet can carry it over the join.
 */
export function grainUv(mesh, toGrain, size) {
    const g = mesh.geometry;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = new Float32Array(pos.count * 2);
    const { x: ox, y: oy, z: oz } = mesh.position;
    for (let i = 0; i < pos.count; i++) {
        const nx = Math.abs(nor.getX(i));
        const ny = Math.abs(nor.getY(i));
        const nz = Math.abs(nor.getZ(i));
        const face = ny >= nx && ny >= nz ? 'y' : nx >= nz ? 'x' : 'z';
        const [u, v] = toGrain(pos.getX(i) + ox, pos.getY(i) + oy, pos.getZ(i) + oz, face);
        uv[i * 2] = u / size[0];
        uv[i * 2 + 1] = v / size[1];
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return mesh;
}

/**
 * The room's furniture materials, made once and shared: the desk top's
 * matte white with a satin coat, the same white for the rest, brushed
 * aluminum, graphite for the reveals, and the leather of the desk pad
 * (main.js paints its maps, finishes.js; without them a plain graphite)
 * and of the trays' lining.
 */
function furnitureMaterials(finish) {
    const leather = finish && finish.leather;
    const white = (name, coat) => {
        const m = new THREE.MeshPhysicalMaterial({ color: COLORS.white, roughness: 0.42, clearcoat: coat, clearcoatRoughness: 0.3 });
        m.name = name;
        return m;
    };
    return {
        top: white('white-top', 0.35),
        white: white('white', 0.15),
        aluminum: new THREE.MeshPhysicalMaterial({ color: COLORS.aluminum, metalness: 1, roughness: 0.32, anisotropy: 0.5 }),
        reveal: mat(COLORS.reveal, { roughness: 0.8 }),
        leather: new THREE.MeshPhysicalMaterial({
            color: leather ? 0xffffff : COLORS.leather,
            map: leather ? leather.map : null,
            normalMap: leather ? leather.normalMap : null,
            roughnessMap: leather ? leather.roughnessMap : null,
            roughness: leather ? 1 : 0.6,
            sheen: 0.3,
            sheenColor: new THREE.Color(0x7a7e84),
            sheenRoughness: 0.6
        }),
        lining: mat(COLORS.graphite, { roughness: 0.95 })
    };
}

function buildDesk(group, config, picks, contacts, m) {
    const d = config.room.desk;
    const x0 = d.x - d.width / 2;
    const x1 = d.x + d.width / 2;
    const z0 = d.z - d.depth / 2;
    const z1 = d.z + d.depth / 2;
    const top = d.height;
    const under = top - DESK.top;
    const desk = new THREE.Group();
    desk.name = 'desk';
    desk.add(roundedSlab(x0, under, z0, x1, top, z1, 0.008, m.top));
    // The sled frames: two uprights, a foot and a rail under the top, each
    // a slim aluminum profile, one frame in from each end.
    const { width: lw, depth: ld, inset } = DESK.leg;
    for (const lx of [x0 + inset, x1 - inset]) {
        const fz0 = z0 + 0.05;
        const fz1 = z1 - 0.05;
        desk.add(box(ld, under - ld, lw, m.aluminum, lx, (under - ld) / 2 + ld / 2, fz0 + lw / 2));
        desk.add(box(ld, under - ld, lw, m.aluminum, lx, (under - ld) / 2 + ld / 2, fz1 - lw / 2));
        desk.add(box(ld, ld, fz1 - fz0, m.aluminum, lx, ld / 2, (fz0 + fz1) / 2));
        desk.add(box(ld, ld, fz1 - fz0, m.aluminum, lx, under - ld / 2, (fz0 + fz1) / 2));
    }
    // The beam between them under the back.
    const { width: bw, height: bh } = DESK.beam;
    desk.add(box(d.width - 2 * inset, bh, bw, m.aluminum, d.x, under - bh / 2, z0 + 0.08));
    // The drawer, floating under the top at the right, flush and bare.
    const { width: dw, depth: dd, gap } = DESK.drawer;
    const dx1 = x1 - inset - 0.03;
    desk.add(roundedSlab(dx1 - dw, under - gap - dd, z0 + 0.12, dx1, under - gap, z1 - 0.03, 0.006, m.white));
    group.add(desk);

    // The monitor, which is the computer station.
    const metal = mat(COLORS.metal, { roughness: 0.4, metalness: 0.3 });
    const computer = tag(new THREE.Group(), 'computer');
    const mx = d.x + 0.05;
    const mz = z0 + 0.22;
    // Its foot and neck in aluminum; the keyboard silver.
    computer.add(roundedBox(0.24, 0.012, 0.16, 0.006, m.aluminum, mx, top + 0.006, mz));
    computer.add(box(0.05, 0.16, 0.012, m.aluminum, mx, top + 0.09, mz - 0.03));
    const bezel = roundedBox(0.66, 0.41, 0.035, 0.012, metal, mx, top + 0.36, mz);
    computer.add(bezel);
    computer.add(roundedBox(0.44, 0.012, 0.13, 0.004, mat(0xd6d8db, { roughness: 0.4, metalness: 0.6 }), mx, top + DESK.pad.thick + 0.006, z1 - 0.2));
    // The leather pad under the keyboard, part of the desk.
    const { width: pw, depth: pd, front, thick } = DESK.pad;
    const pad = roundedSlab(mx - pw / 2, top, z1 - front - pd, mx + pw / 2, top + thick, z1 - front, 0.008, m.leather);
    pad.name = 'desk-pad';
    grainUv(pad, (x, y, z) => [x - (mx - pw / 2), z - (z1 - front - pd)], [pw, pd]);
    desk.add(pad);
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

    // No letter trays (QA, 2026-09-29: Steve asked for them gone); a new
    // application and the backups are on the toolbar. The folder's page.
    const paper = mat(COLORS.paper, { roughness: 0.95 });

    // The lamp, at the right end, which the visitor can switch: a slim
    // aluminum LED lamp (QA, 2026-09-29, in place of the banker's lamp), a
    // round base, a thin post, and a flat head reaching forward over the
    // desk with a warm strip of light under it. It stands clear of the
    // monitor's edge, where the sticky notes are (tests/office-room).
    const lampGroup = tag(new THREE.Group(), 'lamp');
    const lx = x1 - 0.2;
    const lz = z0 + 0.2;
    const { base: lb, post: lp, head: lh } = LAMP;
    contacts.push({ x: lx, z: lz, y: top, w: 0.2, d: 0.2, soft: 0.06, alpha: 0.38 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(lb.radius, lb.radius + 0.004, lb.height, 40), m.aluminum);
    base.position.set(lx, top + lb.height / 2, lz);
    lampGroup.add(base);
    lampGroup.add(cylinder(0.007, lp, m.aluminum, lx, top + lb.height + lp / 2, lz, 16));
    const headY = top + lb.height + lp;
    const joint = cylinder(0.011, 0.03, m.aluminum, lx, headY, lz, 16);
    joint.rotation.z = Math.PI / 2;
    lampGroup.add(joint);
    lampGroup.add(roundedBox(lh.width, lh.thick, lh.length, 0.005, m.aluminum, lx, headY, lz + lh.length / 2));
    // The strip of light under the head: warm, and dark when switched off.
    const glow = box(lh.width - 0.012, 0.002, lh.length - 0.03, mat(0xf4ecd6, { emissive: 0xffe3a8, emissiveIntensity: LAMP_GLOW }),
        lx, headY - lh.thick / 2 - 0.001, lz + lh.length / 2);
    lampGroup.add(glow);
    const light = new THREE.PointLight(0xffd9a0, 1.6, 3.5, 2);
    light.position.set(lx, headY - 0.03, lz + lh.length / 2);
    lampGroup.add(light);
    addHitBox(lampGroup);
    group.add(lampGroup);
    picks.lamp = lampGroup;

    // The open folder, lying on the desk while its card is open. Two covers
    // side by side, and a few pages on the right one, on the leather pad.
    const folder = tag(new THREE.Group(), 'folder');
    const manila = mat(COLORS.manila, { roughness: 0.9 });
    const fx = d.x + 0.02;
    const fz = z1 - 0.2;
    const onPad = top + DESK.pad.thick;
    folder.add(box(0.22, 0.004, 0.3, manila, fx - 0.112, onPad + 0.002, fz));
    folder.add(box(0.22, 0.004, 0.3, manila, fx + 0.112, onPad + 0.002, fz));
    folder.add(box(0.2, 0.006, 0.27, paper, fx + 0.112, onPad + 0.007, fz));
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
    // Satin aluminum, solid-walled.
    const wire = mat(COLORS.aluminum, { roughness: 0.35, metalness: 0.9, side: THREE.DoubleSide });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.36, 24, 1, true), wire);
    shell.position.set(bx, 0.18, bz);
    basket.add(shell);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), wire);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(bx, 0.01, bz);
    basket.add(bottom);
    // Crumpled pages, shown only while something is in it (setWaste).
    const crumpled = mat(COLORS.paper, { flatShading: true });
    const pages = WASTE_PAGES.map(({ dx, y, dz, r }, i) => {
        const page = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), crumpled);
        page.position.set(bx + dx, y, bz + dz);
        page.rotation.set(i * 1.1, i * 2.3, i * 0.7);
        page.name = 'waste-page';
        page.visible = false;
        basket.add(page);
        return page;
    });
    addHitBox(basket, 0.02);
    group.add(basket);
    picks.wastebasket = basket;

    // The chair, pushed back from the desk's right end and turned toward it,
    // as if just left (its seat faces the desk, its back the right-hand
    // window). It stood at the left end until M6, where it hid the printer
    // from the desk. The seat faces the chair's own -z. A high-back
    // executive chair in pale gray leather (CHAIR), its cushions stitched in
    // channels, on polished aluminum.
    const chair = new THREE.Group();
    chair.name = 'chair';
    const leather = new THREE.MeshPhysicalMaterial({
        color: COLORS.chairLeather, roughness: 0.5, sheen: 0.35, sheenColor: new THREE.Color(0xf2efe9), sheenRoughness: 0.5, clearcoat: 0.1, clearcoatRoughness: 0.4
    });
    const hide = mat(COLORS.chairShell, { roughness: 0.55 });
    const polished = new THREE.MeshPhysicalMaterial({ color: COLORS.aluminum, metalness: 1, roughness: 0.16 });
    const dark = mat(COLORS.graphite, { roughness: 0.5 });
    const { seat, back, arm } = CHAIR;
    // The seat: a leather-wrapped shell, and on it the cushion in channels,
    // each its own pad, so the stitching between them reads as a line.
    chair.add(roundedBox(seat.width + 0.03, 0.05, seat.depth + 0.02, 0.022, hide, 0, seat.top - 0.075, 0));
    const pad = seat.depth / seat.channels;
    for (let i = 0; i < seat.channels; i++) {
        const z = -seat.depth / 2 + pad * (i + 0.5);
        chair.add(roundedBox(seat.width, 0.055, pad - 0.006, 0.02, leather, 0, seat.top - 0.0275, z));
    }
    // The back: reclined about its foot, a shell and its channels up it.
    const backrest = new THREE.Group();
    backrest.position.set(0, back.foot, seat.depth / 2 - 0.02);
    backrest.rotation.x = back.recline;
    backrest.add(roundedBox(back.width + 0.03, back.height, 0.055, 0.025, hide, 0, back.height / 2, 0.02));
    const rib = back.height / back.channels;
    for (let i = 0; i < back.channels; i++) {
        backrest.add(roundedBox(back.width - 0.03, rib - 0.008, 0.05, 0.02, leather, 0, rib * (i + 0.5), -0.025));
    }
    chair.add(backrest);
    // The arms: polished posts from under the seat to leather pads.
    for (const side of [-1, 1]) {
        const x = side * arm.x;
        chair.add(box(0.03, arm.top - (seat.top - 0.1), 0.035, polished, x, (arm.top + seat.top - 0.1) / 2 - 0.015, 0.02));
        chair.add(box(Math.abs(x) - seat.width / 2 + 0.02, 0.025, 0.035, polished, side * (seat.width / 2 + (Math.abs(x) - seat.width / 2) / 2), seat.top - 0.1, 0.02));
        chair.add(roundedBox(0.075, 0.035, arm.length, 0.015, leather, x, arm.top, 0.02 - arm.length * 0.15));
    }
    // Under the seat: the tilt mechanism, and the column in its shroud.
    chair.add(box(0.2, 0.045, 0.24, dark, 0, seat.top - 0.13, 0.02));
    chair.add(cylinder(0.024, 0.2, polished, 0, seat.top - 0.25, 0, 16));
    chair.add(cylinder(0.034, 0.16, dark, 0, 0.21, 0, 16));
    chair.add(cylinder(0.06, 0.045, polished, 0, 0.115, 0, 20));
    // Five tapered legs of polished aluminum, sloping down to their casters
    // (QA, 2026-09-25): a twin wheel on its side under a little fork.
    const caster = mat(COLORS.caster, { roughness: 0.6 });
    for (let i = 0; i < CHAIR_LEGS.count; i++) {
        const a = (i / CHAIR_LEGS.count) * Math.PI * 2;
        const leg = new THREE.Group();
        leg.rotation.y = a;
        leg.add(new THREE.Mesh(taperedBar(CHAIR_LEGS.reach, 0.05, 0.04, 0.6, 0.03), polished).translateY(0.1));
        leg.add(box(0.036, 0.03, 0.036, dark, 0, 0.065, CHAIR_LEGS.reach - 0.01));
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
    return { pages };
}

/** The slim linear pendants under the concrete (CEILING): a dark body
 *  with a pale diffuser under it, hung on two fine cables. Unlit: the office
 *  keeps its daylight by day and its dark by night (Steve, 2026-09-25). */
function buildPendants(group) {
    const height = 2.8;
    const { drop, width, height: h } = CEILING.pendant;
    const body = mat(COLORS.graphite, { roughness: 0.4, metalness: 0.5 });
    const diffuser = mat(0xe8e8e6, { roughness: 0.6 });
    const cable = mat(0x1b1c1e, { roughness: 0.5 });
    const pendants = new THREE.Group();
    pendants.name = 'pendants';
    const y = height - drop;
    for (const [x, z, length] of CEILING.pendants) {
        pendants.add(roundedBox(length, h, width, 0.008, body, x, y, z));
        pendants.add(box(length - 0.02, 0.003, width - 0.012, diffuser, x, y - h / 2 - 0.001, z));
        for (const side of [-1, 1]) pendants.add(cylinder(0.0015, drop - h / 2, cable, x + side * (length / 2 - 0.1), y + h / 2 + (drop - h / 2) / 2, z, 6));
    }
    group.add(pendants);
    return pendants;
}

/**
 * Build the office. `textures` may carry `screen` (the monitor's face),
 * `notes`, `drawerLabels` (one per drawer), `boardHeader`,
 * `boardCards`, `whiteboard`, `rainGlass`, and the desk's
 * pad's `leather` (`{ map, normalMap, roughnessMap }`, finishes.js), all
 * optional.
 */
export function buildRoom(config, textures = {}) {
    const group = new THREE.Group();
    group.name = 'room';
    const picks = {};
    buildShell(group, config, textures);
    buildPendants(group);
    const contacts = [];
    // The desk, the credenza, the printer and the trays share one white, one
    // aluminum and one leather.
    const finish = furnitureMaterials({ leather: textures.leather || null });
    const desk = buildDesk(group, config, picks, contacts, finish);
    const waste = buildFloorThings(group, config, picks, contacts);
    const cabinet = buildCabinet(group, config, textures.drawerLabels || null, picks, finish);
    const board = buildBoard(group, config, textures, picks);
    const whiteboard = buildWhiteboard(group, config, textures.whiteboard || null, picks);
    buildPrinter(group, config, picks, finish);
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
        whiteboard,
        notes,
        rain,
        waste,
        contactShadows,
        reflections,
        shiny,
        lamp: { light: desk.light, glow: desk.glow, group: desk.lampGroup }
    };
}

/** Show the crumpled pages for `count` things in the wastebasket (wastePages).
 *  Returns how many show. */
export function setWaste(waste, count) {
    const shown = wastePages(count);
    waste.pages.forEach((page, i) => { page.visible = i < shown; });
    return shown;
}

/** Switch the lamp. The shade's white glass inside stops glowing with it,
 *  so the lamp reads as off. */
export function setLamp(lamp, on) {
    lamp.light.visible = on;
    lamp.glow.material.emissiveIntensity = on ? LAMP_GLOW : 0;
}
