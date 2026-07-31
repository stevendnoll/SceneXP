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
 * The part builds its own DOM: a `.ui-float.pan-controls` container, so
 * the experience's load fade-in reveals it alongside the other floats,
 * while a CSS orientation media query (www/shared/css/styles-1.0.0.css) keeps it
 * hidden at every landscape aspect. Press and hold a button by pointer,
 * hold Space/Enter on the focused button, or hold the keys anywhere
 * while in portrait: Left/Right or A/D pan, Up zooms in, Down zooms
 * out. The tilt axis below has no buttons, so it gets its own keys:
 * W/S, or Shift+Up/Down for arrow-key visitors, held at the pan speed.
 * Together that puts the full WASD square on the view. Rotating the
 * phone back to landscape resets every control so the composed frame
 * returns exactly as designed.
 *
 * Touch gestures: when the experience passes its renderer canvas as
 * `surface`, the offsets also answer direct touch. A one finger drag
 * moves the view so the scene follows the finger, scaled to the current
 * lens: horizontal drags yaw (a full-width swipe sweeps about one
 * frame), and vertical drags TILT the camera up and down, an axis the
 * buttons do not offer, clamped to ±pan.maxTilt radians from the
 * composed aim (maxTilt: 0 turns the tilt off). A two finger pinch
 * rescales the FOV in tan space so the framed content tracks the finger
 * spread, and the pinch centroid keeps panning both axes. The
 * same clamps, limit dimming, gating, and orientation resets apply, so
 * the gestures can never reach a view the buttons cannot. A drag or
 * pinch claims the touch sequence: the experience's own tap handlers on
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
 *       zoom: CONFIG.camera.portrait.zoom,   // { speed, maxIn, maxOut }, optional
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
 *                                            // 'tilt' (keys only),
 *                                            // 'swipe' | 'pinch' (gestures)
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
let _maxAngle = 0.5;        // pan clamp, radians each way from the composed view
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

// Touch gesture state (only live when init received a surface).
const TAP_SLOP_PX = 8;      // travel below this still reads as a tap
let _surface = null;        // the element the swipe/pinch listeners hang on
const _pointers = new Map();// active touch/pen pointers: id -> {x, y, startX, startY}
let _gestureMoved = false;  // the current touch sequence travelled beyond the slop
let _tapClaimed = false;    // the sequence that just ended was a drag/pinch, not a tap
let _pinchDist = 0;         // finger spread at the last two-pointer move (0 = re-prime)

// DOM, built by initPortraitControls.
let _container = null;
let _panLeftBtn = null;
let _panRightBtn = null;
let _zoomInBtn = null;
let _zoomOutBtn = null;

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
function applyGesturePinch(factor) {
    if (!(_zoomInBtn || _zoomOutBtn) || !(factor > 0)) return;
    firstUse('pinch');
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

function onGesturePointerDown(event) {
    // A fresh press starts a clean sequence; this includes a mouse press,
    // so a leftover claim can never eat a later click on a hybrid device.
    if (_pointers.size === 0) {
        _gestureMoved = false;
        _tapClaimed = false;
    }
    if (event.pointerType === 'mouse') return;
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
// look-around): Left/Right or A/D pan, Up zooms in, Down zooms out.
// The tilt, which has no buttons, gets its own keys through keyHoldFor
// below: W/S, or Shift+Up/Down for arrow-key visitors, so the full
// WASD square drives the view.
const KEY_HOLDS = {
    ArrowLeft: { axis: 'pan', dir: -1, btn: () => _panLeftBtn },
    ArrowRight: { axis: 'pan', dir: 1, btn: () => _panRightBtn },
    KeyA: { axis: 'pan', dir: -1, btn: () => _panLeftBtn },
    KeyD: { axis: 'pan', dir: 1, btn: () => _panRightBtn },
    ArrowUp: { axis: 'zoom', dir: 1, btn: () => _zoomInBtn },
    ArrowDown: { axis: 'zoom', dir: -1, btn: () => _zoomOutBtn }
};

const TILT_UP_HOLD = { axis: 'tilt', dir: 1, btn: () => null };
const TILT_DOWN_HOLD = { axis: 'tilt', dir: -1, btn: () => null };

/** The hold a key press maps to. W/S always tilt; holding Shift re-aims
 *  the Up/Down arrows from zoom to tilt (plain arrows keep the zoom). */
function keyHoldFor(event) {
    if (event.code === 'KeyW') return TILT_UP_HOLD;
    if (event.code === 'KeyS') return TILT_DOWN_HOLD;
    if (event.shiftKey && event.code === 'ArrowUp') return TILT_UP_HOLD;
    if (event.shiftKey && event.code === 'ArrowDown') return TILT_DOWN_HOLD;
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
    if (typeof pan.maxAngle === 'number' && pan.maxAngle > 0) _maxAngle = pan.maxAngle;
    // Zero is meaningful here: it switches the swipe tilt off entirely.
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

    // Arrows on the outside, zoom pair in the middle: [◀] [−] [+] [▶]
    _panLeftBtn = makeButton('Pan left', 'M14.5 6l-6 6 6 6', 'pan', -1, signal);
    _container.appendChild(_panLeftBtn);
    if (zoomEnabled) {
        _zoomOutBtn = makeButton('Zoom out', 'M5 12h14', 'zoom', -1, signal);
        _zoomInBtn = makeButton('Zoom in', 'M12 5v14M5 12h14', 'zoom', 1, signal);
        _container.appendChild(_zoomOutBtn);
        _container.appendChild(_zoomInBtn);
    }
    _panRightBtn = makeButton('Pan right', 'M9.5 6l6 6-6 6', 'pan', 1, signal);
    _container.appendChild(_panRightBtn);
    document.body.appendChild(_container);

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
        // before the arrow did, and stopHold ignores inactive holds.
        if (event.code === 'KeyW' || event.code === 'ArrowUp') stopHold('tilt', 1);
        if (event.code === 'KeyS' || event.code === 'ArrowDown') stopHold('tilt', -1);
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
            // Keyboard tilt shares the pan speed: the same slow look-around.
            _tilt = Math.min(_maxTilt, Math.max(-_maxTilt, _tilt + _holdTilt * _panSpeed * deltaTime));
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
    _container = _panLeftBtn = _panRightBtn = _zoomInBtn = _zoomOutBtn = null;
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
