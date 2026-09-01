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

// ---- The composed viewpoint (pure) -----------------------------------------

/**
 * The composed viewpoint for an aspect ratio.
 *
 * A PORTRAIT FRAME IS ABOUT A THIRD AS WIDE. three.js fov is vertical, so a
 * phone held upright keeps the height and loses both sides. Below an aspect of
 * 1 this widens to the portrait fov and dollies straight back until the
 * composed half-width fits at focusZ. It only ever dollies BACK.
 *
 * IT LIVES HERE RATHER THAN IN main.js, which is where it was written and where
 * the suite still imports it from through a re-export. It is the zero of the
 * dolly track this module owns, `panLimitFor` needs the lens it returns, and
 * nothing in it ever touched THREE: in main.js a pure test of the framing had
 * to stand up a stubbed renderer to reach it.
 */
export function framingFor(aspect, cam = GARDEN_CONFIG.camera) {
    const portrait = cam.portrait || {};
    let fov = cam.fov;
    let z = cam.position.z;

    if (aspect < 1 && portrait.minHalfWidth) {
        fov = portrait.fov || fov;
        const halfFovRad = (fov / 2) * Math.PI / 180;
        const needed = portrait.focusZ + portrait.minHalfWidth / (Math.tan(halfFovRad) * aspect);
        z = Math.max(z, needed);
    }

    return { fov, z };
}

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

/**
 * How far the visitor may look to either side, for a dolly and a frame.
 *
 * ---- THE CLAMP MOVES BECAUSE THE EYE DOES, AND BECAUSE THE FRAME DOES ----
 *
 * The shared part sets its yaw limit once, which is correct for a scene whose
 * camera never moves. This one's zoom is a dolly, so the plot subtends 35
 * degrees from the composed viewpoint and 108 from the near end of the track,
 * and one number is generous at one end and confining at the other.
 *
 * THE FIRST VERSION FIXED ONLY HALF OF THAT AND QA CAUGHT THE REST: it grew
 * with the dolly and knew nothing about the LENS. A portrait phone composes at
 * fov 72 on a narrow window, which is 18.7 degrees of frame either side of the
 * aim against a 16:9 desktop's 45.7. The same limit therefore lands the plot's
 * front corner comfortably in frame on a desktop and clean OFF it on a phone
 * past a dolly of 0.7, from the same code. "Works perfectly on a desktop, still
 * not able to pan far enough on a phone" is what a lens-blind rule feels like.
 *
 * So there are two terms and the larger wins, because they are answers to two
 * different questions:
 *
 *   `withDolly`  a predictable, lens-blind growth toward `maxAngleNear`. It is
 *                what a WIDE frame wants: the corner is already in view there,
 *                and this is about being able to CENTRE it comfortably.
 *   `withLens`   enough turn to hold the far corner `cornerAt` of the way out
 *                in whatever frame this device actually has. It is what a
 *                NARROW frame needs, and it is what was missing.
 *
 * IT STILL STOPS SHORT OF A FREE LOOK. The corner is held inside the frame, not
 * dragged to the middle of it, so at the near end (where the eye is at z = 6
 * and a corner tree at z = 9 is BEHIND it) the visitor can see their whole plot
 * without the camera becoming something that turns all the way around.
 *
 * Only the way IN widens it: pulling out past the composed viewpoint is already
 * the widest useful view of the plot.
 *
 * @param {number} dolly
 * @param {object} frame  { halfWidth } radians from the aim to the frame's
 *                        side, { composed } the dolly's zero, and { corner }
 *                        from terrain's `plantingReach`. All optional: without
 *                        them only the dolly term applies, which is what the
 *                        pure tests of that term want.
 */
export function panLimitFor(dolly, frame = {}, config = GARDEN_CONFIG) {
    const P = config.camera.portrait.pan;
    const t = Math.max(0, Math.min(1, dolly || 0));
    const withDolly = P.maxAngle + (P.maxAngleNear - P.maxAngle) * t;

    const { halfWidth, composed, corner } = frame;
    if (!Number.isFinite(halfWidth) || !composed || !corner) {
        return Math.max(P.maxAngle, withDolly);
    }
    // How far off the axis the eye would have to look to put the plot's front
    // corner dead centre from where the dolly has put it.
    const need = Math.atan2(corner.x, dollyView(t, composed, config).z - corner.z);
    const withLens = need - halfWidth * P.cornerAt;
    // A QUARTER TURN IS THE MOST, EVER. Both rules above chase the far corner,
    // and once the eye can travel past the front row that corner is BEHIND it:
    // `need` goes over 90 degrees and keeps climbing, so an uncapped rule would
    // quietly turn the pan into a free look. See `maxAngleCap`.
    return Math.min(P.maxAngleCap, Math.max(P.maxAngle, withDolly, withLens));
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

// Where the dolly was when the last move ENDED, landed or interrupted. It is
// what the aim's grip on its tree is measured against. See `focusHold`.
let focusDolly = 0;

/** End the move in progress and remember where it left the dolly. */
function landFocus() {
    if (flight) focusDolly = dolly;
    flight = null;
}

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
    landFocus();
    dolly = Math.max(-1, Math.min(1, dolly + delta));
}

/**
 * How firmly the aim is still holding its tree, 1 to 0.
 *
 * ---- PULLING BACK IS ALSO ASKING TO SEE THE WHOLE GARDEN ----
 *
 * Without this the aim never lets go. `resetView` had exactly one caller,
 * `applyReset`, which is "start a new garden", so once a tree had been planted
 * the ONLY route back to the composed wide shot was deleting the plot. The
 * dolly still zoomed, along an axis that was no longer pointed at the garden.
 *
 * The release rides the dolly rather than a control of its own, because the
 * dolly ALREADY owns part of the aim: `dollyView` moves `lookY` and `lookZ`
 * across the track. This extends the same idea to the focus. Measured from
 * where the move actually landed, so "back to where the scene put me" is the
 * point at which the tree is fully let go, whichever tree it was.
 *
 * SMOOTHSTEPPED, because the alternative is that every small zoom-out also
 * swings the aim a little and the zoom button quietly does two things. With a
 * zero slope at the top a 14 percent pull back moves the aim by 6, which reads
 * as the frame opening up rather than as the camera turning.
 *
 * The floor under `focusDolly` is the same `minDolly` a full-strength move is
 * promised, so a move that was interrupted early cannot divide by nearly zero
 * and cannot release faster than a completed one would.
 */
function focusHold(config = GARDEN_CONFIG) {
    const F = config.camera.focus;
    const t = Math.max(0, Math.min(1, dolly / Math.max(focusDolly, F.minDolly)));
    return t * t * (3 - 2 * t);
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
    if (!flight) {
        // ---- AND THE AIM LETS GO WHEN IT HAS BEEN PULLED ALL THE WAY BACK --
        // Released for good rather than held at zero, so zooming in again is a
        // plain dolly toward whatever is in front of the visitor and not a
        // rubber band back to a tree they finished looking at. This is the one
        // thing that clears an aim without a reset.
        //
        // Measured on the DOLLY rather than on `focusHold`, and that is not a
        // detail: a move interrupted in its first millisecond leaves the dolly
        // at 2e-8, which is a hold of 2e-14, which is visually nothing and is
        // not zero, so a strict test would hold an invisible aim forever. The
        // deadband is the same one the "show the whole garden" control uses to
        // decide it has nothing to do, so the two cannot disagree about where
        // the composed viewpoint is.
        if (aim && dolly <= GARDEN_CONFIG.camera.focus.composedEpsilon) aim = null;
        return false;
    }
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
    if (k >= 1) { landFocus(); return false; }
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
    landFocus();
}

/** Whether a move is in progress. */
export function isFocusing() { return flight !== null; }

/** The raw focus point, before the dolly's release is applied. For tests and
 *  for asking "is the camera on a tree at all". */
export function getAim() { return aim; }

/**
 * What `camera.lookAt` should actually be given this frame.
 *
 * THE ONE STATEMENT OF THE AIM, so the release cannot be applied in one place
 * and forgotten in another. A move in progress owns the aim outright: it is
 * writing both the aim and the dolly, and letting the release read a dolly the
 * move is still moving would fight it.
 */
export function aimTarget(composedAim) {
    if (!aim) return composedAim;
    if (flight) return aim;
    const hold = focusHold();
    const mix = (a, b) => a + (b - a) * hold;
    return {
        x: mix(composedAim.x, aim.x),
        y: mix(composedAim.y, aim.y),
        z: mix(composedAim.z, aim.z)
    };
}

/**
 * Whether the view is the one the scene opens on.
 *
 * What the "show the whole garden" control keys its visibility off, and it asks
 * about all THREE things that can move the view: this module's dolly and aim,
 * and the shared part's own yaw and tilt, which are passed in because they
 * belong to the part rather than here. A control that appeared while any one of
 * them was still off would be a button that does nothing.
 */
export function viewIsComposed(panAngle = 0, tilt = 0, config = GARDEN_CONFIG) {
    const F = config.camera.focus;
    return Math.abs(dolly) <= F.composedEpsilon
        && aim === null && flight === null
        && Math.abs(panAngle) <= F.composedEpsilon
        && Math.abs(tilt) <= F.composedEpsilon;
}

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
    focusDolly = 0;
}
