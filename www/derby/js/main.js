// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Derby Day's orchestrator (M1, graybox): the boot, the check-in
 * card, a race day played back in the hall, and the results.
 *
 * THE LOOP, M1 (TASKS, M1): pick an event (Easy, Medium, Hard, Time Trial)
 * and a car (the four presets until the workshop opens), Go, four heats with
 * every car in every lane, the board. Race again, or choose another race.
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

import { DERBY_CONFIG, IN } from './config.min.js';
import { describeCar, buildFromDesign, buildFromField } from './car.min.js';
import { runRace, explain } from './sim.min.js';
import { buildTrack, carPose } from './track.min.js';
import { buildHall } from './hall.min.js';
import { buildCarMesh } from './carmesh.min.js';
import { planDay, momentAt, positionAt } from './playback.min.js';
import { shotFor, framing } from './director.min.js';
import { createTimer, fillResults, h } from './board.min.js';
import {
    EVENTS, UI, OFF, eventLabel, staging, heatWinner, heatSpoken, resultsSpoken, whyLines, trialLines
} from './copy.min.js';
import { nextPhase } from './phases.min.js';
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
    /** The check-in card's choices. */
    event: 'easy',
    preset: 'weekend',
    trial: new Set(['weekend', 'full']),
    /** The race day being played: { entries, cars, race, plan }. */
    day: null,
    clock: 0,
    /** The last segment announced, so each is said once. */
    said: ''
};

let renderer;
let scene;
let camera;
let trackParts;
let meshes = [];
let timer;
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
        'help-btn', 'timer', 'skip-btn', 'you-tag', 'caption', 'race-status', 'results-modal', 'results-title',
        'results-event', 'results-table', 'results-lanes', 'results-why', 'results-why-heading', 'results-again',
        'results-another', 'results-status', 'explore-link']) {
        el[id] = document.getElementById(id);
    }
    if (!el['game-canvas'] || typeof THREE === 'undefined') return;

    state.isMobile = detectMobile();
    state.reducedMotion = prefersReducedMotion();
    setMobile(state.isMobile);
    if (el['explore-link']) el['explore-link'].href = CONFIG.site.home.path;
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
    timer = createTimer(el.timer);
    // The cars waiting at the pin behind the check-in card: the visitor's
    // chosen car and the first division's, so the track is not empty.
    stageCars(entriesFor(state.event));
    idleCamera();

    setupEventListeners();

    updateLoadingStatus('Warming up…', 85);
    await warmShaders(renderer, [{ scene, camera }]);
    updateLoadingStatus('Ready', 100);
    setTimeout(() => {
        const loading = document.getElementById('loading-screen');
        if (loading) loading.classList.add('hidden');
        state.isLoaded = true;
        state.phase = nextPhase(state.phase, 'loaded');
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

/** The event and car choices, from copy.js and the presets. Rebuilt when
 *  Time Trial (several cars) and the divisions (one) trade places. */
function buildCheckin() {
    const box = el['event-options'];
    if (box) {
        box.textContent = '';
        checkin.events = EVENTS.map((e) => {
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

function buildCars() {
    const box = el['car-options'];
    const trial = state.event === 'trial';
    if (el['car-legend']) el['car-legend'].textContent = trial ? UI.carsLegend : UI.carLegend;
    note('');
    if (!box) return;
    box.textContent = '';
    checkin.cars = CONFIG.presets.map((p) => {
        const on = trial ? state.trial.has(p.id) : p.id === state.preset;
        const o = option(trial ? 'checkbox' : 'radio', 'car', p.id, p.name, p.blurb, on, (input) => {
            if (trial) {
                if (input.checked) state.trial.add(p.id);
                else state.trial.delete(p.id);
                note(state.trial.size ? '' : UI.pickOne);
            } else if (input.checked) {
                state.preset = p.id;
            }
            if (state.phase === 'checkin') stageCars(entriesFor(state.event));
        });
        box.appendChild(o.wrap);
        return o;
    });
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
    state.phase = 'checkin';
    hideResults();
    setRaceChrome(false);
    if (el.blocker) el.blocker.classList.remove('hidden');
    stageCars(entriesFor(state.event));
    idleCamera();
    const go = el['go-btn'];
    if (go && typeof go.focus === 'function') go.focus({ preventScroll: true });
}

// ---- A race day -------------------------------------------------------------

/** A preset's build. */
function presetBuild(p) {
    return buildFromDesign(p.design, { tune: p.tune, ballast: p.ballast }, CONFIG);
}

/**
 * The cars an event races: the visitor's preset and the division's three
 * neighbors, or the Time Trial's chosen presets. Each { build, name, color,
 * mine }.
 */
export function entriesFor(eventId) {
    if (eventId === 'trial') {
        return CONFIG.presets.filter((p) => state.trial.has(p.id))
            .map((p) => ({ build: presetBuild(p), name: p.name, color: p.color, mine: true, id: p.id }));
    }
    const p = CONFIG.presets.find((x) => x.id === state.preset) || CONFIG.presets[0];
    const field = (CONFIG.divisions[eventId] || CONFIG.divisions.easy).map((i) => CONFIG.field[i]);
    return [{ build: presetBuild(p), name: p.name, color: p.color, mine: true, id: p.id }]
        .concat(field.map((f) => ({ build: buildFromField(f, CONFIG), name: f.name, color: CONFIG.fieldColors[f.id], mine: false, id: f.id })));
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
        const m = buildCarMesh(e.build, car, { color: e.color, shadows }, CONFIG);
        m.car = car;
        scene.add(m.group);
        return m;
    });
    meshes.forEach((m, i) => placeCar(m, 0, i));
    if (trackParts) trackParts.gate.set(0);
}

function placeCar(mesh, s, lane) {
    const pose = carPose(trackParts.path, s, lane, mesh.car, CONFIG);
    mesh.group.position.set(pose.x, pose.y, pose.z);
    mesh.group.rotation.z = pose.angle;
    mesh.roll(s);
    return pose;
}

/** Go: run the race now, then play it. */
function startRace(how = 'go') {
    if (!state.isLoaded) return false;
    const entries = entriesFor(state.event);
    if (!entries.length) {
        note(UI.pickOne);
        return false;
    }
    if (entries.length > LANES) {
        note(UI.tooMany);
        return false;
    }
    stageCars(entries);
    const cars = meshes.map((m) => m.car);
    const race = runRace(cars, CONFIG, { record: CONFIG.timing.record });
    const focus = state.event === 'trial' ? null : 0;
    const plan = planDay(race, { focus, reducedMotion: state.reducedMotion }, CONFIG);
    state.day = { entries, cars, race, plan, mine: new Set(entries.map((e, i) => (e.mine ? i : -1)).filter((i) => i >= 0)) };
    state.clock = 0;
    state.said = '';
    state.phase = 'race';
    if (el.blocker) el.blocker.classList.add('hidden');
    hideResults();
    timer.build(entries.map((e) => e.name), state.day.mine, LANES);
    setRaceChrome(true);
    track('race-start', { kind: state.event, outcome: `cars=${entries.map((e) => e.id).join('.')}&how=${how}` });
    return true;
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
    }
}

function caption(text) {
    const c = el.caption;
    if (!c) return;
    c.textContent = text;
    c.classList.toggle('visible', Boolean(text));
}

function announce(text) {
    const r = el['race-status'];
    if (r) r.textContent = text;
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
    heat.forEach((r, i) => {
        const run = day.race.runs[i][r.lane];
        const s = positionAt(run, m.runTime, CONFIG);
        if (s > leadS) leadS = s;
        const pose = placeCar(meshes[i], s, r.lane);
        if (i === 0 && state.event !== 'trial') minePose = pose;
    });
    const seg = m.segment;
    trackParts.gate.set(kind === 'staging' ? 0 : kind === 'gate' ? Math.min(1, (state.clock - seg.from) / (seg.to - seg.from)) : 1);

    const shot = shotFor(kind, leadS, { reducedMotion: state.reducedMotion }, CONFIG);
    aim(framing(shot, trackParts.path, leadS, window.innerWidth / window.innerHeight, CONFIG));

    // The timer: each lane's car, and its time once it is across.
    const order = heat.slice().sort((a, b) => a.time - b.time || a.car - b.car);
    const byLane = new Array(LANES).fill(null);
    for (const r of heat) {
        const run = day.race.runs[r.car][r.lane];
        const across = kind === 'times' || kind === 'replay' || (kind === 'run' && m.runTime >= run.time);
        byLane[r.lane] = { car: r.car, time: across ? r.time : null, place: across ? order.indexOf(r) + 1 : null };
    }
    timer.lanes(byLane);

    const key = `${m.heat}:${kind}`;
    if (key !== state.said) {
        state.said = key;
        const n = m.heat + 1;
        const total = day.race.heats.length;
        timer.heat(n, total, kind === 'replay' ? UI.replay : '');
        if (kind === 'staging') caption(staging(n, total));
        else if (kind === 'gate') caption(OFF);
        else if (kind === 'replay') caption(UI.replay);
        else if (kind === 'times') {
            const first = order[0];
            caption(heatWinner(n, day.entries[first.car].name, first.time));
            announce(heatSpoken(n, order.map((r, i) => ({ name: day.entries[r.car].name, time: r.time, place: i + 1 }))));
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
    aim(framing('finish', trackParts.path, CONFIG.track.courseLength, window.innerWidth / window.innerHeight, CONFIG));
    showResults();
    const place = day.race.standings.indexOf(0) + 1;
    track(how === 'skip' ? 'race-skip' : 'race-end', { kind: state.event, outcome: state.event === 'trial' ? `cars=${day.entries.length}` : `place=${place}` });
}

/** The visitor's Why lines: their car against the kit and the best. */
export function whyFor(day) {
    if (state.event === 'trial') {
        return trialLines(day.race.standings.map((i) => ({ name: day.entries[i].name, average: day.race.average[i] })));
    }
    const car = day.cars[0];
    const kit = describeCar(buildFromDesign('block', {}, CONFIG), CONFIG);
    const refs = {
        kitMass: kit.mass,
        blockCdA: kit.cdA,
        bestCdA: describeCar(buildFromField(CONFIG.field[CONFIG.field.length - 1], CONFIG), CONFIG).cdA,
        idealBalance: 0.75 * IN
    };
    return whyLines(explain(car, refs, CONFIG), car, refs.idealBalance);
}

function showResults() {
    const day = state.day;
    const names = day.entries.map((e) => e.name);
    fillResults({
        table: el['results-table'], lanesEl: el['results-lanes'], whyEl: el['results-why'], whyHeading: el['results-why-heading']
    }, day.race, names, state.event === 'trial' ? new Set() : day.mine, whyFor(day),
    state.event === 'trial' ? UI.trialHeading : UI.whyHeading);
    if (el['results-event']) el['results-event'].textContent = eventLabel(state.event);
    const modal = el['results-modal'];
    if (modal) modal.classList.remove('hidden');
    const rows = day.race.standings.map((i, k) => ({ name: names[i], average: day.race.average[i], place: k + 1 }));
    if (el['results-status']) el['results-status'].textContent = resultsSpoken(state.event, rows);
    const title = el['results-title'];
    if (title && typeof title.focus === 'function') title.focus({ preventScroll: true });
}

function hideResults() {
    if (el['results-modal']) el['results-modal'].classList.add('hidden');
}

function resultsShown() {
    return Boolean(el['results-modal']) && !el['results-modal'].classList.contains('hidden');
}

/** Escape and the help button: one step back. */
function stepBack(how) {
    if (!state.isLoaded) return;
    if (state.phase === 'race') track('race-leave', { kind: state.event, outcome: `how=${how}` });
    if (state.phase === 'race' || state.phase === 'results') showCheckin();
}

// ---- Events -----------------------------------------------------------------

function setupEventListeners() {
    cleanupController = new AbortController();
    const signal = cleanupController.signal;
    const on = (id, type, fn) => {
        if (el[id]) el[id].addEventListener(type, fn, { signal });
    };
    on('go-btn', 'click', () => startRace('go'));
    on('skip-btn', 'click', () => finishRace('skip'));
    on('help-btn', 'click', () => stepBack('help'));
    on('results-again', 'click', () => {
        track('race-again', { kind: state.event });
        startRace('again');
    });
    on('results-another', 'click', () => stepBack('another'));
    document.addEventListener('keydown', onKeyDown, { signal });
    window.addEventListener('resize', onResize, { signal });
    window.addEventListener('pagehide', cleanup);
    installCardFocusTrap({ signal });
    installCardScrollReset({ signal });
}

function onKeyDown(event) {
    if (event.key === 'Escape' || event.code === 'Escape') {
        if (state.phase === 'race' || resultsShown()) {
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
    if (state.phase !== 'race') idleCamera();
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

export const __test__ = { startRace, finishRace, stepBack, meshes: () => meshes, el };
