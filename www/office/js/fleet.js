// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * fleet.js - The things that move out there, as meshes: two ferries, the
 * container ships, the sailboats, the seaplane, the cars' lights, and the
 * wakes behind whatever is under way. life.js says where they are, and
 * world.js puts them there.
 *
 * Each craft is a few boxes merged into one geometry colored by its
 * vertices, built bow toward -z at its true size and then scaled up where
 * life.js says (small craft are a pixel or two at true size). A craft's
 * lit windows are their own mesh with an emissive glow that the evening
 * turns up. Every craft starts hidden and far below the water, so nothing
 * waits at the office's own spot before the clock places it (the "a
 * raycaster meets hidden things" note).
 */

/* global THREE */

import { LIFE, CAR } from './life.min.js';
import { seeded } from './city.min.js';

/**
 * One geometry from a list of boxes, each `[x, y, z, w, h, d, color]` in
 * meters (y from the waterline up, the box's middle), colored per box.
 */
export function boxesGeometry(boxes) {
    const positions = [];
    const normals = [];
    const colors = [];
    const c = new THREE.Color();
    for (const [x, y, z, w, h, d, color] of boxes) {
        const box = new THREE.BoxGeometry(w, h, d).toNonIndexed();
        box.translate(x, y, z);
        c.setHex(color, THREE.SRGBColorSpace);
        positions.push(...box.attributes.position.array);
        normals.push(...box.attributes.normal.array);
        for (let i = 0; i < box.attributes.position.count; i++) colors.push(c.r, c.g, c.b);
        box.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
}

/** Join geometries (unindexed, with positions, normals and colors) into one. */
export function joinGeometries(parts) {
    const g = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3]]) {
        const arrays = parts.map((p) => p.attributes[name].array);
        const array = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
        let at = 0;
        for (const a of arrays) {
            array.set(a, at);
            at += a.length;
        }
        g.setAttribute(name, new THREE.Float32BufferAttribute(array, size));
    }
    return g;
}

const HIDDEN_Y = -10000;

/** A craft: its body, its windows (lit by night), and optionally a wake.
 *  `sided` draws the body from both sides (a sailboat's sails). */
function craft(name, body, windows, { wake = 0, scale = 1, sided = false } = {}) {
    const group = new THREE.Group();
    group.name = name;
    group.rotation.order = 'YXZ';
    const hull = new THREE.Mesh(body, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.6, metalness: 0.1, side: sided ? THREE.DoubleSide : THREE.FrontSide
    }));
    group.add(hull);
    let lit = null;
    if (windows) {
        lit = new THREE.Mesh(windows, new THREE.MeshStandardMaterial({
            color: 0x28323c, roughness: 0.3, emissive: 0xffd9a0, emissiveIntensity: 0
        }));
        group.add(lit);
    }
    let trail = null;
    if (wake) {
        trail = new THREE.Mesh(wakeGeometry(wake), new THREE.MeshBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
        }));
        trail.name = `${name}-wake`;
        group.add(trail);
    }
    group.scale.setScalar(scale);
    group.position.y = HIDDEN_Y;
    group.visible = false;
    return { group, lit, trail };
}

/**
 * A wake: two white arms spreading back from the stern of a craft
 * `length` long, fading to nothing behind it, lying on the water. RGBA
 * vertex colors, so the fade is in the geometry.
 */
export function wakeGeometry(length) {
    const back = length * 3;
    const spread = length * 0.9;
    const stern = length / 2;
    const y = 0.3;
    const positions = [];
    const colors = [];
    const arm = (side) => {
        const inner = [side * 2, y, stern];
        const outer = [side * 8, y, stern];
        const farOuter = [side * spread, y, stern + back];
        const farInner = [side * (spread - 20), y, stern + back];
        for (const [p, a] of [[inner, 0.8], [outer, 0.8], [farOuter, 0], [inner, 0.8], [farOuter, 0], [farInner, 0]]) {
            positions.push(...p);
            colors.push(1, 1, 1, a);
        }
    };
    arm(1);
    arm(-1);
    // The churned water right behind the stern.
    for (const [p, a] of [[[-6, y, stern], 0.7], [[6, y, stern], 0.7], [[0, y, stern + back * 0.4], 0]]) {
        positions.push(...p);
        colors.push(1, 1, 1, a);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    g.computeVertexNormals();
    return g;
}

/** A ferry: navy hull, white decks, a funnel, and two rows of windows each
 *  side. Double-ended, as harbor ferries are. */
function ferry(i) {
    const L = LIFE.ferry.length;
    const body = boxesGeometry([
        [0, 2, 0, 26, 5, L, 0x1f2a3a],
        [0, 7, 0, 25, 5, L * 0.92, 0xf4f5f2],
        [0, 12, 0, 22, 5, L * 0.7, 0xf4f5f2],
        [0, 16, 0, 16, 3, L * 0.22, 0xf4f5f2],
        [0, 21, 0, 5, 8, 7, 0x2e3f58]
    ]);
    const windows = boxesGeometry([
        [12.7, 7.4, 0, 0.4, 1.6, L * 0.86, 0], [-12.7, 7.4, 0, 0.4, 1.6, L * 0.86, 0],
        [11.2, 12.4, 0, 0.4, 1.6, L * 0.64, 0], [-11.2, 12.4, 0, 0.4, 1.6, L * 0.64, 0]
    ]);
    return craft(`ferry-${i}`, body, windows, { wake: L, scale: LIFE.ferry.scale });
}

/** A container ship: a colored hull, rows of containers, and the white
 *  accommodation block and funnel at the stern. */
function ship(i) {
    const L = LIFE.ship.length;
    const hulls = [0x7a2a26, 0x1f3e5a, 0x2d4a3a, 0x333a44];
    const boxes = [
        [0, 3, 0, 40, 12, L, hulls[i % hulls.length]],
        [0, 9.5, -L * 0.47, 30, 3, 14, hulls[i % hulls.length]]
    ];
    const cargo = [0xb33a2e, 0x2f6fa8, 0xe0a33a, 0x3f8f5a, 0xd8d8d0, 0x8a5a9a, 0x2a2f36];
    let n = i * 7;
    for (let row = 0; row < 11; row++) {
        const z = -L * 0.4 + row * 18;
        const tiers = 2 + ((row + i) % 3);
        for (let col = -1; col <= 1; col++) {
            boxes.push([col * 12.5, 9 + tiers * 1.3, z, 12, tiers * 2.6, 16, cargo[n++ % cargo.length]]);
        }
    }
    boxes.push([0, 22, L * 0.4, 34, 26, 22, 0xeef0ee], [0, 38, L * 0.43, 7, 8, 7, 0x2a2f36]);
    const windows = boxesGeometry([[0, 30, L * 0.4 - 11.2, 30, 1.4, 0.4, 0], [0, 26, L * 0.4 - 11.2, 30, 1.4, 0.4, 0]]);
    return craft(`ship-${i}`, boxesGeometry(boxes), windows, { wake: L });
}

/** A sailboat: a white hull, a mast, a mainsail and a jib, one mesh drawn
 *  from both sides (the sails are single sheets). */
function sailboat(i) {
    const hull = boxesGeometry([[0, 0.8, 0, 3.6, 1.6, 12, 0xf6f6f2], [0, 9, -0.5, 0.25, 16, 0.25, 0xcfd2d4]]);
    const sails = new THREE.BufferGeometry();
    // Main aft of the mast, jib forward of it, both in the boat's middle plane.
    sails.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 2, -0.3, 0, 16.5, -0.3, 0, 2, 4.8,
        0, 2, -0.8, 0, 14, -0.8, 0, 2, -5.6
    ], 3));
    sails.computeVertexNormals();
    const white = new THREE.Color().setHex(0xfbfbf6, THREE.SRGBColorSpace);
    sails.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: 6 }, () => [white.r, white.g, white.b]).flat(), 3));
    return craft(`sailboat-${i}`, joinGeometries([hull, sails]), null, { scale: LIFE.sailboat.scale, sided: true });
}

/** A floatplane: fuselage, high wing, tail and two floats. No livery. */
function seaplane() {
    const body = boxesGeometry([
        [0, 3.2, 0, 1.8, 1.8, 10, 0xf2f2ee],
        [0, 4.3, -0.8, 15, 0.3, 2, 0xf2f2ee],
        [0, 4.2, 4.6, 0.2, 2.2, 1.4, 0xc23a2e],
        [0, 3.4, 4.8, 4.6, 0.2, 1.2, 0xf2f2ee],
        [1.6, 0.6, -0.5, 0.7, 0.7, 8, 0xd9d9d4],
        [-1.6, 0.6, -0.5, 0.7, 0.7, 8, 0xd9d9d4],
        [1.6, 1.8, -0.5, 0.2, 1.8, 0.2, 0x8a8f94],
        [-1.6, 1.8, -0.5, 0.2, 1.8, 0.2, 0x8a8f94]
    ]);
    return craft('seaplane', body, null, { scale: LIFE.seaplane.scale });
}

/** The cars' lights: one point a car, red going away, white coming. */
function carLights(cars) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(cars.length * 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cars.flatMap((c) => (c.red ? [1, 0.18, 0.12] : [1, 0.95, 0.82])), 3));
    const points = new THREE.Points(g, new THREE.PointsMaterial({
        size: 3, sizeAttenuation: false, vertexColors: true, fog: true, toneMapped: false
    }));
    points.name = 'cars';
    points.visible = false;
    points.frustumCulled = false;
    return points;
}

/** The colors cars come in, most of them white, black, silver and gray. */
export const CAR_COLORS = [0xe9e9e6, 0xe9e9e6, 0x1d1e21, 0x1d1e21, 0xa7abaf, 0xa7abaf, 0x5c6065, 0x243a5e, 0x8e2323, 0x2f5d8a, 0xb5a98f];

/**
 * The cars themselves, by day and by night: one box a car, all of them one
 * instanced mesh (one draw call for the lot), each its own color. Their
 * lights (carLights) ride on them by night.
 */
function carBodies(cars) {
    const box = new THREE.BoxGeometry(CAR.width, CAR.height, CAR.length);
    box.translate(0, CAR.height / 2, 0);
    const bodies = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.4 }), cars.length);
    const random = seeded(20260931);
    const c = new THREE.Color();
    // Far below the water until placed, like every craft.
    const away = new THREE.Matrix4().makeTranslation(0, HIDDEN_Y, 0);
    for (let i = 0; i < cars.length; i++) {
        bodies.setColorAt(i, c.setHex(CAR_COLORS[Math.floor(random() * CAR_COLORS.length)], THREE.SRGBColorSpace));
        bodies.setMatrixAt(i, away);
    }
    bodies.name = 'car-bodies';
    bodies.frustumCulled = false;
    return bodies;
}

/**
 * Build the fleet into `scene`: two ferries, a pool of three ships (as
 * many as can be in sight at once), the sailboats, the seaplane and the
 * cars. Returns them, and `light(level)` to turn the windows and the cars
 * on for the evening (daylight.js cityLights).
 */
export function buildFleet(scene, cars) {
    const fleet = {
        ferries: [ferry(0), ferry(1)],
        ships: [ship(0), ship(1), ship(2)],
        sailboats: Array.from({ length: LIFE.sailboat.count }, (_, i) => sailboat(i)),
        seaplane: seaplane(),
        cars: carLights(cars),
        carBodies: carBodies(cars)
    };
    const all = [...fleet.ferries, ...fleet.ships, ...fleet.sailboats, fleet.seaplane];
    for (const c of all) scene.add(c.group);
    scene.add(fleet.cars, fleet.carBodies);
    const matrix = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    const at = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    /** Stand every car at its place (life.js carPositions: its middle at
     *  the lanes' height, 1.2 m up) facing along its lane. */
    fleet.moveCars = (centers, yaws) => {
        for (let i = 0; i < yaws.length; i++) {
            at.set(centers[i * 3], centers[i * 3 + 1] - 1.2, centers[i * 3 + 2]);
            matrix.compose(at, turn.setFromAxisAngle(up, yaws[i]), one);
            fleet.carBodies.setMatrixAt(i, matrix);
        }
        fleet.carBodies.instanceMatrix.needsUpdate = true;
    };
    fleet.light = (level) => {
        for (const c of all) if (c.lit) c.lit.material.emissiveIntensity = level * 1.4;
        fleet.cars.visible = level > 0.3;
    };
    return fleet;
}

/** Stand a craft at a place (life.js), or hide it when it is not out. */
export function place(c, at) {
    if (!at) {
        c.group.visible = false;
        c.group.position.y = HIDDEN_Y;
        return;
    }
    c.group.visible = at.out !== false;
    c.group.position.set(at.x, at.y, at.z);
    c.group.rotation.set(at.pitch || 0, at.yaw || 0, at.heel || 0);
    if (c.trail) {
        // A wake at rest is nothing to draw, and would still cost a draw call.
        c.trail.material.opacity = 0.55 * (at.speed || 0);
        c.trail.visible = c.trail.material.opacity > 0.01;
    }
}
