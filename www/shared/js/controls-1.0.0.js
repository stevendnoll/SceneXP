// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * controls.js - First-Person Player Controls (shared engine part)
 * Handles keyboard/mouse/touch/VR/gamepad input and player movement.
 *
 * Per-experience configuration is passed to initControls(options):
 *   spawn:       { x, z, y? }   player start point (y defaults to eye height)
 *   rotation:    { yaw?, pitch? } player start facing, radians
 *   worldBounds: { minX?, maxX?, minZ?, maxZ? } walkable clamp (asymmetric ok)
 *   moveSpeed, mouseSensitivity, lookJoystickSensitivity: number overrides
 * Defaults give the Phase 4 minimized world: a small walkable area around a
 * single primary building, spawning at the origin.
 */

import { getCamera, getRenderer, getCameraRig } from './scene-1.0.0.min.js';

// Control configuration
const CONTROLS_CONFIG = {
    moveSpeed: 6.5,          // Units per second
    sprintMultiplier: 1.8,   // Sprint speed multiplier
    mouseSensitivity: 0.002, // Mouse look sensitivity
    eyeHeight: 1.7,          // Camera height in meters
    playerRadius: 0.4,       // Collision radius
    // Look joystick settings (drag-based camera rotation)
    lookJoystickSensitivity: 1.2, // Rotation speed multiplier for look joystick
    // World boundaries (restrict player to the walkable ground area). These
    // minimized-world defaults suit a single small building; experiences with
    // larger grounds override them via initControls({ worldBounds }).
    worldBounds: {
        minX: -20,           // Left boundary (edge of ground plane)
        maxX: 20,            // Right boundary (edge of ground plane)
        minZ: -20,           // Back boundary (edge of ground plane)
        maxZ: 20             // Front boundary (edge of ground plane)
    }
};

// Player state. The spawn point is experience-specific and applied in
// initControls({ spawn, rotation }); until then the player rests at the origin.
const player = {
    position: new THREE.Vector3(0, CONTROLS_CONFIG.eyeHeight, 0),
    rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
    velocity: new THREE.Vector3(0, 0, 0)
};

// Input state
const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false
};

// Mouse state
const mouse = {
    movementX: 0,
    movementY: 0,
    isTouch: false // Track if current input is from touch
};

// Touch controls state
const touch = {
    // Movement joystick (left)
    joystickActive: false,
    joystickStartX: 0,
    joystickStartY: 0,
    joystickCurrentX: 0,
    joystickCurrentY: 0,
    joystickTouchId: null, // Track specific touch for multi-touch support
    // Look joystick (right)
    lookJoystickActive: false,
    lookJoystickStartX: 0,
    lookJoystickStartY: 0,
    lookJoystickCurrentX: 0,
    lookJoystickCurrentY: 0,
    lookJoystickTouchId: null, // Track specific touch for multi-touch support
    // Tap zone tracking
    tapStartX: 0,
    tapStartY: 0,
    tapStartTime: 0,
    tapTouchId: null
};

// VR controller state
const vr = {
    isActive: false,
    rigRotation: 0,              // Accumulated rig Y rotation (snap turns)
    moveX: 0,                    // Left thumbstick X input
    moveZ: 0,                    // Left thumbstick Y input (negated for forward)
    snapTurnCooldown: 0,         // Cooldown timer to prevent rapid snap turns
    snapTurnAngle: Math.PI / 6,  // 30 degree snap turns
    triggerJustPressed: false,    // True for one frame when trigger is first pressed
    prevTriggerPressed: false,   // Previous frame trigger state
    deadzone: 0.15               // Thumbstick deadzone
};

// Standard Gamepad API state (for Quest controllers in 2D browser mode, Xbox/PS gamepads, etc.)
const gamepadState = {
    active: false,               // True if any gamepad with input is connected
    moveX: 0,                    // Left stick X
    moveZ: 0,                    // Left stick Y (negated for forward)
    lookX: 0,                    // Right stick X
    lookY: 0,                    // Right stick Y
    triggerJustPressed: false,   // True for one frame when trigger first pressed
    prevTriggerPressed: false,   // Previous frame trigger state
    deadzone: 0.15,              // Thumbstick deadzone
    connected: false             // True if gamepadconnected event was fired
};

// Head tracking state (Quest headset in 2D browser mode)
// Uses a WebXR inline session for the headset pose.
// Maps physical head rotation to camera rotation for natural VR-like look control.
const headTracking = {
    active: false,               // True if any head tracking source is providing data
    source: null,                // 'xr-inline' or null
    deltaYaw: 0,                 // Accumulated yaw change in radians (consumed per frame)
    deltaPitch: 0,               // Accumulated pitch change in radians (consumed per frame)
    lastEventTime: 0,            // Timestamp of last head tracking update
    staleThreshold: 1000,        // ms before head tracking is considered unavailable
    sensitivity: 1.0,            // 1.0 = 1:1 head-to-camera mapping
    // WebXR inline session state
    xrSession: null,
    xrRefSpace: null
};

// Reusable quaternion objects for WebXR inline head tracking (avoids GC)
const _xrPrevQuat = new THREE.Quaternion();
const _xrCurrQuat = new THREE.Quaternion();
const _xrDeltaQuat = new THREE.Quaternion();
const _xrEuler = new THREE.Euler(0, 0, 0, 'YXZ');
let _xrHasPrevQuat = false;

// Wheel event state (Quest browser maps thumbstick to scroll/wheel events in 2D mode)
// In 2D panel mode, wheel events don't identify which controller generated them,
// so BOTH thumbsticks map to movement: deltaY → forward/back, deltaX → strafe.
// Camera rotation is handled by the on-screen look joystick (laser pointer interaction).
const wheelInput = {
    active: false,               // True if wheel events are being received
    moveX: 0,                    // Current X movement input (strafe)
    moveZ: 0,                    // Current Z movement input (forward/back)
    lastEventTime: 0,            // Timestamp of last wheel event
    staleThreshold: 80,          // ms before input is zeroed (stick released). Short = instant stop.
    sensitivity: 0.004           // Scale factor for wheel delta → movement input
};

// Tap detection configuration
const TAP_CONFIG = {
    maxDuration: 500,  // Max ms for a touch to count as tap (generous for VR laser pointer)
    maxDistance: 30     // Max pixels moved for a touch to count as tap (generous for VR hand shake)
};

// Callback for tap events (set by main.js)
let onTapCallback = null;

// Joystick elements (fixed position)
let joystickBaseFixed = null;
let joystickThumbFixed = null;
let lookJoystickBaseFixed = null;
let lookJoystickThumbFixed = null;

// Callback for collision checking
let collisionCallback = null;

// Reusable objects for updateMovement to avoid garbage collection
const _direction = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _rotationY = new THREE.Euler(0, 0, 0, 'YXZ');
const _movement = new THREE.Vector3();
const _newPosition = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// RAF batching for joystick visual updates (avoids per-touchmove DOM writes)
let joystickVisualDirty = false;
let lookJoystickVisualDirty = false;

/**
 * Find a touch by its identifier in a TouchList
 */
function findTouchById(touchList, id) {
    for (let i = 0; i < touchList.length; i++) {
        if (touchList[i].identifier === id) {
            return touchList[i];
        }
    }
    return null;
}

/**
 * Initialize player controls
 * @param {Object} [options] - Per-experience config: { spawn, rotation,
 *   worldBounds, moveSpeed, mouseSensitivity, lookJoystickSensitivity }
 */
export function initControls(options = {}) {
    if (options.spawn) {
        player.position.set(
            typeof options.spawn.x === 'number' ? options.spawn.x : 0,
            typeof options.spawn.y === 'number' ? options.spawn.y : CONTROLS_CONFIG.eyeHeight,
            typeof options.spawn.z === 'number' ? options.spawn.z : 0
        );
    }
    if (options.rotation) {
        player.rotation.set(
            options.rotation.pitch || 0,
            options.rotation.yaw || 0,
            0
        );
    }
    if (options.worldBounds) {
        Object.assign(CONTROLS_CONFIG.worldBounds, options.worldBounds);
    }
    if (typeof options.moveSpeed === 'number') {
        CONTROLS_CONFIG.moveSpeed = options.moveSpeed;
    }
    if (typeof options.mouseSensitivity === 'number') {
        CONTROLS_CONFIG.mouseSensitivity = options.mouseSensitivity;
    }
    if (typeof options.lookJoystickSensitivity === 'number') {
        CONTROLS_CONFIG.lookJoystickSensitivity = options.lookJoystickSensitivity;
    }

    setupKeyboardListeners();
    setupMouseListeners();
    setupTouchListeners();
    setupWheelListener();
    setupGamepadListeners();
    setupHeadTracking();

    // Set initial camera position
    const camera = getCamera();
    if (camera) {
        camera.position.copy(player.position);
        camera.rotation.copy(player.rotation);
    }

    // Initialize VR rig rotation from starting orientation
    vr.rigRotation = player.rotation.y;
}

/**
 * Setup keyboard event listeners
 */
function setupKeyboardListeners() {
    document.addEventListener('keydown', (event) => {
        handleKeyDown(event.code);
    });

    document.addEventListener('keyup', (event) => {
        handleKeyUp(event.code);
    });
}

/**
 * Handle key down events
 */
function handleKeyDown(code) {
    switch (code) {
        case 'KeyW':
        case 'ArrowUp':
            keys.forward = true;
            break;
        case 'KeyS':
        case 'ArrowDown':
            keys.backward = true;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            keys.left = true;
            break;
        case 'KeyD':
        case 'ArrowRight':
            keys.right = true;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            keys.sprint = true;
            break;
    }
}

/**
 * Handle key up events
 */
function handleKeyUp(code) {
    switch (code) {
        case 'KeyW':
        case 'ArrowUp':
            keys.forward = false;
            break;
        case 'KeyS':
        case 'ArrowDown':
            keys.backward = false;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            keys.left = false;
            break;
        case 'KeyD':
        case 'ArrowRight':
            keys.right = false;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            keys.sprint = false;
            break;
    }
}

/**
 * Setup mouse event listeners
 */
function setupMouseListeners() {
    document.addEventListener('mousemove', (event) => {
        if (document.pointerLockElement) {
            mouse.movementX = event.movementX;
            mouse.movementY = event.movementY;
        }
    });
}

/**
 * Setup touch event listeners for dual joystick controls
 */
function setupTouchListeners() {
    const joystickZone = document.getElementById('joystick-zone');
    const lookJoystickZone = document.getElementById('look-joystick-zone');
    const tapZone = document.getElementById('tap-zone');

    // Get fixed joystick elements for movement (left)
    if (joystickZone) {
        joystickBaseFixed = joystickZone.querySelector('.joystick-base-fixed');
        joystickThumbFixed = joystickZone.querySelector('.joystick-thumb-fixed');
    }

    // Get fixed joystick elements for look (right)
    if (lookJoystickZone) {
        lookJoystickBaseFixed = lookJoystickZone.querySelector('.joystick-base-fixed');
        lookJoystickThumbFixed = lookJoystickZone.querySelector('.joystick-thumb-fixed');
    }

    // Movement joystick (left)
    if (joystickZone) {
        joystickZone.addEventListener('touchstart', handleJoystickStart, { passive: false });
        joystickZone.addEventListener('touchmove', handleJoystickMove, { passive: false });
        joystickZone.addEventListener('touchend', handleJoystickEnd);
        joystickZone.addEventListener('touchcancel', handleJoystickEnd);
    }

    // Look joystick (right)
    if (lookJoystickZone) {
        lookJoystickZone.addEventListener('touchstart', handleLookJoystickStart, { passive: false });
        lookJoystickZone.addEventListener('touchmove', handleLookJoystickMove, { passive: false });
        lookJoystickZone.addEventListener('touchend', handleLookJoystickEnd);
        lookJoystickZone.addEventListener('touchcancel', handleLookJoystickEnd);
    }

    // Tap zone (rest of screen - for interactions only)
    if (tapZone) {
        tapZone.addEventListener('touchstart', handleTapStart, { passive: false });
        tapZone.addEventListener('touchmove', handleTapMove, { passive: false });
        tapZone.addEventListener('touchend', handleTapEnd);
        tapZone.addEventListener('touchcancel', handleTapEnd);
    }
}

/**
 * Setup head tracking for VR headsets in 2D browser mode.
 * Reads the headset pose via a WebXR inline (non-immersive) session and
 * writes to the headTracking.deltaYaw/deltaPitch accumulators.
 */
function setupHeadTracking() {
    // Try WebXR inline session for genuine headsets (uses navigator.xr, no
    // deprecation warnings). Most likely to work on Quest.
    tryInlineXR();

    // There are no devicemotion/deviceorientation fallbacks: looking is
    // handled by the mouse (desktop) and the look joystick (touch), so the
    // motion/orientation sensors are redundant here — and merely adding those
    // listeners triggers browser deprecation warnings.
}

/**
 * Attempt to start a WebXR inline (non-immersive) session for head tracking.
 * Inline sessions don't require a user gesture and don't change the display.
 * On Quest browser, this can provide the headset's 6DOF pose in 2D panel mode.
 */
async function tryInlineXR() {
    if (!navigator.xr) return;

    try {
        const supported = await navigator.xr.isSessionSupported('inline');
        if (!supported) return;

        const session = await navigator.xr.requestSession('inline');
        headTracking.xrSession = session;

        // Request viewer reference space (device pose relative to initial position)
        headTracking.xrRefSpace = await session.requestReferenceSpace('viewer');

        // Start the inline XR frame loop (separate from the renderer's loop)
        session.requestAnimationFrame(onInlineXRFrame);

        session.addEventListener('end', () => {
            headTracking.xrSession = null;
            headTracking.xrRefSpace = null;
            _xrHasPrevQuat = false;
            if (headTracking.source === 'xr-inline') {
                headTracking.source = null;
                headTracking.active = false;
            }
        });

        // console.log('[Controls] WebXR inline session started for head tracking');
    } catch (e) {
        // Inline XR not available — head tracking simply stays off
    }
}

/**
 * WebXR inline session frame callback.
 * Reads the viewer (headset) pose and computes rotation deltas via quaternions.
 */
function onInlineXRFrame(time, frame) {
    const session = headTracking.xrSession;
    if (!session) return;

    // Keep the inline loop going
    session.requestAnimationFrame(onInlineXRFrame);

    // Don't read inline pose while an immersive VR session is active
    if (vr.isActive) {
        _xrHasPrevQuat = false;
        return;
    }

    const refSpace = headTracking.xrRefSpace;
    if (!refSpace) return;

    const pose = frame.getViewerPose(refSpace);
    if (!pose) return;

    const o = pose.transform.orientation;
    _xrCurrQuat.set(o.x, o.y, o.z, o.w);

    if (!_xrHasPrevQuat) {
        // First frame — just store, can't compute delta yet
        _xrPrevQuat.copy(_xrCurrQuat);
        _xrHasPrevQuat = true;
        return;
    }

    // Compute delta quaternion: deltaQ = inverse(prevQ) * currQ
    _xrDeltaQuat.copy(_xrPrevQuat).invert().multiply(_xrCurrQuat);

    // Extract yaw and pitch from the delta
    _xrEuler.setFromQuaternion(_xrDeltaQuat, 'YXZ');

    const dyaw = _xrEuler.y;
    const dpitch = _xrEuler.x;

    // Filter out large jumps (tracking loss, etc.)
    if (Math.abs(dyaw) < 0.5 && Math.abs(dpitch) < 0.5) {
        headTracking.deltaYaw += dyaw * headTracking.sensitivity;
        headTracking.deltaPitch += dpitch * headTracking.sensitivity;

        headTracking.lastEventTime = performance.now();
        headTracking.active = true;
        headTracking.source = 'xr-inline';
    }

    _xrPrevQuat.copy(_xrCurrQuat);
}

/**
 * Setup wheel event listener to capture Quest browser thumbstick input.
 * The Meta Quest browser maps physical thumbstick movement to scroll/wheel events
 * when in 2D panel mode (not immersive VR). By intercepting these wheel events,
 * we can use the physical thumbsticks for movement and camera rotation.
 */
function setupWheelListener() {
    // Use the canvas and full document to catch wheel events from Quest thumbsticks
    // passive: false allows preventDefault to stop page scrolling
    document.addEventListener('wheel', handleWheelEvent, { passive: false });
}

/**
 * Handle wheel events - convert Quest thumbstick scroll into movement input.
 * Quest browser sends wheel events when thumbsticks are moved in 2D panel mode.
 * Since we can't distinguish left from right controller, both thumbsticks
 * contribute to movement: deltaY → forward/back, deltaX → strafe left/right.
 * Camera rotation is handled by the on-screen look joystick.
 */
function handleWheelEvent(event) {
    // If a modal dialog is open it has released pointer lock, so a desktop mouse
    // wheel would otherwise be misread as Quest-thumbstick movement (and our
    // preventDefault below would block the dialog from scrolling). Bail out: let
    // the browser scroll the dialog natively, and make sure we're not "moving".
    if (document.querySelector('[role="dialog"]:not(.hidden)')) {
        wheelInput.active = false;
        wheelInput.moveX = 0;
        wheelInput.moveZ = 0;
        return;
    }

    // Don't intercept wheel events if in pointer lock mode (desktop user with real mouse wheel)
    if (document.pointerLockElement) return;

    // Prevent the page from scrolling (Quest thumbstick would scroll the page)
    event.preventDefault();

    const now = performance.now();
    wheelInput.lastEventTime = now;
    wheelInput.active = true;

    // Normalize deltas based on deltaMode
    let dx = event.deltaX;
    let dy = event.deltaY;

    if (event.deltaMode === 1) {
        // DOM_DELTA_LINE - multiply to approximate pixels
        dx *= 16;
        dy *= 16;
    } else if (event.deltaMode === 2) {
        // DOM_DELTA_PAGE - multiply to approximate pixels
        dx *= 100;
        dy *= 100;
    }

    // Both thumbsticks → movement (can't distinguish controllers from wheel events)
    // deltaY → forward/back, deltaX → strafe left/right
    // Clamp to -1..1 range
    wheelInput.moveZ = Math.max(-1, Math.min(1, -dy * wheelInput.sensitivity));
    wheelInput.moveX = Math.max(-1, Math.min(1, dx * wheelInput.sensitivity));
}

/**
 * Check for stale wheel input and zero it immediately when thumbstick is released.
 * No smoothing/decay — movement stops the instant the stick is released.
 */
function updateWheelInput() {
    if (!wheelInput.active) return;

    const now = performance.now();
    if (now - wheelInput.lastEventTime > wheelInput.staleThreshold) {
        // Thumbstick released — stop immediately
        wheelInput.active = false;
        wheelInput.moveX = 0;
        wheelInput.moveZ = 0;
    }
}

/**
 * Handle movement joystick touch start
 */
function handleJoystickStart(event) {
    event.preventDefault();

    // Find first touch that isn't already tracked
    const touchPoint = event.changedTouches[0];
    if (!touchPoint) return;

    touch.joystickActive = true;
    touch.joystickTouchId = touchPoint.identifier;

    // Use center of fixed joystick as start position for movement calculation
    if (joystickBaseFixed) {
        const rect = joystickBaseFixed.getBoundingClientRect();
        touch.joystickStartX = rect.left + rect.width / 2;
        touch.joystickStartY = rect.top + rect.height / 2;
    } else {
        touch.joystickStartX = touchPoint.clientX;
        touch.joystickStartY = touchPoint.clientY;
    }

    touch.joystickCurrentX = touchPoint.clientX;
    touch.joystickCurrentY = touchPoint.clientY;

    updateJoystickVisual();
}

/**
 * Handle movement joystick touch move
 */
function handleJoystickMove(event) {
    event.preventDefault();
    if (!touch.joystickActive) return;

    // Find our tracked touch
    const touchPoint = findTouchById(event.touches, touch.joystickTouchId);
    if (!touchPoint) return;

    touch.joystickCurrentX = touchPoint.clientX;
    touch.joystickCurrentY = touchPoint.clientY;

    // Batch DOM update to next animation frame to avoid per-touchmove layout thrash
    if (!joystickVisualDirty) {
        joystickVisualDirty = true;
        requestAnimationFrame(() => {
            joystickVisualDirty = false;
            updateJoystickVisual();
        });
    }
}

/**
 * Handle movement joystick touch end
 */
function handleJoystickEnd(event) {
    if (!touch.joystickActive) return;

    // Check if our tracked touch ended
    const touchPoint = findTouchById(event.changedTouches, touch.joystickTouchId);
    if (!touchPoint) return;

    touch.joystickActive = false;
    touch.joystickTouchId = null;
    touch.joystickCurrentX = touch.joystickStartX;
    touch.joystickCurrentY = touch.joystickStartY;

    // Reset fixed thumb to center
    if (joystickThumbFixed) {
        joystickThumbFixed.style.transform = 'translate(0, 0)';
    }
}

/**
 * Update movement joystick visual position
 */
function updateJoystickVisual() {
    const maxDistance = 35; // Max distance from center (within joystick base)

    let dx = touch.joystickCurrentX - touch.joystickStartX;
    let dy = touch.joystickCurrentY - touch.joystickStartY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > maxDistance) {
        dx = (dx / distance) * maxDistance;
        dy = (dy / distance) * maxDistance;
    }

    // Update fixed thumb position using CSS transform
    if (joystickThumbFixed) {
        joystickThumbFixed.style.transform = `translate(${dx}px, ${dy}px)`;
    }
}

/**
 * Handle look joystick touch start
 */
function handleLookJoystickStart(event) {
    event.preventDefault();

    const touchPoint = event.changedTouches[0];
    if (!touchPoint) return;

    touch.lookJoystickActive = true;
    touch.lookJoystickTouchId = touchPoint.identifier;

    // Use center of fixed joystick as start position
    if (lookJoystickBaseFixed) {
        const rect = lookJoystickBaseFixed.getBoundingClientRect();
        touch.lookJoystickStartX = rect.left + rect.width / 2;
        touch.lookJoystickStartY = rect.top + rect.height / 2;
    } else {
        touch.lookJoystickStartX = touchPoint.clientX;
        touch.lookJoystickStartY = touchPoint.clientY;
    }

    touch.lookJoystickCurrentX = touchPoint.clientX;
    touch.lookJoystickCurrentY = touchPoint.clientY;

    updateLookJoystickVisual();
}

/**
 * Handle look joystick touch move
 */
function handleLookJoystickMove(event) {
    event.preventDefault();
    if (!touch.lookJoystickActive) return;

    const touchPoint = findTouchById(event.touches, touch.lookJoystickTouchId);
    if (!touchPoint) return;

    touch.lookJoystickCurrentX = touchPoint.clientX;
    touch.lookJoystickCurrentY = touchPoint.clientY;

    // Batch DOM update to next animation frame to avoid per-touchmove layout thrash
    if (!lookJoystickVisualDirty) {
        lookJoystickVisualDirty = true;
        requestAnimationFrame(() => {
            lookJoystickVisualDirty = false;
            updateLookJoystickVisual();
        });
    }
}

/**
 * Handle look joystick touch end
 */
function handleLookJoystickEnd(event) {
    if (!touch.lookJoystickActive) return;

    const touchPoint = findTouchById(event.changedTouches, touch.lookJoystickTouchId);
    if (!touchPoint) return;

    touch.lookJoystickActive = false;
    touch.lookJoystickTouchId = null;
    touch.lookJoystickCurrentX = touch.lookJoystickStartX;
    touch.lookJoystickCurrentY = touch.lookJoystickStartY;

    // Reset fixed thumb to center
    if (lookJoystickThumbFixed) {
        lookJoystickThumbFixed.style.transform = 'translate(0, 0)';
    }
}

/**
 * Update look joystick visual position
 */
function updateLookJoystickVisual() {
    const maxDistance = 35; // Max distance from center (within joystick base)

    let dx = touch.lookJoystickCurrentX - touch.lookJoystickStartX;
    let dy = touch.lookJoystickCurrentY - touch.lookJoystickStartY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > maxDistance) {
        dx = (dx / distance) * maxDistance;
        dy = (dy / distance) * maxDistance;
    }

    // Update fixed thumb position using CSS transform
    if (lookJoystickThumbFixed) {
        lookJoystickThumbFixed.style.transform = `translate(${dx}px, ${dy}px)`;
    }
}

/**
 * Handle tap zone touch start
 */
function handleTapStart(event) {
    event.preventDefault();

    const touchPoint = event.changedTouches[0];
    if (!touchPoint) return;

    touch.tapTouchId = touchPoint.identifier;
    touch.tapStartX = touchPoint.clientX;
    touch.tapStartY = touchPoint.clientY;
    touch.tapStartTime = performance.now();
}

/**
 * Handle tap zone touch move (just track position for tap detection)
 */
function handleTapMove(event) {
    // We don't prevent default here to allow scrolling if needed
    // Just let it happen - we'll check distance in handleTapEnd
}

/**
 * Handle tap zone touch end - detect taps and trigger interaction
 */
function handleTapEnd(event) {
    if (touch.tapTouchId === null) return;

    const touchPoint = findTouchById(event.changedTouches, touch.tapTouchId);
    if (!touchPoint) return;

    // Check if this was a tap (short duration, minimal movement)
    const duration = performance.now() - touch.tapStartTime;
    const dx = touchPoint.clientX - touch.tapStartX;
    const dy = touchPoint.clientY - touch.tapStartY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (duration < TAP_CONFIG.maxDuration && distance < TAP_CONFIG.maxDistance) {
        // This was a tap - trigger interaction at tap location
        if (onTapCallback) {
            onTapCallback(touch.tapStartX, touch.tapStartY);
        }
    }

    touch.tapTouchId = null;
}

/**
 * Setup gamepad connection event listeners.
 * The gamepadconnected event fires when a gamepad is first interacted with,
 * which helps detect Quest controllers that may not appear in getGamepads() until used.
 */
function setupGamepadListeners() {
    window.addEventListener('gamepadconnected', (event) => {
        gamepadState.connected = true;
        // console.log('[Controls] Gamepad connected:', event.gamepad.id,
        //     'axes:', event.gamepad.axes.length,
        //     'buttons:', event.gamepad.buttons.length);
    });

    window.addEventListener('gamepaddisconnected', (event) => {
        // console.log('[Controls] Gamepad disconnected:', event.gamepad.id);
        // Check if any gamepads remain
        if (navigator.getGamepads) {
            const remaining = Array.from(navigator.getGamepads()).filter(gp => gp && gp.connected);
            if (remaining.length === 0) {
                gamepadState.connected = false;
                gamepadState.active = false;
            }
        }
    });
}

/**
 * Poll standard Gamepad API for controller input.
 * Works with Quest controllers in 2D browser mode, Xbox/PS gamepads, etc.
 * Handles: dual-controller setups (separate left/right), single dual-stick gamepads,
 * and Quest browser's virtual gamepad representation.
 */
function updateGamepadInput() {
    if (!navigator.getGamepads) {
        gamepadState.active = false;
        return;
    }

    const gamepads = navigator.getGamepads();

    gamepadState.moveX = 0;
    gamepadState.moveZ = 0;
    gamepadState.lookX = 0;
    gamepadState.lookY = 0;
    gamepadState.triggerJustPressed = false;

    let leftPad = null;
    let rightPad = null;
    let singlePad = null;

    for (const gp of gamepads) {
        if (!gp || !gp.connected) continue;

        const id = gp.id.toLowerCase();

        // Detect left/right hand controllers by ID keywords
        // Meta Quest / Oculus Touch controllers typically include hand in ID
        if (id.includes('left')) {
            leftPad = gp;
        } else if (id.includes('right')) {
            rightPad = gp;
        } else if (!singlePad && gp.axes.length >= 2) {
            // Any gamepad with at least 2 axes (Xbox, PlayStation, Quest virtual, etc.)
            singlePad = gp;
        }
    }

    if (leftPad && rightPad) {
        // Dual controller setup (Quest/Oculus controllers detected separately)
        gamepadState.active = true;

        // Left controller: movement (axes may be at index 0,1 or 2,3 depending on mapping)
        const lAxes = leftPad.axes;
        const lx = lAxes.length > 2 ? (lAxes[2] || 0) : (lAxes[0] || 0);
        const ly = lAxes.length > 3 ? (lAxes[3] || 0) : (lAxes[1] || 0);
        gamepadState.moveX = Math.abs(lx) > gamepadState.deadzone ? lx : 0;
        gamepadState.moveZ = Math.abs(ly) > gamepadState.deadzone ? -ly : 0;

        // Right controller: look (same axis fallback logic)
        const rAxes = rightPad.axes;
        const rx = rAxes.length > 2 ? (rAxes[2] || 0) : (rAxes[0] || 0);
        const ry = rAxes.length > 3 ? (rAxes[3] || 0) : (rAxes[1] || 0);
        gamepadState.lookX = Math.abs(rx) > gamepadState.deadzone ? rx : 0;
        gamepadState.lookY = Math.abs(ry) > gamepadState.deadzone ? ry : 0;

        // Right trigger for interaction (try button indices 0, 1, and 7)
        const triggerPressed = (rightPad.buttons[0] && rightPad.buttons[0].pressed) ||
                               (rightPad.buttons[1] && rightPad.buttons[1].pressed);
        gamepadState.triggerJustPressed = triggerPressed && !gamepadState.prevTriggerPressed;
        gamepadState.prevTriggerPressed = triggerPressed;
    } else if (singlePad) {
        // Single gamepad (Xbox, PlayStation, Quest virtual gamepad, etc.)
        gamepadState.active = true;

        const lx = singlePad.axes[0] || 0;
        const ly = singlePad.axes[1] || 0;
        gamepadState.moveX = Math.abs(lx) > gamepadState.deadzone ? lx : 0;
        gamepadState.moveZ = Math.abs(ly) > gamepadState.deadzone ? -ly : 0;

        if (singlePad.axes.length >= 4) {
            const rx = singlePad.axes[2] || 0;
            const ry = singlePad.axes[3] || 0;
            gamepadState.lookX = Math.abs(rx) > gamepadState.deadzone ? rx : 0;
            gamepadState.lookY = Math.abs(ry) > gamepadState.deadzone ? ry : 0;
        }

        // Trigger: try multiple button indices for compatibility
        const triggerPressed = (singlePad.buttons[7] && singlePad.buttons[7].pressed) ||
                               (singlePad.buttons[0] && singlePad.buttons[0].pressed);
        gamepadState.triggerJustPressed = triggerPressed && !gamepadState.prevTriggerPressed;
        gamepadState.prevTriggerPressed = triggerPressed;
    } else {
        gamepadState.active = false;
        gamepadState.prevTriggerPressed = false;
    }
}

/**
 * Poll XR controllers for VR input (thumbsticks and triggers)
 * @param {number} deltaTime - Time since last frame in seconds
 */
function updateVRInput(deltaTime) {
    const renderer = getRenderer();
    if (!renderer || !renderer.xr || !renderer.xr.isPresenting) {
        vr.isActive = false;
        return;
    }

    vr.isActive = true;
    const session = renderer.xr.getSession();
    if (!session) return;

    vr.moveX = 0;
    vr.moveZ = 0;
    vr.triggerJustPressed = false;

    for (const source of session.inputSources) {
        if (!source.gamepad) continue;

        const axes = source.gamepad.axes;
        const buttons = source.gamepad.buttons;

        if (source.handedness === 'left') {
            // Left thumbstick: movement
            // XR standard mapping: axes[2]=thumbstick X, axes[3]=thumbstick Y
            // Fallback to axes[0]/[1] if only 2 axes present
            const sx = axes.length > 2 ? axes[2] : axes[0];
            const sy = axes.length > 3 ? axes[3] : axes[1];
            vr.moveX = Math.abs(sx) > vr.deadzone ? sx : 0;
            vr.moveZ = Math.abs(sy) > vr.deadzone ? -sy : 0; // Negate: stick forward = negative axis
        } else if (source.handedness === 'right') {
            // Right thumbstick: snap turn
            const rx = axes.length > 2 ? axes[2] : axes[0];

            if (vr.snapTurnCooldown <= 0) {
                if (rx > 0.6) {
                    vr.rigRotation -= vr.snapTurnAngle;
                    vr.snapTurnCooldown = 0.3;
                } else if (rx < -0.6) {
                    vr.rigRotation += vr.snapTurnAngle;
                    vr.snapTurnCooldown = 0.3;
                }
            }

            // Right trigger: interaction
            const triggerPressed = buttons[0] && buttons[0].pressed;
            vr.triggerJustPressed = triggerPressed && !vr.prevTriggerPressed;
            vr.prevTriggerPressed = triggerPressed;
        }
    }

    if (vr.snapTurnCooldown > 0) {
        vr.snapTurnCooldown -= deltaTime;
    }
}

/**
 * Update player position and camera
 * @param {number} deltaTime - Time since last frame in seconds
 * @param {boolean} isPaused - Whether the game is paused
 */
export function updateControls(deltaTime, isPaused) {
    // Poll VR controllers (WebXR immersive mode)
    updateVRInput(deltaTime);

    if (vr.isActive) {
        // VR mode: movement from left thumbstick, snap turn from right
        updateMovement(deltaTime);

        // Update camera rig position and rotation
        const cameraRig = getCameraRig();
        if (cameraRig) {
            cameraRig.position.set(player.position.x, 0, player.position.z);
            cameraRig.rotation.y = vr.rigRotation;
        }
        return;
    }

    // Poll standard gamepads (Quest 2D mode, Xbox, PlayStation, etc.)
    updateGamepadInput();

    // Check for stale wheel input (Quest thumbstick released)
    updateWheelInput();

    // Check if any active input source should bypass pause
    const hasActiveInput = touch.joystickActive || touch.lookJoystickActive || gamepadState.active || wheelInput.active || headTracking.active;
    if (isPaused && !hasActiveInput) {
        mouse.movementX = 0;
        mouse.movementY = 0;
        return;
    }

    // Update camera rotation from mouse/touch
    updateRotation(deltaTime);

    // Update player position from keyboard/touch
    updateMovement(deltaTime);

    // Apply to camera
    const camera = getCamera();
    if (camera) {
        camera.position.copy(player.position);
        camera.rotation.copy(player.rotation);
    }

    // Reset mouse movement
    mouse.movementX = 0;
    mouse.movementY = 0;
    mouse.isTouch = false;
}

/**
 * Update camera rotation based on mouse/touch input
 * @param {number} deltaTime - Time since last frame in seconds
 */
let _headTrackingLogged = false;

function updateRotation(deltaTime) {
    // Handle head tracking (Quest headset gyroscope in 2D browser mode)
    // Highest priority: physical head rotation directly controls camera
    if (headTracking.active && (headTracking.deltaYaw !== 0 || headTracking.deltaPitch !== 0)) {
        // Log once when head tracking first activates
        if (!_headTrackingLogged) {
            // console.log('[Controls] Head tracking active via:', headTracking.source);
            _headTrackingLogged = true;
        }

        // Apply accumulated head rotation deltas
        player.rotation.y -= headTracking.deltaYaw;
        player.rotation.x -= headTracking.deltaPitch;

        // Consume the deltas
        headTracking.deltaYaw = 0;
        headTracking.deltaPitch = 0;

        // Check if head tracking has gone stale (device stopped sending events)
        const now = performance.now();
        if (now - headTracking.lastEventTime > headTracking.staleThreshold) {
            headTracking.active = false;
            _headTrackingLogged = false;
        }
    }

    // Handle gamepad right stick rotation
    if (gamepadState.active && (gamepadState.lookX !== 0 || gamepadState.lookY !== 0)) {
        const sensitivity = CONTROLS_CONFIG.lookJoystickSensitivity;
        player.rotation.y -= gamepadState.lookX * sensitivity * deltaTime;
        player.rotation.x -= gamepadState.lookY * sensitivity * deltaTime;
    } else if (touch.lookJoystickActive) {
    // Handle look joystick (drag-based rotation)
        const maxDistance = 35; // Same as visual max distance

        // Calculate offset from joystick center (-1 to 1)
        let dx = touch.lookJoystickCurrentX - touch.lookJoystickStartX;
        let dy = touch.lookJoystickCurrentY - touch.lookJoystickStartY;

        // Normalize to -1 to 1 range
        const inputX = Math.max(-1, Math.min(1, dx / maxDistance));
        const inputY = Math.max(-1, Math.min(1, dy / maxDistance));

        // Apply rotation based on joystick position
        // X movement rotates camera horizontally (yaw)
        // Y movement rotates camera vertically (pitch)
        const sensitivity = CONTROLS_CONFIG.lookJoystickSensitivity;
        player.rotation.y -= inputX * sensitivity * deltaTime;
        player.rotation.x -= inputY * sensitivity * deltaTime;
    } else {
        // Desktop mouse-based rotation (pointer lock)
        const sensitivity = CONTROLS_CONFIG.mouseSensitivity;
        player.rotation.y -= mouse.movementX * sensitivity;
        player.rotation.x -= mouse.movementY * sensitivity;
    }

    // Clamp vertical rotation to prevent flipping
    player.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.rotation.x));
}

/**
 * Update player movement based on input
 */
function updateMovement(deltaTime) {
    // Get input from VR controllers, touch joystick, or keyboard
    let inputX = 0;
    let inputZ = 0;

    if (vr.isActive) {
        // VR thumbstick input (WebXR immersive mode)
        inputX = vr.moveX;
        inputZ = vr.moveZ;
    } else if (gamepadState.active && (gamepadState.moveX !== 0 || gamepadState.moveZ !== 0)) {
        // Standard gamepad left stick (Quest 2D mode, Xbox, PlayStation, etc.)
        inputX = gamepadState.moveX;
        inputZ = gamepadState.moveZ;
    } else if (wheelInput.active && (wheelInput.moveX !== 0 || wheelInput.moveZ !== 0)) {
        // Quest browser wheel events from physical thumbstick in 2D panel mode
        // Both axes mapped to movement (strafe + forward/back), no smoothing
        inputX = wheelInput.moveX;
        inputZ = wheelInput.moveZ;
    } else if (touch.joystickActive) {
        // Touch joystick input (maxDistance matches updateJoystickVisual)
        const maxDistance = 35;
        inputX = (touch.joystickCurrentX - touch.joystickStartX) / maxDistance;
        inputZ = -(touch.joystickCurrentY - touch.joystickStartY) / maxDistance;

        // Clamp to -1 to 1
        inputX = Math.max(-1, Math.min(1, inputX));
        inputZ = Math.max(-1, Math.min(1, inputZ));
    } else {
        // Keyboard input
        if (keys.forward) inputZ = 1;
        if (keys.backward) inputZ = -1;
        if (keys.left) inputX = -1;
        if (keys.right) inputX = 1;
    }

    // No input, no movement
    if (inputX === 0 && inputZ === 0) return;

    // Reset reusable direction vector
    _direction.set(0, 0, 0);

    if (vr.isActive) {
        // In VR, movement direction is based on where the headset is looking
        const camera = getCamera();
        if (camera) {
            camera.getWorldDirection(_forward);
            _forward.y = 0;
            _forward.normalize();
            _right.crossVectors(_forward, _up);
            _right.normalize();
        }
    } else {
        // Desktop/mobile: movement based on player rotation
        _forward.set(0, 0, -1);
        _right.set(1, 0, 0);

        // Apply Y rotation only (keep movement on horizontal plane)
        _rotationY.set(0, player.rotation.y, 0);
        _forward.applyEuler(_rotationY);
        _right.applyEuler(_rotationY);
    }

    // Combine movement directions
    _direction.addScaledVector(_forward, inputZ);
    _direction.addScaledVector(_right, inputX);
    _direction.normalize();

    // Calculate speed
    let speed = CONTROLS_CONFIG.moveSpeed;
    if (keys.sprint) {
        speed *= CONTROLS_CONFIG.sprintMultiplier;
    }

    // Calculate new position (reuse objects instead of clone)
    _movement.copy(_direction).multiplyScalar(speed * deltaTime);
    _newPosition.copy(player.position).add(_movement);

    // Collision system expects eye-height Y (boxes are positioned relative to floor)
    // In VR, rig Y is 0 but collision still needs eye-height for proper box intersection
    _newPosition.y = CONTROLS_CONFIG.eyeHeight;
    player.position.y = CONTROLS_CONFIG.eyeHeight;

    // Check collision if callback is set
    if (collisionCallback) {
        const adjustedPosition = collisionCallback(player.position, _newPosition, CONTROLS_CONFIG.playerRadius);
        player.position.copy(adjustedPosition);
    } else {
        player.position.copy(_newPosition);
    }

    // Clamp position to world boundaries
    const bounds = CONTROLS_CONFIG.worldBounds;
    player.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, player.position.x));
    player.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, player.position.z));

    // In VR, rig is at floor level (headset provides eye height)
    // In desktop/mobile, keep player at fixed eye height
    player.position.y = vr.isActive ? 0 : CONTROLS_CONFIG.eyeHeight;
}

/**
 * Set collision callback function
 * @param {Function} callback - Function(oldPos, newPos, radius) => adjustedPos
 */
export function setCollisionCallback(callback) {
    collisionCallback = callback;
}

/**
 * Set player position
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export function setPlayerPosition(x, y, z) {
    player.position.set(x, y || CONTROLS_CONFIG.eyeHeight, z);
}

/**
 * Set player rotation
 * @param {number} yaw - Y rotation in radians
 * @param {number} [pitch] - Optional X rotation in radians (vertical look)
 */
export function setPlayerRotation(yaw, pitch) {
    player.rotation.y = yaw;
    if (pitch !== undefined) {
        player.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
    }
}

/**
 * Get player position (returns a clone - use copyPlayerPositionTo for hot paths)
 */
export function getPlayerPosition() {
    return player.position.clone();
}

/**
 * Copy player position into an existing Vector3 (avoids allocation in hot paths)
 * @param {THREE.Vector3} target - Vector3 to copy into
 * @returns {THREE.Vector3} The target vector
 */
export function copyPlayerPositionTo(target) {
    return target.copy(player.position);
}

/**
 * Get player rotation
 */
export function getPlayerRotation() {
    return player.rotation.clone();
}

/**
 * Get player collision radius
 */
export function getPlayerRadius() {
    return CONTROLS_CONFIG.playerRadius;
}

/**
 * Set callback for tap events on the look zone
 * @param {Function} callback - Function(x, y) called when tap is detected
 */
export function setTapCallback(callback) {
    onTapCallback = callback;
}

/**
 * Update move speed
 * @param {number} speed - New move speed (units per second)
 */
export function setMoveSpeed(speed) {
    CONTROLS_CONFIG.moveSpeed = speed;
}

/**
 * Update mouse sensitivity
 * @param {number} sensitivity - New mouse sensitivity
 */
export function setMouseSensitivity(sensitivity) {
    CONTROLS_CONFIG.mouseSensitivity = sensitivity;
}

/**
 * Update look joystick sensitivity
 * @param {number} sensitivity - New look joystick sensitivity
 */
export function setLookJoystickSensitivity(sensitivity) {
    CONTROLS_CONFIG.lookJoystickSensitivity = sensitivity;
}

/**
 * Check if VR mode is currently active
 */
export function isVRActive() {
    return vr.isActive;
}

/**
 * Check if VR trigger was just pressed this frame
 */
export function isVRTriggerJustPressed() {
    return vr.triggerJustPressed;
}

/**
 * Check if a standard gamepad is active
 */
export function isGamepadActive() {
    return gamepadState.active;
}

/**
 * Check if gamepad trigger/action button was just pressed this frame
 */
export function isGamepadTriggerJustPressed() {
    return gamepadState.triggerJustPressed;
}

/**
 * Check if head tracking (device orientation) is active
 */
export function isHeadTrackingActive() {
    return headTracking.active;
}

export { CONTROLS_CONFIG };

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = { findTouchById };
