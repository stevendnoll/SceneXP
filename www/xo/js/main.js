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
import { XO_CONFIG as CFG, FIELD, simToWorld } from './config.min.js';
import { initField, setBandAt, fadeBand, updateScoreboard, applyFieldColors } from './field.min.js';
import { initRoster, figureFor, TEAMS, applyTeamColors } from './roster.min.js';
import {
    loadColors, saveColors, setColors, resetColors, teamColors, warningsFor,
} from './colors.min.js';
import { initBall, getBall } from './ball.min.js';
import {
    initMarkers, setPulse, initSpot, showSpot, hideSpot, markerGeometry, applyMarkerColors,
} from './markers.min.js';
import {
    syncFigures, syncBall, setViewCamera, resetBallFlight, resetAssignments, noteThrow,
    beginTakedown, resetTakedown, takedownClock, beginSnapMotion,
    beginRelocate, resetRelocate, airborne,
    beginCelebration, resetCelebration, celebrationClock,
    beginStaging, resetStaging, drawnSpots, setScripted, resetScripted,
} from './view.min.js';
import {
    takedownLength, takedownRest, tacklerFor, contactFraction,
} from './takedown.min.js';
import {
    chooseCelebration, celebrationLength, occasionFor, teamCelebration,
} from './celebration.min.js';
import { planBulbs } from './fireworks.min.js';
import {
    createPlay, lineUp, snap, tick, ballCarrier, markAirborne, setDifficulty,
    isDone, throwTo, keepAndRun, eligibleReceivers, outcome, decisionLeft,
    clearEscapes, clockReading,
} from './play.min.js';
import { readGame, saveGame, clearGame } from './progress.min.js';
import { nextStreak, streakOver, difficultyFor, endSounds } from './scoring.min.js';
import {
    initHud, setPlayNumber, setScore, showHud, showHudBar, showSnap, showInPlay,
    clearActions, showResult, hideResult, announce, showWelcome, showHelp, showSkipReplay,
    showSkipCelebration, initKeys, setClock, showSkipShow, setMilestoneTitle,
    hideMilestoneTitle, showSkipOpening, setOpeningTitle, hideOpeningTitle, hideWelcome,
} from './hud.min.js';
import { openingFrame, planOpening, castAt, propsAt } from './opening.min.js';
import { initColorsCard, showColorsCard, colorsCardOpen } from './colors-ui.min.js';
import { drawColorsPreviews } from './colors-preview.min.js';
import {
    initOpeningProps, applyOpeningProps, hideOpeningProps, splashBuffer,
} from './opening-props.min.js';
import {
    milestoneDue, litStars, showFrame, showUsesTeam, stageTeam, turfSetup,
} from './milestones.min.js';
import {
    initSpectacle, beginShow, applyShow, setAwake, endShow, tickAwake, cheerCrowd, applyCrowdColors,
} from './spectacle.min.js';
import { cheerFor } from './stunt.min.js';
import { showSummary, hideSummary, readBest } from './summary.min.js';
import {
    startRecording, record, frameCount, frameAt, focusAt,
    rewind, advance, playheadFrame, isEmpty, discard,
} from './replay.min.js';
import {
    setDriver, setAspect, update as updateCamera, nudgeView, resetView, switchView,
    resetShoulder, viewQuarter,
} from './camera.min.js';
import {
    initAudio, unlock as unlockAudio, play as playSound, simAudio,
    isMuted, toggleMuted,
} from './audio.min.js';
import {
    initPlaybook, show as showPlaybook, hide as hidePlaybook, getSettings,
} from './playbook-ui.min.js';
import {
    installCardFocusTrap, installCardScrollReset, getProofOfWork,
} from '../../shared/js/boot-1.0.0.min.js';
import { setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';
import { report, reportFinal, orientationOf, playRecord } from './telemetry.min.js';

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
    phase: 'welcome',     // [opening] -> welcome -> playbook -> presnap -> live -> settle -> result
    /**
     * THE RULES CARD IS OPEN OVER THE PLAYBOOK ("How to play"). Not a phase:
     * the game is exactly where it was, and the playbook comes back to it. It
     * only stops the camera, see `animate`.
     */
    reading: false,
    held: 0,
    accumulator: 0,
    playNumber: 0,        // 1 to CFG.rules.playsPerGame
    total: 0,
    results: [],
    lastOutcome: null,
    replayHold: 0,
    /**
     * WHICH PLAY THE CHOSEN CAMERA ANGLE BELONGS TO.
     *
     * A visitor who switches the view and then watches the same play again is
     * asking to see THAT play from THAT angle, so a second look opens where the
     * first one left off. The next play is a new question and opens on the
     * director's own shot. -1 belongs to no play, so the first replay of a game
     * always resets.
     */
    viewPlay: -1,
    spotAt: null,         // world metres, where the last play finished
    /** ...and where the scoring band should light, which is NOT the same
     *  point: an interception has a spot and is worth no band. */
    bandAt: null,
    settleFor: 0,         // seconds to hold after the whistle, see beginSettle
    /** What the BOARD's clock panel currently reads. The HUD reads the live
     *  value and puts itself away; the board holds the last number it was given,
     *  the way a stopped play clock does. */
    clockShown: CFG.clock.decide,
    /** Who brought whom down, decided once at the whistle so the replay ends
     *  with the same tackle the live play did. */
    tackle: { tackler: '', carrier: '' },
    /**
     * ...AND WHO CELEBRATED WHAT, HELD FOR EXACTLY THE SAME REASON.
     *
     * A pick and a fifty end with no tackle in them at all, so they end with a
     * celebration instead (see celebration.js). The mode and the dance are
     * ROLLED ONCE, here, because a replay has to end on the celebration the
     * live play ended on: rolled again on playback, the visitor would press
     * "Watch the replay" and be shown a different party from the one they had
     * just seen, which makes the whole thing read as random decoration rather
     * than as something that happened.
     */
    party: null,
    /**
     * ...AND WHICH STANDS WENT UP, FOR THE THIRD TIME FOR THE SAME REASON.
     *
     * The fans cheered at the live whistle and a replay used to end in silent
     * stands, because the cheer was a one-off call on the whistle's frame and
     * the replay only ever re-ran the tackle and the party. Kept here, it is
     * the same cheer for the same team on the same frame of the second look.
     * `cheered` says whether this replay has already raised it.
     */
    cheer: null,
    cheered: false,
    /**
     * HOW THE GAME IS GOING, as a signed run of plays. Positive is a run of
     * good ones and negative a run of bad ones, and it leans the next line-up's
     * speed roll (see `scoring.nextStreak` and `config.difficulty`).
     *
     * NOT SAVED SEPARATELY, and deliberately: it is recomputed from `results`,
     * which the save already carries, so a resumed game cannot come back with a
     * streak that disagrees with the plays behind it.
     */
    streak: 0,
    /**
     * THE HIGHEST MILESTONE SHOW THIS GAME HAS PLAYED, and therefore how awake
     * the stadium is. Like the streak it is never saved: a resumed game works
     * it out from `results` (see `resumeGame`), so a reload cannot replay a
     * show that has already been seen.
     */
    shown: 0,
    /** The show running now: { level, t, then, revealed, board }, or null. */
    show: null,
    /** The shot the running show wants, handed to the camera each frame. */
    showShot: null,
};

/**
 * THIS VISIT, AS THE USAGE LOG SEES IT (see telemetry.js).
 *
 * Nothing here is saved. `games` counts the games FINISHED in this visit, which
 * is what the 2D game's `games` field became: it counted summaries it had kept
 * in storage, and keeping another thing in storage just to count it is not
 * worth a line in the privacy policy.
 */
const visit = { start: 0, ended: false, games: 0, plays: 0 };

/** Which way the screen is held right now. */
function orientation() {
    return typeof window === 'undefined' ? ''
        : orientationOf(window.innerWidth || 0, window.innerHeight || 0);
}

/** The play as called and as actually lined up, which most hits carry. The
 *  defense is the one the library rolled when the visitor left it to chance. */
function calledFields() {
    const play = cycle.play || {};
    return { defense: play.defense || '', offense: play.offense || '', playCount: cycle.playNumber };
}

/** How long, in simulated seconds, the ball has been out. Simulated rather than
 *  wall clock, so a slow phone does not look like a slow decision. */
function sinceSnap() {
    return cycle.play ? cycle.play.frame / CFG.simHz : 0;
}

/** The visit is over. Idempotent, because both of the events that mean it can
 *  arrive, and a visitor who switches tabs and back does not reopen it. */
function endVisit() {
    if (visit.ended || !visit.start) return;
    visit.ended = true;
    reportFinal('session-end', {
        seconds: (Date.now() - visit.start) / 1000,
        outcome: { games: visit.games, plays: visit.plays },
    });
}

/** Whoever asked not to be moved about. Checked once: a visitor who changes it
 *  mid-game can reload, and re-querying every frame is a needless cost. */
const reducedMotion = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

/**
 * NO REPLAY EVER STARTS ON ITS OWN, WHICH IS QA ITEM 7.
 *
 * The game used to show the highlights unasked (D36): anything worth 30 or
 * more, and every turnover. It reads well in a list of features and it was
 * wrong in practice, because the replay opened BEFORE the result card, so the
 * one moment a visitor needs to be told what happened was spent watching it
 * happen again without knowing what it was. On an interception in particular,
 * the first thing you saw was the same throw a second time and no explanation.
 *
 * So the order is fixed by removing the shortcut: the whistle goes, the card
 * says what it was and what it was worth, and "Watch the replay" is on the card
 * for anybody who wants it. D124's skip button stays, because a replay a
 * visitor DID ask for should still be interruptible.
 */

/** The simulation's speeds are PER FRAME, not per second, because that is how
 *  the 2D game was written. So it is stepped on a fixed clock rather than once
 *  per rendered frame, or the game would run at double speed on a 120Hz
 *  display and in slow motion on a struggling phone. The rate itself is the
 *  game's pace and lives in config (see `simHz`). */
const SIM_STEP = 1 / CFG.simHz;
/**
 * THE BOARD, PAINTED FROM ONE PLACE.
 *
 * There were three separate `updateScoreboard` calls, each listing the fields by
 * hand, which is three chances to add a reading to the board and forget one of
 * them. The clock would have been missing from whichever call was not edited,
 * and the board would have been right twice and stale once.
 */
function paintBoard(takeover = null) {
    updateScoreboard({
        play: cycle.playNumber,
        of: CFG.rules.playsPerGame,
        score: cycle.total,
        clock: `${cycle.clockShown}`,
        // One star per show played, which is the part of the stadium waking up
        // that the play camera can always see.
        stars: litStars(cycle.shown),
        takeover,
    });
}

/**
 * A play cannot run forever. The simulation raises its own whistle on a catch, a
 * drop, a tackle or a crossing, and in practice does so between two and six
 * seconds. This is the backstop for a play that somehow does not finish, not the
 * normal way one ends.
 *
 * IT IS NOW MEASURED PAST THE PLAY CLOCK RATHER THAN FROM THE SNAP, and it had
 * to move. A flat twelve seconds was safe only while nothing encouraged a late
 * decision; `CFG.clock` now gives the visitor ten of them on purpose. Measured
 * from a decision taken at the last legal moment, a play still needs a median of
 * 1.4 seconds after a throw and 5.6 after a keeper, and the longest run took
 * 12.11. A flat twelve would have cut a quarterback down in the open field and
 * recorded a run for wherever he had got to. See `clock.backstop`.
 */
const PLAY_TIMEOUT = CFG.clock.decide + CFG.clock.backstop;
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
    // THE WELCOME CARD GETS THE STILL CAMERA. The idle dolly exists so the
    // field does not look paused behind the playbook, and behind a card of
    // reading matter it is just a moving background: a visitor trying to read
    // six lines of rules watches the pitch slide sideways underneath them.
    if (phase === 'welcome') return 'play';
    if (phase === 'playbook') return 'idle';
    if (phase === 'replay') return 'replay';
    if (phase === 'show' || phase === 'opening') return 'show';
    return 'play';
}

/** What the active driver needs to know. Only the replay driver needs
 *  anything, and what it needs is where the ball was on this frame. */
function cameraState() {
    if (cycle.phase === 'show') return { shot: cycle.showShot };
    if (cycle.phase === 'opening') return { shot: cycle.openingShot };
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
    const ambient = new THREE.AmbientLight(L.ambient.color, L.ambient.intensity);
    scene.add(ambient);

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
    // The milestone shows dim and raise all three, so they are handed over.
    return { ambient, key, fill };
}

// ---- Frame loop ------------------------------------------------------------

/** Open the playbook and let the field idle behind it. */
function openPlaybook() {
    cycle.phase = 'playbook';
    cycle.held = 0;
    cycle.spotAt = null;
    cycle.bandAt = null;
    discard();            // one recording is held at a time and no more
    hideSpot();
    showHud(false);
    showPlaybook();
}

/** The visitor chose. Line both teams up and wait for them to snap it.
 *  An empty `defense` is the library's own signal to pick one at random. */
/**
 * THE PLAYBOOK CHOSE SOMETHING, AND THERE ARE TWO REASONS IT MIGHT HAVE.
 *
 * Between plays it is the next play, and the play number moves on. Before the
 * snap it is a CHANGE OF MIND, and it must not: a visitor who reads the
 * formation, decides they called the wrong thing and picks again has not used
 * up one of their ten. Same handler either way, because the playbook has no
 * business knowing which of the two it is being opened for.
 */
function onPlaybookChoice(offensive, defense, { repeat = false } = {}) {
    const changing = cycle.phase === 'presnap';
    report('call-play', {
        kind: changing ? 'change' : 'next',
        outcome: {
            offense: offensive,
            defense: defense || 'random',
            repeat: repeat || undefined,
            playCount: changing ? cycle.playNumber : cycle.playNumber + 1,
        },
    });
    if (changing) changePlay(offensive, defense);
    else startPlay(offensive, defense);
}

/**
 * CHANGE THE PLAY, AND LET THEM WALK TO IT.
 *
 * Everything a new line-up resets EXCEPT the play number, the score and the
 * clock, because none of those have happened yet. The one addition is
 * `beginRelocate`, which turns what would be seventeen figures teleporting into
 * seventeen figures jogging to their new spots: view.js carries each of them
 * from where he is actually drawn to where the new formation puts him, and the
 * stride, the arm swing and the heading all fall out of that movement because
 * every one of them is already derived from the position that is drawn.
 */
function changePlay(offensive, defense) {
    uiClick();
    setDifficulty(cycle.play, difficultyFor(cycle.streak, CFG.difficulty));
    lineUp(cycle.play, offensive, defense || '');
    resetBallFlight();
    resetAssignments();
    resetTakedown();
    resetCelebration();
    resetStaging();
    cycle.tackle = { tackler: '', carrier: '' };
    cycle.party = null;
    cycle.cheer = null;
    cycle.held = 0;
    cycle.accumulator = 0;
    beginRelocate();
    // Delta zero, so this frame draws them exactly where they already were and
    // the walk starts from there rather than from the new formation.
    syncFigures(cycle.play.game.objects, 0, { presnap: true });
    showBall(cycle.play.game.objects, 0);
    showSnap();
    announce('Play changed. The teams are lining up again.');
}

/** Open the playbook over the formation, without ending anything. */
function onChangePlay() {
    if (cycle.phase !== 'presnap') return;
    report('change-play', { outcome: calledFields() });
    uiClick();
    clearActions();
    showPlaybook({ canCancel: true, onCancel: onKeepPlay });
}

/** ...and back out of it, having decided the play was fine after all. */
function onKeepPlay() {
    if (cycle.phase !== 'presnap') return;
    report('keep-play', { outcome: calledFields() });
    hidePlaybook();
    showSnap();
}

function startPlay(offensive, defense) {
    // Choosing a play off the playbook is the click the `snap` sample is for.
    uiClick();
    resetRelocate();
    // BEFORE THE LINE-UP, because the lean is applied where every player's
    // speed is rolled and that happens once, here.
    setDifficulty(cycle.play, difficultyFor(cycle.streak, CFG.difficulty));
    lineUp(cycle.play, offensive, defense || '');
    resetBallFlight();
    // Coverage assignments are cached for the replay, so a new line-up has to
    // drop the last play's.
    resetAssignments();
    // And so does the last play's tackle, or a man who was on his back when the
    // whistle went lines up for this one lying down. Same for the party, or a
    // defense lines up thirteen metres from where the formation put it.
    resetTakedown();
    resetCelebration();
    // ...and wherever a milestone show last sent everybody.
    resetStaging();
    cycle.tackle = { tackler: '', carrier: '' };
    cycle.party = null;
    cycle.cheer = null;
    cycle.phase = 'presnap';
    cycle.held = 0;
    cycle.accumulator = 0;
    cycle.settleFor = HOLD_SETTLE;
    cycle.playNumber += 1;
    syncFigures(cycle.play.game.objects, 0, { presnap: true });
    showBall(cycle.play.game.objects, 0);

    setPlayNumber(cycle.playNumber, CFG.rules.playsPerGame);
    setScore(cycle.total);
    // ...and it is not shown before the snap either. A clock reading ten while
    // the playbook is open is counting nothing, and the first thing it would do
    // when the ball was snapped is read ten again.
    setClock(null);
    // ...and the board goes back to a full clock, because that is what the next
    // snap will start it at. It is never blank: a panel that empties itself
    // between plays makes the whole board look broken.
    cycle.clockShown = CFG.clock.decide;
    // The board carries what the HUD carries, updated at the same two moments,
    // so it can never be a play behind what the bar says.
    paintBoard();
    hideSpot();
    showHud(true);
    // THE SNAP IS THE VISITOR'S, NOT A TIMER'S. The pre-snap hold used to be
    // 1.8 seconds of waiting; making it a button means somebody can read the
    // formation for as long as they like, which is the whole point of having
    // chosen a play.
    showSnap();
}

/**
 * THE WHISTLE HAS GONE. Hold the frame, and if somebody was brought down, run
 * the tackle before anything opens a card over the top of it.
 *
 * The simulation already knows: `state.tackled` is set by the collision boxes
 * and is what ended the play. What it does not do is show it, because at the
 * whistle the two men are a median 1.85m apart (see takedown.js), and the
 * previous version inferred a knockdown from that distance and therefore never
 * showed one. This is the cue, and the dive covers the gap.
 */
function beginSettle() {
    cycle.play.live = false;
    cycle.phase = 'settle';
    cycle.held = 0;
    cycle.settleFor = HOLD_SETTLE;
    cycle.tackle = { tackler: '', carrier: '' };
    cycle.party = null;
    cycle.cheer = null;
    resetTakedown();
    resetCelebration();
    clearActions();
    // THE CLOCK GOES AWAY WITH THE ACTIONS. Nothing calls `setClock` outside the
    // live phase, so without this the readout freezes on screen at whatever it
    // said when the whistle went and sits over the result card counting nothing.
    setClock(null);
    /**
     * AND SO DOES EVERY POSE, HOWEVER THE WHISTLE WAS RAISED.
     *
     * `tick` already clears them when the SIMULATION blows the whistle, which is
     * almost always. It is not always: the simulation does not guarantee it ever
     * finishes, and `PLAY_TIMEOUT` above is the only hard stop. A play ended
     * that way reached here with a man still mid-stiff-arm, and the only thing
     * saving it was the view declining to pose anybody outside the live phase.
     * One guard is not a guarantee, and this is the one place every ending
     * passes through.
     */
    clearEscapes(cycle.play);

    /**
     * AND THE TWO ENDINGS WITH NOBODY TO TACKLE GET A PARTY INSTEAD.
     *
     * An interception stops the play on the frame the ball is caught and a
     * fifty stops it with the carrier over the line and nobody near him, so
     * `state.tackled` is false for both and the whole of the rest of this
     * function has never once run for either. The best thing and the worst
     * thing in the game were the two endings where the field simply stopped.
     *
     * IT WINS OUTRIGHT over the tackle for those two. Two men cannot be
     * celebrating and being tackled at the same time, and a takedown would be
     * drawing the defender who just picked it diving on somebody.
     *
     * THE DEFENSE GETS TWO MORE, and they are different in kind. A sack is a
     * tackle, so it keeps its takedown and celebrates AFTER it. A play clock
     * running out has nobody in it at all, and gets the small version: arms up
     * where they stand (see `clockRanOut` in celebration.js).
     *
     * `outcome` is pure and reads only frozen state, so asking it here and
     * again at the card is two readings of one unchanged fact rather than a
     * chance for the two to disagree.
     */
    const result = outcome(cycle.play);
    // WHO WENT DOWN, decided before the party because a sack's party is built
    // on top of it: the sacker gets up from wherever the tackle leaves him.
    const downed = cycle.play.playState.state.tackled ? ballCarrier(cycle.play) : null;
    const pair = downed
        ? { tackler: tacklerFor(cycle.play.game.objects, downed), carrier: downed.settings.position }
        : { tackler: '', carrier: '' };
    const party = planCelebration(result, pair);
    /**
     * A SACK IS THE ONE ENDING THAT GETS BOTH, in that order. The celebration
     * carries the takedown's length as its own `wait`, so the two clocks can
     * start on the same frame here and in the replay and still play one after
     * the other.
     */
    const tackleToo = !party || party.occasion === 'sack';
    if (tackleToo && pair.tackler) {
        cycle.tackle = pair;
        startTakedown(cycle.play.game.objects, pair.tackler, pair.carrier);
        // Long enough to land the hit and let him lie there for a beat. A
        // card opening over a man in mid-air is worse than no animation at
        // all.
        cycle.settleFor = Math.max(HOLD_SETTLE, takedownLength() + 0.2);
    }
    /**
     * THE STANDS GO UP ON THE WHISTLE, the fans of whichever team it went for,
     * and they are told the same occasion the field celebrates.
     *
     * AFTER THE TACKLE, NOT BEFORE IT, AND THAT ORDER IS DELIBERATE. `cheerFor`
     * and `cheerCrowd` cannot change who went down or whether there is a party;
     * they only read what is already decided. Standing them ahead of the
     * takedown put the one piece of the whistle a visitor is actually watching
     * behind two hundred fans, with nothing between them but the assumption
     * that the crowd never throws. Nothing decorative comes before the tackle.
     */
    cycle.cheer = cheerFor(result, occasionFor(result, !!pair.tackler, !!cycle.play.expired));
    cheerCrowd(cycle.cheer, state.elapsed, { calm: reducedMotion });
    if (party && beginCelebration(party)) {
        cycle.party = party;
        cycle.settleFor = Math.max(cycle.settleFor, celebrationLength(party));
        showSkipCelebration();
        /**
         * AND SAY SO, BECAUSE NONE OF IT IS AUDIBLE.
         *
         * A celebration is four seconds of movement and nothing else, so
         * without this a visitor using a screen reader gets four seconds of
         * silence and a button called "Skip" appearing under their focus with
         * no explanation of what there is to skip. It deliberately does not
         * repeat the headline: the result card says what happened a moment
         * later, and this says who is enjoying it.
         *
         * BY THE LETTER ON THE JERSEY, NEVER THE TEAM'S NAME. The names live in
         * source code only (Steve, 2026-09-15): a visitor knows these teams as
         * the X's and the O's.
         */
        announce(`The ${TEAMS[teamOfPosition(party.hero)].glyph}'s are celebrating.`);
    }

    endTheDown(result);
}

/**
 * THE WHISTLE SOUNDS AT THE WHISTLE, WHICH IS HERE AND NOT AT THE CARD.
 *
 * This lived in `finishPlay`, which runs after the ENTIRE settle hold, and it
 * was already a little late before the celebration existed. It made it four
 * seconds late: QA heard a fifty score, watched the whole party, and then heard
 * the referee blow for a play that had been over since before it started.
 *
 * It is the same fault the grunt had and the same fix. `startTakedown` moved
 * the grunt onto the frame the two bodies meet for exactly this reason; the
 * whistle needed moving onto the frame the play ends, and nothing was left in
 * `finishPlay` that belongs to a moment rather than to a card.
 *
 * AND A PLAY CLOCK RUNNING OUT IS NOT A HIT. `classifyPlay` calls it a sack,
 * because nobody threw it and nobody ran with it, and `endSounds` used to hand
 * every untackled sack a grunt: the quarterback stood untouched in the pocket
 * while the clock hit zero and the game played the sound of a man being driven
 * into the turf. `play.expired` is the one fact that separates the two, and the
 * rule lives in scoring.js with the rest of them.
 */
function endTheDown(result) {
    const sounds = endSounds(result, !!cycle.tackle.tackler, !!cycle.play.expired);
    if (sounds.whistle) playSound('whistle', 120);
    if (sounds.grunt) playSound('grunt');
}

/**
 * WHO IS CELEBRATING WHAT, ASSEMBLED FROM THE FIELD RATHER THAN FROM THE GAME.
 *
 * celebration.js is pure and knows nothing about this scene: it takes people as
 * world points and hands back offsets. Everything that is a fact about THIS
 * field lives here, and there are only four of them worth naming.
 *
 * WHICH WAY HOME IS. The offense runs at +x and the defense at -x, so a team's
 * own end zone is decided by which side the man holding the ball is on rather
 * than by what just happened. That matters because both teams can be the ones
 * celebrating.
 *
 * WHERE THE CROWD IS, which is the camera, and the camera stands beyond the
 * NEAR end line at negative x (see `camera.solve.nearBehind`). A man playing to
 * it is a man turning toward the viewer, and getting this backwards would put
 * his back to everybody for the whole celebration.
 *
 * WHO IS TO BLAME, on a pick, which is the quarterback who threw it. It is the
 * one beat in the whole thing that is about the visitor rather than about the
 * defense, and it is the reason the `point` dance exists.
 *
 * AND WHERE THE PAINT ENDS, so nobody is sent to celebrate in the stands.
 *
 * `pair` is the tackle decided at the whistle, which a sack's party is built on.
 */
function planCelebration(result, pair = { tackler: '', carrier: '' }) {
    const occasion = occasionFor(result, !!pair.tackler, !!cycle.play.expired);
    if (!occasion) return null;

    const carrier = ballCarrier(cycle.play);
    if (!carrier) return null;

    const objects = cycle.play.game.objects;
    const at = (o) => {
        const w = simToWorld(o.coords.x, o.coords.y, 0);
        return { position: o.settings.position, x: w.x, z: w.z };
    };
    // Anybody actually on the field: no bench, no ball, and nobody the roster
    // has no figure for.
    const playing = objects.filter((o) => !o.settings.benched
        && o.settings.position !== 'ball' && figureFor(o.settings.position));
    const C = CFG.pose.celebration;

    /**
     * THE DEFENSE'S TWO, where the man with the ball is the quarterback and he
     * is on the OTHER side from everybody celebrating.
     */
    if (occasion === 'sack' || occasion === 'expired') {
        const byName = (name) => playing.find((o) => o.settings.position === name) || null;
        const sacker = occasion === 'sack'
            ? byName(pair.tackler)
            : byName(tacklerFor(objects, carrier));
        if (!sacker) return null;
        const side = sacker.settings.team;
        const mates = playing.filter((o) => o !== sacker && o.settings.team === side).map(at);
        const rivals = playing.filter((o) => o.settings.team !== side);
        if (occasion === 'expired') {
            return chooseCelebration({
                occasion, hero: at(sacker), mates, rivals: rivals.map(at), calm: reducedMotion,
            });
        }
        /**
         * A SACK STARTS WHERE THE TACKLE ENDS. The sacker is celebrated from
         * the spot he lands on, the quarterback he is pointing at is where he
         * was driven to, and the length of the tackle is the party's wait.
         * `takedownRest` reads the same function the view draws with, so all
         * three are the numbers on screen.
         */
        const rest = takedownRest(at(sacker), at(carrier));
        // He was looking downfield, so on his back he lies toward his own end
        // zone. His team runs at +x, which puts his head at lower x.
        const behind = carrier.settings.team === 0 ? -1 : 1;
        return chooseCelebration({
            occasion,
            hero: { position: sacker.settings.position, ...rest.tackler },
            mates,
            // Not the quarterback: he is on his back, and the dejection would
            // stand him up to hang his arms.
            rivals: rivals.filter((o) => o !== carrier).map(at),
            blameAt: rest.carrier,
            floor: C.sack.floor.map((d) => ({ x: rest.carrier.x + behind * d, z: rest.carrier.z })),
            bounds: {
                minX: -FIELD.endZone + 0.8,
                maxX: FIELD.lineInterval * FIELD.segments + FIELD.endZone - 0.8,
                halfZ: FIELD.width / 2 - 0.6,
            },
            wait: rest.length,
            calm: reducedMotion,
        });
    }

    const scored = occasion === 'fifty';
    const picked = occasion === 'pick';
    const side = carrier.settings.team;
    const hero = at(carrier);
    const len = FIELD.lineInterval * FIELD.segments;
    const toward = side === 0 ? 1 : -1;
    const qb = picked
        ? objects.find((o) => o.settings.position === 'qb' && !o.settings.benched)
        : null;

    return chooseCelebration({
        occasion,
        hero,
        mates: playing.filter((o) => o !== carrier && o.settings.team === side).map(at),
        rivals: playing.filter((o) => o.settings.team !== side).map(at),
        homeX: side === 0
            ? len + FIELD.endZone - C.endZoneDepth
            : -FIELD.endZone + C.endZoneDepth,
        toward,
        blameAt: qb ? at(qb) : null,
        crowdAt: { x: -FIELD.endZone - 8, z: hero.z },
        bounds: {
            minX: -FIELD.endZone + 0.8,
            maxX: len + FIELD.endZone - 0.8,
            halfZ: FIELD.width / 2 - 0.6,
        },
        scored,
        // Somebody who asked not to be moved about gets the still version: arms
        // up and held, no run, no spin, no hop. celebration.js owns that.
        calm: reducedMotion,
    });
}

/** Out of the celebration and on to the card, for anybody who would rather
 *  know what it cost than watch the other team enjoy it. */
function onSkipCelebration() {
    if (cycle.phase !== 'settle' || !cycle.party) return;
    report('skip-celebration', { kind: cycle.party.occasion, outcome: { playCount: cycle.playNumber } });
    uiClick();
    // The party stops where it is. Nothing it did needs undoing, because every
    // offset it applied was on top of where the simulation left each man.
    resetCelebration();
    /**
     * ...BUT SOMEBODY HAS TO DRAW THEM THERE, AND NOBODY WAS GOING TO.
     *
     * The sentence above used to finish "and the next frame simply draws them
     * there". There is no next frame: `finishPlay` opens the card, `stepCycle`
     * returns on the `result` phase and `syncFigures` is never called again, so
     * clearing the party left every celebrant frozen in whatever half of a
     * dance the skip landed on. Same fault as a skipped replay, one ending
     * over. See `landReplay`.
     *
     * The tackle is deliberately left alone: a man on the grass is where the
     * play actually ended, and a sack's party waits for the whole takedown
     * anyway, so by here it is already at its end.
     */
    syncFigures(cycle.play.game.objects, 0, { live: false });
    showBall(cycle.play.game.objects, 0);
    finishPlay();
}

/** Snap it. From here the routes run themselves and the visitor has one
 *  decision left: who gets the ball. */
function onSnap() {
    unlockAudio();
    /**
     * THE HIKE, AND NOTHING ELSE.
     *
     * A `snap` sample used to play 120ms behind it, which reads as sensible
     * right up until you know what that sample is FOR. In the 2D game it is
     * the UI CLICK: the sound of choosing a play off the playbook. It is a
     * finger on a control, not a ball leaving a centre's hands, and putting it
     * under the hike gave the one moment the game has a mouse click on top of
     * it. It now plays where it belongs, on the chrome (see `uiClick`).
     */
    playSound('hike');

    snap(cycle.play);
    visit.plays += 1;
    report('snap', { outcome: calledFields() });
    // AND HE BRINGS IT BACK. QA item 1: up to here he has been waiting under
    // centre with the ball out in front, and this is the cue that lifts it to
    // his ear while he looks downfield. Told rather than inferred, because the
    // press IS the cue and there is nothing to infer it from.
    beginSnapMotion();
    cycle.phase = 'live';
    cycle.held = 0;
    startRecording(cycle.play.game.objects);
    showInPlay(eligibleReceivers(cycle.play));
}

function onThrow(position) {
    if (throwTo(cycle.play, position)) {
        // TELLING THE VIEW WHO IT WENT TO, rather than leaving it to work the
        // answer out from where the ball is aimed. Only the man it was thrown
        // to may leave his feet for it, and an inference that is wrong 13% of
        // the time puts the wrong man in the air (QA round twenty-four).
        noteThrow(position);
        playSound('wind');
        clearActions();
        report('throw', {
            kind: position,
            outcome: { ...calledFields(), throwTo: position },
            seconds: sinceSnap(),
        });
    }
}

function onRun() {
    if (keepAndRun(cycle.play)) {
        clearActions();
        report('keep-run', { outcome: calledFields(), seconds: sinceSnap() });
    }
}

/** The whistle. Score it, remember it, and show the card. */
function finishPlay() {
    cycle.play.live = false;
    cycle.phase = 'result';
    clearActions();

    const result = outcome(cycle.play);
    // THE SOUNDS ARE NOT HERE ANY MORE. They belong to the whistle and this
    // function runs anywhere from one to four seconds after it, so they are
    // raised in `beginSettle` by `endTheDown`. What is left here is the
    // bookkeeping, which genuinely does belong to the card.
    cycle.lastOutcome = result;
    cycle.total += result.points;
    cycle.results.push(result);
    // AND THE GAME TAKES NOTE. A run of fifties leans the next line-up toward a
    // quicker defense, a run of nothing leans it the other way, and the visitor
    // is never told either way.
    cycle.streak = nextStreak(cycle.streak, result.points, CFG.difficulty);
    setScore(cycle.total);
    paintBoard();

    // THE 2D GAME'S PLAY RECORD, one hit per whistle, with the score already
    // including this play the way the 2D game sent it.
    const called = calledFields();
    report('play-result', {
        kind: result.result,
        outcome: playRecord({
            defense: called.defense,
            offense: called.offense,
            orientation: orientation(),
            points: result.points,
            result: result.result,
            throwTo: cycle.play.game.throwTo || '',
            currentScore: cycle.total,
            playCount: cycle.playNumber,
            muted: isMuted(),
            games: visit.games,
            expired: !!cycle.play.expired,
        }),
    });

    // REMEMBER WHERE IT ENDED. Read here, at the whistle, because a replay is
    // about to rewind the world and `ballWorldPoint` would then answer with
    // wherever the playhead happens to be.
    cycle.spotAt = ballWorldPoint();
    cycle.bandAt = bandPoint();

    // AND SAVE IT, so a reload during play five does not cost plays one to
    // four. Written here rather than on "Next play" because the play is over
    // and scored at this point, and a visitor who closes the tab while the
    // result card is open has finished it just as much as one who clicks on.
    saveGame(cycle);

    landTackle();
    presentResult();
}

/**
 * A CARD NEVER OPENS OVER A TACKLE THAT DID NOT HAPPEN.
 *
 * QA, 2026-09-22, with a screenshot: a completed pass, "+15 Caught and brought
 * down", and the receiver standing in the middle of the field holding the ball
 * with the nearest defender several metres away and nobody on the grass.
 *
 * EVERY WAY A FIFTEEN POINT CATCH CAN END WAS WALKED AND THEY ALL RAISE
 * `state.tackled`: the carrier's own route, the quarterback's, and the
 * out-of-bounds branch. The two that do not are the fifty and the two turnovers,
 * which have a party instead, and the render loop's own backstop, which measured
 * over 4,284 plays never once fired (longest play 22.95s against a 28s
 * backstop). So the whistle was a tackle and the takedown did not play.
 *
 * WHAT COULD LOSE IT IS EVERYTHING BETWEEN THE FLAG AND THE ANIMATION. The
 * result, the carrier, the tackler, the party and the crowd are all read first,
 * and any one of them throwing takes `startTakedown` with it while `beginSettle`
 * has already set the phase and the hold, so the card opens on time over a field
 * nobody knocked down. Three's animation loop asks for its next frame before
 * calling ours, so a throw costs one frame and leaves no other trace.
 *
 * Rather than guess which one, this states the rule the whole sequence exists to
 * produce and checks it at the last possible moment, which is also the cheapest:
 * the pair is re-derived from the same two pure functions, and the hit is handed
 * over ALREADY LANDED, because the card is about to freeze the field (see
 * `landReplay`). If the takedown did play, `takedownClock` is running and this
 * does nothing at all.
 */
function landTackle() {
    if (!cycle.play || !cycle.play.playState.state.tackled) return;
    if (takedownClock() >= 0) return;
    const downed = ballCarrier(cycle.play);
    if (!downed) return;
    const tackler = tacklerFor(cycle.play.game.objects, downed);
    if (!tackler) return;
    cycle.tackle = { tackler, carrier: downed.settings.position };
    startTakedown(cycle.play.game.objects, tackler, cycle.tackle.carrier,
        takedownLength());
    syncFigures(cycle.play.game.objects, 0, { live: false });
    showBall(cycle.play.game.objects, 0);
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
    report('show-replay', {
        kind: cycle.viewPlay === cycle.playNumber ? 'again' : 'first',
        outcome: { playCount: cycle.playNumber, result: cycle.lastOutcome ? cycle.lastOutcome.result : '' },
    });
    uiClick();
    hideResult();
    // THE HUD STAYS UP THROUGH A REPLAY, carrying one button. It used to be
    // hidden for the duration, so a replay that started on its own (D36 plays
    // the highlights unasked) had no way out but to wait for it.
    showHud(true);
    showSkipReplay();
    // The spot belongs to the end of the play, and a replay is about to start
    // at the beginning of it. Leaving it standing would give away the ending.
    hideSpot();
    /**
     * AND EVERY REPLAY OPENS ON THE SHOT IT WAS COMPOSED WITH, unless it is a
     * SECOND LOOK AT THE SAME PLAY.
     *
     * A visitor who switched the view on the last play is not asking for that
     * angle on this one, which is why this was an unconditional reset. But one
     * who switched the view and then pressed "Watch the replay" again is asking
     * for exactly that angle, on exactly that play, and handing them the
     * default back makes the button they just pressed look broken (QA round
     * twenty-three).
     *
     * THE SHOULDER IS RESET EITHER WAY. It is the director's own choice of
     * which side to orbit from for THIS carrier, not the visitor's, and a
     * replay that starts mid-swing opens on a shot nobody composed.
     */
    if (cycle.viewPlay !== cycle.playNumber) {
        cycle.viewPlay = cycle.playNumber;
        resetView();
    } else {
        resetShoulder();
    }
    // So does the tackle: it belongs to the last frame of the recording, and
    // the playhead is going back to the first. The celebration is the same
    // ending one ending over, and without this a second look opens with eleven
    // men already halfway to the end zone.
    resetTakedown();
    resetCelebration();
    // The stands sit down with it, whether or not the live cheer had finished,
    // and go up again at the same whistle below.
    cheerCrowd(null, state.elapsed);
    cycle.cheered = false;
    rewind();
    // The recording begins ON the snap, so the playhead going back to frame
    // one is the same instant the visitor's press was, and he takes the ball
    // back again.
    beginSnapMotion();
    cycle.phase = 'replay';
    cycle.replayHold = 0;
}

/** Onward from the result card: the next play, or the end of the game. */
/** Out of a replay, whether it was asked for or started on its own. */
function onSkipReplay() {
    if (cycle.phase !== 'replay') return;
    report('skip-replay', { outcome: { playCount: cycle.playNumber } });
    uiClick();
    cycle.replayHold = 0;
    showHud(true);
    clearActions();
    // The card is about to freeze the field, so put the play at its end first.
    landReplay();
    presentResult();
}

/**
 * ANOTHER SIDE OF THE FIELD. QA ROUND TWENTY-TWO.
 *
 * The camera owns the four vantage points and what a quarter turn means; this
 * is the press. The hint goes with it, because at that point it is telling the
 * visitor something they have just done.
 */
function onSwitchView() {
    if (!replayLive()) return;
    uiClick();
    switchView();
    // Throttled in telemetry.js: this is the one button somebody taps in a row.
    report('switch-view', { kind: viewQuarter() });
}

function onNext() {
    const last = cycle.playNumber >= CFG.rules.playsPerGame;
    report('next-play', {
        kind: last ? 'summary' : 'playbook',
        outcome: { playCount: cycle.playNumber, currentScore: cycle.total },
    });
    uiClick();
    hideResult();
    const then = last ? finishGame : openPlaybook;
    /**
     * A MILESTONE SHOW PLAYS HERE, BETWEEN THE CARD AND WHATEVER COMES NEXT.
     *
     * Not at the whistle and not before the result card. QA item 7 is why: the
     * highlights used to play before the card, and the one moment somebody
     * needs to be told what happened was spent watching something without
     * knowing what it was. So the card reports the play and the new total
     * first, and the show that total has earned plays on the way out of it. On
     * the last play that means before the summary, which is where a finale
     * belongs anyway.
     */
    const due = milestoneDue(cycle.results, cycle.shown);
    if (due) {
        beginMilestone(due, then);
        return;
    }
    then();
}

/** The ten are done. */
function finishGame() {
    showHud(false);
    // THE SAVED GAME GOES WHEN THE GAME DOES. A finished ten is not
    // something to resume into, and leaving it behind would mean a visitor
    // who reloads is handed a game with no plays left in it.
    clearGame();
    // The 2D game's `finalScore` hit, plus whether it beat this browser's best.
    // Read BEFORE the summary, which is what writes a new best.
    const best = readBest();
    report('game-summary', {
        kind: cycle.total > best ? 'record' : 'played',
        outcome: {
            finalScore: cycle.total, best, orientation: orientation(),
            muted: isMuted(), games: visit.games,
        },
    });
    visit.games += 1;
    const total = cycle.total;
    showSummary(cycle.results, () => {
        report('play-again', { outcome: { finalScore: total, games: visit.games } });
        startGame();
    }, {
        onShare: (how) => report('share', { kind: how, outcome: { finalScore: total } }),
    });
}

/**
 * START A SHOW, and remember where to go when it is over.
 *
 * The HUD stays up with one button in it, Skip, which takes focus, so Enter,
 * Space and Escape all get a visitor out of it. The seed is rolled here, once,
 * so every game's fireworks are their own.
 */
function beginMilestone(level, then) {
    cycle.phase = 'show';
    report('milestone', { kind: level, outcome: { currentScore: cycle.total, playCount: cycle.playNumber } });
    const team = showUsesTeam(level);
    cycle.show = { level, t: 0, then, revealed: false, board: '', team };
    hideSpot();
    beginShow(level, { seed: Math.floor(Math.random() * 1e9), calm: reducedMotion });
    if (team) stagePlayers(level);
    showHud(true);
    showSkipShow();
    stepMilestone(0);
}

/**
 * THE PLAYERS' PART IN A SHOW: waving at the blimp, running out onto the
 * numbers, or coming out to celebrate the perfect game.
 *
 * READ WHERE THEY ARE DRAWN, THEN LET THE LAST PLAY GO. The field is still
 * showing the whistle: a party mid-celebration, a man on his back. Staging runs
 * every figure from where it is actually drawn, so dropping the tackle and the
 * party first would jump everybody back to where the simulation stopped them.
 * A man who was lying down gets up on his own, because his pitch eases back to
 * upright once nothing is holding it down.
 */
function stagePlayers(level) {
    const objects = cycle.play.game.objects;
    const men = drawnSpots(objects);
    resetTakedown();
    resetCelebration();
    cycle.tackle = { tackler: '', carrier: '' };
    cycle.party = null;
    cycle.cheer = null;
    const numerals = level === 400 ? planBulbs(turfSetup(level)).bulbs : [];
    const stage = stageTeam(level, men, { calm: reducedMotion, numerals });
    if (!stage) return;
    beginStaging(stage.spots, { delay: stage.delay, walk: stage.walk });
    if (stage.celebrate) {
        const plan = teamCelebration({ ...stage.celebrate, calm: reducedMotion });
        if (plan) beginCelebration(plan);
    }
}

/** One frame of the running show. */
function stepMilestone(delta) {
    const s = cycle.show;
    if (!s) return;
    s.t += delta;
    // A NUMBER, ALWAYS. Every shot is cached per aspect, and anything else as a
    // key misses the cache and re-solves the play camera's framing search
    // several times a frame.
    const aspect = (camera && Number(camera.aspect)) || 1.78;
    const frame = showFrame(s.level, s.t, { aspect, calm: reducedMotion });
    cycle.showShot = frame.shot;
    applyShow(frame, s.t);

    /**
     * THE MOMENT THE NUMBER LANDS, ONCE. The whistle, the star on the board,
     * the stadium staying awake from here on, and the sentence a screen reader
     * gets instead of the title, which is aria-hidden.
     */
    if (frame.reveal && !s.revealed) {
        s.revealed = true;
        playSound('whistle');
        wakeTo(s.level);
        announce(`${s.level} points. ${CFG.milestones.copy[s.level] || ''}.`);
    }

    // The board is repainted only when what it says changes, because every
    // repaint is a texture upload.
    const board = frame.board ? `${frame.board.value}:${frame.board.glow}` : '';
    if (board !== s.board) {
        s.board = board;
        paintBoard(frame.board);
    }
    setMilestoneTitle(s.level, frame.title, { calm: reducedMotion });

    // The players only move in the shows that use them. The lights and the
    // fireworks leave the field exactly as the last whistle left it.
    if (s.team && delta > 0) {
        syncFigures(cycle.play.game.objects, delta, {});
        showBall(cycle.play.game.objects, delta);
    }

    if (frame.done) endMilestone();
}

/** However the show ended, the game carries on from the same place. */
function endMilestone() {
    const s = cycle.show;
    if (!s) return;
    // A skipped show still earned what it celebrates: the star stays lit and
    // the stadium stays awake. Only the whistle is left out.
    wakeTo(s.level);
    endShow();
    hideMilestoneTitle();
    cycle.show = null;
    cycle.showShot = null;
    // Back to where the show was entered from, which is the result card having
    // been dismissed. The summary does not set a phase of its own.
    cycle.phase = 'result';
    paintBoard();
    clearActions();
    s.then();
}

/** The stadium as it stands after a show at `level`, which only ever goes up
 *  within a game. */
function wakeTo(level) {
    cycle.shown = Math.max(cycle.shown, level);
    setAwake(cycle.shown);
    paintBoard();
}

function onSkipShow() {
    if (cycle.phase !== 'show' || !cycle.show) return;
    report('skip-show', { kind: cycle.show.level });
    uiClick();
    endMilestone();
}

// ---- The opening, before the welcome card ------------------------------------------

/**
 * START THE OPENING, and remember what comes after it.
 *
 * On every page load, before the welcome card (Steve, 2026-09-15), and always
 * skippable: the HUD comes up with one button in it, Skip, which takes focus, so
 * Enter, Space and Escape all get a visitor out. A tap on the field does NOT,
 * because Earth Defense's playtesters tapped through its opening by accident
 * and nobody here has to find that out again.
 */
function beginOpening(then) {
    cycle.phase = 'opening';
    const aspect = (camera && Number(camera.aspect)) || 1.78;
    // THE CAST IS THE FORMATION ALREADY LINED UP BEHIND THE WELCOME CARD, and
    // every path in the script ends on it. Benched men sit it out, as in play.
    const men = cycle.play.game.objects
        .filter((o) => o.settings.position !== 'ball' && !o.settings.benched)
        .map((o) => {
            const at = simToWorld(o.coords.x, o.coords.y, 0);
            return { position: o.settings.position, team: o.settings.team, x: at.x, z: at.z };
        });
    const plan = planOpening(men, { aspect, calm: reducedMotion });
    cycle.opening = { t: 0, then, spoken: false, plan, cheered: 0 };
    // Nobody is carrying anything yet: the quarterback is running out with the
    // rest of them. `endOpening` puts the ball back under centre.
    const ball = getBall();
    if (ball) ball.visible = false;
    hideSpot();
    initOpeningProps(scene);
    report('opening', { kind: reducedMotion ? 'calm' : 'full' });
    showHud(true);
    // ONLY THE WAY OUT IS ON SCREEN. The bar reports a play count, a score and
    // a mute button over an intro that has not started a game yet (QA,
    // 2026-09-22). `endOpening` puts it back.
    showHudBar(false);
    showSkipOpening();
    stepOpening(0);
}

/** One frame of the opening. */
function stepOpening(delta) {
    const s = cycle.opening;
    if (!s) return;
    s.t += delta;
    const aspect = (camera && Number(camera.aspect)) || 1.78;
    const frame = openingFrame(s.t, { aspect, calm: reducedMotion });
    cycle.openingShot = frame.shot;
    setOpeningTitle(frame.title, { calm: reducedMotion });

    // THE MEN, where the script has them, drawn through the same pose path as
    // a celebration. The figures' own clocks only move when time does.
    setScripted(castAt(s.plan, s.t));
    if (delta > 0) syncFigures(cycle.play.game.objects, delta, {});
    // ...and the cooler, which is the thing they came for.
    applyOpeningProps(propsAt(s.plan, s.t, splashBuffer()));

    // AND THE STANDS, each cheer once as its moment passes. A calm opening
    // gets none: `cheerCrowd` already refuses a cheer to anybody who asked not
    // to be moved about.
    const cheers = CFG.opening.cheers;
    while (s.cheered < cheers.length && s.t >= cheers[s.cheered].at) {
        const c = cheers[s.cheered];
        cheerCrowd({ team: c.team, big: c.big }, state.elapsed, { calm: reducedMotion });
        s.cheered += 1;
    }
    if (frame.speak && !s.spoken) {
        s.spoken = true;
        announce(CFG.opening.copy.spoken);
    }
    if (frame.done) endOpening();
}

/**
 * HOWEVER IT ENDED, THE WELCOME STATE IS THE SAME ONE. Watched to the end or
 * skipped on its first frame, the card comes up over the play camera with the
 * HUD put away, exactly as it did before there was an opening.
 */
function endOpening() {
    const s = cycle.opening;
    if (!s) return;
    cycle.opening = null;
    cycle.openingShot = null;
    hideOpeningTitle();
    // BACK TO THE FORMATION, PLACED, with a few quiet frames so the arms come
    // down and the quarterback gets back over the ball before the card is up.
    // Watched to the end they are already there; skipped, this is the cut.
    resetScripted();
    hideOpeningProps();
    cheerCrowd(null, state.elapsed);
    const objects = cycle.play.game.objects;
    for (let i = 0; i < CFG.opening.settleFrames; i += 1) {
        syncFigures(objects, 1 / 30, { presnap: true });
    }
    showBall(objects, 0);
    clearActions();
    showHudBar(true);
    showHud(false);
    cycle.phase = 'welcome';
    s.then();
}

function onSkipOpening() {
    if (cycle.phase !== 'opening' || !cycle.opening) return;
    report('skip-opening', { seconds: cycle.opening.t });
    uiClick();
    endOpening();
}

// ---- QA: play any milestone show from the console -----------------------------

/**
 * WHETHER THE CONSOLE HOOK IS INSTALLED: on a local server, or anywhere with
 * `?qa` in the address, so a show can be checked on a phone against production
 * without it sitting on `window` for every visitor.
 */
export function qaEnabled(href = '') {
    try {
        const url = new URL(href);
        return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.searchParams.has('qa');
    } catch {
        return false;
    }
}

/**
 * The phases a show may be started from, and where it hands back to: between
 * plays, never during one. Not before the snap, because a line-up the show
 * walks everybody away from would have to be called again, and calling a play
 * is what counts one.
 */
const QA_PHASES = { playbook: () => openPlaybook, result: () => presentResult };

/**
 * PLAY THE SHOW FOR `level` NOW, as if the score had just reached it.
 *
 * Returns a sentence for the console rather than throwing, because that is
 * where it is read. The show wakes the stadium exactly as a real one does (the
 * star, the blimp, the full stands), and it counts as seen, so the real one does
 * not play again later in the same game. A new game puts everything back.
 */
export function qaShow(level) {
    if (cycle.phase === 'opening') return 'Not during the opening. Skip it first.';
    const built = CFG.milestones.built;
    const wanted = Number(level);
    if (!built.includes(wanted)) return `Choose one of ${built.join(', ')}.`;
    const back = QA_PHASES[cycle.phase];
    if (!back) {
        return cycle.phase === 'welcome'
            ? 'Take the field first, then call this while the playbook is open.'
            : `Not during "${cycle.phase}". Try again while the playbook or a result card is open.`;
    }
    hidePlaybook();
    hideResult();
    clearActions();
    beginMilestone(wanted, back());
    return `Playing the ${wanted} show.`;
}

/**
 * PLAY THE OPENING AGAIN, from the welcome card or the playbook, and go back to
 * wherever it was called from.
 */
export function qaOpening() {
    if (cycle.phase === 'welcome' && cycle.welcome) {
        hideWelcome();
        beginOpening(cycle.welcome);
        return 'Playing the opening.';
    }
    if (cycle.phase === 'playbook' && !cycle.reading) {
        hidePlaybook();
        beginOpening(openPlaybook);
        return 'Playing the opening.';
    }
    return `Not during "${cycle.phase}". Try again from the welcome card or the playbook.`;
}

/**
 * DRESS THE TEAMS AND THE FIELD FROM THE CONSOLE, until the Team colors card
 * exists, and keep it: `xo.colors({ x: '#4b2e83', o: '#ffb612', field: '#0033a0' })`,
 * with `xHelmet` and `oHelmet` for a helmet of its own (null to follow the jersey
 * again), `xo.colors('reset')` for the game's own, and `xo.colors()` to read what
 * is set. The answer includes any warning the card would show.
 */
export function qaColors(change) {
    if (change === 'reset') resetColors();
    else if (change && typeof change === 'object') {
        const team = (jersey, helmet) => ({
            ...(jersey !== undefined ? { jersey } : {}),
            ...(helmet !== undefined ? { helmet } : {}),
        });
        setColors({
            teams: { 0: team(change.x, change.xHelmet), 1: team(change.o, change.oHelmet) },
            ...(change.field !== undefined ? { field: change.field } : {}),
        });
    }
    if (change !== undefined) {
        applyColors();
        saveColors();
    }
    return JSON.stringify({ ...teamColors(), warnings: warningsFor().map((w) => w.text) });
}

/** Put the colors colors.js holds on everything that wears them now. The cooler,
 *  the card stunt and the fireworks ask for themselves when they are drawn. */
function applyColors({ teams = true, field = true } = {}) {
    if (teams) {
        applyTeamColors();
        applyCrowdColors();
    }
    if (field) applyFieldColors();
    // The rings follow both: a team's jersey, and whether the field is close
    // enough to it to need a dark edge.
    applyMarkerColors();
}

function installQaHook() {
    if (typeof window === 'undefined' || !qaEnabled(window.location && window.location.href)) return;
    window.xo = Object.freeze({
        show: qaShow, opening: qaOpening, colors: qaColors, levels: [...CFG.milestones.built],
    });
}

/** A fresh ten. */
function startGame() {
    cycle.playNumber = 0;
    cycle.viewPlay = -1;
    cycle.total = 0;
    cycle.results = [];
    cycle.lastOutcome = null;
    cycle.streak = 0;
    clearGame();
    hideSummary();
    hideResult();
    setScore(0);
    // A new game is a dark stadium again, with nothing on the board to show.
    cycle.shown = 0;
    setAwake(0);
    paintBoard();
    openPlaybook();
}

/**
 * PICK UP WHERE THEY LEFT OFF (QA item 10).
 *
 * Only the scoreboard is restored, because only the scoreboard was saved: the
 * next thing that happens is the playbook, which is exactly where somebody who
 * has just finished play four should be. See progress.js for why a play in
 * flight is deliberately not resumable.
 */
function resumeGame(saved) {
    cycle.playNumber = saved.playNumber;
    // A resumed game has no replay to go back to, so nothing is remembered
    // about how the last one was watched.
    cycle.viewPlay = -1;
    cycle.total = saved.total;
    cycle.results = saved.results;
    cycle.lastOutcome = null;
    // REBUILT FROM THE PLAYS RATHER THAN STORED, so a resumed game cannot come
    // back with a run that disagrees with the results behind it, and the save
    // shape does not have to change (which would discard every game in
    // progress on the version bump).
    cycle.streak = streakOver(cycle.results, CFG.difficulty);
    // ...AND SO IS HOW AWAKE THE STADIUM IS. Every show this game has reached
    // counts as played, including one somebody reloaded before seeing: a show
    // that turned up out of nowhere on the way into play five, with no card in
    // front of it saying what it was for, is the fault QA item 7 was about.
    cycle.shown = milestoneDue(cycle.results, 0);
    setAwake(cycle.shown);
    hideSummary();
    hideResult();
    setPlayNumber(cycle.playNumber, CFG.rules.playsPerGame);
    setScore(cycle.total);
    paintBoard();
    openPlaybook();
}

/**
 * START OVER (QA item 11).
 *
 * Reachable from the playbook, which is where somebody between plays already
 * is, and confirmed there rather than here: the button asks twice, because with
 * a game now saved across reloads an accidental press costs something real.
 */
function onStartOver() {
    report('start-over', { outcome: { playCount: cycle.playNumber, currentScore: cycle.total } });
    uiClick();
    clearGame();
    startGame();
}

/**
 * THE SOUND OF PRESSING SOMETHING, which is what the `snap` sample always was.
 *
 * The 2D game plays it when a play is chosen off the playbook, and this scene
 * had it under the hike instead. It belongs on the CHROME: the playbook, the
 * result card, the replay controls. Deliberately NOT on the three in-play
 * controls, because a snap, a throw and a keeper each have a sound of their own
 * and a click on top of them is a click on top of the game.
 *
 * It unlocks the library on the way through, so the first press a visitor makes
 * is also the gesture the browser wants before any audio at all.
 */
function uiClick() {
    unlockAudio();
    playSound('snap');
}

/**
 * START A TACKLE, AND SOUND IT ON THE FRAME THE TWO OF THEM MEET.
 *
 * THE GRUNT WAS A SECOND LATE AND THIS IS WHY. It used to play from
 * `finishPlay`, which runs after the entire settle hold, so a play that ended
 * in a tackle sounded its own contact once the carrier was already flat on the
 * grass. QA heard exactly that.
 *
 * Contact is not the start of the dive either: the tackler crosses the gap on
 * an easing curve, so `takedown.contactFraction` solves the moment the closing
 * gap first reaches a body width and that is what the sample is delayed by.
 * `play` takes milliseconds, and the whole thing is a tenth of a second or two,
 * which is the difference between a hit and a sound effect.
 *
 * ONE FUNCTION FOR BOTH CALLERS, because the live whistle and the end of a
 * replay start the same tackle and had no reason to disagree about it.
 */
function startTakedown(objects, tacklerPos, carrierPos, from = 0) {
    if (!beginTakedown(tacklerPos, carrierPos, from)) return false;
    const at = (position) => {
        const o = objects.find((x) => x.settings.position === position);
        return o ? simToWorld(o.coords.x, o.coords.y, 0) : null;
    };
    const one = at(tacklerPos);
    const two = at(carrierPos);
    const gap = one && two ? Math.hypot(two.x - one.x, two.z - one.z) : 0;
    // NOT WHEN IT IS HANDED OVER ALREADY LANDED. `from` above the moment of
    // contact means this tackle has notionally already happened, which is a
    // skipped replay catching up, and a grunt for a hit nobody watched is a
    // noise from nowhere.
    const hit = contactFraction(gap) * CFG.pose.takedown.dive;
    if (from < hit) playSound('grunt', (hit - from) * 1000);
    return true;
}

/**
 * LEAVE A REPLAY ON THE PICTURE IT WAS GOING TO END ON.
 *
 * SKIPPING ONE USED TO FREEZE THE FIELD MID-PLAY. `startReplay` drops the
 * tackle and the party so the second look can begin at the snap, and the replay
 * branch above puts them back when the playhead RUNS OUT. A visitor who presses
 * Skip never reaches that line: `presentResult` sets the phase to `result`,
 * `stepCycle` returns on it, and `syncFigures` is never called again. So the
 * result card opened over whatever half-second of the play the playhead happened
 * to be on, with two men standing up and nobody tackled, which is exactly what a
 * whistle is not. Reported from a screenshot of a completed pass.
 *
 * So the skip lands the play itself rather than only the card: the playhead goes
 * to the last recorded frame, which is the whistle, and the tackle and the party
 * are handed over AT THEIR END rather than at their start, because nothing is
 * going to step their clocks. One `syncFigures` with no time in it draws that
 * frame, and it is the same picture the live whistle leaves behind its own card.
 */
function landReplay() {
    // Run the playhead out. The recording stops at the whistle, so its last
    // frame is where the play actually finished.
    advance(frameCount(), CFG.simHz, 1);
    const objs = frameAt(playheadFrame(), teamOfPosition);
    if (cycle.tackle.tackler) {
        startTakedown(objs, cycle.tackle.tackler, cycle.tackle.carrier,
            takedownLength());
    }
    if (cycle.party) beginCelebration(cycle.party, celebrationLength(cycle.party));
    // The stands were sat down by `startReplay` and the whistle is the frame
    // they went up on, so they go up here too rather than staying silent.
    if (cycle.cheer && !cycle.cheered) {
        cycle.cheered = true;
        cheerCrowd(cycle.cheer, state.elapsed, { calm: reducedMotion });
    }
    syncFigures(objs, 0, { live: false });
    showBall(objs, 0);
}

/** Advance the play cycle. Kept apart from rendering so the whole thing is one
 *  readable state machine rather than a pile of conditions in the frame loop. */
function stepCycle(delta) {
    if (!cycle.play) return;
    if (cycle.phase === 'opening') {
        stepOpening(delta);
        return;
    }
    if (cycle.phase === 'playbook' || cycle.phase === 'welcome') {
        // The field simply holds its last frame behind the overlay. Nothing
        // ticks, so a visitor reading the playbook is not burning a phone
        // battery on a simulation nobody is watching.
        return;
    }
    if (cycle.phase === 'result') return;

    // A milestone show. Nothing on the field ticks: the players stand where the
    // last play left them while the stadium does the moving.
    if (cycle.phase === 'show') {
        stepMilestone(delta);
        return;
    }

    if (cycle.phase === 'replay') {
        const done = advance(delta, CFG.simHz, CFG.camera.replay.speed);
        const objs = frameAt(playheadFrame(), teamOfPosition);
        // A replay is a live play until the playhead runs out. After that the
        // last frame simply repeats, and a receiver holding his hands up over
        // a play that finished two seconds ago is asking for nothing.
        syncFigures(objs, delta, { live: !done });
        // Before the throw there is no ball object, so it rides in the
        // quarterback's hands exactly as it does in the live play. The
        // recording does not store who is carrying, because before a throw it
        // is always the quarterback and after one the ball has its own slot.
        showBall(objs, delta);
        if (done) {
            // THE REPLAY ENDS ON THE SAME TACKLE THE PLAY DID. The recording
            // stops at the whistle, which is where the hit starts, so it is
            // started here from the pair decided at the whistle. Positions,
            // not objects, precisely so this works on a rebuilt frame.
            if (cycle.tackle.tackler && takedownClock() < 0) {
                startTakedown(objs, cycle.tackle.tackler, cycle.tackle.carrier);
            }
            /**
             * AND IT ENDS ON THE SAME CELEBRATION TOO, FOR THE SAME REASON.
             *
             * The recording stops at the whistle, which is where both of these
             * begin, so a replay that simply ran out would show a pick and then
             * a field of men standing still: the reaction the live play had
             * would be the one thing missing from the second look at it. The
             * PLAN is reused rather than rolled again, so it is the same party
             * with the same dance, which is what makes it read as a replay of
             * something rather than as decoration.
             */
            if (cycle.party && celebrationClock() < 0) beginCelebration(cycle.party);
            // AND THE STANDS GO UP AGAIN, on the frame the recording reaches
            // the whistle, which is the frame they went up in the live play.
            if (cycle.cheer && !cycle.cheered) {
                cycle.cheered = true;
                cheerCrowd(cycle.cheer, state.elapsed, { calm: reducedMotion });
            }
            // Hold the last frame for a beat before the card, so the replay
            // ends on a composition rather than cutting away mid-motion.
            cycle.replayHold += delta;
            // THE LONGER OF THE TWO, NOT THEIR SUM. A sack has both, and its
            // party's length already has the tackle inside it as its wait, so
            // adding them held the card back by a whole takedown. The other
            // endings only ever have one or the other.
            const hold = CFG.camera.replay.holdEnd + Math.max(
                cycle.tackle.tackler ? takedownLength() : 0,
                cycle.party ? celebrationLength(cycle.party) : 0
            );
            if (cycle.replayHold >= hold) {
                showHud(true);
                clearActions();
                presentResult();
            }
        }
        return;
    }

    cycle.held += delta;

    if (cycle.phase === 'presnap') {
        // Waiting on the snap. The formation holds, nothing ticks, and every
        // player faces the other team (QA item 12).
        syncFigures(cycle.play.game.objects, delta, { presnap: true });
        showBall(cycle.play.game.objects, delta);
        return;
    }
    if (cycle.phase === 'live') {
        // Fixed 60Hz steps, however fast the display runs. Capped so a tab
        // that was backgrounded for a minute does not try to catch up on
        // three thousand frames at once.
        // WHO IS IN THE AIR, CARRIED ACROSS BEFORE THE STEPS THAT CARE.
        //
        // The view decided it on the LAST frame, from the ball's real drawn arc
        // against a receiver's real reach, which is a better answer than
        // anything the simulation has. One rendered frame of lag against a jump
        // that lasts 0.62 seconds is not a thing anybody can see, and it is the
        // only order that can work: the view cannot know where the ball is
        // drawn until it has drawn it.
        markAirborne(cycle.play, airborne());
        cycle.accumulator = Math.min(cycle.accumulator + delta, 0.25);
        while (cycle.accumulator >= SIM_STEP) {
            tick(cycle.play);
            record(cycle.play.game.objects);
            cycle.accumulator -= SIM_STEP;
        }
        /**
         * THE CLOCK IS READ FROM THE SIMULATION, NEVER COUNTED HERE.
         *
         * `decisionLeft` is derived from `play.frame`, which is the same clock
         * the whistle is raised on, so the number the visitor watches reach zero
         * IS the number that ends the play. A second countdown kept in the
         * render loop would drift against it on any frame the accumulator does
         * not step, and the visitor would watch a nought sit there for a frame
         * or two before anything happened, or worse, be sacked on nine.
         *
         * It returns null once he has thrown it or tucked it, and `setClock`
         * puts the readout away rather than freezing a number on screen that is
         * no longer counting anything.
         */
        const left = decisionLeft(cycle.play);
        setClock(left);
        /**
         * ...AND THE BOARD, WHICH FREEZES RATHER THAN EMPTYING.
         *
         * The HUD readout is put away the moment he decides, because it sits in
         * a row of controls and an inert number there is clutter. A SCOREBOARD
         * is not a control: a column that blanks itself mid-play makes the whole
         * board jump, and a real play clock stops on the number it stopped at
         * rather than clearing. So the board keeps the last value it was given
         * and the panel stays put.
         *
         * Repainting is a canvas redraw and a texture upload, so it happens only
         * when the DISPLAYED second changes rather than on every frame.
         *
         * ...EXCEPT ON THE ONE ENDING THE CLOCK ITSELF CAUSED, WHICH IS ZERO.
         * The whistle for time is raised inside the same simulation step that
         * reaches zero, so `decisionLeft` is already answering for a finished
         * play by the time it is asked and the board held the last number it
         * had, which was one. A countdown that stops on one is a countdown
         * nobody trusts (QA item 1). `play.expired` says the clock is what
         * ended it, and a clock that ended a play reads zero.
         */
        const shown = clockReading(left, cycle.clockShown, cycle.play.expired);
        if (shown !== cycle.clockShown) {
            cycle.clockShown = shown;
            paintBoard();
        }

        // The simulation blows its own whistle, and out of time is one of its
        // own whistles now. A timeout is still only a backstop.
        if (isDone(cycle.play) || cycle.held >= PLAY_TIMEOUT) beginSettle();
    } else if (cycle.held >= cycle.settleFor) {
        finishPlay();
        return;
    }

    syncFigures(cycle.play.game.objects, delta, { live: cycle.phase === 'live' });
    showBall(cycle.play.game.objects, delta);
}

/**
 * DRAW THE BALL, WHEREVER IT IS, AND THE SAME WAY EVERY TIME.
 *
 * THIS EXISTS BECAUSE THE LIVE PLAY AND THE REPLAY HAD DIFFERENT ANSWERS. The
 * replay path found the ball object and handed it over; both live paths passed
 * a hard-coded `null` and only ever offered a CARRIER. So from the moment the
 * quarterback let go until somebody caught it, nobody was carrying, and the
 * ball was simply switched off. It was reported twice as "the ball is not
 * visible in the air", and the arc was visible in the replay the whole time,
 * which is exactly the shape of a bug that lives in one caller and not the
 * other. One function, three call sites, no room for them to disagree again.
 *
 * A CATCH ENDS THE FLIGHT. The ball object stops where it was caught and keeps
 * its coordinates, so a replay that only asks "is there a ball object" goes on
 * drawing it lying on the turf while the receiver who caught it runs away
 * empty-handed. Whoever has `hasBall` wins, and the flying object is only used
 * when nobody does.
 */
export function showBall(objects, delta) {
    const carrier = objects.find((o) => o.state && o.state.hasBall && !o.settings.benched);
    if (carrier) { syncBall(null, carrier, delta); return 'carried'; }

    const flying = objects.find((o) => o.settings.position === 'ball'
        && !o.settings.benched && (o.coords.x || o.coords.y));
    if (flying) { syncBall(flying, null, delta); return 'flying'; }

    // Before the snap and before a throw there is no ball object at all, so it
    // rides in the quarterback's hands. The recording does not store who is
    // carrying, because until a throw it is always him.
    const qb = objects.find((o) => o.settings.position === 'qb') || null;
    syncBall(null, qb, delta);
    return qb ? 'carried' : 'none';
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
    const at = cycle.phase === 'result' ? cycle.bandAt : bandPoint();
    const lit = !!at && BAND_PHASES.has(cycle.phase);
    setBandAt(lit ? at.x : 0, lit);
    fadeBand(delta);
}

/**
 * WHERE THE BAND SHOULD LIGHT, OR NULL FOR NOWHERE.
 *
 * NOT THE SAME QUESTION AS "WHERE IS THE BALL", WHICH IS WHAT IT USED TO ASK.
 * The band paints what the ball is WORTH, and the ladder only pays the offense:
 * an interception is minus ten wherever it happens. So a defender carrying the
 * ball into the 50 band used to light the 50 band, which tells a visitor they
 * have just scored fifty points for throwing a pick. Reported from the
 * recording, where it is most visible, because a replay follows the man who
 * intercepted it all the way back.
 *
 * THE SPOT IS DELIBERATELY NOT GATED THE SAME WAY. It marks where the play
 * finished, and where an interception happened is a true and useful thing to
 * show. It is the SCORING band that would be lying.
 */
function bandPoint() {
    if (cycle.phase === 'replay') {
        const f = replayFocus();
        return f && litFor(f.holder) ? simToWorld(f.x, f.y, 0) : null;
    }
    if (!cycle.play) return null;
    const carrier = ballCarrier(cycle.play);
    return carrier && litFor(carrier.settings.position)
        ? simToWorld(carrier.coords.x, carrier.coords.y, 0) : null;
}

/**
 * Does the man holding the ball light the band he is standing in?
 *
 * ONE RULE, ASKED THE SAME WAY BY BOTH BRANCHES, and taking a position rather
 * than a team so the live play and the recording can answer it identically:
 * playback rebuilds objects from six floats and stores positions, not teams,
 * because a position's team never changes.
 *
 * Empty means nobody is holding it, which is a ball in the air or on the
 * grass, and neither lights anything.
 */
export function litFor(position) {
    return !!position && teamOfPosition(position) === 0;
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
    // The stadium's own clock: after 300 the blimp is always up there.
    tickAwake(state.elapsed);
    setDriver(driverForPhase(cycle.phase));
    // THE CAMERA HOLDS STILL UNDER THE RULES CARD, for the reason the welcome
    // card gets the still camera: a slide behind reading matter is a moving
    // background. It is the idle dolly's CLOCK that stops, not its driver, so
    // the shot freezes exactly where it was and resumes from there. Swapping
    // to the play camera would cut once on the way in and once on the way out.
    applyCamera(updateCamera(cycle.reading ? 0 : delta, cameraState()));
    // THE PLAYERS IN THE TEAM COLORS CARD GO FIRST, because they borrow a
    // corner of this frame's buffer and the main render below clears it.
    // Drawn after, the frame would be shown with a player in the corner.
    if (colorsCardOpen()) drawColorsPreviews(renderer, state.elapsed, { calm: reducedMotion });
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
 * candidate is projected to screen space and the nearest one wins. That costs
 * five projections rather than a scene traversal, and it cannot be fooled by a
 * figure standing in front of another.
 *
 * AND THE NEAREST ONE WINS OUTRIGHT, WITH NO RADIUS AT ALL, which is QA round
 * twenty-seven item 7 and is the 2D game's own rule: `handleCanvasTap` asks
 * `getClosestTeamObjectToPosition` for the nearest of the quarterback and the
 * four receivers and throws to whoever comes back.
 *
 * There WAS a radius here, 52 pixels, and a tap outside every one of them did
 * nothing at all. That is the report: "I clicked pretty close to the receiver
 * and the ball was never thrown". A radius is the right idea when a gesture has
 * more than one meaning, and in this phase it has exactly one. The visitor is
 * choosing between five men, the whole screen belongs to that choice, and a
 * press that lands in a gap between two of them meant one of the two.
 *
 * It matches the phase before it, where tapping anywhere at all snaps the ball,
 * so the canvas answers every press rather than swallowing some of them.
 */
const projected = { v: null };

/**
 * WHERE A PLAYER CAN BE TAPPED, AND IT IS FOUR PLACES, NOT ONE.
 *
 * This tested a single point at chest height, which is a strange thing to ask a
 * finger to find: a figure is 3.85m tall, so the head and the feet are each
 * well outside a fingertip of the middle of him once the camera is raked over.
 * And the LETTER TAG, which is the thing actually labelled A or B and the most
 * obvious thing on the field to press, sits 1.2m in FRONT of his feet (D59) and
 * was never a target at all. Pressing the disc marked B did nothing, which is
 * the one gesture the marker exists to invite.
 *
 * Four probes and the nearest wins, so the whole player is live from his helmet
 * to the letter under him. It costs four projections per candidate rather than
 * one, on at most five candidates, once per tap.
 */
function tapProbes(figure) {
    const s = CFG.figureScale;
    const ahead = markerGeometry().tagOffset;
    return [
        [figure.position.x, 0.95 * s, figure.position.z],            // chest
        [figure.position.x, 1.58 * s, figure.position.z],            // helmet
        [figure.position.x, 0.05, figure.position.z],                // the ring
        [figure.position.x - ahead, 0.05, figure.position.z],        // the letter
    ];
}

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

/**
 * LOOKING ROUND A REPLAY. QA ITEM 4, AND ROUND TWENTY-TWO.
 *
 * A replay is a directed shot, and the visitor's adjustment is an OFFSET on top
 * of it rather than a takeover: the camera goes on establishing, tracking and
 * settling, and their adjustment rides along. camera.js owns the arithmetic and
 * the limits, and this is only the gestures.
 *
 * THE ORBIT WAS A DRAG AND IS NOW A BUTTON. QA: "too hard to control", which it
 * was, and the reason is that a one-finger drag asks somebody to fly a camera
 * around a moving subject while watching something else. Four fixed vantage
 * points, one press each, and nothing to get wrong. See `switchView` and
 * `onSwitchView`. What is left here is the ZOOM, which was the half of it that
 * worked: a pinch and a wheel are one gesture with one meaning.
 *
 * IT COSTS NOTHING ELSE, because a replay is the one phase with nothing on the
 * field to press. Outside it, every pointer on this canvas is still a tap that
 * snaps the ball or throws to somebody.
 */
const drag = { points: new Map(), spread: 0 };
const ZOOM_PER_KEY = 1.12;
/** A wheel notch is about 100 in `deltaY` on a mouse and a few units on a
 *  trackpad, so it is capped rather than scaled: one gesture, one step. */
const ZOOM_PER_NOTCH = 1.1;

function replayLive() {
    return cycle.phase === 'replay';
}

/** How far apart two fingers are, or 0 when there are not two. */
function spreadOf() {
    if (drag.points.size !== 2) return 0;
    const [a, b] = [...drag.points.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function onCanvasDragStart(event) {
    if (!replayLive()) return;
    drag.points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    drag.spread = spreadOf();
    if (event.target && event.target.setPointerCapture) {
        try { event.target.setPointerCapture(event.pointerId); } catch (e) { /* fine */ }
    }
}

function onCanvasDragMove(event) {
    if (!replayLive() || !drag.points.has(event.pointerId)) return;
    drag.points.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // TWO FINGERS PINCH AND ONE FINGER DOES NOTHING. One finger used to orbit,
    // and a single finger left free is not an oversight: it is what stops a
    // pinch that drifts from also swinging the camera, and there is nothing on
    // the field to press during a replay anyway.
    if (drag.points.size < 2) return;
    const spread = spreadOf();
    if (drag.spread > 0 && spread > 0) {
        event.preventDefault();
        nudgeView({ zoom: drag.spread / spread });
    }
    drag.spread = spread;
}

function onCanvasDragEnd(event) {
    drag.points.delete(event.pointerId);
    drag.spread = spreadOf();
}

function onCanvasWheel(event) {
    if (!replayLive()) return;
    event.preventDefault();
    nudgeView({ zoom: event.deltaY > 0 ? ZOOM_PER_NOTCH : 1 / ZOOM_PER_NOTCH });
}

/**
 * AND FROM THE KEYBOARD, because a scene whose only route into a feature is a
 * pointer gesture has no keyboard story at all, and no test would say so.
 */
function onReplayKey(event) {
    if (!replayLive() || event.metaKey || event.ctrlKey || event.altKey) return;
    // THE ARROWS WALK THE FOUR VIEWS. They used to orbit by a fixed step, which
    // was the keyboard's copy of the drag QA could not control. Stepping
    // between the same four the button offers means the two routes into the
    // feature land in the same places, rather than the keyboard having its own
    // private camera.
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        switchView(event.key === 'ArrowRight' ? 1 : -1);
        return;
    }
    const zooms = {
        '+': 1 / ZOOM_PER_KEY,
        '=': 1 / ZOOM_PER_KEY,
        '-': ZOOM_PER_KEY,
        _: ZOOM_PER_KEY,
    };
    const zoom = zooms[event.key];
    if (!zoom) return;
    event.preventDefault();
    nudgeView({ zoom });
}

function onCanvasPointer(event) {
    // TAPPING ANYWHERE SNAPS IT (QA item 8). Before the snap there is exactly
    // one thing a visitor can do, the whole field is a picture of them waiting
    // to do it, and asking a finger to find the quarterback among seventeen
    // figures is a hunt for no reason. The quarterback stays tappable because
    // he is still the one under the finger most of the time, and the marker
    // under him still breathes, so the gesture the 2D game taught still works.
    if (cycle.phase === 'presnap') {
        event.preventDefault();
        onSnap();
        return;
    }

    const targets = tapTargets();
    if (!targets.length) return;

    let best = null;
    for (const target of targets) {
        const figure = figureFor(target.position);
        if (!figure || !figure.visible) continue;
        for (const [x, y, z] of tapProbes(figure)) {
            const at = toScreen(x, y, z);
            if (!at) continue;
            const d = Math.hypot(at.x - event.clientX, at.y - event.clientY);
            if (!best || d < best.d) best = { d, target };
        }
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

    // TAG EVERY PING, THEN SOLVE THE PUZZLE, the way every other scene starts.
    // The proof-of-work hash is what ties one visitor's hits together, and it
    // is reused from sessionStorage when a still-valid one is there, so this
    // costs a few milliseconds on a cold visit and nothing on a warm one. It
    // resolves rather than rejects when it cannot solve one, which degrades to
    // an untagged ping rather than to a page that never loads.
    setMobile(isTouch());
    const proof = await getProofOfWork(CFG.telemetry.proofOfWork);
    setProofHash(proof && proof.hash);

    setProgress(0.15, 'Preparing the field…');
    initRenderer(canvas);
    initSceneGraph();
    const lights = initLighting();

    setProgress(0.5, 'Painting the lines…');
    // THE VISITOR'S COLORS FIRST, before anything that wears them is built: the
    // fans are seated with the field, the roster and the rings come next, and
    // the opening that plays straight after must already be in them.
    loadColors();
    initField(scene);
    // After the field, because the shows switch its lamp banks.
    initSpectacle(scene, lights);

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
    // The formation idling behind the playbook is a pre-snap formation, so it
    // faces the other team and the quarterback waits under centre.
    syncFigures(objects, 0, { presnap: true });
    showBall(objects, 0);

    initAudio();

    setProgress(0.85, 'Opening the playbook…');
    // THE HUD IS WIRED FIRST, AND THE ORDER IS LOAD BEARING. The playbook asks
    // hud.js to build its sound button (QA round twenty-seven item 3), and
    // hud.js can only build one once it has been handed `isMuted` and
    // `onToggleMute`. Built the other way round it silently makes no button at
    // all, which is a missing control rather than an error.
    initHud({
        onSnap, onThrow, onRun, onNext, onChangePlay,
        onReplay: startReplay,
        onSkipReplay,
        onSkipCelebration,
        onSkipShow,
        onSkipOpening,
        onSwitchView,
        onToggleMute: () => {
            toggleMuted();
            report('sound', { kind: isMuted() ? 'off' : 'on' });
        },
        isMuted,
    });
    initPlaybook(onPlaybookChoice, onStartOver, {
        defense: (slug) => report('set-defense', { kind: slug || 'random' }),
        // The welcome card again, from "How to play". `back` puts the book
        // where it was, including a change of play still waiting to be kept.
        help: (back) => {
            report('how-to-play', { outcome: { playCount: cycle.playNumber } });
            uiClick();
            cycle.reading = true;
            showHelp(() => {
                cycle.reading = false;
                back();
            });
        },
        // THE TEAM COLORS CARD, the same arrangement: the book steps aside and
        // the camera holds still while the visitor is choosing.
        colors: (back) => {
            uiClick();
            cycle.reading = true;
            showColorsCard(() => {
                cycle.reading = false;
                back();
            });
        },
    });
    initColorsCard({
        apply: ({ teams, field }) => applyColors({ teams, field }),
        report,
        announce,
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
    // A, B, C, D throw, Q, S or the space bar snaps, K keeps it. They press the
    // buttons that are on screen rather than calling the game, so they can
    // never offer something the visitor cannot see (see hud.js).
    initKeys(signal);

    window.addEventListener('resize', onResize, { signal });
    // Tapping a player is the 2D game's own control. The HUD buttons remain
    // the keyboard and screen reader route, so nothing here is the only way
    // to reach anything.
    canvas.addEventListener('pointerdown', onCanvasPointer, { signal });
    // The replay's own look-around. Separate handlers rather than more branches
    // inside the tap, because a drag and a tap are different gestures and only
    // one of them exists during a replay.
    canvas.addEventListener('pointerdown', onCanvasDragStart, { signal });
    canvas.addEventListener('pointermove', onCanvasDragMove, { signal });
    canvas.addEventListener('pointerup', onCanvasDragEnd, { signal });
    canvas.addEventListener('pointercancel', onCanvasDragEnd, { signal });
    canvas.addEventListener('wheel', onCanvasWheel, { signal, passive: false });
    document.addEventListener('keydown', onReplayKey, { signal });
    // THE WELCOME CARD COMES FIRST, and only on arrival. "Play again" from the
    // summary goes straight back to the playbook, because somebody who has
    // just finished ten plays does not need the rules again.
    //
    // A GAME LEFT UNFINISHED IS OFFERED BACK on the same card rather than
    // resumed silently. Somebody returning to a tab they left open an hour ago
    // needs to be told they are four plays into something before the playbook
    // opens on play five, and one entry point is simpler to reason about than
    // two. The card just changes what its button says.
    const saved = readGame();
    // THE FIRST PRESS IN THE GAME, and the gesture every browser wants before
    // it will play anything at all. Wrapped so the welcome card sounds like the
    // rest of the chrome and so the library is awake by the playbook.
    const takeTheField = (action, go) => () => {
        report(action, { outcome: { orientation: orientation(), muted: isMuted() } });
        uiClick();
        go();
    };
    cycle.welcome = () => showWelcome(
        saved ? takeTheField('resume-game', () => resumeGame(saved))
            : takeTheField('take-field', startGame),
        saved,
        takeTheField('new-game', startGame)
    );
    // ...AFTER THE OPENING, on every load, a resumed game included. See
    // `beginOpening`.
    beginOpening(cycle.welcome);

    // ON THE RECORD FROM HERE, before anybody has pressed anything, so the
    // count includes the visitors who read the rules and left.
    report('session-start', {
        kind: isTouch() ? 'touch' : 'desktop',
        outcome: { orientation: orientation(), resumable: !!saved, muted: isMuted() },
    });
    visit.start = Date.now();
    // The visit ends when the page is hidden, which is the one signal a phone
    // reliably sends, or on pagehide as the backup. `endVisit` runs once.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') endVisit();
    }, { signal });
    window.addEventListener('pagehide', endVisit, { signal });
    // Leaving for the directory. sendBeacon, because a page on its way out
    // cancels an image ping.
    const explore = document.getElementById('explore-link');
    if (explore) explore.addEventListener('click', () => reportFinal('explore-site'), { signal });

    installQaHook();

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

/** `beginMilestone` is exposed for the suite too: reaching 100 by actually
 *  playing needs two fifties in a row, which no test should depend on. */
export { init, animate, aimPlayCamera, beginMilestone };

if (typeof document !== 'undefined') {
    init();
}
