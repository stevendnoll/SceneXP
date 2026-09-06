// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for Sunnyvale Jenn Consulting experience.
 *
 * The third passive SceneXP experience, so this conductor stays small:
 * build the office, park the camera in the doorway, and let the room do
 * all the living. There are no movement controls, no collision, and no
 * moving day/night cycle (the sky is frozen at noon so it is a bright,
 * sunny morning in here at every hour, though the cycle's per-frame pass
 * still runs for the fixed-time sky paint and the shadow-map refresh).
 * The interactions that do exist are featherweight: the welcome overlay
 * (dismissed with a click, tap, or key), the floating Home and website
 * buttons, the always-on pan and zoom row (shared pan part, with swipe,
 * tilt, and pinch on touch), and one raycast per tap to see what the
 * visitor pointed at, answered in the host's voice by the dialog card.
 *
 * Future contributors: this file (with www/jamar/js/main.js and
 * www/gavin/js/main.js) is the template for "living diorama"
 * experiences. If your scene wants walking and clicking instead, start
 * from www/steve/js/main.js, which wires the shared controls.
 */

import { SVJ_CONFIG } from './config.min.js';
import { getProofOfWork, bufToHex, installCardFocusTrap } from '../../shared/js/boot-1.0.0.min.js';
import { initPortraitControls, updatePortraitControls, gestureClaimedTap } from '../../shared/js/pan-1.0.0.min.js';
import {
    initScene, handleResize, render, getCamera, getRenderer,
    updateDayNightCycle, removeTestObjects, isTouchDevice
} from '../../shared/js/scene-1.0.0.min.js';
import {
    initStore, updateOffice, updateBackgroundAnimations, updateInteriorAmbientLight
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

// A CARD OPENS UNDER THE FINGER, and this is www/automan's decision D24
// brought over here, where the same fault was live. The props stand in the
// middle of the frame and a card opens centered, so the outbound link lands
// about where Jenn's chair was: a tap on Jenn opened her card AND followed
// the link to sunnyvalejenn.com, because the touch spawns a compatibility
// mouse click a few milliseconds later and the card is already underneath
// it. Two belts, because canceling the compatibility click is right and is
// not a guarantee across browsers, and it does nothing about a second real
// tap from somebody who did not see the card appear.
//
// For CARD_ARM_MS after any card opens, a pointer click inside it is
// swallowed in the capture phase, before the link under it can act. Nobody
// reads a card they have never seen and presses its one big button in under
// half a second. Keyboard activation is exempt: Enter and Space arrive as a
// click with `detail` 0, and somebody tabbing was never handed a card under
// their finger.
const CARD_ARM_MS = 450;
let cardArmedAt = 0;

function armCard() {
    cardArmedAt = Date.now();
}

function swallowGhostTap(event) {
    if (!cardArmedAt || Date.now() - cardArmedAt > CARD_ARM_MS) return;
    if (!event.detail) return;              // keyboard, not a pointer
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    if (!target.closest('#dialog-modal, #nudge-modal')) return;
    cardArmedAt = 0;                        // one swallow per opening
    event.preventDefault();
    event.stopPropagation();
    track('ghost-tap');
}

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

    // Wire the Home and website buttons from SVJ_CONFIG.site, so config
    // stays the single home for these values. Equivalent fallbacks are
    // baked into the HTML for the no-JS path.
    applySiteLinks();

    // Soft bot deterrent: solve a tiny proof of work before building the scene
    // (or reuse a still-valid one from sessionStorage). Hand the hash to the
    // telemetry layer so it tags every ping.
    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(SVJ_CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Initializing renderer…', 25);
    initScene(canvas, SVJ_CONFIG);
    placeCamera();

    updateLoadingStatus('Opening the curtains…', 50);
    initStore();
    removeTestObjects();

    updateLoadingStatus('Letting Jenn know you have arrived…', 80);
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

/** Park the camera at the experience's one composed viewpoint. The office
 *  provides all the motion; the camera only re-derives on resize.
 *
 *  The composition assumes a landscape frame. three.js FOV is vertical,
 *  so a portrait phone keeps the height but loses both sides. Below an
 *  aspect of 1 this widens to the portrait FOV and dollies the camera
 *  straight back until the composed half-width (Jenn's desk and most of
 *  the window) fits in frame at the desk's distance, capped at
 *  portrait.maxZ so the dolly can never back through the wall behind
 *  the camera. Runs on every resize, so rotating the phone reframes
 *  live. */
function placeCamera() {
    const camera = getCamera();
    const cam = SVJ_CONFIG.camera;
    if (!camera || !cam) return;

    const aspect = window.innerWidth / window.innerHeight;
    const portrait = cam.portrait || {};
    let fov = cam.fov || camera.fov;
    let z = cam.position.z;

    if (aspect < 1 && portrait.minHalfWidth) {
        fov = portrait.fov || fov;
        // Distance at which minHalfWidth meters of half-frame fit the
        // narrow view, back-solved from the horizontal FOV.
        const halfFovRad = (fov / 2) * Math.PI / 180;
        const needed = portrait.focusZ + portrait.minHalfWidth / (Math.tan(halfFovRad) * aspect);
        z = Math.max(z, needed);    // only ever dolly back, never closer
        if (portrait.maxZ) z = Math.min(z, portrait.maxZ);    // and never through the wall
    }

    camera.fov = fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camera.position.set(cam.position.x, cam.position.y, z);
    camera.lookAt(cam.lookAt.x, cam.lookAt.y, cam.lookAt.z);
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

    // A click or tap on the scene: any of the office's storytelling props.
    // A tap that merely ends a swipe or pinch (see the surface option
    // below) belongs to the gesture, not to a prop.
    canvas.addEventListener('click', (event) => {
        if (gestureClaimedTap()) return;
        checkSceneTap(event.clientX, event.clientY);
    }, { signal });
    canvas.addEventListener('touchend', (event) => {
        // Cancel the compatibility mouse click this touch would otherwise
        // spawn. It is the first of the two belts described above
        // swallowGhostTap: a card is about to open under this finger, and
        // the click would land on whatever the card puts there. Canceling
        // also stops the tap raycasting twice, through the click handler
        // above and this one.
        if (event.cancelable) event.preventDefault();
        if (gestureClaimedTap()) return;
        const touch = event.changedTouches[0];
        if (touch) checkSceneTap(touch.clientX, touch.clientY);
    }, { passive: false, signal });

    // The last line of defense for that same tap. Capture phase on the
    // document, so it runs before anything inside a card can act.
    document.addEventListener('click', swallowGhostTap, { capture: true, signal });

    // The office dialog's close buttons and backdrop, the reach-out
    // invitation's, and Escape for whichever is up
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
    // landscape crops the whiteboard on one side and the sideboard on the
    // other. The shared part builds a bottom-center row at EVERY aspect
    // for this scene (alwaysOn + the 'always-on' CSS variant, same as the
    // karaoke bar): pan arrows that slowly yaw the view toward the yoga
    // corner on one side and the sideboard on the other, and a zoom pair
    // that leans in toward Jenn at her desk or widens the whole room. The
    // zoom anchors to whichever FOV the current orientation composed
    // with. Handing over the canvas as `surface` adds the touch paths:
    // swipe to pan sideways or tilt up and down, pinch to zoom.
    initPortraitControls({
        getCamera,
        lookAt: SVJ_CONFIG.camera.lookAt,
        baseFov: SVJ_CONFIG.camera.portrait.fov,
        landscapeFov: SVJ_CONFIG.camera.fov,
        pan: SVJ_CONFIG.camera.portrait.pan,
        zoom: SVJ_CONFIG.camera.portrait.zoom,
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
const SMALL_PROP_KINDS = ['mug', 'clock'];

/** Direct hit first, then a couple of rings of sample rays around the
 *  point, so a tea mug is tappable with a fingertip (same forgiveness
 *  the walkable experiences give their small click targets). */
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
// sit and still claim the tap. A hand's width: enough to cover the mug
// standing proud of the desk it rests on, nowhere near enough to let
// something across the room answer through the monitor.
const SMALL_PROP_REACH_M = 0.25;

/** Nearest visible hit under the screen point: the small props get first
 *  refusal at full tolerance, then everything answers as usual.
 *
 *  THAT FIRST REFUSAL IS DEPTH-CHECKED, and it has to be. The tolerance
 *  search only asks whether a small prop is near the finger ON SCREEN,
 *  never whether anything stands in front of it, so an unconditional
 *  `small || everything` let an occluded prop answer through whatever was
 *  covering it. Live here: the mug's proxy sits behind the monitor bezel
 *  from the fixed eye, so taps on the lower bezel opened "The Tea Mug"
 *  instead of "The Dashboard". Same rule and same constant as
 *  www/automan. [[halo-tap-search-needs-a-depth-check]] */
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
 *  registerOutdoorProp). Nearest wins: the mug on the desk resolves as
 *  'mug' before the desk behind it. */
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

// ---- The office's stories ---------------------------------------------------
// Title + two lines for each clickable thing in the office, in the same
// warm host's voice as the rest of the site, free of em-dashes and
// semicolons. Two lines apiece so a second click gives something new.
// This room is a working introduction to Jenn's consulting practice, so
// every prop points back to the value she builds for clients. The facts
// come straight from her public website: she is the founder of Sunnyvale
// Jenn Consulting, a fractional operations consultant who builds what
// founders do not have time to build, with thirty years of operations,
// HR, and program work at Apple, Yahoo, Airbnb, Iterable, Veritas, and
// Intuit behind her. Consulting is the calling this room celebrates: the
// yoga mat and exercise ball are only small nods to her pre-consulting
// past (she taught yoga once), and she and the builder were colleagues.
const PROP_CONTENT = {
    jenn: {
        title: 'Jenn',
        cta: true,   // her own card leads with the link to her website
        lines: [
            'The founder of Sunnyvale Jenn Consulting, caught mid-build. She comes in and builds what founders do not have time to build, and she has been doing the actual work for thirty years.',
            'Operations, HR, and program leadership at Apple, Yahoo, Airbnb, Iterable, Veritas, and Intuit, now in the corner of small business owners. The developer worked alongside her and can confirm the reputation is earned.'
        ]
    },
    desk: {
        title: 'The Desk',
        lines: [
            'Where the actual thing gets built. Jenn does not hand clients a framework and wish them luck, she builds the real SOP, the hiring flow, the system that runs without her in the room.',
            'Nothing on this desk that does not earn its place. She brings the same standard to a client\'s operations, and the clutter never survives the first month.'
        ]
    },
    chair: {
        title: 'The Task Chair',
        lines: [
            'A sensible chair in a soft teal weave, built for long stretches of focused work. Jenn calls that an operating rhythm, and she builds one for every client.',
            'Some afternoons it trades shifts with the exercise ball in the corner. Even the seating here has a documented backup plan, which tells you a lot about the owner.'
        ]
    },
    monitor: {
        title: 'The Dashboard',
        lines: [
            'This week on screen: an HR setup, a hiring playbook, and a payroll system going in right the first time. One checkbox left, and it is not even lunchtime.',
            'The little chart tracks a client\'s hours saved per week. Up and to the right, which is the whole point of bringing in an operations consultant.'
        ]
    },
    laptop: {
        title: 'The Laptop',
        lines: [
            'The travel rig. Jenn does not drop off a deck and walk out, she gets embedded and builds alongside her clients, so this laptop has seen a lot of client desks.',
            'Google Workspace, Slack, payroll, file architecture. The tools a team touches every day, set up the right way the first time so they actually get used.'
        ]
    },
    mug: {
        title: 'The Tea Mug',
        lines: [
            'Green tea, still warm, in company teal. New clients start with a two hour strategy session, and the tea helps the honest questions along.',
            'House rule: the mug never sits on the notebook. Systems people have systems, and Jenn\'s clients inherit the good ones.'
        ]
    },
    yogamat: {
        title: 'The Yoga Mat',
        lines: [
            'A small nod to the years before consulting, when Jenn taught yoga. These days the mat mostly watches her real practice, building calm operations for busy founders. She even helps a yoga teacher training program scale its digital side.',
            'Balance is a transferable skill. She once kept a company steady while it nearly tripled in size, and she builds that same steadiness into every client\'s operations.'
        ]
    },
    swissball: {
        title: 'The Exercise Ball',
        lines: [
            'Part-time chair, full-time balance coach. Jenn builds structure that absorbs growth without wobbling, and this is the desk-side reminder.',
            'A quiet keepsake from her pre-consulting years. Posture, like process, is easier to keep than to fix, and fixing process is her calling.'
        ]
    },
    plant: {
        title: 'The Green Committee',
        lines: [
            'The monstera and the snake plant keep the corners soft. Jenn knows a few things about growing something well, she helped one company grow from 142 people to more than 475.',
            'Watered every Friday, no exceptions, with a calendar reminder handling the remembering. Built once, used forever, which is how she likes her systems.'
        ]
    },
    whiteboard: {
        title: 'The Whiteboard',
        lines: [
            'Her whole process in five lines: find what is actually broken, pick the highest leverage fix, build the real thing, set the rhythm, leave it better than she found it.',
            'The doodle in the corner is a lotus. The rest is a client roadmap, because big ambitious ideas become real tangible things here, with actual steps.'
        ]
    },
    sideboard: {
        title: 'The Sideboard',
        lines: [
            'Well-thumbed operations books, a sunrise print, and a thriving pothos. Jenn once trimmed a supplier list from 140 vendors down to 29, but the plants have nothing to fear.',
            'The pothos trails a little farther over the edge every month. Growth is encouraged in this office, and so is the structure that supports it.'
        ]
    },
    art: {
        title: 'The Wall Art',
        lines: [
            'Two little canvases in the company waters, teal over deep blue. The real logo lives on Jenn\'s own website, one floating button away.',
            'Calm colors for calm work. Jenn takes the chaos out of a founder\'s head and puts it into a system, and the walls set the tone.'
        ]
    },
    window: {
        title: 'The Window',
        lines: [
            'The best screen in the office: the back fence, a couple of trees, and the neighbor\'s place. Birds drop by all day. Give it a minute.',
            'Jenn learned early in her career that operations done right is invisible. The window works the same way, all view and no fuss.'
        ]
    },
    clock: {
        title: 'The Wall Clock',
        lines: [
            'Look closely, it keeps your actual local time. Fitting for this office: Jenn\'s process starts with finding the hour that matters most and telling you exactly where to put it.',
            'Company teal, quiet hands, never late. The operations Jenn builds for her clients are held to the same standard.'
        ]
    },
    rug: {
        title: 'The Rug',
        lines: [
            'A flat-weave rug with one teal border, holding the room together quietly. If your business is held together with hope and a prayer, Jenn is your call.',
            'Soft enough for stretching, plain enough for thinking. Both happen here, usually between client builds.'
        ]
    }
};
let propTick = 0;   // rotates which line a prop shows, no Math.random needed

let dialogReturnFocus = null;

/** Open the office dialog for a clicked prop: its title and a line from
 *  its pair (alternating, so a second click gives something new). Props
 *  flagged cta (Jenn herself) lead with the link to her website, and the
 *  dismiss button steps down to the muted look while the link leads. */
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
    armCard();
    dialogModal.classList.remove('hidden');
    // Focus the CARD, not the link. Landing on the CTA gave the tap that
    // opened this card an already-focused outbound target, made a stray
    // Enter leave the site, and put a screen reader into the action before
    // it had read the story the action belongs to. The container carries
    // tabindex="-1" so it can take focus without joining the tab order.
    const lead = dialogModal.querySelector('.modal-container')
        || dialogModal.querySelector('[data-close]');
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
        openNudgeModal();
        return;
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

/** The every-few-taps invitation: a warm card pointing onward to Jenn's
 *  website (and the builder's contact page), the same low-pressure card
 *  the garden and tire-shop experiences extend partway through. */
function openNudgeModal() {
    if (!nudgeModal) return;
    nudgeOpen = true;
    track('contact-nudge');
    armCard();
    nudgeModal.classList.remove('hidden');
    // The card, not "Visit Sunnyvale Jenn Consulting". Same reasoning as
    // the story card above, and it matters more here: this card arrives
    // uninvited after every fourth story, so its outbound link is the one
    // most likely to be under a finger that was aiming at the room.
    const lead = nudgeModal.querySelector('.modal-container')
        || nudgeModal.querySelector('[data-close]');
    if (lead) lead.focus();
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

/** Wire the outward-facing links from SVJ_CONFIG.site. The Home button
 *  goes to the serving site's root in the same tab (Phase 5 rule: the
 *  marketing pages live at every hosting domain's root), and the floating
 *  logo button opens the featured business's own website in a new tab. */
function applySiteLinks() {
    const site = SVJ_CONFIG.site;
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
        bizBtn.href = site.business.websiteUrl;
        bizBtn.title = `Visit the ${site.business.name} website`;
        bizBtn.setAttribute('aria-label', `Visit the ${site.business.name} website (opens in a new tab)`);
    }
    // The dialog and invitation CTAs carry the same outward link (their
    // hrefs are also baked into the HTML as equivalent fallbacks)
    if (dialogCta) dialogCta.href = site.business.websiteUrl;
    const nudgeSite = document.getElementById('nudge-site');
    if (nudgeSite) nudgeSite.href = site.business.websiteUrl;
    const nudgeContact = document.getElementById('nudge-contact');
    if (nudgeContact) nudgeContact.href = site.builder.contactPath;
}

// ---- Render loop ----------------------------------------------------------

function animate() {
    if (!state.isRunning) return;
    const now = performance.now();
    const deltaTime = Math.min((now - state.lastTime) / 1000, 0.1);
    state.lastTime = now;

    // The day/night pass holds the sky at noon (the cycle is disabled in
    // config) but still paints the fixed-time sky and refreshes the
    // on-demand shadow map, so Jenn's wave and the birds keep their
    // shadows honest. The background pass runs the fence birds (the clouds
    // it would also drift are off: they sit far above what this window can
    // pass, see config), and the interior pass keeps the room's rig
    // balanced.
    updateDayNightCycle(deltaTime);
    updateBackgroundAnimations(deltaTime);
    updateInteriorAmbientLight();
    updateOffice(deltaTime);
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
        console.error('[Office] 3D init failed, falling back to the 2D site:', err);
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
