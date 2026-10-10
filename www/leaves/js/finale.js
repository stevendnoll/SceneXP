// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * finale.js - the dive into the pile, when the round is over (M3).
 *
 * The leaves have landed and the result is counted. Then the person sets the
 * blower down, walks to a run-up spot out on the lawn, runs at the tarp's
 * pile and dives in, arms first:
 *
 *   A PILE WORTH DIVING INTO (as tall as `diveHeight` at its peak): they
 *   land in it, the leaves burst up and flutter down around them, and they
 *   roll part way over in the pile to look at the camera, arms overhead.
 *
 *   ANYTHING LESS: they find the lawn. A small puff of leaves, a moment
 *   flat on their face, and a roll part way over with a hand on the small of
 *   the back. Steve's note, 2026-10-06: "a small penalty for doing a lousy
 *   job".
 *
 *   NOBODY STANDS BACK UP (Steve's M3 QA, 2026-10-06): the roll toward the
 *   camera is the last beat, and it keeps the finale short.
 *
 * ROUND WHAT IS SOLID (M6, with our yard's decorations on the lawn, and the
 * old edge where a person right of the porch ran through its corner). The
 * approach swings, a little at a time either way, until the run-up and the
 * landing are clear of every box, and the walk to the run-up spot goes
 * round any box in its way by its nearest corner.
 *
 * PURE. planFinale() decides everything once, from where the pile's peak is
 * and where the person stands, and finaleAt() says where they are and how
 * they hold themselves at any moment of it, so the whole thing is measured
 * under Node. main.js applies the pose, fires the burst at `t.air`, and
 * moves the camera.
 *
 * THE FIGURE'S POSE. `pitch` tips the whole body forward about the hips
 * (0 upright, PI / 2 face down), `roll` turns a lying body about its own
 * length, and `lift` raises the figure, so a body lying flat is `pivot`
 * above its feet and has to be lowered to lie on anything.
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const ease = (u) => u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;

/** How high the hips sit above the feet, the point the body tips about. */
export const PIVOT = 0.95;
/** Half a body's depth: how far a body lying face down sits above what it
 *  lies on. */
const BODY = 0.12;

/** Whether the segment from a to b passes within `m` of the box (a slab
 *  test on the box grown by m). */
export function segmentHitsBox(a, b, box, m) {
    let t0 = 0;
    let t1 = 1;
    for (const [p, d, lo, hi] of [[a.x, b.x - a.x, box.minX - m, box.maxX + m], [a.z, b.z - a.z, box.minZ - m, box.maxZ + m]]) {
        if (Math.abs(d) < 1e-9) {
            if (p < lo || p > hi) return false;
            continue;
        }
        let ta = (lo - p) / d;
        let tb = (hi - p) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) return false;
    }
    return true;
}

const inside = (p, box, m) => p.x > box.minX - m && p.x < box.maxX + m && p.z > box.minZ - m && p.z < box.maxZ + m;

/** Whether a to b is clear of every box (any box `a` already stands in is
 *  let off: they are walking out of it). */
function clearOf(a, b, boxes, m) {
    return boxes.every((box) => inside(a, box, m) || !segmentHitsBox(a, b, box, m));
}

/**
 * A walk from a to b round whatever is in the way: straight if it is clear,
 * otherwise the shortest way through the corners of the boxes (each grown by
 * `m`, and a little more), the corners inside `area` that no box covers. A
 * small visibility graph, searched once when the dive is planned: boxes can
 * stand close together (the porch, its step, a post, a pumpkin stack), and
 * going round one at a time found no way through them. Returns [a,
 * ...corners, b], or the straight [a, b] if there is no way round.
 */
export function routeAround(a, b, boxes, m, area) {
    if (clearOf(a, b, boxes, m)) return [a, b];
    const g = m + 0.05;
    const nodes = [a, b];
    for (const box of boxes) {
        for (const [x, z] of [[box.minX - g, box.minZ - g], [box.maxX + g, box.minZ - g], [box.minX - g, box.maxZ + g], [box.maxX + g, box.maxZ + g]]) {
            if (x < area.minX || x > area.maxX || z < area.minZ || z > area.maxZ) continue;
            if (boxes.some((o) => inside({ x, z }, o, m))) continue;
            nodes.push({ x, z });
        }
    }
    const n = nodes.length;
    const dist = new Array(n).fill(Infinity);
    const prev = new Array(n).fill(-1);
    const done = new Array(n).fill(false);
    dist[0] = 0;
    for (let round = 0; round < n; round++) {
        let u = -1;
        for (let k = 0; k < n; k++) if (!done[k] && (u < 0 || dist[k] < dist[u])) u = k;
        if (u < 0 || dist[u] === Infinity) break;
        done[u] = true;
        if (u === 1) break;
        for (let v = 0; v < n; v++) {
            if (done[v]) continue;
            const d = dist[u] + Math.hypot(nodes[v].x - nodes[u].x, nodes[v].z - nodes[u].z);
            if (d < dist[v] && clearOf(nodes[u], nodes[v], boxes, m)) {
                dist[v] = d;
                prev[v] = u;
            }
        }
    }
    if (prev[1] < 0) return [a, b];
    const path = [];
    for (let k = 1; k >= 0; k = prev[k]) path.unshift(nodes[k]);
    return path;
}

const pathLength = (path) => path.reduce((n, p, k) => (k ? n + Math.hypot(p.x - path[k - 1].x, p.z - path[k - 1].z) : 0), 0);

/**
 * Where the dive lands, takes off and runs from, for an approach along the
 * unit direction (ux, uz) from the pile's peak toward the person.
 *
 * Hips land `landOut` meters out from the peak, so the head and arms reach
 * it. THE WHOLE BODY LANDS ON THE LAWN, fingertips to feet. The dive is
 * toward the pile (-u), so the hands reach `reachFront` past the hips that
 * way and the feet `reachBack` the other, and both must stay inside the
 * area (itself kept clear of the house, the hedge and the fence). Steve's
 * QA, 2026-10-06: aimed only by the hips, the dive into a pile in the corner
 * "dove through the corner of the house".
 */
function placeRun(peak, F, area, ux, uz) {
    const inArea = (p) => ({ x: clamp(p.x, area.minX, area.maxX), z: clamp(p.z, area.minZ, area.maxZ) });
    const fit = (v, d, lo, hi) => {
        const min = lo - Math.min(-d * F.reachFront, d * F.reachBack);
        const max = hi - Math.max(-d * F.reachFront, d * F.reachBack);
        return min <= max ? clamp(v, min, max) : (min + max) / 2;
    };
    const land = { x: peak.x + ux * F.landOut, z: peak.z + uz * F.landOut };
    land.x = fit(land.x, ux, area.minX, area.maxX);
    land.z = fit(land.z, uz, area.minZ, area.maxZ);
    const takeoff = inArea({ x: land.x + ux * F.takeoff, z: land.z + uz * F.takeoff });
    const runFrom = inArea({ x: land.x + ux * F.runUp, z: land.z + uz * F.runUp });
    return { ux, uz, land, takeoff, runFrom };
}

/** How far a box must be from the run and the walk. */
const CLEARANCE = 0.35;

/** Whether an approach's run-up, leap and landed body are clear of every
 *  box. */
function runClear(run, F, boxes) {
    const head = { x: run.land.x - run.ux * F.reachFront, z: run.land.z - run.uz * F.reachFront };
    const feet = { x: run.land.x + run.ux * F.reachBack, z: run.land.z + run.uz * F.reachBack };
    return clearOf(run.runFrom, run.takeoff, boxes, CLEARANCE) && clearOf(run.takeoff, run.land, boxes, CLEARANCE)
        && clearOf(head, feet, boxes, 0.05);
}

/**
 * Where on the tarp the dive goes (Steve's QA, 2026-10-08: the character
 * "dove through the rake and the house on different occasions. Can we try to
 * keep the dive centered in the middle of the tarp?"). The pile is usually
 * heaped against the house and the hedge, where leaves stop, so aiming at
 * its peak put a body beside them. Now the dive aims at the tarp's middle,
 * drawn `T.toPile` of the way toward the peak, and kept inside the tarp by
 * `T.inset` on each side (a body's reach from the house, the hedge and the
 * rake). `height` is the pile's own, for whether the dive lands in it, and
 * `local` the leaves' depth where it goes, for how deep the body sinks.
 */
export function diveTarget(peak, tarp, T, localAt = () => peak.height) {
    const mid = { x: (tarp.minX + tarp.maxX) / 2, z: (tarp.minZ + tarp.maxZ) / 2 };
    const x = clamp(mid.x + (peak.x - mid.x) * T.toPile, tarp.minX + T.inset.left, tarp.maxX - T.inset.right);
    const z = clamp(mid.z + (peak.z - mid.z) * T.toPile, tarp.minZ + T.inset.back, tarp.maxZ - T.inset.front);
    return { x, z, height: peak.height, local: localAt(x, z) };
}

/**
 * Plan the dive. `person` is { x, z } where they stand when the round ends,
 * `peak` is { x, z, height }, the top of the pile on the tarp (pilePeak in
 * sim.js) or where on the tarp to go (diveTarget, with `local`), `F` is
 * config.finale, `area` the rectangle they can walk in, and
 * `boxes` the solid things on it (M6) to keep the run and the walk clear of.
 */
export function planFinale(person, peak, F, area, { reduced = false, boxes = [] } = {}) {
    const success = peak.height >= F.diveHeight;
    // The run comes at the pile from the person's side of it, so the run-up
    // is out on the open lawn (the tarp is in a corner), swung a little
    // either way, as little as will do, until it is clear of every box.
    let dx = person.x - peak.x;
    let dz = person.z - peak.z;
    if (Math.hypot(dx, dz) < 0.5) { dx = 1; dz = 1; }
    const base = Math.atan2(dz, dx);
    let run = null;
    for (const swing of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2, 1.5, -1.5]) {
        const tried = placeRun(peak, F, area, Math.cos(base + swing), Math.sin(base + swing));
        if (!run) run = tried;
        if (runClear(tried, F, boxes)) {
            run = tried;
            break;
        }
    }
    const { ux, uz, land, takeoff, runFrom } = run;
    // The walk to the run-up spot, round anything in the way.
    const path = routeAround({ x: person.x, z: person.z }, runFrom, boxes, CLEARANCE, area);
    const walkTime = clamp(pathLength(path) / F.walkSpeed, F.minWalk, F.maxWalk);
    // What they land on: into a pile, sunk part way, or flat on the lawn.
    // How deep the leaves are where they land (diveTarget's `local`), or the
    // peak's height when that is all there is.
    const depth = peak.local ?? peak.height;
    const surface = success ? Math.max(0, depth - F.sink) : Math.max(0, depth);
    const t = {};
    t.pause = F.pause;
    t.walk = t.pause + walkTime;
    t.run = t.walk + F.runTime;
    t.air = t.run + F.airTime;
    t.down = t.air + (success ? F.lieTime : F.flopLie);
    t.roll = t.down + F.rollTime;
    t.end = t.roll + F.hold;
    // WHICH WAY TO ROLL to face the camera, which looks at the pile from the
    // street (+z) and above (view.cameraOn). In the body's own frame the
    // camera's side is -sin(heading), and a roll that way turns the face up
    // toward it.
    const heading = Math.atan2(-ux, -uz);
    const side = -Math.sin(heading) >= 0 ? 1 : -1;
    return {
        success,
        reduced,
        start: { x: person.x, z: person.z },
        path,
        runFrom,
        takeoff,
        land: { x: land.x, z: land.z },
        peak: { ...peak },
        surface,
        // A gentle hop under reduced motion, a real leap otherwise.
        arc: (reduced ? 0.3 : 1) * (F.arc + (success ? peak.height * 0.5 : 0)),
        heading,
        roll: side * F.roll,
        t,
        total: t.end
    };
}

/** Where along `path` (a list of points) a share `u` of its length lands,
 *  and which way that stretch heads. */
function along(path, u) {
    const total = pathLength(path);
    let left = u * total;
    for (let k = 1; k < path.length; k++) {
        const a = path[k - 1];
        const b = path[k];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (left <= len || k === path.length - 1) {
            const s = len > 0 ? Math.min(1, left / len) : 1;
            return { x: a.x + (b.x - a.x) * s, z: a.z + (b.z - a.z) * s, heading: Math.atan2(b.x - a.x, b.z - a.z), total };
        }
        left -= len;
    }
    const last = path[path.length - 1];
    return { x: last.x, z: last.z, heading: 0, total };
}

/** The lift that puts a body lying face down on a surface of height `y`. */
function lyingLift(y) {
    return y + BODY - PIVOT;
}

/**
 * Where the person is at `time` seconds into the finale, and how they hold
 * themselves: { x, z, heading, lift, pitch, roll, arms, speed, stride,
 * phase }. Phases: 'pause' (setting the blower down), 'walk', 'run', 'air',
 * 'down' (lying there), 'roll' (part way over, toward the camera), 'end'.
 */
export function finaleAt(plan, time) {
    const t = plan.t;
    const p = { x: plan.start.x, z: plan.start.z, heading: plan.heading, lift: 0, pitch: 0, roll: 0, arms: 'down', speed: 0, stride: 0, phase: 'pause' };
    const path = plan.path || [plan.start, plan.runFrom];
    if (time < t.pause) {
        p.heading = along(path, 0).heading;
        return p;
    }
    if (time < t.walk) {
        const u = (time - t.pause) / (t.walk - t.pause);
        const at = along(path, u);
        p.phase = 'walk';
        p.x = at.x;
        p.z = at.z;
        p.heading = at.heading;
        p.speed = at.total / Math.max(0.001, t.walk - t.pause);
        p.stride = at.total * u;
        return p;
    }
    const runDist = Math.hypot(plan.takeoff.x - plan.runFrom.x, plan.takeoff.z - plan.runFrom.z);
    if (time < t.run) {
        // Speeding up from a standstill: distance goes as the square of time.
        const u = (time - t.walk) / (t.run - t.walk);
        p.phase = 'run';
        p.x = lerp(plan.runFrom.x, plan.takeoff.x, u * u);
        p.z = lerp(plan.runFrom.z, plan.takeoff.z, u * u);
        p.speed = (2 * u * runDist) / Math.max(0.001, t.run - t.walk);
        p.stride = runDist * u * u;
        return p;
    }
    const lying = lyingLift(plan.surface);
    if (time < t.air) {
        const u = (time - t.run) / (t.air - t.run);
        p.phase = 'air';
        p.x = lerp(plan.takeoff.x, plan.land.x, u);
        p.z = lerp(plan.takeoff.z, plan.land.z, u);
        p.lift = lerp(0, lying, u) + plan.arc * 4 * u * (1 - u);
        p.pitch = ease(u) * Math.PI / 2;
        p.arms = 'up';
        return p;
    }
    p.x = plan.land.x;
    p.z = plan.land.z;
    if (time < t.down) {
        p.phase = 'down';
        p.lift = lying;
        p.pitch = Math.PI / 2;
        p.arms = 'up';
        return p;
    }
    // Lying there, then rolling part way over to look at the camera, and
    // staying put: arms still overhead in a good pile, a hand on the small
    // of the back after a flop.
    p.phase = time < t.roll ? 'roll' : 'end';
    p.lift = lying;
    p.pitch = Math.PI / 2;
    p.roll = plan.roll * ease(Math.min(1, (time - t.down) / (t.roll - t.down)));
    p.arms = plan.success ? 'up' : 'back';
    return p;
}
