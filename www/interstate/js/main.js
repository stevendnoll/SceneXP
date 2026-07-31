// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for the Interstate Tire shop experience.
 *
 * Coordinates the scene, first-person controls, and the shop world: the
 * waiting room and its channel-flipping TV, the garage with the lift and the
 * tire racks, the host behind the counter, the street outside, and historic
 * Railroad Ave with the 1892 freight depot down the lane.
 */

import { INTERSTATE_CONFIG } from './config.min.js';
import { getProofOfWork, bufToHex } from '../../shared/js/boot-1.0.0.min.js';
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
    updateDoors, updateSidewalkPedestrians, updateBackgroundAnimations,
    updateInteriorAmbientLight, updateStorePeople, updateCheckoutSign, updateGalleryMonitor, updateWaitingRoomTV, drawMonitorTo, drawWhiteboardTo,
    getGalleryHost, getHelpSign, getPedestrianMeshes, pausePedestrianForDialog,
    resumePedestrianFromDialog, arePedestriansZombies,
    setGalleryWaypoints, initGalleryVisitors, getVisitorMeshes, findClearSpawn,
    pauseCustomerForDialog, resumeCustomerFromDialog, getDecorMeshes,
    getOutdoorPropMeshes,
    getLightSwitchMesh, setInteriorLightScale, getInteriorLightScale,
    updateWhiteboardChecklist
} from './store.min.js';
import {
    initGallery, getGalleryGroup, resolveGalleryPiece,
    getGalleryPieces, setPieceHighlight, getViewingWaypoints, getMatsGroup
} from './gallery.min.js';
import {
    initChecklist, markChecklistItem, onChecklistChange,
    getChecklistItems, getChecklistProgress
} from '../../shared/js/checklist-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';
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
    '.skip-link, #blocker, #hud, #touch-controls, #autopilot-btn, #home-btn, #biz-btn, #settings-btn, #settings-panel, #game-canvas';
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
    // Defer one microtask so the specific dialog has been un-hidden first. This
    // lets us skip the light panel, which is intentionally non-modal: it floats
    // over the live scene and closes on an outside click, so the background must
    // stay interactive.
    queueMicrotask(() => {
        if (!state.isModalOpen) return;
        if (lightPanel && !lightPanel.classList.contains('hidden')) return;
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
let monitorView, monitorCanvas, monitorCaption;
let whiteboardView, whiteboardCanvas, whiteboardCaption;
let completeModal, cardModal; // discovery-complete celebration + shop contact's business card
let nudgeModal; // partway "reach out" invitation (reuses the celebration card)
let dialogReturnBtn; // "Back to the Shop" shortcut inside the shared dialog modal
let lightPanel, lightSlider, lightValue; // gallery lighting control (light switch)
let settingsLightSlider, settingsLightValue; // mirror brightness control in the settings menu

// Studio monitor view state (mirrors the desk's terminal at full size while open).
let monitorOpen = false;
let monitorRaf = 0;
// Whiteboard close-up view state. The board is static while open (nothing can
// change it mid-view), so it's painted once on open rather than in a loop.
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
let hoveredPedestrian = null;
let hoveredVisitor = null;
let hoveredCard = null; // the shop contact's business card (a deliberate CTA, so it does get a label)
let _hoverAccum = 0; // throttle accumulator for hover raycasts
let _elapsed = 0;    // running time for sign bob/billboard animation
let _wasInside = null; // last known inside/outside state, for enter/leave telemetry

// Reusable per-frame objects (avoid GC churn)
const _playerPos = new THREE.Vector3();
const _camPos = new THREE.Vector3(); // player world position for the inside-store test

let cleanupController = null;

// ---- Initialization -------------------------------------------------------

// ---- Proof-of-work load gate ----------------------------------------------
// The gate itself lives in the shared boot part; its knobs come from
// INTERSTATE_CONFIG.proofOfWork (the legacy 'gallery-pow' storage key is kept so
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
    monitorView = document.getElementById('monitor-view');
    monitorCanvas = document.getElementById('monitor-canvas');
    monitorCaption = document.getElementById('monitor-caption');
    whiteboardView = document.getElementById('whiteboard-view');
    whiteboardCanvas = document.getElementById('whiteboard-canvas');
    whiteboardCaption = document.getElementById('whiteboard-caption');
    completeModal = document.getElementById('complete-modal');
    cardModal = document.getElementById('card-modal');
    nudgeModal = document.getElementById('nudge-modal');
    lightPanel = document.getElementById('light-panel');
    lightSlider = document.getElementById('light-slider');
    lightValue = document.getElementById('light-value');
    settingsLightSlider = document.getElementById('settings-light-slider');
    settingsLightValue = document.getElementById('settings-light-value');

    if (!canvas) return;

    // Wire the Home button (the featured business's site) and the contact
    // CTAs (the builder's marketing pages at the serving domain's root) from
    // INTERSTATE_CONFIG.site, so config stays the single home for these values.
    // Equivalent fallbacks are baked into the HTML for the no-JS path.
    applySiteLinks();

    // Soft bot deterrent: solve a tiny proof of work before building the scene
    // (or reuse a still-valid one from sessionStorage). Hand the hash to the
    // telemetry layer so it tags every ping.
    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(INTERSTATE_CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Initializing renderer…', 25);
    initScene(canvas, INTERSTATE_CONFIG);

    // The building footprint (and every other dimension) lives in config.js;
    // STORE_CONFIG is a frozen re-export of INTERSTATE_CONFIG.building, so nothing
    // mutates it at runtime anymore.

    updateLoadingStatus('Building the space…', 55);
    initStore();
    removeTestObjects();

    updateLoadingStatus('Stocking the shop…', 75);
    // No wall pieces in the tire theme (GALLERY_SECTIONS is empty); this keeps
    // the gallery group / floor-mat / raycast plumbing intact while building none.
    initGallery();

    // Tire theme: listings.js is a stub. initListings still creates the empty
    // 'listings' raycast container (the seam where the deferred service
    // stations milestone will build its clickable displays), and
    // buildListings is a no-op.
    initListings(getScene());
    buildListings(SAMPLE_LISTINGS);

    // Register the waiting-room waypoints, then add the customers waiting on
    // their cars: they drift between the chairs by the window, the garage
    // viewing window, the vending machine, and the counter. Phase 4 minimized
    // world: a greeter (the host) plus two indoor visitors.
    setGalleryWaypoints([
        { x: -5.8, z: 16.4, lookAtX: -5.8, lookAtZ: 19.2 },  // chairs + magazines
        { x: -3.4, z: 8.0,  lookAtX: -1.5, lookAtZ: 8.0 },   // garage viewing window
        { x: -4.2, z: 4.0,  lookAtX: -2.6, lookAtZ: 4.0 },   // vending machine
        { x: -9.0, z: 12.4, lookAtX: -9.0, lookAtZ: 10.4 }   // service counter
    ]);
    initGalleryVisitors(INTERSTATE_CONFIG.indoorVisitors.count);
    buildRaycastTargets();

    // Discovery checklist: install the tire item list, restore any session
    // progress, build the HUD panel, and keep the studio whiteboard mirrored to
    // it. Items get ticked by the interaction handlers below
    // (markChecklistItem). Seed the board once now.
    initChecklist(INTERSTATE_CONFIG.checklist);
    onChecklistChange((items, progress) => {
        updateWhiteboardChecklist(items, progress);
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
    updateWhiteboardChecklist(getChecklistItems(), getChecklistProgress());

    // (The portfolio site's visitor-activity dashboard and leaderboard are
    // gone from this theme, along with their background snaps polling.)

    updateLoadingStatus('Preparing controls…', 90);
    initControls(INTERSTATE_CONFIG);
    initAutopilot(INTERSTATE_CONFIG.autopilot);
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

    // "Back to Showroom" shortcut inside the dialog modal
    if (dialogReturnBtn) dialogReturnBtn.addEventListener('click', returnToGallery, { signal });

    // Studio monitor close
    if (monitorView) monitorView.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeMonitorView, { signal }));

    // Whiteboard close-up close
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

    // The shop's business card: close buttons.
    if (cardModal) cardModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeCardModal, { signal }));

    // Lighting control: reapply any persisted brightness (syncs both sliders and
    // the lights), then wire the light-switch panel's close button and dimmer.
    const storedBrightness = readNumericSetting(loadStoredSettings(), 'brightness', 0, 1.5, 1); // matches slider min/max
    applyBrightness(storedBrightness, false);
    if (lightPanel) lightPanel.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeLightPanel, { signal }));
    if (lightSlider) lightSlider.addEventListener('input', (e) => applyBrightness(parseFloat(e.target.value), false), { signal });
    // Persist + telemetry fire on commit (release / keypress), not every drag
    // tick, so one adjustment is a single sessionStorage write and one ping.
    if (lightSlider) lightSlider.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        saveSetting('brightness', val);
        track('set-brightness', { brightness: Math.round(val * 100) });
    }, { signal });

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

    setupSettingsPanel(signal);
    setupNavMenu(signal);
    setupChecklistPanel(signal);

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
const SETTINGS_STORAGE_KEY = 'interstate-settings';

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

/** Apply an ambient-brightness value: update the lights, keep both brightness
 *  sliders (the light switch and the settings menu) and their labels in sync,
 *  and optionally persist it. Setting .value in code does not fire input/change,
 *  so syncing the sibling slider can't loop. */
function applyBrightness(val, save = true) {
    setInteriorLightScale(val);
    const pct = `${Math.round(val * 100)}%`;
    if (lightSlider) lightSlider.value = String(val);
    if (lightValue) lightValue.textContent = pct;
    if (settingsLightSlider) settingsLightSlider.value = String(val);
    if (settingsLightValue) settingsLightValue.textContent = pct;
    if (save) saveSetting('brightness', val);
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
    // Ambient Brightness here mirrors the light-switch dimmer (applyBrightness
    // keeps both sliders + the lights in sync); its initial value was set when
    // the persisted brightness was reapplied during setup. Save on commit only.
    if (settingsLightSlider) {
        settingsLightSlider.addEventListener('input', (e) => applyBrightness(parseFloat(e.target.value), false), { signal });
        settingsLightSlider.addEventListener('change', (e) => {
            const val = parseFloat(e.target.value);
            saveSetting('brightness', val);
            track('set-brightness', { brightness: Math.round(val * 100) });
        }, { signal });
    }
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

// ---- Gallery interaction --------------------------------------------------

function buildRaycastTargets() {
    raycastTargets = [];
    const galleryGroup = getGalleryGroup();
    if (galleryGroup) raycastTargets.push(galleryGroup);
    const host = getGalleryHost();
    if (host) raycastTargets.push(host);
    // The floating "Help" sign above the host is clickable too (opens help).
    const helpSign = getHelpSign();
    if (helpSign) raycastTargets.push(helpSign);
    // Sidewalk passersby (and night-time zombies) are clickable too.
    getPedestrianMeshes().forEach(mesh => raycastTargets.push(mesh));
    // …as are the gallery visitors strolling the hall.
    getVisitorMeshes().forEach(mesh => raycastTargets.push(mesh));
    // Plants are clickable "scenery" too (they pop a how-to hint). The track-
    // light fixtures are already inside the gallery group, so they need no
    // separate registration.
    getDecorMeshes().forEach(mesh => raycastTargets.push(mesh));
    // The floor mats are clickable scenery as well (a little one-liner).
    const mats = getMatsGroup();
    if (mats) raycastTargets.push(mats);

    // Outdoor props (benches, lamps, planters, the welcome mat, bushes, trees)
    // and the door light switch are click-only — they show no hover tooltip, so
    // they live in a separate list the click test adds in but the per-frame hover
    // raycast skips.
    clickTargets = raycastTargets.concat(getOutdoorPropMeshes());
    const lightSwitch = getLightSwitchMesh();
    if (lightSwitch) clickTargets.push(lightSwitch);
}

/** True if the object (or any ancestor) is the gallery host greeter, or its
 *  floating "Help" sign — clicking either opens the help dialog. */
function isHostObject(obj) {
    let o = obj;
    while (o) {
        if (o.userData && (o.userData.isShopkeeper || o.userData.isShopkeeperSign)) return true;
        o = o.parent;
    }
    return false;
}

/** Walk up to the pedestrian root (the group flagged isPedestrian), or null. */
function getPedestrianRoot(obj) {
    let o = obj;
    while (o) {
        if (o.userData && o.userData.isPedestrian) return o;
        o = o.parent;
    }
    return null;
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

/** Walk up to a clickable scenery object (flagged isScenery: plant/light), or null. */
function getSceneryRoot(obj) {
    let o = obj;
    while (o) {
        if (o.userData && o.userData.isScenery) return o;
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

/** True if the object (or any ancestor) is the door light switch. */
function isLightSwitchObject(obj) {
    let o = obj;
    while (o) {
        if (o.userData && o.userData.isLightSwitch) return true;
        o = o.parent;
    }
    return false;
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

/** True when the player is standing within the gallery's footprint. Used to
 *  gate interior interactions: walls are not raycast targets, so without this a
 *  ray from outside passes through the exterior wall and lets you hover/click
 *  the portraits from the street (see bug screenshots). */
function isPlayerInsideStore() {
    const cam = getCamera();
    if (!cam) return false;
    cam.getWorldPosition(_camPos);
    const halfW = STORE_CONFIG.width / 2;
    const frontZ = STORE_CONFIG.positionZ + STORE_CONFIG.depth / 2;
    const backZ = STORE_CONFIG.positionZ - STORE_CONFIG.depth / 2;
    return Math.abs(_camPos.x - STORE_CONFIG.positionX) < halfW &&
        _camPos.z > backZ && _camPos.z < frontZ;
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

    // Sky objects (sun/moon) sit far beyond the normal interaction range
    // and only outdoors (indoors the ceiling would be "in front" of the sky).
    // Tested on their own long ray; none are hover targets, so no tooltips.
    if (!isPlayerInsideStore()) {
        if (isSkyObjectClicked(getSun(), camera)) { openSunModal(); return; }
        if (isSkyObjectClicked(getMoon(), camera)) { openMoonModal(); return; }
    }

    // The click test also includes the click-only outdoor props (the hover test
    // does not). Nearest hit wins, so an interior object in front still takes
    // priority over a prop behind it. pickNearestHit adds a forgiving tap radius
    // for touch / windowed clicks (crosshair stays exact).
    const hit = pickNearestHit(clickTargets, camera);
    if (!hit) return;
    const obj = hit.object;

    // Walls aren't raycast targets, so a ray can pass straight through them. We
    // therefore gate by where the player stands: outdoors only exterior things
    // respond, indoors only interior ones — otherwise you could click outdoor
    // props (or passersby) through the storefront glass, and vice versa.
    if (!isPlayerInsideStore()) {
        const ped = getPedestrianRoot(obj);
        if (ped) { openDialogModal(ped); return; }
        const prop = getPropRoot(obj);
        if (prop) { openPropModal(prop); return; }
        return; // outdoors: nothing interior to consider
    }

    // Interior objects (light switch, portraits, host, visitors, decor).
    if (isLightSwitchObject(obj)) { openLightPanel(); return; }
    if (isHostObject(obj)) { openHelpModal(); return; }
    const visitor = getVisitorRoot(obj);
    if (visitor) { openVisitorModal(visitor); return; }
    const scenery = getSceneryRoot(obj);
    if (scenery) { openSceneryModal(scenery); return; }
    const piece = resolveGalleryPiece(obj);
    if (piece) openPieceModal(piece);
}

/** Per-frame: highlight whatever piece the player is looking at (screen center). */
function updateHover() {
    if (state.isPaused || state.isModalOpen) { clearHover(); return; }
    const camera = getCamera();
    if (!camera) return;
    pointer.set(0, 0);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(raycastTargets, true);
    const hitObj = hits.length ? hits[0].object : null;

    // Interior objects only highlight while inside (see isPlayerInsideStore) so
    // portraits/host don't light up through the exterior walls from the street.
    const inside = isPlayerInsideStore();

    // The host greeter takes priority when centered in the crosshair.
    if (hitObj && inside && isHostObject(hitObj)) {
        if (!hoveredHost) {
            clearHover();
            hoveredHost = true;
            if (lookLabel) {
                lookLabel.textContent = `Need help? (${state.isMobile ? 'tap' : 'click'} to ask the host)`;
                lookLabel.classList.add('visible');
            }
            if (hud) hud.classList.add('targeting');
        }
        return;
    }
    if (hoveredHost) clearHover();

    // A sidewalk passerby (or night-time zombie) in the crosshair. Exterior, so
    // only highlight from outdoors — matching the click gate, otherwise the
    // crosshair would invite a click (through the storefront glass) that the
    // inside/outside gating then ignores.
    const ped = (hitObj && !inside) ? getPedestrianRoot(hitObj) : null;
    if (ped) {
        if (hoveredPedestrian !== ped) {
            clearHover();
            hoveredPedestrian = ped;
            if (lookLabel) {
                const verb = state.isMobile ? 'tap' : 'click';
                lookLabel.textContent = arePedestriansZombies()
                    ? `${verb} to face the wanderer`
                    : `${verb} to greet the passerby`;
                lookLabel.classList.add('visible');
            }
            if (hud) hud.classList.add('targeting');
        }
        return;
    }
    if (hoveredPedestrian) clearHover();

    // A gallery visitor in the crosshair (interior — gated by inside).
    const visitor = (hitObj && inside) ? getVisitorRoot(hitObj) : null;
    if (visitor) {
        if (hoveredVisitor !== visitor) {
            clearHover();
            hoveredVisitor = visitor;
            if (lookLabel) {
                lookLabel.textContent = `${state.isMobile ? 'Tap' : 'Click'} to chat with the customer`;
                lookLabel.classList.add('visible');
            }
            if (hud) hud.classList.add('targeting');
        }
        return;
    }
    if (hoveredVisitor) clearHover();

    // The shop contact's business card is a deliberate call-to-action, so unlike
    // ordinary decor it DOES get an inviting hover label to draw the eye.
    const cardScenery = (hitObj && inside) ? getSceneryRoot(hitObj) : null;
    if (cardScenery && cardScenery.userData.sceneryKind === 'businesscard') {
        if (hoveredCard !== cardScenery) {
            clearHover();
            hoveredCard = cardScenery;
            if (lookLabel) {
                lookLabel.textContent = `${state.isMobile ? 'Tap' : 'Click'} to read the shop's card`;
                lookLabel.classList.add('visible');
            }
            if (hud) hud.classList.add('targeting');
        }
        return;
    }
    if (hoveredCard) clearHover();

    // Clickable scenery (plants, track-light fixtures) is intentionally NOT
    // hover-highlighted — clicking still pops a how-to hint, but we don't want a
    // tooltip drawing the eye to the decor.

    const data = (hitObj && inside) ? resolveGalleryPiece(hitObj) : null;

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
    hoveredPedestrian = null;
    hoveredVisitor = null;
    hoveredCard = null;
    if (lookLabel) lookLabel.classList.remove('visible');
    if (hud) hud.classList.remove('targeting');
}

function openPieceModal(data) {
    state.isModalOpen = true;
    track('open-piece', { id: data.galleryId, title: data.galleryTitle });
    markChecklistItem('art');
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
    track('open-help');
    markChecklistItem('host');
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

// ---- Gallery lighting control (the door light switch) ---------------------

/** Show the lighting panel. It's a floating panel (no opaque backdrop) so the
 *  room stays visible and dims/brightens live as the slider moves. Treated as a
 *  modal for input gating so the blocker stays hidden while pointer lock is off. */
function openLightPanel() {
    if (!lightPanel) return;
    state.isModalOpen = true;
    track('open-light-switch', { level: getInteriorLightScale().toFixed(2) });
    markChecklistItem('switch');
    safeExitPointerLock();
    clearHover();
    // Sync the slider/label to the current brightness.
    const scale = getInteriorLightScale();
    if (lightSlider) lightSlider.value = String(scale);
    if (lightValue) lightValue.textContent = `${Math.round(scale * 100)}%`;
    lightPanel.classList.remove('hidden');
    positionLightPanelOverSwitch();
    hud.classList.remove('visible');
    // No backdrop here, so on touch devices hide the joysticks (resumeGameAfterModal
    // restores them) to keep them from peeking out behind the panel.
    if (state.isMobile && touchControls) touchControls.classList.remove('visible');
    if (lightSlider) lightSlider.focus();
    // No backdrop, so close on any interaction outside the panel. pointerdown
    // (added now, after the opening click's pointerdown already fired) means the
    // click that opened the panel can't immediately self-close it.
    document.addEventListener('pointerdown', onLightPanelOutsidePointer, true);
}

/** Close the lighting panel when the player presses anywhere outside it. */
function onLightPanelOutsidePointer(event) {
    if (lightPanel && !lightPanel.contains(event.target)) closeLightPanel();
}

/** Place the lighting panel centered over the light switch the player just
 *  clicked, by projecting the switch's world position to screen space, then
 *  clamp it so the whole panel stays on-screen. Falls back to the CSS position
 *  (bottom-center) if the camera or switch isn't available. */
function positionLightPanelOverSwitch() {
    const sw = getLightSwitchMesh();
    const camera = getCamera();
    if (!lightPanel || !sw || !camera) return;
    const p = new THREE.Vector3();
    sw.getWorldPosition(p).project(camera);
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

// The people you meet on the street welcome the visitor and point them toward
// the Interstate Tire shop and the service bays inside. The tone is professional and
// courteous, like a gracious neighbor, and always welcoming. No slang, and no
// em-dashes or semicolons. Daytime folks are bright and friendly; at night the
// same neighbors become gentle, good-humored night characters who keep the
// courteous tone. They stay in-fiction: the "built by a person and an AI"
// invitation lives in the completion and nudge cards, not in this ambient chatter.
const PASSERBY_LINES = [
    "Good day to you. Interstate Tire is just there, and the folks inside are as honest as they come.",
    "Welcome to the neighborhood. If your car needs anything, the shop with the big open bay is the place.",
    "A lovely afternoon for a walk. The tire shop is open, and there is no rush at all.",
    "Hello there. Tires, brakes, alignments, they handle it all. Do head over for a look.",
    "It is a pleasure to see a visitor. The garage door is up, so feel free to peek inside.",
    "Do step in whenever it suits you. The waiting room is comfortable and the coffee shop is close by.",
    "Welcome along. Have a look at the garage. There is usually something interesting up on the lift.",
    "So glad you found us. This shop has kept the whole street rolling for years.",
    "Please make yourself at home inside. The host at the counter is happy to help with any questions.",
    "A fine day to get those tires looked at. The shop is right there whenever you are ready.",
    "Hello, and welcome. The shop is open whenever you would like to stop in.",
    "Good day. Feel free to look around the whole shop. There is no need to hurry here."
];
const ZOMBIE_LINES = [
    "Good evening. We keep to the night out here, but the tire shop is open and glad of company.",
    "Welcome, and good evening. The shop sign looks rather lovely under the lamplight. Do step inside for a look.",
    "It is a pleasure to meet someone out at this hour. The garage is yours to explore.",
    "Good evening to you. The night is quiet and the bay door is up. Do take your time inside.",
    "Welcome along. We are creatures of the night, but the shop inside is warm and well lit. Go on in.",
    "The garage is lovely after dark. Step inside whenever you are ready for a look around.",
    "Welcome. The hour is late and the street is calm, which is rather a fine time to talk tires.",
    "A fine night for a quiet look around. The whole shop is open to you.",
    "Good evening. We linger out here, but the warmth is all indoors. Please do go in.",
    "So glad you came by tonight. Take all the time you like, as the night is in no hurry."
];

// The customer waiting on her car: courteous lines that double as gentle
// how-to hints for exploring the shop. One is shown at random when she is
// clicked/tapped (see openVisitorModal).
const VISITOR_LINES = [
    "They have my car up on the lift right now. You can watch through the big window there.",
    "The chairs by the front glass are the good ones. You can see the whole street go by.",
    "If you have a question, the host at the counter is happy to help.",
    "The TV keeps the wait pleasant, and the vending machine handles the rest.",
    "Take a peek in the garage if you like. The bay door is always up during the day.",
    "Honest work and fair prices here. That is why I keep coming back."
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

// On-theme hints shown when the player clicks a bit of shop scenery (a corner
// plant, the waiting chairs, the vending machine, the garage fixtures). Warm,
// courteous host voice throughout.
const SCENERY_HINTS = {
    plant: [
        "Lovely, isn't it? Purely for the ambiance, though. The real show is through the viewing window, where the cars go up on the lift.",
        "Ah, the waiting room greenery. It keeps the place feeling cared for, which is rather the point of the whole shop.",
        "Even the plants are here to make the wait pleasant. Do have a look around the garage while you are here."
    ],
    sofa: [
        "A good place to sit a while. Every waiting room deserves a comfortable spot and a clear view of the street.",
        "Go on, take the weight off. Tire work always goes faster when you are not watching the clock."
    ],
    vending: [
        "Stocked with the four essential food groups: caffeine, sugar, salt, and one mysterious button nobody has ever dared press. Exact change appreciated.",
        "The unofficial heart of any waiting room. Runs on loose change and good intentions, and the C7 spring has been thinking about letting go for years."
    ],
    tv: [
        "The waiting room lineup: the welcome loop, a tire tip, the big race, and the classics channel. It flips through them all on its own, so no need to hunt for the remote.",
        "Nobody has seen the remote in years. The TV changes its own channels now, and honestly it has pretty good taste."
    ],
    lift: [
        "Up she goes. The two-post lift is the heart of the garage, and the crew can have a set of tires swapped before the coffee cools.",
        "That one is mid-service. A good lift, a good light, and a good look underneath. That is how the honest diagnoses happen.",
        "The red one is just in for a rotation. Its owner is in the waiting room pretending not to watch through the window."
    ],
    tires: [
        "Fresh rubber, stacked and ready. All season, all terrain, and a few sizes you would only need if you drive something interesting.",
        "The racks hold a little of everything. If the size you need is not here, the shop can usually have it by morning."
    ],
    workbench: [
        "Every tool has its painted outline, and most of them are even where they belong. A tidy bench is a fast bench.",
        "The bench where small problems get sorted before they become big ones. Mind the vise, it bites."
    ],
    whiteboard: [
        "The waiting room board. The rotation diagram is for the customers, and the list beside it is for you. Happy hunting.",
        "Marker on melamine, the shop's source of truth. Every discovery you make gets ticked off right here."
    ]
};
const SCENERY_TITLES = {
    sofa: 'Have a Seat',
    vending: 'The Vending Machine',
    tv: 'The Waiting Room TV',
    lift: 'Up on the Lift',
    tires: 'The Tire Racks',
    workbench: 'The Workbench'
};

// Each corner plant introduces itself by a (faux) person's name that's also a
// plant x tire-shop pun, shown as the dialog title. Indexed by the plant's
// stable sceneryIndex, so a given plant always uses the same name.
const PLANT_NAMES = [
    'Fern Alignment',    // Fern + wheel alignment
    'Ivy Rimshot',       // Ivy + rims
    'Rosemary Radial',   // Rosemary + radial tires
    'Basil Brakes',      // Basil + brakes
    'Holly Hubcap',      // Holly + hubcaps
    'Laurel Lugnut'      // Laurel + lug nuts
];
let sceneryTick = 0; // cycles the hint shown, no Math.random needed

/** Show/hide the "Back to Showroom" shortcut. Only the exterior dialogs
 *  (pedestrian/zombie/easter egg) offer it — interior dialogs are already there. */
function setDialogReturnVisible(show) {
    if (dialogReturnBtn) dialogReturnBtn.classList.toggle('hidden', !show);
}

/** Teleport the player back to the gallery entrance (their start spot) and close
 *  the dialog — saves walking back from a distant pedestrian or easter egg. */
function returnToGallery() {
    // Nudge clear of any visitor loitering on the spawn spot so we don't land inside them.
    const spot = findClearSpawn(-10, 17, CONTROLS_CONFIG.playerRadius);
    setPlayerPosition(spot.x, CONTROLS_CONFIG.eyeHeight, spot.z); // original spawn (entrance)
    setPlayerRotation(0, 0);                                       // face into the gallery, level
    closeDialogModal();
}

function openDialogModal(pedMesh) {
    if (!dialogModal) return;
    state.isModalOpen = true;
    dialogKind = 'pedestrian';
    track('greet-passerby', { mode: arePedestriansZombies() ? 'night' : 'day' });
    // Daytime greeting and after-dark greeting are separate discoveries.
    markChecklistItem(arePedestriansZombies() ? 'zombie' : 'passerby');
    safeExitPointerLock();
    clearHover();
    copyPlayerPositionTo(_playerPos);
    pausePedestrianForDialog(pedMesh, _playerPos);

    const isZombie = arePedestriansZombies();
    if (dialogModalTitle) dialogModalTitle.textContent = isZombie ? 'Night Wanderer' : 'Passerby';
    if (dialogModalMessage) {
        // Random each click so re-clicking the same person gives a fresh line.
        dialogModalMessage.textContent = isZombie
            ? pickRandomLine(ZOMBIE_LINES)
            : pickRandomLine(PASSERBY_LINES);
    }
    setDialogReturnVisible(true); // exterior: offer the shortcut home
    dialogModal.classList.remove('hidden');
    hud.classList.remove('visible');
    const dismiss = dialogModal.querySelector('.piece-cancel');
    if (dismiss) dismiss.focus();
}

/** Open the shared dialog modal for a gallery visitor (how-to-explore hints). */
function openVisitorModal(visitorMesh) {
    if (!dialogModal) return;
    state.isModalOpen = true;
    dialogKind = 'visitor';
    track('chat-visitor');
    safeExitPointerLock();
    clearHover();
    copyPlayerPositionTo(_playerPos);
    // Stop the visitor and turn them to face the player while they "speak".
    pauseCustomerForDialog(visitorMesh, _playerPos);

    if (dialogModalTitle) dialogModalTitle.textContent = 'A Waiting Customer';
    // Random each click so re-clicking the same visitor gives a fresh line.
    if (dialogModalMessage) dialogModalMessage.textContent = pickRandomLine(VISITOR_LINES);
    setDialogReturnVisible(false); // already inside the gallery
    dialogModal.classList.remove('hidden');
    hud.classList.remove('visible');
    const dismiss = dialogModal.querySelector('.piece-cancel');
    if (dismiss) dismiss.focus();
}

/** Open the shared dialog modal with a how-to hint for clicked scenery. */
function openSceneryModal(sceneryObj) {
    // Some scenery opens its own dedicated view instead of the standard how-to
    // text hint. These are keyed off the raw sceneryKind (not the hint-derived
    // `k` below), so they keep working even though they have no SCENERY_HINTS entry.
    const sk = sceneryObj && sceneryObj.userData && sceneryObj.userData.sceneryKind;
    if (sk === 'businesscard') { openCardModal(); return; }
    // The desk gets an enlarged monitor that mirrors the screen's live terminal.
    if (sk === 'desk') { openMonitorView(); return; }
    // The whiteboard (when present) opens an enlarged close-up of the board.
    if (sk === 'whiteboard') { openWhiteboardView(); return; }
    // Garage and waiting-room discoveries tick the checklist.
    if (sk === 'tv') markChecklistItem('tv');
    else if (sk === 'lift') markChecklistItem('lift');
    else if (sk === 'tires') markChecklistItem('tires');
    if (!dialogModal) return;
    const data = (sceneryObj && sceneryObj.userData) || {};
    const k = SCENERY_HINTS[data.sceneryKind] ? data.sceneryKind : 'plant';
    state.isModalOpen = true;
    dialogKind = 'scenery';
    track('click-scenery', { kind: k });
    safeExitPointerLock();
    clearHover();
    // Plants introduce themselves by name; other scenery uses a fixed label.
    const title = k === 'plant'
        ? PLANT_NAMES[(data.sceneryIndex || 0) % PLANT_NAMES.length]
        : SCENERY_TITLES[k];
    if (dialogModalTitle) dialogModalTitle.textContent = title;
    if (dialogModalMessage) dialogModalMessage.textContent = pickLine(SCENERY_HINTS[k], sceneryTick++);
    setDialogReturnVisible(false); // interior scenery — already in the gallery
    dialogModal.classList.remove('hidden');
    hud.classList.remove('visible');
    const dismiss = dialogModal.querySelector('.piece-cancel');
    if (dismiss) dismiss.focus();
}

/* (The realtor theme's listing detail view and listing dialog are gone: the
 * tire shop has no podiums, and listings.js stays a stub.) */

// Title + a couple of lines for each kind of clickable outdoor prop (benches,
// lamps, planters, the welcome mat, trees). Same warm, courteous neighbor voice
// as the rest of the street, free of em-dashes and semicolons. Two lines apiece
// so a second click gives something new. Mostly light flavor, with only the odd
// gentle nudge toward stepping inside to see the homes.
const PROP_CONTENT = {
    bench: {
        title: 'Have a Seat',
        lines: [
            "A good bench for waiting on a tire rotation. The best decisions tend to arrive the moment you stop rushing them.",
            "Rest here as long as you like. The view of the street comes free of charge, and the shop will still be there when you are ready."
        ]
    },
    lamppost: {
        title: 'Street Lamp',
        lines: [
            "A faithful old lamp, keeping the path lit so customers can find the door after dark.",
            "It has watched a great many cars roll in and out of that bay. Tonight it is quietly rooting for yours."
        ]
    },
    planter: {
        title: 'Flower Box',
        lines: [
            "Someone waters these. A small kindness that makes the whole street feel a little more looked-after.",
            "Real blooms, no rendering tricks. Well, mostly. Either way they brighten the way in."
        ]
    },
    welcomemat: {
        title: 'Welcome',
        lines: [
            "The mat means it, too. Step on in whenever you are ready, and mind the freshly mopped tile.",
            "A warm welcome, wiped clean daily. The waiting room is just the other side of the door."
        ]
    },
    tree: {
        title: 'The Tree',
        lines: [
            "A fine tree, generous with its shade. It was here long before the shop and will very likely outlast it too.",
            "Solid, patient, quietly photosynthesizing. A gentle reminder to slow down and enjoy the neighborhood while you explore."
        ]
    },
    tirestack: {
        title: 'Fresh Stock',
        lines: [
            "Today's delivery, stacked by the bay and still smelling of fresh rubber. They will be on someone's car by closing time.",
            "A neat little tower of traction. The crew rolls them in one at a time, and somehow never lets one get away downhill."
        ]
    },
    depot: {
        title: 'The 1892 Freight Depot',
        checklistId: 'depot',
        lines: [
            "The Pennsylvania RR Freight Depot, standing beside Railroad Ave since 1892. Cockeysville is rather proud of this old timer, and the shop is honored to share the block with it.",
            "Freight wagons once lined up right about where you are standing. The trains have long since moved on, but the old depot never left its post.",
            "The freight door is rolled open, so do step inside. Crates, barrels, the old station board, and a lantern left burning, all where the railroad left them.",
            "Gray boards, wide eaves, and more than a century of stories. They truly do not build them like this anymore."
        ]
    },
    railsign: {
        title: 'Railroad Ave',
        lines: [
            "Railroad Ave, the historic heart of Cockeysville. The old freight depot is just down the lane, and well worth the short walk.",
            "Named for the rail line that built this corner of town. The depot at the end of the lane has watched over it since 1892."
        ]
    }
};
let propTick = 0; // rotates which line a prop shows, no Math.random needed

/** Open the shared dialog modal for a clicked outdoor prop (its title + a quip). */
function openPropModal(propObj) {
    if (!dialogModal) return;
    const kind = propObj && propObj.userData && propObj.userData.propKind;
    const content = PROP_CONTENT[kind];
    if (!content) return;
    state.isModalOpen = true;
    dialogKind = 'prop';
    track('click-prop', { kind });
    // Props that are discoveries carry a checklistId, so a click ticks the list.
    if (content.checklistId) markChecklistItem(content.checklistId);
    safeExitPointerLock();
    clearHover();
    if (dialogModalTitle) dialogModalTitle.textContent = content.title;
    if (dialogModalMessage) dialogModalMessage.textContent = content.lines[propTick++ % content.lines.length];
    setDialogReturnVisible(true); // outdoors — offer the shortcut back to the gallery
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
    openSkyQuip('The Sun', "Pro tip: you probably don't want to stare directly at this one. Lovely from a distance, though.");
}

function openMoonModal() {
    track('click-sky', { body: 'moon' });
    markChecklistItem('sky');
    openSkyQuip('The Moon', "I choose to believe it's made of cheese. Swiss, to be exact.");
}

// ---- Studio monitor view --------------------------------------------------

/** Open the enlarged-monitor overlay, mirroring the desk's live terminal at full
 *  size. Reuses the desk's flavor copy as the caption. */
// Caption shown beneath the enlarged desk monitor (rotates per click). The desk
// opens this view rather than a text hint, so its caption lives on its own.
const MONITOR_CAPTIONS = [
    "The back-office desk, where the shop's paperwork gets sorted. The screen runs a quiet log of the day's work.",
    "Mission control for the garage. Every job on the lift gets written up right here."
];

function openMonitorView() {
    if (!monitorView) return;
    state.isModalOpen = true;
    monitorOpen = true;
    track('click-scenery', { kind: 'desk' });
    safeExitPointerLock();
    clearHover();
    if (monitorCaption) monitorCaption.textContent = pickLine(MONITOR_CAPTIONS, sceneryTick++);
    monitorView.classList.remove('hidden');
    hud.classList.remove('visible');
    sizeMonitorCanvas();        // measure now that the overlay is laid out
    startMonitorRender();
    const closeBtn = monitorView.querySelector('.monitor-close');
    if (closeBtn) closeBtn.focus();
}

function closeMonitorView() {
    if (!monitorView) return;
    monitorView.classList.add('hidden');
    stopMonitorRender();
    monitorOpen = false;
    state.isModalOpen = false;
    resumeGameAfterModal();
}

/** Size the monitor canvas to its displayed (16:10) screen at device pixels so
 *  the shared terminal painter renders crisply. */
function sizeMonitorCanvas() {
    if (!monitorCanvas) return;
    const rect = monitorCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    monitorCanvas.width = Math.max(2, Math.round(rect.width * dpr));
    monitorCanvas.height = Math.max(2, Math.round(rect.height * dpr));
}

function startMonitorRender() {
    const ctx = monitorCanvas && monitorCanvas.getContext('2d');
    const loop = () => {
        if (!monitorOpen || !ctx) return;
        // The build-log state (typed lines + blinking cursor) is advanced by
        // updateGalleryMonitor() in the main update loop, which keeps running
        // while this overlay is up; we just re-paint the current state each frame.
        drawMonitorTo(ctx, monitorCanvas.width, monitorCanvas.height);
        monitorRaf = requestAnimationFrame(loop);
    };
    monitorRaf = requestAnimationFrame(loop);
}

function stopMonitorRender() {
    if (monitorRaf) cancelAnimationFrame(monitorRaf);
    monitorRaf = 0;
}

// ---- Whiteboard close-up view ---------------------------------------------

/** Open the enlarged whiteboard overlay, mirroring the in-world board (sketches
 *  plus the live discovery checklist). Reuses the board's flavor copy as caption. */
function openWhiteboardView() {
    if (!whiteboardView) return;
    state.isModalOpen = true;
    whiteboardOpen = true;
    track('click-scenery', { kind: 'whiteboard' });
    safeExitPointerLock();
    clearHover();
    if (whiteboardCaption) whiteboardCaption.textContent = pickLine(SCENERY_HINTS.whiteboard, sceneryTick++);
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

/** Size the whiteboard canvas to its displayed (2:1.2) box at device pixels and
 *  paint the board once. Static content, so no render loop is needed. */
function drawWhiteboardView() {
    if (!whiteboardCanvas) return;
    const rect = whiteboardCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    whiteboardCanvas.width = Math.max(2, Math.round(rect.width * dpr));
    whiteboardCanvas.height = Math.max(2, Math.round(rect.height * dpr));
    const ctx = whiteboardCanvas.getContext('2d');
    if (ctx) drawWhiteboardTo(ctx, whiteboardCanvas.width, whiteboardCanvas.height);

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
    // Resume whichever kind of NPC was talking ('scenery' and 'egg' have none).
    if (dialogKind === 'visitor') resumeCustomerFromDialog();
    else if (dialogKind === 'pedestrian') resumePedestrianFromDialog();
    dialogKind = null;
    state.isModalOpen = false;
    resumeGameAfterModal();
}

// ---- Partway "reach out" nudge ---------------------------------------------
// Catches engaged visitors who may never find all eight discoveries: once they
// are a few in, reuse the completion celebration's card styling for a single,
// warm, low-pressure invitation to reach out. Shown at most once per session,
// and (like the celebration) it waits out any open modal rather than stacking.

const NUDGE_SHOWN_KEY = 'interstate-nudged';            // session flag: shown (or superseded)
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
const CELEBRATED_KEY = 'interstate-celebrated';

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

/** Wire the outward-facing links from INTERSTATE_CONFIG.site. The Home button and
 *  the card modal's site link open the featured business's own website in a
 *  new tab (noopener, so that site gets no handle on the tour tab). The
 *  contact CTAs point at the builder's marketing contact page at the serving
 *  domain's root; they may later be upgraded in place to one-tap mailtos,
 *  with that page as the fallback. The business-card modal is the business
 *  contact's card, so its copy comes from site.business. */
function applySiteLinks() {
    const site = INTERSTATE_CONFIG.site;
    const business = site.business;
    // Home returns to the serving site's root in the same tab. The shop
    // button beside it (and the in-card CTAs) open Interstate Tire's own
    // website in a new tab, so visitors never lose their place in the tour.
    const home = document.getElementById('home-btn');
    if (home) {
        home.href = site.home.path;
        home.removeAttribute('target');
        home.removeAttribute('rel');
        home.title = site.home.title;
        home.setAttribute('aria-label', site.home.title);
    }
    const bizBtn = document.getElementById('biz-btn');
    if (bizBtn) {
        bizBtn.href = business.websiteUrl;
        bizBtn.title = `Visit the ${business.name} website`;
        bizBtn.setAttribute('aria-label',
            `Visit the ${business.name} website (opens in a new tab)`);
    }
    ['hello-site', 'complete-site', 'nudge-site', 'card-site'].forEach((id) => {
        const link = document.getElementById(id);
        if (link) link.href = business.websiteUrl;
    });
    ['complete-contact', 'nudge-contact'].forEach((id) => {
        const link = document.getElementById(id);
        if (link) link.href = site.builder.contactPath;
    });
}

/** Share the site: native share sheet where available, clipboard copy otherwise,
 *  and a mailto as a last resort. Driven by the celebration's "Share this". */
async function shareSite() {
    const shareData = {
        title: INTERSTATE_CONFIG.site.share.title,
        text: INTERSTATE_CONFIG.site.share.text,
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

/* (The portfolio site's one-tap mailto upgrade is gone here: on SceneXP the
 * builder funnel goes through the site's own contact page, which reveals the
 * address behind its own proof of work. The in-world CTAs stay plain page
 * links, so they work identically with or without crypto.) */

// ---- The shop's business card -----------------------------------------------
// The card on the counter desk belongs to the business the experience was
// built for (INTERSTATE_CONFIG.site.business), not to the builder. The
// builder funnel lives in the nudge and completion modals instead.

function openCardModal() {
    if (!cardModal) return;
    state.isModalOpen = true;
    track('open-card');
    safeExitPointerLock();
    clearHover();
    cardModal.classList.remove('hidden');
    hud.classList.remove('visible');
    const enter = cardModal.querySelector('.piece-enter');
    if (enter) enter.focus();
}

function closeCardModal() {
    if (!cardModal) return;
    cardModal.classList.add('hidden');
    state.isModalOpen = false;
    resumeGameAfterModal();
}

/* (The vCard download is gone with the placeholder owner details: the card
 * modal now speaks for the shop itself, and the website link covers the
 * follow-up. It can return if the owner shares real contact details.) */

/** Close whichever modal is currently open (used by the Escape key). */
function closeActiveModal() {
    if (completeModal && !completeModal.classList.contains('hidden')) closeCompleteModal();
    else if (nudgeModal && !nudgeModal.classList.contains('hidden')) closeNudgeModal();
    else if (cardModal && !cardModal.classList.contains('hidden')) closeCardModal();
    else if (lightPanel && !lightPanel.classList.contains('hidden')) closeLightPanel();
    else if (monitorView && !monitorView.classList.contains('hidden')) closeMonitorView();
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
    // While the studio monitor or whiteboard overlay is open it covers the
    // screen, so skip the (wasted) 3D render — each runs its own lightweight
    // 2D pass. The update() above still ticks the shared monitor build-log state.
    if (!monitorOpen && !whiteboardOpen) render();
}

function update(deltaTime) {
    updateControls(deltaTime, state.isPaused);

    // Autopilot only steers during active play; withholding the update while
    // paused or in a modal is what politely suspends the tour.
    if (!state.isPaused && !state.isModalOpen) updateAutopilot(deltaTime);

    copyPlayerPositionTo(_playerPos);
    updateDoors(_playerPos, deltaTime);
    updateSidewalkPedestrians(_playerPos, deltaTime, CONTROLS_CONFIG.moveSpeed);
    updateStorePeople(_playerPos, deltaTime);
    updateDayNightCycle(deltaTime);
    updateInteriorAmbientLight();
    updateBackgroundAnimations(deltaTime);

    // Bob + billboard the host's floating Help sign toward the camera
    _elapsed += deltaTime;
    updateCheckoutSign(_elapsed, getCamera().position);
    updateGalleryMonitor(_elapsed); // studio desk's faux build log + blinking cursor
    updateWaitingRoomTV(deltaTime); // the waiting room TV flips through its channels

    // Hover detection doesn't need to run every frame — ~10 Hz feels instant
    // and avoids a per-frame raycast (and its array allocation).
    _hoverAccum += deltaTime;
    if (_hoverAccum >= 0.1) {
        _hoverAccum = 0;
        updateHover();
        trackStoreTransition();
    }
}

/** Fire an enter-store / leave-store ping whenever the player crosses the
 *  gallery threshold. Sampled at the ~10 Hz hover cadence, which is plenty to
 *  catch the transition. The first sample only seeds the baseline (no event). */
function trackStoreTransition() {
    if (state.isPaused) return;
    const inside = isPlayerInsideStore();
    if (inside === _wasInside) return;
    if (_wasInside !== null) track(inside ? 'enter-store' : 'leave-store');
    _wasInside = inside;
}

// ---- Collision ------------------------------------------------------------

function setupCollision() {
    // Store fixtures (walls, counter, tables) plus the listing podiums, so visitors
    // bump into a plinth instead of walking straight through it. Podiums are built
    // once at startup (before this runs), so a one-time snapshot of their colliders
    // is enough; each Box3 is wrapped to match the { box, type } shape checkCollision
    // expects.
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
        console.error('[Shop] 3D init failed, falling back to the 2D site:', err);
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
