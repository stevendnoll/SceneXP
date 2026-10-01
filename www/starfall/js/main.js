// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for Starfall.
 *
 * A spiral galaxy of a few hundred thousand stars, every one of them placed
 * on the graphics card each frame (galaxy.js). The galaxy turns slowly on its
 * own, and the visitor's part is to turn the view: a drag (or a finger, or
 * the arrow keys) carries the camera around the core, so the spiral can be
 * seen face-on, edge-on, from below, and everywhere between (view.js). A
 * flick keeps turning for a moment after it lets go.
 *
 * SceneXP's first scene on three.js's WebGPU renderer. The page loads
 * ../lib/three/r186/three.webgpu.min.js, which sets the global THREE with
 * WebGPURenderer and the TSL functions on it. Where the browser has no
 * WebGPU, the same renderer falls back to WebGL 2 by itself, with fewer
 * stars. Only a browser with neither goes to the 2D site.
 *
 * Turning replaced stirring on 2026-10-01. The first version let a press pull
 * the stars about like a gravity well, with a comet button for the keyboard,
 * and Steve's first look said it did not feel right: what this scene wants is
 * to be looked at from every side.
 */

import { STARFALL_CONFIG } from './config.min.js';
import { createGalaxy } from './galaxy.min.js';
import { dragView, stepView, fitDistance, cameraPosition, clampElevation } from './view.min.js';
import { getProofOfWork, bufToHex, shieldOverlayControl } from '../../shared/js/boot-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';

const CONFIG = STARFALL_CONFIG;

const state = {
    isLoaded: false,
    isRunning: false,
    isMobile: false,
    reducedMotion: false,
    backend: null,          // 'webgpu' or 'webgl', once the renderer has started
    starCount: 0,
    lastTime: 0
};

let canvas = null;
let renderer = null;
let scene = null;
let camera = null;
let galaxy = null;
let blocker = null;
let helpBtn = null;
let cleanupController = null;

let welcomed = false;
let welcomeReturn = null;

// Where the camera is on its sphere, and the spin a flick left it with.
const orbit = { azimuth: CONFIG.view.azimuth, elevation: CONFIG.view.elevation };
let spin = { azimuth: 0, elevation: 0 };
// The drag in progress, if any. One pointer turns the view at a time.
const drag = { pointerId: null, x: 0, y: 0, t: 0, turns: 0 };
// Arrow keys held down, as -1, 0 or +1 on each axis.
const keys = { left: false, right: false, up: false, down: false };

// ---- Initialization -------------------------------------------------------

function detectMobile() {
    if (typeof window === 'undefined') return false;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return Boolean(coarse) || Math.min(window.innerWidth, window.innerHeight) < 600;
}

function prefersReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** How many stars to draw, once it is known what is drawing them. */
export function starCountFor(backend, mobile, stars = CONFIG.stars) {
    if (backend === 'webgpu') return mobile ? stars.webgpuMobile : stars.webgpu;
    return mobile ? stars.webglMobile : stars.webgl;
}

async function init() {
    canvas = document.getElementById('game-canvas');
    blocker = document.getElementById('blocker');
    helpBtn = document.getElementById('help-btn');
    if (!canvas || typeof THREE === 'undefined') return;

    state.isMobile = detectMobile();
    state.reducedMotion = prefersReducedMotion();
    setMobile(state.isMobile);
    applySiteLinks();

    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Starting the graphics card…', 30);
    renderer = new THREE.WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    await renderer.init();
    state.backend = renderer.backend && renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl';
    state.starCount = starCountFor(state.backend, state.isMobile);
    const ceiling = state.isMobile ? CONFIG.maxPixelRatio.mobile : CONFIG.maxPixelRatio.desktop;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ceiling));
    renderer.setSize(window.innerWidth, window.innerHeight);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.look.background);
    camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, 0.5, 2000);
    placeCamera();

    updateLoadingStatus(`Placing ${formatCount(state.starCount)} stars…`, 55);
    galaxy = createGalaxy({ count: state.starCount, config: CONFIG, reducedMotion: state.reducedMotion });
    scene.add(galaxy.object);

    // Compile the shaders behind the loading screen rather than on the first
    // visible frame, where the hitch would be the visitor's first impression.
    updateLoadingStatus('Lighting the stars…', 80);
    await renderer.compileAsync(scene, camera);

    describeRenderer();
    setupEventListeners();

    updateLoadingStatus('Ready', 100);
    setTimeout(() => {
        const loading = document.getElementById('loading-screen');
        if (loading) loading.classList.add('hidden');
        state.isLoaded = true;
    }, 400);

    track('session-start', { device: state.isMobile ? 'touch' : 'desktop' });
    track('renderer', { outcome: state.backend });
    sessionStart = Date.now();

    state.isRunning = true;
    state.lastTime = performance.now();
    renderer.setAnimationLoop(animate);
}

function updateLoadingStatus(message, progress) {
    const statusEl = document.getElementById('load-status');
    const progressEl = document.getElementById('load-progress');
    if (statusEl) statusEl.textContent = message;
    if (progressEl) progressEl.style.width = `${progress}%`;
}

/** 320000 as "320,000". */
export function formatCount(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Say on the welcome card what is drawing the galaxy. For the people who
 *  came to see WebGPU, this line is half the point. */
export function rendererNote(backend, count) {
    const stars = formatCount(count);
    if (backend === 'webgpu') {
        return `Drawn live with WebGPU. All ${stars} stars are placed by your graphics card, every frame.`;
    }
    return `Drawn live with WebGL 2, since this browser has no WebGPU yet. All ${stars} stars are placed by your graphics card, every frame.`;
}

function describeRenderer() {
    const note = document.getElementById('renderer-note');
    if (note) note.textContent = rendererNote(state.backend, state.starCount);
}

/** Put the camera where the orbit says, far enough back that the whole
 *  galaxy fits whatever shape the screen is. */
function placeCamera() {
    if (!camera) return;
    const aspect = window.innerWidth / window.innerHeight;
    const distance = fitDistance(aspect, CONFIG.camera, CONFIG.galaxy.radius, orbit.elevation);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const p = cameraPosition(orbit.azimuth, orbit.elevation, distance);
    camera.position.set(p.x, p.y, p.z);
    camera.lookAt(0, 0, 0);
}

// ---- Event wiring ---------------------------------------------------------

function setupEventListeners() {
    cleanupController = new AbortController();
    const signal = cleanupController.signal;

    window.addEventListener('pagehide', cleanup);
    window.addEventListener('resize', () => {
        if (renderer) renderer.setSize(window.innerWidth, window.innerHeight);
        placeCamera();
    }, { signal });

    // Keep the immersive view from being pinch-zoomed by iOS Safari, which
    // ignores user-scalable=no. Safari-only gesture events, this page only.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) =>
        document.addEventListener(type, (e) => e.preventDefault(), { passive: false, signal }));

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') endSession();
    });
    window.addEventListener('pagehide', endSession);

    if (blocker) {
        const dismiss = (e) => {
            if (e) e.preventDefault();
            beginWatching();
        };
        blocker.addEventListener('click', dismiss, { signal });
        blocker.addEventListener('touchend', dismiss, { signal });
        shieldOverlayControl(document.getElementById('explore-link'), { signal });
    }

    document.addEventListener('keydown', (event) => {
        if (event.code === 'Escape') {
            if (!state.isLoaded) return;
            if (welcomeShown()) beginWatching();
            else returnToWelcome('escape');
            return;
        }
        if (event.repeat && !arrowOf(event.code)) return;
        if ((event.code === 'Enter' || event.code === 'Space') && welcomeShown()) {
            beginWatching();
            return;
        }
        const arrow = arrowOf(event.code);
        if (arrow && !welcomeShown() && !isTextEntry(event.target)) {
            event.preventDefault();
            if (!keys[arrow]) noteTurn();
            keys[arrow] = true;
        }
    }, { signal });
    document.addEventListener('keyup', (event) => {
        const arrow = arrowOf(event.code);
        if (arrow) keys[arrow] = false;
    }, { signal });
    // A key released while the window was elsewhere never sends its keyup.
    window.addEventListener('blur', releaseKeys, { signal });

    if (helpBtn) helpBtn.addEventListener('click', () => returnToWelcome('help'), { signal });

    // Turning, by pointer events, so a mouse, a pen and a finger are one path.
    canvas.addEventListener('pointerdown', (event) => {
        if (welcomeShown() || drag.pointerId !== null) return;
        drag.pointerId = event.pointerId;
        drag.x = event.clientX;
        drag.y = event.clientY;
        drag.t = performance.now();
        spin = { azimuth: 0, elevation: 0 };
        if (canvas.setPointerCapture) {
            try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* not capturable */ }
        }
        noteTurn();
    }, { signal });
    canvas.addEventListener('pointermove', (event) => {
        if (event.pointerId !== drag.pointerId) return;
        moveDrag(event.clientX, event.clientY, performance.now());
    }, { signal });
    const release = (event) => {
        if (event.pointerId === drag.pointerId) drag.pointerId = null;
    };
    canvas.addEventListener('pointerup', release, { signal });
    canvas.addEventListener('pointercancel', release, { signal });
}

/** Follow a drag, and remember how fast it was going so a flick carries on.
 *  The spin is smoothed over the last few moves rather than taken from the
 *  final one, which on a touch screen is often a tiny jitter. */
function moveDrag(x, y, now) {
    const dx = x - drag.x;
    const dy = y - drag.y;
    const dt = Math.max((now - drag.t) / 1000, 1 / 240);
    const before = { azimuth: orbit.azimuth, elevation: orbit.elevation };
    const after = dragView(orbit, dx, dy, CONFIG.view);
    orbit.azimuth = after.azimuth;
    orbit.elevation = after.elevation;
    const max = CONFIG.view.maxSpin;
    const clamp = (v) => Math.max(-max, Math.min(max, v));
    spin = {
        azimuth: clamp(spin.azimuth * 0.5 + 0.5 * (after.azimuth - before.azimuth) / dt),
        elevation: clamp(spin.elevation * 0.5 + 0.5 * (after.elevation - before.elevation) / dt)
    };
    drag.x = x;
    drag.y = y;
    drag.t = now;
}

function arrowOf(code) {
    return { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[code] || null;
}

/** Arrow keys inside a text field move its caret, not the galaxy. */
function isTextEntry(target) {
    const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target && target.isContentEditable);
}

function releaseKeys() {
    keys.left = false;
    keys.right = false;
    keys.up = false;
    keys.down = false;
}

/** Count the visit's turns, and log only the first, so the log can tell
 *  people who turned the galaxy from people who only watched it. */
function noteTurn() {
    drag.turns++;
    if (drag.turns === 1) track('turn');
}

// ---- The welcome screen ---------------------------------------------------

function welcomeShown() {
    return Boolean(blocker) && !blocker.classList.contains('hidden');
}

/** The help button follows the welcome screen: nothing to press until the
 *  visitor is in, and no help button over the help. */
function setChromeVisible(on) {
    if (helpBtn) helpBtn.classList.toggle('visible', on);
}

function beginWatching() {
    if (!state.isLoaded || !welcomeShown()) return;
    blocker.classList.add('hidden');
    setChromeVisible(true);
    handFocusBack();
    if (!welcomed) {
        welcomed = true;
        track('begin-watching');
    } else {
        track('resume');
    }
}

/** Escape or the help button: bring the welcome screen back. A button that
 *  hides itself hands focus on, to the welcome screen, and what had focus is
 *  remembered for the way back in. */
function returnToWelcome(how) {
    if (!state.isLoaded || !blocker || welcomeShown()) return;
    track('pause', { how });
    drag.pointerId = null;
    releaseKeys();
    const el = document.activeElement;
    welcomeReturn = el && el !== document.body && el !== blocker ? el : null;
    blocker.classList.remove('hidden');
    setChromeVisible(false);
    try {
        blocker.focus({ preventScroll: true });
    } catch (e) { /* not focusable */ }
}

function handFocusBack() {
    const el = welcomeReturn;
    welcomeReturn = null;
    if (el && document.contains && document.contains(el)) {
        try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    }
    if (document.activeElement === blocker && typeof blocker.blur === 'function') blocker.blur();
}

function applySiteLinks() {
    const explore = document.getElementById('explore-link');
    if (explore) explore.href = CONFIG.site.home.path;
}

// ---- Render loop ----------------------------------------------------------

/** One frame of the camera: held arrow keys turn it at a steady rate, a
 *  held drag has already moved it, and otherwise a flick glides and the
 *  drift carries on. */
function moveCamera(dt) {
    const v = CONFIG.view;
    const ax = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    const ay = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
    if (ax || ay) {
        orbit.azimuth += ax * v.keySpeed * dt;
        orbit.elevation = clampElevation(orbit.elevation + ay * v.keySpeed * dt, v);
        spin = { azimuth: 0, elevation: 0 };
    } else {
        const next = stepView(orbit, spin, dt, v, {
            held: drag.pointerId !== null,
            reducedMotion: state.reducedMotion
        });
        orbit.azimuth = next.azimuth;
        orbit.elevation = next.elevation;
        spin = next.spin;
    }
    placeCamera();
}

function animate() {
    if (!state.isRunning) return;
    const now = performance.now();
    const dt = Math.min(Math.max((now - state.lastTime) / 1000, 0), 0.1);
    state.lastTime = now;

    moveCamera(dt);
    galaxy.update(dt);
    renderer.render(scene, camera);
}

// ---- Cleanup / state ------------------------------------------------------

function cleanup() {
    state.isRunning = false;
    if (renderer) renderer.setAnimationLoop(null);
    if (cleanupController) cleanupController.abort();
}

let sessionStart = 0;
let sessionEnded = false;

function endSession() {
    if (sessionEnded || !sessionStart) return;
    sessionEnded = true;
    trackFinal('session-end', { seconds: Math.round((Date.now() - sessionStart) / 1000) });
}

export function getState() {
    return { ...state, turns: drag.turns, azimuth: orbit.azimuth, elevation: orbit.elevation };
}

// ---- Boot -----------------------------------------------------------------

/** Best-effort check that this browser can draw the galaxy at all: WebGPU,
 *  or WebGL 2 for the renderer's fallback (three.js needs one or the other). */
function canDraw() {
    try {
        if (typeof navigator !== 'undefined' && navigator.gpu) return true;
        const c = document.createElement('canvas');
        return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
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
    } catch (e) { /* ignore, we're redirecting regardless */ }
    setTimeout(() => { window.location.replace('/'); }, 2500);
}

/** Start the scene, but fall back to the 2D site if nothing can draw it or
 *  it fails to build, so a hard failure never ends in a blank page. */
function boot() {
    if (!canDraw()) { fallbackTo2D(); return; }
    init().catch((err) => {
        console.error('[Starfall] 3D init failed, falling back to the 2D site:', err);
        fallbackTo2D();
    });
}

// Auto-boot only in a browser. Under test (Node, no `document`) importing this
// module must stay side-effect-free rather than booting the whole scene.
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}

// Exposed for unit tests only.
export const __test__ = { bufToHex, canDraw, keys, drag, moveDrag };
