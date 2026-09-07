// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for the Seed to Seed garden experience.
 *
 * Coordinates the scene, first-person controls, and the backyard garden
 * world: the raised beds, the greenhouse, the pumpkin patch, the owner
 * greeting visitors among his vegetables, and a few garden guests strolling
 * the paths singing his praises.
 */

import { SEED_CONFIG } from './config.min.js';
import { getProofOfWork, bufToHex, installCardFocusTrap } from '../../shared/js/boot-1.0.0.min.js';
import { checkCollision } from '../../shared/js/collision-1.0.0.min.js';
import {
    initScene, handleResize, render, getCamera, getScene, getRenderer,
    updateDayNightCycle, removeTestObjects, isTouchDevice,
    getNightFactor, getSun, getMoon
} from '../../shared/js/scene-1.0.0.min.js';
import {
    initControls, updateControls, setCollisionCallback,
    getPlayerPosition, copyPlayerPositionTo, setTapCallback,
    setMoveSpeed, setMouseSensitivity, setLookJoystickSensitivity, CONTROLS_CONFIG,
    setPlayerPosition, setPlayerRotation
} from '../../shared/js/controls-1.0.0.min.js';
import {
    initStore, getStoreCollisionBoxes, STORE_CONFIG,
    updateBackgroundAnimations,
    updateStorePeople, updateCheckoutSign,
    getGalleryHost, getHelpSign,
    setGalleryWaypoints, initGalleryVisitors, getVisitorMeshes, findClearSpawn,
    pauseCustomerForDialog, resumeCustomerFromDialog,
    getOutdoorPropMeshes,
    updateGarden, updateGardenLights, isInsideGreenhouse,
    updateKioskChecklist, drawKioskTo
} from './store.min.js';
import {
    initGallery, getGalleryGroup, resolveGalleryPiece,
    getGalleryPieces, setPieceHighlight
} from './gallery.min.js';
import {
    initChecklist, markChecklistItem, onChecklistChange,
    getChecklistItems, getChecklistProgress
} from '../../shared/js/checklist-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';
import { isMobileDevice } from '../../shared/js/world-1.0.0.min.js';
import {
    initAutopilot, toggleAutopilot, setAutopilotEnabled,
    isAutopilotEnabled, onAutopilotChange, updateAutopilot
} from '../../shared/js/autopilot-1.0.0.min.js';
import {
    initListings, buildListings, getListingColliders, SAMPLE_LISTINGS
} from './listings.min.js';

// ---- Application state ----------------------------------------------------

const state = {
    isRunning: false,
    isLoaded: false,
    isPaused: true,
    _modalOpen: false,
    lastTime: 0,
    deltaTime: 0,
    isMobile: false
};

// `isModalOpen` is a getter/setter so opening/closing any dialog also drives the
// accessibility plumbing (background made inert, focus captured and restored) in
// one place, without each open/close function repeating it. See onModalOpened /
// onModalClosed below.
Object.defineProperty(state, 'isModalOpen', {
    enumerable: true, // so getState()'s spread carries isModalOpen, not just _modalOpen
    get() { return this._modalOpen; },
    set(open) {
        const was = this._modalOpen;
        this._modalOpen = open;
        if (open && !was) onModalOpened();
        else if (!open && was) onModalClosed();
    }
});

// Background UI that should be removed from the tab order and the accessibility
// tree while a modal dialog is open, so keyboard/AT focus stays trapped inside
// the dialog (the genuine focus-trap; `inert` also blocks pointer events, which
// is fine because the modal's own backdrop covers the scene).
const MODAL_BG_SELECTOR =
    '.skip-link, #blocker, #hud, #touch-controls, #autopilot-btn, #biz-btn, #settings-btn, #settings-panel, #game-canvas';
let modalReturnFocus = null;

function setBackgroundInert(on) {
    document.querySelectorAll(MODAL_BG_SELECTOR).forEach(el => {
        if (on) el.setAttribute('inert', '');
        else el.removeAttribute('inert');
    });
}

function onModalOpened() {
    // Close the discovery checklist so it doesn't float over the modal backdrop.
    closeChecklistPanel();
    modalReturnFocus = document.activeElement;
    // Defer one microtask so the specific dialog has been un-hidden first.
    queueMicrotask(() => {
        if (!state.isModalOpen) return;
        setBackgroundInert(true);
    });
}

function onModalClosed() {
    setBackgroundInert(false);
    // Restore focus to wherever it was when the dialog opened (usually the body
    // or canvas after a 3D click, so no stray focus ring on desktop play).
    const el = modalReturnFocus;
    modalReturnFocus = null;
    if (el && document.contains(el) && !el.hasAttribute('inert')) {
        try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    }
}

// DOM references (resolved in init)
let canvas, loadingScreen, blocker, hud, touchControls;
let lookLabel, pieceModal, pieceModalTitle, pieceModalSubtitle, pieceModalEnter;
let helpModal;
let dialogModal, dialogModalTitle, dialogModalMessage;
let whiteboardView, whiteboardCanvas, whiteboardCaption; // kiosk notice-board close-up (keeps the whiteboard ids/styles)
let completeModal; // discovery-complete celebration
let nudgeModal; // partway "reach out" invitation (reuses the celebration card)
let dialogReturnBtn; // "Back to the Trail" shortcut inside the shared dialog modal

// Kiosk close-up view state. The board can change while open (a discovery can
// tick mid-view), but it's repainted on every open, which is enough.
let whiteboardOpen = false;

// Raycasting for "look at" highlight and click-to-open
const raycaster = new THREE.Raycaster();
raycaster.far = 16;
const pointer = new THREE.Vector2();
const _tolPointer = new THREE.Vector2(); // offset sample point for forgiving taps
const TAP_TOLERANCE_PX = 26;             // hit radius for touch taps / windowed clicks
let raycastTargets = [];      // hover + click targets (interior pieces, NPCs, eggs…)
let clickTargets = [];        // raycastTargets plus the click-only outdoor props

// Separate, long-range ray used only to click the distant sky objects (the
// main raycaster is capped at 16m). Default Raycaster.far is Infinity, so it
// reaches the sun and moon; neither is a hover target, so no tooltips.
const skyRaycaster = new THREE.Raycaster();

// Currently looked-at / highlighted piece
let hoveredPiece = null;
let hoveredHost = false;
let hoveredVisitor = null;
let _hoverAccum = 0; // throttle accumulator for hover raycasts
let _elapsed = 0;    // running time for sign bob/billboard animation

// Reusable per-frame objects (avoid GC churn)
const _playerPos = new THREE.Vector3();

let cleanupController = null;

// ---- Initialization -------------------------------------------------------

// ---- Proof-of-work load gate ----------------------------------------------
// The gate itself lives in the shared boot part; its knobs come from
// SEED_CONFIG.proofOfWork (the legacy 'gallery-pow' storage key is kept so
// visitors' cached proofs survive).

async function init() {
    state.isMobile = isTouchDevice();
    setMobile(state.isMobile); // tag every telemetry ping with mobile vs not

    canvas = document.getElementById('game-canvas');
    loadingScreen = document.getElementById('loading-screen');
    blocker = document.getElementById('blocker');
    hud = document.getElementById('hud');
    touchControls = document.getElementById('touch-controls');
    lookLabel = document.getElementById('look-label');
    pieceModal = document.getElementById('piece-modal');
    pieceModalTitle = document.getElementById('piece-title');
    pieceModalSubtitle = document.getElementById('piece-subtitle');
    pieceModalEnter = document.getElementById('piece-enter');
    helpModal = document.getElementById('help-modal');
    dialogModal = document.getElementById('dialog-modal');
    dialogModalTitle = document.getElementById('dialog-title');
    dialogModalMessage = document.getElementById('dialog-message');
    dialogReturnBtn = document.getElementById('dialog-return-btn');
    whiteboardView = document.getElementById('whiteboard-view');
    whiteboardCanvas = document.getElementById('whiteboard-canvas');
    whiteboardCaption = document.getElementById('whiteboard-caption');
    completeModal = document.getElementById('complete-modal');
    nudgeModal = document.getElementById('nudge-modal');

    if (!canvas) return;

    // Wire the builder contact CTAs and the Seed to Seed services links from
    // SEED_CONFIG.site, so config stays the single home for these values.
    // Equivalent fallbacks are baked into the HTML for the no-JS path.
    // (The Home button this used to wire first was removed from this scene.)
    applySiteLinks();

    // Soft bot deterrent: solve a tiny proof of work before building the scene
    // (or reuse a still-valid one from sessionStorage). Hand the hash to the
    // telemetry layer so it tags every ping.
    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(SEED_CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Initializing renderer…', 25);
    initScene(canvas, SEED_CONFIG);

    updateLoadingStatus('Preparing the soil…', 55);
    initStore();
    removeTestObjects();

    updateLoadingStatus('Planting the beds…', 75);
    // No wall pieces in this theme (GALLERY_SECTIONS is empty); this keeps
    // the gallery group / raycast plumbing intact while building none.
    initGallery();

    // listings.js is a stub here, same as the tire theme: initListings
    // creates the empty raycast container and buildListings is a no-op.
    initListings(getScene());
    buildListings(SAMPLE_LISTINGS);

    // Register the garden waypoints, then add a few guests out for a
    // stroll: they drift between the chalkboard, the raised beds, the
    // greenhouse door, the pumpkin patch, and the compost bins, pausing to
    // admire the work.
    setGalleryWaypoints([
        { x: -8,  z: 6.6,  lookAtX: -8,  lookAtZ: 8.6 },    // the garden chalkboard
        { x: -3,  z: 3.5,  lookAtX: -4,  lookAtZ: 1.8 },    // the cross path, admiring the tomato bed (clear of the spawn spot at x 0)
        { x: 13.5, z: -1.8, lookAtX: 13.5, lookAtZ: -4 },   // the greenhouse door
        { x: -11, z: 4.2,  lookAtX: -12, lookAtZ: 5.5 },    // the pumpkin patch
        { x: -15.5, z: -6.6, lookAtX: -17.8, lookAtZ: -6.6 }, // the compost bins
        { x: 11,  z: 9.2,  lookAtX: 3,   lookAtZ: 3.5 }     // the bench view of it all
    ]);
    initGalleryVisitors(isMobileDevice() ? SEED_CONFIG.walkers.mobileCount : SEED_CONFIG.walkers.count);
    buildRaycastTargets();

    // Discovery checklist: install the trail item list, restore any session
    // progress, and keep the kiosk notice board mirrored to it. Items get
    // ticked by the interaction handlers below (markChecklistItem). Seed the
    // board once now.
    initChecklist(SEED_CONFIG.checklist);
    onChecklistChange((items, progress) => {
        updateKioskChecklist(items, progress);
        // Peak-delight moment: the first time every discovery is found, celebrate
        // and gently invite the visitor to get in touch (once per session).
        if (progress.complete) maybeCelebrateCompletion();
        // Before that, a single low-key nudge partway through catches engaged
        // visitors who may never find all eight (once per session).
        else maybeNudgeContact(progress);
        // When something ticks while the panel is closed, pulse the button so the
        // visitor knows there's new progress to peek at.
        const panel = document.getElementById('checklist');
        const btn = document.getElementById('checklist-btn');
        if (btn && panel && panel.classList.contains('hidden')) {
            btn.classList.remove('pulse');
            void btn.offsetWidth; // reflow so the animation can restart
            btn.classList.add('pulse');
        }
    });
    updateKioskChecklist(getChecklistItems(), getChecklistProgress());

    updateLoadingStatus('Preparing controls…', 90);
    initControls(SEED_CONFIG);
    initAutopilot(SEED_CONFIG.autopilot);
    if (state.isMobile) setTapCallback(handleTapInteraction);
    setupCollision();
    setupEventListeners();
    if (state.isMobile) touchControls.classList.add('visible');

    updateLoadingStatus('Ready', 100);
    setTimeout(() => {
        loadingScreen.classList.add('hidden');
        state.isLoaded = true;
        document.querySelectorAll('.ui-float').forEach(el => el.classList.add('visible'));
    }, 400);

    // Mark the start of this visit. Records the input mode so the log can tell
    // desktop visits from touch ones. (Hits are tied together by the PoW hash.)
    track('session-start', { device: state.isMobile ? 'touch' : 'desktop' });
    _sessionStart = Date.now();

    state.isRunning = true;
    state.lastTime = performance.now();
    getRenderer().setAnimationLoop(animate);
}

function updateLoadingStatus(message, progress) {
    const statusEl = document.getElementById('load-status');
    const progressEl = document.getElementById('load-progress');
    if (statusEl) statusEl.textContent = message;
    if (progressEl) progressEl.style.width = `${progress}%`;
}

// ---- Event wiring ---------------------------------------------------------

function setupEventListeners() {
    cleanupController = new AbortController();
    const signal = cleanupController.signal;

    // Make this page's aria-modal="true" true. Without it Tab walks out of
    // an open card into the floating buttons behind the backdrop, while a
    // screen reader is still announcing a dialog the visitor has left.
    installCardFocusTrap({ signal });

    window.addEventListener('pagehide', cleanup);
    window.addEventListener('resize', handleResize, { signal });

    // iOS Safari ignores `user-scalable=no` (Apple re-enabled zoom in iOS 10 for
    // accessibility), so the only way to keep the immersive 3D view from being
    // pinch-zoomed there is to block Safari's own gesture events. These are
    // non-standard, Safari-only events; preventing gesturestart stops the pinch.
    // Other mobile browsers honor the viewport meta, so this is effectively
    // iOS-only. Scoped to this page only — the 2D content pages stay zoomable.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(type =>
        document.addEventListener(type, (e) => e.preventDefault(), { passive: false, signal }));

    // Session-end / dwell time. visibilitychange→hidden is the reliable terminal
    // signal (especially on mobile, where unload often doesn't fire); pagehide is
    // a backup. Page-lifetime listeners (no AbortSignal) and endSession is
    // self-guarded, so firing from both is harmless.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') endSession();
    });
    window.addEventListener('pagehide', endSession);

    if (state.isMobile) {
        document.body.classList.add('is-touch-device');
        const clickPrompt = document.querySelector('.click-prompt');
        if (clickPrompt) clickPrompt.textContent = 'Tap to explore';
        blocker.addEventListener('click', startGameMobile, { signal });
        blocker.addEventListener('touchend', (e) => { e.preventDefault(); startGameMobile(); }, { signal });
    } else {
        blocker.addEventListener('click', requestPointerLock, { signal });
    }

    document.addEventListener('pointerlockchange', onPointerLockChange, { signal });
    document.addEventListener('pointerlockerror', () => {}, { signal });

    canvas.addEventListener('click', onCanvasClick, { signal });
    canvas.addEventListener('touchend', onCanvasTap, { signal });
    const tapZone = document.getElementById('tap-zone');
    if (tapZone) tapZone.addEventListener('click', onTapZoneClick, { signal });

    // Piece modal close
    pieceModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closePieceModal, { signal }));

    // Help modal close
    if (helpModal) helpModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeHelpModal, { signal }));

    // Pedestrian dialog modal close
    if (dialogModal) dialogModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeDialogModal, { signal }));

    // "Back to the Trail" shortcut inside the dialog modal
    if (dialogReturnBtn) dialogReturnBtn.addEventListener('click', returnToGallery, { signal });

    // Kiosk notice-board close-up close
    if (whiteboardView) whiteboardView.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeWhiteboardView, { signal }));

    // Discovery-complete celebration: close buttons + the Share action.
    if (completeModal) completeModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeCompleteModal, { signal }));
    const shareBtn = document.getElementById('complete-share');
    if (shareBtn) shareBtn.addEventListener('click', shareSite, { signal });

    // Partway "reach out" nudge: close buttons.
    if (nudgeModal) nudgeModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeNudgeModal, { signal }));

    // Escape: close modal / panels, else exit pointer lock
    document.addEventListener('keydown', (event) => {
        if (event.code !== 'Escape') return;
        const settingsPanel = document.getElementById('settings-panel');
        const navMenu = document.getElementById('nav-menu');
        if (settingsPanel && !settingsPanel.classList.contains('hidden')) { settingsPanel.classList.add('hidden'); return; }
        if (navMenu && !navMenu.classList.contains('hidden')) {
            navMenu.classList.add('hidden');
            const menuBtn = document.getElementById('menu-btn');
            if (menuBtn) { menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.focus(); }
            return;
        }
        if (state.isModalOpen) { closeActiveModal(); }
        else if (!state.isPaused) { safeExitPointerLock(); }
    }, { signal });

    // ---- Autopilot tour ----
    // On by default: autoStartAutopilot() engages the tour the first time the
    // visitor steps through the welcome screen. Toggle with the top-left tour
    // button or the T key. Any movement input (movement keys here, the
    // joysticks and the deliberate-mouse-sweep detector below) hands the
    // controls straight back to the visitor.
    const autopilotBtn = document.getElementById('autopilot-btn');
    if (autopilotBtn) {
        autopilotBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            track('autopilot', { on: toggleAutopilot() ? 1 : 0 });
        }, { signal });
        onAutopilotChange((on) => {
            autopilotBtn.setAttribute('aria-pressed', String(on));
        });
    }
    document.addEventListener('keydown', (event) => {
        if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) return;
        if (event.code === 'KeyT' && !state.isModalOpen) {
            track('autopilot', { on: toggleAutopilot() ? 1 : 0 });
            return;
        }
        if (isAutopilotEnabled() &&
            ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
            setAutopilotEnabled(false);
        }
    }, { signal });
    ['joystick-zone', 'look-joystick-zone'].forEach((id) => {
        const zone = document.getElementById(id);
        if (zone) zone.addEventListener('touchstart', () => setAutopilotEnabled(false), { passive: true, signal });
    });
    // While the tour drives, the joystick visuals bow out (the zones stay
    // touchable, so a thumb landing where a joystick lives still takes the
    // controls back, and that same touch starts steering).
    onAutopilotChange((on) => {
        if (touchControls) touchControls.classList.toggle('autopilot-live', on);
    });
    // Mouse look during the tour: an accidental nudge is forgiven, but a
    // deliberate sweep means the visitor wants the wheel. Pointer travel
    // accumulates and decays over time, so drift below the decay rate can
    // never cross the threshold no matter how long the tour runs.
    const LOOK_TAKEOVER_THRESHOLD = 450; // px of accumulated pointer travel
    const LOOK_TAKEOVER_DECAY = 900;     // px forgiven per second
    const LOOK_TAKEOVER_MIN_STEP = 4;    // per-event px floor, filters jitter
    let lookTakeoverAccum = 0;
    let lookTakeoverLastAt = 0;
    document.addEventListener('mousemove', (event) => {
        if (!document.pointerLockElement) return;
        if (!isAutopilotEnabled() || state.isPaused || state.isModalOpen) {
            lookTakeoverAccum = 0;
            return;
        }
        const elapsed = (event.timeStamp - lookTakeoverLastAt) / 1000;
        lookTakeoverLastAt = event.timeStamp;
        const travel = Math.abs(event.movementX) + Math.abs(event.movementY);
        lookTakeoverAccum = Math.max(0, lookTakeoverAccum - elapsed * LOOK_TAKEOVER_DECAY)
            + (travel >= LOOK_TAKEOVER_MIN_STEP ? travel : 0);
        if (lookTakeoverAccum >= LOOK_TAKEOVER_THRESHOLD) {
            lookTakeoverAccum = 0;
            setAutopilotEnabled(false);
        }
    }, { signal });

    setupSettingsPanel(signal);
    setupNavMenu(signal);
    setupChecklistPanel(signal);
}

// ---- Discovery checklist panel --------------------------------------------

/** Close the checklist dropdown (used on modal open and from the toggle). */
function closeChecklistPanel() {
    const panel = document.getElementById('checklist');
    const btn = document.getElementById('checklist-btn');
    if (panel) panel.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

/** Wire the checklist toggle button: open/close the dropdown, keep aria in sync,
 *  close on an outside tap, and stop a fresh tick from pulsing while it's open. */
function setupChecklistPanel(signal) {
    const btn = document.getElementById('checklist-btn');
    const panel = document.getElementById('checklist');
    if (!btn || !panel) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = panel.classList.toggle('hidden') === false;
        btn.setAttribute('aria-expanded', String(open));
        if (open) {
            btn.classList.remove('pulse');      // opened it; no need to keep nudging
            const settingsPanel = document.getElementById('settings-panel');
            const navMenu = document.getElementById('nav-menu');
            if (settingsPanel) settingsPanel.classList.add('hidden');
            if (navMenu) navMenu.classList.add('hidden');
        }
    }, { signal });

    panel.addEventListener('click', (e) => e.stopPropagation(), { signal });

    // Close on any tap/click outside the panel or its button.
    document.addEventListener('pointerdown', (event) => {
        if (panel.classList.contains('hidden')) return;
        if (panel.contains(event.target) || btn.contains(event.target)) return;
        closeChecklistPanel();
    }, { capture: true, signal });
}

// ---- Settings persistence -------------------------------------------------
// Movement and lighting preferences are remembered for the browser session
// (sessionStorage) and reapplied on the next load, so a visitor's tweaks survive
// reloads within a visit.
const SETTINGS_STORAGE_KEY = 'seedtoseed-settings';

function loadStoredSettings() {
    try {
        const parsed = JSON.parse(sessionStorage.getItem(SETTINGS_STORAGE_KEY));
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        return {}; // unparseable / sessionStorage unavailable
    }
}

function saveSetting(key, value) {
    try {
        const settings = loadStoredSettings();
        settings[key] = value;
        sessionStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        // sessionStorage may be unavailable (private mode, quota); preferences
        // just won't carry to the next load.
    }
}

/** A stored numeric setting if present and within [min,max], else the fallback.
 *  Guards against malformed or out-of-range values in sessionStorage. */
function readNumericSetting(settings, key, min, max, fallback) {
    const v = settings[key];
    return (typeof v === 'number' && isFinite(v) && v >= min && v <= max) ? v : fallback;
}

function setupSettingsPanel(signal) {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsClose = document.getElementById('settings-close');
    const walkSlider = document.getElementById('walk-speed-slider');
    const lookSlider = document.getElementById('look-speed-slider');
    const walkValue = document.getElementById('walk-speed-value');
    const lookValue = document.getElementById('look-speed-value');
    if (!settingsBtn || !settingsPanel) return;

    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.classList.toggle('hidden');
        const navMenu = document.getElementById('nav-menu');
        if (navMenu) navMenu.classList.add('hidden');
    }, { signal });
    if (settingsClose) settingsClose.addEventListener('click', () => { settingsPanel.classList.add('hidden'); settingsBtn.focus(); }, { signal });
    settingsPanel.addEventListener('click', (e) => e.stopPropagation(), { signal });

    // Close the panel on any tap/click outside it (and outside the gear, which
    // toggles itself). Uses pointerdown in the capture phase; the listener is
    // only attached while the panel is open (below), after the opening tap's
    // pointerdown has already passed, so it can't immediately self-close.
    const onSettingsOutsidePointer = (event) => {
        if (settingsPanel.classList.contains('hidden')) return;
        if (settingsPanel.contains(event.target)) return;
        if (settingsBtn.contains(event.target)) return; // the gear handles its own toggle
        settingsPanel.classList.add('hidden');
    };

    // Drive every side effect off the panel's visibility, however it changes
    // (gear toggle, close button, Escape, menu opening, pointer lock): keep
    // aria-expanded in sync, manage the outside-click-to-close listener, and on
    // touch devices tuck away the joysticks and the full-screen tap zone while
    // the panel is up so they can't steal taps/drags from the sliders. This
    // mirrors the gallery light-switch panel.
    const onSettingsVisibilityChanged = () => {
        const open = !settingsPanel.classList.contains('hidden');
        settingsBtn.setAttribute('aria-expanded', String(open));
        if (open) {
            document.addEventListener('pointerdown', onSettingsOutsidePointer, true);
            if (state.isMobile && touchControls) touchControls.classList.remove('visible');
        } else {
            document.removeEventListener('pointerdown', onSettingsOutsidePointer, true);
            // Bring the joysticks back only when mobile play is actually underway.
            if (state.isMobile && !state.isPaused && touchControls) touchControls.classList.add('visible');
        }
    };
    new MutationObserver(onSettingsVisibilityChanged).observe(settingsPanel, { attributes: true, attributeFilter: ['class'] });
    onSettingsVisibilityChanged();

    // Touchscreen devices use the on-screen joysticks, which feel best with a
    // gentler walk speed and look sensitivity than mouse + keyboard. A value
    // remembered from earlier this session takes precedence over the default.
    const stored = loadStoredSettings();
    const defaultWalk = state.isMobile ? 5 : CONTROLS_CONFIG.moveSpeed;
    const defaultLook = state.isMobile ? 0.9 : 1.0;
    const walk = readNumericSetting(stored, 'walk', 2, 14, defaultWalk);      // matches slider min/max
    const look = readNumericSetting(stored, 'look', 0.5, 4, defaultLook);     // matches slider min/max

    // input updates live; persistence waits for the commit ('change') so a drag
    // isn't dozens of synchronous sessionStorage writes per second.
    if (walkSlider) {
        setMoveSpeed(walk);
        walkSlider.value = walk;
        walkValue.textContent = walk;
        walkSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            setMoveSpeed(val);
            walkValue.textContent = val;
        }, { signal });
        walkSlider.addEventListener('change', (e) => saveSetting('walk', parseFloat(e.target.value)), { signal });
    }
    if (lookSlider) {
        setMouseSensitivity(0.002 * look);
        setLookJoystickSensitivity(1.2 * look);
        lookSlider.value = String(look);
        lookValue.textContent = look.toFixed(1);
        lookSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            lookValue.textContent = val.toFixed(1);
            setMouseSensitivity(0.002 * val);
            setLookJoystickSensitivity(1.2 * val);
        }, { signal });
        lookSlider.addEventListener('change', (e) => saveSetting('look', parseFloat(e.target.value)), { signal });
    }
    // (The tire theme's Ambient Brightness dimmer is gone: there is no
    // interior lighting rig outdoors. The sun and moon set the mood here.)
}

function setupNavMenu(signal) {
    const menuBtn = document.getElementById('menu-btn');
    const navMenu = document.getElementById('nav-menu');
    const navClose = document.getElementById('nav-close');
    const skipLink = document.querySelector('.skip-link');
    if (!menuBtn || !navMenu) return;

    // Open the menu and move focus into it. Used by the menu button and by the
    // skip link, whose target (#nav-menu) is display:none until opened, so a
    // plain anchor jump would land on nothing.
    const openNavMenu = (focusFirst) => {
        navMenu.classList.remove('hidden');
        menuBtn.setAttribute('aria-expanded', 'true');
        const settingsPanel = document.getElementById('settings-panel');
        if (settingsPanel) settingsPanel.classList.add('hidden');
        if (!state.isPaused) safeExitPointerLock();
        if (focusFirst) {
            const first = navMenu.querySelector('a, button');
            if (first) first.focus();
        }
    };

    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (navMenu.classList.contains('hidden')) {
            openNavMenu(false);
        } else {
            navMenu.classList.add('hidden');
            menuBtn.setAttribute('aria-expanded', 'false');
        }
    }, { signal });
    if (navClose) navClose.addEventListener('click', () => {
        navMenu.classList.add('hidden');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.focus();
    }, { signal });
    navMenu.addEventListener('click', (e) => e.stopPropagation(), { signal });

    // Close on a tap/click anywhere outside the menu (and outside the menu button,
    // which toggles itself), matching the settings and lighting panels. The
    // capture-phase listener lives only while the menu is open, added after the
    // opening tap's pointerdown has passed so it can't immediately self-close.
    const onNavOutsidePointer = (event) => {
        if (navMenu.classList.contains('hidden')) return;
        if (navMenu.contains(event.target)) return;
        if (menuBtn.contains(event.target)) return; // the menu button toggles itself
        navMenu.classList.add('hidden');
        menuBtn.setAttribute('aria-expanded', 'false');
    };
    new MutationObserver(() => {
        if (navMenu.classList.contains('hidden')) {
            document.removeEventListener('pointerdown', onNavOutsidePointer, true);
        } else {
            document.addEventListener('pointerdown', onNavOutsidePointer, true);
        }
    }).observe(navMenu, { attributes: true, attributeFilter: ['class'] });

    // The skip link is the first focusable element and the keyboard user's way
    // out of the 3D scene. Open the (otherwise hidden) menu and focus its first
    // link rather than jumping to a display:none target.
    if (skipLink) skipLink.addEventListener('click', (e) => {
        e.preventDefault();
        openNavMenu(true);
    }, { signal });
}

// ---- Pointer lock / start / resume ---------------------------------------

function requestPointerLock() {
    if (!state.isLoaded) return;
    tryLockPointer();
}

// Request pointer lock safely. Browsers that haven't adopted the promise-based
// API (e.g. Firefox) return undefined rather than a Promise, so guard before
// calling .catch(); lock failures there surface via the pointerlockerror event.
function tryLockPointer(onError) {
    const result = canvas.requestPointerLock();
    if (result && typeof result.catch === 'function') {
        result.catch(onError || (() => {}));
    }
}

function safeExitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
}

// Autopilot is on by default: the first time the visitor steps through the
// welcome screen, the tour starts itself. One-shot, so a visitor who turns
// it off and later revisits the welcome screen is not re-enrolled.
let autopilotAutoStartPending = true;
function autoStartAutopilot() {
    if (!autopilotAutoStartPending) return;
    autopilotAutoStartPending = false;
    setAutopilotEnabled(true);
    track('autopilot', { on: 1, auto: 1 });
}

function onPointerLockChange() {
    const settingsPanel = document.getElementById('settings-panel');
    if (document.pointerLockElement === canvas) {
        state.isPaused = false;
        blocker.classList.add('hidden');
        hud.classList.add('visible');
        if (settingsPanel) settingsPanel.classList.add('hidden');
        surfaceNudgeOnReturn(); // welcome screen just closed: show a nudge left pending
        autoStartAutopilot();
    } else {
        state.isPaused = true;
        if (!state.isModalOpen) {
            // Esc back to the welcome screen is a clear "stop", so end the
            // tour rather than resuming it unasked on re-entry. Pointer lock
            // also drops when a modal opens, but that path skips this branch
            // so the tour still holds its place through modals.
            blocker.classList.remove('hidden');
            setAutopilotEnabled(false);
        }
        hud.classList.remove('visible');
        clearHover();
    }
}

function startGameMobile() {
    if (!state.isLoaded || !state.isPaused) return;
    state.isPaused = false;
    blocker.classList.add('hidden');
    hud.classList.add('visible');
    touchControls.classList.add('visible');
    surfaceNudgeOnReturn(); // welcome screen just closed: show a nudge left pending
    autoStartAutopilot();
}

function resumeGameAfterModal() {
    setTimeout(() => {
        // A completion that landed while another modal was open waits its turn,
        // surfacing here once that modal has closed (rather than stacking).
        if (pendingCelebration && !state.isModalOpen) {
            pendingCelebration = false;
            openCompleteModal();
            return;
        }
        // A partway nudge that waited out a modal surfaces here too. Celebration
        // wins if both are pending (it retires the nudge), so they never stack.
        if (nudgeIsPending() && !state.isModalOpen && openNudgeModal()) return;
        if (state.isModalOpen) return;
        if (state.isMobile) {
            state.isPaused = false;
            hud.classList.add('visible');
            touchControls.classList.add('visible');
        } else {
            tryLockPointer(() => {
                state.isPaused = true;
                blocker.classList.remove('hidden');
                hud.classList.remove('visible');
            });
        }
    }, 200);
}

// ---- Trail interaction ----------------------------------------------------

function buildRaycastTargets() {
    raycastTargets = [];
    const galleryGroup = getGalleryGroup();
    if (galleryGroup) raycastTargets.push(galleryGroup);
    const host = getGalleryHost();
    if (host) raycastTargets.push(host);
    // The floating "Hello" sign above the gardener is clickable too (opens the hello).
    const helpSign = getHelpSign();
    if (helpSign) raycastTargets.push(helpSign);
    // The guests strolling the garden paths are clickable.
    getVisitorMeshes().forEach(mesh => raycastTargets.push(mesh));

    // Outdoor props (the beds, the greenhouse, the pumpkins, the compost,
    // the signs, the trees, the wheelbarrow) are click-only — they show no
    // hover tooltip, so they live in a separate list the click test adds in
    // but the per-frame hover raycast skips.
    clickTargets = raycastTargets.concat(getOutdoorPropMeshes());
}

/** True if the object (or any ancestor) is the gardener, or his floating
 *  "Hello" sign — clicking either opens the hello dialog. */
function isHostObject(obj) {
    let o = obj;
    while (o) {
        if (o.userData && (o.userData.isShopkeeper || o.userData.isShopkeeperSign)) return true;
        o = o.parent;
    }
    return false;
}

/** Walk up to the gallery-visitor root (the group flagged isCustomer), or null. */
function getVisitorRoot(obj) {
    let o = obj;
    while (o) {
        if (o.userData && o.userData.isCustomer) return o;
        o = o.parent;
    }
    return null;
}

/** Walk up to a clickable outdoor prop root (flagged isProp), or null. */
function getPropRoot(obj) {
    let o = obj;
    while (o) {
        if (o.userData && o.userData.isProp) return o;
        o = o.parent;
    }
    return null;
}

function onCanvasClick(event) {
    if (state.isPaused || state.isModalOpen) return;
    if (document.pointerLockElement) {
        pointer.set(0, 0); // crosshair center
    } else {
        pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    }
    checkPieceClick();
}

function onTapZoneClick(event) {
    if (state.isPaused || state.isModalOpen) return;
    pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    checkPieceClick();
}

function onCanvasTap(event) {
    if (state.isModalOpen) return;
    const touch = event.changedTouches[0];
    pointer.set((touch.clientX / window.innerWidth) * 2 - 1, -(touch.clientY / window.innerHeight) * 2 + 1);
    checkPieceClick();
}

function handleTapInteraction(screenX, screenY) {
    if (state.isPaused || state.isModalOpen) return;
    pointer.set((screenX / window.innerWidth) * 2 - 1, -(screenY / window.innerHeight) * 2 + 1);
    checkPieceClick();
}

/** True if the click aims at a (visible) sky object. Uses the unbounded ray so
 *  it reaches the far-off sky; skips invisible objects (the moon by day, the sun
 *  by night) since raycasting otherwise ignores visibility. */
function isSkyObjectClicked(obj, camera) {
    if (!obj || !obj.visible) return false;
    skyRaycaster.setFromCamera(pointer, camera);
    return skyRaycaster.intersectObject(obj, true).length > 0;
}

/** Nearest intersection under `pointer`. A direct hit (or the pointer-locked
 *  crosshair) is exact; otherwise — a finger tap or windowed-cursor click — a
 *  couple of rings of sample rays around the point are tried so small targets
 *  (like the light switch) are far easier to hit. Returns the intersection or null. */
function pickNearestHit(targets, camera) {
    raycaster.setFromCamera(pointer, camera);
    let best = raycaster.intersectObjects(targets, true)[0] || null;
    // Exact hit, or the precise pointer-locked crosshair: don't widen.
    if (best || document.pointerLockElement) return best;
    const rx = (TAP_TOLERANCE_PX * 2) / window.innerWidth;
    const ry = (TAP_TOLERANCE_PX * 2) / window.innerHeight;
    for (const rf of [0.5, 1]) {
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            _tolPointer.set(pointer.x + Math.cos(ang) * rx * rf, pointer.y + Math.sin(ang) * ry * rf);
            raycaster.setFromCamera(_tolPointer, camera);
            const hit = raycaster.intersectObjects(targets, true)[0];
            if (hit && (!best || hit.distance < best.distance)) best = hit;
        }
    }
    return best;
}

function checkPieceClick() {
    const camera = getCamera();
    if (!camera) return;

    // Sky objects (sun/moon) sit far beyond the normal interaction range.
    // Tested on their own long ray; none are hover targets, so no tooltips.
    // The whole world is open air now, so no indoor gate applies.
    if (isSkyObjectClicked(getSun(), camera)) { openSunModal(); return; }
    if (isSkyObjectClicked(getMoon(), camera)) { openMoonModal(); return; }

    // The click test also includes the click-only outdoor props (the hover test
    // does not). Nearest hit wins, so a guest in front still takes priority
    // over a prop behind them. pickNearestHit adds a forgiving tap radius for
    // touch / windowed clicks (crosshair stays exact).
    const hit = pickNearestHit(clickTargets, camera);
    if (!hit) return;
    const obj = hit.object;

    if (isHostObject(obj)) { openHelpModal(); return; }
    const visitor = getVisitorRoot(obj);
    if (visitor) { openVisitorModal(visitor); return; }
    const prop = getPropRoot(obj);
    if (prop) { openPropModal(prop); return; }
    const piece = resolveGalleryPiece(obj);
    if (piece) openPieceModal(piece);
}

/** Per-frame: highlight whatever the player is looking at (screen center). */
function updateHover() {
    if (state.isPaused || state.isModalOpen) { clearHover(); return; }
    const camera = getCamera();
    if (!camera) return;
    pointer.set(0, 0);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(raycastTargets, true);
    const hitObj = hits.length ? hits[0].object : null;

    // The gardener takes priority when centered in the crosshair.
    if (hitObj && isHostObject(hitObj)) {
        if (!hoveredHost) {
            clearHover();
            hoveredHost = true;
            if (lookLabel) {
                lookLabel.textContent = `Say hello? (${state.isMobile ? 'tap' : 'click'} to chat)`;
                lookLabel.classList.add('visible');
            }
            if (hud) hud.classList.add('targeting');
        }
        return;
    }
    if (hoveredHost) clearHover();

    // A garden guest out for a stroll in the crosshair.
    const visitor = hitObj ? getVisitorRoot(hitObj) : null;
    if (visitor) {
        if (hoveredVisitor !== visitor) {
            clearHover();
            hoveredVisitor = visitor;
            if (lookLabel) {
                lookLabel.textContent = `${state.isMobile ? 'Tap' : 'Click'} to chat with a visitor`;
                lookLabel.classList.add('visible');
            }
            if (hud) hud.classList.add('targeting');
        }
        return;
    }
    if (hoveredVisitor) clearHover();

    // Clickable props (the beds, the greenhouse, the pumpkins, the signs) are
    // intentionally NOT hover-highlighted — clicking still pops a line, but we
    // don't want a tooltip drawing the eye to every lettuce in the garden.

    const data = hitObj ? resolveGalleryPiece(hitObj) : null;

    if (data && data.galleryId !== (hoveredPiece && hoveredPiece.section.id)) {
        clearHover();
        hoveredPiece = getGalleryPieces().find(p => p.section.id === data.galleryId) || null;
        if (hoveredPiece) {
            setPieceHighlight(hoveredPiece, true);
            if (lookLabel) {
                lookLabel.textContent = `${data.galleryTitle} (${state.isMobile ? 'tap' : 'click'} to open)`;
                lookLabel.classList.add('visible');
            }
            hud.classList.add('targeting');
        }
    } else if (!data && hoveredPiece) {
        clearHover();
    }
}

function clearHover() {
    if (hoveredPiece) setPieceHighlight(hoveredPiece, false);
    hoveredPiece = null;
    hoveredHost = false;
    hoveredVisitor = null;
    if (lookLabel) lookLabel.classList.remove('visible');
    if (hud) hud.classList.remove('targeting');
}

function openPieceModal(data) {
    state.isModalOpen = true;
    track('open-piece', { id: data.galleryId, title: data.galleryTitle });
    safeExitPointerLock();
    clearHover();
    if (pieceModalTitle) pieceModalTitle.textContent = data.galleryTitle;
    if (pieceModalSubtitle) pieceModalSubtitle.textContent = data.gallerySubtitle || '';
    if (pieceModalEnter) {
        pieceModalEnter.setAttribute('href', data.galleryUrl);
        if (data.external) {
            // Outbound (the Seed to Seed site): a new tab, so the garden stays open.
            pieceModalEnter.setAttribute('target', '_blank');
            pieceModalEnter.setAttribute('rel', 'noopener');
            pieceModalEnter.textContent = data.linkLabel || `Visit ${data.galleryTitle} →`;
        } else {
            pieceModalEnter.removeAttribute('target');
            pieceModalEnter.removeAttribute('rel');
            pieceModalEnter.textContent = `Enter ${data.galleryTitle} →`;
        }
    }
    pieceModal.classList.remove('hidden');
    hud.classList.remove('visible');
    if (pieceModalEnter) pieceModalEnter.focus();
}

function closePieceModal() {
    pieceModal.classList.add('hidden');
    state.isModalOpen = false;
    resumeGameAfterModal();
}

function openHelpModal() {
    if (!helpModal) return;
    state.isModalOpen = true;
    track('open-hello');
    markChecklistItem('hello');
    safeExitPointerLock();
    clearHover();
    // Tailor the control tips to the input device.
    helpModal.querySelectorAll('.help-desktop').forEach(el => { el.hidden = state.isMobile; });
    helpModal.querySelectorAll('.help-mobile').forEach(el => { el.hidden = !state.isMobile; });
    helpModal.querySelectorAll('.help-verb').forEach(el => { el.textContent = state.isMobile ? 'tap' : 'click'; });
    helpModal.classList.remove('hidden');
    hud.classList.remove('visible');
    const dismiss = helpModal.querySelector('.piece-cancel');
    if (dismiss) dismiss.focus();
}

function closeHelpModal() {
    if (!helpModal) return;
    helpModal.classList.add('hidden');
    state.isModalOpen = false;
    resumeGameAfterModal();
}

// The guests strolling the garden are neighbors and happy clients. Their
// lines are warm and unhurried, and they mostly do one thing: marvel at how
// much the Seed to Seed gardener knows about plants. No slang, and no
// em-dashes or semicolons. They stay in-fiction: the "built by a person and
// an AI" invitation lives in the completion and nudge cards, not here.
const VISITOR_LINES = [
    "I asked him about my droopy squash leaves and he knew the answer before I finished the sentence. The man knows plants.",
    "Seed to Seed built our raised beds last spring. He taught us more in one afternoon than a whole shelf of gardening books.",
    "He can tell what a plant needs just by looking at it. Our tomatoes have never been happier.",
    "We had pests all over our kale last year. One visit, one organic treatment, and one soil lesson later, problem solved.",
    "Ask him about soil. Just be ready, he can talk about soil the way other people talk about their children.",
    "From seed sow to seed save, he really does know every step in between.",
    "The greenhouse is his pride and joy. Everything out here started as a seed in there.",
    "He looked at our sad little garden for five minutes and knew exactly what it needed. Now the neighbors stop to ask about it.",
    "Do check the chalkboard by the path. He keeps a little list of things worth finding out here."
];

function pickLine(list, key) {
    // Defensive: callers may pass a list that no longer exists (e.g. scenery
    // whose hint entry was removed), so never index into undefined.
    if (!list || !list.length) return '';
    // Deterministic-ish pick that varies per pedestrian without Math.random.
    const idx = Math.abs(Math.round(key)) % list.length;
    return list[idx];
}

// Remembers the last line shown for each list so a repeat click on the same NPC
// does not echo the same message twice in a row.
const _lastLineIndex = new Map();

/** Pick a random line from a list, avoiding an immediate repeat of the previous
 *  one for that same list (so clicking an NPC again gives something new). */
function pickRandomLine(list) {
    if (!list || list.length === 0) return '';
    if (list.length === 1) return list[0];
    let idx = Math.floor(Math.random() * list.length);
    if (idx === _lastLineIndex.get(list)) idx = (idx + 1) % list.length;
    _lastLineIndex.set(list, idx);
    return list[idx];
}

// Which kind of thing the shared dialog modal is currently showing, so closing
// it resumes the right behavior ('pedestrian' | 'visitor' | 'scenery'; only the
// first two have an NPC to un-pause).
let dialogKind = null;

/** Show/hide the "Back to the Garden Gate" shortcut. Only the dialogs that
 *  can open far from the spawn (props at the far corners) offer it. */
function setDialogReturnVisible(show) {
    if (dialogReturnBtn) dialogReturnBtn.classList.toggle('hidden', !show);
}

/** Teleport the player back to the garden gate (their start spot, near the
 *  services sign) and close the dialog — saves walking back from a far prop. */
function returnToGallery() {
    // Nudge clear of any guest loitering on the spawn spot so we don't land inside them.
    const spot = findClearSpawn(SEED_CONFIG.spawn.x, SEED_CONFIG.spawn.z, CONTROLS_CONFIG.playerRadius);
    setPlayerPosition(spot.x, CONTROLS_CONFIG.eyeHeight, spot.z);            // original spawn (the garden gate)
    setPlayerRotation(SEED_CONFIG.rotation.yaw, 0);                          // face up the path toward the gardener, level
    closeDialogModal();
}

/** Open the shared dialog modal for a garden guest (praise for the gardener,
 *  with the odd exploring hint mixed in). */
function openVisitorModal(visitorMesh) {
    if (!dialogModal) return;
    state.isModalOpen = true;
    dialogKind = 'visitor';
    track('chat-visitor');
    safeExitPointerLock();
    clearHover();
    copyPlayerPositionTo(_playerPos);
    // Stop the guest and turn them to face the player while they "speak".
    pauseCustomerForDialog(visitorMesh, _playerPos);

    if (dialogModalTitle) dialogModalTitle.textContent = 'A Garden Guest';
    // Random each click so re-clicking the same guest gives a fresh line.
    if (dialogModalMessage) dialogModalMessage.textContent = pickRandomLine(VISITOR_LINES);
    setDialogReturnVisible(false);
    dialogModal.classList.remove('hidden');
    hud.classList.remove('visible');
    const dismiss = dialogModal.querySelector('.piece-cancel');
    if (dismiss) dismiss.focus();
}

/* (The realtor theme's listing detail view and listing dialog are gone: the
 * garden has no podiums, and listings.js stays a stub.) */

// Title + a couple of lines for each kind of clickable outdoor prop. Same warm,
// unhurried garden voice as the rest of the world, free of em-dashes and
// semicolons. Two lines apiece so a second click gives something new. Props
// that are discoveries carry a checklistId so a click ticks the list.
const PROP_CONTENT = {
    planter: {
        title: 'A Raised Bed',
        checklistId: 'planter',
        lines: [
            "Cedar sides, square corners, and soil so good you could grow anything in it. Seed to Seed builds every bed by hand.",
            "Notice the spacing. Nothing crowded, nothing wasted. That is what a plan looks like when somebody knows plants."
        ]
    },
    greenhouse: {
        title: 'The Greenhouse',
        checklistId: 'greenhouse',
        lines: [
            "Every plant in this garden started as a seed on those shelves. Step inside, the door is always open.",
            "Warm, bright, and smelling of soil. This is where the season gets its head start."
        ]
    },
    pumpkin: {
        title: 'The Pumpkin Patch',
        checklistId: 'pumpkin',
        lines: [
            "Grown from seed, fed with that compost over there, and clearly thriving. The big one already has a name.",
            "Sprawling vines and proud orange fruit. Pumpkins are the loudest bragging a quiet gardener does."
        ]
    },
    corn: {
        title: 'The Corn Block',
        lines: [
            "Knee high by the Fourth of July, and well past that now. Corn loves a gardener who understands soil.",
            "Notice it is planted in a block of rows, not a single line. Corn is wind pollinated, and the rows help every ear fill out."
        ]
    },
    compost: {
        title: 'The Compost Bins',
        checklistId: 'compost',
        lines: [
            "Two bays: one cooking, one finished. Seed to Seed will tell you compost is the whole secret, and then talk for an hour.",
            "Kitchen scraps in, black gold out. The best fertilizer money cannot buy."
        ]
    },
    barrel: {
        title: 'The Rain Barrel',
        lines: [
            "Every drop off the greenhouse roof ends up watering the beds. Free water, and the plants prefer it.",
            "The watering can is right there, filled from the sky itself. Waste not."
        ]
    },
    potting: {
        title: 'The Potting Bench',
        lines: [
            "Pots, potting mix, and a trowel worn smooth with use. Real work happens at this bench.",
            "Everything in reach and everything in its place. A tidy bench is a gardener's love language."
        ]
    },
    barrow: {
        title: 'The Wheelbarrow',
        lines: [
            "Loaded with finished compost and headed for the beds. It never sits still for long.",
            "One wheel, two handles, and half the garden has ridden in it at some point."
        ]
    },
    bench: {
        title: 'Have a Seat',
        lines: [
            "The best seat in the yard. From here you can watch the whole garden grow.",
            "Rest as long as you like. Gardens are proof that good things take their time."
        ]
    },
    tree: {
        title: 'The Trees',
        lines: [
            "The apple trees earn their keep, and the shade tree keeps the bench cool. An edible landscape, naturally.",
            "Fruit up top, flowers below, vegetables in the middle. Every layer of this yard grows something."
        ]
    },
    bush: {
        title: 'The Flower Border',
        lines: [
            "Flowers along a vegetable garden are not decoration. They bring the pollinators that set the fruit.",
            "The butterflies work this border all day. Everyone in this garden has a job."
        ]
    },
    fence: {
        title: 'The Picket Fence',
        lines: [
            "A tidy white fence keeps the rabbits guessing and the neighborhood charmed.",
            "The gate stays open for visitors. The rabbits have not figured that out yet, thankfully."
        ]
    }
};
let propTick = 0; // rotates which line a prop shows, no Math.random needed

/** The Our Services sign opens the piece card with the outbound link to
 *  Seed to Seed's services page. */
function openServicesCard() {
    markChecklistItem('services');
    openPieceModal({
        galleryId: 'services',
        galleryTitle: 'Seed to Seed Services',
        gallerySubtitle: 'Raised beds designed, built, and installed. Coaching, pest and plant care, soil help, vacation garden sitting, and more. From seed sow to seed save.',
        galleryUrl: SEED_CONFIG.site.business.servicesUrl,
        linkLabel: 'See the services →',
        external: true
    });
}

/** Open the shared dialog modal for a clicked outdoor prop (its title + a quip).
 *  Two props are special: the chalkboard opens the board close-up, and the
 *  services sign opens the outbound services card. */
function openPropModal(propObj) {
    if (!dialogModal) return;
    const kind = propObj && propObj.userData && propObj.userData.propKind;
    if (kind === 'kiosk') { openWhiteboardView(); return; }
    if (kind === 'services') { openServicesCard(); return; }
    const content = PROP_CONTENT[kind];
    if (!content) return;
    state.isModalOpen = true;
    dialogKind = 'prop';
    track('click-prop', { kind });
    if (content.checklistId) markChecklistItem(content.checklistId);
    safeExitPointerLock();
    clearHover();
    if (dialogModalTitle) dialogModalTitle.textContent = content.title;
    if (dialogModalMessage) dialogModalMessage.textContent = content.lines[propTick++ % content.lines.length];
    setDialogReturnVisible(true); // props can be in a far corner — offer the shortcut back
    dialogModal.classList.remove('hidden');
    hud.classList.remove('visible');
    const dismiss = dialogModal.querySelector('.piece-cancel');
    if (dismiss) dismiss.focus();
}

/** Shared opener for the little sky-object quips (sun / moon). */
function openSkyQuip(title, message) {
    if (!dialogModal) return;
    state.isModalOpen = true;
    dialogKind = 'sky';
    safeExitPointerLock();
    clearHover();
    if (dialogModalTitle) dialogModalTitle.textContent = title;
    if (dialogModalMessage) dialogModalMessage.textContent = message;
    setDialogReturnVisible(true); // viewed from outdoors — offer the shortcut home
    dialogModal.classList.remove('hidden');
    hud.classList.remove('visible');
    const dismiss = dialogModal.querySelector('.piece-cancel');
    if (dismiss) dismiss.focus();
}

function openSunModal() {
    track('click-sky', { body: 'sun' });
    markChecklistItem('sky');
    openSkyQuip('The Sun', "The hardest worker in any garden, and it never sends an invoice. Best admired without staring directly at it.");
}

function openMoonModal() {
    track('click-sky', { body: 'moon' });
    markChecklistItem('sky');
    openSkyQuip('The Moon', "Some gardeners plant by the moon. This one mostly lets it keep watch over the beds at night.");
}

// ---- Garden chalkboard close-up view ----------------------------------------
// Reuses the whiteboard overlay markup and styles (the whiteboard-* ids and
// classes), repainted with the garden chalkboard: the discovery list plus the
// Seed to Seed mission, readable at full size.

// Caption shown beneath the enlarged chalkboard (rotates per click).
const KIOSK_CAPTIONS = [
    "The garden chalkboard. A few things worth finding, and the Seed to Seed mission in a nutshell.",
    "Every good garden keeps its notes somewhere. This one keeps them in chalk."
];
let kioskTick = 0;

/** Open the enlarged chalkboard overlay, mirroring the in-world board
 *  (the live discovery checklist plus the mission). */
function openWhiteboardView() {
    if (!whiteboardView) return;
    state.isModalOpen = true;
    whiteboardOpen = true;
    track('click-prop', { kind: 'kiosk' });
    markChecklistItem('kiosk');
    safeExitPointerLock();
    clearHover();
    if (whiteboardCaption) whiteboardCaption.textContent = pickLine(KIOSK_CAPTIONS, kioskTick++);
    whiteboardView.classList.remove('hidden');
    hud.classList.remove('visible');
    drawWhiteboardView();        // measure + paint now that the overlay is laid out
    const closeBtn = whiteboardView.querySelector('.whiteboard-close');
    if (closeBtn) closeBtn.focus();
}

function closeWhiteboardView() {
    if (!whiteboardView) return;
    whiteboardView.classList.add('hidden');
    whiteboardOpen = false;
    state.isModalOpen = false;
    resumeGameAfterModal();
}

/** Size the close-up canvas to its displayed box at device pixels and paint the
 *  notice board once. (Marking the 'kiosk' discovery above repaints the in-world
 *  board, so this snapshot is already current when it opens.) */
function drawWhiteboardView() {
    if (!whiteboardCanvas) return;
    const rect = whiteboardCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    whiteboardCanvas.width = Math.max(2, Math.round(rect.width * dpr));
    whiteboardCanvas.height = Math.max(2, Math.round(rect.height * dpr));
    const ctx = whiteboardCanvas.getContext('2d');
    if (ctx) drawKioskTo(ctx, whiteboardCanvas.width, whiteboardCanvas.height);

    // On phones the board is rendered wider than the screen and panned; start it
    // centered so it's clearly draggable in both directions.
    if (state.isMobile) {
        const surface = whiteboardView.querySelector('.whiteboard-surface');
        if (surface) surface.scrollLeft = Math.max(0, (surface.scrollWidth - surface.clientWidth) / 2);
    }
}

function closeDialogModal() {
    if (!dialogModal) return;
    dialogModal.classList.add('hidden');
    // Resume whichever kind of NPC was talking ('prop' and 'sky' have none).
    if (dialogKind === 'visitor') resumeCustomerFromDialog();
    dialogKind = null;
    state.isModalOpen = false;
    resumeGameAfterModal();
}

// ---- Partway "reach out" nudge ---------------------------------------------
// Catches engaged visitors who may never find all eight discoveries: once they
// are a few in, reuse the completion celebration's card styling for a single,
// warm, low-pressure invitation to reach out. Shown at most once per session,
// and (like the celebration) it waits out any open modal rather than stacking.

const NUDGE_SHOWN_KEY = 'seedtoseed-nudged';            // session flag: shown (or superseded)
const NUDGE_PENDING_KEY = 'gallery-nudge-pending';  // session flag: decided, not yet shown
const NUDGE_AFTER = 4;                               // surface once this many discoveries are in
const NUDGE_RETURN_DELAY_MS = 400;                   // settle time after the welcome screen closes

function nudgeAlreadyShown() {
    try { return !!sessionStorage.getItem(NUDGE_SHOWN_KEY); } catch (e) { return false; }
}
function nudgeIsPending() {
    try { return !!sessionStorage.getItem(NUDGE_PENDING_KEY); } catch (e) { return false; }
}
/** Retire the nudge for the rest of the session (shown, or superseded by the
 *  completion celebration), so it never re-fires. */
function markNudgeDone() {
    try {
        sessionStorage.setItem(NUDGE_SHOWN_KEY, '1');
        sessionStorage.removeItem(NUDGE_PENDING_KEY);
    } catch (e) { /* ignore */ }
}

function maybeNudgeContact(progress) {
    if (!nudgeModal || progress.complete || progress.done < NUDGE_AFTER) return;
    if (nudgeAlreadyShown() || nudgeIsPending()) return;
    // Record the intent in sessionStorage (so it survives the visitor following a
    // piece's link out to a 2D page) but do not show yet. The discovery that
    // crosses the threshold is itself triggered by an interaction whose own window
    // opens a beat *after* this fires, so we always defer: the window's close
    // (-> resumeGameAfterModal) surfaces it in the same session, and
    // surfaceNudgeOnReturn() handles the case where the visitor navigated away
    // before that window ever closed.
    try { sessionStorage.setItem(NUDGE_PENDING_KEY, '1'); } catch (e) { /* ignore */ }
}

/** Show the nudge. Returns false (leaving it pending) when the welcome/blocker
 *  screen is up, so it never flashes behind that overlay on return from a 2D
 *  page; surfaceNudgeOnReturn() re-fires it once the visitor has clicked in. */
function openNudgeModal() {
    if (!nudgeModal) return false;
    if (blocker && !blocker.classList.contains('hidden')) return false;
    markNudgeDone();
    state.isModalOpen = true;
    track('contact-nudge');
    safeExitPointerLock();
    clearHover();
    nudgeModal.classList.remove('hidden');
    hud.classList.remove('visible');
    const enter = nudgeModal.querySelector('.piece-enter');
    if (enter) enter.focus();
    return true;
}

/** Surface a nudge left pending from a prior page (the visitor followed a piece's
 *  link out before it could show), a short beat after the welcome screen closes. */
function surfaceNudgeOnReturn() {
    if (!nudgeIsPending()) return;
    setTimeout(() => {
        if (nudgeIsPending() && !state.isModalOpen &&
            blocker && blocker.classList.contains('hidden')) {
            openNudgeModal();
        }
    }, NUDGE_RETURN_DELAY_MS);
}

function closeNudgeModal() {
    if (!nudgeModal) return;
    nudgeModal.classList.add('hidden');
    state.isModalOpen = false;
    resumeGameAfterModal();
}

// ---- Discovery-complete celebration (#1) + Share (#7) ----------------------

let pendingCelebration = false;            // set when completion lands mid-modal
const CELEBRATED_KEY = 'seedtoseed-celebrated';

/** Fire the completion celebration the first time all discoveries are found.
 *  Once per session, and never stacked on another open modal — if one is open it
 *  waits, surfacing from resumeGameAfterModal when that modal closes. */
function maybeCelebrateCompletion() {
    if (!completeModal) return;
    try { if (sessionStorage.getItem(CELEBRATED_KEY)) return; } catch (e) { /* ignore */ }
    try { sessionStorage.setItem(CELEBRATED_KEY, '1'); } catch (e) { /* ignore */ }
    markNudgeDone(); // completing supersedes any still-pending partway nudge
    track('discovery-complete');
    if (state.isModalOpen) { pendingCelebration = true; return; }
    openCompleteModal();
}

function openCompleteModal() {
    if (!completeModal) return;
    state.isModalOpen = true;
    safeExitPointerLock();
    clearHover();
    completeModal.classList.remove('hidden');
    hud.classList.remove('visible');
    const enter = completeModal.querySelector('.piece-enter');
    if (enter) enter.focus();
}

function closeCompleteModal() {
    if (!completeModal) return;
    completeModal.classList.add('hidden');
    state.isModalOpen = false;
    resumeGameAfterModal();
}

/** Wire the outward-facing links from SEED_CONFIG.site. The featured
 *  business's services links point at Seed to Seed's own site (new tab), and
 *  the builder CTAs point at the serving site's contact page, root-relative.
 *
 *  The Home button this function used to wire is gone, and with it the only
 *  same-tab link off this page. SEED_CONFIG.site.home is still in config,
 *  read by nothing here, kept as the record of the serving root. */
function applySiteLinks() {
    const site = SEED_CONFIG.site;
    ['complete-contact', 'nudge-contact'].forEach((id) => {
        const link = document.getElementById(id);
        if (link) link.href = site.builder.contactPath;
    });
    ['hello-services', 'complete-services', 'nudge-services'].forEach((id) => {
        const link = document.getElementById(id);
        if (link) link.href = site.business.servicesUrl;
    });
    const bizBtn = document.getElementById('biz-btn');
    if (bizBtn) {
        bizBtn.href = site.business.websiteUrl;
        bizBtn.title = `Visit the ${site.business.name} website`;
        bizBtn.setAttribute('aria-label', `Visit the ${site.business.name} website (opens in a new tab)`);
    }
}

/** Share the site: native share sheet where available, clipboard copy otherwise,
 *  and a mailto as a last resort. Driven by the celebration's "Share this". */
async function shareSite() {
    const shareData = {
        title: SEED_CONFIG.site.share.title,
        text: SEED_CONFIG.site.share.text,
        // The directory URL the tour is actually served from ('.' resolves
        // away an explicit index.html), so shares stay correct on any domain
        // with no configuration.
        url: new URL('.', window.location.href).href
    };
    try {
        if (navigator.share) {
            await navigator.share(shareData);
            track('share', { method: 'native' });
            return;
        }
    } catch (e) {
        if (e && e.name === 'AbortError') return; // visitor dismissed the share sheet
    }
    try {
        await navigator.clipboard.writeText(shareData.url);
        track('share', { method: 'copy' });
        flashShareCopied();
    } catch (e) {
        window.location.href = 'mailto:?subject=' + encodeURIComponent(shareData.title) +
            '&body=' + encodeURIComponent(shareData.text + ' ' + shareData.url);
    }
}

/** Briefly confirm a clipboard copy on the Share button itself. */
function flashShareCopied() {
    const btn = document.getElementById('complete-share');
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = 'Link copied ✓';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1800);
}

/* (The trail theme's one-tap mailto upgrade is gone here: on SceneXP the
 * builder funnel goes through the site's own contact page, which reveals
 * the address behind its own proof of work. The in-world CTAs stay plain
 * page links, so they work identically with or without crypto.) */

/** Close whichever modal is currently open (used by the Escape key). */
function closeActiveModal() {
    if (completeModal && !completeModal.classList.contains('hidden')) closeCompleteModal();
    else if (nudgeModal && !nudgeModal.classList.contains('hidden')) closeNudgeModal();
    else if (whiteboardView && !whiteboardView.classList.contains('hidden')) closeWhiteboardView();
    else if (helpModal && !helpModal.classList.contains('hidden')) closeHelpModal();
    else if (dialogModal && !dialogModal.classList.contains('hidden')) closeDialogModal();
    else closePieceModal();
}

// ---- Render loop ----------------------------------------------------------

function animate() {
    if (!state.isRunning) return;
    const now = performance.now();
    state.deltaTime = Math.min((now - state.lastTime) / 1000, 0.1);
    state.lastTime = now;
    update(state.deltaTime);
    // While the notice-board overlay is open it covers the screen, so skip the
    // (wasted) 3D render — it runs its own lightweight 2D pass.
    if (!whiteboardOpen) render();
}

function update(deltaTime) {
    updateControls(deltaTime, state.isPaused);

    // Autopilot only steers during active play; withholding the update while
    // paused or in a modal is what politely suspends the tour.
    if (!state.isPaused && !state.isModalOpen) updateAutopilot(deltaTime);

    copyPlayerPositionTo(_playerPos);
    updateStorePeople(_playerPos, deltaTime);
    updateDayNightCycle(deltaTime);
    updateBackgroundAnimations(deltaTime);
    updateGarden(deltaTime);
    updateGardenLights(getNightFactor());

    // Stepping into the greenhouse is itself a discovery: tick it the moment
    // the visitor crosses the doorway (markChecklistItem no-ops on repeats).
    if (!state.isPaused && isInsideGreenhouse(_playerPos)) {
        markChecklistItem('greenhouse');
    }

    // Bob + billboard the gardener's floating Hello sign toward the camera
    _elapsed += deltaTime;
    updateCheckoutSign(_elapsed, getCamera().position);

    // Hover detection doesn't need to run every frame — ~10 Hz feels instant
    // and avoids a per-frame raycast (and its array allocation).
    _hoverAccum += deltaTime;
    if (_hoverAccum >= 0.1) {
        _hoverAccum = 0;
        updateHover();
    }
}

// ---- Collision ------------------------------------------------------------

function setupCollision() {
    // Trail fixtures (Dad and his bike, benches, fences, the kiosk, tree
    // trunks, the riverbank), plus the (currently empty) listing colliders so
    // the stub seam keeps its shape.
    const boxes = [
        ...getStoreCollisionBoxes(),
        ...getListingColliders().map(box => ({ box, type: 'podium' })),
    ];
    setCollisionCallback((oldPos, newPos, radius) => checkCollision(oldPos, newPos, radius, boxes));
}

// ---- Cleanup / state ------------------------------------------------------

function cleanup() {
    state.isRunning = false;
    const renderer = getRenderer();
    if (renderer) renderer.setAnimationLoop(null);
    if (cleanupController) cleanupController.abort();
}

// Dwell-time tracking: report a one-time session-end (with elapsed seconds) when
// the page is first hidden or torn down. Fires at most once per load. Note this
// means backgrounding the tab ends the measured session, so the number is a
// "time to first leave" — a reasonable lower bound on engagement.
let _sessionStart = 0;
let _sessionEnded = false;

function endSession() {
    if (_sessionEnded || !_sessionStart) return;
    _sessionEnded = true;
    trackFinal('session-end', { seconds: Math.round((Date.now() - _sessionStart) / 1000) });
}

export function getState() {
    return { ...state };
}

// ---- Boot -----------------------------------------------------------------

/** Best-effort check that the browser can create a WebGL context. */
function hasWebGL() {
    try {
        const c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext &&
            (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) {
        return false;
    }
}

/** Route visitors whose browser can't run the 3D scene to the 2D site, with a
 *  brief note, instead of leaving them staring at a blank canvas. */
function fallbackTo2D() {
    try {
        const loading = document.getElementById('loading-screen');
        if (loading) loading.classList.remove('hidden');
        const status = document.getElementById('load-status');
        if (status) status.textContent = "This browser can't run the 3D view. Taking you to the standard site…";
    } catch (e) { /* ignore — we're redirecting regardless */ }
    setTimeout(() => { window.location.replace('/'); }, 2500);
}

/** Start the experience, but fall back to the 2D site if WebGL is unavailable
 *  or the scene fails to build (so a hard failure never ends in a blank page).
 *  Note: errors thrown later inside the render loop are not auto-recovered. */
function boot() {
    if (!hasWebGL()) { fallbackTo2D(); return; }
    init().catch((err) => {
        console.error('[Trail] 3D init failed, falling back to the 2D site:', err);
        fallbackTo2D();
    });
}

// Auto-boot only in a browser. Under test (Node, no `document`) importing this
// module must stay side-effect-free rather than booting the whole 3D app.
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}

// Exposed for unit tests only; production code uses the named export above.
export const __test__ = { bufToHex, readNumericSetting, pickLine };
