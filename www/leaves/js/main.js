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
 * and his last word when too much of the yard is left on his lawn as the
 * clock runs out.
 *
 * UNLISTED. The page carries noindex and is in no directory, sitemap or
 * llms.txt until the scene it grows into is released.
 */

import { LEAVES_CONFIG } from './config.min.js';
import { createSim, resetSim, scatterLeaves, stepSim, makeJet } from './sim.min.js';
import { createRound, resetRound, freePlay, canBlow, timeLeft, stepRound } from './round.min.js';
import { createNeighbor, resetNeighbor, stepNeighbor, isOut, neighborBlower } from './neighbor.min.js';
import {
    tally, clearedShare, percent, clockText, verdict, resultRows, shareText, resultSentence
} from './score.min.js';
import { createLeafMesh } from './leafmesh.min.js';
import { buildYard } from './yard.min.js';
import { createOperator, stepOperator, facing, createOperatorFigure } from './blower.min.js';
import { cameraFor, rayToGround, ease } from './view.min.js';
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
let cleanupController = null;

// The round, and the count of where the leaves are, refreshed a few times a
// second (counting walks every leaf).
const round = createRound(CONFIG.round);
let counted = { lawn: 0, tarp: 0, street: 0, neighbor: 0, total: 0 };
let countedAgo = Infinity;
// The last result, for the share button.
let result = null;
// The neighbor, his figure and his door; which leaves have been over the
// fence this round; and whether he had the last word this round.
const neighbor = createNeighbor(N);
let neighborFigure = null;
let neighborDoor = null;
let sent = null;
const lastWord = { had: false };
// What the HUD last showed, so it is only written when it changes.
const hudShown = { clock: '', cleared: '', phase: '' };

let welcomed = false;
let welcomeReturn = null;

// The pointer that is steering, if any. A mouse steers by hovering and blows
// while a button is held. A finger on the lawn only steers (it walks the
// person over and aims), and the blow button runs the blower, since one
// finger doing both made the leaves impossible to place (Steve's phone QA,
// 2026-10-06).
const pointer = { id: null, down: false, mouse: false, blows: false, aim: null, seen: false };
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
    if (!canvas || typeof THREE === 'undefined') return;
    // The markup starts it hidden. Said again here so the round never begins
    // believing a card is up.
    if (endModal) endModal.classList.add('hidden');

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

    const yard = buildYard(scene, CONFIG, { shadows: state.shadows, mobile: state.isMobile });
    neighborDoor = yard.neighborDoor;

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
    sent = new Uint8Array(state.count);

    operator = createOperator(B);
    figure = createOperatorFigure(B, CONFIG.look);
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

    placeCamera(true);
    setupEventListeners();
    installRoundControls();
    if (state.qa) installLab();
    recount();
    updateHud();

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
    const want = cameraFor(window.innerWidth / window.innerHeight, CONFIG.camera, CONFIG.yard.lawn, operator,
        isOut(neighbor) ? neighbor : null);
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
        const freeBtn = document.getElementById('free-btn');
        if (shieldOverlayControl(freeBtn, { signal })) {
            freeBtn.addEventListener('click', startFreePlay, { signal });
        }
    }
    if (helpBtn) helpBtn.addEventListener('click', () => returnToWelcome('help'), { signal });
    installCardFocusTrap({ signal });
    installCardScrollReset({ signal });

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
        if (!pointer.mouse) pointer.aim = null;
    };
    canvas.addEventListener('pointerup', release, { signal });
    canvas.addEventListener('pointercancel', release, { signal });
    canvas.addEventListener('pointerleave', (event) => {
        if (event.pointerType === 'mouse' && pointer.id === null) pointer.aim = null;
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
}

const WALK_KEYS = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right'
};

function onKeyDown(event) {
    // The end card keeps its keys: its buttons take Enter and Space, Tab is
    // the focus trap's, and Escape keeps blowing.
    if (endShown()) {
        if (event.code === 'Escape') keepBlowing();
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

// ---- The welcome screen ---------------------------------------------------

function welcomeShown() {
    return Boolean(blocker) && !blocker.classList.contains('hidden');
}

/** The help button, the blow button and the HUD follow the welcome screen
 *  and the end card: nothing to press until the visitor is in, and nothing
 *  over a card. */
function setChromeVisible(on) {
    const shown = on && !welcomeShown() && !endShown();
    if (helpBtn) helpBtn.classList.toggle('visible', shown);
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
    on('end-free', keepBlowing);
    on('hud-new', () => playAgain('hud'));
    installShare(
        document.getElementById('end-share'),
        () => ({
            title: 'Leaves',
            text: shareText(result ? result.tally : counted, CONFIG.round.seconds, Boolean(result && result.revenge))
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
    } else if (event === 'revenge') {
        // The blower stops with the clock, and the neighbor has his say.
        releaseInput();
        lastWord.had = true;
        announce('Time is up, and your neighbor is not having it.');
        track('neighbor', { outcome: 'revenge' });
    } else if (event === 'time-up') {
        // The blower stops with the clock, whatever is still held.
        releaseInput();
        if (!lastWord.had) announce('Time is up.');
    } else if (event === 'done') {
        showEnd();
    }
    updateHud();
}

/** Count the result, fill the end card and open it, with Play again
 *  focused. */
function showEnd() {
    const t = recount();
    const v = verdict(t, lastWord.had);
    result = { tally: t, verdict: v, revenge: lastWord.had };
    const set = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    set('end-title', v.title);
    set('end-line', v.line);
    set('end-percent', `${percent(clearedShare(t))}%`);
    resultRows(t).forEach((row) => set(`end-${row.key}`, row.value));
    fillEndPromo();
    releaseInput();
    if (endModal) endModal.classList.remove('hidden');
    setChromeVisible(false);
    announce(resultSentence(t, lastWord.had));
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
    freePlay(round);
    track('free-blow', { outcome: 'end-card' });
    updateHud();
}

/** Lay every leaf back down where it started, and the person back where
 *  they started. */
function resetYard() {
    resetSim(sim);
    scatterLeaves(sim, CONFIG);
    leaves.update();
    Object.assign(operator, createOperator(B));
    resetNeighbor(neighbor, N);
    if (sent) sent.fill(0);
    lastWord.had = false;
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
        const text = { ready: 'Blow to start the clock', settling: 'Time is up', done: 'Time is up', free: 'No clock, just leaves' }[phase];
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
 *  lawn. He comes out in a round or in free play, has his last word when
 *  the round says so, and waves once it is over. */
function stepTheNeighbor(dt) {
    const event = stepNeighbor(neighbor, dt, {
        leaves: counted.neighbor,
        minZ: counted.nearZ,
        maxZ: counted.farZ,
        maxX: counted.deepX,
        active: round.phase === 'playing' || round.phase === 'free',
        revenge: round.phase === 'revenge',
        over: round.phase === 'settling' || round.phase === 'done'
    }, N);
    if (event === 'out' && !neighbor.revenge) {
        announce(neighbor.visits === 0
            ? 'Your neighbor has noticed the leaves on his lawn.'
            : 'Your neighbor is back, and he has noticed more leaves.');
        track('neighbor', { outcome: `visit-${neighbor.visits + 1}` });
    }
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
    const inYard = !welcomeShown() && !endShown();
    const free = inYard && canBlow(round);
    const aim = free ? aimFor(steer, pointer, keys) : null;
    stepOperator(operator, aim, dt, B, walkArea());
    const blowing = isBlowing(free, pointer, keys, blowHold);
    const f = facing(operator.heading);
    const jet = makeJet(B, operator.x, operator.z, f.x, f.z, blowing);
    if (inYard) {
        // His last word is owed if too much of the yard is on his lawn as
        // the clock runs out.
        const owed = counted.neighbor >= N.winShare * counted.total;
        const event = stepRound(round, dt, {
            blowing, moving: sim.activeCount, revenge: owed, revengeDone: neighbor.revengeDone
        }, CONFIG.round);
        if (event) onRoundEvent(event);
    }
    // The neighbor carries on behind the end card (he waves), and holds
    // still behind the welcome card with everything else.
    if (!welcomeShown()) stepTheNeighbor(dt);
    const his = makeJet(neighborBlower(B, N, neighbor.big), neighbor.x, neighbor.z,
        Math.sin(neighbor.heading), Math.cos(neighbor.heading), neighbor.blowing && !welcomeShown());
    countedAgo += delta;
    if (inYard && countedAgo >= 1 / CONFIG.round.tallyHz) recount();
    if (inYard) updateHud();

    const t0 = performance.now();
    stepSim(sim, dt, [jet, his]);
    const uploaded = leaves.update();
    lab.simMs += performance.now() - t0;
    lab.uploaded += uploaded;

    figure.update(operator, blowing, state.time);
    neighborFigure.group.visible = isOut(neighbor);
    neighborFigure.update(neighbor, neighbor.blowing, state.time, neighbor.arms, neighbor.big);
    if (neighborDoor) neighborDoor.rotation.y = -1.7 * neighbor.door;
    const marked = free && steer === 'point' && Boolean(pointer.aim);
    marker.visible = marked;
    if (marked) marker.position.set(pointer.aim.x, 0.05, pointer.aim.z);
    followCamera(dt);

    // Shadows: owed by any frame that moved a leaf or the person, paid at
    // most `hz` times a second.
    if (state.shadows) {
        if (uploaded > 0 || operator.speed > 0 || neighbor.speed > 0 || (neighbor.door > 0 && neighbor.door < 1)) shade.owed = true;
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
        blowing: isBlowing(!welcomeShown() && !endShown() && canBlow(round), pointer, keys, blowHold),
        round: { ...round },
        counted: { ...counted },
        result: result ? { tally: { ...result.tally }, verdict: { ...result.verdict }, revenge: result.revenge } : null,
        neighbor: { ...neighbor },
        endShown: endShown()
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
export const __test__ = { bufToHex, keys, pointer, blowHold, aimAt, walkArea, sim: () => sim };
