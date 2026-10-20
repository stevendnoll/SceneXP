// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Derby Day's orchestrator (graybox): the boot, the workbench
 * (M3), the check-in card, a race day played back in the hall, the results
 * and the share clip.
 *
 * THE LOOP (TASKS, M3): every arrival lands at the workbench, the
 * visitor's car on the turntable and the host saying where things stand.
 * Race it, pick an event (Easy, Medium, Hard, Time Trial, the Outlaw
 * exhibition), Go, four heats with every car in every lane, the board. Race
 * again, tune the car, or choose another race. The garage (garage.js) keeps
 * the cars, their results and the trophies in this browser.
 *
 * THE RACE IS DECIDED BEFORE THE FIRST HEAT (PLANNING, Principles). Go runs
 * the sim for every car in every lane with its samples recorded (sim.js,
 * milliseconds), and the hall only plays them back (playback.js), so the
 * frame rate can never change who won, and the share clip (M2) will replay
 * exactly what the board says.
 *
 * Every module it wires is small and does one thing: track.js and hall.js
 * draw the room, carmesh.js a car, playback.js says where everything is,
 * director.js where the camera goes, board.js the timer and the results,
 * copy.js every word, phases.js where an action leads.
 */

import { DERBY_CONFIG, IN, OZ } from './config.min.js';
import { describeCar, buildFromDesign, buildFromField, profileAt, isLegal } from './car.min.js';
import { runRace, explain, tuneupWorth } from './sim.min.js';
import { buildTrack, carPose } from './track.min.js';
import { buildHall } from './hall.min.js';
import { buildCarMesh, wheelSpots } from './carmesh.min.js';
import { buildWorkbench, benchFraming } from './workbench.min.js';
import { createGarage, canEnter, nameOf } from './garage.min.js';
import { createBench } from './bench.min.js';
import { createTools } from './tools.min.js';
import { createTuneups } from './tuneups.min.js';
import { buildCheckinTable, planWeighIn, weighMoment, readingShare } from './checkin.min.js';
import { createCrowd, bleacherSeats, crowdLooks, familyOf, familyPlaces, lookOf, seeded } from './crowd.min.js';
import { buildDressing } from './dressing.min.js';
import { createDancer, dancerOf } from './dancer.min.js';
import { pickDance, danceOf } from '../../shared/js/dance-1.0.0.min.js';
import { createFamilyStore, familyMembers } from './family.min.js';
import { curvesOf } from './profile.min.js';
import { bestBalance } from './weights.min.js';
import * as U from './units.min.js';
import { planDay, momentAt, positionAt, countAt, heatOrder } from './playback.min.js';
import { shotFor, framing, crowdFraming, danceFraming } from './director.min.js';
import { createTimer, fillResults, h } from './board.min.js';
import {
    EVENTS, UI, ENTRY, eventLabel, staging, heatWinner, heatSpoken, resultsSpoken, whyLines, trialLines, clock,
    gains, moreLine, sheetLines, trophyLine, harderLabel, HARDER, tuneupLines, WEIGH, ruleNote, CALLS, gateCall, COUNT,
    CHALLENGE as CH, edgeWords, gapWords
} from './copy.min.js';
import { decodeChallenge, isChallenge, challengeUrl, rivalName, biggestEdge, cleanFrom } from './challenge.min.js';
import { nextPhase } from './phases.min.js';
import { createSound } from './sound.min.js';
import { planClip, clipMoment, clipFraming, drawClipFrame, drawStill } from './clip.min.js';
import {
    canRecord, pickMime, extensionOf, fileName, startRecording, shareFile, canShareFiles, saveFile
} from './recorder.min.js';
import { getProofOfWork, installCardFocusTrap, installCardScrollReset } from '../../shared/js/boot-1.0.0.min.js';
import { warmShaders } from '../../shared/js/warmup-1.0.0.min.js';
import { track, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';

const CONFIG = DERBY_CONFIG;
const LANES = CONFIG.track.lanes;

const state = {
    phase: 'loading',
    isLoaded: false,
    isRunning: false,
    isMobile: false,
    reducedMotion: false,
    lastTime: 0,
    /** The check-in card's choices: the event, the car racing it (a
     *  garage id, the bench car to start), and the Time Trial's cars. */
    event: 'easy',
    entrant: null,
    trial: new Set(),
    /** The weigh-in under way (M5.2): { plan, entries, mine, how, t, said,
     *  failed }. */
    weigh: null,
    /** The turntable's turn, and a drag turning it by hand. */
    spin: 0,
    drag: null,
    /** How far Align has rolled the car off the turntable, meters. */
    benchOffset: 0,
    /** What the bench camera looks at: the car, or the family (M6.3). */
    benchView: 'car',
    /** The race's entries the families stand for, and the announcer's
     *  calls made in this heat (M6). */
    crowdEntries: [],
    called: '',
    /** The race day being played: { entries, cars, race, plan }. */
    day: null,
    clock: 0,
    /** The last segment announced, so each is said once. */
    said: '',
    /** The countdown's word on screen, so each count beeps once. */
    counted: '',
    /** The photo finish showing ('' for none), so it is drawn once. */
    photo: '',
    /** Each family by the finish, as placeCrowd stood them: { key: [{ index
     *  (in the crowd), look, prop, at }] }. The dance under way ({ at,
     *  index }, or null) and the last day's dance, never danced twice
     *  running. */
    families: {},
    dance: null,
    lastDance: null,
    /** A friend's challenge (M8): { build, from, name } from the link the
     *  visitor arrived by, raced head to head; and the car being sent. */
    challenge: null,
    sending: null,
    /** Each car's last position and which have beeped, for the sound. */
    lastS: [],
    beeped: new Set(),
    /** The share clip being made or made: { plan, t, recording, ... }. */
    clip: null,
    /** The day's picture, made ahead of the tap: { day, blob, ready }. */
    still: null
};

const sound = createSound(CONFIG.sound);

let renderer;
let clipRenderer = null;
let clipCanvas = null;
let clipCamera = null;
let scene;
let camera;
let trackParts;
let meshes = [];
let timer;
let garage;
let bench;
let workbench;
let benchMesh = null;
/** On the turntable, in the car's own frame: the car, the pencil line, the
 *  saw and the sanding block (M4). */
let holder = null;
let tools = null;
let tuneups = null;
let registration = null;
let crowd = null;
/** The day's winner's grown-up, dancing after the last heat (dancer.js). */
let dancer = null;
let dressing = null;
let familyStore = null;
/** The bleachers' crowd, made once a visit. */
let bleachers = null;
let pencil = null;
let cleanupController = null;
const el = {};

// ---- Boot -------------------------------------------------------------------

function detectMobile() {
    if (typeof window === 'undefined') return false;
    const media = (q) => Boolean(window.matchMedia && window.matchMedia(q).matches);
    return media('(pointer: coarse)') || (Math.min(window.innerWidth, window.innerHeight) < 600 && !media('(pointer: fine)'));
}

function prefersReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function pixelRatio() {
    const cap = state.isMobile ? CONFIG.render.mobilePixelRatio : CONFIG.render.maxPixelRatio;
    return Math.min(window.devicePixelRatio || 1, cap);
}

function updateLoadingStatus(message, progress) {
    const statusEl = document.getElementById('load-status');
    const progressEl = document.getElementById('load-progress');
    if (statusEl) statusEl.textContent = message;
    if (progressEl) progressEl.style.width = `${progress}%`;
}

async function init() {
    for (const id of ['game-canvas', 'blocker', 'event-options', 'car-options', 'car-legend', 'go-btn', 'checkin-note',
        'checkin-back', 'help-btn', 'timer', 'skip-btn', 'you-tag', 'caption', 'countdown', 'photo-finish', 'photo-gap', 'race-status', 'results-modal', 'results-title',
        'results-event', 'results-table', 'results-lanes', 'results-why', 'results-why-heading', 'results-again',
        'results-another', 'results-tune', 'results-harder', 'results-trophy', 'results-status', 'explore-link', 'sound-btn',
        'results-share', 'clip-modal', 'clip-title', 'clip-stage', 'clip-progress', 'clip-sound', 'clip-share', 'clip-image',
        'clip-again', 'clip-close', 'clip-status', 'bench', 'bench-title', 'bench-body', 'bench-host', 'bench-host-actions',
        'bench-summary', 'bench-race', 'bench-status', 'results-tuneups', 'results-tuneups-heading', 'weighin-note', 'weighin-text',
        'weighin-back', 'checkin-invite', 'results-challenge', 'challenge-modal', 'challenge-title', 'challenge-text',
        'challenge-from', 'challenge-link', 'challenge-send', 'challenge-copy', 'challenge-close', 'challenge-status']) {
        el[id] = document.getElementById(id);
    }
    if (!el['game-canvas'] || typeof THREE === 'undefined') return;
    // The markup starts the cards hidden. Said again here, so the page never
    // begins believing one is up.
    for (const id of ['results-modal', 'clip-modal', 'challenge-modal', 'bench', 'weighin-note']) if (el[id]) el[id].classList.add('hidden');
    // The clip's sound starts on every visit (D2), whatever a browser that
    // restores form state across a reload remembers.
    if (el['clip-sound']) el['clip-sound'].checked = true;

    state.isMobile = detectMobile();
    state.reducedMotion = prefersReducedMotion();
    setMobile(state.isMobile);
    sound.setLevel(state.isMobile ? CONFIG.sound.masterMobile : CONFIG.sound.master);
    garage = createGarage({ C: CONFIG });
    // The sound as the visitor left it (D20). The audio itself waits for the
    // first tap or key, which is all a browser allows.
    if (garage.settings().sound) {
        sound.setOn(true);
        const wake = () => sound.ensure();
        window.addEventListener('pointerdown', wake, { once: true });
        window.addEventListener('keydown', wake, { once: true });
    }
    markSound();
    if (el['explore-link']) el['explore-link'].href = CONFIG.site.home.path;
    const last = garage.last();
    if (last && last.event) state.event = last.event;
    state.entrant = garage.bench().id;
    state.trial = new Set([garage.bench().id]);
    // Arrived by a friend's challenge link (M8): it opens check-in when the
    // page is ready, the head to head chosen.
    const invited = readChallenge();
    buildCheckin();

    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Setting up the track…', 35);
    const shadows = CONFIG.render.shadows && !state.isMobile;
    renderer = new THREE.WebGLRenderer({ canvas: el['game-canvas'], antialias: !state.isMobile, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.NeutralToneMapping || THREE.NoToneMapping;
    renderer.toneMappingExposure = CONFIG.render.exposure;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (shadows) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
    }
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.look.background);
    scene.fog = new THREE.Fog(CONFIG.look.fog.color, CONFIG.look.fog.near, CONFIG.look.fog.far);
    camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, CONFIG.camera.near, CONFIG.camera.far);
    scene.add(buildHall(CONFIG, { shadows }).group);
    trackParts = buildTrack(CONFIG, { shadows });
    scene.add(trackParts.group);
    workbench = buildWorkbench(CONFIG);
    scene.add(workbench.group);
    holder = new THREE.Group();
    holder.position.set(CONFIG.kit.length / 2, 0, 0);
    workbench.spinner.add(holder);
    tools = createTools(CONFIG, { saw: (s) => sound.work('saw', s), sand: (s) => sound.work('sand', s) });
    holder.add(tools.group);
    tuneups = createTuneups(CONFIG, {
        file: (s) => sound.work('file', s), drill: (s) => sound.work('drill', s),
        puff: () => sound.puff(), tap: () => sound.tap(), roll: (a) => sound.roll(a)
    });
    holder.add(tuneups.inCar);
    workbench.spinner.add(tuneups.onBench);
    registration = buildCheckinTable(CONFIG);
    scene.add(registration.group);
    dressing = buildDressing(CONFIG);
    scene.add(dressing.group);
    crowd = createCrowd(CONFIG);
    scene.add(crowd.group);
    dancer = createDancer();
    scene.add(dancer.group);
    familyStore = createFamilyStore();
    timer = createTimer(el.timer);
    // The cars waiting at the pin behind the check-in card: the visitor's
    // chosen car and the first division's, so the track is not empty.
    stageCars(entriesFor(state.event));
    idleCamera();

    setupEventListeners();
    bench = createBench(el, garage, {
        changed: showBenchCar,
        race: () => {
            track('bench-race', { kind: garage.bench().design, outcome: `class=${garage.bench().rules}&cars=${garage.cars().length}` });
            state.entrant = garage.bench().id;
            if (!state.trial.has(state.entrant)) state.trial = new Set([state.entrant]);
            showCheckin();
        },
        units: () => showBenchCar(garage.bench()),
        family: {
            store: familyStore,
            changed: () => placeCrowd(),
            view: (v) => {
                state.benchView = v;
                if (state.phase === 'bench') benchCamera();
            }
        },
        forgot: (b) => {
            familyStore.forget();
            state.entrant = b.id;
            state.trial = new Set([b.id]);
            state.event = 'easy';
            showBenchCar(b);
        },
        raceAgain: (event) => {
            state.event = event;
            state.entrant = garage.bench().id;
            showCheckin();
            startRace('host');
        },
        draft: drawPencil,
        cut: (from, to, done) => {
            drawPencil(null);
            tools.cut({
                from: from.stations, to: to.stations, color: from.paint.body, reducedMotion: state.reducedMotion,
                swap: () => showBenchCar(to), done
            });
        },
        sand: (b) => tools.sand({ stations: b.stations, reducedMotion: state.reducedMotion }),
        tune: (kind, from, to, done) => {
            tools.finish();
            tuneups.play(kind, {
                wheels: wheelSpots(describeCar(from, CONFIG), CONFIG),
                spin: (m) => { if (benchMesh) benchMesh.roll(m); },
                reducedMotion: state.reducedMotion,
                swap: () => showBenchCar(to),
                done
            });
        },
        track
    }, CONFIG, { signal: cleanupController.signal });
    showBenchCar(garage.bench());

    updateLoadingStatus('Warming up…', 85);
    await warmShaders(renderer, [{ scene, camera }]);
    updateLoadingStatus('Ready', 100);
    setTimeout(() => {
        const loading = document.getElementById('loading-screen');
        if (loading) loading.classList.add('hidden');
        state.isLoaded = true;
        state.phase = nextPhase(state.phase, 'loaded');
        if (el['sound-btn']) el['sound-btn'].classList.add('visible');
        // The car the host is about to introduce is kept from the start.
        if (garage.firstVisit) garage.keep();
        if (invited === 'ok') showCheckin();
        else {
            showBench(garage.firstVisit ? 'first' : 'back');
            if (invited === 'bad') bench.say(CH.bad);
        }
    }, 400);

    track('session-start', { kind: state.isMobile ? 'touch' : 'desktop' });
    state.isRunning = true;
    state.lastTime = performance.now();
    renderer.setAnimationLoop(animate);
}

// ---- The check-in card ------------------------------------------------------

/** A radio button or a checkbox with its label and a line under it. */
function option(type, name, value, label, blurb, checked, onChange) {
    const input = document.createElement('input');
    input.type = type;
    input.name = name;
    input.value = value;
    input.id = `${name}-${value}`;
    input.checked = checked;
    input.addEventListener('change', () => onChange(input), cleanupController ? { signal: cleanupController.signal } : undefined);
    const text = h('span', 'choice-text', null, [h('span', 'choice-label', label), h('span', 'choice-blurb', blurb)]);
    const wrap = h('label', 'choice', null, [input, text]);
    wrap.setAttribute('for', input.id);
    return { wrap, input };
}

const checkin = { events: [], cars: [] };

/** The event and car choices, from copy.js and the garage. Rebuilt when
 *  Time Trial (several cars) and the other events (one) trade places, and
 *  each time the card opens, since the bench may have changed a car. */
function buildCheckin() {
    const box = el['event-options'];
    if (box) {
        box.textContent = '';
        // A friend's challenge first, when the visitor came by one (M8).
        const events = state.challenge
            ? [{ id: 'challenge', label: CH.event, blurb: CH.blurb(state.challenge.name) }].concat(EVENTS)
            : EVENTS;
        if (state.event === 'challenge' && !state.challenge) state.event = 'easy';
        checkin.events = events.map((e) => {
            const o = option('radio', 'event', e.id, e.label, e.blurb, e.id === state.event, (input) => {
                if (!input.checked) return;
                state.event = e.id;
                buildCars();
                if (state.phase === 'checkin') stageCars(entriesFor(state.event));
            });
            box.appendChild(o.wrap);
            return o;
        });
    }
    buildCars();
}

/** A car's line on the check-in card: its shape, weight and class, or why
 *  it cannot enter this event, or a word that the weigh-in will turn it
 *  back. */
function carBlurb(build, why) {
    if (why === 'outlawOnly') return ENTRY.outlawOnly;
    if (why === 'standardOnly') return ENTRY.standardOnly;
    const car = describeCar(build, CONFIG);
    if (!isLegal(car, build.rules, CONFIG)) return ENTRY.illegal;
    const units = garage.settings().units;
    return `${CONFIG.designs[build.design].label} · ${U.mass(car.mass, units)} · ${build.rules === 'outlaw' ? UI.outlaw : UI.standard}`;
}

function buildCars() {
    const box = el['car-options'];
    const trial = state.event === 'trial';
    if (el['car-legend']) el['car-legend'].textContent = trial ? UI.carsLegend : UI.carLegend;
    note('');
    if (!box) return;
    box.textContent = '';
    const cars = garage.cars();
    const why = new Map(cars.map((c) => [c.id, canEnter(c, state.event, CONFIG)]));
    // The car racing a single event: the one chosen, or the first that may.
    if (!trial && why.get(state.entrant) !== 'ok') {
        const first = cars.find((c) => why.get(c.id) === 'ok');
        if (first) state.entrant = first.id;
    }
    checkin.cars = cars.map((c) => {
        const ok = why.get(c.id) === 'ok';
        const on = ok && (trial ? state.trial.has(c.id) : c.id === state.entrant);
        const o = option(trial ? 'checkbox' : 'radio', 'car', c.id, garage.nameOf(c), carBlurb(c, why.get(c.id)), on, (input) => {
            if (trial) {
                if (input.checked) state.trial.add(c.id);
                else state.trial.delete(c.id);
                note(entriesFor('trial').length ? '' : UI.pickOne);
            } else if (input.checked) {
                state.entrant = c.id;
            }
            if (state.phase === 'checkin') stageCars(entriesFor(state.event));
        });
        o.input.disabled = !ok;
        if (!ok) o.wrap.classList.add('is-off');
        box.appendChild(o.wrap);
        return o;
    });
    if (!cars.some((c) => why.get(c.id) === 'ok')) note(ENTRY.noneEligible);
}

function note(text) {
    if (el['checkin-note']) {
        el['checkin-note'].textContent = text;
        el['checkin-note'].hidden = !text;
    }
}

function checkinShown() {
    return Boolean(el.blocker) && !el.blocker.classList.contains('hidden');
}

function showCheckin() {
    hideWeighIn();
    state.phase = 'checkin';
    if (dressing) dressing.timer.set(null);
    hideResults();
    hideBench();
    setRaceChrome(false);
    buildCheckin();
    showInvite();
    if (el.blocker) el.blocker.classList.remove('hidden');
    stageCars(entriesFor(state.event));
    idleCamera();
    const go = el['go-btn'];
    if (go && typeof go.focus === 'function') go.focus({ preventScroll: true });
}

// ---- The workbench (M3) ---------------------------------------------------------

function benchShown() {
    return Boolean(el.bench) && !el.bench.classList.contains('hidden');
}

function hideBench() {
    // A Cut, a sanding or a tune-up still running finishes at once: the car
    // is already cut and tuned.
    if (tools) tools.finish();
    if (tuneups) tuneups.finish();
    if (holder) holder.position.set(CONFIG.kit.length / 2, 0, 0);
    if (el.bench) el.bench.classList.add('hidden');
    if (camera && camera.clearViewOffset) camera.clearViewOffset();
}

/**
 * The bench (every arrival, back from check-in, and Tune my car): the panel
 * up, the camera on the turntable. `kind` is what the host says: 'first',
 * 'back', 'step' or 'tune'.
 */
function showBench(kind = 'back', tip = null) {
    hideWeighIn();
    state.phase = 'bench';
    placeCrowd();
    hideResults();
    setRaceChrome(false);
    if (el.blocker) el.blocker.classList.add('hidden');
    if (el.bench) el.bench.classList.remove('hidden');
    bench.arrive(kind, { tip, last: garage.last() });
    showBenchCar(garage.bench());
    benchCamera();
    const title = el['bench-title'];
    if (title && typeof title.focus === 'function') title.focus({ preventScroll: true });
}

/** The car on the turntable, the sheet on the pegboard, the scale's
 *  reading and the trophy shelf, from the bench's build. */
function showBenchCar(build) {
    if (!workbench) return;
    if (benchMesh) {
        holder.remove(benchMesh.group);
        benchMesh.dispose();
    }
    const car = describeCar(build, CONFIG);
    benchMesh = buildCarMesh(build, car, { paint: build.paint, pockets: true, livery: true }, CONFIG);
    holder.add(benchMesh.group);
    const R = CONFIG.rules[build.rules];
    workbench.setSheet(sheetLines(build.rules, R, {
        mass: (kg) => `${(kg / OZ).toFixed(2)} oz`,
        length: (m) => `${Math.round((m / IN) * 1000) / 1000} in`
    }), build.rules === 'outlaw');
    workbench.setScale(U.mass(car.mass, garage.settings().units));
    workbench.setTrophies(garage.trophies());
}

/**
 * The pencil line on the car (M4.1): the draft's outline drawn on the near
 * side and along the top of the body as it is, so the visitor sees where
 * the saw will go before it does. null takes it off.
 */
function drawPencil(carve) {
    if (pencil) {
        holder.remove(pencil);
        pencil.geometry.dispose();
        pencil.material.dispose();
        pencil = null;
    }
    if (!carve || !holder) return;
    const b = garage.bench();
    const c = curvesOf(carve, CONFIG);
    const base = CONFIG.kit.wheel.radius - CONFIG.kit.axleHeight;
    const pts = [];
    const n = 70;
    let last = null;
    for (let k = 0; k <= n; k++) {
        const d = (CONFIG.kit.length * k) / n;
        const [, top, w] = profileAt(b.stations, d);
        const lift = 0.0005;
        // The side line, on the side as it is now; the top's two edges, on
        // the top as it is now.
        const p = [
            [-d, base + Math.min(c.top(d), top), w / 2 + lift], [-d, base + c.bottom(d), w / 2 + lift],
            [-d, base + top + lift, Math.min(c.width(d), w) / 2], [-d, base + top + lift, -Math.min(c.width(d), w) / 2]
        ];
        if (last) for (let j = 0; j < 4; j++) pts.push(...last[j], ...p[j]);
        last = p;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    pencil = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1e1a16 }));
    holder.add(pencil);
}

/** The panel's size on screen, for framing the car beside or above it. */
function benchPanel() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const side = W >= CONFIG.workbench.sideFrom;
    const r = el.bench && el.bench.getBoundingClientRect ? el.bench.getBoundingClientRect() : null;
    const size = r ? (side ? r.right : H - r.top) : 0;
    return { side: side ? 'left' : 'bottom', size: Math.max(0, size || 0) };
}

function benchCamera() {
    if (!camera || !workbench) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const family = state.benchView === 'family';
    const f = benchFraming({ width: W, height: H, panel: benchPanel(), hold: family ? CONFIG.crowd.familyHold : null }, CONFIG);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    if (camera.setViewOffset) camera.setViewOffset(W, H, f.offsetX, f.offsetY, W, H);
    const [dx, dy, dz] = CONFIG.workbench.dir;
    const n = Math.hypot(dx, dy, dz);
    // The family card turns the camera to the two of them, beside the table.
    const spot = CONFIG.crowd.benchSpot;
    const t = family ? { x: CONFIG.workbench.at.x + spot.x, y: 0.85, z: CONFIG.workbench.at.z + spot.z } : workbench.target;
    camera.position.set(t.x + (dx / n) * f.distance, t.y + (dy / n) * f.distance, t.z + (dz / n) * f.distance);
    camera.lookAt(t.x, t.y, t.z);
}

// ---- A race day -------------------------------------------------------------

/**
 * The cars an event races: the visitor's entrant and the event's three
 * neighbors, or the Time Trial's chosen cars from the garage (an Outlaw car
 * named as one, so the board marks it, D4). Each { build, name, paint,
 * color, mine, id, outlaw }. Only cars that may enter are entered.
 */
export function entriesFor(eventId) {
    const mine = (b, mark) => ({
        build: b, name: mark && b.rules === 'outlaw' ? `${garage.nameOf(b)} (Outlaw)` : garage.nameOf(b),
        paint: b.paint, mine: true, id: b.id, outlaw: b.rules === 'outlaw'
    });
    if (eventId === 'trial') {
        return garage.cars().filter((c) => state.trial.has(c.id) && canEnter(c, 'trial', CONFIG) === 'ok').map((c) => mine(c, true));
    }
    if (eventId === 'challenge' && state.challenge) {
        const car = garage.cars().find((c) => c.id === state.entrant) || garage.bench();
        const r = state.challenge;
        const rival = {
            build: r.build, name: r.build.rules === 'outlaw' ? `${r.name} (Outlaw)` : r.name,
            paint: r.build.paint, mine: false, rival: true, id: r.build.id, outlaw: r.build.rules === 'outlaw'
        };
        return [mine(car, true), rival];
    }
    const car = garage.cars().find((c) => c.id === state.entrant) || garage.bench();
    const field = (CONFIG.divisions[eventId] || CONFIG.divisions.easy).map((i) => CONFIG.field[i]);
    const neighbors = field.map((f) => ({ build: buildFromField(f, CONFIG), name: f.name, color: CONFIG.fieldColors[f.id], mine: false, id: f.id }));
    return canEnter(car, eventId, CONFIG) === 'ok' ? [mine(car, false)].concat(neighbors) : neighbors;
}

/** Put cars on the track, at the pin, each in its first lane. */
function stageCars(entries) {
    if (!scene) return;
    for (const m of meshes) {
        scene.remove(m.group);
        m.dispose();
    }
    const shadows = CONFIG.render.shadows && !state.isMobile;
    meshes = entries.map((e) => {
        const car = describeCar(e.build, CONFIG);
        // A friend's car wears its own livery too (M8).
        const m = buildCarMesh(e.build, car, { paint: e.paint, color: e.color, shadows, pockets: e.mine, livery: e.mine || e.rival }, CONFIG);
        m.car = car;
        scene.add(m.group);
        return m;
    });
    meshes.forEach((m, i) => placeCar(m, 0, i));
    if (trackParts) trackParts.gate.set(0);
    state.crowdEntries = entries;
    placeCrowd();
}

// ---- The people in the hall (M6) ----------------------------------------------

/**
 * Everyone in the hall, put where they stand for what is showing: the crowd
 * on the bleachers, the volunteer at the weigh-in table, the families of
 * the cars racing by the finish (the visitor's at the front, the kid
 * holding the car's name), and on the bench, the visitor's family beside
 * the table instead.
 */
function placeCrowd() {
    if (!crowd || !crowd.ready) return;
    if (!bleachers) {
        const seats = bleacherSeats(CONFIG);
        const looks = crowdLooks(seats.length, CONFIG);
        const rand = seeded(CONFIG.crowd.seed + 3);
        bleachers = seats.map((at, i) => ({ group: 'crowd', look: looks[i], at: { ...at, ry: (rand() - 0.5) * 0.4 }, keen: rand() < 0.35, phase: rand() * 6 }));
    }
    const list = bleachers.slice();
    const W = CONFIG.weighIn;
    list.push({ group: 'volunteer', look: lookOf({ shirt: 'mustard', pants: 'khaki', skin: 'medium', hair: 'gray', length: 'short' }, {}, CONFIG), at: { x: W.at.x - 0.25, y: 0, z: W.at.z - 0.55, ry: 0 }, phase: 0 });
    const mineEntry = state.crowdEntries.find((e) => e.mine);
    const carName = mineEntry ? mineEntry.name.replace(/ \(Outlaw\)$/, '') : garage.nameOf(garage.bench());
    const family = familyMembers(familyStore.load(), carName, CONFIG).map((m) => ({ ...m, group: 'mine', phase: 1.3 }));
    if (state.phase === 'bench' || state.phase === 'loading') {
        const spot = CONFIG.crowd.benchSpot;
        family.forEach((m, i) => list.push({ ...m, at: { x: CONFIG.workbench.at.x + spot.x + (i ? 0.22 : -0.2), y: 0, z: CONFIG.workbench.at.z + spot.z, ry: 0 } }));
    } else {
        const groups = [{ key: 'mine', members: family }];
        for (const e of state.crowdEntries) {
            if (!e.mine && CONFIG.families[e.id]) groups.push({ key: e.id, members: familyOf(e.id, CONFIG).map((m, i) => ({ ...m, group: e.id, phase: i * 0.7 + 0.4 })) });
        }
        state.families = {};
        for (const place of familyPlaces(groups, CONFIG)) {
            const g = groups.find((x) => x.key === place.key);
            g.members.forEach((m, i) => {
                const at = { ...place.at[i], ry: 0 };
                // Who stands where in the crowd, for the dance (startDance).
                (state.families[g.key] ||= []).push({ index: list.length, look: m.look, prop: m.prop, at });
                list.push({ ...m, at });
            });
        }
    }
    crowd.set(list, crowdMoment(performance.now()));
    // Each family's middle, for the crowd shot.
    const centers = {};
    for (const m of list) {
        if (m.group === 'crowd' || m.group === 'volunteer') continue;
        const c = (centers[m.group] ||= { x: 0, z: 0, n: 0 });
        c.x += m.at.x;
        c.z += m.at.z;
        c.n++;
    }
    state.familyCenters = Object.fromEntries(Object.entries(centers).map(([k, c]) => [k, { x: c.x / c.n, z: c.z / c.n }]));
}

/** What the people are doing now (crowd.poseAt's moment). Reduced motion
 *  holds every pose still, nobody hopping (`still`). */
function crowdMoment(now) {
    return { ...crowdMomentOf(now), still: state.reducedMotion };
}

function crowdMomentOf(now) {
    const day = state.day;
    const t = now / 1000;
    if (state.phase === 'race' && day) {
        const m = momentAt(day.plan, state.clock);
        const heat = day.race.heats[m.heat];
        const groups = new Set(day.entries.map((e) => (e.mine ? 'mine' : e.id)));
        let won = null;
        if (m.segment.kind === 'times' && heat) {
            const first = heatOrder(heat)[0];
            const e = day.entries[first.car];
            won = e.mine ? 'mine' : e.id;
        } else if (m.segment.kind === 'dance') {
            won = champKey(day);
        }
        return { kind: m.segment.kind, t, cheering: groups, won };
    }
    if (state.phase === 'results' && day) {
        const e = day.entries[day.race.standings[0]];
        return { kind: 'times', t, won: e.mine ? 'mine' : e.id };
    }
    if (state.phase === 'checkin' || state.phase === 'weighin') return { kind: 'staging', t };
    return { kind: 'idle', t };
}

function placeCar(mesh, s, lane) {
    const pose = carPose(trackParts.path, s, lane, mesh.car, CONFIG);
    mesh.group.position.set(pose.x, pose.y, pose.z);
    mesh.group.rotation.z = pose.angle;
    mesh.roll(s);
    return pose;
}

/**
 * Go: the race, if the cars may enter it. Go at check-in and the host's
 * Race again weigh the visitor's cars in first (M5.2); Race again from the
 * results and the next division up race at once, the car weighed already.
 */
function startRace(how = 'go') {
    if (!state.isLoaded) return false;
    const entries = entriesFor(state.event);
    if (!entries.some((e) => e.mine)) {
        note(state.event === 'trial' ? UI.pickOne : ENTRY.noneEligible);
        return false;
    }
    if (entries.length > LANES) {
        note(UI.tooMany);
        return false;
    }
    if (how === 'go' || how === 'host') {
        startWeighIn(entries, how);
        return true;
    }
    beginRace(entries, how);
    return true;
}

/** Run the race now, then play it. */
function beginRace(entries, how) {
    hideBench();
    hideWeighIn();
    stageCars(entries);
    const cars = meshes.map((m) => m.car);
    const race = runRace(cars, CONFIG, { record: CONFIG.timing.record });
    const focus = state.event === 'trial' ? null : 0;
    // The finale's dance needs a family by the track: a friend's car (M8)
    // brings none.
    const champ = entries[race.standings[0]];
    const dances = Boolean(dancer) && (champ.mine || Boolean(CONFIG.families[champ.id]));
    const plan = planDay(race, { focus, reducedMotion: state.reducedMotion, dance: dances }, CONFIG);
    // The day's dance, picked now, never the last one again.
    const dance = pickDance(Math.random(), state.lastDance);
    state.lastDance = dance;
    state.day = { entries, cars, race, plan, event: state.event, dance, mine: new Set(entries.map((e, i) => (e.mine ? i : -1)).filter((i) => i >= 0)) };
    state.clock = 0;
    state.said = '';
    state.counted = '';
    state.lastS = entries.map(() => 0);
    state.beeped = new Set();
    state.phase = 'race';
    if (el.blocker) el.blocker.classList.add('hidden');
    hideResults();
    timer.build(entries.map((e) => e.name), state.day.mine, LANES);
    setRaceChrome(true);
    if (el['skip-btn']) el['skip-btn'].textContent = UI.skip;
    announce('');
    holdFocusOnScene();
    track('race-start', { kind: state.event, outcome: `cars=${entries.map((e) => e.id).join('.')}&how=${how}` });
}

// ---- The weigh-in (M5.2) ------------------------------------------------------

/** The weigh-in: the visitor's cars to the registration table, one at a
 *  time, the neighbors' waiting at the pin. */
function startWeighIn(entries, how) {
    hideBench();
    hideResults();
    hideWeighIn();
    stageCars(entries);
    const mine = entries.map((e, i) => (e.mine ? i : -1)).filter((i) => i >= 0);
    const plan = planWeighIn(mine.map((i) => entries[i].build), { reducedMotion: state.reducedMotion }, CONFIG);
    state.weigh = { plan, entries, mine, how, t: 0, said: '', failed: null };
    state.phase = nextPhase('checkin', 'go');
    if (el.blocker) el.blocker.classList.add('hidden');
    if (el['help-btn']) el['help-btn'].classList.add('visible');
    if (el['skip-btn']) {
        el['skip-btn'].textContent = UI.skipWeighIn;
        el['skip-btn'].classList.add('visible');
    }
    announce('');
    holdFocusOnScene();
    weighCamera();
    stepWeighIn(0);
}

/**
 * The weigh-in and the race take focus off whatever started them: Go and
 * check-in's card, the results' Race again and Try the next division with
 * their card, Skip the weigh-in (hidden at the first staging) all hide, and
 * focus left on a hidden control is on nothing. It goes to the scene itself
 * (a holder, not a tab stop), so a held or repeated Enter presses nothing,
 * and Tab goes on to the back arrow. The back arrow and the sound button
 * stay on screen throughout, so focus on either is left where it is.
 */
function holdFocusOnScene() {
    const here = document.activeElement;
    if (here && (here === el['help-btn'] || here === el['sound-btn'])) return;
    const scene = el['game-canvas'];
    if (scene && typeof scene.focus === 'function') scene.focus({ preventScroll: true });
}

/** The weigh-in's camera: wide on the volunteer as the car is set down,
 *  easing in to the scale as it counts, close after. Reduced motion holds
 *  the wide view still. */
function weighCamera(kind = 'place', progress = 0) {
    if (!camera || !registration) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    let wide = 0;
    if (state.reducedMotion || kind === 'place') wide = 1;
    else if (kind === 'count') wide = 1 - progress * progress * (3 - 2 * progress);
    aim(registration.shot(camera.aspect, wide));
}

/** Where a family stands (its middle), for the crowd shot: the group's,
 *  or the visitor's, or just before the finish. */
function familyFocus(key) {
    const c = state.familyCenters || {};
    return c[key] || c.mine || { x: CONFIG.track.courseLength - 1.5, z: CONFIG.crowd.familyZ };
}

/** Why a car did not pass, in the visitor's units: { by (how far over or
 *  under, written), note (the rule's polite note), line (the weigh-in's
 *  sentence) }. */
function weighWhy(verdict, name) {
    const units = garage.settings().units;
    const bad = verdict.checks.find((c) => !c.ok);
    if (!bad) return { by: '', note: '', line: '' };
    const amount = Math.abs(bad.value - bad.limit) * (bad.rule === 'mass' ? OZ : IN);
    const by = bad.rule === 'mass' ? U.mass(amount, units) : U.length(amount, units);
    const note = ruleNote(bad.rule, by);
    return { by, note, line: bad.rule === 'mass' ? WEIGH.over(name, by) : WEIGH.shape(name, note) };
}

/** One frame of the weigh-in. */
function stepWeighIn(dt) {
    const w = state.weigh;
    if (!w || w.failed) return;
    w.t += dt;
    const m = weighMoment(w.plan, w.t);
    const units = garage.settings().units;
    // The car being weighed on the table, the others at the pin.
    w.mine.forEach((idx, k) => {
        const mesh = meshes[idx];
        if (!mesh) return;
        if (k === m.car && !m.done) {
            const at = registration.carAt(m.kind, m.progress);
            mesh.group.position.set(at.x, at.y, at.z);
            mesh.group.rotation.z = 0;
        } else {
            placeCar(mesh, 0, idx);
        }
    });
    weighCamera(m.kind, m.progress);
    const verdict = w.plan.verdicts[m.car];
    const entry = w.entries[w.mine[m.car]];
    registration.setReading(U.mass(verdict.car.mass * readingShare(m.kind, m.progress), units), m.kind === 'over');
    const key = `${m.car}:${m.kind}`;
    if (key !== w.said) {
        w.said = key;
        const massText = U.mass(verdict.car.mass, units);
        if (m.kind === 'place') caption(WEIGH.onScale(entry.name));
        else if (m.kind === 'hold' || m.kind === 'still') {
            sound.beep();
            caption(WEIGH.reading(massText));
            // Reduced motion's one still step is the pass itself: no result
            // step follows to say so.
            if (m.kind === 'still') announce(WEIGH.spoken(entry.name, massText, true));
        } else if (m.kind === 'gauge') caption(WEIGH.gauge);
        else if (m.kind === 'result') {
            caption(WEIGH.passed(entry.name));
            announce(WEIGH.spoken(entry.name, massText, true));
        } else if (m.kind === 'over' || m.kind === 'stuck') {
            sound.buzz();
            caption(weighWhy(verdict, entry.name).line);
            announce(WEIGH.spoken(entry.name, massText, false));
        }
    }
    if (!m.done) return;
    if (w.plan.failedAt >= 0) weighFail();
    else beginRace(w.entries, w.how);
}

/** A car that did not pass: the note, and the one way on, the bench. */
function weighFail() {
    const w = state.weigh;
    const verdict = w.plan.verdicts[w.plan.failedAt];
    const entry = w.entries[w.mine[w.plan.failedAt]];
    const why = weighWhy(verdict, entry.name);
    w.failed = { id: entry.id, name: entry.name, why: why.note };
    if (el['skip-btn']) el['skip-btn'].classList.remove('visible');
    caption('');
    if (el['weighin-text']) el['weighin-text'].textContent = why.line;
    if (el['weighin-note']) el['weighin-note'].classList.remove('hidden');
    const back = el['weighin-back'];
    if (back && typeof back.focus === 'function') back.focus({ preventScroll: true });
    track('weigh-in', { kind: verdict.failed, outcome: 'failed' });
}

/** Skip the weigh-in: straight to the race, or to the note of a car that
 *  would not have passed. */
function skipWeighIn() {
    const w = state.weigh;
    if (!w || w.failed) return;
    if (w.plan.failedAt >= 0) weighFail();
    else beginRace(w.entries, w.how);
}

/** From the note, back to the bench with the car that did not pass. */
function weighInBack() {
    const w = state.weigh;
    if (!w || !w.failed) return;
    garage.setBench(w.failed.id);
    const { name, why } = w.failed;
    hideWeighIn();
    state.phase = nextPhase('weighin', 'fail');
    showBench('weighin', { name, why });
}

function hideWeighIn() {
    if (el['weighin-note']) el['weighin-note'].classList.add('hidden');
    state.weigh = null;
}

/** The race chrome: the timer, the help button, the Skip button, the
 *  visitor's tag, the announcer's caption. */
function setRaceChrome(on) {
    if (timer) timer.show(on);
    if (el['help-btn']) el['help-btn'].classList.toggle('visible', on);
    if (!on) {
        if (el['skip-btn']) el['skip-btn'].classList.remove('visible');
        if (el['you-tag']) el['you-tag'].classList.remove('visible');
        caption('');
        countdown(null);
        photoFrame(null);
        stopDance();
    }
}

function caption(text) {
    const c = el.caption;
    if (!c) return;
    c.textContent = text;
    c.classList.toggle('visible', Boolean(text));
}

/**
 * The countdown before a heat, big in the middle of the screen: 3, 2, 1,
 * then Go! (`n` 0) as the gate drops, or nothing (null). A beep for each
 * new count, the octave above for Go. For the eye only: a screen reader
 * hears the heat's start once, as the staging begins (stepRace).
 */
function countdown(n) {
    const text = n === null || n === undefined ? '' : n === 0 ? COUNT.go : String(n);
    if (text === state.counted) return;
    state.counted = text;
    const c = el.countdown;
    if (c) {
        c.textContent = text;
        c.classList.toggle('visible', Boolean(text));
        // Each count pops in afresh: two names for the same animation,
        // swapped, restart it.
        if (text) c.classList.toggle('is-alt');
    }
    if (text) sound.count(n === 0);
}

/** The photo finish's frame over the frozen picture (for the eye: the
 *  same words are announced), or none. */
function photoFrame(close) {
    const key = close ? `${close.first}:${close.gap}` : '';
    if (key === state.photo) return;
    state.photo = key;
    const f = el['photo-finish'];
    if (!f) return;
    f.classList.toggle('visible', Boolean(close));
    if (close && el['photo-gap']) el['photo-gap'].textContent = `${state.day.entries[close.first].name} · ${gapWords(close.gap)}`;
}

function announce(text) {
    const r = el['race-status'];
    if (r) r.textContent = text;
}

/** The family the day's winner belongs to: 'mine' or the neighbor's id. */
function champKey(day) {
    const e = day.entries[day.race.standings[0]];
    return e.mine ? 'mine' : e.id;
}

/** The day's winner's grown-up steps out of the crowd and dances in its
 *  place (Steve, 2026-10-20). Nothing when the family has no grown-up. */
function startDance() {
    const day = state.day;
    const family = (state.families || {})[champKey(day)] || [];
    const k = dancerOf(family, CONFIG.crowd.kidScale);
    if (k < 0 || !dancer || !crowd) return;
    const m = family[k];
    crowd.stepAside(m.index);
    dancer.start(m.look, m.at, day.dance);
    state.dance = { at: m.at, index: m.index };
}

function stopDance() {
    if (crowd) crowd.stepAside(-1);
    if (dancer) dancer.stop();
    state.dance = null;
}

/** One frame of the race day. */
function stepRace(dt) {
    const day = state.day;
    if (!day) return;
    state.clock += dt;
    const m = momentAt(day.plan, state.clock);
    if (m.done) {
        finishRace('finish');
        return;
    }
    const heat = day.race.heats[m.heat];
    const kind = m.segment.kind;
    let leadS = 0;
    let minePose = null;
    let speed = 0;
    heat.forEach((r, i) => {
        const run = day.race.runs[i][r.lane];
        const s = positionAt(run, m.runTime, CONFIG);
        if (s > leadS) leadS = s;
        if (dt > 0) speed += Math.max(0, s - (state.lastS[i] || 0)) / dt;
        state.lastS[i] = s;
        const pose = placeCar(meshes[i], s, r.lane);
        if (i === 0 && state.event !== 'trial') minePose = pose;
        // The timer's beep as each car crosses, once a heat.
        const beepKey = `${m.heat}:${i}`;
        if (kind === 'run' && m.runTime >= run.time && !state.beeped.has(beepKey)) {
            state.beeped.add(beepKey);
            sound.beep();
        }
    });
    // The wheels, louder the faster the field (a slow replay is quieter).
    sound.roll(kind === 'run' || kind === 'replay' ? speed / (heat.length * 5) : 0);
    const seg = m.segment;
    trackParts.gate.set(kind === 'staging' ? 0 : kind === 'gate' ? Math.min(1, (state.clock - seg.from) / (seg.to - seg.from)) : 1);
    countdown(countAt(seg, state.clock, CONFIG));
    photoFrame(kind === 'photo' ? seg.close : null);

    const shot = shotFor(kind, leadS, { reducedMotion: state.reducedMotion }, CONFIG);
    if (kind === 'dance') {
        if (!state.dance) startDance();
        if (state.dance) {
            dancer.pose(state.clock - seg.from);
            aim(danceFraming(state.dance.at, window.innerWidth / window.innerHeight, CONFIG));
        }
    } else if (kind === 'times' && !state.reducedMotion) {
        // The heat's times: the people, the winner's family in the middle.
        const first = heatOrder(heat)[0];
        const e = day.entries[first.car];
        aim(crowdFraming(familyFocus(e.mine ? 'mine' : e.id), window.innerWidth / window.innerHeight, CONFIG));
    } else {
        aim(framing(shot, trackParts.path, leadS, window.innerWidth / window.innerHeight, CONFIG));
    }

    // The timer: each lane's car, and its time once it is across.
    const order = heatOrder(heat);
    const byLane = new Array(LANES).fill(null);
    for (const r of heat) {
        const run = day.race.runs[r.car][r.lane];
        // In the photo, only the winner is across: it is the instant its
        // nose met the line.
        const across = kind === 'times' || kind === 'dance' || kind === 'replay' || ((kind === 'run' || kind === 'photo') && m.runTime >= run.time);
        byLane[r.lane] = { car: r.car, time: across ? r.time : null, place: across ? order.indexOf(r) + 1 : null };
    }
    timer.lanes(byLane);
    // The timer over the finish line shows the same (M6.1).
    if (dressing) dressing.timer.set({ heat: m.heat + 1, total: day.race.heats.length, lanes: byLane });

    // The announcer calls the leader as the field comes off the slope.
    const callKey = `${m.heat}:lead`;
    if (kind === 'run' && m.runTime > 1.5 && state.called !== callKey) {
        state.called = callKey;
        const lead = heat.slice().sort((a, b) => day.race.runs[a.car][a.lane].time - day.race.runs[b.car][b.lane].time)[0];
        const e = day.entries[lead.car];
        caption(e.mine && state.event !== 'trial' ? CALLS.leadMine(e.name) : CALLS.lead(e.name));
    }

    const key = `${m.heat}:${kind}`;
    if (key !== state.said) {
        state.said = key;
        const n = m.heat + 1;
        const total = day.race.heats.length;
        timer.heat(n, total, kind === 'replay' ? UI.replay : kind === 'photo' ? UI.photo : '');
        if (kind === 'staging') {
            caption(staging(n, total));
            announce(COUNT.spoken(n, total));
        } else if (kind === 'gate') {
            caption(gateCall(n, total));
            // Spoken too, once a heat: otherwise a screen reader hears
            // nothing from the weigh-in to each heat's times.
            announce(gateCall(n, total));
            sound.gate();
        } else if (kind === 'replay') caption(UI.replay);
        else if (kind === 'photo') {
            // The photo finish: everything stopped on the winner's crossing.
            const line = CALLS.photo(day.entries[seg.close.first].name, seg.close.gap);
            caption(line);
            announce(line);
            sound.shutter();
        }
        else if (kind === 'times') {
            const first = order[0];
            const second = order[1];
            caption(second && second.time - first.time < 0.005
                ? CALLS.close(n, day.entries[first.car].name, first.time)
                : heatWinner(n, day.entries[first.car].name, first.time));
            announce(heatSpoken(n, order.map((r, i) => ({ name: day.entries[r.car].name, time: r.time, place: i + 1 }))));
        } else if (kind === 'dance') {
            const champ = day.entries[day.race.standings[0]];
            const line = CALLS.dance(champ.name, danceOf(day.dance).name, champ.mine);
            caption(line);
            announce(line);
        }
        // Skip, once the first heat has been seen through.
        if (el['skip-btn']) el['skip-btn'].classList.toggle('visible', m.heat >= 1 || kind === 'times');
    }
    tagMine(minePose);
}

/** The "You" tag over the visitor's car, where it is on screen. */
function tagMine(pose) {
    const tag = el['you-tag'];
    if (!tag) return;
    if (!pose || !camera) {
        tag.classList.remove('visible');
        return;
    }
    const v = new THREE.Vector3(pose.x - 0.09, pose.y + 0.07, pose.z).project(camera);
    const onScreen = v.z < 1 && v.x > -1 && v.x < 1 && v.y > -1 && v.y < 1;
    tag.classList.toggle('visible', onScreen);
    if (onScreen) {
        tag.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
        tag.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
    }
}

function aim({ position, target }) {
    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(target.x, target.y, target.z);
}

/** The view behind the check-in card: down the whole track from the
 *  start end, still. */
function idleCamera() {
    if (!camera) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    aim(framing('start', trackParts.path, 0, camera.aspect, CONFIG));
}

/** The race is over (or skipped): the results. */
function finishRace(how) {
    const day = state.day;
    if (!day || state.phase !== 'race') return;
    state.phase = nextPhase('race', how === 'skip' ? 'skip' : 'finish');
    // The cars as the last heat left them, past the line.
    const last = day.race.heats[day.race.heats.length - 1];
    last.forEach((r, i) => placeCar(meshes[i], positionAt(day.race.runs[i][r.lane], 99, CONFIG), r.lane));
    setRaceChrome(false);
    // Behind the results, the people: the day's winner's family.
    const champ = day.entries[day.race.standings[0]];
    aim(crowdFraming(familyFocus(champ.mine ? 'mine' : champ.id), window.innerWidth / window.innerHeight, CONFIG));
    day.won = recordDay(day);
    showResults();
    const place = day.race.standings.indexOf(0) + 1;
    sound.roll(0);
    track(how === 'skip' ? 'race-skip' : 'race-end', { kind: state.event, outcome: state.event === 'trial' ? `cars=${day.entries.length}` : `place=${place}` });
}

/**
 * The race into the garage (M3.6): each of the visitor's cars' result, its
 * best kept, and a division won put on the trophy shelf. Returns
 * { event, isNew } for a win, or null.
 */
function recordDay(day) {
    const event = day.event;
    // A friend's challenge is between the two of them: no best, no trophy.
    if (event === 'challenge') return null;
    if (event === 'trial') {
        // The winner last, so it is the result the host remembers.
        for (const i of day.race.standings.slice().reverse()) garage.record(day.entries[i].id, 'trial', { average: day.race.average[i] });
        return null;
    }
    const place = day.race.standings.indexOf(0) + 1;
    garage.record(day.entries[0].id, event, { place, average: day.race.average[0] });
    if (place !== 1) return null;
    const isNew = garage.award(event);
    return { event, isNew };
}

/** What the Why lines are measured against: the kit block, and the best
 *  shape in the hall. */
function whyRefs() {
    const kit = describeCar(buildFromDesign('block', {}, CONFIG), CONFIG);
    return {
        kitMass: kit.mass,
        blockCdA: kit.cdA,
        bestCdA: describeCar(buildFromField(CONFIG.field[CONFIG.field.length - 1], CONFIG), CONFIG).cdA,
        idealBalance: 0.75 * IN
    };
}

/** The limit and the sweet spot as the Why lines say them, and whether
 *  the body is too bulky for its weight to go back (M4.6). */
function whyWords(car, build) {
    const units = garage.settings().units;
    return {
        maxMass: car.rules === 'outlaw' ? '16 ounces' : '5 ounces',
        idealText: units === 'metric' ? U.length(0.75 * IN, 'metric') : 'three quarters of an inch',
        bulky: Boolean(build) && bestBalance(build, CONFIG) > 0.875 * IN + 0.1 * IN
    };
}

/** The visitor's Why lines: their car against the kit and the best. */
export function whyFor(day) {
    if (day.event === 'challenge') return challengeLines(day);
    if (day.event === 'trial') {
        return trialLines(day.race.standings.map((i) => ({ name: day.entries[i].name, average: day.race.average[i] })));
    }
    const car = day.cars[0];
    const refs = whyRefs();
    day.explained = explain(car, refs, CONFIG);
    return whyLines(day.explained, car, refs.idealBalance, whyWords(car, day.entries[0].build));
}

/** The host's tip back at the bench: the biggest gain left, said. */
function tuneTip(day) {
    // Lost a challenge: the host points at what beat it (M8).
    if (day && day.event === 'challenge') {
        const e = day.edge;
        if (!e || e.mine) return null;
        const id = e.id === 'align' ? 'alignment' : e.id === 'sand' ? 'shape' : 'axles';
        return { top: { id, more: e.worth }, sentence: CH.theirEdge(edgeWords(e), clock(e.worth)) };
    }
    if (!day || day.event === 'trial' || !day.explained) return null;
    let top = gains(day.explained)[0] || null;
    const car = day.cars[0];
    const words = whyWords(car, day.entries[0].build);
    const sentence = top ? moreLine(top, car, 0.75 * IN, words) : '';
    // A bulky body's balance is fixed in Shape, by carving, not in Weights.
    if (top && top.id === 'balance' && words.bulky) top = { ...top, id: 'shape' };
    return { top, sentence };
}

function showResults() {
    const day = state.day;
    const names = day.entries.map((e) => e.name);
    const trial = day.event === 'trial';
    fillResults({
        table: el['results-table'], lanesEl: el['results-lanes'], whyEl: el['results-why'], whyHeading: el['results-why-heading']
    }, day.race, names, trial ? new Set() : day.mine, whyFor(day),
    trial ? UI.trialHeading : day.event === 'challenge' ? CH.heading : UI.whyHeading);
    if (el['results-challenge']) el['results-challenge'].textContent = day.event === 'challenge' ? CH.sendBack : CH.send;
    if (el['results-event']) el['results-event'].textContent = eventLabel(day.event);
    // What each tune-up was worth (M5's Done-when), for the visitor's one car.
    const list = el['results-tuneups'];
    if (list) {
        list.textContent = '';
        const lines = trial || day.event === 'challenge' ? [] : tuneupLines(tuneupWorth(day.entries[0].build, CONFIG));
        for (const line of lines) {
            const li = document.createElement('li');
            li.textContent = line;
            list.appendChild(li);
        }
        list.hidden = !lines.length;
        if (el['results-tuneups-heading']) el['results-tuneups-heading'].hidden = !lines.length;
    }
    // A win: the trophy, and the next division up (PRD, Next steps).
    const trophy = el['results-trophy'];
    if (trophy) {
        trophy.textContent = day.won ? trophyLine(day.won.event, day.won.isNew) : '';
        trophy.hidden = !day.won;
    }
    const harder = el['results-harder'];
    if (harder) {
        const label = day.won ? harderLabel(day.event) : '';
        harder.textContent = label;
        harder.hidden = !label;
    }
    const modal = el['results-modal'];
    if (modal) modal.classList.remove('hidden');
    const rows = day.race.standings.map((i, k) => ({ name: names[i], average: day.race.average[i], place: k + 1 }));
    if (el['results-status']) el['results-status'].textContent = resultsSpoken(day.event, rows);
    const title = el['results-title'];
    if (title && typeof title.focus === 'function') title.focus({ preventScroll: true });
}

/** Tune my car: the car that raced back on the bench, the host saying what
 *  would help it most. */
function tuneCar() {
    const day = state.day;
    if (!day || state.phase !== 'results') return;
    const first = day.entries.find((e) => e.mine);
    if (first) garage.setBench(day.event === 'trial' ? day.entries[day.race.standings[0]].id : first.id);
    track('race-tune', { kind: day.event });
    showBench('tune', tuneTip(day));
}

/** Try the next division up, straight away, with the same car. */
function raceHarder() {
    const day = state.day;
    if (!day || !HARDER[day.event]) return;
    state.event = HARDER[day.event];
    startRace('harder');
}

function hideResults() {
    if (el['results-modal']) el['results-modal'].classList.add('hidden');
}

function resultsShown() {
    return Boolean(el['results-modal']) && !el['results-modal'].classList.contains('hidden');
}

/** Escape and the back buttons: one step back. */
function stepBack(how) {
    if (!state.isLoaded) return;
    if (state.phase === 'race') track('race-leave', { kind: state.event, outcome: `how=${how}` });
    sound.roll(0);
    if (state.phase === 'race' || state.phase === 'results' || state.phase === 'weighin') showCheckin();
    else if (state.phase === 'checkin') showBench('step');
}

// ---- The sound (M2) -------------------------------------------------------------

function markSound() {
    const btn = el['sound-btn'];
    if (!btn) return;
    const on = sound.isOn();
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('title', on ? 'Sound on (M)' : 'Sound off (M)');
}

function toggleSound(how) {
    const on = sound.toggle();
    markSound();
    if (garage) garage.setSetting('sound', on);
    track('sound', { outcome: on ? 'on' : 'off', kind: how });
}

// ---- The share clip (M2) ----------------------------------------------------------

function clipShown() {
    return Boolean(el['clip-modal']) && !el['clip-modal'].classList.contains('hidden');
}

/** The car the clip is about: the visitor's, or the Time Trial's winner. */
function clipFocus(day) {
    return state.event === 'trial' ? day.race.standings[0] : 0;
}

/** The board's rows, fastest first. */
function boardRows(day) {
    const mine = state.event === 'trial' ? new Set() : day.mine;
    return day.race.standings.map((i, k) => ({ place: k + 1, name: day.entries[i].name, average: day.race.average[i], mine: mine.has(i) }));
}

function clipSize() {
    const K = CONFIG.clip;
    return state.isMobile ? { w: K.mobileWidth, h: K.mobileHeight } : { w: K.width, h: K.height };
}

/** The clip's own renderer, made once, drawing the same hall. */
function ensureClipRenderer(w, h) {
    if (!clipRenderer) {
        clipCanvas = document.createElement('canvas');
        clipRenderer = new THREE.WebGLRenderer({ canvas: clipCanvas, antialias: true, powerPreference: 'high-performance' });
        clipRenderer.toneMapping = THREE.NeutralToneMapping || THREE.NoToneMapping;
        clipRenderer.toneMappingExposure = CONFIG.render.exposure;
        clipRenderer.setPixelRatio(1);
        clipCamera = new THREE.PerspectiveCamera(CONFIG.camera.fov, w / h, CONFIG.camera.near, CONFIG.camera.far);
    }
    clipRenderer.setSize(w, h, false);
    clipCamera.aspect = w / h;
    clipCamera.updateProjectionMatrix();
}

function clipText(text) {
    if (el['clip-progress']) el['clip-progress'].textContent = text;
}

function clipSay(text) {
    if (el['clip-status']) el['clip-status'].textContent = text;
}

/** Let go of a made clip's file and video. */
function releaseClip() {
    const c = state.clip;
    if (!c) return;
    if (c.recording && c.rec) {
        c.cancelled = true;
        try { c.rec.recorder.stop(); } catch (e) { /* already stopped */ }
    }
    sound.setRecording(false);
    sound.roll(0);
    if (c.url) URL.revokeObjectURL(c.url);
    state.clip = null;
}

/** Share my race: open the card and start making the clip at once. */
function openClip() {
    const day = state.day;
    if (!day || state.phase !== 'results') return;
    releaseClip();
    // The picture first, so it is ready before anybody asks for it.
    stillFor(day);
    const modal = el['clip-modal'];
    if (modal) modal.classList.remove('hidden');
    const stage = el['clip-stage'];
    if (stage) stage.textContent = '';
    if (el['clip-share']) el['clip-share'].hidden = true;
    if (el['clip-again']) el['clip-again'].hidden = true;
    const title = el['clip-title'];
    if (title && typeof title.focus === 'function') title.focus({ preventScroll: true });
    const mime = canRecord(window) ? pickMime((t) => window.MediaRecorder.isTypeSupported(t)) : '';
    if (!mime) {
        clipText('This browser can’t make a video, but you can save a picture of your race.');
        track('clip-unsupported', { kind: state.event });
        return;
    }
    const { w, h } = clipSize();
    ensureClipRenderer(w, h);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.setAttribute('aria-hidden', 'true');
    // Reduced motion: the clip's orbit and slow finish are recorded, not
    // watched. The canvas stays in the stage (a recording wants it laid out)
    // but unseen, with the countdown under it.
    out.classList.toggle('is-unseen', state.reducedMotion);
    if (stage) stage.appendChild(out);
    const g = out.getContext('2d');
    // Sound: made now (this is a gesture), recorded whatever the speakers say.
    sound.ensure();
    const include = !el['clip-sound'] || el['clip-sound'].checked;
    sound.setRecording(true, include);
    const stream = out.captureStream(CONFIG.clip.fps);
    const audio = sound.recordStream();
    if (audio && audio.getAudioTracks) for (const t of audio.getAudioTracks()) stream.addTrack(t);
    let rec;
    try {
        rec = startRecording(stream, mime, { bitrate: state.isMobile ? CONFIG.clip.mobileBitrate : CONFIG.clip.bitrate, win: window });
    } catch (e) {
        sound.setRecording(false);
        clipText('This browser can’t make a video, but you can save a picture of your race.');
        track('clip-unsupported', { kind: state.event, outcome: 'start-failed' });
        return;
    }
    const focus = clipFocus(day);
    state.clip = {
        plan: planClip(day.race, focus, CONFIG), focus, t: 0, recording: true, rec, g, out, w, h, mime,
        said: '', beeped: new Set(), lastS: day.entries.map(() => 0), shown: -1
    };
    clipText('Making your clip…');
    clipSay('Making your clip. It takes about fifteen seconds.');
    track('clip-start', { kind: state.event, outcome: `sound=${include ? 'on' : 'off'}` });
    rec.done.then((blob) => finishedClip(blob)).catch(() => {
        clipText('Something went wrong making the video, but you can save a picture of your race.');
    });
}

/** One frame of the clip: pose the cars, render, write the words. */
function stepClip(dt) {
    const c = state.clip;
    const day = state.day;
    c.t += dt;
    const m = clipMoment(c.plan, c.t);
    const heat = day.race.heats[c.plan.heatIndex];
    let leadS = 0;
    let speed = 0;
    let focusPose = null;
    heat.forEach((r, i) => {
        const run = day.race.runs[i][r.lane];
        const s = positionAt(run, m.runTime, CONFIG);
        if (s > leadS) leadS = s;
        if (dt > 0 && (m.kind === 'run' || m.kind === 'slow')) speed += Math.max(0, s - (c.lastS[i] || 0)) / dt;
        c.lastS[i] = s;
        const pose = placeCar(meshes[i], s, r.lane);
        if (i === c.focus) focusPose = pose;
        if (m.kind === 'run' && m.runTime >= run.time && !c.beeped.has(i)) {
            c.beeped.add(i);
            sound.beep();
        }
    });
    trackParts.gate.set(m.kind === 'car' || m.kind === 'staging' ? 0 : m.kind === 'gate' ? m.progress : 1);
    sound.roll(speed / (heat.length * 5));
    if (m.kind !== c.said) {
        c.said = m.kind;
        if (m.kind === 'gate') sound.gate();
    }
    const shot = clipFraming(m, { path: trackParts.path, pose: focusPose, carLength: CONFIG.kit.length, leadS, aspect: c.w / c.h }, CONFIG);
    clipCamera.position.set(shot.position.x, shot.position.y, shot.position.z);
    clipCamera.lookAt(shot.target.x, shot.target.y, shot.target.z);
    clipRenderer.render(scene, clipCamera);
    c.g.drawImage(clipCanvas, 0, 0, c.w, c.h);
    const lane = heat[c.focus].lane;
    drawClipFrame(c.g, c.w, c.h, {
        kind: m.kind,
        progress: m.progress,
        carName: day.entries[c.focus].name,
        eventLabel: eventLabel(state.event),
        heatLabel: `Heat ${c.plan.heatIndex + 1} · Lane ${lane + 1}`,
        crossed: (m.kind === 'run' || m.kind === 'slow') && m.runTime >= c.plan.crossing,
        time: c.plan.time,
        place: c.plan.place,
        rows: boardRows(day),
        url: CONFIG.clip.url
    });
    const left = Math.max(0, Math.ceil(c.plan.total - c.t));
    if (left !== c.shown) {
        c.shown = left;
        clipText(left > 0 ? `Making your clip… ${left} ${left === 1 ? 'second' : 'seconds'} to go` : 'Finishing…');
    }
    if (m.done) {
        c.recording = false;
        sound.setRecording(false);
        sound.roll(0);
        try { c.rec.recorder.stop(); } catch (e) { /* already stopped */ }
        restCars();
    }
}

/** The cars back where the race left them, past the line. */
function restCars() {
    const day = state.day;
    if (!day) return;
    const last = day.race.heats[day.race.heats.length - 1];
    last.forEach((r, i) => placeCar(meshes[i], positionAt(day.race.runs[i][r.lane], 99, CONFIG), r.lane));
    trackParts.gate.set(1);
}

/** The clip is made: play it in the stage, ready to share or save. */
function finishedClip(blob) {
    const c = state.clip;
    if (!c || c.cancelled) return;
    c.blob = blob;
    c.url = URL.createObjectURL(blob);
    c.name = fileName(state.day.entries[c.focus].name, extensionOf(blob.type || c.mime));
    const video = document.createElement('video');
    video.src = c.url;
    video.muted = true;
    video.loop = true;
    // Reduced motion: the clip waits for its play button.
    video.autoplay = !state.reducedMotion;
    video.playsInline = true;
    video.controls = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-label', 'Your race clip');
    const stage = el['clip-stage'];
    if (stage) {
        stage.textContent = '';
        stage.appendChild(video);
    }
    if (!state.reducedMotion && typeof video.play === 'function') {
        const p = video.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    const share = el['clip-share'];
    if (share) {
        share.textContent = canShareFiles(blob.type) ? 'Share video' : 'Save video';
        share.hidden = false;
    }
    if (el['clip-again']) el['clip-again'].hidden = false;
    const seconds = Math.round(c.plan.total);
    clipText(`Your clip is ready, ${seconds} seconds long.`);
    clipSay('Your clip is ready to share.');
    track('clip-made', { kind: extensionOf(blob.type || c.mime), seconds });
}

/** The sentence that goes with a shared clip or picture. */
function shareLine() {
    const day = state.day;
    const focus = clipFocus(day);
    // The clip's link is a challenge too (M8): whoever watches can race it.
    const url = challengeUrl(window.location.href, day.entries[focus].build, garage.settings().from, CONFIG);
    return `${day.entries[focus].name} averaged ${clock(day.race.average[focus])} seconds at Derby Day. Can you beat it? ${url}`;
}

/** Share the clip, or save it where sharing a file is not possible. */
async function shareClip() {
    const c = state.clip;
    if (!c || !c.blob) return;
    const how = await shareFile(c.blob, c.name, { title: 'Derby Day', text: shareLine() });
    if (how === 'unavailable') {
        saveFile(c.url, c.name);
        clipSay('Your clip is saved to your downloads.');
    } else if (how === 'shared') {
        clipSay('Shared. Thank you for spreading the word.');
    }
    track('clip-share', { outcome: how === 'unavailable' ? 'saved' : how });
}

/**
 * The picture (M2.4): the car at the finish, the board over it, rendered
 * and encoded AHEAD of the tap that shares it. iPhone Safari opens the share
 * sheet only straight from a tap, and encoding a PNG takes a moment, so the
 * picture is made when the share card opens, and Save a picture hands over
 * what is ready. Resolves with the PNG, or null.
 */
function makeStill() {
    const day = state.day;
    if (!day || !trackParts) return Promise.resolve(null);
    const W = CONFIG.clip.still.width;
    const H = CONFIG.clip.still.height;
    ensureClipRenderer(W, H);
    restCars();
    const focus = clipFocus(day);
    const lastHeat = day.race.heats[day.race.heats.length - 1];
    const s = positionAt(day.race.runs[focus][lastHeat[focus].lane], 99, CONFIG);
    const pose = carPose(trackParts.path, s, lastHeat[focus].lane, meshes[focus].car, CONFIG);
    const shot = clipFraming({ kind: 'car', progress: 0.45 }, { path: trackParts.path, pose, carLength: CONFIG.kit.length, leadS: s, aspect: W / H }, CONFIG);
    clipCamera.position.set(shot.position.x, shot.position.y, shot.position.z);
    clipCamera.lookAt(shot.target.x, shot.target.y, shot.target.z);
    clipRenderer.render(scene, clipCamera);
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const g = out.getContext('2d');
    g.drawImage(clipCanvas, 0, 0, W, H);
    drawStill(g, W, H, { carName: day.entries[focus].name, eventLabel: eventLabel(state.event), rows: boardRows(day), url: CONFIG.clip.url });
    return new Promise((resolve) => {
        try {
            if (out.toBlob) out.toBlob((b) => resolve(b || null), 'image/png');
            else resolve(null);
        } catch (e) {
            resolve(null);
        }
    });
}

/** The day's picture, made once and kept (state.still). */
function stillFor(day) {
    if (!state.still || state.still.day !== day) {
        const entry = { day, blob: null, ready: null };
        entry.ready = makeStill().then((b) => {
            entry.blob = b;
            return b;
        });
        state.still = entry;
    }
    return state.still;
}

/** Save a picture: share the picture made ahead, or save it. */
async function shareStill() {
    const day = state.day;
    if (!day) return;
    if (state.clip && state.clip.recording) {
        clipSay('One moment, please. The clip is still being made.');
        return;
    }
    const entry = stillFor(day);
    const blob = entry.blob || await entry.ready;
    const focus = clipFocus(day);
    if (!blob) {
        clipSay('Sorry, this browser could not make the picture.');
        return;
    }
    const name = fileName(day.entries[focus].name, 'png').replace(/\.png$/, '-results.png');
    const how = await shareFile(blob, name, { title: 'Derby Day', text: shareLine() });
    if (how === 'unavailable') {
        const url = URL.createObjectURL(blob);
        saveFile(url, name);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        clipSay('Your picture is saved to your downloads.');
    } else if (how === 'shared') {
        clipSay('Shared. Thank you for spreading the word.');
    }
    track('image-share', { outcome: how === 'unavailable' ? 'saved' : how });
}

/** Done, or Escape: close the card, the clip let go, back to the results. */
function closeClip() {
    releaseClip();
    restCars();
    if (el['clip-modal']) el['clip-modal'].classList.add('hidden');
    const back = el['results-share'];
    if (back && typeof back.focus === 'function') back.focus({ preventScroll: true });
}

// ---- Challenge links (M8) -----------------------------------------------------------

/**
 * A challenge in the page's address, if any: 'ok' (state.challenge set, the
 * head to head chosen), 'bad' (a challenge link that did not decode or whose
 * car is not legal) or null (none). The link stays in the address, so a
 * reload keeps it.
 */
function readChallenge() {
    const hash = window.location.hash || '';
    if (!isChallenge(hash)) return null;
    const got = decodeChallenge(hash, CONFIG);
    track('challenge', { kind: 'open', outcome: got ? 'ok' : 'invalid' });
    if (!got) return 'bad';
    state.challenge = { ...got, name: rivalName(nameOf(got.build, [], CONFIG), got.from) };
    state.event = 'challenge';
    return 'ok';
}

/** The invitation at the top of check-in, while there is a challenge. */
function showInvite() {
    const p = el['checkin-invite'];
    if (!p) return;
    p.textContent = '';
    const r = state.challenge;
    p.hidden = !r;
    if (!r) return;
    p.appendChild(h('span', null, CH.invite(r.from, nameOf(r.build, [], CONFIG))));
    p.appendChild(h('small', null, CH.inviteMore));
}

/** Who won a head to head, by how much, and what made the difference. */
function challengeLines(day) {
    const [a, b] = [day.race.average[0], day.race.average[1]];
    const rival = day.entries[1].name;
    const won = day.race.standings[0] === 0;
    const gap = clock(Math.abs(a - b));
    const lines = [a === b ? CH.tie(rival) : won ? CH.won(rival, gap) : CH.lost(rival, gap)];
    const [winner, loser] = won ? [day.entries[0].build, day.entries[1].build] : [day.entries[1].build, day.entries[0].build];
    const edge = biggestEdge(winner, loser, CONFIG);
    day.edge = edge ? { ...edge, mine: won } : null;
    if (!edge) lines.push(CH.even);
    else lines.push(won ? CH.yourEdge(edgeWords(edge), clock(edge.worth)) : CH.theirEdge(edgeWords(edge), clock(edge.worth)));
    return lines;
}

function challengeShown() {
    return Boolean(el['challenge-modal']) && !el['challenge-modal'].classList.contains('hidden');
}

/** The card that sends a challenge: the race's car (the visitor's, or the
 *  Time Trial's winner), the first name last used filled in. */
function openChallengeCard() {
    const day = state.day;
    if (!day) return;
    const focus = clipFocus(day);
    const entry = day.entries[focus];
    state.sending = { build: entry.build, name: entry.name.replace(/ \(Outlaw\)$/, ''), average: day.race.average[focus] };
    if (el['challenge-text']) el['challenge-text'].textContent = CH.text(state.sending.name);
    if (el['challenge-from']) el['challenge-from'].value = garage.settings().from;
    if (el['challenge-link']) el['challenge-link'].hidden = true;
    if (el['challenge-status']) el['challenge-status'].textContent = '';
    if (el['challenge-modal']) el['challenge-modal'].classList.remove('hidden');
    const title = el['challenge-title'];
    if (title && typeof title.focus === 'function') title.focus({ preventScroll: true });
}

/** The link and the words for the challenge being sent, the name kept. */
function challengeOut() {
    const s = state.sending;
    const from = cleanFrom(el['challenge-from'] ? el['challenge-from'].value : '');
    garage.setSetting('from', from);
    return {
        url: challengeUrl(window.location.href, s.build, from, CONFIG),
        text: CH.shareText(from, s.name, clock(s.average))
    };
}

function challengeSay(text) {
    if (el['challenge-status']) el['challenge-status'].textContent = text;
}

/** Send the challenge: the share sheet where there is one, else the link
 *  copied. */
async function sendChallenge() {
    if (!state.sending) return;
    const out = challengeOut();
    const nav = typeof navigator === 'undefined' ? null : navigator;
    if (nav && typeof nav.share === 'function') {
        try {
            await nav.share({ title: 'Derby Day', text: out.text, url: out.url });
            challengeSay(CH.shared);
            track('challenge', { kind: 'send', outcome: 'shared' });
        } catch (e) {
            // Closed the sheet: nothing to say. Anything else: copy instead.
            if (e && e.name === 'AbortError') {
                track('challenge', { kind: 'send', outcome: 'cancelled' });
                return;
            }
            await copyChallenge('fallback');
        }
        return;
    }
    await copyChallenge('send');
}

/** Copy the challenge's link, or show it to copy by hand. */
async function copyChallenge(how) {
    if (!state.sending) return;
    const { url } = challengeOut();
    const nav = typeof navigator === 'undefined' ? null : navigator;
    try {
        await nav.clipboard.writeText(url);
        challengeSay(CH.copied);
        track('challenge', { kind: how === 'copy' ? 'copy' : 'send', outcome: 'copied' });
    } catch (e) {
        const box = el['challenge-link'];
        if (box) {
            box.value = url;
            box.hidden = false;
            if (typeof box.focus === 'function') box.focus({ preventScroll: true });
            if (typeof box.select === 'function') box.select();
        }
        challengeSay(CH.manual);
        track('challenge', { kind: how === 'copy' ? 'copy' : 'send', outcome: 'manual' });
    }
}

function closeChallengeCard() {
    if (el['challenge-modal']) el['challenge-modal'].classList.add('hidden');
    const back = el['results-challenge'];
    if (back && typeof back.focus === 'function') back.focus({ preventScroll: true });
}

// ---- Events -----------------------------------------------------------------

function setupEventListeners() {
    cleanupController = new AbortController();
    const signal = cleanupController.signal;
    const on = (id, type, fn) => {
        if (el[id]) el[id].addEventListener(type, fn, { signal });
    };
    on('go-btn', 'click', () => startRace('go'));
    on('skip-btn', 'click', () => (state.phase === 'weighin' ? skipWeighIn() : finishRace('skip')));
    on('weighin-back', 'click', weighInBack);
    on('help-btn', 'click', () => stepBack('help'));
    on('results-again', 'click', () => {
        track('race-again', { kind: state.event });
        startRace('again');
    });
    on('results-another', 'click', () => stepBack('another'));
    on('results-tune', 'click', tuneCar);
    on('results-harder', 'click', raceHarder);
    on('checkin-back', 'click', () => stepBack('checkin-back'));
    // The turntable turned by hand: a drag on the car's part of the screen.
    on('game-canvas', 'pointerdown', (e) => {
        if (state.phase === 'bench') state.drag = { x: e.clientX };
    });
    window.addEventListener('pointermove', (e) => {
        if (!state.drag) return;
        state.spin += (e.clientX - state.drag.x) * 0.012;
        state.drag.x = e.clientX;
    }, { signal });
    for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, () => { state.drag = null; }, { signal });
    on('results-share', 'click', openClip);
    on('results-challenge', 'click', openChallengeCard);
    on('challenge-send', 'click', sendChallenge);
    on('challenge-copy', 'click', () => copyChallenge('copy'));
    on('challenge-close', 'click', closeChallengeCard);
    // A challenge link opened in a tab already on the page.
    window.addEventListener('hashchange', () => {
        if (readChallenge() === 'ok' && state.isLoaded && ['bench', 'checkin', 'results'].includes(state.phase)) showCheckin();
    }, { signal });
    on('clip-share', 'click', shareClip);
    on('clip-image', 'click', shareStill);
    on('clip-again', 'click', openClip);
    on('clip-close', 'click', closeClip);
    on('clip-sound', 'change', () => {
        const c = state.clip;
        if (c && c.recording) sound.setRecording(true, el['clip-sound'].checked);
    });
    on('sound-btn', 'click', () => toggleSound('button'));
    document.addEventListener('keydown', onKeyDown, { signal });
    window.addEventListener('resize', onResize, { signal });
    window.addEventListener('pagehide', cleanup);
    installCardFocusTrap({ signal });
    installCardScrollReset({ signal });
}

function onKeyDown(event) {
    // M for the sound, unless a key is being typed somewhere (none yet, but
    // the workshop's name field will be, M4).
    const t = event.target;
    const typing = t && (t.tagName === 'INPUT' && t.type === 'text' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if ((event.key === 'm' || event.key === 'M') && !typing && !event.metaKey && !event.ctrlKey && !event.altKey && state.isLoaded) {
        toggleSound('key');
        return;
    }
    if (event.key === 'Escape' || event.code === 'Escape') {
        if (challengeShown()) {
            event.preventDefault();
            closeChallengeCard();
            return;
        }
        if (clipShown()) {
            event.preventDefault();
            closeClip();
            return;
        }
        if (state.phase === 'race' || state.phase === 'weighin' || resultsShown() || (state.phase === 'checkin' && checkinShown())) {
            event.preventDefault();
            stepBack('escape');
        }
    }
}

function onResize() {
    if (!renderer) return;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    if (state.phase === 'bench') benchCamera();
    else if (state.phase !== 'race') idleCamera();
}

function cleanup() {
    if (cleanupController) cleanupController.abort();
    if (renderer) renderer.setAnimationLoop(null);
    state.isRunning = false;
}

function animate() {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - state.lastTime) / 1000));
    state.lastTime = now;
    if (state.phase === 'race') stepRace(dt);
    if (state.phase === 'weighin') stepWeighIn(dt);
    // A photo finish is a still: the people in it stay as they were.
    if (crowd) {
        const moment = crowdMoment(now);
        if (moment.kind !== 'photo') crowd.pose(moment);
    }
    if (state.phase === 'bench' && workbench) {
        tools.update(dt);
        // Align rolls the car off the turntable and back.
        const off = tuneups.update(dt);
        state.benchOffset = off ? off.x : 0;
        holder.position.set(CONFIG.kit.length / 2 + state.benchOffset, 0, off ? off.z : 0);
        if (tools.turning() || tuneups.turning()) {
            // The Cut turns the car side on to the camera first.
            const side = Math.round(state.spin / (2 * Math.PI)) * 2 * Math.PI;
            state.spin += (side - state.spin) * Math.min(1, dt * 8);
        } else if (!state.reducedMotion && !state.drag) {
            state.spin += dt * CONFIG.workbench.spin;
        }
        workbench.spinner.rotation.y = state.spin;
    }
    // While a clip is made, only the clip is drawn: the hall behind the card
    // holds still, and a phone draws one picture a frame, not two.
    if (state.clip && state.clip.recording) {
        stepClip(dt);
        return;
    }
    renderer.render(scene, camera);
}

/** Best-effort check that this browser can draw the hall: three.js needs
 *  WebGL 2. */
export function hasWebGL() {
    try {
        const c = document.createElement('canvas');
        return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
    } catch (e) {
        return false;
    }
}

/** A browser that cannot draw the hall goes to the main site, with a note,
 *  rather than a blank canvas. */
function fallbackTo2D() {
    try {
        const loading = document.getElementById('loading-screen');
        if (loading) loading.classList.remove('hidden');
        const status = document.getElementById('load-status');
        if (status) status.textContent = 'This browser can’t run the 3D view. Taking you to the main site…';
    } catch (e) { /* redirecting regardless */ }
    setTimeout(() => { window.location.replace('/'); }, 2500);
}

function boot() {
    if (!hasWebGL()) { fallbackTo2D(); return; }
    init().catch((err) => {
        console.error('[Derby] 3D init failed, falling back to the main site:', err);
        fallbackTo2D();
    });
}

// Auto-boot only in a browser. Under test, importing stays side-effect free.
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
}

/** For tests: the state, and the parts a test drives directly. */
export function getState() {
    return state;
}

export const __test__ = {
    startRace, finishRace, stepBack, crowdMoment, openClip, closeClip, shareStill, shareClip, showBench, tuneCar, sound, shareLine,
    meshes: () => meshes, benchMesh: () => benchMesh, garage: () => garage, bench: () => bench, holder: () => holder, crowd: () => crowd,
    dancer: () => dancer,
    familyView: (v) => {
        state.benchView = v;
        if (state.phase === 'bench') benchCamera();
    },
    el
};
