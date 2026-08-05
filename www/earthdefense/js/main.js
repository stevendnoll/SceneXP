// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for the Earth Defense experience.
 *
 * M2 SCOPE. The opening frame from M1 is now flyable. The flight model, every
 * input source, the settings cog, the pause panel, and the soft perimeter are
 * wired. There is still no targeting, no fleet, and no cockpit.
 *
 * This file owns the seam between the shared parts and the scene: flight
 * (flight-1.0.0) deals only in plain numbers, and this is where those numbers
 * become a camera. That split is deliberate. It keeps every line of the flight
 * maths testable with real values, and it means the same module could fly
 * something other than a camera in a later game.
 *
 * Arriving at M3: structures, real collision, and surface anchors. The init
 * order this file will grow into is in the PRD, section 9.6.
 */

import { EARTHDEFENSE_CONFIG, spawnPosition } from './config.min.js';
import { getProofOfWork, bufToHex } from '../../shared/js/boot-1.0.0.min.js';
import {
    initSpace, renderSpace, resizeSpace, setMaxPixelRatio,
    getRenderer, getWorldCamera, isTouchDevice
} from '../../shared/js/space-1.0.0.min.js';
import {
    initFlight, updateFlight, getFlightState, setTargetSpeedFraction,
    setLookSensitivity, setInvertPitch, setPerimeter, onPerimeterChange,
    setConstrainPosition, setPaused
} from '../../shared/js/flight-1.0.0.min.js';
import { initWorld, updateWorld, bodyPositions } from './world.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';

// ---- Application state ----------------------------------------------------

const state = {
    isRunning: false,
    isLoaded: false,
    isPaused: false,
    lastTime: 0,
    isMobile: false
};

const settings = {
    lookSensitivity: 1.0,
    invertPitch: false,
    reducedFx: false
};

let canvas, loadingScreen, blocker, touchControls;
let throttleReadout, perimeterNotice, flightStatus;
let settingsPanel, settingsBtn, pauseModal;
let scene = null;
let cleanupController = null;

let _sessionStart = 0;
let _sessionEnded = false;
let _announcedThrottle = null;

// ---- Initialization -------------------------------------------------------

async function init() {
    state.isMobile = isTouchDevice();
    setMobile(state.isMobile);

    canvas = document.getElementById('game-canvas');
    loadingScreen = document.getElementById('loading-screen');
    blocker = document.getElementById('blocker');
    touchControls = document.getElementById('touch-controls');
    throttleReadout = document.getElementById('throttle-readout');
    perimeterNotice = document.getElementById('perimeter-notice');
    flightStatus = document.getElementById('flight-status');
    settingsPanel = document.getElementById('settings-panel');
    settingsBtn = document.getElementById('settings-btn');
    pauseModal = document.getElementById('pause-modal');

    if (!canvas) return;

    if (state.isMobile) {
        document.body.classList.add('is-touch-device');
        if (touchControls) touchControls.classList.add('visible');
    }
    applyHelpVisibility();
    applySiteLinks();

    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(EARTHDEFENSE_CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Initializing renderer…', 25);
    scene = initSpace(canvas, EARTHDEFENSE_CONFIG);
    // Yaw then pitch, with no third angle, is what keeps roll out of the scene.
    const camera = getWorldCamera();
    if (camera && camera.rotation) camera.rotation.order = 'YXZ';

    updateLoadingStatus('Placing the planets…', 45);
    await buildWorldWithTextures();

    updateLoadingStatus('Warming the engines…', 88);
    loadSettings();
    startFlight();

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
        setTimeout(done, 8000);
    });
}

/** Hand the flight model its spawn, its settings, and the two boundaries that
 *  keep a visitor inside the playable volume. */
function startFlight() {
    const config = EARTHDEFENSE_CONFIG;
    initFlight({
        flight: { ...config.flight, ...settings },
        spawn: {
            position: spawnPosition(config),
            yaw: config.spawn.yaw,
            pitch: config.spawn.pitch
        },
        elements: {
            canvas,
            throttleZone: document.getElementById('throttle-zone'),
            throttleTrack: document.getElementById('throttle-track'),
            throttleFill: document.getElementById('throttle-fill'),
            throttleThumb: document.getElementById('throttle-thumb'),
            lookZone: document.getElementById('look-joystick-zone'),
            lookThumb: document.getElementById('look-thumb')
        }
    });

    // The outer boundary: a polite fade rather than a wall (PRD 5.6).
    setPerimeter({ x: 0, y: 0, z: 0 }, config.perimeter.radius, config.perimeter.fade);
    onPerimeterChange(showPerimeterNotice);

    // The inner boundary. Real collision arrives at M3; this is the minimum
    // needed for the M2 playtest to be about how flying FEELS rather than
    // about the fact that you can fly through the planet.
    setConstrainPosition(keepAbovePlanets);
}

/** Push the ship back out to a standoff altitude if it would enter a body.
 *  Experience code rather than shared: the real version at M3 lives in
 *  bodies-1.0.0 and knows about penetration depth and sliding. */
function keepAbovePlanets(next) {
    const floor = EARTHDEFENSE_CONFIG.altitudeFloor;
    const centres = bodyPositions();
    for (const spec of EARTHDEFENSE_CONFIG.bodies) {
        const c = centres[spec.id];
        if (!c) continue;
        const dx = next.x - c.x, dy = next.y - c.y, dz = next.z - c.z;
        const d = Math.hypot(dx, dy, dz);
        const minimum = spec.radius + floor;
        if (d > 0 && d < minimum) {
            const k = minimum / d;
            return { x: c.x + dx * k, y: c.y + dy * k, z: c.z + dz * k };
        }
    }
    return next;
}

function showPerimeterNotice(outside) {
    if (!perimeterNotice) return;
    if (outside) {
        perimeterNotice.textContent = 'Returning to the defensive perimeter';
        perimeterNotice.classList.remove('hidden');
        track('perimeter-reached');
    } else {
        perimeterNotice.classList.add('hidden');
    }
}

function updateLoadingStatus(message, progress) {
    const statusEl = document.getElementById('load-status');
    const progressEl = document.getElementById('load-progress');
    if (statusEl) statusEl.textContent = message;
    if (progressEl) progressEl.style.width = `${progress}%`;
}

function applyHelpVisibility() {
    if (!pauseModal) return;
    pauseModal.querySelectorAll('.help-desktop').forEach(el => { el.hidden = state.isMobile; });
    pauseModal.querySelectorAll('.help-mobile').forEach(el => { el.hidden = !state.isMobile; });
}

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

// ---- Settings -------------------------------------------------------------

function readStored(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : raw;
    } catch (e) {
        return fallback;   // storage disabled or full: run with the defaults
    }
}

function writeStored(key, value) {
    try {
        localStorage.setItem(key, String(value));
    } catch (e) { /* not worth interrupting a flight over */ }
}

function loadSettings() {
    const keys = EARTHDEFENSE_CONFIG.storage;
    const sensitivity = parseFloat(readStored(keys.sensitivity, ''));
    if (Number.isFinite(sensitivity) && sensitivity > 0) settings.lookSensitivity = sensitivity;
    settings.invertPitch = readStored(keys.invertPitch, 'false') === 'true';
    settings.reducedFx = readStored(keys.reducedFx, 'false') === 'true';
    applyReducedFx();
}

function applyReducedFx() {
    setMaxPixelRatio(settings.reducedFx ? 1.5 : EARTHDEFENSE_CONFIG.space.maxPixelRatio);
}

function wireSettings(signal) {
    const keys = EARTHDEFENSE_CONFIG.storage;
    const slider = document.getElementById('look-speed-slider');
    const value = document.getElementById('look-speed-value');
    const invert = document.getElementById('invert-pitch-toggle');
    const reduced = document.getElementById('reduced-fx-toggle');
    const close = document.getElementById('settings-close');

    if (slider) {
        slider.value = String(settings.lookSensitivity);
        if (value) value.textContent = settings.lookSensitivity.toFixed(1);
        slider.addEventListener('input', () => {
            settings.lookSensitivity = parseFloat(slider.value);
            if (value) value.textContent = settings.lookSensitivity.toFixed(1);
            setLookSensitivity(settings.lookSensitivity);
            writeStored(keys.sensitivity, settings.lookSensitivity);
        }, { signal });
    }
    if (invert) {
        invert.checked = settings.invertPitch;
        invert.addEventListener('change', () => {
            settings.invertPitch = invert.checked;
            setInvertPitch(settings.invertPitch);
            writeStored(keys.invertPitch, settings.invertPitch);
        }, { signal });
    }
    if (reduced) {
        reduced.checked = settings.reducedFx;
        reduced.addEventListener('change', () => {
            settings.reducedFx = reduced.checked;
            applyReducedFx();
            writeStored(keys.reducedFx, settings.reducedFx);
        }, { signal });
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => toggleSettings(), { signal });
    }
    if (close) {
        close.addEventListener('click', () => toggleSettings(false), { signal });
    }
}

function toggleSettings(force) {
    if (!settingsPanel) return;
    const open = force === undefined ? settingsPanel.classList.contains('hidden') : force;
    settingsPanel.classList.toggle('hidden', !open);
    if (settingsBtn) settingsBtn.setAttribute('aria-expanded', String(open));
}

// ---- Pause ----------------------------------------------------------------

function openPause() {
    if (!state.isLoaded || state.isPaused) return;
    state.isPaused = true;
    setPaused(true);
    if (pauseModal) pauseModal.classList.remove('hidden');
    // Holding the cursor captive behind a dialog is a trap, not a feature.
    if (typeof document.exitPointerLock === 'function') document.exitPointerLock();
    track('pause');
}

function closePause() {
    if (!state.isPaused) return;
    state.isPaused = false;
    setPaused(false);
    if (pauseModal) pauseModal.classList.add('hidden');
}

// ---- Event wiring ---------------------------------------------------------

function setupEventListeners() {
    cleanupController = new AbortController();
    const signal = cleanupController.signal;

    window.addEventListener('pagehide', cleanup);
    window.addEventListener('resize', () => resizeSpace(), { signal });

    ['gesturestart', 'gesturechange', 'gestureend'].forEach(type =>
        document.addEventListener(type, (e) => e.preventDefault(), { passive: false, signal }));

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            openPause();       // a backgrounded tab should not keep flying
            endSession();
        }
    });
    window.addEventListener('pagehide', endSession);

    wireSettings(signal);

    // Pause: Esc on a keyboard, the pause button on a touch screen.
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.addEventListener('click', openPause, { signal });
    if (pauseModal) {
        pauseModal.querySelectorAll('[data-close]').forEach(el =>
            el.addEventListener('click', closePause, { signal }));
    }
    document.addEventListener('keydown', (event) => {
        if (event.code !== 'Escape') return;
        if (state.isPaused) closePause();
        else if (settingsPanel && !settingsPanel.classList.contains('hidden')) toggleSettings(false);
        else openPause();
    }, { signal });

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
    // Desktop visitors expect the mouse to take hold straight away. Touch and
    // keyboard-only visitors are unaffected: there is nothing to capture.
    if (!state.isMobile && canvas && canvas.requestPointerLock) canvas.requestPointerLock();
    track('begin-flight');
}

// ---- Render loop ----------------------------------------------------------

function animate() {
    if (!state.isRunning) return;
    const now = performance.now();
    const deltaTime = Math.min((now - state.lastTime) / 1000, 0.1);
    state.lastTime = now;

    if (!state.isPaused) {
        updateFlight(deltaTime);
        updateWorld(deltaTime);
    }
    applyFlightToCamera();
    updateReadouts();

    renderSpace(scene);
}

function applyFlightToCamera() {
    const camera = getWorldCamera();
    if (!camera) return;
    const s = getFlightState();
    camera.position.set(s.position.x, s.position.y, s.position.z);
    // Rebuilt from two angles every frame, never accumulated, which is what
    // keeps roll out of a scene that is meant to have none.
    camera.rotation.set(s.pitch, s.yaw, 0);
}

function updateReadouts() {
    const s = getFlightState();
    if (throttleReadout) {
        const speed = Math.round(s.speed);
        const target = Math.round(s.targetSpeed);
        throttleReadout.textContent = speed === target
            ? `${speed.toLocaleString()} km/s`
            : `${speed.toLocaleString()} → ${target.toLocaleString()} km/s`;
    }
    // Announce the throttle only when it has actually moved a step, so the
    // live region reports changes rather than chattering every frame.
    if (flightStatus) {
        const notch = Math.round(s.throttle * 10) / 10;
        if (notch !== _announcedThrottle) {
            _announcedThrottle = notch;
            flightStatus.textContent = `Throttle ${Math.round(notch * 100)} percent, speed ${Math.round(s.speed)} kilometres per second.`;
        }
    }
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

function hasWebGL() {
    try {
        const c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext &&
            (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) {
        return false;
    }
}

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

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}

export const __test__ = { bufToHex, hasWebGL, keepAbovePlanets, settings };
