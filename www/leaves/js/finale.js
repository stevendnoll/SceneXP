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
    // THE WHOLE BODY LANDS ON THE LAWN, fingertips to feet. The dive is
    // toward the pile (-u), so the hands reach `reachFront` past the hips that
    // way and the feet `reachBack` the other, and both must stay inside the
    // area (itself kept clear of the house, the hedge and the fence). Steve's
    // QA, 2026-10-06: aimed only by the hips, the dive into a pile in the
    // corner "dove through the corner of the house".
    const land = { x: peak.x + ux * F.landOut, z: peak.z + uz * F.landOut };
    const fit = (v, d, lo, hi) => {
        const min = lo - Math.min(-d * F.reachFront, d * F.reachBack);
        const max = hi - Math.max(-d * F.reachFront, d * F.reachBack);
        return min <= max ? clamp(v, min, max) : (min + max) / 2;
    };
    land.x = fit(land.x, ux, area.minX, area.maxX);
    land.z = fit(land.z, uz, area.minZ, area.maxZ);
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
