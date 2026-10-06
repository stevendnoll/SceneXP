// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * view.js - where the camera stands, and where the pointer meets the lawn.
 *
 * The camera looks from the street back at the house. A wide screen shows the
 * whole yard. A narrow one (a phone held upright) cannot without making every
 * leaf a speck, so it comes in to a narrower span of ground and follows the
 * person with the blower instead.
 *
 * PURE: plain numbers in and out, so the framing is measured under Node.
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** How many meters of ground across the view is fitted to, for a screen of
 *  this aspect (width / height): the narrow span on a phone held upright,
 *  the whole yard from about 4:3 and wider. */
export function spanFor(aspect, C) {
    const t = clamp((aspect - 0.5) / (1.3 - 0.5), 0, 1);
    return C.narrowSpan + (C.wideSpan - C.narrowSpan) * t;
}

/** How far back the camera stands to fit `span` meters across at its
 *  target, given its vertical field of view in degrees. */
export function distanceFor(span, aspect, fovDegrees) {
    const half = Math.atan(Math.tan((fovDegrees * Math.PI) / 360) * aspect);
    return span / 2 / Math.tan(half);
}

/**
 * The camera's position and the point it looks at. `follow` is the person's
 * (x, z): the view slides toward them, as far as keeps the lawn in frame,
 * and a wide view barely moves at all.
 */
export function cameraFor(aspect, C, lawn, follow) {
    const span = spanFor(aspect, C);
    const dist = distanceFor(span, aspect, C.fovDegrees);
    const len = Math.hypot(C.height, C.back);
    const up = C.height / len;
    const back = C.back / len;
    // How far the target may slide before the frame runs off the lawn.
    const slack = Math.max(0, (lawn.maxX - lawn.minX) / 2 - span / 2 + 1);
    const cx = (lawn.minX + lawn.maxX) / 2;
    let tx = C.target.x;
    let tz = C.target.z;
    if (follow) {
        tx = clamp(follow.x, cx - slack, cx + slack);
        // Depth follows gently, and only on the narrow view.
        const narrow = 1 - clamp((aspect - 0.5) / 0.8, 0, 1);
        tz = C.target.z + (follow.z - C.target.z) * 0.5 * narrow;
    }
    return {
        position: { x: tx, y: C.target.y + up * dist, z: tz + back * dist },
        target: { x: tx, y: C.target.y, z: tz },
        span,
        distance: dist
    };
}

/** Where a ray from `origin` along `dir` meets the ground (y = 0), or null if
 *  it points at the sky. */
export function rayToGround(origin, dir) {
    if (dir.y >= -1e-6) return null;
    const t = -origin.y / dir.y;
    return { x: origin.x + dir.x * t, z: origin.z + dir.z * t };
}

/** Ease `from` toward `to` at `rate` per second: a frame-rate independent
 *  follow. */
export function ease(from, to, rate, dt) {
    return to + (from - to) * Math.exp(-rate * dt);
}
