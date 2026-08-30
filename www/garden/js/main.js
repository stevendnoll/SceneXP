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
    initTerrain, updateTerrain, disposeTerrain, getGroundMesh, snapToGrid,
    nearestFreeCell, cellCenter, heightAt
} from './terrain.min.js';
import { initForest, updateForest, disposeForest } from './forest.min.js';
import { initVista, updateVista, disposeVista } from './vista.min.js';
import { initWildlife, updateWildlife, disposeWildlife } from './wildlife.min.js';
import { createWeather, stepWeather, weatherWords, overcastAt } from './weather.min.js';
import { initPrecipitation, updatePrecipitation, disposePrecipitation } from './precip.min.js';
import { resolveSpecies } from './species.min.js';
import {
    dollyView, applyDollyDelta, dollyLimits, getDolly, resetView
} from './view.min.js';
import {
    pickBase, pickDrop, dropScreenY, dropPresence, thirstyCount,
    getBedMesh, getLevelMesh, bedSpan
} from './beds.min.js';
import { createTree, updateTree, disposeTree } from './tree.min.js';
import {
    initGarden, plantTree, restoreTrees, removeTree, clearGarden, waterTree,
    updateGarden, getTrees, getOccupied, isFull, capacity, ageYears,
    serialize, hydrate, needsWater, disposeGarden
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
    // THE GARDEN'S CALENDAR. Season, year, sun, snow, growth, thirst and
    // health all derive from it, and it is what gets persisted. It does not
    // move until the visitor has dismissed the welcome card: a year should not
    // pass while somebody is still reading what the place is.
    elapsedSeconds: 0,
    // THE ANIMATION CLOCK, which always moves. Sway, flutter, falling rain and
    // anything the wildlife module is flying ride this instead, so the welcome
    // frame is alive while the calendar holds. Never persisted and never read
    // by any rule: freezing it would not pause the garden, it would photograph
    // it, and a photograph of rain is streaks hanging motionless in the air,
    // which reads as broken rather than as still.
    sceneSeconds: 0,
    // WHETHER ANYTHING IS ACTUALLY FALLING, from the last frame's `fall`. The
    // tree card needs it for one line of copy and can be opened by a tap at any
    // moment, so it is latched here rather than threaded through the pick path.
    // The rate the renderer used, never the state machine's intent: same rule
    // the season chip follows, and for the same reason.
    falling: false
};

/**
 * What the tree card needs and cannot derive from a tree's record.
 *
 * The hour, for the blossom and fruit stage, and whether it is raining, for the
 * line that explains why a young tree is still thirsty in a downpour.
 */
function cardContext() {
    return { hour: hourAt(state.elapsedSeconds), falling: state.falling };
}

const quality = {
    ceiling: 1, scale: 1, frame: 0, best: Infinity, since: 0, frames: 0
};

let renderer = null;
let scene = null;
let camera = null;
let weather = null;

let canvas, loadingScreen, blocker, waterAllBtn;
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
    waterAllBtn = document.getElementById('water-all');
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
    updateSky(openingHour, 0, openingSnow, 0, 0, 0);
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
    installDebugProbe();

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

/**
 * The composed viewpoint, in the shape `dollyView` wants. The dolly's zero.
 */
function composedView() {
    const cam = GARDEN_CONFIG.camera;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    return {
        z: framingFor(aspect, cam).z,
        y: cam.position.y,
        lookY: cam.lookAt.y,
        lookZ: cam.lookAt.z
    };
}

/**
 * THE ONE OBJECT THE AIM LIVES IN, and it is deliberately not the frozen
 * config. The shared pan part reads `lookAt.x/y/z` off whatever object it was
 * handed, every frame, so handing it this one means the dolly and the tilt
 * re-aim the composed view and the part's own yaw and tilt compose on top for
 * free. Handing it `GARDEN_CONFIG.camera.lookAt` instead, as this used to,
 * meant the part would drag the aim back to the composed point every frame and
 * undo the dolly.
 */
const viewTarget = {
    x: GARDEN_CONFIG.camera.lookAt.x,
    y: GARDEN_CONFIG.camera.lookAt.y,
    z: GARDEN_CONFIG.camera.lookAt.z
};

function placeCamera() {
    const cam = GARDEN_CONFIG.camera;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);

    if (!camera) {
        camera = new THREE.PerspectiveCamera(cam.fov, aspect, cam.near, cam.far);
        camera.up.set(0, 1, 0);
    }

    const { fov } = framingFor(aspect, cam);
    camera.fov = fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    applyView();
}

/**
 * Put the camera where the dolly and the tilt say, and aim it.
 *
 * Runs every frame, BEFORE `updatePortraitControls`. That ordering is the whole
 * of the double-ownership question: this sets the composed position and aim,
 * and the part then either refines the aim with its own yaw and tilt or leaves
 * it exactly as found. Either way the last word about the aim is correct, and
 * neither owner has to know what the other did.
 */
function applyView() {
    if (!camera) return;
    const cam = GARDEN_CONFIG.camera;
    const view = dollyView(getDolly(), composedView());
    camera.position.set(cam.position.x, view.y, view.z);
    viewTarget.x = cam.lookAt.x;
    viewTarget.y = view.lookY;
    viewTarget.z = view.lookZ;
    camera.lookAt(viewTarget.x, viewTarget.y, viewTarget.z);
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

// Set once the page is going away, and never cleared: there is no coming back
// from teardown, and a write after it could only erase the garden.
let tornDown = false;

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
    // NOTHING MAY BE WRITTEN AFTER TEARDOWN. Teardown is what empties the tree
    // list, so a save that runs afterwards can only ever put an empty garden
    // over a real one. See cleanup().
    if (tornDown || !state.storageAvailable) return;
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

    // A REAL BUTTON IN THE DOM, and that is the point of it as much as the
    // convenience is. Every other way to water a tree needs a pointer aimed at
    // a few pixels of 3D scene, so before this the keyboard's only route to the
    // care loop was the tree card's own button, which a droplet tap now bypasses
    // for exactly the trees that need watering. This one is reached by Tab.
    if (waterAllBtn) waterAllBtn.addEventListener('click', handleWaterAll, { signal });

    // Pan, tilt, and zoom. ON AT EVERY ASPECT, unlike the other composed
    // views: a 24 metre plot is wider than any screen, so a desktop visitor
    // needs to reach the far corners as much as a phone does. `landscapeFov`
    // is required alongside `alwaysOn`, because placeCamera composes a
    // different fov per orientation and the zoom anchor has to follow it.
    initPortraitControls({
        getCamera: () => camera,
        // The mutable one, not the frozen config. See viewTarget.
        lookAt: viewTarget,
        baseFov: GARDEN_CONFIG.camera.portrait.fov,
        landscapeFov: GARDEN_CONFIG.camera.fov,
        pan: GARDEN_CONFIG.camera.portrait.pan,
        // The zoom pair still renders, because it is what carries the pinch
        // and the arrow keys. `zoomDelegate` takes what it means: every zoom
        // input arrives here as a signed delta and the FOV is never touched.
        zoom: GARDEN_CONFIG.camera.portrait.zoom,
        zoomDelegate: {
            onDelta: applyDollyDelta,
            limits: dollyLimits
        },
        // The look controls together at the bottom centre, the lens stacked in
        // its own corner. Both are the shared part's own buttons, so W and S
        // light the tilt pair and there is exactly ONE tilt axis.
        tiltButtons: true,
        zoomContainerClass: 'garden-zoom',
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
    // AT ONCE RATHER THAN ON THE NEXT HEARTBEAT. A visitor coming back to a
    // garden that went thirsty while they were away should meet the offer in
    // the first frame they see, not a second into it.
    syncWaterAll();

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
const basePoint = new THREE.Vector3();
const baseEdge = new THREE.Vector3();
const gaugePoint = new THREE.Vector3();

/** Nearest tree under a screen point, with the house tap tolerance so a
 *  sapling is reachable with a fingertip. */
/**
 * Every planted tree's base, projected to CSS pixels.
 *
 * THE BED IS NEVER RAYCAST (M10-3). A bed is a disc lying on the ground and the
 * camera looks along that ground at about 17 degrees, so at the back of the
 * plot it is five pixels tall: a ray against it is a coin toss. Its base point
 * is projected instead, and `pickBase` chooses the nearest one within a radius
 * that follows the drawn bed.
 *
 * `radiusPx` is the bed's own projected half-width, so the target matches what
 * the visitor sees. Both numbers come from the same projection, so they cannot
 * disagree about where a bed is.
 *
 * `dropY` and `thirst` are the droplet's half of the same story. The droplet is
 * drawn by lifting the GAUGE'S anchor by `dropRisePx` inside the shader, so the
 * target is found by projecting that same anchor and subtracting that same
 * number here. Three places would have been a bug waiting; there is one number
 * and it lives in the config.
 */
function projectBases() {
    const bases = [];
    if (!camera) return bases;
    const B = GARDEN_CONFIG.garden.bed;
    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;

    for (const entry of getTrees()) {
        const { x, z } = cellCenter(entry.record.gx, entry.record.gz);
        const span = bedSpan(x, z);
        basePoint.set(x, heightAt(x, z), z);
        baseEdge.set(x + B.radius, heightAt(x, z), z);
        // The gauge's own anchor, which is what the droplet rises from.
        gaugePoint.set(x, span.top + B.levelLift, z + B.radius * 0.72);
        basePoint.project(camera);
        baseEdge.project(camera);
        gaugePoint.project(camera);
        // Behind the eye: `project` still returns numbers there, and they are
        // mirrored, so a tree behind the camera would otherwise pick as though
        // it were in front of it.
        if (basePoint.z > 1) { bases.push({ entry, behind: true }); continue; }
        const sx = (basePoint.x + 1) * halfW;
        const sy = (1 - basePoint.y) * halfH;
        const ex = (baseEdge.x + 1) * halfW;
        bases.push({
            entry, x: sx, y: sy, radiusPx: Math.abs(ex - sx),
            dropY: dropScreenY((1 - gaugePoint.y) * halfH),
            thirst: dropPresence(entry.record.moisture)
        });
    }
    return bases;
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

    // THE BED DECIDES, AND NOTHING ELSE DOES. A tap on a mulch bed tends that
    // tree; a tap anywhere else plants. The canopy used to outrank the ground,
    // which meant that the fuller the plot got, the more of the ground a
    // visitor wanted was behind a tree.
    //
    // The consequence is deliberate: TAPPING A TREE'S LEAVES NOW PLANTS A TREE
    // BEHIND IT. That is what makes the interaction unambiguous rather than a
    // side effect of it, and there is a test that says so, because this is the
    // rule somebody will quietly put back.
    const bases = projectBases();

    // ---- THE DROPLET IS TRIED FIRST, AND THAT ORDER IS THE WHOLE DESIGN ----
    // Watering used to cost a tap to open a card and a second one to press a
    // button in it, for the single most repeated act in the scene. A droplet
    // above the gauge is now a button in the world: one tap, no modal, and the
    // toast is the only thing that appears.
    //
    // It is FIRST rather than nearest because its target overlaps the bed's.
    // The gauge's top edge is 7 to 8 px above the bed's base point and the
    // bed's target has a 22 px floor, so a droplet drawn above the gauge is
    // inside the bed's target at every row of the plot. Asking which centre is
    // nearer would be a coin toss over a couple of pixels; asking which is
    // tried first is an answer. A tree with no droplet is unaffected, because
    // `pickDrop` skips anything that is not asking.
    const thirsty = pickDrop(clientX, clientY, bases);
    if (thirsty) { waterOne(thirsty, 'drop'); return; }

    const tree = pickBase(clientX, clientY, bases);
    if (tree) {
        openTreeCard(tree, ageYears(tree.record, state.elapsedSeconds), cardContext());
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
    // The copy names no number on purpose. A tree goes in already part grown
    // (M10-1) and the exact remaining years move with one config value, so a
    // sentence with a figure in it would go stale the first time that changes.
    toast(`${entry.resolved.name} planted as a young sapling. Water it through the summers and it will fill out.`);
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

/**
 * Water one tree and say so. The shared end of every watering route.
 *
 * `from` is only for the count, so the droplet and the card can be told apart
 * later without either of them owning a different idea of what watering is.
 */
function waterOne(entry, from) {
    if (!entry) return;
    const result = waterTree(entry, state.elapsedSeconds);
    toast(result === 'revived'
        ? 'Watered. Look for new buds along the branches.'
        : 'Watered. It looks pleased.');
    track('tree-watered', { revived: result === 'revived' ? 1 : 0, from });
    save();
    syncWaterAll();
}

/**
 * Water everything that is asking.
 *
 * A RESCUE AND NOT A ROUTINE, which is why the control offering it is only
 * there when the garden is in trouble. See `waterAllFrom`.
 */
function handleWaterAll() {
    const thirsty = getTrees().filter((e) => needsWater(e.record.moisture));
    if (!thirsty.length) return;
    let revived = 0;
    for (const entry of thirsty) {
        if (waterTree(entry, state.elapsedSeconds) === 'revived') revived += 1;
    }
    // THE COPY NAMES THE COUNT, because the visitor pressed a button that named
    // one and a confirmation that drops it reads as though something else
    // happened. The bare-tree line is worth its own sentence: it is the reward
    // for coming back, and it is the whole of what watering buys.
    const many = thirsty.length > 1;
    toast(revived > 0
        ? `Watered ${thirsty.length} ${many ? 'trees' : 'tree'}. Look for new buds along the bare branches.`
        : `Watered ${thirsty.length} ${many ? 'trees' : 'tree'}. The garden looks pleased.`);
    track('water-all', { count: thirsty.length, revived });
    save();
    syncWaterAll();
}

/**
 * Show or hide the Water all control, and keep its count honest.
 *
 * Called after anything that can move a tank, and once a second from the frame
 * loop, because moisture also falls on its own and nothing else would notice
 * the garden crossing the threshold while the visitor watched.
 */
function syncWaterAll() {
    if (!waterAllBtn) return;
    const M = GARDEN_CONFIG.garden.moisture;
    const count = thirstyCount(getTrees());
    const show = count >= M.waterAllFrom;
    // `.visible` is what the house chrome uses, and the button is display:none
    // without it. `hidden` as well, so it leaves the tab order rather than
    // sitting in it invisibly, which is the version of this bug that only
    // keyboard visitors ever meet.
    waterAllBtn.classList.toggle('visible', show);
    waterAllBtn.hidden = !show;
    if (show) {
        const label = `${M.waterAllLabel} ${count}`;
        if (waterAllBtn.textContent !== label) waterAllBtn.textContent = label;
        waterAllBtn.setAttribute('aria-label',
            `${M.waterAllLabel} ${count} thirsty ${count > 1 ? 'trees' : 'tree'}`);
    }
}

function handleWater() {
    const entry = getCardEntry();
    if (!entry) return;
    const result = waterTree(entry, state.elapsedSeconds);
    toast(result === 'revived'
        ? 'Watered. Look for new buds along the branches.'
        : 'Watered. It looks pleased.');
    track('tree-watered', { revived: result === 'revived' ? 1 : 0, from: 'card' });
    // AND THE CARD GETS OUT OF THE WAY. Watering is a one-shot: there is
    // nothing further to do on this card, the toast has already confirmed it,
    // and the tree's own water level is on its bed in the scene, which is where
    // the visitor is looking. `closeTreeCard` restores focus, so this is also
    // the only ordering that leaves the keyboard somewhere sensible.
    closeTreeCard();
    save();
}

function handleRemove(entry) {
    if (!entry) return;
    removeTree(entry);
    toast('Removed. The ground is free again.');
    track('tree-removed');
    save();
}

/**
 * How much movement the visitor asked for, 1 or damped.
 *
 * THE FLAG INVERTS HERE. Everywhere else on the site it removes movement; in
 * this scene the movement IS the content, so it damps toward a drift instead.
 * The clock is untouched, which M4-9 asserts: reduced motion asks for less
 * movement, never for less garden.
 */
function motionScale() {
    return state.reducedMotion ? GARDEN_CONFIG.tree.reducedMotion : 1;
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
    // A new garden gets the composed viewpoint back too. Leaving the visitor
    // up at the birds-eye end looking down at an empty plot is not the frame
    // this scene opens on.
    resetView();
    applyView();
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
let waterAllDue = 0;

function animate() {
    if (!state.running) return;
    const now = performance.now();
    const delta = state.lastTime === 0
        ? 0
        : Math.min((now - state.lastTime) / 1000, GARDEN_CONFIG.clock.maxFrameSeconds);
    state.lastTime = now;

    // THE ONLY PLACE EITHER CLOCK MOVES. The animation clock always advances;
    // the calendar waits for the visitor to begin.
    const tending = !blocker || blocker.classList.contains('hidden');
    const gardenDelta = tending ? delta : 0;
    state.sceneSeconds += delta;
    state.elapsedSeconds += gardenDelta;

    adaptQuality(delta);

    const hour = hourAt(state.elapsedSeconds);
    const snow = snowCoverageAt(hour);

    // THE WEATHER IS PART OF THE CALENDAR, so it waits too.
    //
    // An earlier version let it turn behind the welcome card, on the theory
    // that a static sky is as dead as a static tree. That is true of a sky
    // nobody chose and false of this one: the opening frame is a clear spring
    // morning, it is the first thing anybody sees, and it should be that every
    // time rather than whatever the state machine happened to roll while they
    // were reading. Held on `gardenDelta`, the state stays sunny, the
    // transition stays settled, and the wind holds one steady direction and
    // strength, so the trees go on swaying in a morning that does not change.
    stepWeather(weather, gardenDelta, hour, state.elapsedSeconds, Math.random, state.reducedMotion);
    // `fall` is what the weather actually DREW this frame. The sky takes the
    // flash and the chip takes the two rates, so nothing downstream decides
    // for itself what the weather is doing.
    const fall = updatePrecipitation(delta, state.sceneSeconds, weather, Math.random, hour);
    // ONE CLOUD NUMBER, COMPUTED HERE AND NOWHERE ELSE, for the same reason the
    // wind vector is published once: the two things that have to agree about
    // the sky are the season chip and the sky itself. It takes `fall` rather
    // than `weather.gloom` alone because the winter snowfall arrives from the
    // CALENDAR and never touches gloom, so a still, clear-state blizzard would
    // otherwise keep every one of its stars.
    const cloud = overcastAt(weather.gloom, fall);
    state.falling = Math.max(fall.rain, fall.snow)
        >= GARDEN_CONFIG.weather.precipitation.visibleRate;

    updateSky(hour, delta, snow, weather.gloom, fall.flash, cloud);
    updateTerrain(hour, snow);
    updateForest(hour, snow, weather.wind, state.sceneSeconds, motionScale());
    updateVista(hour, state.sceneSeconds, snow, weather.gloom, camera);
    // Pixels per radian of vertical field. TWO THINGS IN THIS SCENE HOLD A SIZE
    // ON SCREEN RATHER THAN IN METRES, the water level in the mulch beds and
    // the fireflies' glow, and both need the lens and the viewport, both of
    // which move: the composed field differs by orientation and the window can
    // be resized at any moment.
    //
    // The fireflies are switched off at the moment (M12-9) and this still goes
    // to them, because a benched creature that has to be re-wired as well as
    // re-flagged is not really benched. It costs one division either way.
    const pxPerRadian = camera
        ? window.innerHeight / (camera.fov * Math.PI / 180)
        : 0;
    updateWildlife(hour, state.sceneSeconds, snow, GARDEN_CONFIG, { camera, pxPerRadian });
    updateGarden(gardenDelta, state.elapsedSeconds, {
        // NO `rain` HERE ANY MORE. The garden used to be handed the rain rate
        // and it filled every tank with it, whatever the temperature had made
        // of it, which is how snow came to water trees. See moistureAfter.
        snow,
        wind: weather.wind,
        motion: motionScale(),
        // The trees sway on the animation clock while their growth, thirst and
        // health wait on `gardenDelta` above.
        time: state.sceneSeconds,
        // Measured once above, and shared with the fireflies.
        pxPerRadian
    });
    updateHud(yearAt(state.elapsedSeconds), state.elapsedSeconds, weatherWords(weather, fall));
    // A SECOND IS FAST ENOUGH AND SIXTY TIMES A SECOND IS DOM CHURN. Watering
    // syncs this straight away; the drift the other way, a garden going thirsty
    // while somebody watches it, is the slowest thing in the scene.
    waterAllDue += delta;
    if (waterAllDue > 1) { waterAllDue = 0; syncWaterAll(); }
    if (isCardOpen()) {
        const entry = getCardEntry();
        if (entry) refreshTreeCard(ageYears(entry.record, state.elapsedSeconds), cardContext());
    }

    // The camera, in order: our own dolly first, then the shared part's yaw
    // and tilt refining the aim on top of it.
    applyView();
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

// ---- A window onto the scene, for QA --------------------------------------

/**
 * `?debug=1` puts a small read-only probe on `window.__garden`.
 *
 * IT EXISTS BECAUSE THE HARNESS CANNOT SEE THE GPU. A whole afternoon went
 * into a report of missing mulch beds: the instance counts, the matrices, the
 * ground clearance, the shadow frustum and the wall's line of sight were all
 * measured correct in Node, through planting, restoring, removing, clearing,
 * replanting and a full plot, and the beds were still missing on screen. There
 * was no way to ask the running page a single question, so every step was a
 * guess. This is that missing question.
 *
 * Read-only, off unless asked for, and it holds nothing the page does not
 * already have. `__garden.report()` prints a row per tree.
 */
function installDebugProbe() {
    if (typeof window === 'undefined') return false;
    const asked = /(^|[?&])debug(=|&|$)/.test(window.location.search || '');
    if (!asked) return false;

    window.__garden = {
        counts() {
            const bed = getBedMesh();
            const level = getLevelMesh();
            return {
                trees: getTrees().length,
                beds: bed ? bed.count : null,
                levels: level ? level.count : null,
                capacity: bed ? bed.instanceMatrix.count : null,
                // Everything between "the data is right" and "it is on the
                // screen". A mesh can be perfectly built, correctly counted
                // and simply not in the scene, or hidden, or wearing a
                // material that failed to compile, and none of those are
                // visible from Node.
                bedInScene: !!(bed && bed.parent),
                bedVisible: !!(bed && bed.visible),
                bedMaterialVisible: !!(bed && bed.material && bed.material.visible),
                bedProgramFailed: !!(bed && bed.material && bed.material.program
                    && bed.material.program.diagnostics
                    && !bed.material.program.diagnostics.runnable),
                levelInScene: !!(level && level.parent)
            };
        },
        /**
         * Per fruit tree: is there a mesh, is it in the scene, did its program
         * compile, and WHAT ARE THE FOUR STAGE UNIFORMS RIGHT NOW.
         *
         * Added because "the fruit is not visible" has at least four completely
         * different causes and none of them can be told apart from a
         * screenshot: the tree is too young (`crop` 0), it is the wrong hour
         * (`bloom` and `size` both 0), the mesh never built, or it is drawn and
         * simply too small to see. The last one is what it turned out to be,
         * and five rounds of inference is the alternative to this row.
         */
        fruit: () => getTrees().filter((e) => e.tree && e.tree.fruitMesh).map((e) => {
            const t = e.tree;
            const u = t.fruitUniforms;
            const m = t.fruitMesh;
            return {
                species: e.record.species,
                // Which drawing it was handed. Two trees sharing a mask when
                // they should not is invisible in a screenshot and obvious
                // here.
                shape: t.fruitShape || 'none',
                growth: +e.record.growth.toFixed(3),
                health: +e.record.health.toFixed(3),
                instances: t.fruitCount,
                crop: +u.uCrop.value.toFixed(3),
                bloom: +u.uBloom.value.toFixed(3),
                size: +u.uFruitSize.value.toFixed(3),
                ripe: +u.uRipe.value.toFixed(3),
                drop: +u.uFruitDrop.value.toFixed(3),
                // Everything between "the data is right" and "it is on screen".
                inScene: !!m.parent,
                visible: !!m.visible,
                materialVisible: !!(m.material && m.material.visible),
                programFailed: !!(m.material && m.material.program
                    && m.material.program.diagnostics
                    && !m.material.program.diagnostics.runnable)
            };
        }),
        // Per tree: where its cell is, where the GROUND is there, where the
        // bed's top ended up, and where the tree's own group actually sits.
        // Those last two come from one `heightAt` call each and must agree: a
        // trunk that ends in mid-air over the grass, which is what QA is
        // seeing, means the tree and its bed have stopped agreeing about where
        // the ground is, and this is the row that would say so.
        bases: () => projectBases().map((b) => {
            const r = b.entry.record;
            const { x, z } = cellCenter(r.gx, r.gz);
            const span = bedSpan(x, z);
            const g = b.entry.tree && b.entry.tree.group;
            return {
                gx: r.gx, gz: r.gz, species: r.species,
                groundY: +heightAt(x, z).toFixed(3),
                bedTop: +span.top.toFixed(3),
                bedBottom: +span.bottom.toFixed(3),
                treeY: g && g.position ? +Number(g.position.y).toFixed(3) : null,
                behind: !!b.behind,
                screenX: b.x === undefined ? null : Math.round(b.x),
                screenY: b.y === undefined ? null : Math.round(b.y),
                radiusPx: b.radiusPx === undefined ? null : Math.round(b.radiusPx)
            };
        }),
        // WHAT IS ACTUALLY IN THE INSTANCE BUFFER, read straight back out of
        // the typed array the GPU is handed. Everything upstream of this has
        // measured correct for days: the counts, the spans, the positions the
        // code intends. This is the one link never inspected, and if index 0
        // draws while 1 and 2 do not, this is where it will show.
        matrices() {
            const bed = getBedMesh();
            if (!bed) return [];
            const a = bed.instanceMatrix.array;
            const rows = [];
            for (let i = 0; i < bed.count; i++) {
                const o = i * 16;
                rows.push({
                    i,
                    x: +a[o + 12].toFixed(3), y: +a[o + 13].toFixed(3), z: +a[o + 14].toFixed(3),
                    scaleX: +Math.hypot(a[o], a[o + 1], a[o + 2]).toFixed(3),
                    scaleY: +Math.hypot(a[o + 4], a[o + 5], a[o + 6]).toFixed(3),
                    scaleZ: +Math.hypot(a[o + 8], a[o + 9], a[o + 10]).toFixed(3),
                    w: +a[o + 15].toFixed(3)
                });
            }
            return rows;
        },
        report() {
            const counts = this.counts();
            console.log('[Garden] counts', counts);
            if (counts.trees !== counts.beds) {
                console.warn('[Garden] BED COUNT DOES NOT MATCH THE TREES.');
            }
            const rows = this.bases();
            // The one comparison worth making automatically.
            for (const row of rows) {
                if (row.treeY !== null && Math.abs(row.treeY - row.groundY) > 0.01) {
                    console.warn(`[Garden] tree ${row.gx},${row.gz} sits at ${row.treeY} but the ground there is ${row.groundY}`);
                }
            }
            console.table(rows);
            console.log('[Garden] instance buffer as the GPU sees it:');
            console.table(this.matrices());
            return counts;
        }
    };
    console.log('[Garden] debug probe ready. Call __garden.report(), or __garden.fruit().');
    return true;
}

// ---- Cleanup / state -------------------------------------------------------

function cleanup() {
    // THE LAST WRITE COMES FIRST, AND THEN NOTHING WRITES AGAIN.
    //
    // `pagehide` carries two listeners here and they fire in REGISTRATION
    // order: this one, and then the one that saves. So once teardown learned
    // to dispose the garden (M10-5), every page exit cleared the tree list and
    // the save that followed wrote the empty result straight over the
    // visitor's garden. A hard refresh lost everything they had planted.
    //
    // The ordering is made explicit rather than left to the order two
    // listeners happen to be added in, because that coupling is invisible at
    // both call sites and this is the second bug in this file to come out of
    // the pagehide pair (see save()).
    save();
    tornDown = true;
    stop();
    disposeGarden();
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

export const __test__ = {
    bufToHex, quality, state, placeCamera, animate, needsWater, save,
    // The camera and the aim it is handed, for the view-control tests. Under
    // the THREE stub every number read back off the camera is zero, so what
    // these are good for is the AIM OBJECT, which is ours and holds real
    // numbers, and identity checks on the camera itself.
    camera: () => camera,
    viewTarget: () => viewTarget,
    applyView
};
