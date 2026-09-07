// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for the home office experience.
 *
 * Coordinates the scene, first-person controls, and the office world:
 * Steve at his sit-stand desk building SceneXP (super meta, yes), the
 * tuxedo cat asleep on his son's little blue desk, the whiteboard with
 * the plan on it, and a small room's worth of stories behind every click.
 */

import { STEVE_CONFIG } from './config.min.js';
import { getProofOfWork, bufToHex, installCardFocusTrap, shieldOverlayControl } from '../../shared/js/boot-1.0.0.min.js';
import { checkCollision } from '../../shared/js/collision-1.0.0.min.js';
import {
    initScene, handleResize, render, getCamera, getScene, getRenderer,
    updateDayNightCycle, removeTestObjects, isTouchDevice
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
    updateCheckoutSign, getHelpSign, findClearSpawn,
    getOutdoorPropMeshes,
    updateStudio, getDancerMeshes, getRoquiMesh,
    pauseDancerForDialog, resumeDancerFromDialog,
    pauseRoquiForDialog, resumeRoquiFromDialog,
    updateStudioBoard, drawStudioBoardTo,
    setStudioBrightness, updateInteriorAmbientLight
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
    '.skip-link, #blocker, #hud, #touch-controls, #settings-btn, #settings-panel, #game-canvas';
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
let whiteboardView, whiteboardCanvas, whiteboardCaption; // the whiteboard close-up
let lightPanel, lightPanelSlider, lightPanelValue; // the light switch's floating dimmer
let completeModal; // discovery-complete celebration
let nudgeModal; // partway "reach out" invitation (reuses the celebration card)
let dialogReturnBtn; // teleport shortcut inside the shared dialog modal (kept plumbed, never shown: the room is small)

// Schedule-board close-up view state. The board can change while open (a
// discovery can tick mid-view), but it's repainted on every open, which is
// enough.
let whiteboardOpen = false;

// Raycasting for "look at" highlight and click-to-open
const raycaster = new THREE.Raycaster();
raycaster.far = 16;
const pointer = new THREE.Vector2();
const _tolPointer = new THREE.Vector2(); // offset sample point for forgiving taps
const TAP_TOLERANCE_PX = 26;             // hit radius for touch taps / windowed clicks
let raycastTargets = [];      // hover + click targets (Steve, mainly)
let clickTargets = [];        // raycastTargets plus the click-only office props

// Currently looked-at / highlighted target
let hoveredPiece = null;
let hoveredHost = false;
let hoveredDancer = null;
let _hoverAccum = 0; // throttle accumulator for hover raycasts
let _elapsed = 0;    // running time for sign bob/billboard animation

// Reusable per-frame objects (avoid GC churn)
const _playerPos = new THREE.Vector3();

let cleanupController = null;

// ---- Initialization -------------------------------------------------------

// ---- Proof-of-work load gate ----------------------------------------------
// The gate itself lives in the shared boot part; its knobs come from
// STEVE_CONFIG.proofOfWork (the legacy 'gallery-pow' storage key is kept so
// visitors' cached proofs survive).

// The solved proof's hash, kept so the in-world CTAs can stamp a one-tap email
// with the same "Ref <6 hex>" the contact page uses (cross-checks the access log).

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
    lightPanel = document.getElementById('light-panel');
    lightPanelSlider = document.getElementById('light-slider');
    lightPanelValue = document.getElementById('light-value');

    if (!canvas) return;

    // Wire the welcome screen's directory link (the serving site's root) and
    // the contact CTAs
    // (the builder's marketing pages, also at the root) from STEVE_CONFIG.site,
    // so config stays the single home for these values. Equivalent fallbacks
    // are baked into the HTML for the no-JS path.
    applySiteLinks();

    // Soft bot deterrent: solve a tiny proof of work before building the scene
    // (or reuse a still-valid one from sessionStorage). Hand the hash to the
    // telemetry layer so it tags every ping.
    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(STEVE_CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Initializing renderer…', 25);
    initScene(canvas, STEVE_CONFIG);

    updateLoadingStatus('Framing up the office…', 55);
    initStore();
    removeTestObjects();

    updateLoadingStatus('Tiptoeing past the cat…', 75);
    // No wall pieces in this theme (GALLERY_SECTIONS is empty); this keeps
    // the gallery group / raycast plumbing intact while building none.
    initGallery();

    // listings.js is a stub here, same as the tire and trail themes:
    // initListings creates the empty raycast container and buildListings is
    // a no-op.
    initListings(getScene());
    buildListings(SAMPLE_LISTINGS);

    buildRaycastTargets();

    // Discovery checklist: install the studio item list, restore any session
    // progress, and keep the schedule board mirrored to it. Items get ticked
    // by the interaction handlers below (markChecklistItem). Seed the board
    // once now.
    initChecklist(STEVE_CONFIG.checklist);
    onChecklistChange((items, progress) => {
        updateStudioBoard(items, progress);
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
    updateStudioBoard(getChecklistItems(), getChecklistProgress());

    updateLoadingStatus('Preparing controls…', 90);
    initControls(STEVE_CONFIG);
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
        if (clickPrompt) clickPrompt.textContent = 'Tap to step inside';
        blocker.addEventListener('click', startGameMobile, { signal });
        blocker.addEventListener('touchend', (e) => { e.preventDefault(); startGameMobile(); }, { signal });
    } else {
        blocker.addEventListener('click', requestPointerLock, { signal });
    }

    // THE DIRECTORY LINK SITS ON TOP OF ALL OF THAT. The whole overlay is the
    // start button, and on touch the handler above calls preventDefault(),
    // which would swallow the synthetic click and leave the link inert. Stop
    // the start events short of it so the anchor can follow its own href.
    shieldOverlayControl(document.getElementById('explore-link'), { signal });

    document.addEventListener('pointerlockchange', onPointerLockChange, { signal });
    document.addEventListener('pointerlockerror', () => {}, { signal });

    canvas.addEventListener('click', onCanvasClick, { signal });
    canvas.addEventListener('touchend', onCanvasTap, { signal });
    const tapZone = document.getElementById('tap-zone');
    if (tapZone) tapZone.addEventListener('click', onTapZoneClick, { signal });

    // Piece modal close
    pieceModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closePieceModal, { signal }));

    // Hola modal close
    if (helpModal) helpModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeHelpModal, { signal }));

    // Dancer/prop dialog modal close
    if (dialogModal) dialogModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeDialogModal, { signal }));

    // Teleport shortcut inside the dialog modal (plumbed but never shown here)
    if (dialogReturnBtn) dialogReturnBtn.addEventListener('click', returnToSpawn, { signal });

    // Schedule-board close-up close
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

    // Light-switch dimmer panel: close button and its slider (input adjusts
    // live, change commits to storage and telemetry via applyBrightness).
    if (lightPanel) lightPanel.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeLightPanel, { signal }));
    if (lightPanelSlider) {
        lightPanelSlider.addEventListener('input', (e) => applyBrightness(parseFloat(e.target.value), false), { signal });
        lightPanelSlider.addEventListener('change', (e) => applyBrightness(parseFloat(e.target.value)), { signal });
    }

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

    // (No autopilot tour in this experience: the office is one small room,
    // best explored on foot. The shared part is simply not imported.)

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
// Movement, look, and brightness preferences are remembered for the browser
// session (sessionStorage) and reapplied on the next load, so a visitor's
// tweaks survive reloads within a visit.
const SETTINGS_STORAGE_KEY = 'steve-settings';

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
    const lightSlider = document.getElementById('settings-light-slider');
    const lightValue = document.getElementById('settings-light-value');
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
    // the panel is up so they can't steal taps/drags from the sliders.
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

    // Ambient Brightness: this slider and the light switch's floating
    // dimmer are the same control in two places. applyBrightness keeps
    // them (and the room) in sync.
    settingsLightSlider = lightSlider;
    settingsLightValue = lightValue;
    if (lightSlider) {
        applyBrightness(readNumericSetting(stored, 'brightness', 0, 1.5, 1), false); // matches slider min/max
        lightSlider.addEventListener('input', (e) => applyBrightness(parseFloat(e.target.value), false), { signal });
        lightSlider.addEventListener('change', (e) => applyBrightness(parseFloat(e.target.value)), { signal });
    }
}

// ---- Office lighting control (the light switch) ---------------------------
// Clicking the light switch opens a floating dimmer panel over it instead of
// a dialog, the same interaction the Interstate shop's switch uses. No
// backdrop: the room dims and brightens live under the slider.

let settingsLightSlider = null;   // the settings panel's brightness slider
let settingsLightValue = null;
let _lightSwitchTarget = null;    // the clicked switch, for panel positioning

/** Apply an ambient brightness level everywhere at once: the room (via the
 *  store's dimmer), the settings panel's slider, and the light switch
 *  panel's slider, so the two controls never disagree. Saving (the commit
 *  path) also persists the value and pings telemetry. */
function applyBrightness(val, save = true) {
    setStudioBrightness(val);
    const pct = `${Math.round(val * 100)}%`;
    if (settingsLightSlider) settingsLightSlider.value = String(val);
    if (settingsLightValue) settingsLightValue.textContent = pct;
    if (lightPanelSlider) lightPanelSlider.value = String(val);
    if (lightPanelValue) lightPanelValue.textContent = pct;
    if (save) {
        saveSetting('brightness', val);
        track('set-brightness', { brightness: Math.round(val * 100) });
    }
}

/** Show the lighting panel over the clicked switch. It floats with no
 *  opaque backdrop, so the room stays visible and responds live. Treated
 *  as a modal for input gating. */
function openLightPanel(switchObj) {
    if (!lightPanel) return;
    state.isModalOpen = true;
    track('open-light-switch');
    safeExitPointerLock();
    clearHover();
    if (switchObj) _lightSwitchTarget = switchObj;
    lightPanel.classList.remove('hidden');
    positionLightPanelOverSwitch();
    hud.classList.remove('visible');
    // No backdrop, so on touch devices tuck the joysticks away
    // (resumeGameAfterModal restores them).
    if (state.isMobile && touchControls) touchControls.classList.remove('visible');
    if (lightPanelSlider) lightPanelSlider.focus();
    // No backdrop, so close on any press outside the panel. Added now, after
    // the opening click's pointerdown has already fired, so that click can't
    // immediately self-close it.
    document.addEventListener('pointerdown', onLightPanelOutsidePointer, true);
}

function onLightPanelOutsidePointer(event) {
    if (lightPanel && !lightPanel.contains(event.target)) closeLightPanel();
}

/** Center the panel over the switch by projecting its world position to
 *  screen space, clamped so the whole panel stays on-screen. Falls back to
 *  the CSS position when the camera or switch is unavailable. */
function positionLightPanelOverSwitch() {
    const camera = getCamera();
    if (!lightPanel || !_lightSwitchTarget || !camera) return;
    const p = new THREE.Vector3();
    _lightSwitchTarget.getWorldPosition(p);
    p.project(camera);
    const w = window.innerWidth, h = window.innerHeight;
    let x = (p.x * 0.5 + 0.5) * w;
    let y = (-p.y * 0.5 + 0.5) * h;
    const rect = lightPanel.getBoundingClientRect();
    const m = 12; // keep a small margin from the viewport edges
    x = Math.max(rect.width / 2 + m, Math.min(w - rect.width / 2 - m, x));
    y = Math.max(rect.height / 2 + m, Math.min(h - rect.height / 2 - m, y));
    lightPanel.style.left = `${x}px`;
    lightPanel.style.top = `${y}px`;
    lightPanel.style.bottom = 'auto';
    lightPanel.style.transform = 'translate(-50%, -50%)';
}

function closeLightPanel() {
    if (!lightPanel) return;
    document.removeEventListener('pointerdown', onLightPanelOutsidePointer, true);
    lightPanel.classList.add('hidden');
    state.isModalOpen = false;
    resumeGameAfterModal();
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
    // which toggles itself), matching the settings panel. The capture-phase
    // listener lives only while the menu is open, added after the opening tap's
    // pointerdown has passed so it can't immediately self-close.
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

function onPointerLockChange() {
    const settingsPanel = document.getElementById('settings-panel');
    if (document.pointerLockElement === canvas) {
        state.isPaused = false;
        blocker.classList.add('hidden');
        hud.classList.add('visible');
        if (settingsPanel) settingsPanel.classList.add('hidden');
        surfaceNudgeOnReturn(); // welcome screen just closed: show a nudge left pending
    } else {
        state.isPaused = true;
        if (!state.isModalOpen) blocker.classList.remove('hidden');
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

// ---- Studio interaction ----------------------------------------------------

function buildRaycastTargets() {
    raycastTargets = [];
    const galleryGroup = getGalleryGroup();
    if (galleryGroup) raycastTargets.push(galleryGroup);
    // Steve himself (getRoquiMesh is the shared host seam's legacy name)…
    const host = getRoquiMesh();
    if (host) raycastTargets.push(host);
    // …his floating greeter sign, when the config enables one (off here:
    // the host needs no tag in a room this small, so getHelpSign is null)…
    const helpSign = getHelpSign();
    if (helpSign) raycastTargets.push(helpSign);
    // …and any ambient NPCs (none in the office; the seam stays wired).
    getDancerMeshes().forEach(mesh => raycastTargets.push(mesh));

    // Office props (the desks, the cat, the whiteboard, the closet, and the
    // rest) are click-only — they show no hover tooltip, so they live in a
    // separate list the click test adds in but the hover raycast skips.
    clickTargets = raycastTargets.concat(getOutdoorPropMeshes());
}

/** True if the object (or any ancestor) is Steve, or a floating greeter
 *  sign — clicking either opens his greeting. */
function isHostObject(obj) {
    let o = obj;
    while (o) {
        if (o.userData && (o.userData.isShopkeeper || o.userData.isShopkeeperSign)) return true;
        o = o.parent;
    }
    return false;
}

/** Walk up to the dancer root (the group flagged isDancer), or null. */
function getDancerRoot(obj) {
    let o = obj;
    while (o) {
        if (o.userData && o.userData.isDancer) return o;
        o = o.parent;
    }
    return null;
}

/** Walk up to a clickable studio prop root (flagged isProp), or null. */
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

/** Nearest intersection under `pointer`. A direct hit (or the pointer-locked
 *  crosshair) is exact; otherwise — a finger tap or windowed-cursor click — a
 *  couple of rings of sample rays around the point are tried so small targets
 *  (like the iPhone) are far easier to hit. Returns the intersection or null. */
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

    // The click test also includes the click-only studio props (the hover test
    // does not). Nearest hit wins, so a dancer in front still takes priority
    // over a prop behind them. pickNearestHit adds a forgiving tap radius for
    // touch / windowed clicks (crosshair stays exact). The whole world is one
    // room now, so no sky objects and no indoor gate apply.
    const hit = pickNearestHit(clickTargets, camera);
    if (!hit) return;
    const obj = hit.object;

    if (isHostObject(obj)) { openHelpModal(); return; }
    const dancer = getDancerRoot(obj);
    if (dancer) { openDancerModal(dancer); return; }
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

    // Roqui takes priority when centered in the crosshair.
    if (hitObj && isHostObject(hitObj)) {
        if (!hoveredHost) {
            clearHover();
            hoveredHost = true;
            if (lookLabel) {
                lookLabel.textContent = `Say hi to Steve? (${state.isMobile ? 'tap' : 'click'} to chat)`;
                lookLabel.classList.add('visible');
            }
            if (hud) hud.classList.add('targeting');
        }
        return;
    }
    if (hoveredHost) clearHover();

    // A dancer in the crosshair.
    const dancer = hitObj ? getDancerRoot(hitObj) : null;
    if (dancer) {
        if (hoveredDancer !== dancer) {
            clearHover();
            hoveredDancer = dancer;
            if (lookLabel) {
                const verb = state.isMobile ? 'tap' : 'click';
                lookLabel.textContent = `${verb} to say hi between songs`;
                lookLabel.classList.add('visible');
            }
            if (hud) hud.classList.add('targeting');
        }
        return;
    }
    if (hoveredDancer) clearHover();

    // Clickable props (the mirror, the speakers, the disco ball) are
    // intentionally NOT hover-highlighted — clicking still pops a line, but we
    // don't want a tooltip drawing the eye to every corner of the studio.

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
    hoveredDancer = null;
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
        pieceModalEnter.textContent = `Enter ${data.galleryTitle} →`;
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
    // Steve pauses his typing and turns around to chat; the cat sleeps on.
    pauseRoquiForDialog();
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
    resumeRoquiFromDialog();
    state.isModalOpen = false;
    resumeGameAfterModal();
}

// The office has no ambient NPCs: the only person here is Steve, and the
// only other resident is asleep on the job. The dancer dialog plumbing
// below stays wired for experiences that copy this one, but with no lines
// and no dancer meshes it never fires.
const DANCER_LINES = [];

function pickLine(list, key) {
    // Defensive: callers may pass a list that no longer exists (e.g. scenery
    // whose hint entry was removed), so never index into undefined.
    if (!list || !list.length) return '';
    // Deterministic-ish pick that varies per caller without Math.random.
    const idx = Math.abs(Math.round(key)) % list.length;
    return list[idx];
}

// Remembers the last line shown for each list so a repeat click on the same NPC
// does not echo the same message twice in a row.
const _lastLineIndex = new Map();

/** Pick a random line from a list, avoiding an immediate repeat of the previous
 *  one for that same list (so clicking a dancer again gives something new). */
function pickRandomLine(list) {
    if (!list || list.length === 0) return '';
    if (list.length === 1) return list[0];
    let idx = Math.floor(Math.random() * list.length);
    if (idx === _lastLineIndex.get(list)) idx = (idx + 1) % list.length;
    _lastLineIndex.set(list, idx);
    return list[idx];
}

// Which kind of thing the shared dialog modal is currently showing, so closing
// it resumes the right behavior ('dancer' | 'prop'; only dancers un-pause).
let dialogKind = null;

/** Show/hide the teleport shortcut. The studio is one small room, so it is
 *  never shown here, but the plumbing stays for the next experience that
 *  copies this one. */
function setDialogReturnVisible(show) {
    if (dialogReturnBtn) dialogReturnBtn.classList.toggle('hidden', !show);
}

/** Teleport the player back to their start spot at the back of the class and
 *  close the dialog. Unused in this small room; kept wired for the seam. */
function returnToSpawn() {
    const spot = findClearSpawn(STEVE_CONFIG.spawn.x, STEVE_CONFIG.spawn.z, CONTROLS_CONFIG.playerRadius);
    setPlayerPosition(spot.x, CONTROLS_CONFIG.eyeHeight, spot.z);
    setPlayerRotation(STEVE_CONFIG.rotation.yaw, 0);
    closeDialogModal();
}

/** Open the shared dialog modal for a dancer in the class. */
function openDancerModal(dancerMesh) {
    if (!dialogModal) return;
    state.isModalOpen = true;
    dialogKind = 'dancer';
    track('greet-dancer');
    markChecklistItem('dancer');
    safeExitPointerLock();
    clearHover();
    // The clicked dancer steps out and turns to chat; the class dances on.
    pauseDancerForDialog(dancerMesh);

    if (dialogModalTitle) dialogModalTitle.textContent = 'Between Tasks';
    // Random each click so re-clicking the same dancer gives a fresh line.
    if (dialogModalMessage) dialogModalMessage.textContent = pickRandomLine(DANCER_LINES);
    setDialogReturnVisible(false);
    dialogModal.classList.remove('hidden');
    hud.classList.remove('visible');
    const dismiss = dialogModal.querySelector('.piece-cancel');
    if (dismiss) dismiss.focus();
}

// Title + a couple of lines for each kind of clickable office prop. A warm,
// courteous host's voice with a little dry humor, free of em-dashes and
// semicolons. Two lines apiece so a second click gives something new. Props
// that are discoveries carry a checklistId so a click ticks the list. The
// whiteboard is special: clicking it opens the close-up view instead (see
// openPropModal).
const PROP_CONTENT = {
    board: {
        // Opens the close-up view instead (see openPropModal), so no lines.
        title: 'The Whiteboard',
        checklistId: 'board',
        lines: []
    },
    cat: {
        title: 'The Office Manager',
        checklistId: 'cat',
        lines: [
            "That is the boss. Tuxedo coat, green eyes when she chooses to show them, asleep on the job since nine this morning.",
            "She supervises every line of SceneXP code from that exact spot. Please do not wake her, the release schedule depends on it."
        ]
    },
    standDesk: {
        title: 'The Sit-Stand Desk',
        checklistId: 'desk',
        lines: [
            "The command center, raised to standing. The chair underneath is mostly ceremonial.",
            "This is where SceneXP gets built, including the room you are standing in right now. It is desks all the way down."
        ]
    },
    closet: {
        title: 'The Closet',
        checklistId: 'closet',
        lines: [
            "Two accordion doors, and behind them the family's entire archive of cables that might be useful someday.",
            "Every tiny office needs a closet that absorbs whatever the room cannot. This one absorbs plenty."
        ]
    },
    litter: {
        title: 'The Litter Box',
        checklistId: 'litter',
        lines: [
            "The office manager insists on a private restroom. The mat handles her paperwork.",
            "Beige, discreet, and tucked in the corner. A small price for excellent management."
        ]
    },
    door: {
        title: 'The Office Door',
        lines: [
            "It stays closed during deep work hours. Which is most hours, honestly.",
            "Beyond it is the rest of Steve's house. The good stuff is in here."
        ]
    },
    trash: {
        title: 'The Trash Can',
        lines: [
            "Mostly full of ideas that seemed great at midnight.",
            "Every good office keeps one within tossing distance. Steve's aim is improving."
        ]
    },
    cabinet: {
        title: 'The File Cabinet',
        lines: [
            "Two drawers of the paperwork that survives in a paperless world. There is always some.",
            "The top drawer keeps the important things, like warranty cards for devices long gone."
        ]
    },
    lamp: {
        title: "The Banker's Lamp",
        lines: [
            "Green glass and brass, a little library reading room the size of a cabinet top.",
            "It mostly lights the wifi router. The router has never once said thank you."
        ]
    },
    router: {
        title: 'The Wifi Router',
        lines: [
            "The little box that carries SceneXP from this room out to you. Please be nice to it.",
            "Three green lights means all is well. Two means Steve is already walking over."
        ]
    },
    surge: {
        title: 'The Surge Protector',
        lines: [
            "Everything important in here plugs into one of these. The office runs a tidy ship.",
            "One strip on the desk and one on the cabinet. Count the outlets and you know the whole room."
        ]
    },
    sonDesk: {
        title: 'The Little Blue Desk',
        lines: [
            "Steve's son's desk, navy blue with three drawers. He picked the color himself at nine years old.",
            "Homework happens here, allegedly. The cat believes it is her daybed with drawers."
        ]
    },
    sonChair: {
        title: 'The Striped Chair',
        lines: [
            "Navy wood and a striped cushion. It has survived two growth spurts so far.",
            "Pushed in neatly, which usually means somebody was reminded to push it in neatly."
        ]
    },
    ringLamp: {
        title: 'The Ring Lamp',
        lines: [
            "A flexible ring light with a pencil cup for a base. The pencils are load bearing.",
            "There is one on each desk. In a small office, a good idea gets bought twice."
        ]
    },
    deskChair: {
        title: 'The Desk Chair',
        lines: [
            "Faux leather, five wheels, fully parked. On standing desk days it waits patiently.",
            "It rolls out for about one meeting a day. The attendee is usually the cat."
        ]
    },
    outlet: {
        title: 'The Outlet',
        lines: [
            "The humble source of all of this. One beige outlet, doing its best.",
            "The surge protector's cord runs down here behind the desk, out of sight and out of trouble."
        ]
    },
    macbook: {
        title: 'The MacBook Air',
        lines: [
            "The forge itself. Every SceneXP room so far has come out of this laptop.",
            "Propped on a stand at exactly the right height. The stand took three tries, like most things worth getting right."
        ]
    },
    monitor: {
        title: 'The Samsung Monitor',
        lines: [
            "Big, beige, and silver, and full of code. The wide screen holds a whole room's blueprint at once.",
            "Steve stares into this thing for hours and somehow rooms come out of it. Fair trade."
        ]
    },
    keyboard: {
        title: 'The Keyboard',
        lines: [
            "Wireless, white, and quietly clicky. The S, the C, and the X are earning their keep this year.",
            "No cords at the front of the desk. A tidy desk is half the job, Steve says, usually while tidying instead of working."
        ]
    },
    mouse: {
        title: 'The Magic Mouse',
        lines: [
            "A low white arc on a black pad. It has traveled miles without ever leaving the desk.",
            "The mouse pad is the one dark rectangle allowed on an otherwise tidy desktop."
        ]
    },
    knobGuard: {
        title: 'The Doorknob Guard',
        lines: [
            "The wall lost this argument a few times before the little white shield arrived.",
            "In a room this size, the door and the wall had to learn to share."
        ]
    },
    // (No 'lightswitch' entry: clicking the switch opens the dimmer panel
    // instead of a dialog. See openPropModal.)
    vent: {
        title: 'The Heat Vent',
        lines: [
            "Heat rises, except in Steve's house, where it mostly negotiates.",
            "In winter this is the second warmest spot in the room. The first is wherever the cat is."
        ]
    },
    catBowls: {
        title: 'The Executive Dining Area',
        lines: [
            "Food and water, refilled on a schedule the management strictly enforces.",
            "Stainless steel only. The office manager has standards."
        ]
    }
};
let propTick = 0; // rotates which line a prop shows, no Math.random needed

/** Open the shared dialog modal for a clicked office prop (its title + a
 *  quip). Two props are special: the whiteboard opens the close-up view,
 *  and the light switch opens the floating dimmer panel. */
function openPropModal(propObj) {
    if (!dialogModal) return;
    const kind = propObj && propObj.userData && propObj.userData.propKind;
    if (kind === 'board') { openWhiteboardView(); return; }
    if (kind === 'lightswitch') { openLightPanel(propObj); return; }

    const content = PROP_CONTENT[kind];
    if (!content || !content.lines.length) return;
    state.isModalOpen = true;
    dialogKind = 'prop';
    track('click-prop', { kind });
    if (content.checklistId) markChecklistItem(content.checklistId);
    safeExitPointerLock();
    clearHover();
    if (dialogModalTitle) dialogModalTitle.textContent = content.title;
    if (dialogModalMessage) dialogModalMessage.textContent = content.lines[propTick++ % content.lines.length];
    setDialogReturnVisible(false);
    dialogModal.classList.remove('hidden');
    hud.classList.remove('visible');
    const dismiss = dialogModal.querySelector('.piece-cancel');
    if (dismiss) dismiss.focus();
}

// ---- Schedule-board close-up view -------------------------------------------
// Reuses the whiteboard overlay markup and styles (the whiteboard-* ids and
// classes), painted with the schedule board: the discovery list, the pointer
// to Roqui's schedule, and the dedication, readable at full size.

// Caption shown beneath the enlarged board (rotates per click).
const BOARD_CAPTIONS = [
    "The plan, in marker: delight visitors, honor the honorees, ship it.",
    "Every SceneXP room starts as scribbles on this board. This room included."
];
let boardTick = 0;

/** Open the enlarged schedule-board overlay, mirroring the in-world board
 *  (the live discovery checklist plus the notes and dedication). */
function openWhiteboardView() {
    if (!whiteboardView) return;
    state.isModalOpen = true;
    whiteboardOpen = true;
    track('click-prop', { kind: 'board' });
    markChecklistItem('board');
    safeExitPointerLock();
    clearHover();
    if (whiteboardCaption) whiteboardCaption.textContent = pickLine(BOARD_CAPTIONS, boardTick++);
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
 *  schedule board once. (Marking the 'board' discovery above repaints the
 *  in-world board, so this snapshot is already current when it opens.) */
function drawWhiteboardView() {
    if (!whiteboardCanvas) return;
    const rect = whiteboardCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    whiteboardCanvas.width = Math.max(2, Math.round(rect.width * dpr));
    whiteboardCanvas.height = Math.max(2, Math.round(rect.height * dpr));
    const ctx = whiteboardCanvas.getContext('2d');
    if (ctx) drawStudioBoardTo(ctx, whiteboardCanvas.width, whiteboardCanvas.height);

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
    // Resume whichever kind of NPC was talking ('prop' has none).
    if (dialogKind === 'dancer') resumeDancerFromDialog();
    dialogKind = null;
    state.isModalOpen = false;
    resumeGameAfterModal();
}

// ---- Partway "reach out" nudge ---------------------------------------------
// Catches engaged visitors who may never find all eight discoveries: once they
// are a few in, reuse the completion celebration's card styling for a single,
// warm, low-pressure invitation to reach out. Shown at most once per session,
// and (like the celebration) it waits out any open modal rather than stacking.

const NUDGE_SHOWN_KEY = 'steve-nudged';            // session flag: shown (or superseded)
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

// ---- Discovery-complete celebration + Share ---------------------------------

let pendingCelebration = false;            // set when completion lands mid-modal
const CELEBRATED_KEY = 'steve-celebrated';

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

/** Wire the outward-facing links from STEVE_CONFIG.site. There is no featured
 *  business here: the experience honors a person, so the welcome screen's
 *  directory link goes to the serving site's root (Phase 5 rule: the marketing
 *  pages live at every hosting domain's root), in a new tab. The contact CTAs point at the
 *  builder's contact page, also root-relative; they may later be upgraded in
 *  place to one-tap mailtos, with that page as the fallback. */
function applySiteLinks() {
    const site = STEVE_CONFIG.site;
    // The directory link at the foot of the welcome overlay, which replaced
    // the floating Home button. Only the href is wired: its text names
    // SceneXP.com out loud, so unlike the old icon-only button it does not
    // need a title or an aria-label supplied from config, and the markup
    // carries an equivalent href for the no-JS path.
    const explore = document.getElementById('explore-link');
    if (explore) explore.href = site.home.path;
    ['complete-contact', 'nudge-contact'].forEach((id) => {
        const link = document.getElementById(id);
        if (link) link.href = site.builder.contactPath;
    });
}

/** Share the site: native share sheet where available, clipboard copy otherwise,
 *  and a mailto as a last resort. Driven by the celebration's "Share this". */
async function shareSite() {
    const shareData = {
        title: STEVE_CONFIG.site.share.title,
        text: STEVE_CONFIG.site.share.text,
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

/** Close whichever modal is currently open (used by the Escape key). */
function closeActiveModal() {
    if (completeModal && !completeModal.classList.contains('hidden')) closeCompleteModal();
    else if (nudgeModal && !nudgeModal.classList.contains('hidden')) closeNudgeModal();
    else if (whiteboardView && !whiteboardView.classList.contains('hidden')) closeWhiteboardView();
    else if (lightPanel && !lightPanel.classList.contains('hidden')) closeLightPanel();
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
    // While the schedule-board overlay is open it covers the screen, so skip
    // the (wasted) 3D render — it runs its own lightweight 2D pass.
    if (!whiteboardOpen) render();
}

function update(deltaTime) {
    updateControls(deltaTime, state.isPaused);

    copyPlayerPositionTo(_playerPos);
    // Order matters: the day/night pass moves the sun and rewrites the scene
    // lights' intensities every frame, and the interior rig then rebalances
    // against them (nightBoost after dark). Interior after day/night, always.
    updateDayNightCycle(deltaTime);
    updateInteriorAmbientLight();
    // The class, the mirror twins, the disco ball, the speakers, the music,
    // and the party lighting
    updateStudio(_playerPos, deltaTime);
    updateBackgroundAnimations(deltaTime);

    // Bob + billboard the floating greeter sign toward the camera. A no-op
    // when the config leaves the sign off (as it does here); the call stays
    // so flipping greeterSign.enabled back on needs no main.js change.
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
    // Studio fixtures (the walls, the mirror, Roqui and each dancer's spot,
    // the speakers, the tables, the bench, the plants), plus the (currently
    // empty) listing colliders so the stub seam keeps its shape.
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
        console.error('[Studio] 3D init failed, falling back to the 2D site:', err);
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
