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
 * M1, THE ROUND (2026-10-06): a minute to clear the lawn, starting with the
 * first blow (round.js), a HUD with the clock and the share cleared, an end
 * card that says where the leaves went (score.js) with Play again, Share and
 * Keep blowing, and free play with no clock from the welcome card.
 *
 * M2, THE NEIGHBOR (2026-10-06): leaves blown over the picket fence bring
 * him out to blow them back (neighbor.js), with his own jet in the same sim,
 * his figure and his front door, a camera that widens to keep him in frame,
 * and, when the round is over, a wave.
 *
 * M3, THE FINALE (2026-10-06): the moment the clock runs out the result is
 * counted and the person takes a running dive into the tarp's pile
 * (finale.js), landing in it in a burst of leaves (burst in sim.js), or,
 * for a pile too small, flopping on the lawn and hurting their back, then
 * rolling over a little to look at the camera. A tap or a key skips it.
 *
 * M4, THE CHARACTER (2026-10-06): the welcome card's "Change your character"
 * opens a card beside the yard (cast.js for the choices) with the camera in
 * close on the person, who changes as each choice is made. The choice is
 * kept in this browser.
 *
 * M5, THE ENVIRONMENT (2026-10-06): the yard's trees (trees.js), whose
 * crowns hold some of the yard's leaves and keep letting them go, the trees
 * down the block, the two houses and the street (house.js, through
 * yard.js), with a porch, pumpkins and a parked car leaves can land on
 * (platforms in sim.js), and the sky.
 *
 * M6, DELIGHTS AND SURPRISES (2026-10-07): things lost under the leaves,
 * found only by clearing the lawn over them (finds.js), Halloween
 * decorations all October (decorations.js), Halloween week's
 * jack-o-lanterns and trick-or-treaters (halloween.js), and the blower's
 * whoosh, off until the visitor turns it on (sound.js). A cat and a
 * squirrel were built and taken out at Steve's QA.
 *
 * UNLISTED. The page carries noindex and is in no directory, sitemap or
 * llms.txt until the scene it grows into is released.
 */

import { LEAVES_CONFIG } from './config.min.js';
import {
    createSim, resetSim, scatterLeaves, stepSim, makeJet, pilePeak, burst, solidBoxes, makeRandom
} from './sim.min.js';
import { buildTrees, updateTrees, createCrowns, stepCrowns } from './trees.min.js';
import { planFinale, finaleAt } from './finale.min.js';
import { createRound, resetRound, freePlay, canBlow, timeLeft, stepRound } from './round.min.js';
import { findsFor, placeFinds, stepFinds, buildFindModels } from './finds.min.js';
import { seasonFor, carvePumpkins, createTreaters, stepTreaters, createTreaterFigures } from './halloween.min.js';
import { buildDecorations } from './decorations.min.js';
import { createSound } from './sound.min.js';
import { createNeighbor, resetNeighbor, stepNeighbor, isOut, neighborBlower } from './neighbor.min.js';
import {
    tally, clearedShare, percent, clockText, verdict, resultRows, shareText, resultSentence, diveLine, findsLine
} from './score.min.js';
import { createLeafMesh } from './leafmesh.min.js';
import { buildYard } from './yard.min.js';
import { createOperator, stepOperator, facing, createOperatorFigure } from './blower.min.js';
import { cameraFor, cameraOn, cameraCast, castFrame, rayToGround, ease } from './view.min.js';
import {
    PRESETS, SKINS, HAIR_COLORS, HAIR_LENGTHS, DEFAULT_CHOICE,
    loadChoice, saveChoice, forgetChoice, personConfig, castLine
} from './cast.min.js';
import { isQaHost, labOptions, labSearch, statsLines, fpsOf, shortCount } from './lab.min.js';
import {
    getProofOfWork, bufToHex, shieldOverlayControl, installCardFocusTrap, installCardScrollReset
} from '../../shared/js/boot-1.0.0.min.js';
import { warmShaders } from '../../shared/js/warmup-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';
import { installShare } from '../../shared/js/share-1.0.0.min.js';
import { createPromoCard, createDirectoryLink } from '../../shared/js/promo-1.0.0.min.js';

const CONFIG = LEAVES_CONFIG;
const B = CONFIG.blower;
const N = CONFIG.neighbor;

const state = {
    isLoaded: false,
    isRunning: false,
    isMobile: false,
    // Whether this screen is touched, so the blow button belongs on it: a
    // coarse pointer from the start, or the first finger on the lawn.
    touch: false,
    reducedMotion: false,
    qa: false,
    count: 0,
    shadows: true,
    ratio: 1,
    // October's decorations and Halloween week (M6), by the date or the
    // lab's address, and the lab's every-find-showing.
    decor: false,
    halloween: false,
    showFinds: false,
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
let blowBtn = null;
let endModal = null;
let castModal = null;
// The trees, their crowns' leaves, and every solid box on the ground (M5).
let trees = [];
let crowns = [];
const solids = solidBoxes(CONFIG.yard);
// Who is on leaf duty (cast.js), the choice as it was when the card opened
// (to tell whether it changed), and the radio buttons the card is built of.
let castChoice = { ...DEFAULT_CHOICE };
let castBefore = null;
const castInputs = [];
let cleanupController = null;

// The round, and the count of where the leaves are, refreshed a few times a
// second (counting walks every leaf).
const round = createRound(CONFIG.round);
let counted = { lawn: 0, tarp: 0, street: 0, neighbor: 0, total: 0 };
let countedAgo = Infinity;
// The last result, for the share button.
let result = null;
// The neighbor, his figure and his door; which leaves have been over the
// fence this round.
const neighbor = createNeighbor(N);
let neighborFigure = null;
let neighborDoor = null;
let sent = null;
// The finale: its plan, how far into it we are, whether the burst has gone
// off, the arms it left the person in, and the result as it stood before
// the dive (the burst throws leaves off the tarp, and a dive should not
// lower the score it celebrates).
const finale = { plan: null, t: 0, burst: false, arms: 'carry', tally: null };
// THE DELIGHTS (M6). The finds hidden this round, their models, and the
// names of the ones found (for the end card), with the count of rounds so
// each hides them somewhere new. October's decorations and Halloween week's
// trick-or-treaters. The sound, and the find's name under the HUD until
// `until`.
let findList = [];
let finds = [];
let findModels = {};
let found = [];
let findRounds = 0;
let decorations = null;
let treaters = null;
let treaterFigures = null;
const treatRandom = makeRandom(4049);
const sound = createSound(CONFIG.sound);
let soundBtn = null;
const toast = { el: null, until: 0 };
// What has been said once this visit, so the live region is not flooded.
const told = new Set();

// What the HUD last showed, so it is only written when it changes.
const hudShown = { clock: '', cleared: '', phase: '' };

let welcomed = false;
let welcomeReturn = null;

// The pointer that is steering, if any. A mouse steers by hovering and blows
// while a button is held. A finger on the lawn only steers (it walks the
// person over and aims), and the blow button runs the blower, since one
// finger doing both made the leaves impossible to place (Steve's phone QA,
// 2026-10-06).
// `client` is where on the screen a mouse last pointed: the aim is worked out
// from it again every frame, so it stays on whatever is under the cursor as
// the view slides (M6 QA).
const pointer = { id: null, down: false, mouse: false, blows: false, aim: null, seen: false, client: null };
// The blow button, held by a finger (by pointer id) or by Space or Enter
// while it has focus.
const blowHold = { id: null, key: false };
// Keys held: the walk, and Space for the blower.
const keys = { left: false, right: false, up: false, down: false, blow: false };
let steer = 'point';
// The camera's eased position and target.
const view = { position: null, target: null };
// Shadows are redrawn at most config.shadows.hz times a second while
// anything moves, and a frame that moved something is owed one.
const shade = { owed: true, since: 0 };
// The lab's measurements.
const lab = { el: null, frames: 0, seconds: 0, simMs: 0, uploaded: 0, start: 0 };

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
    blowBtn = document.getElementById('blow-btn');
    endModal = document.getElementById('end-modal');
    castModal = document.getElementById('cast-modal');
    soundBtn = document.getElementById('sound-btn');
    toast.el = document.getElementById('find-toast');
    if (!canvas || typeof THREE === 'undefined') return;
    // The markup starts it hidden. Said again here so the round never begins
    // believing a card is up.
    if (endModal) endModal.classList.add('hidden');
    if (castModal) castModal.classList.add('hidden');
    castChoice = loadChoice();
    setText('cast-name', castLine(castChoice));

    state.isMobile = detectMobile();
    state.touch = state.isMobile;
    state.reducedMotion = prefersReducedMotion();
    state.qa = isQaHost();
    // The address only steers the lab on a QA host. Anywhere else the page
    // runs at the device's defaults whatever the address says.
    const options = labOptions(state.qa ? window.location.search : '', CONFIG, state.isMobile);
    state.count = options.count;
    state.shadows = options.shadows;
    state.ratio = options.ratio;
    state.showFinds = options.finds;
    const season = seasonFor(window.location.search, new Date(), CONFIG.halloween, state.qa);
    state.decor = season.decor;
    state.halloween = season.week;
    setMobile(state.isMobile);
    applySiteLinks();

    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus(state.halloween ? 'Carving the pumpkins…' : 'Raking the yard…', 30);
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

    const yard = buildYard(scene, CONFIG, { shadows: state.shadows, mobile: state.isMobile });
    neighborDoor = yard.neighborDoor;
    if (state.decor) {
        decorations = buildDecorations(CONFIG);
        scene.add(decorations.group);
    }
    if (state.halloween) scene.add(carvePumpkins(CONFIG.yard.pumpkins, CONFIG.halloween));

    updateLoadingStatus(`Letting ${shortCount(state.count)} leaves fall…`, 55);
    sim = createSim(state.count, CONFIG);
    const { look } = scatterLeaves(sim, CONFIG);
    trees = buildTrees(scene, CONFIG, { mobile: state.isMobile, shadows: state.shadows });
    crowns = createCrowns(sim, CONFIG);
    leaves = createLeafMesh(sim, look, {
        shadows: state.shadows,
        underside: CONFIG.look.underside,
        anisotropy: renderer.capabilities && renderer.capabilities.getMaxAnisotropy
            ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 4
    });
    leaves.update();
    scene.add(leaves.mesh);
    sent = new Uint8Array(state.count);
    findList = findsFor(CONFIG.finds, state.halloween);
    findModels = buildFindModels(findList);
    Object.values(findModels).forEach((m) => scene.add(m.group));
    layFinds();

    operator = createOperator(B);
    figure = createOperatorFigure(B, CONFIG.look, { person: personConfig(castChoice) });
    figure.update(operator, false, 0);
    scene.add(figure.group);
    neighborFigure = createOperatorFigure(B, CONFIG.look, {
        name: 'neighbor',
        person: {
            role: 'neighbor', shirtColor: N.look.shirt, sleeveColor: N.look.shirt,
            pantsColor: N.look.pants, skinTone: N.look.skin, hairColor: N.look.hair
        },
        blower: N.look.blower,
        bigBlower: N.look.bigBlower
    });
    neighborFigure.update(neighbor, false, 0);
    neighborFigure.group.visible = false;
    scene.add(neighborFigure.group);
    marker = buildMarker();
    scene.add(marker);
    // In Halloween week the trick-or-treaters (M6), out of sight to begin
    // with.
    if (state.halloween) {
        treaters = createTreaters(CONFIG.halloween, treatRandom);
        treaterFigures = createTreaterFigures(CONFIG.halloween);
        scene.add(treaterFigures.group);
    }

    placeCamera(true);
    setupEventListeners();
    installRoundControls();
    if (state.qa) installLab();
    recount();
    updateHud();

    // Compile the shaders behind the loading screen rather than on the first
    // visible frame, where the hitch would be the visitor's first impression.
    updateLoadingStatus('Warming up the blower…', 85);
    await warmUp();

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

/** Compile the shaders behind the loading screen, the hidden things too:
 *  the finds and the trick-or-treaters are shown for the compile, under
 *  the lawn where nothing sees them, so the first one to appear does not
 *  stall a frame building its programs. */
async function warmUp() {
    const hidden = [
        ...Object.values(findModels).map((m) => m.group),
        treaterFigures && treaterFigures.group
    ].filter(Boolean);
    const was = hidden.map((g) => ({ g, visible: g.visible, y: g.position.y }));
    hidden.forEach((g) => {
        g.visible = true;
        g.position.y = -20;
    });
    await warmShaders(renderer, [{ scene, camera }]);
    was.forEach(({ g, visible, y }) => {
        g.visible = visible;
        g.position.y = y;
    });
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
    const want = cameraFor(aspect, CONFIG.camera, CONFIG.yard.lawn, operator, isOut(neighbor) ? neighbor : null);
    if (snap || !view.position) {
        view.position = { ...want.position };
        view.target = { ...want.target };
    }
    camera.position.set(view.position.x, view.position.y, view.position.z);
    camera.lookAt(view.target.x, view.target.y, view.target.z);
}

/** Ease the camera toward where it wants to be this frame. */
function followCamera(dt) {
    const aspect = window.innerWidth / window.innerHeight;
    // The finale's view: in close on the pile, the house behind it, held
    // through the end card. Reduced motion keeps the usual view.
    const onPile = finale.plan && !state.reducedMotion && (round.phase === 'finale' || round.phase === 'done');
    let want;
    if (castShown()) want = cameraCast(operator, aspect, CONFIG.camera, castFrame(window.innerWidth, window.innerHeight));
    else if (onPile) want = cameraOn(finale.plan.land, aspect, CONFIG.camera, CONFIG.finale.span);
    else want = cameraFor(aspect, CONFIG.camera, CONFIG.yard.lawn, operator, isOut(neighbor) ? neighbor : null);
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
        if (castShown()) frameCast();
    }, { signal });

    // Keep the view from being pinch-zoomed by iOS Safari, which ignores
    // user-scalable=no. Safari-only gesture events, this page only.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) =>
        document.addEventListener(type, (e) => e.preventDefault(), { passive: false, signal }));

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            endSession();
            sound.pause();
        } else {
            sound.resume();
        }
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
        const castBtn = document.getElementById('cast-btn');
        if (shieldOverlayControl(castBtn, { signal })) {
            castBtn.addEventListener('click', openCast, { signal });
        }
        const freeBtn = document.getElementById('free-btn');
        if (shieldOverlayControl(freeBtn, { signal })) {
            freeBtn.addEventListener('click', startFreePlay, { signal });
        }
    }
    if (helpBtn) helpBtn.addEventListener('click', () => returnToWelcome('help'), { signal });
    if (soundBtn) soundBtn.addEventListener('click', () => toggleSound('button'), { signal });
    installCardFocusTrap({ signal });
    installCardScrollReset({ signal });

    document.addEventListener('keydown', onKeyDown, { signal });
    document.addEventListener('keyup', onKeyUp, { signal });
    // A key released while the window was elsewhere never sends its keyup.
    window.addEventListener('blur', releaseInput, { signal });

    // Steering by pointer events, so a mouse, a pen and a finger are one path.
    canvas.addEventListener('pointerdown', (event) => {
        if (skipFinale()) return;
        if (welcomeShown() || (pointer.id !== null && pointer.id !== event.pointerId)) return;
        pointer.id = event.pointerId;
        pointer.down = true;
        pointer.mouse = event.pointerType === 'mouse';
        // A mouse or a pen presses to blow. A finger only walks and aims.
        pointer.blows = event.pointerType !== 'touch';
        if (event.pointerType === 'touch' && !state.touch) {
            state.touch = true;
            setChromeVisible(true);
        }
        steer = 'point';
        aimAt(event.clientX, event.clientY);
        if (canvas.setPointerCapture) {
            try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* not capturable */ }
        }
        if (pointer.blows) noteBlow();
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
        pointer.blows = false;
        // A finger lifted leaves nothing to steer by. A mouse still hovers.
        if (!pointer.mouse) {
            pointer.aim = null;
            pointer.client = null;
        }
    };
    canvas.addEventListener('pointerup', release, { signal });
    canvas.addEventListener('pointercancel', release, { signal });
    // A mouse leaving the lawn (off the window, or over the lab's panel)
    // stops steering from the screen, but the person still goes where it
    // last pointed. Dropping the aim stopped them dead whenever the cursor
    // crossed the panel (Steve's M6 QA: "I can't walk all the way to the
    // row of hedges" with the neighbor out, when the zoomed out lawn sits
    // higher on the screen, under the panel).
    canvas.addEventListener('pointerleave', (event) => {
        if (event.pointerType === 'mouse' && pointer.id === null) pointer.client = null;
    }, { signal });

    if (blowBtn) installBlowButton(blowBtn, signal);
}

/** The blow button runs the blower while it is held, by a finger or by
 *  Space or Enter while it has focus. Its own pointer, so a second thumb can
 *  hold it while the first one steers. */
function installBlowButton(btn, signal) {
    // Called before the hold is recorded, so a blow is counted once however
    // many ways the button is held at the same moment.
    const press = () => {
        if (welcomeShown() || endShown() || !canBlow(round)) return false;
        if (!blowHeld()) noteBlow();
        btn.classList.add('held');
        return true;
    };
    btn.addEventListener('pointerdown', (event) => {
        if (event.cancelable) event.preventDefault();
        if (!press()) return;
        blowHold.id = event.pointerId;
        if (btn.setPointerCapture) {
            try { btn.setPointerCapture(event.pointerId); } catch (e) { /* not capturable */ }
        }
    }, { signal });
    const lift = (event) => {
        if (event.pointerId !== blowHold.id) return;
        blowHold.id = null;
        if (!blowHeld()) btn.classList.remove('held');
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) =>
        btn.addEventListener(type, lift, { signal }));
    // A long press must not open the browser's menu over the button.
    btn.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
    btn.addEventListener('keydown', (event) => {
        if (event.code !== 'Space' && event.code !== 'Enter') return;
        event.preventDefault();
        if (event.repeat || !press()) return;
        blowHold.key = true;
    }, { signal });
    btn.addEventListener('keyup', (event) => {
        if (event.code !== 'Space' && event.code !== 'Enter') return;
        blowHold.key = false;
        if (!blowHeld()) btn.classList.remove('held');
    }, { signal });
}

function blowHeld() {
    return blowHold.id !== null || blowHold.key;
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
    pointer.client = { x: clientX, y: clientY };
}

const WALK_KEYS = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right'
};

function onKeyDown(event) {
    // M turns the sound on or off wherever the visitor is, unless they are
    // typing, or holding a modifier (the browser's own shortcuts).
    if (event.code === 'KeyM' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey && !isTextEntry(event.target)) {
        if (state.isLoaded) toggleSound('key');
        return;
    }
    // The character card keeps its keys too (its radio buttons take the
    // arrows), and Escape is Done.
    if (castShown()) {
        if (event.code === 'Escape') closeCast();
        return;
    }
    // The end card keeps its keys: its buttons take Enter and Space, Tab is
    // the focus trap's, and Escape keeps blowing.
    if (endShown()) {
        if (event.code === 'Escape') keepBlowing();
        return;
    }
    if (round.phase === 'finale' && ['Space', 'Enter', 'Escape'].includes(event.code)) {
        event.preventDefault();
        skipFinale();
        return;
    }
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
    pointer.blows = false;
    blowHold.id = null;
    blowHold.key = false;
    if (blowBtn) blowBtn.classList.remove('held');
}

/** Whether the blower is running: a mouse or pen pressed on the lawn, Space,
 *  or the blow button held. Never behind the welcome card. */
export function isBlowing(playing, ptr, held, button) {
    return playing && ((ptr.down && ptr.blows) || held.blow || button.id !== null || button.key);
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

// ---- The sound (M6) -------------------------------------------------------

/** The button or M: the whoosh on or off. Off on every visit to begin with,
 *  and never remembered. */
function toggleSound(how) {
    const on = sound.toggle();
    if (soundBtn) {
        soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        soundBtn.title = on ? 'Sound on (M)' : 'Sound off (M)';
    }
    announce(on ? 'Sound on.' : 'Sound off.');
    track('sound', { outcome: on ? 'on' : 'off', kind: how });
    return on;
}

/** The neighbor's side of the view, -1 (left) to 1 (right), for his
 *  blower's pan. */
function panOf(x) {
    const at = view.target ? view.target.x : 0;
    return Math.max(-1, Math.min(1, (x - at) / 12));
}

// ---- The welcome screen ---------------------------------------------------

function welcomeShown() {
    return Boolean(blocker) && !blocker.classList.contains('hidden');
}

/** The help button, the blow button and the HUD follow the welcome screen
 *  and the end card: nothing to press until the visitor is in, and nothing
 *  over a card. */
function setChromeVisible(on) {
    const shown = on && !welcomeShown() && !endShown() && !castShown();
    if (helpBtn) helpBtn.classList.toggle('visible', shown);
    if (soundBtn) soundBtn.classList.toggle('visible', shown);
    if (!shown) hideToast();
    if (blowBtn) blowBtn.classList.toggle('visible', shown && state.touch);
    const hud = document.getElementById('round-hud');
    if (hud) hud.classList.toggle('visible', shown);
}

/** The welcome card's "just play with the leaves": the yard with no clock. */
function startFreePlay() {
    if (!state.isLoaded) return;
    if (round.phase !== 'free') {
        freePlay(round);
        track('free-blow', { outcome: 'welcome' });
    }
    updateHud();
    beginPlaying();
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

// ---- The character card (M4) ------------------------------------------------

function castShown() {
    return Boolean(castModal) && !castModal.classList.contains('hidden');
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

/** The card's radio buttons, one group per part of the choice, built once.
 *  Swatches are colored through the CSSOM, which the page's CSP allows
 *  where a style attribute it would not. */
function buildCast() {
    if (castInputs.length) return;
    const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
    [
        { host: 'cast-presets', key: 'preset', list: PRESETS },
        { host: 'cast-skins', key: 'skin', list: SKINS, swatch: true },
        { host: 'cast-hair', key: 'hair', list: HAIR_COLORS, swatch: true },
        { host: 'cast-length', key: 'length', list: HAIR_LENGTHS }
    ].forEach((group) => {
        const host = document.getElementById(group.host);
        if (!host) return;
        group.list.forEach((option) => {
            const label = document.createElement('label');
            label.className = 'cast-option';
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = `cast-${group.key}`;
            input.value = option.id;
            label.appendChild(input);
            const text = document.createElement('span');
            text.textContent = option.label;
            if (group.swatch) {
                const dot = document.createElement('span');
                dot.className = 'cast-swatch';
                dot.style.backgroundColor = hex(option.color);
                label.appendChild(dot);
                text.className = 'sr-only';
                label.title = option.label;
            }
            label.appendChild(text);
            input.addEventListener('change', () => chooseCast(group.key, option.id, option.label));
            host.appendChild(label);
            castInputs.push({ key: group.key, id: option.id, input, label });
        });
    });
}

/** Tick the chosen option in each group. */
function markCast() {
    castInputs.forEach(({ key, id, input, label }) => {
        const on = castChoice[key] === id;
        input.checked = on;
        label.classList.toggle('chosen', on);
    });
}

/** The person, dressed as the choice says: a new figure in place of the old,
 *  in whatever pose the old one held. */
function dressFigure() {
    if (figure) {
        scene.remove(figure.group);
        figure.group.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        });
    }
    figure = createOperatorFigure(B, CONFIG.look, { person: personConfig(castChoice) });
    figure.update(operator, false, state.time, finale.plan ? finale.arms : 'carry');
    scene.add(figure.group);
    shade.owed = true;
}

function chooseCast(key, id, label) {
    if (castChoice[key] === id) return;
    castChoice = { ...castChoice, [key]: id };
    markCast();
    dressFigure();
    setText('cast-status', label);
}

/** Shift the view so the person sits in the middle of what the card leaves
 *  visible. */
function frameCast() {
    if (!camera || !camera.setViewOffset) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const f = castFrame(W, H);
    camera.setViewOffset(W, H, f.shiftX, f.shiftY, W, H);
}

/** "Change your character": the welcome card steps aside for the character
 *  card, and the person turns to face the camera as it comes in close. */
function openCast() {
    if (!state.isLoaded || castShown()) return;
    buildCast();
    markCast();
    castBefore = { ...castChoice };
    if (blocker) blocker.classList.add('hidden');
    castModal.classList.remove('hidden');
    setChromeVisible(false);
    operator.heading = 0;
    operator.speed = 0;
    frameCast();
    const chosen = castInputs.find((c) => c.input.checked) || castInputs[0];
    if (chosen) {
        try { chosen.input.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    }
}

/** Done (or Escape): keep the choice, and back to the welcome card. */
function closeCast() {
    if (!castShown()) return;
    castModal.classList.add('hidden');
    if (camera && camera.clearViewOffset) camera.clearViewOffset();
    saveChoice(castChoice);
    setText('cast-name', castLine(castChoice));
    if (castBefore && castBefore.preset !== castChoice.preset) track('character', { outcome: castChoice.preset });
    if (blocker) blocker.classList.remove('hidden');
    const btn = document.getElementById('cast-btn');
    if (btn) {
        try { btn.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    }
}

/** "Forget my choice": nothing kept, and back to the default person. */
function forgetCast() {
    forgetChoice();
    castChoice = { ...DEFAULT_CHOICE };
    markCast();
    dressFigure();
    setText('cast-status', 'Your choice is forgotten.');
}

// ---- The round ------------------------------------------------------------

function endShown() {
    return Boolean(endModal) && !endModal.classList.contains('hidden');
}

/** The end card's buttons, the HUD's New round, and the share. */
function installRoundControls() {
    const signal = cleanupController ? cleanupController.signal : undefined;
    const on = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn, { signal });
    };
    on('end-again', () => playAgain('end-card'));
    on('cast-done', closeCast);
    on('cast-forget', forgetCast);
    on('end-free', keepBlowing);
    on('hud-new', () => playAgain('hud'));
    installShare(
        document.getElementById('end-share'),
        () => ({
            title: 'Leaves',
            text: shareText(result ? result.tally : counted, CONFIG.round.seconds, result ? result.landed : null, result ? result.found : found)
        }),
        {
            status: document.getElementById('end-status'),
            onShare: (how) => track('share', { method: how }),
            signal
        });
}

/** Count where the leaves are now. */
function recount() {
    counted = tally(sim, CONFIG.yard, sent);
    countedAgo = 0;
    return counted;
}

/** Say a beat of the round to a screen reader. */
function announce(text) {
    const el = document.getElementById('round-status');
    if (el) el.textContent = text;
}

function onRoundEvent(event) {
    if (event === 'start') {
        announce('The clock is running. You have one minute.');
        track('round-start');
    } else if (event === 'finale') {
        // The clock has run out: the blower stops, whatever is still held,
        // the result is counted, and the dive begins.
        releaseInput();
        announce('Time is up.');
        startFinale();
    } else if (event === 'done') {
        showEnd();
    }
    updateHud();
}

// ---- The finale -----------------------------------------------------------

/** The leaves are down and the result is counted: plan the dive at the
 *  peak of the tarp's pile. */
function startFinale() {
    finale.tally = { ...recount() };
    const peak = pilePeak(sim, CONFIG.yard.tarp);
    finale.plan = planFinale(operator, peak, CONFIG.finale, walkArea(), { reduced: state.reducedMotion });
    finale.t = 0;
    finale.burst = false;
    operator.hideBlower = true;
    announce('You set the blower down and take a running dive at the pile.');
    track('dive', { outcome: finale.plan.success ? 'landed' : 'flop' });
}

/** Where they land, the leaves go up: the whole pile for a good dive, a
 *  puff for a flop, less of either under reduced motion. */
function fireBurst() {
    if (finale.burst || !finale.plan) return;
    finale.burst = true;
    const F = CONFIG.finale;
    const plan = finale.plan;
    const size = (plan.success ? 1 : F.flopBurst) * (state.reducedMotion ? F.reducedBurst : 1);
    burst(sim, plan.land.x, plan.land.z, F.burstRadius * (plan.success ? 1 : 0.6), F.burstSpeed * size);
    announce(plan.success ? 'You land in the pile, and the leaves go everywhere.' : 'You land on the lawn. Ouch.');
}

/** One frame of the finale: the person where the plan says, the burst on
 *  landing. Returns whether it is over. */
function stepFinale(dt) {
    const plan = finale.plan;
    if (!plan) return true;
    finale.t += dt;
    const pose = finaleAt(plan, finale.t);
    operator.x = pose.x;
    operator.z = pose.z;
    operator.heading = pose.heading;
    operator.speed = pose.speed;
    operator.stride = pose.stride;
    operator.pitch = pose.pitch;
    operator.roll = pose.roll;
    operator.lift = pose.lift;
    finale.arms = pose.arms;
    if (finale.t >= plan.t.air) fireBurst();
    return finale.t >= plan.total;
}

/** Back on their feet with the blower, wherever the finale left them (Keep
 *  blowing): the dive is over and the yard is theirs again. */
function standUp() {
    const area = walkArea();
    operator.x = Math.min(area.maxX, Math.max(area.minX, operator.x));
    operator.z = Math.min(area.maxZ, Math.max(area.minZ, operator.z));
    operator.pitch = 0;
    operator.roll = 0;
    operator.lift = 0;
    operator.speed = 0;
    operator.hideBlower = false;
    finale.plan = null;
    finale.arms = 'carry';
    finale.tally = null;
}

/** A tap or a key during the finale: straight to the end of it, burst and
 *  all. */
function skipFinale() {
    if (!finale.plan || round.phase !== 'finale') return false;
    finale.t = Math.max(finale.t, finale.plan.total);
    fireBurst();
    stepFinale(0);
    track('dive-skip');
    return true;
}

/** Count the result, fill the end card and open it, with Play again
 *  focused. */
function showEnd() {
    const t = finale.tally || recount();
    const v = verdict(t);
    const landed = finale.plan ? finale.plan.success : null;
    result = { tally: t, verdict: v, landed, found: [...found] };
    const set = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    set('end-title', v.title);
    set('end-line', v.line);
    set('end-dive', diveLine(landed));
    set('end-finds', findsLine(result.found));
    set('end-percent', `${percent(clearedShare(t))}%`);
    resultRows(t).forEach((row) => set(`end-${row.key}`, row.value));
    fillEndPromo();
    releaseInput();
    if (endModal) endModal.classList.remove('hidden');
    setChromeVisible(false);
    announce(resultSentence(t, landed, result.found));
    const again = document.getElementById('end-again');
    if (again) {
        try { again.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    }
    track('round-end', { outcome: v.key });
}

/** The next experience to try and the directory, under the end card. Built
 *  once: the recommendation does not depend on how the round went. Until
 *  this scene is in the promo catalog, only the directory link appears. */
function fillEndPromo() {
    const host = document.getElementById('end-promo');
    if (!host || (host.children && host.children.length)) return false;
    const card = createPromoCard('leaves');
    if (card) host.appendChild(card);
    const link = createDirectoryLink();
    if (link) host.appendChild(link);
    return true;
}

function hideEnd() {
    if (endModal) endModal.classList.add('hidden');
    if (castModal) castModal.classList.add('hidden');
    castChoice = loadChoice();
    setText('cast-name', castLine(castChoice));
    const el = document.activeElement;
    if (el && el !== document.body && typeof el.blur === 'function') el.blur();
    setChromeVisible(true);
}

/** A fresh yard and a fresh round, waiting for the first blow. */
function playAgain(from) {
    hideEnd();
    resetYard();
    resetRound(round);
    announce('A fresh yard. The clock starts with your first blow.');
    track('play-again', { outcome: from });
    updateHud();
}

/** The end card's Keep blowing (or Escape): the same yard, no clock. */
function keepBlowing() {
    hideEnd();
    standUp();
    freePlay(round);
    track('free-blow', { outcome: 'end-card' });
    updateHud();
}

/** Lay every leaf back down where it started, and the person back where
 *  they started. */
function resetYard() {
    resetSim(sim);
    scatterLeaves(sim, CONFIG);
    crowns = createCrowns(sim, CONFIG);
    leaves.update();
    Object.assign(operator, createOperator(B));
    resetNeighbor(neighbor, N);
    layFinds();
    hideToast();
    if (sent) sent.fill(0);
    finale.plan = null;
    finale.t = 0;
    finale.burst = false;
    finale.arms = 'carry';
    finale.tally = null;
    shade.owed = true;
    recount();
}

/** The HUD: the clock (or, in free play, a way back to a round) and the
 *  share cleared. Each part is written only when it changes. */
function updateHud() {
    const R = CONFIG.round;
    const phase = round.phase;
    let clock;
    if (phase === 'ready') clock = clockText(round.seconds);
    else if (phase === 'playing') clock = clockText(timeLeft(round));
    else clock = clockText(0);
    const cleared = `${percent(clearedShare(counted))}% cleared`;
    const el = (id) => document.getElementById(id);
    if (clock !== hudShown.clock) {
        hudShown.clock = clock;
        if (el('hud-clock')) el('hud-clock').textContent = clock;
    }
    if (cleared !== hudShown.cleared) {
        hudShown.cleared = cleared;
        if (el('hud-cleared')) el('hud-cleared').textContent = cleared;
    }
    const hurry = phase === 'playing' && timeLeft(round) <= R.hurry;
    const key = `${phase}:${hurry}`;
    if (key === hudShown.phase) return;
    hudShown.phase = key;
    const clockEl = el('hud-clock');
    if (clockEl) {
        clockEl.hidden = phase === 'free';
        clockEl.classList.toggle('hurry', hurry);
    }
    const hint = el('hud-hint');
    if (hint) {
        const text = {
            ready: 'Blow to start the clock',
            finale: 'Here goes nothing',
            done: 'Time is up',
            free: 'No clock, just leaves'
        }[phase];
        hint.hidden = !text;
        if (text) hint.textContent = text;
    }
    if (el('hud-new')) el('hud-new').hidden = phase !== 'free';
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
    // M6: Halloween week whatever the date, and every find out on the lawn.
    const labButton = (text, label, fn) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lab-btn';
        btn.textContent = text;
        btn.setAttribute('aria-label', label);
        btn.addEventListener('click', fn);
        row.appendChild(btn);
        return btn;
    };
    labButton(state.halloween ? 'Halloween week on' : 'Halloween week off',
        state.halloween ? 'Reload with no Halloween, decorations and all' : 'Reload in Halloween week',
        go({ halloween: state.halloween ? 0 : 1 }));
    labButton(state.showFinds ? 'Finds shown' : 'Finds hidden',
        state.showFinds ? 'Reload with the finds hidden' : 'Reload with every find showing',
        go({ finds: state.showFinds ? null : 1 }));
    panel.appendChild(row);
    document.body.appendChild(panel);
    lab.el = readout;
    lab.start = performance.now();
}

/** Twice a second, what the last frames cost, and the round's own count of
 *  where the leaves are. */
function updateLab(delta) {
    lab.frames += 1;
    lab.seconds += Math.max(0, delta);
    if (lab.seconds < 0.5) return;
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
        cleared: clearedShare(counted),
        tarp: counted.tarp
    }).join('\n');
    lab.frames = 0;
    lab.seconds = 0;
    lab.simMs = 0;
    lab.uploaded = 0;
}

// ---- The neighbor -----------------------------------------------------------

/** One frame of the neighbor, from the latest count of our leaves on his
 *  lawn. He comes out in a round or in free play, and waves once it is
 *  over. */
function stepTheNeighbor(dt) {
    const event = stepNeighbor(neighbor, dt, {
        leaves: counted.neighbor,
        minZ: counted.nearZ,
        maxZ: counted.farZ,
        maxX: counted.deepX,
        active: round.phase === 'playing' || round.phase === 'free',
        over: round.phase === 'finale' || round.phase === 'done'
    }, N);
    if (event === 'out') {
        announce(neighbor.visits === 0
            ? 'Your neighbor has noticed the leaves on his lawn.'
            : 'Your neighbor is back, and he has noticed more leaves.');
        track('neighbor', { outcome: `visit-${neighbor.visits + 1}` });
    }
    return event;
}

// ---- The finds (M6) ---------------------------------------------------------

/** Hide this round's finds: each at a fresh spot under the leaves, its
 *  model waiting under the lawn. The lab's ?finds=1 shows them all. */
function layFinds() {
    findRounds += 1;
    finds = placeFinds(sim, CONFIG, findList, CONFIG.leaves.seed + 101 * findRounds);
    found = [];
    Object.values(findModels).forEach((m) => { m.group.visible = false; });
    for (const f of finds) {
        const model = findModels[f.id];
        if (!model) continue;
        model.group.position.set(f.x, -model.depth, f.z);
        model.group.rotation.y = f.yaw;
        f.rise = 0;
        if (state.showFinds) {
            f.found = true;
            f.rise = 1;
            model.group.visible = true;
            model.group.position.y = 0;
        }
    }
}

/** A few times a second: any find the leaves no longer hide is found. It
 *  rises out of the lawn, its name shows under the HUD, and a screen reader
 *  hears it. */
function lookForFinds() {
    for (const f of stepFinds(finds, sim, CONFIG.finds)) {
        const model = findModels[f.id];
        if (model) model.group.visible = true;
        f.rise = state.reducedMotion ? 1 : 0;
        found.push(f.def.name);
        showToast(f.def.toast);
        announce(f.def.toast);
        track('find', { outcome: f.id });
    }
}

/** Each found find rising out of the lawn. Returns whether any moved. */
function riseFinds(dt) {
    let moved = false;
    for (const f of finds) {
        const model = findModels[f.id];
        if (!f.found || !model) continue;
        if (f.rise < 1) {
            f.rise = Math.min(1, f.rise + dt / CONFIG.finds.rise);
            moved = true;
        }
        const e = 1 - (1 - f.rise) * (1 - f.rise);
        model.group.position.y = -model.depth * (1 - e);
    }
    return moved;
}

/** The find's line under the HUD, for `toastSeconds`. */
function showToast(text) {
    if (!toast.el) return;
    toast.el.textContent = text;
    toast.el.classList.add('visible');
    toast.until = state.time + CONFIG.finds.toastSeconds;
}

function hideToast() {
    if (toast.el) toast.el.classList.remove('visible');
    toast.until = 0;
}

/** Say something to a screen reader once a visit. */
function announceOnce(key, text) {
    if (told.has(key)) return;
    told.add(key);
    announce(text);
}

// ---- Halloween (M6) -----------------------------------------------------------

function stepTheTreaters(dt) {
    if (!treaters) return null;
    const event = stepTreaters(treaters, dt, {
        active: true, person: operator, walkX: CONFIG.yard.house.door, random: treatRandom
    }, CONFIG.halloween);
    if (event === 'start') announceOnce('treaters', 'Trick-or-treaters are coming along the sidewalk.');
    return event;
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

    // In the yard (no card up), and free to move and blow (the round is not
    // over). Behind a card the round holds still: the clock pauses for the
    // welcome card, and nothing moves under the end card.
    const inYard = !welcomeShown() && !endShown() && !castShown();
    const free = inYard && canBlow(round);
    // A mouse held still still steers by what is under it, as the view
    // slides: at the screen's edge the person keeps going to the hedge (M6
    // QA). A finger only re-aims when it moves.
    if (free && steer === 'point' && pointer.mouse && pointer.client) aimAt(pointer.client.x, pointer.client.y);
    const aim = free ? aimFor(steer, pointer, keys) : null;
    const diving = round.phase === 'finale';
    if (!diving && !finale.plan) stepOperator(operator, aim, dt, B, walkArea(), solids);
    // The crowns let their leaves go whenever the yard is in view.
    if (!welcomeShown() && !castShown()) stepCrowns(crowns, sim, dt, CONFIG);
    updateTrees(trees, state.time, state.reducedMotion ? 0.3 : 1);
    const blowing = isBlowing(free, pointer, keys, blowHold);
    const f = facing(operator.heading);
    const jet = makeJet(B, operator.x, operator.z, f.x, f.z, blowing);
    if (inYard) {
        const finaleDone = diving ? stepFinale(dt) : false;
        const event = stepRound(round, dt, { blowing, finaleDone }, CONFIG.round);
        if (event) onRoundEvent(event);
    }
    // The neighbor carries on behind the end card (he waves), and holds
    // still behind the welcome card with everything else.
    if (!welcomeShown() && !castShown()) stepTheNeighbor(dt);
    const his = makeJet(neighborBlower(B, N, neighbor.big), neighbor.x, neighbor.z,
        Math.sin(neighbor.heading), Math.cos(neighbor.heading), neighbor.blowing && !welcomeShown() && !castShown());
    countedAgo += delta;
    if (inYard && countedAgo >= 1 / CONFIG.round.tallyHz) {
        recount();
        lookForFinds();
    }
    if (inYard) updateHud();

    // The trick-or-treaters (M6) hold still behind the welcome card with
    // everything else.
    const yardInView = !welcomeShown() && !castShown();
    if (yardInView) stepTheTreaters(dt);
    const rising = riseFinds(delta);
    if (toast.until && state.time >= toast.until) hideToast();
    sound.update(delta, { blowing }, {
        blowing: neighbor.blowing && yardInView, big: neighbor.big, pan: panOf(neighbor.x)
    });

    const t0 = performance.now();
    stepSim(sim, dt, [jet, his]);
    const uploaded = leaves.update();
    lab.simMs += performance.now() - t0;
    lab.uploaded += uploaded;

    figure.update(operator, blowing, state.time, finale.plan ? finale.arms : 'carry');
    neighborFigure.group.visible = isOut(neighbor);
    neighborFigure.update(neighbor, neighbor.blowing, state.time, neighbor.arms, neighbor.big);
    if (neighborDoor) neighborDoor.rotation.y = -1.7 * neighbor.door;
    if (decorations) decorations.update(state.time, state.reducedMotion ? 0.3 : 1);
    if (treaterFigures) treaterFigures.update(treaters, state.time);
    const marked = free && steer === 'point' && Boolean(pointer.aim);
    marker.visible = marked;
    if (marked) marker.position.set(pointer.aim.x, 0.05, pointer.aim.z);
    followCamera(dt);

    // Shadows: owed by any frame that moved a leaf or the person, paid at
    // most `hz` times a second.
    if (state.shadows) {
        if (uploaded > 0 || operator.speed > 0 || neighbor.speed > 0 || (neighbor.door > 0 && neighbor.door < 1)) shade.owed = true;
        if (rising || (treaters && treaters.speed > 0)) shade.owed = true;
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
    sound.dispose();
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
        blowing: isBlowing(!welcomeShown() && !endShown() && canBlow(round), pointer, keys, blowHold),
        round: { ...round },
        counted: { ...counted },
        result: result ? { tally: { ...result.tally }, verdict: { ...result.verdict }, landed: result.landed, found: [...result.found] } : null,
        neighbor: { ...neighbor },
        endShown: endShown(),
        castShown: castShown(),
        cast: { ...castChoice },
        finale: finale.plan ? { t: finale.t, total: finale.plan.total, success: finale.plan.success, burst: finale.burst, arms: finale.arms } : null,
        finds: finds.map((f) => ({ id: f.id, x: f.x, z: f.z, found: f.found, shown: f.shown })),
        found: [...found],
        treaters: treaters ? { state: treaters.state, x: treaters.x, walks: treaters.walks } : null,
        sound: sound.isOn(),
        toast: toast.until > 0
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
export const __test__ = {
    bufToHex, keys, pointer, blowHold, aimAt, walkArea, sim: () => sim
};
