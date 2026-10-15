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
 * or the left and right arrow keys turn the turntable, and the camera is
 * the page's own: one view of the whole house, and a closer one of a floor
 * while it is open. A press that barely moves is a tap, and a tap on the
 * house opens a floor. This file reads the pointers
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
    clearSamples, hasSamples, setBath, setResidence, emptyDoc, setPublication, keepServerFacts, importPublished,
    hasUnsent
} from './store.min.js';
import { withExample } from './samples.min.js';
import { createApi, createFetchTransport } from './api.min.js';
import { createStandin } from './standin.min.js';
import { createSealer } from './seal.min.js';
import { publish, openPublished, republish, cancelVisit, unpublish, quoteToSend } from './sync.min.js';
import { createBooking, visitMinutes, shiftMonth, firstOpen, dayLabel, clockLabel } from './booking.min.js';
import { canChange } from './schedule.min.js';
import { createReceipt, receiptView } from './receipt.min.js';
import { todayIn, addDays } from './zoned.min.js';
import { parseEdit } from './links.min.js';
import { shareLink, flash } from '../../shared/js/share-1.0.0.min.js';
import { createHistory } from './history.min.js';
import { loadSheet, currentVersion, checkChoice, presetFor, presetGains, taskOf } from './sheet.min.js';
import { priceChoice, formatMoney, formatMinutes, quoteChecklist, roundMinutes } from './pricing.min.js';
import { createPhotoStore, createMemoryBackend, openIdbBackend, preparePhoto } from './photos.min.js';
import { roomName, levelOf, bathChoices, bathChoiceOf, residencesOf, levelsAllowed, serviceType as typeOf } from './taxonomy.min.js';
import { h, clear, initCards, openCard, closeCard, isOpen, anyOpen, announce, toast, confirmCard, setFocusFallback, setOnSettled } from './cards.min.js';
import {
    initForms, fillSetupForm, readSetupForm, validateSetup, showError, showHints, fillPreferencesForm, readPreferencesForm,
    fillRoomForm, readRoomForm, validateRoom, showPresetPreview, showBathChoices, fillTaskForm, showTaskChoices, readTaskForm,
    showResidence
} from './forms.min.js';
import {
    renderMyChecklists, renderChecklist, renderTaskPhotos, taskName, fillChecklistFilter, quoteChip, renderQuote,
    renderMenu, fillMenuAreas
} from './panels.min.js';
import { UI, MODEL_LINES, STORAGE_NOTES, ITEM_ERRORS, GUIDE, PANEL, HELP, BOOKING, BOOKING_ERRORS, RECEIPT, CHANGES } from './copy.min.js';
import { createTurntable, turnPoint } from './turntable.min.js';
import { buildStage, buildLights, firstPick, onTurntable } from './stage.min.js';
import { buildModel } from './model.min.js';
import { arrivalId, arrivalGuide, step as guideStep, viewFor, addedLine, savedForm, hasOwn, ringFloor, GUIDED, CHANGED } from './guide.min.js';
import { createHost } from './host.min.js';
import { buildMaya, speakSeconds } from './cast.min.js';
import { createPanel, selectFromHit, stepOut, reconcile, panelView, homeSuggestions } from './panel.min.js';

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
    saved: false,
    /** Whether changes are on their way to the server (sendChanges). */
    sending: false
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
    editing: null, room: null, task: null, afterPrefs: false, filter: 'all', menuArea: null, guide: null, selected: null,
    /** The Choose a time card while it is open, and the receipt shown. */
    booking: null, receipt: null,
    /** One card handing over to the next (the calendar to the receipt), so
     *  Maya waits for the second to close. */
    handoff: false
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
/** The view: the house's turn, the camera's tilt and distance (turntable.js). */
let turntable = null;
/** The room labels over a lifted level, and what they say. */
const roomLabels = { nodes: [], key: '' };
/** Maya's bubble (host.js). */
let host = null;
/** Maya on the stage (cast.js). */
let cast = null;
/** The panel beside the house (panel.js). */
let panel = null;
/** The Choose a time card (booking.js) and the receipt (receipt.js). */
let booking = null;
let receipt = null;
/** The scene Maya last gestured for, so each new one gets its gesture. */
let gesturedFor = null;
let raycaster = null;
let lastHover = 0;
let sun = null;
let envTarget = null;
/** The pointers down on the canvas, and what they are doing: a tap until
 *  one moves past the slop, then a drag; two make a pinch. */
const gesture = { pointers: new Map(), start: null, dragging: false, lastMove: 0, grab: false };
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
    // BY THE EDIT LINK (PLANNING 7.3): its keys off the address bar before
    // anything else (a screen share must never show them), then its
    // checklist opened, from this device or, failing that, the API.
    const editLink = parseEdit(window.location.href, CONFIG);
    if (editLink) {
        try {
            window.history.replaceState(null, '', window.location.pathname);
        } catch (e) {
            // An address that cannot be changed changes nothing else.
        }
        updateLoadingStatus('Opening your checklist…', 70);
        await arriveByEditLink(editLink);
    }
    // MAYA GREETS A FIRST VISIT beside a plain house (PRD 8.2), with the
    // example one tap away. A RETURNING VISITOR ARRIVES TO THEIR OWN HOME
    // (PRD 8.6): the one open when they left, else their latest, and is
    // welcomed back (guide.js).
    ui.guide = arrivalGuide(state.doc);
    if (state.viaEdit && ui.guide.scene === 'welcome') ui.guide = { ...ui.guide, viaEdit: true, resume: null };
    state.doc = setSettings(state.doc, { activeId: ui.guide.scene === 'hello' ? null : arrivalId(state.doc) }).doc;
    history = createHistory();

    updateLoadingStatus('Turning on the lights…', 75);
    initForms(CONFIG);
    setupEventListeners();
    refresh();
    loadPrices();
    if (!photoStore) openPhotos();

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
        if (state.editLinkFailed) {
            announce(UI.editLinkFailed);
            toast(UI.editLinkFailed);
        }
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
        /** The view now: the house's turn, the tilt, and how far over to
         *  an open floor's closer view. */
        look: () => ({ yaw: turntable.yaw, tilt: turntable.tilt, near: turntable.near })
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
    // again only when it changes or turns (markShadows), never for the
    // camera moving.
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
    // Opening a floor is using the ring on one (a new scene rings afresh).
    if (level && ui.halo && ui.halo.spec.kind === 'floor') ui.halo.used = true;
    // An open floor's open side is the house's front: turned to the visitor.
    if (level && turntable) turntable.faceFront(state.reducedMotion ? 0 : CONFIG.view.turn.face);
    fitFrame(state.reducedMotion);
    markShadows();
    const c = active();
    const name = level ? levelOf(c ? c.serviceType : 'cleaning', level) : null;
    if (level && name) announce(MODEL_LINES.lifted(name.name));
    else if (!level && was) announce(MODEL_LINES.setDown);
    return true;
}

/** The frame fitted to the house as it now stands, and to its open
 *  floor's closer view (the whole house with every floor closed): at once
 *  with `now`, else eased. */
function fitFrame(now) {
    if (!turntable) return;
    turntable.setHeight(frameHeight(), now);
    turntable.setFocus(model ? model.focus() : null, now ? 0 : CONFIG.view.focus.seconds);
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
 *  or, once the panel has gone, on Maya's next step (everything is hers,
 *  Steve, 2026-10-15), or on Help when she offers none. */
function onPanelBack() {
    selectTo(stepOut(ui.selected), { focus: true });
    if (!ui.selected) {
        if (host && host.shown && host.focusPrimary()) return;
        const help = el('ws-help');
        if (help && typeof help.focus === 'function') help.focus();
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
    case 'book': openBooking(); break;
    case 'visit': openReceipt(); break;
    case 'send': sendChanges(); break;
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
 * a turn, the closer view and the lift itself. Rebuilt only when the rooms change,
 * moved otherwise.
 */
// ---- Halos (QA, 2026-10-14) ------------------------------------------------------

/** The scene's touch point (guide.js HALO): a control's glow set here, a
 *  ring on the house placed each frame (placeHalo). A new scene's halo is
 *  a fresh one, used or not before. */
function setHalo(spec) {
    if (ui.halo && ui.halo.node && ui.halo.node.classList) ui.halo.node.classList.remove('has-halo');
    ui.halo = spec ? { spec, used: false, node: null } : null;
    glowHalo();
    placeHalo();
    requestRender();
}

/** A control's glow, on the control as it is drawn now: Maya's own buttons
 *  are drawn again with each change (a chip added), so the glow follows
 *  the new one until it is used. */
function glowHalo() {
    const h = ui.halo;
    if (!h || h.used || h.spec.kind !== 'element') return;
    const node = (host && host.nodeOf(h.spec.id)) || el(h.spec.id);
    if (!node || !node.classList || node === h.node) return;
    node.classList.add('has-halo');
    // Used, it is done with.
    node.addEventListener('click', () => {
        node.classList.remove('has-halo');
        if (ui.halo === h) h.used = true;
    }, { once: true });
    h.node = node;
}

/** Maya's bubble drawn again for a change within the scene, its halo kept. */
function updateHost() {
    host.update(guideView());
    glowHalo();
}

/** A room chip in Maya's bubble: that room, with its standard tasks, on
 *  the floor it usually goes on, and that floor opened to show it. */
function onGuideChip(area, level) {
    if (!state.loaded) return null;
    if (host) host.poke();
    const result = addRoomOf(area, level);
    if (result && !result.error && ui.guide && ui.guide.scene === 'rooms') liftLevel(level);
    return result;
}

/** Where the ring on the house goes, in the turntable's frame, or null when
 *  there is none to show: a closed floor (guide.js ringFloor; opening one
 *  is using it) while the panel is put away; the first dot of the room just added
 *  while its floor is open and no task is chosen yet. Never over a card. */
function haloPoint() {
    const h = ui.halo;
    const c = active();
    if (!h || h.used || !model || !c || !state.loaded || lookLocked()) return null;
    if (h.spec.kind === 'floor') {
        if (panel && panel.shown) return null;
        const type = typeOf(c.serviceType);
        const annex = type ? type.levels.filter((l) => l.annex).map((l) => l.key) : [];
        const level = ringFloor(model.levels(), model.lifted, liveRooms(c).map((r) => r.level), annex);
        return level ? model.pointOf({ kind: 'floor', level }) : null;
    }
    if (h.spec.kind === 'dot') {
        const room = ui.guide && c.rooms.find((r) => r.id === ui.guide.roomId && !r.deletedAt);
        if (!room || model.lifted !== room.level || (ui.selected && ui.selected.scope === 'task')) return null;
        const first = itemsIn(c, room.id)[0];
        return first ? model.pointOf({ kind: 'dot', itemId: first.id }) : null;
    }
    return null;
}

/** The ring on the house, over its touch point however the house turns. */
function placeHalo() {
    const ring = el('ws-halo');
    if (!ring || !camera) return;
    const p = haloPoint();
    if (!p) {
        ring.hidden = true;
        return;
    }
    camera.updateMatrixWorld();
    const q = turnPoint(p, turntable.yaw);
    const v = new THREE.Vector3(q[0], q[1], q[2]).project(camera);
    ring.className = `ws-halo is-${ui.halo.spec.kind}`;
    ring.hidden = !(v.z > -1 && v.z < 1);
    ring.style.transform = `translate(${Math.round(((v.x + 1) / 2) * window.innerWidth)}px, ${Math.round(((1 - v.y) / 2) * window.innerHeight)}px) translate(-50%, -50%)`;
}

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
        if (seeded.error) {
            console.error('[Whitestone] The example home could not be built:', seeded.error);
            return false;
        }
        state.doc = seeded.doc;
        example = state.doc.checklists.find((c) => isLive(c) && c.sample);
    }
    selectTo(null);
    liftLevel(null);
    state.doc = setSettings(state.doc, { activeId: example.id }).doc;
    refresh();
    // It builds itself, floor by floor, while Maya says what it is.
    if (model && !state.reducedMotion) {
        model.assemble();
        requestRender();
    }
    return true;
}

/** The raycaster set through a point on the canvas. */
function rayAt(clientX, clientY) {
    if (!raycaster) raycaster = new THREE.Raycaster();
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
        ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    return raycaster;
}

/** Whether a press at a point on the canvas takes hold of the turntable:
 *  the house, its lawn or the stone under it, and not Maya in front of it
 *  or the studio around it (stage.js onTurntable). */
function grabAt(clientX, clientY) {
    if (!camera || !stage) return false;
    const targets = cast && cast.group.visible ? [stage.spin, cast.group] : [stage.spin];
    return onTurntable(rayAt(clientX, clientY).intersectObjects(targets, true), stage.spin);
}

/** What is under a point on the canvas: `{ key, level, roomId, itemId }`,
 *  or null. Only the
 *  house answers: the stone, the cove and the air are empty space. */
function pickAt(clientX, clientY) {
    if (!camera || !model) return null;
    rayAt(clientX, clientY);
    const pick = firstPick(raycaster.intersectObjects(cast && cast.group.visible ? [model.group, cast.group] : [model.group], true));
    if (!pick) return null;
    if (pick.key !== 'model') return { key: pick.key, level: null, roomId: null, itemId: null };
    return { key: pick.key, ...(model.hitOf(pick.hit) || { level: null, roomId: null, itemId: null }) };
}

/** A tap on Maya: she says it again, with a wave toward the house (or,
 *  once the guide is over, a hint about the house). */
function tapHost() {
    if (!state.loaded) return false;
    // Tucked away, a tap on her brings her back; otherwise she says it again.
    if (ui.guide && ui.guide.scene === 'done' && ui.guide.minimized) guideTo({ type: 'expand' });
    else guideTo({ type: 'again' });
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

// ---- The look: turning the house -----------------------------------------------------

/** Whether the visitor's look is held still: before the house is ready,
 *  and while any card is open (each card has the house behind it). */
function lookLocked() {
    return !state.loaded || anyOpen();
}

/**
 * The canvas's pointers: one that barely moves and lifts soon is a tap,
 * and one that took hold of the turntable (the house, its lawn or its
 * stone) turns it as it moves sideways. A drag on the studio around it
 * turns nothing (QA, 2026-10-15), though a tap there still steps back.
 * Nothing zooms or tilts the
 * view (QA, 2026-10-15): a second finger and the wheel do nothing, though
 * the wheel is still held back from the page, so a trackpad's pinch never
 * zooms the page itself. A mouse that is not pressed says what answers a
 * tap with its cursor.
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
            gesture.grab = grabAt(event.clientX, event.clientY);
            if (gesture.grab && event.pointerType === 'mouse' && canvas.style) canvas.style.cursor = 'grabbing';
        } else {
            // A second finger: never a tap.
            gesture.dragging = true;
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
            // Two fingers turn nothing until one lifts.
            gesture.lastMove = t;
            return;
        }
        if (!gesture.dragging && gesture.start
            && Math.hypot(now.x - gesture.start.x, now.y - gesture.start.y) > tap.slop) gesture.dragging = true;
        if (!gesture.dragging || !gesture.grab) return;
        turntable.drag(now.x - prev.x, window.innerHeight, (t - gesture.lastMove) / 1000);
        gesture.lastMove = t;
        requestRender();
    }, { signal });
    const lift = (event) => {
        if (!gesture.pointers.has(event.pointerId)) return;
        gesture.pointers.delete(event.pointerId);
        const t = performance.now();
        if (gesture.pointers.size > 0) {
            // One of two fingers lifted: the other carries on turning.
            gesture.lastMove = t;
            return;
        }
        const start = gesture.start;
        const tapped = event.type === 'pointerup' && !gesture.dragging && start && t - start.t <= tap.ms;
        if (gesture.grab) turntable.release((t - gesture.lastMove) / 1000);
        gesture.start = null;
        gesture.dragging = false;
        gesture.grab = false;
        if (tapped) handleSceneTap(event.clientX, event.clientY);
        else if (event.pointerType === 'mouse') hover(event, true);
    };
    canvas.addEventListener('pointerup', lift, { signal });
    canvas.addEventListener('pointercancel', lift, { signal });
    canvas.addEventListener('wheel', (event) => {
        if (event.cancelable) event.preventDefault();
    }, { passive: false, signal });
}

/** A mouse over the house (or Maya) points, over the lawn or the stone it
 *  offers to turn the turntable, and over the studio around it is the
 *  plain arrow, since nothing there turns. A room it is over is outlined.
 *  Asked no more than twenty times a second, unless `now`. */
function hover(event, now = false) {
    if (event.pointerType !== 'mouse' || !state.loaded || anyOpen() || !canvas.style) return;
    const t = performance.now();
    if (!now && t - lastHover < 50) return;
    lastHover = t;
    const hit = pickAt(event.clientX, event.clientY);
    canvas.style.cursor = hit ? 'pointer' : grabAt(event.clientX, event.clientY) ? 'grab' : '';
    // The room under the pointer, inside the open floor, faintly outlined.
    const room = hit && hit.key === 'model' && hit.roomId && hit.level === model.lifted ? hit.roomId : null;
    if (model && model.hover(room)) requestRender();
}

/**
 * The keys that move the view, from anywhere but a field or an open card:
 * the left and right arrows turn the house. Returns whether the key was
 * one of them.
 */
function lookKey(key) {
    const v = CONFIG.view;
    switch (key) {
    case 'ArrowLeft': turntable.turnBy(-v.turn.key); break;
    case 'ArrowRight': turntable.turnBy(v.turn.key); break;
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
        addedText: room ? addedLine(state.sheet, room.area, roomName(c.serviceType, room), room.bath) : '',
        welcome: welcomeLine(c),
        standby: standbyLine(c),
        saved: savedNext(c)
    };
}

/** All set, for a published checklist changed through the guide: the
 *  changes to send, else the visit (or a time to choose). Null for a draft,
 *  whose All set offers Choose a time. */
function savedNext(c) {
    if (!isPublished(c)) return null;
    if (hasUnsent(c)) return { text: GUIDE.savedUnsent, id: 'sendChanges', label: GUIDE.sendChanges };
    return isBooked(c)
        ? { text: GUIDE.savedSame, id: 'visit', label: GUIDE.seeVisit }
        : { text: GUIDE.savedSame, id: 'chooseTime', label: GUIDE.chooseTime };
}

/** How the open checklist stands, for what a loop away from Maya changed
 *  (guide.js outcomeOf). */
function standing(c) {
    return {
        id: c ? c.id : null,
        published: isPublished(c),
        booked: isBooked(c) ? `${c.booking.date} ${c.booking.time}` : null,
        unsent: isPublished(c) && hasUnsent(c)
    };
}

/** What Maya says back from a loop (QA, 2026-10-14): what came of it, in
 *  its own words when something changed, else where the home stands; then
 *  what next. */
function afterLine(c, outcome) {
    const when = c && c.booking ? [dayLabel(c.booking.date), clockLabel(c.booking.time)] : null;
    const lead = {
        booked: when ? GUIDE.afterBooked(...when) : '',
        moved: when ? GUIDE.afterMoved(...when) : '',
        canceled: GUIDE.afterCanceled,
        unpublished: GUIDE.afterUnpublished,
        sent: GUIDE.afterSent,
        noTime: GUIDE.afterNoTime,
        notSent: GUIDE.afterNotSent
    }[outcome] || '';
    const parts = CHANGED.includes(outcome) && lead ? [lead] : [lead, whereLine(c)];
    return [...parts, GUIDE.whatNext].filter(Boolean).join(' ');
}

/** Where the home stands, in a sentence: its booked visit, else its rooms,
 *  tasks and price so far, else that it has none yet. */
function whereLine(c) {
    if (!c) return GUIDE.noHome;
    if (isPublished(c)) {
        const visit = isBooked(c) ? GUIDE.homeBooked(dayLabel(c.booking.date), clockLabel(c.booking.time)) : GUIDE.homePublished(c.title);
        return hasUnsent(c) ? `${visit} ${GUIDE.homeUnsent}` : visit;
    }
    if (!liveRooms(c).length) return GUIDE.homeEmpty(c.title);
    const quote = state.sheet ? quoteChecklist(state.sheet, c) : null;
    return GUIDE.homeDraft(c.title, PANEL.rooms(liveRooms(c).length), PANEL.tasks(liveItems(c).length), quote ? formatMoney(quote.totalCents) : '');
}

/** What Maya says standing by (QA, 2026-10-14): just after Skip, that she
 *  is here; back from Need a hand?, where the home stands; then the
 *  question. The example speaks for itself. */
function standbyLine(c) {
    if (ui.guide && ui.guide.skipped) return `${GUIDE.skipped} ${GUIDE.returningLegend}`;
    if (ui.guide && ui.guide.outcome) return afterLine(c, ui.guide.outcome);
    if (c && c.sample) return `${GUIDE.example3}`;
    return `${whereLine(c)} ${GUIDE.returningLegend}`;
}

/** Is the open checklist published, and is it booked? */
const isPublished = (c) => Boolean(c && c.published && c.published.at);
const isBooked = (c) => Boolean(isPublished(c) && c.booking);

/**
 * What Maya says to a returning visitor (QA, 2026-10-14): a greeting (or,
 * by the edit link, that it was opened with it), where the home stands (its
 * visit when booked, else its rooms, tasks and price so far), and what they
 * would like to do.
 */
function welcomeLine(c) {
    if (!c) return '';
    const lead = ui.guide && ui.guide.viaEdit ? GUIDE.welcomeEditLink : GUIDE.welcomeBack;
    return `${lead} ${whereLine(c)} ${GUIDE.returningLegend}`;
}

/** A returning visitor's choices: changes to send; their visit, or a time
 *  to choose; the rooms; the checklist; or simply a look round. */
function returningChoices(c) {
    const o = (id, label) => ({ id, label });
    // No home of their own yet: the example's way on, or a start.
    if (!c) return [o('start', GUIDE.start), o('lookAround', GUIDE.illLook)];
    if (c.sample) return [o('buildOwn', GUIDE.buildOwn), o('lookAround', GUIDE.illLook)];
    const out = [];
    if (isPublished(c)) {
        if (hasUnsent(c)) out.push(o('sendChanges', GUIDE.sendChanges));
        if (isBooked(c)) out.push(o('visit', GUIDE.seeVisit));
        else out.push(o('chooseTime', GUIDE.chooseTime), o('visit', GUIDE.seeLink));
        out.push(o('editRooms', GUIDE.changeChecklist));
    } else {
        if (bookable(c)) out.push(o('chooseTime', GUIDE.chooseTime));
        out.push(o('editRooms', GUIDE.editRooms));
        if (c && liveItems(c).length) out.push(o('reviewChecklist', GUIDE.reviewChecklist));
    }
    out.push(o('lookAround', GUIDE.illLook));
    return out;
}

/** The bubble for the scene now, with the home's quote and visit at its
 *  head while she is speaking. Null when Maya has nothing to say. */
function guideView() {
    const v = sceneView();
    return v ? { ...v, facts: hostFacts(active()) } : v;
}

/**
 * The home at a glance, under Maya's name (Steve, 2026-10-14), tucked
 * away or not, since nothing else on the page shows it now: its quote once
 * a task is priced (the example's marked as such), a tap away from the
 * breakdown; and once published its visit, or that none is booked, a tap
 * away from the receipt, with changes not sent said under it. Null when
 * there is nothing to show yet (the greeting, the kind of home, the
 * floors).
 */
function hostFacts(c) {
    if (!c) return null;
    const facts = [];
    if (state.sheet && liveItems(c).length) {
        const quote = quoteChecklist(state.sheet, c);
        const chip = quoteChip(c, state.sheet);
        facts.push({
            key: 'quote', label: c.sample ? GUIDE.factExample : GUIDE.factQuote, value: formatMoney(quote.totalCents),
            // Every price on screen is labeled an example until launch (PRD 4).
            spoken: chip ? chip.spoken : '', note: UI.examplePrices
        });
    }
    if (isPublished(c)) {
        const when = isBooked(c) ? [dayLabel(c.booking.date), clockLabel(c.booking.time)] : null;
        const unsent = hasUnsent(c);
        const spoken = when ? UI.visitChipSpoken(...when) : `${UI.visitChipNone}.`;
        facts.push({
            key: 'visit',
            label: GUIDE.factVisit,
            value: when ? GUIDE.factWhen(...when) : GUIDE.factNoVisit,
            note: unsent ? UI.visitChipUnsent : '',
            spoken: unsent ? `${spoken} ${UI.visitChipUnsent}.` : spoken
        });
    }
    return facts.length ? facts : null;
}

/** A fact at a glance tapped: the quote's breakdown, or the receipt. */
function onHostFact(key) {
    if (!state.loaded) return;
    if (host) host.poke();
    if (key === 'quote') openQuote();
    else if (key === 'visit') openReceipt();
}

/** The scene's bubble, with the floors to tick filled in from the open
 *  checklist. */
function sceneView() {
    if (!ui.guide) return null;
    const v = viewFor(ui.guide, guideContext());
    const c = active();
    const typeKey = c ? c.serviceType : 'cleaning';
    if (v && v.choices === 'rooms') {
        // The rooms most homes have, each on its usual floor (panel.js).
        const chips = c ? homeSuggestions(c).map(({ area, level }) => {
            const name = roomName(typeKey, { area, label: '' });
            return { area, level, label: name, aria: PANEL.chipLabel(name) };
        }) : [];
        return { ...v, choices: { kind: 'chips', legend: GUIDE.roomsLegend, chips } };
    }
    if (v && v.choices === 'returning') {
        return { ...v, choices: { kind: 'pick', legend: GUIDE.returningLegend, options: returningChoices(c) } };
    }
    if (v && v.choices === 'home') {
        const now = v.answered && c && c.residence ? c.residence.kind : null;
        const options = residencesOf(typeKey).map((k) => ({ id: `kind-${k.key}`, label: k.name, on: k.key === now }));
        return { ...v, choices: { kind: 'pick', legend: GUIDE.homeLegend, options } };
    }
    if (v && v.choices === 'attached') {
        const townhome = residencesOf(typeKey).find((k) => k.attached) || { attached: [] };
        const side = c && c.residence ? c.residence.attached : null;
        const options = townhome.attached.map((a) => ({ id: `attached-${a.key}`, label: a.name, on: Boolean(ui.guide.attachedAnswered) && a.key === side }));
        return { ...v, choices: { kind: 'pick', legend: GUIDE.attached, options } };
    }
    if (v && v.choices === 'floors') {
        const type = typeOf(typeKey);
        // Only the floors this kind of home can have (a condo, one or two).
        const allowed = levelsAllowed(typeKey, c ? c.residence : null);
        const levels = (type ? type.levels : []).filter((l) => allowed.includes(l.key))
            .map((l) => ({ key: l.key, name: l.name, on: Boolean(c && c.levels.includes(l.key)) }));
        return { ...v, choices: { kind: 'floors', levels, title: c ? c.title : GUIDE.defaultTitle, maxTitle: CONFIG.limits.title } };
    }
    return v;
}

/** Which gesture opens a scene: a wave to greet, an arm toward the house
 *  as a step about it begins. */
const GESTURE_OF = {
    hello: 'wave', welcome: 'wave',
    home: 'point', attached: 'point', floors: 'point', saved: 'wave', firstRoom: 'point', added: 'point', dots: 'point', rooms: 'point', review: 'point',
    example1: 'point', example2: 'point', look: 'point'
};

/** Maya says the scene now (or is put away when there is none), with the
 *  gesture that opens it. */
function showGuide() {
    if (!host || !state.loaded) return;
    const view = guideView();
    host.show(view);
    setHalo(view ? view.halo : null);
    if (!cast) return;
    cast.speaking(view && !view.minimized ? speakSeconds(view.text) : 0);
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
    case 'home':
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
        if (to === 'saved') {
            save();
            // A small celebration: one slow turn of the house, as Maya waves.
            if (turntable && !state.reducedMotion) {
                turntable.spinOnce();
                requestRender();
            }
        }
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

/** One of Maya's choices sends the visitor to a card: she steps aside,
 *  remembering where they went and how the home stood. */
function goAway(to) {
    guideTo({ type: 'away', to, was: standing(active()) });
}

/**
 * Maya back from a loop (QA, 2026-10-14: hold their hand each step of the
 * way): once the last card has closed and nothing is on its way (a card
 * handing over to the next, changes being sent, a booking), she says what
 * came of it and offers what next, the keyboard on her first choice. A
 * card opened some other way, or nothing to come back from, leaves her be.
 */
function comeBack() {
    const g = ui.guide;
    if (!g || !g.away || g.scene !== 'done' || anyOpen() || ui.handoff || state.sending || (ui.booking && ui.booking.busy)) return false;
    // Out from under the card now, not at the next frame, so she is heard.
    if (host) host.setCovered(Boolean(panel && panel.shown));
    if (!guideTo({ type: 'returned', now: standing(active()) })) return false;
    if (host) host.focusPrimary();
    if (cast && CHANGED.includes(ui.guide.outcome) && !state.reducedMotion) {
        cast.gesture('wave');
        requestRender();
    }
    return true;
}

/** Open a card that may stop short of opening (no sheet yet, the server
 *  away): Maya waits while it opens, and comes back if it did not. */
async function handOff(open) {
    ui.handoff = true;
    try {
        return await open();
    } finally {
        ui.handoff = false;
        comeBack();
    }
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
    // Maya steps aside for the card (from her All set, or a return), and
    // comes back once it is done to say what came of it (comeBack).
    case 'chooseTime':
        goAway('booking');
        handOff(() => openBooking());
        break;
    case 'visit':
        goAway('receipt');
        handOff(() => openReceipt());
        break;
    case 'sendChanges':
        goAway('send');
        sendChanges();
        break;
    case 'reviewChecklist':
        goAway('checklist');
        openChecklistView();
        comeBack();
        break;
    case 'back':
        guideTo({ type: 'back', roomId: firstRoomId() });
        break;
    default:
        if (id.startsWith('kind-')) chooseResidence({ kind: id.slice(5) });
        else if (id.startsWith('attached-')) chooseResidence({ attached: id.slice(9) });
        else guideTo({ type: id });
    }
}

/** The first room of the build, for its line when the guide goes back to
 *  the First room step: the one Maya spoke of, while it is still there,
 *  else the earliest added. Null with no rooms. */
function firstRoomId() {
    const c = active();
    if (!c) return null;
    const rooms = liveRooms(c);
    const spoken = ui.guide && rooms.find((r) => r.id === ui.guide.roomId);
    if (spoken) return spoken.id;
    const first = rooms.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
    return first ? first.id : null;
}

/** A step of Maya's progress strip tapped: that step, if reached. */
function onHostStep(index) {
    if (!state.loaded) return;
    if (host) host.poke();
    guideTo({ type: 'goto', step: index, roomId: firstRoomId() });
}

/**
 * A kind of home chosen in Maya's bubble (or a townhome's neighbors), set
 * on the checklist at once (PRD 8.9), and the guide moved on: a townhome is
 * asked once more. A refusal (a level with rooms the kind cannot have) is
 * said, and Maya asks again.
 */
function chooseResidence(patch) {
    const c = ensureOwn();
    if (!c) return null;
    const residence = { ...(c.residence || {}), ...patch };
    const result = mutate((d) => setResidence(d, c.id, residence, CONFIG, now()), UI.labels.home);
    if (result.error) {
        if (host) updateHost();
        return result;
    }
    guideTo({ type: 'residence', kind: active().residence.kind });
    return result;
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
        if (host) updateHost();
        return;
    }
    if (!guideTo({ type: 'floorTapped' }) && host) updateHost();
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

// ---- Help -------------------------------------------------------------------------

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

/** The Help menu: what Whitestone is, and Start over. Everything else
 *  is Maya's (Steve, 2026-10-15: one way to each thing). Each item closes
 *  the menu first. */
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
        'help-about': () => guideTo({ type: 'about' }),
        'help-reset': confirmStartOver
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

// ---- Choosing a time and publishing (M3, against the stand-in) ---------------

/** Who answers the API, and the schedule, made on first need (keeping the
 *  first load light): the stand-in in this browser until the server runs
 *  (config.js `api`). Resolves to `{ api, schedule }`, or null. */
let service = null;
async function connect() {
    if (service) return service;
    try {
        const response = await fetch('data/schedule.json');
        if (!response.ok) throw new Error(`${response.status} for the schedule`);
        const schedule = await response.json();
        let api;
        if (CONFIG.api.mode === 'standin') {
            let backend = null;
            try {
                backend = await openIdbBackend(CONFIG, globalThis.indexedDB, { database: CONFIG.api.database, store: 'standin' });
            } catch (e) {
                backend = null;
            }
            const standin = createStandin({ backend: backend || createMemoryBackend(), config: CONFIG, schedule });
            api = createApi((request) => standin.handle(request));
        } else {
            api = createApi(createFetchTransport((...args) => fetch(...args), CONFIG.api.base));
        }
        service = { api, schedule, sealer: createSealer() };
        return service;
    } catch (err) {
        console.error('[Whitestone] The booking service could not start:', err);
        return null;
    }
}

/**
 * Arriving by the edit link: its checklist, if this device has it, else
 * brought from the API and opened with the link's key (sync.js
 * openPublished), and made the open one. A link that opens nothing (expired,
 * unpublished, or not a real one) is said once the house is up.
 */
async function arriveByEditLink(link) {
    const mine = state.doc.checklists.find((c) => !c.deletedAt && c.published && c.published.id === link.id);
    if (mine) {
        state.doc = setSettings(state.doc, { activeId: mine.id }).doc;
        state.viaEdit = true;
        return true;
    }
    const svc = await connect();
    if (!photoStore) await openPhotos();
    const opened = svc ? await openPublished({ api: svc.api, sealer: svc.sealer, photos: photoStore, link }) : { ok: false };
    const imported = opened.ok ? importPublished(state.doc, opened.form, { ...link, version: opened.version }, CONFIG, now()) : null;
    if (!imported || imported.error) {
        state.editLinkFailed = true;
        return false;
    }
    state.doc = setSettings(imported.doc, { activeId: imported.record.id }).doc;
    state.viaEdit = true;
    save();
    return true;
}

/** A new PIN for an imported checklist whose PIN this device never saw,
 *  asked first: the cleaner then needs the new one. */
function confirmNewPin() {
    confirmCard({
        title: RECEIPT.newPinTitle,
        detail: RECEIPT.newPinDetail,
        confirmLabel: RECEIPT.newPin,
        onConfirm: async () => {
            const c = active();
            const svc = await connect();
            if (!c || !c.published || !svc) return;
            const r = await svc.api.resetPin(c.published.id, c.published.ownerToken);
            if (!r.ok) {
                toast(BOOKING_ERRORS[r.error] || BOOKING_ERRORS.server);
                return;
            }
            mutate((d) => setPublication(d, c.id, { published: { ...c.published, pin: r.data.pin } }, CONFIG, now()));
            announce(RECEIPT.newPinDone);
            openReceipt();
        }
    });
}

/** The checklist the visitor can book: their own, priced, not yet booked. */
function bookable(c) {
    return Boolean(c && !c.sample && state.sheet && liveItems(c).length && !isBooked(c));
}

/** The month a booking can be made in now, and the last it can reach. */
function bookingMonths(schedule) {
    const today = todayIn(now().getTime(), schedule.timezone);
    return { first: today.slice(0, 7), last: addDays(today, schedule.horizonDays).slice(0, 7) };
}

/** The quote the open checklist goes out with (sync.js quoteToSend): the
 *  one locked at publish while nothing has changed, else a fresh one. */
function sendingQuote(c) {
    return state.sheet ? quoteToSend(c, state.sheet, now().toISOString()).quote : null;
}

/** The last day a visit may be on: the quote's 90 days from when it was
 *  locked (a quote not locked yet is locked today). */
function quoteUntil(quote, schedule) {
    const locked = quote && quote.lockedAt ? Date.parse(quote.lockedAt) : now().getTime();
    return addDays(todayIn(locked, schedule.timezone), CONFIG.api.quoteDays);
}

/** "Friday, October 16 at 9:00 am" */
const visitWhen = (booking) => `${dayLabel(booking.date)} at ${clockLabel(booking.time)}`;

/** What the hours of the change window are, for the lines that say it. */
const cancelHours = () => (service ? service.schedule.cancelHours : 24);

/** A `record` for sync.js: each step written to the store as it happens,
 *  never as an undo step (store.js setPublication). */
function recordFor(id) {
    return async (patch) => {
        const r = mutate((d) => setPublication(d, id, patch, CONFIG, now()));
        return r.error ? findChecklist(state.doc, id) : r.record;
    };
}

function drawBooking() {
    if (!booking || !ui.booking) return;
    const b = ui.booking;
    const range = service ? bookingMonths(service.schedule) : { first: b.month, last: b.month };
    const c = active();
    const quote = c ? sendingQuote(c) : null;
    const moving = b.mode === 'move' && c && c.booking;
    booking.show({
        ...b,
        title: moving ? BOOKING.newTitle : BOOKING.title,
        confirmLabel: b.busy ? null : moving ? BOOKING.move : b.mode === 'again' ? BOOKING.bookAgain : BOOKING.confirm,
        current: moving ? c.booking.date : null,
        summary: [
            moving ? BOOKING.nowAt(visitWhen(c.booking)) : '',
            quote ? BOOKING.summary(formatMoney(quote.totalCents), formatMinutes(roundMinutes(quote.minutes))) : ''
        ].filter(Boolean).join(' '),
        canPrev: b.month > range.first && !b.busy,
        canNext: b.month < range.last && !b.busy
    });
}

/** A month's openings from the API; the earliest open day chosen when the
 *  chosen one is not open. */
async function loadMonth() {
    const b = ui.booking;
    if (!b || !service) return;
    b.loading = true;
    drawBooking();
    const r = await service.api.availability(b.month, b.minutes);
    if (ui.booking !== b) return;
    b.loading = false;
    b.days = r.ok ? r.data.days : [];
    if (!r.ok) b.error = BOOKING_ERRORS[r.error] || BOOKING_ERRORS.server;
    const chosen = b.days.find((d) => d.date === b.selected && d.times.length && !(b.until && d.date > b.until));
    if (!chosen) {
        b.selected = firstOpen(b.days, b.until);
        b.time = null;
    }
    drawBooking();
}

/**
 * Choose a time (PRD 10.3): this month's openings for a visit as long as
 * the quote, the earliest chosen. A booked visit is moved here too (PRD
 * 10.4), inside the change window and the quote's 90 days, its own day
 * marked; and a published checklist with no visit is booked again. `error`
 * is said as the card opens (a change that no longer fits its time).
 */
async function openBooking({ error = '' } = {}) {
    const c = active();
    if (!c) return null;
    if (!state.sheet) {
        announce(UI.sheetLoading);
        toast(UI.sheetLoading);
        return null;
    }
    const svc = await connect();
    if (!svc) {
        toast(BOOKING_ERRORS.server);
        return null;
    }
    const moving = isBooked(c);
    if (moving && !canChange(svc.schedule, c.booking, now().getTime())) {
        const why = RECEIPT.locked(svc.schedule.cancelHours);
        announce(why);
        toast(why);
        return null;
    }
    const quote = sendingQuote(c);
    if (c.sample || !liveItems(c).length || !quote) {
        const why = c.sample ? BOOKING_ERRORS.sample : BOOKING_ERRORS.unpriced;
        announce(why);
        toast(why);
        return null;
    }
    ui.booking = {
        mode: moving ? 'move' : isPublished(c) ? 'again' : 'new',
        month: bookingMonths(svc.schedule).first, days: [], selected: null, time: null,
        minutes: visitMinutes(quote.minutes), until: isPublished(c) ? quoteUntil(quote, svc.schedule) : null,
        error, busy: false, loading: true, priceOk: false
    };
    openCard('booking', { onClose: () => { if (ui.booking && !ui.booking.busy) ui.booking = null; } });
    await loadMonth();
    // A month with nothing left goes on to the next, once.
    if (ui.booking && !firstOpen(ui.booking.days, ui.booking.until) && ui.booking.month < bookingMonths(svc.schedule).last) {
        ui.booking.month = shiftMonth(ui.booking.month, 1);
        await loadMonth();
    }
    if (booking) booking.focusDay();
    if (error) announce(error);
    return ui.booking;
}

/**
 * How the quote moves with the changes not sent yet: `{ from, to }` in
 * words, or null when it does not (PLANNING 10.2: asked before sending).
 */
function priceChange(c) {
    if (!isPublished(c) || !c.quote || !state.sheet) return null;
    const next = sendingQuote(c);
    if (!next || next.totalCents === c.quote.totalCents) return null;
    return { from: formatMoney(c.quote.totalCents), to: formatMoney(next.totalCents) };
}

/** Ask first when the quote changes, then `go()`. */
function askPrice(c, go) {
    const diff = priceChange(c);
    if (!diff) return go();
    confirmCard({
        title: CHANGES.priceTitle,
        detail: CHANGES.priceDetail(diff.from, diff.to),
        confirmLabel: CHANGES.priceConfirm,
        cancelLabel: CHANGES.notNow,
        onConfirm: go
    });
    return null;
}

/** Book and publish (PLANNING 10.1), or move the booked visit, or book a
 *  published checklist again (sync.js republish), then the receipt. A time
 *  just taken shows the day again with what is left, and the next openings
 *  said. */
async function confirmBooking() {
    const b = ui.booking;
    const c = active();
    if (!b || b.busy || !c || !service || !b.selected) return null;
    const day = b.days.find((d) => d.date === b.selected);
    const time = day && (day.times.includes(b.time) ? b.time : day.times[0]);
    if (!time) return null;
    // Changes not sent go with a move, so a new price is asked about first.
    if (isPublished(c) && !b.priceOk && priceChange(c)) {
        askPrice(c, () => {
            if (ui.booking !== b) return;
            b.priceOk = true;
            confirmBooking();
        });
        return null;
    }
    b.busy = true;
    b.error = '';
    drawBooking();
    if (!photoStore) await openPhotos();
    const args = { checklist: c, api: service.api, sealer: service.sealer, photos: photoStore, sheet: state.sheet, at: now().toISOString(), record: recordFor(c.id) };
    const result = isPublished(c)
        ? await republish({ ...args, slot: { date: b.selected, time } })
        : await publish({ ...args, slot: { date: b.selected, time, minutes: b.minutes } });
    if (ui.booking !== b) return result;
    b.busy = false;
    if (!result.ok) {
        b.error = result.error === 'too-late' ? RECEIPT.locked(cancelHours()) : BOOKING_ERRORS[result.error] || BOOKING_ERRORS.server;
        if (result.error === 'taken' && result.next.length) {
            b.error = `${b.error} ${result.next.map((n) => `${dayLabel(n.date)} at ${clockLabel(n.time)}`).join(', ')}.`;
            b.selected = result.next[0].date;
            b.time = result.next[0].time;
            if (b.selected.slice(0, 7) !== b.month) b.month = b.selected.slice(0, 7);
        }
        await loadMonth();
        announce(b.error);
        return result;
    }
    // The calendar hands over to the receipt.
    await handOff(() => {
        closeCard('booking');
        ui.booking = null;
        if (b.mode === 'move') {
            const said = CHANGES.moved(visitWhen(result.checklist.booking));
            announce(said);
            toast(said);
        }
        afterServerChange();
        return openReceipt();
    });
    return result;
}

/**
 * Send the changes made since publishing (PLANNING 10.2): asked first when
 * the quote moves; a visit that no longer fits its time opens Choose a new
 * time, and the changes go with the move.
 */
async function sendChanges() {
    const c = active();
    // Stopped short, Maya (if she sent the visitor here) comes back to say
    // the changes are still waiting.
    const stop = (said) => {
        if (said) {
            announce(said);
            toast(said);
        }
        comeBack();
        return null;
    };
    if (!isPublished(c)) return stop('');
    if (!hasUnsent(c)) return stop(CHANGES.nothingToSend);
    if (!state.sheet) return stop(UI.sheetLoading);
    const svc = await connect();
    if (!svc) return stop(BOOKING_ERRORS.server);
    return askPrice(c, async () => {
        if (state.sending) return null;
        state.sending = true;
        try {
            announce(CHANGES.sending);
            if (!photoStore) await openPhotos();
            const result = await republish({
                checklist: active(), api: svc.api, sealer: svc.sealer, photos: photoStore, sheet: state.sheet,
                at: now().toISOString(), record: recordFor(c.id)
            });
            if (result.ok) {
                announce(CHANGES.sent);
                toast(CHANGES.sent);
                afterServerChange();
                return result;
            }
            if (result.error === 'no-longer-fits') {
                // Still sending as the receipt closes, so Maya waits for the
                // calendar.
                if (isOpen('receipt')) closeCard('receipt');
                await openBooking({ error: BOOKING_ERRORS['no-longer-fits'] });
                return result;
            }
            const why = result.error === 'too-late' ? CHANGES.tooLateLonger(svc.schedule.cancelHours) : BOOKING_ERRORS[result.error] || BOOKING_ERRORS.server;
            announce(why);
            toast(why);
            return result;
        } finally {
            state.sending = false;
            comeBack();
        }
    });
}

/** Cancel the booked visit, asked first (PRD 10.4). The checklist stays
 *  published, and the receipt then offers Choose a time. */
function confirmCancelVisit() {
    const c = active();
    if (!isBooked(c)) return;
    confirmCard({
        title: CHANGES.cancelTitle,
        detail: CHANGES.cancelDetail(visitWhen(c.booking)),
        confirmLabel: CHANGES.cancelConfirm,
        cancelLabel: CHANGES.keep,
        danger: true,
        onConfirm: async () => {
            const svc = await connect();
            const latest = active();
            if (!svc || !isBooked(latest)) return;
            const r = await cancelVisit({ checklist: latest, api: svc.api, sealer: svc.sealer, at: now().toISOString(), record: recordFor(latest.id) });
            const said = r.ok ? CHANGES.cancelled : r.error === 'too-late' ? RECEIPT.locked(svc.schedule.cancelHours) : BOOKING_ERRORS[r.error] || BOOKING_ERRORS.server;
            announce(said);
            toast(said);
            if (r.ok) afterServerChange();
        }
    });
}

/** Unpublish, asked first (PRD 13.2): the link and PIN stop working, the
 *  visit (if any) is cancelled, and the checklist is a draft here again. */
function confirmUnpublish() {
    const c = active();
    if (!isPublished(c)) return;
    confirmCard({
        title: CHANGES.unpublishTitle,
        detail: isBooked(c) ? CHANGES.unpublishDetailBooked(visitWhen(c.booking)) : CHANGES.unpublishDetail,
        confirmLabel: CHANGES.unpublishConfirm,
        cancelLabel: CHANGES.keep,
        danger: true,
        onConfirm: async () => {
            const svc = await connect();
            const latest = active();
            if (!svc || !isPublished(latest)) return;
            const r = await unpublish({ checklist: latest, api: svc.api, record: recordFor(latest.id) });
            if (!r.ok) {
                const why = r.error === 'too-late' ? RECEIPT.locked(svc.schedule.cancelHours) : BOOKING_ERRORS[r.error] || BOOKING_ERRORS.server;
                announce(why);
                toast(why);
                return;
            }
            if (isOpen('receipt')) closeCard('receipt');
            const said = CHANGES.unpublished(latest.title);
            announce(said);
            toast(said);
            afterServerChange();
        }
    });
}

/** After a send, a move, a cancel or an unpublish: the receipt (if open)
 *  and Maya's words (if she is standing by) catch up. */
function afterServerChange() {
    refresh();
    redrawReceipt();
    if (ui.guide && !guiding()) showGuide();
}

/** The receipt for the open checklist, once it is published. Resolves to
 *  its view, or null. */
async function openReceipt() {
    const c = active();
    if (isPublished(c)) await connect();
    const view = c && service ? receiptFor(c) : null;
    if (!view || !receipt) return null;
    ui.receipt = view;
    receipt.show(view);
    openCard('receipt', { onClose: () => receipt.release() });
    return view;
}

function receiptFor(c) {
    return receiptView(c, { origin: window.location.origin, config: CONFIG, timezone: service.schedule.timezone, now: now().getTime(), schedule: service.schedule });
}

/** The receipt drawn again while it is open, from the checklist as it now
 *  stands; closed if there is nothing left to show. */
function redrawReceipt() {
    if (!receipt || !isOpen('receipt')) return;
    const c = active();
    const view = c && service ? receiptFor(c) : null;
    if (!view) {
        closeCard('receipt');
        return;
    }
    ui.receipt = view;
    receipt.show(view);
}

/** From the receipt: Change the time, or Choose a time after a cancel. The
 *  receipt steps aside for the calendar, and comes back once it is done. */
function bookFromReceipt() {
    return handOff(() => {
        closeCard('receipt');
        return openBooking();
    });
}

/** Copy the link, the PIN or the edit link, and say so beside the button. */
async function copyFromReceipt(what, button) {
    const v = ui.receipt;
    if (!v) return;
    const text = what === 'pin' ? v.pin : what === 'edit' ? v.edit : v.link;
    const status = el('receipt-status');
    try {
        await navigator.clipboard.writeText(text);
        flash(button, status, RECEIPT.copied);
    } catch (e) {
        // No clipboard here: the field is selected, ready to copy by hand.
        const field = el(what === 'edit' ? 'receipt-edit-link' : 'receipt-link');
        if (field && typeof field.select === 'function') field.select();
    }
}

function shareFromReceipt(button) {
    const v = ui.receipt;
    if (!v) return;
    shareLink({ title: RECEIPT.shareTitle, text: RECEIPT.shareText, url: v.link }, { onCopied: () => flash(button, el('receipt-status'), RECEIPT.copied) });
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
    // Undo takes back edits, never a publication or a booking: those are
    // the server's (store.js keepServerFacts).
    state.doc = keepServerFacts(step.doc, state.doc);
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
    const show = (id, on) => { const b = el(id); if (b) b.hidden = !on; };
    show('my-clear-example', hasSamples(state.doc));
    const chip = quoteChip(c, state.sheet);
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
        fitFrame(!state.loaded || state.reducedMotion);
    }
    // Maya's words that depend on the home (the rooms so far) keep up.
    if (host && host.view) updateHost();
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
        // The kind of home before the levels, which it decides.
        const result = change((d) => chain(d, [
            (x) => updateChecklist(x, id, fields, CONFIG, at),
            (x) => setResidence(x, id, fields.residence, CONFIG, at),
            (x) => setLevels(x, id, fields.levels, CONFIG, at)
        ]), UI.labels.home, UI.homeSaved);
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

/**
 * Remove a checklist from this browser, asked first. A published one is
 * unpublished first (its visit cancelled with it), so no copy or booking is
 * left behind that nothing here could reach again; one whose visit is
 * inside the change window waits until after the visit.
 */
async function remove(id) {
    const c = findChecklist(state.doc, id);
    if (!c) return;
    const svc = isPublished(c) ? await connect() : null;
    if (isBooked(c) && svc && !canChange(svc.schedule, c.booking, now().getTime())) {
        const why = CHANGES.removeLocked(svc.schedule.cancelHours);
        announce(why);
        toast(why);
        return;
    }
    const gone = () => change((d) => deleteChecklist(d, id, CONFIG, now()), UI.labels.removed, UI.removedChecklist(c.title));
    confirmCard({
        title: UI.removeTitle(c.title),
        detail: !isPublished(c) ? UI.removeDetail : isBooked(c) ? CHANGES.removeBooked(visitWhen(c.booking)) : CHANGES.removePublished,
        confirmLabel: UI.remove,
        danger: true,
        onConfirm: async () => {
            const latest = findChecklist(state.doc, id);
            if (isPublished(latest)) {
                const r = svc ? await unpublish({ checklist: latest, api: svc.api, record: recordFor(id) }) : { ok: false, error: 'server' };
                if (!r.ok) {
                    const why = r.error === 'too-late' ? CHANGES.removeLocked(cancelHours()) : BOOKING_ERRORS[r.error] || BOOKING_ERRORS.server;
                    announce(why);
                    toast(why);
                    return;
                }
            }
            gone();
        }
    });
}

/**
 * Start over (the Help menu): asked first, on the confirmation card, since
 * it cannot be undone (QA, 2026-10-14). Everything this browser published
 * is unpublished first (Steve, 2026-10-14), its visits canceled with it,
 * since clearing the owner tokens would leave those copies and bookings
 * where nothing could reach them. A visit inside the change window makes
 * it wait until after the visit, and a failure to unpublish clears
 * nothing.
 */
async function confirmStartOver() {
    // Every checklist this browser holds a publication for, removed ones
    // and a publish stopped part way included.
    const published = state.doc ? state.doc.checklists.filter((c) => c.published) : [];
    const svc = published.length ? await connect() : null;
    if (svc && published.some((c) => c.booking && !canChange(svc.schedule, c.booking, now().getTime()))) {
        const why = HELP.resetLocked(svc.schedule.cancelHours);
        announce(why);
        toast(why);
        return;
    }
    confirmCard({
        title: HELP.resetTitle,
        detail: published.length ? HELP.resetDetailPublished : HELP.resetDetail,
        confirmLabel: HELP.resetConfirm,
        danger: true,
        onConfirm: published.length ? () => unpublishAllThenStartOver(svc) : startOver
    });
}

/** Unpublish each checklist this browser published, then start over. One
 *  that will not go stops it all, with nothing cleared, so it can be tried
 *  again. */
async function unpublishAllThenStartOver(svc) {
    for (const c of state.doc.checklists.filter((x) => x.published)) {
        // A removed one (kept for its undo) takes no store write, and is
        // cleared a moment later with the rest.
        const record = c.deletedAt ? async () => c : recordFor(c.id);
        const r = svc ? await unpublish({ checklist: c, api: svc.api, record }) : { ok: false, error: 'server' };
        if (!r.ok) {
            const why = r.error === 'too-late' ? HELP.resetLocked(cancelHours()) : BOOKING_ERRORS[r.error] || BOOKING_ERRORS.server;
            announce(why);
            toast(why);
            return null;
        }
    }
    return startOver();
}

/**
 * Everything this browser keeps for the studio cleared, as on a first
 * visit: the saved checklists, the photos, the undo steps, where the guide
 * was, the open floor and selection. Maya greets the visitor again.
 */
function startOver() {
    selectTo(null);
    liftLevel(null);
    history.clear();
    if (store) store.clear();
    if (photoStore) photoStore.prune(new Set()).catch(() => {});
    state.doc = emptyDoc(CONFIG, now());
    state.saved = false;
    state.storageStatus = 'fresh';
    Object.assign(ui, { editing: null, room: null, task: null, afterPrefs: false, filter: 'all', menuArea: null });
    refresh();
    guideTo({ type: 'restart' });
    announce(HELP.resetDone);
    if (host) host.focusPrimary();
    return state.doc;
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
    // A moment after the last card closes, so a Yes that goes on to send or
    // open something else has begun by then.
    setOnSettled(() => Promise.resolve().then(comeBack));
    setupLook(signal);
    host = createHost({
        signal,
        timing: { pulse: CONFIG.guide.pulse, again: CONFIG.guide.again },
        on: { button: onHostButton, floor: onFloor, step: onHostStep, chip: onGuideChip, fact: onHostFact }
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
    // The kind of home decides the neighbors asked and the levels offered.
    on('setup-residence', 'change', () => showResidence());
    on('setup-attached', 'change', () => showResidence());
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
    on('quote-open-checklist', 'click', openChecklistView);
    booking = createBooking({
        signal,
        on: {
            month: (by) => {
                if (!ui.booking || ui.booking.busy) return;
                ui.booking.month = shiftMonth(ui.booking.month, by);
                ui.booking.error = '';
                loadMonth();
            },
            day: (date) => {
                if (!ui.booking) return;
                ui.booking.selected = date;
                ui.booking.time = null;
                drawBooking();
            },
            time: (time) => {
                if (!ui.booking) return;
                ui.booking.time = time;
                drawBooking();
            },
            confirm: () => confirmBooking()
        }
    });
    receipt = createReceipt({
        signal,
        on: {
            copy: copyFromReceipt, share: shareFromReceipt, newPin: confirmNewPin, send: sendChanges,
            reschedule: bookFromReceipt, book: bookFromReceipt, cancelVisit: confirmCancelVisit, unpublish: confirmUnpublish,
            done: () => closeCard('receipt')
        }
    });
    on('booking-cancel', 'click', () => closeCard('booking'));
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
    placeHalo();
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
    startOver,
    confirmStartOver,
    firstRoomId,
    editHome,
    submitSetup,
    openPreferences,
    submitPreferences,
    openBooking,
    confirmBooking,
    showGuide,
    arriveByEditLink,
    confirmNewPin,
    openReceipt,
    sendChanges,
    confirmCancelVisit,
    confirmUnpublish,
    connect,
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
