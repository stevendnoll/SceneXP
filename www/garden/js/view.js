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

// ---- Being shown a tree (pure) ---------------------------------------------

/**
 * How far from a tree the eye should end up, in metres.
 *
 * MEASURED IN THE TREE'S OWN HEIGHTS, NOT IN METRES, which is what makes one
 * number right for a 3 m Japanese Maple and a 14 m Coast Redwood. `frameHeights`
 * is how many of the tree's heights the vertical frame should hold, so a tree
 * lands at the same share of the picture whatever its species.
 *
 * AND IT TAKES THE LENS, because this scene has two. A portrait phone composes
 * at fov 72 rather than 60, so the same distance shows a frame a quarter taller
 * and the tree comes out a quarter smaller in exactly the orientation where the
 * visitor can least afford it. The eye moves a little closer instead.
 */
export function focusDistance(matureHeight, fovDegrees, config = GARDEN_CONFIG) {
    const F = config.camera.focus;
    const half = Math.tan((fovDegrees / 2) * Math.PI / 180);
    const wanted = (matureHeight * F.frameHeights) / (2 * Math.max(1e-3, half));
    return Math.min(F.maxDistance, Math.max(F.minDistance, wanted));
}

/**
 * The dolly that puts the eye about `want` metres from a point in the plot.
 *
 * THE TRACK IS A LINE AND THE TREE IS OFF IT, which is why this is a search
 * rather than a formula. The eye travels along +z at x = 0 and changes height
 * as it goes, so the distance to a tree at (x, z) is not a linear function of
 * the dolly and is not even monotonic in it once the height crosses the tree's.
 * Sixty-four samples of a hypotenuse, once per planting, is not worth being
 * clever about, and a scan cannot be wrong about a shape it does not assume.
 *
 * TWO CLAMPS, AND THE FIRST ONE IS THE IMPORTANT ONE. The near end of the track
 * is z = 6, which is INSIDE the plot, so a tree planted at the front of it can
 * end up BEHIND the eye: the camera looks down -z, and it would be aimed at
 * something over its own shoulder. `clearance` keeps the eye that far in front
 * of the tree, whatever the visitor asked for. `minDolly` is the other end of
 * the promise: there is always a visible move, or the feature has not happened.
 */
export function dollyForDistance(point, composed, want, config = GARDEN_CONFIG) {
    const D = config.camera.dolly;
    const F = config.camera.focus;
    const track = dollyTrackZ(composed.z, config);
    const span = composed.z - track.near;

    let ceiling = F.maxDolly;
    if (span > 1e-6) {
        ceiling = Math.min(ceiling, (composed.z - (point.z + F.clearance)) / span);
    }
    ceiling = Math.max(0, Math.min(1, ceiling));

    let best = 0;
    let bestGap = Infinity;
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
        const t = ceiling * (i / steps);
        const y = composed.y + (D.near.y - composed.y) * t;
        const z = composed.z + (track.near - composed.z) * t;
        const gap = Math.abs(Math.hypot(point.x, y - point.y, z - point.z) - want);
        if (gap < bestGap) { bestGap = gap; best = t; }
    }
    // A floor, but never past the ceiling: a tree at the front of the plot has
    // less room to move in than the floor asks for, and the tree being off
    // screen behind the eye is a worse answer than a short move.
    return Math.max(Math.min(F.minDolly, ceiling), best);
}

// ---- State -----------------------------------------------------------------

let dolly = 0;

/**
 * Where the composed aim currently points, or null for "wherever the dolly
 * says". THE GARDEN OWNS THIS AND THE SHARED PART COMPOSES ON TOP OF IT: the
 * part rotates the direction from the eye to whatever `lookAt` object it was
 * handed, so moving the aim here re-bases the visitor's own yaw and tilt rather
 * than fighting them. Pan left after being shown a tree and you pan left OF THE
 * TREE, which is the behaviour anybody would expect and none of it is code.
 */
let aim = null;

// The move in progress, if any. See focusOn.
let flight = null;

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
    // A VISITOR WHO REACHES FOR THE ZOOM OWNS THE CAMERA FROM THAT MOMENT. The
    // move after planting writes `dolly` every frame, so without this the
    // button would appear dead for a second and then jump.
    flight = null;
    dolly = Math.max(-1, Math.min(1, dolly + delta));
}

// ---- Being shown a tree ----------------------------------------------------

/**
 * Turn to a point in the plot and move in on it.
 *
 * IT IS A COURTESY AND NOT A CUTSCENE, which is the whole of how it behaves.
 * It eases rather than cuts, because a camera that teleports leaves the visitor
 * working out where they are; it is cancelled by the first touch of any control
 * (see `cancelFocus` and `applyDollyDelta`), because a camera that keeps moving
 * after somebody has grabbed it is infuriating; and it arrives instantly under
 * reduced motion, which is `seconds` of zero rather than a special case here.
 *
 * @param {object} point       {x, y, z} to aim at
 * @param {number} targetDolly where to end up on the track
 * @param {number} seconds     0 to arrive at once
 * @param {object} fromAim     the aim it is leaving, which is the composed one
 *                             the first time and wherever it landed after that
 */
export function focusOn(point, targetDolly, seconds, fromAim) {
    const start = aim || fromAim;
    flight = {
        fromAim: { x: start.x, y: start.y, z: start.z },
        toAim: { x: point.x, y: point.y, z: point.z },
        fromDolly: dolly,
        toDolly: Math.max(-1, Math.min(1, targetDolly)),
        elapsed: 0,
        seconds: Math.max(0, seconds)
    };
    // So a zero-second move has already landed when this returns, and so the
    // aim is explicit from the first frame rather than null for one of them.
    stepView(0);
}

/**
 * Advance the move. Returns whether one is running, which is only for tests.
 *
 * ON THE ANIMATION CLOCK, NOT THE CALENDAR. A camera move is animation, so it
 * runs at the rate the visitor's screen does rather than at the rate the garden
 * ages. Nothing here can touch `elapsedSeconds`.
 */
export function stepView(delta) {
    if (!flight) return false;
    flight.elapsed += Math.max(0, delta || 0);
    const k = flight.seconds <= 0 ? 1 : Math.min(1, flight.elapsed / flight.seconds);
    // Smoothstep, so it leaves and arrives without a jolt at either end.
    const s = k * k * (3 - 2 * k);
    const mix = (a, b) => a + (b - a) * s;
    dolly = mix(flight.fromDolly, flight.toDolly);
    aim = {
        x: mix(flight.fromAim.x, flight.toAim.x),
        y: mix(flight.fromAim.y, flight.toAim.y),
        z: mix(flight.fromAim.z, flight.toAim.z)
    };
    if (k >= 1) { flight = null; return false; }
    return true;
}

/**
 * Stop moving, and stay exactly where the move had got to.
 *
 * NOT A SNAP BACK. The visitor interrupted a move toward their new tree, and
 * throwing the camera back to where the move started would be a second
 * unrequested move on top of the one they just refused.
 */
export function cancelFocus() {
    flight = null;
}

/** Whether a move is in progress. */
export function isFocusing() { return flight !== null; }

/** Where the composed aim points, or null for the dolly's own look-at. */
export function getAim() { return aim; }

/** Polled every frame by the part, to dim whichever button has run out. */
export function dollyLimits() {
    return { atIn: dolly >= 1 - 1e-4, atOut: dolly <= -1 + 1e-4 };
}

export function getDolly() { return dolly; }

/** Back to the composed viewpoint. The reset flow puts the whole garden back,
 *  not only its contents: leaving the visitor at the birds-eye end looking
 *  down at an empty plot is not the frame this scene opens on. THE AIM GOES
 *  WITH IT, or a new garden opens pointed at the ground where a tree used to
 *  stand. */
export function resetView() {
    dolly = 0;
    aim = null;
    flight = null;
}
