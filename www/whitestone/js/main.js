// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * main.js - Entry point for Whitestone Home Care.
 *
 * THE BOOT (Auto Man's, adapted in PLANNING 4.1): the loading screen, the
 * shared proof-of-work puzzle, the renderer and the room, the saved document,
 * the shaders warmed behind the loader, then the reveal. The price sheet
 * loads in the background, so a slow network never holds up the studio.
 *
 * THE DOCUMENT IS THE SOURCE OF TRUTH AND THE STUDIO IS A PROJECTION OF IT
 * (Corner Office's rule). Every change goes through `mutate`, which applies a
 * store.js mutation, keeps the document it replaced for undo, saves, and
 * calls `refresh` so everything on screen is drawn again from the new
 * document. `change` is mutate plus the spoken line and the undo toast.
 *
 * THE SCENE RENDERS ON DEMAND, as Corner Office does. A studio mostly sits
 * still, so a frame is drawn only when something asks for one
 * (`requestRender`): the reveal, a resize, a returning tab, a glide between
 * stations, the visitor looking around. An idle studio costs a phone
 * nothing.
 *
 * THE CAMERA STANDS AT STATIONS (stations.js) and glides between them,
 * slowly and eased, or cuts under reduced motion. From any station the
 * visitor can look around with a drag, the wheel, a pinch or the arrow keys
 * (the shared pan part, its buttons hidden), and every glide starts from
 * the view as they left it and lands on the next station's composed view.
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
    clearSamples, hasSamples
} from './store.min.js';
import { withExample } from './samples.min.js';
import { createHistory } from './history.min.js';
import { loadSheet, currentVersion, checkChoice, presetFor } from './sheet.min.js';
import { priceChoice, formatMoney, formatMinutes } from './pricing.min.js';
import { createPhotoStore, createMemoryBackend, openIdbBackend, preparePhoto } from './photos.min.js';
import { roomName, levelOf } from './taxonomy.min.js';
import { h, clear, initCards, openCard, closeCard, isOpen, anyOpen, announce, toast, confirmCard, setFocusFallback } from './cards.min.js';
import {
    initForms, fillSetupForm, readSetupForm, validateSetup, showError, showHints, fillPreferencesForm, readPreferencesForm,
    fillRoomForm, readRoomForm, validateRoom, showPresetPreview, fillTaskForm, showTaskChoices, readTaskForm
} from './forms.min.js';
import {
    renderMyChecklists, renderChecklist, renderTaskPhotos, taskName, fillChecklistFilter, quoteChip, renderQuote,
    renderMenu, fillMenuAreas
} from './panels.min.js';
import { UI, BOARDS, STUDIO, STORAGE_NOTES, ITEM_ERRORS } from './copy.min.js';
import { HOME_STATION, poseFor, zoomedFov, createGlide } from './stations.min.js';
import { buildStudio, anchorsFor, firstPick, hiddenFrom } from './studio.min.js';
import { buildStreet } from './street.min.js';
import { buildModel } from './model.min.js';
import { TOUCH, COACHING, marksShown, noteUsed as withUsed, touchForKey, nextLevel, onScreen } from './marks.min.js';
import { arrivalId, createIntro } from './intro.min.js';
import { installPropList } from '../../shared/js/proplist-1.0.0.min.js';
import {
    boardContent, menuContent, contentKey, drawBoard as paintBoard, drawMenu as paintMenu, menuAreaFor
} from './boards.min.js';
import {
    initPortraitControls, updatePortraitControls, resetPortraitAim, gestureClaimedTap
} from '../../shared/js/pan-1.0.0.min.js';

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
    /** The station's pose the camera was last set to (stations.js). */
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
 *   station     where the camera stands (stations.js)
 *   zoom        the visitor's zoom from the station's own lens, in doublings
 */
const ui = {
    editing: null, room: null, task: null, afterPrefs: false, filter: 'all', menuArea: null,
    station: HOME_STATION, zoom: 0
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
let studio = null;
let street = null;
/** The house model on the plinth (model.js). */
let model = null;
/** The plan board's and the menu display's canvases, each with its texture
 *  and the words it last painted (boards.js). */
const faces = {};
/** The room labels over a lifted level, and what they say. */
const roomLabels = { nodes: [], key: '' };
/** The halos (marks.js): their layer, a button for each, and how many
 *  frames have placed them (occlusion is asked every few). */
const marks = { root: null, list: [], frame: 0, locked: null };
/** The arrival panel (intro.js). */
let intro = null;
let raycaster = null;
let lastHover = 0;
let sun = null;
let envTarget = null;
/** The glide in progress between stations, or null. */
let glide = null;
/** The point the shared pan part turns and tilts the camera about. */
const viewAim = { x: 0, y: 0, z: 0 };
/** The camera's rotation and lens as last drawn (lookChanged). */
const lastLook = { values: null };

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

    updateLoadingStatus('Opening the studio…', 40);
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
    // A FIRST VISIT ARRIVES TO THE EXAMPLE HOME (PRD 8.2). Only when nothing
    // is saved at all, and it is not saved until the visitor changes
    // something, so clearing it once clears it for good.
    if (loaded.status === 'fresh') {
        const seeded = withExample(state.doc, CONFIG, now(), null);
        if (!seeded.error) state.doc = seeded.doc;
    }
    state.saved = loaded.status === 'restored';
    // A RETURNING VISITOR ARRIVES TO THEIR OWN HOME (PRD 8.6): the one open
    // when they left, else their latest (intro.js arrivalId).
    state.doc = setSettings(state.doc, { activeId: arrivalId(state.doc) }).doc;
    history = createHistory();

    updateLoadingStatus('Turning on the lights…', 75);
    initForms(CONFIG);
    setupEventListeners();
    refresh();
    loadPrices();
    openPhotos();

    // Build the shaders now, behind the loading screen, rather than on the
    // first frame where they would freeze the studio the moment it appears
    // (shared warmup part).
    updateLoadingStatus('Preparing the view…', 95);
    await warmShaders(renderer, [{ scene, camera }]);

    updateLoadingStatus('Ready', 100);
    setTimeout(() => {
        const loading = el('loading-screen');
        if (loading) loading.classList.add('hidden');
        state.loaded = true;
        // EVERY .ui-float IS display:none UNTIL THIS LINE.
        document.querySelectorAll('.ui-float').forEach((node) => node.classList.add('visible'));
        const places = el('prop-panel');
        if (places) places.hidden = false;
        if (intro) intro.arrive();
        showBack();
        // The halos' pulse slows once the visitor has had a while to look.
        setTimeout(() => { if (marks.root && marks.root.classList) marks.root.classList.add('is-calm'); }, COACHING.calmSeconds * 1000);
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
        /** Glide to a station: overview, model, menu, board, printer, desk. */
        goTo,
        /** Lift a level out of the house model ('main', 'second'...), or
         *  set it down with null. */
        lift: liftLevel,
        /** Do what a touch point does: overview, desk, model, menu, board,
         *  printer. */
        act: actOn,
        /** The stations there are, and where the camera stands now. */
        stations: () => ({ at: ui.station, all: Object.keys(CONFIG.stations) })
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
    // The sun's shadows through the glass. Nothing in the studio moves, so
    // the map is drawn once and again only when something on the plinth
    // changes (markShadows), never for a glide or a look around.
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
    // Anything the sky dome does not cover (it covers everything) is the
    // pale horizon, never black.
    scene.background = new THREE.Color(CONFIG.street.sky.horizon);

    studio = buildStudio(CONFIG);
    scene.add(studio.group);
    model = buildModel(CONFIG, studio.plinthTop);
    scene.add(model.group);
    prepareFaces();
    street = buildStreet(CONFIG);
    scene.add(street.group);

    const { sun: s, sky, fill, bounce } = CONFIG.light;
    scene.add(new THREE.HemisphereLight(sky.color, sky.ground, sky.intensity));
    // The sun, from the street side, through the glass. Its shadow camera
    // covers the room and no more (CONFIG.light.sun.shadow.reach).
    sun = new THREE.DirectionalLight(s.color, s.intensity);
    sun.position.set(s.position[0], s.position[1], s.position[2]);
    sun.target.position.set(s.target[0], s.target[1], s.target[2]);
    sun.castShadow = true;
    const size = state.mobile ? s.shadow.sizeMobile : s.shadow.size;
    sun.shadow.mapSize.set(size, size);
    const cam = sun.shadow.camera;
    cam.left = -s.shadow.reach;
    cam.right = s.shadow.reach;
    cam.top = s.shadow.reach;
    cam.bottom = -s.shadow.reach;
    cam.near = s.shadow.near;
    cam.far = s.shadow.far;
    sun.shadow.bias = s.shadow.bias;
    sun.shadow.normalBias = s.shadow.normalBias;
    scene.add(sun, sun.target);
    // A soft cool fill from the entrance side, so the faces turned away from
    // the sun (the homes across the street among them) are not left flat.
    const fillLight = new THREE.DirectionalLight(fill.color, fill.intensity);
    fillLight.position.set(fill.position[0], fill.position[1], fill.position[2]);
    scene.add(fillLight);
    // The light off the pale floor, shining up.
    const bounceLight = new THREE.DirectionalLight(bounce.color, bounce.intensity);
    bounceLight.position.set(0.4, -3, 0.3);
    scene.add(bounceLight);

    const pose = poseFor(ui.station, aspect(), CONFIG);
    camera = new THREE.PerspectiveCamera(pose.fov, aspect(), CONFIG.camera.near, CONFIG.camera.far);
    applyPose(pose);
    captureRoom();
}

/**
 * Give the aluminum and the clear-coated stone the studio to reflect: the
 * room captured once from its middle, behind the loading screen. A metal
 * with nothing to reflect renders nearly black.
 */
/** The materials that mirror the room: the studio's metals and stone, and
 *  the model's aluminum roof. */
function reflective() {
    return [...(studio ? studio.shiny : []), ...(model ? model.shiny : [])];
}

function captureRoom() {
    if (!renderer || !studio || !THREE.PMREMGenerator) return;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const middle = CONFIG.light.reflectFrom;
    envTarget = pmrem.fromScene(scene, 0.03, 0.1, CONFIG.camera.far, { position: new THREE.Vector3(middle[0], middle[1], middle[2]) });
    pmrem.dispose();
    for (const m of reflective()) {
        m.envMap = envTarget.texture;
        m.envMapIntensity = m.metalness >= 0.25 ? 1 : 0.6;
        m.needsUpdate = true;
    }
    // The capture spent the shadow map's update on its own first face. The
    // sun has not moved, so the map it drew is the one the studio needs.
}

// ---- The plan board and the menu display -------------------------------------

/** A canvas for each painted face, its texture laid on the face. Where the
 *  browser gives no 2D context the faces keep their plain color. */
function prepareFaces() {
    for (const key of ['board', 'menu']) {
        const size = CONFIG.boards[key];
        const c = document.createElement('canvas');
        c.width = size.width;
        c.height = size.height;
        const ctx = c.getContext && c.getContext('2d');
        if (!ctx) continue;
        const texture = new THREE.CanvasTexture(c);
        texture.colorSpace = THREE.SRGBColorSpace;
        const caps = renderer && renderer.capabilities;
        texture.anisotropy = caps && caps.getMaxAnisotropy ? Math.min(8, caps.getMaxAnisotropy()) : 1;
        const face = studio.faces[key];
        face.material.map = texture;
        face.material.color.set(0xffffff);
        face.material.needsUpdate = true;
        faces[key] = { canvas: c, ctx, texture, key: null };
    }
}

/** Paint a face when, and only when, what it says has changed. */
function paintFace(key, content, draw) {
    const f = faces[key];
    if (!f) return false;
    const next = contentKey(content);
    if (next === f.key) return false;
    f.key = next;
    draw(f.ctx, f.canvas.width, f.canvas.height, content, CONFIG);
    f.texture.needsUpdate = true;
    return true;
}

/** The plan board and the menu display, from the document as it is now. */
function paintFaces() {
    const c = active();
    const board = paintFace('board', boardContent(c, state.sheet), paintBoard);
    const menu = paintFace('menu', menuContent(state.sheet, menuAreaFor(ui.menuArea, c)), paintMenu);
    if (board || menu) requestRender();
}

// ---- The house model ------------------------------------------------------------

/**
 * Lift a level out of the model (null sets it down), and go to the model
 * station to see it. Returns whether the level is one of the home's.
 */
function liftLevel(level) {
    if (!model) return false;
    const was = model.lifted;
    if (!model.lift(level, state.reducedMotion)) return false;
    markShadows();
    if (level && ui.station !== 'model') goTo('model');
    const c = active();
    const name = level ? levelOf(c ? c.serviceType : 'cleaning', level) : null;
    if (level && name) announce(BOARDS.lifted(name.name));
    else if (!level && was) announce(BOARDS.setDown);
    showBack();
    return true;
}

/** Whether the visitor is anywhere but the whole studio: at a station, or
 *  with a level of the model lifted. */
function away() {
    return ui.station !== HOME_STATION || Boolean(model && model.lifted);
}

/**
 * Back out of whatever the camera is close to (QA, 2026-10-13: "once I
 * click on a floor of the model house it's hard to exit out"): a lifted
 * level is set down, and the camera glides back to the whole studio. One
 * step, by the Back to the studio button, Escape, the 1 key, or a tap on
 * nothing in particular.
 */
function backToStudio() {
    if (model && model.lifted) liftLevel(null);
    if (ui.station !== HOME_STATION) goTo(HOME_STATION);
    showBack();
    return true;
}

/** The Back to the studio button, shown whenever there is somewhere to come back from. */
function showBack() {
    const b = el('ws-back');
    if (b) b.hidden = !(state.loaded && away());
}

/**
 * The names of the lifted level's rooms, each over its tile, wherever the
 * camera is. Called before every frame that is drawn, so they follow a
 * glide, a look around and the lift itself. Rebuilt only when the rooms
 * change, moved otherwise.
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
        if (level) list.setAttribute('aria-label', BOARDS.roomsOn(level.name));
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
        v.set(l.point[0], l.point[1], l.point[2]).project(camera);
        const x = Math.round(((v.x + 1) / 2) * width);
        const y = Math.round(((1 - v.y) / 2) * height);
        node.hidden = !(v.z > -1 && v.z < 1);
        node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -140%)`;
    });
}

// ---- The touch points -------------------------------------------------------------

/** Whether the visitor has a checklist of their own (not the example). */
function hasOwn() {
    return state.doc.checklists.some((c) => isLive(c) && !c.sample);
}

/**
 * Note that a touch point has been used, by any route, so its halo retires
 * (marks.js). Kept in the document's settings, and saved with it, except on
 * a first visit whose example nobody has changed yet: that waits for the
 * next real change, which saves it along with everything else.
 */
function noteUsed(key) {
    const bits = state.doc.settings.coached || 0;
    const next = withUsed(bits, key);
    if (next === bits) return false;
    state.doc = setSettings(state.doc, { coached: next }).doc;
    if (state.saved) save();
    if (intro) intro.setMarks(marksDue().length > 0);
    marks.frame = 0;
    requestRender();
    return true;
}

/**
 * What a touch point does, however it was reached: a tap on it, a tap on
 * its halo, its row in the places list, or its key. The camera goes to it,
 * and what it opens opens over the studio.
 *
 *   overview  the whole studio
 *   desk      the concierge: Start your own, or My checklists once the
 *             visitor has one
 *   model     a tap on a level lifts it, a tap on the lifted level opens
 *             its rooms; with no level (a halo, a row, a key) the next level
 *             up lifts, and after the top one the model goes back together
 *   menu      the service menu
 *   board     the checklist in full
 *   printer   prints the checklist
 */
function actOn(key, { level = null } = {}) {
    if (!state.loaded || !TOUCH.some((t) => t.key === key)) return false;
    const c = active();
    noteUsed(key);
    switch (key) {
    case 'overview':
        backToStudio();
        break;
    case 'desk':
        goTo('desk');
        if (hasOwn()) openMine();
        else startOwn();
        break;
    case 'model':
        goTo('model');
        if (!c) startOwn();
        else if (level && level === model.lifted) openLevel(level);
        else liftLevel(level || nextLevel(model.levels(), model.lifted));
        break;
    case 'menu':
        goTo('menu');
        openMenu();
        break;
    case 'board':
        goTo('board');
        if (c) openChecklistView();
        else startOwn();
        break;
    case 'printer':
        goTo('printer');
        printChecklist();
        break;
    default:
        return false;
    }
    return true;
}

/** A lifted level's rooms: the checklist, showing that level only. */
function openLevel(level) {
    ui.filter = `level:${level}`;
    openChecklistView();
}

/** The printer: the checklist, printed (the print stylesheet sends only the
 *  checklist to paper). Until it has a task there is nothing to print. */
function printChecklist() {
    const c = active();
    if (!c || !liveItems(c).length) {
        announce(STUDIO.printerEmpty);
        toast(STUDIO.printerEmpty);
        return false;
    }
    openChecklistView();
    if (typeof window.print === 'function') window.print();
    return true;
}

/** The example on the plinth, its main floor lifted to show its rooms. */
function exploreExample() {
    const example = state.doc.checklists.find((c) => isLive(c) && c.sample);
    if (!example) return false;
    if (!active() || active().id !== example.id) openChecklist(example.id);
    const levels = model.levels();
    liftLevel(levels.includes('main') ? 'main' : levels[0]);
    return true;
}

/** What is under a point on the canvas: `{ key, level }`, or null. The
 *  first thing shown that the ray meets decides, so a wall in front of the
 *  menu is a wall. */
function pickAt(clientX, clientY) {
    if (!camera || !studio || !model) return null;
    if (!raycaster) raycaster = new THREE.Raycaster();
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
        ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const pick = firstPick(raycaster.intersectObjects([studio.group, model.group], true));
    if (!pick) return null;
    return { key: pick.key, level: pick.key === 'model' ? model.levelOfHit(pick.hit) : null };
}

/** A tap on the studio: the arrival panel steps down, and whatever was
 *  tapped answers. Nothing answers while a card is open. */
function handleSceneTap(clientX, clientY) {
    if (!state.loaded || anyOpen()) return null;
    if (intro) intro.collapse();
    const hit = pickAt(clientX, clientY);
    if (!hit) {
        // A tap on nothing in particular (the floor, a wall, the street)
        // steps back out to the whole studio.
        if (away()) backToStudio();
        return null;
    }
    actOn(hit.key, { level: hit.level });
    return hit.key;
}

// ---- The halos ---------------------------------------------------------------------

/** A button for each touch point with a halo (marks.js USED), its ring
 *  pulsing in CSS, placed over its anchor every drawn frame. */
function buildMarks(signal) {
    const root = el('ws-marks');
    if (!root || !studio) return;
    clear(root);
    const anchors = anchorsFor(CONFIG);
    marks.root = root;
    marks.list = TOUCH.filter((t) => t.key !== 'overview').map((t) => {
        const btn = h('button', { type: 'button', className: 'ws-mark', attrs: { 'aria-label': STUDIO.halos[t.key] } }, [h('span', { className: 'ws-mark-ring' })]);
        btn.hidden = true;
        btn.addEventListener('click', () => {
            if (intro) intro.collapse();
            actOn(t.key);
        }, { signal });
        root.appendChild(btn);
        return { key: t.key, btn, anchor: t.key === 'model' ? () => model.anchor() : () => anchors[t.key], at: '', occluded: false };
    });
}

/** Whether something in the studio stands between the eye and a halo,
 *  other than its own thing. */
function markHidden(m, point) {
    if (!raycaster) raycaster = new THREE.Raycaster();
    return hiddenFrom(raycaster, camera.position, point, [studio.group, model.group], m.key);
}

/**
 * Put each halo over its thing, or out of sight: when it has retired or
 * is not yet due, while a card is open, when its thing is off the frame,
 * and when something stands in front of it (asked every few frames).
 */
/** The halos due now (marks.js), whatever the camera can see. */
function marksDue() {
    const c = active();
    const own = Boolean(c && !c.sample);
    return marksShown(state.doc.settings.coached || 0, { own, tasks: own && liveItems(c).length > 0 });
}

function updateMarks() {
    if (!marks.root || !camera) return;
    const shown = new Set(state.loaded ? marksDue() : []);
    const quiet = lookLocked();
    marks.root.hidden = quiet || !shown.size;
    const askOcclusion = marks.frame % 20 === 0;
    marks.frame++;
    if (marks.root.hidden) return;
    camera.updateMatrixWorld();
    const W = window.innerWidth || 1;
    const H = window.innerHeight || 1;
    const p = new THREE.Vector3();
    for (const m of marks.list) {
        let on = shown.has(m.key);
        let x = 0;
        let y = 0;
        if (on) {
            const a = m.anchor();
            p.set(a[0], a[1], a[2]);
            if (askOcclusion) m.occluded = markHidden(m, p.clone());
            p.project(camera);
            on = onScreen(p) && !m.occluded;
            x = ((p.x + 1) / 2) * W;
            y = ((1 - p.y) / 2) * H;
        }
        if (m.btn.hidden !== !on) m.btn.hidden = !on;
        if (on) {
            const at = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
            if (at !== m.at) {
                m.btn.style.transform = at;
                m.at = at;
            }
        }
    }
}

/** The places list: the keyboard's way to every touch point (the shared
 *  proplist part), each row doing what a tap there does. */
function buildPlaces(signal) {
    installPropList({
        list: el('prop-list'),
        items: TOUCH.map((t) => ({ id: t.key, label: STUDIO.places[t.key] })),
        onChoose: (key) => {
            if (anyOpen()) return;
            if (intro) intro.collapse();
            actOn(key);
        },
        exitTo: () => (intro && intro.open ? el('intro-start') : el('bar-mine')),
        signal
    });
}

// ---- Stations and the look ----------------------------------------------------

/** Whether the visitor's look is held still: before the studio is ready,
 *  and while any card is open (each card has the studio behind it). */
function lookLocked() {
    return !state.loaded || anyOpen();
}

/**
 * The drag, wheel, pinch and keys that look around (CONFIG.view.look),
 * through the shared pan part with its buttons hidden (experience.css
 * .no-chrome): the studio owns the zoom (each station composes its own
 * lens), the part the turn and tilt about `viewAim`. A guard on the canvas,
 * registered first, keeps the part out while a card is open.
 */
function setupLook(signal) {
    const stopWhileLocked = (event) => {
        if (lookLocked()) event.stopImmediatePropagation();
    };
    canvas.addEventListener('pointerdown', stopWhileLocked, { signal });
    canvas.addEventListener('wheel', stopWhileLocked, { passive: true, signal });
    const { pan, zoom } = CONFIG.view.look;
    initPortraitControls({
        getCamera: () => camera,
        lookAt: viewAim,
        pan,
        zoom,
        zoomDelegate: {
            onDelta: (d) => setZoom(ui.zoom + d),
            limits: () => ({ atIn: ui.zoom >= zoom.maxIn - 1e-6, atOut: ui.zoom <= -zoom.maxOut + 1e-6 })
        },
        // Hidden, but built: the part answers the up and down arrows with
        // the tilt only where its tilt pair exists.
        tiltButtons: true,
        alwaysOn: true,
        extraClass: 'always-on no-chrome',
        surface: canvas,
        onFirstUse: (kind) => track(`portrait-${kind}`),
        signal
    });
}

/** Zoom to `zoom` doublings (clamped to CONFIG.view.look.zoom), from the
 *  station's own composed lens. */
function setZoom(zoom) {
    const { maxIn, maxOut } = CONFIG.view.look.zoom;
    ui.zoom = Math.min(maxIn, Math.max(-maxOut, zoom));
    if (!camera || !state.pose) return ui.zoom;
    camera.fov = zoomedFov(state.pose.fov, ui.zoom, CONFIG.view.maxFov);
    camera.updateProjectionMatrix();
    requestRender();
    return ui.zoom;
}

/** Whether the camera has turned or zoomed since the last time asked: its
 *  rotation and lens as plain numbers (anything else, as a test's stand-in
 *  camera gives, is never a change). */
function lookChanged() {
    const q = camera.quaternion;
    const values = [q.x, q.y, q.z, q.w, camera.fov];
    if (!values.every((v) => typeof v === 'number' && Number.isFinite(v))) return false;
    const was = lastLook.values;
    lastLook.values = values;
    return !was || values.some((v, i) => v !== was[i]);
}

/** The camera's pose as the visitor now sees it, turned and zoomed: where a
 *  glide to a station starts, so it never snaps back first. */
function lookingPose() {
    const base = state.pose;
    if (!camera || !base) return base;
    const reach = Math.hypot(base.aim[0] - base.eye[0], base.aim[1] - base.eye[1], base.aim[2] - base.eye[2]);
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const eye = camera.position;
    return {
        eye: [eye.x, eye.y, eye.z],
        aim: [eye.x + dir.x * reach, eye.y + dir.y * reach, eye.z + dir.z * reach],
        fov: camera.fov
    };
}

function applyPose(pose) {
    camera.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
    camera.fov = zoomedFov(pose.fov, ui.zoom || 0, CONFIG.view.maxFov);
    viewAim.x = pose.aim[0];
    viewAim.y = pose.aim[1];
    viewAim.z = pose.aim[2];
    camera.aspect = aspect();
    camera.updateProjectionMatrix();
    camera.lookAt(pose.aim[0], pose.aim[1], pose.aim[2]);
    state.pose = pose;
}

/**
 * Move the camera to a station, gliding unless the visitor asked for less
 * motion, in which case it cuts. From the view as the visitor has turned
 * and zoomed it, and the look is spent on the way: each station starts
 * from its composed view. Returns whether the station exists.
 */
function goTo(station) {
    if (!camera || !CONFIG.stations[station]) return false;
    ui.station = station;
    const to = poseFor(station, aspect(), CONFIG);
    const from = lookingPose() || to;
    resetPortraitAim();
    ui.zoom = 0;
    glide = createGlide(from, to, state.reducedMotion ? 0 : CONFIG.view.glideSeconds);
    requestRender();
    showBack();
    return true;
}

function handleResize() {
    if (!renderer || !camera) return;
    resolution.apply();
    if (!glide) applyPose(poseFor(ui.station, aspect(), CONFIG));
    requestRender();
}

// ---- The price sheet --------------------------------------------------------

/** Load the price sheet index.json names, in the background. The studio
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

/** Whether the price sheet allows a choice in an area, for store.js. */
function check(choice, area) {
    return state.sheet ? checkChoice(state.sheet, choice, area) : null;
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
    // The example is on the plinth, not the visitor's own home, so Start
    // your own stays on offer while it is.
    show('bar-new', !c || c.sample);
    show('my-clear-example', hasSamples(state.doc));
    show('bar-checklist', Boolean(c));
    show('bar-room', Boolean(c));
    show('bar-home', Boolean(c));
    show('bar-prefs', Boolean(c));
    const chip = quoteChip(c, state.sheet);
    const quoteBtn = el('hud-quote');
    if (quoteBtn) {
        quoteBtn.hidden = !chip;
        if (chip) quoteBtn.setAttribute('aria-label', chip.spoken);
    }
    const quoteText = el('hud-quote-text');
    if (quoteText) quoteText.textContent = chip ? chip.text : '';
    const undoBtn = el('bar-undo');
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
    if (model && model.show(c)) markShadows();
    paintFaces();
    if (intro) {
        intro.showExplore(hasSamples(state.doc));
        intro.setMarks(marksDue().length > 0);
    }
    marks.frame = 0;
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
    showPresetPreview(state.sheet, room ? room.area : '');
    openCard('room');
}

function submitRoom(event) {
    if (event) event.preventDefault();
    const c = active();
    if (!c) return null;
    const fields = readRoomForm();
    const at = now();
    if (ui.room) {
        const id = ui.room;
        const name = roomName(c.serviceType, { ...c.rooms.find((r) => r.id === id), label: fields.label });
        const result = change((d) => updateRoom(d, c.id, id, { label: fields.label, level: fields.level }, CONFIG, at),
            UI.labels.roomChanged, UI.roomChanged(name));
        if (result.error) showError('room-error', result.error);
        else closeCard('room');
        return result;
    }
    const problem = validateRoom(fields);
    showError('room-error', problem);
    if (problem) return null;
    const presetItems = fields.preset && state.sheet ? presetFor(state.sheet, fields.area) : [];
    const name = roomName(c.serviceType, fields);
    const result = change((d) => addRoom(d, c.id, { level: fields.level, area: fields.area, label: fields.label }, CONFIG, at,
        { check, presetItems }), UI.labels.roomAdded, UI.roomAdded(name, presetItems.length));
    if (result.error) {
        showError('room-error', result.error);
        return result;
    }
    closeCard('room');
    // The new room and its tasks, where the customer can adjust them.
    if (!isOpen('checklist')) openChecklistView();
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
function openTask(roomId, itemId, taskKey = null) {
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
    openCard('task', { onClose: releaseTaskPhotos });
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
    setFocusFallback(() => el('bar-mine'));
    setupLook(signal);
    buildMarks(signal);
    buildPlaces(signal);
    intro = createIntro({
        mobile: state.mobile,
        signal,
        on: {
            start: startOwn,
            explore: exploreExample,
            // While the panel is open the toolbar steps aside.
            change: (open) => {
                const bar = el('ws-bar');
                if (bar && bar.classList) bar.classList.toggle('is-away', open);
            }
        }
    });

    // Taps on the studio, by a click, or on a touch screen by the touch's
    // end (the shared pan part cancels touchstart, so a touch makes no
    // click), and never the end of a drag or a pinch that looked around.
    canvas.addEventListener('click', (event) => {
        if (gestureClaimedTap()) return;
        handleSceneTap(event.clientX, event.clientY);
    }, { signal });
    canvas.addEventListener('touchend', (event) => {
        if (event.cancelable) event.preventDefault();
        if (gestureClaimedTap()) return;
        const touch = event.changedTouches && event.changedTouches[0];
        if (touch) handleSceneTap(touch.clientX, touch.clientY);
    }, { passive: false, signal });
    // A pointer over something that answers a tap says so, asked no more
    // than twenty times a second.
    canvas.addEventListener('pointermove', (event) => {
        if (event.pointerType !== 'mouse' || !state.loaded || anyOpen()) return;
        const t = performance.now();
        if (t - lastHover < 50) return;
        lastHover = t;
        canvas.style.cursor = pickAt(event.clientX, event.clientY) ? 'pointer' : '';
    }, { signal });

    // The places' keys, 1 to 6, from anywhere in the studio but a text
    // field or an open card. Escape sets a lifted level down, or puts the
    // arrival panel away.
    document.addEventListener('keydown', (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const target = event.target;
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || '')) return;
        if (!state.loaded || anyOpen()) return;
        if (event.key === 'Escape') {
            if (away()) {
                event.preventDefault();
                backToStudio();
            } else if (intro && intro.collapse()) {
                event.preventDefault();
            }
            return;
        }
        const key = touchForKey(event.key);
        if (!key) return;
        event.preventDefault();
        if (intro) intro.collapse();
        actOn(key);
    }, { signal });

    const on = (id, type, fn) => { const node = el(id); if (node) node.addEventListener(type, fn, { signal }); };
    on('bar-new', 'click', () => { noteUsed('desk'); startOwn(); });
    on('bar-home', 'click', editHome);
    on('bar-prefs', 'click', openPreferences);
    on('bar-mine', 'click', () => { noteUsed('desk'); openMine(); });
    on('bar-undo', 'click', () => undo());
    on('hud-home', 'click', openMine);
    on('my-new', 'click', startOwn);
    on('my-clear-example', 'click', clearExample);
    on('setup-form', 'submit', submitSetup);
    on('setup-cancel', 'click', () => closeCard('setup'));
    on('setup-household', 'input', () => showHints('setup-household', 'setup-household-hint'));
    on('prefs-form', 'submit', submitPreferences);
    on('prefs-skip', 'click', () => closeCard('preferences'));
    on('bar-checklist', 'click', () => { noteUsed('board'); openChecklistView(); });
    on('bar-room', 'click', () => openRoom(null));
    on('checklist-add-room', 'click', () => openRoom(null));
    on('room-form', 'submit', submitRoom);
    on('room-cancel', 'click', () => closeCard('room'));
    on('room-remove', 'click', removeRoom);
    on('room-area', 'change', () => showPresetPreview(state.sheet, el('room-area').value));
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
    on('ws-back', 'click', backToStudio);
    on('quote-open-checklist', 'click', openChecklistView);
    on('bar-menu', 'click', () => { noteUsed('menu'); openMenu(); });
    on('menu-area', 'change', () => {
        ui.menuArea = el('menu-area').value;
        drawMenu();
        paintFaces();
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

    if (glide) {
        applyPose(glide.step(delta));
        if (glide.done) glide = null;
        state.dirty = true;
    }
    // The visitor's look (setupLook), and a frame when it has turned or
    // zoomed the camera.
    if (camera && !lookLocked()) updatePortraitControls(delta);
    if (camera && lookChanged()) state.dirty = true;
    // A level being lifted or set down, and its shadow with it.
    if (model && model.tick(delta)) markShadows();
    // A card opening or closing hides or brings back the halos, though the
    // studio itself has not changed.
    const locked = lookLocked();
    if (locked !== marks.locked) {
        marks.locked = locked;
        state.dirty = true;
    }

    if (!state.dirty) return;
    state.dirty = false;
    state.frames++;
    placeLabels();
    updateMarks();
    renderer.render(scene, camera);
    state.drewLast = true;
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
        if (status) status.textContent = "This browser can't run the 3D studio. Taking you to the standard site…";
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
    goTo,
    lookLocked,
    markShadows,
    glide: () => glide,
    liftLevel,
    backToStudio,
    reflective,
    actOn,
    pickAt,
    handleSceneTap,
    updateMarks,
    marks: () => marks,
    intro: () => intro,
    noteUsed,
    exploreExample,
    paintFaces,
    placeLabels,
    model: () => model,
    faces: () => faces,
    studio: () => studio,
    street: () => street,
    start,
    stop,
    scene: () => scene,
    camera: () => camera,
    renderer: () => renderer
};
