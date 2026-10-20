// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * carmesh.js - a car's mesh from its build (M1, painted in M3): the body is
 * the side profile, the same stations car.js weighs, extruded across the
 * body's width, with four wheels at the axle slots. The workshop's carving
 * (M4) will change the stations and the mesh follows, because it is the
 * same data.
 *
 * THE CAR'S OWN FRAME: the nose at the origin, the car reaching back along
 * -x, y up from the track under its wheels, z across. track.carPose places
 * that frame on the track, and the workbench sets it on the turntable.
 *
 * THE PAINT (M3, PRD Paint and decals): a body color, a stripe down the top
 * for two-tone, and one of three finishes. Gloss and metallic need
 * something to reflect, so the paint carries a small painted room of its
 * own (`paintRoom`, a gradient, no file), made once and shared. The
 * neighbors' cars are plain gloss.
 *
 * THE POCKETS (M3, `pockets: true`): a visitor's car shows its tungsten,
 * a dark disc where each pocket is filled, a stack standing proud where an
 * Outlaw car has piled it higher than the body (weights.js).
 *
 * Decals, the number and the top profile come with the workshop (M4).
 */

import { DERBY_CONFIG, IN } from './config.min.js';
import { profileAt } from './car.min.js';
import { pocketsOf } from './weights.min.js';

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

/** The stripe's ribbon along the top of the profile, in the car's frame:
 *  plain arrays for a BufferGeometry. Pure, for tests. */
export function stripeOf(stations, halfWidth, C = DERBY_CONFIG) {
    const base = C.kit.wheel.radius - C.kit.axleHeight;
    const lift = 0.0004;
    const positions = [];
    const indices = [];
    stations.forEach(([x, , t], i) => {
        positions.push(-x, base + t + lift, -halfWidth, -x, base + t + lift, halfWidth);
        if (i > 0) {
            const a = (i - 1) * 2;
            // Wound to face up: the car runs back along -x.
            indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
    });
    return { positions, indices };
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

function paintMaterial(color, finish, C) {
    const F = finishOf(finish, C);
    const m = new THREE.MeshStandardMaterial({ color, roughness: F.roughness, metalness: F.metalness });
    if (F.env > 0) {
        m.envMap = paintRoom();
        m.envMapIntensity = F.env;
    }
    return m;
}

/**
 * The car's mesh: a group in the car's own frame. `paint` is { body,
 * stripe, finish }, or just `color` for a plain gloss car. `pockets` draws
 * the tungsten. Returns { group, wheels, roll, dispose }.
 */
export function buildCarMesh(build, car, { paint = null, color = 0xcccccc, shadows = false, pockets = false } = {}, C = DERBY_CONFIG) {
    const P = paint || { body: color, stripe: null, finish: 'gloss' };
    const group = new THREE.Group();
    group.name = 'car';
    const made = [];
    const outline = outlineOf(build.stations, C);
    const shape = new THREE.Shape();
    shape.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1]);
    shape.closePath();
    const width = car.body.width;
    const bodyGeometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
    bodyGeometry.translate(0, 0, -width / 2);
    const bodyPaint = paintMaterial(P.body, P.finish, C);
    made.push(bodyGeometry, bodyPaint);
    const body = new THREE.Mesh(bodyGeometry, bodyPaint);
    body.castShadow = shadows;
    group.add(body);

    if (P.stripe !== null && P.stripe !== undefined) {
        const r = stripeOf(build.stations, (width * C.paint.stripeWidth) / 2, C);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(r.positions, 3));
        g.setIndex(r.indices);
        g.computeVertexNormals();
        const m = paintMaterial(P.stripe, P.finish, C);
        made.push(g, m);
        group.add(new THREE.Mesh(g, m));
    }

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
