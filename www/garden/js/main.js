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
import {
    hourAt, yearAt, seasonAt, snowCoverageAt, startSeconds, fruitStageAt, showcaseHour
} from './clock.min.js';
import { initSky, updateSky, disposeSky } from './sky.min.js';
import {
    initTerrain, updateTerrain, disposeTerrain, getGroundMesh, snapToGrid,
    nearestFreeCell, cellCenter, heightAt, inPlantingReach, plantingReach, pondWaterLevel
} from './terrain.min.js';
import { initForest, updateForest, disposeForest } from './forest.min.js';
import { initVista, updateVista, disposeVista, setVistaEye, getPondMesh } from './vista.min.js';
import {
    initWildlife, updateWildlife, disposeWildlife, duckFlightAt, lakeShot
} from './wildlife.min.js';
import { createWeather, stepWeather, weatherWords, overcastAt } from './weather.min.js';
import { initPrecipitation, updatePrecipitation, disposePrecipitation } from './precip.min.js';
import { resolveSpecies } from './species.min.js';
import {
    dollyView, applyDollyDelta, dollyLimits, getDolly, resetView,
    focusDistance, dollyForDistance, focusOn, stepView, cancelFocus, getAim,
    aimTarget, viewIsComposed, panLimitFor, framingFor
} from './view.min.js';
import {
    pickBase, pickDrop, pickDropIndex, dropScreenY, dropPresence, thirstyCount,
    setHoveredDrop, getBedMesh, getLevelMesh, bedSpan
} from './beds.min.js';
import { createTree, updateTree, disposeTree } from './tree.min.js';
import {
    initGarden, plantTree, restoreTrees, removeTree, clearGarden, waterTree,
    updateGarden, getTrees, getOccupied, isFull, capacity, ageYears,
    serialize, hydrate, needsWater, viewFor, currentHeight, disposeGarden
} from './garden.min.js';
import {
    initUi, updateHud, showHud, openPlantModal, isPlantOpen,
    openTreeCard, closeTreeCard, isCardOpen, refreshTreeCard, getCardEntry,
    anyModalOpen, getPreviewCanvas, toast, openResetModal, waterAllText,
    openLakeCard, closeLakeCard, isLakeOpen, getLakeCanvas, refreshLakeCard
} from './ui.min.js';
import { getProofOfWork, bufToHex } from '../../shared/js/boot-1.0.0.min.js';
import {
    initPortraitControls, updatePortraitControls, gestureClaimedTap, resetPortraitAim,
    getPanAngle, getTiltAngle, setPanLimit
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
// The lake's card borrows a second camera on the SAME scene. Built once at
// init, because a camera is cheap and building one per frame is not.
let lakeCamera = null;
// Where the ducks live, and how far any of them strays. See lakeShot.
let lakeHome = null;

let canvas, loadingScreen, blocker, waterAllBtn, helpBtn, resetBtn, viewResetBtn;
// What syncViewReset last wrote, so a per-frame check costs no DOM writes.
// `null` means it has never written, which forces the first call through.
let viewResetShown = null;
let cleanupController = null;

// The plant flow's pending spot, chosen when the visitor tapped the grass.
let pendingCell = null;

// The plot's front corner, which is the hardest thing in the garden to look at
// and so the thing the pan limit is sized against. Derived once from the
// planting grid rather than per frame: it moves only if the grid does.
const plantingCorner = plantingReach();

// How far a finger may travel and still count as a tap on the welcome card
// rather than a scroll of it. Generous, because the card is a full-screen
// target and nothing on it is small enough to need precision.
const BLOCKER_TAP_SLOP = 12;

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
    helpBtn = document.getElementById('help-btn');
    resetBtn = document.getElementById('reset-btn');
    viewResetBtn = document.getElementById('view-reset');
    if (!canvas) return;

    applySiteLinks();
    // "Click to begin" on the device most visitors arrive on is the first
    // sentence of the scene naming a control they do not have.
    setBeginPrompt(false);

    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(GARDEN_CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Preparing the ground…', 30);
    buildRenderer();
    buildScene();
    placeCamera();
    lakeCamera = new THREE.PerspectiveCamera(
        GARDEN_CONFIG.world.pond.watch.fov, 1,
        GARDEN_CONFIG.camera.near, GARDEN_CONFIG.camera.far);
    // Where the ducks live and how far they roam. Seeded, so it is the same
    // shot every visit, and it follows the mobile duck count.
    lakeHome = lakeShot(GARDEN_CONFIG, { mobile: state.mobile });

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
        // AND STRAIGHT BACK OFF FOR THE TWO THAT HAVE NOTHING TO DO YET. The
        // sweep is indiscriminate by design, so this is the one place that
        // knows the welcome card is still up.
        syncWelcomeChrome();
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

// The composed viewpoint's own arithmetic MOVED TO view.js, which is the module
// that owns where the visitor is standing and which the pan limit already had
// to reach for. Re-exported here because this is where the suite has always
// imported it from, and because a scene's entry point naming its own framing is
// worth keeping. Nothing in it ever touched THREE, and being out of this file
// is what lets a pure test use it without a stubbed renderer.
export { framingFor };

/**
 * Half the frame's HORIZONTAL field, in radians.
 *
 * three's `fov` is vertical, so this is the number that actually says how much
 * of the garden is beside the aim, and it is a third as big on a phone held
 * upright as on a 16:9 desktop. The pan limit needs it: without it a clamp that
 * is generous on one frame is confining on the other, which is the bug QA
 * found.
 *
 * READ THROUGH `framingFor` RATHER THAN OFF THE CAMERA. It is the same pure
 * function `placeCamera` sets the lens from, so the two cannot disagree, and it
 * returns a real number under the test harness, where every value read back off
 * a THREE camera is a proxy.
 */
function frameHalfWidth() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const { fov } = framingFor(aspect, GARDEN_CONFIG.camera);
    return Math.atan(Math.tan((fov / 2) * Math.PI / 180) * aspect);
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
    // THE AIM IS THE DOLLY'S UNTIL SOMETHING ASKS FOR A PARTICULAR SPOT. After
    // planting that is the new tree (see showTree), and because the shared part
    // rotates from THIS object rather than from the config, the visitor's own
    // yaw and tilt re-base onto it: pan left afterwards and you pan left of the
    // tree, which is what anybody would expect and none of it is code.
    //
    // `aimTarget` is where the release lives, so pulling the dolly back toward
    // the composed viewpoint opens the frame back onto the whole garden rather
    // than retreating along an axis that is no longer pointed at it.
    const target = aimTarget({ x: cam.lookAt.x, y: view.lookY, z: view.lookZ });
    viewTarget.x = target.x;
    viewTarget.y = target.y;
    viewTarget.z = target.z;
    camera.lookAt(viewTarget.x, viewTarget.y, viewTarget.z);
}

/**
 * Put the camera back where the scene opens.
 *
 * THE SAME MOVE PLANTING USES, aimed at the composed viewpoint with a dolly of
 * zero, which is worth noticing rather than being clever about: it eases rather
 * than snapping, it starts from where the camera is genuinely looking, and it
 * is cancelled by the same first touch. All three come free. `stepView` then
 * releases the aim outright on the frame it lands, because a dolly of zero puts
 * `focusHold` at zero.
 *
 * IT CLEARS ALL THREE THINGS THAT CAN MOVE THE VIEW. The dolly and the aim are
 * this module's; the yaw and tilt belong to the shared part and would otherwise
 * survive, which is the half the dolly release cannot reach on its own and the
 * reason this control earns its place beside it.
 */
function showWholeGarden() {
    if (!camera) return;
    const cam = GARDEN_CONFIG.camera;
    const view = dollyView(0, composedView());
    const target = { x: cam.lookAt.x, y: view.lookY, z: view.lookZ };
    const from = currentAimPoint(target);
    resetPortraitAim();
    focusOn(target, 0, state.reducedMotion ? 0 : GARDEN_CONFIG.camera.focus.seconds, from);
    track('view-reset');
}

/**
 * Show the control only while the view has somewhere to go back to.
 *
 * Called every frame, and it touches the DOM only when the answer changes: the
 * dolly moves continuously, so an unguarded write here would be sixty attribute
 * changes a second for a value that is a boolean.
 */
function syncViewReset() {
    if (!viewResetBtn) return;
    const show = !viewIsComposed(getPanAngle(), getTiltAngle());
    // `null` until the first call, so the state is WRITTEN once rather than
    // inherited from the markup. The markup does carry `hidden`, but a control
    // whose visibility is only correct because an attribute happened to be
    // typed in another file is the shape of the `.ui-float` bug this codebase
    // has already met twice.
    if (show === viewResetShown) return;
    viewResetShown = show;
    viewResetBtn.hidden = !show;
}

// Scratch for the aim read-back below, so a planting allocates nothing.
const aimDirection = new THREE.Vector3();

/**
 * The point the camera is looking at right now, at the same range as `target`.
 *
 * READ OFF THE CAMERA, which is what makes it exact. What it is aimed at is
 * this scene's own aim with the shared part's yaw and tilt composed on top, and
 * rebuilding that here would mean keeping a second copy of the part's
 * composition order in step with the part's. `matrixWorld` is refreshed first
 * rather than trusted: it is normally a frame old, which is invisible, but the
 * frame it would be wrong on is the one where a resize just moved the camera.
 *
 * Falls back to the composed aim if the direction does not come back as
 * numbers, which is the case under the test harness's THREE stub and would
 * otherwise put a NaN into the move.
 */
function currentAimPoint(target) {
    const cam = GARDEN_CONFIG.camera;
    const view = dollyView(getDolly(), composedView());
    const composedAim = { x: cam.lookAt.x, y: view.lookY, z: view.lookZ };
    if (!camera || typeof camera.getWorldDirection !== 'function') return composedAim;

    camera.updateMatrixWorld();
    camera.getWorldDirection(aimDirection);
    const range = Math.hypot(target.x - camera.position.x,
        target.y - camera.position.y, target.z - camera.position.z);
    const point = {
        x: camera.position.x + aimDirection.x * range,
        y: camera.position.y + aimDirection.y * range,
        z: camera.position.z + aimDirection.z * range
    };
    const sane = Number.isFinite(point.x) && Number.isFinite(point.y)
        && Number.isFinite(point.z);
    return sane ? point : composedAim;
}

/**
 * Turn to a tree that has just gone in, and move in on it.
 *
 * THE SCENE'S ANSWER TO THE ONE DECISION THE VISITOR MAKES. A sapling planted
 * from the composed viewpoint is a couple of hundred pixels of nothing, 25 m
 * away and anywhere across a 24 m plot, and on a portrait phone it can be off
 * the side of the frame entirely: the visitor chose a tree and the scene showed
 * them a field. All of the arithmetic is in view.js and pure; this reads the
 * three things it needs off the world.
 */
function showTree(entry) {
    if (!entry || !camera) return;
    const F = GARDEN_CONFIG.camera.focus;
    const { x, z } = cellCenter(entry.record.gx, entry.record.gz);
    const mature = entry.resolved.matureHeight;
    const point = {
        x, z,
        // A little way up the trunk, off the ground the bed actually sits on.
        y: heightAt(x, z) + Math.min(F.maxAimHeight,
            Math.max(F.minAimHeight, mature * F.aimHeightRatio))
    };
    const composed = composedView();

    // ---- THE MOVE STARTS FROM WHERE THE CAMERA IS ACTUALLY LOOKING --------
    //
    // NOT FROM THE COMPOSED AIM, and that distinction was a shipped bug. The
    // shared pan part's yaw and tilt are an OFFSET FROM this scene's aim
    // object, they persist, and they are applied after `applyView` every
    // frame. So panning across the plot and then planting used to centre the
    // tree and then add the visitor's own 31.5 degrees straight back on top of
    // it: the tree came out at the edge of a desktop frame and clean off a
    // portrait one, whose half-width is only 18.7 degrees. QA reported it as
    // "sometimes it over-pans left or right", and the "sometimes" was exactly
    // whether the visitor had panned before planting, which is most of the
    // time, because looking at the spot is how you choose it.
    //
    // The offset is consumed rather than fought (`resetPortraitAim`), and the
    // move begins from the direction the camera is genuinely pointing, so the
    // two happen in one gesture and nothing jumps. Read off the camera rather
    // than recomputed from `getPanAngle` and `getTiltAngle`, because a second
    // copy of the part's composition order is a second thing to drift.
    const from = currentAimPoint(point);
    resetPortraitAim();

    focusOn(point,
        dollyForDistance(point, composed, focusDistance(mature, camera.fov)),
        // REDUCED MOTION ARRIVES RATHER THAN TRAVELS. A camera flying across a
        // scene is precisely the thing that setting is asking not to happen,
        // and this is the one place in the garden where honouring it means
        // holding still rather than moving less.
        state.reducedMotion ? 0 : F.seconds,
        from);
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
        // ---- A SCROLL IS NOT A DISMISSAL --------------------------------
        // The welcome card scrolls on a short screen, and a flick to read the
        // rest of it ends in a `touchend` exactly like a tap does. Without
        // this the card would close itself the first time somebody tried to
        // read the bottom of it, which is the one gesture it has to survive.
        // The click guard is the second half: a browser that synthesises a
        // click after a drag would otherwise walk straight past the touch one.
        let touchStart = null;
        let draggedAt = -1e9;
        blocker.addEventListener('touchstart', (event) => {
            const t = event.touches && event.touches[0];
            touchStart = t ? { x: t.clientX, y: t.clientY } : null;
        }, { passive: true, signal });
        blocker.addEventListener('touchend', (event) => {
            const start = touchStart;
            touchStart = null;
            const t = event.changedTouches && event.changedTouches[0];
            if (start && t && Math.hypot(t.clientX - start.x, t.clientY - start.y) > BLOCKER_TAP_SLOP) {
                draggedAt = performance.now();
                return;
            }
            dismiss(event);
        }, { signal });
        blocker.addEventListener('click', (event) => {
            if (performance.now() - draggedAt < 600) return;
            dismiss(event);
        }, { signal });
        document.addEventListener('keydown', (event) => {
            if (blocker.classList.contains('hidden')) return;
            // Escape as well as Enter and Space, because the card is now a
            // panel a visitor can OPEN, and Escape is what closes a panel.
            if (event.code === 'Enter' || event.code === 'Space' || event.code === 'Escape') {
                beginTending();
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

    // ---- HOVER, WHICH ONLY A POINTER HAS ----------------------------------
    // The web's oldest answer to "is this a control" is the cursor, and until
    // now this canvas had one cursor everywhere. A mouse visitor can ask what
    // something is before committing to it, and a droplet is the only thing in
    // the scene worth answering for, so it is the only thing tested here.
    //
    // `pointerType` GATES IT, because a touch generates pointer events too, and
    // a phone would otherwise leave a droplet stuck in its hover state after
    // every tap, with no pointer left anywhere to take it out again.
    canvas.addEventListener('pointermove', (event) => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        updateDropHover(event.clientX, event.clientY);
    }, { signal });
    canvas.addEventListener('pointerleave', () => updateDropHover(-1e4, -1e4), { signal });

    // ---- THE MOVE AFTER PLANTING STOPS THE MOMENT IT IS INTERRUPTED --------
    // A camera that carries on travelling after somebody has taken hold of the
    // controls is infuriating, and it is worse than that here: the pan buttons
    // and a drag would be composing a yaw on top of an aim that is still
    // sliding, so the view would not end up where they steered it.
    //
    // On the DOCUMENT rather than the canvas, because the pan and zoom buttons
    // are floating chrome and a keyboard visitor never touches the canvas at
    // all. The zoom has its own cancel inside `applyDollyDelta`, which is the
    // one route that would otherwise write the dolly and be overwritten. This
    // cannot fire on the press that started the move: `pointerdown` on the
    // Plant button happens before the click that plants.
    for (const type of ['pointerdown', 'keydown']) {
        document.addEventListener(type, cancelFocus, { passive: true, signal });
    }

    if (resetBtn) resetBtn.addEventListener('click', handleReset, { signal });
    if (helpBtn) helpBtn.addEventListener('click', openHelp, { signal });

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

    // ---- AND THE VIEW RESET JOINS THE STACK THE PART JUST BUILT -----------
    // It lives in index.html with the rest of the chrome and moves here,
    // because the container is the shared part's and only exists after the
    // call above. PREPENDED, not appended: the stack is anchored to the bottom
    // of the frame, so adding to the end would shove the plus and minus upward
    // the moment this appeared, and a zoom button that moves when a neighbour
    // shows up is worse than no neighbour.
    if (viewResetBtn) {
        const stack = document.querySelector('.garden-zoom');
        if (stack) stack.prepend(viewResetBtn);
        viewResetBtn.addEventListener('click', showWholeGarden, { signal });
    }
}

function onResize() {
    if (!renderer || !camera) return;
    placeCamera();
    quality.ceiling = pixelRatioCeiling();
    renderer.setPixelRatio(quality.ceiling * quality.scale);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
}

/**
 * Show the corner controls only while there is a garden to use them on.
 *
 * ---- A CONTROL THAT DOES NOTHING IS WORSE THAN NO CONTROL ----
 *
 * `.menu-btn` is z-index 110 and the blocker is 100, so the top-right stack
 * draws OVER the welcome card and sits in its tab order. Help there is a button
 * whose whole purpose is to summon the card already filling the screen, and
 * reset is a destructive one offered before the visitor has seen the garden.
 *
 * HIDDEN RATHER THAN DISABLED. A dimmed button asks "why can't I press this",
 * which is a question the visitor should not have to hold; the absence of a
 * control whose target is already on screen is unremarkable. It also takes them
 * out of the tab order, which is the half that actually mattered: a keyboard
 * visitor tabbing through the welcome card should not land on a control that
 * does nothing when pressed.
 *
 * HOME STAYS, and that is not an oversight. It is the way off the page, it
 * works perfectly well from the welcome card, and it is the target of the
 * "Skip to home link" that opens the document. Hiding it would break the skip
 * link for exactly the visitors it exists for.
 */
function syncWelcomeChrome() {
    const reading = !blocker || !blocker.classList.contains('hidden');
    for (const el of [helpBtn, resetBtn]) {
        if (el) el.hidden = reading;
    }
}

/**
 * The one line on the welcome card that names a control.
 *
 * TWO SENTENCES AND TWO VERBS. "Begin" is wrong for somebody who already has a
 * garden behind the card, and "click" is wrong on a phone, which is where most
 * visitors meet this. Both live here so neither can be updated without the
 * other.
 */
function setBeginPrompt(returning) {
    const prompt = document.getElementById('begin-prompt');
    if (!prompt) return;
    const verb = state.mobile ? 'Tap' : 'Click';
    prompt.textContent = returning
        ? `${verb} to return to your garden`
        : `${verb} to begin`;
}

/**
 * Put the welcome card back up.
 *
 * IT IS THE SAME CARD, not a second copy of its sentences. Everything the scene
 * explains about itself lives there, and a help panel repeating it would be two
 * texts to keep in step, with the copy nobody edits the one a lost visitor
 * reads. The calendar is already held whenever the card is up, so reading it
 * costs no seasons.
 */
function openHelp() {
    if (!blocker || !blocker.classList.contains('hidden')) return;
    setBeginPrompt(true);
    blocker.classList.remove('hidden');
    // Reading starts at the top, whatever the visitor had scrolled to last
    // time the card was up.
    blocker.scrollTop = 0;
    syncWelcomeChrome();
    helpReturn = document.activeElement;
    blocker.focus({ preventScroll: true });
    track('help-opened');
}

function beginTending() {
    if (!state.loaded || !blocker || blocker.classList.contains('hidden')) return;
    blocker.classList.add('hidden');
    syncWelcomeChrome();
    // ONCE PER VISIT, NOT ONCE PER DISMISSAL, now that the card can be opened
    // again from the help button.
    if (!tendingBegun) {
        tendingBegun = true;
        track('begin-tending');
    }
    if (helpReturn && typeof helpReturn.focus === 'function') {
        try { helpReturn.focus({ preventScroll: true }); } catch (e) { /* gone */ }
    }
    helpReturn = null;
    // AT ONCE RATHER THAN ON THE NEXT HEARTBEAT. A visitor coming back to a
    // garden that went thirsty while they were away should meet the offer in
    // the first frame they see, not a second into it.
    syncWaterAll();
    nudgeToPlant();
}

/**
 * Keep offering the first tree until there is one.
 *
 * THE FIRST VERSION WAS A SINGLE SHOT and it was the wrong shape. One toast,
 * 2.2 seconds after the card went, gone again 4.2 seconds later: a visitor who
 * was still looking at the mountains when it arrived, or who opened the plant
 * modal and closed it again, was left in an empty field with nothing on screen
 * suggesting the field was the thing to touch. That is precisely the visitor
 * this milestone is about.
 *
 * So it asks again, at a widening gap, and gives up after a few. The words
 * change on the later ones, because a sentence repeated verbatim reads as a
 * stuck screen rather than as a hint.
 */
function nudgeToPlant(round = 0) {
    if (plantNudge) { clearTimeout(plantNudge); plantNudge = null; }
    if (round >= PLANT_NUDGES.length) return;
    plantNudge = setTimeout(() => {
        plantNudge = null;
        // The garden answers the question the moment anything is planted, and
        // a modal on screen is a visitor already doing it.
        if (getTrees().length) return;
        if (!anyModalOpen() && (!blocker || blocker.classList.contains('hidden'))) {
            toast(PLANT_NUDGES[round], 4600);
        }
        nudgeToPlant(round + 1);
    }, round === 0 ? 2200 : 14000);
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
const baseNear = new THREE.Vector3();
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

    const trees = getTrees();
    for (let i = 0; i < trees.length; i++) {
        const entry = trees[i];
        const { x, z } = cellCenter(entry.record.gx, entry.record.gz);
        const span = bedSpan(x, z);
        basePoint.set(x, heightAt(x, z), z);
        baseEdge.set(x + B.radius, heightAt(x, z), z);
        // THE BED'S NEAR RIM, which is what gives the target its HEIGHT. A bed
        // is a disc seen at a grazing angle: several times wider on screen than
        // it is tall, and a circular target sized from the width alone stands
        // well proud of the picture above and below it. See pickBase.
        baseNear.set(x, heightAt(x, z), z + B.radius);
        // The gauge's own anchor, which is what the droplet rises from.
        gaugePoint.set(x, span.top + B.levelLift, z + B.radius * 0.72);
        basePoint.project(camera);
        baseEdge.project(camera);
        baseNear.project(camera);
        gaugePoint.project(camera);
        // Behind the eye: `project` still returns numbers there, and they are
        // mirrored, so a tree behind the camera would otherwise pick as though
        // it were in front of it.
        // `index` is the INSTANCE index in the bed meshes, which is the same
        // order `syncBeds` wrote them in. It is what lets the hover highlight
        // reach the right droplet without a second way of identifying a tree.
        if (basePoint.z > 1) { bases.push({ entry, index: i, behind: true }); continue; }
        const sx = (basePoint.x + 1) * halfW;
        const sy = (1 - basePoint.y) * halfH;
        const ex = (baseEdge.x + 1) * halfW;
        const ny = (1 - baseNear.y) * halfH;
        bases.push({
            entry, index: i, x: sx, y: sy,
            radiusPx: Math.abs(ex - sx),
            radiusYPx: Math.abs(ny - sy),
            // Monotonic in distance from the eye, so it settles which of two
            // overlapping beds is the one drawn on top.
            depth: basePoint.z,
            dropY: dropScreenY((1 - gaugePoint.y) * halfH),
            thirst: dropPresence(entry.record.moisture)
        });
    }
    return bases;
}

/**
 * Put the cursor and the highlight on whatever droplet is under the pointer.
 *
 * THE CURSOR IS SET FROM THE SAME SEARCH THE TAP USES, not from a lookalike, so
 * "it looked clickable" and "it was clickable" cannot come apart. `setHoveredDrop`
 * returns whether anything actually moved, which keeps a pointermove that
 * crosses forty pixels of empty grass from touching the GPU at all.
 */
function updateDropHover(clientX, clientY) {
    if (!canvas || !state.loaded || anyModalOpen()) return;
    const index = pickDropIndex(clientX, clientY, projectBases());
    if (!setHoveredDrop(index)) return;
    canvas.style.cursor = index >= 0 ? 'pointer' : '';
}

// ---- The lake --------------------------------------------------------------

/**
 * A tap on the water opens the card that looks across it.
 *
 * RAYCAST, UNLIKE EVERY OTHER TARGET IN THIS SCENE. A mulch bed is picked in
 * screen space because it is a disc seen at 17 degrees and five pixels tall at
 * the back of the plot. The lake is 58 m by 32 m and hundreds of pixels from
 * anywhere, so "did the ray hit it" has a good answer, and it is the honest one:
 * the target is exactly the drawn surface.
 *
 * THE LAKE IS ALWAYS TAPPABLE, including the cold half of the year when the
 * ducks are away. It was the ducks before, which meant a target that came and
 * went with the season and a card that had to close itself. The water is there
 * every day, so the card can say something true on any of them.
 */
function tapLake(clientX, clientY) {
    const water = getPondMesh();
    if (!water || !camera) return false;
    pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.intersectObject(water, false).length) return false;
    if (!openLakeCard(duckFlightAt(hourAt(state.elapsedSeconds)))) return false;
    track('lake-opened');
    return true;
}

/**
 * Where the borrowed camera stands and what it points at.
 *
 * PURE, AND THAT IS THE POINT: under the test harness every number read back
 * off a THREE camera is a proxy, so a composition that only ever existed inside
 * `camera.lookAt` could not be asserted at all. Two QA rounds landed on this
 * shot and neither of the things they found would have been caught by a test of
 * the numbers going IN.
 *
 * AIMED AT THE DUCKS AND NOT AT THE MIDDLE OF THE WATER. `duckPaths` seeds the
 * loops wherever the seed puts them, which is seven metres off the pond's own
 * centre, so a camera aimed at the centre showed the birds off to one side.
 * That was the report.
 *
 * FIXED, NOT FOLLOWING. The first version tracked one duck, which is why it
 * ended up four metres away: a portrait needs a subject. The subject is the
 * lake, so the shot is composed once and is correct on the days when there is
 * nothing swimming on it.
 *
 * The distance is derived from how far any duck ever strays from home, so all
 * three are centred AND in frame by construction rather than by a number that
 * suited one seed.
 */
export function lakeFraming(home, waterLevel, config = GARDEN_CONFIG) {
    const V = config.world.pond.watch;
    const side = V.sideDegrees * Math.PI / 180;
    const half = home.radius + V.framePadding;
    const distance = half / Math.tan((V.fov / 2) * Math.PI / 180);
    return {
        distance,
        half,
        eye: {
            x: home.x + Math.sin(side) * distance,
            y: waterLevel + V.height,
            z: home.z + Math.cos(side) * distance
        },
        at: { x: home.x, y: waterLevel + V.aimHeight, z: home.z }
    };
}

/** Put the borrowed camera where `lakeFraming` says. */
function aimLakeCamera() {
    if (!lakeCamera || !lakeHome) return false;
    const shot = lakeFraming(lakeHome, pondWaterLevel(GARDEN_CONFIG.world));
    lakeCamera.position.set(shot.eye.x, shot.eye.y, shot.eye.z);
    lakeCamera.lookAt(shot.at.x, shot.at.y, shot.at.z);
    return true;
}

function pickGround(clientX, clientY) {
    const ground = getGroundMesh();
    if (!ground || !camera) return null;
    pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(ground, false);
    return hits.length ? hits[0].point : null;
}

/**
 * Say where trees go, for a tap that landed outside the walls.
 *
 * THROTTLED, AND THEN IT STOPS. Looking at the sky is a thing people do in a
 * scene like this, and a toast every time would turn an idle glance upward into
 * being told off. It waits between showings so a double tap is one message, and
 * it gives up after a few, because by then the visitor either understands or is
 * not going to be helped by a fourth copy of the same sentence.
 */
function hintTheWalls() {
    if (wallHints >= 3) return;
    const now = performance.now();
    if (now - wallHintAt < 5000) return;
    wallHintAt = now;
    wallHints += 1;
    toast(isFull()
        ? `This plot holds ${capacity()} trees, and they all go inside the walls.`
        : 'Trees go inside the walls. Tap the grass in the plot to plant one.');
    track('plant-hint');
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
        // THE CARD'S PORTRAIT IS THE TREE'S OWN SPECIES AND SEED, so what turns
        // in it is this tree rather than a stock example of its kind. Built
        // through the same debounced path the plant modal uses, which is what
        // keeps the two from being two ways of doing one thing.
        setPreviewSpecies({
            species: tree.record.species,
            custom: tree.record.custom || {},
            seed: tree.record.seed
        });
        // `kind` rather than `species` in the beacon: the log reads one column
        // across every scene, where a prop, a piece of scenery and a tree are
        // all the kind of thing that was touched.
        track('tree-opened', { kind: tree.record.species });
        return;
    }

    // ---- THE LAKE IS THE OTHER THING ON SCREEN WORTH TOUCHING -------------
    // After the plot's own targets, because the plot is what the visitor came
    // to tend and its beds must never lose a tap to something 42 m behind
    // them. Before the ground, because a tap on the water is a tap on the water
    // and not a misdirected attempt to plant a tree in a lake.
    if (tapLake(clientX, clientY)) return;

    // ---- A TAP THAT LANDS NOWHERE USED TO MEAN NOTHING --------------------
    // Two ways to miss, and neither said so. A tap on the sky, the mountains or
    // the far forest never touches the ground mesh, so `pickGround` came back
    // null and the handler simply returned. A tap on the meadow outside the
    // walls DID hit the ground, and the ring search would slide it up to
    // eighteen metres to the nearest free cell, so a tree appeared most of a
    // plot away from where the visitor pointed.
    //
    // The first taught nothing and the second taught something false. Both now
    // say the one rule the scene has, and neither plants.
    const point = pickGround(clientX, clientY);
    if (!point || !inPlantingReach(point.x, point.z)) { hintTheWalls(); return; }

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
    // The plot has an answer now, so it stops asking the question.
    if (plantNudge) { clearTimeout(plantNudge); plantNudge = null; }
    // The copy names no number on purpose. A tree goes in already part grown
    // (M10-1) and the exact remaining years move with one config value, so a
    // sentence with a figure in it would go stale the first time that changes.
    toast(`${entry.resolved.name} planted as a young sapling. Water it through the summers and it will fill out.`);
    // And the scene turns to look at it. See showTree.
    showTree(entry);
    track('tree-planted', {
        kind: entry.record.species,
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
    // THE DROPLET IS GONE THE INSTANT IT IS PRESSED, so the hover it was
    // carrying has to go with it. Leaving it set would keep a pointer cursor
    // over bare grass and put the highlight on whichever tree inherits the
    // index next.
    setHoveredDrop(-1);
    if (canvas) canvas.style.cursor = '';
    // Somebody who has watered a tree does not need to be told how.
    dropTaught = true;
    save();
    syncWaterAll();
}

/**
 * Water everything that is asking.
 *
 * IT APPEARS AT ONE THIRSTY TREE. It used to wait for three, to keep it a
 * rescue rather than a routine, and that argument was answering the wrong
 * question: this is the keyboard's ONLY route to the care loop, so a threshold
 * of three closed watering entirely for a visitor without a pointer whenever
 * one or two trees were asking. See `waterAllFrom`.
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
/**
 * Say what a droplet is, once, the first time one is on screen.
 *
 * THE SCENE ALREADY TEACHES ITSELF THIS WAY. Planting is taught by a toast a
 * moment after the welcome card goes, rather than by a dialog that takes the
 * view away, and this is the same trick for the same reason. It is the only
 * mechanism that reaches a touch visitor, who has no pointer to hover with and
 * so cannot be told anything by a cursor.
 *
 * Once per visit and never after the first watering, so the sentence is only
 * ever read by somebody who has not yet done the thing it describes.
 */
function teachTheDroplet(count) {
    if (dropTaught || count < 1 || anyModalOpen()) return;
    dropTaught = true;
    toast('A blue droplet means a tree is thirsty. Tap the droplet and it drinks.', 5200);
    track('drop-taught');
}

function syncWaterAll() {
    if (!waterAllBtn) return;
    const M = GARDEN_CONFIG.garden.moisture;
    const count = thirstyCount(getTrees());
    teachTheDroplet(count);
    const show = count >= M.waterAllFrom;
    // `.visible` is what the house chrome uses, and the button is display:none
    // without it. `hidden` as well, so it leaves the tab order rather than
    // sitting in it invisibly, which is the version of this bug that only
    // keyboard visitors ever meet.
    waterAllBtn.classList.toggle('visible', show);
    waterAllBtn.hidden = !show;
    if (show) {
        const { label, aria } = waterAllText(count);
        if (waterAllBtn.textContent !== label) waterAllBtn.textContent = label;
        waterAllBtn.setAttribute('aria-label', aria);
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
    // ---- AND THE CARD STAYS OPEN (M19-1) ---------------------------------
    // It used to close itself, and the reasoning at the time was sound: there
    // was nothing further to do on a card that held four lines of text, the
    // toast had confirmed it, and the only readout of the result was the gauge
    // out on the bed, which is where the visitor was looking.
    //
    // TWO THINGS SINCE HAVE TAKEN THAT ARGUMENT AWAY. The droplet (M13-2) is
    // the one-tap route now, so somebody who has gone as far as opening the
    // card is here to LOOK at the tree rather than to water it in a hurry. And
    // the card has its own gauge and portrait (M16-5), refreshed every frame it
    // is open, so watering from here fills the bar in front of them. Closing
    // threw away the one piece of feedback the card had just gained.
    //
    // Focus is left on the Water button, which is where it was and where a
    // visitor would expect it after pressing something.
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
    // ---- AND THE SKY CLEARS WITH IT (QA 2026-08-31) ---------------------
    // The weather is a state machine with its own dwell and transition, and
    // nothing here ever touched it, so a garden cleared during a downpour got
    // a fresh plot under the same storm. QA: "it doesn't always reset the
    // weather", and the "always" is exactly right: it looked fine whenever it
    // happened to be a clear day already.
    //
    // A new garden opens on the morning the scene opens on, which the clock
    // above already goes back to. The sky is the other half of that frame.
    weather = createWeather('sunny');
    // A new garden gets the composed viewpoint back too. Leaving the visitor
    // up at the birds-eye end looking down at an empty plot is not the frame
    // this scene opens on. THE AIM IS TWO THINGS AND BOTH HAVE TO GO: this
    // scene's own (`resetView`) and the shared part's offset on top of it, or
    // the fresh plot opens turned however far the last visit was panned.
    resetView();
    resetPortraitAim();
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
let previewCtxFor = null;
let previewCtx = null;
let previewTimer = 0;
let previewPending = null;
const PREVIEW_PX = 256;
const previousClear = new THREE.Color();
const scratchColor = new THREE.Color();
// What the renderer was set to before the preview borrowed a corner of it, read
// back off the renderer rather than rebuilt. See renderPreview.
const previousViewport = new THREE.Vector4();
const previousScissor = new THREE.Vector4();

/**
 * The backdrop the preview tree stands against.
 *
 * ---- IT WAS A DARK GREEN BEHIND GREEN LEAVES ----
 *
 * The clear colour was 0x1d2a18, which is a dark FOLIAGE green, so every canopy
 * in the list was being shown against its own hue at its own value. QA reported
 * it as too dark and too similar to the trees, and the brightness was the lesser
 * half of that: hue was the rest.
 *
 * ---- AND NO FLAT COLOUR CAN DO IT, WHICH IS WHY THIS IS A GRADIENT ----
 *
 * Measured across all seventeen species, the two ends of the range fight each
 * other. Foliage runs mid to dark, so it wants a LIGHT backdrop. The Quaking
 * Aspen and the Paper Birch have chalk-white bark, which against a light
 * backdrop measures 1.07:1 and 1.15:1, near enough invisible. Any single value
 * loses one end or the other.
 *
 * A gradient wins both because the tree is not one thing evenly distributed:
 * CANOPY IS HIGH IN THE FRAME AND TRUNK IS LOW. Sky at the top for the leaves,
 * a deeper neutral at the bottom for the trunks, and a white trunk goes from
 * 1.07:1 to about 1.75:1 without costing the canopy anything.
 *
 * Drawn as an inside-out sphere rather than a plane, so it fills the frame at
 * any camera distance: the preview camera is placed per tree from that tree's
 * height, and a plane sized for a Japanese Maple would not cover a Redwood.
 */
function previewBackdrop() {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, '#cfe0ea');
    grad.addColorStop(0.55, '#b6c4c8');
    grad.addColorStop(1, '#9a9182');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.SphereGeometry(120, 12, 8);
    const mat = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        // UNLIT AND UNTONED. It is a backdrop, not a surface in the scene: the
        // colours above are what should arrive on screen, and anything that
        // lit or tone mapped them would move them somewhere else.
        fog: false,
        toneMapped: false,
        depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'preview-backdrop';
    mesh.renderOrder = -1;
    return mesh;
}

function buildPreview() {
    previewScene = new THREE.Scene();
    previewCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    const key = new THREE.DirectionalLight(0xfff4e2, 2.6);
    key.position.set(6, 10, 8);
    previewScene.add(key);
    previewScene.add(new THREE.HemisphereLight(0xbcd8ee, 0x4a5a34, 0.9));
    previewScene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const backdrop = previewBackdrop();
    if (backdrop) previewScene.add(backdrop);
}

function handleCustomChange(selection) {
    setPreviewSpecies(selection);
}

/**
 * Ask for a turning tree.
 *
 * ONE ENTRY POINT FOR BOTH MODALS. The plant modal asks for the species under
 * the cursor; the tree card asks for the tree the visitor tapped, seed and all,
 * so the portrait is that tree rather than a stock example of its kind.
 *
 * `seed` is optional and the difference is deliberate: the plant modal passes
 * none and gets the fixed showcase seed, because moving between species should
 * show the species rather than a different tree each time.
 */
function setPreviewSpecies(selection) {
    previewPending = {
        species: selection.species,
        custom: { ...(selection.custom || {}) },
        seed: selection.seed
    };
    // Debounced, so moving quickly down the species list does not bake a
    // skeleton per row.
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(rebuildPreview, 120);
}

function rebuildPreview() {
    if (!previewScene || !previewPending) return;
    const { species, custom, seed } = previewPending;
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
    previewTree = createTree(previewResolved, seed === undefined ? 0x5EED : seed,
        { mobile: state.mobile });
    previewScene.add(previewTree.group);

    // FRAMED ON WHAT IS ACTUALLY THERE. The plant modal draws its tree full
    // grown so `matureHeight` is right for it, but the tree card draws a tree at
    // its own age, and a sapling framed for the giant it will become is a few
    // pixels in the middle of an empty square.
    const entry = isCardOpen() ? getCardEntry() : null;
    const h = entry
        ? Math.max(0.6, currentHeight(entry.record, previewResolved))
        : previewResolved.matureHeight;
    previewCamera.position.set(h * 1.05, h * 0.72, h * 1.35);
    previewCamera.lookAt(0, h * 0.45, 0);
}

/**
 * What the turning preview should be showing.
 *
 * TWO CALLERS AND TWO ANSWERS. The plant modal shows a tree FULL GROWN, because
 * the visitor is choosing what they will eventually have rather than the
 * sapling they are about to plant. The tree card shows the tree AS IT IS: its
 * own growth, health, season and fruit, because a portrait of your tree that
 * looked nothing like the one on the bed would be a catalogue photograph.
 */
function previewDrive(time) {
    const entry = isCardOpen() ? getCardEntry() : null;
    if (!entry) {
        const schedule = previewResolved && previewResolved.schedule;
        return {
            growth: 1, health: 1, leaf: 1, color: 0, spring: 0, drop: 0, bud: 0,
            snow: 0, wind: { x: 0.05, z: 0 }, time,
            // ---- AND CARRYING WHAT IT IS FOR (M18) ------------------------
            // An apple tree in the chooser should have red apples on it and an
            // orange tree oranges, which is the thing a visitor is picking
            // between when they pick a fruit tree. The moment comes off the
            // species' OWN schedule, so the preview cannot promise something
            // the tree will not do.
            //
            // THE CANOPY STAYS IN FULL SUMMER LEAF while the fruit comes from
            // the ripe hour, and that is a deliberate inconsistency. Half of
            // these ripen in autumn, so an honest hour would show the apple and
            // the pear turning and half bare. This is a showcase and not a
            // simulation: the tree card next door is where a visitor sees the
            // truth about their own tree, at its real hour, and it uses the
            // same `viewFor` the garden does.
            fruit: schedule ? fruitStageAt(showcaseHour(schedule), schedule) : null,
            // A mature, healthy specimen bears a full crop by construction.
            crop: 1
        };
    }
    // THE SAME CALL THE GARDEN DRIVES THIS TREE WITH, options included, so the
    // two cannot disagree about what it looks like today. Dropping `evergreen`
    // or `schedule` here would quietly give the portrait a deciduous year and
    // no fruit, which is the shape of bug that reads as "the card is wrong
    // about my orange tree" long after anybody would look here.
    const hour = hourAt(state.elapsedSeconds);
    return viewFor(entry.record, hour, {
        evergreen: entry.resolved.evergreen,
        schedule: entry.resolved.schedule,
        snow: snowCoverageAt(hour),
        // NO WIND IN A PORTRAIT. It should hold still enough to be looked at,
        // and the turn is doing the work of showing it is alive.
        wind: { x: 0, z: 0 },
        time
    });
}

/**
 * The preview rectangle, in the two units that both have a claim on it.
 *
 * ---- setViewport AND setScissor TAKE CSS PIXELS, NOT BUFFER PIXELS ----
 *
 * This is the whole of the bug that cost QA two separate reports. Both of those
 * three.js calls multiply what they are handed by the renderer's pixel ratio
 * before touching GL, so a rectangle stated in drawing-buffer pixels is scaled
 * by the ratio a SECOND time. At a ratio of 1 the two units are the same number
 * and everything worked, which is why this shipped: the machine it was written
 * and reviewed on runs at 1. At the 1.5 a phone gets, the preview's rectangle
 * lands entirely off the top of the buffer, so the thumbnail is whatever stale
 * pixels happen to be in the corner (QA: "the tree isn't visible in the
 * rotating preview window"), AND the restore afterwards leaves the MAIN scene
 * on a viewport half again too big, so from then on the garden is drawn zoomed
 * and offset from where every projection in this file thinks it is. That is the
 * second report: taps on a planted tree's mulch missed it and fell through to
 * "Trees go inside the walls", because planting is what opens a modal.
 *
 * So the rect is computed in CSS pixels for three, and in buffer pixels for
 * `drawImage`, which reads a canvas in its own intrinsic pixels and knows
 * nothing about ratios. `device` is derived from `css` by the same floor three
 * applies, so the two can never describe different rectangles.
 */
export function previewRect(bufferWidth, bufferHeight, pixelRatio, wanted = PREVIEW_PX) {
    // Every input is read back off a renderer, so every one of them is guarded:
    // a NaN here would be a scissor rectangle of NaN, which draws nothing and
    // reports nothing.
    const pr = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
    const bw = Number.isFinite(bufferWidth) && bufferWidth > 0 ? bufferWidth : wanted;
    const bh = Number.isFinite(bufferHeight) && bufferHeight > 0 ? bufferHeight : wanted;
    const css = Math.max(1, Math.min(
        Math.floor(wanted / pr), Math.floor(bw / pr), Math.floor(bh / pr)));
    // What three will actually hand GL once it has multiplied and floored.
    const device = Math.max(1, Math.floor(css * pr));
    // WebGL measures its viewport from the BOTTOM of the buffer, so this is the
    // TOP left corner of the picture. drawImage measures from the top, which is
    // why the copy reads from (0, 0) and not from the same number. Getting that
    // backwards copies a corner of the sky instead. The half pixel is there so
    // the floor three applies lands on `bufferHeight - device` exactly rather
    // than a row below it.
    const cssTop = (bh - device + 0.5) / pr;
    return { css, device, cssTop };
}

/**
 * Draw a scene into the corner of the main buffer and copy it to a 2D canvas.
 *
 * ONE WEBGL CONTEXT FOR THE WHOLE PAGE, which is the point of all of this: a
 * second context for a thumbnail would be an unforced error on a phone. Two
 * callers now, and they are deliberately different in kind. The tree portraits
 * draw a private little scene built for the purpose; the lake's card draws THE
 * SCENE ITSELF from a second camera, so what the visitor sees is the same water
 * under the same sky at the same hour, and nothing about it can drift from the
 * world it is a view of.
 *
 * `clear` is the colour to wipe the rectangle with first, or null to leave the
 * renderer's own alone. The lake view wants the latter: the sky dome covers the
 * frame, so a clear colour would only ever be seen through a bug.
 */
function drawIntoCorner(target, scene3, camera3, clear, wanted = PREVIEW_PX) {
    if (!renderer || !target || !scene3 || !camera3) return;
    const rect = previewRect(renderer.domElement.width, renderer.domElement.height,
        renderer.getPixelRatio(), wanted);

    // RESTORED FROM WHAT WAS THERE, never from numbers rebuilt by hand. The
    // hand-built restore is what leaked a wrong viewport into the whole scene
    // for the rest of the session, and the renderer is holding the right answer
    // already.
    previousClear.copy(renderer.getClearColor(scratchColor));
    const previousAlpha = renderer.getClearAlpha();
    renderer.getViewport(previousViewport);
    renderer.getScissor(previousScissor);
    const previousScissorTest = renderer.getScissorTest();

    renderer.setScissorTest(true);
    renderer.setViewport(0, rect.cssTop, rect.css, rect.css);
    renderer.setScissor(0, rect.cssTop, rect.css, rect.css);
    if (clear !== null) renderer.setClearColor(clear, 1);
    renderer.clear();
    renderer.render(scene3, camera3);
    renderer.setScissorTest(previousScissorTest);
    renderer.setViewport(previousViewport);
    renderer.setScissor(previousScissor);
    renderer.setClearColor(previousClear, previousAlpha);

    // THE CONTEXT BELONGS TO A CANVAS, so it is re-taken whenever the
    // destination changes. Caching one across the cards would have drawn the
    // tree card's portrait into the plant modal's canvas, which is the sort of
    // bug that only shows up on the second thing a visitor does. The size is
    // re-checked too, because the pixel ratio moves under the quality governor.
    if (!previewCtx || previewCtxFor !== target || target.width !== rect.device) {
        target.width = rect.device;
        target.height = rect.device;
        previewCtx = target.getContext('2d');
        previewCtxFor = target;
    }
    if (previewCtx) {
        // Same task as the render, so the drawing buffer is still valid. That
        // is why the main renderer needs no preserveDrawingBuffer, which would
        // cost every frame of the whole scene to serve one thumbnail.
        previewCtx.drawImage(renderer.domElement,
            0, 0, rect.device, rect.device, 0, 0, rect.device, rect.device);
    }
}

function renderPreview(time) {
    if (!previewTree || !previewScene) return;
    const target = getPreviewCanvas();
    if (!target) return;

    previewTree.group.rotation.y = state.reducedMotion ? 0.6 : time * 0.35;
    updateTree(previewTree, previewDrive(time), previewResolved);
    drawIntoCorner(target, previewScene, previewCamera, 0x9a9182);
}

/**
 * Draw the lake's card: the real scene, from 22 metres off the water.
 *
 * THE WATER IS TOLD WHICH EYE IS LOOKING AT IT. The pond's Fresnel is computed
 * from `uEye`, which `updateVista` sets to the scene camera once a frame, so
 * without this the view would light its water with an angle taken from sixty
 * metres behind it. Set, draw, set back.
 *
 * CAPTURED AT MORE PIXELS THAN A TREE THUMBNAIL. This card is a "look closer",
 * so the resolution IS the feature: at `capturePx` a duck covers 36 px against
 * the 11.5 it gets on a 1600 px screen.
 */
function renderLakeView() {
    const target = getLakeCanvas();
    if (!target || !camera || !aimLakeCamera()) return;
    setVistaEye(lakeCamera.position);
    drawIntoCorner(target, scene, lakeCamera, null, GARDEN_CONFIG.world.pond.watch.capturePx);
    setVistaEye(camera.position);
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
let tendingBegun = false;
let helpReturn = null;
let plantNudge = null;

/**
 * What an empty plot says, in order.
 *
 * THE SECOND ONE NAMES THE CLOCK, and that is the sentence a newcomer is most
 * missing. Nothing on screen says a day and night is a year, so a visitor
 * watching a sapling for thirty seconds and seeing no change has no way to know
 * whether the scene is slow, broken, or waiting for them. The season chip says
 * "Spring, year 3" and means nothing until somebody explains what a year is.
 */
const PLANT_NUDGES = [
    'Tap any patch of grass to plant your first tree.',
    'Every day and night here is a year, so a tree you plant now will fill out while you watch.',
    'Still an empty plot. Tap the grass inside the walls to choose a tree.'
];
let wallHints = 0;
let wallHintAt = -1e9;
let dropTaught = false;

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

    // WHAT IS ACTUALLY FALLING, which is what greys the clouds. The cover
    // already rises on its own through `overcastAt`; this is the colour.
    const wet = Math.max(fall.rain, fall.snow);
    updateSky(hour, delta, snow, weather.gloom, fall.flash, cloud, state.sceneSeconds, wet);
    updateTerrain(hour, snow);
    updateForest(hour, snow, weather.wind, state.sceneSeconds, motionScale());
    updateVista(hour, state.sceneSeconds, snow, weather.gloom, camera, cloud, wet);
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
    if (isLakeOpen()) refreshLakeCard(duckFlightAt(hour));

    // The camera, in order: the move after planting if one is running, then
    // our own dolly, then the shared part's yaw and tilt refining the aim on
    // top of it. `delta` and not `gardenDelta`: a camera move is animation, so
    // it runs at the rate the screen does rather than at the rate a year does.
    stepView(delta);
    applyView();
    // HOW FAR THE VISITOR MAY LOOK TO THE SIDE DEPENDS ON WHERE THE EYE IS AND
    // ON HOW WIDE THE FRAME IS, and both move in this scene. Set before the
    // part reads it, so the clamp the drag and the buttons work against is this
    // frame's.
    setPanLimit(panLimitFor(getDolly(), {
        halfWidth: frameHalfWidth(),
        composed: composedView(),
        corner: plantingCorner
    }));
    updatePortraitControls(delta);
    // After the part, so the yaw and tilt it may have just changed are the ones
    // being asked about rather than last frame's.
    syncViewReset();

    // ---- THE PREVIEW GOES FIRST, AND THAT IS THE WHOLE FIX ----------------
    // It draws into a SCISSOR RECTANGLE at the top left of the main drawing
    // buffer and copies those pixels out to a 2D canvas. Drawn after the scene,
    // the copy was taken correctly and then the frame was PRESENTED with the
    // rectangle still stamped in the corner: a second, ghostly tree over the
    // top left of the garden whenever either modal was open. QA found it.
    //
    // Going first costs nothing and needs no restore pass, because
    // `renderer.render` clears the whole buffer before it draws. The copy is
    // still taken in the same task as the render, which is what makes it valid
    // without `preserveDrawingBuffer`.
    //
    // EITHER MODAL, since both show the same turning tree through the same
    // rectangle and neither can be open while the other is.
    if (isPlantOpen() || isCardOpen()) renderPreview(state.sceneSeconds);
    // THE LAKE'S CARD DRAWS THE SCENE ITSELF, so it has to come after
    // everything that moved the world this frame and before the main pass that
    // clears the buffer. Same rectangle, same copy, a different camera.
    if (isLakeOpen()) renderLakeView();
    if (renderer && scene && camera) renderer.render(scene, camera);

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
                radiusPx: b.radiusPx === undefined ? null : Math.round(b.radiusPx),
                radiusYPx: b.radiusYPx === undefined ? null : Math.round(b.radiusYPx)
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
