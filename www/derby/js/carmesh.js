// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * carmesh.js - a car's mesh from its build (M1, painted in M3, carved and
 * sanded in M4), with four wheels at the axle slots.
 *
 * THE BODY IS LOFTED FROM THE STATIONS car.js weighs: at each station a
 * cross-section, the side profile's height by its width, the long edges
 * rounded to the sanding's radius (car.roundOf), and the sections joined
 * nose to tail. So the side and the top profile, the rounding and the mass
 * are one thing: the mesh's volume is the body's volume (tests/derby-bench
 * holds it, M4's Done-when: "its weight matches its volume").
 *
 * THE CAR'S OWN FRAME: the nose at the origin, the car reaching back along
 * -x, y up from the track under its wheels, z across. track.carPose places
 * that frame on the track, and the workbench sets it on the turntable.
 *
 * THE PAINT (M3): a body color and one of three finishes. Gloss and
 * metallic need something to reflect, so the paint carries a small painted
 * room of its own (`paintRoom`, a gradient, no file), made once and shared.
 *
 * THE LIVERY (M4.5, `livery: true`): the faces of each side and of the top
 * wear a picture (decals.js) of the paint, the decals, the name, the
 * stripe and the number, mapped from where each point is on the block, so
 * they stick to the surface and are trimmed by its shape. The neighbors'
 * cars are plain paint.
 *
 * THE POCKETS (M3, `pockets: true`): a visitor's car shows its tungsten,
 * a dark disc where each pocket is filled, a stack standing proud where an
 * Outlaw car has piled it higher than the body (weights.js).
 */

import { DERBY_CONFIG, IN } from './config.min.js';
import { profileAt, roundOf } from './car.min.js';
import { pocketsOf } from './weights.min.js';
import { drawSide, drawTop } from './decals.min.js';

/** The side outline in the car's frame, nose to tail along the top and back
 *  along the bottom: [[x, y], ...]. Pure, for tests. */
export function outlineOf(stations, C = DERBY_CONFIG) {
    const K = C.kit;
    const base = K.wheel.radius - K.axleHeight;
    const top = stations.map(([x, , t]) => [-x, base + t]);
    const bottom = stations.slice().reverse().map(([x, b]) => [-x, base + b]);
    return top.concat(bottom);
}

/** Where the four wheels sit in the car's frame: [[x, y, z], ...], front
 *  pair first. */
export function wheelSpots(car, C = DERBY_CONFIG) {
    const W = C.kit.wheel;
    const half = car.dims.wheelGap / 2 + W.thickness / 2 + 0.001;
    const spots = [];
    for (const x of [car.frontAxle, car.rearAxle]) {
        spots.push([-x, W.radius, -half], [-x, W.radius, half]);
    }
    return spots;
}

/** A paint's material settings: a finish from config, or gloss. Pure. */
export function finishOf(finish, C = DERBY_CONFIG) {
    return C.paint.finishes[finish] || C.paint.finishes.gloss;
}

/** Segments in each rounded edge. */
const ARC = 4;

/**
 * The body's surface, lofted: plain arrays for a BufferGeometry, positions,
 * uvs, indices, and the groups each face belongs to (0 the plain paint: the
 * rounded edges, the bottom and the two ends; 1 side 'a', +z; 2 side 'b',
 * -z; 3 the top). `round` is the edges' radius. Every face winds outward,
 * so the surface encloses the body's volume. Pure.
 */
export function loftOf(stations, round = 0, C = DERBY_CONFIG) {
    const K = C.kit;
    const L = K.length;
    const base = K.wheel.radius - K.axleHeight;
    const rings = stations.map(([d, b, t, w]) => {
        const h = t > b ? t - b : 0;
        const r = Math.min(round, h / 2, w / 2);
        return { x: -d, d, y0: base + b, y1: base + t, hw: w / 2, r };
    });
    const positions = [];
    const uvs = [];
    const indices = [];
    const groups = [];
    const uvOf = {
        a: (ring, y) => [1 - ring.d / L, (y - base) / K.height],
        b: (ring, y) => [ring.d / L, (y - base) / K.height],
        top: (ring, z) => [ring.d / L, (z + K.width / 2) / K.width]
    };

    /** A strip along the car: `pts(ring)` gives its cross-section's points
     *  [z, y, u, v] in ring order, the same count at every station. */
    function strip(material, pts) {
        const start = indices.length;
        const first = positions.length / 3;
        let across = 0;
        for (const ring of rings) {
            const p = pts(ring);
            across = p.length;
            for (const [z, y, u, v] of p) {
                positions.push(ring.x, y, z);
                uvs.push(u, v);
            }
        }
        for (let i = 0; i < rings.length - 1; i++) {
            for (let j = 0; j < across - 1; j++) {
                const a = first + i * across + j;
                const b = a + across;
                const c = a + 1;
                const e = b + 1;
                indices.push(a, c, b, c, e, b);
            }
        }
        groups.push({ start, count: indices.length - start, material });
    }

    const arc = (cz, cy, from, ring) => {
        const out = [];
        for (let k = 0; k <= ARC; k++) {
            const a = from + (k * Math.PI) / (2 * ARC);
            out.push([cz + ring.r * Math.cos(a), cy + ring.r * Math.sin(a), 0, 0]);
        }
        return out;
    };
    const rounded = rings.some((r) => r.r > 0);
    // In ring order, counter-clockwise seen from the tail: side a going up,
    // its top edge, the top across to -z, side b going down, the bottom.
    strip(1, (g) => [[g.hw, g.y0 + g.r, ...uvOf.a(g, g.y0 + g.r)], [g.hw, g.y1 - g.r, ...uvOf.a(g, g.y1 - g.r)]]);
    if (rounded) strip(0, (g) => arc(g.hw - g.r, g.y1 - g.r, 0, g));
    strip(3, (g) => [[g.hw - g.r, g.y1, ...uvOf.top(g, g.hw - g.r)], [-g.hw + g.r, g.y1, ...uvOf.top(g, -g.hw + g.r)]]);
    if (rounded) strip(0, (g) => arc(-g.hw + g.r, g.y1 - g.r, Math.PI / 2, g));
    strip(2, (g) => [[-g.hw, g.y1 - g.r, ...uvOf.b(g, g.y1 - g.r)], [-g.hw, g.y0 + g.r, ...uvOf.b(g, g.y0 + g.r)]]);
    if (rounded) strip(0, (g) => arc(-g.hw + g.r, g.y0 + g.r, Math.PI, g));
    strip(0, (g) => [[-g.hw + g.r, g.y0, 0, 0], [g.hw - g.r, g.y0, 0, 0]]);
    if (rounded) strip(0, (g) => arc(g.hw - g.r, g.y0 + g.r, (3 * Math.PI) / 2, g));

    // The two ends, each a fan round its middle.
    const ringPoints = (g) => {
        const pts = [[g.hw, g.y0 + g.r], [g.hw, g.y1 - g.r]];
        if (rounded) pts.push(...arc(g.hw - g.r, g.y1 - g.r, 0, g).slice(1, -1));
        pts.push([g.hw - g.r, g.y1], [-g.hw + g.r, g.y1]);
        if (rounded) pts.push(...arc(-g.hw + g.r, g.y1 - g.r, Math.PI / 2, g).slice(1, -1));
        pts.push([-g.hw, g.y1 - g.r], [-g.hw, g.y0 + g.r]);
        if (rounded) pts.push(...arc(-g.hw + g.r, g.y0 + g.r, Math.PI, g).slice(1, -1));
        pts.push([-g.hw + g.r, g.y0], [g.hw - g.r, g.y0]);
        if (rounded) pts.push(...arc(g.hw - g.r, g.y0 + g.r, (3 * Math.PI) / 2, g).slice(1, -1));
        return pts;
    };
    const start = indices.length;
    for (const [g, nose] of [[rings[0], true], [rings[rings.length - 1], false]]) {
        const pts = ringPoints(g);
        const center = positions.length / 3;
        positions.push(g.x, (g.y0 + g.y1) / 2, 0);
        uvs.push(0, 0);
        for (const [z, y] of pts) {
            positions.push(g.x, y, z);
            uvs.push(0, 0);
        }
        for (let j = 0; j < pts.length; j++) {
            const p = center + 1 + j;
            const q = center + 1 + ((j + 1) % pts.length);
            if (nose) indices.push(center, q, p);
            else indices.push(center, p, q);
        }
    }
    groups.push({ start, count: indices.length - start, material: 0 });
    return { positions, uvs, indices, groups };
}

/** The volume a closed, outward-wound surface encloses (the divergence
 *  theorem, a tetrahedron a triangle). Pure, for tests. */
export function volumeOf({ positions, indices }) {
    let v = 0;
    const p = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    for (let k = 0; k < indices.length; k += 3) {
        const [a, b, c] = [p(indices[k]), p(indices[k + 1]), p(indices[k + 2])];
        v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
    return v / 6;
}

/**
 * The tungsten to draw: a disc for each hole in use, flush with the top,
 * standing as high as an Outlaw car stacked it above the body. Pure.
 * Returns [{ x, y (the top of the body there, car frame), holes, proud }].
 */
export function tungstenOf(build, C = DERBY_CONFIG) {
    const base = C.kit.wheel.radius - C.kit.axleHeight;
    const out = [];
    for (const s of pocketsOf(build, C).spots) {
        const pieces = s.pieces.filter((p) => p.kind === 'cylinder' || p.kind === 'cube').length;
        if (!pieces) continue;
        const holes = Math.min(s.across, pieces);
        const top = profileAt(build.stations, s.x)[1];
        out.push({ x: -s.x, y: base + top, holes, proud: Math.max(0, s.used / holes - s.room) });
    }
    return out;
}

let wheelGeometry = null;
let room = null;

/** The paint's painted room: a warm ceiling, the walls, a darker floor, as
 *  a little equirectangular gradient, made once. */
function paintRoom() {
    if (room) return room;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const g = canvas.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 32);
    grad.addColorStop(0, '#fff6e8');
    grad.addColorStop(0.42, '#d9c2a2');
    grad.addColorStop(0.55, '#7b6550');
    grad.addColorStop(1, '#2e241c');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 32);
    room = new THREE.CanvasTexture(canvas);
    room.mapping = THREE.EquirectangularReflectionMapping;
    room.colorSpace = THREE.SRGBColorSpace;
    return room;
}

function paintMaterial(color, finish, C, map = null) {
    const F = finishOf(finish, C);
    const m = new THREE.MeshStandardMaterial({ color: map ? 0xffffff : color, roughness: F.roughness, metalness: F.metalness });
    if (map) m.map = map;
    if (F.env > 0) {
        m.envMap = paintRoom();
        m.envMapIntensity = F.env;
    }
    return m;
}

/** A livery picture as a texture: `draw(g, w, h)` on a canvas. */
function liveryTexture(w, h, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

/**
 * The car's mesh: a group in the car's own frame. `paint` is { body,
 * stripe, finish }, or just `color` for a plain gloss car. `livery` paints
 * the decals, the name, the stripe and the number on (M4.5). `pockets`
 * draws the tungsten. Returns { group, wheels, roll, dispose }.
 */
export function buildCarMesh(build, car, { paint = null, color = 0xcccccc, shadows = false, pockets = false, livery = false } = {}, C = DERBY_CONFIG) {
    const P = paint || { body: color, stripe: null, finish: 'gloss' };
    const group = new THREE.Group();
    group.name = 'car';
    const made = [];
    const loft = loftOf(build.stations, roundOf(build.tune ? build.tune.sand : 0, C), C);
    const bodyGeometry = new THREE.BufferGeometry();
    bodyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(loft.positions, 3));
    bodyGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(loft.uvs, 2));
    bodyGeometry.setIndex(loft.indices);
    for (const gr of loft.groups) bodyGeometry.addGroup(gr.start, gr.count, gr.material);
    bodyGeometry.computeVertexNormals();
    const plain = paintMaterial(P.body, P.finish, C);
    made.push(bodyGeometry, plain);
    let materials = [plain, plain, plain, plain];
    if (livery) {
        const lb = { ...build, paint: P };
        const sideA = liveryTexture(1024, 184, (g, w, h) => drawSide(g, w, h, lb, 'a', C));
        const sideB = liveryTexture(1024, 184, (g, w, h) => drawSide(g, w, h, lb, 'b', C));
        const top = liveryTexture(1024, 256, (g, w, h) => drawTop(g, w, h, lb, C));
        materials = [plain].concat([sideA, sideB, top].map((t) => paintMaterial(P.body, P.finish, C, t)));
        made.push(sideA, sideB, top, ...materials.slice(1));
    }
    const body = new THREE.Mesh(bodyGeometry, materials);
    body.castShadow = shadows;
    group.add(body);

    if (pockets) {
        const D = C.bench.pockets.diameter * IN;
        const tungsten = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.35, metalness: 0.85 });
        made.push(tungsten);
        for (const t of tungstenOf(build, C)) {
            const h = t.proud + 0.0008;
            const g = new THREE.CylinderGeometry(D / 2, D / 2, h, 16);
            made.push(g);
            // The holes side by side across the body, as they are drilled.
            for (let k = 0; k < t.holes; k++) {
                const disc = new THREE.Mesh(g, tungsten);
                disc.position.set(t.x, t.y + h / 2 - 0.0004, (k - (t.holes - 1) / 2) * D * 1.33);
                group.add(disc);
            }
        }
    }

    const W = C.kit.wheel;
    if (!wheelGeometry) {
        wheelGeometry = new THREE.CylinderGeometry(W.radius, W.radius, W.thickness, 20);
        wheelGeometry.rotateX(Math.PI / 2);
    }
    const tire = new THREE.MeshStandardMaterial({ color: C.look.wheel, roughness: 0.6 });
    made.push(tire);
    const wheels = wheelSpots(car, C).map(([x, y, z]) => {
        const w = new THREE.Mesh(wheelGeometry, tire);
        w.position.set(x, y, z);
        w.castShadow = shadows;
        group.add(w);
        return w;
    });

    return {
        group,
        body,
        wheels,
        /** Spin the wheels for `meters` rolled. */
        roll(meters) {
            const a = -meters / W.radius;
            for (const w of wheels) w.rotation.z = a;
        },
        dispose() {
            for (const m of made) m.dispose();
        }
    };
}
