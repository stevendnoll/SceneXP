// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * pan.js - Portrait view controls for view-only experiences (shared part)
 *
 * The passive "living diorama" experiences (gavin, jamar) compose their
 * one fixed viewpoint for a landscape frame. On a portrait phone each
 * experience's placeCamera already widens the FOV and dollies the camera
 * back, but the sides of the composition still get cropped. This part
 * adds the missing piece: a row of floating buttons at the bottom center
 * of the screen, shown only in portrait orientation, that let the
 * visitor gently look around without walking anywhere:
 *
 *   [pan left]  [zoom out]  [zoom in]  [pan right]
 *
 * The pan arrows yaw the camera left and right around its fixed
 * position, clamped to ±maxAngle from the composed view. The zoom
 * buttons narrow and widen the camera FOV (binocular-style, the camera
 * never moves, so there is nothing to collide with), clamped to
 * [baseFov - maxIn, baseFov + maxOut]. The zoom pair only renders when
 * zoom options are provided, so a pan-only experience stays two arrows.
 *
 * `tiltButtons: true` adds a look-up and look-down pair, giving the full
 * row [◀] [▲] [▼] [−] [+] [▶]. Without it the tilt axis is still there,
 * on W/S and Shift+arrows, and simply has no buttons, which is how every
 * scene worked before the option existed. `zoomContainerClass` moves the
 * zoom pair into its own `.ui-float` group with that class, stacked with
 * ZOOM IN ON TOP, for a scene that wants the look controls together and
 * the lens somewhere else. Both default off, so an experience that asks
 * for neither gets exactly the row it always had.
 *
 * The part builds its own DOM: a `.ui-float.pan-controls` container, so
 * the experience's load fade-in reveals it alongside the other floats,
 * while a CSS orientation media query (www/shared/css/styles-1.0.0.css) keeps it
 * hidden at every landscape aspect. Press and hold a button by pointer,
 * hold Space/Enter on the focused button, or hold the keys anywhere
 * while in portrait: Left/Right or A/D pan, and plus/minus zoom.
 *
 * EVERY KEY DOES WHAT THE BUTTON UNDER THE SAME GLYPH DOES, which is
 * why the zoom moved off the arrows: a scene with `tiltButtons` draws an
 * up arrow, a down arrow, a plus and a minus, and answering the arrow
 * KEYS with the plus and minus BUTTONS is not guessable. The plain
 * arrows now follow whichever arrows are on screen, so they tilt where
 * tilt buttons exist and keep the zoom where they do not. The tilt also
 * always has W/S, and Shift+Up/Down for arrow-key visitors in a scene
 * that draws no tilt pair, held at the pan speed. Together that puts the
 * full WASD square on the view. Rotating the
 * phone back to landscape resets every control so the composed frame
 * returns exactly as designed.
 *
 * Drag and wheel: when the experience passes its renderer canvas as
 * `surface`, the offsets also answer direct pointer input. A one finger
 * or one MOUSE BUTTON drag moves the view so the scene follows the
 * pointer, scaled to the current lens: horizontal drags yaw (a
 * full-width sweep is about one frame), and vertical drags TILT the
 * camera up and down, clamped to ±pan.maxTilt radians from the composed
 * aim (maxTilt: 0 turns the tilt off). The mouse takes the same path as
 * the finger, on the same axes and the same clamps, because a desktop
 * visitor needs to look around exactly as much as a phone does. Only the
 * primary button drags, and a plain click travels under the tap slop so
 * it is never claimed.
 *
 * The wheel zooms, scroll up for in, through the same path a pinch takes
 * (so a `zoomDelegate` needs no wheel-specific code). `zoom.wheel` is how
 * many doublings one notch buys. `deltaMode` is honored, so a trackpad's
 * small continuous deltas and Firefox's line-mode deltas both behave, and
 * a single fling event is capped rather than crossing the whole travel.
 *
 * A two finger pinch rescales the FOV in tan space so the framed content
 * tracks the finger spread, and the pinch centroid keeps panning both
 * axes. The same clamps, limit dimming, gating, and orientation resets
 * apply, so no gesture can reach a view the buttons cannot. A drag or
 * pinch claims the sequence: the experience's own tap handlers on
 * the same canvas should ask gestureClaimedTap() and let that tap pass
 * (pointer events fire before the touch events they spawn, so the claim
 * is always in place by the time click or touchend handlers run). The
 * surface also gets touch-action: none plus a canceled touchstart, so
 * Safari's double-tap smart zoom and tap-adjacent text selection never
 * start from the scene (tap handlers must use touchend, not click:
 * canceling touchstart stops the synthetic click on touch devices).
 *
 * Usage (from a view-only main.js):
 *
 *   initPortraitControls({
 *       getCamera,                           // from scene-<x.y.z>.min.js
 *       lookAt: CONFIG.camera.lookAt,        // the composed focus point
 *       baseFov: CONFIG.camera.portrait.fov, // required for zoom
 *       pan: CONFIG.camera.portrait.pan,     // { speed, maxAngle, maxTilt }
 *       zoom: CONFIG.camera.portrait.zoom,   // { speed, maxIn, maxOut, wheel? }
 *       tiltButtons: true,                   // optional: add [▲] [▼] to the row
 *       zoomContainerClass: 'my-zoom',       // optional: zoom pair in its own
 *                                            // .ui-float group, in on top
 *       zoomDelegate: {                      // optional: the experience owns
 *           onDelta(d) { ... },              // what zooming MEANS. All zoom
 *           limits() { return { atIn, atOut }; }  // inputs (buttons, keys,
 *       },                                   // pinch) arrive as signed deltas
 *                                            // and the FOV is never touched;
 *                                            // see "Zoom delegation" below
 *       surface: canvas,                     // optional: swipe/pinch gestures here
 *       alwaysOn: true,                      // optional: controls at EVERY aspect,
 *                                            // not just portrait (pair with the
 *                                            // 'always-on' extraClass so the CSS
 *                                            // shows the row in landscape too)
 *       landscapeFov: CONFIG.camera.fov,     // zoom anchor while landscape
 *                                            // (required for landscape zoom
 *                                            // when alwaysOn is set)
 *       extraClass: 'my-variant',            // optional extra class on the container
 *       onFirstUse: (kind) => track(`portrait-${kind}`),  // optional, once per kind:
 *                                            // 'pan' | 'zoom' (buttons/keys),
 *                                            // 'tilt' (keys and buttons),
 *                                            // 'swipe' | 'pinch' (drag/pinch),
 *                                            // 'wheel'
 *       signal                               // optional AbortSignal for teardown
 *   });
 *   // then, each frame of the render loop:
 *   updatePortraitControls(deltaTime);
 *
 * Default mode is portrait-only as described above. With alwaysOn, the
 * inputs work at every aspect and the zoom anchors to landscapeFov
 * whenever the frame is landscape (placeCamera composes a different FOV
 * per orientation, so the anchor must follow it). Offsets still drop on
 * every orientation flip, so each composed frame starts as designed.
 *
 * The camera's position is left alone (placeCamera owns it); this part
 * only re-aims and re-lenses. While panned or zoomed it re-applies its
 * offsets every frame, so a resize that re-derives the base viewpoint
 * mid-gesture is corrected on the very next frame. When both offsets are
 * centered it never touches the camera at all.
 *
 * Zoom delegation: an experience whose zoom is not a lens (mandelbrot's
 * infinite fractal dive) passes zoomDelegate. The zoom pair still
 * renders and every zoom input still works, but instead of offsetting
 * the FOV the part forwards signed deltas to onDelta: buttons and keys
 * send zoom.speed * dt per frame while held (so zoom.speed's units are
 * whatever the experience counts in, e.g. doublings per second), and a
 * pinch sends log2 of the spread factor (one full finger-spread
 * doubling = 1.0). Positive always means "in". The optional limits()
 * is polled each frame to dim the buttons at the experience's own
 * travel ends. The FOV, its clamps, and the restore-once path are all
 * bypassed, and an orientation flip resets the aim offsets as usual
 * but never the delegate's state: depth is world state, not a view
 * offset. Pan and tilt are unaffected.
 */

// Effective settings, installed by initPortraitControls.
let _getCamera = null;
let _lookAt = null;         // {x, y, z} composed focus point from the config
let _panSpeed = 0.4;        // radians per second while a pan arrow is held
let _maxAngle = 0.5;        // pan clamp, radians each way (0 disables the yaw)
let _maxTilt = 0.3;         // swipe tilt clamp, radians up or down (0 disables)
let _baseFov = 0;           // the composed portrait FOV (degrees), anchor for zoom
let _zoomSpeed = 18;        // degrees of FOV per second while a zoom button is held
let _maxIn = 0;             // zoom clamp, degrees of FOV below the anchor
let _maxOut = 0;            // zoom clamp, degrees of FOV above the anchor
let _alwaysOn = false;      // controls active at every aspect, not just portrait
let _landscapeFov = 0;      // zoom anchor while landscape (alwaysOn scenes)
let _zoomDelegate = null;   // { onDelta, limits? }: experience-owned zoom
let _onFirstUse = null;

// Control state.
let _holdPan = 0;           // -1 while "pan left" is held, +1 for "pan right"
let _holdZoom = 0;          // +1 while "zoom in" is held, -1 for "zoom out"
let _holdTilt = 0;          // +1 while a tilt-up key is held, -1 for tilt-down
let _angle = 0;             // current yaw offset from the composed view (radians)
let _tilt = 0;              // current tilt offset (radians, positive = looking up)
let _fovOffset = 0;         // current FOV offset from baseFov (degrees, negative = closer)
let _appliedPan = false;    // the camera currently carries a non-zero yaw
let _appliedZoom = false;   // the camera currently carries a non-zero FOV offset
let _used = {};             // first-use telemetry, one flag per input kind
let _isPortrait = false;

// Wheel zoom. `_wheelStep` is how much "in" one notch buys, in the same
// doublings the pinch speaks, so a delegate needs no wheel-specific code.
let _wheelStep = 0.12;
const WHEEL_NOTCH_PX = 100; // what one detent reports on most mice
const WHEEL_LINE_PX = 16;   // deltaMode 1 reports lines, not pixels

// Touch gesture state (only live when init received a surface).
const TAP_SLOP_PX = 8;      // travel below this still reads as a tap
let _surface = null;        // the element the swipe/pinch listeners hang on
const _pointers = new Map();// active touch/pen pointers: id -> {x, y, startX, startY}
let _gestureMoved = false;  // the current touch sequence travelled beyond the slop
let _tapClaimed = false;    // the sequence that just ended was a drag/pinch, not a tap
let _pinchDist = 0;         // finger spread at the last two-pointer move (0 = re-prime)

// DOM, built by initPortraitControls.
let _container = null;
let _zoomContainer = null;  // only when zoomContainerClass asks for one
let _panLeftBtn = null;
let _panRightBtn = null;
let _zoomInBtn = null;
let _zoomOutBtn = null;
let _tiltUpBtn = null;
let _tiltDownBtn = null;

// Scratch vectors, created lazily so merely importing this module never
// touches the THREE global (keeps Node-side unit tests side-effect free).
let _dirVec = null;
let _targetVec = null;
let _yAxis = null;
let _rightVec = null;

/** True while the inputs should respond: always for alwaysOn scenes,
 *  otherwise only in portrait. */
function controlsActive() {
    return _alwaysOn || _isPortrait;
}

/** The FOV the zoom offsets hang from: the composed portrait FOV, or the
 *  composed landscape FOV once an alwaysOn scene turns sideways. */
function anchorFov() {
    return (_isPortrait || !_landscapeFov) ? _baseFov : _landscapeFov;
}

function firstUse(kind) {
    if (_used[kind]) return;
    _used[kind] = true;
    if (_onFirstUse) _onFirstUse(kind);
}

function startHold(axis, dir) {
    if (axis === 'pan') _holdPan = dir;
    else if (axis === 'tilt') _holdTilt = dir;
    else _holdZoom = dir;
    firstUse(axis);
}

function stopHold(axis, dir) {
    if (axis === 'pan' && _holdPan === dir) _holdPan = 0;
    if (axis === 'tilt' && _holdTilt === dir) _holdTilt = 0;
    if (axis === 'zoom' && _holdZoom === dir) _holdZoom = 0;
}

/** Dim whichever button has run out of travel (still pressable, reads as
 *  spent). Called when an offset actually changes, and every frame in
 *  delegate mode (the delegate's limits can move on their own). */
function syncLimitClasses() {
    if (_panLeftBtn) _panLeftBtn.classList.toggle('at-limit', _angle <= -_maxAngle + 1e-4);
    if (_panRightBtn) _panRightBtn.classList.toggle('at-limit', _angle >= _maxAngle - 1e-4);
    if (_zoomDelegate) {
        const lim = typeof _zoomDelegate.limits === 'function'
            ? _zoomDelegate.limits() : null;
        if (_zoomInBtn) _zoomInBtn.classList.toggle('at-limit', !!(lim && lim.atIn));
        if (_zoomOutBtn) _zoomOutBtn.classList.toggle('at-limit', !!(lim && lim.atOut));
        return;
    }
    if (_zoomInBtn) _zoomInBtn.classList.toggle('at-limit', _fovOffset <= -_maxIn + 1e-4);
    if (_zoomOutBtn) _zoomOutBtn.classList.toggle('at-limit', _fovOffset >= _maxOut - 1e-4);
}

/** The tilt pair dims on its own clamp. Separate from the above because the
 *  tilt moves every frame while a key is held rather than only when an offset
 *  changes, so this is called from the frame update. */
function syncTiltClasses() {
    if (_tiltUpBtn) _tiltUpBtn.classList.toggle('at-limit', _tilt >= _maxTilt - 1e-4);
    if (_tiltDownBtn) _tiltDownBtn.classList.toggle('at-limit', _tilt <= -_maxTilt + 1e-4);
}

// ---- Touch gestures on the scene itself ------------------------------------

/** The camera's live vertical FOV in degrees, the lens both drag axes
 *  scale against so the scene approximately follows the finger. */
function currentVfovDeg() {
    if (_getCamera) {
        const camera = _getCamera();
        if (camera && typeof camera.fov === 'number' && camera.fov > 0) return camera.fov;
    }
    return 60;
}

/** Radians of yaw per horizontal pixel dragged: the visible horizontal
 *  angle spread across the viewport width. */
function panRadiansPerPixel() {
    const width = Math.max(1, window.innerWidth);
    const aspect = width / Math.max(1, window.innerHeight);
    const hFov = 2 * Math.atan(Math.tan(currentVfovDeg() * Math.PI / 360) * aspect);
    return hFov / width;
}

/** Radians of tilt per vertical pixel dragged: the vertical FOV itself
 *  spans the viewport height. */
function tiltRadiansPerPixel() {
    return currentVfovDeg() * (Math.PI / 180) / Math.max(1, window.innerHeight);
}

/** Yaw by a dragged pixel distance. The finger pulls the scene with it,
 *  so the camera turns the other way: a leftward drag (dx < 0) reveals
 *  what was cropped off the right. */
function applyGesturePan(dx) {
    if (dx === 0) return;
    const next = Math.min(_maxAngle, Math.max(-_maxAngle, _angle - dx * panRadiansPerPixel()));
    if (next !== _angle) {
        _angle = next;
        syncLimitClasses();
    }
}

/** Tilt by a dragged pixel distance, same convention: pulling the scene
 *  down (dy > 0, the finger travels toward the bottom of the screen)
 *  reveals what was cropped off the top, so the camera looks up. An
 *  axis the buttons do not offer; pan.maxTilt of 0 turns it off. */
function applyGestureTilt(dy) {
    if (dy === 0 || _maxTilt <= 0) return;
    _tilt = Math.min(_maxTilt, Math.max(-_maxTilt, _tilt + dy * tiltRadiansPerPixel()));
}

/** Rescale the FOV by a pinch factor (> 1 means the fingers spread).
 *  Working in tan space keeps the on-screen size of the framed content
 *  tracking the finger spread linearly, like every native pinch. In
 *  delegate mode the factor is handed over as log2 (a full spread
 *  doubling = 1.0 "in") and the FOV is left alone. */
function applyZoomFactor(factor, kind) {
    if (!(_zoomInBtn || _zoomOutBtn) || !(factor > 0)) return;
    firstUse(kind);
    if (_zoomDelegate) {
        _zoomDelegate.onDelta(Math.log2(factor));
        syncLimitClasses();
        return;
    }
    const anchor = anchorFov();
    const wanted = (360 / Math.PI) * Math.atan(Math.tan((anchor + _fovOffset) * Math.PI / 360) / factor);
    const next = Math.min(_maxOut, Math.max(-_maxIn, wanted - anchor));
    if (next !== _fovOffset) {
        _fovOffset = next;
        syncLimitClasses();
    }
}

function applyGesturePinch(factor) {
    applyZoomFactor(factor, 'pinch');
}

/**
 * A wheel notch, in the same units a pinch speaks: "doublings in".
 *
 * ONE PATH FOR EVERY ZOOM INPUT, which is what keeps the wheel honest in
 * delegate mode without the delegate needing to know a wheel exists.
 *
 * `deltaMode` has to be read. A mouse reports pixels and about 100 of
 * them a notch, a trackpad reports small continuous pixel values, and
 * Firefox on some platforms reports LINES instead, where a raw 3 would be
 * three notches' worth of nothing if it were taken as pixels.
 */
function wheelDoublings(event) {
    let pixels = event.deltaY;
    if (event.deltaMode === 1) pixels *= WHEEL_LINE_PX;
    else if (event.deltaMode === 2) pixels *= (window.innerHeight || 800);
    // Scroll up is deltaY < 0 and means zoom IN, which is positive here.
    const units = (-pixels / WHEEL_NOTCH_PX) * _wheelStep;
    // A fling can report thousands of pixels in a single event, and one
    // frame that crosses the whole travel reads as a teleport.
    const cap = _wheelStep * 3;
    return Math.max(-cap, Math.min(cap, units));
}

function onWheel(event) {
    if (!controlsActive() || !(_zoomInBtn || _zoomOutBtn)) return;
    // The page must not scroll underneath the scene.
    if (event.cancelable !== false) event.preventDefault();
    const units = wheelDoublings(event);
    if (!units) return;
    applyZoomFactor(Math.pow(2, units), 'wheel');
}

function onGesturePointerDown(event) {
    // A fresh press starts a clean sequence; this includes a mouse press,
    // so a leftover claim can never eat a later click on a hybrid device.
    if (_pointers.size === 0) {
        _gestureMoved = false;
        _tapClaimed = false;
    }
    // A MOUSE DRAG LOOKS AROUND THE SAME WAY A SWIPE DOES. This used to
    // return here, which left every desktop visitor with no drag at all
    // while the experiences' own legends told them to drag. Same axes,
    // same clamps, same tap slop, so a mouse and a finger reach exactly
    // the same views. A plain click still travels under the slop and is
    // never claimed, so click-to-open handlers are unaffected.
    if (event.pointerType === 'mouse') {
        // The primary button only: a right or middle drag belongs to the
        // browser, and the context menu is somebody else's business.
        if (event.button !== 0) return;
        // Without this a drag across a canvas starts a text selection in
        // the page around it and the cursor turns into an I-beam.
        if (event.cancelable !== false) event.preventDefault();
    }
    _pointers.set(event.pointerId, {
        x: event.clientX, y: event.clientY,
        startX: event.clientX, startY: event.clientY
    });
    _pinchDist = 0;    // finger count changed: re-prime on the next move
    if (_surface.setPointerCapture) {
        try { _surface.setPointerCapture(event.pointerId); } catch (e) { /* stale pointer id */ }
    }
}

function onGesturePointerMove(event) {
    const p = _pointers.get(event.pointerId);
    if (!p) return;
    const prevX = p.x;
    const prevY = p.y;
    p.x = event.clientX;
    p.y = event.clientY;
    if (!controlsActive()) return;

    if (_pointers.size === 1) {
        if (!_gestureMoved) {
            // Spend the tap slop first so a wobbly tap never nudges the
            // view; the drag then starts from here, with no jump.
            if (Math.hypot(p.x - p.startX, p.y - p.startY) <= TAP_SLOP_PX) return;
            _gestureMoved = true;
            firstUse('swipe');
            return;
        }
        applyGesturePan(p.x - prevX);
        applyGestureTilt(p.y - prevY);
        return;
    }

    if (_pointers.size === 2) {
        // Two fingers are never a prop tap. The spread drives the zoom;
        // the centroid (half of one finger's travel) keeps panning both
        // axes, so a pinch that drifts feels like one continuous gesture.
        _gestureMoved = true;
        applyGesturePan((p.x - prevX) / 2);
        applyGestureTilt((p.y - prevY) / 2);
        const [a, b] = [..._pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (_pinchDist > 0 && dist > 0) applyGesturePinch(dist / _pinchDist);
        if (dist > 0) _pinchDist = dist;
    }
}

function onGesturePointerUp(event) {
    if (!_pointers.delete(event.pointerId)) return;
    _pinchDist = 0;    // finger count changed: re-prime on the next move
    if (_gestureMoved) _tapClaimed = true;
    if (_surface.releasePointerCapture) {
        try { _surface.releasePointerCapture(event.pointerId); } catch (e) { /* already released */ }
    }
}

/** One held-down control button. Pointer capture keeps the release
 *  reliable even when a thumb slides off the circle mid-press. */
function makeButton(label, svgPath, axis, dir, signal) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pan-btn';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${svgPath}"/></svg>`;

    btn.addEventListener('pointerdown', (event) => {
        // No text selection, no focus scroll; the keyboard path is below.
        event.preventDefault();
        if (btn.setPointerCapture) {
            try { btn.setPointerCapture(event.pointerId); } catch (e) { /* stale pointer id */ }
        }
        btn.classList.add('held');
        startHold(axis, dir);
    }, { signal });
    ['pointerup', 'pointercancel'].forEach((type) => btn.addEventListener(type, () => {
        btn.classList.remove('held');
        stopHold(axis, dir);
    }, { signal }));
    btn.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });

    // Keyboard: hold Space or Enter on the focused button.
    btn.addEventListener('keydown', (event) => {
        if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat) {
            event.preventDefault();
            btn.classList.add('held');
            startHold(axis, dir);
        }
    }, { signal });
    btn.addEventListener('keyup', (event) => {
        if (event.code === 'Space' || event.code === 'Enter') {
            btn.classList.remove('held');
            stopHold(axis, dir);
        }
    }, { signal });
    btn.addEventListener('blur', () => {
        btn.classList.remove('held');
        stopHold(axis, dir);
    }, { signal });

    return btn;
}

// These keys map to the same holds from anywhere while portrait
// (desktop portrait windows and switch-access users get the same slow
// look-around): Left/Right or A/D pan, and plus/minus zoom.
//
// ---- A KEY BELONGS TO THE BUTTON IT LOOKS LIKE ----
//
// Up and Down used to zoom, from before this part had tilt buttons to
// draw. Once `tiltButtons: true` existed, a scene could show an up
// arrow, a down arrow, a plus and a minus, and then answer the arrow
// KEYS with the plus and minus BUTTONS. Nothing about that is
// guessable. So plus and minus now carry the zoom, the arrows follow
// whichever arrows are on screen, and `keyHoldFor` below decides which.
//
// `Equal` and `Minus` are the physical keys, so they cover both = and +
// without the visitor having to hold Shift for one of them.
const KEY_HOLDS = {
    ArrowLeft: { axis: 'pan', dir: -1, btn: () => _panLeftBtn },
    ArrowRight: { axis: 'pan', dir: 1, btn: () => _panRightBtn },
    KeyA: { axis: 'pan', dir: -1, btn: () => _panLeftBtn },
    KeyD: { axis: 'pan', dir: 1, btn: () => _panRightBtn },
    Equal: { axis: 'zoom', dir: 1, btn: () => _zoomInBtn },
    Minus: { axis: 'zoom', dir: -1, btn: () => _zoomOutBtn },
    NumpadAdd: { axis: 'zoom', dir: 1, btn: () => _zoomInBtn },
    NumpadSubtract: { axis: 'zoom', dir: -1, btn: () => _zoomOutBtn },
    ArrowUp: { axis: 'zoom', dir: 1, btn: () => _zoomInBtn },
    ArrowDown: { axis: 'zoom', dir: -1, btn: () => _zoomOutBtn }
};

// The tilt buttons are optional, so these resolve to null in a scene that
// did not ask for them and the key holds still work exactly as before.
const TILT_UP_HOLD = { axis: 'tilt', dir: 1, btn: () => _tiltUpBtn };
const TILT_DOWN_HOLD = { axis: 'tilt', dir: -1, btn: () => _tiltDownBtn };

/**
 * The hold a key press maps to.
 *
 * W/S always tilt, and so does Shift+Up/Down, which is the arrow-key route in
 * a scene that draws no tilt buttons.
 *
 * ---- AND THE PLAIN ARROWS FOLLOW THE BUTTONS THAT EXIST ----
 *
 * In a scene with `tiltButtons: true` there are up and down arrows ON SCREEN,
 * and the arrow keys have to be those. In a scene without them the only up and
 * down controls are the zoom pair, so the arrows keep the zoom they have always
 * had. Either way the key does what the button under the same glyph does,
 * which is the whole rule, and no existing scene changes: `tiltButtons` is used
 * by exactly one experience.
 */
function keyHoldFor(event) {
    if (event.code === 'KeyW') return TILT_UP_HOLD;
    if (event.code === 'KeyS') return TILT_DOWN_HOLD;
    if (event.shiftKey && event.code === 'ArrowUp') return TILT_UP_HOLD;
    if (event.shiftKey && event.code === 'ArrowDown') return TILT_DOWN_HOLD;
    if (_tiltUpBtn && event.code === 'ArrowUp') return TILT_UP_HOLD;
    if (_tiltDownBtn && event.code === 'ArrowDown') return TILT_DOWN_HOLD;
    return KEY_HOLDS[event.code] || null;
}

/** Track orientation; any flip drops the pan and zoom so each composed
 *  frame returns exactly as designed (for portrait-only scenes this only
 *  ever fires on the way out, since offsets cannot accumulate while
 *  landscape). The experience's own resize handler (placeCamera) re-aims
 *  and re-lenses the camera on the same resize event, and once both
 *  offsets are zero this part stops touching it, so nothing here writes
 *  to the camera directly. */
function refreshOrientation() {
    const portrait = window.innerHeight >= window.innerWidth;
    if (portrait !== _isPortrait) {
        _angle = 0;
        _tilt = 0;
        _fovOffset = 0;
        _holdPan = 0;
        _holdZoom = 0;
        _holdTilt = 0;
        _appliedPan = false;
        _appliedZoom = false;
        _pinchDist = 0;    // a pinch straddling the flip re-primes cleanly
        syncLimitClasses();
    }
    _isPortrait = portrait;
}

/**
 * Build the buttons and wire the inputs. Call once from the experience's
 * setup, after the DOM exists and before the load fade-in adds .visible
 * to the .ui-float elements. Options: { getCamera, lookAt, baseFov,
 * pan: { speed, maxAngle }, zoom: { speed, maxIn, maxOut }, extraClass,
 * onFirstUse, signal }. Zoom buttons render only when both zoom and
 * baseFov are provided.
 */
export function initPortraitControls(options = {}) {
    _getCamera = typeof options.getCamera === 'function' ? options.getCamera : null;
    _lookAt = options.lookAt || null;
    const pan = options.pan || {};
    if (typeof pan.speed === 'number' && pan.speed > 0) _panSpeed = pan.speed;
    // ZERO IS MEANINGFUL ON BOTH AXES: it switches that axis off entirely, for
    // a scene that wants the zoom without the looking around.
    //
    // maxAngle used to require `> 0` and so ignored a 0 silently, leaving the
    // 0.5 default in place and the scene panning anyway. That was an
    // inconsistency rather than a decision: maxTilt has always honoured 0, and
    // `setPanLimit` below explicitly accepts it (`maxAngle >= 0`), so the
    // initializer was the only place in this part that disagreed. Nothing
    // passed 0 before automan did.
    if (typeof pan.maxAngle === 'number' && pan.maxAngle >= 0) _maxAngle = pan.maxAngle;
    if (typeof pan.maxTilt === 'number' && pan.maxTilt >= 0) _maxTilt = pan.maxTilt;
    const zoom = options.zoom || null;
    _zoomDelegate = (options.zoomDelegate && typeof options.zoomDelegate.onDelta === 'function')
        ? options.zoomDelegate : null;
    // A delegate needs no baseFov: the FOV math is bypassed entirely.
    const zoomEnabled = !!(zoom &&
        (_zoomDelegate || (typeof options.baseFov === 'number' && options.baseFov > 0)));
    if (zoomEnabled) {
        _baseFov = typeof options.baseFov === 'number' && options.baseFov > 0
            ? options.baseFov : 0;
        if (typeof zoom.speed === 'number' && zoom.speed > 0) _zoomSpeed = zoom.speed;
        _maxIn = typeof zoom.maxIn === 'number' && zoom.maxIn > 0 ? zoom.maxIn : 0;
        _maxOut = typeof zoom.maxOut === 'number' && zoom.maxOut > 0 ? zoom.maxOut : 0;
        // Doublings-in per wheel notch. A delegate counts in its own units, so
        // this is the one number that says how fast a wheel crosses them.
        if (typeof zoom.wheel === 'number' && zoom.wheel > 0) _wheelStep = zoom.wheel;
    } else {
        _baseFov = 0;
        _maxIn = 0;
        _maxOut = 0;
    }
    _alwaysOn = options.alwaysOn === true;
    _landscapeFov = typeof options.landscapeFov === 'number' && options.landscapeFov > 0
        ? options.landscapeFov : 0;
    _onFirstUse = typeof options.onFirstUse === 'function' ? options.onFirstUse : null;
    const signal = options.signal;

    if (!_dirVec) {
        _dirVec = new THREE.Vector3();
        _targetVec = new THREE.Vector3();
        _yAxis = new THREE.Vector3(0, 1, 0);
        _rightVec = new THREE.Vector3();
    }

    // Fresh state (and no duplicate buttons) if an experience re-inits.
    if (_container && _container.parentNode) _container.parentNode.removeChild(_container);
    if (_zoomContainer && _zoomContainer.parentNode) {
        _zoomContainer.parentNode.removeChild(_zoomContainer);
    }
    _zoomContainer = null;
    _tiltUpBtn = null;
    _tiltDownBtn = null;
    _holdPan = 0;
    _holdZoom = 0;
    _holdTilt = 0;
    _angle = 0;
    _tilt = 0;
    _fovOffset = 0;
    _appliedPan = false;
    _appliedZoom = false;
    _used = {};
    _zoomInBtn = null;
    _zoomOutBtn = null;
    _pointers.clear();
    _gestureMoved = false;
    _tapClaimed = false;
    _pinchDist = 0;

    _container = document.createElement('div');
    _container.className = 'ui-float pan-controls' +
        (typeof options.extraClass === 'string' && options.extraClass ? ` ${options.extraClass}` : '');
    _container.setAttribute('role', 'group');
    _container.setAttribute('aria-label', 'Pan and zoom the view');

    // The row reads: [◀] [▲] [▼] [−] [+] [▶], with any piece a scene did not
    // ask for simply absent. With no tilt buttons and no separate zoom
    // container that reduces to the original [◀] [−] [+] [▶].
    _panLeftBtn = makeButton('Pan left', 'M14.5 6l-6 6 6 6', 'pan', -1, signal);
    _container.appendChild(_panLeftBtn);

    // The tilt pair, for scenes that want the look controls on screen rather
    // than only on W and S. A scene with the tilt axis switched off gets none,
    // because a button that cannot move anything is worse than no button.
    if (options.tiltButtons === true && _maxTilt > 0) {
        _tiltUpBtn = makeButton('Look up', 'M6 14.5l6-6 6 6', 'tilt', 1, signal);
        _tiltDownBtn = makeButton('Look down', 'M6 9.5l6 6 6-6', 'tilt', -1, signal);
        _container.appendChild(_tiltUpBtn);
        _container.appendChild(_tiltDownBtn);
    }

    if (zoomEnabled) {
        _zoomOutBtn = makeButton('Zoom out', 'M5 12h14', 'zoom', -1, signal);
        _zoomInBtn = makeButton('Zoom in', 'M12 5v14M5 12h14', 'zoom', 1, signal);
        // A scene that wants the look controls together and the zoom somewhere
        // else gets its own container for the pair, stacked, PLUS ON TOP:
        // vertically that is the idiom every map application already taught
        // the visitor, and it agrees with the direction it moves the view.
        const zoomClass = typeof options.zoomContainerClass === 'string'
            ? options.zoomContainerClass.trim() : '';
        if (zoomClass) {
            _zoomContainer = document.createElement('div');
            _zoomContainer.className = `ui-float ${zoomClass}`;
            _zoomContainer.setAttribute('role', 'group');
            _zoomContainer.setAttribute('aria-label', 'Zoom the view');
            _zoomContainer.appendChild(_zoomInBtn);
            _zoomContainer.appendChild(_zoomOutBtn);
        } else {
            _container.appendChild(_zoomOutBtn);
            _container.appendChild(_zoomInBtn);
        }
    }

    _panRightBtn = makeButton('Pan right', 'M9.5 6l6 6-6 6', 'pan', 1, signal);
    _container.appendChild(_panRightBtn);
    document.body.appendChild(_container);
    // After the row, so the experience's own .ui-float reveal sweep finds it
    // too and both groups appear together.
    if (_zoomContainer) document.body.appendChild(_zoomContainer);

    window.addEventListener('keydown', (event) => {
        const hold = keyHoldFor(event);
        if (!hold || !controlsActive() || event.repeat) return;
        if (hold.axis === 'zoom' && !(_zoomInBtn || _zoomOutBtn)) return;
        if (hold.axis === 'tilt' && _maxTilt <= 0) return;
        startHold(hold.axis, hold.dir);
        const btn = hold.btn();
        if (btn) btn.classList.add('held');
    }, { signal });
    window.addEventListener('keyup', (event) => {
        // A tilt hold must stop on the bare key: Shift may have lifted
        // before the arrow did, and stopHold ignores inactive holds. The
        // BUTTON HAS TO BE RELEASED HERE TOO, because KEY_HOLDS below has no
        // entry for W or S and so returns before it can clear anything. That
        // did not matter while the tilt had no buttons, and became a control
        // stuck in its pressed state the moment it did.
        if (event.code === 'KeyW' || event.code === 'ArrowUp') {
            stopHold('tilt', 1);
            if (_tiltUpBtn) _tiltUpBtn.classList.remove('held');
        }
        if (event.code === 'KeyS' || event.code === 'ArrowDown') {
            stopHold('tilt', -1);
            if (_tiltDownBtn) _tiltDownBtn.classList.remove('held');
        }
        const hold = KEY_HOLDS[event.code];
        if (!hold) return;
        stopHold(hold.axis, hold.dir);
        const btn = hold.btn();
        if (btn) btn.classList.remove('held');
    }, { signal });

    // Swipe/pinch gestures on the scene itself, when the experience hands
    // over its canvas. touch-action: none tells the browser every touch
    // here is ours (no scroll, no page pinch-zoom); the Safari-only
    // gesture events are already blocked page-wide by the experiences.
    _surface = (options.surface && typeof options.surface.addEventListener === 'function')
        ? options.surface : null;
    if (_surface) {
        if (_surface.style) _surface.style.touchAction = 'none';
        // Belt and braces for iOS Safari: double-tap smart zoom and
        // tap-adjacent text selection both begin at touchstart, and not
        // every version honors touch-action there. Cancel the default
        // outright, as the first-person touch zones do. touchend still
        // fires (the experiences' tap handlers listen for it); only the
        // synthetic click is lost, which also stops a touch tap from
        // raycasting twice through the click + touchend pair.
        _surface.addEventListener('touchstart', (event) => {
            if (event.cancelable !== false) event.preventDefault();
        }, { passive: false, signal });
        _surface.addEventListener('pointerdown', onGesturePointerDown, { signal });
        _surface.addEventListener('pointermove', onGesturePointerMove, { signal });
        ['pointerup', 'pointercancel'].forEach((type) =>
            _surface.addEventListener(type, onGesturePointerUp, { signal }));
        // Not passive: the page must not scroll out from under the scene.
        _surface.addEventListener('wheel', onWheel, { passive: false, signal });
    }

    window.addEventListener('resize', refreshOrientation, { signal });
    refreshOrientation();
}

/**
 * Advance the held controls and (re)apply the yaw and FOV offsets. Call
 * once per frame from the experience's render loop. Cheap when idle:
 * with both offsets centered it never touches the camera, so landscape
 * behavior is exactly as before.
 */
export function updatePortraitControls(deltaTime) {
    if (controlsActive() && deltaTime > 0) {
        if (_holdPan !== 0) {
            const next = Math.min(_maxAngle, Math.max(-_maxAngle, _angle + _holdPan * _panSpeed * deltaTime));
            if (next !== _angle) {
                _angle = next;
                syncLimitClasses();
            }
        }
        if (_holdTilt !== 0 && _maxTilt > 0) {
            // Keys and the tilt buttons share the pan speed: the same slow
            // look-around, whichever way the visitor asked for it.
            _tilt = Math.min(_maxTilt, Math.max(-_maxTilt, _tilt + _holdTilt * _panSpeed * deltaTime));
            syncTiltClasses();
        }
        if (_holdZoom !== 0) {
            if (_zoomDelegate) {
                // Held buttons and keys stream deltas at zoom.speed units
                // per second; the experience decides what a unit means.
                _zoomDelegate.onDelta(_holdZoom * _zoomSpeed * deltaTime);
            } else {
                // Zooming in narrows the FOV, so "in" (+1) pushes the offset down.
                const next = Math.min(_maxOut, Math.max(-_maxIn, _fovOffset - _holdZoom * _zoomSpeed * deltaTime));
                if (next !== _fovOffset) {
                    _fovOffset = next;
                    syncLimitClasses();
                }
            }
        }
    }

    // Delegate limits can move without any input (content streaming in or
    // running out), so refresh the dimming every frame in that mode.
    if (_zoomDelegate) syncLimitClasses();

    if (!_getCamera || !_lookAt) return;
    const camera = _getCamera();
    if (!camera) return;

    if (_angle !== 0 || _tilt !== 0) {
        _dirVec.set(_lookAt.x, _lookAt.y, _lookAt.z).sub(camera.position);
        // Positive angle means "pan right": clockwise seen from above,
        // which is a negative rotation about +Y.
        if (_angle !== 0) _dirVec.applyAxisAngle(_yAxis, -_angle);
        if (_tilt !== 0) {
            // Positive tilt looks up: rotate the yawed direction about
            // its own right-hand axis, cross(dir, +Y) normalized. The
            // tilt clamp keeps the direction well away from vertical,
            // so the horizontal magnitude below never degenerates.
            const mag = Math.hypot(_dirVec.x, _dirVec.z);
            if (mag > 0) {
                _rightVec.set(-_dirVec.z / mag, 0, _dirVec.x / mag);
                _dirVec.applyAxisAngle(_rightVec, _tilt);
            }
        }
        camera.lookAt(_targetVec.copy(camera.position).add(_dirVec));
        _appliedPan = true;
    } else if (_appliedPan) {
        // The aim just returned to center: restore the composed aim once,
        // then leave the camera to the experience.
        camera.lookAt(_lookAt.x, _lookAt.y, _lookAt.z);
        _appliedPan = false;
    }

    if (_fovOffset !== 0) {
        const wanted = anchorFov() + _fovOffset;
        if (camera.fov !== wanted) {
            camera.fov = wanted;
            camera.updateProjectionMatrix();
        }
        _appliedZoom = true;
    } else if (_appliedZoom) {
        // The zoom just returned to center: restore this orientation's
        // composed FOV once. (An orientation flip mid-zoom skips this:
        // the flip reset clears the applied flag and placeCamera
        // restores the new frame's FOV itself.)
        const anchor = anchorFov();
        if (camera.fov !== anchor) {
            camera.fov = anchor;
            camera.updateProjectionMatrix();
        }
        _appliedZoom = false;
    }
}

/**
 * Move the yaw clamp, for an experience whose eye is not in a fixed place.
 *
 * ---- THE LIMIT WAS SIZED FOR ONE VIEWPOINT AND THERE ARE NOW MANY ----
 *
 * `pan.maxAngle` is set once at init, which is right for the view-only scenes
 * this part was built for: the eye never moves, so how far the visitor needs to
 * turn to reach the edge of the subject never changes. www/garden's zoom is a
 * DOLLY, so the eye travels from 22 metres back to inside the plot, and the
 * angle subtended by the same 24 metres of garden goes from 35 degrees to 108.
 * A single clamp is generous at one end of that track and confining at the
 * other, which is what QA reported: "hard to zoom in on the front corners
 * because my side pan range is limited, which is fine while zoomed out".
 *
 * THE CURRENT YAW IS RE-CLAMPED, so a limit that shrinks brings the view back
 * inside it rather than leaving the visitor outside a range they can no longer
 * reach. In garden that means pulling the dolly back also re-composes the aim,
 * which is the same thing its own focus release does one layer up.
 *
 * A no-op when the limit has not moved, because the caller is a render loop and
 * `syncLimitClasses` is DOM work.
 */
export function setPanLimit(maxAngle) {
    if (!(maxAngle >= 0) || maxAngle === _maxAngle) return;
    _maxAngle = maxAngle;
    _angle = Math.min(_maxAngle, Math.max(-_maxAngle, _angle));
    syncLimitClasses();
}

/**
 * Put the yaw and tilt back to zero, so the aim is the composed one again.
 *
 * ---- FOR AN EXPERIENCE THAT MOVES THE AIM ITSELF ----
 *
 * The yaw and tilt here are an OFFSET FROM the `lookAt` object the experience
 * handed over, and that object is allowed to move: www/garden turns the
 * composed aim onto a newly planted tree. The offset then rides on top of the
 * new aim, which is right for a visitor still looking around and wrong the
 * instant the experience has deliberately aimed at something. Garden shipped
 * that bug: pan across the plot, plant a tree, and the scene centred the tree
 * and then added the visitor's 31.5 degrees of pan back on, which on a portrait
 * phone (a frame 18.7 degrees wide either side) put the new tree off screen.
 *
 * So an experience that re-aims announces it here, and the offset is consumed
 * rather than carried. The visitor's pan range is then symmetric about whatever
 * they are now looking at, which is the whole reason the offset exists.
 *
 * THIS DOES NOT MOVE THE CAMERA BY ITSELF and must not be called as though it
 * did. The next `updatePortraitControls` restores the composed aim, so a caller
 * that has not also moved its own `lookAt` will see the view snap back by
 * whatever the offset was. Garden's `showTree` reads the camera's ACTUAL
 * direction first and starts its own eased move from there, so the offset is
 * folded into a move that was happening anyway and nothing jumps.
 *
 * The held buttons are deliberately untouched: a finger still down on the pan
 * arrow is a request that has not finished.
 */
export function resetPortraitAim() {
    _angle = 0;
    _tilt = 0;
    syncLimitClasses();
    syncTiltClasses();
}

/** Current yaw offset in radians (exposed for unit tests). */
export function getPanAngle() {
    return _angle;
}

/** Current tilt offset in radians, positive = looking up (for unit tests). */
export function getTiltAngle() {
    return _tilt;
}

/** Current FOV offset in degrees, negative = zoomed in (for unit tests). */
export function getZoomOffset() {
    return _fovOffset;
}

/** True when the touch sequence that just ended was a drag or pinch, so
 *  the experience's own tap handlers (click / touchend on the same
 *  surface) should let that tap pass rather than open a prop. Pointer
 *  events fire before the touch events they spawn, so the claim is
 *  already in place when those handlers ask; the next press, of any
 *  pointer type, clears it. */
export function gestureClaimedTap() {
    return _tapClaimed;
}

/** Remove the buttons and reset all state. Listeners registered with the
 *  init signal are released by aborting it. */
export function disposePortraitControls() {
    if (_container && _container.parentNode) _container.parentNode.removeChild(_container);
    if (_zoomContainer && _zoomContainer.parentNode) {
        _zoomContainer.parentNode.removeChild(_zoomContainer);
    }
    _container = _zoomContainer = null;
    _panLeftBtn = _panRightBtn = _zoomInBtn = _zoomOutBtn = null;
    _tiltUpBtn = _tiltDownBtn = null;
    _getCamera = null;
    _lookAt = null;
    _zoomDelegate = null;
    _onFirstUse = null;
    _holdPan = 0;
    _holdZoom = 0;
    _holdTilt = 0;
    _angle = 0;
    _tilt = 0;
    _fovOffset = 0;
    _appliedPan = false;
    _appliedZoom = false;
    _used = {};
    _alwaysOn = false;
    _landscapeFov = 0;
    _surface = null;
    _pointers.clear();
    _gestureMoved = false;
    _tapClaimed = false;
    _pinchDist = 0;
}
