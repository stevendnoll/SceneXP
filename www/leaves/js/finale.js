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
 *   pop up waist-deep, waving.
 *
 *   ANYTHING LESS: they find the lawn. A small puff of leaves, a moment
 *   flat on their face, and a slow climb to their feet with a hand on the
 *   small of the back. Steve's note, 2026-10-06: "a small penalty for doing
 *   a lousy job".
 *
 * PURE. planFinale() decides everything once, from where the pile's peak is
 * and where the person stands, and finaleAt() says where they are and how
 * they hold themselves at any moment of it, so the whole thing is measured
 * under Node. main.js applies the pose, fires the burst at `t.air`, and
 * moves the camera.
 *
 * THE FIGURE'S POSE. `pitch` tips the whole body forward about the hips
 * (0 upright, PI / 2 face down), and `lift` raises the figure, so a body
 * lying flat is `pivot` above its feet and has to be lowered to lie on
 * anything.
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const ease = (u) => u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;

/** How high the hips sit above the feet, the point the body tips about. */
export const PIVOT = 0.95;
/** Half a body's depth: how far a body lying face down sits above what it
 *  lies on. */
const BODY = 0.12;

/**
 * Plan the dive. `person` is { x, z } where they stand when the round ends,
 * `peak` is { x, z, height }, the top of the pile on the tarp (pilePeak in
 * sim.js), `F` is config.finale and `area` the rectangle they can walk in.
 */
export function planFinale(person, peak, F, area, { reduced = false } = {}) {
    const success = peak.height >= F.diveHeight;
    // The run comes at the pile from the person's side of it, so the run-up
    // is out on the open lawn (the tarp is in a corner).
    let dx = person.x - peak.x;
    let dz = person.z - peak.z;
    let d = Math.hypot(dx, dz);
    if (d < 0.5) { dx = 1; dz = 1; d = Math.SQRT2; }
    const ux = dx / d;
    const uz = dz / d;
    const inArea = (p) => ({ x: clamp(p.x, area.minX, area.maxX), z: clamp(p.z, area.minZ, area.maxZ) });
    // Hips land `land` meters out from the peak, so the head and arms reach it.
    const land = { x: peak.x + ux * F.landOut, z: peak.z + uz * F.landOut };
    const takeoff = inArea({ x: land.x + ux * F.takeoff, z: land.z + uz * F.takeoff });
    const runFrom = inArea({ x: land.x + ux * F.runUp, z: land.z + uz * F.runUp });
    const walkTime = clamp(Math.hypot(runFrom.x - person.x, runFrom.z - person.z) / F.walkSpeed, F.minWalk, F.maxWalk);
    // What they land on: into a pile, sunk part way, or flat on the lawn.
    const surface = success ? Math.max(0, peak.height - F.sink) : Math.max(0, peak.height);
    const t = {};
    t.pause = F.pause;
    t.walk = t.pause + walkTime;
    t.run = t.walk + F.runTime;
    t.air = t.run + F.airTime;
    t.down = t.air + (success ? F.lieTime : F.flopLie);
    t.end = t.down + (success ? F.popTime : F.getUpTime);
    return {
        success,
        reduced,
        start: { x: person.x, z: person.z },
        runFrom,
        takeoff,
        land: { x: land.x, z: land.z },
        peak: { ...peak },
        surface,
        // A gentle hop under reduced motion, a real leap otherwise.
        arc: (reduced ? 0.3 : 1) * (F.arc + (success ? peak.height * 0.5 : 0)),
        heading: Math.atan2(-ux, -uz),
        t,
        total: t.end
    };
}

/** The lift that puts a body lying face down on a surface of height `y`. */
function lyingLift(y) {
    return y + BODY - PIVOT;
}

/**
 * Where the person is at `time` seconds into the finale, and how they hold
 * themselves: { x, z, heading, lift, pitch, arms, speed, stride, phase }.
 * Phases: 'pause' (setting the blower down), 'walk', 'run', 'air', 'down'
 * (lying there), 'up' (popping up, or getting up slowly), 'end'.
 */
export function finaleAt(plan, time) {
    const t = plan.t;
    const p = { x: plan.start.x, z: plan.start.z, heading: plan.heading, lift: 0, pitch: 0, arms: 'down', speed: 0, stride: 0, phase: 'pause' };
    const walkHeading = Math.atan2(plan.runFrom.x - plan.start.x, plan.runFrom.z - plan.start.z);
    if (time < t.pause) {
        p.heading = walkHeading;
        return p;
    }
    if (time < t.walk) {
        const u = (time - t.pause) / (t.walk - t.pause);
        p.phase = 'walk';
        p.x = lerp(plan.start.x, plan.runFrom.x, u);
        p.z = lerp(plan.start.z, plan.runFrom.z, u);
        p.heading = walkHeading;
        const dist = Math.hypot(plan.runFrom.x - plan.start.x, plan.runFrom.z - plan.start.z);
        p.speed = dist / Math.max(0.001, t.walk - t.pause);
        p.stride = dist * u;
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
    const u = Math.min(1, (time - t.down) / (t.end - t.down));
    p.phase = time < t.end ? 'up' : 'end';
    if (plan.success) {
        // Up out of the pile in a hurry, waist-deep in leaves, waving.
        const k = ease(Math.min(1, u / 0.45));
        p.pitch = lerp(Math.PI / 2, 0, k);
        p.lift = lerp(lying, plan.peak.height - 1.05, k);
        p.arms = k < 1 ? 'up' : 'wave';
    } else {
        // Slowly, bent over, a hand on the small of the back. Tipped about
        // the hips, a standing body lifts its feet off the ground, so it is
        // lowered by as much.
        const k = ease(u);
        const bent = 0.45;
        p.pitch = lerp(Math.PI / 2, bent, k);
        p.lift = lerp(lying, -PIVOT * (1 - Math.cos(bent)), k);
        p.arms = 'back';
    }
    return p;
}
