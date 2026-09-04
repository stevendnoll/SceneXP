// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * store.js - Sunnyvale Jenn Consulting Construction
 *
 * Builds the tenth SceneXP micro-environment, and the third passive one:
 * a bright weekday morning in the home office of Jenn, of Sunnyvale Jenn
 * Consulting. Jenn is a talented entrepreneur and a former colleague of
 * the builder, and consulting is the room's whole story: an operations
 * dashboard on the monitor, a whiteboard of tidy process boxes, a wall
 * clock keeping the visitor's real time. (The rolled yoga mat and
 * exercise ball in the corner are only small visual nods to her
 * pre-consulting past as a yoga teacher.)
 *
 * Jenn sits at her desk facing the doorway, which is exactly where the
 * camera stands (see SVJ_CONFIG.camera): every visitor arrives to find
 * her looking their way, and every so often she pauses her typing to
 * give them a friendly wave. Behind her, the window looks out on the
 * back fence, a couple of trees, and the neighbor's house, and birds
 * swoop down to the fence top and away again, the same little visitors
 * Steve's office gets.
 *
 * The camera never moves in this experience, so the whole room is
 * composed for one fixed viewpoint: the desk and Jenn just left of
 * center, the sunny window over her shoulder to the right, the
 * whiteboard and yoga corner on the left, and the sideboard with its
 * plants on the right. The scene provides all the motion via
 * updateOffice(deltaTime).
 *
 * The room is bright and minimalist on purpose: warm white walls, white
 * trim, a light oak floor, and a handful of green plants. The shared
 * day/night cycle is disabled so the sky holds at noon (main.js still
 * runs the cycle's per-frame pass for the fixed-time sky paint and the
 * shadow-map refresh), and the interior carries the shared lighting
 * rig plus one faux sun shaft angled in through the window.
 *
 * The module keeps the store.js name and its initStore export so the
 * conductor in main.js reads like every other experience's.
 *
 * FLOOR PLAN (viewed from above, the camera at the bottom looking up).
 *
 *   +------------- back wall (window right) -------------+
 *   | [yoga corner]      JENN            [window]        |
 *   |  mat + ball     [desk + chair]        [monstera]   |
 *   | [whiteboard,                                       |
 *   |  left wall]           [rug]      [sideboard + art, |
 *   |                                    right wall]     |
 *   |                                       [snake plant]|
 *   |             (camera, in the doorway)               |
 *   +----------------- front wall (unseen) --------------+
 */

import { getScene } from '../../shared/js/scene-1.0.0.min.js';
import { initWorld, getWorldGroup, registerOutdoorProp } from '../../shared/js/world-1.0.0.min.js';
import { SVJ_CONFIG } from './config.min.js';
import { createPerson } from '../../shared/js/people-1.0.0.min.js';
import { createBackgroundScenery } from '../../shared/js/scenery-1.0.0.min.js';
import { createWall, createWallSegment, createWindowFrame } from '../../shared/js/structures-1.0.0.min.js';
import { createWoodFloorTexture } from '../../shared/js/textures-1.0.0.min.js';
import { createCeilingLights } from '../../shared/js/lighting-1.0.0.min.js';

// Re-exports: main.js keeps importing these from store.min.js (stable import
// block); the implementations live in the shared parts library.
export { updateBackgroundAnimations } from '../../shared/js/scenery-1.0.0.min.js';
export { updateInteriorAmbientLight } from '../../shared/js/lighting-1.0.0.min.js';

// World mesh group (the static room plus everything in it)
let officeGroup = null;

// Visitors who ask for reduced motion get a perfectly still office: Jenn
// holds her typing pose, one bird simply sits on the fence, and the
// monitor shows one steady frame. Matches the reduced-motion handling
// across the site.
const _reducedMotion = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

// ============================================
// LAYOUT
// ============================================
// Everything is composed around Jenn at her desk, facing the fixed camera
// in the doorway on the positive-Z side. All meters. room mirrors
// SVJ_CONFIG.building (the shared lighting rig reads that copy).
const LAYOUT = {
    room: { minX: -3.2, maxX: 3.2, minZ: -3.4, maxZ: 3.0, height: 2.95, wallT: 0.15 },

    // The window: back wall, over Jenn's right shoulder from the camera's
    // seat, wide and low-silled so the fence, the trees, the neighbor's
    // house, and the birds all fit in the glass.
    window: { x: 1.05, width: 1.9, sillY: 0.95, topY: 2.3 },

    // The desk faces the doorway: Jenn behind it looking toward the
    // camera, her gear arranged for her own use (the monitor's back is
    // to the visitor, the way a real desk greets a real doorway).
    desk: { x: -0.55, z: -2.15, w: 1.7, d: 0.75, topY: 0.74 },
    jenn: { x: -0.55, z: -2.68, yaw: 0.19 },
    chairSeatTop: 0.47,

    // The yoga corner, back-left: the rolled mat against the wall, the
    // exercise ball parked beside it. Small visual nods to Jenn's
    // pre-consulting past, kept deliberately out of the spotlight.
    yogaMat: { x: -2.9, z: -3.1 },
    swissBall: { x: -2.3, z: -2.4, r: 0.32 },

    // The whiteboard on the left wall, where the week gets planned.
    whiteboard: { z: -1.0, y: 1.5, w: 1.5, h: 0.95 },

    // The wall clock, hung above the monitor on the back-wall pier and
    // centered between the window casing and the west corner.
    clock: { x: -1.55, y: 2.0, r: 0.17 },

    // The sideboard along the right wall, with the framed art above it.
    sideboard: { x: 2.9, z: 0.3, len: 1.6, d: 0.42, topY: 0.72 },
    art: { y: 1.78, z: [-0.15, 0.75] },

    // The green residents.
    monstera: { x: 2.7, z: -2.95 },
    snakePlant: { x: 2.8, z: 1.6 },

    // The rug under the open floor between the desk and the doorway.
    rug: { x: -0.3, z: 0.2, w: 2.8, d: 2.0 },

    // The ceiling fixture, centered over the main floor.
    ceilingLight: { x: 0, z: -0.6 }
};

// -------------------------------------------------------------------------
// WHO'S WHO
// -------------------------------------------------------------------------
// Jenn: shoulder-length dark brown hair, a blouse in her company's teal,
// slate trousers. A stylized low-poly portrait rather than a likeness,
// with the outfit keyed to the Sunnyvale Jenn Consulting brand colors.
const JENN_LOOK = {
    skinTone: 0xe0b48e,
    hairColor: 0x4a3320,
    hairStyle: 'long',
    shirtColor: 0x2e8b83,     // the brand teal
    pantsColor: 0x39414d,
    eyeColor: 0x37536e
};

// The office palette. Bright and quiet on purpose: warm white paint,
// white trim, light oak, and the logo's teals doing the accenting.
const PALETTE = {
    wallCream: 0xf2ede3,
    trimWhite: 0xf8f6f1,
    floorTint: 0xe6d3b3,      // lifts the shared wood texture to light oak
    ceiling: 0xfbfaf7,
    brandTeal: 0x2e8b83,
    brandDeep: 0x1d4e5f,
    brandMist: 0x8fc7c0,
    leafGreen: 0x3f7d43,
    leafDeep: 0x2d5a27,
    potClay: 0xc98960,
    potWhite: 0xe9e6de,
    deskWood: 0xd8b98c
};

// ============================================
// TEXTURES (procedural, canvas-based)
// ============================================
function makeCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
}

/** Warm white painted wall with a hint of roller texture, so the big
 *  bright planes don't read as one flat sheet. */
function createWallPaintTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f2ede3';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 60; i++) {
        ctx.fillStyle = ['#efe9dd', '#f5f1e8', '#ece6d8'][i % 3];
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(Math.random() * 256, Math.random() * 256, 16 + Math.random() * 28, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** Flat-weave rug: a soft oat field with a simple teal border, the one
 *  patterned thing a minimalist floor allows itself. */
function createRugTexture() {
    const canvas = makeCanvas(512, 384);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#e4ddd0';
    ctx.fillRect(0, 0, 512, 384);

    // Weave: fine alternating rows, barely there
    for (let y = 0; y < 384; y += 4) {
        ctx.fillStyle = y % 8 ? 'rgba(196, 188, 172, 0.35)' : 'rgba(238, 233, 223, 0.4)';
        ctx.fillRect(0, y, 512, 2);
    }

    // The teal border, inset like a stitched band
    ctx.strokeStyle = '#2e8b83';
    ctx.lineWidth = 14;
    ctx.strokeRect(22, 22, 512 - 44, 384 - 44);
    ctx.strokeStyle = '#8fc7c0';
    ctx.lineWidth = 4;
    ctx.strokeRect(44, 44, 512 - 88, 384 - 88);

    return new THREE.CanvasTexture(canvas);
}

/** Cedar fence texture: a tile of four flat vertical planks, each ~4.5 in
 *  wide, with per-plank tone shifts, soft grain, and a thin gap shadow
 *  between boards. Tiled along the fence's length. (The same treatment
 *  Steve's office window gets; good fences make good tributes.) */
function createCedarFenceTexture() {
    const canvas = makeCanvas(256, 512);
    const ctx = canvas.getContext('2d');

    const tones = ['#9b6a43', '#a5714a', '#8f6240', '#a3754e'];
    for (let p = 0; p < 4; p++) {
        ctx.fillStyle = tones[p];
        ctx.fillRect(p * 64, 0, 64, 512);

        for (let g = 0; g < 9; g++) {
            ctx.strokeStyle = g % 2 ? 'rgba(122, 80, 48, 0.35)' : 'rgba(180, 132, 90, 0.4)';
            ctx.lineWidth = 1 + Math.random() * 1.5;
            const x = p * 64 + 4 + Math.random() * 56;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.bezierCurveTo(x + Math.random() * 6 - 3, 170, x + Math.random() * 6 - 3, 340, x + Math.random() * 4 - 2, 512);
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(40, 26, 14, 0.85)';
        ctx.fillRect(p * 64 + 62, 0, 2, 512);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** Warm gray lap siding for the neighbor's house: horizontal courses
 *  with a shadow under each lap and slight per-course tone drift. */
function createSidingTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    const courses = 8;
    const ch = 256 / courses;
    const tones = ['#9aa0a6', '#a2a8ad', '#93999f', '#9ea4a9'];
    for (let c = 0; c < courses; c++) {
        ctx.fillStyle = tones[c % tones.length];
        ctx.fillRect(0, c * ch, 256, ch);
        ctx.fillStyle = 'rgba(52, 58, 64, 0.5)';
        ctx.fillRect(0, c * ch, 256, 3);
        ctx.fillStyle = 'rgba(226, 230, 233, 0.16)';
        ctx.fillRect(0, c * ch + ch - 2, 256, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** Charcoal asphalt shingles: dark courses with staggered tab shadows. */
function createShingleTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#24262a';
    ctx.fillRect(0, 0, 256, 256);

    const ch = 32;
    for (let c = 0; c < 8; c++) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, c * ch, 256, 3);
        const offset = (c % 2) * 16;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        for (let x = offset; x < 256; x += 32) {
            ctx.fillRect(x, c * ch + 3, 2, ch - 3);
        }
        ctx.fillStyle = 'rgba(78, 82, 90, 0.12)';
        ctx.fillRect((c * 53) % 220, c * ch + 8, 26, 12);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

// ============================================
// SHARED MATERIALS
// ============================================
const whiteTrim = new THREE.MeshStandardMaterial({ color: PALETTE.trimWhite, roughness: 0.7, metalness: 0.0 });
const matteBlack = new THREE.MeshStandardMaterial({ color: 0x1c1b1f, roughness: 0.7, metalness: 0.1 });
const brushedMetal = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.35, metalness: 0.7 });
const deskWoodMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.deskWood, roughness: 0.55, metalness: 0.02 });
const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9, metalness: 0.0 });
const foliageMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.leafDeep, roughness: 0.8, metalness: 0.0 });
const leafMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.leafGreen, roughness: 0.65, metalness: 0.0, side: THREE.DoubleSide
});

// ============================================
// ANIMATION REGISTRIES (filled during build, driven by updateOffice)
// ============================================
let jennRig = null;      // { group, arms: [{arm, elbow, side, phase}], rightArm, baseYaw, greetYaw, mode, modeT, workDur }
let monitor = null;      // { canvas, ctx, texture, cursorOn, blinkT }
let wallClock = null;    // { hour, minute, second } hand pivots on the wall clock
let fenceBirds = [];     // the little visitors on the fence outside

// ============================================
// INITIALIZE THE OFFICE WORLD
// ============================================
export function initStore() {
    const scene = getScene();
    if (!scene) {
        return;
    }

    // The shared world context owns the root group (added to the scene).
    officeGroup = initWorld(SVJ_CONFIG);

    createRoom();             // floor, walls, window, curtains, ceiling, baseboards
    createRug();              // the flat-weave rug with the teal border
    createDeskSetup();        // Jenn's desk: monitor, laptop, keyboard, mug, and more
    createDeskChair();        // the task chair she is seated in
    createJenn();             // the consultant herself, mid-workday
    createYogaCorner();       // the rolled mat and the exercise ball
    createWhiteboard();       // the week, in tidy marker boxes
    createWallClock();        // real local time, in the company colors
    createSideboard();        // the low console, its books, and the framed art
    createPlants();           // the monstera, the snake plant (the pothos rides the sideboard)
    createOfficeLighting();   // shared interior rig wearing a flush-mount dome
    createWindowSunlight();   // the faux sun shaft angled in through the glass
    createExterior();         // lawn, fence, trees, neighbor's house, and the birds

    // Background scenery: the drifting clouds the window frames.
    createBackgroundScenery();

    // The monitor shows a steady dashboard frame even before the update
    // loop runs (and forever, under prefers-reduced-motion).
    drawMonitorFrame(true);

    return officeGroup;
}

// ============================================
// THE ROOM: FLOOR, WALLS, WINDOW, CEILING
// ============================================
function createRoom() {
    const roomGroup = new THREE.Group();
    roomGroup.name = 'homeOffice';

    const R = LAYOUT.room;
    const win = LAYOUT.window;
    const { height, wallT } = R;
    const width = R.maxX - R.minX;
    const depth = R.maxZ - R.minZ;
    const cx = (R.minX + R.maxX) / 2;
    const cz = (R.minZ + R.maxZ) / 2;

    // --- Floor: light oak. The shared wood texture leans light already;
    // the warm tint lifts it the rest of the way to a Scandinavian oak. ---
    const floorTexture = createWoodFloorTexture();
    floorTexture.repeat.set(3.2, 3.2);
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        new THREE.MeshStandardMaterial({
            map: floorTexture, color: PALETTE.floorTint, roughness: 0.55, metalness: 0.03
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    floor.name = 'floor';
    roomGroup.add(floor);

    // --- Ceiling: bright white, a thin slab rather than a plane so it
    // reliably casts shadow and the frozen noon sun cannot blast through
    // the roof. ---
    const ceiling = new THREE.Mesh(
        new THREE.BoxGeometry(width + wallT * 2, 0.12, depth + wallT * 2),
        new THREE.MeshStandardMaterial({ color: PALETTE.ceiling, roughness: 0.9, metalness: 0.0 })
    );
    ceiling.position.set(cx, height + 0.06, cz);
    ceiling.castShadow = true;
    roomGroup.add(ceiling);

    const wallMaterial = new THREE.MeshStandardMaterial({
        map: createWallPaintTexture(), roughness: 0.85, metalness: 0.0
    });

    // --- East and west walls: single slabs the full depth of the room
    // (the shared builders attach themselves to the world group). ---
    createWall(depth, height, wallT, R.minX, height / 2, cz, Math.PI / 2, wallMaterial, 'westWall');
    createWall(depth, height, wallT, R.maxX, height / 2, cz, Math.PI / 2, wallMaterial, 'eastWall');

    // --- Front wall (behind the camera): solid. The doorway the visitor
    // "stands in" reads from the composition, not the geometry; the pan
    // row cannot turn far enough to see this wall. ---
    createWallSegment(width, height, wallT, cx, height / 2, R.maxZ, wallMaterial, 'frontWall');

    // --- North (back) wall: solid piers around the window opening ---
    const nz = R.minZ;   // wall centerline
    const winLeft = win.x - win.width / 2;
    const winRight = win.x + win.width / 2;
    [
        { from: R.minX, to: winLeft, name: 'northPierWest' },
        { from: winRight, to: R.maxX, name: 'northPierEast' }
    ].forEach((p) => {
        createWallSegment(p.to - p.from, height, wallT, (p.from + p.to) / 2, height / 2, nz, wallMaterial, p.name);
    });

    // Bands under and over the window
    createWallSegment(win.width, win.sillY, wallT, win.x, win.sillY / 2, nz, wallMaterial, 'windowSillBand');
    const headH = height - win.topY;
    createWallSegment(win.width, headH, wallT, win.x, win.topY + headH / 2, nz, wallMaterial, 'windowHead');

    // --- Window glass, frame, muntin, and sill ledge. The pane and the
    // white woodwork nearest a fingertip live in one registered group, so
    // a tap on the glass tells the story of the view. ---
    const winH = win.topY - win.sillY;
    const winCenterY = (win.topY + win.sillY) / 2;
    const innerN = nz + wallT / 2;   // the wall's room-side face
    const windowGroup = new THREE.Group();
    windowGroup.name = 'officeWindow';
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0xcfe6f2, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1,
        side: THREE.DoubleSide
    });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(win.width - 0.08, winH - 0.08), glassMaterial);
    pane.position.set(win.x, winCenterY, nz);
    windowGroup.add(pane);
    const muntin = new THREE.Mesh(new THREE.BoxGeometry(0.04, winH - 0.08, 0.05), whiteTrim);
    muntin.position.set(win.x, winCenterY, innerN + 0.02);
    windowGroup.add(muntin);
    const sillLedge = new THREE.Mesh(new THREE.BoxGeometry(win.width + 0.12, 0.035, 0.11), whiteTrim);
    sillLedge.position.set(win.x, win.sillY - 0.017, innerN + 0.04);
    windowGroup.add(sillLedge);
    roomGroup.add(registerOutdoorProp(windowGroup, 'window'));
    // The frame trim attaches itself to the world group (shared builder).
    createWindowFrame(win.width, winH, win.x, winCenterY, innerN + 0.02, whiteTrim, 'officeWindow');

    // --- Curtains: a slim white rod and two soft linen panels hanging
    // open at either side, half on the casing and half on the wall, so
    // the glass and its view stay clear. ---
    const rodY = win.topY + 0.12;
    const rodZ = innerN + 0.09;
    const rodLen = win.width + 0.44;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, rodLen, 10), whiteTrim);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(win.x, rodY, rodZ);
    roomGroup.add(rod);
    // Mist-teal fabric (the light band of the company waters): enough
    // color to read as curtains against the cream walls, still soft
    // enough for the bright minimalist room.
    const linen = new THREE.MeshStandardMaterial({ color: PALETTE.brandMist, roughness: 0.92, metalness: 0.0 });
    const curtainBottom = win.sillY - 0.12;
    const curtainH = (rodY - 0.02) - curtainBottom;
    [-1, 1].forEach((side) => {
        const finial = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), whiteTrim);
        finial.position.set(win.x + side * (rodLen / 2 + 0.02), rodY, rodZ);
        roomGroup.add(finial);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.26, curtainH, 0.07), linen);
        panel.position.set(win.x + side * (win.width / 2 + 0.02), curtainBottom + curtainH / 2, rodZ - 0.005);
        panel.name = side < 0 ? 'curtainWest' : 'curtainEast';
        roomGroup.add(panel);
    });

    // --- Baseboards: white molding along the floor, one run per wall,
    // measured corner to corner so the trim connects all the way around.
    // (No door and no closet in this room, so no cutouts.) ---
    const baseH = 0.1;
    const baseD = 0.045;
    const baseLip = 0.04;
    const innerE = R.maxX - wallT / 2;
    const innerW = R.minX + wallT / 2;
    const innerS = R.maxZ - wallT / 2;
    const addBaseboard = (name, alongX, at, from, to) => {
        const geom = alongX
            ? new THREE.BoxGeometry(to - from, baseH, baseD)
            : new THREE.BoxGeometry(baseD, baseH, to - from);
        const board = new THREE.Mesh(geom, whiteTrim);
        board.position.set(alongX ? (from + to) / 2 : at, baseH / 2, alongX ? at : (from + to) / 2);
        board.name = name;
        roomGroup.add(board);
    };
    addBaseboard('baseNorth', true, innerN + baseLip, innerW, innerE);
    addBaseboard('baseSouth', true, innerS - baseLip, innerW, innerE);
    addBaseboard('baseWest', false, innerW + baseLip, innerN + baseLip + baseD, innerS - baseLip - baseD);
    addBaseboard('baseEast', false, innerE - baseLip, innerN + baseLip + baseD, innerS - baseLip - baseD);

    officeGroup.add(roomGroup);
}

// ============================================
// THE RUG
// ============================================
function createRug() {
    const G = LAYOUT.rug;
    const rugGroup = new THREE.Group();
    rugGroup.name = 'rug';

    const rug = new THREE.Mesh(
        new THREE.BoxGeometry(G.w, 0.012, G.d),
        new THREE.MeshStandardMaterial({ map: createRugTexture(), roughness: 0.95, metalness: 0.0 })
    );
    rug.position.set(G.x, 0.006, G.z);
    rug.receiveShadow = true;
    rugGroup.add(rug);

    officeGroup.add(registerOutdoorProp(rugGroup, 'rug'));
}

// ============================================
// THE DESK AND ITS GEAR
// ============================================
/** Paint the operations dashboard into the monitor's canvas: a header,
 *  this week's checklist with teal ticks, a little bar chart trending
 *  the right way, and a cursor blinking in the notes line. The screen
 *  faces Jenn, so visitors mostly meet it while leaning in from the
 *  side, and it needs to read at a glance. */
function drawMonitor(ctx, cursorOn) {
    const W = 512, H = 300;

    ctx.fillStyle = '#f5f4f0';
    ctx.fillRect(0, 0, W, H);

    // Header band in the brand teal
    ctx.fillStyle = '#2e8b83';
    ctx.fillRect(0, 0, W, 44);
    ctx.fillStyle = '#f5f4f0';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('CLIENT OPERATIONS  •  THIS WEEK', 18, 29);

    // The checklist, mostly done (of course it is)
    const items = [
        { text: 'Map the intake workflow', done: true },
        { text: 'Simplify the invoicing steps', done: true },
        { text: 'Automate the weekly reports', done: true },
        { text: 'Document the handoffs', done: false }
    ];
    ctx.font = '17px Arial';
    items.forEach((item, i) => {
        const y = 78 + i * 34;
        ctx.strokeStyle = '#1d4e5f';
        ctx.lineWidth = 2;
        ctx.strokeRect(20, y - 15, 18, 18);
        if (item.done) {
            ctx.strokeStyle = '#2e8b83';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(23, y - 6);
            ctx.lineTo(28, y - 1);
            ctx.lineTo(36, y - 13);
            ctx.stroke();
        }
        ctx.fillStyle = item.done ? '#6d7a80' : '#26343a';
        ctx.fillText(item.text, 50, y);
    });

    // A bar chart trending up and to the right, the consultant's favorite
    // direction
    const bars = [22, 30, 27, 38, 46, 58];
    bars.forEach((h, i) => {
        ctx.fillStyle = i === bars.length - 1 ? '#2e8b83' : '#8fc7c0';
        ctx.fillRect(330 + i * 28, 210 - h, 20, h);
    });
    ctx.strokeStyle = '#b9c4c8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(325, 212);
    ctx.lineTo(505, 212);
    ctx.stroke();
    ctx.fillStyle = '#6d7a80';
    ctx.font = '13px Arial';
    ctx.fillText('hours saved / week', 341, 232);

    // The notes line Jenn is typing into, cursor and all
    ctx.fillStyle = '#26343a';
    ctx.font = '16px Arial';
    ctx.fillText('Notes: fewer steps, calmer weeks', 20, 262);
    if (cursorOn) {
        const w = ctx.measureText('Notes: fewer steps, calmer weeks').width;
        ctx.fillRect(24 + w, 248, 2, 18);
    }
}

/** Repaint the monitor texture (cursorOn drives the blink). */
function drawMonitorFrame(cursorOn) {
    if (!monitor) return;
    monitor.cursorOn = cursorOn;
    drawMonitor(monitor.ctx, cursorOn);
    monitor.texture.needsUpdate = true;
}

function createDeskSetup() {
    const D = LAYOUT.desk;
    const desk = new THREE.Group();
    desk.name = 'desk';

    // The top: light oak with softened proportions, on slim white legs.
    const top = new THREE.Mesh(new THREE.BoxGeometry(D.w, 0.04, D.d), deskWoodMaterial);
    top.position.set(D.x, D.topY - 0.02, D.z);
    top.castShadow = true;
    top.receiveShadow = true;
    desk.add(top);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, D.topY - 0.04, 0.05), whiteTrim);
        leg.position.set(D.x + sx * (D.w / 2 - 0.07), (D.topY - 0.04) / 2, D.z + sz * (D.d / 2 - 0.07));
        desk.add(leg);
    });
    // A slim modesty panel on the visitor's side, so the desk reads
    // finished from the doorway
    const panel = new THREE.Mesh(new THREE.BoxGeometry(D.w - 0.2, 0.34, 0.02), whiteTrim);
    panel.position.set(D.x, D.topY - 0.24, D.z + D.d / 2 - 0.06);
    desk.add(panel);

    // The notebook and pen on the visitor's side of the top, out past the
    // monitor: paper for thinking, screens for doing
    const notebook = new THREE.Mesh(
        new THREE.BoxGeometry(0.19, 0.015, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x1d4e5f, roughness: 0.6 })
    );
    notebook.position.set(D.x - 0.65, D.topY + 0.008, D.z + 0.23);
    notebook.rotation.y = -0.15;
    desk.add(notebook);
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 6), brushedMetal);
    pen.rotation.set(Math.PI / 2, 0, 0.5);
    pen.position.set(D.x - 0.5, D.topY + 0.01, D.z + 0.33);
    desk.add(pen);

    // Her phone, face up and mercifully quiet, between the two screens
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.008, 0.155), matteBlack);
    phone.position.set(D.x + 0.2, D.topY + 0.006, D.z + 0.27);
    phone.rotation.y = 0.3;
    desk.add(phone);

    // A tiny potted succulent on the desk's far corner
    desk.add(createSucculent(D.x + 0.72, D.topY, D.z - 0.22));

    officeGroup.add(registerOutdoorProp(desk, 'desk'));

    // ---- The monitor: its own prop, angled for Jenn's eyes ----
    const monitorGroup = new THREE.Group();
    monitorGroup.name = 'monitor';
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.015, 14), brushedMetal);
    foot.position.y = 0.008;
    monitorGroup.add(foot);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.03), brushedMetal);
    stem.position.set(0, 0.11, 0.02);
    monitorGroup.add(stem);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.37, 0.03), matteBlack);
    bezel.position.set(0, 0.36, 0);
    bezel.castShadow = true;
    monitorGroup.add(bezel);

    const canvas = makeCanvas(512, 300);
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.58, 0.33),
        new THREE.MeshBasicMaterial({ map: texture })
    );
    screen.position.set(0, 0.36, 0.017);
    monitorGroup.add(screen);
    monitor = { canvas, ctx, texture, cursorOn: true, blinkT: 0 };

    // On the visitor's half of the desk, out to Jenn's right in frame,
    // screen turned back to face her (its back politely toward the
    // doorway). The spot is chosen so the bezel stays clear of the
    // camera-to-Jenn sightline: her face reads over its right edge.
    monitorGroup.position.set(D.x - 0.4, D.topY, D.z + 0.15);
    monitorGroup.rotation.y = Math.PI - 0.45;
    officeGroup.add(registerOutdoorProp(monitorGroup, 'monitor'));

    // ---- The laptop, open beside the monitor ----
    const laptop = new THREE.Group();
    laptop.name = 'laptop';
    const aluminum = new THREE.MeshStandardMaterial({ color: 0xc7c9cc, roughness: 0.4, metalness: 0.55 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.014, 0.21), aluminum);
    base.position.y = 0.007;
    laptop.add(base);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.008), aluminum);
    lid.position.set(0, 0.095, -0.135);
    lid.rotation.x = 0.35;   // open past vertical, leaned back
    laptop.add(lid);
    const lcd = new THREE.Mesh(
        new THREE.PlaneGeometry(0.28, 0.18),
        new THREE.MeshBasicMaterial({ color: 0xdfe8ea })
    );
    lcd.position.set(0, 0.095, -0.1305);
    lcd.rotation.x = 0.35;
    laptop.add(lcd);
    // On the visitor's half to Jenn's left in frame, open toward her
    // (the lid's screen faces her seat, hinge toward the doorway)
    laptop.position.set(D.x + 0.57, D.topY, D.z + 0.13);
    laptop.rotation.y = Math.PI + 0.55;
    officeGroup.add(registerOutdoorProp(laptop, 'laptop'));

    // ---- Keyboard and mouse on Jenn's side, under her hands ----
    // Jenn's whole body is yawed toward the doorway (LAYOUT.jenn.yaw),
    // which swings her typing reach sideways by sin(yaw) times the reach
    // distance. The keyboard sits square in front of her chest along that
    // yawed axis (and shares her yaw) so BOTH hands land on the keys
    // instead of one drifting onto the desk beside it.
    const kbZ = D.z - 0.12;
    const kbX = D.x + Math.sin(LAYOUT.jenn.yaw) * (kbZ - LAYOUT.jenn.z);
    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.012, 0.13), matteBlack);
    keyboard.position.set(kbX, D.topY + 0.006, kbZ);
    keyboard.rotation.y = LAYOUT.jenn.yaw;
    officeGroup.add(keyboard);
    const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), matteBlack);
    mouse.scale.set(1, 0.55, 1.4);
    // A hand's width past the keyboard's right end, along the same yawed row
    mouse.position.set(kbX + 0.27, D.topY + 0.012, kbZ - 0.04);
    mouse.rotation.y = LAYOUT.jenn.yaw;
    officeGroup.add(mouse);

    // ---- The tea mug, in the brand teal, close at hand ----
    const mugGroup = new THREE.Group();
    mugGroup.name = 'mug';
    const mugMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.brandTeal, roughness: 0.35 });
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.034, 0.095, 14), mugMaterial);
    mug.position.y = 0.048;
    mugGroup.add(mug);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 6, 12, Math.PI), mugMaterial);
    handle.position.set(0.04, 0.052, 0);
    handle.rotation.z = -Math.PI / 2;
    mugGroup.add(handle);
    const tea = new THREE.Mesh(
        new THREE.CylinderGeometry(0.033, 0.033, 0.006, 12),
        new THREE.MeshStandardMaterial({ color: 0x9c6b34, roughness: 0.25 })
    );
    tea.position.y = 0.088;
    mugGroup.add(tea);
    // A generous invisible tap target around the whole mug (the gavin
    // mantis-perch trick): opacity 0 renders nothing but still answers
    // the raycast, so fingertips get a fist-sized target.
    const tapProxy = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 0.16, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    tapProxy.position.y = 0.07;
    mugGroup.add(tapProxy);
    // Beside the keyboard on Jenn's side, an easy reach for her left hand
    mugGroup.position.set(D.x - 0.33, D.topY, D.z - 0.15);
    officeGroup.add(registerOutdoorProp(mugGroup, 'mug'));
}

/** A tiny succulent in a white pot, for the desk corner. */
function createSucculent(x, y, z) {
    const plant = new THREE.Group();
    const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.028, 0.05, 10),
        new THREE.MeshStandardMaterial({ color: PALETTE.potWhite, roughness: 0.7 })
    );
    pot.position.y = 0.025;
    plant.add(pot);
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.045, 5), leafMaterial);
        leaf.position.set(Math.cos(a) * 0.016, 0.065, Math.sin(a) * 0.016);
        leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        plant.add(leaf);
    }
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.04, 5), leafMaterial);
    crown.position.y = 0.075;
    plant.add(crown);
    plant.position.set(x, y, z);
    return plant;
}

// ============================================
// THE TASK CHAIR
// ============================================
function createDeskChair() {
    const J = LAYOUT.jenn;
    const chair = new THREE.Group();
    chair.name = 'deskChair';

    // Five-star base with casters
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.035), brushedMetal);
        arm.position.set(Math.cos(a) * 0.12, 0.035, Math.sin(a) * 0.12);
        arm.rotation.y = -a;
        chair.add(arm);
        const caster = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), matteBlack);
        caster.position.set(Math.cos(a) * 0.22, 0.025, Math.sin(a) * 0.22);
        chair.add(caster);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), brushedMetal);
    post.position.y = 0.2;
    chair.add(post);

    // Seat and backrest in a soft teal-gray weave
    const weave = new THREE.MeshStandardMaterial({ color: 0x5f8a86, roughness: 0.85, metalness: 0.0 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.42), weave);
    seat.position.y = LAYOUT.chairSeatTop - 0.035;
    seat.castShadow = true;
    chair.add(seat);
    // Jenn faces +z (the doorway), so her back and the backrest live on
    // the -z side, leaning slightly away from her.
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.06), weave);
    back.position.set(0, LAYOUT.chairSeatTop + 0.3, -0.2);
    back.rotation.x = -0.08;
    back.castShadow = true;
    chair.add(back);

    chair.position.set(J.x, 0, J.z + 0.02);
    chair.rotation.y = J.yaw;
    officeGroup.add(registerOutdoorProp(chair, 'chair'));
}

// ============================================
// THE WALL CLOCK
// ============================================
/** An analog wall clock in the company colors, hung on the back-wall
 *  pier between the window casing and the west corner, above the
 *  monitor. It keeps the visitor's REAL local time: the hands are set
 *  once here at build (so under prefers-reduced-motion the clock simply
 *  holds the arrival time) and then every frame by updateOffice, with a
 *  smooth gliding second hand. */
function createWallClock() {
    const C = LAYOUT.clock;
    const clock = new THREE.Group();
    clock.name = 'wallClock';

    const rimMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.brandTeal, roughness: 0.5, metalness: 0.1 });
    const handMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.brandDeep, roughness: 0.5, metalness: 0.1 });

    // Rim and face: two coins, the white face a touch deeper so it sits
    // proud of the teal ring.
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(C.r, C.r, 0.04, 28), rimMaterial);
    rim.rotation.x = Math.PI / 2;
    clock.add(rim);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(C.r - 0.022, C.r - 0.022, 0.044, 28), whiteTrim);
    face.rotation.x = Math.PI / 2;
    clock.add(face);

    // Hour markers: majors at 12, 3, 6, and 9, minors between.
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const major = i % 3 === 0;
        const tick = new THREE.Mesh(
            new THREE.BoxGeometry(major ? 0.016 : 0.008, major ? 0.032 : 0.018, 0.004),
            handMaterial
        );
        tick.position.set(Math.sin(a) * (C.r - 0.042), Math.cos(a) * (C.r - 0.042), 0.024);
        tick.rotation.z = -a;
        clock.add(tick);
    }

    // Hands pivot at the center, each blade reaching up past a short
    // tail, stacked a hair apart so they never z-fight.
    const makeHand = (len, w, material, z) => {
        const hand = new THREE.Group();
        const blade = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.004), material);
        blade.position.y = len / 2 - 0.018;
        hand.add(blade);
        hand.position.z = z;
        clock.add(hand);
        return hand;
    };
    wallClock = {
        hour: makeHand(0.082, 0.014, handMaterial, 0.026),
        minute: makeHand(0.122, 0.009, handMaterial, 0.03),
        second: makeHand(0.128, 0.0035, rimMaterial, 0.034)
    };
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), handMaterial);
    cap.position.z = 0.034;
    clock.add(cap);

    // On the room-side face of the back wall, rim just clear of the paint
    clock.position.set(C.x, C.y, LAYOUT.room.minZ + LAYOUT.room.wallT / 2 + 0.024);
    officeGroup.add(registerOutdoorProp(clock, 'clock'));
    setClockHands();
}

/** Point the hands at the real local time. Negative z rotation is
 *  clockwise for a visitor facing the wall, and the seconds glide. */
function setClockHands() {
    if (!wallClock) return;
    const now = new Date();
    const s = now.getSeconds() + now.getMilliseconds() / 1000;
    const m = now.getMinutes() + s / 60;
    const h = (now.getHours() % 12) + m / 60;
    const turn = -Math.PI * 2;
    wallClock.second.rotation.z = (s / 60) * turn;
    wallClock.minute.rotation.z = (m / 60) * turn;
    wallClock.hour.rotation.z = (h / 12) * turn;
}

// ============================================
// SEATING (the shared rig stands; this teaches it to sit)
// ============================================
/** The shared createPerson rig builds each leg as one rigid group hinged
 *  at the hip (y 0.75, untagged; arms carry userData.isArm). To sit a
 *  figure down, wrap everything from the knee down (knee sphere, shin,
 *  shoe, and any shoe add-ons) in a new subgroup pivoted at the knee,
 *  swing the thigh forward at the hip, and drop the shin back toward the
 *  floor. Same treatment the karaoke booth uses. */
function poseSeated(person, opts = {}) {
    const hipBend = opts.hipBend !== undefined ? opts.hipBend : -1.42;
    const kneeBend = opts.kneeBend !== undefined ? opts.kneeBend : 1.18;
    person.children.forEach((group) => {
        if (!group.isGroup || group.userData.isArm) return;
        if (Math.abs(group.position.y - 0.75) > 0.02) return;
        const lower = new THREE.Group();
        lower.position.set(0, -0.375, 0);    // the knee sits at half leg length
        const movers = group.children.filter((part) => part.position.y <= -0.37);
        movers.forEach((part) => {
            group.remove(part);
            part.position.y += 0.375;
            lower.add(part);
        });
        group.add(lower);
        group.rotation.x = hipBend;
        lower.rotation.x = kneeBend;
    });
}

/** Drop a rig figure onto a seat: hips land just above the cushion, with
 *  the bend coming from poseSeated. scaleY is the figure's y scale. */
function seatHeightY(seatTop, scaleY) {
    return seatTop + 0.05 - 0.75 * scaleY;
}

// ============================================
// JENN, MID-WORKDAY
// ============================================
// The arm poses updateOffice moves between. The shared rig's arm is one
// rigid group hinged at the shoulder, which reads as sleepwalking when
// aimed at a keyboard, so addElbow below gives each arm a working elbow
// (the poseSeated knee trick, played at the joint the karaoke stage
// plays for Jamar's mic arm). shoulder/elbow are rotation.x values; rz
// is the shoulder's inward lean, mirrored by side. The typing numbers
// land the hands hovering a few centimeters over the keyboard: shoulder
// at y 1.02 seated, upper arm swung 0.5 forward, forearm folded to 1.55
// total puts the hands near y 0.77 at the keyboard's distance. The lean
// pulls each hand sin(rz) times the folded reach (~0.42) in from the
// shoulder's 0.2125 offset: 0.24 lands them ~0.11 from the keyboard's
// center, comfortably inside its 0.18 half width (home row, not edges).
const JENN_TYPE_POSE = { shoulder: -0.5, elbow: -1.05, rz: 0.24 };
const JENN_WAVE_POSE = { shoulder: -1.55, elbow: -0.75, rz: 0.25 };
const JENN_REST_POSE = { shoulder: -0.3, elbow: -0.9, rz: 0.1 };

/** Give a tagged arm a working elbow: wrap the forearm and hand (the
 *  parts below the elbow sphere at half arm length) into a pivot group
 *  at the joint. The sphere itself stays with the upper arm as the
 *  joint ball. Returns the pivot. */
function addElbow(arm) {
    const pivot = new THREE.Group();
    pivot.position.set(0, -0.275, 0);
    const movers = arm.children.filter((part) => part.position.y < -0.28);
    movers.forEach((part) => {
        arm.remove(part);
        part.position.y += 0.275;
        pivot.add(part);
    });
    arm.add(pivot);
    return pivot;
}

function createJenn() {
    const J = LAYOUT.jenn;

    const jenn = createPerson({
        role: 'customer',
        x: 0, z: 0, rotationY: 0,
        shirtColor: JENN_LOOK.shirtColor,
        pantsColor: JENN_LOOK.pantsColor,
        skinTone: JENN_LOOK.skinTone,
        hairColor: JENN_LOOK.hairColor,
        hairStyle: JENN_LOOK.hairStyle,
        eyeColor: JENN_LOOK.eyeColor
    });
    jenn.scale.set(0.97, 1, 0.97);

    poseSeated(jenn);
    jenn.position.set(J.x, seatHeightY(LAYOUT.chairSeatTop, 1), J.z);
    jenn.rotation.y = J.yaw;

    // Find the tagged arms, give each an elbow, and start both in the
    // typing pose, hands hovering over the keyboard in front of her.
    // rz leans the hands inward toward the keyboard's width: +x is
    // inward for the left arm and outward for the right, hence -side.
    const arms = [];
    jenn.children.forEach((group) => {
        if (!group.isGroup || !group.userData.isArm) return;
        const side = group.position.x < 0 ? -1 : 1;
        const elbow = addElbow(group);
        group.rotation.x = JENN_TYPE_POSE.shoulder;
        group.rotation.z = -side * JENN_TYPE_POSE.rz;
        elbow.rotation.x = JENN_TYPE_POSE.elbow;
        arms.push({ arm: group, elbow, side, phase: side < 0 ? 0 : 2.4 });
    });

    officeGroup.add(registerOutdoorProp(jenn, 'jenn'));

    // The greet yaw faces the camera in the doorway (recomputed from the
    // layout so a recomposition carries through automatically).
    const cam = SVJ_CONFIG.camera.position;
    const greetYaw = Math.atan2(cam.x - J.x, cam.z - J.z);
    jennRig = {
        group: jenn,
        arms,
        rightArm: arms.find((a) => a.side > 0) || null,
        baseYaw: J.yaw,
        greetYaw,
        mode: 'typing',
        modeT: 0,
        workDur: 9        // the first pause comes early: visitors arrive to a wave
    };
}

// ============================================
// THE YOGA CORNER
// ============================================
function createYogaCorner() {
    const M = LAYOUT.yogaMat;
    const B = LAYOUT.swissBall;

    // The rolled mat: two-tone teal, stood on end against the back wall
    // with a carry strap, exactly where it can be grabbed on the way out.
    const mat = new THREE.Group();
    mat.name = 'yogaMat';
    const roll = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.085, 0.86, 16),
        new THREE.MeshStandardMaterial({ color: PALETTE.brandTeal, roughness: 0.8, metalness: 0.0 })
    );
    roll.position.y = 0.43;
    roll.castShadow = true;
    mat.add(roll);
    // The rolled-up spiral showing at the top
    const spiral = new THREE.Mesh(
        new THREE.CylinderGeometry(0.078, 0.078, 0.012, 16),
        new THREE.MeshStandardMaterial({ color: PALETTE.brandMist, roughness: 0.85 })
    );
    spiral.position.y = 0.866;
    mat.add(spiral);
    const core = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.014, 10),
        new THREE.MeshStandardMaterial({ color: PALETTE.brandDeep, roughness: 0.85 })
    );
    core.position.y = 0.867;
    mat.add(core);
    // The carry strap, buckled around the middle
    const strap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.092, 0.092, 0.05, 16),
        new THREE.MeshStandardMaterial({ color: 0x8a8377, roughness: 0.9 })
    );
    strap.position.y = 0.4;
    mat.add(strap);
    // A cork block waiting at its foot
    const block = new THREE.Mesh(
        new THREE.BoxGeometry(0.23, 0.12, 0.15),
        new THREE.MeshStandardMaterial({ color: 0xc9a273, roughness: 0.95 })
    );
    block.position.set(0.3, 0.06, 0.25);
    block.rotation.y = 0.4;
    mat.add(block);

    mat.position.set(M.x, 0, M.z);
    mat.rotation.z = 0.1;    // leaned into the corner, not parade-straight
    officeGroup.add(registerOutdoorProp(mat, 'yogamat'));

    // The Swiss exercise ball, in the logo's mist teal with a low sheen.
    const ballGroup = new THREE.Group();
    ballGroup.name = 'swissBall';
    const ball = new THREE.Mesh(
        new THREE.SphereGeometry(B.r, 20, 16),
        new THREE.MeshStandardMaterial({ color: PALETTE.brandMist, roughness: 0.35, metalness: 0.0 })
    );
    ball.position.y = B.r;
    ball.castShadow = true;
    ballGroup.add(ball);
    // The molded seam line around its equator
    const seam = new THREE.Mesh(
        new THREE.TorusGeometry(B.r - 0.002, 0.004, 6, 28),
        new THREE.MeshStandardMaterial({ color: PALETTE.brandTeal, roughness: 0.6 })
    );
    seam.position.y = B.r;
    seam.rotation.x = Math.PI / 2;
    ballGroup.add(seam);
    ballGroup.position.set(B.x, 0, B.z);
    officeGroup.add(registerOutdoorProp(ballGroup, 'swissball'));
}

// ============================================
// THE WHITEBOARD
// ============================================
/** The marker scribbles: a four-box operations loop, this week's list,
 *  and one small lotus doodle in the corner, because old habits stay. */
function drawWhiteboard(ctx, W, H) {
    ctx.fillStyle = '#fdfdfb';
    ctx.fillRect(0, 0, W, H);

    // The loop: PLAN -> DO -> CHECK -> ADJUST, in the brand teal
    const boxes = ['PLAN', 'DO', 'CHECK', 'ADJUST'];
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    boxes.forEach((label, i) => {
        const x = 42 + i * 118;
        ctx.strokeStyle = '#2e8b83';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, 34, 92, 46);
        ctx.fillStyle = '#1d4e5f';
        ctx.fillText(label, x + 46, 63);
        if (i < boxes.length - 1) {
            ctx.strokeStyle = '#1d4e5f';
            ctx.beginPath();
            ctx.moveTo(x + 96, 57);
            ctx.lineTo(x + 114, 57);
            ctx.lineTo(x + 109, 51);
            ctx.moveTo(x + 114, 57);
            ctx.lineTo(x + 109, 63);
            ctx.stroke();
        }
    });

    // This week's list, in a quicker navy hand
    ctx.textAlign = 'left';
    ctx.font = '19px Comic Sans MS, cursive';
    ctx.fillStyle = '#28466e';
    ctx.fillText('this week:', 42, 130);
    ['simplify the handoffs', 'automate the busywork', 'protect the calm'].forEach((line, i) => {
        ctx.fillText('•  ' + line, 60, 162 + i * 32);
    });

    // The lotus doodle, five quick marker strokes in the corner
    ctx.strokeStyle = '#2e8b83';
    ctx.lineWidth = 3;
    const lx = W - 78, ly = H - 40;
    for (let p = -2; p <= 2; p++) {
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.quadraticCurveTo(lx + p * 16, ly - 46, lx + p * 26, ly - 20);
        ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(lx - 34, ly + 6);
    ctx.quadraticCurveTo(lx, ly + 22, lx + 34, ly + 6);
    ctx.stroke();
}

function createWhiteboard() {
    const WB = LAYOUT.whiteboard;
    const R = LAYOUT.room;
    const board = new THREE.Group();
    board.name = 'whiteboard';

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.04, WB.h + 0.06, WB.w + 0.06), brushedMetal);
    board.add(frame);

    const canvas = makeCanvas(512, 320);
    drawWhiteboard(canvas.getContext('2d'), 512, 320);
    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(WB.w, WB.h),
        new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), roughness: 0.35, metalness: 0.0 })
    );
    face.rotation.y = Math.PI / 2;
    face.position.x = 0.022;
    board.add(face);

    // The marker tray, one teal marker on duty
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.5), brushedMetal);
    tray.position.set(0.03, -WB.h / 2 - 0.045, 0);
    board.add(tray);
    const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.011, 0.12, 8),
        new THREE.MeshStandardMaterial({ color: PALETTE.brandTeal, roughness: 0.5 })
    );
    marker.rotation.x = Math.PI / 2;
    marker.position.set(0.045, -WB.h / 2 - 0.03, 0.08);
    board.add(marker);

    board.position.set(R.minX + R.wallT / 2 + 0.03, WB.y, WB.z);
    officeGroup.add(registerOutdoorProp(board, 'whiteboard'));
}

// ============================================
// THE SIDEBOARD AND THE ART
// ============================================
function createSideboard() {
    const S = LAYOUT.sideboard;
    const R = LAYOUT.room;
    const sideboard = new THREE.Group();
    sideboard.name = 'sideboard';

    // A low white console on oak feet, minimalist to a fault
    const body = new THREE.Mesh(new THREE.BoxGeometry(S.d, 0.5, S.len), whiteTrim);
    body.position.set(0, S.topY - 0.25, 0);
    body.castShadow = true;
    sideboard.add(body);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(S.d + 0.03, 0.025, S.len + 0.03), deskWoodMaterial);
    slab.position.set(0, S.topY + 0.012, 0);
    sideboard.add(slab);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.22, 8), deskWoodMaterial);
        foot.position.set(sx * (S.d / 2 - 0.06), 0.11, sz * (S.len / 2 - 0.08));
        sideboard.add(foot);
    });
    // Door seams and two small oak knobs
    [-1, 1].forEach((side) => {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), deskWoodMaterial);
        knob.position.set(-S.d / 2 - 0.008, S.topY - 0.22, side * 0.09);
        sideboard.add(knob);
    });
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.44, 0.006), new THREE.MeshStandardMaterial({ color: 0xd9d5cb, roughness: 0.8 }));
    seam.position.set(-S.d / 2 - 0.002, S.topY - 0.26, 0);
    sideboard.add(seam);

    // A short run of well-thumbed operations books between oak ends
    const bookColors = [0x2e8b83, 0x28466e, 0xc98960, 0x1d4e5f, 0x8fc7c0];
    bookColors.forEach((color, i) => {
        const book = new THREE.Mesh(
            new THREE.BoxGeometry(0.13, 0.19 - (i % 2) * 0.02, 0.03),
            new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
        );
        book.position.set(0, S.topY + 0.12, 0.36 + i * 0.036);
        book.rotation.x = i === bookColors.length - 1 ? -0.18 : 0;   // the last one leans
        sideboard.add(book);
    });
    [0.33, 0.54].forEach((z) => {
        const bookend = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), deskWoodMaterial);
        bookend.position.set(0, S.topY + 0.075, z);
        sideboard.add(bookend);
    });

    // A framed print of a sunrise over hills, gift-shop calm
    const photoFrame = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.17, 0.13), matteBlack);
    photoFrame.position.set(0, S.topY + 0.11, -0.55);
    photoFrame.rotation.y = 0.35;
    sideboard.add(photoFrame);
    const photoCanvas = makeCanvas(64, 84);
    const pctx = photoCanvas.getContext('2d');
    const sky = pctx.createLinearGradient(0, 0, 0, 84);
    sky.addColorStop(0, '#ffd9a0');
    sky.addColorStop(0.55, '#ff9e6d');
    sky.addColorStop(1, '#5f8a86');
    pctx.fillStyle = sky;
    pctx.fillRect(0, 0, 64, 84);
    pctx.fillStyle = '#3d5a56';
    pctx.beginPath();
    pctx.moveTo(0, 66);
    pctx.quadraticCurveTo(20, 52, 40, 64);
    pctx.quadraticCurveTo(54, 72, 64, 62);
    pctx.lineTo(64, 84);
    pctx.lineTo(0, 84);
    pctx.fill();
    const photo = new THREE.Mesh(
        new THREE.PlaneGeometry(0.1, 0.14),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(photoCanvas) })
    );
    photo.position.set(-0.011, S.topY + 0.11, -0.55);
    photo.rotation.y = 0.35 - Math.PI / 2;
    sideboard.add(photo);

    // The pothos, trailing off the sideboard's end
    sideboard.add(createPothos(0, S.topY + 0.013, -0.2));

    sideboard.position.set(S.x, 0, S.z);
    officeGroup.add(registerOutdoorProp(sideboard, 'sideboard'));

    // ---- The framed art above: two abstract canvases in the logo's
    // waters, painted as soft layered waves (an echo of the brand, not a
    // copy of the logo; Jenn keeps the real thing on her own site). ----
    const art = new THREE.Group();
    art.name = 'wallArt';
    LAYOUT.art.z.forEach((z, i) => {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.56, 0.44), whiteTrim);
        frame.position.set(0, 0, z);
        art.add(frame);
        const canvas = makeCanvas(128, 160);
        const actx = canvas.getContext('2d');
        actx.fillStyle = '#f5f3ec';
        actx.fillRect(0, 0, 128, 160);
        const waves = i === 0
            ? ['#8fc7c0', '#2e8b83', '#1d4e5f']
            : ['#b9dcd7', '#5f9ea8', '#28466e'];
        waves.forEach((color, w) => {
            actx.fillStyle = color;
            actx.beginPath();
            actx.moveTo(0, 70 + w * 28);
            for (let x = 0; x <= 128; x += 16) {
                actx.quadraticCurveTo(x + 8, 58 + w * 28 + (x % 32 ? 10 : -10), x + 16, 70 + w * 28);
            }
            actx.lineTo(128, 160);
            actx.lineTo(0, 160);
            actx.fill();
        });
        const face = new THREE.Mesh(
            new THREE.PlaneGeometry(0.38, 0.5),
            new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), roughness: 0.8 })
        );
        face.rotation.y = -Math.PI / 2;
        face.position.set(-0.02, 0, z);
        art.add(face);
    });
    art.position.set(R.maxX - R.wallT / 2 - 0.03, LAYOUT.art.y, S.z);
    officeGroup.add(registerOutdoorProp(art, 'art'));
}

// ============================================
// THE PLANTS
// ============================================
/** A monstera-ish statement plant: clay pot, arcing stems, and broad
 *  split leaves built from flattened spheres. */
function createMonstera(x, z) {
    const plant = new THREE.Group();
    plant.name = 'monstera';

    const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.13, 0.26, 14),
        new THREE.MeshStandardMaterial({ color: PALETTE.potClay, roughness: 0.85 })
    );
    pot.position.y = 0.13;
    pot.castShadow = true;
    plant.add(pot);
    const soil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.155, 0.155, 0.02, 14),
        new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 1.0 })
    );
    soil.position.y = 0.255;
    plant.add(soil);

    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        const lean = 0.35 + (i % 3) * 0.18;
        const h = 0.5 + (i % 3) * 0.22;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, h, 6), foliageMaterial);
        stem.position.set(Math.cos(a) * 0.05, 0.26 + h / 2 - 0.02, Math.sin(a) * 0.05);
        stem.rotation.set(Math.sin(a) * lean * 0.35, 0, -Math.cos(a) * lean * 0.35);
        plant.add(stem);
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), leafMaterial);
        leaf.scale.set(1, 0.08, 0.75);
        leaf.position.set(
            Math.cos(a) * (0.05 + lean * 0.3),
            0.26 + h - 0.03,
            Math.sin(a) * (0.05 + lean * 0.3)
        );
        leaf.rotation.set(Math.sin(a) * 0.4, -a, -Math.cos(a) * 0.4);
        plant.add(leaf);
    }

    plant.position.set(x, 0, z);
    return plant;
}

/** A snake plant: a clutch of tall, stiff blades in a white pot. */
function createSnakePlant(x, z) {
    const plant = new THREE.Group();
    plant.name = 'snakePlant';

    const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.095, 0.2, 12),
        new THREE.MeshStandardMaterial({ color: PALETTE.potWhite, roughness: 0.7 })
    );
    pot.position.y = 0.1;
    pot.castShadow = true;
    plant.add(pot);

    const bladeMaterial = new THREE.MeshStandardMaterial({
        color: 0x35662f, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide
    });
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const h = 0.42 + (i % 3) * 0.14;
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.028, h, 4), bladeMaterial);
        blade.scale.z = 0.3;
        blade.position.set(Math.cos(a) * 0.045, 0.2 + h / 2, Math.sin(a) * 0.045);
        blade.rotation.set(Math.sin(a) * 0.12, a, -Math.cos(a) * 0.12);
        plant.add(blade);
    }

    plant.position.set(x, 0, z);
    return plant;
}

/** A pothos for the sideboard: a leafy mound with two trailing vines. */
function createPothos(x, y, z) {
    const plant = new THREE.Group();
    plant.name = 'pothos';

    const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.055, 0.09, 12),
        new THREE.MeshStandardMaterial({ color: PALETTE.potWhite, roughness: 0.7 })
    );
    pot.position.y = 0.045;
    plant.add(pot);
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.035, 7, 5), leafMaterial);
        puff.scale.set(1, 0.6, 1);
        puff.position.set(Math.cos(a) * 0.05, 0.1 + (i % 2) * 0.025, Math.sin(a) * 0.05);
        plant.add(puff);
    }
    // Two vines trailing over the sideboard's edge and a little way down
    // its front, held just proud of the cabinet face (local -x; the slab
    // edge sits at -0.225 in sideboard space) so nothing clips through
    // the doors, and stopping well above the cabinet's bottom. The
    // leaves sample points along the same curve so each one sits ON its
    // vine rather than floating beside it.
    [[-0.16, 0.3], [0.12, 0.45]].forEach(([vz, drop]) => {
        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0.06, 0),
            new THREE.Vector3(-0.14, 0.045, vz * 0.4),
            new THREE.Vector3(-0.245, -0.02, vz * 0.8),
            new THREE.Vector3(-0.25, -drop, vz)
        ]);
        const vine = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.005, 5), foliageMaterial);
        plant.add(vine);
        for (let s = 1; s <= 4; s++) {
            const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 5), leafMaterial);
            leaf.scale.set(0.7, 0.5, 1.2);
            curve.getPoint(0.2 * s + 0.12, leaf.position);
            leaf.rotation.y = vz * 6 + s;
            plant.add(leaf);
        }
    });

    plant.position.set(x, y, z);
    return plant;
}

function createPlants() {
    const M = LAYOUT.monstera;
    const S = LAYOUT.snakePlant;
    officeGroup.add(registerOutdoorProp(createMonstera(M.x, M.z), 'plant'));
    officeGroup.add(registerOutdoorProp(createSnakePlant(S.x, S.z), 'plant'));
    // (The pothos rides the sideboard group: taps on it resolve to the
    // sideboard's story, which mentions it by name.)
}

// ============================================
// LIGHTING
// ============================================
// The shared rig's default fixture grid is spaced from (width - 4), which
// goes negative in a room this small, so the office passes one explicit
// fixture centered over the main floor. The rig's rectangular troffer
// suits the big activity rooms but not a home office, so its housing and
// panel meshes are hidden (the point light and the dimmer plumbing stay
// live) and a simple frosted flush-mount hangs in their place. All
// experience code: the frozen shared 1.0.0 parts stay untouched. (Same
// arrangement as Steve's office, one room over in the catalog.)
function createOfficeLighting() {
    const C = LAYOUT.ceilingLight;
    createCeilingLights({ xs: [C.x], zs: [C.z] });

    const rigFixture = getWorldGroup().getObjectByName('ceilingLight_1_1');
    if (rigFixture) {
        rigFixture.traverse((child) => { if (child.isMesh) child.visible = false; });

        const fixture = new THREE.Group();
        fixture.name = 'flushMount';
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.14, 0.03, 20),
            new THREE.MeshStandardMaterial({ color: 0xd9d5cc, roughness: 0.55, metalness: 0.05 })
        );
        base.position.y = -0.015;
        fixture.add(base);
        const dome = new THREE.Mesh(
            new THREE.SphereGeometry(0.125, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshStandardMaterial({
                color: 0xf2efe8, transparent: true, opacity: 0.94,
                emissive: 0xf6ecd8, emissiveIntensity: 0.5,
                roughness: 0.3, metalness: 0.0
            })
        );
        dome.rotation.x = Math.PI;               // hemisphere opens up, pole down
        dome.scale.y = 0.75;                     // a gentle drop, not a half ball
        dome.position.y = -0.03;
        fixture.add(dome);
        // The rig hangs its group 0.2 below the ceiling; the flush mount
        // builds downward from the ceiling plane, so lift it back flush.
        fixture.position.y = 0.2;
        rigFixture.add(fixture);
    }
}

/** The faux sun shaft: the frozen noon sun sits straight overhead, which
 *  no north window ever catches, so a warm spot outside the glass throws
 *  the morning-light pool across the floor by the desk. The window piers
 *  cast shadows, so the pool arrives window-shaped. */
function createWindowSunlight() {
    const win = LAYOUT.window;
    const sun = new THREE.SpotLight(0xfff2dd, 1.15, 18, 0.55, 0.5, 1.1);
    sun.position.set(win.x + 0.2, 3.6, LAYOUT.room.minZ - 2.6);
    sun.target.position.set(win.x - 0.8, 0, -0.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 14;
    sun.shadow.bias = -0.0005;
    officeGroup.add(sun);
    officeGroup.add(sun.target);
}

// ============================================
// THE EXTERIOR (seen through the window)
// ============================================
/** The side of the neighbor's one-story house, seen past the trees: warm
 *  gray lap siding, two windows facing back this way, a charcoal shingle
 *  gable roof with white trim along the sloped rake edges. */
function createNeighborHouse() {
    const house = new THREE.Group();
    house.name = 'neighborHouse';

    const len = 9;          // east-west, the side elevation we see
    const dep = 5;          // north-south
    const wallH = 2.7;      // one story
    const rise = 1.25;      // gable rise
    const overhang = 0.35;

    const sidingTexture = createSidingTexture();
    sidingTexture.repeat.set(4.5, 1.7);
    const siding = new THREE.MeshStandardMaterial({ map: sidingTexture, roughness: 0.85, metalness: 0.0 });
    const sidingPlain = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.85, metalness: 0.0 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(len, wallH, dep), siding);
    body.position.y = wallH / 2;
    body.castShadow = true;
    house.add(body);

    // Two windows on the face looking back toward Jenn's office
    [-1.9, 1.9].forEach((wx) => {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.15, 0.06), whiteTrim);
        frame.position.set(wx, 1.45, dep / 2 + 0.02);
        house.add(frame);
        const pane = new THREE.Mesh(
            new THREE.PlaneGeometry(0.86, 1.0),
            new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 0.25, metalness: 0.3 })
        );
        pane.position.set(wx, 1.45, dep / 2 + 0.055);
        house.add(pane);
        const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.02), whiteTrim);
        mullion.position.set(wx, 1.45, dep / 2 + 0.06);
        house.add(mullion);
    });

    // Gable roof, ridge running the house's length
    const halfSpan = dep / 2 + overhang;
    const slopeL = Math.sqrt(halfSpan * halfSpan + rise * rise);
    const pitch = Math.atan2(rise, halfSpan);
    const shingleTexture = createShingleTexture();
    shingleTexture.repeat.set(6, 2);
    const shingles = new THREE.MeshStandardMaterial({ map: shingleTexture, roughness: 0.95, metalness: 0.0 });
    const roofDark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.9, metalness: 0.0 });
    [1, -1].forEach((side) => {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(len + overhang * 2, 0.09, slopeL), shingles);
        slab.position.set(0, wallH + rise / 2, side * halfSpan / 2);
        slab.rotation.x = side * pitch;
        slab.castShadow = true;
        house.add(slab);
        [-1, 1].forEach((endSide) => {
            const rake = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.15, slopeL), whiteTrim);
            rake.position.set(endSide * (len / 2 + overhang - 0.045), wallH + rise / 2 - 0.03, side * halfSpan / 2);
            rake.rotation.x = side * pitch;
            house.add(rake);
        });
    });

    const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(len + overhang * 2, 0.09, 0.2), roofDark);
    ridgeCap.position.set(0, wallH + rise + 0.02, 0);
    house.add(ridgeCap);

    // Gable end triangles, sided like the walls
    [-1, 1].forEach((endSide) => {
        const tri = new THREE.Shape();
        tri.moveTo(-dep / 2, 0);
        tri.lineTo(dep / 2, 0);
        tri.lineTo(0, rise);
        tri.closePath();
        const gable = new THREE.Mesh(new THREE.ShapeGeometry(tri), sidingPlain);
        gable.position.set(endSide * (len / 2 - 0.01), wallH, 0);
        gable.rotation.y = endSide * Math.PI / 2;
        house.add(gable);
    });

    return house;
}

// ---- The fence birds ----
// Little visitors for the view: birds swoop down out of the sky, land on
// the cedar fence top, look around for a while, and flap away. At most
// three, on independent random clocks, so the window stays alive without
// turning into an aviary. Reduced-motion visitors get one bird already
// perched, holding still. (The same flock that visits Steve's office;
// word gets around about a good fence.)

const FENCE_TOP_Y = 1.52;     // mirrors createExterior's fence height (5 ft)
const FENCE_LINE_Z = -6.2;    // and its distance beyond the window

const BIRD_COLORS = [
    { body: 0x6b5a48, belly: 0xcbb391 },   // sparrow browns
    { body: 0x4a4e55, belly: 0xb8bcc2 },   // junco gray
    { body: 0x5a4632, belly: 0xd08a4e }    // robin orange
];

/** One low-poly bird: body, belly, head, beak, tail, and two wings hinged
 *  at their roots. Local forward is +Z (toward the office window when its
 *  yaw is 0). Origin at the feet. */
function createBird(colors) {
    const bird = new THREE.Group();

    const bodyMaterial = new THREE.MeshStandardMaterial({ color: colors.body, roughness: 0.9, metalness: 0.0 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), bodyMaterial);
    body.scale.set(1, 0.85, 1.4);
    body.position.y = 0.05;
    bird.add(body);

    const belly = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 8, 6),
        new THREE.MeshStandardMaterial({ color: colors.belly, roughness: 0.9, metalness: 0.0 })
    );
    belly.scale.set(0.85, 0.7, 1.05);
    belly.position.set(0, 0.035, 0.012);
    bird.add(belly);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), bodyMaterial);
    head.position.set(0, 0.095, 0.045);
    bird.add(head);

    const beak = new THREE.Mesh(
        new THREE.ConeGeometry(0.008, 0.022, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.8, metalness: 0.0 })
    );
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.09, 0.082);
    bird.add(beak);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.007, 0.055), bodyMaterial);
    tail.rotation.x = 0.3;
    tail.position.set(0, 0.055, -0.085);
    bird.add(tail);

    const wings = [];
    [-1, 1].forEach((side) => {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.006, 0.05), bodyMaterial);
        wing.geometry.translate(side * 0.04, 0, 0);   // hinge at the wing root
        wing.position.set(side * 0.022, 0.062, -0.005);
        bird.add(wing);
        wings.push({ mesh: wing, side });
    });

    return { group: bird, wings };
}

/** Send a bird from a sky point down to a perch spot on the fence. */
function beginBirdFlyIn(b) {
    b.perchX = -0.3 + Math.random() * 3.3;   // the stretch the window frames
    b.from = {
        x: b.perchX + (Math.random() - 0.5) * 10,
        y: 6 + Math.random() * 3,
        z: FENCE_LINE_Z - 6 - Math.random() * 6
    };
    b.to = { x: b.perchX, y: FENCE_TOP_Y, z: FENCE_LINE_Z };
    b.dur = 2.2 + Math.random() * 0.8;
    b.t = 0;
    b.state = 'flyIn';
    b.group.visible = true;
    b.group.rotation.y = Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z);
}

/** Send a perched bird off into the sky. */
function beginBirdFlyOut(b) {
    b.from = { x: b.perchX, y: FENCE_TOP_Y, z: FENCE_LINE_Z };
    b.to = {
        x: b.perchX + (Math.random() - 0.5) * 14,
        y: 7 + Math.random() * 3,
        z: FENCE_LINE_Z - 5 - Math.random() * 8
    };
    b.dur = 2.4 + Math.random() * 0.8;
    b.t = 0;
    b.state = 'flyOut';
    b.group.rotation.y = Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z);
}

/** Advance every bird's little state machine: wait, swoop in, perch and
 *  glance around, flap away, wait again. */
function updateFenceBirds(deltaTime) {
    fenceBirds.forEach((b) => {
        b.timer -= deltaTime;
        b.flapT += deltaTime;

        if (b.state === 'waiting') {
            if (b.timer <= 0) beginBirdFlyIn(b);
            return;
        }

        if (b.state === 'flyIn' || b.state === 'flyOut') {
            b.t += deltaTime / b.dur;
            const t = Math.min(1, b.t);
            const s = t * t * (3 - 2 * t);
            const arc = (b.state === 'flyOut' ? 0.5 : 0.25) * Math.sin(Math.PI * s);
            b.group.position.set(
                b.from.x + (b.to.x - b.from.x) * s,
                b.from.y + (b.to.y - b.from.y) * s + arc,
                b.from.z + (b.to.z - b.from.z) * s
            );
            // Wings beat hard in flight
            b.wings.forEach((w) => {
                w.mesh.rotation.z = w.side * (0.2 + 0.6 * Math.sin(b.flapT * 26));
            });
            if (t >= 1) {
                if (b.state === 'flyIn') {
                    b.state = 'perched';
                    b.timer = 4 + Math.random() * 8;
                    b.perchYaw = (Math.random() - 0.5) * 1.2;   // mostly facing the window
                    b.idleT = Math.random() * 10;
                } else {
                    b.state = 'waiting';
                    b.timer = 6 + Math.random() * 16;
                    b.group.visible = false;
                }
            }
            return;
        }

        // Perched: wings fold down along the flanks (negative z at the
        // root hinge tips them from spread to tucked), and the bird
        // glances around on the fence top
        b.idleT += deltaTime;
        b.group.rotation.y += ((b.perchYaw + 0.35 * Math.sin(b.idleT * 1.1)) - b.group.rotation.y) * Math.min(1, deltaTime * 4);
        b.wings.forEach((w) => {
            w.mesh.rotation.z += (-w.side * 0.95 - w.mesh.rotation.z) * Math.min(1, deltaTime * 6);
        });
        if (b.timer <= 0) beginBirdFlyOut(b);
    });
}

/** Build the birds and stagger their first appearances. Under reduced
 *  motion, one bird simply sits on the fence, still. */
function createFenceBirds(outsideGroup) {
    if (_reducedMotion.matches) {
        const still = createBird(BIRD_COLORS[0]);
        still.group.position.set(1.4, FENCE_TOP_Y, FENCE_LINE_Z);
        still.group.rotation.y = 0.2;
        still.wings.forEach((w) => { w.mesh.rotation.z = -w.side * 0.95; });
        outsideGroup.add(still.group);
        return;
    }
    BIRD_COLORS.forEach((colors, i) => {
        const bird = createBird(colors);
        bird.group.visible = false;
        outsideGroup.add(bird.group);
        fenceBirds.push({
            group: bird.group,
            wings: bird.wings,
            state: 'waiting',
            timer: 2 + i * 7 + Math.random() * 5,   // staggered debuts, first one early
            flapT: Math.random() * 10,
            idleT: 0,
            t: 0,
            dur: 1,
            from: null,
            to: null,
            perchX: 0,
            perchYaw: 0
        });
    });
}

function createExterior() {
    const outsideGroup = new THREE.Group();
    outsideGroup.name = 'outside';

    // Lawn north of the window
    const lawn = new THREE.Mesh(
        new THREE.PlaneGeometry(60, 40),
        new THREE.MeshStandardMaterial({ color: 0x5a8f4a, roughness: 0.95 })
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(0, -0.02, -22);
    lawn.receiveShadow = true;
    outsideGroup.add(lawn);

    // The cedar privacy fence between the window and the trees: 5 ft tall,
    // flat top, flat vertical planks. One textured slab instead of a couple
    // hundred plank meshes, since it is scenery only ever seen through the
    // window; the planks live in the texture. Edges stay plain cedar so the
    // visible flat top reads as solid boards.
    const fenceH = FENCE_TOP_Y;
    const fenceLen = 26;
    const plankTile = 4 * 4.5 * 0.0254;   // the texture tile: four 4.5 in planks
    const fenceTexture = createCedarFenceTexture();
    fenceTexture.repeat.set(fenceLen / plankTile, 1);
    const fenceFace = new THREE.MeshStandardMaterial({ map: fenceTexture, roughness: 0.9, metalness: 0.0 });
    const fenceEdge = new THREE.MeshStandardMaterial({ color: 0x8f6240, roughness: 0.9 });
    // Box material order: +x, -x, +y (the flat top), -y, +z, -z
    const fence = new THREE.Mesh(
        new THREE.BoxGeometry(fenceLen, fenceH, 0.045),
        [fenceEdge, fenceEdge, fenceEdge, fenceEdge, fenceFace, fenceFace]
    );
    fence.position.set(0.5, fenceH / 2, FENCE_LINE_Z);
    fence.castShadow = true;
    outsideGroup.add(fence);

    // The birds that come and go on the fence top
    createFenceBirds(outsideGroup);

    // The neighbor's house, past the trees: lawn, fence, trees, house, in
    // that order of depth through the window.
    const neighborHouse = createNeighborHouse();
    neighborHouse.position.set(-1.0, 0, -14);
    outsideGroup.add(neighborHouse);

    // Two trees staggered beyond the fence, framed by the window at
    // different depths so the view reads as a yard, not a backdrop.
    const treeSpots = [
        { x: 2.5, z: -8.5, s: 1.0 },
        { x: -1.8, z: -10.5, s: 1.15 }
    ];
    treeSpots.forEach((spot) => {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 2.6, 7), trunkMaterial);
        trunk.position.y = 1.3;
        tree.add(trunk);
        [[0, 3.6, 0, 1.9], [0.9, 3.0, 0.4, 1.2], [-0.8, 3.1, -0.3, 1.1]].forEach(([tx, ty, tz, r]) => {
            const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 7), foliageMaterial);
            puff.position.set(tx, ty, tz);
            tree.add(puff);
        });
        tree.position.set(spot.x, 0, spot.z);
        tree.scale.setScalar(spot.s);
        outsideGroup.add(tree);
    });

    officeGroup.add(outsideGroup);
}

// ============================================
// PER-FRAME UPDATE
// ============================================
let _t = 0;    // office clock, seconds

// How long Jenn pauses to greet the doorway, and the little wave's shape.
const GREET_DUR = 4.0;

/**
 * Advance the office one frame: Jenn types, pauses to look up and wave at
 * the doorway, and goes back to work; the birds come and go on the fence;
 * the monitor's cursor blinks. Everything holds still under
 * prefers-reduced-motion. Driven by main.js's loop (which also runs the
 * shared day/night pass, frozen at noon, for the sky and the shadow-map
 * refresh, plus the drifting clouds).
 */
export function updateOffice(deltaTime) {
    if (_reducedMotion.matches) return;
    _t += deltaTime;

    // The wall clock keeps the visitor's real local time
    setClockHands();

    // ---- Jenn: type, pause, wave, repeat ----
    if (jennRig) {
        jennRig.modeT += deltaTime;

        if (jennRig.mode === 'typing' && jennRig.modeT >= jennRig.workDur) {
            jennRig.mode = 'greeting';
            jennRig.modeT = 0;
        } else if (jennRig.mode === 'greeting' && jennRig.modeT >= GREET_DUR) {
            jennRig.mode = 'typing';
            jennRig.modeT = 0;
            jennRig.workDur = 11 + Math.random() * 7;   // back to it for a while
        }

        const ease = Math.min(1, deltaTime * 5);
        const g = jennRig.group;

        if (jennRig.mode === 'typing') {
            // An easy upright working posture: a slow sway, and the
            // forearms busy over the keyboard (the bob lives at the
            // elbow, the way real typing does).
            g.rotation.y += (jennRig.baseYaw + Math.sin(_t * 0.4) * 0.05 - g.rotation.y) * ease;
            g.rotation.z = Math.sin(_t * 0.8) * 0.012;
            jennRig.arms.forEach(({ arm, elbow, side, phase }) => {
                const bob = Math.sin(_t * 7 + phase) * 0.05;
                arm.rotation.x += (JENN_TYPE_POSE.shoulder - arm.rotation.x) * ease;
                arm.rotation.z += (-side * JENN_TYPE_POSE.rz - arm.rotation.z) * ease;
                elbow.rotation.x += (JENN_TYPE_POSE.elbow + bob - elbow.rotation.x) * ease;
                elbow.rotation.z *= (1 - ease);   // unwind any leftover wave
            });
        } else {
            // The greeting: turn to the doorway, rest the left hand, and
            // raise the right in a friendly wave, upper arm out and
            // forearm up. The wave itself swings the forearm at the
            // elbow, easing in and out with the pause so nothing snaps.
            const p = jennRig.modeT / GREET_DUR;
            const envelope = Math.sin(Math.PI * Math.min(1, Math.max(0, (p - 0.12) / 0.76)));
            g.rotation.y += (jennRig.greetYaw - g.rotation.y) * ease;
            g.rotation.z *= (1 - ease);
            jennRig.arms.forEach((entry) => {
                const { arm, elbow, side } = entry;
                if (entry === jennRig.rightArm) {
                    arm.rotation.x += (JENN_WAVE_POSE.shoulder - arm.rotation.x) * ease;
                    arm.rotation.z += (side * JENN_WAVE_POSE.rz - arm.rotation.z) * ease;
                    elbow.rotation.x += (JENN_WAVE_POSE.elbow - elbow.rotation.x) * ease;
                    elbow.rotation.z = envelope * Math.sin(_t * 6.5) * 0.35;
                } else {
                    arm.rotation.x += (JENN_REST_POSE.shoulder - arm.rotation.x) * ease;
                    arm.rotation.z += (-side * JENN_REST_POSE.rz - arm.rotation.z) * ease;
                    elbow.rotation.x += (JENN_REST_POSE.elbow - elbow.rotation.x) * ease;
                    elbow.rotation.z *= (1 - ease);
                }
            });
        }
    }

    // ---- The birds on the fence ----
    updateFenceBirds(deltaTime);

    // ---- The monitor: the notes cursor blinks ----
    if (monitor) {
        monitor.blinkT += deltaTime;
        if (monitor.blinkT >= 0.55) {
            monitor.blinkT = 0;
            drawMonitorFrame(!monitor.cursorOn);
        }
    }
}

/** The root office group (exposed for tests and future passes). */
export function getOfficeGroup() {
    return officeGroup;
}

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = { LAYOUT, PALETTE, seatHeightY };
