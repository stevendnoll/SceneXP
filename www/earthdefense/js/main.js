// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Application entry point for the Earth Defense experience.
 *
 * M5 SCOPE. The world flies (M2), the installations ride Earth and the Moon
 * (M3), the guns work (M4), and now there is a war on: twelve Martian raiders
 * are strung out along the approach vector from the first frame, and the HUD
 * says how it is going. Still to come are the game state, the win and lose
 * screens, and lives (M6), and the final canopy (M7).
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
    structuresRemaining, targetCandidates, damageStructure
} from './world.min.js';
import { altitudeFloorAdjust } from '../../shared/js/bodies-1.0.0.min.js';
import { pickTarget } from '../../shared/js/targeting-1.0.0.min.js';
import {
    initWeapons, updateWeapons, registerDamageable, applyDamage, onHit,
    disposeWeapons
} from '../../shared/js/weapons-1.0.0.min.js';
import {
    initCockpit, resizeCockpit, muzzleWorldPositions, setCockpitFiring,
    disposeCockpit
} from './cockpit.min.js';
import {
    initFleet, updateFleet, getShips, shipsRemaining, fleetCandidates,
    destroyShip, getAlert, disposeFleet
} from './fleet.min.js';
import { initHud, updateHud, projectToScreen, getProjection, disposeHud } from './hud.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';

// ---- Application state ----------------------------------------------------

const state = {
    isRunning: false,
    isLoaded: false,
    isPaused: false,
    lastTime: 0,
    isMobile: false
};

const settings = {
    lookSensitivity: 1.0,
    invertPitch: false,
    reducedFx: false
};

let canvas, loadingScreen, blocker, touchControls;
let throttleReadout, perimeterNotice, flightStatus;
let settingsPanel, settingsBtn, pauseModal;
let reticle, lockBracket, combatStatus;
let scene = null;
let overlayScene = null;
let cleanupController = null;

let _sessionStart = 0;
let _sessionEnded = false;
let _announcedThrottle = null;
let _announcedLock = null;
let _elapsed = 0;
let _hullHitTimer = 0;
let _event = null;
let _eventTimer = 0;

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
    ships: null, bodies: null, alert: null, event: null, playerPosition: null
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
    throttleReadout = document.getElementById('throttle-readout');
    perimeterNotice = document.getElementById('perimeter-notice');
    flightStatus = document.getElementById('flight-status');
    settingsPanel = document.getElementById('settings-panel');
    settingsBtn = document.getElementById('settings-btn');
    pauseModal = document.getElementById('pause-modal');
    reticle = document.getElementById('reticle');
    lockBracket = document.getElementById('lock-bracket');
    combatStatus = document.getElementById('combat-status');

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

/** Keep the ship above the surface. M2 carried a hand-rolled version of this
 *  in this file; M3 replaced it with the shared one, which reads live body
 *  positions and so keeps working now that the Moon is moving. */
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
}

/** A raider's shot, put on the same ledger the visitor's guns use. Returns the
 *  surviving state so the fleet can see what it did. */
function resolveDamage(id, amount) {
    const result = applyDamage(id, amount);
    if (result) onDamageResolved(result);
    return result;
}

/** The scene reacting to a decision `weapons` already made. Which half of the
 *  game the id belongs to is asked rather than parsed out of its prefix. */
function onDamageResolved(result) {
    const structure = getStructure(result.id);
    if (structure) {
        damageStructure(result.id, result.hitPoints);
        if (result.destroyed) {
            track('structure-lost', { id: result.id });
            announce(`${labelFor(result.id)} destroyed.`);
        }
        return;
    }
    if (result.destroyed && destroyShip(result.id)) {
        track('raider-destroyed', { id: result.id });
        announce(`Raider destroyed. ${shipsRemaining()} left.`);
    }
}

/** A raider landing a shot on the visitor. At M5 that is a warning and a brief
 *  wash of colour at the edges of the frame; the life it costs is wired at M6
 *  along with the rest of the game state (PRD 6.4). */
function notePlayerHit() {
    _hullHitTimer = 0.45;
    document.body.classList.add('hull-hit');
    announce('Taking fire.');
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

    const target = pickTarget(_view, combatCandidates(), _targetRules);
    const shots = updateWeapons(deltaTime, target, muzzleWorldPositions(camera));

    setCockpitFiring(shots > 0);
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

function openPause() {
    if (!state.isLoaded || state.isPaused) return;
    state.isPaused = true;
    setPaused(true);
    if (pauseModal) pauseModal.classList.remove('hidden');
    // Holding the cursor captive behind a dialog is a trap, not a feature.
    if (typeof document.exitPointerLock === 'function') document.exitPointerLock();
    track('pause');
}

function closePause() {
    if (!state.isPaused) return;
    state.isPaused = false;
    setPaused(false);
    if (pauseModal) pauseModal.classList.add('hidden');
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
        if (state.isPaused) closePause();
        else if (settingsPanel && !settingsPanel.classList.contains('hidden')) toggleSettings(false);
        else openPause();
    }, { signal });

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

function beginFlight() {
    if (!state.isLoaded || !blocker || blocker.classList.contains('hidden')) return;
    blocker.classList.add('hidden');
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

    if (!state.isPaused) {
        _elapsed += deltaTime;
        updateFlight(deltaTime);
        // ORDER MATTERS IN ONE PLACE. The bodies move first, so the raiders
        // steer at where their installation IS this frame rather than where it
        // was last one, and the visitor's lock reads the same fresh positions.
        // The Moon carries three of the seven and travels 838 units a second,
        // so a frame of lag there is a visible miss.
        updateWorld(deltaTime);
        applyFlightToCamera();
        updateFleet(deltaTime, playerState());
        updateCombat(deltaTime);
        advanceNotices(deltaTime);
    } else {
        applyFlightToCamera();
    }
    updateReadouts();
    updateObjectiveHud();

    renderSpace(scene, overlayScene);
}

/** Hand the HUD a snapshot of the game. Every field is read live rather than
 *  cached, which for the nav markers is the whole point: the Moon is moving,
 *  and a cached bearing to it makes an interception feel broken (PRD 5.2). */
function updateObjectiveHud() {
    _hudView.camera = getWorldCamera();
    _hudView.elapsed = _elapsed;
    _hudView.structuresRemaining = structuresRemaining('friendly');
    _hudView.shipsRemaining = shipsRemaining();
    _hudView.ships = getShips();
    _hudView.bodies = liveBodyPositions();
    _hudView.alert = getAlert();
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
    overlayScene = null;
}

function endSession() {
    if (_sessionEnded || !_sessionStart) return;
    _sessionEnded = true;
    trackFinal('session-end', {
        seconds: Math.round((Date.now() - _sessionStart) / 1000)
    });
}

export function getState() {
    return { ...state };
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
    updateObjectiveHud, advanceNotices, playerState, getProjection
};
