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
 * shadow-map refresh). The interactions that do exist are featherweight,
 * and three rounds of QA have made them fewer: ONE floating button (the W,
 * which opens the About card: what John does, in words, with his flyer
 * under it), the arrival panel, the three halos, an always-on ZOOM (shared
 * pan part with both look-around axes switched off at D44, so the wheel,
 * the pinch and the +/- keys lean in on the deal sheet and nothing swings
 * the view), and one raycast per tap, which now answers only if it lands
 * on one of the three people (D43).
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
    getPersonAnchors, requestPersonPortrait
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

// The contact card. (`nudge` is its markup id and its telemetry name from
// when it was an every-few-taps invitation, the way the garden and tire-shop
// experiences surface theirs a few checklist discoveries in. This scene had
// no checklist, so every fourth prop story earned it instead. D43 removed
// the stories and the count; the card is now only ever opened on request,
// and the id stays so the shared modal rules keep applying to it.)
let nudgeModal, nudgeKicker, nudgeTitle, nudgeMessage, nudgePortrait;
let contactCall, contactText, contactEmail, contactFallback;
let contactStatus, contactShare;
let nudgeOpen = false;
let nudgePending = false;

// The About card, behind the floating info button. It used to LEAD with
// John's flyer, which is a quarter of a megabyte, so this file held the
// path and set the src the first time the card opened rather than shipping
// it in the markup. D37 turned the flyer into a plain link, so the browser
// now does that job on its own: nothing is fetched until somebody follows
// the link, and there is no `src` here to manage. The path stays as the
// one place the file is named in JavaScript, and verify-composition checks
// the anchor's href against it so the two cannot drift.
let posterModal, posterBtn;
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
    nudgeModal = document.getElementById('nudge-modal');
    nudgeTitle = document.getElementById('nudge-title');
    nudgeMessage = document.getElementById('nudge-message');
    nudgeKicker = nudgeModal && nudgeModal.querySelector('.complete-kicker');
    nudgePortrait = document.getElementById('nudge-portrait');
    contactCall = document.getElementById('contact-call');
    contactText = document.getElementById('contact-text');
    contactEmail = document.getElementById('contact-email');
    contactFallback = document.getElementById('contact-fallback');
    contactStatus = document.getElementById('contact-status');
    contactShare = document.getElementById('contact-share');
    posterModal = document.getElementById('help-modal');
    posterBtn = document.getElementById('help-btn');
    // Hidden until a card actually opens, so an empty status line never
    // takes up room in the card.
    setShown(contactFallback, false);
    setShown(contactStatus, false);

    if (!canvas) return;

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
        // The two rendered headshots, taken now rather than when a card
        // asks for one. They cost a frame apiece and the visitor is looking
        // at a room they have just arrived in, which is the cheapest frame
        // in the visit to spend.
        warmRenderedFaces();
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

    // Safari's own pinch, blocked ON THE CANVAS ONLY (M39).
    //
    // These are non-standard, Safari-only events, and cancelling
    // gesturestart is the only way to stop Safari page-zooming the
    // immersive 3D view. They used to be canceled on the DOCUMENT, which
    // took the page's zoom with them: together with the `user-scalable=no`
    // that came off the viewport meta in the same round, this page could
    // not be pinched larger at all, which is a WCAG 1.4.4 failure on a
    // card carrying a phone number.
    //
    // Scoped to the canvas, a pinch that starts on the scene still belongs
    // to the scene, and a pinch that starts on a card zooms the card.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(type =>
        canvas.addEventListener(type, (e) => e.preventDefault(), { passive: false, signal }));

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
    if (nudgeModal) nudgeModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closeNudgeModal, { signal }));
    if (posterModal) posterModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closePoster, { signal }));
    // Wrapped rather than passed straight through, because addEventListener
    // hands the listener an Event and openPoster now takes a route name.
    //
    // AND IT COLLAPSES THE PANEL, which it did not before D43. It used to
    // only FADE the panel for as long as the card was up (holdCoaching), so
    // the intro came back underneath when the card closed. That was right
    // while a timer was going to take the panel away anyway; with the timer
    // gone it would have left the panel there for the rest of the visit
    // behind a card the visitor had already read. The floating W is one of
    // the three things Steve named that should retire the panel, and this is
    // where it does it. The intro's own W button already did the same.
    if (posterBtn) posterBtn.addEventListener('click', () => {
        collapseIntro();
        openPoster('corner');
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
    // tap on any of the three people, from the halo above them, and from
    // the arrival panel's own button.)

    // Which of the three actions a visitor actually takes is the number
    // that tells John whether any of this worked. On a desktop the action
    // ALSO puts the address on the clipboard (see copyOnDesktop).
    [[contactCall, 'call'], [contactText, 'text'], [contactEmail, 'email']]
        .forEach(([el, action]) => {
            if (!el) return;
            el.addEventListener('click', () => {
                track('contact-action', { action });
                copyOnDesktop(action);
            }, { signal });
        });
    if (contactShare) contactShare.addEventListener('click', shareRoom, { signal });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') { keepFocusInCard(event); return; }
        if (event.code !== 'Escape') return;
        if (posterOpen) closePoster();
        else if (nudgeOpen) closeNudgeModal();
    }, { signal });

    // View controls: ZOOM ONLY, since D44.
    //
    // This room is wider than any frame, so every aspect crops the coffee
    // bar on one side and the sales board on the other, and the answer used
    // to be that a visitor could drag or swipe to yaw and tilt their way to
    // either. QA's call to remove that, and it follows D43 rather than
    // arriving out of nowhere: once nothing in the room answers a tap, there
    // is nothing out at the edges to go and find, so the drag was offering
    // work with no reward and a way to end up looking at a wall. The scene
    // is composed for one view and now it holds it.
    //
    // WHAT IS LEFT is the wheel, the pinch and the +/- keys, still anchored
    // to whichever FOV the current orientation composed with, so leaning in
    // on the deal sheet still works. `pan.maxAngle` and `pan.maxTilt` are
    // both 0 in config, which is how the shared part switches an axis off.
    // alwaysOn stays (same as the karaoke bar) because the zoom is wanted at
    // every aspect, not just portrait.
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
    //    keyboard zoom is gated on the zoom buttons EXISTING (not on their
    //    being visible), so removing them from the DOM would quietly take
    //    the +/- keys with them. (It also used to keep the desktop drag
    //    alive, which D44 has since zeroed at the config instead.)
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

// (SMALL_PROP_KINDS lived here: the die-cast on the desk corner, the wall
// clock and the dealer's keyboard, each small enough to be missed beside a
// big neighbor and so given the tolerance search to themselves. D43 made
// every prop in the room unclickable, so there is nothing small left to
// forgive. The tolerance search itself did not go: it moved to the three
// PEOPLE, who are the only things that answer a tap now, and it keeps the
// depth check that was written for the small props. See pickSceneHit.)

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

// How far behind whatever is genuinely under the finger a person may sit
// and still claim a near-miss. A hand's width: enough to forgive a tap that
// lands on the chair back John is sitting against, nowhere near enough to
// let somebody across the room answer through the desk in front of them.
const PERSON_REACH_M = 0.25;

/** Nearest visible hit under the screen point.
 *
 *  EVERY PROP IS STILL A TARGET, and that is the point rather than an
 *  oversight. Since D43 only the three people ANSWER a tap, but the room
 *  still has to be able to block one: raycasting at the people alone would
 *  let a tap on the desk in front of John open John's card, and "the
 *  background is not clickable" has to mean the background is not a way
 *  through to something that is. So everything is cast against, and
 *  checkSceneTap decides whether what came back is somebody.
 *
 *  THE PEOPLE GET FIRST REFUSAL AT FULL TOLERANCE, which is the forgiveness
 *  the small props used to have. A ring floats above a head, so the thing a
 *  visitor reaches for is the person under it, and a fingertip that lands
 *  just off a shoulder should still reach them.
 *
 *  AND THAT REFUSAL IS DEPTH-CHECKED, which it has to be. A tolerance search
 *  only asks whether a target is near the finger ON SCREEN, never what
 *  stands in front of it, so without this the customer would answer a tap
 *  meant for the desk she is sitting behind. The direct ray is cast first to
 *  find what is really under the finger, and a person wins their tolerance
 *  only when they are at or in front of that. */
function pickSceneHit(clientX, clientY) {
    const camera = getCamera();
    if (!camera) return null;
    const targets = getOutdoorPropMeshes();
    if (!targets.length) return null;
    pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);

    raycaster.setFromCamera(pointer, camera);
    const direct = firstVisibleHit(targets);

    const people = targets.filter(g => g.userData && PERSON_KINDS.includes(g.userData.propKind));
    if (people.length) {
        const near = searchHit(people, camera);
        if (near && (!direct || near.distance <= direct.distance + PERSON_REACH_M)) return near;
    }
    return direct;
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
/** Is the FULL panel on screen? The collapsed handle is not the panel: it
 *  takes its own tap and never eats one meant for the room, so the D31
 *  "arrival is one decision" rule below reads this and not the handle. */
function introShowing() {
    return !!introEl && !introEl.classList.contains('coach-out');
}

/** True when a point is over the arrival panel itself.
 *
 *  The panel's SURFACE is `pointer-events: none` and stays that way, which
 *  is what lets a gesture start on it and reach the canvas: it covers a
 *  third of a phone screen, and a panel that ate gestures would be worse than
 *  one that ate taps. (D40 gave it three controls, and only those three
 *  take pointer events. A tap on one of them is a DOM click that never
 *  reaches the canvas, so it never reaches this function either.) But
 *  pointer-events none also meant a TAP on it fell straight through and
 *  opened whatever prop happened to be behind the text, which is what Steve
 *  found. So the panel is transparent to the gesture layer and opaque to
 *  this one, and the only way to have both is to ask where the tap
 *  landed. */
function overIntro(clientX, clientY) {
    if (!introShowing()) return false;
    const r = introEl.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

function checkSceneTap(clientX, clientY) {
    if (!state.isLoaded || nudgeOpen || posterOpen) return;

    // A TAP THAT IS NOT A PERSON IS NOT AN EVENT (D43). The showroom used to
    // answer taps everywhere: fourteen props each told a story, and a tap on
    // anything at all collapsed the arrival panel on the way past. Both are
    // gone. The room is a picture now, and the only things in it that answer
    // are the three people and the halos over them.
    //
    // THE PANEL IS NO LONGER COLLAPSED BY A STRAY TAP, which is the other
    // half of the same decision and the reason this function no longer
    // touches it except through a person. A visitor who taps the floor while
    // reading keeps their place. The panel now leaves only when somebody
    // asks it to: its close button, one of its own two actions, a halo or
    // the person under it, or the floating W. Nothing times out.
    //
    // The panel still eats taps that land ON it, or a tap meant for the copy
    // would raycast to whoever is standing behind it.
    if (introShowing() && overIntro(clientX, clientY)) return;

    const hit = pickSceneHit(clientX, clientY);
    const prop = hit && getPropRoot(hit.object);
    const kind = prop && prop.userData.propKind;
    if (!kind || !PERSON_KINDS.includes(kind)) return;

    // Reaching one of the three is what the arrival is for, so the panel
    // steps aside on the way to the card. The HALOS stay up regardless,
    // which is D41.
    collapseIntro();
    // NO SEPARATE click-person PING. It carried `who`, and the card this
    // opens records the same name as `kind`, so it was a second request
    // saying what the first already said. See the note on openContactCard.
    openContactCard(kind);
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
/* THE THREE PEOPLE, AND ONLY THE THREE, since D43. Fourteen more entries sat
 * here, one for each tappable prop in the showroom: the wall clock, the deal
 * sheet, the desk, the glass, the dealer's screen and keyboard, the die-cast
 * on the corner, the sales board, the wall art, the coffee bar, the vending
 * machine, the waiting chairs, the brochures and the plant. Each had a title
 * and a pair of alternating lines, and each ended at the invitation to call
 * John. They came out with the taps that used to reach them.
 *
 * WHY THESE THREE STAY. A tap on a person opens the contact card, and this is
 * what that falls back to if the card cannot open, so their copy is what
 * stops a tap on John ever being a dead end. In the ordinary case none of it
 * is on screen. */
const PROP_CONTENT = {
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
};
let dialogReturnFocus = null;

/* openPropDialog / closePropDialog LIVED HERE, and went with D43. They
 * showed a tapped prop's story and counted taps, queueing the invitation to
 * call John after every fourth one, which closePropDialog then surfaced as
 * the story card closed. With nothing in the room tappable but the people,
 * neither the story nor the count has an input any more.
 *
 * WHAT THAT COST, recorded so it is a decision rather than a drift: the
 * every-fourth invitation was the one route to the contact card that a
 * visitor did not have to ask for. What is left is entirely opt-in, which
 * is what QA asked for. `propTick` went too, having rotated which of a
 * prop's two lines to show. */

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

// ---- Keeping the keyboard inside an open card (M39) -------------------------
//
// All three cards carry `aria-modal="true"`, which tells a screen reader
// that the rest of the page is inert. Nothing was making that true for the
// KEYBOARD: Tab from the last control in a card walked straight out into
// the two floating buttons in the corner, which sit behind a near-opaque
// backdrop, and then into the browser. A sighted keyboard visitor lost the
// card without closing it.
//
// The halos and the arrival panel were already handled, by holdCoaching,
// which fades both while a card is up. This is the same problem for
// everything else on the page, solved once at the source instead.

/** What can be tabbed to. `[tabindex="-1"]` is deliberately excluded: the
 *  contact card's container carries one so focus can LAND on it when the
 *  card opens (D24, so a stray Enter cannot dial John), and it must not
 *  become a tab stop of its own. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), '
    + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The card currently up, in the order they stack. */
function openCard() {
    if (posterOpen) return posterModal;
    if (nudgeOpen) return nudgeModal;
    return null;
}

/** Wrap Tab around the open card, so the keyboard cannot leave it.
 *
 *  The visible filter matters more here than it looks: the contact card
 *  hides its three actions through `style.display` when the proof of work
 *  has not resolved (setShown, because the shared sheet has no .hidden
 *  rule), and a trap that counted them would wrap onto a control nobody
 *  can see or reach. offsetWidth and offsetHeight are both zero for a
 *  display:none element and non-zero for everything else in these cards. */
function keepFocusInCard(event) {
    const card = openCard();
    if (!card) return;
    const items = Array.from(card.querySelectorAll(FOCUSABLE))
        .filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0);
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];
    const here = document.activeElement;
    const outside = !card.contains(here);

    if (event.shiftKey ? (here === first || outside) : (here === last || outside)) {
        (event.shiftKey ? last : first).focus();
        event.preventDefault();
    }
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

// ---- The face on the contact card (D40) -------------------------------------
//
// Whoever the visitor tapped is who looks back at them. John's card carries
// his photograph, which is the one real face on this page. His customer's
// card and the dealer's carry a PORTRAIT OF THE FIGURE ITSELF, taken by
// store.js with the scene's own renderer: John's face on the dealer's card
// read as a mistake rather than as a house style, and a scene whose whole
// premise is that these are people having a conversation may as well let two
// of them sit for a picture.
//
// Every other way into this card (the About card, the arrival panel) is John
// inviting somebody to call him, so those all keep his photograph.
const JOHN_AVATAR = 'assets/john-walker-avatar.webp';
const RENDERED_FACES = {
    customer: 'The customer at the desk, drawn as one of the showroom’s low-poly '
        + 'figures and posed for a portrait',
    dealer: 'The dealer across the desk, drawn as one of the showroom’s low-poly '
        + 'figures and posed for a portrait'
};
const faceCache = {};
let faceShowing = null;     // which face the card is currently wearing

/** Put the right face on the card before it opens.
 *
 *  A rendered portrait cannot be produced on demand: store.js has to take
 *  it inside the render loop (see requestPersonPortrait). So the disc is
 *  hidden rather than left wearing the last person's face, and appears when
 *  the picture lands. In practice it never does land late, because both are
 *  taken during the arrival, and the fallback if one cannot be taken at all
 *  is John's photograph rather than an empty circle. */
function setCardPortrait(kind) {
    if (!nudgePortrait) return;
    faceShowing = kind;

    const alt = RENDERED_FACES[kind];
    if (!alt) {
        nudgePortrait.src = JOHN_AVATAR;
        nudgePortrait.alt = 'John Walker';
        nudgePortrait.style.visibility = '';
        return;
    }

    nudgePortrait.alt = alt;
    if (faceCache[kind]) {
        nudgePortrait.src = faceCache[kind];
        nudgePortrait.style.visibility = '';
        return;
    }

    // `visibility`, not `display`: the disc keeps its box, so the card does
    // not reflow around it when the picture arrives.
    nudgePortrait.style.visibility = 'hidden';
    requestPersonPortrait(kind, (url) => {
        applyRenderedFace(kind, url);
        if (faceShowing === kind) setCardPortrait(kind);
    });
}

/** File one rendered portrait, or record that it could not be taken. */
function applyRenderedFace(kind, url) {
    if (url) {
        faceCache[kind] = url;
        return;
    }
    // No picture. John's photograph is the honest fallback: the card is
    // about reaching him either way.
    faceCache[kind] = JOHN_AVATAR;
    RENDERED_FACES[kind] = 'John Walker';
    // `kind`, not `who`: it is the same value `contact-open` reports, and one
    // idea under two attribute names is a log nobody can query in one go.
    // (`click-prop` was the third until D43 retired the prop stories.)
    track('portrait-failed', { kind });
}

/** Take both portraits during the arrival, so a card that opens later
 *  already has its face. One per frame, and the two of them cost about as
 *  much as two frames of the showroom. */
function warmRenderedFaces() {
    Object.keys(RENDERED_FACES).forEach((kind) => {
        if (faceCache[kind]) return;
        requestPersonPortrait(kind, (url) => applyRenderedFace(kind, url));
    });
}

// ---- What the card says back, and the way out of it (M37) -------------------

/** The card's own reply line. Empty hides it, so it never takes up room
 *  before it has something to say. */
function setStatus(text) {
    if (!contactStatus) return;
    contactStatus.textContent = text || '';
    setShown(contactStatus, !!text);
}

/** Write to the clipboard, and never throw. Resolves to whether it worked.
 *
 *  navigator.clipboard needs a secure context, which production has and a
 *  plain-http preview does not, and it can be refused by permission at any
 *  moment. Both cases fall through to SHOWING the thing instead, which is
 *  what the visitor actually needed. */
function writeClipboard(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(() => true, () => false);
        }
    } catch (err) {
        // A locked-down clipboard is not a reason to lose the number.
    }
    return Promise.resolve(false);
}

/** ON A DESKTOP THE ACTION ALSO GOES TO THE CLIPBOARD.
 *
 *  The three actions are `tel:`, `sms:` and `mailto:`, which are exactly
 *  right on the phone this page was designed for and unreliable on a
 *  laptop: some desktops hand a tel: to FaceTime or Teams and some do
 *  nothing visible at all. A visitor who presses the Call action and sees
 *  nothing has hit a dead end at the one moment that matters, and a
 *  laptop is exactly where somebody lands when a friend sends them a link.
 *
 *  THE LINK IS NOT CANCELLED. A desktop that does handle tel: should still
 *  get to dial; this runs alongside it, so the number is in hand either
 *  way. And touch devices are left alone, because copying a number
 *  somebody is one tap from dialling is noise. */
function copyOnDesktop(action) {
    if (state.isMobile || !contactStatus) return;
    const contact = assembleContact();
    if (!contact) return;
    const what = action === 'email' ? contact.address : contact.display;
    const label = action === 'email' ? 'email address' : 'number';
    writeClipboard(what).then((ok) => {
        setStatus(ok ? `Copied ${what} to your clipboard.` : `John's ${label} is ${what}.`);
        // ONLY THE FAILURE IS WORTH A REQUEST. This runs alongside the
        // contact-action ping for the same click, so on a desktop every
        // call, text and email cost two hits and the second one almost
        // always said the same thing: it worked. A silent clipboard is the
        // interesting case, because the visitor is then reading the number
        // off the status line instead.
        if (!ok) track('contact-copy', { action, ok: false });
    });
}

/** SEND THIS ROOM TO SOMEBODY.
 *
 *  The scene's second job is that a visitor passes it on, and until this
 *  round nothing on the page served it at all. The device's own share
 *  sheet where there is one, the clipboard where there is not, and a line
 *  of type either way.
 *
 *  A CANCELLED SHEET IS NOT A FAILURE, and nothing is said on that path.
 *  navigator.share rejects with an AbortError when somebody backs out,
 *  which is most of the times it rejects, and it RESOLVES on dismissal on
 *  some platforms, so there is no reliable way to tell a send from a
 *  change of mind. The sheet is its own feedback. Thanking somebody who
 *  canceled would be worse than saying nothing.
 *
 *  The fragment is stripped, so a link that arrived with one is not passed
 *  on carrying it. */
function shareRoom() {
    const url = window.location.href.split('#')[0];
    if (typeof navigator.share === 'function') {
        track('share', { how: 'sheet' });
        try {
            // From CONFIG, which is where the comments have always said
            // this copy lives. It was hardcoded here as well, and the two
            // had drifted, so the sentence in config was dead text.
            const opened = navigator.share({
                title: AUTOMAN_CONFIG.site.share.title,
                text: AUTOMAN_CONFIG.site.share.text,
                url
            });
            if (opened && opened.catch) opened.catch(() => {});
            return;
        } catch (err) {
            // No sheet after all. The clipboard below is the fallback.
        }
    }
    track('share', { how: 'clipboard' });
    writeClipboard(url).then((ok) => {
        setStatus(ok
            ? 'Link copied. Send it to anyone who is about to buy a car.'
            : `Copy this link and send it on: ${url}`);
    });
}

/** Open the contact card. `kind` says who asked for it, which picks the copy
 *  and is what the log records, under the same attribute name every other
 *  ping on this page uses for the same idea.
 *
 *  It carried a second argument, `via`, splitting a person into the halo
 *  above them and the figure itself. That is gone (D48): it was a real
 *  distinction and an unactionable one, because D41 settled that the halos
 *  stay for the whole visit whichever number came back. */
function openContactCard(kind) {
    if (!nudgeModal) return false;
    const copy = CONTACT_CARDS[kind] || CONTACT_CARDS.story;
    if (!dialogReturnFocus) dialogReturnFocus = document.activeElement;

    // Whatever the last visit to this card said back, it is not true of
    // this one.
    setStatus('');
    setCardPortrait(kind);
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
            // A REAL LINK, not the words "contact page". This was prose set
            // with textContent, so the one route out of a card with no
            // contact details on it was a page the visitor had to go and
            // find by hand, while the focus trap held them inside the card
            // and the Home button sat behind the backdrop. The path has
            // been in config for exactly this and was never read.
            contactFallback.textContent = '';
            const say = (t) => contactFallback.appendChild(document.createTextNode(t));
            say('John’s direct line appears here over a secure connection '
                + '(https). In the meantime you can ');
            const out = document.createElement('a');
            out.href = AUTOMAN_CONFIG.site.builder.contactPath;
            out.textContent = 'reach the developer through the contact page';
            contactFallback.appendChild(out);
            say(' and he will pass your message straight on.');
        }
        setShown(contactFallback, true);
    }

    nudgeOpen = true;
    holdCoaching();
    armCard();
    track('contact-open', { kind });
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

/* openNudgeModal() lived here. It was a one-line alias for
 * openContactCard('nudge'), kept under its old name because
 * closePropDialog called it to surface the queued invitation after every
 * fourth prop story. D43 removed the stories, the count and the queue, so
 * the alias had no caller left. The 'nudge' route name stays reserved in
 * CONTACT_CARDS: if an unprompted invitation ever comes back on a
 * different trigger, this is the name the analytics already understand. */

function closeNudgeModal() {
    if (!nudgeModal) return;
    nudgeModal.classList.add('hidden');
    nudgeOpen = false;
    holdCoaching();
    restoreDialogFocus();
}

// ---- John's flyer ----------------------------------------------------------

/** Open the About card.
 *
 *  This is where the page says what John does in words, because a 3D
 *  showroom is the wrong place to read a page of type: his photograph, the
 *  account of the service, and a line out to his own printed flyer for
 *  anybody who wants it. Everything else in the scene is a stylization of
 *  him, and this is the one screen that is not. */
function openPoster(kind) {
    if (!posterModal || posterOpen) return;
    posterModal.classList.remove('hidden');
    // The card still scrolls on a short screen, so a second open has to
    // start at the top rather than wherever the last reader left it.
    const card = posterModal.querySelector('.poster-card');
    if (card) card.scrollTop = 0;
    posterOpen = true;
    holdCoaching();
    armCard();
    // NOT defaulted to 'corner'. The corner button passes its own name, so
    // a fallback of 'corner' would file a future route that forgot the
    // argument under a control it never touched, which is the one thing a
    // log must not do.
    track('poster-open', { kind: kind || 'unknown' });
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
// as they still need it, which was most of what D4 was worried about. D43
// closed the rest of that gap by accident: the prop stories were the one
// thing on this page a keyboard could never reach, and they are gone, so
// there is nothing pointer-only left in the scene.

const COACH_ARRIVE_MS = 900;    // the room alone first, then the guidance
// (INTRO_MS was 29000: the panel used to collapse itself after twenty nine
// seconds, timed against its own word count on the assumption that a panel
// is read once and should then get out of the way. D43 removed it. A timer
// decides for the visitor how fast they read, and it took the panel away
// mid-sentence from exactly the person this page is built for: somebody who
// is not fast with a computer, arriving from a link John sent them. The
// panel now waits. It leaves when its close button, one of its own two
// actions, a halo, one of the three people, or the floating W says so, and
// the handle brings it back for the whole visit.)
// The halos do not leave at this point, they QUIETEN, and since D41 that is
// the only thing that ever happens to them: nothing ends them, so they hold
// for the whole visit. What changes here is the RATE, not the presence. The
// pulse halves in speed so a ring is not strobing over a room somebody may
// well be sitting and looking at, and the marks stay at full strength,
// because "always visible" is the point of keeping them.
const COACH_CALM_MS = 30000;
const _coachPoint = new THREE.Vector3();

let coachMarksEl = null;
let introEl = null;
let introHandle = null;
let coachMarks = [];            // [{ el, kind, anchor }] once the cast exists
let coachTimers = [];
// Set once the coaching has started, and NEVER cleared: the halos hold for
// the whole visit now (D41). It still exists because the halos are hidden
// until the arrival, and holdCoaching has to know the difference between
// "not yet" and "parked behind a card".
let coachRunning = false;
// The panel's own life, tracked apart from the halos' now that it carries
// controls (D40). Nothing is on screen before it has arrived; after that it
// is EITHER the full panel or the collapsed handle, never both and never
// neither, except while a card is up and holdCoaching parks the pair.
//
// `introOpen` REPLACES a one-way `introDone`. The panel used to leave for
// good, and the argument was that it is read once. That is true of the
// reading and false about the room: this is the only thing on the page that
// says what John does, so somebody who looked at the showroom first and then
// wondered what they were looking at had a monogram in the corner and
// nothing else. It collapses now, and the handle brings it back.
let introArrived = false;
let introOpen = false;

/** Resolve the coaching elements, fit the copy to the input device, and
 *  wire the halos. Called from setupEventListeners, so it runs before the
 *  loader clears and nothing is on screen yet. */
function wireCoaching(signal) {
    coachMarksEl = document.getElementById('coach-marks');
    introEl = document.getElementById('intro-card');
    introHandle = document.getElementById('intro-handle');
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
        hint.textContent = `${verb} a glowing marker to meet John. `
            + `${state.isMobile ? 'Pinch' : 'Scroll'} to look closer.`;
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
        // A halo opens the same card the person under it opens, which is
        // the whole of what either of them does now: since D43 there is no
        // prop story left to fall through to.
        el.addEventListener('click', () => {
            collapseIntro();
            openContactCard(kind);
        }, { signal });
    });

    wireIntroControls(signal);
}

/** The three controls on the arrival panel (D40).
 *
 *  The panel spent every round until this one as a surface with nothing on
 *  it: `pointer-events: none`, no way to dismiss it, and one job, which was
 *  to say what John does while the visitor looked at the room. Steve's call
 *  reverses that. It now carries a way out and the two routes anybody who
 *  has just read it would want next, and the reasoning against (which is
 *  recorded in TASKS.md at D31) is answered rather than ignored:
 *
 *  - THE SURFACE STILL TAKES NO POINTER EVENTS. Only these three controls
 *    do. A gesture that starts anywhere else on the panel still reaches the
 *    canvas, which is the property that made a panel affordable over a
 *    third of a phone screen in the first place. It used to mean the room
 *    could be looked around from there; since D44 it means the room can be
 *    zoomed from there. The cost is a gesture that starts on a button, and the
 *    buttons are deliberately small and off to the left for that reason.
 *  - THE ARRIVAL IS STILL ONE DECISION IN THE SCENE. checkSceneTap is
 *    untouched: while the panel is up, the only things in the ROOM that
 *    open anything are the halos and the three people under them. These
 *    are page controls, not scene taps, and they sit in their own row
 *    under the paragraph rather than competing with the halos.
 *  - IT DOES NOT PUT JOHN'S NUMBER IN THE MARKUP. "Talk to John" opens the
 *    contact card, which assembles the number from the proof of work the
 *    way every other route into it does, so D3 is intact. */
function wireIntroControls(signal) {
    const close = document.getElementById('intro-close');
    if (close) close.addEventListener('click', () => {
        // No `via`. The close button is the only thing that fires this, so
        // the attribute was a constant riding along on every request. The
        // name stays `intro-dismiss` though the panel now collapses rather
        // than leaving, because the thing it measures is unchanged: somebody
        // read the panel and asked for the room back.
        track('intro-dismiss');
        collapseIntro();
    }, { signal });

    // THE HANDLE, which is the panel's way back. Everything else in this
    // function sends the visitor somewhere; this one just returns the copy
    // they dismissed, so it is the one control here that does not need the
    // arrival to still be running.
    if (introHandle) introHandle.addEventListener('click', expandIntro, { signal });

    // Reaching John is the one thing the whole arrival is for, so this
    // retires the panel. It does NOT end the coaching: this comment used to
    // say it ended it outright, which D41 stopped being true, because the
    // halos are the page's permanent control rather than an arrival device.
    const talk = document.getElementById('intro-contact');
    if (talk) talk.addEventListener('click', () => {
        // No intro-action ping: the card's own kind is already 'button',
        // which is this control and nothing else.
        collapseIntro();
        openContactCard('button');
    }, { signal });

    // The About card, behind the same three-blade W the floating button in
    // the corner wears. The halos STAY: reading about John is not meeting
    // him, and the marks are still the way to the three of them.
    const about = document.getElementById('intro-about');
    if (about) about.addEventListener('click', () => {
        // No intro-action ping either: poster-open now names its own route.
        collapseIntro();
        openPoster('intro');
    }, { signal });
}

/** Collapse the arrival panel to its handle.
 *
 *  IT USED TO RETIRE FOR GOOD, and the argument was that the panel is read
 *  once. That is right about the reading and wrong about the room: this
 *  panel is the only thing on the page that says what John does, so a
 *  visitor who looked at the showroom first and then wondered what they were
 *  looking at was left with a monogram in the corner. The handle keeps the
 *  answer one tap away for the whole visit, which is the same argument D41
 *  used to keep the halos up, applied to the other thing on screen that
 *  explains the page.
 *
 *  THE HALOS ARE STILL UNTOUCHED HERE, and that is D41 itself. Reaching a
 *  person used to take them away, on the reasoning that somebody who has met
 *  John does not need three rings telling them where he is. True, and beaten
 *  by who this page is for: a visitor who is not confident with a computer,
 *  arriving from a link John sent, for whom the rings ARE the interface.
 *
 *  Called from all three routes to a person, the timer, the close button and
 *  the first tap during arrival. Safe to call when already collapsed. */
function collapseIntro() {
    if (!introOpen && introArrived) return;
    introOpen = false;
    fadeCoach(introEl);
    // The handle only appears once the panel has actually arrived. Collapsing
    // something the visitor never saw would put a pill on screen during the
    // loader's last moments, pointing at copy that had not been shown yet.
    if (introArrived) showIntroHandle(true);
}

/** Open it again from the handle. */
function expandIntro() {
    if (!introArrived || introOpen) return;
    introOpen = true;
    showIntroHandle(false);
    if (introEl) introEl.classList.remove('coach-out');
    track('intro-expand');
    // Focus moves to the panel, because a keyboard visitor who just pressed
    // the handle is now looking at a surface whose controls are below it and
    // whose close button is the way back. The panel takes tabindex="-1" for
    // this, the same arrangement the cards use.
    if (introEl && typeof introEl.focus === 'function') introEl.focus();
}

/** Show or hide the collapsed handle, keeping `aria-expanded` honest. */
function showIntroHandle(shown) {
    if (!introHandle) return;
    introHandle.classList.toggle('coach-out', !shown);
    introHandle.setAttribute('aria-expanded', shown ? 'false' : 'true');
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
        if (!coachRunning) return;      // the page went in the meantime
        // With no cast there are no halos, but the strip still says what
        // the room is, so the two are revealed independently.
        if (coachMarks.length) coachMarksEl.classList.remove('coach-out');
        if (introEl) {
            introArrived = true;
            introOpen = true;
            introEl.classList.remove('coach-out');
        }
    }, COACH_ARRIVE_MS));

    coachTimers.push(setTimeout(() => {
        if (!coachRunning || !coachMarksEl) return;
        // Slower pulse and nothing else. This used to ping `coach-calm`
        // for a visitor who had sat half a minute without trying a halo,
        // and it is a screen change now, not an event.
        coachMarksEl.classList.add('coach-calm');
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

/** Park the coaching while a card is up, and bring it back when it closes.
 *
 *  This became necessary the moment the halos stopped leaving on the first
 *  tap, and it is the ONE thing that still hides them now that nothing
 *  else ever does (D41). They sit at z-index 90, under every modal and its
 *  near-opaque backdrop, so nobody SEES them behind a story card, but a
 *  keyboard visitor would still tab straight into three invisible buttons
 *  behind it. The same `.coach-out` the arrival uses does the job, because
 *  it takes `visibility` with it once the fade finishes.
 *
 *  The `coachRunning` guard is what stops a card closing from revealing the
 *  halos before the arrival has run at all, or after the page has gone.
 *
 *  THE PANEL IS IN HERE TOO NOW, for exactly the same reason and only
 *  since D40: it used to be a surface with nothing focusable on it, and it
 *  carries three controls today, so leaving it up behind a card would leave
 *  three tab stops behind the backdrop. It comes back on the narrowest
 *  terms it can: only if it had already arrived and has not been retired,
 *  which is what stops a card opened and closed in the first second from
 *  showing it early, and a card closed after its time from showing it
 *  again. */
function holdCoaching() {
    if (!coachMarksEl) return;
    const covered = nudgeOpen || posterOpen;
    if (covered) {
        fadeCoach(coachMarksEl);
        fadeCoach(introEl);
        // THE HANDLE PARKS TOO. It is a real tab stop, so leaving it up
        // behind a near-opaque backdrop is the D21 bug in miniature: a
        // keyboard visitor tabs out of the card onto a button they cannot
        // see, which is exactly what the M39 focus trap was added to stop.
        showIntroHandle(false);
        return;
    }
    if (coachRunning && coachMarks.length) coachMarksEl.classList.remove('coach-out');
    // Whichever of the two was up before the card comes back, and never both.
    if (coachRunning && introArrived) {
        if (introOpen && introEl) introEl.classList.remove('coach-out');
        else showIntroHandle(true);
    }
}


/* THERE IS NO applySiteLinks() HERE ANY MORE, and no floating link at all.
 * Its whole job was the Home button, which pointed at the serving site's
 * root; the button was removed, so the function went with it rather than
 * staying on as an empty call in the boot sequence.
 *
 * There was never an outbound business link either. The other
 * featured-business experiences send a floating button to the business's
 * own website, but this page IS John's web presence, so there was nowhere
 * outward to send anybody. The contact card opens from a tap on any of the
 * three people, from the halo above them, and from the arrival panel.
 *
 * AUTOMAN_CONFIG.site.home is still there and is now read by nothing on
 * this page. It stays because it documents where the serving site's root
 * is, and the share copy sits beside it in the same object. */

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
    CONTACT_CARDS, PERSON_KINDS, PROP_CONTENT,
    assembleContact,
    setProof(proof) { _proof = proof; _contact = null; }
};
