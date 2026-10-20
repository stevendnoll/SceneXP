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
    EVENTS, UI, OFF, eventLabel, staging, heatWinner, heatSpoken, resultsSpoken, whyLines, trialLines, clock
} from './copy.min.js';
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
    /** The check-in card's choices. */
    event: 'easy',
    preset: 'weekend',
    trial: new Set(['weekend', 'full']),
    /** The race day being played: { entries, cars, race, plan }. */
    day: null,
    clock: 0,
    /** The last segment announced, so each is said once. */
    said: '',
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
        'results-another', 'results-status', 'explore-link', 'sound-btn', 'results-share', 'clip-modal', 'clip-title',
        'clip-stage', 'clip-progress', 'clip-sound', 'clip-share', 'clip-image', 'clip-again', 'clip-close', 'clip-status']) {
        el[id] = document.getElementById(id);
    }
    if (!el['game-canvas'] || typeof THREE === 'undefined') return;
    // The markup starts the cards hidden. Said again here, so the page never
    // begins believing one is up.
    for (const id of ['results-modal', 'clip-modal']) if (el[id]) el[id].classList.add('hidden');
    // The clip's sound starts on every visit (D2), whatever a browser that
    // restores form state across a reload remembers.
    if (el['clip-sound']) el['clip-sound'].checked = true;

    state.isMobile = detectMobile();
    state.reducedMotion = prefersReducedMotion();
    setMobile(state.isMobile);
    sound.setLevel(state.isMobile ? CONFIG.sound.masterMobile : CONFIG.sound.master);
    markSound();
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
        if (el['sound-btn']) el['sound-btn'].classList.add('visible');
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
    state.lastS = entries.map(() => 0);
    state.beeped = new Set();
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
        else if (kind === 'gate') {
            caption(OFF);
            sound.gate();
        } else if (kind === 'replay') caption(UI.replay);
        else if (kind === 'times') {
            const first = order[0];
            sound.cheer(0.55);
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
    sound.roll(0);
    sound.cheer(state.event === 'trial' ? 0.7 : place === 1 ? 1 : 0.45);
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
    sound.roll(0);
    if (state.phase === 'race' || state.phase === 'results') showCheckin();
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
        if (m.kind === 'board') sound.cheer(c.plan.place === 1 ? 1 : 0.6);
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
    video.autoplay = true;
    video.playsInline = true;
    video.controls = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-label', 'Your race clip');
    const stage = el['clip-stage'];
    if (stage) {
        stage.textContent = '';
        stage.appendChild(video);
    }
    if (typeof video.play === 'function') {
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
    const url = new URL('.', window.location.href).href;
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
    on('results-share', 'click', openClip);
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
        if (clipShown()) {
            event.preventDefault();
            closeClip();
            return;
        }
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

export const __test__ = { startRace, finishRace, stepBack, openClip, closeClip, shareStill, shareClip, sound, meshes: () => meshes, el };
