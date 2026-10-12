// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * main.js - Entry point for Whitestone Home Care.
 *
 * M0: AN EMPTY, LIT STUDIO. The boot sequence every later milestone keeps
 * (Auto Man's, adapted in PLANNING 4.1): the loading screen, the shared
 * proof-of-work puzzle, the renderer, the room, the shaders warmed behind the
 * loader, then the reveal. The reception desk, the plinth, the cast and the
 * cards all arrive in later milestones and plug into this file.
 *
 * THE SCENE RENDERS ON DEMAND, as Corner Office does. A studio mostly sits
 * still, so a frame is drawn only when something asks for one
 * (`requestRender`): the reveal, a resize, a returning tab. An idle studio
 * costs a phone nothing.
 *
 * This is the one place the real clock and the real window are read.
 */

import { CONFIG } from './config.min.js';
import { getProofOfWork } from '../../shared/js/boot-1.0.0.min.js';
import { warmShaders } from '../../shared/js/warmup-1.0.0.min.js';
import { createResolution } from '../../shared/js/resolution-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';

// ---- State ------------------------------------------------------------------

const state = {
    mobile: false,
    reducedMotion: false,
    loaded: false,
    running: false,
    dirty: false,
    drewLast: false,
    lastTime: 0,
    frames: 0
};

let canvas = null;
let renderer = null;
let scene = null;
let camera = null;
let resolution = null;
let cleanupController = null;
let tornDown = false;
let sessionStart = 0;
let sessionEnded = false;

// ---- Device and preference checks -----------------------------------------

export function detectMobile() {
    if (typeof window === 'undefined') return false;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return Boolean(coarse) || Math.min(window.innerWidth, window.innerHeight) < 600;
}

export function prefersReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function el(id) {
    return document.getElementById(id);
}

function aspect() {
    return window.innerWidth / Math.max(1, window.innerHeight);
}

// ---- The shell (pure) -------------------------------------------------------

/**
 * The studio's surfaces as plain numbers: each one a plane of `size`
 * [width, height] meters, centered at `position`, turned by `rotation`
 * (radians about x, y, z) so its face looks into the room. Pure, so the
 * suite can check the box is closed where it should be and open where the
 * glass will go, without a renderer.
 *
 * The +z long wall is left open in M0. It becomes the street glass in M2,
 * and leaving it open now is what lets the sun in.
 */
export function shellSurfaces(room) {
    const w = room.width;
    const d = room.depth;
    const h = room.height;
    const half = Math.PI / 2;
    return [
        { name: 'floor', size: [w, d], position: [0, 0, 0], rotation: [-half, 0, 0], color: room.floor },
        { name: 'ceiling', size: [w, d], position: [0, h, 0], rotation: [half, 0, 0], color: room.ceiling },
        { name: 'back', size: [w, h], position: [0, h / 2, -d / 2], rotation: [0, 0, 0], color: room.walls },
        { name: 'left', size: [d, h], position: [-w / 2, h / 2, 0], rotation: [0, half, 0], color: room.walls },
        { name: 'right', size: [d, h], position: [w / 2, h / 2, 0], rotation: [0, -half, 0], color: room.walls }
    ];
}

// ---- Initialization ---------------------------------------------------------

async function init() {
    state.mobile = detectMobile();
    state.reducedMotion = prefersReducedMotion();
    setMobile(state.mobile);

    canvas = el('game-canvas');
    if (!canvas) return;

    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(CONFIG.telemetry.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Opening the studio…', 40);
    // THE ONE ABORT CONTROLLER FOR THE PAGE, made before anything listens.
    cleanupController = new AbortController();
    buildRenderer();
    buildScene();

    updateLoadingStatus('Turning on the lights…', 75);
    setupEventListeners();

    // Build the shaders now, behind the loading screen, rather than on the
    // first frame where they would freeze the studio the moment it appears
    // (shared warmup part).
    updateLoadingStatus('Preparing the view…', 95);
    await warmShaders(renderer, [{ scene, camera }]);

    updateLoadingStatus('Ready', 100);
    setTimeout(() => {
        const loading = el('loading-screen');
        if (loading) loading.classList.add('hidden');
        state.loaded = true;
        // EVERY .ui-float IS display:none UNTIL THIS LINE.
        document.querySelectorAll('.ui-float').forEach((node) => node.classList.add('visible'));
        requestRender();
    }, CONFIG.loadingReveal);

    // Console helpers for QA and screenshots.
    window.whitestone = {
        /** What the adaptive resolution has settled on, and what a frame
         *  costs. */
        quality() {
            const info = renderer && renderer.info ? renderer.info.render : {};
            return { ...resolution.readout(), drawCalls: info.calls, triangles: info.triangles };
        },
        /** Full resolution held, for a social-card capture (`capture(false)`
         *  lets it adapt again). */
        capture(on = true) {
            const held = resolution.pin(on);
            requestRender();
            return held;
        }
    };

    track('session-start', { device: state.mobile ? 'touch' : 'desktop' });
    sessionStart = Date.now();

    start();
}

function updateLoadingStatus(message, progress) {
    const statusEl = el('load-status');
    const progressEl = el('load-progress');
    if (statusEl) statusEl.textContent = message;
    if (progressEl) progressEl.style.width = `${progress}%`;
}

// ---- Renderer, scene, camera ------------------------------------------------

function pixelRatioCeiling() {
    const q = CONFIG.quality;
    const cap = state.mobile ? q.maxPixelRatioMobile : q.maxPixelRatio;
    return Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, cap);
}

function buildRenderer() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !state.mobile, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Adaptive resolution (shared resolution-1.0.0): below the device's own
    // ratio for as long as the frames say it is too much, back up when not.
    resolution = createResolution({ renderer, ceiling: pixelRatioCeiling });
    resolution.apply();
}

function buildScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.colors.stone);

    const cam = CONFIG.camera;
    camera = new THREE.PerspectiveCamera(cam.fov, aspect(), cam.near, cam.far);
    camera.position.set(cam.position[0], cam.position[1], cam.position[2]);
    camera.lookAt(cam.lookAt[0], cam.lookAt[1], cam.lookAt[2]);

    for (const s of shellSurfaces(CONFIG.room)) {
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(s.size[0], s.size[1]),
            new THREE.MeshStandardMaterial({ color: s.color, roughness: s.name === 'floor' ? 0.7 : 0.92, metalness: 0 })
        );
        mesh.name = s.name;
        mesh.position.set(s.position[0], s.position[1], s.position[2]);
        mesh.rotation.set(s.rotation[0], s.rotation[1], s.rotation[2]);
        scene.add(mesh);
    }

    const { sun, sky } = CONFIG.light;
    scene.add(new THREE.HemisphereLight(sky.color, sky.ground, sky.intensity));
    const sunLight = new THREE.DirectionalLight(sun.color, sun.intensity);
    sunLight.position.set(sun.position[0], sun.position[1], sun.position[2]);
    scene.add(sunLight);
}

function handleResize() {
    if (!renderer || !camera) return;
    resolution.apply();
    camera.aspect = aspect();
    camera.updateProjectionMatrix();
    requestRender();
}

// ---- Event wiring -----------------------------------------------------------

function setupEventListeners() {
    const signal = cleanupController.signal;

    window.addEventListener('resize', handleResize, { signal });

    // iOS Safari ignores `user-scalable=no`, so the only way to keep the 3D
    // view from being pinch-zoomed there is to block Safari's own gesture
    // events. Scoped to this page: the 2D pages stay zoomable.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) =>
        document.addEventListener(type, (e) => e.preventDefault(), { passive: false, signal }));

    // A hidden tab stops drawing, and comes back with one fresh frame.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            endSession();
            stop();
        } else if (state.loaded) {
            start();
        }
    }, { signal });

    window.addEventListener('pagehide', () => {
        endSession();
        cleanup();
    }, { signal });
}

// ---- Render loop ------------------------------------------------------------

/** Ask for one frame. Cheap to call as often as anything likes. */
function requestRender() {
    state.dirty = true;
}

function start() {
    if (state.running || !renderer || tornDown) return;
    state.running = true;
    state.lastTime = 0;
    requestRender();
    renderer.setAnimationLoop(animate);
}

function stop() {
    state.running = false;
    if (renderer) renderer.setAnimationLoop(null);
}

function animate() {
    if (!state.running) return;
    const t = performance.now();
    const delta = state.lastTime === 0
        ? 0
        : Math.min((t - state.lastTime) / 1000, CONFIG.quality.maxFrameSeconds);
    state.lastTime = t;

    // The frame after one that was drawn carries that frame's cost, so only
    // those intervals tell the adaptive resolution anything.
    if (state.drewLast && resolution) resolution.sample(delta);
    state.drewLast = false;

    if (!state.dirty) return;
    state.dirty = false;
    state.frames++;
    renderer.render(scene, camera);
    state.drewLast = true;
}

function cleanup() {
    if (tornDown) return;
    tornDown = true;
    stop();
    if (cleanupController) cleanupController.abort();
}

function endSession() {
    if (sessionEnded || !sessionStart) return;
    sessionEnded = true;
    trackFinal('session-end', { seconds: Math.round((Date.now() - sessionStart) / 1000) });
}

// ---- Public surface ---------------------------------------------------------

export function getState() {
    return { ...state };
}

// ---- Boot -------------------------------------------------------------------

/** Best-effort check that the browser can create a WebGL 2 context, which
 *  three.js requires (r163 dropped WebGL 1). */
export function hasWebGL() {
    try {
        const c = document.createElement('canvas');
        return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
    } catch (e) {
        return false;
    }
}

function fallbackTo2D() {
    try {
        const loading = el('loading-screen');
        if (loading) loading.classList.remove('hidden');
        const status = el('load-status');
        if (status) status.textContent = "This browser can't run the 3D studio. Taking you to the standard site…";
    } catch (e) { /* ignore, we're redirecting regardless */ }
    setTimeout(() => { window.location.replace('/'); }, 2500);
}

function boot() {
    if (!hasWebGL()) { fallbackTo2D(); return; }
    init().catch((err) => {
        console.error('[Whitestone] 3D init failed, falling back to the 2D site:', err);
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

export const __test__ = {
    state,
    requestRender,
    handleResize,
    start,
    stop,
    scene: () => scene,
    camera: () => camera,
    renderer: () => renderer
};
