// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * store.js - John Walker, The Auto Man Construction
 *
 * Builds the eleventh SceneXP micro-environment, and the fourth passive
 * one: the corner of a car dealership showroom given over to a sales
 * desk. John Walker, "The Auto Man," sits on the buyer's side of that
 * desk with his customer, pointing at the deal sheet and making her case
 * to the dealer across from them, while she nods along. Behind the
 * dealer a wide glass wall looks out on the lot, and every so often a car
 * rolls past.
 *
 * The camera never moves in this experience, so the whole room is
 * composed for one fixed viewpoint at the open right-hand corner of the
 * desk (see AUTOMAN_CONFIG.camera): John and his customer in the near
 * left in three-quarter view, the dealer across from them, the lot
 * filling the space behind his shoulder, and the deal sheet at the
 * optical centre where John's finger lands. The scene provides all the
 * motion via updateShowroom(deltaTime).
 *
 * The shared day/night cycle is disabled so the sky holds at noon
 * (main.js still runs the cycle's per-frame pass for the fixed-time sky
 * paint and the shadow-map refresh), and the interior carries the shared
 * lighting rig plus one faux daylight shaft angled in through the glass.
 *
 * The module keeps the store.js name and its initStore export so the
 * conductor in main.js reads like every other experience's.
 *
 * FLOOR PLAN (viewed from above, the glass wall and the lot at the top,
 * the camera at the open right-hand corner of the desk). The back
 * elevation is glazed floor to ceiling apart from a slim pier at each
 * corner.
 *
 *   +=============== glass wall / the lot beyond ===============+
 *   |  [key board]           (DEALER)         [ sales board ]   |
 *   |                    +--------------+                       |
 *   |  [plant]           | [ PAPERS ]   |          [ plant ]    |
 *   |                    | [model car]  |                       |
 *   |                    +--------------+                       |
 *   |             (JOHN)          (CUSTOMER)                    |
 *   |                                            [ CAMERA ]     |
 *   |  [ coffee bar ]  [ basket ]  [ chairs ] [ vending ]       |
 *   |  [ brochures ]                                            |
 *   +--------------- front wall (behind the camera) ------------+
 *
 * BUILD STATUS: milestone M1. The room is real: polished floor, the
 * floor-to-ceiling curtain wall, and the lighting rig. Beyond the glass
 * there is still nothing but sky, because the lot is M2. The desk is M3
 * and the cast is M4. See specs/automan/TASKS.md.
 */

import { getScene } from '../../shared/js/scene-1.0.0.min.js';
import { initWorld, getWorldGroup, registerOutdoorProp } from '../../shared/js/world-1.0.0.min.js';
import { AUTOMAN_CONFIG } from './config.min.js';
import { createBackgroundScenery } from '../../shared/js/scenery-1.0.0.min.js';
import { createWall, createWallSegment } from '../../shared/js/structures-1.0.0.min.js';
import { createCeilingLights } from '../../shared/js/lighting-1.0.0.min.js';

// Re-exports: main.js keeps importing these from store.min.js (stable import
// block); the implementations live in the shared parts library.
export { updateBackgroundAnimations } from '../../shared/js/scenery-1.0.0.min.js';
export { updateInteriorAmbientLight } from '../../shared/js/lighting-1.0.0.min.js';

// World mesh group (the static showroom plus everything in it)
let showroomGroup = null;

// Visitors who ask for reduced motion get a perfectly still showroom:
// John holds his pointing pose, his customer holds hers, one car sits
// parked in the lot, and the clock holds the arrival time. Matches the
// reduced-motion handling across the site.
const _reducedMotion = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

// ============================================
// LAYOUT
// ============================================
// Everything is composed around the deal sheet on the desk, seen from the
// fixed camera at the desk's open right-hand corner. All meters. room
// mirrors AUTOMAN_CONFIG.building (the shared lighting rig reads that
// copy).
//
// PROVISIONAL: these are the starting composition from the PRD, not
// measured values. The desk and the sheet get fixed at M3 because the arm
// solve depends on them, and the whole frame is measured in portrait at
// M4 before anything else is polished.
const LAYOUT = {
    room: { minX: -3.8, maxX: 3.8, minZ: -4.4, maxZ: 3.0, height: 3.05, wallT: 0.15 },

    // The glass wall: a floor-to-ceiling curtain wall taking almost the
    // whole back elevation, which is what a real showroom does and what
    // makes this room a dealership rather than an office. It is the
    // largest element in the frame after the people.
    //
    // No sill and no head band: the glazing runs from a low aluminium
    // base rail at the floor to a head channel under the ceiling, divided
    // into bays by vertical mullions with one horizontal transom across.
    // Only two slim piers of solid wall survive, one at each corner.
    //
    // M2 NOTE: because the glass reaches the floor, the visitor sees the
    // lot's ground meeting the showroom floor. The lot needs a threshold
    // (a kerb or a shadow gap at the base rail) or the two planes will
    // z-fight along the whole elevation.
    glass: {
        x: 0.0,
        width: 6.8,        // leaves a 0.4 pier at each corner of a 7.6 wall
        baseRail: 0.12,    // the aluminium kick at floor level
        headRail: 0.14,    // the head channel under the ceiling
        transomY: 2.15,    // one horizontal division, for scale
        mullion: 0.07,     // face width of every vertical and the transom
        bays: 4
    },

    // The sales desk. Its top height and the sheet's position are the
    // anchor for John's pointing pose, so they get fixed at M3 and
    // nothing about his arm can be solved before then.
    desk: { x: -0.45, z: -2.25, w: 1.95, d: 0.95, topY: 0.75 },
    dealSheet: { x: -0.35, z: -2.0 },

    // Where the three of them sit. Yaws are not stored: each figure is
    // aimed at build time with faceToward() below, so moving anyone keeps
    // the sight lines honest without a second set of numbers to update.
    john: { x: -1.35, z: -1.35 },
    customer: { x: 0.30, z: -1.30 },
    dealer: { x: -0.45, z: -3.00 },
    chairSeatTop: 0.47,

    // The wall clock. Jenn's hangs on her back wall, but this room's back
    // wall is glass, so it goes on the west wall ahead and to the left of
    // the camera, facing +X.
    clock: { x: -3.70, y: 2.05, z: -1.60, rotY: Math.PI / 2, r: 0.17 },

    // The ceiling fixtures: two runs of two, one over the desk and one
    // over the waiting area. The shared rig gives each a point light, and
    // those do not cast shadows, so four is affordable on a phone.
    ceilingLights: { xs: [-1.9, 1.5], zs: [-2.9, 0.3] }
};

// -------------------------------------------------------------------------
// WHO'S WHO
// -------------------------------------------------------------------------
// John: clean-shaven head, a light blue button-down dress shirt, dark
// trousers, a medium to slightly broad build. Keyed to the flyer in
// specs/automan/image0.png. A stylized low-poly portrait rather than a
// likeness, the same standard the rest of the site holds. Used from M4.
const JOHN_LOOK = {
    skinTone: 0xe8c09a,
    bald: true,
    dressShirt: true,
    shirtColor: 0xb2cbf0,     // the flyer's light blue
    pantsColor: 0x2f3540,
    eyeColor: 0x3d5a72
};

// The showroom palette. Bright and slightly cool on purpose: showrooms
// are lit by their glass. The flyer's navy and gold do the accenting.
//
// PROVISIONAL: the navy, blue, and gold are working values derived from
// specs/automan/image0.png, whose raw pixel values read darker than the
// artwork displays. Confirm against the displayed flyer before these are
// treated as settled (task T10.2 territory).
const PALETTE = {
    navy: 0x12294a,
    signalBlue: 0x0d5bc4,
    gold: 0xf0a51e,
    shirtBlue: 0xb2cbf0,
    floorGrey: 0xd8d5d0,
    wallWhite: 0xf2f1ee,
    trimWhite: 0xf8f6f1,
    ceiling: 0xfbfaf8,
    asphalt: 0x3c3b3a,
    leafGreen: 0x3f7d43,
    leafDeep: 0x2d5a27,
    potWhite: 0xe9e6de,
    deskWood: 0x8a6a4a
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

/** Painted wall with a hint of roller texture, so the big bright planes
 *  don't read as one flat sheet. */
function createWallPaintTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f2f1ee';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 60; i++) {
        ctx.fillStyle = ['#eeedea', '#f6f5f2', '#e9e8e4'][i % 3];
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

/** The showroom floor: large-format polished porcelain, the surface every
 *  dealership puts under its cars. One canvas holds a 2 by 2 block of
 *  tiles, so the repeat below lands them at roughly 1.2 metres each. The
 *  mottling is deliberately soft and the grout lines are barely darker
 *  than the tile, because the floor's job is to bounce light and stay out
 *  of the way, not to draw the eye off the desk. */
function createShowroomFloorTexture() {
    const S = 512;
    const canvas = makeCanvas(S, S);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#d8d5d0';
    ctx.fillRect(0, 0, S, S);

    // Soft cloudy mottling, the way polished porcelain reads under
    // overhead light. Large and low-contrast on purpose.
    for (let i = 0; i < 90; i++) {
        ctx.fillStyle = ['#dedbd6', '#d2cfc9', '#e3e0db'][i % 3];
        ctx.globalAlpha = 0.22;
        ctx.beginPath();
        ctx.arc(Math.random() * S, Math.random() * S, 30 + Math.random() * 70, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // A faint diagonal polish streak, which is what actually says
    // "polished" rather than "matte" at a glance.
    for (let i = 0; i < 26; i++) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 6 + Math.random() * 14;
        const y = Math.random() * S;
        ctx.beginPath();
        ctx.moveTo(-40, y);
        ctx.lineTo(S + 40, y - 90 - Math.random() * 60);
        ctx.stroke();
    }

    // Grout: one cross, so the canvas is a 2 by 2 block of tiles.
    ctx.strokeStyle = 'rgba(150, 146, 140, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S);
    ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2);
    ctx.stroke();
    // and the edges, so tiles meet cleanly across the repeat seam
    ctx.strokeRect(0, 0, S, S);

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
const leafMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.leafGreen, roughness: 0.65, metalness: 0.0, side: THREE.DoubleSide
});

// ============================================
// ANIMATION REGISTRIES (filled during build, driven by updateShowroom)
// ============================================
let wallClock = null;    // { hour, minute, second } hand pivots on the wall clock

// ============================================
// INITIALIZE THE SHOWROOM WORLD
// ============================================
export function initStore() {
    const scene = getScene();
    if (!scene) {
        return;
    }

    // The shared world context owns the root group (added to the scene).
    showroomGroup = initWorld(AUTOMAN_CONFIG);

    createShowroom();         // floor, ceiling, walls, baseboards, the corner piers
    createCurtainWall();      // the floor-to-ceiling glazing across the back
    createWallClock();        // real local time, on the west wall
    createShowroomLighting(); // the shared rig, reskinned as recessed panels
    createDaylightShaft();    // the faux daylight washing in through the glass

    // Background scenery: the drifting clouds the glass wall frames.
    createBackgroundScenery();

    return showroomGroup;
}

// ============================================
// THE ROOM SHELL
// ============================================
/** Floor, ceiling, the three solid walls, their baseboards, and the two
 *  slim piers that flank the curtain wall. The glazing itself is
 *  createCurtainWall below. */
function createShowroom() {
    const room = new THREE.Group();
    room.name = 'showroom';

    const R = LAYOUT.room;
    const G = LAYOUT.glass;
    const { height, wallT } = R;
    const width = R.maxX - R.minX;
    const depth = R.maxZ - R.minZ;
    const cx = (R.minX + R.maxX) / 2;
    const cz = (R.minZ + R.maxZ) / 2;

    // --- Floor: large-format polished porcelain. One canvas tile covers
    // a 2 by 2 block, so a repeat of about 3.2 by 3.1 over a 7.6 by 7.4
    // room lands the tiles near 1.2 metres, which is the size a showroom
    // actually uses. ---
    const floorTexture = createShowroomFloorTexture();
    floorTexture.repeat.set(3.2, 3.1);
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        new THREE.MeshStandardMaterial({
            map: floorTexture, color: PALETTE.floorGrey, roughness: 0.28, metalness: 0.06
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    floor.name = 'floor';
    room.add(floor);

    // --- Ceiling: a thin slab rather than a plane so it reliably casts
    // shadow and the frozen noon sun cannot blast through the roof. ---
    const ceiling = new THREE.Mesh(
        new THREE.BoxGeometry(width + wallT * 2, 0.12, depth + wallT * 2),
        new THREE.MeshStandardMaterial({ color: PALETTE.ceiling, roughness: 0.9, metalness: 0.0 })
    );
    ceiling.position.set(cx, height + 0.06, cz);
    ceiling.castShadow = true;
    room.add(ceiling);

    const wallMaterial = new THREE.MeshStandardMaterial({
        map: createWallPaintTexture(), roughness: 0.85, metalness: 0.0
    });

    // --- East and west walls: single slabs the full depth of the room
    // (the shared builders attach themselves to the world group). ---
    createWall(depth, height, wallT, R.minX, height / 2, cz, Math.PI / 2, wallMaterial, 'westWall');
    createWall(depth, height, wallT, R.maxX, height / 2, cz, Math.PI / 2, wallMaterial, 'eastWall');

    // --- Front wall (behind the camera): solid. The pan row cannot turn
    // far enough to see it. ---
    createWallSegment(width, height, wallT, cx, height / 2, R.maxZ, wallMaterial, 'frontWall');

    // --- North (back) wall: only the two corner piers survive. The rest
    // of the elevation is glass, floor to ceiling. ---
    const nz = R.minZ;
    const gLeft = G.x - G.width / 2;
    const gRight = G.x + G.width / 2;
    [
        { from: R.minX, to: gLeft, name: 'northPierWest' },
        { from: gRight, to: R.maxX, name: 'northPierEast' }
    ].forEach((p) => {
        createWallSegment(p.to - p.from, height, wallT, (p.from + p.to) / 2, height / 2, nz, wallMaterial, p.name);
    });

    // --- Baseboards: white molding along the floor, on the three solid
    // walls only. The curtain wall has an aluminium base rail instead, so
    // the north run stops at the piers. ---
    const baseH = 0.1;
    const baseD = 0.045;
    const baseLip = 0.04;
    const innerE = R.maxX - wallT / 2;
    const innerW = R.minX + wallT / 2;
    const innerN = nz + wallT / 2;
    const innerS = R.maxZ - wallT / 2;
    const addBaseboard = (name, alongX, at, from, to) => {
        const geom = alongX
            ? new THREE.BoxGeometry(to - from, baseH, baseD)
            : new THREE.BoxGeometry(baseD, baseH, to - from);
        const board = new THREE.Mesh(geom, whiteTrim);
        board.position.set(alongX ? (from + to) / 2 : at, baseH / 2, alongX ? at : (from + to) / 2);
        board.name = name;
        room.add(board);
    };
    addBaseboard('baseSouth', true, innerS - baseLip, innerW, innerE);
    addBaseboard('baseWest', false, innerW + baseLip, innerN + baseLip, innerS - baseLip - baseD);
    addBaseboard('baseEast', false, innerE - baseLip, innerN + baseLip, innerS - baseLip - baseD);
    addBaseboard('basePierWest', true, innerN + baseLip, innerW, gLeft);
    addBaseboard('basePierEast', true, innerN + baseLip, gRight, innerE);

    showroomGroup.add(room);
}

/** The curtain wall: floor-to-ceiling glazing across almost the whole
 *  back elevation, the way a real showroom is built and the single
 *  biggest reason this room reads as a dealership.
 *
 *  An aluminium base rail at the floor, a head channel under the ceiling,
 *  vertical mullions dividing the run into bays, and one horizontal
 *  transom across for scale. Everything is measured off LAYOUT.glass so
 *  the bays stay even if the wall is resized.
 *
 *  The whole assembly is one registered prop, so a tap anywhere on the
 *  glass or its frame tells the story of the lot beyond it.
 *
 *  On the composition: a bright wall behind a seated figure risks
 *  silhouetting him, which would be a real problem for the dealer. It
 *  works here because the camera looks slightly DOWN at the desk, so most
 *  of the glass behind his head shows mid-tone asphalt and parked cars
 *  rather than open sky. Worth re-checking at M4 once he is actually in
 *  the chair, and again at M2 when the lot's tones are set. */
function createCurtainWall() {
    const R = LAYOUT.room;
    const G = LAYOUT.glass;
    const wall = new THREE.Group();
    wall.name = 'curtainWall';

    const nz = R.minZ;
    const innerN = nz + R.wallT / 2;      // the wall's room-side face
    const glassTop = R.height - G.headRail;
    const glassBottom = G.baseRail;

    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x9aa1a8, roughness: 0.4, metalness: 0.65
    });
    // Low opacity on purpose: this much glass at a higher value would
    // wash the lot out, and the lot is the whole point of the wall.
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0xcfe6f2, transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.1,
        side: THREE.DoubleSide
    });

    // Base rail and head channel, running the full width.
    const rail = (h, y, name) => {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(G.width, h, 0.1), frameMaterial);
        bar.position.set(G.x, y, innerN);
        bar.name = name;
        wall.add(bar);
    };
    rail(G.baseRail, G.baseRail / 2, 'baseRail');
    rail(G.headRail, R.height - G.headRail / 2, 'headRail');

    // Mullions: one at each jamb and one between every pair of bays, so
    // bays + 1 verticals share the run with the glass.
    const paneW = (G.width - G.mullion * (G.bays + 1)) / G.bays;
    const step = paneW + G.mullion;
    const firstMullionX = G.x - G.width / 2 + G.mullion / 2;
    const mullionH = glassTop - glassBottom;
    for (let i = 0; i <= G.bays; i++) {
        const mullion = new THREE.Mesh(
            new THREE.BoxGeometry(G.mullion, mullionH, 0.09), frameMaterial
        );
        mullion.position.set(firstMullionX + i * step, glassBottom + mullionH / 2, innerN);
        mullion.name = `mullion_${i}`;
        wall.add(mullion);
    }

    // One transom across, and the glass panes above and below it.
    const transom = new THREE.Mesh(
        new THREE.BoxGeometry(G.width, G.mullion, 0.09), frameMaterial
    );
    transom.position.set(G.x, G.transomY, innerN);
    transom.name = 'transom';
    wall.add(transom);

    const lights = [
        { from: glassBottom, to: G.transomY - G.mullion / 2, tag: 'lower' },
        { from: G.transomY + G.mullion / 2, to: glassTop, tag: 'upper' }
    ];
    for (let bay = 0; bay < G.bays; bay++) {
        const cxBay = firstMullionX + G.mullion / 2 + paneW / 2 + bay * step;
        lights.forEach((band) => {
            const h = band.to - band.from;
            if (h <= 0) return;
            const pane = new THREE.Mesh(new THREE.PlaneGeometry(paneW, h), glassMaterial);
            pane.position.set(cxBay, band.from + h / 2, nz);
            pane.name = `pane_${band.tag}_${bay}`;
            wall.add(pane);
        });
    }

    showroomGroup.add(registerOutdoorProp(wall, 'window'));
}

// ============================================
// SEATING (the shared rig stands; this teaches it to sit)
// ============================================
// Used from M4. The three figures at this desk are all seated.
/** The shared createPerson rig builds each leg as one rigid group hinged
 *  at the hip (y 0.75, untagged; arms carry userData.isArm). To sit a
 *  figure down, wrap everything from the knee down (knee sphere, shin,
 *  shoe, and any shoe add-ons) in a new subgroup pivoted at the knee,
 *  swing the thigh forward at the hip, and drop the shin back toward the
 *  floor. Same treatment the karaoke booth and Jenn's office use. */
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

/** Give a tagged arm a working elbow: wrap the forearm and hand (the
 *  parts below the elbow sphere at half arm length) into a pivot group
 *  at the joint. The sphere itself stays with the upper arm as the joint
 *  ball. Returns the pivot.
 *
 *  This is what makes John's point read as a point rather than as
 *  sleepwalking: the shared rig's arm is one rigid group hinged at the
 *  shoulder, which cannot put a fingertip on a specific spot on a desk.
 *  Used from M4. */
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

/** Yaw that aims a figure standing at `from` toward the point `to`, so a
 *  moved chair keeps its sight line without a second number to update. */
function faceToward(from, to) {
    return Math.atan2(to.x - from.x, to.z - from.z);
}

// ============================================
// SEATING FURNITURE
// ============================================
/** One task chair on a five-star base. Used from M3, which places three:
 *  the dealer's, and two on the customer side of the desk. */
function createDeskChair(x, z, yaw, kind) {
    const chair = new THREE.Group();
    chair.name = `chair_${kind}`;

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

    // Seat and backrest in a dark contract-furniture weave
    const weave = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.85, metalness: 0.0 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.42), weave);
    seat.position.y = LAYOUT.chairSeatTop - 0.035;
    seat.castShadow = true;
    chair.add(seat);
    // The sitter faces local +z, so the backrest lives on the -z side,
    // leaning slightly away from them.
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.06), weave);
    back.position.set(0, LAYOUT.chairSeatTop + 0.3, -0.2);
    back.rotation.x = -0.08;
    back.castShadow = true;
    chair.add(back);

    chair.position.set(x, 0, z);
    chair.rotation.y = yaw;
    return chair;
}

/** A tiny succulent in a white pot, for the desk corner. Used from M3. */
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
// THE WALL CLOCK
// ============================================
/** An analog wall clock in the brand colors, hung on the west wall ahead
 *  and to the left of the camera. It keeps the visitor's REAL local time:
 *  the hands are set once here at build (so under prefers-reduced-motion
 *  the clock simply holds the arrival time) and then every frame by
 *  updateShowroom, with a smooth gliding second hand.
 *
 *  Jenn's version hangs on her back wall facing the camera; this room's
 *  back wall is glass, so the clock takes a side wall and carries a yaw. */
function createWallClock() {
    const C = LAYOUT.clock;
    const clock = new THREE.Group();
    clock.name = 'wallClock';

    const rimMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.navy, roughness: 0.5, metalness: 0.1 });
    const handMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.navy, roughness: 0.5, metalness: 0.1 });
    const secondMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.gold, roughness: 0.5, metalness: 0.15 });

    // Rim and face: two coins, the white face a touch deeper so it sits
    // proud of the navy ring.
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
        second: makeHand(0.128, 0.0035, secondMaterial, 0.034)
    };
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), handMaterial);
    cap.position.z = 0.034;
    clock.add(cap);

    clock.position.set(C.x, C.y, C.z);
    clock.rotation.y = C.rotY;
    showroomGroup.add(registerOutdoorProp(clock, 'clock'));
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
// LIGHTING
// ============================================
/** The shared interior rig, wearing recessed panels instead of its own
 *  fixtures. The rig hangs a rectangular troffer 0.2 below the ceiling,
 *  which suits a warehouse or a bar but not a showroom, so each built
 *  fixture has its meshes hidden (the point light and the dimmer
 *  plumbing stay live) and a flush recessed panel is added in their
 *  place, lifted back up to the ceiling plane.
 *
 *  All experience code: the frozen shared 1.0.0 parts stay untouched.
 *  Same arrangement Jenn's office uses for its flush mount, one room over
 *  in the catalog. */
function createShowroomLighting() {
    const C = LAYOUT.ceilingLights;
    createCeilingLights({ xs: C.xs, zs: C.zs });

    const bezelMaterial = new THREE.MeshStandardMaterial({
        color: 0xe8e6e2, roughness: 0.5, metalness: 0.2
    });
    const panelMaterial = new THREE.MeshStandardMaterial({
        color: 0xfbf8f2, emissive: 0xfff6e8, emissiveIntensity: 0.75,
        roughness: 0.35, metalness: 0.0
    });

    const world = getWorldGroup();
    for (let row = 1; row <= C.zs.length; row++) {
        for (let col = 1; col <= C.xs.length; col++) {
            const rigFixture = world.getObjectByName(`ceilingLight_${row}_${col}`);
            if (!rigFixture) continue;
            rigFixture.traverse((child) => { if (child.isMesh) child.visible = false; });

            const panel = new THREE.Group();
            panel.name = 'recessedPanel';
            const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.04, 0.72), bezelMaterial);
            bezel.position.y = -0.02;
            panel.add(bezel);
            const lens = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 0.6), panelMaterial);
            lens.position.y = -0.035;
            panel.add(lens);
            // The rig hangs its group 0.2 below the ceiling; a recessed
            // panel sits IN the ceiling, so lift it back flush.
            panel.position.y = 0.2;
            rigFixture.add(panel);
        }
    }
}

/** The faux daylight: the frozen noon sun sits straight overhead, which
 *  no north-facing glass ever catches, so a warm spot outside the wall
 *  throws a pool of light across the showroom floor. With the glazing now
 *  running floor to ceiling there is far more aperture than Jenn's
 *  window had, so this is wider and flatter than hers: a broad wash that
 *  reaches the desk rather than a narrow shaft. The mullions and the
 *  piers cast shadows, so the pool arrives with the wall's own rhythm in
 *  it. */
function createDaylightShaft() {
    const G = LAYOUT.glass;
    const sun = new THREE.SpotLight(0xfff4e2, 1.35, 26, 0.72, 0.55, 1.0);
    sun.position.set(G.x + 0.6, 4.6, LAYOUT.room.minZ - 4.0);
    sun.target.position.set(G.x - 0.8, 0, -0.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);   // the mullion shadows need the resolution
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 22;
    sun.shadow.bias = -0.0005;
    showroomGroup.add(sun);
    showroomGroup.add(sun.target);
}

// ============================================
// PER-FRAME UPDATE
// ============================================
let _t = 0;    // showroom clock, seconds

/**
 * Advance the showroom one frame. At M0 that is only the wall clock:
 * John's point and glance, his customer's nod, the dealer's listening,
 * and the car crossing the lot all arrive at M5 and M6. Everything holds
 * still under prefers-reduced-motion. Driven by main.js's loop (which
 * also runs the shared day/night pass, frozen at noon, for the sky and
 * the shadow-map refresh, plus the drifting clouds).
 */
export function updateShowroom(deltaTime) {
    if (_reducedMotion.matches) return;
    _t += deltaTime;

    // The wall clock keeps the visitor's real local time
    setClockHands();
}

/** The root showroom group (exposed for tests and future passes). */
export function getShowroomGroup() {
    return showroomGroup;
}

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = {
    LAYOUT, PALETTE, JOHN_LOOK,
    seatHeightY, faceToward,
    poseSeated, addElbow, createDeskChair, createSucculent
};
