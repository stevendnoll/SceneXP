// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for the Mandelbrot experience.
 *
 * A passive "living diorama" conductor, same family as gavin and jamar:
 * build the scene, park the camera at its one composed viewpoint, and
 * let the cosmos do the moving. There are no movement controls and no
 * collision. The interactions that do exist are featherweight: the
 * welcome overlay (dismissed with a click, tap, or key), the floating
 * Home button, the AUTOZOOM row, and one raycast per tap.
 *
 * The autozoom is the headline act: the dive flies itself. This file
 * builds a three-button cluster at the bottom center (reusing the
 * shared .pan-controls shell, though the shared pan part itself is
 * retired here): a direction toggle (dive in / surface out), a
 * play/pause toggle, and a speed button cycling the configured rates.
 * Each frame the conductor feeds store.js's INFINITE DIVE at the
 * chosen rate, toward one fixed boundary point (config fractal.dive,
 * the seam where the set's two great circles meet). The flight pauses
 * itself at the double-precision floor (which earns its own dialog),
 * on resurfacing, and whenever a story dialog opens. The depth chip
 * reports the magnification with a size comparison along the way.
 *
 * Unlike the patio and bar dioramas, this scene never calls
 * updateDayNightCycle: there is no day in deep space. The store clears
 * the shared sky at init and owns the lighting from then on.
 *
 * Future contributors: this file is the template for space-set
 * experiences. If your scene wants walking and clicking instead, start
 * from www/steve/js/main.js, which wires the shared controls.
 */

import { MANDELBROT_CONFIG } from './config.min.js';
import { getProofOfWork, bufToHex } from '../../shared/js/boot-1.0.0.min.js';
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

// ---- Application state ----------------------------------------------------

const state = {
    isRunning: false,
    isLoaded: false,
    lastTime: 0,
    isMobile: false
};

// DOM references (resolved in init)
let canvas, loadingScreen, blocker, depthChip;
let dialogModal, dialogTitle, dialogMessage;
let dialogOpen = false;   // one dialog at a time; taps pause while it's up

let cleanupController = null;

// Dive bookkeeping: one-time telemetry, the floor dialog, and the chip.
let diveTracked = false;      // track('dive-start') fired
let floorTold = false;        // the double-precision-floor dialog shown
let chipAccum = 0;            // chip refresh throttle (4x per second)
let chipShown = false;

// ---- Autozoom state --------------------------------------------------------
// The dive flies itself: direction (+1 dives in, -1 surfaces out), a
// play/pause flag, and an index into the configured speed cycle.
const auto = {
    on: false,
    dir: 1,
    speedIndex: MANDELBROT_CONFIG.autozoom.defaultIndex
};
let autoPlayBtn = null;
let autoDirBtn = null;
let autoSpeedBtn = null;

const ICONS = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5l10 6.5-10 6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5v13M15 5.5v13"/></svg>',
    dirIn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    dirOut: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
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
    dialogModal = document.getElementById('dialog-modal');
    dialogTitle = document.getElementById('dialog-title');
    dialogMessage = document.getElementById('dialog-message');

    if (!canvas) return;

    // Wire the Home button from MANDELBROT_CONFIG.site, so config stays the
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
        document.addEventListener('keydown', (event) => {
            if (event.code === 'Enter' || event.code === 'Space') {
                if (!blocker.classList.contains('hidden')) beginWatching();
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

    // The dialog's close buttons and backdrop, plus Escape
    if (dialogModal) dialogModal.querySelectorAll('[data-close]').forEach(el =>
        el.addEventListener('click', closePropDialog, { signal }));
    document.addEventListener('keydown', (event) => {
        if (event.code === 'Escape' && dialogOpen) closePropDialog();
    }, { signal });

    // The autozoom cluster: [direction] [play/pause] [speed], bottom
    // center at every aspect. The container reuses the shared
    // .pan-controls shell classes, so the load fade-in, positioning,
    // and button look all come along for free.
    initAutozoomControls(signal);
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

/** Build the row and wire the three toggles. */
function initAutozoomControls(signal) {
    const container = document.createElement('div');
    container.className = 'ui-float pan-controls always-on autozoom-controls';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Auto zoom controls');

    autoDirBtn = makeAutoButton('Zoom direction', ICONS.dirIn, toggleDirection, signal);
    autoPlayBtn = makeAutoButton('Start the auto zoom', ICONS.play, togglePlaying, signal);
    autoSpeedBtn = makeAutoButton('Zoom speed', '', cycleSpeed, signal);
    autoSpeedBtn.classList.add('autozoom-speed');
    const resetBtn = makeAutoButton(
        'Reset to the starting view', ICONS.reset, resetScene, signal);

    container.appendChild(autoDirBtn);
    container.appendChild(autoPlayBtn);
    container.appendChild(autoSpeedBtn);
    container.appendChild(resetBtn);
    document.body.appendChild(container);
    syncAutozoomButtons();
}

/** Reflect the autozoom state onto the buttons (icons, labels, colors). */
function syncAutozoomButtons() {
    if (!autoPlayBtn) return;
    autoPlayBtn.innerHTML = auto.on ? ICONS.pause : ICONS.play;
    const playLabel = auto.on ? 'Pause the auto zoom' : 'Start the auto zoom';
    autoPlayBtn.title = playLabel;
    autoPlayBtn.setAttribute('aria-label', playLabel);
    autoPlayBtn.setAttribute('aria-pressed', auto.on ? 'true' : 'false');
    autoPlayBtn.classList.toggle('engaged', auto.on);

    autoDirBtn.innerHTML = auto.dir > 0 ? ICONS.dirIn : ICONS.dirOut;
    const dirLabel = auto.dir > 0
        ? 'Zoom direction: diving in. Tap to surface instead.'
        : 'Zoom direction: surfacing out. Tap to dive instead.';
    autoDirBtn.title = dirLabel;
    autoDirBtn.setAttribute('aria-label', dirLabel);

    const speed = MANDELBROT_CONFIG.autozoom.speeds[auto.speedIndex];
    autoSpeedBtn.textContent = `${speed}×`;
    const speedLabel = `Zoom speed ${speed}x. Tap to change.`;
    autoSpeedBtn.title = speedLabel;
    autoSpeedBtn.setAttribute('aria-label', speedLabel);
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

function toggleDirection() {
    auto.dir = -auto.dir;
    track('autozoom-direction');
    syncAutozoomButtons();
}

function cycleSpeed() {
    auto.speedIndex = (auto.speedIndex + 1) % MANDELBROT_CONFIG.autozoom.speeds.length;
    track('autozoom-speed');
    syncAutozoomButtons();
}

/** The reset button: back to the initial-load view in one tap. The
 *  flight pauses, the direction re-arms inward (ready for a fresh
 *  dive), and the dive snaps to magnification 1; the chosen touchpoint
 *  is kept, since the reset is about depth, not destination. */
function resetScene() {
    setPlaying(false);
    auto.dir = 1;
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
    diveBy(auto.dir * MANDELBROT_CONFIG.autozoom.speeds[auto.speedIndex] * deltaTime);
    const s = getDiveState();
    if (auto.dir > 0 && s.atFloor) setPlaying(false);
    if (auto.dir < 0 && s.z <= 0.02 && !s.diving) setPlaying(false);
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
    if (s.z < 0.05) {
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
        const label = selectDiveTarget(prop.userData.targetIndex);
        if (label) track('dive-target', { label });
        // Choosing a destination IS the intention to go: the dive
        // begins on its own (inward, at the current speed), with the
        // play button left for pausing and the return trip. Tapping
        // the already-selected ring launches too, so the very first
        // tap a visitor tries always does something.
        auto.dir = 1;
        setPlaying(true);
        syncAutozoomButtons();
        return;
    }
    openPropDialog(prop.userData.propKind);
}

// ---- The cosmos's stories --------------------------------------------------
// Title + two lines for each clickable thing in the scene, in the same
// warm host's voice as the rest of the site, free of em-dashes and
// semicolons. Two lines apiece so a second click gives something new.
const PROP_CONTENT = {
    // Tapping the set itself opens the HELP menu: the set is the first
    // thing a curious visitor taps, so it explains the whole scene. The
    // two lines alternate per tap, together covering every control.
    mandelbrot: {
        title: 'How to Explore',
        lines: [
            'Tap one of the glowing rings and the dive begins there on its own, flying deeper and deeper into the burning edge. The detail never runs out.',
            'The buttons below steer the flight. The plus and minus set the direction, in toward the edge or back out to the surface. Play pauses and resumes, the number changes the speed, and the circular arrow returns you to the very start.'
        ]
    },
    // Not a clickable prop: shown once by updateDepthChip when the dive
    // reaches the double-precision floor.
    divefloor: {
        title: 'The Bottom That Is Not There',
        lines: [
            'You are floating hundreds of billions of times deeper than where you began. This is where a computer\'s numbers run out of digits, not where the set runs out of edge. Below this floor the boundary carries on exactly as it has, forever.',
            'Benoit Mandelbrot saw the first rough printout of this shape in 1980 and asked for more detail. Every zoom since has ended the same way, with someone asking for more detail.'
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

/** Dismiss the welcome overlay and settle in to float. */
function beginWatching() {
    if (!state.isLoaded || !blocker || blocker.classList.contains('hidden')) return;
    blocker.classList.add('hidden');
    track('begin-watching');
}

/** Wire the outward-facing links from MANDELBROT_CONFIG.site. There is no
 *  featured business here: the experience honors Benoit Mandelbrot, so the
 *  Home button goes to the serving site's root in the same tab (Phase 5
 *  rule: the marketing pages live at every hosting domain's root). */
function applySiteLinks() {
    const site = MANDELBROT_CONFIG.site;
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

    // No day/night pass here on purpose: the store owns the lighting.
    updateAutozoom(deltaTime);
    updateCosmos(deltaTime);
    updateDepthChip(deltaTime);

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
