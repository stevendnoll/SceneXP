// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for the leaf lab (www/leaves).
 *
 * M0 OF THE LEAF BLOWER SCENE (2026-10-06): a front yard buried in autumn
 * leaves, a person with a leaf blower who follows the pointer (or the
 * keyboard), and, on a QA host, a readout and a panel for changing the leaf
 * count, so a phone can be measured at several counts in one sitting. The
 * leaves are sim.js (where they are) and leafmesh.js (how they are drawn).
 *
 * UNLISTED. The page carries noindex and is in no directory, sitemap or
 * llms.txt until the scene it grows into is released.
 */

import { LEAVES_CONFIG } from './config.min.js';
import { createSim, scatterLeaves, stepSim, makeJet, countIn } from './sim.min.js';
import { createLeafMesh } from './leafmesh.min.js';
import { buildYard } from './yard.min.js';
import { createOperator, stepOperator, facing, createOperatorFigure } from './blower.min.js';
import { cameraFor, rayToGround, ease } from './view.min.js';
import { isQaHost, labOptions, labSearch, statsLines, fpsOf, shortCount } from './lab.min.js';
import { getProofOfWork, bufToHex, shieldOverlayControl } from '../../shared/js/boot-1.0.0.min.js';
import { warmShaders } from '../../shared/js/warmup-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';

const CONFIG = LEAVES_CONFIG;
const B = CONFIG.blower;

const state = {
    isLoaded: false,
    isRunning: false,
    isMobile: false,
    reducedMotion: false,
    qa: false,
    count: 0,
    shadows: true,
    ratio: 1,
    lastTime: 0,
    time: 0,
    blows: 0
};

let canvas = null;
let renderer = null;
let scene = null;
let camera = null;
let sim = null;
let leaves = null;
let operator = null;
let figure = null;
let marker = null;
let blocker = null;
let helpBtn = null;
let cleanupController = null;

let welcomed = false;
let welcomeReturn = null;

// The pointer that is steering, if any. A mouse steers by hovering and blows
// while a button is held; a finger steers and blows while it is down.
const pointer = { id: null, down: false, mouse: false, aim: null, seen: false };
// Keys held: the walk, and Space for the blower.
const keys = { left: false, right: false, up: false, down: false, blow: false };
let steer = 'point';
// The camera's eased position and target.
const view = { position: null, target: null };
// Shadows are redrawn at most config.shadows.hz times a second while
// anything moves, and a frame that moved something is owed one.
const shade = { owed: true, since: 0 };
// The lab's measurements.
const lab = { el: null, frames: 0, seconds: 0, simMs: 0, uploaded: 0, scoreAt: 0, cleared: 0, tarp: 0, start: 0 };

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

function pixelRatio() {
    const cap = state.isMobile ? CONFIG.render.mobilePixelRatio : CONFIG.render.maxPixelRatio;
    return Math.min(window.devicePixelRatio || 1, state.ratio || cap, cap);
}

async function init() {
    canvas = document.getElementById('game-canvas');
    blocker = document.getElementById('blocker');
    helpBtn = document.getElementById('help-btn');
    if (!canvas || typeof THREE === 'undefined') return;

    state.isMobile = detectMobile();
    state.reducedMotion = prefersReducedMotion();
    state.qa = isQaHost();
    // The address only steers the lab on a QA host. Anywhere else the page
    // runs at the device's defaults whatever the address says.
    const options = labOptions(state.qa ? window.location.search : '', CONFIG, state.isMobile);
    state.count = options.count;
    state.shadows = options.shadows;
    state.ratio = options.ratio;
    setMobile(state.isMobile);
    applySiteLinks();

    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Raking the yard…', 30);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !state.isMobile, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.NeutralToneMapping || THREE.NoToneMapping;
    renderer.toneMappingExposure = CONFIG.lights.exposure;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (state.shadows) {
        renderer.shadowMap.enabled = true;
        // PCFShadowMap is soft from r182 on, which retired PCFSoftShadowMap.
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.shadowMap.autoUpdate = false;
        renderer.shadowMap.needsUpdate = true;
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.look.background);
    const F = CONFIG.look.fog;
    scene.fog = new THREE.Fog(F.color, F.near, F.far);
    const C = CONFIG.camera;
    camera = new THREE.PerspectiveCamera(C.fovDegrees, window.innerWidth / window.innerHeight, C.near, C.far);

    buildYard(scene, CONFIG, { shadows: state.shadows, mobile: state.isMobile });

    updateLoadingStatus(`Letting ${shortCount(state.count)} leaves fall…`, 55);
    sim = createSim(state.count, CONFIG);
    const { look } = scatterLeaves(sim, CONFIG);
    leaves = createLeafMesh(sim, look, {
        shadows: state.shadows,
        underside: CONFIG.look.underside,
        anisotropy: renderer.capabilities && renderer.capabilities.getMaxAnisotropy
            ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 4
    });
    leaves.update();
    scene.add(leaves.mesh);

    operator = createOperator(B);
    figure = createOperatorFigure(B, CONFIG.look);
    figure.update(operator, false, 0);
    scene.add(figure.group);
    marker = buildMarker();
    scene.add(marker);

    placeCamera(true);
    setupEventListeners();
    if (state.qa) installLab();

    // Compile the shaders behind the loading screen rather than on the first
    // visible frame, where the hitch would be the visitor's first impression.
    updateLoadingStatus('Warming up the blower…', 85);
    await warmShaders(renderer, [{ scene, camera }]);

    updateLoadingStatus('Ready', 100);
    setTimeout(() => {
        const loading = document.getElementById('loading-screen');
        if (loading) loading.classList.add('hidden');
        state.isLoaded = true;
    }, 400);

    track('session-start', { device: state.isMobile ? 'touch' : 'desktop' });
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

/** A ring on the lawn where the blower is aimed, drawn over the leaves. */
function buildMarker() {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 40),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 10;
    ring.visible = false;
    return ring;
}

function placeCamera(snap) {
    if (!camera) return;
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const want = cameraFor(aspect, CONFIG.camera, CONFIG.yard.lawn, operator);
    if (snap || !view.position) {
        view.position = { ...want.position };
        view.target = { ...want.target };
    }
    camera.position.set(view.position.x, view.position.y, view.position.z);
    camera.lookAt(view.target.x, view.target.y, view.target.z);
}

/** Ease the camera toward where it wants to be this frame. */
function followCamera(dt) {
    const want = cameraFor(window.innerWidth / window.innerHeight, CONFIG.camera, CONFIG.yard.lawn, operator);
    const rate = CONFIG.camera.follow;
    ['x', 'y', 'z'].forEach((k) => {
        view.position[k] = ease(view.position[k], want.position[k], rate, dt);
        view.target[k] = ease(view.target[k], want.target[k], rate, dt);
    });
    camera.position.set(view.position.x, view.position.y, view.position.z);
    camera.lookAt(view.target.x, view.target.y, view.target.z);
}

// ---- Event wiring ---------------------------------------------------------

function setupEventListeners() {
    cleanupController = new AbortController();
    const signal = cleanupController.signal;

    window.addEventListener('pagehide', cleanup);
    window.addEventListener('resize', () => {
        if (renderer) {
            renderer.setPixelRatio(pixelRatio());
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
        placeCamera(true);
    }, { signal });

    // Keep the view from being pinch-zoomed by iOS Safari, which ignores
    // user-scalable=no. Safari-only gesture events, this page only.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) =>
        document.addEventListener(type, (e) => e.preventDefault(), { passive: false, signal }));

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') endSession();
    });
    window.addEventListener('pagehide', endSession);

    if (blocker) {
        const dismiss = (e) => {
            if (e) e.preventDefault();
            beginPlaying();
        };
        blocker.addEventListener('click', dismiss, { signal });
        blocker.addEventListener('touchend', dismiss, { signal });
        shieldOverlayControl(document.getElementById('explore-link'), { signal });
    }
    if (helpBtn) helpBtn.addEventListener('click', () => returnToWelcome('help'), { signal });

    document.addEventListener('keydown', onKeyDown, { signal });
    document.addEventListener('keyup', onKeyUp, { signal });
    // A key released while the window was elsewhere never sends its keyup.
    window.addEventListener('blur', releaseInput, { signal });

    // Steering by pointer events, so a mouse, a pen and a finger are one path.
    canvas.addEventListener('pointerdown', (event) => {
        if (welcomeShown() || (pointer.id !== null && pointer.id !== event.pointerId)) return;
        pointer.id = event.pointerId;
        pointer.down = true;
        pointer.mouse = event.pointerType === 'mouse';
        steer = 'point';
        aimAt(event.clientX, event.clientY);
        if (canvas.setPointerCapture) {
            try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* not capturable */ }
        }
        noteBlow();
    }, { signal });
    canvas.addEventListener('pointermove', (event) => {
        if (welcomeShown()) return;
        // A mouse steers by hovering. A finger only while it is down.
        const hovering = event.pointerType === 'mouse' && pointer.id === null;
        if (event.pointerId !== pointer.id && !hovering) return;
        pointer.mouse = event.pointerType === 'mouse';
        steer = 'point';
        aimAt(event.clientX, event.clientY);
    }, { signal });
    const release = (event) => {
        if (event.pointerId !== pointer.id) return;
        pointer.id = null;
        pointer.down = false;
        // A finger lifted leaves nothing to steer by. A mouse still hovers.
        if (!pointer.mouse) pointer.aim = null;
    };
    canvas.addEventListener('pointerup', release, { signal });
    canvas.addEventListener('pointercancel', release, { signal });
    canvas.addEventListener('pointerleave', (event) => {
        if (event.pointerType === 'mouse' && pointer.id === null) pointer.aim = null;
    }, { signal });
}

/** Aim at the spot of lawn under a screen point. */
function aimAt(clientX, clientY) {
    if (!camera) return;
    const ndc = new THREE.Vector3((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1, 0.5);
    ndc.unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    const hit = rayToGround(camera.position, dir);
    if (hit) pointer.aim = hit;
    pointer.seen = true;
}

const WALK_KEYS = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right'
};

function onKeyDown(event) {
    if (event.code === 'Escape') {
        if (!state.isLoaded) return;
        if (welcomeShown()) beginPlaying();
        else returnToWelcome('escape');
        return;
    }
    if (isTextEntry(event.target)) return;
    if (welcomeShown()) {
        if (!event.repeat && (event.code === 'Enter' || event.code === 'Space')) {
            event.preventDefault();
            beginPlaying();
        }
        return;
    }
    // A button with focus keeps Enter and Space for itself.
    if (isButton(event.target) && (event.code === 'Enter' || event.code === 'Space')) return;
    const walk = WALK_KEYS[event.code];
    if (walk) {
        event.preventDefault();
        keys[walk] = true;
        steer = 'keys';
    } else if (event.code === 'Space') {
        event.preventDefault();
        if (!keys.blow) noteBlow();
        keys.blow = true;
    }
}

function onKeyUp(event) {
    const walk = WALK_KEYS[event.code];
    if (walk) keys[walk] = false;
    if (event.code === 'Space') keys.blow = false;
}

/** Arrow keys inside a text field move its caret, not the person. */
function isTextEntry(target) {
    const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target && target.isContentEditable);
}

function isButton(target) {
    const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
    return tag === 'button' || tag === 'a';
}

function releaseInput() {
    Object.keys(keys).forEach((k) => { keys[k] = false; });
    pointer.id = null;
    pointer.down = false;
}

/** Count the visit's blows, and log only the first, so the log can tell
 *  people who used the blower from people who only looked. */
function noteBlow() {
    state.blows++;
    if (state.blows === 1) track('blow');
}

/** What the person is steered by this frame, for stepOperator(). */
export function aimFor(steerBy, ptr, held) {
    if (steerBy === 'keys') {
        const x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
        // Up the screen is toward the house, which is -z.
        const z = (held.down ? 1 : 0) - (held.up ? 1 : 0);
        return { mode: 'keys', x, z };
    }
    if (ptr.aim) return { mode: 'point', x: ptr.aim.x, z: ptr.aim.z };
    return null;
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

function beginPlaying() {
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
    releaseInput();
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

// ---- The lab --------------------------------------------------------------

/** The QA panel: the readout, a button per leaf count, and the shadows
 *  switch. Each button reloads the page with the new setting in the
 *  address. Built here rather than in the markup, since only a QA host ever
 *  sees it, and styled by class from experience.css (the page's CSP allows
 *  no style attributes). */
function installLab() {
    const panel = document.createElement('div');
    panel.className = 'lab-panel';
    panel.id = 'lab-panel';
    const readout = document.createElement('pre');
    readout.className = 'lab-readout';
    readout.setAttribute('aria-hidden', 'true');
    readout.textContent = 'Measuring…';
    panel.appendChild(readout);
    const row = document.createElement('div');
    row.className = 'lab-buttons';
    const search = window.location.search;
    const go = (changes) => () => { window.location.search = labSearch(search, changes); };
    CONFIG.leaves.labCounts.forEach((n) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lab-btn';
        if (n === state.count) btn.classList.add('active');
        btn.textContent = shortCount(n);
        btn.setAttribute('aria-label', `Reload with ${shortCount(n)} leaves`);
        btn.addEventListener('click', go({ leaves: n }));
        row.appendChild(btn);
    });
    const shadowBtn = document.createElement('button');
    shadowBtn.type = 'button';
    shadowBtn.className = 'lab-btn';
    shadowBtn.textContent = state.shadows ? 'Shadows on' : 'Shadows off';
    shadowBtn.setAttribute('aria-label', state.shadows ? 'Reload with shadows off' : 'Reload with shadows on');
    shadowBtn.addEventListener('click', go({ shadows: state.shadows ? 0 : 1 }));
    row.appendChild(shadowBtn);
    panel.appendChild(row);
    document.body.appendChild(panel);
    lab.el = readout;
    lab.start = performance.now();
}

/** Twice a second, what the last frames cost. The lawn's score is counted
 *  at the same rate, since it walks every leaf. */
function updateLab(delta) {
    lab.frames += 1;
    lab.seconds += Math.max(0, delta);
    if (lab.seconds < 0.5) return;
    const lawn = CONFIG.yard.lawn;
    const onLawn = countIn(sim, lawn);
    lab.tarp = countIn(sim, CONFIG.yard.tarp);
    lab.cleared = 1 - Math.max(0, onLawn - lab.tarp) / Math.max(1, state.count);
    const info = renderer.info && renderer.info.render ? renderer.info.render : { calls: 0, triangles: 0 };
    lab.el.textContent = statsLines({
        fps: fpsOf(lab.frames, lab.seconds),
        frameMs: (lab.seconds * 1000) / lab.frames,
        simMs: lab.simMs / lab.frames,
        count: state.count,
        active: sim.activeCount,
        uploaded: Math.round(lab.uploaded / lab.frames),
        calls: info.calls,
        triangles: info.triangles,
        ratio: renderer.getPixelRatio ? renderer.getPixelRatio() : 1,
        shadows: state.shadows,
        cleared: lab.cleared,
        tarp: lab.tarp
    }).join('\n');
    lab.frames = 0;
    lab.seconds = 0;
    lab.simMs = 0;
    lab.uploaded = 0;
}

// ---- Render loop ----------------------------------------------------------

function animate() {
    if (!state.isRunning) return;
    const now = performance.now();
    const delta = Math.min(Math.max((now - state.lastTime) / 1000, 0), 0.1);
    state.lastTime = now;
    state.time += delta;
    // The sim never takes more than a twentieth of a second at once: past
    // that, a stalled tab would throw every moving leaf across the yard.
    const dt = Math.min(delta, 0.05);

    const playing = !welcomeShown();
    const aim = playing ? aimFor(steer, pointer, keys) : null;
    stepOperator(operator, aim, dt, B, walkArea());
    const blowing = playing && (pointer.down || keys.blow);
    const f = facing(operator.heading);
    const jet = makeJet(B, operator.x, operator.z, f.x, f.z, blowing);

    const t0 = performance.now();
    stepSim(sim, dt, jet);
    const uploaded = leaves.update();
    lab.simMs += performance.now() - t0;
    lab.uploaded += uploaded;

    figure.update(operator, blowing, state.time);
    const marked = playing && steer === 'point' && Boolean(pointer.aim);
    marker.visible = marked;
    if (marked) marker.position.set(pointer.aim.x, 0.05, pointer.aim.z);
    followCamera(dt);

    // Shadows: owed by any frame that moved a leaf or the person, paid at
    // most `hz` times a second.
    if (state.shadows) {
        if (uploaded > 0 || operator.speed > 0) shade.owed = true;
        shade.since += delta;
        if (shade.owed && shade.since >= 1 / CONFIG.shadows.hz) {
            renderer.shadowMap.needsUpdate = true;
            shade.owed = false;
            shade.since = 0;
        }
    }
    renderer.render(scene, camera);
    if (lab.el) updateLab(delta);
}

/** Where the person can walk: our lawn and the sidewalk, short of the
 *  house, the hedge and the fence. */
function walkArea() {
    const L = CONFIG.yard.lawn;
    return { minX: L.minX + 0.5, maxX: L.maxX - 0.4, minZ: L.minZ + 0.6, maxZ: CONFIG.yard.sidewalk.maxZ };
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
    return {
        ...state,
        active: sim ? sim.activeCount : 0,
        operator: operator ? { ...operator } : null,
        steer,
        aim: pointer.aim ? { ...pointer.aim } : null,
        blowing: !welcomeShown() && (pointer.down || keys.blow)
    };
}

// ---- Boot -----------------------------------------------------------------

/** Best-effort check that this browser can draw the yard: three.js needs
 *  WebGL 2. */
export function hasWebGL() {
    try {
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
    if (!hasWebGL()) { fallbackTo2D(); return; }
    init().catch((err) => {
        console.error('[Leaves] 3D init failed, falling back to the 2D site:', err);
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
export const __test__ = { bufToHex, keys, pointer, aimAt, walkArea, sim: () => sim };
