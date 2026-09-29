// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * gulls.js - A few gulls wheeling over the waterfront (QA, 2026-09-29:
 * "if we could nail the motion of the seagulls, it might add to the Corner
 * Office experience"; Steve chose distant soaring gulls).
 *
 * A GULL MOSTLY GLIDES. Over a waterfront a gull rides the air on still
 * wings, wheeling in wide, lazy circles that drift along the shore, rising
 * a little on one side of a turn and sinking on the other, banked into
 * every turn by as much as the turn asks (the bank of a coordinated turn,
 * speed times turn rate over gravity). Now and then it gives a short burst
 * of deep, quick beats, a second or two, and glides on. Held in the glide,
 * its wings keep their bent "gull wing" shape: the arm raised a little from
 * the shoulder, the hand drooping from the wrist. In a beat the hand
 * follows the arm a moment late, so the stroke ripples out to the tip.
 *
 * TRUE SCALE IS A FEW PIXELS. A gull's wings span about 1.4 meters, and
 * these are a quarter to a kilometer and a half off, where that is two to
 * five pixels. So each is drawn `scale` times life (the "true scale fails
 * at a few pixels" note), which keeps the silhouette and the motion
 * readable, and none comes nearer than `nearest` meters, so none is ever a
 * big bird at the glass.
 *
 * AT THE OFFICE'S HEIGHT, AGAINST THE LAND. Drawn lower, over the water,
 * a white gull on the bay's silver sheen could not be seen at all (QA,
 * 2026-09-29: "I also haven't seen any seagulls yet"). Riding the air up the
 * towers' faces, they wheel at about the fortieth floor's height, so the
 * visitor sees them level, against the far shore and the mountains, where a
 * white bird shows.
 *
 * ON THE VISITOR'S OWN SECONDS. The gulls keep real time even while a day
 * goes by (a gull at thirty times its pace is a moth), and go home by night
 * and in the rain (world.js).
 *
 * Pure: numbers in, poses and triangles out. world.js makes one mesh of
 * the whole flock, and fills it every frame.
 */

import { seeded } from './city.min.js';

const G = 9.81;
const TAU = Math.PI * 2;

/**
 * The flock. Each gull wheels round its own `center` (x, z in the room's
 * frame, meters: over the waterfront and the near bay, in the gaps the
 * desk and the window both see at the office's height, measured
 * 2026-09-29) at a radius between `radius`, at `speed` meters a second,
 * `height` meters over the water (the office's eye is 195 up), its center
 * drifting `drift` meters along the shore and back. `flap` is how often a
 * burst of beats comes (the chance in each `every` seconds), how long one
 * lasts, and how quick the beats are.
 */
export const GULLS = {
    centers: [[100, -620], [120, -860], [100, -1100], [-300, -660], [-200, -440], [-420, -960], [-560, -1250], [250, -1150]],
    radius: [45, 120],
    speed: [8, 11],
    height: [175, 215],
    drift: 60,
    scale: 3.5,
    nearest: 250,
    flap: { every: 7, chance: 0.4, seconds: [0.9, 1.8], hz: 2.9 },
    seed: 20260929
};

/** Each gull's own numbers, drawn once from the seed. */
let flockMade = null;
export function flock() {
    if (!flockMade) {
        const random = seeded(GULLS.seed);
        const pick = ([lo, hi]) => lo + random() * (hi - lo);
        flockMade = GULLS.centers.map(([x, z], i) => ({
            i,
            x,
            z,
            radius: pick(GULLS.radius),
            speed: pick(GULLS.speed),
            height: pick(GULLS.height),
            turn: random() < 0.5 ? 1 : -1,
            phase: random() * TAU,
            drift: random() * TAU,
            breathe: random() * TAU,
            seed: Math.floor(random() * 1e9)
        }));
    }
    return flockMade;
}

/** Where a gull is at `t` seconds: on its wheel, which swells and shrinks
 *  and drifts along the shore, rising a little on one side. */
export function gullAt(g, t) {
    const r = g.radius * (1 + 0.3 * Math.sin(0.043 * t + g.breathe));
    // The angle moves at speed over the mean radius, so the gull keeps its
    // pace whatever the wheel's size does.
    const a = g.phase + g.turn * (g.speed / g.radius) * t;
    return [
        g.x + GULLS.drift * Math.sin(0.011 * t + g.drift) + r * Math.cos(a),
        g.height + 18 * Math.sin(a + g.breathe) + 12 * Math.sin(0.031 * t + g.drift),
        g.z + 0.4 * GULLS.drift * Math.cos(0.017 * t + g.drift) + r * Math.sin(a)
    ];
}

/** The wings held in the glide, radians: the arm raised from the shoulder,
 *  the hand drooped from the wrist against the arm (so some 19 degrees
 *  below level), the gull wing's bent line. */
export const GLIDE = { arm: 0.12, hand: -0.45 };

/** A glide's trim, radians and radians a second: the rocking on the
 *  gusts, the arm's flex and the hand's, each at its own slow rate so they
 *  never fall into step. */
export const TRIM = { rock: 0.06, rockRate: 1.7, arm: 0.05, armRate: 2.3, hand: 0.07, handRate: 3.1 };

/** A small hash of whole numbers, 0 to 1. */
function hash(a, b) {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The burst of beats a gull is in at `t`, as `[seconds into it, its
 *  length]`, or null while it glides. Bursts come at random, one chance
 *  every `flap.every` seconds, each inside its own window. */
export function flapping(g, t) {
    const { every, chance, seconds } = GULLS.flap;
    const w = Math.floor(t / every);
    if (hash(g.seed, w) >= chance) return null;
    const start = w * every + hash(g.seed + 1, w) * (every - seconds[1]);
    const length = seconds[0] + hash(g.seed + 2, w) * (seconds[1] - seconds[0]);
    return t >= start && t < start + length ? [t - start, length] : null;
}

/**
 * A gull's pose at `t`: where it is, its heading (`yaw`, radians about the
 * vertical from +z), its `pitch` (nose up) along its climb, its `bank`
 * (left wing down, into a left turn; negative to the right), and its wings:
 * the arm's raise at the shoulder and the hand's droop at the wrist,
 * radians.
 */
export function gullPose(g, t) {
    const dt = 0.25;
    const p0 = gullAt(g, t - dt);
    const p1 = gullAt(g, t);
    const p2 = gullAt(g, t + dt);
    const v = [(p2[0] - p0[0]) / (2 * dt), (p2[1] - p0[1]) / (2 * dt), (p2[2] - p0[2]) / (2 * dt)];
    const acc = [(p2[0] - 2 * p1[0] + p0[0]) / (dt * dt), 0, (p2[2] - 2 * p1[2] + p0[2]) / (dt * dt)];
    const flat = Math.hypot(v[0], v[2]) || 1e-6;
    // The turn: the acceleration toward the gull's left (with +y up, a
    // heading (vx, vz) has its left at (vz, -vx)), and the bank that turn
    // takes, a little more than a plane's, as a gull's is.
    const sideways = (v[2] * acc[0] - v[0] * acc[2]) / flat;
    // Riding the air, a gliding gull is never quite still: it rocks a
    // little on the gusts and flexes its wings to trim, slow and small
    // (TRIM), so there is always something alive on it between its beats.
    const bank = Math.max(-0.75, Math.min(0.75, Math.atan(sideways / G) * 1.3 + TRIM.rock * Math.sin(TRIM.rockRate * t + g.breathe)));
    const beat = flapping(g, t);
    let arm = GLIDE.arm + TRIM.arm * Math.sin(TRIM.armRate * t + g.drift);
    let hand = GLIDE.hand + TRIM.hand * Math.sin(TRIM.handRate * t + g.phase);
    if (beat) {
        const [into, length] = beat;
        const s = TAU * GULLS.flap.hz * into;
        // Eased in and out, so a burst starts and ends from the glide.
        const k = Math.max(0, Math.min(1, into / 0.25, (length - into) / 0.25));
        arm += k * 0.6 * Math.sin(s);
        hand += k * 0.35 * Math.sin(s - 0.7);
    }
    return {
        x: p1[0], y: p1[1], z: p1[2],
        yaw: Math.atan2(v[0], v[2]),
        pitch: Math.atan2(v[1], flat),
        bank,
        arm,
        hand,
        beating: Boolean(beat)
    };
}

/** The gull's colors, sRGB: a white body, pale gray wings (a glaucous-winged
 *  gull's, the bay's own) and dark tips. */
export const GULL_COLORS = { body: 0xf4f5f4, wing: 0xc9ced3, tip: 0x3a3d41 };

/**
 * One gull's triangles in its own frame (meters, life size: +z forward, +y
 * up, +x its left), as `[part, color, [x, y, z] x 3]`. `part` says what
 * moves them: the body stays, `arm` turns with the shoulder, `hand` with the
 * shoulder and then the wrist. Each wing's points are its left one's
 * mirrored.
 */
export function gullShape() {
    const nose = [0, 0.01, 0.34];
    const tail = [0, 0.01, -0.22];
    const top = [0, 0.07, 0.04];
    const under = [0, -0.05, 0.04];
    const l = [0.065, 0, 0.02];
    const r = [-0.065, 0, 0.02];
    const { body, wing, tip } = GULL_COLORS;
    const tris = [
        ['body', body, [nose, l, top]], ['body', body, [nose, top, r]],
        ['body', body, [tail, top, l]], ['body', body, [tail, r, top]],
        ['body', body, [nose, under, l]], ['body', body, [nose, r, under]],
        ['body', body, [tail, l, under]], ['body', body, [tail, under, r]],
        ['body', body, [[0.07, 0.01, -0.2], [-0.07, 0.01, -0.2], [0, 0.01, -0.36]]]
    ];
    // The left wing: the arm from the shoulder to the wrist, the hand from
    // the wrist to a swept, pointed tip, its last part dark.
    const left = [
        ['arm', wing, [[0.05, 0.02, 0.1], [0.05, 0.02, -0.08], [0.36, 0.02, -0.06]]],
        ['arm', wing, [[0.05, 0.02, 0.1], [0.36, 0.02, -0.06], [0.36, 0.02, 0.08]]],
        ['hand', wing, [[0.36, 0.02, 0.08], [0.36, 0.02, -0.06], [0.56, 0.02, -0.1]]],
        ['hand', wing, [[0.36, 0.02, 0.08], [0.56, 0.02, -0.1], [0.58, 0.02, 0.0]]],
        ['hand', tip, [[0.58, 0.02, 0.0], [0.56, 0.02, -0.1], [0.72, 0.02, -0.16]]]
    ];
    const mirror = (pts) => pts.map(([x, y, z]) => [-x, y, z]).reverse();
    for (const [part, color, pts] of left) {
        tris.push([`${part}-left`, color, pts]);
        tris.push([`${part}-right`, color, mirror(pts)]);
    }
    return tris;
}

/** The shoulder and the wrist, as distances out from the middle. */
export const JOINTS = { shoulder: 0.05, wrist: 0.36 };

/** A point of the gull's shape put where its pose says: the wing's joints
 *  first, then the whole bird scaled, pitched, banked, turned and moved. */
export function posePoint([x0, y0, z0], part, pose, scale = GULLS.scale) {
    let x = x0;
    let y = y0;
    const side = part.endsWith('left') ? 1 : -1;
    if (part.startsWith('hand')) {
        // The wrist first: the hand droops about it.
        const dx = side * x - JOINTS.wrist;
        x = side * (JOINTS.wrist + dx * Math.cos(pose.hand));
        y = y + dx * Math.sin(pose.hand);
    }
    if (part.startsWith('arm') || part.startsWith('hand')) {
        const dx = side * x - JOINTS.shoulder;
        const dy = y;
        x = side * (JOINTS.shoulder + dx * Math.cos(pose.arm) - dy * Math.sin(pose.arm));
        y = dx * Math.sin(pose.arm) + dy * Math.cos(pose.arm);
    }
    let z = z0;
    x *= scale;
    y *= scale;
    z *= scale;
    // Pitch about the gull's own left-right axis: nose up.
    const cp = Math.cos(pose.pitch);
    const sp = Math.sin(pose.pitch);
    [y, z] = [y * cp + z * sp, z * cp - y * sp];
    // Bank about its own fore-and-aft axis: right wing (-x) down.
    const cb = Math.cos(pose.bank);
    const sb = Math.sin(pose.bank);
    [x, y] = [x * cb + y * sb, y * cb - x * sb];
    // Turn to its heading.
    const cy = Math.cos(pose.yaw);
    const sy = Math.sin(pose.yaw);
    [x, z] = [x * cy + z * sy, z * cy - x * sy];
    return [pose.x + x, pose.y + y, pose.z + z];
}

/**
 * The whole flock's triangles for a moment, written into `out` (positions,
 * nine numbers a triangle) and `normals` alongside: every gull's shape put
 * where its pose says, `scale` times life. `y0` is the water's height in
 * the room's frame.
 */
export function flockTriangles(poses, y0, out, normals, shape = gullShape(), scale = GULLS.scale) {
    let k = 0;
    for (const pose of poses) {
        const at = { ...pose, y: pose.y + y0 };
        for (const [part, , pts] of shape) {
            const [a, b, c] = pts.map((p) => posePoint(p, part, at, scale));
            const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
            const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
            // The face's own normal, by its winding: the material is
            // two-sided, and three turns it round for the side in view.
            const nx0 = uy * vz - uz * vy;
            const ny0 = uz * vx - ux * vz;
            const nz0 = ux * vy - uy * vx;
            const len = Math.hypot(nx0, ny0, nz0) || 1;
            const nx = nx0 / len;
            const ny = ny0 / len;
            const nz = nz0 / len;
            for (const p of [a, b, c]) {
                out[k] = p[0];
                out[k + 1] = p[1];
                out[k + 2] = p[2];
                normals[k] = nx;
                normals[k + 1] = ny;
                normals[k + 2] = nz;
                k += 3;
            }
        }
    }
    return k;
}
