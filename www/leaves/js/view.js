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
 *  this aspect (width / height): the narrow span on a phone held upright
 *  (narrower still on a touch screen, `touchNarrowSpan`), the whole yard
 *  from about 4:3 and wider. */
export function spanFor(aspect, C, touch = false) {
    const t = clamp((aspect - 0.5) / (1.3 - 0.5), 0, 1);
    const narrow = touch && C.touchNarrowSpan !== undefined ? C.touchNarrowSpan : C.narrowSpan;
    return narrow + (C.wideSpan - narrow) * t;
}

/** Whether the frame keeps the street in it (`frontZ`): always, except on a
 *  touch screen held upright, where the person is the picture (Steve's QA,
 *  2026-10-09: "a lot of the street is visible by default, and that isn't
 *  really necessary"). */
export function keepsStreet(aspect, touch = false) {
    return !(touch && aspect < 1);
}

/** How far back the camera stands to fit `span` meters across at its
 *  target, given its vertical field of view in degrees. */
export function distanceFor(span, aspect, fovDegrees) {
    const half = Math.atan(Math.tan((fovDegrees * Math.PI) / 360) * aspect);
    return span / 2 / Math.tan(half);
}

/** How far back the camera must stand, looking at ground depth `tz`, for the
 *  bottom edge of the screen to reach ground depth `frontZ` (toward the
 *  camera). The camera's angle is C.height over C.back. */
export function distanceForFront(frontZ, tz, C) {
    const len = Math.hypot(C.height, C.back);
    const pitch = Math.atan2(C.height, C.back);
    const low = pitch + (C.fovDegrees * Math.PI) / 360;
    // From the target, the bottom edge's ground point moves toward the camera
    // this many meters for every meter the camera stands back.
    const gain = C.back / len - C.height / len / Math.tan(low);
    return gain > 1e-6 ? Math.max(0, (frontZ - tz) / gain) : 0;
}

/** The zoom a visitor may choose, clamped to its range. 1 is the usual
 *  view, more is closer. */
export function clampZoom(zoom, C) {
    const z = Number.isFinite(zoom) ? zoom : 1;
    return clamp(z, C.zoom.min, C.zoom.max);
}

/**
 * The camera's position and the point it looks at. `follow` is the person's
 * (x, z): the view slides toward them, as far as keeps the lawn in frame,
 * and a wide view barely moves, except to keep `C.reach` meters of ground
 * either side of them on screen.
 *
 * `zoom` is the visitor's own (the wheel, a pinch, + and -), 1 for the usual
 * view. A zoomed view is the visitor's choice, so the neighbor coming out no
 * longer widens it (Steve's QA, 2026-10-08: he "really competes for the
 * camera"), and the closer it comes the more it follows them in depth too.
 * `touch`, a touch screen's, lets it come in narrower (`zoom.touchSpan`).
 */
export function cameraFor(aspect, C, lawn, follow, include = null, zoom = 1, touch = false) {
    const zf = C.zoom ? clampZoom(zoom, C) : 1;
    const zoomed = Math.abs(zf - 1) > 1e-6;
    let span = spanFor(aspect, C, touch);
    let region = lawn;
    let focus = follow;
    // SOMEBODY ELSE IN THE SCENE (the neighbor, out on his lawn): the view
    // widens, up to `maxSpan`, and slides to keep them both in frame, and
    // the region it may slide over takes in their side of the fence.
    if (include && follow && !zoomed) {
        const lo = Math.min(follow.x, include.x) - C.includeMargin;
        const hi = Math.max(follow.x, include.x) + C.includeMargin;
        span = clamp(hi - lo, span, C.maxSpan);
        focus = { x: (lo + hi) / 2, z: follow.z };
        region = { minX: lawn.minX, maxX: Math.max(lawn.maxX, hi) };
    }
    const len = Math.hypot(C.height, C.back);
    const up = C.height / len;
    const back = C.back / len;
    let tz = C.target.z;
    if (focus) {
        // Depth follows gently, and only on the narrow view, or a view the
        // visitor has brought in close, which follows fully.
        const narrow = 1 - clamp((aspect - 0.5) / 0.8, 0, 1);
        const close = clamp(zf - 1, 0, 1);
        const share = 0.5 * narrow + (1 - 0.5 * narrow) * close;
        tz = C.target.z + (follow.z - C.target.z) * share;
    }
    // THE WIDTH AND THE DEPTH (Steve's QA, 2026-10-08: on a wide screen "the
    // street isn't visible, and the sidewalk is barely visible"). Fitting
    // the yard's width alone brought a wider screen's camera in closer, so
    // the bottom of the frame crept up the lawn: mid-sidewalk at 16:9, the
    // sidewalk gone at 21:9. So the camera also stands far enough back for
    // the frame to reach `frontZ`, as much of the street as a 4:3 screen
    // shows, and a wide screen shows more of the block either side instead.
    let dist = distanceFor(span, aspect, C.fovDegrees);
    if (C.frontZ !== undefined && keepsStreet(aspect, touch)) dist = Math.max(dist, distanceForFront(C.frontZ, tz, C));
    // AND ALWAYS PAST THE PERSON'S FEET, by `footRoom`: out on the sidewalk's
    // front edge they would stand on the frame's bottom edge (frontZ 9
    // since 2026-10-09), so there the camera eases back a little.
    if (follow && C.footRoom !== undefined) dist = Math.max(dist, distanceForFront(follow.z + C.footRoom, tz, C));
    // In close, never narrower than minSpan (the reach either side of the
    // person, for a mouse to aim past) or a touch screen's touchSpan (the
    // joystick aims no pointer), nor nearer than minDistance (the person's
    // height, top to bottom, on a screen much wider than tall).
    const narrowest = touch && C.zoom.touchSpan !== undefined ? C.zoom.touchSpan : C.zoom.minSpan;
    if (zoomed && zf < 1 && C.zoom.out) {
        // ZOOMED OUT, AS FAR AS IT EVER WENT (Steve's QA, 2026-10-09: "I'm
        // not able to zoom out as far as I used to"). The farthest view is
        // `zoom.out`'s framing (the usual view before the defaults came in
        // closer) times `beyond`, whatever the usual view now is, and the
        // zoom eases there from the usual view, step for step.
        const O = C.zoom.out;
        const far = Math.max(distanceFor(spanFor(aspect, O), aspect, C.fovDegrees), distanceForFront(O.frontZ, tz, C)) * O.beyond;
        const u = Math.log(zf) / Math.log(C.zoom.min);
        dist *= Math.pow(Math.max(1, far / dist), u);
    } else if (zoomed) {
        dist = Math.max(dist / zf, distanceFor(narrowest, aspect, C.fovDegrees), C.zoom.minDistance || 0);
    }
    // The width of ground actually shown at the target.
    const shown = 2 * dist * Math.tan(Math.atan(Math.tan((C.fovDegrees * Math.PI) / 360) * aspect));
    // How far the target may slide before the frame runs off the region.
    const slack = Math.max(0, (region.maxX - region.minX) / 2 - shown / 2 + 1);
    const cx = (region.minX + region.maxX) / 2;
    let tx = C.target.x;
    if (focus) tx = clamp(focus.x, cx - slack, cx + slack);
    // ROOM TO AIM ON EITHER SIDE OF THE PERSON (Steve's M6 QA: he could not
    // walk to the hedge). The span is fitted at the target, but the view
    // narrows toward the camera, so near the front of the lawn the yard's
    // sides were off screen, and a pointer has to aim `standoff` past where
    // the person should stop. So the view slides until the ground `reach`
    // meters either side of the person, at their own depth, is on screen.
    // Nobody walks off the lawn's width, so nor does the slide.
    if (follow && C.reach) {
        const px = clamp(follow.x, lawn.minX, lawn.maxX);
        const depth = dist + back * (tz - follow.z);
        const half = depth * Math.tan((C.fovDegrees * Math.PI) / 360) * aspect;
        if (half > C.reach) tx = clamp(tx, px + C.reach - half, px - C.reach + half);
    }
    return {
        position: { x: tx, y: C.target.y + up * dist, z: tz + back * dist },
        target: { x: tx, y: C.target.y, z: tz },
        span: shown,
        distance: dist
    };
}

/**
 * A view kept out of the trees: if the camera would stand within
 * `margin` of a crown (`{ x, y, z, r }`, a sphere), it eases back along its
 * own line of sight until it is clear, still looking at the same spot. In
 * close at the lawn's back corners the frame's reach toward the street had
 * set it inside the left maple's lower branches (2026-10-09).
 */
export function clearOfCrowns(view, crowns, margin = 0) {
    if (!crowns || !crowns.length) return view;
    const t = view.target;
    const dx = view.position.x - t.x;
    const dy = view.position.y - t.y;
    const dz = view.position.z - t.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-9) return view;
    const at = (d) => ({ x: t.x + (dx / len) * d, y: t.y + (dy / len) * d, z: t.z + (dz / len) * d });
    const inside = (p) => crowns.some((c) => Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) < c.r + margin);
    let d = len;
    for (let i = 0; i < 80 && inside(at(d)); i++) d += 0.25;
    if (d === len) return view;
    return { ...view, position: at(d), distance: view.distance + (d - len) };
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

/** A view (`cameraFor`'s or `cameraOn`'s) swung `angle` radians round its
 *  target, about the upright: the celebration's orbit. */
export function orbitView(view, angle) {
    const dx = view.position.x - view.target.x;
    const dz = view.position.z - view.target.z;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
        ...view,
        position: { x: view.target.x + dx * c + dz * s, y: view.position.y, z: view.target.z - dx * s + dz * c },
        target: { ...view.target }
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
