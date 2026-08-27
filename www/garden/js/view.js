// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * view.js - Where the visitor is standing.
 *
 * THE ZOOM IN THIS SCENE IS A MOVE, NOT A LENS. The shared pan part offers a
 * binocular zoom, and from a fixed eye 22 m back that is a crop: a bigger
 * picture of the same view, with no parallax and no sense of being anywhere
 * else. What QA asked for was to get in amongst the trees or up above the
 * plot, and both of those are positions. So the part's `zoomDelegate` seam
 * hands us the signed deltas from its buttons, its keys, the pinch and the
 * wheel, and we spend them on a dolly track instead. The field of view is
 * never touched.
 *
 * THIS MODULE OWNS THE POSITION AND NOTHING ELSE. Yaw and tilt belong to the
 * shared part, which is where they were always meant to live: it applies them
 * by rotating the aim direction, so they compose with wherever the dolly has
 * put the eye, and one axis means the buttons, the keys and the drag can never
 * disagree about which way the visitor is looking. An earlier pass had the
 * garden keeping a second tilt of its own, and the tell was that W and S moved
 * the view without lighting the buttons that did the same thing.
 *
 * The rules are pure functions of plain numbers, which is what lets the track
 * be asserted without a camera. `dollyView` is the one statement of where the
 * eye may be, and `forest.js` reads its ends through `dollyTrackZ` so the
 * wood's camera keep-out cannot disagree with it.
 */

import { GARDEN_CONFIG } from './config.min.js';

// ---- The track (pure) ------------------------------------------------------

/**
 * The two ends of the track the eye can travel, along +z at x = 0.
 *
 * Exported because `forest.js` needs it and the alternative is two modules each
 * writing down where the camera goes. The composed z is passed in rather than
 * read, because it depends on the aspect and the pure layer has no window.
 */
export function dollyTrackZ(composedZ, config = GARDEN_CONFIG) {
    const D = config.camera.dolly;
    return {
        near: Math.min(D.near.z, composedZ),
        far: Math.max(D.far.z, composedZ)
    };
}

/**
 * Where the eye is and what it is aimed at, for a dolly parameter.
 *
 * @param {number} dolly    -1 (up and back) to +1 (in among the trees), 0 composed
 * @param {object} composed {z, y, lookY, lookZ} from the composed viewpoint
 * @returns {object} {z, y, lookY, lookZ}
 *
 * BOTH ENDS ARE CLAMPED AGAINST THE COMPOSED VIEWPOINT rather than trusted.
 * `framingFor` dollies a portrait phone back on its own, far enough on a tall
 * window that it composes past the far end, and an unclamped "out" would then
 * move the camera FORWARD when the visitor asked it to retreat.
 */
export function dollyView(dolly, composed, config = GARDEN_CONFIG) {
    const D = config.camera.dolly;
    const t = Math.max(-1, Math.min(1, dolly || 0));
    const track = dollyTrackZ(composed.z, config);
    const end = t >= 0
        ? { z: track.near, y: D.near.y, lookY: D.near.lookY, lookZ: D.near.lookZ }
        : { z: track.far, y: D.far.y, lookY: D.far.lookY, lookZ: D.far.lookZ };
    const k = Math.abs(t);
    const mix = (a, b) => a + (b - a) * k;
    return {
        z: mix(composed.z, end.z),
        y: mix(composed.y, end.y),
        lookY: mix(composed.lookY, end.lookY),
        lookZ: mix(composed.lookZ, end.lookZ)
    };
}

// ---- State -----------------------------------------------------------------

let dolly = 0;

/**
 * Signed deltas from the shared part: buttons and keys stream `zoom.speed`
 * units a second, a pinch sends log2 of the spread, and a wheel notch sends
 * `zoom.wheel`. Positive is always in.
 */
export function applyDollyDelta(delta) {
    // A pinch of zero spread is log2(0), which is -Infinity, and one bad frame
    // of it would strand the camera somewhere it could never be steered back
    // from. NaN is the same story through a different door.
    if (!(delta === delta)) return;
    dolly = Math.max(-1, Math.min(1, dolly + delta));
}

/** Polled every frame by the part, to dim whichever button has run out. */
export function dollyLimits() {
    return { atIn: dolly >= 1 - 1e-4, atOut: dolly <= -1 + 1e-4 };
}

export function getDolly() { return dolly; }

/** Back to the composed viewpoint. The reset flow puts the whole garden back,
 *  not only its contents: leaving the visitor at the birds-eye end looking
 *  down at an empty plot is not the frame this scene opens on. */
export function resetView() {
    dolly = 0;
}
