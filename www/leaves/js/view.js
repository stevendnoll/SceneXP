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
export function cameraFor(aspect, C, lawn, follow, include = null) {
    let span = spanFor(aspect, C);
    let region = lawn;
    let focus = follow;
    // SOMEBODY ELSE IN THE SCENE (the neighbor, out on his lawn): the view
    // widens, up to `maxSpan`, and slides to keep them both in frame, and
    // the region it may slide over takes in their side of the fence.
    if (include && follow) {
        const lo = Math.min(follow.x, include.x) - C.includeMargin;
        const hi = Math.max(follow.x, include.x) + C.includeMargin;
        span = clamp(hi - lo, span, C.maxSpan);
        focus = { x: (lo + hi) / 2, z: follow.z };
        region = { minX: lawn.minX, maxX: Math.max(lawn.maxX, hi) };
    }
    const dist = distanceFor(span, aspect, C.fovDegrees);
    const len = Math.hypot(C.height, C.back);
    const up = C.height / len;
    const back = C.back / len;
    // How far the target may slide before the frame runs off the region.
    const slack = Math.max(0, (region.maxX - region.minX) / 2 - span / 2 + 1);
    const cx = (region.minX + region.maxX) / 2;
    let tx = C.target.x;
    let tz = C.target.z;
    if (focus) {
        tx = clamp(focus.x, cx - slack, cx + slack);
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

/** The camera's usual angle, looking straight at `point` from far enough
 *  back to fit `span` meters across: the finale's view of the pile. */
export function cameraOn(point, aspect, C, span) {
    const dist = distanceFor(span, aspect, C.fovDegrees);
    const len = Math.hypot(C.height, C.back);
    return {
        position: { x: point.x, y: C.target.y + (C.height / len) * dist, z: point.z + (C.back / len) * dist },
        target: { x: point.x, y: C.target.y, z: point.z },
        span,
        distance: dist
    };
}

/**
 * The character card's view (M4): in close on the person at `point`, a
 * little above eye level, from the street side, far enough back that a body
 * `tall` meters high fills `share` of the part of the screen left visible
 * beside the card. `fit` is that part: { width, height } as shares of the
 * screen (the panel takes the right of a wide screen, and the bottom of a
 * narrow one).
 */
export function cameraCast(point, aspect, C, fit, tall = 2.2) {
    const tan = Math.tan((C.fovDegrees * Math.PI) / 360);
    const byHeight = tall / fit.height / (2 * tan);
    const byWidth = 1.4 / fit.width / (2 * tan * aspect);
    const dist = Math.max(byHeight, byWidth);
    const up = 0.3;
    const len = Math.hypot(up, 1);
    const target = { x: point.x, y: 0.95, z: point.z };
    return {
        position: { x: target.x, y: target.y + (up / len) * dist, z: target.z + dist / len },
        target,
        distance: dist
    };
}

/** How much of the screen the character card leaves visible, and how far to
 *  shift the view so the person sits in the middle of it: a panel 412 pixels
 *  wide down the right of a wide screen, a sheet over the bottom 56% of a
 *  narrow one (experience.css). Shifts are in pixels, for setViewOffset. */
export function castFrame(width, height) {
    if (width >= 720) {
        const panel = Math.min(380, width - 32) + 32;
        return { width: (width - panel) / width, height: 1, shiftX: panel / 2, shiftY: 0 };
    }
    return { width: 1, height: 0.44, shiftX: 0, shiftY: height * 0.28 };
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
