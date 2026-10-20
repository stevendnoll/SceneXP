// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * track.js - the track in the hall (M1): where every point of the sim's
 * track sits in the room, and the aluminum drawn along it.
 *
 * THE SIM'S TRACK IS A LINE, measured along its own length from the start
 * pin (sim.trackAt). Here it is laid in the hall: the track runs toward +x,
 * height is +y, and the four lanes sit side by side across z, lane 1 at -z
 * (on the left, looking down the track) and lane 4 at +z. `pathOf` walks the
 * line once and keeps a table, so a car's place in the room is a lookup.
 *
 * Drawing uses Math freely: nothing here decides a race, only where it is
 * shown. The race itself stays in sim.js.
 *
 * ONE MESH for the aluminum and ONE for the guide strips, built as lofted
 * cross sections, so the whole track is two draw calls.
 */

import { DERBY_CONFIG } from './config.min.js';
import { trackAt } from './sim.min.js';

/**
 * The track's line in the hall: from `behind` meters up the slope behind the
 * pin to the end of the braking run. Returns { at(s) } giving { x, y, angle }
 * for any s (clamped to the ends), angle being the slope's (negative going
 * down), and the table itself.
 */
export function pathOf(C = DERBY_CONFIG) {
    const T3 = C.track3d;
    const start = -T3.behind;
    const end = C.track.courseLength + T3.braking;
    const step = T3.step / 4;
    const n = Math.ceil((end - start) / step) + 1;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    // Laid out from the pin (x = 0) both ways, so the pin is exactly at 0.
    const base = T3.floorGap;
    const pin = Math.round(-start / step);
    xs[pin] = 0;
    ys[pin] = base + trackAt(0, C).height;
    for (let i = pin + 1; i < n; i++) {
        const s = start + i * step;
        const mid = trackAt(s - step / 2, C);
        xs[i] = xs[i - 1] + mid.cos * step;
        ys[i] = base + trackAt(s, C).height;
    }
    for (let i = pin - 1; i >= 0; i--) {
        const s = start + i * step;
        const mid = trackAt(s + step / 2, C);
        xs[i] = xs[i + 1] - mid.cos * step;
        ys[i] = base + trackAt(s, C).height;
    }
    const at = (s) => {
        const f = (Math.min(end, Math.max(start, s)) - start) / step;
        const i = Math.min(n - 2, Math.floor(f));
        const u = f - i;
        const x = xs[i] + (xs[i + 1] - xs[i]) * u;
        const y = ys[i] + (ys[i + 1] - ys[i]) * u;
        const angle = Math.atan2(ys[i + 1] - ys[i], xs[i + 1] - xs[i]);
        return { x, y, angle };
    };
    return { start, end, at, xs, ys };
}

/** The z of a lane's center (lane 0 to 3). */
export function laneZ(lane, C = DERBY_CONFIG) {
    return (lane - (C.track.lanes - 1) / 2) * C.track3d.lanePitch;
}

/** The track's full width, edge to edge. */
export function trackWidth(C = DERBY_CONFIG) {
    return C.track.lanes * C.track3d.lanePitch + 2 * C.track3d.edge;
}

/**
 * Where a car sits with its nose at `s` in `lane`: its rear axle on the
 * track under it, its front axle on the track under that, so a car visibly
 * bends through the transition. Returns { x, y, z, angle } for the car's
 * nose at track level, the car's own frame pointing down the track.
 */
export function carPose(path, s, lane, car, C = DERBY_CONFIG) {
    const front = path.at(s - car.frontAxle);
    const rear = path.at(s - car.rearAxle);
    const angle = Math.atan2(front.y - rear.y, front.x - rear.x);
    return {
        x: rear.x + car.rearAxle * Math.cos(angle),
        y: rear.y + car.rearAxle * Math.sin(angle),
        z: laneZ(lane, C),
        angle
    };
}

/**
 * A lofted strip: the cross section `profile` ([[z, up], ...], a closed
 * loop, counter-clockwise seen from the start) swept along the path from
 * `from` to `to`. Returns plain arrays for a BufferGeometry: positions and
 * indices. Pure, so the track's shape is testable.
 */
export function loft(path, profile, from, to, step) {
    const positions = [];
    const indices = [];
    const rings = Math.max(2, Math.ceil((to - from) / step) + 1);
    const m = profile.length;
    for (let r = 0; r < rings; r++) {
        const s = from + ((to - from) * r) / (rings - 1);
        const p = path.at(s);
        // The section stands on the track's normal, so it leans with the slope.
        const nx = -Math.sin(p.angle);
        const ny = Math.cos(p.angle);
        for (const [z, up] of profile) positions.push(p.x + nx * up, p.y + ny * up, z);
    }
    for (let r = 0; r < rings - 1; r++) {
        for (let k = 0; k < m; k++) {
            const a = r * m + k;
            const b = r * m + ((k + 1) % m);
            const c = a + m;
            const d = b + m;
            indices.push(a, c, b, b, c, d);
        }
    }
    // Close the two ends.
    for (const r of [0, rings - 1]) {
        for (let k = 1; k < m - 1; k++) {
            const o = r * m;
            if (r === 0) indices.push(o, o + k, o + k + 1);
            else indices.push(o, o + k + 1, o + k);
        }
    }
    return { positions, indices };
}

/** A BufferGeometry from loft()'s arrays, with normals. */
function geometryOf({ positions, indices }) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
}

/** Concatenate loft()'s arrays into one. */
function merge(parts) {
    const positions = [];
    const indices = [];
    for (const p of parts) {
        const offset = positions.length / 3;
        for (const v of p.positions) positions.push(v);
        for (const i of p.indices) indices.push(i + offset);
    }
    return { positions, indices };
}

/**
 * The whole track: the aluminum bed, the guide strips, the legs under the
 * slope, the start gate (its pins, `gate.pins`, drop when the race starts),
 * and the finish line. Returns { group, gate, finishX, path }.
 */
export function buildTrack(C = DERBY_CONFIG, { shadows = false } = {}) {
    const path = pathOf(C);
    const T3 = C.track3d;
    const L = C.look;
    const group = new THREE.Group();
    group.name = 'track';
    const half = trackWidth(C) / 2;
    const t = T3.thickness;

    const bed = geometryOf(loft(path, [[-half, -t], [half, -t], [half, 0], [-half, 0]], path.start, path.end, T3.step));
    const aluminum = new THREE.MeshStandardMaterial({ color: L.aluminum, metalness: 0.55, roughness: 0.38 });
    const bedMesh = new THREE.Mesh(bed, aluminum);
    bedMesh.receiveShadow = shadows;
    group.add(bedMesh);

    const sw = T3.strip.width / 2;
    const sh = T3.strip.height;
    const strips = [];
    for (let lane = 0; lane < C.track.lanes; lane++) {
        const z = laneZ(lane, C);
        strips.push(loft(path, [[z - sw, 0], [z + sw, 0], [z + sw, sh], [z - sw, sh]], path.start, path.end, T3.step));
    }
    const stripMesh = new THREE.Mesh(geometryOf(merge(strips)), new THREE.MeshStandardMaterial({ color: L.strip, metalness: 0.4, roughness: 0.5 }));
    stripMesh.receiveShadow = shadows;
    group.add(stripMesh);

    // Legs under the slope and the transition, down to the floor.
    const legMat = new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.7 });
    const legEnd = C.track.slopeLength + C.track.transitionLength;
    for (let s = 0.3; s < legEnd; s += 0.9) {
        const p = path.at(s);
        for (const z of [-half + 0.03, half - 0.03]) {
            const h = p.y - t;
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, 0.03), legMat);
            leg.position.set(p.x, h / 2, z);
            group.add(leg);
        }
    }

    // The start gate: a bar across the lanes just in front of the pin, high
    // enough for the cars to pass under, and a pin for each lane that drops
    // below the track when the race starts.
    const gateMat = new THREE.MeshStandardMaterial({ color: L.gate, roughness: 0.5 });
    const p0 = path.at(0);
    const gate = new THREE.Group();
    gate.position.set(p0.x, p0.y, 0);
    gate.rotation.z = p0.angle;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, half * 2 + 0.04), gateMat);
    bar.position.set(0.03, 0.09, 0);
    gate.add(bar);
    const pins = [];
    for (let lane = 0; lane < C.track.lanes; lane++) {
        const pivot = new THREE.Group();
        pivot.position.set(0.012, 0, laneZ(lane, C));
        const pin = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.008), gateMat);
        pin.position.set(0, 0.025, 0);
        pivot.add(pin);
        gate.add(pivot);
        pins.push(pivot);
    }
    group.add(gate);

    // The finish line, black and white across the lanes, a hair above the bed.
    const finish = path.at(C.track.courseLength);
    const check = checkerTexture();
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.04, half * 2), new THREE.MeshBasicMaterial({ map: check }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(finish.x, finish.y + 0.0012, 0);
    group.add(line);

    return {
        group, path, finishX: finish.x, finishY: finish.y,
        gate: {
            pins,
            /** 0 standing, 1 dropped: each pin sinks through its slot below
             *  the track, as a real gate's do, so nothing lies in a lane. */
            set(open) {
                for (const p of pins) p.position.y = -0.056 * open;
            }
        }
    };
}

/** Two rows of black and white squares, for the finish line. */
function checkerTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    for (let row = 0; row < 16; row++) {
        for (let col = 0; col < 4; col++) {
            g.fillStyle = (row + col) % 2 ? '#111' : '#f4f4f4';
            g.fillRect(col * 4, row * 4, 4, 4);
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    return tex;
}
