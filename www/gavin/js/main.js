// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for the bug patrol experience.
 *
 * The first passive SceneXP experience, so this conductor is the smallest
 * one on the site: build the scene, park the camera at its one composed
 * viewpoint, and let the garden do all the moving. There are no movement
 * controls, no collision, and no modals here. The interactions that do
 * exist are featherweight: the welcome overlay (dismissed with a click,
 * tap, or key), the portrait-only pan and
 * zoom row (shared pan part, so phones can see the
 * sides the narrow frame crops and lean in closer), and Mantis Watch,
 * one raycast per tap to see if the visitor spotted one of the two
 * hiding mantises.
 *
 * Future contributors: this file is the template for "living diorama"
 * experiences. If your scene wants walking and clicking instead, start
 * from www/steve/js/main.js, which wires the shared controls.
 */

import { GAVIN_CONFIG } from './config.min.js';
import { getProofOfWork, bufToHex, installCardFocusTrap, shieldOverlayControl } from '../../shared/js/boot-1.0.0.min.js';
import { initPortraitControls, updatePortraitControls, gestureClaimedTap } from '../../shared/js/pan-1.0.0.min.js';
import {
    initScene, handleResize, render, getCamera, getRenderer,
    updateDayNightCycle, removeTestObjects, isTouchDevice
} from '../../shared/js/scene-1.0.0.min.js';
import {
    initStore, updateGarden, getMantisMeshes, celebrateMantisFound
} from './store.min.js';
import { getOutdoorPropMeshes } from '../../shared/js/world-1.0.0.min.js';
import { updateBackgroundAnimations } from '../../shared/js/scenery-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';

// ---- Application state ----------------------------------------------------

const state = {
    isRunning: false,
    isLoaded: false,
    lastTime: 0,
    isMobile: false
};

// DOM references (resolved in init)
let canvas, loadingScreen, blocker, mantisChip;
let dialogModal, dialogTitle, dialogMessage;
let dialogOpen = false;   // one dialog at a time; taps pause while it's up

let cleanupController = null;

// ---- Mantis Watch (the find-me game) --------------------------------------
// Two mantises spawn at random perches every visit (store.js). The visitor's
// only job is Gavin's favorite one: spot them. A tap or click on a mantis
// marks it found; the chip at the bottom keeps score. No crosshair, no
// hover states, no modals: the garden stays a place to watch, with one
// gentle secret to hunt.
const MANTIS_TOTAL = 3;
const foundMantises = new Set();
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
    mantisChip = document.getElementById('mantis-chip');
    dialogModal = document.getElementById('dialog-modal');
    dialogTitle = document.getElementById('dialog-title');
    dialogMessage = document.getElementById('dialog-message');

    if (!canvas) return;

    // Wire the welcome screen's directory link from GAVIN_CONFIG.site, so
    // config stays the
    // single home for these values. An equivalent fallback is baked into
    // the HTML for the no-JS path.
    applySiteLinks();

    // Soft bot deterrent: solve a tiny proof of work before building the scene
    // (or reuse a still-valid one from sessionStorage). Hand the hash to the
    // telemetry layer so it tags every ping.
    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(GAVIN_CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Initializing renderer…', 25);
    initScene(canvas, GAVIN_CONFIG);
    placeCamera();

    updateLoadingStatus('Potting the jasmine…', 50);
    initStore();
    removeTestObjects();

    updateLoadingStatus('Releasing the ladybugs…', 80);
    setupEventListeners();

    updateLoadingStatus('Ready', 100);
    setTimeout(() => {
        loadingScreen.classList.add('hidden');
        state.isLoaded = true;
        document.querySelectorAll('.ui-float').forEach(el => el.classList.add('visible'));
        updateMantisChip();
        if (mantisChip) mantisChip.classList.add('visible');
    }, 400);

    // Mark the start of this visit. Records the input mode so the log can tell
    // desktop visits from touch ones. (Hits are tied together by the PoW hash.)
    track('session-start', { device: state.isMobile ? 'touch' : 'desktop' });
    _sessionStart = Date.now();

    state.isRunning = true;
    state.lastTime = performance.now();
    getRenderer().setAnimationLoop(animate);
}

/** Park the camera at the experience's one composed viewpoint. The garden
 *  provides all the motion; the camera only re-derives on resize.
 *
 *  The composition assumes a landscape frame. three.js FOV is vertical,
 *  so a portrait phone keeps the height but loses both sides. Below an
 *  aspect of 1 this widens to the portrait FOV and dollies the camera
 *  straight back until the composed half-width (the kids and the flanking
 *  pots) fits in frame at the kids' distance. Runs on every resize, so
 *  rotating the phone reframes live. */
function placeCamera() {
    const camera = getCamera();
    const cam = GAVIN_CONFIG.camera;
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
            beginWatching();
        };
        blocker.addEventListener('click', dismiss, { signal });
        blocker.addEventListener('touchend', dismiss, { signal });

        // THE DIRECTORY LINK SITS ON TOP OF ALL OF THAT. The whole overlay is
        // the dismiss surface and `dismiss` calls preventDefault(), which on
        // touch would swallow the synthetic click and leave the link inert.
        // Stop the start events short of it so the anchor follows its href.
        shieldOverlayControl(document.getElementById('explore-link'), { signal });

        document.addEventListener('keydown', (event) => {
            if (event.code === 'Enter' || event.code === 'Space') {
                if (!blocker.classList.contains('hidden')) beginWatching();
            }
        }, { signal });
    }

    // A click or tap on the scene: a spotted mantis first, then any of the
    // garden's storytelling props (openPropDialog). A tap that merely ends
    // a swipe or pinch (see the surface option below) belongs to the
    // gesture, not to a mantis or prop.
    canvas.addEventListener('click', (event) => {
        if (gestureClaimedTap()) return;
        checkSceneTap(event.clientX, event.clientY);
    }, { signal });
    canvas.addEventListener('touchend', (event) => {
        if (gestureClaimedTap()) return;
        const touch = event.changedTouches[0];
        if (touch) checkSceneTap(touch.clientX, touch.clientY);
    }, { signal });

    // The garden dialog's close buttons and backdrop, plus Escape
    if (dialogModal) dialogModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closePropDialog, { signal }));
    document.addEventListener('keydown', (event) => {
        if (event.code === 'Escape' && dialogOpen) closePropDialog();
    }, { signal });

    // Portrait view controls: the frame is composed for landscape, so on
    // a portrait phone the sides stay cropped even after the FOV widen
    // and dolly-back above. The shared part builds a bottom-center row
    // (portrait-only, via CSS): pan arrows that slowly yaw the view
    // across the garden, and a zoom pair that leans in for a closer
    // mantis hunt or widens the whole patio. The Mantis Watch chip,
    // which also lives bottom center, steps up above the row while in
    // portrait (see .mantis-chip in the shared stylesheet). Handing over
    // the canvas as `surface` adds the touch paths: swipe to pan
    // sideways or tilt up and down, pinch to zoom (portrait-only, like
    // the row).
    initPortraitControls({
        getCamera,
        lookAt: GAVIN_CONFIG.camera.lookAt,
        baseFov: GAVIN_CONFIG.camera.portrait.fov,
        // The zoom anchor while landscape. placeCamera composes a different
        // FOV per orientation, so the anchor has to follow it, and it is
        // REQUIRED once alwaysOn is set or a landscape zoom hangs off the
        // portrait FOV and jumps the moment it is touched.
        landscapeFov: GAVIN_CONFIG.camera.fov,
        pan: GAVIN_CONFIG.camera.portrait.pan,
        zoom: GAVIN_CONFIG.camera.portrait.zoom,
        // THE CONTROLS ARE ON AT EVERY ASPECT, as in jamar and sunnyvalejenn.
        // Without this the shared CSS hides the row at every landscape aspect,
        // so a desktop visitor had no on-screen controls at all: the scene
        // answered the keyboard and, since the shared part learned about the
        // mouse, a drag, with nothing on screen to say so.
        alwaysOn: true,
        extraClass: 'always-on',
        surface: canvas,
        onFirstUse: (kind) => track(`portrait-${kind}`),
        signal
    });
}

// ---- Scene taps: Mantis Watch and the storytelling props -------------------

/** True if the object and every ancestor are visible. The day and night
 *  crews toggle visibility, and a hidden ladybug must not answer taps. */
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

/** Nearest visible hit under the screen point. A direct hit counts;
 *  otherwise a couple of rings of sample rays around the point are tried,
 *  so a 9 cm insect is findable with a fingertip (same forgiveness the
 *  walkable experiences give their small click targets). */
function pickSceneHit(clientX, clientY) {
    const camera = getCamera();
    if (!camera) return null;
    const targets = getMantisMeshes().concat(getOutdoorPropMeshes());
    if (!targets.length) return null;
    pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
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

/** Walk up from a hit mesh to the mantis root group (tagged isMantis). */
function getMantisRoot(obj) {
    let o = obj;
    while (o) {
        if (o.userData && o.userData.isMantis) return o;
        o = o.parent;
    }
    return null;
}

/** Walk up from a hit mesh to the nearest prop root (tagged isProp by
 *  registerOutdoorProp). Nearest wins: a ladybug resolves as 'ladybug'
 *  before its ancestor jasmine resolves as 'jasmine'. */
function getPropRoot(obj) {
    let o = obj;
    while (o) {
        if (o.userData && o.userData.isProp) return o;
        o = o.parent;
    }
    return null;
}

function checkSceneTap(clientX, clientY) {
    if (!state.isLoaded || dialogOpen) return;
    const hit = pickSceneHit(clientX, clientY);
    if (!hit) return;

    // A mantis outranks everything: it is the game
    const mantis = getMantisRoot(hit.object);
    if (mantis) {
        if (foundMantises.has(mantis) || foundMantises.size >= MANTIS_TOTAL) return;
        foundMantises.add(mantis);
        celebrateMantisFound(mantis);    // it rears up and waves back
        track('mantis-found', { n: foundMantises.size });
        updateMantisChip();
        if (mantisChip) {
            mantisChip.classList.remove('pulse');
            void mantisChip.offsetWidth;    // reflow so the animation can restart
            mantisChip.classList.add('pulse');
        }
        return;
    }

    const prop = getPropRoot(hit.object);
    if (prop) openPropDialog(prop.userData.propKind);
}

// ---- The garden's stories --------------------------------------------------
// Title + two lines for each clickable thing in the garden, in the same
// warm host's voice as the rest of the site, free of em-dashes and
// semicolons. Two lines apiece so a second click gives something new.
// Recurring characters: Gavin the future entomologist, his patrol, and
// the nature documentaries he can recite from memory.
const PROP_CONTENT = {
    jasmine: {
        title: 'The Confederate Jasmine',
        lines: [
            'The star of the scene, chosen for the spring bug release because the dense leaves make perfect mantis cover. Gavin was right about that. He usually is, about bugs.',
            'In May the whole patio smells like this one plant. The bees file their approval daily.'
        ]
    },
    planter: {
        title: 'The Cedar Planter',
        lines: [
            'Cedar, cubed, and completely trusted. It has hosted every spring release since the tradition began.',
            'Gavin taps the rim twice for luck before releasing anything. The wood has absorbed a great deal of luck.'
        ]
    },
    carton: {
        title: 'The Ladybug Carton',
        lines: [
            'Every spring this little tub rides home from the garden center with about fifteen hundred ladybugs inside. Gavin carries it like treasure, because to him it is.',
            "Release day includes a short opening speech, delivered in Gavin's best David Attenborough voice. Attendance is mandatory for friends and parents."
        ]
    },
    ladybug: {
        title: 'A Ladybug on Patrol',
        lines: [
            'One of this spring\'s release, out on aphid duty. Gavin counts survivors every evening and reports the numbers at dinner.',
            'In the documentaries Sir David calls them ladybirds. Gavin has adopted the term for formal occasions.'
        ]
    },
    bee: {
        title: 'A Working Bee',
        lines: [
            'On the commute between the jasmine and the lavender since sunrise. Gavin scores their landings like an Olympic judge.',
            'Not one of Gavin\'s releases, just a regular who appreciates the garden. The patrol runs an open door policy.'
        ]
    },
    ants: {
        title: 'The Ant Line',
        lines: [
            'The planter highway. Gavin once followed it across the whole yard on his hands and knees to find the nest. Proper fieldwork for a future entomologist.',
            'Same route, every day, rain or shine. Gavin thinks a documentary crew is overdue down here.'
        ]
    },
    spider: {
        title: 'The Orb Weaver',
        lines: [
            'She strung her web in the blackberry trellis and Gavin declared it prime real estate. He checks on her before school.',
            'She has a name. It changes most weeks, but the respect is permanent.'
        ]
    },
    snail: {
        title: 'A Night Snail',
        lines: [
            "The night shift clocks in on the ants' highway at a fraction of the speed and twice the dignity.",
            'Gavin once timed one across the planter rim, whispering commentary the whole way like a nature film. The snail finished eventually.'
        ]
    },
    slug: {
        title: 'A Slug on Rounds',
        lines: [
            "The garden's slowest inspector, out reviewing the pavers while the day crew sleeps.",
            'Gavin respects slugs but maintains a professional distance. Every entomologist has limits, and the limits are slime.'
        ]
    },
    bat: {
        title: 'The Night Fliers',
        lines: [
            'Bats, working the airspace over the yard. They handle pest control on the night shift, no paperwork required.',
            'Gavin can identify them by flight pattern alone. He learned that from a documentary, naturally.'
        ]
    },
    solar: {
        title: 'The Solar Lights',
        lines: [
            'They drink sunlight all day so the patio can glow all night. The fireflies regard them as competition.',
            'Gavin approved them for night operations. Anything that helps you spot a mantis after dark earns its place.'
        ]
    },
    lavender: {
        title: 'The Lavender',
        lines: [
            "The bees' favorite stop on the whole patio. On summer afternoons it hums.",
            'Gavin claims it helps the ladybugs relax. There is no published research on this, yet.'
        ]
    },
    catmint: {
        title: 'The Catmint',
        lines: [
            'Planted for the pollinators, and for one neighborhood cat who visits like he owns the place.',
            'The bees love the little blue wands. The cat loves everything else about it.'
        ]
    },
    blackberry: {
        title: 'The Blackberry Vine',
        lines: [
            'Trellised, potted, and inspected daily. The ripe ones rarely survive an inspection.',
            'Gavin calls the sampling quality control. The evidence disappears with the crime.'
        ]
    },
    fence: {
        title: 'The Cedar Fence',
        lines: [
            'It keeps very little in or out, as the bugs, the birds, and the cat will all confirm. It does catch the evening light beautifully.',
            'The patrol considers everything on this side of it home territory.'
        ]
    },
    trees: {
        title: "The Neighbors' Trees",
        lines: [
            'Beyond the fence and outside patrol jurisdiction, for now. Requests to expand operations have been filed.',
            'Gavin suspects excellent beetles over there. The evidence is circumstantial but the enthusiasm is not.'
        ]
    },
    gavin: {
        title: 'Gavin',
        lines: [
            'The founder of the bug patrol. Eleven years old, future entomologist, releases ladybugs and mantises into these plants every spring and then finds them again, every single one.',
            'He can hold a praying mantis without flinching and recite whole scenes from his favorite nature documentaries. Somewhere out there, David Attenborough would be proud.'
        ]
    },
    friendLeft: {
        title: 'A Founding Patrol Member',
        lines: [
            'Charter member of the bug patrol. Current assignment: pointing at anything that moves.',
            "They spotted last spring's first mantis and have mentioned it roughly once a day since."
        ]
    },
    friendRight: {
        title: "The Patrol's Recordkeeper",
        lines: [
            'Keeper of the official count. Ladybugs spotted, mantises confirmed, bee landings judged.',
            'They maintain the patrol logbook, which is a folded piece of paper of tremendous authority.'
        ]
    }
};
let propTick = 0;   // rotates which line a prop shows, no Math.random needed

let dialogReturnFocus = null;

/** Open the garden dialog for a clicked prop: its title and a line from
 *  its pair (alternating, so a second click gives something new). */
function openPropDialog(kind) {
    const content = PROP_CONTENT[kind];
    if (!content || !dialogModal) return;
    dialogOpen = true;
    track('click-prop', { kind });
    if (dialogTitle) dialogTitle.textContent = content.title;
    if (dialogMessage) dialogMessage.textContent = content.lines[propTick++ % content.lines.length];
    dialogReturnFocus = document.activeElement;
    dialogModal.classList.remove('hidden');
    const dismiss = dialogModal.querySelector('.dialog-primary');
    if (dismiss) dismiss.focus();
}

function closePropDialog() {
    if (!dialogModal) return;
    dialogModal.classList.add('hidden');
    dialogOpen = false;
    const el = dialogReturnFocus;
    dialogReturnFocus = null;
    if (el && document.contains(el)) {
        try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    }
}

/** Keep the score chip current. Complete turns it green and celebratory. */
function updateMantisChip() {
    if (!mantisChip) return;
    const n = foundMantises.size;
    if (n >= MANTIS_TOTAL) {
        mantisChip.textContent = 'You spotted all three mantises! Gavin salutes you.';
        mantisChip.classList.add('complete');
    } else {
        mantisChip.textContent = `Mantis watch: ${n} of ${MANTIS_TOTAL} spotted`;
    }
}

/** Dismiss the welcome overlay and settle in to watch. */
function beginWatching() {
    if (!state.isLoaded || !blocker || blocker.classList.contains('hidden')) return;
    blocker.classList.add('hidden');
    track('begin-watching');
}

/** Wire the outward-facing links from GAVIN_CONFIG.site. There is no
 *  featured business here: the experience honors the builder's son, so the
 *  welcome screen's directory link goes to the serving site's root (Phase 5
 *  rule: the marketing pages live at every hosting domain's root). */
function applySiteLinks() {
    const site = GAVIN_CONFIG.site;
    // The directory link at the foot of the welcome overlay, which replaced
    // the floating Home button. Only the href is wired: its text names
    // SceneXP.com out loud, so unlike the old icon-only button it does not
    // need a title or an aria-label supplied from config, and the markup
    // carries an equivalent href for the no-JS path.
    const explore = document.getElementById('explore-link');
    if (explore) explore.href = site.home.path;
}

// ---- Render loop ----------------------------------------------------------

function animate() {
    if (!state.isRunning) return;
    const now = performance.now();
    const deltaTime = Math.min((now - state.lastTime) / 1000, 0.1);
    state.lastTime = now;

    // Order matters: the day/night pass moves the sun and rewrites the
    // scene lights' intensities, and the garden animates under whatever
    // light the sky decided on.
    updateDayNightCycle(deltaTime);
    updateGarden(deltaTime);
    updateBackgroundAnimations(deltaTime);
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
        console.error('[Garden] 3D init failed, falling back to the 2D site:', err);
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
