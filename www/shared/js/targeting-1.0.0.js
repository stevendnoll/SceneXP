// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * targeting.js - Choosing what the guns are pointed at (shared engine part).
 *
 * ENTIRELY PURE. No THREE, no scene graph, no module state, no clock. Every
 * function is a value in and a value out, which is the whole reason this is a
 * separate module rather than a few lines inside a frame loop: target selection
 * is the rule the visitor is actually playing against, so it deserves to be
 * testable with plain numbers and readable in one sitting.
 *
 * Vectors are plain `{ x, y, z }` objects. Nothing here allocates one per
 * candidate, because this runs once a frame over every hostile in the scene.
 *
 * THE SELECTION RULE IS MINIMUM ANGLE, NOT MINIMUM DISTANCE. A far ship dead
 * centre beats a near ship at the edge of the cone. That is not a detail: the
 * reticle is what the visitor is aiming with, so the target has to be the thing
 * they put the reticle on. Sorting by distance instead produces a lock that
 * jumps to whatever drifted close, which reads as the game disagreeing with the
 * player.
 *
 * TIES ARE BROKEN DETERMINISTICALLY, by the shorter distance and then by id.
 * Two candidates at the same angle is not a hypothetical (a formation flying
 * abreast does it), and an unstable tiebreak makes the lock indicator flicker
 * between them every frame, which looks like a bug even though the shots are
 * landing.
 *
 * REJECTION IS CHEAPEST FIRST: allegiance, then squared distance, then the
 * angle, then occlusion last because it loops over every occluding body. At a
 * dozen candidates the ordering hardly matters; it is written this way so it
 * still holds up in a scene with a hundred.
 *
 * ON THE DUPLICATED SEGMENT-SPHERE TEST. `occludedBySphere` below is the same
 * primitive as `segmentHitsSphere` in bodies-1.0.0.js. The duplication is
 * deliberate: no shared part imports another (a shared source importing a
 * sibling's `.min.js` build artefact is worse than fifteen repeated lines), and
 * keeping it here is what lets this module claim to be dependency-free. If the
 * maths is ever corrected, correct it in both places.
 */

const DEFAULT_RULES = {
    coneRadians: 0.10472,   // 6 degrees
    range: 8000,
    allegiance: null,       // null means every allegiance qualifies
    occluders: null
};

/** The angle in radians between a unit forward vector and the direction to a
 *  point offset. Both boundaries are handled: a zero-length offset (the target
 *  is exactly at the eye) reads as perfectly centred rather than as NaN, and
 *  the dot product is clamped before acos so floating point cannot push a
 *  head-on target to NaN either. */
export function angleBetween(forward, toTarget) {
    const length = Math.hypot(toTarget.x, toTarget.y, toTarget.z);
    if (length === 0) return 0;
    const dot = (forward.x * toTarget.x + forward.y * toTarget.y + forward.z * toTarget.z) / length;
    return Math.acos(Math.max(-1, Math.min(1, dot)));
}

/** Does the SEGMENT from `eye` to `target` pass through the sphere?
 *
 *  A segment, not a ray. The naive version tests the infinite line and reports
 *  a hit for a sphere sitting beyond the far end, which in this game means a
 *  raider hanging in front of Earth is reported as hidden behind it. Clamping
 *  the parameter to [0, 1] is the entire fix and it is why this is worth a
 *  named function. */
function occludedBySphere(eye, target, centre, radius) {
    const dx = target.x - eye.x, dy = target.y - eye.y, dz = target.z - eye.z;
    const lengthSq = dx * dx + dy * dy + dz * dz;

    const cx = centre.x - eye.x, cy = centre.y - eye.y, cz = centre.z - eye.z;
    // Degenerate segment: fall back to a point-in-sphere test.
    if (lengthSq === 0) return (cx * cx + cy * cy + cz * cz) < radius * radius;

    let t = (cx * dx + cy * dy + cz * dz) / lengthSq;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);

    const nx = eye.x + dx * t - centre.x;
    const ny = eye.y + dy * t - centre.y;
    const nz = eye.z + dz * t - centre.z;
    return (nx * nx + ny * ny + nz * nz) < radius * radius;
}

/** True when any occluder stands between the eye and the target.
 *  `occluders` is a list of `{ centre, radius }`, passed in rather than read
 *  from a body registry, which is what keeps this module free of dependencies
 *  and trivial to test. */
export function isOccluded(eye, target, occluders) {
    if (!occluders) return false;
    for (let i = 0; i < occluders.length; i++) {
        const o = occluders[i];
        if (!o) continue;
        if (occludedBySphere(eye, target, o.centre, o.radius)) return true;
    }
    return false;
}

/** Pick the one target the guns should be firing at, or null.
 *
 *  view       { eye: {x,y,z}, forward: {x,y,z} }   forward must be unit length
 *  candidates [{ id, position, allegiance }]        radius is ignored here
 *  rules      { coneRadians, range, allegiance: [...], occluders: [...] }
 *  returns    { id, angle, distance, position, candidate } | null
 *
 *  Both the cone and the range are INCLUSIVE at the boundary. A visitor who has
 *  a raider exactly on the edge of the cone has done the work; refusing the
 *  shot by a floating-point hair would read as the game being fussy.
 */
export function pickTarget(view, candidates, rules = {}) {
    if (!view || !candidates || candidates.length === 0) return null;

    const cone = rules.coneRadians === undefined ? DEFAULT_RULES.coneRadians : rules.coneRadians;
    const range = rules.range === undefined ? DEFAULT_RULES.range : rules.range;
    const allowed = rules.allegiance || DEFAULT_RULES.allegiance;
    const occluders = rules.occluders || DEFAULT_RULES.occluders;
    const rangeSq = range * range;

    const eye = view.eye;
    const forward = view.forward;

    let best = null;

    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (!c || !c.position) continue;

        // 1. Allegiance. Cheapest possible rejection, and the one that keeps
        //    the rule in data: a later game adds a target class here rather
        //    than editing this module.
        if (allowed && allowed.indexOf(c.allegiance) === -1) continue;

        // 2. Squared distance, so nothing takes a square root it does not need.
        const dx = c.position.x - eye.x, dy = c.position.y - eye.y, dz = c.position.z - eye.z;
        const distanceSq = dx * dx + dy * dy + dz * dz;
        if (distanceSq > rangeSq) continue;

        // 3. The angle. One acos per surviving candidate.
        const angle = angleBetween(forward, { x: dx, y: dy, z: dz });
        if (angle > cone) continue;

        // Only now is it worth ranking, and only a winner pays for occlusion.
        const distance = Math.sqrt(distanceSq);
        if (best && !beats(angle, distance, c.id, best)) continue;

        // 4. Occlusion, last because it loops over every body in the scene.
        if (isOccluded(eye, c.position, occluders)) continue;

        best = { id: c.id, angle, distance, position: c.position, candidate: c };
    }

    return best;
}

/** Is (angle, distance, id) a better target than the incumbent? Minimum angle
 *  first, then the shorter distance, then the lower id. Every comparison is
 *  total, so the answer never depends on the order the candidates arrived in. */
function beats(angle, distance, id, best) {
    if (angle !== best.angle) return angle < best.angle;
    if (distance !== best.distance) return distance < best.distance;
    return String(id) < String(best.id);
}

export const __test__ = { occludedBySphere, beats, DEFAULT_RULES };
