// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * world.js - Everything outside the windows, as its own scene.
 *
 * TWO SCENES, TWO CAMERAS, ONE EYE. The city reaches out to mountains tens
 * of kilometers away, and the room's things are centimeters across, and no
 * single depth buffer holds both well. So the outside is its own scene with
 * its own camera (near 5 m, far 160 km), kept at the room camera's exact
 * pose, and main.js draws it first, clears the depth, and draws the room
 * over it. The room's walls then hide the city everywhere but the windows,
 * which are holes in the walls.
 *
 * DRAWN WITHOUT TONE MAPPING. The outside is lit and colored directly, and
 * its haze (fog) is the horizon's own color, which only matches the sky when
 * nothing re-maps the colors after the fog is applied (the "three's fog runs
 * after tone mapping" note). The room is drawn with the usual ACES pass.
 *
 * THE LAYOUT IS city.js's. This file only turns it into meshes: the sloped
 * ground of downtown (its shoreline is where the ground dips under the
 * water), the towers from their own plans (box, chamfered or round, with
 * setbacks and podiums) in one mesh per facade style, the roofs and what
 * stands on them, the piers, the far lands and their hills, the mountains
 * and the sky. The water and the haze are bay.js's. Standard materials only:
 * no custom shader, so nothing can fail to compile in a browser the tests
 * never see.
 */

/* global THREE */

import {
    CITY, WATER_Y, FAR_LAND, blockAt, elevation, cityTowers, piers, olympics, farHills, reflectionPoints, PANEL, FACADE_TILE, towerStyle,
    rooftop, aviationLights, facadeUv, outline, sections
} from './city.min.js';
import { BAY, HAZE, rippleNormals } from './bay.min.js';
import { CLOUDS, POLE, starField, lightFrom, discBasis } from './sky.min.js';
import {
    ferryRoute, ferriesAt, shipsAt, sailboatCourses, sailboatsAt, seaplaneAt, carLanes, carFleet, carPositions, drift
} from './life.min.js';
import { buildFleet, place } from './fleet.min.js';

/** The facade styles, in the order paint.js paints them. */
export const STYLES = ['grid', 'bands', 'fins'];

/** Glass tints: cool blues, greens and silvers, one per tower. The glass is
 *  metallic, so its tint is how much it reflects: light tints for the
 *  mirrored curtain walls of a modern downtown, which by day show more of
 *  the city and the sky than of themselves. */
export const GLASS_TONES = [0x9db4c6, 0xb3c3cf, 0x8aa2b6, 0xc0cad2, 0x98b3ac, 0xa7b1bb];

/**
 * The glass's finish. `reflect` strengthens its reflection past a plain
 * mirror's (Steve, 2026-09-24: "a little dark and not too reflective").
 * `metalness` scales the painted map's: a fully metallic pane is all
 * reflection and no color of its own, so on the shaded side of a tower,
 * reflecting the streets below, it goes dark; a little body color lets the
 * sky's light show on it, as the frit and the offices behind real glass do.
 */
export const GLASS = { reflect: 1.6, metalness: 0.8 };

function standard(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
}

/**
 * A growing triangle list: positions, normals, and optional colors and UVs.
 * `tri` takes three points and the way the face should look, and winds the
 * triangle so it does, so no face comes out inside out whatever order its
 * points were listed in.
 */
function triangles({ colors = false, uvs = false } = {}) {
    const out = { positions: [], normals: [], colors: colors ? [] : null, uvs: uvs ? [] : null };
    out.tri = (p, q, r, facing, color = null, uv = null) => {
        const ux = q[0] - p[0]; const uy = q[1] - p[1]; const uz = q[2] - p[2];
        const vx = r[0] - p[0]; const vy = r[1] - p[1]; const vz = r[2] - p[2];
        const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
        const flip = n[0] * facing[0] + n[1] * facing[1] + n[2] * facing[2] < 0;
        const order = flip ? [0, 2, 1] : [0, 1, 2];
        const pts = [p, q, r];
        for (const i of order) {
            out.positions.push(...pts[i]);
            out.normals.push(...facing);
            if (out.colors) out.colors.push(color.r, color.g, color.b);
            if (out.uvs) out.uvs.push(...uv[i]);
        }
    };
    out.geometry = () => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(out.positions, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(out.normals, 3));
        if (out.colors) g.setAttribute('color', new THREE.Float32BufferAttribute(out.colors, 3));
        if (out.uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uvs, 2));
        return g;
    };
    return out;
}

/**
 * Every tower's walls, for towers of one style, in one geometry, colored by
 * its glass and mapped in REAL METERS: a facade tile is FACADE_TILE panels
 * of PANEL.width across and as many floors of PANEL.floor up, on every
 * tower whatever its size, so no panel is stretched. The walls follow the
 * tower's own plan (city.js outline) section by section, stepping in at
 * each setback, and its podium is a wider box at its foot. Each tower
 * starts its tile at its own panel and floor, so neighbors do not light up
 * in step at night.
 */
export function towerGeometry(towers) {
    const t3 = triangles({ colors: true, uvs: true });
    const c = new THREE.Color();
    const U = (m) => facadeUv(m, PANEL.width, FACADE_TILE.cols);
    const V = (m) => facadeUv(m, PANEL.floor, FACADE_TILE.rows);
    const walls = (pts, y0, y1, ground, u0, v0) => {
        let run = 0;
        for (let i = 0; i < pts.length; i++) {
            const [ax, az] = pts[i];
            const [bx, bz] = pts[(i + 1) % pts.length];
            const len = Math.hypot(bx - ax, bz - az);
            if (len < 1e-6) continue;
            // Outward, for an outline that runs counterclockwise from above.
            const facing = [(bz - az) / len, 0, -(bx - ax) / len];
            const ua = u0 + U(run);
            const ub = u0 + U(run + len);
            const va = v0 + V(y0);
            const vb = v0 + V(y1);
            const a = [ax, ground + y0, az];
            const b = [bx, ground + y0, bz];
            const cc = [bx, ground + y1, bz];
            const d = [ax, ground + y1, az];
            t3.tri(a, cc, b, facing, c, [[ua, va], [ub, vb], [ub, va]]);
            t3.tri(a, d, cc, facing, c, [[ua, va], [ua, vb], [ub, vb]]);
            run += len;
        }
    };
    for (const t of towers) {
        const ground = WATER_Y + t.base;
        const u0 = Math.floor(t.tone * 97) / FACADE_TILE.cols;
        const v0 = Math.floor(t.tone * 61) / FACADE_TILE.rows;
        c.setHex(GLASS_TONES[Math.floor(t.tone * GLASS_TONES.length) % GLASS_TONES.length], THREE.SRGBColorSpace);
        if (t.podium) {
            const p = t.podium;
            const box = [[t.x - p.w / 2, t.z - p.d / 2], [t.x + p.w / 2, t.z - p.d / 2], [t.x + p.w / 2, t.z + p.d / 2], [t.x - p.w / 2, t.z + p.d / 2]];
            walls(box, 0, p.h, ground, u0 + 0.5, v0);
        }
        for (const s of sections(t)) walls(outline(t, s.at), s.y0, s.y1, ground, u0, v0);
    }
    return t3.geometry();
}

const ROOF_COLORS = { roof: 0x3a3e44, terrace: 0x4b5057, podium: 0x5a5f66, penthouse: 0x8a9096, helipad: 0xa9afb5, spire: 0xcfd4d9 };

/** Every roof and terrace, and everything standing on the roofs (city.js
 *  rooftop), in one geometry colored by kind. */
export function roofGeometry(towers) {
    const t3 = triangles({ colors: true });
    const c = new THREE.Color();
    const UP = [0, 1, 0];
    const cap = (pts, y, hex) => {
        c.setHex(hex, THREE.SRGBColorSpace);
        const [x0, z0] = pts[0];
        for (let i = 1; i < pts.length - 1; i++) {
            t3.tri([x0, y, z0], [pts[i][0], y, pts[i][1]], [pts[i + 1][0], y, pts[i + 1][1]], UP, c);
        }
    };
    const boxAt = (x, z, w, d, y0, y1, hex) => {
        const pts = [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2]];
        cap(pts, y1, hex);
        c.setHex(hex, THREE.SRGBColorSpace);
        for (let i = 0; i < 4; i++) {
            const [ax, az] = pts[i];
            const [bx, bz] = pts[(i + 1) % 4];
            const len = Math.hypot(bx - ax, bz - az);
            const facing = [(bz - az) / len, 0, -(bx - ax) / len];
            t3.tri([ax, y0, az], [bx, y1, bz], [bx, y0, bz], facing, c);
            t3.tri([ax, y0, az], [ax, y1, az], [bx, y1, bz], facing, c);
        }
    };
    for (const t of towers) {
        const ground = WATER_Y + t.base;
        if (t.podium) {
            const p = t.podium;
            cap([[t.x - p.w / 2, t.z - p.d / 2], [t.x + p.w / 2, t.z - p.d / 2], [t.x + p.w / 2, t.z + p.d / 2], [t.x - p.w / 2, t.z + p.d / 2]],
                ground + p.h, ROOF_COLORS.podium);
        }
        const secs = sections(t);
        secs.forEach((s, i) => cap(outline(t, s.at), ground + s.y1, i === secs.length - 1 ? ROOF_COLORS.roof : ROOF_COLORS.terrace));
        for (const b of rooftop(t)) boxAt(b.x, b.z, b.w, b.d, ground + b.y, ground + b.y + b.h, ROOF_COLORS[b.kind]);
    }
    return t3.geometry();
}

/**
 * The towers: one mesh per facade style (three draw calls for the whole
 * skyline), each with its style's painted maps when main.js has them:
 * `color`, `rm` (roughness in green, metalness in blue) and `lit`. With the
 * maps the glass is smooth and metallic, so it shows the sky the
 * environment holds; without them (the tests), plain glass.
 */
function buildTowers(scene, towers, facades) {
    const meshes = [];
    for (const style of STYLES) {
        const mine = towers.filter((t) => towerStyle(t) === style);
        if (!mine.length) continue;
        const maps = facades && facades[style];
        for (const tex of maps ? [maps.color, maps.rm, maps.lit] : []) {
            if (!tex) continue;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
        }
        const material = maps
            ? new THREE.MeshStandardMaterial({
                vertexColors: true, map: maps.color, roughnessMap: maps.rm, metalnessMap: maps.rm, roughness: 1,
                metalness: GLASS.metalness, envMapIntensity: GLASS.reflect,
                emissiveMap: maps.lit, emissive: 0xffffff, emissiveIntensity: 0
            })
            : standard(0xffffff, { vertexColors: true, roughness: 0.3, metalness: 0.45, envMapIntensity: GLASS.reflect });
        const mesh = new THREE.Mesh(towerGeometry(mine), material);
        mesh.name = `towers-${style}`;
        scene.add(mesh);
        meshes.push(mesh);
    }
    const roofs = new THREE.Mesh(roofGeometry(towers), standard(0xffffff, { vertexColors: true, roughness: 0.9 }));
    roofs.name = 'towers-roofs';
    scene.add(roofs);
    return { meshes, roofs };
}

/** The red aviation lights on the tall towers: shown at night. */
function buildBeacons(scene, towers) {
    const positions = aviationLights(towers).flatMap(([x, y, z]) => [x, WATER_Y + y, z]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const beacons = new THREE.Points(geometry, new THREE.PointsMaterial({
        color: 0xff2a1a, size: 3, sizeAttenuation: false, fog: false, toneMapped: false
    }));
    beacons.name = 'beacons';
    beacons.visible = false;
    scene.add(beacons);
    return beacons;
}

/** Where the downtown ground is modeled, as its own sloped mesh. */
export const TERRAIN = { x0: -900, x1: 4800, z0: -1700, z1: 700, cell: 30 };

/**
 * Downtown's ground: a grid whose heights are city.js elevation, so it
 * falls from the hill to the waterfront and goes under the water past the
 * shore. Its UVs are one street tile a block, centered under each block
 * (textures.streets and, for night, textures.streetsLit).
 */
export function terrainGeometry(area = TERRAIN) {
    const nx = Math.round((area.x1 - area.x0) / area.cell);
    const nz = Math.round((area.z1 - area.z0) / area.cell);
    const pitch = CITY.block + CITY.street;
    const home = blockAt(0, 0);
    const positions = [];
    const uvs = [];
    const index = [];
    for (let j = 0; j <= nz; j++) {
        for (let i = 0; i <= nx; i++) {
            const x = area.x0 + i * area.cell;
            const z = area.z0 + j * area.cell;
            positions.push(x, WATER_Y + elevation(x, z), z);
            uvs.push((x - home.cx) / pitch + 0.5, (z - home.cz) / pitch + 0.5);
        }
    }
    const row = nx + 1;
    for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
            const a = j * row + i;
            // Wound to face up: z runs toward the viewer's bottom from above.
            index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry;
}

function buildGround(scene, textures) {
    const tile = (texture) => {
        if (!texture) return null;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    };
    const streets = tile(textures.streets);
    const lit = tile(textures.streetsLit);
    const city = standard(streets ? 0xffffff : 0x55595c, {
        roughness: 1, map: streets, emissiveMap: lit, emissive: lit ? 0xffffff : 0x000000, emissiveIntensity: 0
    });
    const ground = new THREE.Mesh(terrainGeometry(), city);
    ground.name = 'land-downtown';
    scene.add(ground);
    // Beyond the modeled ground, the rest of the city's side at the hill's
    // height, far off in the haze to the north.
    const beyond = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), standard(0x4d5254, { roughness: 1 }));
    beyond.rotation.x = -Math.PI / 2;
    beyond.position.set(TERRAIN.x1 + 30000, WATER_Y + CITY.hill - 1, 25000);
    beyond.name = 'land-beyond';
    scene.add(beyond);
    const woods = standard(0x3b5443, { roughness: 1 });
    for (const [name, poly] of Object.entries(FAR_LAND)) {
        // A shape lies in x and y. Drawn with y = -z, then laid flat by a
        // quarter turn about x, each point lands at its own (x, z).
        const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), woods);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = WATER_Y + (name === 'island' ? 20 : 2);
        mesh.name = `land-${name}`;
        scene.add(mesh);
    }
    return city;
}

function box(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    return mesh;
}

/** The piers along the waterfront, reaching west into the bay, with the
 *  ferry dock's terminal at the foot of the office's street. */
function buildPiers(scene) {
    const group = new THREE.Group();
    group.name = 'piers';
    const deck = standard(0x6e6259, { roughness: 1 });
    const shed = standard(0x8f9aa3, { roughness: 0.7 });
    for (const pier of piers()) {
        const z = pier.z - pier.length / 2;
        group.add(box(pier.width, 2, pier.length, deck, pier.x, WATER_Y + 3, z));
        group.add(box(pier.width * 0.7, pier.ferry ? 14 : 9, pier.length * 0.75, shed, pier.x, WATER_Y + (pier.ferry ? 11 : 8.5), z));
    }
    scene.add(group);
    return group;
}

/** The mountains' rock and snow, and the dark green of the wooded hills. */
export const RIDGE_COLORS = { rock: 0x55657a, snow: 0xf2f5f8, woods: 0x2c4435 };

/** A ridge across the bay: peaks along x, snow on the tops above its snow
 *  line. The mountains, and (all `rock`, no snow) the wooded hills. */
export function ridgeGeometry(ridge, { rock: rockHex = RIDGE_COLORS.rock, snow: snowHex = RIDGE_COLORS.snow } = {}) {
    const t3 = triangles({ colors: true });
    const rock = new THREE.Color().setHex(rockHex, THREE.SRGBColorSpace);
    const snow = new THREE.Color().setHex(snowHex, THREE.SRGBColorSpace);
    const near = ridge.z + ridge.depth / 2;
    const far = ridge.z - ridge.depth / 2;
    const color = (y) => (y - WATER_Y > ridge.snow ? snow : rock);
    for (let i = 0; i < ridge.peaks.length - 1; i++) {
        const [xa, ha] = ridge.peaks[i];
        const [xb, hb] = ridge.peaks[i + 1];
        const pa = [xa, WATER_Y + ha, ridge.z];
        const pb = [xb, WATER_Y + hb, ridge.z];
        // The near face, toward the city, and the far face.
        const nearFacing = [0, 0.4, 0.92];
        t3.tri([xa, WATER_Y, near], [xb, WATER_Y, near], pb, nearFacing, rock);
        t3.tri([xa, WATER_Y, near], pb, pa, nearFacing, color(Math.min(pa[1], pb[1])));
        const farFacing = [0, 0.4, -0.92];
        t3.tri([xb, WATER_Y, far], [xa, WATER_Y, far], pa, farFacing, rock);
        t3.tri([xb, WATER_Y, far], pa, pb, farFacing, rock);
    }
    // Snow on the upper part of each near face: a band from the snow line
    // up to the ridge, so the tops read white against the sky. (The first
    // pass colors a face by its lower corner, this one each corner by its
    // own height.)
    const geometry = t3.geometry();
    const pos = geometry.attributes.position;
    const col = geometry.attributes.color;
    for (let i = 0; i < pos.count; i++) {
        const k = pos.getY(i) - WATER_Y > ridge.snow ? snow : rock;
        col.setXYZ(i, k.r, k.g, k.b);
    }
    return geometry;
}

/** The sky: a dome whose colors run from the zenith to the horizon, drawn
 *  after everything opaque (the "draw the sky last" note) and never fogged. */
function buildSky(scene) {
    // Fine enough that the glow round the sun is a smooth patch of sky.
    const geometry = new THREE.SphereGeometry(140000, 64, 32);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3));
    const sky = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false
    }));
    sky.renderOrder = 10;
    sky.name = 'sky';
    scene.add(sky);
    return sky;
}

/**
 * Color the dome: `top` at the zenith, `horizon` at and below it, and, with
 * a `glow` ({ dir, color, strength }), the sun's light added round it: a
 * tight bright patch and a broad soft one, so the sky is brightest near the
 * sun and a sunset lights the whole western horizon.
 */
export function paintSky(sky, top, horizon, glow = null) {
    const pos = sky.geometry.attributes.position;
    const col = sky.geometry.attributes.color;
    const a = new THREE.Color().setHex(top, THREE.SRGBColorSpace);
    const b = new THREE.Color().setHex(horizon, THREE.SRGBColorSpace);
    const g = glow ? new THREE.Color().setHex(glow.color, THREE.SRGBColorSpace) : null;
    const c = new THREE.Color();
    const r = 140000;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) / r;
        const y = pos.getY(i) / r;
        const z = pos.getZ(i) / r;
        c.copy(b).lerp(a, Math.min(1, Math.max(0, y) ** 0.55));
        if (g && glow.strength > 0) {
            const [sx, sy, sz] = glow.dir;
            const angle = Math.acos(Math.min(1, Math.max(-1, x * sx + y * sy + z * sz)));
            const k = glow.strength * (0.55 * Math.exp(-angle / 0.25) + 0.45 * Math.exp(-angle / 0.9));
            c.r += g.r * k;
            c.g += g.g * k;
            c.b += g.b * k;
        }
        col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
}

/** How far off the sun, moon and stars hang: past everything but the dome. */
export const SKY_DISTANCE = 100000;

/** The sun's and moon's discs and the sun's halo, in degrees across. The
 *  discs are about twice life, because true scale is a couple of pixels. */
export const DISCS = { sun: 0.9, moon: 1.1, halo: 18 };

const DEG = Math.PI / 180;

/**
 * The sun's disc and halo, the moon, and the stars. The disc is opaque, so
 * the mountains hide it as it sets; the halo is added over the sky; the
 * moon is a painted disc (main.js paints its phase) turned so its lit side
 * faces the sun; the stars turn about the pole on one Points object.
 */
function buildHeavens(scene, textures) {
    const across = (deg) => 2 * SKY_DISTANCE * Math.tan((deg * DEG) / 2);
    const disc = new THREE.Mesh(
        new THREE.CircleGeometry(across(DISCS.sun) / 2, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })
    );
    disc.name = 'sun';
    const halo = new THREE.Mesh(
        new THREE.PlaneGeometry(across(DISCS.halo), across(DISCS.halo)),
        new THREE.MeshBasicMaterial({
            color: 0xffffff, map: textures.glow || null, transparent: true, opacity: textures.glow ? 1 : 0,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false
        })
    );
    halo.name = 'sun-halo';
    const moon = new THREE.Mesh(
        new THREE.PlaneGeometry(across(DISCS.moon), across(DISCS.moon)),
        new THREE.MeshBasicMaterial({ color: 0xffffff, map: textures.moon || null, transparent: true, depthWrite: false, fog: false })
    );
    moon.name = 'moon';
    moon.visible = false;
    const field = starField();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(field.flatMap(([x, y, z]) => [x, y, z].map((v) => v * SKY_DISTANCE * 1.2)), 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(field.flatMap(([, , , b]) => [b, b, b * 1.05]), 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
        size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false
    }));
    stars.name = 'stars';
    stars.visible = false;
    scene.add(disc, halo, moon, stars);
    return { disc, halo, moon, stars };
}

/** The size of the water plane: past the haze's end in every direction. */
const WATER_SPAN = 400000;

/**
 * The ripples (bay.js) as a normal map: raw numbers, so no color space, and
 * mipmapped, so far water flattens to a sheen instead of shimmering.
 * Repeated to one tile every BAY.tile meters of water.
 */
export function rippleTexture(anisotropy = 1) {
    const texture = new THREE.DataTexture(rippleNormals(BAY.size, BAY.waves), BAY.size, BAY.size, THREE.RGBAFormat);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = anisotropy;
    texture.repeat.set(WATER_SPAN / BAY.tile, WATER_SPAN / BAY.tile);
    texture.needsUpdate = true;
    return texture;
}

/** The bay: a dark body under a near-mirror of the world (its own
 *  reflection, captured from over the water), a slow swell bending it. */
function buildWater(scene, anisotropy) {
    const water = new THREE.Mesh(
        new THREE.PlaneGeometry(WATER_SPAN, WATER_SPAN),
        standard(BAY.color, {
            roughness: BAY.roughness, metalness: 0, normalMap: rippleTexture(anisotropy), envMapIntensity: BAY.reflect
        })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_Y;
    water.name = 'water';
    scene.add(water);
    return water;
}

/**
 * The cloud deck (sky.js): one wide plane high over everything, facing
 * down, its painted tile repeated. Transparent, so it is drawn after the
 * sky, and hazed like everything else, so it melts into the horizon.
 */
function buildClouds(scene, texture) {
    if (texture) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(CLOUDS.span / CLOUDS.tile, CLOUDS.span / CLOUDS.tile);
    }
    const deck = new THREE.Mesh(
        new THREE.PlaneGeometry(CLOUDS.span, CLOUDS.span),
        new THREE.MeshBasicMaterial({ color: 0xffffff, map: texture || null, transparent: true, opacity: texture ? 1 : 0.4, depthWrite: false })
    );
    deck.rotation.x = Math.PI / 2;
    deck.position.y = WATER_Y + CLOUDS.altitude;
    deck.name = 'clouds';
    scene.add(deck);
    return deck;
}

/** The wooded hills across the water, one mesh each (the view test counts
 *  anything named land-* as land). */
function buildHills(scene) {
    const woods = standard(0xffffff, { vertexColors: true, roughness: 1 });
    const group = new THREE.Group();
    group.name = 'land-hills';
    for (const [name, ridge] of Object.entries(farHills())) {
        const mesh = new THREE.Mesh(ridgeGeometry(ridge, { rock: RIDGE_COLORS.woods }), woods);
        mesh.name = `land-hills-${name}`;
        group.add(mesh);
    }
    scene.add(group);
    return group;
}

/**
 * Build the world outside. Returns the scene and camera, and the handles
 * main.js drives: `setLight(look)` from daylight.js, `updateEnvironment`
 * for the reflections, and `follow(camera)` to put the outside camera where
 * the room camera is. `anisotropy` sharpens the water's ripples at a
 * glancing angle (main.js passes the renderer's, up to 8).
 */
export function buildWorld(config, { aspect = 16 / 10, textures = {}, anisotropy = 1 } = {}) {
    const scene = new THREE.Scene();
    // The haze: from the window out, all the horizon's color by HAZE.far.
    scene.fog = new THREE.Fog(0xe3ecef, HAZE.near, HAZE.far);
    const camera = new THREE.PerspectiveCamera(50, aspect, 5, 160000);

    const hemi = new THREE.HemisphereLight(0xdfeaf5, 0x3f463f, 1.0);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.8);
    // Afternoon light from over the bay, a little to the south. Its target
    // is in the scene, so the light keeps its direction when a reflection
    // capture shifts the scene.
    sun.position.set(-0.3, 0.65, -0.7).multiplyScalar(1000);
    scene.add(sun, sun.target);
    // Until the clock says otherwise (setLight with a sky), the sun stands
    // where that light comes from.
    let moment = null;
    const sunDirection = () => (moment ? moment.sun : sun.position.clone().normalize().toArray());
    // The sun as the reflections see it: a bright ball the glass and the
    // water mirror, shown only while a capture is taken (the view has its
    // own disc and halo, which are too faint to light a reflection).
    const glow = new THREE.Mesh(
        new THREE.SphereGeometry(4000, 16, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false })
    );
    glow.name = 'sun-glow';
    glow.visible = false;
    scene.add(glow);

    const water = buildWater(scene, anisotropy);
    const streets = buildGround(scene, textures);
    const hills = buildHills(scene);
    const plan = cityTowers();
    const towers = buildTowers(scene, plan, textures.facades);
    const beacons = buildBeacons(scene, plan);
    const docks = buildPiers(scene);
    const mountains = new THREE.Mesh(ridgeGeometry(olympics()), standard(0xffffff, { vertexColors: true, roughness: 0.95 }));
    mountains.name = 'mountains';
    scene.add(mountains);
    const sky = buildSky(scene);
    const clouds = buildClouds(scene, textures.clouds);
    const heavens = buildHeavens(scene, textures);
    // What moves (life.js schedules, fleet.js meshes), laid out once.
    const lanes = carLanes();
    const cars = carFleet(lanes);
    const route = ferryRoute();
    const courses = sailboatCourses();
    const fleet = buildFleet(scene, cars);
    paintSky(sky, 0x7fb2dd, 0xe3ecef);

    /** Hang a disc (the sun's, its halo, the moon) at a direction, facing
     *  the office. */
    const hang = (mesh, dir) => {
        mesh.position.set(dir[0], dir[1], dir[2]).multiplyScalar(SKY_DISTANCE);
        mesh.lookAt(0, 0, 0);
    };
    const pole = new THREE.Vector3(...POLE);
    const basis = new THREE.Matrix4();
    const lower = -1 * DEG;
    hang(heavens.disc, sunDirection());
    hang(heavens.halo, sunDirection());
    // Nothing waits at the office's own spot: the moon starts below the
    // horizon until the clock places it.
    hang(heavens.moon, [0, -1, 0]);

    let pmrem = null;
    let reflections = null;
    const points = reflectionPoints();

    /** The world as seen from a point, prefiltered for reflection. PMREM
     *  captures from the origin, so the scene steps back by the point for
     *  the moment it takes, and returns. */
    const captureFrom = ([x, y, z]) => {
        scene.position.set(-x, -y, -z);
        scene.updateMatrixWorld(true);
        const target = pmrem.fromScene(scene, 0, 5, 200000);
        scene.position.set(0, 0, 0);
        scene.updateMatrixWorld(true);
        return target;
    };

    return {
        scene,
        camera,
        sky,
        sun,
        hemi,
        water,
        hills,
        clouds,
        heavens,
        fleet,
        glow,
        points,
        towers,
        beacons,
        docks,
        mountains,
        plan,
        /**
         * Color the outside for a light level (daylight.js `lighting`) and,
         * given the sky at that moment (sky.js `skyAt`), put the sun, the
         * moon and the stars where they are, and the light where it comes
         * from. Cheap enough for every frame of a day going by.
         */
        setLight(look, at = null) {
            if (at) {
                moment = at;
                const from = lightFrom(at);
                sun.position.set(from[0], from[1], from[2]).multiplyScalar(1000);
                hang(heavens.disc, at.sun);
                hang(heavens.halo, at.sun);
                heavens.disc.visible = at.sunHeight > lower;
                heavens.halo.visible = at.sunHeight > 2 * lower;
                heavens.moon.visible = at.moonHeight > lower;
                const { right, up, normal } = discBasis(at.moon, at.sun);
                heavens.moon.position.set(at.moon[0], at.moon[1], at.moon[2]).multiplyScalar(SKY_DISTANCE);
                heavens.moon.quaternion.setFromRotationMatrix(basis.makeBasis(
                    new THREE.Vector3(...right), new THREE.Vector3(...up), new THREE.Vector3(...normal)
                ));
                heavens.stars.quaternion.setFromAxisAngle(pole, -at.turn);
            }
            // The sky's glow round the sun lingers a little after it sets.
            const height = moment ? moment.sunHeight : 0.7;
            const lingering = Math.min(1, Math.max(0, (height + 8 * DEG) / (8 * DEG)));
            paintSky(sky, look.skyTop, look.skyBottom, { dir: sunDirection(), color: look.sunColor, strength: look.halo * 0.6 * lingering });
            heavens.disc.material.color.setHex(look.sunColor, THREE.SRGBColorSpace).multiplyScalar(1.4);
            heavens.halo.material.color.setHex(look.sunColor, THREE.SRGBColorSpace).multiplyScalar(look.halo);
            heavens.moon.material.opacity = look.moonShine;
            heavens.stars.material.opacity = look.stars;
            heavens.stars.visible = look.stars > 0.01;
            fleet.light(look.cityLights);
            scene.fog.color.setHex(look.skyBottom, THREE.SRGBColorSpace);
            clouds.material.color.setHex(look.clouds, THREE.SRGBColorSpace);
            hemi.intensity = look.hemi * 1.1;
            sun.intensity = look.sun * 1.2;
            sun.color.setHex(look.sunColor, THREE.SRGBColorSpace);
            // By night the offices and the streets light up, and the beacons
            // come on.
            for (const mesh of towers.meshes) mesh.material.emissiveIntensity = look.cityLights * 1.1;
            streets.emissiveIntensity = look.cityLights * 0.9;
            beacons.visible = look.cityLights > 0.2;
        },
        /**
         * Rebuild the reflections: the world itself, as it is lit now, with
         * a bright sun in it, captured twice. The water reflects the world
         * from just over the bay, so the far water mirrors the far shore,
         * the mountains and the clouds. The glass reflects the city from
         * among the towers, so towers show towers. The bay is captured
         * FIRST and handed to everything, towers included, so in the
         * city's capture the neighbors' glass already shows the sky rather
         * than nothing (captured the other way round, every tower in it is
         * black and the glass reflects black glass). Worth doing only when
         * the light has changed (main.js calls it from applyDaylight, after
         * setLight), and only with a real renderer.
         */
        updateEnvironment(renderer, look) {
            if (!renderer || !THREE.PMREMGenerator) return null;
            if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
            const [gx, gy, gz] = sunDirection();
            glow.position.set(gx, gy, gz).multiplyScalar(120000);
            glow.material.color.setHex(look.sunColor, THREE.SRGBColorSpace).multiplyScalar(2 + 8 * look.sun / 1.52);
            // Only a sun that is up shines in the glass.
            glow.visible = !moment || moment.sunHeight > 2 * lower;
            const bay = captureFrom(points.bay);
            water.material.envMap = bay.texture;
            scene.environment = bay.texture;
            for (const mesh of towers.meshes) mesh.material.envMap = bay.texture;
            const city = captureFrom(points.city);
            for (const mesh of towers.meshes) mesh.material.envMap = city.texture;
            glow.visible = false;
            if (reflections) {
                reflections.city.dispose();
                reflections.bay.dispose();
            }
            reflections = { city, bay };
            return reflections;
        },
        /**
         * Put everything that moves where it is: the ferries, ships,
         * sailboats and seaplane on the sky's clock (`date`), the cars and
         * the ripples on real `seconds`, and the clouds drifted by the wind.
         * Cheap enough for every frame.
         */
        setLife(date, seconds) {
            ferriesAt(date, route).forEach((at, i) => place(fleet.ferries[i], at));
            const ships = shipsAt(date);
            fleet.ships.forEach((c, slot) => place(c, ships.find((ship) => ((ship.k % 3) + 3) % 3 === slot) || null));
            sailboatsAt(date, courses).forEach((at, i) => place(fleet.sailboats[i], at));
            place(fleet.seaplane, seaplaneAt(date));
            const positions = fleet.cars.geometry.attributes.position;
            carPositions(cars, lanes, seconds, positions.array);
            positions.needsUpdate = true;
            const moved = drift(date, seconds, CLOUDS.tile);
            if (clouds.material.map) clouds.material.map.offset.set(moved.clouds[0], moved.clouds[1]);
            water.material.normalMap.offset.set(moved.ripple[0], moved.ripple[1]);
        },
        /**
         * Set the finish for a screenshot round and say what it is now:
         * `glass` (the glass's reflection strength), `metal` (its metalness)
         * and `water` (the water's reflection strength). main.js offers it
         * as cornerOffice.tune in the console. The light does not change,
         * so the reflections stand.
         */
        tune({ glass, metal, water: waterReflect } = {}) {
            for (const mesh of towers.meshes) {
                if (Number.isFinite(glass)) mesh.material.envMapIntensity = glass;
                if (Number.isFinite(metal)) mesh.material.metalness = metal;
            }
            if (Number.isFinite(waterReflect)) water.material.envMapIntensity = waterReflect;
            const first = towers.meshes[0].material;
            return { glass: first.envMapIntensity, metal: first.metalness, water: water.material.envMapIntensity };
        },
        /** Stand the outside camera exactly where the room camera is. */
        follow(roomCamera) {
            camera.position.copy(roomCamera.position);
            camera.quaternion.copy(roomCamera.quaternion);
            camera.fov = roomCamera.fov;
            camera.aspect = roomCamera.aspect;
            camera.updateProjectionMatrix();
        }
    };
}
