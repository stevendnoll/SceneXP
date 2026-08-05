// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for the Earth Defense experience.
 *
 * M1 SCOPE. This milestone builds the opening frame and nothing else. There is
 * no flight, no targeting, no fleet, and no cockpit: the camera is parked at
 * the composed spawn viewpoint and the world turns in front of it. The gate
 * for M1 is a judgement about that frame, so everything downstream waits until
 * the scale numbers in config.js have stopped moving.
 *
 * The loop does run, even though a still frame would satisfy the gate on its
 * own. It costs a few lines and it makes two things checkable by eye that a
 * screenshot cannot show: that the Moon is really on its orbit rather than
 * parked at a hard-coded point, and that a resize reframes cleanly.
 *
 * Arriving at M2: initFlight and the throttle. Arriving at M3: the structures.
 * The init order this file will grow into is in the PRD, section 9.6.
 */

import { EARTHDEFENSE_CONFIG } from './config.min.js';
import { getProofOfWork, bufToHex } from '../../shared/js/boot-1.0.0.min.js';
import {
    initSpace, renderSpace, resizeSpace, getRenderer, getWorldCamera, isTouchDevice
} from '../../shared/js/space-1.0.0.min.js';
import { initWorld, updateWorld, placeCameraAtSpawn } from './world.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';

// ---- Application state ----------------------------------------------------

const state = {
    isRunning: false,
    isLoaded: false,
    lastTime: 0,
    isMobile: false
};

let canvas, loadingScreen, blocker;
let scene = null;
let cleanupController = null;

let _sessionStart = 0;
let _sessionEnded = false;

// ---- Initialization -------------------------------------------------------

async function init() {
    state.isMobile = isTouchDevice();
    setMobile(state.isMobile);

    canvas = document.getElementById('game-canvas');
    loadingScreen = document.getElementById('loading-screen');
    blocker = document.getElementById('blocker');

    if (!canvas) return;

    applySiteLinks();

    // Soft bot deterrent, solved before the scene builds (or reused from
    // sessionStorage). The hash tags every telemetry ping.
    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(EARTHDEFENSE_CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Initializing renderer…', 25);
    scene = initSpace(canvas, EARTHDEFENSE_CONFIG);

    updateLoadingStatus('Placing the planets…', 45);
    await buildWorldWithTextures();

    placeCameraAtSpawn(getWorldCamera(), EARTHDEFENSE_CONFIG);

    updateLoadingStatus('Scattering the stars…', 85);
    setupEventListeners();

    updateLoadingStatus('Ready', 100);
    setTimeout(() => {
        if (loadingScreen) loadingScreen.classList.add('hidden');
        state.isLoaded = true;
        document.querySelectorAll('.ui-float').forEach(el => el.classList.add('visible'));
    }, 400);

    track('session-start', { device: state.isMobile ? 'touch' : 'desktop' });
    _sessionStart = Date.now();

    state.isRunning = true;
    state.lastTime = performance.now();
    getRenderer().setAnimationLoop(animate);
}

/** Build the world behind a THREE.LoadingManager so the loading bar reports
 *  real texture progress, and resolve once the three planet maps are in.
 *
 *  Guarded two ways: onError still resolves (a missing texture should cost the
 *  visitor a grey planet, not a page that never finishes loading), and a
 *  timeout resolves regardless, so a stalled request cannot strand anyone on
 *  the loading screen. */
function buildWorldWithTextures() {
    return new Promise((resolve) => {
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            resolve();
        };

        const manager = new THREE.LoadingManager();
        manager.onProgress = (_url, loaded, total) => {
            const pct = total ? Math.round((loaded / total) * 100) : 0;
            updateLoadingStatus('Painting the planets…', 45 + Math.round(pct * 0.35));
        };
        manager.onLoad = done;
        manager.onError = done;

        initWorld(scene, manager);

        // If nothing was queued (or the browser served everything from cache
        // before the handlers attached), onLoad may never fire.
        setTimeout(done, 8000);
    });
}

function updateLoadingStatus(message, progress) {
    const statusEl = document.getElementById('load-status');
    const progressEl = document.getElementById('load-progress');
    if (statusEl) statusEl.textContent = message;
    if (progressEl) progressEl.style.width = `${progress}%`;
}

/** Wire the outward-facing links from config, so config stays the single home
 *  for these values. An equivalent fallback is baked into the HTML for the
 *  no-JS path. */
function applySiteLinks() {
    const site = EARTHDEFENSE_CONFIG.site;
    const home = document.getElementById('home-btn');
    if (home) {
        home.href = site.home.path;
        home.removeAttribute('target');
        home.removeAttribute('rel');
        home.title = site.home.title;
        home.setAttribute('aria-label', site.home.title);
    }
}

// ---- Event wiring ---------------------------------------------------------

function setupEventListeners() {
    cleanupController = new AbortController();
    const signal = cleanupController.signal;

    window.addEventListener('pagehide', cleanup);

    // resizeSpace updates BOTH cameras. The spawn viewpoint does not depend on
    // aspect, so the camera does not need re-placing here yet; when the cockpit
    // arrives at M7 its portrait framing will hook in at this point.
    window.addEventListener('resize', () => resizeSpace(), { signal });

    // iOS Safari ignores `user-scalable=no`, so the only way to keep the
    // immersive view from being pinch-zoomed there is to block Safari's own
    // gesture events. Scoped to this page: the 2D pages stay zoomable.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(type =>
        document.addEventListener(type, (e) => e.preventDefault(), { passive: false, signal }));

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') endSession();
    });
    window.addEventListener('pagehide', endSession);

    // The welcome overlay: any click, tap, or key lets the visitor in. The
    // scene is already alive behind it, so dismissing is all it does.
    if (blocker) {
        const dismiss = (e) => {
            if (e) e.preventDefault();
            beginFlight();
        };
        blocker.addEventListener('click', dismiss, { signal });
        blocker.addEventListener('touchend', dismiss, { signal });
        document.addEventListener('keydown', (event) => {
            if (event.code === 'Enter' || event.code === 'Space') {
                if (!blocker.classList.contains('hidden')) beginFlight();
            }
        }, { signal });
    }
}

function beginFlight() {
    if (!state.isLoaded || !blocker || blocker.classList.contains('hidden')) return;
    blocker.classList.add('hidden');
    track('begin-flight');
}

// ---- Render loop ----------------------------------------------------------

function animate() {
    if (!state.isRunning) return;
    const now = performance.now();
    const deltaTime = Math.min((now - state.lastTime) / 1000, 0.1);
    state.lastTime = now;

    updateWorld(deltaTime);
    // No overlay scene yet: the cockpit arrives at M7.
    renderSpace(scene);
}

// ---- Cleanup / state ------------------------------------------------------

function cleanup() {
    state.isRunning = false;
    const renderer = getRenderer();
    if (renderer) renderer.setAnimationLoop(null);
    if (cleanupController) cleanupController.abort();
}

function endSession() {
    if (_sessionEnded || !_sessionStart) return;
    _sessionEnded = true;
    trackFinal('session-end', {
        seconds: Math.round((Date.now() - _sessionStart) / 1000)
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

/** Route visitors whose browser cannot run the 3D scene to the 2D site, with a
 *  brief note, rather than leaving them staring at a blank canvas. */
function fallbackTo2D() {
    try {
        const loading = document.getElementById('loading-screen');
        if (loading) loading.classList.remove('hidden');
        const status = document.getElementById('load-status');
        if (status) status.textContent = "This browser can't run the 3D view. Taking you to the standard site…";
    } catch (e) { /* ignore, we are redirecting regardless */ }
    setTimeout(() => { window.location.replace('/'); }, 2500);
}

function boot() {
    if (!hasWebGL()) { fallbackTo2D(); return; }
    init().catch((err) => {
        console.error('[Earth Defense] 3D init failed, falling back to the 2D site:', err);
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

// Exposed for unit tests only.
export const __test__ = { bufToHex, hasWebGL };
