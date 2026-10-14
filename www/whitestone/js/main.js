// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * main.js - Entry point for Whitestone Home Care.
 *
 * THE BOOT (Auto Man's, adapted in PLANNING 4.1): the loading screen, the
 * shared proof-of-work puzzle, the renderer and the stage, the saved
 * document, the shaders warmed behind the loader, then the reveal and the
 * camera's push-in. The price sheet loads in the background, so a slow
 * network never holds up the house.
 *
 * THE DOCUMENT IS THE SOURCE OF TRUTH AND THE HOUSE IS A PROJECTION OF IT
 * (Corner Office's rule). Every change goes through `mutate`, which applies a
 * store.js mutation, keeps the document it replaced for undo, saves, and
 * calls `refresh` so everything on screen is drawn again from the new
 * document. `change` is mutate plus the spoken line and the undo toast.
 *
 * THE SCENE RENDERS ON DEMAND, as Corner Office does. The house mostly
 * sits still, so a frame is drawn only when something asks for one
 * (`requestRender`): the reveal, a resize, a returning tab, the house
 * turning, a floor opening. A still house costs a phone nothing.
 *
 * THE HOUSE TURNS, NOT THE CAMERA (turntable.js, PLANNING 6.2). A drag
 * turns the turntable and tilts the view, a pinch, the wheel or the + and -
 * keys zoom, and the arrow keys turn and tilt. A press that barely moves is
 * a tap, and a tap on the house opens a floor. This file reads the pointers
 * itself, since the shared pan part turns a camera.
 *
 * This is the one place the real clock and the real window are read.
 */

import { CONFIG } from './config.min.js';
import { getProofOfWork, installCardFocusTrap, installCardScrollReset } from '../../shared/js/boot-1.0.0.min.js';
import { warmShaders } from '../../shared/js/warmup-1.0.0.min.js';
import { createResolution } from '../../shared/js/resolution-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';
import {
    createStore, findChecklist, createChecklist, updateChecklist, setLevels, setPreferences, deleteChecklist,
    duplicateChecklist, setSettings, touchVisit, storageUse, isLive, addRoom, updateRoom, deleteRoom, addItem,
    updateItem, deleteItem, addPhoto, removePhoto, photoIdsInUse, newId, itemsIn, liveRooms, liveItems,
    clearSamples, hasSamples, setBath
} from './store.min.js';
import { withExample } from './samples.min.js';
import { createHistory } from './history.min.js';
import { loadSheet, currentVersion, checkChoice, presetFor, presetGains, taskOf } from './sheet.min.js';
import { priceChoice, formatMoney, formatMinutes } from './pricing.min.js';
import { createPhotoStore, createMemoryBackend, openIdbBackend, preparePhoto } from './photos.min.js';
import { roomName, levelOf, bathChoices, bathChoiceOf, serviceType as typeOf } from './taxonomy.min.js';
import { h, clear, initCards, openCard, closeCard, isOpen, anyOpen, announce, toast, confirmCard, setFocusFallback } from './cards.min.js';
import {
    initForms, fillSetupForm, readSetupForm, validateSetup, showError, showHints, fillPreferencesForm, readPreferencesForm,
    fillRoomForm, readRoomForm, validateRoom, showPresetPreview, showBathChoices, fillTaskForm, showTaskChoices, readTaskForm
} from './forms.min.js';
import {
    renderMyChecklists, renderChecklist, renderTaskPhotos, taskName, fillChecklistFilter, quoteChip, renderQuote,
    renderMenu, fillMenuAreas
} from './panels.min.js';
import { UI, MODEL_LINES, STORAGE_NOTES, ITEM_ERRORS, GUIDE, PANEL } from './copy.min.js';
import { createTurntable, turnPoint } from './turntable.min.js';
import { buildStage, buildLights, firstPick } from './stage.min.js';
import { buildModel } from './model.min.js';
import { arrivalId, arrivalGuide, step as guideStep, viewFor, addedLine, savedForm, hasOwn, GUIDED } from './guide.min.js';
import { createHost } from './host.min.js';
import { buildMaya, speakSeconds } from './cast.min.js';
import { createPanel, selectFromHit, stepOut, reconcile, panelView } from './panel.min.js';

// ---- State ------------------------------------------------------------------

const state = {
    mobile: false,
    reducedMotion: false,
    loaded: false,
    running: false,
    dirty: false,
    drewLast: false,
    lastTime: 0,
    frames: 0,
    /** The saved document (store.js), and how it was found at boot. */
    doc: null,
    storageStatus: 'fresh',
    /** The current price sheet, once it has loaded: loading, ready, failed. */
    sheet: null,
    sheetStatus: 'loading',
    /** Where photos are kept: opening, device (IndexedDB) or memory. */
    photosStatus: 'opening',
    /** The camera's pose as last set (turntable.js framePose). */
    pose: null,
    /** Whether this browser holds the document yet. A first visit's example
     *  is not saved until the visitor changes something (samples.js). */
    saved: false
};

/**
 * What the cards are doing:
 *   editing     the checklist the setup card edits (null for a new one)
 *   room        the room the room card edits (null for a new one)
 *   task        the task card's room, item (null for a new task) and photos
 *   afterPrefs  open the room card once preferences close (first visit)
 *   filter      what the checklist view shows (panels.js filterChoices)
 *   menuArea    the kind of room the service menu shows
 *   guide       where Maya's guide is (guide.js)
 *   selected    what is selected on the house (panel.js): the whole house,
 *               a floor, a room or a task, or null
 */
const ui = {
    editing: null, room: null, task: null, afterPrefs: false, filter: 'all', menuArea: null, guide: null, selected: null
};

/** Thumbnail addresses made for the task card, released when it closes. */
const photoUrls = new Map();

let canvas = null;
let renderer = null;
let scene = null;
let camera = null;
let resolution = null;
let cleanupController = null;
let tornDown = false;
let sessionStart = 0;
let sessionEnded = false;
let store = null;
let history = null;
let photoStore = null;
/** The white cove and the turntable (stage.js). */
let stage = null;
/** The house model on the turntable (model.js). */
let model = null;
/** The visitor's view: the house's turn, the tilt, the zoom (turntable.js). */
let turntable = null;
/** The room labels over a lifted level, and what they say. */
const roomLabels = { nodes: [], key: '' };
/** Maya's bubble (host.js). */
let host = null;
/** Maya on the stage (cast.js). */
let cast = null;
/** The panel beside the house (panel.js). */
let panel = null;
/** The scene Maya last gestured for, so each new one gets its gesture. */
let gesturedFor = null;
let raycaster = null;
let lastHover = 0;
let sun = null;
let envTarget = null;
/** The pointers down on the canvas, and what they are doing: a tap until
 *  one moves past the slop, then a drag; two make a pinch. */
const gesture = { pointers: new Map(), start: null, dragging: false, lastMove: 0, spread: 0 };
/** Whether the look was held still last frame (a card open), so the frame
 *  after a card opens or closes is drawn. */
let wasLocked = null;
/** The turn the turntable was last drawn at. */
let drawnYaw = null;

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

function el(id) {
    return document.getElementById(id);
}

/** The one place the wall clock is read. Everything else is handed it. */
function now() {
    return new Date();
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

    updateLoadingStatus('Setting the stage…', 40);
    // THE ONE ABORT CONTROLLER FOR THE PAGE, made before anything listens.
    cleanupController = new AbortController();
    buildRenderer();
    buildScene();

    updateLoadingStatus('Finding your checklists…', 60);
    // The store brings its own localStorage adapter, and this file never
    // names the global: store.js is the one writer the privacy policy lists.
    store = createStore(undefined, CONFIG);
    const loaded = store.load(now());
    state.doc = loaded.doc;
    state.storageStatus = loaded.status;
    state.saved = loaded.status === 'restored';
    // MAYA GREETS A FIRST VISIT beside a plain house (PRD 8.2), with the
    // example one tap away. A RETURNING VISITOR ARRIVES TO THEIR OWN HOME
    // (PRD 8.6): the one open when they left, else their latest, and is
    // welcomed back (guide.js).
    ui.guide = arrivalGuide(state.doc);
    state.doc = setSettings(state.doc, { activeId: ui.guide.scene === 'hello' ? null : arrivalId(state.doc) }).doc;
    history = createHistory();

    updateLoadingStatus('Turning on the lights…', 75);
    initForms(CONFIG);
    setupEventListeners();
    refresh();
    loadPrices();
    openPhotos();

    // Build the shaders now, behind the loading screen, rather than on the
    // first frame where they would freeze the house the moment it appears
    // (shared warmup part).
    updateLoadingStatus('Preparing the view…', 95);
    await warmShaders(renderer, [{ scene, camera }]);
    // Maya's face for her bubble, drawn once behind the loader.
    if (cast && host) {
        const face = cast.portrait(renderer, scene);
        if (face) host.setPortrait(face);
    }

    updateLoadingStatus('Ready', 100);
    setTimeout(() => {
        const loading = el('loading-screen');
        if (loading) loading.classList.add('hidden');
        state.loaded = true;
        // EVERY .ui-float IS display:none UNTIL THIS LINE.
        document.querySelectorAll('.ui-float').forEach((node) => node.classList.add('visible'));
        // Maya speaks once the house has come in (at once under reduced
        // motion, ONBOARDING Scene 1).
        setTimeout(showGuide, state.reducedMotion ? 0 : CONFIG.guide.delay * 1000);
        // The push-in: from farther out, eased in (a cut under reduced
        // motion, PLANNING 4.1).
        if (!state.reducedMotion) turntable.arrive();
        applyPose(turntable.pose(aspect()));
        refresh();
    }, CONFIG.loadingReveal);

    // Console helpers for QA and screenshots.
    window.whitestone = {
        /** What the adaptive resolution has settled on, and what a frame
         *  costs. */
        quality() {
            const info = renderer && renderer.info ? renderer.info.render : {};
            return { ...resolution.readout(), drawCalls: info.calls, triangles: info.triangles };
        },
        /** Full resolution held, for a social-card capture (`capture(false)`
         *  lets it adapt again). */
        capture(on = true) {
            const held = resolution.pin(on);
            requestRender();
            return held;
        },
        /** The saved document as it is now. */
        doc: () => state.doc,
        /** Open a floor of the house ('main', 'second'...), or close it
         *  with null. */
        lift: liftLevel,
        /** Turn the house by this many radians (a screenshot's angle). */
        turn(radians) {
            turntable.turnBy(Number(radians) || 0);
            requestRender();
            return turntable.yaw;
        },
        /** The view now: the house's turn, the tilt, the zoom. */
        look: () => ({ yaw: turntable.yaw, tilt: turntable.tilt, zoom: turntable.zoom })
    };

    // Whether the visitor came back to saved checklists rides in `outcome`,
    // and nothing of what they hold (privacy.html).
    track('session-start', {
        device: state.mobile ? 'touch' : 'desktop',
        outcome: `returning=${state.storageStatus === 'restored'}`
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
    renderer.toneMappingExposure = CONFIG.light.exposure;
    // The skylight's shadows. Only the house moves, so the map is drawn
    // again only when it changes or turns (markShadows), never for a tilt
    // or a zoom.
    renderer.shadowMap.enabled = true;
    // PCFShadowMap is soft from r182 on, which retired PCFSoftShadowMap.
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    // Adaptive resolution (shared resolution-1.0.0): below the device's own
    // ratio for as long as the frames say it is too much, back up when not.
    resolution = createResolution({ renderer, ceiling: pixelRatioCeiling });
    resolution.apply();
}

/** Draw the sun's shadows again on the next frame. */
function markShadows() {
    if (renderer && renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
    requestRender();
}

function buildScene() {
    scene = new THREE.Scene();
    stage = buildStage(CONFIG);
    // Beyond the cove's edges (never in frame) is the cove's own white.
    scene.background = new THREE.Color(stage.background);
    scene.add(stage.group);
    // The house stands in the turntable's group, so it turns with it.
    model = buildModel(CONFIG, [0, stage.top, 0]);
    stage.spin.add(model.group);

    cast = buildMaya(CONFIG);
    scene.add(cast.group);

    const lit = buildLights(CONFIG, state.mobile);
    sun = lit.sun;
    for (const light of lit.lights) scene.add(light);

    turntable = createTurntable(CONFIG);
    const pose = turntable.pose(aspect());
    camera = new THREE.PerspectiveCamera(pose.fov, aspect(), CONFIG.camera.near, CONFIG.camera.far);
    applyPose(pose);
    captureRoom();
}

/** The materials that mirror the stage: the turntable's clear-coated
 *  stone, and whatever of the model's is shiny. */
function reflective() {
    return [...(stage ? stage.shiny : []), ...(model ? model.shiny : [])];
}

/**
 * Give the stone the white of the cove to reflect: the stage captured once
 * from in front, behind the loading screen.
 */
function captureRoom() {
    if (!renderer || !stage || !THREE.PMREMGenerator) return;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const from = CONFIG.light.reflectFrom;
    envTarget = pmrem.fromScene(scene, 0.03, 0.1, CONFIG.camera.far, { position: new THREE.Vector3(from[0], from[1], from[2]) });
    pmrem.dispose();
    for (const m of reflective()) {
        m.envMap = envTarget.texture;
        m.envMapIntensity = m.metalness >= 0.25 ? 1 : 0.6;
        m.needsUpdate = true;
    }
    // The capture spent the shadow map's update on its own first face. The
    // sun has not moved, so the map it drew is the one the stage needs.
}

// ---- The house model ------------------------------------------------------------

/**
 * Open a floor of the house (null closes it): the floors above it lift
 * away like a dollhouse's, and the house turns its open front to the
 * visitor. Returns whether the floor is one of the home's.
 */
function liftLevel(level) {
    if (!model) return false;
    const was = model.lifted;
    if (!model.lift(level, state.reducedMotion)) return false;
    // An open floor's open side is the house's front: turned to the visitor.
    if (level && turntable) turntable.faceFront(state.reducedMotion ? 0 : CONFIG.view.turn.face);
    if (turntable) turntable.setHeight(frameHeight(), state.reducedMotion);
    markShadows();
    const c = active();
    const name = level ? levelOf(c ? c.serviceType : 'cleaning', level) : null;
    if (level && name) announce(MODEL_LINES.lifted(name.name));
    else if (!level && was) announce(MODEL_LINES.setDown);
    return true;
}

/** How tall the frame holds the house: as it stands closed, and with the
 *  floors above an open one lifted away. */
function frameHeight() {
    if (!model) return 0;
    return model.height + (model.lifted ? CONFIG.model.lift.open * model.scale : 0);
}

/** Whether there is a step back to take: something selected, or a floor
 *  open. */
function away() {
    return Boolean(ui.selected || (model && model.lifted));
}

/**
 * One step back (QA, 2026-10-13: "once I click on a floor of the model
 * house it's hard to exit out"): a task to its room, a room to its floor, a
 * floor to the closed house. By the panel's back button, Escape, or a tap
 * on empty space.
 */
function stepBack() {
    if (ui.selected) {
        selectTo(stepOut(ui.selected));
        return true;
    }
    if (model && model.lifted) {
        liftLevel(null);
        return true;
    }
    return false;
}

// ---- The selection and the panel (panel.js) --------------------------------------

/**
 * Select something on the house (null for nothing): its floor opens (the
 * whole house closes them), the room is outlined, the task's dot stands
 * out, and the panel says what it is. With `focus`, the keyboard picks up
 * in the panel. Returns the selection as it could be made.
 */
function selectTo(next, { focus = false } = {}) {
    const c = active();
    let sel = next && c ? reconcile(next, c) : null;
    if (sel) sel = { ...sel, checklistId: c.id };
    ui.selected = sel;
    const level = sel && sel.scope !== 'house' ? sel.level : null;
    if (level !== (model ? model.lifted : null)) liftLevel(level);
    if (model && model.select({ roomId: sel ? sel.roomId : null, itemId: sel ? sel.itemId : null })) markShadows();
    showPanel();
    if (focus && panel && panel.shown) panel.focusFirst();
    requestRender();
    return ui.selected;
}

/** The panel for the selection now, or put away. */
function showPanel() {
    if (!panel) return;
    const view = ui.selected ? panelView(ui.selected, active(), state.sheet) : null;
    if (!view) ui.selected = null;
    panel.show(view);
}

/** A button in the panel's list: a floor, a room, or a task. */
function onPanelRow(kind, id) {
    const c = active();
    if (!c) return;
    if (kind === 'floor') selectTo({ scope: 'floor', level: id, roomId: null, itemId: null }, { focus: true });
    else if (kind === 'room') {
        const room = c.rooms.find((r) => r.id === id);
        if (room) selectTo({ scope: 'room', level: room.level, roomId: id, itemId: null }, { focus: true });
    } else if (kind === 'task') {
        const item = c.items.find((i) => i.id === id);
        const room = item && c.rooms.find((r) => r.id === item.roomId);
        if (room) {
            selectTo({ scope: 'task', level: room.level, roomId: room.id, itemId: id }, { focus: true });
            guideTo({ type: 'dotOpened' });
        }
    }
}

/** The panel's back button: one step back, the keyboard kept in the panel,
 *  or on the Rooms chip once the panel has gone. */
function onPanelBack() {
    selectTo(stepOut(ui.selected), { focus: true });
    if (!ui.selected) {
        const rooms = el('hud-rooms');
        if (rooms && typeof rooms.focus === 'function') rooms.focus();
    }
}

/** A task starred, or no longer: the ones that matter most, done first. */
function toggleStar(itemId) {
    const c = active();
    const item = c && c.items.find((i) => i.id === itemId && !i.deletedAt);
    if (!item) return null;
    const name = taskName(state.sheet, item);
    return change((d) => updateItem(d, c.id, itemId, { important: !item.important }, CONFIG, now(), { check }),
        PANEL.starStep, item.important ? PANEL.unstarred(name) : PANEL.starred(name));
}

/** The panel's buttons under its list. */
function onPanelAction(id) {
    const sel = ui.selected;
    switch (id) {
    case 'checklist': openChecklistView(); break;
    case 'home': editHome(); break;
    case 'anotherRoom': {
        openRoom(null);
        const levelField = el('room-level');
        if (sel && levelField) levelField.value = sel.level;
        break;
    }
    case 'addTask': if (sel) openTask(sel.roomId, null); break;
    case 'editRoom': if (sel) openRoom(sel.roomId); break;
    case 'editTask': if (sel) openTask(null, sel.itemId); break;
    case 'starTask': if (sel) toggleStar(sel.itemId); break;
    case 'removeTask':
        if (sel) {
            // The removal itself drops the selection back to the room
            // (refresh reconciles it); only step back if it has not.
            const result = removeTask(sel.itemId);
            if (result && !result.error) {
                if (ui.selected && ui.selected.scope === 'task') selectTo(stepOut(ui.selected), { focus: true });
                else if (panel) panel.focusFirst();
            }
        }
        break;
    default: break;
    }
}

/** A type of bath in the panel: the bathroom made it, the keyboard kept on
 *  the type just chosen. */
function onPanelBath(key) {
    const sel = ui.selected;
    if (!sel || !sel.roomId) return null;
    const result = changeBath(sel.roomId, key);
    if (result && !result.error && panel) panel.focusBath(key);
    return result;
}

/** A room chip in the panel: that kind of room on the open floor, with its
 *  standard tasks, selected to show them. */
function onPanelChip(area) {
    const sel = ui.selected;
    if (!sel) return;
    const result = addRoomOf(area, sel.level);
    if (result && !result.error) selectTo({ scope: 'room', level: sel.level, roomId: result.record.id, itemId: null }, { focus: true });
}

/**
 * The names of the open floor's rooms, each over its room, however the
 * house is turned. Called before every frame that is drawn, so they follow
 * a turn, a zoom and the lift itself. Rebuilt only when the rooms change,
 * moved otherwise.
 */
function placeLabels() {
    const list = el('ws-rooms');
    if (!list || !camera) return;
    // Not over an open card (QA, 2026-10-13: they showed through it).
    const labels = model && state.loaded && !lookLocked() ? model.labels() : [];
    list.hidden = !labels.length;
    const key = labels.map((l) => `${l.roomId}:${l.text}`).join('|');
    if (key !== roomLabels.key) {
        roomLabels.key = key;
        clear(list);
        roomLabels.nodes = labels.map((l) => list.appendChild(h('li', { className: 'ws-room', text: l.text })));
        const c = active();
        const level = c && model.lifted ? levelOf(c.serviceType, model.lifted) : null;
        if (level) list.setAttribute('aria-label', MODEL_LINES.roomsOn(level.name));
    }
    if (!labels.length) return;
    // The camera as this frame will draw it, not as the last frame did.
    camera.updateMatrixWorld();
    const width = window.innerWidth;
    const height = window.innerHeight;
    const v = new THREE.Vector3();
    labels.forEach((l, i) => {
        const node = roomLabels.nodes[i];
        if (!node) return;
        const p = turnPoint(l.point, turntable.yaw);
        v.set(p[0], p[1], p[2]).project(camera);
        const x = Math.round(((v.x + 1) / 2) * width);
        const y = Math.round(((1 - v.y) / 2) * height);
        node.hidden = !(v.z > -1 && v.z < 1);
        node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -140%)`;
    });
}

// ---- Tapping the house -------------------------------------------------------------

/**
 * A tap on the house (ONBOARDING section 4). A tap on a blue dot selects
 * its task, inside the open floor a tap on a room selects the room, and a
 * tap anywhere else on a floor selects (and opens) it, the panel saying
 * what was chosen. With no checklist open it starts one. With nothing known
 * of where it landed, it opens the next floor up, and past the top one
 * closes the house again.
 */
function tapModel(level = null, itemId = null, roomId = null) {
    if (!state.loaded) return false;
    const c = active();
    if (!c) {
        // While Maya greets, a tap on the plain house is Let's start.
        if (!(ui.guide && ui.guide.scene === 'hello' && guideTo({ type: 'start' }))) startOwn();
        return true;
    }
    // A blue dot: its task (ONBOARDING Scene 4), wherever its floor is.
    const item = itemId ? c.items.find((i) => i.id === itemId && !i.deletedAt) : null;
    if (item) {
        const room = c.rooms.find((r) => r.id === item.roomId);
        selectTo({ scope: 'task', level: room.level, roomId: room.id, itemId: item.id });
        guideTo({ type: 'dotOpened' });
        return true;
    }
    if (!level) {
        const levels = model.levels();
        const at = levels.indexOf(model.lifted);
        const next = at + 1 < levels.length ? levels[at + 1] : null;
        selectTo(next ? { scope: 'floor', level: next, roomId: null, itemId: null } : null);
        return true;
    }
    const sel = selectFromHit({ level, roomId, itemId: null }, model.lifted);
    if (!sel) return false;
    selectTo(sel);
    return Boolean(ui.selected);
}

/**
 * The example home on the turntable, closed. Made for this visit only and
 * not saved unless the visitor changes something (PRD 8.8), so looking at
 * it costs nothing.
 */
function showExample() {
    let example = state.doc.checklists.find((c) => isLive(c) && c.sample);
    if (!example) {
        const seeded = withExample(state.doc, CONFIG, now(), null);
        if (seeded.error) return false;
        state.doc = seeded.doc;
        example = state.doc.checklists.find((c) => isLive(c) && c.sample);
    }
    selectTo(null);
    liftLevel(null);
    state.doc = setSettings(state.doc, { activeId: example.id }).doc;
    refresh();
    return true;
}

/** What is under a point on the canvas: `{ key, level, roomId, itemId }`,
 *  or null. Only the
 *  house answers: the stone, the cove and the air are empty space. */
function pickAt(clientX, clientY) {
    if (!camera || !model) return null;
    if (!raycaster) raycaster = new THREE.Raycaster();
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
        ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const pick = firstPick(raycaster.intersectObjects(cast && cast.group.visible ? [model.group, cast.group] : [model.group], true));
    if (!pick) return null;
    if (pick.key !== 'model') return { key: pick.key, level: null, roomId: null, itemId: null };
    return { key: pick.key, ...(model.hitOf(pick.hit) || { level: null, roomId: null, itemId: null }) };
}

/** A tap on Maya: she says it again, with a wave toward the house (or,
 *  once the guide is over, a hint about the house). */
function tapHost() {
    if (!state.loaded) return false;
    guideTo({ type: 'again' });
    if (cast && !state.reducedMotion) cast.gesture('point');
    requestRender();
    return true;
}

/** A tap on the canvas: the house answers, or a tap on empty space steps
 *  back. Nothing answers while a card is open. */
function handleSceneTap(clientX, clientY) {
    if (!state.loaded || anyOpen()) return null;
    closeHelp();
    const hit = pickAt(clientX, clientY);
    if (!hit) {
        stepBack();
        return null;
    }
    if (hit.key === 'host') {
        tapHost();
        return hit.key;
    }
    tapModel(hit.level, hit.itemId, hit.roomId);
    return hit.key;
}

// ---- The look: turning, tilting, zooming --------------------------------------------

/** Whether the visitor's look is held still: before the house is ready,
 *  and while any card is open (each card has the house behind it). */
function lookLocked() {
    return !state.loaded || anyOpen();
}

/** How far apart the first two pointers are, in pixels. */
function spread() {
    const [a, b] = [...gesture.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}

/**
 * The canvas's pointers: one that barely moves and lifts soon is a tap,
 * one that moves turns and tilts the house, and two pinch. The wheel
 * zooms. A mouse that is not pressed says what answers a tap with its
 * cursor.
 */
function setupLook(signal) {
    if (canvas.style) canvas.style.touchAction = 'none';
    const { tap } = CONFIG.view;
    canvas.addEventListener('pointerdown', (event) => {
        if (lookLocked()) return;
        if (typeof canvas.setPointerCapture === 'function') {
            try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* an old pointer */ }
        }
        const t = performance.now();
        gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (gesture.pointers.size === 1) {
            gesture.start = { x: event.clientX, y: event.clientY, t };
            gesture.dragging = false;
        } else {
            // A second finger: a pinch, and never a tap.
            gesture.dragging = true;
            gesture.spread = spread();
        }
        gesture.lastMove = t;
        turntable.touch();
        if (host) host.poke();
    }, { signal });
    canvas.addEventListener('pointermove', (event) => {
        const prev = gesture.pointers.get(event.pointerId);
        if (!prev) {
            hover(event);
            return;
        }
        if (lookLocked()) return;
        const t = performance.now();
        const now = { x: event.clientX, y: event.clientY };
        gesture.pointers.set(event.pointerId, now);
        if (gesture.pointers.size >= 2) {
            const d = spread();
            if (gesture.spread > 0 && d > 0) turntable.zoomBy(Math.log2(gesture.spread / d));
            gesture.spread = d;
            gesture.lastMove = t;
            requestRender();
            return;
        }
        if (!gesture.dragging && gesture.start
            && Math.hypot(now.x - gesture.start.x, now.y - gesture.start.y) > tap.slop) gesture.dragging = true;
        if (!gesture.dragging) return;
        turntable.drag(now.x - prev.x, now.y - prev.y, window.innerHeight, (t - gesture.lastMove) / 1000);
        gesture.lastMove = t;
        requestRender();
    }, { signal });
    const lift = (event) => {
        if (!gesture.pointers.has(event.pointerId)) return;
        gesture.pointers.delete(event.pointerId);
        const t = performance.now();
        if (gesture.pointers.size > 0) {
            // One finger of a pinch lifted: the other carries on turning.
            gesture.spread = 0;
            gesture.lastMove = t;
            return;
        }
        const start = gesture.start;
        const tapped = event.type === 'pointerup' && !gesture.dragging && start && t - start.t <= tap.ms;
        turntable.release((t - gesture.lastMove) / 1000);
        gesture.start = null;
        gesture.dragging = false;
        if (tapped) handleSceneTap(event.clientX, event.clientY);
    };
    canvas.addEventListener('pointerup', lift, { signal });
    canvas.addEventListener('pointercancel', lift, { signal });
    canvas.addEventListener('wheel', (event) => {
        if (lookLocked()) return;
        if (event.cancelable) event.preventDefault();
        turntable.zoomBy((event.deltaY || 0) * CONFIG.view.zoom.wheel);
        requestRender();
    }, { passive: false, signal });
}

/** A mouse over the house points, elsewhere it offers to turn it, and a
 *  room it is over is outlined. Asked no more than twenty times a second. */
function hover(event) {
    if (event.pointerType !== 'mouse' || !state.loaded || anyOpen() || !canvas.style) return;
    const t = performance.now();
    if (t - lastHover < 50) return;
    lastHover = t;
    const hit = pickAt(event.clientX, event.clientY);
    canvas.style.cursor = hit ? 'pointer' : 'grab';
    // The room under the pointer, inside the open floor, faintly outlined.
    const room = hit && hit.key === 'model' && hit.roomId && hit.level === model.lifted ? hit.roomId : null;
    if (model && model.hover(room)) requestRender();
}

/**
 * The keys that move the view, from anywhere but a field or an open card:
 * the left and right arrows turn the house, up and down tilt the view, and
 * + and - zoom. Returns whether the key was one of them.
 */
function lookKey(key) {
    const v = CONFIG.view;
    switch (key) {
    case 'ArrowLeft': turntable.turnBy(-v.turn.key); break;
    case 'ArrowRight': turntable.turnBy(v.turn.key); break;
    case 'ArrowUp': turntable.tiltBy(v.turn.key / 2); break;
    case 'ArrowDown': turntable.tiltBy(-v.turn.key / 2); break;
    case '+': case '=': turntable.zoomBy(-v.zoom.key); break;
    case '-': case '_': turntable.zoomBy(v.zoom.key); break;
    default: return false;
    }
    requestRender();
    return true;
}

/** Set the camera to a pose (turntable.js framePose), its view shifted so
 *  the house sits where the frame says. */
function applyPose(pose) {
    camera.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
    camera.fov = pose.fov;
    camera.aspect = aspect();
    const w = window.innerWidth || 1;
    const hgt = window.innerHeight || 1;
    if (typeof camera.setViewOffset === 'function') camera.setViewOffset(w, hgt, pose.offset[0] * w, pose.offset[1] * hgt, w, hgt);
    camera.updateProjectionMatrix();
    camera.lookAt(pose.aim[0], pose.aim[1], pose.aim[2]);
    // Maya is in a wide frame, and out of an upright phone's.
    if (cast) cast.setShown(pose.host);
    state.pose = pose;
}

function handleResize() {
    if (!renderer || !camera) return;
    resolution.apply();
    applyPose(turntable.pose(aspect()));
    requestRender();
}

// ---- Maya and the guide (guide.js, host.js) ---------------------------------------

/** Whether Maya is walking the visitor through the first build. */
function guiding() {
    return Boolean(ui.guide && GUIDED.includes(ui.guide.scene));
}

/** What the words of a scene depend on: the sheet, the rooms so far, and
 *  the first room's line. */
function guideContext() {
    const c = active();
    const room = c && ui.guide && ui.guide.roomId ? c.rooms.find((r) => r.id === ui.guide.roomId) : null;
    return {
        sheet: state.sheet,
        roomCount: c ? liveRooms(c).length : 0,
        roomLabel: room ? roomName(c.serviceType, room) : '',
        addedText: room ? addedLine(state.sheet, room.area, roomName(c.serviceType, room), room.bath) : ''
    };
}

/** The bubble for the scene now, with the floors to tick filled in from
 *  the open checklist. Null when Maya has nothing to say. */
function guideView() {
    if (!ui.guide) return null;
    const v = viewFor(ui.guide, guideContext());
    if (v && v.choices === 'floors') {
        const c = active();
        const type = typeOf(c ? c.serviceType : 'cleaning');
        const levels = (type ? type.levels : []).map((l) => ({ key: l.key, name: l.name, on: Boolean(c && c.levels.includes(l.key)) }));
        return { ...v, choices: { kind: 'floors', levels, title: c ? c.title : GUIDE.defaultTitle, maxTitle: CONFIG.limits.title } };
    }
    return v;
}

/** Which gesture opens a scene: a wave to greet, an arm toward the house
 *  as a step about it begins. */
const GESTURE_OF = {
    hello: 'wave', welcome: 'wave',
    floors: 'point', firstRoom: 'point', added: 'point', dots: 'point', rooms: 'point', review: 'point',
    example1: 'point', example2: 'point', look: 'point'
};

/** Maya says the scene now (or is put away when there is none), with the
 *  gesture that opens it. */
function showGuide() {
    if (!host || !state.loaded) return;
    const view = guideView();
    host.show(view);
    if (!cast) return;
    cast.speaking(view ? speakSeconds(view.text) : 0);
    const scene = ui.guide ? ui.guide.scene : null;
    if (view && scene !== gesturedFor) {
        gesturedFor = scene;
        if (GESTURE_OF[scene] && !state.reducedMotion) cast.gesture(GESTURE_OF[scene]);
        requestRender();
    }
}

/**
 * Maya's bubble, or the panel while it is open, beside her head wherever
 * the camera has put her, on a frame that shows her. Elsewhere (a phone)
 * each keeps its own place.
 */
function placeHost() {
    if (!host || !camera) return;
    const panelOpen = Boolean(panel && panel.shown);
    const showing = panelOpen || host.shown;
    if (!showing || !cast || !cast.group.visible || !state.pose || !state.pose.host) {
        host.anchor(null);
        if (panel) panel.anchor(null);
        return;
    }
    camera.updateMatrixWorld();
    const a = cast.anchor();
    const v = new THREE.Vector3(a[0], a[1], a[2]).project(camera);
    const w = window.innerWidth || 1;
    const hgt = window.innerHeight || 1;
    const x = ((v.x + 1) / 2) * w;
    const y = ((1 - v.y) / 2) * hgt;
    if (panelOpen) {
        panel.anchor(x, y, w, hgt);
        host.anchor(null);
    } else {
        host.anchor(x, y, w, hgt);
        if (panel) panel.anchor(null);
    }
}

/**
 * Move the guide on by an event (guide.js step), do what the new scene
 * needs, save where it is, and let Maya say it. Returns whether the guide
 * moved. "Again" on a scene that has nothing else to show says its hint
 * once more.
 */
function guideTo(event) {
    if (!ui.guide) return false;
    const was = ui.guide;
    const next = guideStep(was, event);
    if (next === was) {
        if (event.type === 'again' && host) {
            const v = guideView();
            if (v) host.show({ ...v, text: v.again || v.text });
        }
        return false;
    }
    ui.guide = next;
    enterScene(next.scene);
    persistGuide();
    showGuide();
    return true;
}

/** What a scene needs on the house and in the document as it begins. */
function enterScene(to) {
    switch (to) {
    case 'hello': {
        // The plain house again: the example, if it was showing, put back.
        selectTo(null);
        liftLevel(null);
        const c = active();
        if (c && c.sample) {
            state.doc = setSettings(state.doc, { activeId: null }).doc;
            refresh();
        }
        break;
    }
    case 'floors':
        selectTo(null);
        liftLevel(null);
        ensureOwn();
        break;
    case 'example1':
        showExample();
        break;
    case 'example2': {
        const levels = model.levels();
        liftLevel(levels.includes('main') ? 'main' : levels[0]);
        break;
    }
    case 'added': {
        // The new room's floor opens, its dots in view.
        const c = active();
        const room = c && ui.guide.roomId ? c.rooms.find((r) => r.id === ui.guide.roomId) : null;
        if (room) liftLevel(room.level);
        break;
    }
    case 'review':
    case 'saved':
        selectTo(null);
        liftLevel(null);
        if (to === 'saved') save();
        break;
    default:
        break;
    }
}

/** Keep where the guide is in the document, once the visitor has a home
 *  of their own to come back to. */
function persistGuide() {
    if (!hasOwn(state.doc)) return;
    const form = savedForm(ui.guide);
    const had = state.doc.settings.guide;
    if (had && had.scene === form.scene && had.reviewed === form.reviewed) return;
    state.doc = setSettings(state.doc, { guide: form }).doc;
    save();
}

/** The visitor's own checklist, made now if the one open is the example or
 *  there is none, named for the guide ("Our home") and on one floor. */
function ensureOwn() {
    const c = active();
    if (c && !c.sample) return c;
    const at = now();
    const result = mutate((d) => {
        const a = createChecklist(d, { title: GUIDE.defaultTitle, levels: ['main'], visitFrequency: 'once', household: '' }, CONFIG, at);
        if (a.error) return a;
        return { doc: setSettings(a.doc, { activeId: a.record.id }).doc, record: a.record, error: null };
    }, UI.labels.started);
    return result.error ? null : active();
}

/** A button in Maya's bubble. */
function onHostButton(id) {
    if (!state.loaded) return;
    if (host) host.poke();
    switch (id) {
    case 'next':
        if (ui.guide.scene === 'floors') commitTitle();
        guideTo({ type: 'next' });
        break;
    case 'kitchen':
        addKitchen();
        break;
    case 'otherRoom':
    case 'addRoom':
        openRoom(null);
        break;
    case 'preferences':
        openPreferences();
        break;
    case 'save':
        guideTo({ type: 'saved' });
        break;
    default:
        guideTo({ type: id });
    }
}

/** The name typed in the bubble, kept as the checklist's title. */
function commitTitle() {
    const c = active();
    const typed = host ? host.title() : null;
    if (!c || typed === null) return;
    const title = typed.trim();
    if (!title || title === c.title) return;
    change((d) => updateChecklist(d, c.id, { title }, CONFIG, now()), UI.labels.home, null);
}

/** A floor ticked or unticked in the bubble: it rises onto the house, or
 *  goes. A floor that still has rooms, or the last one, stays (and its box
 *  is ticked again). */
function onFloor(key, on) {
    const c = ensureOwn();
    if (!c) return;
    if (host) host.poke();
    const levels = on ? [...c.levels.filter((k) => k !== key), key] : c.levels.filter((k) => k !== key);
    const result = mutate((d) => setLevels(d, c.id, levels, CONFIG, now()), UI.labels.home);
    if (result.error) {
        if (host) host.update(guideView());
        return;
    }
    if (!guideTo({ type: 'floorTapped' }) && host) host.update(guideView());
}

/** The kitchen, with its standard preset, on the main floor (or the
 *  lowest floor that is not a garage), in one tap (ONBOARDING Scene 3). */
function addKitchen() {
    const c = active();
    if (!c) return null;
    const type = typeOf(c.serviceType);
    const annex = new Set(type.levels.filter((l) => l.annex).map((l) => l.key));
    const level = c.levels.includes('main') ? 'main' : c.levels.find((k) => !annex.has(k)) || c.levels[0];
    return addRoomOf('kitchen', level);
}

/** A room of kind `area` on `level` with its standard preset, in one step
 *  (Maya's kitchen, the panel's chips). Waits politely for the sheet. */
function addRoomOf(area, level) {
    const c = active();
    if (!c) return null;
    if (!state.sheet) {
        announce(UI.sheetLoading);
        toast(UI.sheetLoading);
        return null;
    }
    const presetItems = presetFor(state.sheet, area);
    const name = roomName(c.serviceType, { area, label: '' });
    const result = change((d) => addRoom(d, c.id, { level, area, label: '' }, CONFIG, now(), { check, presetItems }),
        UI.labels.roomAdded, UI.roomAdded(name, presetItems.length));
    if (!result.error) guideTo({ type: 'roomAdded', roomId: result.record.id });
    return result;
}

/**
 * A step that makes a bathroom another type of bath (`key` of its
 * bathChoices), for `change` or a `chain`, with what it takes off and
 * brings: the tasks the new type cannot have go, and the standard tasks it
 * brings that the room lacks (a full bath's bathtub) come in. Null when the
 * room is that type already, or is not a bathroom.
 */
function bathStep(c, room, key) {
    const to = bathChoices(c.serviceType, room.area).find((x) => x.key === key);
    if (!to || bathChoiceOf(c.serviceType, room) === key) return null;
    const have = itemsIn(c, room.id).map((i) => i.task);
    const presetItems = presetGains(state.sheet, room, to, have);
    return { to, step: (d) => setBath(d, c.id, room.id, key, CONFIG, now(), { check, presetItems }) };
}

/** A bathroom made another type of bath, said with what came off and on.
 *  Waits politely for the sheet, which decides what a type can have. */
function changeBath(roomId, key) {
    const c = active();
    const room = c && c.rooms.find((r) => r.id === roomId && !r.deletedAt);
    if (!room) return null;
    if (!state.sheet) {
        announce(UI.sheetLoading);
        toast(UI.sheetLoading);
        return null;
    }
    const made = bathStep(c, room, key);
    if (!made) return null;
    const result = mutate(made.step, UI.labels.bathChanged);
    if (!result.error) {
        const said = bathSaid(c, room, made.to, result.record);
        announce(said);
        toast(said, { undo });
    }
    return result;
}

/** "The bathroom is now a shower bath. Took off the bathtub." */
function bathSaid(c, room, to, record) {
    const name = (i) => (taskOf(state.sheet, i.task) || { name: i.task }).name;
    const subject = room.label || `The ${roomName(c.serviceType, room).toLowerCase()}`;
    return UI.bathChanged(subject, to.name, record.removed.map(name), record.added.map(name));
}

// ---- Help and Undo ----------------------------------------------------------------

/** Whether the Help menu is open. */
function helpOpen() {
    const menu = el('ws-help-menu');
    return Boolean(menu && !menu.hidden);
}

/** Close the Help menu, focus back on its button when asked. Returns
 *  whether it was open. */
function closeHelp(refocus = false) {
    if (!helpOpen()) return false;
    el('ws-help-menu').hidden = true;
    const btn = el('ws-help');
    if (btn) {
        btn.setAttribute('aria-expanded', 'false');
        if (refocus && typeof btn.focus === 'function') btn.focus();
    }
    return true;
}

/** The Help menu: Maya again, the guide from the start, and the
 *  checklist's own cards. Each item closes the menu first. */
function setupHelp(signal) {
    const btn = el('ws-help');
    const menu = el('ws-help-menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', () => {
        if (helpOpen()) {
            closeHelp();
            return;
        }
        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        const first = Array.from(menu.children || []).find((b) => !b.hidden);
        if (first && typeof first.focus === 'function') first.focus();
    }, { signal });
    const items = {
        'help-again': () => guideTo({ type: 'again' }),
        'help-restart': () => guideTo({ type: 'restart' }),
        'help-checklist': openChecklistView,
        'help-menu': openMenu,
        'help-prefs': openPreferences,
        'help-home': editHome,
        'help-mine': openMine,
        'help-about': () => guideTo({ type: 'about' })
    };
    for (const [id, act] of Object.entries(items)) {
        const item = el(id);
        if (!item) continue;
        item.addEventListener('click', () => {
            closeHelp();
            act();
        }, { signal });
    }
}

// ---- The price sheet --------------------------------------------------------

/** Load the price sheet index.json names, in the background. The house
 *  works without it, and says so where prices would be. */
async function loadPrices() {
    if (typeof fetch !== 'function') {
        state.sheetStatus = 'failed';
        refresh();
        return;
    }
    const fetchJson = async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${response.status} for ${url}`);
        return response.json();
    };
    try {
        const version = await currentVersion('cleaning', fetchJson);
        state.sheet = await loadSheet(version, fetchJson);
        state.sheetStatus = 'ready';
    } catch (err) {
        console.error('[Whitestone] The price sheet did not load:', err);
        state.sheetStatus = 'failed';
    }
    refresh();
}

// ---- Photos -----------------------------------------------------------------

/** Keep photos in IndexedDB, or in memory for the visit when the browser
 *  will not (a private window), and tidy away any no task refers to. */
async function openPhotos() {
    let backend = null;
    try {
        backend = await openIdbBackend(CONFIG);
    } catch (e) {
        backend = null;
    }
    state.photosStatus = backend ? 'device' : 'memory';
    photoStore = createPhotoStore(backend || createMemoryBackend(), CONFIG);
    if (backend) photoStore.prune(photoIdsInUse(state.doc)).catch(() => {});
}

// ---- The document -----------------------------------------------------------

/** The open checklist, or null. */
function active() {
    const id = state.doc && state.doc.settings.activeId;
    const c = id ? findChecklist(state.doc, id) : null;
    return c && isLive(c) ? c : null;
}

function save() {
    const ok = store ? store.save(state.doc) : false;
    if (ok) state.saved = true;
    return ok;
}

/**
 * Apply a mutation. A refusal is said aloud and changes nothing. With a
 * `label` the step can be undone. Without one (opening a checklist, say) it
 * is not an undo step, since there is nothing to take back.
 */
function mutate(fn, label) {
    const result = fn(state.doc);
    if (result.error) {
        announce(result.error);
        return result;
    }
    if (result.doc === state.doc) return result;
    if (label) history.push(state.doc, label);
    state.doc = result.doc;
    save();
    refresh();
    return result;
}

/**
 * Several mutations as one step, so one undo takes them all back. Stops at
 * the first refusal and changes nothing. The record is the first step's.
 */
function chain(doc, steps) {
    let current = { doc, record: null, error: null };
    let first = null;
    for (const step of steps) {
        const r = step(current.doc);
        if (r.error) return { doc, record: null, error: r.error };
        if (first === null) first = r.record;
        current = r;
    }
    return { doc: current.doc, record: first, error: null };
}

/** Whether the price sheet allows a choice in an area (and a bathroom's
 *  type of bath), for store.js. */
function check(choice, area, bath) {
    return state.sheet ? checkChoice(state.sheet, choice, area, bath) : null;
}

/** A mutation that says what it did, with Undo on the toast. */
function change(fn, label, said = label) {
    const result = mutate(fn, label);
    if (!result.error && said) {
        announce(said);
        toast(said, { undo: label ? undo : null });
    }
    return result;
}

function undo() {
    const step = history.undo();
    if (!step) {
        announce(UI.nothingToUndo);
        return null;
    }
    state.doc = step.doc;
    save();
    refresh();
    announce(UI.undone(step.label));
    return step;
}

/** The line under My checklists about saving, or ''. */
function storageNote() {
    if (!store || !store.available) return STORAGE_NOTES.unavailable;
    if (state.storageStatus === 'newer') return STORAGE_NOTES.newer;
    if (state.storageStatus === 'unreadable') return STORAGE_NOTES.unreadable;
    return storageUse(state.doc, CONFIG).nearlyFull ? STORAGE_NOTES.nearlyFull : '';
}

/** Draw everything on screen again from the document. */
function refresh() {
    if (!state.doc) return;
    const c = active();
    const home = el('hud-home');
    if (home) {
        home.hidden = !c;
        home.textContent = c ? c.title : '';
    }
    const show = (id, on) => { const b = el(id); if (b) b.hidden = !on; };
    show('my-clear-example', hasSamples(state.doc));
    show('help-checklist', Boolean(c));
    show('hud-rooms', Boolean(c));
    show('help-home', Boolean(c));
    show('help-prefs', Boolean(c));
    const chip = quoteChip(c, state.sheet);
    const quoteBtn = el('hud-quote');
    if (quoteBtn) {
        quoteBtn.hidden = !chip;
        if (chip) quoteBtn.setAttribute('aria-label', chip.spoken);
    }
    const quoteText = el('hud-quote-text');
    if (quoteText) quoteText.textContent = chip ? chip.text : '';
    const undoBtn = el('ws-undo');
    if (undoBtn) undoBtn.disabled = !history.canUndo;
    const note = el('storage-note');
    if (note) note.textContent = storageNote();
    if (isOpen('my-checklists')) drawMyChecklists();
    if (isOpen('checklist')) {
        if (c) drawChecklist();
        else closeCard('checklist');
    }
    if (isOpen('quote')) {
        if (chip) renderQuote({ checklist: c, sheet: state.sheet });
        else closeCard('quote');
    }
    if (isOpen('menu')) drawMenu();
    if (model && model.show(c)) {
        markShadows();
        // The frame fits the house as it now stands, eased to once the
        // visitor can see it.
        if (turntable) turntable.setHeight(frameHeight(), !state.loaded || state.reducedMotion);
    }
    // Maya's words that depend on the home (the rooms so far) keep up.
    if (host && host.view) host.update(guideView());
    // The selection, as the home now has it: a different checklist drops
    // it, a removed room or task steps back to what is left.
    if (ui.selected) {
        const kept = c && ui.selected.checklistId === c.id ? reconcile(ui.selected, c) : null;
        if (kept !== ui.selected) selectTo(kept);
        else showPanel();
    }
    requestRender();
}

// ---- The cards --------------------------------------------------------------

function drawMyChecklists() {
    renderMyChecklists({
        doc: state.doc,
        sheet: state.sheet,
        activeId: state.doc.settings.activeId,
        on: { open: openChecklist, duplicate: duplicate, remove: remove }
    });
}

function openMine() {
    drawMyChecklists();
    openCard('my-checklists');
}

/** The setup card for a new home. */
function startOwn() {
    ui.editing = null;
    fillSetupForm(null);
    openCard('setup');
}

/** The setup card for the open home. */
function editHome() {
    const c = active();
    if (!c) return startOwn();
    ui.editing = c.id;
    fillSetupForm(c);
    openCard('setup');
    return null;
}

function submitSetup(event) {
    if (event) event.preventDefault();
    const fields = readSetupForm();
    const problem = validateSetup(fields);
    showError('setup-error', problem);
    if (problem) return null;
    const at = now();
    if (ui.editing) {
        const id = ui.editing;
        const result = change((d) => {
            const a = updateChecklist(d, id, fields, CONFIG, at);
            return a.error ? a : setLevels(a.doc, id, fields.levels, CONFIG, at);
        }, UI.labels.home, UI.homeSaved);
        if (result.error) showError('setup-error', result.error);
        else closeCard('setup');
        return result;
    }
    const result = mutate((d) => {
        const a = createChecklist(d, fields, CONFIG, at);
        if (a.error) return a;
        return { doc: setSettings(a.doc, { activeId: a.record.id }).doc, record: a.record, error: null };
    }, UI.labels.started);
    if (result.error) {
        showError('setup-error', result.error);
        return result;
    }
    closeCard('setup');
    guideTo({ type: 'homeMade' });
    const said = UI.started(result.record.title);
    announce(said);
    toast(said, { undo });
    // Care preferences are offered once, right after setup, and then the
    // first room (PRD 8.4).
    ui.afterPrefs = true;
    openPreferences();
    return result;
}

/**
 * When preferences close, however they close (Save, Not now, Escape), a
 * first visit goes on to the first room. A beat later, because closing
 * hands focus back to what opened the card, and the room card must take it
 * after that, not before.
 */
function afterPreferences() {
    if (!ui.afterPrefs) return;
    ui.afterPrefs = false;
    setTimeout(() => openRoom(null), 0);
}

function openPreferences() {
    const c = active();
    if (!c) return;
    fillPreferencesForm(c.preferences, c.serviceType);
    openCard('preferences', { onClose: afterPreferences });
}

function submitPreferences(event) {
    if (event) event.preventDefault();
    const c = active();
    if (!c) return null;
    const prefs = readPreferencesForm(c.serviceType);
    const said = prefs.keys.length || prefs.note ? UI.preferencesSaved : UI.preferencesNone;
    const result = change((d) => setPreferences(d, c.id, prefs, CONFIG, now()), UI.labels.preferences, said);
    if (!result.error) closeCard('preferences');
    return result;
}

// ---- The checklist view -----------------------------------------------------

function drawChecklist() {
    const c = active();
    if (!c) return;
    ui.filter = fillChecklistFilter(c, ui.filter);
    renderChecklist({
        checklist: c,
        sheet: state.sheet,
        filter: ui.filter,
        on: {
            addTask: (roomId) => openTask(roomId, null),
            editRoom: openRoom,
            editTask: (itemId) => openTask(null, itemId),
            removeTask,
            moveTask
        }
    });
}

/**
 * Move a task one place up (-1) or down (1) in its room. The room's tasks
 * are renumbered 1 to n in their new order, as one undo step, and focus
 * goes back to the same task's button, so a keyboard can keep moving it.
 */
function moveTask(itemId, step) {
    const c = active();
    const item = c && c.items.find((i) => i.id === itemId);
    if (!item) return null;
    const list = itemsIn(c, item.roomId);
    const from = list.indexOf(item);
    const to = from + step;
    if (from < 0 || to < 0 || to >= list.length) return null;
    const next = list.slice();
    next.splice(from, 1);
    next.splice(to, 0, item);
    const at = now();
    const result = mutate((d) => chain(d, next
        .map((i, n) => ({ i, order: n + 1 }))
        .filter(({ i, order }) => i.order !== order)
        .map(({ i, order }) => (x) => updateItem(x, c.id, i.id, { order }, CONFIG, at))), UI.labels.moved);
    if (!result.error) {
        announce(UI.moved(taskName(state.sheet, item)));
        const same = el(`move-${step < 0 ? 'up' : 'down'}-${itemId}`);
        const other = el(`move-${step < 0 ? 'down' : 'up'}-${itemId}`);
        const target = same && !same.disabled ? same : other;
        if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
    }
    return result;
}

// ---- The quote and the service menu -------------------------------------------

function openQuote() {
    const c = active();
    if (!c || !state.sheet || !liveItems(c).length) return;
    renderQuote({ checklist: c, sheet: state.sheet });
    openCard('quote');
}

function drawMenu() {
    if (!state.sheet) return;
    renderMenu({ sheet: state.sheet, area: ui.menuArea, checklist: active(), on: { add: addFromMenu } });
}

function openMenu() {
    if (!state.sheet) {
        announce(UI.sheetLoading);
        toast(UI.sheetLoading);
        return;
    }
    const c = active();
    if (!ui.menuArea) {
        const first = c ? liveRooms(c)[0] : null;
        ui.menuArea = first ? first.area : 'kitchen';
    }
    fillMenuAreas(ui.menuArea);
    drawMenu();
    openCard('menu');
}

/** From the menu: the task card for this task in this room. */
function addFromMenu(roomId, taskKey) {
    openTask(roomId, null, taskKey);
}

function openChecklistView() {
    if (!active()) return;
    drawChecklist();
    openCard('checklist');
}

// ---- Rooms --------------------------------------------------------------------

function openRoom(roomId) {
    const c = active();
    if (!c) return;
    const room = roomId ? c.rooms.find((r) => r.id === roomId) || null : null;
    ui.room = room ? room.id : null;
    fillRoomForm(room, c);
    showPresetPreview(state.sheet, room ? room.area : '', room ? room.bath : null);
    openCard('room');
}

function submitRoom(event) {
    if (event) event.preventDefault();
    const c = active();
    if (!c) return null;
    const fields = readRoomForm(c.serviceType);
    const at = now();
    if (ui.room) {
        const id = ui.room;
        const room = c.rooms.find((r) => r.id === id);
        // A new type of bath goes in the same step as the name and level, so
        // one undo takes the whole card back.
        const made = room && fields.bathChoice && state.sheet ? bathStep(c, room, fields.bathChoice) : null;
        const update = (d) => updateRoom(d, c.id, id, { label: fields.label, level: fields.level }, CONFIG, at);
        const result = mutate((d) => chain(d, made ? [made.step, update] : [update]), UI.labels.roomChanged);
        if (result.error) {
            showError('room-error', result.error);
            return result;
        }
        const named = { ...room, label: fields.label };
        const said = made ? bathSaid(c, named, made.to, result.record) : UI.roomChanged(roomName(c.serviceType, named));
        announce(said);
        toast(said, { undo });
        closeCard('room');
        return result;
    }
    const problem = validateRoom(fields);
    showError('room-error', problem);
    if (problem) return null;
    const presetItems = fields.preset && state.sheet ? presetFor(state.sheet, fields.area, fields.bath) : [];
    const name = roomName(c.serviceType, fields);
    const result = change((d) => addRoom(d, c.id, { level: fields.level, area: fields.area, bath: fields.bath, label: fields.label }, CONFIG, at,
        { check, presetItems }), UI.labels.roomAdded, UI.roomAdded(name, presetItems.length));
    if (result.error) {
        showError('room-error', result.error);
        return result;
    }
    closeCard('room');
    // The new room and its tasks, where the customer can adjust them, unless
    // Maya is showing them on the house.
    if (!guiding() && !isOpen('checklist')) openChecklistView();
    guideTo({ type: 'roomAdded', roomId: result.record.id });
    return result;
}

function removeRoom() {
    const c = active();
    const room = c && c.rooms.find((r) => r.id === ui.room);
    if (!room) return;
    const name = roomName(c.serviceType, room);
    const result = change((d) => deleteRoom(d, c.id, room.id, CONFIG, now()), UI.labels.roomRemoved, UI.roomRemoved(name));
    if (!result.error) closeCard('room');
}

// ---- Tasks --------------------------------------------------------------------

function taskRoom() {
    const c = active();
    return c && ui.task ? c.rooms.find((r) => r.id === ui.task.roomId) || null : null;
}

/** The task card, for a new task in a room (perhaps a given task, from the
 *  menu) or an edit of an item. */
function openTask(roomId, itemId, taskKey = null, { armed = false } = {}) {
    const c = active();
    if (!c) return;
    if (!state.sheet) {
        announce(UI.sheetLoading);
        toast(UI.sheetLoading);
        return;
    }
    const item = itemId ? c.items.find((i) => i.id === itemId) || null : null;
    const room = c.rooms.find((r) => r.id === (item ? item.roomId : roomId));
    if (!room) return;
    ui.task = { roomId: room.id, itemId: item ? item.id : null, photos: item ? [...item.photos] : [] };
    fillTaskForm({ sheet: state.sheet, room, item, roomLabel: roomName(c.serviceType, room), taskKey });
    updateTaskPrice();
    drawTaskPhotos();
    openCard('task', { armed, onClose: releaseTaskPhotos });
}

/** The price and time of the task as chosen right now, or why it cannot be
 *  priced. */
function updateTaskPrice() {
    const out = el('task-price');
    const room = taskRoom();
    if (!out || !room || !state.sheet) return;
    const price = priceChoice(state.sheet, readTaskForm(), room.area);
    out.textContent = price.error
        ? ITEM_ERRORS[price.error]
        : UI.priceAndTime(formatMoney(price.cents), formatMinutes(price.minutes));
}

async function drawTaskPhotos() {
    if (!ui.task) return;
    const shown = [];
    for (const id of ui.task.photos) {
        let url = photoUrls.get(id);
        if (!url && photoStore) {
            try {
                const blob = await photoStore.get(id, 'thumb');
                url = blob ? URL.createObjectURL(blob) : '';
            } catch (e) {
                url = '';
            }
            if (url) photoUrls.set(id, url);
        }
        shown.push({ id, url: url || '' });
    }
    if (!ui.task) return;
    const c = active();
    const item = c && ui.task.itemId ? c.items.find((i) => i.id === ui.task.itemId) : null;
    const label = item ? taskName(state.sheet, item) : (el('task-task') ? el('task-task').value : '');
    renderTaskPhotos({ photos: shown, taskLabel: label, on: { remove: removeTaskPhoto } });
    const full = ui.task.photos.length >= CONFIG.limits.photosPerItem;
    const input = el('task-photo-input');
    if (input) input.disabled = full;
    const add = el('task-photo-add');
    if (add) add.hidden = full;
}

/** A photo picked for the task card: resized, stripped and kept at once,
 *  and attached to the task when the card is saved. */
async function addTaskPhoto() {
    const input = el('task-photo-input');
    const file = input && input.files && input.files[0];
    if (input) input.value = '';
    if (!file || !ui.task || !photoStore) return;
    if (ui.task.photos.length >= CONFIG.limits.photosPerItem) {
        announce(UI.photosFull(CONFIG.limits.photosPerItem));
        return;
    }
    let prepared;
    try {
        prepared = await preparePhoto(file, CONFIG);
    } catch (e) {
        announce(UI.photoUnreadable);
        showError('task-error', UI.photoUnreadable);
        return;
    }
    const id = newId();
    try {
        await photoStore.put(id, prepared);
    } catch (e) {
        announce(UI.photoFailed);
        showError('task-error', UI.photoFailed);
        return;
    }
    if (!ui.task) return;
    ui.task.photos.push(id);
    showError('task-error', '');
    announce(state.photosStatus === 'memory' ? `${UI.photoAdded} ${UI.photosInMemory}` : UI.photoAdded);
    await drawTaskPhotos();
}

function removeTaskPhoto(id) {
    if (!ui.task) return;
    ui.task.photos = ui.task.photos.filter((p) => p !== id);
    announce(UI.photoRemoved);
    drawTaskPhotos();
}

function releaseTaskPhotos() {
    for (const url of photoUrls.values()) {
        try { URL.revokeObjectURL(url); } catch (e) { /* already gone */ }
    }
    photoUrls.clear();
    ui.task = null;
}

function submitTask(event) {
    if (event) event.preventDefault();
    const c = active();
    const room = taskRoom();
    if (!c || !room || !ui.task) return null;
    const fields = readTaskForm();
    const at = now();
    const photos = ui.task.photos;
    const itemId = ui.task.itemId;
    let result;
    if (itemId) {
        const item = c.items.find((i) => i.id === itemId);
        const gone = item.photos.filter((p) => !photos.includes(p));
        const fresh = photos.filter((p) => !item.photos.includes(p));
        const name = taskName(state.sheet, item);
        result = change((d) => chain(d, [
            (x) => updateItem(x, c.id, itemId, fields, CONFIG, at, { check }),
            ...gone.map((p) => (x) => removePhoto(x, c.id, itemId, p, CONFIG, at)),
            ...fresh.map((p) => (x) => addPhoto(x, c.id, itemId, p, CONFIG, at))
        ]), UI.labels.taskChanged, UI.taskChanged(name));
    } else {
        const id = newId();
        const name = taskName(state.sheet, { task: fields.task });
        result = change((d) => chain(d, [
            (x) => addItem(x, c.id, { ...fields, roomId: room.id }, CONFIG, at, { check, id }),
            ...photos.map((p) => (x) => addPhoto(x, c.id, id, p, CONFIG, at))
        ]), UI.labels.taskAdded, UI.taskAdded(name, roomName(c.serviceType, room)));
    }
    if (result.error) {
        showError('task-error', result.error);
        return result;
    }
    closeCard('task');
    return result;
}

function removeTask(itemId) {
    const c = active();
    const item = c && c.items.find((i) => i.id === itemId);
    if (!item) return null;
    const name = taskName(state.sheet, item);
    return change((d) => deleteItem(d, c.id, itemId, CONFIG, now()), UI.labels.taskRemoved, UI.taskRemoved(name));
}

function removeTaskFromCard() {
    const id = ui.task && ui.task.itemId;
    if (!id) return;
    const result = removeTask(id);
    if (result && !result.error) closeCard('task');
}

function openChecklist(id) {
    const result = mutate((d) => setSettings(d, { activeId: id }), null);
    const c = active();
    if (c) announce(UI.opened(c.title));
    closeCard('my-checklists');
    return result;
}

function duplicate(id) {
    let made = null;
    change((d) => {
        const r = duplicateChecklist(d, id, CONFIG, now());
        made = r.record;
        return r;
    }, UI.labels.duplicated, null);
    if (made) {
        const said = UI.duplicated(made.title);
        announce(said);
        toast(said, { undo });
    }
}

function clearExample() {
    return change((d) => clearSamples(d), UI.labels.clearedExample, UI.exampleCleared);
}

function remove(id) {
    const c = findChecklist(state.doc, id);
    if (!c) return;
    confirmCard({
        title: UI.removeTitle(c.title),
        detail: UI.removeDetail,
        confirmLabel: UI.remove,
        danger: true,
        onConfirm: () => change((d) => deleteChecklist(d, id, CONFIG, now()), UI.labels.removed, UI.removedChecklist(c.title))
    });
}

/** Another tab saved: follow it, and drop undo steps that belonged to the
 *  document it replaced. */
function followOtherTab() {
    const loaded = store.load(now());
    state.doc = loaded.doc;
    state.storageStatus = loaded.status;
    history.clear();
    refresh();
    announce(UI.otherTab);
}

// ---- Event wiring -----------------------------------------------------------

function setupEventListeners() {
    const signal = cleanupController.signal;

    // Make aria-modal true: Tab stays inside the open card. And every card
    // opens scrolled to its top (shared boot part).
    installCardFocusTrap({ signal });
    installCardScrollReset({ signal });
    initCards({ signal });
    // When what opened a card has gone (a toolbar button hidden by the
    // change the card made), focus lands on My checklists rather than nowhere.
    setFocusFallback(() => el('ws-help'));
    setupLook(signal);
    host = createHost({
        signal,
        timing: { pulse: CONFIG.guide.pulse, again: CONFIG.guide.again },
        on: { button: onHostButton, floor: onFloor }
    });
    setupHelp(signal);
    panel = createPanel({
        signal,
        on: { back: onPanelBack, row: onPanelRow, star: toggleStar, bath: onPanelBath, chip: onPanelChip, action: onPanelAction }
    });

    // Escape steps back (an open floor closes) or puts the arrival panel
    // away, and the arrows and + and - move the view: from anywhere but a
    // text field or an open card (a window key listener asks who has focus).
    document.addEventListener('keydown', (event) => {
        // A key a card has already answered (its Escape closes it) is not
        // the house's too: one Escape, one step.
        if (event.defaultPrevented) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const target = event.target;
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || '')) return;
        if (!state.loaded || anyOpen()) return;
        if (event.key === 'Escape') {
            if (closeHelp(true) || stepBack()) event.preventDefault();
            return;
        }
        // The panel's own lists take their arrow keys.
        if (panel && panel.contains(target)) return;
        if (lookKey(event.key)) event.preventDefault();
    }, { signal });

    const on = (id, type, fn) => { const node = el(id); if (node) node.addEventListener(type, fn, { signal }); };
    on('ws-undo', 'click', () => undo());
    on('hud-home', 'click', openMine);
    on('my-new', 'click', startOwn);
    on('my-clear-example', 'click', clearExample);
    on('setup-form', 'submit', submitSetup);
    on('setup-cancel', 'click', () => closeCard('setup'));
    on('setup-household', 'input', () => showHints('setup-household', 'setup-household-hint'));
    on('prefs-form', 'submit', submitPreferences);
    on('prefs-skip', 'click', () => closeCard('preferences'));
    on('checklist-add-room', 'click', () => openRoom(null));
    on('room-form', 'submit', submitRoom);
    on('room-cancel', 'click', () => closeCard('room'));
    on('room-remove', 'click', removeRoom);
    // The kind of room decides the types of bath offered, and both decide
    // the standard tasks.
    const roomPreview = () => {
        const fields = readRoomForm(active() ? active().serviceType : 'cleaning');
        showPresetPreview(state.sheet, fields.area, fields.bath);
    };
    on('room-area', 'change', () => {
        showBathChoices(active() ? active().serviceType : 'cleaning', el('room-area').value);
        roomPreview();
    });
    on('room-bath-list', 'change', roomPreview);
    on('task-form', 'submit', submitTask);
    on('task-cancel', 'click', () => closeCard('task'));
    on('task-remove', 'click', removeTaskFromCard);
    on('task-task', 'change', () => {
        showTaskChoices(state.sheet, el('task-task').value, {});
        updateTaskPrice();
    });
    on('task-form', 'change', updateTaskPrice);
    on('task-form', 'input', updateTaskPrice);
    on('task-photo-input', 'change', addTaskPhoto);
    on('task-notes', 'input', () => showHints('task-notes', 'task-notes-hint'));
    on('task-avoid', 'input', () => showHints('task-avoid', 'task-avoid-hint'));
    on('hud-quote', 'click', openQuote);
    on('hud-rooms', 'click', () => selectTo({ scope: 'house', level: null, roomId: null, itemId: null }, { focus: true }));
    on('quote-open-checklist', 'click', openChecklistView);
    on('menu-area', 'change', () => {
        ui.menuArea = el('menu-area').value;
        drawMenu();
    });
    on('checklist-filter', 'change', () => {
        ui.filter = el('checklist-filter').value;
        drawChecklist();
    });
    on('checklist-print', 'click', () => { if (typeof window.print === 'function') window.print(); });
    on('prefs-note', 'input', () => showHints('prefs-note', 'prefs-note-hint'));

    // Undo from the keyboard. A text field keeps its own undo, so the
    // window listener asks who has focus first (a house lesson).
    window.addEventListener('keydown', (event) => {
        if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
        if (event.key !== 'z' && event.key !== 'Z') return;
        const target = event.target;
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || '')) return;
        event.preventDefault();
        undo();
    }, { signal });

    // Another tab changed the saved checklists.
    window.addEventListener('storage', (event) => {
        if (event.key === CONFIG.storage.key) followOtherTab();
    }, { signal });

    window.addEventListener('resize', handleResize, { signal });

    // iOS Safari ignores `user-scalable=no`, so the only way to keep the 3D
    // view from being pinch-zoomed there is to block Safari's own gesture
    // events. Scoped to this page: the 2D pages stay zoomable.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) =>
        document.addEventListener(type, (e) => e.preventDefault(), { passive: false, signal }));

    // A hidden tab stops drawing, and comes back with one fresh frame.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            endSession();
            stop();
        } else if (state.loaded) {
            start();
        }
    }, { signal });

    // SAVE FIRST, THEN TEAR DOWN.
    window.addEventListener('pagehide', () => {
        if (state.doc) {
            state.doc = touchVisit(state.doc, now()).doc;
            save();
        }
        endSession();
        cleanup();
    }, { signal });
}

// ---- Render loop ------------------------------------------------------------

/** Ask for one frame. Cheap to call as often as anything likes. */
function requestRender() {
    state.dirty = true;
}

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

    // The frame after one that was drawn carries that frame's cost, so only
    // those intervals tell the adaptive resolution anything.
    if (state.drewLast && resolution) resolution.sample(delta);
    state.drewLast = false;

    const locked = lookLocked();
    // The turntable: the push-in, a turn carrying on after a drag, the idle
    // drift, the frame easing to a taller or shorter house.
    if (turntable && camera) {
        turntable.step(delta, { reducedMotion: state.reducedMotion, locked, drift: !away() });
        if (stage && turntable.yaw !== drawnYaw) {
            drawnYaw = turntable.yaw;
            stage.spin.rotation.y = drawnYaw;
            markShadows();
        }
        const pose = turntable.pose(aspect());
        if (poseChanged(pose)) {
            applyPose(pose);
            state.dirty = true;
        }
    }
    // A floor opening or closing, and its shadow with it.
    if (model && model.tick(delta)) markShadows();
    // Maya's wave, her arm toward the house, her sway while she speaks.
    if (cast && cast.group.visible && cast.tick(delta, { reducedMotion: state.reducedMotion })) markShadows();
    // A card opening or closing hides or brings back the room labels,
    // though the house itself has not changed.
    if (locked !== wasLocked) {
        wasLocked = locked;
        state.dirty = true;
    }
    // Maya steps out of sight while a card or the panel is open.
    if (host) host.setCovered(locked || Boolean(panel && panel.shown));

    if (!state.dirty) return;
    state.dirty = false;
    state.frames++;
    placeLabels();
    placeHost();
    renderer.render(scene, camera);
    state.drewLast = true;
}

/** Whether a pose differs from the one the camera was last set to. */
function poseChanged(pose) {
    const was = state.pose;
    if (!was) return true;
    const same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
    return !(same(pose.eye, was.eye) && same(pose.aim, was.aim) && pose.fov === was.fov && same(pose.offset, was.offset));
}

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
    return { ...state, doc: undefined, sheet: undefined };
}

export function getDoc() {
    return state.doc;
}

// ---- Boot -------------------------------------------------------------------

/** Best-effort check that the browser can create a WebGL 2 context, which
 *  three.js requires (r163 dropped WebGL 1). */
export function hasWebGL() {
    try {
        const c = document.createElement('canvas');
        return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
    } catch (e) {
        return false;
    }
}

function fallbackTo2D() {
    try {
        const loading = el('loading-screen');
        if (loading) loading.classList.remove('hidden');
        const status = el('load-status');
        if (status) status.textContent = "This browser can't show the 3D house. Taking you to the standard site…";
    } catch (e) { /* ignore, we're redirecting regardless */ }
    setTimeout(() => { window.location.replace('/'); }, 2500);
}

function boot() {
    if (!hasWebGL()) { fallbackTo2D(); return; }
    init().catch((err) => {
        console.error('[Whitestone] 3D init failed, falling back to the 2D site:', err);
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
    mutate,
    change,
    undo,
    refresh,
    active,
    loadPrices,
    startOwn,
    editHome,
    submitSetup,
    openPreferences,
    submitPreferences,
    openMine,
    openChecklist,
    duplicate,
    remove,
    history: () => history,
    store: () => store,
    photoStore: () => photoStore,
    openPhotos,
    openChecklistView,
    openRoom,
    submitRoom,
    openTask,
    submitTask,
    addTaskPhoto,
    removeTask,
    drawTaskPhotos,
    moveTask,
    clearExample,
    openQuote,
    openMenu,
    requestRender,
    handleResize,
    lookLocked,
    lookKey,
    markShadows,
    liftLevel,
    stepBack,
    reflective,
    frameHeight,
    tapModel,
    pickAt,
    handleSceneTap,
    host: () => host,
    guideTo,
    onHostButton,
    onFloor,
    showExample,
    placeLabels,
    model: () => model,
    stage: () => stage,
    turntable: () => turntable,
    cast: () => cast,
    panel: () => panel,
    selectTo,
    toggleStar,
    addRoomOf,
    onPanelRow,
    onPanelBack,
    onPanelAction,
    onPanelChip,
    placeHost,
    tapHost,
    drawnYaw: () => drawnYaw,
    gesture,
    start,
    stop,
    scene: () => scene,
    camera: () => camera,
    renderer: () => renderer
};
