// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Entry point for Fractal Garden.
 *
 * NEITHER SHARED SCENE PART FITS, and that is a considered decision rather than
 * a shortcut. `scene-1.0.0` builds a walkable world geared to buildings: its
 * `cycleTime` is private, it starts at noon, it freezes outright under reduced
 * motion, and its sky is a fixed blue gradient. This scene needs to OWN its
 * clock, because seasons, growth, thirst, health, and persistence are all
 * functions of it, and it needs a sky that changes with the season rather than
 * only with the hour. Three shared parts are used and always will be: the
 * proof-of-work gate, the anonymous visit counter, and the pan and zoom
 * controls.
 *
 * THE CLOCK RUNS ONLY WHILE THE PAGE IS OPEN. `elapsedSeconds` is the total
 * in-world time this garden has ever been watched, it advances from the render
 * loop's clamped delta and from nowhere else, and it is what gets persisted.
 * There is deliberately no Date.now() in the garden's model. The two places a
 * wall clock could sneak in are a backgrounded tab and a machine waking from
 * sleep, and both are handled: the loop stops on hide, and the first frame back
 * reports a delta of zero rather than however long it was away.
 *
 * THE HOUR IS COMPUTED ONCE A FRAME AND PASSED DOWN. Every module could derive
 * it again from elapsed seconds, and two of them disagreeing by a frame about
 * what time it is would be a very hard bug to see.
 */

import { GARDEN_CONFIG } from './config.min.js';
import { hourAt, yearAt, seasonAt, snowCoverageAt, startSeconds } from './clock.min.js';
import { initSky, updateSky, disposeSky } from './sky.min.js';
import {
    initTerrain, updateTerrain, disposeTerrain, getGroundMesh, snapToGrid, nearestFreeCell
} from './terrain.min.js';
import { initForest, updateForest, disposeForest } from './forest.min.js';
import { initVista, updateVista, disposeVista } from './vista.min.js';
import { initWildlife, updateWildlife, disposeWildlife } from './wildlife.min.js';
import { createWeather, stepWeather, weatherWords } from './weather.min.js';
import { initPrecipitation, updatePrecipitation, disposePrecipitation } from './precip.min.js';
import { resolveSpecies } from './species.min.js';
import { createTree, updateTree, disposeTree } from './tree.min.js';
import {
    initGarden, plantTree, restoreTrees, removeTree, clearGarden, waterTree,
    updateGarden, getTrees, getOccupied, isFull, capacity, ageYears,
    entryForObject, serialize, hydrate, needsWater
} from './garden.min.js';
import {
    initUi, updateHud, showHud, openPlantModal, isPlantOpen,
    openTreeCard, closeTreeCard, isCardOpen, refreshTreeCard, getCardEntry,
    anyModalOpen, getPreviewCanvas, toast, openResetModal
} from './ui.min.js';
import { getProofOfWork, bufToHex } from '../../shared/js/boot-1.0.0.min.js';
import {
    initPortraitControls, updatePortraitControls, gestureClaimedTap
} from '../../shared/js/pan-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';

// ---- Application state ----------------------------------------------------

const state = {
    running: false,
    loaded: false,
    mobile: false,
    reducedMotion: false,
    storageAvailable: true,
    lastTime: 0,
    elapsedSeconds: 0
};

const quality = {
    ceiling: 1, scale: 1, frame: 0, best: Infinity, since: 0, frames: 0
};

let renderer = null;
let scene = null;
let camera = null;
let weather = null;

let canvas, loadingScreen, blocker;
let cleanupController = null;

// The plant flow's pending spot, chosen when the visitor tapped the grass.
let pendingCell = null;

// ---- Device and preference checks -----------------------------------------

export function detectMobile() {
    if (typeof window === 'undefined') return false;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return Boolean(coarse) || Math.min(window.innerWidth, window.innerHeight) < 600;
}

/** Whether the visitor has asked for less movement.
 *
 *  THE ANSWER IS NOT "STOP TIME". Every other scene on the site can honour this
 *  setting by holding still and this one cannot: time passing IS the
 *  experience, and a frozen garden is a broken page rather than a calm one. The
 *  flag damps camera easing, particle counts, sway, the lightning envelope, and
 *  how fast the weather crosses over. There is deliberately no code path from
 *  it to `state.elapsedSeconds`. */
export function prefersReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---- Initialization -------------------------------------------------------

async function init() {
    state.mobile = detectMobile();
    state.reducedMotion = prefersReducedMotion();
    setMobile(state.mobile);

    canvas = document.getElementById('scene');
    loadingScreen = document.getElementById('loading-screen');
    blocker = document.getElementById('blocker');
    if (!canvas) return;

    applySiteLinks();

    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(GARDEN_CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Preparing the ground…', 30);
    buildRenderer();
    buildScene();
    placeCamera();

    updateLoadingStatus('Hanging the sky…', 45);
    initSky(scene, renderer, GARDEN_CONFIG, { mobile: state.mobile });

    updateLoadingStatus('Laying out the plot…', 60);
    initTerrain(scene, GARDEN_CONFIG, { mobile: state.mobile });

    updateLoadingStatus('Raising the hills…', 64);
    initVista(scene, camera, GARDEN_CONFIG);

    updateLoadingStatus('Growing the wood…', 70);
    initForest(scene, GARDEN_CONFIG, { mobile: state.mobile });

    updateLoadingStatus('Letting the wildlife in…', 74);
    initWildlife(scene, GARDEN_CONFIG, { mobile: state.mobile });

    updateLoadingStatus('Watching the weather…', 78);
    weather = createWeather('sunny');
    initPrecipitation(scene, camera, GARDEN_CONFIG, {
        mobile: state.mobile,
        reducedMotion: state.reducedMotion,
        pixelRatio: quality.ceiling
    });

    updateLoadingStatus('Looking for your garden…', 84);
    initGarden(scene, { mobile: state.mobile, reducedMotion: state.reducedMotion });
    restoreGarden();
    buildPreview();

    const openingHour = hourAt(state.elapsedSeconds);
    const openingSnow = snowCoverageAt(openingHour);
    updateSky(openingHour, 0, openingSnow, 0, 0);
    updateTerrain(openingHour, openingSnow);
    updateForest(openingHour, openingSnow);
    updateVista(openingHour, state.elapsedSeconds, openingSnow, 0, camera);

    updateLoadingStatus('Opening the gate…', 94);
    initUi({
        onPlant: handlePlant,
        onCustomChange: handleCustomChange,
        onWater: handleWater,
        onRemove: handleRemove,
        onReset: applyReset
    });
    setupEventListeners();

    updateLoadingStatus('Ready', 100);
    setTimeout(() => {
        if (loadingScreen) loadingScreen.classList.add('hidden');
        state.loaded = true;
        // EVERY .ui-float IS display:none UNTIL THIS LINE. Correct markup on
        // its own renders an invisible Home button. The pan and zoom row tags
        // itself .ui-float too, so it is revealed by the same sweep.
        document.querySelectorAll('.ui-float').forEach(el => el.classList.add('visible'));
        showHud();
    }, 400);

    track('session-start', { device: state.mobile ? 'touch' : 'desktop' });
    if (getTrees().length) {
        // The question this whole experience is built around: do people come
        // back? This is the ping that answers it.
        track('garden-restored', { trees: getTrees().length });
    }
    _sessionStart = Date.now();

    start();
}

function updateLoadingStatus(message, progress) {
    const statusEl = document.getElementById('load-status');
    const progressEl = document.getElementById('load-progress');
    if (statusEl) statusEl.textContent = message;
    if (progressEl) progressEl.style.width = `${progress}%`;
}

// ---- Renderer, scene, camera ----------------------------------------------

function buildRenderer() {
    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !state.mobile,
        powerPreference: 'high-performance'
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Filmic tone mapping, matching highwater. A garden under a midday sun has
    // the same problem a glinting sea does: a linear pipeline clips the bright
    // side of every leaf to flat white. It also means every colour decision
    // here has to be reasoned about in ENCODED screen values, which is a trap
    // worth naming because it cost real time on the ocean scene.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = GARDEN_CONFIG.sky.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Not automatic: the sun moves slowly, so sky.js refreshes the map a few
    // times a second, which removes a full shadow pass from most frames.
    renderer.shadowMap.autoUpdate = false;

    quality.ceiling = pixelRatioCeiling();
    renderer.setPixelRatio(quality.ceiling * quality.scale);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
}

function pixelRatioCeiling() {
    const q = GARDEN_CONFIG.quality;
    const cap = state.mobile ? q.maxPixelRatioMobile : q.maxPixelRatio;
    return Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, cap);
}

function buildScene() {
    scene = new THREE.Scene();
}

/**
 * The composed viewpoint for an aspect ratio. Pure, because it is the one
 * piece of arithmetic in this file worth asserting, and because under the test
 * harness every number read back off a THREE camera is zero.
 *
 * A PORTRAIT FRAME IS ABOUT A THIRD AS WIDE. three.js fov is vertical, so a
 * phone held upright keeps the height and loses both sides. Below an aspect of
 * 1 this widens to the portrait fov and dollies straight back until the
 * composed half-width fits at focusZ. It only ever dollies BACK.
 */
export function framingFor(aspect, cam = GARDEN_CONFIG.camera) {
    const portrait = cam.portrait || {};
    let fov = cam.fov;
    let z = cam.position.z;

    if (aspect < 1 && portrait.minHalfWidth) {
        fov = portrait.fov || fov;
        const halfFovRad = (fov / 2) * Math.PI / 180;
        const needed = portrait.focusZ + portrait.minHalfWidth / (Math.tan(halfFovRad) * aspect);
        z = Math.max(z, needed);
    }

    return { fov, z };
}

function placeCamera() {
    const cam = GARDEN_CONFIG.camera;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);

    if (!camera) {
        camera = new THREE.PerspectiveCamera(cam.fov, aspect, cam.near, cam.far);
        camera.up.set(0, 1, 0);
    }

    const { fov, z } = framingFor(aspect, cam);
    camera.fov = fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camera.position.set(cam.position.x, cam.position.y, z);
    camera.lookAt(cam.lookAt.x, cam.lookAt.y, cam.lookAt.z);
}

// ---- Quality adaptation ----------------------------------------------------

/**
 * How far below the device's own pixel ratio to render. Pure, so the whole
 * policy can be tested without a GPU.
 *
 * MEASURED AGAINST THE DISPLAY, NOT AGAINST 60. A fixed millisecond budget
 * calls a 30 Hz panel permanently slow and never notices a 120 Hz one
 * struggling, so the yardstick is the best frame this device has managed.
 * `slowSeconds` is the backstop for a device that was never fast even once,
 * which the relative test cannot see by construction.
 */
export function nextPixelScale(sample, config = GARDEN_CONFIG) {
    const q = config.quality;
    const { frame, best, scale, since, frames } = sample;
    if (frames < q.settleFrames) return scale;

    const slow = frame > best * q.slowRatio || frame > q.slowSeconds;
    if (slow) {
        if (since < q.holdDownSeconds) return scale;
        return Math.max(q.minScale, scale * q.stepDown);
    }
    if (scale < 1 && frame < best * q.fastRatio && since >= q.holdUpSeconds) {
        return Math.min(1, scale * q.stepUp);
    }
    return scale;
}

function adaptQuality(delta) {
    const q = GARDEN_CONFIG.quality;
    if (!renderer || delta <= 0 || delta > q.ignoreAboveSeconds) return;

    quality.frame = quality.frame === 0
        ? delta : quality.frame + (delta - quality.frame) * q.smoothing;
    quality.since += delta;
    quality.frames += 1;
    if (quality.frames >= q.settleFrames && quality.frame < quality.best) {
        quality.best = quality.frame;
    }

    const next = nextPixelScale(quality, GARDEN_CONFIG);
    if (Math.abs(next - quality.scale) < 0.005) return;
    quality.scale = next;
    quality.since = 0;
    renderer.setPixelRatio(quality.ceiling * quality.scale);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
}

// ---- Persistence -----------------------------------------------------------
//
// TWO localStorage CALLS IN THE WHOLE SCENE, both here, both wrapped. Private
// browsing and blocked-storage modes throw on write, and a garden that works
// perfectly for the session is a far better answer than a page that fails to
// load. Writes happen on CHANGE and on the page being hidden, never on a
// timer: there is no reason to write sixty times a second.

// True once this session has seen the key exist, by reading it or writing it.
// See the note in save(): it is what tells a deliberate deletion apart from a
// first visit.
let storageSeen = false;

function loadRaw() {
    try {
        const text = localStorage.getItem(GARDEN_CONFIG.storage.key);
        if (text) storageSeen = true;
        return text ? JSON.parse(text) : null;
    } catch (e) {
        state.storageAvailable = false;
        return null;
    }
}

/**
 * Write the garden, unless somebody has just deleted it.
 *
 * A SAVE MUST NOT RESURRECT A GARDEN THE VISITOR CLEARED. Reloading the page
 * fires `visibilitychange` and then `pagehide`, and both of those save. So
 * deleting the key by hand and refreshing used to do nothing at all: the
 * outgoing page wrote the old garden straight back before the incoming one
 * could look. The delete was real, it was simply undone half a second later by
 * the very act of reloading.
 *
 * The guard is the difference between "this key never existed" (a first visit,
 * which must save) and "this key existed and is now gone" (somebody cleared
 * it, which must not be written back). `handleReset` clears the flag when it
 * removes the key, so starting a new garden saves normally from then on.
 */
function save() {
    if (!state.storageAvailable) return;
    try {
        if (storageSeen && localStorage.getItem(GARDEN_CONFIG.storage.key) === null) {
            return;
        }
        const payload = serialize(getTrees().map((t) => t.record), state.elapsedSeconds);
        localStorage.setItem(GARDEN_CONFIG.storage.key, JSON.stringify(payload));
        storageSeen = true;
    } catch (e) {
        state.storageAvailable = false;
        noteStorageUnavailable();
    }
}

function restoreGarden() {
    const raw = loadRaw();
    if (!state.storageAvailable) {
        noteStorageUnavailable();
        state.elapsedSeconds = startSeconds();
        return;
    }
    const { elapsedSeconds, trees, dropped, restored } = hydrate(raw);
    // A garden that was READ resumes exactly where it was left. Anything else,
    // including an absent key, unreadable JSON, or a schema this build does not
    // know, is a brand new garden and opens at sunrise in spring.
    state.elapsedSeconds = restored ? elapsedSeconds : startSeconds();
    if (trees.length) restoreTrees(trees);
    if (dropped > 0) {
        console.warn(`[Garden] ${dropped} saved tree(s) did not survive validation and were dropped.`);
    }
}

/** One polite line on the welcome card. The garden still works perfectly for
 *  the session, so this says what will happen rather than apologising. */
function noteStorageUnavailable() {
    const hint = document.getElementById('storage-note');
    if (hint) hint.textContent =
        'This browser will not let the page save, so your garden will last for this visit only.';
}

// ---- Event wiring ----------------------------------------------------------

function setupEventListeners() {
    cleanupController = new AbortController();
    const signal = cleanupController.signal;

    window.addEventListener('pagehide', cleanup);
    window.addEventListener('resize', onResize, { signal });

    // iOS Safari ignores `user-scalable=no`, so the only way to keep the 3D
    // view from being pinch-zoomed there is to block Safari's own gesture
    // events. Scoped to this page: the 2D content pages stay zoomable.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(type =>
        document.addEventListener(type, (e) => e.preventDefault(), { passive: false, signal }));

    // A backgrounded tab stops drawing. It matters more here than anywhere
    // else on the site: a delta that leaked through would AGE THE GARDEN.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            save();
            stop();
        } else if (!state.running && state.loaded) {
            start();
        }
    }, { signal });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') endSession();
    });
    window.addEventListener('pagehide', () => { save(); endSession(); });

    if (blocker) {
        const dismiss = (e) => {
            if (e) e.preventDefault();
            beginTending();
        };
        blocker.addEventListener('click', dismiss, { signal });
        blocker.addEventListener('touchend', dismiss, { signal });
        document.addEventListener('keydown', (event) => {
            if (event.code === 'Enter' || event.code === 'Space') {
                if (!blocker.classList.contains('hidden')) beginTending();
            }
        }, { signal });
    }

    // A tap on the scene. gestureClaimedTap() first, always: a tap that merely
    // ends a swipe or a pinch belongs to the gesture, not to the garden, and
    // this is the single most likely source of "it planted a tree when I was
    // only looking around".
    canvas.addEventListener('click', (event) => {
        if (gestureClaimedTap()) return;
        handleSceneTap(event.clientX, event.clientY);
    }, { signal });
    canvas.addEventListener('touchend', (event) => {
        if (gestureClaimedTap()) return;
        const touch = event.changedTouches && event.changedTouches[0];
        if (touch) handleSceneTap(touch.clientX, touch.clientY);
    }, { signal });

    const reset = document.getElementById('reset-btn');
    if (reset) reset.addEventListener('click', handleReset, { signal });

    // Pan, tilt, and zoom. ON AT EVERY ASPECT, unlike the other composed
    // views: a 24 metre plot is wider than any screen, so a desktop visitor
    // needs to reach the far corners as much as a phone does. `landscapeFov`
    // is required alongside `alwaysOn`, because placeCamera composes a
    // different fov per orientation and the zoom anchor has to follow it.
    initPortraitControls({
        getCamera: () => camera,
        lookAt: GARDEN_CONFIG.camera.lookAt,
        baseFov: GARDEN_CONFIG.camera.portrait.fov,
        landscapeFov: GARDEN_CONFIG.camera.fov,
        pan: GARDEN_CONFIG.camera.portrait.pan,
        zoom: GARDEN_CONFIG.camera.portrait.zoom,
        alwaysOn: true,
        extraClass: 'always-on',
        surface: canvas,
        onFirstUse: (kind) => track(`view-${kind}`),
        signal
    });
}

function onResize() {
    if (!renderer || !camera) return;
    placeCamera();
    quality.ceiling = pixelRatioCeiling();
    renderer.setPixelRatio(quality.ceiling * quality.scale);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
}

function beginTending() {
    if (!state.loaded || !blocker || blocker.classList.contains('hidden')) return;
    blocker.classList.add('hidden');
    track('begin-tending');

    // THE FIRST THING A VISITOR SEES IS THE GARDEN, NOT A DIALOG. An earlier
    // version opened the plant modal automatically on a first visit, on the
    // theory that an empty plot leaves people wondering what to do. It was
    // wrong twice over: dismissing the welcome card is a request to LOOK at
    // the place, and covering it immediately takes that away, and worse, the
    // auto-opened modal had to invent a planting spot, which quietly broke the
    // one rule the interaction has (a tree goes where you tapped).
    //
    // A toast does the same teaching job without taking the view or the
    // choice. It waits a moment so it arrives after the eye has settled, and
    // only when there is nothing planted yet.
    if (!getTrees().length) {
        setTimeout(() => {
            if (!getTrees().length && !anyModalOpen()) {
                toast('Tap any patch of grass to plant your first tree.', 4200);
            }
        }, 2200);
    }
}

function applySiteLinks() {
    const site = GARDEN_CONFIG.site;
    const home = document.getElementById('home-btn');
    if (home) {
        home.href = site.home.path;
        home.removeAttribute('target');
        home.removeAttribute('rel');
        home.title = site.home.title;
        home.setAttribute('aria-label', site.home.title);
    }
}

// ---- Picking ---------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tolPointer = new THREE.Vector2();
const TAP_TOLERANCE_PX = 26;

/** Nearest tree under a screen point, with the house tap tolerance so a
 *  sapling is reachable with a fingertip. */
function pickTree(clientX, clientY) {
    const targets = getTrees().map((t) => t.tree.group);
    if (!targets.length || !camera) return null;
    pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    let hits = raycaster.intersectObjects(targets, true);
    if (hits.length) return entryForObject(hits[0].object);

    const rx = (TAP_TOLERANCE_PX * 2) / window.innerWidth;
    const ry = (TAP_TOLERANCE_PX * 2) / window.innerHeight;
    for (const rf of [0.5, 1]) {
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            tolPointer.set(pointer.x + Math.cos(ang) * rx * rf, pointer.y + Math.sin(ang) * ry * rf);
            raycaster.setFromCamera(tolPointer, camera);
            hits = raycaster.intersectObjects(targets, true);
            if (hits.length) return entryForObject(hits[0].object);
        }
    }
    return null;
}

function pickGround(clientX, clientY) {
    const ground = getGroundMesh();
    if (!ground || !camera) return null;
    pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(ground, false);
    return hits.length ? hits[0].point : null;
}

function handleSceneTap(clientX, clientY) {
    if (!state.loaded || anyModalOpen()) return;
    if (blocker && !blocker.classList.contains('hidden')) return;

    // A tree outranks the ground: tapping a trunk should never plant a second
    // tree behind it.
    const tree = pickTree(clientX, clientY);
    if (tree) {
        openTreeCard(tree, ageYears(tree.record, state.elapsedSeconds));
        track('tree-opened', { species: tree.record.species });
        return;
    }

    const point = pickGround(clientX, clientY);
    if (!point) return;

    const cell = snapToGrid(point.x, point.z);
    // THE INTERACTION NEVER SAYS NO. A tap on an occupied cell, or just
    // outside the plantable area, resolves to the nearest spot that works.
    const free = nearestFreeCell(cell.gx, cell.gz, getOccupied());
    if (!free) { toast('There is no room left in this plot.'); return; }
    pendingCell = free;
    openPlantModal({ full: isFull() });
}

// ---- The plant flow --------------------------------------------------------

function handlePlant(selection) {
    if (isFull()) {
        toast(`This plot holds ${capacity()} trees. Remove one to make room.`);
        return;
    }
    // Normally the spot came from the tap that opened the modal. The fallback
    // is for any path that reaches the modal without one (a keyboard route, a
    // future entry point): plant near the middle rather than silently doing
    // nothing, because a Plant button that does nothing at all is the worst
    // answer available.
    const cell = pendingCell || nearestFreeCell(0, 0, getOccupied());
    if (!cell) { toast('There is no room left in this plot.'); return; }

    const entry = plantTree(selection.species, selection.custom,
        cell.gx, cell.gz, state.elapsedSeconds);
    pendingCell = null;
    if (!entry) { toast('That spot is taken.'); return; }
    toast(`${entry.resolved.name} planted. It will take about four years to fill out.`);
    track('tree-planted', {
        species: entry.record.species,
        customised: isCustomised(selection.custom) ? 1 : 0
    });
    save();
}

function isCustomised(custom) {
    for (const key of Object.keys(custom)) {
        const base = key === 'tint' ? 0 : 1;
        if (Math.abs(custom[key] - base) > 0.001) return true;
    }
    return false;
}

function handleWater() {
    const entry = getCardEntry();
    if (!entry) return;
    const result = waterTree(entry, state.elapsedSeconds);
    toast(result === 'revived'
        ? 'Watered. Look for new buds along the branches.'
        : 'Watered. It looks pleased.');
    track('tree-watered', { revived: result === 'revived' ? 1 : 0 });
    refreshTreeCard(ageYears(entry.record, state.elapsedSeconds));
    save();
}

function handleRemove(entry) {
    if (!entry) return;
    removeTree(entry);
    toast('Removed. The ground is free again.');
    track('tree-removed');
    save();
}

function handleReset() {
    const trees = getTrees().length;
    // An empty plot has nothing to lose, so it clears without being asked.
    // Otherwise the scene's own dialog asks, and the answer arrives back
    // through onReset. If the markup is ever missing, clearing still works
    // rather than becoming unreachable.
    if (trees > 0 && openResetModal(trees)) return;
    applyReset();
}

function applyReset() {
    const trees = getTrees().length;
    clearGarden();
    state.elapsedSeconds = startSeconds();
    try {
        localStorage.removeItem(GARDEN_CONFIG.storage.key);
    } catch (e) { /* nothing to remove if storage is unavailable */ }
    // The key is gone on purpose and this session is starting over, so the
    // next save is a first save rather than a resurrection. Without this the
    // guard in save() would see a vanished key forever and never write again.
    storageSeen = false;
    closeTreeCard();
    toast('A new garden, and a fresh plot of grass.');
    track('garden-cleared', { trees });
}

// ---- The live preview ------------------------------------------------------
//
// ONE WEBGL CONTEXT FOR THE WHOLE PAGE. The preview is rendered by the main
// renderer into a corner of the main canvas (which the modal is covering
// anyway) and then copied into the modal's own 2D canvas. A second context for
// a thumbnail would be an unforced error on a phone.

let previewScene = null;
let previewCamera = null;
let previewTree = null;
let previewResolved = null;
let previewCtx = null;
let previewTimer = 0;
let previewPending = null;
const PREVIEW_PX = 256;
const previousClear = new THREE.Color();
const scratchColor = new THREE.Color();

function buildPreview() {
    previewScene = new THREE.Scene();
    previewCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    const key = new THREE.DirectionalLight(0xfff4e2, 2.6);
    key.position.set(6, 10, 8);
    previewScene.add(key);
    previewScene.add(new THREE.HemisphereLight(0xbcd8ee, 0x4a5a34, 0.9));
    previewScene.add(new THREE.AmbientLight(0xffffff, 0.35));
}

function handleCustomChange(selection) {
    previewPending = { species: selection.species, custom: { ...selection.custom } };
    // Debounced, so dragging a slider does not bake sixty skeletons a second.
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(rebuildPreview, 120);
}

function rebuildPreview() {
    if (!previewScene || !previewPending) return;
    const { species, custom } = previewPending;
    if (previewTree) {
        previewScene.remove(previewTree.group);
        disposeTree(previewTree);
        previewTree = null;
    }
    previewResolved = resolveSpecies(species, custom);
    if (!previewResolved) return;
    // A fixed seed, so moving a slider shows the effect of the slider rather
    // than a different tree. The planted tree gets its own seed.
    //
    // THE BUDGET FOLLOWS THE DEVICE, NOT THE THUMBNAIL. Hardcoding the mobile
    // cap here meant a desktop visitor was shown a tree the desktop would never
    // plant: the cap truncates the LAST-BORN segments, which are the outer
    // canopy, so the Coast Redwood lost 728 segments down to 480 and previewed
    // as a spindly pale thing rather than as the giant its own description
    // promises. The small species were all under the cap, which is why only the
    // large ones looked wrong.
    previewTree = createTree(previewResolved, 0x5EED, { mobile: state.mobile });
    previewScene.add(previewTree.group);

    const h = previewResolved.matureHeight;
    previewCamera.position.set(h * 1.05, h * 0.72, h * 1.35);
    previewCamera.lookAt(0, h * 0.45, 0);
}

function renderPreview(time) {
    if (!previewTree || !renderer || !previewScene) return;
    const target = getPreviewCanvas();
    if (!target) return;

    // Full grown and slowly turning, so the visitor is choosing the tree they
    // will eventually have rather than the sapling they are about to plant.
    previewTree.group.rotation.y = state.reducedMotion ? 0.6 : time * 0.35;
    updateTree(previewTree, {
        growth: 1, health: 1, leaf: 1, color: 0, spring: 0, drop: 0, bud: 0,
        snow: 0, wind: { x: 0.05, z: 0 }, time
    }, previewResolved);

    const size = Math.round(PREVIEW_PX);
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;

    // WebGL measures its viewport from the BOTTOM of the buffer, so this rect
    // is the TOP left corner of the picture. drawImage measures from the top,
    // which is why the copy below reads from (0, 0) and not from the same
    // numbers. Getting that backwards copies a corner of the sky instead.
    previousClear.copy(renderer.getClearColor(scratchColor));
    const previousAlpha = renderer.getClearAlpha();

    renderer.setScissorTest(true);
    renderer.setViewport(0, h - size, size, size);
    renderer.setScissor(0, h - size, size, size);
    renderer.setClearColor(0x1d2a18, 1);
    renderer.clear();
    renderer.render(previewScene, previewCamera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    renderer.setClearColor(previousClear, previousAlpha);

    if (!previewCtx) {
        target.width = size;
        target.height = size;
        previewCtx = target.getContext('2d');
    }
    if (previewCtx) {
        // Same task as the render, so the drawing buffer is still valid. That
        // is why the main renderer needs no preserveDrawingBuffer, which would
        // cost every frame of the whole scene to serve one thumbnail.
        previewCtx.drawImage(renderer.domElement, 0, 0, size, size, 0, 0, size, size);
    }
}

// ---- Render loop -----------------------------------------------------------

function start() {
    if (state.running || !renderer) return;
    state.running = true;
    // Cleared so the first frame back from a hidden tab reports a delta of
    // zero rather than however long the tab was away. This is the line that
    // stops a backgrounded tab from ageing the garden.
    state.lastTime = 0;
    renderer.setAnimationLoop(animate);
}

function stop() {
    state.running = false;
    if (renderer) renderer.setAnimationLoop(null);
}

let saveDue = 0;

function animate() {
    if (!state.running) return;
    const now = performance.now();
    const delta = state.lastTime === 0
        ? 0
        : Math.min((now - state.lastTime) / 1000, GARDEN_CONFIG.clock.maxFrameSeconds);
    state.lastTime = now;

    // THE ONLY PLACE THE GARDEN'S CLOCK MOVES.
    state.elapsedSeconds += delta;

    adaptQuality(delta);

    const hour = hourAt(state.elapsedSeconds);
    const snow = snowCoverageAt(hour);

    stepWeather(weather, delta, hour, Math.random, state.reducedMotion);
    const flash = updatePrecipitation(delta, state.elapsedSeconds, weather, snow, Math.random);

    updateSky(hour, delta, snow, weather.gloom, flash);
    updateTerrain(hour, snow);
    updateForest(hour, snow);
    updateVista(hour, state.elapsedSeconds, snow, weather.gloom, camera);
    updateWildlife(hour, state.elapsedSeconds, snow);
    updateGarden(delta, state.elapsedSeconds, {
        rain: weather.rain,
        snow,
        wind: weather.wind
    });
    updateHud(yearAt(state.elapsedSeconds), state.elapsedSeconds, weatherWords(weather));
    if (isCardOpen()) {
        const entry = getCardEntry();
        if (entry) refreshTreeCard(ageYears(entry.record, state.elapsedSeconds));
    }

    // After everything else, because the pan part re-applies its offsets on
    // top of whatever placeCamera composed and must have the last word.
    updatePortraitControls(delta);

    if (renderer && scene && camera) renderer.render(scene, camera);
    if (isPlantOpen()) renderPreview(state.elapsedSeconds);

    // A slow heartbeat for growth, which changes continuously and has no
    // event to hang a write on. Everything else saves on the change itself.
    saveDue += delta;
    if (saveDue > 20) { saveDue = 0; save(); }
}

/** The garden's current time, derived rather than stored so there is no second
 *  copy of the clock to fall out of step. */
export function getClock() {
    const hour = hourAt(state.elapsedSeconds);
    return {
        elapsedSeconds: state.elapsedSeconds,
        hour,
        year: yearAt(state.elapsedSeconds),
        season: seasonAt(hour),
        snowCoverage: snowCoverageAt(hour)
    };
}

export function getWeather() { return weather; }

// ---- Cleanup / state -------------------------------------------------------

function cleanup() {
    stop();
    disposePrecipitation();
    disposeForest();
    disposeVista();
    disposeWildlife();
    disposeTerrain();
    disposeSky();
    if (cleanupController) cleanupController.abort();
}

// Dwell time. This Date.now() is the ONE in the file, and it measures the
// visitor's real wall-clock visit for the anonymous counter. It never touches
// the garden's clock.
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

// ---- Boot ------------------------------------------------------------------

export function hasWebGL() {
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
    } catch (e) { /* ignore, we're redirecting regardless */ }
    setTimeout(() => { window.location.replace('/'); }, 2500);
}

function boot() {
    if (!hasWebGL()) { fallbackTo2D(); return; }
    init().catch((err) => {
        console.error('[Garden] 3D init failed, falling back to the 2D site:', err);
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

export const __test__ = { bufToHex, quality, state, placeCamera, animate, needsWater };
