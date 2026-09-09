// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Orchestrator and boot for X's and O's.
 *
 * M0 THROUGH M3. Renderer, floodlit night, the standing scene from field.js,
 * the ported simulation, the roster, and the play cycle: choose from the
 * playbook, line up, snap, run, choose again. The HUD, the scoring and the
 * replay arrive at M4 and M5, each as its own module (PLANNING section 2).
 * This file stays an orchestrator: it wires parts together and owns the frame
 * loop, and it is the one place allowed to know about all of them.
 *
 * THE SIMULATION IS NEVER IMPORTED INTO A THREE OBJECT (PLANNING D1). play.js
 * hands this file numbers and view.js moves meshes to match. That separation
 * is what makes the game testable, because the Three stub in tests/helpers
 * absorbs every assignment written onto a mesh, so anything drawn is invisible
 * to a suite.
 */
import { EXESNOHS_CONFIG as CFG, FIELD, simToWorld } from './config.min.js';
import { initField, setBandAt, fadeBand, updateScoreboard } from './field.min.js';
import { initRoster, figureFor } from './roster.min.js';
import { initBall } from './ball.min.js';
import { initMarkers, setPulse, initSpot, showSpot, hideSpot } from './markers.min.js';
import { syncFigures, syncBall, setViewCamera, resetBallFlight } from './view.min.js';
import {
    createPlay, lineUp, snap, tick, ballCarrier,
    isDone, throwTo, keepAndRun, eligibleReceivers, outcome,
} from './play.min.js';
import {
    initHud, setPlayNumber, setScore, showHud, showSnap, showInPlay,
    clearActions, showResult, hideResult, announce, showWelcome,
} from './hud.min.js';
import { showSummary, hideSummary } from './summary.min.js';
import {
    startRecording, record, frameCount, frameAt, focusAt,
    rewind, advance, playheadFrame, isEmpty, discard,
} from './replay.min.js';
import { setDriver, setAspect, update as updateCamera } from './camera.min.js';
import {
    initAudio, unlock as unlockAudio, play as playSound, simAudio,
    isMuted, toggleMuted,
} from './audio.min.js';
import { initPlaybook, show as showPlaybook, getSettings } from './playbook-ui.min.js';
import { installCardFocusTrap, installCardScrollReset } from '../../shared/js/boot-1.0.0.min.js';

const state = {
    isRunning: false,
    isLoaded: false,
    lastFrame: 0,
    elapsed: 0,
};

/**
 * THE PLAY CYCLE (M3).
 *
 * The visitor picks from the playbook, both teams line up long enough to read,
 * the ball is snapped, the play runs, and the playbook comes back. The random
 * demo loop this replaces was M2 scaffolding.
 *
 * IT IS STILL NOT THE REAL STATE MACHINE. There is no snap button, no in-play
 * throw, no score and no whistle: those are M4, and the phases below grow into
 * PLANNING section 8's `welcome -> playbook -> presnap -> live -> result ->
 * [replay] -> playbook` rather than being replaced by it.
 */
const cycle = {
    play: null,
    phase: 'playbook',    // playbook -> presnap -> live -> settle -> result
    held: 0,
    accumulator: 0,
    playNumber: 0,        // 1 to CFG.rules.playsPerGame
    total: 0,
    results: [],
    lastOutcome: null,
    replayHold: 0,
    spotAt: null,         // world metres, where the last play finished
};

/** Whoever asked not to be moved about. Checked once: a visitor who changes it
 *  mid-game can reload, and re-querying every frame is a needless cost. */
const reducedMotion = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

/** Worth showing unasked: a big gain, or a turnover. Everything else is
 *  available from the result card but does not interrupt. */
function worthWatching(result) {
    return result.points >= 30 || result.points < 0;
}

/** The simulation's speeds are PER FRAME, not per second, because that is how
 *  the 2D game was written. So it is stepped on a fixed clock rather than once
 *  per rendered frame, or the game would run at double speed on a 120Hz
 *  display and in slow motion on a struggling phone. The rate itself is the
 *  game's pace and lives in config (see `simHz`). */
const SIM_STEP = 1 / CFG.simHz;
/** A play cannot run forever. The simulation raises its own whistle on a
 *  catch, a drop, a tackle or a crossing, and in practice does so between two
 *  and six seconds. This is the backstop for a play that somehow does not
 *  finish, not the normal way one ends. */
const PLAY_TIMEOUT = 12.0;
const HOLD_SETTLE = 1.1;      // seconds to watch where it ended up

let renderer = null;
let scene = null;
let camera = null;
/** Owns every document-level listener this scene installs, so they can all be
 *  removed together rather than one at a time or not at all. */
let cleanup = null;

// ---- Loading screen --------------------------------------------------------

function setProgress(fraction, message) {
    const bar = document.getElementById('load-progress');
    const status = document.getElementById('load-status');
    if (bar) bar.style.width = `${Math.round(fraction * 100)}%`;
    if (status && message) status.textContent = message;
}

function retireLoadingScreen() {
    const screen = document.getElementById('loading-screen');
    if (screen) screen.classList.add('hidden');
}

// ---- Scene -----------------------------------------------------------------

function initRenderer(canvas) {
    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !isTouch(),
        powerPreference: 'high-performance',
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // The site-wide pixel-ratio cap. On a Retina phone this roughly halves the
    // fragment count for a loss of sharpness nobody has ever reported.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CFG.scene.maxPixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = !isTouch();
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    return renderer;
}

function isTouch() {
    return typeof window !== 'undefined'
        && ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0));
}

function initSceneGraph() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CFG.scene.background);
    // Fog pre-tone-mapped would be the trap on a bright scene. This one is a
    // night sky and the fog colour sits close to the background, so the
    // distance simply falls away into the dark it is already sitting in.
    scene.fog = new THREE.Fog(CFG.scene.fogColor, CFG.scene.fogNear, CFG.scene.fogFar);

    camera = new THREE.PerspectiveCamera(
        CFG.camera.fov,
        window.innerWidth / window.innerHeight,
        CFG.camera.near,
        CFG.camera.far
    );
    setAspect(camera.aspect);
    aimPlayCamera();
    return scene;
}

/**
 * Put the camera where the director says.
 *
 * camera.js owns every decision and returns plain numbers; this applies them.
 * That split is why the interesting question (where should the camera be at
 * t = 1.4s of this replay) is answerable without a scene graph.
 */
function applyCamera(shot) {
    if (!camera || !shot) return;
    camera.position.set(shot.position.x, shot.position.y, shot.position.z);
    camera.lookAt(shot.target.x, shot.target.y, shot.target.z);
    if (typeof shot.fov === 'number' && Math.abs(camera.fov - shot.fov) > 0.01) {
        camera.fov = shot.fov;
        camera.updateProjectionMatrix();
    }
}

/**
 * WHICH CAMERA BELONGS TO THIS PHASE, derived rather than set.
 *
 * This used to be four scattered `setDriver` calls, and the bug that produced
 * was exactly the kind that arrangement invites: `openPlaybook` set the idle
 * driver and NOTHING set it back, so the slow idle orbit kept running through
 * the pre-snap and the whole live play. The camera slid fourteen metres
 * sideways while its aim point moved three and a half, which is an orbit, and
 * an orbit reads as the field spinning.
 *
 * Deriving it from the phase means the camera cannot disagree with the game.
 * A new phase without a camera gets the play camera, which is the safe default
 * because it is the one that never moves.
 */
function driverForPhase(phase) {
    if (phase === 'playbook') return 'idle';
    if (phase === 'replay') return 'replay';
    return 'play';
}

/** What the active driver needs to know. Only the replay driver needs
 *  anything, and what it needs is where the ball was on this frame. */
function cameraState() {
    if (cycle.phase !== 'replay') return {};
    const total = Math.max(1, frameCount());
    const f = replayFocus();
    const focus = simToWorld(f.x, f.y, f.z || 0);
    return { progress: playheadFrame() / total, focus };
}

/** The opening shot, before the first frame is drawn. */
function aimPlayCamera() {
    applyCamera(updateCamera(0));
}

function initLighting() {
    const L = CFG.lighting;
    scene.add(new THREE.AmbientLight(L.ambient.color, L.ambient.intensity));

    // Two directionals stand in for four floodlight banks. Real lights at each
    // pylon would quadruple the shading cost to produce a difference nobody
    // could name from the play camera.
    const key = new THREE.DirectionalLight(L.key.color, L.key.intensity);
    key.position.set(...L.key.position);
    key.castShadow = !isTouch();
    if (key.shadow) {
        key.shadow.mapSize.width = 1024;
        key.shadow.mapSize.height = 1024;
        const span = FIELD.lineInterval * FIELD.segments * 0.75;
        Object.assign(key.shadow.camera, {
            left: -span, right: span, top: span, bottom: -span, near: 1, far: 160,
        });
    }
    scene.add(key);

    const fill = new THREE.DirectionalLight(L.fill.color, L.fill.intensity);
    fill.position.set(...L.fill.position);
    scene.add(fill);
}

// ---- Frame loop ------------------------------------------------------------

/** Open the playbook and let the field idle behind it. */
function openPlaybook() {
    cycle.phase = 'playbook';
    cycle.held = 0;
    cycle.spotAt = null;
    discard();            // one recording is held at a time and no more
    hideSpot();
    showHud(false);
    showPlaybook();
}

/** The visitor chose. Line both teams up and wait for them to snap it.
 *  An empty `defense` is the library's own signal to pick one at random. */
function startPlay(offensive, defense) {
    lineUp(cycle.play, offensive, defense || '');
    resetBallFlight();
    cycle.phase = 'presnap';
    cycle.held = 0;
    cycle.accumulator = 0;
    cycle.playNumber += 1;
    syncFigures(cycle.play.game.objects, 0);
    syncBall(null, ballCarrier(cycle.play));

    setPlayNumber(cycle.playNumber, CFG.rules.playsPerGame);
    setScore(cycle.total);
    // The board carries what the HUD carries, updated at the same two moments,
    // so it can never be a play behind what the bar says.
    updateScoreboard({
        play: cycle.playNumber, of: CFG.rules.playsPerGame, score: cycle.total,
    });
    hideSpot();
    showHud(true);
    // THE SNAP IS THE VISITOR'S, NOT A TIMER'S. The pre-snap hold used to be
    // 1.8 seconds of waiting; making it a button means somebody can read the
    // formation for as long as they like, which is the whole point of having
    // chosen a play.
    showSnap();
}

/** Snap it. From here the routes run themselves and the visitor has one
 *  decision left: who gets the ball. */
function onSnap() {
    // THE FIRST REAL GESTURE IN THE GAME. Browsers will not start audio without
    // one, so this is where the library wakes up and the iOS keep-alive begins.
    unlockAudio();
    playSound('hike');
    playSound('snap', 120);

    snap(cycle.play);
    cycle.phase = 'live';
    cycle.held = 0;
    startRecording(cycle.play.game.objects);
    showInPlay(eligibleReceivers(cycle.play));
}

function onThrow(position) {
    if (throwTo(cycle.play, position)) {
        playSound('wind');
        clearActions();
    }
}

function onRun() {
    if (keepAndRun(cycle.play)) clearActions();
}

/** The whistle. Score it, remember it, and show the card. */
function finishPlay() {
    cycle.play.live = false;
    cycle.phase = 'result';
    clearActions();

    const result = outcome(cycle.play);
    // The 2D game's own choices in handleFinish: a whistle for anything that
    // stops the game, a grunt for a play that merely ended. An incomplete pass
    // already sounded itself from inside routes.js.
    if (result.points === 50 || result.result === 'interception' || result.result === 'sack') {
        playSound('whistle', 120);
    }
    if (result.result === 'sack' || result.result === 'run' || result.result === 'catch') {
        playSound('grunt');
    }
    cycle.lastOutcome = result;
    cycle.total += result.points;
    cycle.results.push(result);
    setScore(cycle.total);
    updateScoreboard({
        play: cycle.playNumber, of: CFG.rules.playsPerGame, score: cycle.total,
    });

    // REMEMBER WHERE IT ENDED. Read here, at the whistle, because a replay is
    // about to rewind the world and `ballWorldPoint` would then answer with
    // wherever the playhead happens to be.
    cycle.spotAt = ballWorldPoint();

    // The highlights play themselves. Anything else waits to be asked for.
    if (!reducedMotion && !isEmpty() && worthWatching(result)) {
        startReplay();
        return;
    }
    presentResult();
}

function presentResult() {
    cycle.phase = 'result';
    // STAND A LIGHT WHERE IT ENDED, under the card that is about to open over
    // it. The result card is centred, the middle of the screen is the middle of
    // the field, and the middle of the field is where a play tends to finish,
    // so without this the card hides the one thing it is reporting on. The
    // column rises past the card, which a ring on the grass could not.
    if (cycle.spotAt) showSpot(cycle.spotAt.x, cycle.spotAt.z);
    showResult(cycle.lastOutcome, cycle.playNumber, CFG.rules.playsPerGame,
        cycle.total, !isEmpty());
}

/** Roll the recording. The live simulation is not touched: playback rebuilds
 *  objects from the buffer, so a replay can never disturb what it recorded. */
function startReplay() {
    if (isEmpty()) { presentResult(); return; }
    hideResult();
    clearActions();
    showHud(false);
    // The spot belongs to the end of the play, and a replay is about to start
    // at the beginning of it. Leaving it standing would give away the ending.
    hideSpot();
    rewind();
    cycle.phase = 'replay';
    cycle.replayHold = 0;
}

/** Onward from the result card: the next play, or the end of the game. */
function onNext() {
    hideResult();
    if (cycle.playNumber >= CFG.rules.playsPerGame) {
        showHud(false);
        showSummary(cycle.results, startGame);
        return;
    }
    openPlaybook();
}

/** A fresh ten. */
function startGame() {
    cycle.playNumber = 0;
    cycle.total = 0;
    cycle.results = [];
    hideSummary();
    hideResult();
    setScore(0);
    openPlaybook();
}

/** Advance the play cycle. Kept apart from rendering so the whole thing is one
 *  readable state machine rather than a pile of conditions in the frame loop. */
function stepCycle(delta) {
    if (!cycle.play) return;
    if (cycle.phase === 'playbook') {
        // The field simply holds its last frame behind the overlay. Nothing
        // ticks, so a visitor reading the playbook is not burning a phone
        // battery on a simulation nobody is watching.
        return;
    }
    if (cycle.phase === 'result') return;

    if (cycle.phase === 'replay') {
        const done = advance(delta, CFG.simHz, CFG.camera.replay.speed);
        const objs = frameAt(playheadFrame(), teamOfPosition);
        syncFigures(objs, delta);
        // Before the throw there is no ball object, so it rides in the
        // quarterback's hands exactly as it does in the live play. The
        // recording does not store who is carrying, because before a throw it
        // is always the quarterback and after one the ball has its own slot.
        const ball = objs.find((o) => o.settings.position === 'ball'
            && !o.settings.benched && (o.coords.x || o.coords.y));
        syncBall(ball || null, ball ? null : objs.find((o) => o.settings.position === 'qb'), delta);
        if (done) {
            // Hold the last frame for a beat before the card, so the replay
            // ends on a composition rather than cutting away mid-motion.
            cycle.replayHold += delta;
            if (cycle.replayHold >= CFG.camera.replay.holdEnd) {
                showHud(true);
                presentResult();
            }
        }
        return;
    }

    cycle.held += delta;

    if (cycle.phase === 'presnap') {
        // Waiting on the snap button. The formation holds, nothing ticks.
        syncFigures(cycle.play.game.objects, delta);
        syncBall(null, ballCarrier(cycle.play), delta);
        return;
    }
    if (cycle.phase === 'live') {
        // Fixed 60Hz steps, however fast the display runs. Capped so a tab
        // that was backgrounded for a minute does not try to catch up on
        // three thousand frames at once.
        cycle.accumulator = Math.min(cycle.accumulator + delta, 0.25);
        while (cycle.accumulator >= SIM_STEP) {
            tick(cycle.play);
            record(cycle.play.game.objects);
            cycle.accumulator -= SIM_STEP;
        }
        // The simulation blows its own whistle. A timeout is only a backstop.
        if (isDone(cycle.play) || cycle.held >= PLAY_TIMEOUT) {
            cycle.play.live = false;
            cycle.phase = 'settle';
            cycle.held = 0;
            clearActions();
        }
    } else if (cycle.held >= HOLD_SETTLE) {
        finishPlay();
        return;
    }

    syncFigures(cycle.play.game.objects, delta);
    syncBall(null, ballCarrier(cycle.play), delta);
}

/**
 * LIGHT THE BAND THE BALL IS IN, and put the spot where the play ended.
 *
 * The 2D game's touchline labels do two jobs: they say where the rungs of the
 * ladder are, which the numerals painted on the turf now do, and they light the
 * one the ball has reached, which is this. Together they turn "the further you
 * carry it the more it is worth" from a sentence on the welcome card into
 * something a visitor watches happen.
 *
 * ONE READING OF THE CARRIER, shared by both. The band wants where the ball is
 * now and the spot wants where it stopped, and they are the same measurement a
 * moment apart, so taking it once means they can never disagree about which
 * player was carrying.
 */
const BAND_PHASES = new Set(['live', 'settle', 'replay', 'result']);

function trackBall(delta) {
    // ON THE RESULT CARD IT HOLDS WHERE IT FINISHED, rather than going out at
    // the whistle. The card says "+15" and the field says which fifteen, which
    // is the pair the 2D game's touchline shows and the reason the band is
    // worth having at all.
    const at = cycle.phase === 'result' ? cycle.spotAt : ballWorldPoint();
    const lit = !!at && BAND_PHASES.has(cycle.phase);
    setBandAt(lit ? at.x : 0, lit);
    fadeBand(delta);
}

/**
 * Where the ball is, in world metres, whichever way the game is running it.
 *
 * During a replay the live simulation is finished and its objects hold the last
 * frame, so the answer has to come from the recording. It is read through
 * `focusAt`, which is the same track the replay camera aims at, so the lit band
 * and the shot cannot disagree about where the ball got to.
 */
function ballWorldPoint() {
    if (cycle.phase === 'replay') {
        const f = replayFocus();
        return f ? simToWorld(f.x, f.y, 0) : null;
    }
    if (!cycle.play) return null;
    const carrier = ballCarrier(cycle.play);
    return carrier ? simToWorld(carrier.coords.x, carrier.coords.y, 0) : null;
}

/**
 * Where the recording says the ball was, memoised for the frame being drawn.
 *
 * `focusAt` rebuilds a whole frame of twenty objects to answer, and by the time
 * the lit band and the camera both wanted it, a replay was doing that three
 * times a frame and throwing sixty objects away. The playhead does not move
 * within a frame, so its value is the key: this collapses back to one.
 */
const focusMemo = { at: -1, value: null };
function replayFocus() {
    const frame = playheadFrame();
    if (focusMemo.at !== frame) {
        focusMemo.at = frame;
        focusMemo.value = focusAt(frame);
    }
    return focusMemo.value;
}

/** Which side a slot belongs to, for playback. The recording stores positions,
 *  not teams, because a position's team never changes. */
function teamOfPosition(position) {
    return position.startsWith('wr') || position.startsWith('x') || position === 'qb' ? 0 : 1;
}

function animate(now) {
    if (!state.isRunning) return;
    const delta = state.lastFrame ? Math.min((now - state.lastFrame) / 1000, 0.1) : 0;
    state.lastFrame = now;

    stepCycle(delta);
    state.elapsed += delta;
    trackBall(delta);
    pulseTargets(state.elapsed);
    setDriver(driverForPhase(cycle.phase));
    applyCamera(updateCamera(delta, cameraState()));
    renderer.render(scene, camera);
}

// ---- Tapping the players ----------------------------------------------------

/**
 * TAP THE QUARTERBACK TO SNAP IT, TAP A RECEIVER TO THROW TO THEM.
 *
 * This is how the 2D game is played, and the buttons along the bottom are the
 * accessible equivalent rather than the primary control. Both stay: the buttons
 * are the only keyboard route into a throw, they are what a screen reader
 * announces, and they name the receivers for anyone who cannot tell the discs
 * apart. Nothing is reachable ONLY by tapping the canvas, which is the trap a
 * pointer-driven scene falls into.
 *
 * IT IS NOT A RAYCAST. A player is between 2 and 21 pixels tall on a phone, so
 * hitting one with a fingertip would be a game of its own. Instead every
 * candidate is projected to screen space and the nearest one within a
 * finger-sized radius wins. That gives a forgiving target, it costs five
 * projections rather than a scene traversal, and it cannot be fooled by a
 * figure standing in front of another.
 */
const TAP_RADIUS = 46;        // CSS pixels, a little over a fingertip
const projected = { v: null };

/** Where a world point lands on screen, in CSS pixels. */
function toScreen(x, y, z) {
    if (!projected.v) projected.v = new THREE.Vector3();
    projected.v.set(x, y, z).project(camera);
    if (projected.v.z > 1) return null;      // behind the camera
    return {
        x: (projected.v.x * 0.5 + 0.5) * window.innerWidth,
        y: (1 - (projected.v.y * 0.5 + 0.5)) * window.innerHeight,
    };
}

/** Who can be tapped right now, and what tapping them does. */
function tapTargets() {
    if (!cycle.play) return [];
    if (cycle.phase === 'presnap') return [{ position: 'qb', act: onSnap }];
    if (cycle.phase === 'live' && !cycle.play.game.throwTo && !cycle.play.game.runForYourLife) {
        return [
            ...eligibleReceivers(cycle.play).map((pos) => ({
                position: pos, act: () => onThrow(pos),
            })),
            { position: 'qb', act: onRun },
        ];
    }
    return [];
}

function onCanvasPointer(event) {
    const targets = tapTargets();
    if (!targets.length) return;

    let best = null;
    for (const target of targets) {
        const figure = figureFor(target.position);
        if (!figure || !figure.visible) continue;
        // Aimed at the chest rather than the feet, because that is where the
        // eye puts the player and therefore where a finger goes.
        const at = toScreen(figure.position.x, 0.9 * CFG.figureScale, figure.position.z);
        if (!at) continue;
        const d = Math.hypot(at.x - event.clientX, at.y - event.clientY);
        if (d <= TAP_RADIUS && (!best || d < best.d)) best = { d, target };
    }
    if (!best) return;
    event.preventDefault();
    best.target.act();
}

/**
 * Make the tappable players look tappable.
 *
 * A slow breath on the marker under whoever can be pressed. Without it the
 * gesture is undiscoverable, and with anything faster it competes with the
 * play. Held still for anyone who asked not to be moved about, who still gets
 * the brighter resting opacity so the affordance is not lost entirely.
 */
function pulseTargets(elapsed) {
    const live = new Set(tapTargets().map((t) => t.position));
    setPulse(live, reducedMotion ? 1 : 0.72 + Math.sin(elapsed * 3.4) * 0.28);
}

function onResize() {
    if (!renderer || !camera) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    // The play camera solves its own framing from this, so a phone rotated
    // into portrait re-frames rather than losing both sidelines.
    setAspect(camera.aspect);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---- Boot ------------------------------------------------------------------

async function init() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    setProgress(0.15, 'Preparing the field…');
    initRenderer(canvas);
    initSceneGraph();
    initLighting();

    setProgress(0.5, 'Painting the lines…');
    initField(scene);

    setProgress(0.7, 'Calling the teams out…');
    setViewCamera(camera);
    cycle.play = createPlay(simAudio());
    // Line up once so the roster knows who exists, and so the field behind the
    // playbook shows a real formation rather than an empty pitch. The last
    // play a visitor chose is remembered, so a returning visitor sees theirs.
    const objects = lineUp(cycle.play, getSettings().lastPlay || 'pass2', '');
    initRoster(scene, objects);
    initMarkers(scene, objects);
    initSpot(scene);
    initBall(scene);
    syncFigures(objects, 0);
    syncBall(null, ballCarrier(cycle.play));

    initAudio();

    setProgress(0.85, 'Opening the playbook…');
    initPlaybook(startPlay);
    initHud({
        onSnap, onThrow, onRun, onNext,
        onReplay: startReplay,
        onToggleMute: () => toggleMuted(),
        isMuted,
    });

    setProgress(0.9, 'Almost ready…');

    // Both come from the shared boot part and both are easy to forget.
    //
    // THE SIGNAL IS NOT DECORATION. Every other scene hands these an
    // AbortSignal so their document-level listeners can be torn down, and
    // tests/shared-smoke.test.mjs checks for exactly that call shape. Calling
    // them bare works right up until something needs to dispose the scene, at
    // which point the handlers outlive it.
    //
    // The focus trap is what makes `aria-modal="true"` true on this page: the
    // playbook, the result card and the summary all claim it, and without the
    // trap Tab walks straight out of an open card into the HUD behind it while
    // a screen reader is still announcing a dialog the visitor has left. The
    // scroll reset is why a card opens at the top rather than wherever it was
    // last left, which was wrong on 53 cards across 12 scenes before it existed.
    cleanup = new AbortController();
    const { signal } = cleanup;
    installCardFocusTrap({ signal });
    installCardScrollReset({ signal });

    window.addEventListener('resize', onResize, { signal });
    // Tapping a player is the 2D game's own control. The HUD buttons remain
    // the keyboard and screen reader route, so nothing here is the only way
    // to reach anything.
    canvas.addEventListener('pointerdown', onCanvasPointer, { signal });
    // THE WELCOME CARD COMES FIRST, and only on arrival. "Play again" from the
    // summary goes straight back to the playbook, because somebody who has
    // just finished ten plays does not need the rules again.
    showWelcome(startGame);

    state.isLoaded = true;
    state.isRunning = true;
    setProgress(1, 'Ready');
    retireLoadingScreen();

    renderer.setAnimationLoop(animate);
}

/** Exposed for the suite, which boots this module under Node and needs a
 *  handle on what happened without a WebGL context. */
export function getState() {
    return { ...state };
}

export { init, animate, aimPlayCamera };

if (typeof document !== 'undefined') {
    init();
}
