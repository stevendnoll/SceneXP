// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for the Earth Defense experience.
 *
 * M7 SCOPE. The world flies (M2), the installations ride Earth and the Moon
 * (M3), the guns work (M4), the fleet is on its way in (M5), it is a game that
 * can be won and lost and started again (M6), and now it makes a noise. What is
 * left is the accessibility and performance pass (M8) and shipping it (M9).
 *
 * SOUND IS REINFORCEMENT AND NOTHING ELSE. Every cue duplicates something that
 * is already on screen and already in the live region, so a muted visitor and a
 * deaf visitor lose nothing at all (PRD 8.5). That is a rule about what may be
 * wired here in future as much as a description of what is wired now.
 *
 * THE STATE MACHINE IS THE SPINE FROM HERE. `gamestate-1.0.0` decides which of
 * briefing, playing, paused, won, and lost the experience is in, and every
 * screen and every part of the frame loop follows from that one answer rather
 * than from a flag of its own. The welcome overlay IS the briefing, which is
 * why the raiders now hold their positions until the visitor takes the helm:
 * before M6 the fleet closed in while the dedication was still being read.
 *
 * This file owns the seam between the shared parts and the scene: flight
 * (flight-1.0.0) deals only in plain numbers, and this is where those numbers
 * become a camera. That split is deliberate. It keeps every line of the flight
 * maths testable with real values, and it means the same module could fly
 * something other than a camera in a later game.
 *
 * The same shape holds for the guns. `targeting` is given a view, a candidate
 * list, and a rules object, and hands back an id: it never sees the scene
 * graph. `weapons` is given that id and two muzzle points, and never learns
 * what an installation is. Everything scenario-specific is in this file and in
 * config.js, which is what makes the six shared modules reusable by the next
 * space game rather than by this one only.
 *
 * The full init order is in the PRD, section 9.6.
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
import {
    initWorld, updateWorld, getBody, getOccluders, getStructures, getStructure,
    resetStructures, targetCandidates, damageStructure
} from './world.min.js';
import { altitudeFloorAdjust } from '../../shared/js/bodies-1.0.0.min.js';
import { pickTarget } from '../../shared/js/targeting-1.0.0.min.js';
import {
    initWeapons, updateWeapons, registerDamageable, applyDamage, onHit,
    clearDamageables, spawnDestruction, disposeWeapons
} from '../../shared/js/weapons-1.0.0.min.js';
import {
    initGameState, resetRun, transition, getState as gamePhase, isPlaying, isOver,
    noteDestroyed, getCounters, loseLife, livesRemaining, endedByLives,
    tick, elapsed, onStateChange, bestTime, recordBestTime, disposeGameState
} from '../../shared/js/gamestate-1.0.0.min.js';
import {
    initCockpit, resizeCockpit, muzzleWorldPositions, setCockpitFiring,
    disposeCockpit
} from './cockpit.min.js';
import {
    initFleet, updateFleet, resetFleet, getShips, fleetCandidates,
    destroyShip, getAlert, disposeFleet
} from './fleet.min.js';
import { initHud, updateHud, projectToScreen, getProjection, disposeHud } from './hud.min.js';
import {
    initAudio, setEngineThrottle, setMuted, playFire, playHit, playDestruction,
    playAlert, playLock, disposeAudio
} from './audio.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';

// ---- Application state ----------------------------------------------------

// `isPaused` is deliberately NOT here. Whether the game is running is
// gamestate's answer now, and a second flag beside it would be one more thing
// to keep in step and one more way for the pause panel and the simulation to
// disagree about what is happening.
const state = {
    isRunning: false,
    isLoaded: false,
    lastTime: 0,
    isMobile: false
};

const settings = {
    lookSensitivity: 1.0,
    invertPitch: false,
    reducedFx: false,
    muted: false
};

let canvas, loadingScreen, blocker, touchControls, hud;
let throttleReadout, perimeterNotice, flightStatus;
let settingsPanel, settingsBtn, pauseModal;
let reticle, lockBracket, combatStatus;
let endModal, endTitle, endSubtitle, endTime, endSaved, endDestroyed, endBest;
let scene = null;
let overlayScene = null;
let cleanupController = null;

let _sessionStart = 0;
let _sessionEnded = false;
let _announcedThrottle = null;
let _announcedLock = null;
let _announcedAlert = null;
let _hullHitTimer = 0;
let _event = null;
let _eventTimer = 0;
// The visitor's own survival. Hull points absorb enemy fire and refill with
// each life; the two timers are the wreck and the grace period after it.
let _hullPoints = 0;
let _respawnTimer = 0;
let _invulnerable = 0;

// The view handed to pickTarget. Rewritten in place each frame rather than
// rebuilt, because this runs sixty times a second.
const _view = { eye: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 } };
const _targetRules = { coneRadians: 0, range: 0, allegiance: null, occluders: null };
// What the raiders are told about the visitor, and the combined candidate list
// the guns choose from. Both reused, for the same reason as _view.
const _player = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 } };
const _candidates = [];
const _hudView = {
    camera: null, elapsed: 0, structuresRemaining: 0, shipsRemaining: 0,
    ships: null, bodies: null, alert: null, event: null, lives: 0,
    playerPosition: null
};
// One record per navigable body, rewritten in place. bodies-1.0.0 also offers
// `bodyPositions()`, which builds a fresh object per body per call: fine once,
// wasteful sixty times a second on a phone.
const _bodies = {};

// ---- Initialization -------------------------------------------------------

async function init() {
    state.isMobile = isTouchDevice();
    setMobile(state.isMobile);

    canvas = document.getElementById('game-canvas');
    loadingScreen = document.getElementById('loading-screen');
    blocker = document.getElementById('blocker');
    touchControls = document.getElementById('touch-controls');
    hud = document.getElementById('hud');
    throttleReadout = document.getElementById('throttle-readout');
    perimeterNotice = document.getElementById('perimeter-notice');
    flightStatus = document.getElementById('flight-status');
    settingsPanel = document.getElementById('settings-panel');
    settingsBtn = document.getElementById('settings-btn');
    pauseModal = document.getElementById('pause-modal');
    reticle = document.getElementById('reticle');
    lockBracket = document.getElementById('lock-bracket');
    combatStatus = document.getElementById('combat-status');
    endModal = document.getElementById('end-modal');
    endTitle = document.getElementById('end-title');
    endSubtitle = document.getElementById('end-subtitle');
    endTime = document.getElementById('end-time');
    endSaved = document.getElementById('end-saved');
    endDestroyed = document.getElementById('end-destroyed');
    endBest = document.getElementById('end-best');

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
    startCombat();

    setupEventListeners();

    updateLoadingStatus('Ready', 100);
    setTimeout(() => {
        if (loadingScreen) loadingScreen.classList.add('hidden');
        state.isLoaded = true;
        // The shared stylesheet ships #hud at opacity 0 and reveals it with
        // `.visible`, the same way it does the floating buttons. Forgetting
        // this line does not break anything loudly: the game runs perfectly and
        // the entire HUD is simply never drawn, which is exactly how it reached
        // the first round of screenshots.
        if (hud) hud.classList.add('visible');
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

/** Keep the ship above the surface. M2 carried a hand-rolled version of this in
 *  this file; M3 replaced it with the shared one, which reads live body
 *  positions and so keeps working now that the Moon is moving.
 *
 *  THIS IS THE ONLY THING STANDING BETWEEN A VISITOR AND THE INSIDE OF EARTH,
 *  and it is a hard floor rather than a warning: the position is rewritten
 *  every frame, so pointing at a planet and holding the throttle down ends in a
 *  skim rather than in anything at all. Losing a ship to it was tried at M6 and
 *  taken back out, because the planets are the best thing here and the first
 *  thing anyone does is fly at one to see how big it is. */
function keepAbovePlanets(next) {
    return altitudeFloorAdjust(next, EARTHDEFENSE_CONFIG.altitudeFloor);
}

// ---- Combat ---------------------------------------------------------------

/** Build the canopy and the fleet, put everything that can be shot on one
 *  damage ledger, and wire the single callback the scene reacts to. */
function startCombat() {
    const config = EARTHDEFENSE_CONFIG;

    overlayScene = initCockpit(config);
    initWeapons(config.weapons, scene);

    // THE FLEET REACHES THE REST OF THE GAME THROUGH THESE THREE FUNCTIONS and
    // through nothing else, which is what keeps fleet.js free of both
    // structures.js and weapons-1.0.0 and testable with two plain objects.
    initFleet(config, scene, {
        structures: targetCandidates,
        damageStructure: resolveDamage,
        onPlayerHit: notePlayerHit
    });

    // ONE LEDGER FOR EVERYTHING THAT CAN DIE. Installations and raiders are the
    // same kind of entry here, so a hit from the visitor's guns and a hit from
    // a raider's go through identical arithmetic. Two counters for the same
    // thing would eventually disagree, and the visible half of that is a
    // structure showing pips it no longer has.
    for (const entry of getStructures()) {
        registerDamageable(entry.site.id, config.structures.hitPoints);
    }
    for (const ship of getShips()) {
        registerDamageable(ship.id, config.fleet.hitPoints);
    }

    // Only `onHit` is wired, deliberately. weapons fires onDestroyed AND onHit
    // for a killing shot, so handling both would run the scene's reaction
    // twice; the result carries the `destroyed` flag anyway.
    onHit((result) => { onDamageResolved(result); });

    _targetRules.coneRadians = config.targeting.coneRadians;
    _targetRules.range = config.targeting.range;
    _targetRules.allegiance = config.targeting.allegiance;

    initHud(config);
    // Wires a one-time gesture listener and builds nothing. The context waits
    // for the visitor's first click or key, which is both what browsers require
    // and the right manners: a page nobody has touched should make no sound.
    initAudio(config);
    setMuted(settings.muted);
    startGame();
}

// ---- The game -------------------------------------------------------------

/** Hand the state machine the two things it counts and the two rules it counts
 *  them against.
 *
 *  THE RULES ARE PREDICATES, not code inside gamestate. That is what keeps the
 *  module reusable: it never learns what an installation or a raider is, only
 *  that named counters go down and that these two functions have opinions about
 *  the result. */
function startGame() {
    const config = EARTHDEFENSE_CONFIG;

    initGameState({
        objectives: [
            { counter: 'friendlyStructures', ids: getStructures().map(e => e.site.id) },
            { counter: 'hostileShips', ids: getShips().map(s => s.id) }
        ],
        winWhen: (c) => c.hostileShips === 0,
        loseWhen: (c) => c.friendlyStructures === 0,
        lives: config.player.lives,
        storageKey: config.storage.bestTime
    });
    onStateChange(handleStateChange);

    _hullPoints = config.player.hullPoints;
    _respawnTimer = 0;
    _invulnerable = 0;
}

/** Everything that has to happen when the game changes state, in one place.
 *
 *  Wired as a subscriber rather than done at each call site, so a transition
 *  from anywhere (the welcome button, Esc, the last raider dying, a restart)
 *  puts the same screens up. Missing one of these at one call site is how a
 *  pause panel ends up over a win screen. */
function handleStateChange(next) {
    // The simulation is frozen for anything that is not active play, which
    // includes the briefing: raiders should not close in while the dedication
    // is still on screen. A wrecked ship stays frozen through a pause and out
    // the other side, or resuming would hand the controls back to a visitor
    // whose ship is still an expanding cloud.
    setPaused(next !== 'playing' || _respawnTimer > 0);

    if (blocker) blocker.classList.toggle('hidden', next !== 'briefing');
    if (pauseModal) pauseModal.classList.toggle('hidden', next !== 'paused');

    if (next === 'won' || next === 'lost') {
        // The wash from the shot that ended the run would otherwise sit over
        // the end screen forever: the frame clock that clears it only runs
        // while the game is being played.
        _hullHitTimer = 0;
        document.body.classList.remove('hull-hit');
        showEndScreen(next);
    } else if (endModal) {
        endModal.classList.add('hidden');
    }

    if (next !== 'playing' && typeof document.exitPointerLock === 'function') {
        // Holding the cursor captive behind a dialog is a trap, not a feature.
        document.exitPointerLock();
    }
}

/** The end of a run. The same warm card as the pause panel on purpose: a loss
 *  should read as an invitation to go again rather than as a scolding, which is
 *  the whole difficulty stance (PRD 4.5). */
function showEndScreen(outcome) {
    const config = EARTHDEFENSE_CONFIG;
    const counters = getCounters();
    const seconds = elapsed();
    const won = outcome === 'won';

    let best = bestTime();
    let improved = false;
    // Only a WIN sets a best time. A quick loss is not a fast run.
    if (won) ({ best, improved } = recordBestTime(seconds));

    if (endTitle) endTitle.textContent = won ? 'The line held' : 'Run ended';
    if (endSubtitle) endSubtitle.textContent = endMessage(outcome, counters);
    if (endTime) endTime.textContent = formatClock(seconds);
    if (endSaved) endSaved.textContent = String(counters.friendlyStructures);
    if (endDestroyed) {
        endDestroyed.textContent = String(config.fleet.total - counters.hostileShips);
    }
    if (endBest) {
        endBest.textContent = best === null
            ? ''
            : (improved ? `A new best: ${formatClock(best)}` : `Your best: ${formatClock(best)}`);
    }
    if (endModal) endModal.classList.remove('hidden');
    // The card has no close button on purpose, so the one control on it has to
    // receive focus: a keyboard visitor should not have to go looking for the
    // only way forward.
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn && typeof restartBtn.focus === 'function') restartBtn.focus();

    announce(endTitle ? endTitle.textContent : outcome, 8);
    track('run-ended', {
        outcome,
        seconds: Math.round(seconds),
        saved: counters.friendlyStructures,
        destroyed: config.fleet.total - counters.hostileShips
    });
}

/** RUNNING OUT OF HULLS IS NOT A LOST OBJECTIVE (PRD 6.4). The run is over
 *  either way, but saying the installations fell when they did not is exactly
 *  the small dishonesty that makes a game feel cheap. */
function endMessage(outcome, counters) {
    if (outcome === 'won') {
        return counters.friendlyStructures === 7
            ? 'Every installation still standing. Not a scratch on the whole line.'
            : 'The fleet is gone. What is left down there is still yours.';
    }
    if (endedByLives()) {
        return 'Your ship did not make it home. The installations are still holding.';
    }
    return 'The last installation is gone. The raiders have the orbit.';
}

/** Seconds as m:ss, matching the HUD clock. Small enough to keep here rather
 *  than reaching into hud.js for one string on one screen. */
function formatClock(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Put the whole game back to its opening position.
 *
 *  NOTHING IS REBUILT. Every module resets what it owns rather than being
 *  disposed and recreated: the installations stand back up, the fleet returns
 *  to the start line, and the damage ledger is cleared and refilled. Going back
 *  through the builders would re-anchor seven installations onto bodies that
 *  already carry them and leave the previous run's wrecks in the world forever.
 */
function restartRun() {
    const config = EARTHDEFENSE_CONFIG;

    resetStructures(config);
    resetFleet();

    clearDamageables();
    for (const entry of getStructures()) {
        registerDamageable(entry.site.id, config.structures.hitPoints);
    }
    for (const ship of getShips()) {
        registerDamageable(ship.id, config.fleet.hitPoints);
    }

    // Back to the spawn transform with the throttle closed. initFlight disposes
    // its own listeners first, so this re-wires rather than stacking.
    startFlight();

    _hullPoints = config.player.hullPoints;
    _respawnTimer = 0;
    _invulnerable = 0;
    _event = null;
    _eventTimer = 0;
    _announcedLock = null;
    _announcedAlert = null;
    _hullHitTimer = 0;
    document.body.classList.remove('hull-hit');

    resetRun();
    transition('playing');
    track('restart');
}

/** A raider's shot, put on the same ledger the visitor's guns use. Returns the
 *  surviving state so the fleet can see what it did. */
function resolveDamage(id, amount) {
    const result = applyDamage(id, amount);
    if (result) onDamageResolved(result);
    return result;
}

/** The scene reacting to a decision `weapons` already made. Which half of the
 *  game the id belongs to is asked rather than parsed out of its prefix.
 *
 *  `noteDestroyed` is the only place the objective counters move, so what the
 *  HUD shows and what decides the win can never drift apart. */
function onDamageResolved(result) {
    const structure = getStructure(result.id);
    if (structure) {
        damageStructure(result.id, result.hitPoints);
        if (result.destroyed) {
            noteDestroyed(result.id);
            playDestruction();
            track('structure-lost', { id: result.id });
            announce(`${labelFor(result.id)} destroyed.`);
        } else {
            playHit();
        }
        return;
    }
    if (result.destroyed && destroyShip(result.id)) {
        noteDestroyed(result.id);
        playDestruction();
        track('raider-destroyed', { id: result.id });
        announce(`Raider destroyed. ${getCounters().hostileShips} left.`);
    } else if (!result.destroyed) {
        playHit();
    }
}

/** A raider landing a shot on the visitor.
 *
 *  A single hit never costs a life: PRD 6.4 says SUSTAINED fire, and the fleet
 *  is already limited to about one incoming shot every 1.4 seconds across all
 *  twelve raiders, so four hull points is several seconds of sitting still in
 *  the middle of a group. */
function notePlayerHit(amount) {
    if (_invulnerable > 0 || _respawnTimer > 0 || !isPlaying()) return;

    _hullPoints -= (amount || 1);
    _hullHitTimer = 0.45;
    document.body.classList.add('hull-hit');

    if (_hullPoints <= 0) {
        // The only way to lose a ship. Flying into a planet is not one: see the
        // note on `altitudeFloor` in config.js for why that was taken out.
        killPlayer('fire');
        return;
    }
    announce('Taking fire.');
}

/** Losing the ship. Costs a life, not the run, unless it was the last one.
 *
 *  The wreck is a real pause of a second or so rather than an instant snap back
 *  to the spawn point, because a death the visitor does not see is a death they
 *  will assume was a bug. */
function killPlayer(cause) {
    if (_respawnTimer > 0 || isOver()) return;
    const config = EARTHDEFENSE_CONFIG;

    spawnDestruction(getFlightState().position, config.fleet.effectRadius * 2);
    setPaused(true);
    _respawnTimer = config.player.respawnDelay;
    _hullHitTimer = 0.45;
    document.body.classList.add('hull-hit');
    track('player-lost', { cause });

    const left = loseLife();
    announce(left > 0
        ? `Ship lost. ${left} ${left === 1 ? 'hull' : 'hulls'} left.`
        : 'Ship lost.', 5);
}

/** Put the ship back, with a couple of seconds of grace so nobody is killed
 *  again by whatever they respawned beside before they have their bearings. */
function respawnPlayer() {
    const config = EARTHDEFENSE_CONFIG;
    startFlight();
    _hullPoints = config.player.hullPoints;
    _invulnerable = config.player.respawnInvulnerable;
    setPaused(false);
}

function labelFor(id) {
    const entry = getStructures().find(e => e.site.id === id);
    if (entry) return entry.site.label;
    // Raiders are deliberately anonymous. "Raider" is the whole identity a
    // visitor needs, and numbering them would invite counting rather than
    // flying.
    return String(id).startsWith('raider') ? 'a raider' : 'an installation';
}

/** Everything the guns are allowed to consider, in one reused array.
 *
 *  The installations are still in it even though `targeting.allegiance` no
 *  longer admits them. Seven allegiance checks a frame is nothing, and leaving
 *  them in is what keeps that config line a real switch: setting it back to
 *  ['friendly'] turns the world into a firing range again without touching
 *  code, which is occasionally useful while tuning.
 *
 *  The candidate OBJECTS are copied out by reference, so the two source arrays
 *  being reused and rewritten later in the frame does not disturb this one. */
function combatCandidates() {
    _candidates.length = 0;
    const structures = targetCandidates();
    for (let i = 0; i < structures.length; i++) _candidates.push(structures[i]);
    const raiders = fleetCandidates();
    for (let i = 0; i < raiders.length; i++) _candidates.push(raiders[i]);
    return _candidates;
}

/** One frame of gunnery: pick a target, fire at it, and show the result.
 *
 *  Order matters. The bodies have already moved this frame, so the candidate
 *  positions read here are where the installations ARE rather than where they
 *  were, which is the difference between a lock that tracks and one that
 *  lags a frame behind the Moon. */
function updateCombat(deltaTime) {
    const camera = getWorldCamera();
    if (!camera) return;

    const s = getFlightState();
    _view.eye.x = s.position.x;
    _view.eye.y = s.position.y;
    _view.eye.z = s.position.z;
    _view.forward.x = s.forward.x;
    _view.forward.y = s.forward.y;
    _view.forward.z = s.forward.z;
    // Read live: the Moon is moving, so a cached occluder list would let a
    // visitor shoot through it.
    _targetRules.occluders = getOccluders();

    // A wrecked ship holds its fire but its effects keep running, which is how
    // the destruction burst it just became gets to finish playing.
    const target = _respawnTimer > 0
        ? null
        : pickTarget(_view, combatCandidates(), _targetRules);
    const shots = updateWeapons(deltaTime, target, muzzleWorldPositions(camera));

    setCockpitFiring(shots > 0);
    // One cue per shot, rate limited inside audio.js. The guns fire four times
    // a second, so anything richer than a dry tick becomes unbearable fast.
    if (shots > 0) playFire();
    updateLockUi(target, camera);
}

/** What the raiders are told about the visitor: where the ship is, and where
 *  its nose is pointing. That second one is the whole break-off rule, since a
 *  raider decides to weave when the visitor is close and NEARLY lined up. */
function playerState() {
    const s = getFlightState();
    _player.position.x = s.position.x;
    _player.position.y = s.position.y;
    _player.position.z = s.position.z;
    _player.forward.x = s.forward.x;
    _player.forward.y = s.forward.y;
    _player.forward.z = s.forward.z;
    return _player;
}

/** The reticle changes SHAPE as well as colour the instant a target qualifies,
 *  and a bracket is drawn around the target itself.
 *
 *  Two separate jobs on purpose. The reticle says "the guns have something",
 *  which is the rule the visitor is learning and which must read at the centre
 *  of the frame where they are already looking. The bracket says "it is THAT
 *  one", which only matters once there is more than one candidate, and which
 *  has to sit out where the target actually is. */
function updateLockUi(target, camera) {
    const locked = !!target;

    if (reticle) reticle.classList.toggle('locked', locked);
    if (!lockBracket) return;
    if (!locked) {
        lockBracket.classList.add('hidden');
        announceLock(null);
        return;
    }

    // The projection is the HUD's, not a second copy. A point behind the eye
    // comes back MIRRORED, so a private implementation that forgot the
    // view-space z check would put the bracket on the opposite side of the
    // screen from the target rather than simply being wrong. One place to get
    // that right is one place to get it wrong.
    const projected = projectToScreen(target.position, camera);
    if (!projected.onScreen) {
        lockBracket.classList.add('hidden');
        return;
    }
    lockBracket.classList.remove('hidden');
    lockBracket.style.transform =
        `translate(-50%, -50%) translate(${projected.x.toFixed(1)}px, ${projected.y.toFixed(1)}px)`;
    announceLock(target.id);
}

/** Every combat state the pixels carry is also said in words, because a lock
 *  that only exists as a change of shape is a lock some visitors never see.
 *  Announced on CHANGE, never per frame, or the live region would chatter. */
function announceLock(id) {
    if (id === _announcedLock) return;
    // Acquiring, not losing. A blip every time a target drifts out of the cone
    // would be constant chatter while flying through a group.
    if (id && !_announcedLock) playLock();
    _announcedLock = id;
    if (!combatStatus) return;
    combatStatus.textContent = id
        ? `Locked on ${labelFor(id)}. Guns firing.`
        : 'No target. Guns idle.';
}

/** News, as opposed to state. It goes to the OBJECTIVE live region rather than
 *  the combat one, because the combat region carries the lock and is rewritten
 *  on every change of target: a one-off line put there would be overwritten
 *  within a frame or two and never actually reach anyone. Held for a few
 *  seconds so the region has time to say it. */
function announce(message, seconds = 3) {
    _event = message;
    _eventTimer = seconds;
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
    settings.muted = readStored(keys.muted, 'false') === 'true';
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
    const mute = document.getElementById('mute-toggle');
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

    if (mute) {
        mute.checked = settings.muted;
        mute.addEventListener('change', () => {
            settings.muted = mute.checked;
            setMuted(settings.muted);
            writeStored(keys.muted, settings.muted);
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
//
// Both of these are one line of intent each. The screens, the freeze, and the
// pointer lock are all handled by `handleStateChange`, so pausing from a key,
// from a button, and from a backgrounded tab cannot end up doing three
// slightly different things.

function openPause() {
    if (!state.isLoaded || !isPlaying()) return;
    if (transition('paused')) track('pause');
}

function closePause() {
    if (gamePhase() !== 'paused') return;
    transition('playing');
}

// ---- Event wiring ---------------------------------------------------------

function setupEventListeners() {
    cleanupController = new AbortController();
    const signal = cleanupController.signal;

    window.addEventListener('pagehide', cleanup);
    window.addEventListener('resize', () => {
        resizeSpace();
        // The canopy is rebuilt for the new aspect rather than stretched: a
        // portrait phone and a wide desktop want different shapes, and this is
        // the line whose absence is the classic two-camera bug.
        resizeCockpit(window.innerWidth / window.innerHeight);
    }, { signal });

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
        if (gamePhase() === 'paused') closePause();
        else if (settingsPanel && !settingsPanel.classList.contains('hidden')) toggleSettings(false);
        else openPause();
    }, { signal });

    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) restartBtn.addEventListener('click', restartRun, { signal });

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

/** Taking the helm, which is also the start of the run: the welcome overlay IS
 *  the briefing state, so this is where the clock starts and where the fleet is
 *  released to close in. */
function beginFlight() {
    if (!state.isLoaded || gamePhase() !== 'briefing') return;
    transition('playing');
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

    // THE WORLD KEEPS TURNING UNLESS THE GAME IS PAUSED. Behind the welcome
    // overlay and behind the end screen the planets still rotate and the Moon
    // still travels, so neither screen sits on a frozen photograph. The pause
    // panel is the one place that genuinely stops, because that is what it is
    // for.
    if (gamePhase() !== 'paused') updateWorld(deltaTime);

    if (isPlaying()) {
        tick(deltaTime);
        // A no-op while the ship is wrecked: the flight model is paused for the
        // length of the wreck, so the camera holds still and watches.
        updateFlight(deltaTime);
        // ORDER MATTERS IN ONE PLACE. The bodies have already moved above, so
        // the raiders steer at where their installation IS this frame rather
        // than where it was last one, and the visitor's lock reads the same
        // fresh positions. The Moon carries three of the seven and travels 838
        // units a second, so a frame of lag there is a visible miss.
        applyFlightToCamera();
        updateFleet(deltaTime, playerState());
        updateCombat(deltaTime);
        advanceRespawn(deltaTime);
        advanceNotices(deltaTime);
        if (_invulnerable > 0) _invulnerable -= deltaTime;
    } else {
        applyFlightToCamera();
    }
    updateReadouts();
    updateObjectiveHud();

    renderSpace(scene, overlayScene);
}

/** Count down the wreck, then put the ship back. Run off the frame clock rather
 *  than a timer, so leaving the page cannot strand a visitor dead. */
function advanceRespawn(deltaTime) {
    if (_respawnTimer <= 0 || isOver()) return;
    _respawnTimer -= deltaTime;
    if (_respawnTimer > 0) return;
    _respawnTimer = 0;
    respawnPlayer();
}

/** Hand the HUD a snapshot of the game. Every field is read live rather than
 *  cached, which for the nav markers is the whole point: the Moon is moving,
 *  and a cached bearing to it makes an interception feel broken (PRD 5.2). */
function updateObjectiveHud() {
    // The counters come from the state machine rather than from a fresh count
    // of the scene. One ledger: what the HUD shows and what decides the win are
    // the same numbers, so they cannot drift apart.
    const counters = getCounters();
    _hudView.camera = getWorldCamera();
    _hudView.elapsed = elapsed();
    _hudView.structuresRemaining = counters.friendlyStructures;
    _hudView.shipsRemaining = counters.hostileShips;
    _hudView.lives = livesRemaining();
    _hudView.ships = getShips();
    _hudView.bodies = liveBodyPositions();
    _hudView.alert = getAlert();
    // Once per installation coming under attack, not once per frame it stays
    // under attack, and not again when the same one is hit a second time.
    const alertId = _hudView.alert ? _hudView.alert.id : null;
    if (alertId && alertId !== _announcedAlert) playAlert();
    _announcedAlert = alertId;
    _hudView.event = _event;
    _hudView.playerPosition = getFlightState().position;
    updateHud(_hudView);
}

/** Where the navigable bodies are RIGHT NOW, read straight off their meshes.
 *  The Moon travels 838 units a second, so a cached position is what makes an
 *  interception feel broken (PRD 5.2). */
function liveBodyPositions() {
    for (const point of EARTHDEFENSE_CONFIG.hud.navPoints) {
        const mesh = getBody(point.id);
        if (!mesh) continue;
        const slot = _bodies[point.id] || (_bodies[point.id] = { x: 0, y: 0, z: 0 });
        slot.x = mesh.position.x;
        slot.y = mesh.position.y;
        slot.z = mesh.position.z;
    }
    return _bodies;
}

/** The wash of colour after a raider lands one, and the spoken news line, both
 *  run off the frame clock rather than off timers, so pausing or leaving the
 *  page cannot strand either of them lit. */
function advanceNotices(deltaTime) {
    if (_hullHitTimer > 0) {
        _hullHitTimer -= deltaTime;
        if (_hullHitTimer <= 0) document.body.classList.remove('hull-hit');
    }
    if (_eventTimer > 0) {
        _eventTimer -= deltaTime;
        if (_eventTimer <= 0) _event = null;
    }
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
    // The engine follows the THROTTLE rather than the speed, so pushing the
    // lever is answered immediately instead of a second later once the ship has
    // caught up. That gap is what would make the controls feel unresponsive.
    setEngineThrottle(s.throttle);

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
    disposeWeapons();
    disposeFleet();
    disposeCockpit();
    disposeHud();
    disposeAudio();
    disposeGameState();
    overlayScene = null;
}

function endSession() {
    if (_sessionEnded || !_sessionStart) return;
    _sessionEnded = true;
    trackFinal('session-end', {
        seconds: Math.round((Date.now() - _sessionStart) / 1000)
    });
}

/** The application's own state, plus the game's, in the shape every other
 *  experience's suite already expects. `isPaused` is derived rather than
 *  stored, so there is still exactly one answer to the question. */
export function getState() {
    return { ...state, phase: gamePhase(), isPaused: gamePhase() === 'paused' };
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

export const __test__ = {
    bufToHex, hasWebGL, keepAbovePlanets, settings,
    updateCombat, updateLockUi, labelFor, announceLock,
    combatCandidates, resolveDamage, onDamageResolved, notePlayerHit,
    updateObjectiveHud, advanceNotices, playerState, getProjection,
    startGame, handleStateChange, showEndScreen, endMessage, formatClock,
    restartRun, killPlayer, respawnPlayer, advanceRespawn,
    openPause, closePause, beginFlight
};
