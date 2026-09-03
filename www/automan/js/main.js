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
 * two floating buttons (Home, and one that opens the About card: what
 * John does, in words, with his flyer under it), the
 * always-on pan and zoom row (shared pan part, with swipe, tilt, and pinch
 * on touch), and one raycast per tap to see what the visitor pointed at,
 * answered in the host's voice by the dialog card.
 *
 * AND NO WELCOME OVERLAY, which makes it the first SceneXP experience
 * without one. Nothing here needs a user gesture to start (no pointer
 * lock, no audio), so the card was a curtain in front of a finished room.
 * In its place the scene opens live and coaches on arrival: pulsing halos
 * over the three people, and an intro PANEL along the bottom carrying
 * what John actually does for a buyer. The panel goes on the first tap or
 * at twenty six seconds; the halos hold until the visitor actually
 * reaches one of the three. #help-btn opens the same account at length,
 * with John's flyer under it, for anyone who wants it later. See
 * "Arrival coaching" below.
 *
 * Unlike the other featured-business experiences, this one has nowhere
 * outward to send anybody: John has no separate website, because this
 * page is his web presence. So NOTHING here links off the site: every card
 * CTA leads to the contact card, and the second floating button opens
 * John's own story and flyer rather than sending anybody anywhere.
 *
 * BUILD STATUS: milestone M15, the fifth screenshot QA round. Every prop
 * in the showroom answers a tap with its own story, the three people open
 * the contact card, and its call, text and email links are assembled from
 * the solved proof of work. See specs/automan/TASKS.md.
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
    initStore, updateShowroom, updateBackgroundAnimations, updateInteriorAmbientLight,
    getPersonAnchors
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
let canvas, loadingScreen;
let dialogModal, dialogTitle, dialogMessage, dialogCta;
let dialogOpen = false;   // one dialog at a time; taps pause while it's up

// The every-few-taps "reach out" invitation (the garden and tire-shop
// experiences surface theirs a few checklist discoveries in; this scene
// has no checklist, so every fourth prop story earns it instead, shown
// once that story's card closes so the two never stack).
let nudgeModal, nudgeKicker, nudgeTitle, nudgeMessage;
let contactCall, contactText, contactEmail, contactFallback;
let nudgeOpen = false;
let nudgePending = false;
let propClicks = 0;
const NUDGE_EVERY = 4;

// John's own flyer, behind the floating info button. The image is a
// quarter of a megabyte, more than the rest of the page together, so it is
// not in the markup's src: this holds the path and main.js sets it the
// first time the card is opened. A visitor who never asks never pays.
let posterModal, posterImage, posterBtn;
let posterOpen = false;
const POSTER_SRC = 'assets/poster.webp';

let cleanupController = null;

// A card opens on the tap that asked for it, centered, which puts its
// primary action roughly where the finger already is. See armCard().
const CARD_ARM_MS = 450;
let cardArmedAt = 0;

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
    dialogModal = document.getElementById('dialog-modal');
    dialogTitle = document.getElementById('dialog-title');
    dialogMessage = document.getElementById('dialog-message');
    dialogCta = document.getElementById('dialog-cta');
    nudgeModal = document.getElementById('nudge-modal');
    nudgeTitle = document.getElementById('nudge-title');
    nudgeMessage = document.getElementById('nudge-message');
    nudgeKicker = nudgeModal && nudgeModal.querySelector('.complete-kicker');
    contactCall = document.getElementById('contact-call');
    contactText = document.getElementById('contact-text');
    contactEmail = document.getElementById('contact-email');
    contactFallback = document.getElementById('contact-fallback');
    posterModal = document.getElementById('help-modal');
    posterImage = document.getElementById('poster-image');
    posterBtn = document.getElementById('help-btn');
    // Hidden until a card actually opens, so an empty status line never
    // takes up room in the card.
    setShown(contactFallback, false);

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
    // The contact card assembles John's number and address from this, so
    // hold on to it. Solving here means the card never makes anyone wait.
    _proof = proof;

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
        // The coaching arrives after the room does, not with it: there is
        // no overlay to click through any more, so the first thing the
        // visitor should see is the showroom itself.
        startCoaching();
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

    // (There is no welcome overlay to dismiss. See the note in index.html
    // where #blocker used to be: this scene needs no gesture to start, so
    // it opens live and the arrival coaching does the explaining.)
    wireCoaching(signal);

    // A click or tap on the scene: any of the showroom's storytelling
    // props, or any of the three people at the desk (from M8).
    // A tap that merely ends a swipe or pinch (see the surface option
    // below) belongs to the gesture, not to a prop.
    canvas.addEventListener('click', (event) => {
        if (gestureClaimedTap()) return;
        checkSceneTap(event.clientX, event.clientY);
    }, { signal });
    canvas.addEventListener('touchend', (event) => {
        // Cancel the compatibility mouse click this touch would otherwise
        // spawn. The shared pan part already cancels touchstart for the
        // same reason, and this is the second of the two belts described
        // above swallowGhostTap: a card is about to open under this
        // finger, and the click would land on whatever the card puts
        // there. Canceling also stops the tap raycasting twice, through
        // the click handler above and this one.
        if (event.cancelable) event.preventDefault();
        if (gestureClaimedTap()) return;
        const touch = event.changedTouches[0];
        if (touch) checkSceneTap(touch.clientX, touch.clientY);
    }, { passive: false, signal });

    // The last line of defense for that same tap. Capture phase on the
    // document, so it runs before anything inside a card can act.
    document.addEventListener('click', swallowGhostTap, { capture: true, signal });

    // The story dialog's close buttons and backdrop, the contact card's,
    // and Escape for whichever is up
    if (dialogModal) dialogModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closePropDialog, { signal }));
    if (nudgeModal) nudgeModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeNudgeModal, { signal }));
    if (posterModal) posterModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closePoster, { signal }));
    if (posterBtn) posterBtn.addEventListener('click', openPoster, { signal });

    // Every prop story leads on to the contact card. Closing the story
    // first keeps the two cards from ever being open together, and
    // clearing the queued invitation stops it arriving straight after.
    if (dialogCta) dialogCta.addEventListener('click', () => {
        nudgePending = false;
        if (dialogModal) dialogModal.classList.add('hidden');
        dialogOpen = false;
        openContactCard('story');
    }, { signal });

    // The About card ends the same way every other card on this page does,
    // at the contact card. Somebody who has just read what John does is
    // the likeliest person in the scene to want him.
    const posterCta = document.getElementById('poster-cta');
    if (posterCta) posterCta.addEventListener('click', () => {
        closePoster();
        openContactCard('about');
    }, { signal });

    // (There is no floating contact button to wire. It was removed after
    // the second QA round: everything it offered is already in the scene,
    // and its only no-JavaScript destination was the site's own contact
    // page, which the noscript block still carries. The card opens from a
    // tap on any of the three people, and from the invitation at the end
    // of every prop story.)

    // Which of the three actions a visitor actually takes is the number
    // that tells John whether any of this worked.
    [[contactCall, 'call'], [contactText, 'text'], [contactEmail, 'email']]
        .forEach(([el, action]) => {
            if (el) el.addEventListener('click', () => track('contact-action', { action }), { signal });
        });
    document.addEventListener('keydown', (event) => {
        if (event.code !== 'Escape') return;
        if (posterOpen) closePoster();
        else if (nudgeOpen) closeNudgeModal();
        else if (dialogOpen) closePropDialog();
    }, { signal });

    // View controls: this room is wider than any frame, so even a desktop
    // landscape crops the coffee bar on one side and the sales board on
    // the other. Every way of looking around is switched on at EVERY
    // aspect (alwaysOn, same as the karaoke bar): drag or swipe to yaw and
    // tilt, wheel or pinch to zoom, arrow keys to pan, W and S to tilt,
    // and the zoom anchors to whichever FOV the current orientation
    // composed with.
    //
    // WITH NO BUTTONS ON SCREEN. The shared part always builds its
    // bottom-center row, so this scene hides it with a class of its own
    // ('no-chrome', styled in css/experience.css) rather than by not
    // asking for it. That is deliberate on both counts:
    //
    //  - the visitor this page is for is not a confident computer user,
    //    and a row of arrows and plus/minus circles under a scene that
    //    says "no controls needed" is an invitation to fiddle with the
    //    frame rather than watch what is in it;
    //  - hiding rather than suppressing keeps every INPUT alive. The mouse
    //    takes the same path as the finger in the shared part, so a
    //    desktop visitor can still drag, and the keyboard zoom is gated on
    //    the zoom buttons EXISTING (not on their being visible), so
    //    removing them from the DOM would quietly take the +/- keys with
    //    them.
    //
    // Handing over the canvas as `surface` is what makes all of that
    // reach the scene at all, so it matters more here than anywhere.
    initPortraitControls({
        getCamera,
        lookAt: AUTOMAN_CONFIG.camera.lookAt,
        baseFov: AUTOMAN_CONFIG.camera.portrait.fov,
        landscapeFov: AUTOMAN_CONFIG.camera.fov,
        pan: AUTOMAN_CONFIG.camera.portrait.pan,
        zoom: AUTOMAN_CONFIG.camera.portrait.zoom,
        alwaysOn: true,
        extraClass: 'always-on no-chrome',
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
// The awkward targets in this room, each small enough to be missed
// beside a big neighbor: the die-cast on the desk corner, the wall
// clock, and the dealer's keyboard.
const SMALL_PROP_KINDS = ['modelcar', 'clock', 'deskkeyboard'];

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

// How far behind whatever is genuinely under the finger a small prop may
// sit and still claim the tap. A hand's width: enough to cover the model
// car standing proud of the desk it rests on, nowhere near enough to let
// something across the room answer through a person.
const SMALL_PROP_REACH_M = 0.25;

/** Nearest visible hit under the screen point: the small props get first
 *  refusal at full tolerance, then everything answers as usual.
 *
 *  That first refusal is DEPTH-CHECKED, and it has to be. The halo search
 *  only asks whether a small prop is near the finger on screen, never
 *  what stands in front of it, so the waste basket behind the customer
 *  used to answer every tap meant for her: she is not a small prop, so
 *  she never got to compete. The direct ray is cast first to find out
 *  what is really under the finger, and a small prop wins its halo only
 *  when it is at or in front of that. */
function pickSceneHit(clientX, clientY) {
    const camera = getCamera();
    if (!camera) return null;
    const targets = getOutdoorPropMeshes();
    if (!targets.length) return null;
    pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);

    raycaster.setFromCamera(pointer, camera);
    const direct = firstVisibleHit(targets);

    const small = targets.filter(g => g.userData && SMALL_PROP_KINDS.includes(g.userData.propKind));
    if (small.length) {
        const near = searchHit(small, camera);
        if (near && (!direct || near.distance <= direct.distance + SMALL_PROP_REACH_M)) return near;
    }
    return direct || searchHit(targets, camera);
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

/** True while the arrival panel is still on screen. */
function introShowing() {
    return !!introEl && !introEl.classList.contains('coach-out');
}

/** True when a point is over the arrival panel itself.
 *
 *  The panel is `pointer-events: none` and stays that way, which is what
 *  lets somebody start a swipe on it and look around: it covers a third
 *  of a phone screen, and a panel that ate drags would be worse than one
 *  that ate taps. But pointer-events none also meant a TAP on it fell
 *  straight through and opened whatever prop happened to be behind the
 *  text, which is what Steve found. So the panel is transparent to the
 *  gesture layer and opaque to this one, and the only way to have both is
 *  to ask where the tap landed. */
function overIntro(clientX, clientY) {
    if (!introShowing()) return false;
    const r = introEl.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

function checkSceneTap(clientX, clientY) {
    if (!state.isLoaded || dialogOpen || nudgeOpen || posterOpen) return;
    // WHILE THE PANEL IS UP, THE HALOS ARE THE ONLY THINGS THAT OPEN
    // ANYTHING. Steve's call, and it makes the arrival one decision
    // instead of a room full of them: three rings, and a card explaining
    // why. A tap anywhere else clears the panel and opens nothing, so it
    // is never a dead tap (something visibly happens), and the very next
    // tap works normally.
    //
    // The panel's own footnote is written to match. It leads with the
    // marker and describes the rest of the room as a promise rather than
    // an instruction, because an instruction there would be describing
    // the scene one tap from now.
    if (introShowing()) {
        if (!overIntro(clientX, clientY)) fadeCoach(introEl);
        return;
    }
    const hit = pickSceneHit(clientX, clientY);
    if (!hit) return;
    const prop = getPropRoot(hit.object);
    if (!prop) return;
    const kind = prop.userData.propKind;

    // Tapping any of the three people goes straight to the contact card,
    // tailored to whoever was tapped. It does NOT count toward the
    // every-fourth-story cadence: somebody who taps John has already
    // asked, and offering again two props later would be nagging.
    if (PERSON_KINDS.includes(kind)) {
        // Reaching a person is the one thing the coaching was for, and
        // it counts however they got here: the halo, or the figure
        // underneath it, or a face they found on their own.
        endCoaching('tapped-person');
        track('click-person', { who: kind });
        // If the card cannot open for any reason, fall through and at
        // least tell their story. That also keeps their PROP_CONTENT
        // entries reachable rather than leaving three blocks of copy
        // nobody can ever see.
        if (openContactCard(kind)) return;
    }
    openPropDialog(kind);
}

// ---- The tap that opens a card must not also press it -----------------------
//
// Reported from a phone: tapping John started dialing him, and tapping the
// customer sometimes started an email. Neither is a link doing anything
// wrong. It is where the card lands.
//
// Every card on this page opens centered, and the three people stand in the
// middle of the frame, so the card arrives directly under the finger that
// asked for it. John's chest is about where the Call button appears, and
// the customer's is about where the Email link does. Any second activation
// at those coordinates presses them, and there are two ways to get one:
//
//  - the synthesized mouse click that follows a touch, dispatched at the
//    same point against whatever is under it BY THEN. The shared pan part
//    cancels touchstart on the canvas to suppress exactly this, and the
//    canvas touchend below now cancels as well, but a page cannot rely on
//    every browser and every assistive layer honoring that;
//  - a second real tap from somebody who did not see the card appear.
//
// So the card arms itself instead of trusting the suppression. For
// CARD_ARM_MS after any card opens, a pointer click inside it is swallowed
// in the capture phase, before the link or button under it can act. Nobody
// reads a new card and presses its one big button in under half a second,
// so nothing deliberate is ever lost.
//
// Keyboard activation is exempt: Enter and Space on a focused control
// arrive as a click with `detail` 0, and somebody tabbing has not been
// handed a card under their finger at all.
function armCard() {
    cardArmedAt = Date.now();
}

function swallowGhostTap(event) {
    if (!cardArmedAt || Date.now() - cardArmedAt > CARD_ARM_MS) return;
    if (!event.detail) return;              // keyboard, not a pointer
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    if (!target.closest('#nudge-modal, #dialog-modal, #help-modal')) return;
    cardArmedAt = 0;                        // one swallow per opening
    event.preventDefault();
    event.stopPropagation();
    track('ghost-tap');
}

// ---- The showroom's stories -------------------------------------------------
// Title + two lines for each clickable thing in the showroom, in the same
// warm host's voice as the rest of the site, free of em-dashes and
// semicolons. Two lines apiece so a second click gives something new.
// Every prop points back at something John actually does for a buyer.
//
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
    },
    papers: {
        title: 'The Deal Sheet',
        lines: [
            'Four boxes on one page: price, trade, down payment, monthly. John reads it back to front, because the box they want you looking at is almost never the one that matters.',
            'Every number on here is negotiable, and most people only ever argue with one of them.'
        ]
    },
    desk: {
        title: 'The Desk',
        lines: [
            'This is where it all happens, and where most buyers are at their least prepared. John comes to it having already done the homework.',
            'Nothing gets signed at this desk that John has not read twice.'
        ]
    },
    window: {
        title: 'The Lot',
        lines: [
            'Rows and rows of them, all wearing a sticker. The right one for you is a different question from the one they want to sell you today.',
            'Take a minute and watch. There is no hurry in here, and there does not have to be one out there either.'
        ]
    },
    computer: {
        title: 'The Screen',
        lines: [
            'The car, and the numbers beside it. He has turned it so you can see, which is a good sign and still only half the picture.',
            'Rates, invoice, incentives, book value on your trade. All of it is knowable, and John looks it up before you ever walk in.'
        ]
    },
    deskkeyboard: {
        title: 'The Keyboard',
        lines: [
            'Every offer gets typed up before it gets walked back. The pause while that happens is not a technical delay, it is a conversation you are not in.',
            'John fills that pause. He has already run your numbers, so the version that comes back has nothing in it you have not seen.'
        ]
    },
    modelcar: {
        title: 'The Model Car',
        lines: [
            'A little die cast on the corner of the desk. Somebody\'s favorite thing in this room.',
            'Buying a car is supposed to be fun. It usually stops being fun somewhere around the finance office.'
        ]
    },
    salesboard: {
        title: 'The Sales Board',
        lines: [
            'The month\'s numbers, in marker, where everybody can see them. Timing matters more than most buyers realize.',
            'Knowing what a dealership needs at the end of a month is worth real money to the person sitting on the other side.'
        ]
    },
    keyboard_keys: {
        title: 'The Key Board',
        lines: [
            'Every key on the lot, tagged and hung. Somewhere on there is the one you drive home.',
            'The trick is making sure the price on that tag is the price you should be paying.'
        ]
    },
    coffeebar: {
        title: 'The Coffee Bar',
        lines: [
            'Free coffee, tiny cups, a pot that has been on since morning. Hospitality is cheap and the finance office is not.',
            'John\'s consultation is free too, and that one actually saves you money.'
        ]
    },
    vending: {
        title: 'The Vending Machine',
        lines: [
            'The unofficial clock of every dealership. If you have been here long enough to visit it twice, the process has gone wrong.',
            'Buying a car should not take all day. Walk in prepared and you can be home before the coffee wears off.'
        ]
    },
    chairs: {
        title: 'The Waiting Chairs',
        lines: [
            'Where you sit while somebody takes your keys away to appraise your trade. The wait is a tactic as often as it is a line.',
            'Know what your trade is worth before you hand over the keys, and the wait stops working.'
        ]
    },
    brochures: {
        title: 'The Brochure Rack',
        lines: [
            'Glossy photographs, generous adjectives, and not one useful number.',
            'The useful numbers are the trade value, the out the door price, and the rate. John brings those.'
        ]
    },
    plant: {
        title: 'The Showroom Plant',
        lines: [
            'Every dealership has one, and it is doing better than most of them. Slightly plastic, entirely unbothered.',
            'It has watched a thousand deals go through. About half of them could have gone better.'
        ]
    }
};
let propTick = 0;   // rotates which line a prop shows, no Math.random needed

let dialogReturnFocus = null;

/** Open the showroom dialog for a tapped prop: its title and a line from
 *  its pair (alternating, so a second tap gives something new).
 *
 *  Every story leads with the same onward button, because unlike the
 *  other featured-business experiences there is nowhere else to send
 *  anybody: this page IS John's web presence. */
function openPropDialog(kind) {
    const content = PROP_CONTENT[kind];
    if (!content || !dialogModal) return;
    dialogOpen = true;
    holdCoaching();
    track('click-prop', { kind });
    if (dialogTitle) dialogTitle.textContent = content.title;
    if (dialogMessage) dialogMessage.textContent = content.lines[propTick++ % content.lines.length];
    // Every few stories, queue the invitation to follow this one
    propClicks += 1;
    if (propClicks % NUDGE_EVERY === 0) nudgePending = true;
    dialogReturnFocus = document.activeElement;
    armCard();
    dialogModal.classList.remove('hidden');
    if (dialogCta) dialogCta.focus();
}

function closePropDialog() {
    if (!dialogModal) return;
    dialogModal.classList.add('hidden');
    dialogOpen = false;
    holdCoaching();
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

// ---- The contact card ------------------------------------------------------

// Who opened it, and what it says when they did. Every route in gets its
// own heading and opening line, so the card reads as an answer to the tap
// rather than the same advert wheeled out five different ways.
const CONTACT_CARDS = {
    john: {
        kicker: 'Free consultation, by phone or Zoom',
        title: 'Meet John Walker',
        lead: 'This is John, doing the part most people dread. Twenty five years of it, more than 2,000 cars, and now he does it for the buyer instead of the dealership. If he cannot get you the deal you want, you owe him nothing.'
    },
    customer: {
        kicker: 'Free consultation, by phone or Zoom',
        title: 'She brought backup',
        lead: 'She walked in with somebody who knows what every line on that page is worth. The consultation that got her here was free, and so is yours.'
    },
    dealer: {
        kicker: 'Free consultation, by phone or Zoom',
        title: 'The other side of the desk',
        lead: 'He is good at his job, and that is exactly the point. Nobody should have to sit across from a professional without one of their own.'
    },
    story: {
        kicker: 'Free consultation, by phone or Zoom',
        title: 'Let John handle it',
        lead: 'John Walker has spent twenty five years on the other side of that desk, and more than 2,000 cars have gone through his hands. If he cannot get you the deal you want, you owe him nothing.'
    },
    nudge: {
        kicker: 'A few stops into the visit',
        title: 'Enjoying the showroom?',
        lead: 'Thank you for looking around. Everything in this room is something John has already thought about on a customer’s behalf. If you have a car to buy or sell, he would be glad to hear from you.'
    },
    // From the foot of the About card, so this is the one visitor in the
    // scene who has just read the whole account. Nothing to re-explain.
    about: {
        kicker: 'Free consultation, by phone or Zoom',
        title: 'That is the whole idea',
        lead: 'No obligation and no pressure. Tell John what you are looking at, and he will tell you plainly what he sees in it.'
    },
    button: {
        kicker: 'Free consultation, by phone or Zoom',
        title: 'Talk to John',
        lead: 'By phone or by Zoom, before you ever set foot in a dealership. He will look at the numbers with you and tell you plainly what he sees.'
    }
};

// The three people at the desk, which are the taps that open the card
// straight away instead of telling a story first.
const PERSON_KINDS = ['john', 'customer', 'dealer'];

let _proof = null;      // the solved proof of work, handed over at boot
let _contact = null;    // memoized once assembled

/** Assemble John's phone number and email from the fragments in config,
 *  and build the three action links.
 *
 *  This is PRD decision D3: the values never appear whole in the source,
 *  so a scraper grepping for a phone or email pattern finds nothing. It
 *  costs the visitor nothing, because init() already awaited the proof of
 *  work before the scene was built, so by the time any card can open the
 *  proof is long since in hand and the card renders with live links.
 *
 *  Returns null when there is no proof, which in practice means no
 *  crypto.subtle, which means a non-secure origin. */
function assembleContact() {
    if (_contact) return _contact;
    if (!_proof) return null;

    const c = AUTOMAN_CONFIG.site.contact;
    const groups = c.phoneParts.map((part) => part.join(''));
    const digits = groups.join('');
    const email = c.emailParts.map((part) => part.join(''));
    const address = `${email[0]}@${email[1]}.${email[2]}`;
    // The Ref is the first six hex characters of the solved hash. A mail
    // or text arriving with a valid-looking one demonstrably came through
    // a browser that solved the gate, which helps John triage.
    const ref = _proof.hash.slice(0, 6);

    _contact = {
        display: `(${groups[0]}) ${groups[1]}-${groups[2]}`,
        address,
        tel: `tel:+1${digits}`,
        // `?&body=` is the form both iOS and Android accept.
        sms: `sms:+1${digits}?&body=${encodeURIComponent(c.smsBody)}`,
        mail: `mailto:${address}?subject=${encodeURIComponent(`${c.emailSubject} (Ref ${ref})`)}`
    };
    return _contact;
}

/** Show or hide an element without touching classes.
 *
 *  The shared stylesheet has NO generic .hidden rule (it scopes hiding to
 *  named modal ids and a couple of specific classes), so adding that class
 *  to an anchor would do nothing at all and leave a dead link on screen.
 *  Setting style.display through the CSSOM is unaffected by the page's
 *  style-src policy, and is what the loading bar already does. */
function setShown(el, shown) {
    if (el) el.style.display = shown ? '' : 'none';
}

/** Open the contact card. `entry` says who asked for it, which picks the
 *  copy and is recorded so the log can tell which route actually works. */
function openContactCard(entry) {
    if (!nudgeModal) return false;
    const copy = CONTACT_CARDS[entry] || CONTACT_CARDS.story;
    if (!dialogReturnFocus) dialogReturnFocus = document.activeElement;

    if (nudgeKicker) nudgeKicker.textContent = copy.kicker;
    if (nudgeTitle) nudgeTitle.textContent = copy.title;
    if (nudgeMessage) nudgeMessage.textContent = copy.lead;

    const contact = assembleContact();
    if (contact) {
        if (contactCall) {
            contactCall.href = contact.tel;
            contactCall.textContent = `Call ${contact.display}`;
        }
        if (contactText) {
            contactText.href = contact.sms;
            contactText.textContent = `Text ${contact.display}`;
        }
        if (contactEmail) {
            contactEmail.href = contact.mail;
            contactEmail.textContent = `Email ${contact.address}`;
        }
        [contactCall, contactText, contactEmail].forEach((el) => setShown(el, true));
        setShown(contactFallback, false);
    } else {
        // No proof, so no assembled links. The card must still be a card:
        // a visitor should never meet a contact card with no way to make
        // contact. (This is the cost of D3, recorded in the PRD.)
        [contactCall, contactText, contactEmail].forEach((el) => setShown(el, false));
        if (contactFallback) {
            contactFallback.textContent = 'John’s direct line appears here over a secure '
                + 'connection (https). In the meantime you can reach the developer through the '
                + 'contact page and he will pass your message straight on.';
        }
        setShown(contactFallback, true);
    }

    nudgeOpen = true;
    holdCoaching();
    armCard();
    track('contact-open', { entry });
    nudgeModal.classList.remove('hidden');
    // Focus the CARD, not the call button. Landing on "Call" made a stray
    // Enter dial John, put a screen reader into the actions before it had
    // read who they belong to, and gave the tap that opened the card an
    // already-focused target. The container carries tabindex="-1" so it
    // can take focus without joining the tab order, and Tab from here
    // reaches close, then call, text and email in reading order.
    const lead = nudgeModal.querySelector('.modal-container')
        || nudgeModal.querySelector('[data-close]');
    if (lead) lead.focus();
    return true;
}

/** Kept under its old name because closePropDialog calls it: the queued
 *  invitation that follows every fourth prop story. */
function openNudgeModal() {
    return openContactCard('nudge');
}

function closeNudgeModal() {
    if (!nudgeModal) return;
    nudgeModal.classList.add('hidden');
    nudgeOpen = false;
    holdCoaching();
    restoreDialogFocus();
}

// ---- John's flyer ----------------------------------------------------------

/** Open the flyer card, loading the image on the first open only.
 *
 *  The flyer is the one flat, wordy thing on the page, and it is here
 *  because a 3D showroom is the wrong place to read a page of type: this
 *  is John as he introduces himself on paper, photograph, promise, number
 *  and all. Everything else in the scene is a stylization of him. */
function openPoster() {
    if (!posterModal || posterOpen) return;
    // First open pays for the image; every later one is free.
    if (posterImage && !posterImage.getAttribute('src')) {
        posterImage.setAttribute('src', POSTER_SRC);
    }
    posterModal.classList.remove('hidden');
    // The card scrolls now that John's story sits above the flyer, so a
    // second open has to start at the top rather than wherever the last
    // reader left it.
    const card = posterModal.querySelector('.poster-card');
    if (card) card.scrollTop = 0;
    posterOpen = true;
    holdCoaching();
    armCard();
    track('poster-open');
    const close = posterModal.querySelector('.modal-close');
    if (close) close.focus();
}

/** Close it, and hand focus back to the button that opened it. */
function closePoster() {
    if (!posterModal || !posterOpen) return;
    posterModal.classList.add('hidden');
    posterOpen = false;
    holdCoaching();
    if (posterBtn) posterBtn.focus();
}

// ---- Arrival coaching -----------------------------------------------------
//
// This scene has no welcome overlay, so nothing has told the visitor that
// the room answers a tap. Three pulsing halos ride over the heads of the
// cast, John's carrying a caption, and a strip along the bottom says what
// the room is and what to do with it.
//
// THE HALOS STAY UNTIL THE VISITOR REACHES A PERSON, and nothing else
// takes them away. An earlier cut ended the coaching on ANY tap, on the
// reasoning that somebody who has tapped the room has understood the
// room. That is true and it is beside the point: the halos are not there
// to teach tapping, they are there to say WHO to tap. Taking them away
// for a tap on the floor, or on a prop, or for a miss, rewards the one
// visitor who most needs them by removing the only thing pointing at
// John. The strip still goes on the first tap, because it is read once,
// so the guidance narrows rather than disappears.
//
// The halos are projected from anchors above each head in store.js rather
// than parked at fixed screen points, because the visitor can pan and zoom
// from the first frame and a mark that stayed put would slide off its
// person immediately.
//
// The one thing to keep in mind if this is ever extended: these buttons
// are the ONLY keyboard route to the contact card. Everything else in the
// scene is reached through a raycast from a pointer. Holding them until a
// person is reached means a keyboard visitor keeps that route for as long
// as they still need it, which is most of what D4 was worried about,
// though a prop story is still pointer-only.

const COACH_ARRIVE_MS = 900;    // the room alone first, then the guidance
// The intro panel holds long enough to be READ, which is a different
// number from the 15 seconds the old orientation strip wanted. It now
// carries a little under ninety words counting the footnote, which is
// close to twenty nine seconds at an unhurried pace, and a check in
// verify-composition holds this number to the copy's own length. It
// still goes early for anybody who taps, which is nearly everybody.
const INTRO_MS = 29000;
// The halos do not leave at this point, they QUIETEN: a slower, dimmer
// pulse that keeps pointing without strobing over a room somebody may
// well be sitting and looking at. Only reaching a person ends them.
const COACH_CALM_MS = 30000;
const _coachPoint = new THREE.Vector3();

let coachMarksEl = null;
let introEl = null;
let coachMarks = [];            // [{ el, kind, anchor }] once the cast exists
let coachTimers = [];
let coachRunning = false;

/** Resolve the coaching elements, fit the copy to the input device, and
 *  wire the halos. Called from setupEventListeners, so it runs before the
 *  loader clears and nothing is on screen yet. */
function wireCoaching(signal) {
    coachMarksEl = document.getElementById('coach-marks');
    introEl = document.getElementById('intro-card');
    if (!coachMarksEl) return;

    // "Click" is wrong on a phone and "Tap" is wrong on a desktop, and
    // this is the one piece of copy in the scene a visitor has to act on,
    // so it is worth getting right rather than saying "click or tap".
    //
    // THE MARKER LEADS, and that is not a style choice. While this panel
    // is up the halos are the only things that OPEN anything (see
    // checkSceneTap), so a footnote telling somebody to tap the desk
    // would be describing the scene one tap from now. The second sentence
    // is deliberately a promise rather than an instruction, because it is
    // true either way.
    const verb = state.isMobile ? 'Tap' : 'Click';
    const hint = document.getElementById('intro-hint');
    if (hint) {
        hint.textContent = `${verb} a glowing marker to meet John. Everything else in the `
            + `room has a story of its own, and you can ${state.isMobile ? 'swipe' : 'drag'} `
            + 'to look around.';
    }

    const anchors = new Map(getPersonAnchors().map((entry) => [entry.kind, entry.object]));
    coachMarks = Array.from(coachMarksEl.querySelectorAll('.coach-mark'))
        .map((el) => ({ el, kind: el.dataset.who, anchor: anchors.get(el.dataset.who) }))
        .filter((mark) => mark.anchor);

    // NO CAPTIONS ON THE HALOS. John's used to carry one reading "Tap
    // John", which was the only piece of copy in the scene a visitor had
    // to act on and the reason the verb above is resolved at all. It is
    // gone: a label over one of three heads singles him out in a way the
    // composition already does, and it is a second thing to read in a
    // frame that is asking somebody to look. The halos say where, the
    // panel says why, and the marks are announced to a screen reader by
    // their own aria-label.
    coachMarks.forEach(({ el, kind }) => {
        // A halo opens the same card the person under it opens. Falling
        // through to the prop story matches checkSceneTap, so a halo is
        // never a control that does nothing.
        el.addEventListener('click', () => {
            track('click-person', { who: kind, via: 'coach' });
            endCoaching('tapped-mark');
            if (!openContactCard(kind)) openPropDialog(kind);
        }, { signal });
    });
}

/** Show the coaching. Called once the loader has cleared.
 *
 *  Both layers start the page wearing .coach-out, so arriving is a matter
 *  of taking that away and letting the same transition that will
 *  eventually remove them play the other way. The short wait first is the
 *  point of the whole exercise: the visitor meets the showroom on its own
 *  for a moment, which is what the welcome card never allowed. */
function startCoaching() {
    if (!coachMarksEl || coachRunning) return;
    coachRunning = true;

    coachTimers.push(setTimeout(() => {
        if (!coachRunning) return;      // a fast visitor already tapped
        // With no cast there are no halos, but the strip still says what
        // the room is, so the two are revealed independently.
        if (coachMarks.length) coachMarksEl.classList.remove('coach-out');
        if (introEl) introEl.classList.remove('coach-out');
    }, COACH_ARRIVE_MS));

    coachTimers.push(setTimeout(() => fadeCoach(introEl), INTRO_MS));
    coachTimers.push(setTimeout(() => {
        if (!coachRunning || !coachMarksEl) return;
        coachMarksEl.classList.add('coach-calm');
        // Not an ending, so it is not a coach-end reason. It is the
        // honest measure of how many visitors sat half a minute with
        // three rings over three heads and did not try one.
        track('coach-calm');
    }, COACH_CALM_MS));
}

/** Park each halo over its head. Runs after the frame is drawn, so the
 *  camera's world matrix is the one the visitor is looking through. */
function updateCoachMarks() {
    if (!coachRunning || !coachMarks.length) return;
    const camera = getCamera();
    if (!camera) return;
    const w = window.innerWidth;
    const h = window.innerHeight;

    coachMarks.forEach((mark) => {
        const { el, anchor } = mark;
        anchor.getWorldPosition(_coachPoint);
        _coachPoint.project(camera);
        // z past the far plane means the point is behind the eye, which
        // projects to a mirrored position rather than to nowhere. The
        // margins keep a halo from hanging half off the frame when the
        // visitor pans a person out of shot.
        const visible = _coachPoint.z < 1 &&
            Math.abs(_coachPoint.x) < 0.96 && Math.abs(_coachPoint.y) < 0.94;
        if (!visible) {
            el.hidden = true;
            return;
        }
        el.hidden = false;
        const x = (_coachPoint.x * 0.5 + 0.5) * w;
        const y = (-_coachPoint.y * 0.5 + 0.5) * h;
        // THE ANCHOR IS THE CROWN, AND THE AIR ABOVE IT IS ADDED HERE, IN
        // PIXELS. The mark is a reversed column, so its bottom edge is the
        // bottom of the ring: `-100%` puts that edge on the head and the
        // gap lifts it clear. Doing it this way rather than raising the
        // anchor in the scene is what makes the clearance the same for
        // John at the back of the desk as for the two nearer the camera.
        // Both offsets stay in the transform so the browser never has to
        // lay the element out again.
        const next = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) `
            + 'translate(-50%, -100%) translate(0, calc(-1 * var(--coach-gap)))';
        // The halos now hold for as long as the visit does rather than
        // for thirty seconds, and the camera only moves while somebody is
        // dragging, so almost every frame would rewrite the same string.
        // Comparing first skips the style write, which is the part that
        // costs anything.
        if (next !== mark.transform) {
            mark.transform = next;
            el.style.transform = next;
        }
    });
}

/** Fade one coaching layer out. Safe to call on an element already going. */
function fadeCoach(el) {
    if (el) el.classList.add('coach-out');
}

/** Park the halos while a card is up, and bring them back when it closes.
 *
 *  This became necessary the moment the halos stopped leaving on the first
 *  tap. They sit at z-index 90, under every modal and its near-opaque
 *  backdrop, so nobody SEES them behind a story card. A keyboard visitor
 *  would still tab straight into three invisible buttons behind it. The
 *  same `.coach-out` that ends them does the job, because it takes
 *  `visibility` with it once the fade finishes, and the guard means a
 *  card closing can never resurrect coaching that has already ended. */
function holdCoaching() {
    if (!coachMarksEl) return;
    const covered = dialogOpen || nudgeOpen || posterOpen;
    if (covered) fadeCoach(coachMarksEl);
    else if (coachRunning && coachMarks.length) coachMarksEl.classList.remove('coach-out');
}

/** End the coaching for good. Only two things do this: a tap on a halo,
 *  and reaching one of the three people by any other route. Waiting no
 *  longer counts, and neither does a tap that misses. */
function endCoaching(reason) {
    if (!coachRunning) return;
    coachRunning = false;
    coachTimers.forEach(clearTimeout);
    coachTimers = [];
    fadeCoach(coachMarksEl);
    fadeCoach(introEl);
    // Which of these three ends the coaching is the honest measure of
    // whether any of it worked.
    track('coach-end', { reason });
}

/** Wire the outward-facing links from AUTOMAN_CONFIG.site. The Home
 *  button goes to the serving site's root in the same tab (Phase 5 rule:
 *  the marketing pages live at every hosting domain's root), and it is
 *  the only floating control this page has.
 *
 *  There is deliberately no outbound business link and no floating
 *  contact button. The other featured-business experiences send a second
 *  floating button to the business's own website, but this page IS John's
 *  web presence, so there was nowhere outward to send anybody: the button
 *  was removed rather than pointed at the site's own contact page. The
 *  contact card opens from a tap on any of the three people and from
 *  every prop story's invitation. */
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

    // After the draw, so the halos read the same camera matrices the
    // frame was rendered with rather than the previous frame's.
    updateCoachMarks();
}

// ---- Cleanup / state ------------------------------------------------------

function cleanup() {
    state.isRunning = false;
    const renderer = getRenderer();
    if (renderer) renderer.setAnimationLoop(null);
    if (cleanupController) cleanupController.abort();
    coachTimers.forEach(clearTimeout);
    coachTimers = [];
    coachRunning = false;
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

// Exposed for unit tests only; production code uses the named exports
// above. The contact plumbing is here because a typo in one of the joined
// fragments in config would otherwise not surface until a visitor tapped
// Call and reached the wrong number.
export const __test__ = {
    bufToHex, hasWebGL,
    CONTACT_CARDS, PERSON_KINDS, PROP_CONTENT, SMALL_PROP_KINDS, NUDGE_EVERY,
    assembleContact,
    setProof(proof) { _proof = proof; _contact = null; }
};
