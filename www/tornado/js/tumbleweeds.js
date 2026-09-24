// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * tumbleweeds.js - drawn in by the inflow.
 *
 * Two tumbleweeds roll in from behind the camera on the right, bounce away
 * across the field (right of the pond), hop the fence and run on toward the
 * tornado, fading into the storm's haze. See config.tumbleweeds.
 *
 * PURE IN STORY TIME. How far one has rolled is its speed, which follows the
 * inflow, added up from the moment it starts: a pure function of the story
 * second, so a seek lands where an untouched watch would be, and it slows
 * as the inflow dies rather than stopping dead.
 *
 * A SPRITE, not a mesh: a tangle of stems drawn once on a canvas and turned
 * as it rolls. Thin twigs as geometry would be lines a device pixel wide,
 * which vanish on a high-density screen, and a tangle looks the same from
 * every side anyway.
 */
import { TORNADO_CONFIG } from './config.min.js';
import { keyAt } from './funnel.min.js';

const paths = new WeakMap();

/** A tumbleweed's route as a polyline with running lengths: the curve to the
 *  fence, then straight at the tornado's foot. Built once per route. */
export function routeOf(entry, config = TORNADO_CONFIG) {
    if (paths.has(entry)) return paths.get(entry);
    const [x0, z0] = entry.from;
    const [x1, z1] = entry.via;
    const [x2, z2] = entry.fence;
    const points = [];
    for (let i = 0; i <= 48; i++) {
        const u = i / 48;
        const a = (1 - u) * (1 - u);
        const b = 2 * (1 - u) * u;
        const c = u * u;
        points.push({ x: a * x0 + b * x1 + c * x2, z: a * z0 + b * z1 + c * z2 });
    }
    const fenceIndex = points.length - 1;
    const goal = { x: config.storm.trackX, z: -config.storm.distance };
    points.push({ x: x2 + (goal.x - x2) * 0.95, z: z2 + (goal.z - z2) * 0.95 });
    let length = 0;
    for (let i = 0; i < points.length; i++) {
        if (i > 0) length += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
        points[i].s = length;
    }
    const route = { points, fenceAt: points[fenceIndex].s, length };
    paths.set(entry, route);
    return route;
}

/** The point `s` metres along a route. */
export function pointAlong(route, s) {
    const P = route.points;
    if (s <= 0) return { x: P[0].x, z: P[0].z };
    for (let i = 1; i < P.length; i++) {
        if (s <= P[i].s) {
            const k = (s - P[i - 1].s) / (P[i].s - P[i - 1].s);
            return { x: P[i - 1].x + (P[i].x - P[i - 1].x) * k, z: P[i - 1].z + (P[i].z - P[i - 1].z) * k };
        }
    }
    const last = P[P.length - 1];
    return { x: last.x, z: last.z };
}

/** How fast the wind rolls one at story second t, m/s. */
export function rollSpeed(t, config = TORNADO_CONFIG) {
    return config.tumbleweeds.speed * keyAt(t, config.lifecycle.inflow);
}

/** How far tumbleweed `entry` has rolled by story second t, metres. */
export function rolledBy(entry, t, config = TORNADO_CONFIG) {
    if (t <= entry.startAt) return 0;
    const dt = 0.05;
    let s = 0;
    let a = entry.startAt;
    while (a < t) {
        const b = Math.min(a + dt, t);
        s += 0.5 * (rollSpeed(a, config) + rollSpeed(b, config)) * (b - a);
        a = b;
    }
    return s;
}

/** Tumbleweed i at story second t: visible, x, y (its center), z, spin (the
 *  sprite's turn, radians), size (its diameter, metres), distance (from the
 *  eye) and opacity. */
export function tumbleweedPoseAt(i, t, config = TORNADO_CONFIG) {
    const T = config.tumbleweeds;
    const entry = T.list[i];
    const route = routeOf(entry, config);
    const s = rolledBy(entry, t, config);
    const p = pointAlong(route, s);
    const pace = rollSpeed(t, config) / T.speed;
    // Bounces as it goes, lower as the wind drops, and one big hop to clear
    // the fence's top wire.
    let lift = T.hop * pace * Math.abs(Math.sin(Math.PI * s / T.hopLength));
    const f = (s - (route.fenceAt - 1.6)) / 3.2;
    if (f > 0 && f < 1) lift = Math.max(lift, T.fenceHop * Math.sin(Math.PI * f));
    const r = T.radius;
    const d = Math.hypot(p.x, r + lift - config.camera.height, p.z);
    const k = Math.min(1, Math.max(0, (d - T.fade.from) / (T.fade.to - T.fade.from)));
    const opacity = 1 - k * k * (3 - 2 * k);
    return {
        visible: t > entry.startAt && opacity > 0.01,
        x: p.x,
        y: r + lift,
        z: p.z,
        // Counter-clockwise, as a ball rolling right to left turns (its top
        // runs ahead the way it goes), and a sprite's rotation is
        // counter-clockwise when positive. It was negative, and QA
        // (2026-09-23) saw them turn as if rolling the other way.
        spin: s / r,
        size: 2 * r,
        distance: d,
        opacity
    };
}

// ---------------------------------------------------------------------------
// The sprites
// ---------------------------------------------------------------------------

/** A tangle of dry stems, drawn once. Seeded, so it is the same tumbleweed. */
export function tangleTexture(seed = 7) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    let a = seed >>> 0;
    const random = () => {
        a = (a * 1664525 + 1013904223) >>> 0;
        return a / 4294967296;
    };
    ctx.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
        // Arcs round the middle, so the edge is round and the heart dense.
        const r = 12 + random() * 48;
        const start = random() * Math.PI * 2;
        ctx.strokeStyle = random() < 0.6 ? '#c9ab77' : '#8f7148';
        ctx.lineWidth = 1.5 + random() * 2;
        ctx.beginPath();
        ctx.arc(64 + (random() - 0.5) * 16, 64 + (random() - 0.5) * 16, r, start, start + 0.6 + random() * 1.6);
        ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

const weeds = [];

export function initTumbleweeds(scene, config = TORNADO_CONFIG) {
    weeds.length = 0;
    config.tumbleweeds.list.forEach((entry, i) => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tangleTexture(7 + i * 11),
            color: 0xd8d0c0,
            // Soft enough to fade, firm enough that the tangle's gaps stay
            // gaps rather than a pale disc.
            alphaTest: 0.1,
            transparent: true,
            depthWrite: false,
            fog: true
        }));
        sprite.name = `tumbleweed-${i}`;
        sprite.visible = false;
        scene.add(sprite);
        weeds.push(sprite);
    });
    return weeds;
}

/** Roll every tumbleweed to story second t. */
export function updateTumbleweeds(t, config = TORNADO_CONFIG) {
    weeds.forEach((sprite, i) => {
        const pose = tumbleweedPoseAt(i, t, config);
        sprite.visible = pose.visible;
        if (!pose.visible) return;
        sprite.position.set(pose.x, pose.y, pose.z);
        sprite.scale.set(pose.size * 1.15, pose.size * 1.15, 1);
        sprite.material.rotation = pose.spin;
        sprite.material.opacity = pose.opacity;
    });
}
