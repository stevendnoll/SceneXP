// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for the Mandelbrot experience.
 *
 * A passive "living diorama" conductor, same family as gavin and jamar:
 * build the scene, park the camera at its one composed viewpoint, and
 * let the cosmos do the moving. There are no movement controls and no
 * collision. The interactions that do exist are featherweight: the
 * welcome overlay (dismissed with a click, tap, or key, and brought back
 * with Escape or the help button), the AUTOZOOM row, and one raycast per tap.
 *
 * The autozoom is the headline act: the dive flies itself, and since
 * 2026-09-23 it starts the moment the visitor steps past the welcome
 * screen. This file builds a two-button cluster at the bottom center
 * (reusing the shared .pan-controls shell, though the shared pan part
 * itself is retired here): play/pause and reset. There were direction
 * and speed buttons too, and Steve's QA took them out. Each frame the
 * conductor feeds store.js's INFINITE DIVE at the configured rate,
 * toward one fixed boundary point (config fractal.dive, the seam where
 * the set's two great circles meet). The flight pauses itself at the
 * double-precision floor (which earns its own dialog), whenever a story
 * dialog opens, and when Escape or the help button brings the welcome
 * screen back. The
 * depth chip reports the magnification with a size comparison along the
 * way.
 *
 * THE RINGS ARE A SECOND-VISIT DISCOVERY NOW. The glowing rings that
 * choose a destination live only at the surface, and the dive leaves the
 * surface the moment the welcome screen goes, so a first visit rides the
 * default dive. Reset brings the visitor back up to where the rings are,
 * and the welcome screen and the help card both say so. Steve chose that
 * over holding the surface for a few seconds first (2026-09-23), since a
 * pause with nothing moving is what the automatic start was for.
 *
 * Choosing a destination also has a route that needs no pointer: an
 * off-screen list (the shared proplist part) with one row per ring and one
 * for the help card, which slides into view as soon as anything in it has
 * focus. Until 2026-09-22 the rings answered only a tap, so a keyboard
 * visitor could fly the default dive but never choose where.
 *
 * Unlike the patio and bar dioramas, this scene never calls
 * updateDayNightCycle: there is no day in deep space. The store clears
 * the shared sky at init and owns the lighting from then on.
 *
 * Future contributors: this file is the template for space-set
 * experiences. If your scene wants walking and clicking instead, start
 * from www/interstate/js/main.js, which wires the shared controls.
 */

import { MANDELBROT_CONFIG } from './config.min.js';
import { getProofOfWork, bufToHex, installCardFocusTrap, shieldOverlayControl, installCardScrollReset } from '../../shared/js/boot-1.0.0.min.js';
import {
    initScene, handleResize, render, getCamera, getRenderer,
    removeTestObjects, isTouchDevice
} from '../../shared/js/scene-1.0.0.min.js';
import {
    initStore, updateCosmos, diveBy, getDiveState, resetDive,
    selectDiveTarget, getTouchpointGroups
} from './store.min.js';
import { getOutdoorPropMeshes } from '../../shared/js/world-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';
import { installPropList, propListItems, showPropRows } from '../../shared/js/proplist-1.0.0.min.js';

// ---- Application state ----------------------------------------------------

const state = {
    isRunning: false,
    isLoaded: false,
    lastTime: 0,
    isMobile: false
};

// DOM references (resolved in init)
let canvas, loadingScreen, blocker, depthChip, helpBtn;
let dialogModal, dialogTitle, dialogMessage;
let dialogOpen = false;   // one dialog at a time; taps pause while it's up
let propPanel, propList;  // the off-screen list of places to dive (keyboard route)
let propRowsAccum = 0;    // seconds since the rows last checked the rings
const PROP_ROWS_EVERY = 0.25;

let cleanupController = null;

// Dive bookkeeping: one-time telemetry, the floor dialog, and the chip.
let diveTracked = false;      // track('dive-start') fired
let floorTold = false;        // the double-precision-floor dialog shown
let chipAccum = 0;            // chip refresh throttle (4x per second)
let chipShown = false;

// ---- Autozoom state --------------------------------------------------------
// The dive flies itself, always inward and at one speed: all that is left
// to hold is whether it is flying.
const auto = {
    on: false
};
let autoPlayBtn = null;
let autoRow = null;

// The welcome screen, which Escape can bring back. `welcomed` is whether the
// visitor has ever stepped past it (the first time starts the dive), and
// `resumeOnReturn` is whether the dive was flying when Escape paused it, so
// stepping back in carries on only a flight that was actually under way.
// `welcomeReturn` is what had focus when the screen came back, so stepping
// back in hands it back rather than leaving a keyboard visitor on nothing.
let welcomed = false;
let resumeOnReturn = false;
let welcomeReturn = null;

const ICONS = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5l10 6.5-10 6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5v13M15 5.5v13"/></svg>',
    reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 4.5v5.5h5.5"/><path d="M4.8 15a8 8 0 1 0 1.9-8.3L2.5 10"/></svg>'
};

// ---- Tap picking ----------------------------------------------------------
// One raycast per tap against the registered props (the set itself and
// the touchpoints), with the same forgiving tolerance rings the other
// experiences give their small click targets.
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
    depthChip = document.getElementById('depth-chip');
    helpBtn = document.getElementById('help-btn');
    dialogModal = document.getElementById('dialog-modal');
    dialogTitle = document.getElementById('dialog-title');
    dialogMessage = document.getElementById('dialog-message');
    propPanel = document.getElementById('prop-panel');

    if (!canvas) return;

    // Wire the welcome screen's directory link from MANDELBROT_CONFIG.site,
    // so config stays the
    // single home for these values. An equivalent fallback is baked into
    // the HTML for the no-JS path.
    applySiteLinks();

    // Soft bot deterrent: solve a tiny proof of work before building the scene
    // (or reuse a still-valid one from sessionStorage). Hand the hash to the
    // telemetry layer so it tags every ping.
    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(MANDELBROT_CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Initializing renderer…', 25);
    initScene(canvas, MANDELBROT_CONFIG);
    placeCamera();

    // Let the status above actually paint before the store's synchronous
    // fractal render blocks the main thread for a beat.
    updateLoadingStatus('Computing the Mandelbrot set…', 55);
    await nextFrame();
    initStore();
    removeTestObjects();

    updateLoadingStatus('Scattering the stars…', 85);
    setupEventListeners();

    updateLoadingStatus('Ready', 100);
    setTimeout(() => {
        loadingScreen.classList.add('hidden');
        state.isLoaded = true;
        // THE ROW WAITS FOR THE WELCOME SCREEN (2026-09-23). It used to be
        // revealed here, under the welcome card, where four buttons showed
        // through the dimmed backdrop before the visitor had been let in.
        // beginWatching shows it now, and Escape takes it away again.
    }, 400);

    // Mark the start of this visit. Records the input mode so the log can tell
    // desktop visits from touch ones. (Hits are tied together by the PoW hash.)
    track('session-start', { device: state.isMobile ? 'touch' : 'desktop' });
    _sessionStart = Date.now();

    state.isRunning = true;
    state.lastTime = performance.now();
    getRenderer().setAnimationLoop(animate);
}

/** Resolve on the next animation frame, so a loading-status write gets a
 *  chance to reach the screen before heavy synchronous work starts. */
function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/** Park the camera at the experience's one composed viewpoint. The cosmos
 *  provides all the motion; the camera only re-derives on resize.
 *
 *  The composition assumes a landscape frame. three.js FOV is vertical,
 *  so a portrait phone keeps the height but loses both sides of the set.
 *  Below an aspect of 1 this widens to the portrait FOV and dollies the
 *  camera straight back until the composed half-width fits in frame at
 *  the fractal plane's distance. Runs on every resize, so rotating the
 *  phone reframes live. */
function placeCamera() {
    const camera = getCamera();
    const cam = MANDELBROT_CONFIG.camera;
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
    // Every card back to the top when it opens. Reported from QA on this
    // scene and true of twelve others: a card closed halfway down came back
    // halfway down. See the note in the shared boot part for why this is an
    // observer rather than a line in each open() function.
    installCardScrollReset({ signal });

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

        // NOT ON A HELD KEY. Enter on the help button brings the screen back
        // on its keydown, so a key still held down would repeat straight
        // through it and step back in before the visitor had seen it.
        document.addEventListener('keydown', (event) => {
            if (event.repeat) return;
            if (event.code === 'Enter' || event.code === 'Space') {
                if (welcomeShown()) beginWatching();
            }
        }, { signal });
    }

    // A click or tap on the scene: a touchpoint launches the dive, the
    // set tells its story (openPropDialog). Touch devices fire touchend
    // and then a SYNTHETIC CLICK for the same tap, and taps here have
    // side effects beyond dialogs (a ring tap starts the flight), so
    // the ghost must not run the handler twice: on the iPhone the late
    // click landed after the rings had hidden, fell through to the set,
    // and opened the help dialog over a freshly launched dive.
    // preventDefault on touchend cancels the synthetic click, and the
    // timestamp guard backs that up where the default is not cancelable.
    let lastTouchTapAt = 0;
    canvas.addEventListener('click', (event) => {
        if (performance.now() - lastTouchTapAt < 800) return;
        checkSceneTap(event.clientX, event.clientY);
    }, { signal });
    canvas.addEventListener('touchend', (event) => {
        lastTouchTapAt = performance.now();
        if (event.cancelable) event.preventDefault();
        const touch = event.changedTouches[0];
        if (touch) checkSceneTap(touch.clientX, touch.clientY);
    }, { passive: false, signal });

    // The dialog's close buttons and backdrop
    if (dialogModal) dialogModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closePropDialog, { signal }));

    // ESCAPE, IN ORDER OF WHAT IT IS CLOSEST TO. An open story card closes
    // and nothing else happens, as it always has. Otherwise it toggles the
    // welcome screen: out in the scene it pauses the dive and brings the
    // card back (Steve, 2026-09-23), and on the card it steps back in. The
    // list of places to dive answers its own Escape and stops the key there,
    // so putting that list away never also pauses anything.
    document.addEventListener('keydown', (event) => {
        if (event.code !== 'Escape') return;
        if (dialogOpen) {
            closePropDialog();
            return;
        }
        if (!state.isLoaded) return;
        if (welcomeShown()) beginWatching();
        else returnToWelcome('escape');
    }, { signal });

    // THE HELP BUTTON IS ESCAPE FOR EVERYBODY WITHOUT A KEYBOARD (Steve,
    // 2026-09-24). On a phone there was no way back to the welcome screen
    // once the dive began, and it is the one place the whole scene is
    // explained. It pauses the dive and brings the screen back, and stepping
    // back in resumes a flight that was flying, exactly as Escape does.
    if (helpBtn) helpBtn.addEventListener('click', () => returnToWelcome('help'), { signal });

    // The autozoom cluster: [play/pause] [reset], bottom center at every
    // aspect. The container reuses the shared .pan-controls shell classes,
    // so the fade-in, positioning, and button look all come along for
    // free, and a row of two centers itself exactly as a row of four did.
    initAutozoomControls(signal);

    setupPropList(signal);
}

// ---- Autozoom --------------------------------------------------------------

/** One circle button in the autozoom row. */
function makeAutoButton(label, html, onPress, signal) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pan-btn';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = html;
    btn.addEventListener('click', onPress, { signal });
    return btn;
}

/** Build the row and wire its two buttons. */
function initAutozoomControls(signal) {
    const container = document.createElement('div');
    container.className = 'ui-float pan-controls always-on autozoom-controls';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Auto zoom controls');

    autoPlayBtn = makeAutoButton('Start the auto zoom', ICONS.play, togglePlaying, signal);
    const resetBtn = makeAutoButton(
        'Reset to the starting view', ICONS.reset, resetScene, signal);

    container.appendChild(autoPlayBtn);
    container.appendChild(resetBtn);
    document.body.appendChild(container);
    autoRow = container;
    syncAutozoomButtons();
}

/** Reflect the autozoom state onto the play button (icon, label, color). */
function syncAutozoomButtons() {
    if (!autoPlayBtn) return;
    autoPlayBtn.innerHTML = auto.on ? ICONS.pause : ICONS.play;
    const playLabel = auto.on ? 'Pause the auto zoom' : 'Start the auto zoom';
    autoPlayBtn.title = playLabel;
    autoPlayBtn.setAttribute('aria-label', playLabel);
    autoPlayBtn.setAttribute('aria-pressed', auto.on ? 'true' : 'false');
    autoPlayBtn.classList.toggle('engaged', auto.on);
}

function setPlaying(on) {
    if (auto.on === on) return;
    auto.on = on;
    if (on && !diveTracked) {
        diveTracked = true;
        track('dive-start');
    }
    track(on ? 'autozoom-on' : 'autozoom-off');
    syncAutozoomButtons();
}

function togglePlaying() {
    setPlaying(!auto.on);
}

/** The reset button: back to the initial-load view in one tap. The
 *  flight pauses and the dive snaps to magnification 1, which is where
 *  the glowing rings are, so this is also how a visitor gets to choose a
 *  new destination. The chosen touchpoint is kept, since the reset is
 *  about depth, not destination. It is the only way back up since the
 *  direction button went (2026-09-23). */
function resetScene() {
    setPlaying(false);
    resetDive();
    track('dive-reset');
    syncAutozoomButtons();
}

/** Advance the flight. The store's own gates pace it against rendered
 *  content; this only decides when the flight is OVER: the floor going
 *  in (the floor dialog takes the stage), the surface coming out. */
function updateAutozoom(deltaTime) {
    if (!auto.on) {
        // A paused dive hovering just off the surface drifts the rest
        // of the way home. The touchpoint rings live only at
        // magnification 1, so a pause moments after launch (a dialog,
        // a quick tap of the play button) must never strand the scene
        // ring-less an inch above them; there is nothing to see in the
        // first half doubling anyway.
        const s = getDiveState();
        if (s.z > 0 && s.z < 0.5) diveBy(-0.8 * deltaTime);
        return;
    }
    diveBy(MANDELBROT_CONFIG.autozoom.speed * deltaTime);
    if (getDiveState().atFloor) setPlaying(false);
}

// ---- The depth chip --------------------------------------------------------
// A quiet readout at the bottom of the screen: how far down the dive is,
// with a size comparison for company. The comparison imagines the CURRENT
// view filling the visitor's screen (about 35 cm) and reports how wide
// the WHOLE set would be at that scale: 0.35 * 2^Z meters.

const SCALE_MILESTONES = [
    { z: 5, text: 'wider than your room' },           // ~11 m
    { z: 8, text: 'the length of a city block' },     // ~90 m
    { z: 10, text: 'the size of a stadium' },         // ~360 m
    { z: 13, text: 'the width of a small town' },     // ~2.9 km
    { z: 16, text: 'the length of Manhattan' },       // ~23 km
    { z: 19, text: 'the width of a mountain range' }, // ~184 km
    { z: 22, text: 'the length of California' },      // ~1,470 km
    { z: 25, text: 'about the width of the Earth' },  // ~11,700 km
    { z: 30, text: 'out at the distance to the Moon' }, // ~376,000 km
    { z: 32, text: 'wider than the Sun' },            // ~1.5M km
    { z: 38, text: 'most of the way to the Sun' }     // ~96M km
];

/** '2,048' below a million, then '3.2 million' / '412 billion'. */
function humanMag(mag) {
    if (mag < 1e6) return Math.round(mag).toLocaleString('en-US');
    if (mag < 1e9) return `${(mag / 1e6).toPrecision(3)} million`;
    if (mag < 1e12) return `${(mag / 1e9).toPrecision(3)} billion`;
    return `${(mag / 1e12).toPrecision(3)} trillion`;
}

/** Refresh the chip a few times a second while the dive is away from the
 *  surface; hide it (and reset the milestone) back at the top. */
function updateDepthChip(deltaTime) {
    if (!depthChip) return;
    chipAccum += deltaTime;
    if (chipAccum < 0.25) return;
    chipAccum = 0;

    const s = getDiveState();
    // Out of the way while the welcome screen is back: the chip sits above
    // the card's backdrop, and a readout over a pause screen is clutter.
    if (s.z < 0.05 || welcomeShown()) {
        if (chipShown) {
            depthChip.classList.remove('visible');
            chipShown = false;
        }
        return;
    }

    let milestone = null;
    for (const m of SCALE_MILESTONES) {
        if (s.z >= m.z) milestone = m.text;
    }
    const text = milestone
        ? `Magnification ${humanMag(s.magnification)} · the whole set would now be ${milestone}`
        : `Magnification ${humanMag(s.magnification)}`;
    if (depthChip.textContent !== text) depthChip.textContent = text;
    if (!chipShown) {
        depthChip.classList.add('visible');
        chipShown = true;
    }

    // The bottom that is not there: reached once per visit, told once.
    if (s.atFloor && !floorTold && !dialogOpen) {
        floorTold = true;
        track('dive-floor');
        openPropDialog('divefloor');
    }
}

// ---- Scene taps: the cosmos tells its stories ------------------------------

/** True if the object and every ancestor are visible. */
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
 *  so a touchpoint ring is findable with a fingertip (same forgiveness the
 *  other experiences give their small click targets). */
function pickSceneHit(clientX, clientY, targetsOverride) {
    const camera = getCamera();
    if (!camera) return null;
    const targets = targetsOverride || getOutdoorPropMeshes();
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

/** Walk up from a hit mesh to the nearest prop root (tagged isProp by
 *  registerOutdoorProp). */
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
    // The touchpoint rings get first claim on the tap: they are small
    // and float just in front of the monument, so a dedicated pass
    // gives them the full tap tolerance before the monument itself can
    // answer. (They only exist at the surface; while hidden, the
    // visibility chain keeps them out of the raycast.)
    const hit = pickSceneHit(clientX, clientY, getTouchpointGroups()) ||
        pickSceneHit(clientX, clientY);
    if (!hit) return;
    const prop = getPropRoot(hit.object);
    if (!prop) return;
    if (prop.userData.propKind === 'touchpoint') {
        launchToward(prop.userData.targetIndex);
        return;
    }
    openPropDialog(prop.userData.propKind);
}

/** Aim the dive at a ring's target and set off. Choosing a destination IS
 *  the intention to go: the dive begins on its own (inward, at the current
 *  speed), with the play button left for pausing and the return trip.
 *  Choosing the already-selected ring launches too, so the very first tap
 *  a visitor tries always does something. */
function launchToward(index) {
    const label = selectDiveTarget(index);
    if (label) track('dive-target', { label });
    setPlaying(true);
    syncAutozoomButtons();
}

// ---- Places to dive, without a pointer -------------------------------------

/** Fill the off-screen list: the help card first (the set's own card, so
 *  it carries the same title), then one row per ring, built from the same
 *  target list the rings are. The divefloor card is not a prop, so it gets
 *  no row. */
function setupPropList(signal) {
    propList = document.getElementById('prop-list');
    if (!propList) return;
    const kinds = getOutdoorPropMeshes()
        .map(g => g && g.userData && g.userData.propKind)
        .filter(Boolean);
    const rings = getTouchpointGroups().map((holder, i) => {
        const t = MANDELBROT_CONFIG.fractal.targets[i];
        // "Dive to the North Dendrite", not "Dive to The North Dendrite".
        return t && { id: `ring-${i}`, label: `Dive to ${t.label.replace(/^The /, 'the ')}` };
    }).filter(Boolean);
    installPropList({
        list: propList,
        items: propListItems(PROP_CONTENT, kinds, { after: rings }),
        onChoose: chooseFromList,
        signal
    });
    syncPropRows();
}

/** The ring a row names, or null for a row that opens a card. */
function ringIndexOf(id) {
    const m = /^ring-(\d+)$/.exec(id || '');
    return m ? Number(m[1]) : null;
}

/** True while a tap could reach this row's thing: the rings sleep the
 *  moment the dive leaves the surface, and a hidden ring answers no tap. */
function rowIsShown(id) {
    const ring = ringIndexOf(id);
    if (ring !== null) {
        const holder = getTouchpointGroups()[ring];
        return Boolean(holder) && chainVisible(holder);
    }
    return getOutdoorPropMeshes().some(g =>
        g && g.userData && g.userData.propKind === id && chainVisible(g));
}

function syncPropRows() {
    if (propList) showPropRows(propList, rowIsShown);
}

/** A row was chosen: do exactly what tapping that thing would. */
function chooseFromList(id) {
    if (!state.isLoaded || dialogOpen) return;
    // Not while the welcome card is up. The panel is `hidden` until then, so
    // nothing should reach this, but a card opening over the welcome card
    // would be a worse failure than a row that does nothing.
    if (welcomeShown()) return;
    if (!rowIsShown(id)) return;
    const ring = ringIndexOf(id);
    if (ring === null) {
        openPropDialog(id);
        return;
    }
    launchToward(ring);
    // FOCUS GOES TO PAUSE. The rings, and so every ring row, sleep a frame
    // from now, which would drop focus from the row just chosen. The pause
    // button is the next thing anybody watching a dive wants, and leaving
    // the panel lets it slide away so the dive has the whole frame.
    if (autoPlayBtn) autoPlayBtn.focus();
}

// ---- The cosmos's stories --------------------------------------------------
// Title + two lines for each clickable thing in the scene, in the same
// warm host's voice as the rest of the site, free of em-dashes and
// semicolons. Two lines apiece so a second click gives something new.
const PROP_CONTENT = {
    // Tapping the set itself opens the HELP menu: the set is the first
    // thing a curious visitor taps, so it explains the whole scene. The
    // two lines alternate per tap, together covering every control. (The ?
    // button in the corner opens the welcome screen, not this card: that is
    // the screen that sets the scene, and Steve asked for it.)
    mandelbrot: {
        title: 'How to Explore',
        lines: [
            'The dive flies itself, deeper and deeper into the burning edge, and the detail never runs out. Press the circular arrow to return to the surface, then tap one of the glowing rings and the dive begins there instead.',
            'The buttons below steer the flight. Play pauses and resumes, and the circular arrow returns you to the very start, where the glowing rings wait to be chosen. The question mark in the corner, or Escape, pauses the dive and brings back the welcome screen.'
        ]
    },
    // Not a clickable prop: shown once by updateDepthChip when the dive
    // reaches the double-precision floor.
    divefloor: {
        title: 'The Bottom That Is Not There',
        lines: [
            'You are floating hundreds of billions of times deeper than where you began. This is where a computer\'s numbers run out of digits, not where the set runs out of edge. Below this floor the boundary carries on exactly as it has, forever. The circular arrow below brings you back to the surface.',
            'Benoit Mandelbrot saw the first rough printout of this shape in 1980 and asked for more detail. Every zoom since has ended the same way, with someone asking for more detail. The circular arrow below brings you back to the surface whenever you are ready.'
        ]
    }
};
let propTick = 0;   // rotates which line a prop shows, no Math.random needed

let dialogReturnFocus = null;

/** Open the dialog for a clicked prop: its title and a line from its
 *  pair (alternating, so a second click gives something new). */
function openPropDialog(kind) {
    const content = PROP_CONTENT[kind];
    if (!content || !dialogModal) return;
    // A story on stage deserves a still frame: the flight pauses and
    // stays paused (resuming is one tap away).
    setPlaying(false);
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

/** True while the welcome overlay is on screen. */
function welcomeShown() {
    return Boolean(blocker) && !blocker.classList.contains('hidden');
}

/** Show or hide the autozoom row and the help button. They follow the
 *  welcome screen rather than the page load: nothing to press until the
 *  visitor is in, and no help button over the help it would open. */
function setChromeVisible(on) {
    if (autoRow) autoRow.classList.toggle('visible', on);
    if (helpBtn) helpBtn.classList.toggle('visible', on);
}

/** Dismiss the welcome overlay and step into the scene.
 *
 *  THE FIRST TIME, THE DIVE STARTS BY ITSELF (Steve, 2026-09-23), toward
 *  the default destination, exactly as a first press of play would. It
 *  used to wait for play, and the welcome screen stepped aside onto a
 *  still picture with four buttons under it. After an Escape, the dive
 *  resumes only if it was flying when Escape paused it. */
function beginWatching() {
    if (!state.isLoaded || !welcomeShown()) return;
    blocker.classList.add('hidden');
    // The list of places to dive becomes a tab stop only now: while the
    // welcome card was up it would have been one behind it.
    if (propPanel) propPanel.hidden = false;
    setChromeVisible(true);
    handFocusBack();
    if (!welcomed) {
        welcomed = true;
        track('begin-watching');
        setPlaying(true);
    } else {
        track('resume', { flying: resumeOnReturn ? 1 : 0 });
        if (resumeOnReturn) setPlaying(true);
    }
    resumeOnReturn = false;
}

/** Escape or the help button out in the scene: pause the dive and bring the
 *  welcome screen back. `how` ('escape' or 'help') goes on the pause event.
 *
 *  The row, the help button and the list of places to dive go with the
 *  scene, so nothing behind the card is a tab stop.
 *
 *  A BUTTON THAT HIDES ITSELF MUST HAND FOCUS ON. The help button vanishes
 *  under the visitor's press, so focus goes to the welcome screen (the way the
 *  garden's ? button does), where a screen reader reads it and Enter, Space
 *  or Escape steps back in. What had focus is remembered and handed back on
 *  the way out. It used to be dropped instead, which left a keyboard visitor
 *  on nothing once they stepped back in. */
function returnToWelcome(how) {
    if (!state.isLoaded || !blocker || welcomeShown()) return;
    resumeOnReturn = auto.on;
    setPlaying(false);
    track('pause', { how });
    const el = document.activeElement;
    welcomeReturn = el && el !== document.body && el !== blocker ? el : null;
    blocker.classList.remove('hidden');
    if (propPanel) propPanel.hidden = true;
    setChromeVisible(false);
    try {
        blocker.focus({ preventScroll: true });
    } catch (e) { /* not focusable */ }
    if (document.activeElement !== blocker && el && typeof el.blur === 'function') el.blur();
}

/** Stepping back in: focus goes back where it was before the welcome screen
 *  came up. If that is gone (a ring row whose ring went to sleep), it is
 *  dropped rather than left on the welcome screen that has just hidden. */
function handFocusBack() {
    const el = welcomeReturn;
    welcomeReturn = null;
    if (el && document.contains(el)) {
        try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    }
    if (document.activeElement === blocker && typeof blocker.blur === 'function') blocker.blur();
}

/** Wire the outward-facing links from MANDELBROT_CONFIG.site. There is no
 *  featured business here: the experience honors Benoit Mandelbrot, so the
 *  welcome screen's directory link goes to the serving site's root (Phase 5
 *  rule: the marketing pages live at every hosting domain's root). */
function applySiteLinks() {
    const site = MANDELBROT_CONFIG.site;
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

    // No day/night pass here on purpose: the store owns the lighting.
    updateAutozoom(deltaTime);
    updateCosmos(deltaTime);
    updateDepthChip(deltaTime);
    // The rings sleep and wake inside updateCosmos, and their rows follow.
    propRowsAccum += deltaTime;
    if (propRowsAccum >= PROP_ROWS_EVERY) {
        propRowsAccum = 0;
        syncPropRows();
    }

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
    // maxDive: the deepest point reached this visit, in doublings of
    // magnification, so the log can tell lookers from divers.
    trackFinal('session-end', {
        seconds: Math.round((Date.now() - _sessionStart) / 1000),
        maxDive: Math.round(getDiveState().maxZ * 10) / 10
    });
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
        console.error('[Cosmos] 3D init failed, falling back to the 2D site:', err);
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
