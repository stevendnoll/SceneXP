// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Entry point for Corner Office.
 *
 * THE DOCUMENT IS THE SOURCE OF TRUTH AND THE OFFICE IS A PROJECTION OF IT.
 * Every record lives in one localStorage document (store.js), the rules read
 * that document and a clock handed down from here (derive.js, query.js), the
 * cards draw it (grid.js, panels.js), and the Three.js side only shows what
 * they decide. This file is the one place the real clock is read and the one
 * place the halves meet.
 *
 * EVERY CHANGE GOES THROUGH `mutate`, which applies a store.js mutation,
 * remembers the document it replaced (so undo is putting it back), saves, and
 * calls `refresh` so everything on screen is redrawn from the new document.
 * `change` is mutate plus the spoken line and the undo toast, and is what
 * every button uses.
 *
 * THE SCENE RENDERS ON DEMAND. An office mostly sits still, so a frame is
 * drawn only when something asks for one (`requestRender`): a resize, a
 * refresh, a glide between stations, the lamp. An idle office costs a phone
 * nothing.
 *
 * NOTHING HERE DEPENDS ON THE CANVAS. Every object in the room that does
 * something has a button in the toolbar, every record is a row in the
 * computer's grid, and a tap on the room is only ever a shortcut.
 */

import { CONFIG } from './config.min.js';
import {
    createStore, emptyDoc, touchVisit, storageUse, addApplication, updateApplication, setStatus, addEvent,
    updateEvent, addTask, updateTask, setTaskDone, deleteRecord, restoreRecord, emptyWastebasket,
    clearSamples, hasSamples, setSettings, findApplication, findEvent, findTask, labelOf, serialize,
    backupFilename, parseBackup, wastebasket
} from './store.min.js';
import { createHistory } from './log.min.js';
import { stats, buildIndex, effectiveStatus, followUpFor, dueTasks, upcomingEvents } from './derive.min.js';
import { queryApplications, facetCounts, normalizeQuery } from './query.min.js';
import { welcomeLine, pageTitle, storageNote, count } from './copy.min.js';
import { STATUS_LABELS, EVENT_LABELS, SORT_LABELS, applicationName, eventName } from './labels.min.js';
import { formatDate, formatDateTime, ceilToMinutes, addDays, displayDateTime } from './dates.min.js';
import { stockSamples } from './samples.min.js';
import { applicationsCsv } from './csv.min.js';
import { poseFor, createGlide } from './stations.min.js';
import { buildRoom, setLamp, pickOf, setNotes, ensureCapacity } from './room.min.js';
import {
    screenLines, drawScreen, drawSkyline, drawCalendar, drawNoteAtlas, drawLabelCard, drawBoardHeader, drawCardFace
} from './paint.min.js';
import { drawerPlan, liftedLine, TAB_COLORS } from './cabinet.min.js';
import { createFiling } from './filing.min.js';
import { boardPlan, boardSummary, boardColumns, columnAt, CARD_ATLAS } from './board.min.js';
import { createPinboard } from './pinboard.min.js';
import { monthGrid, monthAgenda, shiftMonth } from './calendar.min.js';
import { icsFile, upcomingItems, icsFilename } from './ics.min.js';
import { lightAt, lighting, css } from './daylight.min.js';
import { stickyNotes, notesKey, noteWords, noteColor, quadCorners, cellUvs, NOTE_SLOTS, ATLAS } from './notes.min.js';
import { download, readText } from './files.min.js';
import {
    initCards, openCard, closeCard, isOpen, anyOpen, topCard, announce, toast, hideToast, h, button, clear, confirmCard
} from './cards.min.js';
import {
    initForms, fillApplicationForm, readApplicationForm, validateApplication, showError, updateFound, useFound,
    fillEventForm, readEventForm, validateEvent, fillTaskForm, readTaskForm, validateTask, fillSettingsForm,
    readSettingsForm
} from './forms.min.js';
import { initGrid, renderGrid, renderChips, isFiltered } from './grid.min.js';
import { renderFolder, renderWastebasket, renderSamplesButtons, renderCalendar, renderToday } from './panels.min.js';
import { installCardFocusTrap, installCardScrollReset, getProofOfWork } from '../../shared/js/boot-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';

// ---- State ------------------------------------------------------------------

const state = {
    running: false,
    loaded: false,
    mobile: false,
    reducedMotion: false,
    lastTime: 0,
    tickDue: 0,
    /** Set when something on screen changed and a frame should be drawn. */
    dirty: true,
    frames: 0,
    storageStatus: 'fresh',
    dropped: 0,
    doc: null
};

/** What the cards are showing, so a refresh can redraw them. */
const ui = {
    query: {},
    station: 'desk',
    folderId: null,
    editingAppId: null,
    eventAppId: null,
    editingEventId: null,
    taskAppId: null,
    editingTaskId: null,
    lampOn: true,
    /** Whether the folder lies open on the desk. Kept here as well as on the
     *  mesh, because the test stub cannot read a mesh back. */
    folderOnDesk: false,
    screenText: '',
    searched: false,
    /** The month the calendar card is showing, and the day chosen in it. */
    calMonth: null,
    calDay: null,
    /** What the notes, the wall calendar and the light were last painted
     *  from, so each repaints only when it changes. */
    notesKey: null,
    wallKey: null,
    lightKey: null,
    /** An hour the light is held at, for screenshots, or null for the clock
     *  (window.cornerOffice.hour). */
    hourPin: null,
    /** Whether the cabinet's folders or drawers are mid-move, and what its
     *  drawer labels were last painted from. */
    cabinetMoving: false,
    drawerKey: null,
    /** The cabinet's plan and lifted folders, as last filed. */
    filed: { plan: [], lifted: [] }
};

let filing = null;
let pinboard = null;
/** A drag on the corkboard in progress: which card, which pointer, where it
 *  began, and whether it has moved far enough to be a drag, not a tap. */
let drag = null;

/** The lights the time of day sets, and the canvases it repaints. */
const lights = { hemi: null, sun: null, fill: null };
const painted = { skyline: null, calendar: null, notes: null, drawers: [] };

const history = createHistory();

let renderer = null;
let scene = null;
let camera = null;
let room = null;
let glide = null;
let screenCanvas = null;
let screenTexture = null;
let raycaster = null;
let pointer = null;
let store = null;
let canvas = null;
let cleanupController = null;
let tornDown = false;
let sessionStart = 0;
let sessionEnded = false;

// ---- Device and preference checks -----------------------------------------

export function detectMobile() {
    if (typeof window === 'undefined') return false;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return Boolean(coarse) || Math.min(window.innerWidth, window.innerHeight) < 600;
}

export function prefersReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The one place the wall clock is read. Everything below is handed the
 *  value. */
function now() {
    return new Date();
}

function el(id) {
    return document.getElementById(id);
}

function aspect() {
    return window.innerWidth / Math.max(1, window.innerHeight);
}

// ---- Initialization ---------------------------------------------------------

async function init() {
    state.mobile = detectMobile();
    state.reducedMotion = prefersReducedMotion();
    setMobile(state.mobile);

    canvas = el('game-canvas');
    if (!canvas) return;

    updateLoadingStatus('Verifying your browser…', 10);
    const proof = await getProofOfWork(CONFIG.telemetry.proofOfWork);
    setProofHash(proof && proof.hash);

    updateLoadingStatus('Unlocking the office…', 30);
    // THE ONE ABORT CONTROLLER FOR THE PAGE, made before anything listens,
    // because a browser refuses a null `signal` that the test stub would wave
    // through (Prospect City, 2026-09-16).
    cleanupController = new AbortController();
    buildRenderer();
    buildScene();

    updateLoadingStatus('Finding your files…', 60);
    // The store brings its own localStorage adapter, and this file never
    // names the global: store.js is the one writer the privacy policy lists.
    store = createStore(undefined, CONFIG);
    const loaded = store.load(now());
    state.doc = loaded.doc;
    state.storageStatus = loaded.status;
    state.dropped = loaded.dropped;
    ui.query = { sortKey: state.doc.settings.sortKey, sortDir: state.doc.settings.sortDir };

    updateLoadingStatus('Turning on the lights…', 85);
    initForms(CONFIG);
    const cabinetSort = el('cabinet-sort');
    if (cabinetSort) {
        clear(cabinetSort);
        for (const key of Object.keys(CONFIG.sortKeys)) cabinetSort.appendChild(h('option', { value: key, text: SORT_LABELS[key] }));
    }
    setupEventListeners();
    refresh();
    showWelcome();

    updateLoadingStatus('Ready', 100);
    setTimeout(() => {
        const loading = el('loading-screen');
        if (loading) loading.classList.add('hidden');
        state.loaded = true;
        // EVERY .ui-float IS display:none UNTIL THIS LINE.
        document.querySelectorAll('.ui-float').forEach((node) => node.classList.add('visible'));
        requestRender();
    }, CONFIG.loadingReveal);

    // A console helper for screenshots: `cornerOffice.hour(21)` holds the
    // light at 9 PM, and `cornerOffice.hour(null)` gives it back to the clock.
    window.cornerOffice = {
        hour(h) {
            ui.hourPin = h == null ? null : Math.min(24, Math.max(0, Number(h)));
            return applyDaylight(now(), true).phase;
        }
    };

    const s = stats(state.doc, CONFIG, now());
    track('session-start', {
        device: state.mobile ? 'touch' : 'desktop',
        applications: s.applications,
        returning: state.storageStatus === 'restored'
    });
    sessionStart = Date.now();

    start();
}

function updateLoadingStatus(message, progress) {
    const statusEl = el('load-status');
    const progressEl = el('load-progress');
    if (statusEl) statusEl.textContent = message;
    if (progressEl) progressEl.style.width = `${progress}%`;
}

// ---- Renderer, scene, camera ------------------------------------------------

function pixelRatioCeiling() {
    const q = CONFIG.quality;
    const cap = state.mobile ? q.maxPixelRatioMobile : q.maxPixelRatio;
    return Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, cap);
}

function buildRenderer() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !state.mobile, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setPixelRatio(pixelRatioCeiling());
    renderer.setSize(window.innerWidth, window.innerHeight, false);
}

/** A canvas texture painted by `paint`, or null where there is no canvas. */
function paintedTexture(width, height, paint) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext && c.getContext('2d');
    if (!ctx) return { canvas: null, texture: null };
    paint(ctx, width, height);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { canvas: c, texture };
}

function buildScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a211a);

    // Daylight through the two window walls, and the room's own fill.
    // Daylight through the two window walls, and the room's own fill. Their
    // strengths and colors follow the clock (applyDaylight).
    lights.hemi = new THREE.HemisphereLight(0xf4f1ea, 0x4a3a2c, 0.9);
    scene.add(lights.hemi);
    lights.sun = new THREE.DirectionalLight(0xfff0d8, 1.5);
    lights.sun.position.set(6, 5, -6);
    scene.add(lights.sun);
    lights.fill = new THREE.DirectionalLight(0xcfdcec, 0.35);
    lights.fill.position.set(-3, 3, 4);
    scene.add(lights.fill);

    painted.skyline = paintedTexture(1024, 512, drawSkyline);
    painted.calendar = paintedTexture(512, 700, (ctx, W, H) => {
        ctx.fillStyle = '#f8f5ee';
        ctx.fillRect(0, 0, W, H);
    });
    painted.notes = paintedTexture(ATLAS.cols * 256, ATLAS.rows * 256, () => {});
    painted.drawers = Array.from({ length: CONFIG.room.cabinet.drawers }, () => paintedTexture(256, 64, () => {}));
    painted.boardHeader = paintedTexture(1024, 52, (ctx, W, H) => drawBoardHeader(ctx, W, H, boardColumns(CONFIG).map((c) => c.label)));
    const screen = paintedTexture(512, 320, (ctx, W, H) => drawScreen(ctx, W, H, []));
    screenCanvas = screen.canvas;
    screenTexture = screen.texture;
    room = buildRoom(CONFIG, {
        skyline: painted.skyline.texture,
        screen: screenTexture,
        calendar: painted.calendar.texture,
        notes: painted.notes.texture,
        drawerLabels: painted.drawers.map((p) => p.texture),
        boardHeader: painted.boardHeader.texture
    });
    filing = createFiling(room.cabinet, CONFIG, { reducedMotion: state.reducedMotion });
    pinboard = createPinboard(room.board, CONFIG, {
        reducedMotion: state.reducedMotion,
        makeAtlas: (rows) => paintedTexture(CARD_ATLAS.cols * CARD_ATLAS.cellW, rows * CARD_ATLAS.cellH, () => {}),
        paintCard: drawCardFace
    });
    scene.add(room.group);

    const pose = poseFor(ui.station, aspect(), CONFIG);
    camera = new THREE.PerspectiveCamera(pose.fov, aspect(), CONFIG.camera.near, CONFIG.camera.far);
    applyPose(pose);
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
}

function applyPose(pose) {
    camera.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
    camera.fov = pose.fov;
    camera.aspect = aspect();
    camera.updateProjectionMatrix();
    camera.lookAt(pose.aim[0], pose.aim[1], pose.aim[2]);
    state.pose = pose;
}

function handleResize() {
    if (!renderer || !camera) return;
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    if (!glide) applyPose(poseFor(ui.station, aspect(), CONFIG));
    requestRender();
}

/** Move the camera to a station, gliding unless the visitor asked for less
 *  motion, in which case it cuts. */
function goTo(station) {
    if (!camera) return;
    ui.station = station;
    const to = poseFor(station, aspect(), CONFIG);
    glide = createGlide(state.pose || to, to, state.reducedMotion ? 0 : CONFIG.view.glideSeconds);
    requestRender();
}

/** Ask for one frame. Cheap to call as often as anything likes. */
function requestRender() {
    state.dirty = true;
}

/** Repaint the monitor's face, only when its words change. */
function paintScreen(s) {
    const lines = screenLines(s);
    const key = lines.join('|');
    if (key === ui.screenText || !screenCanvas) return;
    ui.screenText = key;
    const ctx = screenCanvas.getContext('2d');
    drawScreen(ctx, screenCanvas.width, screenCanvas.height, lines);
    if (screenTexture) screenTexture.needsUpdate = true;
}

/** Repaint the sticky notes when what is due changes. */
function paintNotes(t) {
    if (!room) return;
    const notes = stickyNotes(dueTasks(state.doc, t));
    const key = notesKey(notes);
    if (key === ui.notesKey) return;
    ui.notesKey = key;
    ui.notesShown = notes.length;
    const { canvas: c, texture } = painted.notes;
    if (c) {
        drawNoteAtlas(c.getContext('2d'), c.width, c.height, notes, ATLAS, noteWords, noteColor);
        texture.needsUpdate = true;
    }
    setNotes(room.notes, notes.length, (i) => quadCorners(NOTE_SLOTS[i]), (i) => cellUvs(i));
}

/** Repaint the wall calendar when the month, today, or its marks change.
 *  The wall always shows this month: browsing is the card's job. */
function paintWallCalendar(t) {
    const grid = monthGrid(t.getFullYear(), t.getMonth());
    const marks = monthAgenda(state.doc, grid);
    const todayKey = formatDate(t);
    const key = `${grid.title}|${todayKey}|${[...marks].map(([k, v]) => `${k}:${v.events.length}:${v.tasks.length}`).join(',')}`;
    if (key === ui.wallKey) return;
    ui.wallKey = key;
    const { canvas: c, texture } = painted.calendar;
    if (!c) return;
    drawCalendar(c.getContext('2d'), c.width, c.height, { grid, marks, todayKey });
    texture.needsUpdate = true;
}

/** Set the light through the windows from the clock (or the pinned hour),
 *  repainting the city only when it has visibly changed. */
function applyDaylight(t, force = false) {
    const light = lightAt(t, ui.hourPin);
    if (!force && light.key === ui.lightKey) return light;
    ui.lightKey = light.key;
    ui.phase = light.phase;
    const look = lighting(light);
    if (lights.hemi) {
        lights.hemi.intensity = look.hemi;
        lights.sun.intensity = look.sun;
        lights.sun.color.setHex(look.sunColor);
        lights.fill.intensity = look.fill;
    }
    if (room) {
        room.outside.near.color.setHex(look.cityNear);
        room.outside.far.color.setHex(look.cityFar);
    }
    const { canvas: c, texture } = painted.skyline || {};
    if (c) {
        drawSkyline(c.getContext('2d'), c.width, c.height, look);
        texture.needsUpdate = true;
    }
    requestRender();
    return light;
}

// ---- Changing the document --------------------------------------------------

/**
 * Apply one store.js mutation. `fn` takes the document and returns the
 * store's `{ doc, record, error }`. A refusal is announced and changes
 * nothing. A change is remembered for undo under `label`, saved, and shown.
 */
function mutate(fn, label = '') {
    const before = state.doc;
    const result = fn(before);
    if (result.error) {
        announce(result.error);
        return result;
    }
    if (result.doc === before) return { ...result, changed: false };
    history.push(before, label);
    state.doc = result.doc;
    save();
    refresh();
    return { ...result, changed: true };
}

/**
 * A mutation the visitor made on purpose: said aloud, and offered for undo
 * in the toast. `message` is what is said (a string, or a function of the
 * result), and defaults to the label. Nothing is said when nothing changed.
 */
function change(fn, label, message = label) {
    const result = mutate(fn, label);
    if (result.changed) {
        const words = typeof message === 'function' ? message(result) : message;
        announce(words);
        toast(words, { undo, seconds: CONFIG.toastSeconds });
    }
    return result;
}

/** A change that is not worth an undo step (the sort order). */
function quietly(fn) {
    const result = fn(state.doc);
    if (result.error || result.doc === state.doc) return result;
    state.doc = result.doc;
    save();
    refresh();
    return result;
}

/** Put the document back the way it was before the last change. */
function undo() {
    const step = history.undo();
    if (!step) {
        announce('There is nothing to undo.');
        return null;
    }
    state.doc = step.doc;
    save();
    hideToast();
    refresh();
    announce(step.label ? `Undone. ${step.label}` : 'Undone.');
    track('undo');
    return step;
}

function save() {
    if (!store) return false;
    const ok = store.save(state.doc);
    if (!ok) noteStorage();
    return ok;
}

/** Say why the office cannot save, or say nothing. */
function noteStorage() {
    const note = el('storage-note');
    if (!note) return;
    const status = store && !store.available ? 'unavailable' : state.storageStatus;
    note.textContent = storageNote(status, storageUse(state.doc, CONFIG));
}

/**
 * Another tab changed the saved office. Read it again from scratch, so this
 * tab never saves an old copy over newer work, and let go of undo steps that
 * belong to a document that is no longer here.
 */
function followOtherTab() {
    const loaded = store.load(now());
    state.doc = loaded.doc;
    state.storageStatus = loaded.status;
    state.dropped = loaded.dropped;
    history.clear();
    hideToast();
    refresh();
    announce('Your office was updated in another tab.');
}

/** Redraw everything that depends on the document or the clock. */
function refresh() {
    const t = now();
    const s = stats(state.doc, CONFIG, t);
    document.title = pageTitle(CONFIG.name, s);
    const resume = el('welcome-resume');
    if (resume && state.storageStatus === 'restored') {
        resume.hidden = false;
        resume.textContent = welcomeLine(s);
    }
    noteStorage();

    const week = el('hud-week');
    if (week) week.textContent = `${s.weekly.count} of ${s.weekly.goal} this week`;
    const due = el('hud-due');
    if (due) {
        const waiting = s.dueToday + s.overdue;
        due.hidden = waiting === 0;
        due.textContent = waiting ? `${count(waiting, 'follow-up')} today` : '';
    }
    const undoBtn = el('bar-undo');
    if (undoBtn) {
        undoBtn.disabled = !history.canUndo;
        undoBtn.title = history.canUndo ? `Undo: ${history.label}` : 'Nothing to undo';
    }
    paintScreen(s);
    paintNotes(t);
    paintWallCalendar(t);
    applyDaylight(t);
    fileCabinet(t);
    pinBoard(t);

    if (isOpen('computer')) drawComputer(t);
    if (isOpen('cabinet')) drawCabinetSheet(t);
    if (isOpen('board')) drawBoardSheet(t);
    if (isOpen('calendar')) drawCalendarCard(t);
    if (isOpen('today')) drawToday(t);
    if (isOpen('folder')) drawFolder(t);
    if (isOpen('wastebasket')) drawWastebasket();
    if (isOpen('settings')) renderSamplesButtons(state.doc);
    showFolderOnDesk(isOpen('folder'));
    requestRender();
}

function showFolderOnDesk(on) {
    ui.folderOnDesk = on;
    if (room) room.folder.visible = on;
}

// ---- The computer -----------------------------------------------------------

const gridHandlers = {
    open: (id) => openFolder(id),
    sort: (key) => {
        const q = normalizeQuery(ui.query, CONFIG, state.doc.settings);
        const dir = q.sortKey === key ? (q.sortDir === 'asc' ? 'desc' : 'asc') : CONFIG.sortKeys[key];
        setSort(key, dir);
    },
    toggleStatus: (s) => toggleIn('statuses', s),
    toggleWorkMode: (m) => toggleIn('workModes', m),
    toggleUpcoming: () => { ui.query = { ...ui.query, upcoming: !ui.query.upcoming }; queryChanged(); },
    origin: (o) => { ui.query = { ...ui.query, origin: ui.query.origin === o ? 'all' : o }; queryChanged(); },
    clearFilters: () => {
        ui.query = { sortKey: ui.query.sortKey, sortDir: ui.query.sortDir };
        for (const id of ['grid-search', 'cabinet-search']) {
            const search = el(id);
            if (search) search.value = '';
        }
        queryChanged();
        announce('Showing every application.');
    },
    create: () => openApplicationForm(null),
    stock: () => stockOffice()
};

function toggleIn(field, value) {
    const list = ui.query[field] || [];
    ui.query = { ...ui.query, [field]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    queryChanged();
}

function setSort(key, dir) {
    ui.query = { ...ui.query, sortKey: key, sortDir: dir };
    // quietly() refreshes, which refiles the cabinet; queryChanged covers the
    // case where the settings already held this sort.
    quietly((doc) => setSettings(doc, { sortKey: key, sortDir: dir }, CONFIG));
    queryChanged();
}

/** The search, a filter or the sort changed: every view of it follows, so
 *  the grid's rows and the cabinet's lifted folders always agree. */
function queryChanged(t = now()) {
    if (isOpen('computer')) drawComputer(t);
    fileCabinet(t);
    if (isOpen('cabinet')) drawCabinetSheet(t);
}

/** The rows the grid would show right now, for the CSV and for tests. */
function currentRows(t = now()) {
    return queryApplications(state.doc, ui.query, CONFIG, t);
}

function drawComputer(t = now()) {
    const index = buildIndex(state.doc);
    const result = queryApplications(state.doc, ui.query, CONFIG, t, index);
    renderGrid({
        result,
        facets: facetCounts(state.doc, CONFIG, t, index),
        week: stats(state.doc, CONFIG, t).weekly,
        goal: state.doc.settings.weeklyGoal,
        config: CONFIG,
        now: t,
        on: { ...gridHandlers, stock: hasSamples(state.doc) ? null : gridHandlers.stock }
    });
    return result;
}

function openComputer({ armed = false, focusSearch = false } = {}) {
    drawComputer();
    openCard('computer', {
        armed,
        focus: focusSearch ? el('grid-search') : null,
        onClose: () => goTo('desk')
    });
    goTo('computer');
    track('open-computer');
}

// ---- The filing cabinet -------------------------------------------------------

/**
 * File every folder: the whole office in the current sort, split across the
 * drawers, with whatever the search and filters find lifted out. Repaints
 * the drawer labels when they change, and sets the folders moving.
 */
function fileCabinet(t = now()) {
    if (!filing || !room) return null;
    const q = normalizeQuery(ui.query, CONFIG, state.doc.settings);
    const index = buildIndex(state.doc);
    const all = queryApplications(state.doc, { sortKey: q.sortKey, sortDir: q.sortDir }, CONFIG, t, index);
    const searching = isFiltered(q);
    const found = searching ? queryApplications(state.doc, ui.query, CONFIG, t, index).rows : [];
    const plan = drawerPlan(all.rows, q.sortKey, q.sortDir, CONFIG.room.cabinet.drawers, t);
    if (ensureCapacity(room.cabinet, all.rows.length, CONFIG)) {
        filing = createFiling(room.cabinet, CONFIG, { reducedMotion: state.reducedMotion });
    }
    const status = new Map(all.rows.map((r) => [r.app.id, r.status]));
    const moving = filing.sync(plan, status, new Set(found.map((r) => r.app.id)), searching);
    if (moving) ui.cabinetMoving = true;
    ui.filed = { plan, lifted: found, searching, total: all.total };

    const key = plan.map((d) => d.label).join('|');
    if (key !== ui.drawerKey) {
        ui.drawerKey = key;
        plan.forEach((drawer, i) => {
            const p = painted.drawers[i];
            if (!p || !p.canvas) return;
            drawLabelCard(p.canvas.getContext('2d'), p.canvas.width, p.canvas.height, drawer.label);
            p.texture.needsUpdate = true;
        });
    }
    requestRender();
    return ui.filed;
}

/** The cabinet's sheet: the search, the filing order, the chips, and the
 *  lifted folders as buttons, so the keyboard can open what the eye sees. */
function drawCabinetSheet(t = now()) {
    const q = normalizeQuery(ui.query, CONFIG, state.doc.settings);
    const search = el('cabinet-search');
    if (search && document.activeElement !== search && search.value !== q.text) search.value = q.text;
    const sort = el('cabinet-sort');
    if (sort && sort.value !== q.sortKey) sort.value = q.sortKey;
    renderChips('cabinet-filters', q, { ...facetCounts(state.doc, CONFIG, t), total: ui.filed.total || 0 }, CONFIG, gridHandlers);
    const line = el('cabinet-lifted');
    const list = el('cabinet-list');
    const { lifted, searching, total } = ui.filed;
    if (line) {
        line.textContent = searching
            ? liftedLine(lifted.map((r) => applicationName(r.app)), total)
            : `Filed by ${SORT_LABELS[q.sortKey].toLowerCase()}. Search or choose a filter to lift folders out, and tap any folder to open it.`;
    }
    if (!list) return;
    clear(list);
    if (!searching) return;
    for (const row of lifted.slice(0, 8)) {
        list.appendChild(h('li', {}, button(applicationName(row.app), 'office-btn office-btn-small', () => openFolder(row.app.id))));
    }
    if (lifted.length > 8) {
        list.appendChild(h('li', {}, button(`All ${lifted.length} in the computer`, 'office-btn office-btn-small', () => {
            closeCard('cabinet');
            openComputer();
        })));
    }
}

function openCabinet({ armed = false } = {}) {
    fileCabinet();
    drawCabinetSheet();
    openCard('cabinet', {
        armed,
        onClose: () => {
            if (filing && filing.setOpen(false)) ui.cabinetMoving = true;
            goTo('desk');
        }
    });
    if (filing && filing.setOpen(true)) ui.cabinetMoving = true;
    goTo('cabinet');
    track('open-cabinet');
}

// ---- The corkboard ------------------------------------------------------------

/** The rows for the board, most recently active first within each column. */
function boardRows(t = now()) {
    return queryApplications(state.doc, { sortKey: 'activity', sortDir: 'desc' }, CONFIG, t).rows;
}

/**
 * Pin every card where its status says. A card whose status changed since
 * the last pinning is carried across the board: the beat every status change
 * gets, wherever it was made.
 */
function pinBoard(t = now()) {
    if (!pinboard) return null;
    const rows = boardRows(t);
    const plan = boardPlan(rows, CONFIG);
    const faces = new Map(rows.map((r) => [r.app.id, {
        title: r.app.company || r.app.role,
        subtitle: r.app.company ? r.app.role : '',
        note: r.status === 'ghosted' ? 'Gone quiet' : r.app.sample ? 'Sample' : '',
        band: css(TAB_COLORS[r.status] || TAB_COLORS.applied)
    }]));
    if (pinboard.sync(plan, faces)) ui.boardMoving = true;
    ui.pinned = plan;
    requestRender();
    return plan;
}

/** The board's sheet: what each column holds, and the keyboard's move. */
function drawBoardSheet(t = now()) {
    const plan = ui.pinned || pinBoard(t);
    const summary = el('board-summary');
    if (summary) summary.textContent = boardSummary(plan);
    const cardSelect = el('board-card');
    const toSelect = el('board-to');
    if (!cardSelect || !toSelect) return;
    const chosen = cardSelect.value;
    clear(cardSelect);
    const apps = new Map(state.doc.applications.map((a) => [a.id, a]));
    for (const column of plan) {
        if (!column.ids.length) continue;
        const group = h('optgroup', { label: column.label });
        for (const id of column.ids) group.appendChild(h('option', { value: id, text: applicationName(apps.get(id)) }));
        cardSelect.appendChild(group);
    }
    const first = plan.find((c) => c.ids.length);
    const keep = chosen && apps.has(chosen) && !apps.get(chosen).deletedAt ? chosen : first ? first.ids[0] : '';
    cardSelect.value = keep;
    if (!toSelect.children.length) {
        for (const column of boardColumns(CONFIG)) toSelect.appendChild(h('option', { value: column.status, text: column.label }));
    }
    const app = apps.get(keep);
    if (app) toSelect.value = app.status;
    const move = el('board-move');
    if (move) move.disabled = !app;
}

function openBoard({ armed = false } = {}) {
    pinBoard();
    drawBoardSheet();
    openCard('board', { armed, onClose: () => goTo('desk') });
    goTo('board');
    track('open-board');
}

/** The keyboard's move: the chosen card to the chosen column. */
function moveFromSheet(event) {
    if (event && event.preventDefault) event.preventDefault();
    const id = el('board-card').value;
    const status = el('board-to').value;
    const app = findApplication(state.doc, id);
    if (!app) return null;
    if (app.status === status) {
        announce(`${applicationName(app)} is already in ${STATUS_LABELS[status]}.`);
        return null;
    }
    changeStatus(id, status);
    track('board-move', { how: 'keyboard' });
    return status;
}

/** Where on the board the pointer is: `{ y, z }` on the cork's plane, or
 *  null when the ray misses it. */
function boardPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointer.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -CONFIG.room.board.x);
    const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    return hit && Number.isFinite(hit.y) && Number.isFinite(hit.z) ? { y: hit.y, z: hit.z } : null;
}

/**
 * A card let go of at `z` along the wall: moved to that column's status if
 * it is a different one, and carried back to its place if not.
 */
function dropCard(id, z) {
    const dropped = pinboard.endDrag();
    ui.boardMoving = true;
    const app = findApplication(state.doc, id);
    if (!app || !dropped) return null;
    const status = CONFIG.statuses[columnAt(z, CONFIG.room.board, CONFIG.statuses.length)];
    if (status === app.status) {
        announce(`${applicationName(app)} stays in ${STATUS_LABELS[status]}.`);
        requestRender();
        return null;
    }
    changeStatus(id, status);
    track('board-move', { how: 'drag' });
    return status;
}

function boardPointerDown(event) {
    if (topCard() !== 'board' || !pinboard) return;
    const hit = pickAt(event.clientX, event.clientY);
    if (!hit || hit.key !== 'board-card') return;
    const id = pinboard.idAtFace(hit.faceIndex);
    if (id) beginPointerDrag(id, event);
}

/** Take hold of a card under a pointer. It is not a drag until it moves. */
function beginPointerDrag(id, event) {
    drag = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    if (canvas.setPointerCapture && event.pointerId != null) {
        try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* a stale pointer, keep going */ }
    }
}

function boardPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    if (!drag.moved) {
        drag.moved = true;
        pinboard.beginDrag(drag.id);
    }
    const point = boardPoint(event.clientX, event.clientY);
    if (point) {
        pinboard.dragTo(point.y, point.z);
        drag.z = point.z;
    }
    requestRender();
}

function boardPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const done = drag;
    drag = null;
    if (!done.moved) {
        openFolder(done.id, { armed: true });
        return;
    }
    const card = pinboard.card(done.id);
    dropCard(done.id, done.z != null ? done.z : card.at.z);
}

function boardPointerCancel(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const done = drag;
    drag = null;
    if (done.moved) {
        pinboard.endDrag();
        ui.boardMoving = true;
    }
}

// ---- The calendar and today's list ------------------------------------------

const listHandlers = {
    openFolder: (id) => openFolder(id),
    toggleTask: (id, done) => toggleTaskDone(id, done),
    exportEvent: (id) => exportEvent(id)
};

function toggleTaskDone(id, done) {
    const task = findTask(state.doc, id);
    return change((doc) => setTaskDone(doc, id, done, CONFIG, now()),
        `${done ? 'Ticked off' : 'Put back'} ${task ? task.text : 'the follow-up'}`);
}

function drawCalendarCard(t = now()) {
    if (!ui.calMonth) ui.calMonth = { year: t.getFullYear(), month: t.getMonth() };
    if (!ui.calDay) ui.calDay = formatDate(t);
    const grid = monthGrid(ui.calMonth.year, ui.calMonth.month);
    renderCalendar({
        doc: state.doc,
        grid,
        marks: monthAgenda(state.doc, grid),
        selectedKey: ui.calDay,
        todayKey: formatDate(t),
        now: t,
        on: { ...listHandlers, selectDay }
    });
    return grid;
}

/** Choose a day, turning the page when it is in another month. */
function selectDay(key) {
    ui.calDay = key;
    const [y, m] = key.split('-').map(Number);
    if (!ui.calMonth || ui.calMonth.year !== y || ui.calMonth.month !== m - 1) ui.calMonth = { year: y, month: m - 1 };
    drawCalendarCard();
}

function turnMonth(delta) {
    const t = now();
    const base = ui.calMonth || { year: t.getFullYear(), month: t.getMonth() };
    ui.calMonth = delta === 0 ? { year: t.getFullYear(), month: t.getMonth() } : shiftMonth(base.year, base.month, delta);
    // Keep the chosen day in the month on show: the same date where it
    // exists, else the month's last day.
    const day = delta === 0 ? t.getDate() : Math.min(Number((ui.calDay || '').slice(8, 10)) || 1,
        new Date(ui.calMonth.year, ui.calMonth.month + 1, 0).getDate());
    ui.calDay = formatDate(new Date(ui.calMonth.year, ui.calMonth.month, day));
    const grid = drawCalendarCard();
    announce(grid.title);
}

function openCalendar({ armed = false } = {}) {
    const t = now();
    ui.calMonth = { year: t.getFullYear(), month: t.getMonth() };
    ui.calDay = formatDate(t);
    drawCalendarCard(t);
    openCard('calendar', { armed, onClose: () => goTo('desk') });
    goTo('calendar');
    track('open-calendar');
}

function drawToday(t = now()) {
    return renderToday({
        doc: state.doc,
        due: dueTasks(state.doc, t),
        coming: upcomingEvents(state.doc, t, 7),
        now: t,
        on: listHandlers
    });
}

function openToday({ armed = false } = {}) {
    drawToday();
    openCard('today', { armed });
    track('open-today');
}

// ---- Calendar files ----------------------------------------------------------

function exportEvent(id) {
    const t = now();
    const ev = findEvent(state.doc, id);
    if (!ev) return false;
    const app = findApplication(state.doc, ev.applicationId);
    const ok = download(icsFilename(t, 'event'), icsFile([{ kind: 'event', record: ev, app }], t), 'text/calendar');
    announce(ok
        ? `Your calendar file for the ${EVENT_LABELS[ev.type].toLowerCase()} on ${displayDateTime(ev.at)} is on its way to your downloads. Opening it adds it to your calendar, with a reminder half an hour before.`
        : 'This browser would not save the file.');
    track('export-ics', { items: 1 });
    return ok;
}

function exportUpcoming() {
    const t = now();
    const items = upcomingItems(state.doc, t, CONFIG.icsDays);
    const note = el('outtray-note');
    if (!items.length) {
        const line = 'Nothing is coming up yet, so there is nothing to add to your calendar.';
        announce(line);
        if (note && isOpen('outtray')) note.textContent = line;
        return false;
    }
    const ok = download(icsFilename(t), icsFile(items, t), 'text/calendar');
    const line = ok
        ? `Your calendar file holds ${count(items.length, 'item')}, each with a reminder. Opening it adds them to your calendar, and opening a newer one later updates them.`
        : 'This browser would not save the file.';
    announce(line);
    if (note && isOpen('outtray')) note.textContent = line;
    track('export-ics', { items: items.length });
    return ok;
}

// ---- The folder -------------------------------------------------------------

function drawFolder(t = now()) {
    const app = findApplication(state.doc, ui.folderId);
    if (!app || app.deletedAt) {
        closeCard('folder');
        return;
    }
    const index = buildIndex(state.doc);
    renderFolder({
        doc: state.doc,
        app,
        status: effectiveStatus(app, index, state.doc.settings, CONFIG, t),
        config: CONFIG,
        now: t,
        on: {
            setStatus: (status) => changeStatus(app.id, status),
            edit: () => openApplicationForm(app.id),
            remove: () => throwAway('applications', app.id),
            logEvent: () => openEventForm(app.id, null),
            editEvent: (id) => openEventForm(app.id, id),
            removeEvent: (id) => throwAway('events', id),
            exportEvent: (id) => exportEvent(id),
            addTask: () => openTaskForm(app.id, null),
            editTask: (id) => openTaskForm(app.id, id),
            toggleTask: (id, done) => toggleTaskDone(id, done),
            removeTask: (id) => throwAway('tasks', id)
        }
    });
}

function openFolder(id, { armed = false } = {}) {
    const app = findApplication(state.doc, id);
    if (!app || app.deletedAt) {
        announce('That application is no longer here.');
        return false;
    }
    ui.folderId = id;
    drawFolder();
    openCard('folder', {
        armed,
        onClose: () => {
            ui.lastFolderId = ui.folderId;
            ui.folderId = null;
            showFolderOnDesk(false);
            requestRender();
        }
    });
    showFolderOnDesk(true);
    requestRender();
    return true;
}

function changeStatus(id, status) {
    const app = findApplication(state.doc, id);
    change((doc) => setStatus(doc, id, status, CONFIG, now()),
        `Moved ${applicationName(app)} to ${STATUS_LABELS[status]}`);
    track('change-status', { status });
}

/** Put a record in the wastebasket, with the undo offered straight away. */
function throwAway(collection, id) {
    const record = (state.doc[collection] || []).find((r) => r.id === id);
    const label = labelOf(state.doc, collection, record);
    const what = collection === 'events' && record ? `the ${eventName(record).toLowerCase()}`
        : collection === 'tasks' ? 'the follow-up' : label;
    change((doc) => deleteRecord(doc, collection, id, CONFIG, now()), `Threw away ${what}`,
        `Threw away ${what}. It is in the wastebasket.`);
}

// ---- The application form ---------------------------------------------------

function openApplicationForm(id = null, { armed = false } = {}) {
    ui.editingAppId = id;
    const app = id ? findApplication(state.doc, id) : null;
    fillApplicationForm(app, { followUpDays: state.doc.settings.followUpDays });
    openCard('application-form', { armed, focus: el('af-company') });
}

function submitApplicationForm(event) {
    if (event && event.preventDefault) event.preventDefault();
    const { fields, followUp } = readApplicationForm();
    const problem = validateApplication(fields);
    if (problem) {
        showError('af-error', problem);
        return null;
    }
    const t = now();
    const name = applicationName(fields);
    let result;
    if (ui.editingAppId) {
        result = change((doc) => updateApplication(doc, ui.editingAppId, fields, CONFIG, t), `Saved ${name}`);
    } else {
        result = change((doc) => {
            const added = addApplication(doc, fields, CONFIG, t);
            if (added.error || !followUp || added.record.status === 'saved') return added;
            const task = addTask(added.doc, followUpFor(added.record, doc.settings, t), CONFIG, t);
            return { doc: task.doc, record: added.record, error: null };
        }, `Added ${name}`, followUp && fields.status !== 'saved'
            ? `Added ${name}, with a follow-up reminder in ${count(state.doc.settings.followUpDays, 'day')}.`
            : `Added ${name}.`);
    }
    if (result.error) {
        showError('af-error', result.error);
        return result;
    }
    closeCard('application-form');
    track(ui.editingAppId ? 'edit-application' : 'add-application');
    return result;
}

// ---- The event and follow-up forms -------------------------------------------

function openEventForm(appId, eventId) {
    ui.eventAppId = appId;
    ui.editingEventId = eventId;
    const ev = eventId ? findEvent(state.doc, eventId) : null;
    fillEventForm(ev, {
        defaultAt: formatDateTime(ceilToMinutes(now())),
        applicationName: applicationName(findApplication(state.doc, appId))
    });
    openCard('event-form', { focus: el('ef-type') });
}

function submitEventForm(event) {
    if (event && event.preventDefault) event.preventDefault();
    const fields = readEventForm();
    const problem = validateEvent(fields);
    if (problem) {
        showError('ef-error', problem);
        return null;
    }
    const t = now();
    const app = findApplication(state.doc, ui.eventAppId);
    const name = applicationName(app);
    const kind = EVENT_LABELS[fields.type] ? EVENT_LABELS[fields.type].toLowerCase() : 'event';
    const before = app ? app.status : null;
    const result = ui.editingEventId
        ? change((doc) => updateEvent(doc, ui.editingEventId, fields, CONFIG, t), `Saved the ${kind} for ${name}`)
        : change((doc) => addEvent(doc, { ...fields, applicationId: ui.eventAppId }, CONFIG, t),
            `Logged the ${kind} for ${name}`, movedLine(`Logged the ${kind} for ${name}.`, ui.eventAppId, before));
    if (result.error) {
        showError('ef-error', result.error);
        return result;
    }
    closeCard('event-form');
    track(ui.editingEventId ? 'edit-event' : 'add-event', { type: fields.type });
    return result;
}

/** The sentence after logging an event, saying so when it moved the
 *  application along. Worked out ahead from the config's rule, so the one
 *  sentence can be both spoken and toasted. */
function movedLine(line, appId, before) {
    const type = readEventForm().type;
    const target = CONFIG.eventAdvances[type];
    if (!target || !before || CONFIG.closedStatuses.includes(before)) return line;
    if (CONFIG.statuses.indexOf(target) <= CONFIG.statuses.indexOf(before)) return line;
    return `${line} Moved to ${STATUS_LABELS[target]}.`;
}

function openTaskForm(appId, taskId) {
    ui.taskAppId = appId;
    ui.editingTaskId = taskId;
    const task = taskId ? findTask(state.doc, taskId) : null;
    fillTaskForm(task, {
        defaultDue: formatDate(addDays(now(), 1)),
        applicationName: appId ? applicationName(findApplication(state.doc, appId)) : ''
    });
    openCard('task-form', { focus: el('tf-text') });
}

function submitTaskForm(event) {
    if (event && event.preventDefault) event.preventDefault();
    const fields = readTaskForm();
    const problem = validateTask(fields);
    if (problem) {
        showError('tf-error', problem);
        return null;
    }
    const t = now();
    const result = ui.editingTaskId
        ? change((doc) => updateTask(doc, ui.editingTaskId, fields, CONFIG, t), `Saved the follow-up ${fields.text}`)
        : change((doc) => addTask(doc, { ...fields, applicationId: ui.taskAppId || '' }, CONFIG, t),
            `Added the follow-up ${fields.text}`);
    if (result.error) {
        showError('tf-error', result.error);
        return result;
    }
    closeCard('task-form');
    track(ui.editingTaskId ? 'edit-task' : 'add-task');
    return result;
}

// ---- The wastebasket, the out-tray, settings ----------------------------------

function drawWastebasket() {
    return renderWastebasket({
        doc: state.doc,
        on: { restore: (collection, id) => restore(collection, id) }
    });
}

function openWastebasket({ armed = false } = {}) {
    drawWastebasket();
    openCard('wastebasket', { armed });
    track('open-wastebasket');
}

function restore(collection, id) {
    const record = (state.doc[collection] || []).find((r) => r.id === id);
    const label = labelOf(state.doc, collection, record) || 'it';
    change((doc) => restoreRecord(doc, collection, id, CONFIG, now()), `Restored ${label}`);
}

function emptyTheWastebasket() {
    const n = wastebasket(state.doc).length;
    if (!n) return;
    confirmCard({
        title: 'Empty the wastebasket?',
        detail: `${count(n, 'item')} will be removed for good. You can still undo it straight after, until you leave the page.`,
        confirmLabel: 'Empty it',
        danger: true,
        onConfirm: () => change((doc) => emptyWastebasket(doc, CONFIG, now()), 'Emptied the wastebasket')
    });
}

function openOuttray({ armed = false } = {}) {
    const note = el('outtray-note');
    if (note) note.textContent = '';
    openCard('outtray', { armed });
}

function saveBackup() {
    const ok = download(backupFilename(now()), serialize(state.doc));
    const note = el('outtray-note');
    if (note) note.textContent = ok ? 'Your backup is on its way to your downloads.' : 'This browser would not save the file.';
    track('backup');
    return ok;
}

function exportCsv() {
    const t = now();
    const { text, filename } = applicationsCsv(state.doc, currentRows(t).rows.map((r) => r.app), CONFIG, t);
    const ok = download(filename, text, 'text/csv');
    const note = el('outtray-note');
    if (note) {
        note.textContent = ok ? 'Your spreadsheet is on its way to your downloads.' : 'This browser would not save the file.';
    }
    track('export-csv');
    return ok;
}

const RESTORE_PROBLEMS = {
    parse: 'That file is not a backup the office can read.',
    shape: 'That file is not a backup the office can read.',
    newer: 'That backup was saved by a newer version of the office. Reloading the page should let you restore it.'
};

async function restoreFromFile(event) {
    const input = event && event.target;
    const file = input && input.files && input.files[0];
    const textValue = await readText(file);
    if (input) input.value = '';
    return restoreFromText(textValue);
}

function restoreFromText(textValue) {
    const note = el('outtray-note');
    const parsed = textValue == null ? { ok: false, reason: 'parse' } : parseBackup(textValue, CONFIG, now());
    if (!parsed.ok) {
        if (note) note.textContent = RESTORE_PROBLEMS[parsed.reason];
        return parsed;
    }
    const n = parsed.doc.applications.filter((a) => !a.deletedAt).length;
    confirmCard({
        title: 'Restore this backup?',
        detail: `It holds ${count(n, 'application')}. It will replace everything in the office now, and you can undo it straight after.`,
        confirmLabel: 'Restore',
        onConfirm: () => {
            const before = state.doc;
            history.push(before, 'Restored a backup');
            state.doc = parsed.doc;
            // A restore replaces whatever was saved, readable or not.
            store.replace(state.doc);
            state.storageStatus = store.status;
            refresh();
            const line = parsed.dropped
                ? `Restored the backup. ${count(parsed.dropped, 'record')} could not be read and ${parsed.dropped === 1 ? 'was' : 'were'} left out.`
                : 'Restored the backup.';
            announce(line);
            toast(line, { undo, seconds: CONFIG.toastSeconds });
            track('restore');
        }
    });
    return parsed;
}

function openSettings() {
    fillSettingsForm(state.doc.settings, CONFIG);
    renderSamplesButtons(state.doc);
    openCard('settings');
}

function saveSettings(event) {
    if (event && event.preventDefault) event.preventDefault();
    const result = change((doc) => setSettings(doc, readSettingsForm(), CONFIG), 'Saved your settings');
    closeCard('settings');
    return result;
}

function saveGoal() {
    const input = el('grid-goal');
    const goal = Number(input && input.value);
    if (!(goal >= 1)) {
        if (input) input.value = String(state.doc.settings.weeklyGoal);
        return null;
    }
    return change((doc) => setSettings(doc, { weeklyGoal: goal }, CONFIG),
        `Set the weekly goal to ${Math.min(CONFIG.settingsBounds.weeklyGoal.max, Math.round(goal))}`);
}

function stockOffice() {
    const result = change((doc) => stockSamples(doc, CONFIG, now()), 'Stocked the office with samples',
        (r) => `Stocked the office with ${count(r.count, 'sample application')}. They are marked Sample, and Settings can clear them.`);
    if (result.changed) track('stock-samples', { count: result.count });
    return result;
}

function clearTheSamples() {
    return change((doc) => clearSamples(doc), 'Cleared the samples', 'Cleared the samples. Your own records are untouched.');
}

function clearEverything() {
    confirmCard({
        title: 'Clear the whole office?',
        detail: 'Every application, event, contact and follow-up will be removed from this browser. You can undo it straight after, until you leave the page. A backup from the out-tray keeps a copy.',
        confirmLabel: 'Clear everything',
        danger: true,
        onConfirm: () => {
            change((doc) => ({ doc: { ...emptyDoc(CONFIG, now()), settings: doc.settings }, record: null, error: null }),
                'Cleared the whole office');
            closeCard('settings');
            track('clear-all');
        }
    });
}

// ---- The welcome card -------------------------------------------------------

function showWelcome() {
    const card = el('welcome');
    if (!card) return;
    const resume = el('welcome-resume');
    const restored = state.storageStatus === 'restored';
    if (resume && !restored) {
        resume.hidden = true;
        resume.textContent = '';
    }
    const box = el('welcome-actions');
    if (box) {
        clear(box);
        const empty = !state.doc.applications.some((a) => !a.deletedAt);
        if (empty) {
            box.appendChild(button('Add your first application', 'office-btn office-btn-primary', () => {
                closeCard('welcome');
                openApplicationForm(null);
            }));
            box.appendChild(button('Stock the office with samples', 'office-btn', () => {
                closeCard('welcome');
                stockOffice();
                openComputer();
            }));
            box.appendChild(button('Look around', 'office-btn', () => closeCard('welcome')));
        } else {
            box.appendChild(button('Step inside', 'office-btn office-btn-primary', () => closeCard('welcome')));
            box.appendChild(button('Open the computer', 'office-btn', () => {
                closeCard('welcome');
                openComputer();
            }));
        }
    }
    openCard('welcome');
}

// ---- The room ---------------------------------------------------------------

/** What a pick key does. Each has a toolbar button too. */
function actOn(key, { armed = true, instanceId = -1 } = {}) {
    switch (key) {
    case 'cabinet': openCabinet({ armed }); break;
    case 'board': openBoard({ armed }); break;
    case 'cabinet-folder': {
        const id = filing ? filing.idAt(instanceId) : null;
        if (!id) return false;
        openFolder(id, { armed });
        break;
    }
    case 'computer': openComputer({ armed }); break;
    case 'intray': openApplicationForm(null, { armed }); break;
    case 'outtray': openOuttray({ armed }); break;
    case 'wastebasket': openWastebasket({ armed }); break;
    case 'lamp': toggleLamp(); break;
    case 'folder': if (ui.lastFolderId) openFolder(ui.lastFolderId, { armed }); break;
    case 'calendar': openCalendar({ armed }); break;
    case 'notes': openToday({ armed }); break;
    default: return false;
    }
    track(`tap-${key}`);
    return true;
}

function toggleLamp() {
    ui.lampOn = !ui.lampOn;
    if (room) setLamp(room.lamp, ui.lampOn);
    announce(ui.lampOn ? 'The lamp is on.' : 'The lamp is off.');
    requestRender();
}

/** What is under a point on the canvas: `{ key, instanceId }`, or null. Only
 *  what is shown can be picked, because three's raycaster does not skip
 *  hidden objects, and the first thing the ray meets decides (a folder
 *  behind another folder is not the one tapped). */
function pickAt(clientX, clientY) {
    if (!raycaster || !room) return null;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointer.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(room.group, true);
    for (const hit of hits) {
        let shown = true;
        for (let o = hit.object; o; o = o.parent) if (o.visible === false) { shown = false; break; }
        if (!shown) continue;
        const key = pickOf(hit.object);
        return key ? { key, instanceId: hit.instanceId, faceIndex: hit.faceIndex } : null;
    }
    return null;
}

function handleSceneTap(clientX, clientY) {
    // The cabinet's sheet leaves the room in view, and its folders tappable.
    // The corkboard's taps and drags are the pointer handlers' (a tap there
    // is a pointerdown and a pointerup that did not move).
    const top = topCard();
    if (!state.loaded || (top && top !== 'cabinet')) return null;
    const hit = pickAt(clientX, clientY);
    if (!hit) return null;
    if (top === 'cabinet' && hit.key !== 'cabinet-folder') return null;
    actOn(hit.key, { instanceId: hit.instanceId });
    return hit.key;
}

// ---- Event wiring -----------------------------------------------------------

function isTyping(target) {
    const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target && target.isContentEditable);
}

function setupEventListeners() {
    const signal = cleanupController.signal;
    installCardFocusTrap({ signal });
    installCardScrollReset({ signal });
    initCards({ signal });
    initGrid(CONFIG, {
        signal,
        onSortKey: (key) => setSort(key, CONFIG.sortKeys[key]),
        onReverse: () => {
            const q = normalizeQuery(ui.query, CONFIG, state.doc.settings);
            setSort(q.sortKey, q.sortDir === 'asc' ? 'desc' : 'asc');
        }
    });

    const wire = (id, type, handler) => {
        const node = el(id);
        if (node) node.addEventListener(type, handler, { signal });
    };
    wire('bar-new', 'click', () => openApplicationForm(null));
    wire('bar-computer', 'click', () => openComputer());
    wire('bar-calendar', 'click', () => openCalendar());
    wire('bar-cabinet', 'click', () => openCabinet());
    wire('bar-board', 'click', () => openBoard());
    wire('board-form', 'submit', moveFromSheet);
    wire('board-card', 'change', () => drawBoardSheet());
    wire('cabinet-search', 'input', () => {
        ui.query = { ...ui.query, text: el('cabinet-search').value };
        queryChanged();
        if (!ui.searched) {
            ui.searched = true;
            track('search');
        }
    });
    wire('cabinet-sort', 'change', () => {
        const key = el('cabinet-sort').value;
        setSort(key, CONFIG.sortKeys[key]);
        announce(`Refiled by ${SORT_LABELS[key].toLowerCase()}.`);
    });
    wire('hud-due', 'click', () => openToday());
    wire('cal-prev', 'click', () => turnMonth(-1));
    wire('cal-next', 'click', () => turnMonth(1));
    wire('cal-this', 'click', () => turnMonth(0));
    wire('cal-export', 'click', exportUpcoming);
    wire('today-export', 'click', exportUpcoming);
    wire('today-calendar', 'click', () => { closeCard('today'); openCalendar(); });
    wire('outtray-ics', 'click', exportUpcoming);
    // The month is one tab stop, and the arrows move the chosen day: a day
    // at a time, a week at a time, or to the start or end of its week.
    wire('cal-body', 'keydown', (event) => {
        const key = event.target && event.target.dataset ? event.target.dataset.day : null;
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
        if (!key) return;
        const [y, m, d] = key.split('-').map(Number);
        const day = new Date(y, m - 1, d);
        let next = null;
        if (step) next = addDays(day, step);
        else if (event.key === 'Home') next = addDays(day, -((day.getDay() + 6) % 7));
        else if (event.key === 'End') next = addDays(day, 6 - ((day.getDay() + 6) % 7));
        if (!next) return;
        event.preventDefault();
        selectDay(formatDate(next));
    });
    wire('bar-outtray', 'click', () => openOuttray());
    wire('bar-wastebasket', 'click', () => openWastebasket());
    wire('bar-settings', 'click', openSettings);
    wire('bar-undo', 'click', undo);
    wire('grid-new', 'click', () => openApplicationForm(null));
    wire('grid-clear', 'click', gridHandlers.clearFilters);
    wire('grid-search', 'input', () => {
        ui.query = { ...ui.query, text: el('grid-search').value };
        queryChanged();
        if (!ui.searched) {
            ui.searched = true;
            track('search');
        }
    });
    wire('grid-goal', 'change', saveGoal);
    wire('af-form', 'submit', submitApplicationForm);
    wire('af-cancel', 'click', () => closeCard('application-form'));
    wire('af-posting', 'input', updateFound);
    wire('af-use-found', 'click', useFound);
    wire('ef-form', 'submit', submitEventForm);
    wire('ef-cancel', 'click', () => closeCard('event-form'));
    wire('tf-form', 'submit', submitTaskForm);
    wire('tf-cancel', 'click', () => closeCard('task-form'));
    wire('wastebasket-empty', 'click', emptyTheWastebasket);
    wire('outtray-backup', 'click', saveBackup);
    wire('outtray-csv', 'click', exportCsv);
    wire('outtray-restore', 'change', restoreFromFile);
    wire('settings-form', 'submit', saveSettings);
    wire('settings-stock', 'click', () => { closeCard('settings'); stockOffice(); });
    wire('settings-clear-samples', 'click', () => { clearTheSamples(); renderSamplesButtons(state.doc); });
    wire('settings-clear-all', 'click', clearEverything);

    window.addEventListener('resize', handleResize, { signal });

    // Another tab saved or cleared the office.
    window.addEventListener('storage', (event) => {
        if (event.key === store.key || event.key === null) followOtherTab();
    }, { signal });

    // Taps on the room. A click is what a tap becomes on a phone too, and the
    // card it opens is armed against the tap's own echo (cards.js).
    canvas.addEventListener('click', (event) => handleSceneTap(event.clientX, event.clientY), { signal });
    canvas.addEventListener('pointerdown', boardPointerDown, { signal });
    canvas.addEventListener('pointermove', boardPointerMove, { signal });
    canvas.addEventListener('pointerup', boardPointerUp, { signal });
    canvas.addEventListener('pointercancel', boardPointerCancel, { signal });
    canvas.addEventListener('pointermove', (event) => {
        if (event.pointerType !== 'mouse' || !state.loaded || drag) return;
    if (anyOpen() && topCard() !== 'cabinet' && topCard() !== 'board') return;
        canvas.style.cursor = pickAt(event.clientX, event.clientY) ? 'pointer' : '';
    }, { signal });

    // Shortcuts. Undo works anywhere but inside a text box, where the
    // browser's own undo is the one a visitor means.
    document.addEventListener('keydown', (event) => {
        const key = String(event.key || '').toLowerCase();
        if ((event.metaKey || event.ctrlKey) && key === 'z' && !event.shiftKey && !isTyping(event.target)) {
            event.preventDefault();
            undo();
            return;
        }
        if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
        // Over the computer, N and / still work: adding and searching are
        // what the computer is for. Over any other card, nothing does.
        const top = topCard();
        if (top && top !== 'computer') return;
        if (key === 'n') { event.preventDefault(); openApplicationForm(null); }
        else if (key === '/') {
            event.preventDefault();
            if (top) el('grid-search').focus();
            else openComputer({ focusSearch: true });
        } else if (top) return;
        else if (key === 'c' || key === '2') { event.preventDefault(); openComputer(); }
        else if (key === '3') { event.preventDefault(); openCalendar(); }
        else if (key === '4') { event.preventDefault(); openCabinet(); }
        else if (key === '5') { event.preventDefault(); openBoard(); }
        else if (key === 't') { event.preventDefault(); openToday(); }
        else if (key === '1') { event.preventDefault(); goTo('desk'); }
    }, { signal });

    // A hidden tab saves and stops drawing, and the clock is read again on
    // the way back, because a follow-up may have fallen due meanwhile.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            save();
            stop();
        } else {
            refresh();
            start();
        }
    }, { signal });

    // SAVE FIRST, THEN TEAR DOWN.
    window.addEventListener('pagehide', () => {
        state.doc = touchVisit(state.doc, now()).doc;
        save();
        endSession();
        cleanup();
    }, { signal });
}

// ---- Render loop ------------------------------------------------------------

function start() {
    if (state.running || !renderer || tornDown) return;
    state.running = true;
    state.lastTime = 0;
    requestRender();
    renderer.setAnimationLoop(animate);
}

function stop() {
    state.running = false;
    if (renderer) renderer.setAnimationLoop(null);
}

function animate() {
    if (!state.running) return;
    const t = performance.now();
    const delta = state.lastTime === 0
        ? 0
        : Math.min((t - state.lastTime) / 1000, CONFIG.quality.maxFrameSeconds);
    state.lastTime = t;

    // Once a minute the clock is read again, so a follow-up can fall due and
    // the title can say so while the tab is open.
    state.tickDue += delta;
    if (state.tickDue >= CONFIG.tickSeconds) {
        state.tickDue = 0;
        refresh();
    }

    if (glide) {
        applyPose(glide.step(delta));
        if (glide.done) glide = null;
        state.dirty = true;
    }
    if (ui.cabinetMoving && filing) {
        ui.cabinetMoving = filing.update(delta);
        state.dirty = true;
    }
    if (ui.boardMoving && pinboard) {
        ui.boardMoving = pinboard.update(delta);
        state.dirty = true;
    }

    if (!state.dirty) return;
    state.dirty = false;
    state.frames++;
    renderer.render(scene, camera);
}

// ---- Teardown ---------------------------------------------------------------

function cleanup() {
    if (tornDown) return;
    tornDown = true;
    if (store) store.tearDown();
    stop();
    if (cleanupController) cleanupController.abort();
}

function endSession() {
    if (sessionEnded || !sessionStart) return;
    sessionEnded = true;
    trackFinal('session-end', { seconds: Math.round((Date.now() - sessionStart) / 1000) });
}

// ---- Public surface ---------------------------------------------------------

export function getState() {
    return { ...state, doc: undefined };
}

export function getDoc() {
    return state.doc;
}

// ---- Boot -------------------------------------------------------------------

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
        const loading = el('loading-screen');
        if (loading) loading.classList.remove('hidden');
        const status = el('load-status');
        if (status) status.textContent = "This browser can't run the 3D view. Taking you to the standard site…";
    } catch (e) { /* ignore, we're redirecting regardless */ }
    setTimeout(() => { window.location.replace('/'); }, 2500);
}

function boot() {
    if (!hasWebGL()) { fallbackTo2D(); return; }
    init().catch((err) => {
        console.error('[Corner Office] 3D init failed, falling back to the 2D site:', err);
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
    state,
    ui,
    history,
    mutate,
    change,
    undo,
    save,
    refresh,
    animate,
    requestRender,
    followOtherTab,
    showWelcome,
    openComputer,
    drawComputer,
    openCalendar,
    drawCalendarCard,
    openCabinet,
    fileCabinet,
    openBoard,
    pinBoard,
    drawBoardSheet,
    dropCard,
    boardPointerDown,
    beginPointerDrag,
    boardPointerMove,
    boardPointerUp,
    boardPointerCancel,
    pinboard: () => pinboard,
    drawCabinetSheet,
    filing: () => filing,
    pickAt,
    selectDay,
    turnMonth,
    openToday,
    exportEvent,
    exportUpcoming,
    applyDaylight,
    lights,
    currentRows,
    openFolder,
    openApplicationForm,
    submitApplicationForm,
    openEventForm,
    submitEventForm,
    openTaskForm,
    submitTaskForm,
    throwAway,
    restore,
    openWastebasket,
    openOuttray,
    saveBackup,
    exportCsv,
    restoreFromText,
    openSettings,
    saveSettings,
    saveGoal,
    stockOffice,
    clearTheSamples,
    clearEverything,
    actOn,
    handleSceneTap,
    goTo,
    glide: () => glide,
    room: () => room,
    store: () => store,
    camera: () => camera,
    scene: () => scene
};
