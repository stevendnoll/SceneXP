// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * street.js - The leafy street outside the studio's glass (PLANNING 6.1).
 *
 * The studio's own sidewalk, a planting strip of street trees, a quiet
 * two-lane road, and across it a row of modern homes (white and pale gray,
 * flat roofs, dark glass) behind lawns and low hedges, with a line of tall
 * trees behind them against a clear morning sky. It says "a good
 * neighborhood" without asking to be looked at.
 *
 * SEEN ONLY THROUGH THE GLASS, so it is built cheaply: no shadows cast or
 * taken (the sun's shadow map covers the room only), every material once,
 * and everything folded into one mesh per material. The sky is a dome of
 * vertex colors, drawn after everything else so it only fills what is left.
 *
 * streetPlan is plain numbers and seeded, so the street is the same on
 * every visit and the tests can check none of it stands inside the studio.
 * Distances run from the glass outward along -z (CONFIG.street.bands).
 */

import { seeded, mergeByMaterial } from './studio.min.js';

/** The street's bands, from the glass outward: `{ name, z0, z1, top }`,
 *  z0 nearer the studio (the larger z). `top` is the surface's height, the
 *  road a curb's drop below the sidewalks. */
export function streetBands(config) {
    const g = -config.room.depth / 2;
    const b = config.street.bands;
    const band = (name, from, to, top) => ({ name, z0: g - from, z1: g - to, top });
    return [
        band('sidewalk', 0, b.sidewalk, -0.02),
        band('verge', b.sidewalk, b.verge, -0.03),
        band('road', b.verge, b.road, -0.15),
        band('farSidewalk', b.road, b.farSidewalk, -0.02),
        band('lawns', b.farSidewalk, b.lawns, 0)
    ];
}

/**
 * Where everything along the street stands: `{ bands, trees, homes,
 * backdrop, dashes }`, seeded so it never changes. Trees `{ x, z, trunk,
 * crown, radius, shade }`; homes `{ x, z, width, depth, height, upper,
 * color, garage }` with z the front face.
 */
export function streetPlan(config) {
    const s = config.street;
    const bands = streetBands(config);
    const at = (name) => bands.find((b) => b.name === name);
    const rand = seeded(20261012);
    const trees = [];
    const verge = at('verge');
    for (let x = -s.span; x <= s.span; x += s.treeEvery) {
        trees.push({
            x: x + (rand() - 0.5) * 1.5,
            z: (verge.z0 + verge.z1) / 2,
            trunk: 2.2 + rand() * 0.6,
            crown: 1.7 + rand() * 0.7,
            radius: 1.6 + rand() * 0.6,
            shade: Math.floor(rand() * s.leaves.length)
        });
    }
    const homes = [];
    const lawns = at('lawns');
    for (let x = -s.span + s.homeEvery / 2; x < s.span; x += s.homeEvery) {
        const two = rand() < 0.6;
        const width = 9 + rand() * 2.5;
        homes.push({
            x: x + (rand() - 0.5) * 1.5,
            z: lawns.z1,
            width,
            depth: s.homeDepth * (0.85 + rand() * 0.15),
            height: two ? 3.3 : 3.6,
            // A second story, set back or cantilevered over one side.
            upper: two ? { width: width * (0.5 + rand() * 0.25), shift: (rand() < 0.5 ? -1 : 1) * width * 0.18, height: 3.1, over: rand() < 0.4 ? 0.9 : -0.6 } : null,
            color: Math.floor(rand() * s.homes.length),
            garage: rand() < 0.55 ? (rand() < 0.5 ? -1 : 1) : 0
        });
    }
    // The tall trees behind the homes, and a few in the front yards.
    const backdrop = [];
    const behind = lawns.z1 - s.homeDepth - 5;
    for (let x = -s.span; x <= s.span; x += 6) {
        backdrop.push({
            x: x + (rand() - 0.5) * 3,
            z: behind - rand() * 6,
            trunk: 3.5 + rand() * 2,
            crown: 3.5 + rand() * 2.5,
            radius: 3 + rand() * 1.5,
            shade: Math.floor(rand() * s.leaves.length)
        });
    }
    for (const home of homes) {
        if (rand() < 0.5) continue;
        const side = home.garage ? -home.garage : (rand() < 0.5 ? -1 : 1);
        trees.push({
            x: home.x + side * (home.width / 2 - 1.2),
            z: (lawns.z0 + lawns.z1) / 2 - 0.5,
            trunk: 1.6 + rand() * 0.6,
            crown: 1.3 + rand() * 0.5,
            radius: 1.2 + rand() * 0.5,
            shade: Math.floor(rand() * s.leaves.length)
        });
    }
    // The road's dashed center line.
    const road = at('road');
    const dashes = [];
    for (let x = -s.span; x < s.span; x += 9) dashes.push({ x: x + 1.5, z: (road.z0 + road.z1) / 2, length: 3 });
    return { bands, trees, homes, backdrop, dashes };
}

// ---- Building it (three) ------------------------------------------------------

function mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...opts });
}

function box(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    return mesh;
}

/** A tree: a trunk and a crown of three overlapping blobs. */
function addTree(t, m, out) {
    const height = t.trunk + t.crown * 0.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(t.radius * 0.07, t.radius * 0.1, height, 6), m.trunk);
    trunk.position.set(t.x, height / 2 - 0.1, t.z);
    out.push(trunk);
    const leaves = m.leaves[t.shade];
    const blobs = [[0, 0, 0, 1], [0.45, -0.25, 0.2, 0.75], [-0.4, -0.2, -0.25, 0.8]];
    for (const [dx, dy, dz, k] of blobs) {
        const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(t.radius * k, 1), leaves);
        blob.position.set(t.x + dx * t.radius, t.trunk + t.crown * 0.5 + dy * t.radius, t.z + dz * t.radius);
        blob.scale.set(1, t.crown / (t.radius * 1.6), 1);
        out.push(blob);
    }
}

/** A modern home: a white volume, a flat roof with a slim dark fascia, a
 *  ribbon of dark glass, a front door, perhaps a garage, perhaps a second
 *  story set back or reaching out over the lawn. Its front faces the studio. */
function addHome(h, m, s, out) {
    const wall = m.homes[h.color];
    const cz = h.z - h.depth / 2;
    out.push(box(h.width, h.height, h.depth, wall, h.x, h.height / 2, cz));
    out.push(box(h.width + 0.3, 0.22, h.depth + 0.3, m.trim, h.x, h.height + 0.11, cz));
    const front = h.z + 0.02;
    // The ribbon window, and the door beside it, clear of the garage.
    const garageW = h.garage ? 3.2 : 0;
    const glassW = h.width - garageW - 3.2;
    const glassX = h.x - h.garage * (garageW / 2) - (h.garage ? 0 : 0.6);
    out.push(box(glassW, 1.7, 0.06, m.windows, glassX, 1.45, front));
    out.push(box(1.0, 2.2, 0.06, m.trim, glassX + (glassW / 2 + 0.9) * (h.garage ? -h.garage : 1), 1.1, front));
    if (h.garage) {
        const gx = h.x + h.garage * (h.width / 2 - garageW / 2 - 0.4);
        out.push(box(garageW - 0.4, 2.3, 0.06, m.garage, gx, 1.15, front));
        // The driveway, to the far sidewalk.
        const reach = s.bands.lawns - s.bands.farSidewalk;
        out.push(box(garageW, 0.02, reach, m.sidewalk, gx, 0.01, h.z + reach / 2));
    }
    if (h.upper) {
        const u = h.upper;
        const depth = h.depth * 0.75;
        const uz = h.z + u.over - depth / 2;
        const ux = h.x + u.shift;
        out.push(box(u.width, u.height, depth, wall, ux, h.height + 0.22 + u.height / 2, uz));
        out.push(box(u.width + 0.3, 0.2, depth + 0.3, m.trim, ux, h.height + 0.22 + u.height + 0.1, uz));
        out.push(box(u.width - 1.2, 1.5, 0.06, m.windows, ux, h.height + 0.22 + u.height / 2, uz + depth / 2 + 0.02));
    }
    // A low hedge along the front of the lawn, open at the walk and the drive.
    const lawnFront = h.z + (s.bands.lawns - s.bands.farSidewalk) - 0.6;
    for (const side of [-1, 1]) {
        if (side === h.garage) continue;
        out.push(box(h.width / 2 - 1.5, 0.7, 0.6, m.hedge, h.x + side * (h.width / 4 + 0.75), 0.35, lawnFront));
    }
}

/** The sky: a dome shaded from `top` overhead to `horizon` at the horizon
 *  and below, in vertex colors, drawn flat and last. */
function buildSky(sky, radius) {
    const geometry = new THREE.SphereGeometry(radius, 32, 16);
    const top = new THREE.Color(sky.top);
    const horizon = new THREE.Color(sky.horizon);
    const pos = geometry.attributes.position;
    const colors = [];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
        const t = Math.max(0, pos.getY(i) / radius);
        c.copy(horizon).lerp(top, Math.pow(t, 0.6));
        colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        vertexColors: true, side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false
    }));
    mesh.name = 'sky';
    mesh.renderOrder = 10;
    mesh.raycast = () => {};
    return mesh;
}

/**
 * Build the street. Returns `{ group, sky }`. Nothing in it casts or takes
 * a shadow, and nothing in it can be picked.
 */
export function buildStreet(config) {
    const s = config.street;
    const plan = streetPlan(config);
    const m = {
        ground: mat(s.ground),
        sidewalk: mat(s.sidewalk, { roughness: 0.85 }),
        road: mat(s.road, { roughness: 0.95 }),
        line: mat(s.line),
        lawn: mat(s.lawn),
        hedge: mat(s.hedge, { flatShading: true }),
        trunk: mat(s.trunk),
        leaves: s.leaves.map((c) => mat(c, { roughness: 0.8, flatShading: true })),
        homes: s.homes.map((c) => mat(c, { roughness: 0.85 })),
        trim: mat(s.trim, { roughness: 0.6 }),
        windows: mat(s.windows, { roughness: 0.15, metalness: 0.3 }),
        garage: mat(s.homes[1], { roughness: 0.6 })
    };
    const surface = { sidewalk: m.sidewalk, verge: m.lawn, road: m.road, farSidewalk: m.sidewalk, lawns: m.lawn };
    const out = [];
    const width = s.span * 2 + 40;
    for (const b of plan.bands) {
        out.push(box(width, b.top + 0.4, b.z0 - b.z1, surface[b.name], 0, (b.top - 0.4) / 2, (b.z0 + b.z1) / 2));
    }
    // The ground beyond the lawns, out to the sky.
    const last = plan.bands[plan.bands.length - 1];
    out.push(box(width + 200, 0.2, 200, m.ground, 0, -0.1, last.z1 - 100));
    for (const d of plan.dashes) out.push(box(d.length, 0.01, 0.12, m.line, d.x, plan.bands[2].top + 0.005, d.z));
    for (const t of [...plan.trees, ...plan.backdrop]) addTree(t, m, out);
    for (const h of plan.homes) addHome(h, m, s, out);

    const group = new THREE.Group();
    group.name = 'street';
    for (const mesh of mergeByMaterial(out, 'street')) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.raycast = () => {};
        group.add(mesh);
    }
    const sky = buildSky(s.sky, config.camera.far * 0.85);
    group.add(sky);
    return { group, sky, plan };
}
