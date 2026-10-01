// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * view.js - Turning the galaxy: the camera's orbit, as pure functions.
 *
 * The visitor turns the view rather than the galaxy itself. The camera rides
 * a sphere around the core: `azimuth` goes around the disk, and `elevation`
 * tilts from edge-on (0) toward straight above (+) or straight below (-). A
 * drag or the arrow keys move both, a little momentum carries a flick on
 * after the finger lifts, and a slow drift keeps the galaxy alive when nobody
 * is touching it (off for reduced motion).
 *
 * Elevation stops short of the poles. Looking straight down the axis, "up"
 * for the camera is undefined and three's lookAt would spin the picture
 * around as it passed through, which reads as the galaxy flipping over.
 *
 * Nothing here touches THREE or the DOM, so the suite measures it directly.
 */

/** Hold an elevation inside the configured range. */
export function clampElevation(elevation, view) {
    return Math.min(view.elevationMax, Math.max(view.elevationMin, elevation));
}

/**
 * Turn the view by a drag of (dx, dy) CSS pixels. Dragging right turns the
 * galaxy right (the camera goes left), and dragging down tilts the top of
 * the galaxy toward the visitor (the camera rises), the way a hand on a
 * globe would move it. Returns the new { azimuth, elevation }.
 */
export function dragView(orbit, dx, dy, view) {
    return {
        azimuth: orbit.azimuth - dx * view.dragSpeed,
        elevation: clampElevation(orbit.elevation + dy * view.dragSpeed, view)
    };
}

/**
 * One frame of the camera's own motion. While a drag is held, the drag moves
 * the view and nothing else does. Afterwards the flick's spin (`spin`, in
 * radians per second, on each axis) decays at `view.glide` per second, and
 * the slow drift adds on top unless reduced motion is asked for.
 * Returns { azimuth, elevation, spin }.
 */
export function stepView(orbit, spin, dt, view, { held = false, reducedMotion = false } = {}) {
    if (held) return { azimuth: orbit.azimuth, elevation: orbit.elevation, spin };
    const keep = Math.exp(-view.glide * dt);
    const next = { azimuth: spin.azimuth * keep, elevation: spin.elevation * keep };
    const drift = reducedMotion ? 0 : view.drift;
    return {
        azimuth: orbit.azimuth + (next.azimuth + drift) * dt,
        elevation: clampElevation(orbit.elevation + next.elevation * dt, view),
        spin: next
    };
}

/**
 * How far back the camera stands so the whole disk fits the frame. A wide
 * screen keeps the configured distance, and an upright phone backs away
 * until the disk's width fits (three's field of view is vertical, so a
 * narrow frame loses the sides first). Seen from high above, the disk is as
 * deep as it is wide, so its height has to fit too.
 */
export function fitDistance(aspect, camera, radius, elevation) {
    const half = Math.tan((camera.fov * Math.PI / 180) / 2);
    const across = radius * camera.fitMargin / (half * aspect);
    const tall = radius * Math.abs(Math.sin(elevation)) * camera.fitMargin / half;
    return Math.max(camera.distance, across, tall);
}

/** The camera's position on its sphere around the core. */
export function cameraPosition(azimuth, elevation, distance) {
    const flat = distance * Math.cos(elevation);
    return {
        x: flat * Math.cos(azimuth),
        y: distance * Math.sin(elevation),
        z: flat * Math.sin(azimuth)
    };
}
