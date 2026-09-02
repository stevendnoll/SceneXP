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
 * the welcome overlay (dismissed with a click, tap, or key), two floating
 * buttons (Home, and one that opens John's own flyer), the always-on pan
 * and zoom row (shared pan part, with swipe, tilt, and pinch on touch),
 * and one raycast per tap to see what the visitor pointed at, answered in
 * the host's voice by the dialog card.
 *
 * Unlike the other featured-business experiences, this one has nowhere
 * outward to send anybody: John has no separate website, because this
 * page is his web presence. So NOTHING here links off the site: every card
 * CTA leads to the contact card, and the second floating button opens a
 * picture of John's flyer rather than sending anybody anywhere.
 *
 * BUILD STATUS: milestone M14, the fourth screenshot QA round. Every prop
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

function checkSceneTap(clientX, clientY) {
    if (!state.isLoaded || dialogOpen || nudgeOpen || posterOpen) return;
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
        track('click-person', { who: kind });
        // If the card cannot open for any reason, fall through and at
        // least tell their story. That also keeps their PROP_CONTENT
        // entries reachable rather than leaving three blocks of copy
        // nobody can ever see.
        if (openContactCard(kind)) return;
    }
    openPropDialog(kind);
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
            'Where you sit while somebody takes your keys away to appraise your trade. The wait is a tactic as often as it is a queue.',
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
    track('click-prop', { kind });
    if (dialogTitle) dialogTitle.textContent = content.title;
    if (dialogMessage) dialogMessage.textContent = content.lines[propTick++ % content.lines.length];
    // Every few stories, queue the invitation to follow this one
    propClicks += 1;
    if (propClicks % NUDGE_EVERY === 0) nudgePending = true;
    dialogReturnFocus = document.activeElement;
    dialogModal.classList.remove('hidden');
    if (dialogCta) dialogCta.focus();
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

// ---- The contact card ------------------------------------------------------

// Who opened it, and what it says when they did. Every route in gets its
// own heading and opening line, so the card reads as an answer to the tap
// rather than the same advert wheeled out five different ways.
const CONTACT_CARDS = {
    john: {
        kicker: '★  Free consultation, by phone or Zoom  ★',
        title: 'Meet John Walker',
        lead: 'This is John, doing the part most people dread. Twenty five years of it, more than 2,000 cars, and now he does it for the buyer instead of the dealership. If he cannot get you the deal you want, you owe him nothing.'
    },
    customer: {
        kicker: '★  Free consultation, by phone or Zoom  ★',
        title: 'She brought backup',
        lead: 'She walked in with somebody who knows what every line on that page is worth. The consultation that got her here was free, and so is yours.'
    },
    dealer: {
        kicker: '★  Free consultation, by phone or Zoom  ★',
        title: 'The other side of the desk',
        lead: 'He is good at his job, and that is exactly the point. Nobody should have to sit across from a professional without one of their own.'
    },
    story: {
        kicker: '★  Free consultation, by phone or Zoom  ★',
        title: 'Let John handle it',
        lead: 'John Walker has spent twenty five years on the other side of that desk, and more than 2,000 cars have gone through his hands. If he cannot get you the deal you want, you owe him nothing.'
    },
    nudge: {
        kicker: '★  A few stops into the visit  ★',
        title: 'Enjoying the showroom?',
        lead: 'Thank you for looking around. Everything in this room is something John has already thought about on a customer’s behalf. If you have a car to buy or sell, he would be glad to hear from you.'
    },
    button: {
        kicker: '★  Free consultation, by phone or Zoom  ★',
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
    track('contact-open', { entry });
    nudgeModal.classList.remove('hidden');
    const lead = contact ? contactCall : nudgeModal.querySelector('[data-close]');
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
    posterOpen = true;
    track('poster-open');
    const close = posterModal.querySelector('.modal-close');
    if (close) close.focus();
}

/** Close it, and hand focus back to the button that opened it. */
function closePoster() {
    if (!posterModal || !posterOpen) return;
    posterModal.classList.add('hidden');
    posterOpen = false;
    if (posterBtn) posterBtn.focus();
}

/** Dismiss the welcome overlay and settle in for the visit. */
function beginVisiting() {
    if (!state.isLoaded || !blocker || blocker.classList.contains('hidden')) return;
    blocker.classList.add('hidden');
    track('begin-visiting');
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
