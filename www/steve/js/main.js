// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for the home office experience.
 *
 * Coordinates the scene, the view controls, and the office world: Steve at
 * his sit-stand desk building SceneXP (super meta, yes), the tuxedo cat
 * asleep on his son's little blue desk, the wall display with SceneXP's
 * visitor numbers on it, and a small room's worth of stories behind every
 * click.
 *
 * ---- IT STANDS STILL NOW, AND LOOKS AROUND ----
 *
 * Until 2026-09-18 this room was walked through: WASD and pointer lock on a
 * desktop, a pair of joysticks on a phone, collision against every piece of
 * furniture. In a room this small that was mostly bumping into things, and
 * the scene's job had become showing one wall screen. So the eye is fixed in
 * front of the closet doors (view.js has where, and the measurements that
 * chose it), and the visitor looks around with the shared pan part the way
 * the diorama scenes do: drag, the arrow buttons, or the keys to turn, pinch
 * or scroll to zoom.
 *
 * The one thing it does that no diorama does is TURN ALL THE WAY ROUND. Those
 * scenes compose their subject in front of the eye and stop the turn at a
 * clamp. This room has something worth finding on all four walls, so the pan
 * part's `wrap` option lets the view circle freely instead.
 *
 * ---- EVERY STORY HAS A ROUTE THAT NEEDS NO POINTER ----
 *
 * A click on the canvas is a raycast, and a raycast needs a pointer. So the
 * room also carries an off-screen list of everything in it (the shared
 * proplist part), which slides into view the moment anything in it has
 * focus. The wall display is one of its rows, so the dashboard is reachable
 * without a pointer too, without a button on screen drawing every visitor's
 * eye to it: it is Steve's own view of the site, and it is meant to be found
 * rather than advertised.
 *
 * Future contributors: for a scene you walk through, start from
 * www/interstate/js/main.js, which wires the shared controls. This file is
 * now the example of a fixed eye inside a room that surrounds it.
 */

import { STEVE_CONFIG } from './config.min.js';
import { composeView } from './view.min.js';
import { getProofOfWork, bufToHex, installCardFocusTrap, shieldOverlayControl, installCardScrollReset } from '../../shared/js/boot-1.0.0.min.js';
import { initPortraitControls, updatePortraitControls, gestureClaimedTap } from '../../shared/js/pan-1.0.0.min.js';
import {
    initScene, handleResize, render, getCamera, getScene, getRenderer,
    updateDayNightCycle, removeTestObjects, isTouchDevice
} from '../../shared/js/scene-1.0.0.min.js';
import {
    initStore,
    updateBackgroundAnimations,
    updateCheckoutSign, getHelpSign,
    getOutdoorPropMeshes,
    updateStudio, getDancerMeshes, getRoquiMesh,
    pauseDancerForDialog, resumeDancerFromDialog,
    pauseRoquiForDialog, resumeRoquiFromDialog,
    updateDashboardScreen,
    drawMonitorTo, getEditorLines,
    setStudioBrightness, updateInteriorAmbientLight
} from './store.min.js';
import { initGallery, getGalleryGroup, resolveGalleryPiece } from './gallery.min.js';
import {
    initChecklist, markChecklistItem, onChecklistChange
} from '../../shared/js/checklist-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';
import {
    initAnalytics, loadAnalytics, startAnalyticsAutoRefresh
} from '../../shared/js/analytics-1.0.0.min.js';
import { installShare } from '../../shared/js/share-1.0.0.min.js';
import { installPropList, propListItems } from '../../shared/js/proplist-1.0.0.min.js';
import { initListings, buildListings, SAMPLE_LISTINGS } from './listings.min.js';

// ---- Application state ----------------------------------------------------

const state = {
    isRunning: false,
    isLoaded: false,
    // True while the welcome card is up. The room is alive behind it; this
    // only gates the taps and the list until the visitor steps in.
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
// is fine because the modal's own backdrop covers the scene). The list of the
// room's things and the view controls join the chrome here: both are tab stops.
const MODAL_BG_SELECTOR =
    '.skip-link, #blocker, #prop-panel, .pan-controls, #settings-btn, #help-btn, #settings-panel, #game-canvas';
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
    // The room has been touched, so it stops offering itself.
    noteRoomTouched();
    modalReturnFocus = document.activeElement;
    armCard();
    // Defer one microtask so the specific dialog has been un-hidden first.
    queueMicrotask(() => {
        if (!state.isModalOpen) return;
        setBackgroundInert(true);
    });
}

function onModalClosed() {
    setBackgroundInert(false);
    // Restore focus to wherever it was when the dialog opened: the row in the
    // list of the room's things when that is how it was opened, and the body
    // after a tap on the room.
    const el = modalReturnFocus;
    modalReturnFocus = null;
    if (el && document.contains(el) && !el.hasAttribute('inert')) {
        try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    }
}

// A CARD OPENS UNDER THE FINGER. Taps are read on touchend now, and a touch
// spawns a compatibility mouse click a few milliseconds later, by which time
// the card is already underneath it: a tap on Steve could land on the button
// his card puts in the same spot. Two belts, the same pair www/automan and
// www/sunnyvalejenn wear: the touchend below cancels that click, and for
// CARD_ARM_MS after any card opens a pointer click inside it is swallowed in
// the capture phase. Keyboard activation is exempt (Enter and Space arrive as
// a click with `detail` 0, and nobody tabbing was handed a card under a finger).
const CARD_ARM_MS = 450;
const CARD_SELECTOR = '#dialog-modal, #help-modal, #piece-modal, #nudge-modal, #complete-modal, #analytics-view, #monitor-view, #light-panel';
let cardArmedAt = 0;

function armCard() {
    cardArmedAt = Date.now();
}

function swallowGhostTap(event) {
    if (!cardArmedAt || Date.now() - cardArmedAt > CARD_ARM_MS) return;
    if (!event.detail) return;              // keyboard, not a pointer
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    if (!target.closest(CARD_SELECTOR)) return;
    cardArmedAt = 0;                        // one swallow per opening
    event.preventDefault();
    event.stopPropagation();
    track('ghost-tap');
}

// DOM references (resolved in init)
let canvas, loadingScreen, blocker, helpBtn;
let pieceModal, pieceModalTitle, pieceModalSubtitle, pieceModalEnter;
let helpModal;
let dialogModal, dialogModalTitle, dialogModalMessage;
let analyticsView;  // the visitor-activity dashboard the wall display opens
let monitorView, monitorCanvas, monitorCaption, monitorSource;  // the desk monitor, up close
let propPanel;      // the off-screen list of the room's things (keyboard route)
let lightPanel, lightPanelSlider, lightPanelValue; // the light switch's floating dimmer
let completeModal; // discovery-complete celebration
let nudgeModal; // partway "reach out" invitation (reuses the celebration card)

// Whether the dashboard overlay is up. The render loop idles behind it, and
// the background poll keeps refreshing underneath either way.
let analyticsOpen = false;

// The welcome card can be dismissed more than once now (the How-this-works
// button puts it back), so these two hold what "more than once" changes:
// the arrival is still counted once, and focus goes back to whatever summoned
// the card rather than to the top of the page.
let visitBegun = false;
let welcomeReturn = null;

// Raycasting for tap-to-open
const raycaster = new THREE.Raycaster();
raycaster.far = 16;
const pointer = new THREE.Vector2();
const _tolPointer = new THREE.Vector2(); // offset sample point for forgiving taps
const TAP_TOLERANCE_PX = 26;             // hit radius for touch taps and clicks
let clickTargets = [];        // Steve, any NPCs, the gallery group, and every office prop

let _elapsed = 0;    // running time for sign bob/billboard animation

let cleanupController = null;

// ---- Initialization -------------------------------------------------------

// ---- Proof-of-work load gate ----------------------------------------------
// The gate itself lives in the shared boot part; its knobs come from
// STEVE_CONFIG.proofOfWork (the legacy 'gallery-pow' storage key is kept so
// visitors' cached proofs survive).

async function init() {
    state.isMobile = isTouchDevice();
    setMobile(state.isMobile); // tag every telemetry ping with mobile vs not

    canvas = document.getElementById('game-canvas');
    loadingScreen = document.getElementById('loading-screen');
    blocker = document.getElementById('blocker');
    helpBtn = document.getElementById('help-btn');
    pieceModal = document.getElementById('piece-modal');
    pieceModalTitle = document.getElementById('piece-title');
    pieceModalSubtitle = document.getElementById('piece-subtitle');
    pieceModalEnter = document.getElementById('piece-enter');
    helpModal = document.getElementById('help-modal');
    dialogModal = document.getElementById('dialog-modal');
    dialogModalTitle = document.getElementById('dialog-title');
    dialogModalMessage = document.getElementById('dialog-message');
    analyticsView = document.getElementById('analytics-view');
    monitorView = document.getElementById('monitor-view');
    monitorCanvas = document.getElementById('monitor-canvas');
    monitorCaption = document.getElementById('monitor-caption');
    monitorSource = document.getElementById('monitor-source');
    propPanel = document.getElementById('prop-panel');
    completeModal = document.getElementById('complete-modal');
    nudgeModal = document.getElementById('nudge-modal');
    lightPanel = document.getElementById('light-panel');
    lightPanelSlider = document.getElementById('light-slider');
    lightPanelValue = document.getElementById('light-value');
    roomToast = document.getElementById('office-toast');

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
    placeCamera();

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

    // Discovery checklist: install the studio item list and restore any session
    // progress. Items get ticked by the interaction handlers below
    // (markChecklistItem).
    initChecklist(STEVE_CONFIG.checklist);
    onChecklistChange((items, progress) => {
        // Peak-delight moment: the first time every discovery is found, celebrate
        // and gently invite the visitor to get in touch (once per session).
        if (progress.complete) maybeCelebrateCompletion();
        // (The partway invitation used to hang off this too, at four
        // discoveries. It counts opened things now instead: see
        // noteStoryOpened, and the note above NUDGE_AFTER for why.)
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

    // The wall display and its overlay. The part polls every five minutes while
    // the tab is visible and hands the scene a compact summary for the screen;
    // the overlay below is where the day is actually readable.
    setupAnalytics();

    updateLoadingStatus('Preparing the view…', 90);
    setupEventListeners();

    updateLoadingStatus('Ready', 100);
    setTimeout(() => {
        loadingScreen.classList.add('hidden');
        state.isLoaded = true;
        document.querySelectorAll('.ui-float').forEach(el => el.classList.add('visible'));
        // ...except whatever belongs to the room rather than to the welcome
        // card the visitor is looking at.
        syncWelcomeChrome();
    }, 400);

    // Mark the start of this visit. Records the input mode so the log can tell
    // desktop visits from touch ones. (Hits are tied together by the PoW hash.)
    track('session-start', { device: state.isMobile ? 'touch' : 'desktop' });
    _sessionStart = Date.now();

    state.isRunning = true;
    state.lastTime = performance.now();
    getRenderer().setAnimationLoop(animate);
}

/** Park the camera at the room's one composed viewpoint (view.js). Runs on
 *  every resize, so turning a phone reframes live. The pan part's turn is an
 *  offset from the composed aim, so it rides on top of this and survives it. */
function placeCamera() {
    const camera = getCamera();
    if (!camera || !STEVE_CONFIG.camera) return;
    const aspect = window.innerWidth / window.innerHeight;
    const view = composeView(STEVE_CONFIG.camera, aspect);
    camera.fov = view.fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camera.position.set(view.position.x, view.position.y, view.position.z);
    camera.lookAt(view.lookAt.x, view.lookAt.y, view.lookAt.z);
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
    // Every card back to the top when it opens. Reported from QA on this
    // scene and true of twelve others: a card closed halfway down came back
    // halfway down. See the note in the shared boot part for why this is an
    // observer rather than a line in each open() function.
    installCardScrollReset({ signal });

    window.addEventListener('pagehide', cleanup);
    // Shared resize first (renderer size + pixel ratio), then re-derive the
    // fixed viewpoint for the new aspect (the portrait lens widens).
    window.addEventListener('resize', () => {
        handleResize();
        placeCamera();
        // The enlarged monitor is sized in device pixels for the box it was
        // laid out in, so a resize under it leaves a stretched copy of the old
        // picture until it is reopened.
        if (monitorOpen) {
            sizeMonitorCanvas();
            const ctx = monitorCanvas && monitorCanvas.getContext && monitorCanvas.getContext('2d');
            if (ctx) drawMonitorTo(ctx, monitorCanvas.width, monitorCanvas.height, true);
        }
    }, { signal });

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

    // The welcome card: any click, tap, or Enter/Space lets the visitor in.
    // The room is already alive behind it, so dismissing is all it does.
    if (state.isMobile) document.body.classList.add('is-touch-device');
    setWelcomePrompt(false);
    if (blocker) {
        const dismiss = (e) => {
            if (e) e.preventDefault();
            beginVisiting();
        };
        blocker.addEventListener('click', dismiss, { signal });
        blocker.addEventListener('touchend', dismiss, { signal });
        document.addEventListener('keydown', (event) => {
            if (event.code === 'Enter' || event.code === 'Space') {
                if (!blocker.classList.contains('hidden')) beginVisiting();
            }
        }, { signal });
    }

    // THE DIRECTORY LINK SITS ON TOP OF ALL OF THAT. The whole overlay is the
    // start button, and on touch the handler above calls preventDefault(),
    // which would swallow the synthetic click and leave the link inert. Stop
    // the start events short of it so the anchor can follow its own href.
    shieldOverlayControl(document.getElementById('explore-link'), { signal });

    // How this works: the welcome card, put back up.
    if (helpBtn) helpBtn.addEventListener('click', openWelcome, { signal });

    // A click or tap on the room. A tap that merely ends a drag or a pinch
    // (the pan part's gestures, on this same canvas) belongs to the gesture,
    // not to a prop.
    canvas.addEventListener('click', (event) => {
        if (gestureClaimedTap()) return;
        checkSceneTap(event.clientX, event.clientY);
    }, { signal });
    canvas.addEventListener('touchend', (event) => {
        // Cancel the compatibility mouse click this touch would spawn: the first
        // of the two belts described above swallowGhostTap. It also stops the tap
        // raycasting twice, through the click handler above and this one.
        if (event.cancelable) event.preventDefault();
        if (gestureClaimedTap()) return;
        const touch = event.changedTouches[0];
        if (touch) checkSceneTap(touch.clientX, touch.clientY);
    }, { passive: false, signal });
    document.addEventListener('click', swallowGhostTap, { capture: true, signal });

    // Piece modal close
    if (pieceModal) pieceModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closePieceModal, { signal }));

    // Hola modal close
    if (helpModal) helpModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeHelpModal, { signal }));

    // Dancer/prop dialog modal close
    if (dialogModal) dialogModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeDialogModal, { signal }));

    // Dashboard overlay close
    if (analyticsView) analyticsView.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeAnalyticsView, { signal }));

    // Enlarged monitor close (backdrop and the round button both carry data-close)
    if (monitorView) monitorView.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeMonitorView, { signal }));

    // Discovery-complete celebration: close buttons + the Share action.
    if (completeModal) completeModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeCompleteModal, { signal }));
    installShare(
        document.getElementById('complete-share'),
        shareData,
        {
            status: document.getElementById('complete-share-status'),
            onShare: (how) => track('share', { method: how }),
            signal
        });

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

    // Escape: close whichever panel or card is up
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
        if (state.isModalOpen) { closeActiveModal(); return; }
        // The welcome card is on this list at all because it is a panel a
        // visitor can now OPEN from the corner, and Escape is what closes a
        // panel. LAST, though: the gear floats above the card, so settings can
        // be opened while it is up, and Escape belongs to the thing the
        // visitor opened most recently.
        if (blocker && !blocker.classList.contains('hidden')) beginVisiting();
    }, { signal });

    // (No autopilot tour in this experience: the office is one small room,
    // best seen from where you stand. The shared part is simply not imported.)

    // The view controls: the shared pan part, running at every screen size like
    // the other rooms with pan and zoom (alwaysOn, and the 'always-on' CSS
    // variant that shows its row, which are ONE setting in two places), with
    // the one difference that the turn WRAPS rather than stopping at a clamp,
    // because this room surrounds the eye. See config.js.
    const cam = STEVE_CONFIG.camera;
    initPortraitControls({
        getCamera,
        lookAt: cam.lookAt,
        baseFov: cam.portrait.fov,
        landscapeFov: cam.fov,
        pan: cam.portrait.pan,
        zoom: cam.portrait.zoom,
        alwaysOn: true,
        extraClass: 'always-on',
        surface: canvas,
        onFirstUse: (kind) => track(`portrait-${kind}`),
        signal
    });

    setupPropList(signal);
    setupSettingsPanel(signal);
    setupNavMenu(signal);
    setupChecklistPanel(signal);
}

/** Dismiss the welcome card and settle in for the visit. */
function beginVisiting() {
    if (!state.isLoaded || !blocker || blocker.classList.contains('hidden')) return;
    blocker.classList.add('hidden');
    state.isPaused = false;
    // The list of the room's things becomes a tab stop only now: while the
    // welcome card was up it would have been one behind it.
    if (propPanel) propPanel.hidden = false;
    syncWelcomeChrome();
    // ONCE PER VISIT, NOT ONCE PER DISMISSAL, now that the card can be put
    // back up from the corner. A visitor who reads it twice arrived once.
    if (!visitBegun) {
        visitBegun = true;
        track('begin-visiting');
    }
    // Back to the button that summoned the card, for anybody who got here by
    // keyboard. It was hidden while the card was up, so it is focusable again
    // only after syncWelcomeChrome above.
    if (welcomeReturn && typeof welcomeReturn.focus === 'function') {
        try { welcomeReturn.focus({ preventScroll: true }); } catch (e) { /* gone */ }
    }
    welcomeReturn = null;
    surfaceNudgeOnReturn(); // welcome screen just closed: show a nudge left pending
    // And the room starts waiting to be touched.
    hintAtTheRoom();
}

/**
 * Put the welcome card back up.
 *
 * IT IS THE SAME CARD, not a second copy of its sentences. Everything the room
 * says about itself is on it, and a separate help panel would be two texts to
 * keep in step, with the copy nobody edits the one a lost visitor reads. The
 * room simply waits behind it again, exactly as it does on arrival.
 */
function openWelcome() {
    if (!state.isLoaded || !blocker || !blocker.classList.contains('hidden')) return;
    setWelcomePrompt(true);
    blocker.classList.remove('hidden');
    // Reading starts at the top, whatever the visitor had scrolled to on a
    // short screen last time the card was up.
    blocker.scrollTop = 0;
    state.isPaused = true;
    // Out of the tab order while the card covers it, the same as on arrival.
    if (propPanel) propPanel.hidden = true;
    // The settings panel would otherwise be left floating over the card with
    // the gear that opened it gone from under it. Adding the class is the way
    // every other close works here: the panel's observer keeps aria-expanded
    // and the outside-click listener in step from that one change.
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel) settingsPanel.classList.add('hidden');
    syncWelcomeChrome();
    // The room's own hints wait their turn rather than landing on the card.
    stopRoomHint();
    welcomeReturn = helpBtn;
    if (blocker.focus) blocker.focus({ preventScroll: true });
    track('help-opened');
}

/**
 * Nothing in the corner while the welcome card is up.
 *
 * `.menu-btn` and `.settings-btn` are z-index 110 and the card is 100, so both
 * float ON TOP of it and are tab stops in front of it. How-this-works was the
 * plain case, a live control summoning what is already on the screen. The gear
 * is the quieter one: a visitor's first sight of the room was a welcome card
 * with a settings button over it, which is chrome competing with the only
 * sentences the room gets to say for itself.
 *
 * The skip link goes with them, because its target is the gear. A skip link
 * whose destination is not on the screen moves focus nowhere, and it is the
 * FIRST thing a keyboard visitor reaches: better to have nothing to skip to
 * than an offer that does nothing. It comes back with the gear.
 *
 * `.ui-float` is display:none until `.visible` says otherwise, so the class is
 * what takes each button off the screen AND out of the tab order in one act.
 * The skip link is positioned rather than floated, so it takes the `hidden`
 * attribute, which nothing in the sheet overrides for it.
 */
function syncWelcomeChrome() {
    const reading = !blocker || !blocker.classList.contains('hidden');
    const offered = state.isLoaded && !reading;
    if (helpBtn) helpBtn.classList.toggle('visible', offered);
    const gear = document.getElementById('settings-btn');
    if (gear) gear.classList.toggle('visible', offered);
    const skip = document.querySelector('.skip-link');
    if (skip) skip.hidden = !offered;
}

/**
 * The one line on the welcome card that names a control.
 *
 * TWO VERBS AND A DESTINATION. "Step inside" is wrong for somebody who has
 * been in the room already and pressed the button in the corner to read this
 * again, and "click" is wrong on a phone, which is where most visitors meet
 * it. Both live here so neither can be changed without the other.
 */
function setWelcomePrompt(returning) {
    const prompt = document.getElementById('begin-prompt');
    if (!prompt) return;
    const verb = state.isMobile ? 'Tap' : 'Click';
    prompt.textContent = returning
        ? `${verb} to come back to the office`
        : `${verb} to step inside`;
}

// ---- A room that offers itself ---------------------------------------------
//
// EVERY STORY IN HERE OPENS FROM A CLICK ON A 3D SURFACE, and once the welcome
// card is gone nothing on the screen says so. A visitor who came for the room
// rather than for the card can stand in a finished office, turn all the way
// around, and leave without learning that any of it answers. The checklist
// that would have hinted at it has no panel in this scene, so this is the only
// thing that teaches the room.
//
// THE SHAPE COMES FROM www/garden's planting nudge, including why it is not a
// single shot: one line, once, is missed by anybody who was still looking at
// the window when it arrived. So it asks again at a widening gap, in different
// words each time (a sentence repeated verbatim reads as a stuck screen), and
// gives up after three. It stops for good the moment anything in the room is
// opened, which is the whole point of it.
//
// A TOAST RATHER THAN A CARD, deliberately. The visitor is being invited to
// look at the room, so the invitation must not take the room away, and it is
// the only kind of prompt that reaches a touch visitor, who has no cursor to
// be told anything with.
const ROOM_HINT_DELAYS_MS = [7000, 18000, 22000];   // after the card, then apart
const ROOM_HINT_MS = 5200;                           // how long each line stays

let roomToast = null;      // the toast element (resolved in init)
let roomToastTimer = 0;
let roomHintTimer = 0;
let roomHintRound = 0;     // the next line to offer
let roomTouched = false;   // something in the room has been opened

/** The lines, in order, worded for the device holding them. */
function roomHintLines() {
    const verb = state.isMobile ? 'Tap' : 'Click';
    return [
        `Everything in this room has a story. ${verb} the desk, the cat, or Steve himself.`,
        `The cat, the closet, even the litter box. They all have something to say.`,
        `The big screen behind Steve shows who has been visiting SceneXP today.`
    ];
}

/** Say one thing, briefly, over the room. */
function showRoomToast(message, ms) {
    if (!roomToast) return;
    roomToast.textContent = message;
    roomToast.classList.add('visible');
    if (roomToastTimer) clearTimeout(roomToastTimer);
    roomToastTimer = setTimeout(() => {
        roomToastTimer = 0;
        roomToast.classList.remove('visible');
    }, ms || ROOM_HINT_MS);
}

function hideRoomToast() {
    if (roomToastTimer) { clearTimeout(roomToastTimer); roomToastTimer = 0; }
    if (roomToast) roomToast.classList.remove('visible');
}

/** Is the visitor already reading or adjusting something? A line arriving on
 *  top of the welcome card, a story card, the settings panel or the dimmer is
 *  a line nobody reads, and on a narrow screen it would land on the panel
 *  itself. The round is spent either way, so the offer is never repeated
 *  endlessly at somebody who simply had a panel open. */
function somethingElseIsUp() {
    if (state.isModalOpen) return true;
    if (!blocker || !blocker.classList.contains('hidden')) return true;
    return ['settings-panel', 'light-panel', 'nav-menu'].some((id) => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
    });
}

/** Wait, then offer the room. Re-arms itself for the next line. */
function hintAtTheRoom() {
    stopRoomHint();
    if (roomTouched || roomHintRound >= ROOM_HINT_DELAYS_MS.length) return;
    const round = roomHintRound;
    roomHintTimer = setTimeout(() => {
        roomHintTimer = 0;
        roomHintRound = round + 1;
        if (!roomTouched && !somethingElseIsUp()) {
            showRoomToast(roomHintLines()[round], ROOM_HINT_MS);
            // Which round it took, so the log can say whether the first line
            // is doing its job or whether visitors need all three.
            track('room-hint', { kind: String(round + 1) });
        }
        hintAtTheRoom();
    }, ROOM_HINT_DELAYS_MS[round]);
}

/** Hold the clock (the welcome card is up, or the page is going away). */
function stopRoomHint() {
    if (roomHintTimer) { clearTimeout(roomHintTimer); roomHintTimer = 0; }
}

/** Something in the room was opened, so it needs no more offering. Called from
 *  onModalOpened, which is the one gate every story card, the dashboard, and
 *  the light switch's dimmer all pass through, by click and from the list
 *  alike. */
function noteRoomTouched() {
    roomTouched = true;
    stopRoomHint();
    hideRoomToast();
}

// ---- The room's things, without a pointer ----------------------------------

// The row that stands for Steve himself. Not a propKind (he is the host, with
// his own card), so it cannot collide with one.
const HOST_ROW = 'steve';

/** Fill the off-screen list with everything in the room worth a story: Steve
 *  first, then every registered prop that has a card, in the card table's
 *  order and under the card's own title, then the light switch, which opens
 *  the dimmer rather than a card. */
function setupPropList(signal) {
    const list = document.getElementById('prop-list');
    if (!list) return;
    const kinds = getOutdoorPropMeshes()
        .map(g => g && g.userData && g.userData.propKind)
        .filter(Boolean);
    const items = propListItems(PROP_CONTENT, kinds, {
        before: getRoquiMesh() ? [{ id: HOST_ROW, label: 'Steve' }] : [],
        after: kinds.includes('lightswitch') ? [{ id: 'lightswitch', label: 'The Light Switch' }] : []
    });
    installPropList({ list, items, onChoose: chooseFromList, signal });
}

/** A row was chosen: open exactly what a click on that thing would. */
function chooseFromList(id) {
    if (state.isPaused || state.isModalOpen) return;
    if (id === HOST_ROW) { openHelpModal(); return; }
    const prop = getOutdoorPropMeshes().find(g => g && g.userData && g.userData.propKind === id);
    if (prop) openPropModal(prop);
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
// The brightness preference is remembered for the browser session
// (sessionStorage) and reapplied on the next load, so a visitor's tweak
// survives reloads within a visit. (Walk speed and look sensitivity lived
// here too, until the room stopped being walked through.)
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
    // (gear toggle, close button, Escape, menu opening): keep aria-expanded in
    // sync and manage the outside-click-to-close listener.
    const onSettingsVisibilityChanged = () => {
        const open = !settingsPanel.classList.contains('hidden');
        settingsBtn.setAttribute('aria-expanded', String(open));
        if (open) document.addEventListener('pointerdown', onSettingsOutsidePointer, true);
        else document.removeEventListener('pointerdown', onSettingsOutsidePointer, true);
    };
    new MutationObserver(onSettingsVisibilityChanged).observe(settingsPanel, { attributes: true, attributeFilter: ['class'] });
    onSettingsVisibilityChanged();

    // Ambient Brightness: this slider and the light switch's floating
    // dimmer are the same control in two places. applyBrightness keeps
    // them (and the room) in sync. A value remembered from earlier this
    // session takes precedence over the default.
    const stored = loadStoredSettings();
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
    if (switchObj) _lightSwitchTarget = switchObj;
    lightPanel.classList.remove('hidden');
    positionLightPanelOverSwitch();
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
 *  the CSS position when the camera or switch is unavailable, and when the
 *  switch is BEHIND the eye: from a fixed spot that turns all the way round,
 *  a visitor choosing it from the list may well be facing away from it, and
 *  a point behind the camera projects to the mirror image of where it is. */
function positionLightPanelOverSwitch() {
    const camera = getCamera();
    if (!lightPanel || !_lightSwitchTarget || !camera) return;
    const p = new THREE.Vector3();
    _lightSwitchTarget.getWorldPosition(p);
    p.project(camera);
    if (!(p.z < 1)) {
        lightPanel.style.left = '';
        lightPanel.style.top = '';
        lightPanel.style.bottom = '';
        lightPanel.style.transform = '';
        return;
    }
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

/** After a card closes: surface a celebration or nudge that waited its turn.
 *  (This used to re-take the pointer lock as well, before the room stopped
 *  being walked through.) */
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
        if (nudgeIsPending() && !state.isModalOpen) openNudgeModal();
    }, 200);
}

// ---- Studio interaction ----------------------------------------------------

function buildRaycastTargets() {
    const targets = [];
    const galleryGroup = getGalleryGroup();
    if (galleryGroup) targets.push(galleryGroup);
    // Steve himself (getRoquiMesh is the shared host seam's legacy name)…
    const host = getRoquiMesh();
    if (host) targets.push(host);
    // …his floating greeter sign, when the config enables one (off here:
    // the host needs no tag in a room this small, so getHelpSign is null)…
    const helpSign = getHelpSign();
    if (helpSign) targets.push(helpSign);
    // …any ambient NPCs (none in the office; the seam stays wired)…
    getDancerMeshes().forEach(mesh => targets.push(mesh));
    // …and the office props: the desks, the cat, the wall display, the
    // closet, and the rest.
    clickTargets = targets.concat(getOutdoorPropMeshes());
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

/** A click or tap on the room, in client pixels. */
function checkSceneTap(clientX, clientY) {
    if (!state.isLoaded || state.isPaused || state.isModalOpen) return;
    pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    checkPieceClick();
}

/** Nearest intersection under `pointer`. A direct hit is exact; otherwise a
 *  couple of rings of sample rays around the point are tried so small targets
 *  (the mouse, the router) are far easier to hit with a fingertip.
 *
 *  The rings only run when NOTHING is directly under the pointer, so they can
 *  never hand a tap to a small prop hiding behind whatever was actually
 *  touched (the fault www/sunnyvalejenn's first-refusal search needed a depth
 *  check to fix). Returns the intersection or null. */
function pickNearestHit(targets, camera) {
    raycaster.setFromCamera(pointer, camera);
    let best = raycaster.intersectObjects(targets, true)[0] || null;
    if (best) return best;
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

    // Nearest hit wins, so Steve in front of his desk takes priority over the
    // desk behind him. pickNearestHit adds a forgiving tap radius.
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

function openPieceModal(data) {
    if (!pieceModal) return;
    state.isModalOpen = true;
    track('open-piece', { id: data.galleryId, title: data.galleryTitle });
    if (pieceModalTitle) pieceModalTitle.textContent = data.galleryTitle;
    if (pieceModalSubtitle) pieceModalSubtitle.textContent = data.gallerySubtitle || '';
    if (pieceModalEnter) {
        pieceModalEnter.setAttribute('href', data.galleryUrl);
        pieceModalEnter.textContent = `Enter ${data.galleryTitle} →`;
    }
    pieceModal.classList.remove('hidden');
    if (pieceModalEnter) pieceModalEnter.focus();
}

function closePieceModal() {
    if (!pieceModal) return;
    pieceModal.classList.add('hidden');
    state.isModalOpen = false;
    resumeGameAfterModal();
}

function openHelpModal() {
    if (!helpModal) return;
    state.isModalOpen = true;
    noteStoryOpened();   // the host is one of the things in the room
    track('open-hello');
    markChecklistItem('hello');
    // Steve pauses his typing and turns around to chat; the cat sleeps on.
    pauseRoquiForDialog();
    // Tailor the control tips to the input device.
    helpModal.querySelectorAll('.help-desktop').forEach(el => { el.hidden = state.isMobile; });
    helpModal.querySelectorAll('.help-mobile').forEach(el => { el.hidden = !state.isMobile; });
    helpModal.querySelectorAll('.help-verb').forEach(el => { el.textContent = state.isMobile ? 'tap' : 'click'; });
    helpModal.classList.remove('hidden');
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

/** Open the shared dialog modal for a dancer in the class. */
function openDancerModal(dancerMesh) {
    if (!dialogModal) return;
    state.isModalOpen = true;
    dialogKind = 'dancer';
    track('greet-dancer');
    markChecklistItem('dancer');
    // The clicked dancer steps out and turns to chat; the class dances on.
    pauseDancerForDialog(dancerMesh);

    if (dialogModalTitle) dialogModalTitle.textContent = 'Between Tasks';
    // Random each click so re-clicking the same dancer gives a fresh line.
    if (dialogModalMessage) dialogModalMessage.textContent = pickRandomLine(DANCER_LINES);
    dialogModal.classList.remove('hidden');
    const dismiss = dialogModal.querySelector('.piece-cancel');
    if (dismiss) dismiss.focus();
}

// Title + a couple of lines for each kind of clickable office prop. A warm,
// courteous host's voice with a little dry humor, free of em-dashes and
// semicolons. Two lines apiece so a second click gives something new. Props
// that are discoveries carry a checklistId so a click ticks the list. The
// wall display is special: clicking it opens the dashboard overlay instead
// (see openPropModal). The titles double as the rows of the list of the
// room's things (setupPropList), so a row always names its card.
const PROP_CONTENT = {
    dashboard: {
        // Opens the dashboard overlay instead (see openPropModal), so no lines.
        title: 'The Wall Display',
        checklistId: 'dashboard',
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
            // THE SECOND SENTENCE IS THE ONLY POINTER TO THE EASTER EGG. The
            // glow behind the doors is found by turning the view all the way
            // round, which most visitors never do unprompted, and a secret
            // nobody can find is just unused geometry.
            "Every tiny office needs a closet that absorbs whatever the room cannot. Look through the crack between the doors, though. Something back there is still running."
        ]
    },
    board: {
        title: 'The Whiteboard',
        lines: [
            "The loop every project runs on, in marker: plan, build, test, ship, learn, and round again. Ship is circled in red because ship is the hard one.",
            "It has been erased and redrawn more times than five boxes suggest. The ghosts of the old diagrams are still faintly there."
        ]
    },
    oldPc: {
        title: 'The Old Family Computer',
        lines: [
            "A beige tower and a CRT, still going in the back of the closet. Nobody remembers what it was working on.",
            "It has been at it since about 2004. Steve maintains that it is nearly finished."
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
        // Opens the enlarged monitor instead (see openPropModal), so no lines:
        // its two quips are MONITOR_CAPTIONS, printed under that screen. The
        // title stays, because it is this prop's row in the list of the room's
        // things and a row has to name its card.
        title: 'The Samsung Monitor',
        lines: []
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
 *  quip). Two props are special: the wall display opens the dashboard,
 *  and the light switch opens the floating dimmer panel. */
function openPropModal(propObj) {
    if (!dialogModal) return;
    const kind = propObj && propObj.userData && propObj.userData.propKind;
    const content = PROP_CONTENT[kind];
    // Everything a tap can actually OPEN counts toward the invitation, the
    // three that open something other than a story card included. A prop with
    // no card (or a kind that does not exist) opens nothing, so it counts for
    // nothing.
    const opensItsOwnView = kind === 'dashboard' || kind === 'lightswitch' || kind === 'monitor';
    if (opensItsOwnView || (content && content.lines.length)) noteStoryOpened();
    if (kind === 'dashboard') { openAnalyticsView(); return; }
    if (kind === 'lightswitch') { openLightPanel(propObj); return; }
    if (kind === 'monitor') { openMonitorView(); return; }

    if (!content || !content.lines.length) return;
    state.isModalOpen = true;
    dialogKind = 'prop';
    track('click-prop', { kind });
    if (content.checklistId) markChecklistItem(content.checklistId);
    if (dialogModalTitle) dialogModalTitle.textContent = content.title;
    if (dialogModalMessage) dialogModalMessage.textContent = content.lines[propTick++ % content.lines.length];
    dialogModal.classList.remove('hidden');
    const dismiss = dialogModal.querySelector('.piece-cancel');
    if (dismiss) dismiss.focus();
}

// ---- The wall display and its dashboard -------------------------------------
// The display on the east wall carries a headline (drawDashboardFace in
// store.js), and clicking it opens #analytics-view: the same day in DOM, where
// it can be scrolled, grouped by session or by scene, narrowed by scene and by
// action, and read aloud by a screen reader. A painted 3D surface can do none
// of that, which is why the enlarged view is not a canvas.

/** Wire the shared analytics part to the overlay's controls and to the wall
 *  display, then start its background poll. */
function setupAnalytics() {
    initAnalytics({
        body: document.getElementById('analytics-body'),
        dateLabel: document.getElementById('analytics-date'),
        status: document.getElementById('analytics-status'),
        prevBtn: document.getElementById('analytics-prev'),
        nextBtn: document.getElementById('analytics-next'),
        collapseAllBtn: document.getElementById('analytics-collapse-all'),
        groupSelect: document.getElementById('analytics-group'),
        sceneSelect: document.getElementById('analytics-scene'),
        actionFilter: document.getElementById('analytics-actions'),
        filterSummary: document.getElementById('analytics-filter-summary'),
        selectAllBtn: document.getElementById('analytics-select-all'),
        clearAllBtn: document.getElementById('analytics-clear-all'),
        // The wall display always mirrors the latest day, whatever the overlay
        // is filtered to: the screen reports the room, and the filters are the
        // viewer's own lens on it.
        onSummary: updateDashboardScreen
    });
    startAnalyticsAutoRefresh();
}

/** Open the dashboard: from a click on the wall display, or from its row in
 *  the list of the room's things. Either one is finding the display, so either
 *  ticks "Notice the big screen behind Steve".
 *
 *  (It had a button in the corner as well, briefly, on 2026-09-18. Steve took
 *  it out the same day: the dashboard is mostly his, and a button in the
 *  chrome would have pointed every visitor at it. The list keeps it reachable
 *  without a pointer while staying out of sight of anyone using one.) */
function openAnalyticsView() {
    if (!analyticsView) return;
    state.isModalOpen = true;
    analyticsOpen = true;
    track('click-prop', { kind: 'dashboard' });
    markChecklistItem('dashboard');
    analyticsView.classList.remove('hidden');
    // Ask for fresh numbers on open rather than showing whatever the last poll
    // left behind, which could be nearly five minutes old.
    loadAnalytics();
    const closeBtn = analyticsView.querySelector('.analytics-close');
    if (closeBtn) closeBtn.focus();
}

function closeAnalyticsView() {
    if (!analyticsView) return;
    analyticsView.classList.add('hidden');
    analyticsOpen = false;
    state.isModalOpen = false;
    resumeGameAfterModal();
}

// ---- The monitor, up close --------------------------------------------------
// The Samsung on the desk is painted with a slice of this room's own source,
// and at the composed distance it is a smudge: the page's own description sells
// "the room's own source code on the monitor" and no visitor could read a word
// of it. Clicking the monitor opens it at full size instead of a story card,
// the way the Interstate shop's back-office screen does, and the card's quips
// come along as the caption underneath so nothing is lost.
//
// ONE PAINTER, TWO SURFACES. store.js owns the drawing and exports
// drawMonitorTo, so this is the wall's screen at a larger size and in the same
// state, blinking cursor included. A second drawing here would be a second
// thing to keep in step.

// The captions under the enlarged screen, rotating per opening, which is what
// the prop's story card used to say.
const MONITOR_CAPTIONS = [
    "Big, beige, and silver, and full of code. The wide screen holds a whole room's blueprint at once.",
    "Steve stares into this thing for hours and somehow rooms come out of it. Fair trade.",
    "That is this room's own source, more or less. The part that draws the cat is further down."
];
let monitorOpen = false;
let monitorRaf = 0;
let monitorTick = 0;

/** Size the canvas to its laid-out screen at device pixels, so the painter
 *  draws crisply rather than being scaled up from a smaller buffer. */
function sizeMonitorCanvas() {
    if (!monitorCanvas || !monitorCanvas.getBoundingClientRect) return;
    const rect = monitorCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    monitorCanvas.width = Math.max(2, Math.round((rect.width || 760) * dpr));
    monitorCanvas.height = Math.max(2, Math.round((rect.height || 475) * dpr));
}

/** Repaint while the overlay is up. The cursor blink is advanced by
 *  updateStudio on the main loop, which keeps running behind this, so there is
 *  nothing to drive here but the painting itself. */
function startMonitorRender() {
    const ctx = monitorCanvas && monitorCanvas.getContext && monitorCanvas.getContext('2d');
    if (!ctx) return;
    let first = true;
    const loop = () => {
        if (!monitorOpen) return;
        drawMonitorTo(ctx, monitorCanvas.width, monitorCanvas.height, first);
        first = false;
        monitorRaf = requestAnimationFrame(loop);
    };
    loop();
}

function stopMonitorRender() {
    if (monitorRaf) cancelAnimationFrame(monitorRaf);
    monitorRaf = 0;
}

function openMonitorView() {
    if (!monitorView) return;
    state.isModalOpen = true;
    monitorOpen = true;
    track('click-prop', { kind: 'monitor' });
    if (monitorCaption) monitorCaption.textContent = pickLine(MONITOR_CAPTIONS, monitorTick++);
    // The same lines as text, for anybody who cannot see a canvas. A painted
    // surface cannot be selected, zoomed by the browser or read aloud, which is
    // why the dashboard is DOM as well.
    if (monitorSource) monitorSource.textContent = getEditorLines().join('\n');
    monitorView.classList.remove('hidden');
    sizeMonitorCanvas();     // measure now that the overlay has been laid out
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

function closeDialogModal() {
    if (!dialogModal) return;
    dialogModal.classList.add('hidden');
    // Resume whichever kind of NPC was talking ('prop' has none).
    if (dialogKind === 'dancer') resumeDancerFromDialog();
    dialogKind = null;
    state.isModalOpen = false;
    resumeGameAfterModal();
}

// ---- The every-few-taps invitation ------------------------------------------
// Catches engaged visitors who may never finish the discovery hunt: once they
// have opened a few things, reuse the completion celebration's card styling for
// a single, warm, low-pressure card pointing at the portfolio. Shown at most
// once per session, and (like the celebration) it waits out any open modal
// rather than stacking.
//
// FOUR THINGS OPENED, NOT FOUR DISCOVERIES (changed 2026-09-21, matching the
// shape www/sunnyvalejenn uses). The count used to come from the checklist, so
// it only ever moved for the six things on it. A visitor who opened the
// monitor, the mouse, the router and the trash can had read four stories,
// enjoyed the room, and never met the invitation. Everything a tap can open
// counts now: a prop's story, Steve's greeting, the wall display and the light
// switch, whether it was reached by pointer or from the keyboard list.
//
// ONCE PER SESSION, NOT EVERY FOURTH. www/sunnyvalejenn re-offers its card on
// every fourth story, and that scene has a dozen props, no checklist and no
// celebration at the end. This room has twenty-odd things to open and a
// completion card already waiting at the finish, so a second unprompted card
// every four taps would be the third time it asks. www/automan went further
// still and retired its unprompted invitation entirely (its D43), leaving the
// contact card on request only.

const NUDGE_SHOWN_KEY = 'steve-nudged';            // session flag: shown (or superseded)
const NUDGE_PENDING_KEY = 'gallery-nudge-pending';  // session flag: decided, not yet shown
const NUDGE_AFTER = 4;                               // things opened before the offer
const NUDGE_RETURN_DELAY_MS = 400;                   // settle time after the welcome screen closes

let storiesOpened = 0;   // things in the room this visitor has opened

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

/** One more thing in the room has been opened. Called from the two functions a
 *  tap (or a row of the keyboard list) arrives at: a prop's card and Steve's
 *  greeting. */
function noteStoryOpened() {
    storiesOpened += 1;
    maybeNudgeContact();
}

function maybeNudgeContact() {
    if (!nudgeModal || storiesOpened < NUDGE_AFTER) return;
    if (nudgeAlreadyShown() || nudgeIsPending()) return;
    // Record the intent in sessionStorage (so it survives the visitor following a
    // link out to a 2D page) but do not show yet. The thing that crosses the
    // threshold is the card being opened right now, so we always defer rather
    // than stack on top of it: that card's close (-> resumeGameAfterModal)
    // surfaces the invitation in the same session, and surfaceNudgeOnReturn()
    // handles the case where the visitor navigated away before it ever closed.
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
    nudgeModal.classList.remove('hidden');
    // FOCUS THE CARD, NOT THE LINK. The primary action leaves the site now, so
    // landing on it would make a stray Enter a navigation and would read the
    // action to a screen reader before the sentence it belongs to. The
    // container carries tabindex="-1" so it can take focus without joining the
    // tab order (the same arrangement www/sunnyvalejenn and www/automan use).
    const lead = nudgeModal.querySelector('.modal-container')
        || nudgeModal.querySelector('[data-close]');
    if (lead && lead.focus) lead.focus();
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
    completeModal.classList.remove('hidden');
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
    // The completion card at the end of the discovery hunt is the one that
    // asks for a message. (The partway invitation used to be on this list too,
    // and now leads to the portfolio instead.)
    const complete = document.getElementById('complete-contact');
    if (complete) complete.href = site.builder.contactPath;
    // Steve's own portfolio: his greeting card, and the every-few-taps
    // invitation. The only outbound links in the room, and the only ones whose
    // text has to be kept in step with the href by hand, because each names the
    // domain out loud. That is what lets a visitor (and a screen reader) know
    // where the new tab is going.
    if (site.portfolio) {
        ['help-site', 'nudge-site'].forEach((id) => {
            const link = document.getElementById(id);
            if (link) link.href = site.portfolio.url;
        });
    }
}

/** What a visitor sends. The ladder itself (native sheet, then clipboard, then
 *  mailto), the acknowledgement, and the not-disabling-of-the-focused-button
 *  all live in shared/js/share-1.0.0.js now.
 *
 *  THIS FILE USED TO CARRY ITS OWN COPY OF ALL OF IT, along with six other
 *  scenes, and the copies drifted. www/xo fixed a real accessibility defect in
 *  its own during the 2026-09-14 sweep, and the fix never travelled: disabling
 *  the focused button throws keyboard focus out of the dialog, so the visitor's
 *  next Tab starts from the top of the document. One implementation now, held
 *  by tests/shared-share.test.mjs.
 *
 *  A FUNCTION AND NOT AN OBJECT, because `installShare` asks at press time.
 *  Nothing here changes between presses, but the scenes that share a RESULT
 *  need it to, and one shape across all of them is worth more than the
 *  object this could have been. */
function shareData() {
    return {
        title: STEVE_CONFIG.site.share.title,
        text: STEVE_CONFIG.site.share.text
    };
}

/** Close whichever modal is currently open (used by the Escape key). */
function closeActiveModal() {
    if (completeModal && !completeModal.classList.contains('hidden')) closeCompleteModal();
    else if (nudgeModal && !nudgeModal.classList.contains('hidden')) closeNudgeModal();
    else if (analyticsView && !analyticsView.classList.contains('hidden')) closeAnalyticsView();
    else if (monitorView && !monitorView.classList.contains('hidden')) closeMonitorView();
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
    // While a full-screen overlay is up it covers the room, so skip the
    // (wasted) 3D render behind it.
    if (!analyticsOpen && !monitorOpen) render();
}

function update(deltaTime) {
    const camera = getCamera();
    // Order matters: the day/night pass moves the sun and rewrites the scene
    // lights' intensities every frame, and the interior rig then rebalances
    // against them (nightBoost after dark). Interior after day/night, always.
    updateDayNightCycle(deltaTime);
    updateInteriorAmbientLight();
    // Steve, the cat, the fence birds and the editor cursor. Steve turns to
    // face whoever is talking to him, and the one who is talking to him is
    // always standing where the camera is.
    updateStudio(camera.position, deltaTime);
    updateBackgroundAnimations(deltaTime);

    // Bob + billboard the floating greeter sign toward the camera. A no-op
    // when the config leaves the sign off (as it does here); the call stays
    // so flipping greeterSign.enabled back on needs no main.js change.
    _elapsed += deltaTime;
    updateCheckoutSign(_elapsed, camera.position);

    // The view controls last, so the frame renders with this frame's aim.
    updatePortraitControls(deltaTime);
}

// ---- Cleanup / state ------------------------------------------------------

function cleanup() {
    state.isRunning = false;
    const renderer = getRenderer();
    if (renderer) renderer.setAnimationLoop(null);
    if (cleanupController) cleanupController.abort();
    // The things that outlive their listeners: an AbortSignal cancels events,
    // not setTimeout and not a requested frame.
    stopRoomHint();
    hideRoomToast();
    stopMonitorRender();
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
export const __test__ = { bufToHex, readNumericSetting, pickLine, PROP_CONTENT, HOST_ROW };
