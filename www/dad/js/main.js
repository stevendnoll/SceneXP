// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for the NCR Trail experience.
 *
 * Coordinates the scene, first-person controls, and the memorial trail world:
 * the gravel rail trail through the woods, the Gunpowder River with its
 * little waterfall, Dad greeting visitors beside his hybrid bike, his riding
 * friends passing on the trail, and a couple of walkers out for a stroll.
 */

import { DAD_CONFIG } from './config.min.js';
import { getProofOfWork, bufToHex, installCardFocusTrap, shieldOverlayControl } from '../../shared/js/boot-1.0.0.min.js';
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
    updateRiver, updateTrailCyclists, getCyclistMeshes,
    pauseCyclistForDialog, resumeCyclistFromDialog,
    toggleRiverAudio, isRiverAudioOn, updateRiverAudio,
    updateKioskChecklist, drawKioskTo, dressWalkersForTheTrail
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
    '.skip-link, #blocker, #hud, #touch-controls, #autopilot-btn, #settings-btn, #settings-panel, #game-canvas';
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
let hoveredCyclist = null;
let hoveredVisitor = null;
let _hoverAccum = 0; // throttle accumulator for hover raycasts
let _elapsed = 0;    // running time for sign bob/billboard animation

// Reusable per-frame objects (avoid GC churn)
const _playerPos = new THREE.Vector3();

let cleanupController = null;

// ---- Initialization -------------------------------------------------------

// ---- Proof-of-work load gate ----------------------------------------------
// The gate itself lives in the shared boot part; its knobs come from
// DAD_CONFIG.proofOfWork (the legacy 'gallery-pow' storage key is kept so
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

    if (!canvas) return;

    // Wire the welcome screen's directory link (the serving site's root) and
    // the contact CTAs
    // (the builder's marketing pages, also at the root) from DAD_CONFIG.site,
    // so config stays the single home for these values. Equivalent fallbacks
    // are baked into the HTML for the no-JS path.
    applySiteLinks();

    // Soft bot deterrent: solve a tiny proof of work before building the scene
    // (or reuse a still-valid one from sessionStorage). Hand the hash to the
    // telemetry layer so it tags every ping.
    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(DAD_CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Initializing renderer…', 25);
    initScene(canvas, DAD_CONFIG);

    updateLoadingStatus('Laying the trail…', 55);
    initStore();
    removeTestObjects();

    updateLoadingStatus('Waking up the woods…', 75);
    // No wall pieces in this theme (GALLERY_SECTIONS is empty); this keeps
    // the gallery group / raycast plumbing intact while building none.
    initGallery();

    // listings.js is a stub here, same as the tire theme: initListings
    // creates the empty raycast container and buildListings is a no-op.
    initListings(getScene());
    buildListings(SAMPLE_LISTINGS);

    // Register the trail-side waypoints, then add a couple of people out for
    // a walk: they drift between the kiosk, the benches, the falls overlook,
    // and the mile marker, pausing to take in the view.
    setGalleryWaypoints([
        { x: -13, z: 3.0,  lookAtX: -13, lookAtZ: 4.8 },   // the trailhead kiosk
        { x: -14, z: 6.2,  lookAtX: -14, lookAtZ: 11 },    // bench with the river view
        { x: 18,  z: 6.6,  lookAtX: 18,  lookAtZ: 16 },    // the falls overlook
        { x: 29,  z: 1.4,  lookAtX: 30,  lookAtZ: 2.6 },   // mile marker 7
        { x: -30, z: 0.6,  lookAtX: -34, lookAtZ: 0.6 }    // a quiet stretch of trail
    ]);
    initGalleryVisitors(DAD_CONFIG.walkers.count);
    dressWalkersForTheTrail(); // trail dress code: shorts and trousers, no skirts
    buildRaycastTargets();

    // Discovery checklist: install the trail item list, restore any session
    // progress, and keep the kiosk notice board mirrored to it. Items get
    // ticked by the interaction handlers below (markChecklistItem). Seed the
    // board once now.
    initChecklist(DAD_CONFIG.checklist);
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
    initControls(DAD_CONFIG);
    initAutopilot(DAD_CONFIG.autopilot);
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
    // Toggle with the top-left tour button or the T key. Any movement input
    // (movement keys here, the joysticks below) hands the controls straight
    // back to the visitor.
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
const SETTINGS_STORAGE_KEY = 'dad-settings';

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

// ---- Trail interaction ----------------------------------------------------

function buildRaycastTargets() {
    raycastTargets = [];
    const galleryGroup = getGalleryGroup();
    if (galleryGroup) raycastTargets.push(galleryGroup);
    const host = getGalleryHost();
    if (host) raycastTargets.push(host);
    // The floating "Hello" sign above Dad is clickable too (opens the hello).
    const helpSign = getHelpSign();
    if (helpSign) raycastTargets.push(helpSign);
    // The riders out on the trail are clickable…
    getCyclistMeshes().forEach(mesh => raycastTargets.push(mesh));
    // …as are the walkers out for a stroll.
    getVisitorMeshes().forEach(mesh => raycastTargets.push(mesh));

    // Outdoor props (benches, trees, bushes, the fence, the rails, the river,
    // the falls, the kiosk, the mile marker, Dad's bike) are click-only — they
    // show no hover tooltip, so they live in a separate list the click test
    // adds in but the per-frame hover raycast skips.
    clickTargets = raycastTargets.concat(getOutdoorPropMeshes());
}

/** True if the object (or any ancestor) is Dad the greeter, or his floating
 *  "Hello" sign — clicking either opens the hello dialog. */
function isHostObject(obj) {
    let o = obj;
    while (o) {
        if (o.userData && (o.userData.isShopkeeper || o.userData.isShopkeeperSign)) return true;
        o = o.parent;
    }
    return false;
}

/** Walk up to the cyclist root (the group flagged isCyclist), or null. */
function getCyclistRoot(obj) {
    let o = obj;
    while (o) {
        if (o.userData && o.userData.isCyclist) return o;
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
    // does not). Nearest hit wins, so a rider in front still takes priority
    // over a prop behind them. pickNearestHit adds a forgiving tap radius for
    // touch / windowed clicks (crosshair stays exact).
    const hit = pickNearestHit(clickTargets, camera);
    if (!hit) return;
    const obj = hit.object;

    if (isHostObject(obj)) { openHelpModal(); return; }
    const cyclist = getCyclistRoot(obj);
    if (cyclist) { openCyclistModal(cyclist); return; }
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

    // Dad takes priority when centered in the crosshair.
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

    // A rider on the trail in the crosshair.
    const cyclist = hitObj ? getCyclistRoot(hitObj) : null;
    if (cyclist) {
        if (hoveredCyclist !== cyclist) {
            clearHover();
            hoveredCyclist = cyclist;
            if (lookLabel) {
                const verb = state.isMobile ? 'tap' : 'click';
                lookLabel.textContent = `${verb} to greet the rider`;
                lookLabel.classList.add('visible');
            }
            if (hud) hud.classList.add('targeting');
        }
        return;
    }
    if (hoveredCyclist) clearHover();

    // A walker out for a stroll in the crosshair.
    const visitor = hitObj ? getVisitorRoot(hitObj) : null;
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

    // Clickable props (benches, trees, the river, the kiosk) are intentionally
    // NOT hover-highlighted — clicking still pops a line, but we don't want a
    // tooltip drawing the eye to every bush on the trail.

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
    hoveredCyclist = null;
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

// The riders you meet on the trail are Dad's riding group, his later-years
// friends who still make the weekend loop. Their lines are warm and unhurried,
// and many of them remember him the way friends do, in passing and with a
// smile. No slang, and no em-dashes or semicolons. They stay in-fiction: the
// "built by a person and an AI" invitation lives in the completion and nudge
// cards, not in this ambient chatter.
const CYCLIST_LINES = [
    "Beautiful day for a ride. This stretch by the river never gets old.",
    "We ride this loop most Saturdays. The fellow by the bike back there got the whole group started.",
    "If you have not seen the little waterfall yet, follow the fence line. It is worth the walk.",
    "Fifteen or twenty miles, most weekends, rain or shine. That was always his rule, and now it is ours.",
    "He finished the Seagull Century once. A hundred miles in a day. The rest of us are still a little jealous.",
    "The gravel rides smooth this time of year. Mind the benches, they have the best view of the water.",
    "Good afternoon to you. Say hello to our friend by the bike if you have not yet. Kindest man on this trail.",
    "The old rails run the whole way to Pennsylvania. Trains once, bikes now. A fair trade, we think.",
    "Watch the river on your left as you walk east. There is a spot where it turns to white water.",
    "A good trail keeps a group together. This one has kept ours together for years."
];

// The walkers out for a stroll: gentle lines that double as how-to hints for
// exploring the trail. One is shown at random when they are clicked/tapped
// (see openVisitorModal).
const WALKER_LINES = [
    "The notice board at the trailhead has a list of things worth finding out here.",
    "We walk this stretch most mornings. The benches by the fence have the best view of the river.",
    "If you follow the gravel east you will hear the falls before you see them.",
    "The old railroad ties are still in the ballast over there. This whole trail used to be a train line.",
    "Such a peaceful place. The riders are friendly too, give them a wave as they pass.",
    "Mile marker seven is just up the way. The kids like to race to it and back."
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

/** Show/hide the "Back to the Trail" shortcut. Only the dialogs that can open
 *  far from the spawn (riders, props at the ends of the stretch) offer it. */
function setDialogReturnVisible(show) {
    if (dialogReturnBtn) dialogReturnBtn.classList.toggle('hidden', !show);
}

/** Teleport the player back to the trailhead (their start spot, near Dad and
 *  the kiosk) and close the dialog — saves walking back from a far prop. */
function returnToGallery() {
    // Nudge clear of any walker loitering on the spawn spot so we don't land inside them.
    const spot = findClearSpawn(DAD_CONFIG.spawn.x, DAD_CONFIG.spawn.z, CONTROLS_CONFIG.playerRadius);
    setPlayerPosition(spot.x, CONTROLS_CONFIG.eyeHeight, spot.z);            // original spawn (the trailhead)
    setPlayerRotation(DAD_CONFIG.rotation.yaw, 0);                            // face down the trail toward Dad, level
    closeDialogModal();
}

/** Open the shared dialog modal for a rider on the trail. */
function openCyclistModal(cyclistMesh) {
    if (!dialogModal) return;
    state.isModalOpen = true;
    dialogKind = 'cyclist';
    track('greet-cyclist');
    markChecklistItem('cyclist');
    safeExitPointerLock();
    clearHover();
    // Stop the rider while they "speak" (they wait politely, mid-trail).
    pauseCyclistForDialog(cyclistMesh);

    if (dialogModalTitle) dialogModalTitle.textContent = 'A Rider on the Trail';
    // Random each click so re-clicking the same rider gives a fresh line.
    if (dialogModalMessage) dialogModalMessage.textContent = pickRandomLine(CYCLIST_LINES);
    setDialogReturnVisible(true); // riders can be met far up the trail
    dialogModal.classList.remove('hidden');
    hud.classList.remove('visible');
    const dismiss = dialogModal.querySelector('.piece-cancel');
    if (dismiss) dismiss.focus();
}

/** Open the shared dialog modal for a walker (how-to-explore hints). */
function openVisitorModal(visitorMesh) {
    if (!dialogModal) return;
    state.isModalOpen = true;
    dialogKind = 'visitor';
    track('chat-walker');
    safeExitPointerLock();
    clearHover();
    copyPlayerPositionTo(_playerPos);
    // Stop the walker and turn them to face the player while they "speak".
    pauseCustomerForDialog(visitorMesh, _playerPos);

    if (dialogModalTitle) dialogModalTitle.textContent = 'Out for a Walk';
    // Random each click so re-clicking the same walker gives a fresh line.
    if (dialogModalMessage) dialogModalMessage.textContent = pickRandomLine(WALKER_LINES);
    setDialogReturnVisible(false);
    dialogModal.classList.remove('hidden');
    hud.classList.remove('visible');
    const dismiss = dialogModal.querySelector('.piece-cancel');
    if (dismiss) dismiss.focus();
}

/* (The realtor theme's listing detail view and listing dialog are gone: the
 * trail has no podiums, and listings.js stays a stub.) */

// Title + a couple of lines for each kind of clickable outdoor prop. Same warm,
// unhurried trail voice as the rest of the world, free of em-dashes and
// semicolons. Two lines apiece so a second click gives something new. Props
// that are discoveries carry a checklistId so a click ticks the list.
const PROP_CONTENT = {
    bench: {
        title: 'Have a Seat',
        checklistId: 'bench',
        lines: [
            "A good bench with a good view. The river does its best thinking out loud, and a bench is for listening.",
            "Rest here as long as you like. The water goes by, the riders go by, and nobody is in any hurry at all."
        ]
    },
    tree: {
        title: 'The Tree',
        lines: [
            "A fine old tree, generous with its shade. It has watched this trail since the trains still ran.",
            "Solid, patient, quietly photosynthesizing. A gentle reminder to slow down and enjoy the ride."
        ]
    },
    bush: {
        title: 'Trailside Green',
        lines: [
            "The underbrush keeps the trail feeling tucked into the woods. Watch for rabbits around this one.",
            "Wild and unbothered, the way a trail's edges ought to be."
        ]
    },
    fence: {
        title: 'The Split-Rail Fence',
        lines: [
            "The fence line means the bank drops off just past it. Lean on the rail and enjoy the water from here.",
            "Hand-split rails, weathered to gray. They have steadied a lot of riders pausing for the view."
        ]
    },
    rails: {
        title: 'The Old Rails',
        checklistId: 'rails',
        lines: [
            "The Northern Central Railway ran this line for a century. The trains are long gone, and the bikes keep the route alive.",
            "Old ties and rusted rail, half asleep in the ballast. Every trail like this one used to be somebody's way home."
        ]
    },
    marker: {
        title: 'Mile Marker 7',
        lines: [
            "Seven miles from the start of the line. The regulars know every marker on this trail by heart.",
            "A little white milepost, same as the railroad used. The miles go easier out here."
        ]
    },
    river: {
        title: 'The Gunpowder River',
        checklistId: 'river',
        lines: [
            "The Gunpowder runs right alongside the trail here. The sound of it is half the reason to ride.",
            "Cool, green, and steady. Herons fish this stretch in the early mornings."
        ]
    },
    falls: {
        title: 'The Little Waterfall',
        checklistId: 'falls',
        lines: [
            "His favorite spot on the whole trail. The water turns white over the ledge, and you hear it long before you see it.",
            "Not a big waterfall, but a faithful one. It has been singing the same song for a very long time."
        ]
    },
    dadbike: {
        title: 'His Hybrid',
        lines: [
            "Part road bike, part mountain bike, all business. It carried him fifteen or twenty miles most weekends.",
            "Kickstand down, tires firm, ready to roll. A bike this loved never really retires."
        ]
    }
};
let propTick = 0; // rotates which line a prop shows, no Math.random needed

/** Open the shared dialog modal for a clicked outdoor prop (its title + a quip).
 *  Two props are special: the trailhead kiosk opens the notice-board
 *  close-up, and the little waterfall toggles the river ambience. */
function openPropModal(propObj) {
    if (!dialogModal) return;
    const kind = propObj && propObj.userData && propObj.userData.propKind;
    if (kind === 'kiosk') { openWhiteboardView(); return; }
    if (kind === 'falls') { openFallsModal(); return; }
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
    setDialogReturnVisible(true); // props can be far up the trail — offer the shortcut back
    dialogModal.classList.remove('hidden');
    hud.classList.remove('visible');
    const dismiss = dialogModal.querySelector('.piece-cancel');
    if (dismiss) dismiss.focus();
}

/** The little waterfall: toggle the river ambience (inside the click
 *  gesture, as iOS requires), then confirm what happened in the dialog.
 *  Mirrors the family experience's conch shell. */
function openFallsModal() {
    if (!dialogModal) return;
    const nowOn = toggleRiverAudio();
    state.isModalOpen = true;
    dialogKind = 'prop';
    track('falls-toggle', { on: nowOn });
    markChecklistItem('falls');
    safeExitPointerLock();
    clearHover();
    if (dialogModalTitle) dialogModalTitle.textContent = 'The Little Waterfall';
    if (dialogModalMessage) {
        dialogModalMessage.textContent = nowOn
            ? 'Listen. The Gunpowder is running over the ledge, cool and steady, just the way he liked it. Click the falls again to let the trail go quiet.'
            : 'The trail goes quiet again. The falls keep pouring, of course. They always have.';
    }
    setDialogReturnVisible(true);
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
    openSkyQuip('The Sun', "Morning light on the trail was his favorite kind. Though as always, best admired without staring directly at it.");
}

function openMoonModal() {
    track('click-sky', { body: 'moon' });
    markChecklistItem('sky');
    openSkyQuip('The Moon', "The river keeps flowing under the moon, and the falls keep singing. The trail is lovely this late.");
}

// ---- Kiosk notice-board close-up view ---------------------------------------
// Reuses the tire theme's whiteboard overlay markup and styles (the whiteboard-*
// ids and classes), repainted with the kiosk board: the discovery list plus the
// dedication, readable at full size.

// Caption shown beneath the enlarged notice board (rotates per click).
const KIOSK_CAPTIONS = [
    "The trailhead notice board. A few things worth finding, and a few words worth keeping.",
    "Every good trail keeps its notes here. This one keeps a memory too."
];
let kioskTick = 0;

/** Open the enlarged notice-board overlay, mirroring the in-world kiosk board
 *  (the live discovery checklist plus the dedication). */
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
    else if (dialogKind === 'cyclist') resumeCyclistFromDialog();
    dialogKind = null;
    state.isModalOpen = false;
    resumeGameAfterModal();
}

// ---- Partway "reach out" nudge ---------------------------------------------
// Catches engaged visitors who may never find all eight discoveries: once they
// are a few in, reuse the completion celebration's card styling for a single,
// warm, low-pressure invitation to reach out. Shown at most once per session,
// and (like the celebration) it waits out any open modal rather than stacking.

const NUDGE_SHOWN_KEY = 'dad-nudged';            // session flag: shown (or superseded)
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
const CELEBRATED_KEY = 'dad-celebrated';

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

/** Wire the outward-facing links from DAD_CONFIG.site. There is no featured
 *  business here: the experience honors a person, so the welcome screen's
 *  directory link goes to the serving site's root (Phase 5 rule: the marketing
 *  pages live at every hosting domain's root), in a new tab. The contact CTAs point at the
 *  builder's contact page, also root-relative; they may later be upgraded in
 *  place to one-tap mailtos, with that page as the fallback. */
function applySiteLinks() {
    const site = DAD_CONFIG.site;
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
        title: DAD_CONFIG.site.share.title,
        text: DAD_CONFIG.site.share.text,
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
    updateTrailCyclists(_playerPos, deltaTime);
    updateStorePeople(_playerPos, deltaTime);
    updateDayNightCycle(deltaTime);
    updateBackgroundAnimations(deltaTime);
    updateRiver(deltaTime);
    updateRiverAudio(deltaTime);

    // Bob + billboard Dad's floating Hello sign toward the camera
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
