// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * view.js - Where the visitor is standing, and which way they are looking.
 *
 * THE ZOOM IN THIS SCENE IS A MOVE, NOT A LENS. The shared pan part offers a
 * binocular zoom, and from a fixed eye 22 m back that is a crop: a bigger
 * picture of the same view, with no parallax and no sense of being anywhere
 * else. What QA asked for was to get in amongst the trees or up above the
 * plot, and both of those are positions. So the part's `zoomDelegate` seam
 * hands us the signed deltas from its buttons, its keys and the pinch, and we
 * spend them on a dolly track instead. The field of view is never touched.
 *
 * The rules are pure functions of plain numbers, which is what lets the track
 * be asserted without a camera. `dollyView` in particular is the one statement
 * of where the eye may be, and `forest.js` reads its ends through
 * `dollyTrackZ` so the wood's camera keep-out cannot disagree with it.
 *
 * TILT IS OURS TOO, and that is a smaller story with a sharper cause. The
 * shared part's on-canvas gestures return early on `pointerType === 'mouse'`,
 * so a desktop mouse drag does nothing at all, and the only tilt on that
 * machine is the W and S keys, which nothing tells the visitor about. The part
 * builds four buttons in a fixed order and offers no way to add a fifth, so
 * this module builds the two it is missing and moves the zoom pair out to its
 * own corner. It REPARENTS the part's buttons rather than rebuilding them:
 * listeners travel with a node, so the pinch, the holds and the keys all keep
 * working, and removing the pair from the part's options would have silently
 * killed the pinch (`applyGesturePinch` returns early when neither zoom button
 * exists).
 */

import { GARDEN_CONFIG } from './config.min.js';
import { clamp01 } from './clock.min.js';

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

/**
 * The aim height for a tilt, in radians, positive looking up.
 *
 * A TILT IS AN ANGLE AND NOT AN OFFSET. Raising the target by a fixed metre
 * would swing the view wildly at the close end of the track and barely move it
 * at the far end, because the same rise is a different angle at a different
 * range. Scaling by the horizontal distance to the target makes the button
 * mean the same thing everywhere on the track.
 */
export function tiltedLookY(view, tilt) {
    const reach = Math.abs(view.z - view.lookZ);
    if (!(reach > 0) || !tilt) return view.lookY;
    // ROTATE THE AIM, do not offset it. Adding `tan(tilt) * reach` to the
    // target looks like the same thing and is not: it is a shift in tangent
    // space, so the angle it actually swings depends on where the aim already
    // pointed. The composed view is pitched about 10 degrees down, and a 0.32
    // radian button moved it 0.30 at one end of the track and 0.33 at the
    // other. Going through the angle makes the button mean 0.32 everywhere.
    const base = Math.atan2(view.lookY - view.y, reach);
    const aimed = Math.max(-1.4, Math.min(1.4, base + tilt));
    return view.y + Math.tan(aimed) * reach;
}

// ---- State -----------------------------------------------------------------

let dolly = 0;
let tilt = 0;
let holdTilt = 0;
let upBtn = null;
let downBtn = null;
let container = null;
let firstUse = null;
const used = new Set();

/** Signed deltas from the shared part: buttons and keys stream `zoom.speed`
 *  units a second, a pinch sends log2 of the spread. Positive is always in. */
export function applyDollyDelta(delta) {
    if (!(delta === delta)) return;      // a NaN would strand the camera
    dolly = Math.max(-1, Math.min(1, dolly + delta));
    note('zoom');
}

/** Polled every frame by the part, to dim whichever button has run out. */
export function dollyLimits() {
    return { atIn: dolly >= 1 - 1e-4, atOut: dolly <= -1 + 1e-4 };
}

export function getDolly() { return dolly; }
export function getTilt() { return tilt; }

/** Reset to the composed viewpoint. Used by the reset flow, which puts the
 *  whole garden back rather than only its contents. */
export function resetView() {
    dolly = 0;
    tilt = 0;
    holdTilt = 0;
}

function note(kind) {
    if (!firstUse || used.has(kind)) return;
    used.add(kind);
    firstUse(kind);
}

// ---- The buttons -----------------------------------------------------------

// The same chevrons the shared part draws for left and right, turned a quarter
// turn, so the four look controls are plainly one set rather than two.
const UP_PATH = 'M6 14.5l6-6 6 6';
const DOWN_PATH = 'M6 9.5l6 6 6-6';

function holdButton(label, svgPath, dir, signal) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pan-btn';
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${svgPath}"/></svg>`;
    btn.setAttribute('aria-label', label);

    const start = () => { holdTilt = dir; btn.classList.add('held'); note('tilt'); };
    const stop = () => { if (holdTilt === dir) holdTilt = 0; btn.classList.remove('held'); };

    btn.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        // Pointer capture keeps the release reliable when a thumb slides off
        // the circle mid-press, which is the same reason the shared part does
        // it and the same bug if it is left out.
        if (btn.setPointerCapture) {
            try { btn.setPointerCapture(event.pointerId); } catch (e) { /* stale id */ }
        }
        start();
    }, { signal });
    ['pointerup', 'pointercancel'].forEach((type) =>
        btn.addEventListener(type, stop, { signal }));
    btn.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
    btn.addEventListener('keydown', (event) => {
        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); start(); }
    }, { signal });
    btn.addEventListener('keyup', (event) => {
        if (event.key === ' ' || event.key === 'Enter') stop();
    }, { signal });
    // A button that keeps tilting after it has lost focus is a stuck control.
    btn.addEventListener('blur', stop, { signal });
    return btn;
}

/**
 * Build the tilt pair and move the zoom pair out to its own corner.
 *
 * Call AFTER `initPortraitControls`, which is what creates the row this reads.
 * The order it builds is documented at the top of `pan-1.0.0.js`:
 *
 *     [pan left] [zoom out] [zoom in] [pan right]
 *
 * so the two in the middle are the zoom, and the tilt buttons go where they
 * were. Nothing here rebuilds a button: the pair is reparented, and every
 * listener the part attached travels with the node.
 */
export function initViewControls(options = {}) {
    const signal = options.signal;
    firstUse = typeof options.onFirstUse === 'function' ? options.onFirstUse : null;
    used.clear();
    resetView();

    const row = document.querySelector('.pan-controls');
    if (!row) return null;

    upBtn = holdButton('Look up', UP_PATH, 1, signal);
    downBtn = holdButton('Look down', DOWN_PATH, -1, signal);

    const buttons = Array.from(row.children);
    // Two of the four are the zoom pair. If the shared part ever changes its
    // row, this finds nothing and the scene keeps its four original buttons
    // rather than losing the zoom to a silent reparent into nowhere.
    const zoom = buttons.slice(1, 3);
    const panRight = buttons[3];

    if (zoom.length === 2 && panRight) {
        container = document.createElement('div');
        container.className = 'ui-float garden-zoom visible';
        container.setAttribute('role', 'group');
        container.setAttribute('aria-label', 'Move closer or further away');
        // REVERSED, because the part builds them for a horizontal row: minus
        // then plus, reading left to right. Stacked vertically that puts the
        // minus on top, and every map application in the world puts the plus
        // there. Up means closer, down means further, and the buttons agree
        // with the direction they move the eye.
        for (const btn of zoom.slice().reverse()) container.appendChild(btn);
        document.body.appendChild(container);
        row.insertBefore(upBtn, panRight);
        row.insertBefore(downBtn, panRight);
    } else {
        row.appendChild(upBtn);
        row.appendChild(downBtn);
    }
    return { upBtn, downBtn, container };
}

/** Advance the held tilt. Called once a frame, before the camera is placed. */
export function updateViewControls(deltaTime) {
    const D = GARDEN_CONFIG.camera.dolly;
    if (holdTilt !== 0 && deltaTime > 0) {
        tilt = Math.max(-D.maxTilt, Math.min(D.maxTilt, tilt + holdTilt * D.tiltSpeed * deltaTime));
    }
    if (upBtn) upBtn.classList.toggle('at-limit', tilt >= D.maxTilt - 1e-4);
    if (downBtn) downBtn.classList.toggle('at-limit', tilt <= -D.maxTilt + 1e-4);
}

export function disposeViewControls() {
    if (container && container.parentNode) container.parentNode.removeChild(container);
    for (const btn of [upBtn, downBtn]) {
        if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
    }
    upBtn = null;
    downBtn = null;
    container = null;
    firstUse = null;
    used.clear();
    resetView();
}

// Kept so the tests can drive a hold without a pointer event.
export const __test__ = {
    setHold(dir) { holdTilt = dir; },
    holding() { return holdTilt; },
    clamp01
};
