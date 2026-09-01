// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for the John Walker, The Auto Man
 * experience.
 *
 * The fourth passive SceneXP experience, so this conductor stays small:
 * build the showroom, park the camera at the corner of the sales desk,
 * and let the room do all the living. There are no movement controls, no
 * collision, and no moving day/night cycle (the sky is frozen at noon so
 * it is a bright midday on the lot at every hour, though the cycle's
 * per-frame pass still runs for the fixed-time sky paint and the
 * shadow-map refresh). The interactions that do exist are featherweight:
 * the welcome overlay (dismissed with a click, tap, or key), the floating
 * Home and contact buttons, the always-on pan and zoom row (shared pan
 * part, with swipe, tilt, and pinch on touch), and one raycast per tap to
 * see what the visitor pointed at, answered in the host's voice by the
 * dialog card.
 *
 * Unlike the other featured-business experiences, this one has nowhere
 * outward to send anybody: John has no separate website, because this
 * page is his web presence. So the second floating button and every card
 * CTA lead to the contact card rather than off the site.
 *
 * BUILD STATUS: milestone M0. The prop table, the person taps, the
 * contact card's assembled links, and the rewired contact button all
 * arrive at M8. See specs/automan/TASKS.md.
 *
 * Future contributors: this file (with www/jamar/js/main.js and
 * www/gavin/js/main.js) is the template for "living diorama"
 * experiences. If your scene wants walking and clicking instead, start
 * from www/steve/js/main.js, which wires the shared controls.
 */

import { AUTOMAN_CONFIG } from './config.min.js';
import { getProofOfWork, bufToHex } from '../../shared/js/boot-1.0.0.min.js';
import { initPortraitControls, updatePortraitControls, gestureClaimedTap } from '../../shared/js/pan-1.0.0.min.js';
import {
    initScene, handleResize, render, getCamera, getRenderer,
    updateDayNightCycle, removeTestObjects, isTouchDevice
} from '../../shared/js/scene-1.0.0.min.js';
import {
    initStore, updateShowroom, updateBackgroundAnimations, updateInteriorAmbientLight
} from './store.min.js';
import { getOutdoorPropMeshes } from '../../shared/js/world-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';

// ---- Application state ----------------------------------------------------

const state = {
    isRunning: false,
    isLoaded: false,
    lastTime: 0,
    isMobile: false
};

// DOM references (resolved in init)
let canvas, loadingScreen, blocker;
let dialogModal, dialogTitle, dialogMessage, dialogCta;
let dialogOpen = false;   // one dialog at a time; taps pause while it's up

// The every-few-taps "reach out" invitation (the garden and tire-shop
// experiences surface theirs a few checklist discoveries in; this scene
// has no checklist, so every fourth prop story earns it instead, shown
// once that story's card closes so the two never stack).
let nudgeModal;
let nudgeOpen = false;
let nudgePending = false;
let propClicks = 0;
const NUDGE_EVERY = 4;

let cleanupController = null;

// One raycast per tap, with a little forgiveness for fingertips
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const _tolPointer = new THREE.Vector2();  // offset sample point for forgiving taps
const TAP_TOLERANCE_PX = 26;              // matches the other experiences' tap radius

// ---- Initialization -------------------------------------------------------

async function init() {
    state.isMobile = isTouchDevice();
    setMobile(state.isMobile); // tag every telemetry ping with mobile vs not

    canvas = document.getElementById('game-canvas');
    loadingScreen = document.getElementById('loading-screen');
    blocker = document.getElementById('blocker');
    dialogModal = document.getElementById('dialog-modal');
    dialogTitle = document.getElementById('dialog-title');
    dialogMessage = document.getElementById('dialog-message');
    dialogCta = document.getElementById('dialog-cta');
    nudgeModal = document.getElementById('nudge-modal');

    if (!canvas) return;

    // Wire the Home and website buttons from AUTOMAN_CONFIG.site, so config
    // stays the single home for these values. Equivalent fallbacks are
    // baked into the HTML for the no-JS path.
    applySiteLinks();

    // Soft bot deterrent: solve a tiny proof of work before building the scene
    // (or reuse a still-valid one from sessionStorage). Hand the hash to the
    // telemetry layer so it tags every ping.
    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(AUTOMAN_CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Initializing renderer…', 25);
    initScene(canvas, AUTOMAN_CONFIG);
    placeCamera();

    updateLoadingStatus('Unlocking the showroom…', 50);
    initStore();
    removeTestObjects();

    updateLoadingStatus('Pouring the coffee…', 80);
    setupEventListeners();

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

/** Park the camera at the experience's one composed viewpoint. The
 *  showroom provides all the motion; the camera only re-derives on
 *  resize.
 *
 *  The composition assumes a landscape frame. three.js FOV is vertical,
 *  so a portrait phone keeps the height but loses both sides, and three
 *  people sitting side by side across a desk is exactly the composition
 *  that fails there. Below an aspect of 1 this widens to the portrait FOV
 *  and dollies the eye back until the composed half-width (John's outside
 *  shoulder to his customer's) fits the narrow frame, capped at
 *  portrait.maxRange so the dolly can never back through a wall. Runs on
 *  every resize, so rotating the phone reframes live.
 *
 *  THE DOLLY MOVES ALONG THE VIEW AXIS, NOT IN WORLD Z. The other passive
 *  experiences raise camera.position.z alone, which is correct only for a
 *  camera looking roughly down -Z, as Jenn's doorway seat does. This
 *  camera sits at the desk's open corner and looks diagonally across it,
 *  so pushing it in +z would slide it sideways relative to its own view
 *  and swing the aim, because lookAt stays put. Backing away from the
 *  lookAt point along (position - lookAt) keeps the composition and only
 *  changes how much of it fits. */
function placeCamera() {
    const camera = getCamera();
    const cam = AUTOMAN_CONFIG.camera;
    if (!camera || !cam) return;

    const aspect = window.innerWidth / window.innerHeight;
    const portrait = cam.portrait || {};
    let fov = cam.fov || camera.fov;

    // The composed eye, and the axis it looks along.
    const tx = cam.lookAt.x, ty = cam.lookAt.y, tz = cam.lookAt.z;
    let ex = cam.position.x, ey = cam.position.y, ez = cam.position.z;
    const vx = ex - tx, vy = ey - ty, vz = ez - tz;
    const range = Math.hypot(vx, vy, vz);

    if (aspect < 1 && portrait.minHalfWidth && range > 0) {
        fov = portrait.fov || fov;
        // Half the width visible at the lookAt plane is
        // range * tan(fov / 2) * aspect, so the range that just fits
        // minHalfWidth either side of the deal sheet is that, inverted.
        const halfFovRad = (fov / 2) * Math.PI / 180;
        const needed = portrait.minHalfWidth / (Math.tan(halfFovRad) * aspect);
        let r = Math.max(range, needed);                        // only ever back away
        if (portrait.maxRange) r = Math.min(r, portrait.maxRange);   // never through a wall
        const k = r / range;
        ex = tx + vx * k;
        ey = ty + vy * k;
        ez = tz + vz * k;
    }

    camera.fov = fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camera.position.set(ex, ey, ez);
    camera.lookAt(tx, ty, tz);
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
    // Shared resize first (renderer size + pixel ratio), then re-derive the
    // fixed viewpoint for the new aspect (the portrait dolly above).
    window.addEventListener('resize', () => {
        handleResize();
        placeCamera();
    }, { signal });

    // iOS Safari ignores `user-scalable=no` (Apple re-enabled zoom in iOS 10 for
    // accessibility), so the only way to keep the immersive 3D view from being
    // pinch-zoomed there is to block Safari's own gesture events. These are
    // non-standard, Safari-only events; preventing gesturestart stops the pinch.
    // Scoped to this page only: the 2D content pages stay zoomable.
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

    // The welcome overlay: any click, tap, or keypress lets the visitor in.
    // The scene is already alive behind it, so dismissing is all it does.
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

    // A click or tap on the scene: any of the showroom's storytelling
    // props, or any of the three people at the desk (from M8).
    // A tap that merely ends a swipe or pinch (see the surface option
    // below) belongs to the gesture, not to a prop.
    canvas.addEventListener('click', (event) => {
        if (gestureClaimedTap()) return;
        checkSceneTap(event.clientX, event.clientY);
    }, { signal });
    canvas.addEventListener('touchend', (event) => {
        if (gestureClaimedTap()) return;
        const touch = event.changedTouches[0];
        if (touch) checkSceneTap(touch.clientX, touch.clientY);
    }, { signal });

    // The story dialog's close buttons and backdrop, the contact card's,
    // and Escape for whichever is up
    if (dialogModal) dialogModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closePropDialog, { signal }));
    if (nudgeModal) nudgeModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeNudgeModal, { signal }));
    document.addEventListener('keydown', (event) => {
        if (event.code !== 'Escape') return;
        if (nudgeOpen) closeNudgeModal();
        else if (dialogOpen) closePropDialog();
    }, { signal });

    // View controls: this room is wider than any frame, so even a desktop
    // landscape crops the coffee bar on one side and the sales board on
    // the other. The shared part builds a bottom-center row at EVERY
    // aspect for this scene (alwaysOn + the 'always-on' CSS variant, same
    // as the karaoke bar): pan arrows that slowly yaw the view toward the
    // waiting area on one side and the key board on the other, and a zoom
    // pair that leans in on the deal sheet or widens the whole showroom.
    // The zoom anchors to whichever FOV the current orientation composed
    // with. Handing over the canvas as `surface` adds the touch paths:
    // swipe to pan sideways or tilt up and down, pinch to zoom.
    initPortraitControls({
        getCamera,
        lookAt: AUTOMAN_CONFIG.camera.lookAt,
        baseFov: AUTOMAN_CONFIG.camera.portrait.fov,
        landscapeFov: AUTOMAN_CONFIG.camera.fov,
        pan: AUTOMAN_CONFIG.camera.portrait.pan,
        zoom: AUTOMAN_CONFIG.camera.portrait.zoom,
        alwaysOn: true,
        extraClass: 'always-on',
        surface: canvas,
        onFirstUse: (kind) => track(`portrait-${kind}`),
        signal
    });

}

// ---- Scene taps: the storytelling props ------------------------------------

/** True if the object and every ancestor are visible (future-proofing for
 *  props that toggle themselves off; nothing hidden should answer taps). */
function chainVisible(obj) {
    let o = obj;
    while (o) {
        if (o.visible === false) return false;
        o = o.parent;
    }
    return true;
}

/** Nearest visible hit among `targets` under a ray through `point`. */
function firstVisibleHit(targets) {
    const hits = raycaster.intersectObjects(targets, true);
    for (const hit of hits) {
        if (chainVisible(hit.object)) return hit;
    }
    return null;
}

// Props this size are easy to miss beside their big neighbors, so they
// get the whole tolerance search to themselves before anything else is
// allowed to answer. The neighbors are large enough to spare the halo.
// (Task T8.2 revisits this list once M7 has placed the fixtures: the
// awkward targets in this room are the model car, the clock, and the
// waste basket.)
const SMALL_PROP_KINDS = ['modelcar', 'clock', 'basket'];

/** Direct hit first, then a couple of rings of sample rays around the
 *  point, so the model car on the desk corner is tappable with a
 *  fingertip (same forgiveness the walkable experiences give their small
 *  click targets). */
function searchHit(targets, camera) {
    raycaster.setFromCamera(pointer, camera);
    let hit = firstVisibleHit(targets);
    if (hit) return hit;
    const rx = (TAP_TOLERANCE_PX * 2) / window.innerWidth;
    const ry = (TAP_TOLERANCE_PX * 2) / window.innerHeight;
    for (const rf of [0.5, 1]) {
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            _tolPointer.set(pointer.x + Math.cos(ang) * rx * rf, pointer.y + Math.sin(ang) * ry * rf);
            raycaster.setFromCamera(_tolPointer, camera);
            hit = firstVisibleHit(targets);
            if (hit) return hit;
        }
    }
    return null;
}

/** Nearest visible hit under the screen point: the small props get first
 *  refusal at full tolerance, then everything answers as usual. */
function pickSceneHit(clientX, clientY) {
    const camera = getCamera();
    if (!camera) return null;
    const targets = getOutdoorPropMeshes();
    if (!targets.length) return null;
    pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    const small = targets.filter(g => g.userData && SMALL_PROP_KINDS.includes(g.userData.propKind));
    return (small.length && searchHit(small, camera)) || searchHit(targets, camera);
}

/** Walk up from a hit mesh to the nearest prop root (tagged isProp by
 *  registerOutdoorProp). Nearest wins: the model car on the desk
 *  resolves as 'modelcar' before the desk behind it. */
function getPropRoot(obj) {
    let o = obj;
    while (o) {
        if (o.userData && o.userData.isProp) return o;
        o = o.parent;
    }
    return null;
}

function checkSceneTap(clientX, clientY) {
    if (!state.isLoaded || dialogOpen || nudgeOpen) return;
    const hit = pickSceneHit(clientX, clientY);
    if (!hit) return;
    const prop = getPropRoot(hit.object);
    if (prop) openPropDialog(prop.userData.propKind);
}

// ---- The showroom's stories -------------------------------------------------
// Title + two lines for each clickable thing in the showroom, in the same
// warm host's voice as the rest of the site, free of em-dashes and
// semicolons. Two lines apiece so a second click gives something new.
// Every prop points back at something John actually does for a buyer.
//
// M0: only the wall clock is registered so far, so this table holds only
// the clock. The full fifteen-prop table is written at task T8.1 from the
// copy in specs/automan/PRD.md, once M7 has registered the fixtures.
// tests/automan-init.test.mjs asserts that this table and the registered
// prop kinds match each other exactly, so a prop with no story and a
// story with no prop both fail the build.
const PROP_CONTENT = {
    // The three people. From M8 a tap on any of them opens the contact
    // card instead, tailored to whoever was tapped (task T8.3). Their
    // copy lives here in the meantime so a tap is never a dead end.
    john: {
        title: 'Meet John Walker',
        lines: [
            'This is John, doing the part most people dread. Twenty five years of this, more than 2,000 cars, and now he does it for the buyer instead of the dealership.',
            'He has sat on the other side of this desk and desked these deals himself, which is exactly why he is worth having on your side of it.'
        ]
    },
    customer: {
        title: 'She brought backup',
        lines: [
            'She walked in with somebody who knows what every line on that page is worth. The consultation that got her here was free.',
            'Notice how relaxed she is. That is what it looks like when the numbers have already been checked by someone in your corner.'
        ]
    },
    dealer: {
        title: 'The other side of the desk',
        lines: [
            'He is good at his job, and that is exactly the point. Nobody should have to sit across from a professional without one of their own.',
            'This is a fair conversation between two people who both know the business. That is all John is really here to arrange.'
        ]
    },
    clock: {
        title: 'The Wall Clock',
        lines: [
            'Look closely, it keeps your real local time. It is also the number nobody tells you about at a dealership: hours spent.',
            'The days of spending all day at the dealership are over. That is more or less the whole promise.'
        ]
    }
};
let propTick = 0;   // rotates which line a prop shows, no Math.random needed

let dialogReturnFocus = null;

/** Open the showroom dialog for a clicked prop: its title and a line from
 *  its pair (alternating, so a second click gives something new). Props
 *  flagged cta lead with the button through to the contact card, and the
 *  dismiss button steps down to the muted look while that leads. From M8
 *  every story carries one, since there is nowhere else to send anybody. */
function openPropDialog(kind) {
    const content = PROP_CONTENT[kind];
    if (!content || !dialogModal) return;
    dialogOpen = true;
    track('click-prop', { kind });
    if (dialogTitle) dialogTitle.textContent = content.title;
    if (dialogMessage) dialogMessage.textContent = content.lines[propTick++ % content.lines.length];
    const dismiss = dialogModal.querySelector('.dialog-primary');
    if (dialogCta) dialogCta.classList.toggle('hidden', !content.cta);
    if (dismiss) {
        dismiss.classList.toggle('piece-enter', !content.cta);
        dismiss.classList.toggle('piece-cancel', !!content.cta);
    }
    // Every few stories, queue the reach-out invitation to follow this one
    propClicks += 1;
    if (propClicks % NUDGE_EVERY === 0) nudgePending = true;
    dialogReturnFocus = document.activeElement;
    dialogModal.classList.remove('hidden');
    const lead = (content.cta && dialogCta) ? dialogCta : dismiss;
    if (lead) lead.focus();
}

function closePropDialog() {
    if (!dialogModal) return;
    dialogModal.classList.add('hidden');
    dialogOpen = false;
    // A queued invitation surfaces the moment the story card closes, so
    // the two never stack. Focus restores when the invitation closes.
    if (nudgePending && nudgeModal) {
        nudgePending = false;
        // Focus restores when the contact card closes instead. If the
        // card declined to open, fall through so focus is never stranded.
        if (openNudgeModal()) return;
    }
    restoreDialogFocus();
}

/** Hand keyboard focus back to wherever it was before the cards opened. */
function restoreDialogFocus() {
    const el = dialogReturnFocus;
    dialogReturnFocus = null;
    if (el && document.contains(el)) {
        try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    }
}

// M0 GATE, REMOVED AT TASK T8.5. The contact card's call, text, and
// email actions are assembled from AUTOMAN_CONFIG.site.contact once the
// proof of work resolves, and that assembler is M8 work. Until it lands,
// the card would open with three empty hrefs, which is worse than not
// offering it, so both routes in are held shut. Grep CONTACT_CARD_WIRED
// to find everything this gate touches.
const CONTACT_CARD_WIRED = false;

/** The contact card: John's call, text, and email actions. Opened
 *  directly by a tap on any of the three people at the desk, and
 *  otherwise after every fourth prop story, the same low-pressure card
 *  the garden and tire-shop experiences extend partway through. */
function openNudgeModal() {
    if (!nudgeModal || !CONTACT_CARD_WIRED) return false;
    nudgeOpen = true;
    track('contact-nudge');
    nudgeModal.classList.remove('hidden');
    const enter = nudgeModal.querySelector('.piece-enter');
    if (enter) enter.focus();
    return true;
}

function closeNudgeModal() {
    if (!nudgeModal) return;
    nudgeModal.classList.add('hidden');
    nudgeOpen = false;
    restoreDialogFocus();
}

/** Dismiss the welcome overlay and settle in for the visit. */
function beginVisiting() {
    if (!state.isLoaded || !blocker || blocker.classList.contains('hidden')) return;
    blocker.classList.add('hidden');
    track('begin-visiting');
}

/** Wire the outward-facing links from AUTOMAN_CONFIG.site. The Home
 *  button goes to the serving site's root in the same tab (Phase 5 rule:
 *  the marketing pages live at every hosting domain's root).
 *
 *  There is deliberately no outbound business link here. The other
 *  featured-business experiences send the floating logo button to the
 *  business's own website, but this page IS John's web presence, so that
 *  button becomes the contact button instead. Wiring it to intercept its
 *  click and open the contact card is task T8.9; until then it keeps the
 *  href baked into the HTML, which is the site's own contact page, so it
 *  is never a dead control. */
function applySiteLinks() {
    const site = AUTOMAN_CONFIG.site;
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
        const label = `Call, text, or email ${site.honoree.label}`;
        bizBtn.title = label;
        bizBtn.setAttribute('aria-label', label);
    }
}

// ---- Render loop ----------------------------------------------------------

function animate() {
    if (!state.isRunning) return;
    const now = performance.now();
    const deltaTime = Math.min((now - state.lastTime) / 1000, 0.1);
    state.lastTime = now;

    // The day/night pass holds the sky at noon (the cycle is disabled in
    // config) but still paints the fixed-time sky and refreshes the
    // on-demand shadow map, so John's point and the cars on the lot keep
    // their shadows honest. The background pass drifts the clouds past
    // the glass, and the interior pass keeps the room's rig balanced.
    updateDayNightCycle(deltaTime);
    updateBackgroundAnimations(deltaTime);
    updateInteriorAmbientLight();
    updateShowroom(deltaTime);
    updatePortraitControls(deltaTime);

    render();
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
        console.error('[Showroom] 3D init failed, falling back to the 2D site:', err);
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
export const __test__ = { bufToHex, hasWebGL };
