// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * store.js - Zumba Studio Environment Construction (Phase 7)
 *
 * Builds the tribute world for Roqui: a bright activity room at the YMCA,
 * sprung wood floor, a mirror wall behind the instructor, PA speakers wired
 * to her iPhone, a disco ball over the dance floor, and a class of six
 * dancers following her latin routine. Roqui leads from the front, on the
 * beat, and greets visitors between songs.
 *
 * The module keeps the store.js name and its main exports (initStore,
 * STORE_CONFIG, getStoreCollisionBoxes, ...) so the conductor in main.js
 * keeps its stable import block, same as the tire and trail experiences.
 *
 * Two experience-specific systems live here:
 *  - The dance engine: one beat clock, a small library of latin moves, and
 *    a lead/follow scheduler. Roqui dances the routine exactly on the beat;
 *    each dancer follows her with a personal lag, amplitude, and a brief
 *    hesitation at move changes, the way a real class shadows its
 *    instructor. The core is pure (beats in, pose out) for testability.
 *  - The music: a tiny WebAudio percussion sequencer (kick, son clave,
 *    shaker, congas) at the same BPM as the dance clock. It only ever
 *    starts from a click on the speakers or the iPhone, so autoplay rules
 *    are never in question.
 */

import { getScene } from '../../shared/js/scene-1.0.0.min.js';
import {
    initWorld, getWorldGroup, getColliders, registerOutdoorProp, getOutdoorPropMeshes, isMobileDevice
} from '../../shared/js/world-1.0.0.min.js';
import { ROQUI_CONFIG } from './config.min.js';
import { createPerson } from '../../shared/js/people-1.0.0.min.js';
import { createBackgroundScenery } from '../../shared/js/scenery-1.0.0.min.js';
import { setHelpSign, createHelpSign } from '../../shared/js/npcs-1.0.0.min.js';
import { createWall, createWallSegment, createWindowFrame } from '../../shared/js/structures-1.0.0.min.js';
import { createWoodFloorTexture } from '../../shared/js/textures-1.0.0.min.js';
import {
    createCeilingLights, setInteriorLightScale, setCeilingLights
} from '../../shared/js/lighting-1.0.0.min.js';
import { createTallPlant, createFernPlant } from '../../shared/js/furniture-1.0.0.min.js';

// Re-exports: main.js keeps importing these from store.min.js (stable import
// block); the implementations live in the shared parts library. The visitor
// wander system and the trail cyclists from the previous theme are gone: the
// class of dancers below replaces both.
export { updateBackgroundAnimations } from '../../shared/js/scenery-1.0.0.min.js';
export { updateCheckoutSign, getHelpSign, findClearSpawn } from '../../shared/js/npcs-1.0.0.min.js';

// The room rectangle drives the shared lighting rig and gallery.js's height
// fallback. Re-exported under the legacy name so main.js and gallery.js keep
// importing STORE_CONFIG from this module unchanged.
export const STORE_CONFIG = ROQUI_CONFIG.building;

// Indoor props register with the shared world context (the registry predates
// this indoor theme, hence the "outdoor" in its name); main.js still imports
// the getter from this module.
export { getOutdoorPropMeshes };

// World mesh groups
let studioGroup = null;
let collisionBoxes = [];

// Visitors who ask for reduced motion get a still class: everyone holds a
// relaxed, friendly pose instead of dancing, and the disco ball rests. This
// matches the reduced-motion handling of the sky in scene.js.
const _reducedMotion = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

// ============================================
// LAYOUT
// ============================================
// The room is centered on the origin. The mirror wall is the north wall
// (negative Z); Roqui teaches in front of it facing the class, and the
// class faces her. The door and windows are in the south wall behind the
// visitor's spawn point.
const LAYOUT = {
    room: { minX: -9.5, maxX: 9.5, minZ: -7, maxZ: 7, height: 4.2, wallT: 0.25 },

    // The glass plane sits at the inner face of the would-be north wall.
    // Behind it is the "reflection": a real chamber holding mirrored twins
    // of the class (see createMirrorWall / the twin rigs below).
    mirrorZ: -6.875,
    mirrorRoomBackZ: -16.5,

    roqui: { x: 0, z: -4.4 },          // instructor spot, facing +Z (the class)
    frontRowZ: -0.7,
    backRowZ: 1.7,

    discoBall: { x: 0, y: 3.3, z: -1.2 },
    speakers: [
        { x: -3.7, z: -5.7, rotY: 0.22 },
        { x: 3.7, z: -5.7, rotY: -0.22 }
    ],
    phoneTable: { x: 2.1, z: -5.9 },

    board: { x: -9.34, z: 2.6 },       // schedule board, west wall, faces +X
    waterTable: { x: 8.55, z: 3.2 },   // east wall, faces -X
    bench: { x: 1.7, z: 6.5 },         // south wall, faces the room

    // Poster spots (one per wall). The accent stripes read these too, so
    // their painted runs break cleanly around every poster.
    posters: { westZ: -2.8, eastZ: -2.2, southX: 1.7 },

    door: { x: 5.2, width: 1.6, height: 2.4 },
    windows: { xs: [-5.4, -1.8], width: 2.6, sillY: 1.2, topY: 3.0 }
};

// The Zumba palette. The spec's guidance: the brighter the better.
const PALETTE = {
    pink: 0xff2d78,
    teal: 0x19c3b1,
    yellow: 0xffd23f,
    orange: 0xff7a29,
    purple: 0x8e5bd9,
    lime: 0xa8e10c
};

// ============================================
// TEXTURES (procedural, canvas-based)
// ============================================
let wallTexture = null;

function makeCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
}

/** Warm off-white activity-room paint with a hint of texture. */
function createWallPaintTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f2eee6';
    ctx.fillRect(0, 0, 256, 256);

    // Soft roller mottle so big walls don't read as one flat sheet
    for (let i = 0; i < 70; i++) {
        ctx.fillStyle = ['#efe9df', '#f6f2ea', '#ece7dc'][i % 3];
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(Math.random() * 256, Math.random() * 256, 14 + Math.random() * 26, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

function createTextures() {
    wallTexture = createWallPaintTexture();
}

// ============================================
// SHARED MATERIALS
// ============================================
/** Cut sorted-or-not gap intervals out of one [start, end] run, returning the
 *  clear sub-runs. Used to paint the wall accent stripes around everything
 *  mounted on (or cut into) a wall. Slivers under 0.2m are dropped: a stripe
 *  stub shorter than that reads as a mistake, not a stripe. */
function subtractIntervals(start, end, gaps) {
    const runs = [];
    let cursor = start;
    gaps.slice().sort((a, b) => a[0] - b[0]).forEach(([gapStart, gapEnd]) => {
        if (gapStart > cursor) runs.push([cursor, Math.min(gapStart, end)]);
        cursor = Math.max(cursor, gapEnd);
    });
    if (cursor < end) runs.push([cursor, end]);
    return runs.filter(([a, b]) => b - a >= 0.2);
}

const darkMetal = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.5, metalness: 0.6 });
const lightMetal = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.35, metalness: 0.7 });
const whiteTrim = new THREE.MeshStandardMaterial({ color: 0xfaf7f0, roughness: 0.7, metalness: 0.0 });
const tableTop = new THREE.MeshStandardMaterial({ color: 0xe8e3d8, roughness: 0.6, metalness: 0.05 });
const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9, metalness: 0.0 });
const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8, metalness: 0.0 });

/**
 * Initialize the studio world
 */
export function initStore() {
    const scene = getScene();
    if (!scene) {
        return;
    }

    // The shared world context owns the root group, the collider registry, and
    // the prop registry. Local aliases keep every builder below (and the
    // direct collisionBoxes.push sites) working unchanged.
    studioGroup = initWorld(ROQUI_CONFIG);
    collisionBoxes = getColliders();

    createTextures();

    createRoom();             // floor, walls, windows, door, ceiling, baseboards
    createMirrorWall();       // the glass, its frame, and the reflection chamber
    createCeilingLights();    // shared interior rig (also creates the ambient fill)
    createStudioDressing();   // schedule board, posters, water table, bench, plants
    createSoundRig();         // PA speakers, cables, and Roqui's iPhone
    createDiscoBall();        // over the dance floor, of course
    createExterior();         // lawn, trees, and sky dressing seen through the windows
    createRoquiAndClass();    // the instructor, her class, and their mirror twins

    // Add background scenery (drifting clouds, per the config toggles)
    createBackgroundScenery();

    // (The root group was added to the scene by initWorld.)

    removeSceneTestObjects();

    return collisionBoxes;
}

// ============================================
// THE ROOM
// ============================================
function createRoom() {
    const roomGroup = new THREE.Group();
    roomGroup.name = 'activityRoom';

    const { room, mirrorRoomBackZ, door, windows } = LAYOUT;
    const { height, wallT } = room;
    const width = room.maxX - room.minX;

    // --- Floor: sprung wood, one plane running through the glass line so the
    // "reflected" floor beyond the mirror is literally the same floor ---
    const floorTexture = createWoodFloorTexture();
    floorTexture.repeat.set(10, 13);
    const floorLength = room.maxZ - mirrorRoomBackZ;
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(width, floorLength),
        new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.55, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, (room.maxZ + mirrorRoomBackZ) / 2);
    floor.receiveShadow = true;
    roomGroup.add(floor);

    // --- Ceiling: a thin slab over both the room and the reflection chamber.
    // A box rather than a plane so it reliably casts shadow and the frozen
    // noon sun cannot blast straight through the roof. ---
    const ceiling = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.15, floorLength),
        new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.9, metalness: 0.0 })
    );
    ceiling.position.set(0, height + 0.075, (room.maxZ + mirrorRoomBackZ) / 2);
    ceiling.castShadow = true;
    roomGroup.add(ceiling);

    const wallMaterial = new THREE.MeshStandardMaterial({
        map: wallTexture, roughness: 0.85, metalness: 0.0
    });

    // --- East and west walls: single slabs running the full length of the
    // room plus the reflection chamber, so the mirror's side walls continue
    // seamlessly (createWall registers their colliders) ---
    const sideLength = room.maxZ - mirrorRoomBackZ;
    const sideZ = (room.maxZ + mirrorRoomBackZ) / 2;
    createWall(sideLength, height, wallT, room.minX, height / 2, sideZ, Math.PI / 2, wallMaterial, 'westWall');
    createWall(sideLength, height, wallT, room.maxX, height / 2, sideZ, Math.PI / 2, wallMaterial, 'eastWall');

    // --- Back wall of the reflection chamber (never seen up close) ---
    createWallSegment(width, height, wallT, 0, height / 2, mirrorRoomBackZ, wallMaterial, 'mirrorBackWall');

    // --- South wall: solid piers around two window openings and the door ---
    const wz = room.maxZ; // wall centerline
    const winW = windows.width;
    const [winA, winB] = windows.xs;
    const doorLeft = door.x - door.width / 2;
    const doorRight = door.x + door.width / 2;

    // Full-height piers between the openings
    const piers = [
        { from: room.minX, to: winA - winW / 2 },
        { from: winA + winW / 2, to: winB - winW / 2 },
        { from: winB + winW / 2, to: doorLeft },
        { from: doorRight, to: room.maxX }
    ];
    piers.forEach((p, i) => {
        const w = p.to - p.from;
        createWallSegment(w, height, wallT, (p.from + p.to) / 2, height / 2, wz, wallMaterial, `southPier${i}`);
    });

    // Bands under and over each window, and over the door
    windows.xs.forEach((wx, i) => {
        createWallSegment(winW, windows.sillY, wallT, wx, windows.sillY / 2, wz, wallMaterial, `windowSill${i}`);
        const headH = height - windows.topY;
        createWallSegment(winW, headH, wallT, wx, windows.topY + headH / 2, wz, wallMaterial, `windowHead${i}`);
    });
    const doorHeadH = height - door.height;
    createWallSegment(door.width, doorHeadH, wallT, door.x, door.height + doorHeadH / 2, wz, wallMaterial, 'doorHead');

    // --- Window glass and frames ---
    const winH = windows.topY - windows.sillY;
    const winCenterY = (windows.topY + windows.sillY) / 2;
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0xcfe6f2, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.1,
        side: THREE.DoubleSide
    });
    windows.xs.forEach((wx, i) => {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(winW - 0.1, winH - 0.1), glassMaterial);
        pane.position.set(wx, winCenterY, wz);
        roomGroup.add(pane);
        createWindowFrame(winW, winH, wx, winCenterY, wz - wallT / 2 - 0.02, whiteTrim, `southWindow${i}`);
        // Center muntin
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, winH - 0.1, 0.06), whiteTrim);
        bar.position.set(wx, winCenterY, wz - wallT / 2 - 0.02);
        roomGroup.add(bar);
    });

    // --- The door: a closed double door with push bars (activity-room style) ---
    const doorGroup = new THREE.Group();
    doorGroup.name = 'studioDoor';
    const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x2b6777, roughness: 0.6, metalness: 0.1 });
    [-1, 1].forEach((side) => {
        const leafW = door.width / 2 - 0.02;
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, door.height - 0.06, 0.06), doorMaterial);
        leaf.position.set(door.x + side * (leafW / 2 + 0.02), (door.height - 0.06) / 2 + 0.02, wz);
        leaf.castShadow = true;
        doorGroup.add(leaf);

        const pushBar = new THREE.Mesh(new THREE.BoxGeometry(leafW - 0.14, 0.07, 0.06), lightMetal);
        pushBar.position.set(door.x + side * (leafW / 2 + 0.02), 1.05, wz - 0.06);
        doorGroup.add(pushBar);

        // Small square window in each leaf
        const peek = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.34), glassMaterial);
        peek.position.set(door.x + side * (leafW / 2 + 0.02), 1.75, wz - 0.045);
        peek.rotation.y = Math.PI;
        doorGroup.add(peek);
    });
    // Door frame trim (proud of the wall by the anti-z-fighting lip)
    const jambMaterial = whiteTrim;
    [doorLeft - 0.06, doorRight + 0.06].forEach((jx) => {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.12, door.height + 0.12, wallT + 0.04), jambMaterial);
        jamb.position.set(jx, (door.height + 0.12) / 2, wz);
        doorGroup.add(jamb);
    });
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(door.width + 0.36, 0.12, wallT + 0.04), jambMaterial);
    lintel.position.set(door.x, door.height + 0.06, wz);
    doorGroup.add(lintel);

    registerOutdoorProp(doorGroup, 'door');
    roomGroup.add(doorGroup);
    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(doorLeft, 0, wz - 0.15),
            new THREE.Vector3(doorRight, door.height, wz + 0.15)
        ),
        type: 'door'
    });

    // --- EXIT sign over the door (own tiny builder; the shared one is tied
    // to the storefront layout) ---
    const exitCanvas = makeCanvas(128, 48);
    const exitCtx = exitCanvas.getContext('2d');
    exitCtx.fillStyle = '#1c1e22';
    exitCtx.fillRect(0, 0, 128, 48);
    exitCtx.fillStyle = '#ff4444';
    exitCtx.font = 'bold 34px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    exitCtx.textAlign = 'center';
    exitCtx.textBaseline = 'middle';
    exitCtx.fillText('EXIT', 64, 26);
    const exitSign = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.2, 0.06),
        [darkMetal, darkMetal, darkMetal, darkMetal,
            new THREE.MeshStandardMaterial({
                map: new THREE.CanvasTexture(exitCanvas),
                emissive: 0xff3333, emissiveIntensity: 0.35,
                emissiveMap: new THREE.CanvasTexture(exitCanvas)
            }),
            darkMetal]
    );
    exitSign.position.set(door.x, door.height + 0.35, wz - wallT / 2 - 0.05);
    exitSign.rotation.y = Math.PI;
    roomGroup.add(exitSign);

    // --- Baseboards along the south, east, and west walls (the mirror wall
    // has its own bottom frame). Proud of the paint by the 1.5cm lip. ---
    const baseH = 0.12;
    const southBoard = new THREE.Mesh(new THREE.BoxGeometry(width - 0.2, baseH, 0.05), whiteTrim);
    southBoard.position.set(0, baseH / 2, wz - wallT / 2 - 0.04);
    roomGroup.add(southBoard);
    [room.minX, room.maxX].forEach((wx) => {
        const sideBoard = new THREE.Mesh(new THREE.BoxGeometry(0.05, baseH, room.maxZ - room.minZ - 0.2), whiteTrim);
        const inward = wx < 0 ? 1 : -1;
        sideBoard.position.set(wx + inward * (wallT / 2 + 0.04), baseH / 2, 0);
        roomGroup.add(sideBoard);
    });

    // --- Accent stripes: two bright ribbons running the room at shoulder
    // height, because a Zumba room should look like it is already moving.
    // A painted stripe respects what hangs on (or opens in) the wall, so
    // each wall's run breaks around its windows, the door trim, the posters,
    // and the schedule board instead of slicing across them. ---
    const POSTER_GAP = 0.68;   // poster half-width plus a finger of clear wall
    const southRuns = subtractIntervals(-(width / 2 - 0.1), width / 2 - 0.1, [
        ...windows.xs.map((wx) => [wx - winW / 2 - 0.15, wx + winW / 2 + 0.15]),
        [doorLeft - 0.28, doorRight + 0.28],
        [LAYOUT.posters.southX - POSTER_GAP, LAYOUT.posters.southX + POSTER_GAP]
    ]);
    const westRuns = subtractIntervals(room.minZ + 0.1, room.maxZ - 0.1, [
        [LAYOUT.posters.westZ - POSTER_GAP, LAYOUT.posters.westZ + POSTER_GAP],
        [LAYOUT.board.z - 1.45, LAYOUT.board.z + 1.45]
    ]);
    const eastRuns = subtractIntervals(room.minZ + 0.1, room.maxZ - 0.1, [
        [LAYOUT.posters.eastZ - POSTER_GAP, LAYOUT.posters.eastZ + POSTER_GAP]
    ]);

    const stripeSpecs = [
        { color: PALETTE.pink, y: 2.62 },
        { color: PALETTE.teal, y: 2.5 }
    ];
    stripeSpecs.forEach((spec) => {
        const stripeMaterial = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.7 });
        southRuns.forEach(([a, b]) => {
            const seg = new THREE.Mesh(new THREE.BoxGeometry(b - a, 0.1, 0.04), stripeMaterial);
            seg.position.set((a + b) / 2, spec.y, wz - wallT / 2 - 0.035);
            roomGroup.add(seg);
        });
        [[room.minX, 1, westRuns], [room.maxX, -1, eastRuns]].forEach(([wx, inward, runs]) => {
            runs.forEach(([a, b]) => {
                const seg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, b - a), stripeMaterial);
                seg.position.set(wx + inward * (wallT / 2 + 0.035), spec.y, (a + b) / 2);
                roomGroup.add(seg);
            });
        });
    });

    studioGroup.add(roomGroup);
}

// ============================================
// THE MIRROR WALL
// ============================================
// A real reflection would cost a second render each frame, so the studio
// cheats the way stage sets do: the "mirror" is a lightly tinted glass plane,
// and behind it sits a reflection chamber holding mirrored twins of the
// class, the speakers, and the phone table, posed each frame as true mirror
// images. The floor and ceiling run straight through the glass line, so the
// room appears to continue. From normal viewing angles it reads as a mirror.
function createMirrorWall() {
    const mirrorGroup = new THREE.Group();
    mirrorGroup.name = 'mirrorWall';

    const { room, mirrorZ } = LAYOUT;
    const width = room.maxX - room.minX;
    const glassTop = 3.5;

    // The glass: a faint cool veil over the reflection chamber
    const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(width - 0.15, glassTop - 0.06),
        new THREE.MeshStandardMaterial({
            color: 0xd4eef2, transparent: true, opacity: 0.09,
            roughness: 0.03, metalness: 0.3, side: THREE.DoubleSide
        })
    );
    glass.position.set(0, (glassTop + 0.06) / 2, mirrorZ + 0.012);
    mirrorGroup.add(glass);

    // Header band above the glass (painted wall, same as the rest)
    const header = new THREE.Mesh(
        new THREE.BoxGeometry(width, room.height - glassTop, room.wallT),
        new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.85 })
    );
    header.position.set(0, glassTop + (room.height - glassTop) / 2, mirrorZ - room.wallT / 2);
    mirrorGroup.add(header);

    // Frame: bottom kick rail, top rail, and vertical joints every few
    // panels, all proud of the glass by the anti-z-fighting lip
    const frameMaterial = lightMetal;
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(width - 0.1, 0.08, 0.05), frameMaterial);
    topRail.position.set(0, glassTop, mirrorZ + 0.03);
    mirrorGroup.add(topRail);
    const kickRail = new THREE.Mesh(new THREE.BoxGeometry(width - 0.1, 0.1, 0.05), frameMaterial);
    kickRail.position.set(0, 0.06, mirrorZ + 0.03);
    mirrorGroup.add(kickRail);
    for (let jx = -6; jx <= 6; jx += 3) {
        const joint = new THREE.Mesh(new THREE.BoxGeometry(0.05, glassTop - 0.06, 0.04), frameMaterial);
        joint.position.set(jx, glassTop / 2, mirrorZ + 0.028);
        mirrorGroup.add(joint);
    }

    // Two soft fills inside the chamber so the twins read clearly through
    // the tint (the room's own lights barely reach that deep). Kept in
    // mirrorFills so party mode can dim the "reflection" in step with the
    // room, or the mirror would glow brighter than the club around it.
    [{ x: -4, z: -11 }, { x: 4, z: -11 }].forEach((p, i) => {
        const fill = new THREE.PointLight(0xfff2e2, MIRROR_FILL_INTENSITY, 16, 1.4);
        fill.position.set(p.x, 3.2, p.z);
        fill.name = `mirrorFill${i}`;
        mirrorGroup.add(fill);
        mirrorFills.push(fill);
    });

    registerOutdoorProp(mirrorGroup, 'mirror');
    studioGroup.add(mirrorGroup);

    // Nobody walks through a mirror on my watch
    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(room.minX, 0, mirrorZ - 0.2),
            new THREE.Vector3(room.maxX, room.height, mirrorZ + 0.1)
        ),
        type: 'mirror'
    });
}

/** Reflect a Z coordinate across the mirror plane. */
function mirrorZOf(z) {
    return 2 * LAYOUT.mirrorZ - z;
}

/** Reflect a facing angle across the mirror plane (Z-flip). */
function mirrorRotYOf(rotY) {
    return Math.PI - rotY;
}

/** Tone a built object down a touch, as if seen through tinted glass.
 *  Materials are cloned before tinting (several builders share module-level
 *  materials, and clones share materials with their source), so the tint
 *  never bleeds into the real-room copy of anything. */
function applyMirrorTint(root) {
    const cloned = new Map();
    root.traverse((child) => {
        if (!child.isMesh) return;
        const tintOne = (m) => {
            if (!m || !m.color) return m;
            if (!cloned.has(m)) {
                const copy = m.clone();
                copy.color.multiplyScalar(0.86);
                cloned.set(m, copy);
            }
            return cloned.get(m);
        };
        child.material = Array.isArray(child.material)
            ? child.material.map(tintOne)
            : tintOne(child.material);
        child.castShadow = false;
    });
}

// ============================================
// STUDIO DRESSING
// ============================================

// ---- The class schedule board ----
// The board carries the discovery list (mirroring the checklist, the way the
// trail theme's kiosk notice board did) plus a dedication and the pointer to
// Roqui's schedule. main.js opens a close-up view of it, drawn by
// drawStudioBoardTo below.
let studioBoard = null;   // { canvas, ctx, texture }
let boardItems = [];      // latest checklist rows, [{ short, done }]

const BOARD_NOTES = [
    'Class schedules are posted on the',
    'Matt Griffin YMCA website.',
    'Bring water, wear sneakers, and come',
    'ready to smile. Todos son bienvenidos.'
];

function drawScheduleBoard(ctx, W, H) {
    // A clean dry-erase board in an aluminum frame
    ctx.fillStyle = '#fdfdfb';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#9aa0a6';
    ctx.lineWidth = W * 0.015;
    ctx.strokeRect(0, 0, W, H);

    const pad = W * 0.06;

    // Header, in marker
    ctx.fillStyle = '#3457a0';
    ctx.font = `bold ${Math.round(H * 0.045)}px "Segoe UI", Verdana, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('MATT GRIFFIN YMCA  ·  SEATAC, WASHINGTON', W / 2, H * 0.09);

    ctx.fillStyle = '#e0257f';
    ctx.font = `bold ${Math.round(H * 0.105)}px "Segoe UI", Verdana, sans-serif`;
    ctx.fillText('ZUMBA WITH ROQUI', W / 2, H * 0.21);

    ctx.strokeStyle = '#c3c8ce';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, H * 0.25);
    ctx.lineTo(W - pad, H * 0.25);
    ctx.stroke();

    // Discovery list, two columns
    ctx.textAlign = 'left';
    ctx.font = `${Math.round(H * 0.042)}px "Segoe UI", Verdana, sans-serif`;
    ctx.fillStyle = '#3a3f45';
    ctx.fillText('Things to find around the studio:', pad, H * 0.32);

    const colItems = Math.ceil(boardItems.length / 2) || 4;
    const rowH = H * 0.062;
    const listTop = H * 0.38;
    boardItems.forEach((item, i) => {
        const col = Math.floor(i / colItems);
        const row = i % colItems;
        const x = pad + col * (W / 2 - pad * 0.6);
        const y = listTop + row * rowH;

        // Checkbox
        ctx.strokeStyle = '#3a3f45';
        ctx.lineWidth = 2;
        const boxSize = H * 0.032;
        ctx.strokeRect(x, y - boxSize + 4, boxSize, boxSize);
        if (item.done) {
            ctx.strokeStyle = '#1d9e63';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x + boxSize * 0.2, y - boxSize * 0.4 + 4);
            ctx.lineTo(x + boxSize * 0.45, y - boxSize * 0.1 + 4);
            ctx.lineTo(x + boxSize * 1.05, y - boxSize * 0.95 + 4);
            ctx.stroke();
        }

        ctx.fillStyle = item.done ? '#1d9e63' : '#3a3f45';
        ctx.font = `${Math.round(H * 0.038)}px "Segoe UI", Verdana, sans-serif`;
        ctx.fillText(item.short, x + boxSize + W * 0.015, y);
    });

    // Notes and dedication
    const noteTop = H * 0.7;
    ctx.strokeStyle = '#c3c8ce';
    ctx.beginPath();
    ctx.moveTo(pad, noteTop - H * 0.045);
    ctx.lineTo(W - pad, noteTop - H * 0.045);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#5a616a';
    ctx.font = `${Math.round(H * 0.04)}px "Segoe UI", Verdana, sans-serif`;
    BOARD_NOTES.forEach((line, i) => {
        ctx.fillText(line, W / 2, noteTop + i * H * 0.052);
    });

    ctx.fillStyle = '#e0257f';
    ctx.font = `italic ${Math.round(H * 0.038)}px Georgia, serif`;
    ctx.fillText('Built with love for the best instructor in the room.', W / 2, H * 0.94);
}

/** Redraw the in-world board (called on checklist changes from main.js). */
export function updateStudioBoard(items, progress) {
    if (items) {
        boardItems = items.map((item) => ({
            short: item.short || item.label,
            // item.done comes from getChecklistItems. (The progress arg is a
            // summary {done: count, total, complete}, not a per-id map, so
            // reading progress[item.id] here left every box unticked.)
            done: !!item.done
        }));
    }
    if (studioBoard) {
        drawScheduleBoard(studioBoard.ctx, studioBoard.canvas.width, studioBoard.canvas.height);
        studioBoard.texture.needsUpdate = true;
    }
}

/** Draw the schedule board into any 2D context (the close-up overlay). */
export function drawStudioBoardTo(ctx, w, h) {
    drawScheduleBoard(ctx, w, h);
}

function createScheduleBoard() {
    const boardGroup = new THREE.Group();
    boardGroup.name = 'scheduleBoard';

    const canvas = makeCanvas(768, 448);
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    studioBoard = { canvas, ctx, texture };
    drawScheduleBoard(ctx, canvas.width, canvas.height);
    texture.needsUpdate = true;

    const board = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 1.5, 0.06),
        [
            lightMetal, lightMetal, lightMetal, lightMetal,
            new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 }),  // front (+Z)
            lightMetal
        ]
    );
    board.position.set(0, 0, 0);
    boardGroup.add(board);

    // Marker tray
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.1), lightMetal);
    tray.position.set(0, -0.79, 0.05);
    boardGroup.add(tray);

    const { board: spot } = LAYOUT;
    boardGroup.position.set(spot.x, 1.8, spot.z);
    boardGroup.rotation.y = Math.PI / 2;   // west wall, board face into the room (+X)

    registerOutdoorProp(boardGroup, 'board');
    studioGroup.add(boardGroup);
}

// ---- Posters ----
/** A bright procedural poster. kind: 'dance' | 'rhythms' | 'class'. */
function createPoster(kind, x, z, rotY) {
    const canvas = makeCanvas(256, 352);
    const ctx = canvas.getContext('2d');

    if (kind === 'dance') {
        ctx.fillStyle = '#ff2d78';
        ctx.fillRect(0, 0, 256, 352);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 52px "Segoe UI", Verdana, sans-serif';
        ['DANCE', 'SWEAT', 'SMILE'].forEach((word, i) => {
            ctx.fillText(word, 128, 96 + i * 72);
        });
        ctx.fillStyle = '#ffd23f';
        ctx.font = 'bold 30px "Segoe UI", Verdana, sans-serif';
        ctx.fillText('REPEAT', 128, 316);
    } else if (kind === 'rhythms') {
        ctx.fillStyle = '#3b1a5e';
        ctx.fillRect(0, 0, 256, 352);
        ctx.textAlign = 'center';
        const words = [
            ['SALSA', '#ff2d78'], ['MERENGUE', '#ffd23f'],
            ['CUMBIA', '#19c3b1'], ['REGGAETON', '#ff7a29']
        ];
        words.forEach(([word, color], i) => {
            ctx.fillStyle = color;
            ctx.font = 'bold 34px "Segoe UI", Verdana, sans-serif';
            ctx.fillText(word, 128, 84 + i * 64);
        });
        ctx.fillStyle = '#cfc6e2';
        ctx.font = '18px Georgia, serif';
        ctx.fillText('four rhythms, one big smile', 128, 322);
    } else {
        // 'class': the flyer, with a hand-drawn sunburst
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(0, 0, 256, 352);
        ctx.strokeStyle = '#ff7a29';
        ctx.lineWidth = 6;
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(128 + Math.cos(a) * 54, 120 + Math.sin(a) * 54);
            ctx.lineTo(128 + Math.cos(a) * 84, 120 + Math.sin(a) * 84);
            ctx.stroke();
        }
        ctx.fillStyle = '#e0257f';
        ctx.beginPath();
        ctx.arc(128, 120, 46, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 26px "Segoe UI", Verdana, sans-serif';
        ctx.fillText('ZUMBA', 128, 128);
        ctx.fillStyle = '#3a3f45';
        ctx.font = 'bold 24px "Segoe UI", Verdana, sans-serif';
        ctx.fillText('with ROQUI', 128, 218);
        ctx.font = '19px "Segoe UI", Verdana, sans-serif';
        ctx.fillText('Weekly at the', 128, 262);
        ctx.fillText('Matt Griffin YMCA', 128, 288);
        ctx.font = 'italic 16px Georgia, serif';
        ctx.fillText('schedule on the YMCA website', 128, 326);
    }

    const posterGroup = new THREE.Group();
    posterGroup.name = `poster_${kind}`;
    const poster = new THREE.Mesh(
        new THREE.PlaneGeometry(1.05, 1.45),
        new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), roughness: 0.9 })
    );
    posterGroup.add(poster);
    // Slim frame strips so it reads as mounted, not painted on
    const frameMaterial = darkMetal;
    [[0, 0.74, 1.13, 0.05], [0, -0.74, 1.13, 0.05]].forEach(([fx, fy, fw, fh]) => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.03), frameMaterial);
        strip.position.set(fx, fy, 0.01);
        posterGroup.add(strip);
    });

    posterGroup.position.set(x, 2.0, z);
    posterGroup.rotation.y = rotY;
    posterGroup.userData.posterKind = kind;
    registerOutdoorProp(posterGroup, 'poster');
    studioGroup.add(posterGroup);
}

// ---- Water break table ----
function createWaterTable() {
    const tableGroup = new THREE.Group();
    tableGroup.name = 'waterTable';

    // Folding table: white top, X-legs
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.62), tableTop);
    top.position.y = 0.74;
    top.castShadow = true;
    tableGroup.add(top);
    [-0.7, 0.7].forEach((lx) => {
        [-1, 1].forEach((dir) => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.78, 0.05), darkMetal);
            leg.position.set(lx, 0.36, 0);
            leg.rotation.x = dir * 0.32;
            tableGroup.add(leg);
        });
    });

    // Water bottles with bright caps
    const bottleBody = new THREE.MeshStandardMaterial({
        color: 0xd7ecf5, transparent: true, opacity: 0.55, roughness: 0.15
    });
    const capColors = [PALETTE.pink, PALETTE.teal, PALETTE.yellow, PALETTE.purple, PALETTE.orange];
    [-0.62, -0.34, -0.05, 0.24, 0.52].forEach((bx, i) => {
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.26, 10), bottleBody);
        bottle.position.set(bx, 0.9, (i % 2 === 0) ? -0.12 : 0.1);
        tableGroup.add(bottle);
        const cap = new THREE.Mesh(
            new THREE.CylinderGeometry(0.028, 0.028, 0.05, 10),
            new THREE.MeshStandardMaterial({ color: capColors[i], roughness: 0.5 })
        );
        cap.position.set(bx, 1.05, bottle.position.z);
        tableGroup.add(cap);
    });

    // A stack of towels
    const towelColors = [0xffffff, 0xffe9f2, 0xe4f7f5];
    towelColors.forEach((color, i) => {
        const towel = new THREE.Mesh(
            new THREE.BoxGeometry(0.34, 0.05, 0.24),
            new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
        );
        towel.position.set(0.72, 0.79 + i * 0.05, 0);
        towel.rotation.y = (i - 1) * 0.12;
        tableGroup.add(towel);
    });

    const { waterTable: spot } = LAYOUT;
    tableGroup.position.set(spot.x, 0, spot.z);
    tableGroup.rotation.y = -Math.PI / 2;   // long side against the east wall

    registerOutdoorProp(tableGroup, 'water');
    const box = new THREE.Box3().setFromObject(tableGroup);
    collisionBoxes.push({ box, type: 'decor' });
    studioGroup.add(tableGroup);
}

// ---- Gym bench by the door ----
function createGymBench() {
    const benchGroup = new THREE.Group();
    benchGroup.name = 'gymBench';

    const seat = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.07, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x9c7b52, roughness: 0.85 })
    );
    seat.position.y = 0.45;
    seat.castShadow = true;
    benchGroup.add(seat);
    [-0.75, 0.75].forEach((lx) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.36), darkMetal);
        leg.position.set(lx, 0.22, 0);
        benchGroup.add(leg);
    });

    // Somebody's gym bag tucked underneath
    const bag = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.26, 0.24),
        new THREE.MeshStandardMaterial({ color: PALETTE.purple, roughness: 0.8 })
    );
    bag.position.set(0.35, 0.14, 0.02);
    bag.rotation.y = 0.25;
    benchGroup.add(bag);

    const { bench: spot } = LAYOUT;
    benchGroup.position.set(spot.x, 0, spot.z);

    registerOutdoorProp(benchGroup, 'bench');
    const box = new THREE.Box3().setFromObject(benchGroup);
    collisionBoxes.push({ box, type: 'decor' });
    studioGroup.add(benchGroup);
}

function createStudioDressing() {
    createScheduleBoard();

    // Posters: one over the bench on the south wall, one each on the side
    // walls, at the LAYOUT spots the accent stripes leave clear
    createPoster('dance', -9.34, LAYOUT.posters.westZ, Math.PI / 2);     // west wall, faces +X
    createPoster('rhythms', 9.34, LAYOUT.posters.eastZ, -Math.PI / 2);   // east wall, faces -X
    createPoster('class', LAYOUT.posters.southX, 6.84, Math.PI);         // south wall, over the bench

    createWaterTable();
    createGymBench();

    // Plants soften the corners (shared furniture builders)
    const plantSpots = [
        { x: -8.7, z: 6.2, builder: createTallPlant },
        { x: 8.7, z: 6.2, builder: createFernPlant },
        { x: -8.7, z: -5.5, builder: createFernPlant }
    ];
    plantSpots.forEach((spot) => {
        const plant = spot.builder();
        plant.position.set(spot.x, 0, spot.z);
        registerOutdoorProp(plant, 'plant');
        studioGroup.add(plant);
        collisionBoxes.push({
            box: new THREE.Box3(
                new THREE.Vector3(spot.x - 0.35, 0, spot.z - 0.35),
                new THREE.Vector3(spot.x + 0.35, 1.2, spot.z + 0.35)
            ),
            type: 'decor'
        });
    });
}

// ============================================
// THE SOUND RIG (speakers + Roqui's iPhone)
// ============================================
let speakerRigs = [];        // [{ cones: [mesh...], led }]
let phoneScreen = null;      // { canvas, ctx, texture }

/** A PA speaker on a tripod stand. Returns { group, cones, led }. */
function createPASpeaker() {
    const group = new THREE.Group();
    group.name = 'paSpeaker';

    // Tripod
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 6), darkMetal);
        leg.position.set(Math.cos(a) * 0.26, 0.42, Math.sin(a) * 0.26);
        leg.rotation.z = Math.cos(a) * 0.55;
        leg.rotation.x = -Math.sin(a) * 0.55;
        group.add(leg);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), darkMetal);
    pole.position.y = 0.95;
    group.add(pole);

    // Cabinet
    const cabinet = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.82, 0.44),
        new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.8 })
    );
    cabinet.position.y = 1.78;
    cabinet.castShadow = true;
    group.add(cabinet);

    // Grille face, woofer, and tweeter (the cones pulse with the music)
    const grille = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.76),
        new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.95 })
    );
    grille.position.set(0, 1.78, 0.225);
    group.add(grille);

    const coneMaterial = new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 0.6 });
    const woofer = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.05, 20), coneMaterial);
    woofer.rotation.x = Math.PI / 2;
    woofer.position.set(0, 1.62, 0.23);
    group.add(woofer);
    const tweeter = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.04, 14), coneMaterial.clone());
    tweeter.rotation.x = Math.PI / 2;
    tweeter.position.set(0, 2.02, 0.23);
    group.add(tweeter);

    // Power LED, glows when the playlist runs
    const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x001100, emissiveIntensity: 1 })
    );
    led.position.set(0.2, 2.12, 0.23);
    group.add(led);

    return { group, cones: [woofer, tweeter], led };
}

function drawPhoneScreen(playing) {
    if (!phoneScreen) return;
    const { ctx, canvas, texture } = phoneScreen;
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = '#101014';
    ctx.fillRect(0, 0, W, H);

    // Album art: a bright gradient tile
    const art = ctx.createLinearGradient(0, H * 0.12, W, H * 0.5);
    art.addColorStop(0, '#ff2d78');
    art.addColorStop(0.5, '#ff7a29');
    art.addColorStop(1, '#ffd23f');
    ctx.fillStyle = art;
    ctx.fillRect(W * 0.14, H * 0.1, W * 0.72, H * 0.36);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `bold ${Math.round(H * 0.05)}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('♪', W / 2, H * 0.3);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(H * 0.045)}px -apple-system, sans-serif`;
    ctx.fillText("Roqui's Zumba Mix", W / 2, H * 0.56);
    ctx.fillStyle = '#9aa0a8';
    ctx.font = `${Math.round(H * 0.038)}px -apple-system, sans-serif`;
    ctx.fillText(playing ? 'Now playing · Merengue' : 'Paused · tap the speaker', W / 2, H * 0.63);

    // Progress bar
    ctx.fillStyle = '#33363d';
    ctx.fillRect(W * 0.14, H * 0.7, W * 0.72, H * 0.015);
    ctx.fillStyle = '#ff2d78';
    ctx.fillRect(W * 0.14, H * 0.7, W * 0.72 * 0.37, H * 0.015);

    // Play / pause glyph
    ctx.fillStyle = '#ffffff';
    if (playing) {
        ctx.fillRect(W * 0.42, H * 0.78, W * 0.055, H * 0.09);
        ctx.fillRect(W * 0.525, H * 0.78, W * 0.055, H * 0.09);
    } else {
        ctx.beginPath();
        ctx.moveTo(W * 0.44, H * 0.77);
        ctx.lineTo(W * 0.44, H * 0.88);
        ctx.lineTo(W * 0.58, H * 0.825);
        ctx.closePath();
        ctx.fill();
    }

    texture.needsUpdate = true;
}

/** The little table by the right speaker holding Roqui's iPhone. */
function createPhoneTable() {
    const group = new THREE.Group();
    group.name = 'phoneTable';

    const top = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.5), tableTop);
    top.position.y = 0.76;
    group.add(top);
    [[-0.24, -0.19], [0.24, -0.19], [-0.24, 0.19], [0.24, 0.19]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.76, 0.04), darkMetal);
        leg.position.set(lx, 0.38, lz);
        group.add(leg);
    });

    // The iPhone, propped on a little stand, screen toward the room
    const phone = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.085, 0.175, 0.012),
        new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.3, metalness: 0.6 })
    );
    phone.add(body);

    const canvas = makeCanvas(128, 256);
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    phoneScreen = { canvas, ctx, texture };
    drawPhoneScreen(false);

    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.078, 0.165),
        new THREE.MeshStandardMaterial({
            map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.55,
            roughness: 0.4
        })
    );
    screen.position.z = 0.0075;
    phone.add(screen);

    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.09), lightMetal);
    stand.position.set(0, -0.085, -0.035);
    phone.add(stand);

    phone.position.set(0, 0.87, 0.05);
    phone.rotation.x = -0.32;             // leaned back on its stand
    group.add(phone);

    const { phoneTable: spot } = LAYOUT;
    group.position.set(spot.x, 0, spot.z);
    group.rotation.y = 0.15;              // angled a touch toward Roqui

    registerOutdoorProp(group, 'iphone');
    const box = new THREE.Box3().setFromObject(group);
    collisionBoxes.push({ box, type: 'decor' });
    studioGroup.add(group);
    return group;
}

/** A slack cable between two floor points (both speakers run to the phone). */
function createCable(from, to) {
    const mid = new THREE.Vector3((from.x + to.x) / 2, 0.02, (from.z + to.z) / 2);
    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(from.x, 0.6, from.z),
        new THREE.Vector3(from.x * 0.7 + to.x * 0.3, 0.04, from.z * 0.7 + to.z * 0.3),
        mid,
        new THREE.Vector3(to.x, 0.55, to.z)
    ]);
    const cable = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.012, 6, false),
        new THREE.MeshStandardMaterial({ color: 0x151619, roughness: 0.8 })
    );
    return cable;
}

function createSoundRig() {
    speakerRigs = [];

    LAYOUT.speakers.forEach((spot) => {
        const rig = createPASpeaker();
        rig.group.position.set(spot.x, 0, spot.z);
        rig.group.rotation.y = spot.rotY;
        registerOutdoorProp(rig.group, 'speakers');
        studioGroup.add(rig.group);
        speakerRigs.push(rig);

        collisionBoxes.push({
            box: new THREE.Box3(
                new THREE.Vector3(spot.x - 0.45, 0, spot.z - 0.45),
                new THREE.Vector3(spot.x + 0.45, 2.3, spot.z + 0.45)
            ),
            type: 'decor'
        });

        // Cable from this speaker to the phone table
        studioGroup.add(createCable(spot, LAYOUT.phoneTable));

        // Mirror twin of the speaker (visual only)
        const twin = createPASpeaker();
        twin.group.position.set(spot.x, 0, mirrorZOf(spot.z));
        twin.group.rotation.y = mirrorRotYOf(spot.rotY);
        applyMirrorTint(twin.group);
        studioGroup.add(twin.group);
        speakerRigs.push(twin);   // twins pulse too — the mirror keeps the beat
    });

    const phoneTable = createPhoneTable();

    // Mirror twin of the phone table (a simple untextured stand-in is enough
    // at that distance, so reuse the real builder minus the live screen).
    const tableTwin = phoneTable.clone(true);
    tableTwin.position.set(LAYOUT.phoneTable.x, 0, mirrorZOf(LAYOUT.phoneTable.z));
    tableTwin.rotation.y = mirrorRotYOf(0.15);
    applyMirrorTint(tableTwin);
    studioGroup.add(tableTwin);
}

// ============================================
// PARTY MODE (lights down when the music is up)
// ============================================
// When the playlist runs, the room dims toward club lighting so the disco
// ball, the sweeping floor dots, and the glowing screens carry the mood.
// The visitor's Ambient Brightness slider and the party dim multiply
// together: the slider sets the room's normal level, the party factor eases
// between that level and the club level as the music toggles, and the
// ceiling panels switch to their dark look while it plays.
const PARTY_DIM = 0.25;              // club level, as a fraction of normal
const MIRROR_FILL_INTENSITY = 1.1;   // the reflection chamber's normal fill
const PARTY_SUN_FLOOR = 0.35;        // the sun never fully sets: outside stays readable

const mirrorFills = [];   // the chamber's fill lights, dimmed in step
let userBrightness = 1;   // the visitor's slider value (1 = normal)
let partyFactor = 1;      // eased toward PARTY_DIM while the music plays

/** Apply the combined lighting level to the shared rig and the mirror fills. */
function applyStudioLighting() {
    const effective = userBrightness * partyFactor;
    setInteriorLightScale(effective);
    mirrorFills.forEach((fill) => { fill.intensity = MIRROR_FILL_INTENSITY * effective; });
}

// The rig's dimmer only reaches its own lights. Most of the room's base
// brightness actually comes from four lights outside it: the scene's global
// ambient and hemisphere fills, the sun, and the rig's hemisphere floor
// (deliberately exempt from the visitor dimmer). Party mode pulls those down
// too, or the club never gets dark. updateDayNightCycle rewrites the scene
// lights' intensities every frame (frozen at noon here), so this multiplies
// the just-written values and MUST run after it — main.js orders the update
// loop accordingly.
let _partyLights = null;

function applyPartyLighting() {
    if (partyFactor > 0.999) return;   // house lights fully up: nothing to scale
    if (!_partyLights) {
        const scene = getScene();
        const world = getWorldGroup();
        _partyLights = [
            { light: scene && scene.getObjectByName('ambientLight'), floor: 0 },
            { light: scene && scene.getObjectByName('hemiLight'), floor: 0 },
            { light: scene && scene.getObjectByName('dirLight'), floor: PARTY_SUN_FLOOR },
            { light: world && world.getObjectByName('interiorHemiLight'), floor: 0 }
        ].filter((entry) => entry.light);
    }
    _partyLights.forEach(({ light, floor }) => {
        light.intensity *= Math.max(partyFactor, floor);
    });
}

/** The visitor's Ambient Brightness slider (main.js). Stored separately from
 *  the party dim so the two never fight over the shared rig's one dial. */
export function setStudioBrightness(value) {
    userBrightness = Math.max(0, value);
    applyStudioLighting();
}

// ============================================
// THE DISCO BALL
// ============================================
let discoBall = null;
let discoDots = null;
let discoLight = null;   // soft pink glow that pulses with the kick in party mode

function createDiscoBall() {
    const { discoBall: spot, room } = LAYOUT;

    const buildBall = () => {
        const group = new THREE.Group();
        group.name = 'discoBall';

        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, room.height - spot.y - 0.25, 6), darkMetal);
        rod.position.y = (room.height - spot.y + 0.25) / 2;
        group.add(rod);

        const ball = new THREE.Mesh(
            new THREE.SphereGeometry(0.42, 22, 14),
            new THREE.MeshStandardMaterial({
                color: 0xd9dee4, roughness: 0.12, metalness: 0.95, flatShading: true
            })
        );
        ball.castShadow = true;
        group.add(ball);

        // A few bright facets that read as glints from any angle
        for (let i = 0; i < 10; i++) {
            const glint = new THREE.Mesh(
                new THREE.PlaneGeometry(0.07, 0.07),
                new THREE.MeshBasicMaterial({
                    color: 0xffffff, transparent: true, opacity: 0.75, side: THREE.DoubleSide
                })
            );
            const a = Math.random() * Math.PI * 2;
            const b = (Math.random() - 0.5) * Math.PI * 0.8;
            glint.position.set(
                Math.cos(a) * Math.cos(b) * 0.43,
                Math.sin(b) * 0.43,
                Math.sin(a) * Math.cos(b) * 0.43
            );
            glint.lookAt(glint.position.clone().multiplyScalar(2));
            ball.add(glint);
        }
        return group;
    };

    discoBall = buildBall();
    discoBall.position.set(spot.x, spot.y, spot.z);
    registerOutdoorProp(discoBall, 'disco');
    studioGroup.add(discoBall);

    // The party glow: a soft pink light under the ball, off until the music
    // plays, then pulsing with the kick so the dancers catch some color in
    // the dimmed room. Gentle sinusoidal breathing, never a hard strobe.
    discoLight = new THREE.PointLight(0xff66aa, 0, 13, 1.2);
    discoLight.position.set(spot.x, spot.y - 0.6, spot.z);
    discoLight.name = 'discoGlow';
    studioGroup.add(discoLight);

    // Its reflection
    const twin = buildBall();
    twin.position.set(spot.x, spot.y, mirrorZOf(spot.z));
    applyMirrorTint(twin);
    studioGroup.add(twin);

    // Colored light dots that sweep the floor while the music plays
    discoDots = new THREE.Group();
    discoDots.name = 'discoDots';
    const dotColors = [PALETTE.pink, PALETTE.teal, PALETTE.yellow, PALETTE.purple, 0xffffff];
    dotColors.forEach((color, i) => {
        const dot = new THREE.Mesh(
            new THREE.CircleGeometry(0.16, 12),
            new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: 0.35,
                blending: THREE.AdditiveBlending, depthWrite: false
            })
        );
        const a = (i / dotColors.length) * Math.PI * 2;
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(Math.cos(a) * (1.6 + i * 0.3), 0.03, Math.sin(a) * (1.6 + i * 0.3));
        discoDots.add(dot);
    });
    discoDots.position.set(spot.x, 0, spot.z);
    discoDots.visible = false;   // only while the playlist runs
    studioGroup.add(discoDots);
}

// ============================================
// THE EXTERIOR (seen through the south windows)
// ============================================
function createExterior() {
    const outsideGroup = new THREE.Group();
    outsideGroup.name = 'outside';

    // Lawn
    const lawn = new THREE.Mesh(
        new THREE.PlaneGeometry(130, 130),
        new THREE.MeshStandardMaterial({ color: 0x5a8f4a, roughness: 0.95 })
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(0, -0.02, 20);
    lawn.receiveShadow = true;
    outsideGroup.add(lawn);

    // A handful of trees and bushes framed by the windows
    const treeSpots = isMobileDevice()
        ? [{ x: -6, z: 12 }, { x: 0, z: 15 }]
        : [{ x: -8, z: 12 }, { x: -3, z: 15 }, { x: 2, z: 11 }, { x: 7, z: 16 }, { x: -12, z: 17 }];
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
        outsideGroup.add(tree);
    });

    studioGroup.add(outsideGroup);
}

// ============================================
// ROQUI AND HER CLASS
// ============================================
// Everyone dancing is a "performer": a rig around a shared-parts person, plus
// a mirror twin in the reflection chamber. Roqui leads; the class follows.

// Roqui's look, matched to the reference Steve picked out (specs/npc-1.png):
// warm tan skin, dark brown hair, hot pink top, teal capri leggings, purple
// sneakers, yellow headband.
const ROQUI_SKIN = 0xc68642;
const ROQUI_HAIR = 0x3a2a1a;

// The six regulars. Bright colors per the spec; nobody in jeans, dresses, or
// long sleeves (short sleeves are the person builder's default). legs:
// 'leggings' keeps the trousers, 'shorts' bares knee and shin, 'capri' just
// the shin. lag/amp/catchup shape how faithfully each one shadows Roqui.
const DANCER_CASTS = [
    { shirt: PALETTE.teal,   pants: 0x23262b, skin: 0x8d5524, hair: 0x1e150e, hairStyle: 'long',  legs: 'leggings', shoes: PALETTE.yellow, headband: PALETTE.pink,  lag: 0.34, amp: 0.95, catchup: 0.5, x: -2.7,  z: -0.7 },
    { shirt: PALETTE.yellow, pants: 0x5b2a86, skin: 0xffdbac, hair: 0xb3552e, hairStyle: 'long',  legs: 'shorts',   shoes: PALETTE.teal,   headband: null,          lag: 0.52, amp: 1.05, catchup: 0.9, x: 0.1,   z: -0.7 },
    { shirt: PALETTE.orange, pants: 0x3c4048, skin: 0xe0ac69, hair: 0x2c1810, hairStyle: 'short', legs: 'shorts',   shoes: 0xffffff,       headband: null,          lag: 0.28, amp: 0.9,  catchup: 0.3, x: 2.8,   z: -0.7 },
    { shirt: 0x2f9bff,       pants: 0x2b2d33, skin: 0xf1c27d, hair: 0xd9a441, hairStyle: 'short', legs: 'shorts',   shoes: PALETTE.orange, headband: null,          lag: 0.6,  amp: 1.0,  catchup: 1.2, x: -2.9,  z: 1.7 },
    { shirt: PALETTE.lime,   pants: 0x23262b, skin: 0xffe0bd, hair: 0x8a8a8a, hairStyle: 'short', legs: 'shorts',   shoes: 0x2c3e50,       headband: null,          lag: 0.75, amp: 0.8,  catchup: 1.5, x: -0.1,  z: 1.7 },
    { shirt: PALETTE.purple, pants: 0xff8fc0, skin: 0x9c6b3f, hair: 0x14100c, hairStyle: 'short', legs: 'leggings', shoes: PALETTE.lime,   headband: PALETTE.teal,  lag: 0.42, amp: 1.1,  catchup: 0.7, x: 2.6,   z: 1.7 }
];

let performers = [];   // [{ rig, twinRig, profile, paused, pose, base }]
let roquiPerformer = null;

/** Bare some leg below the hip hinge: 'shorts' turns knee and shin to skin,
 *  'capri' only the shin. (Same geometry walk the trail theme used for bike
 *  shorts: leg groups are the untagged groups hinged at y 0.75, and inside
 *  them the knee sits at y -0.375 and the shin at y -0.5625.) */
function applyGymLegs(person, skinTone, style) {
    if (style === 'leggings') return;
    const skin = new THREE.MeshStandardMaterial({ color: skinTone, roughness: 0.8, metalness: 0.05 });
    const cutoff = style === 'capri' ? -0.5 : -0.3;
    person.children.forEach((group) => {
        if (!group.isGroup || group.userData.isArm) return;
        if (Math.abs(group.position.y - 0.75) > 0.02) return;
        group.children.forEach((part) => {
            if (part.isMesh && part.position.y < cutoff && part.position.y > -0.7) {
                part.material = skin;
            }
        });
    });
}

/** Recolor the default black shoes into proper dance-floor sneakers. */
function applySneakers(person, color) {
    const sneaker = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 });
    person.children.forEach((group) => {
        if (!group.isGroup || group.userData.isArm) return;
        if (Math.abs(group.position.y - 0.75) > 0.02) return;
        group.children.forEach((part) => {
            if (part.isMesh && part.position.y < -0.7) {
                part.material = sneaker;
            }
        });
    });
}

/** A bright headband across the forehead hairline. */
function createHeadband(color) {
    const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.124, 0.014, 6, 16),
        new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
    );
    band.rotation.x = Math.PI / 2 - 0.18;
    band.position.set(0, 1.565, 0);
    return band;
}

/** Sweatbands at both wrists. */
function addWristbands(person, color) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    person.children.forEach((group) => {
        if (!group.isGroup || !group.userData.isArm) return;
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.013, 6, 12), material);
        band.rotation.x = Math.PI / 2;
        band.position.set(0, -0.42, 0);
        group.add(band);
    });
}

/** Build Roqui herself, with love: tan skin, dark brown shoulder-length
 *  hair with bangs, big brown eyes, a big smile with the white teeth
 *  showing, slightly below average height, a curvy figure, and an outfit as
 *  bright as the class she runs (colors matched to the specs/npc-1.png
 *  reference Steve picked out). */
function buildRoqui() {
    // Built as a 'pedestrian', not a 'shopkeeper': the shared person builder
    // gives shopkeepers its neat short hair no matter what hairStyle asks
    // for, and Roqui's shoulder-length hair (the long style's crown, back
    // curtain, and face-framing locks) only grows on the other roles. The
    // greeter click path keys off userData.isShopkeeper, which is retagged
    // by hand right below.
    const roqui = createPerson({
        role: 'pedestrian',
        x: 0,
        z: 0,
        rotationY: 0,
        shirtColor: PALETTE.pink,      // hot pink tank
        pantsColor: 0x0f7f8b,          // teal capri leggings
        skinTone: ROQUI_SKIN,
        hairColor: ROQUI_HAIR,         // dark brown
        hairStyle: 'long',             // just past the shoulders
        hasApron: false,
        bald: false,
        muscular: false,
        dressShirt: false              // short sleeves, always
    });
    roqui.userData.isShopkeeper = true;   // the "say hola" click/hover path
    roqui.userData.isPedestrian = false;  // and nothing treats her as a walker

    const headY = 1.5;

    // Bangs: a soft fringe across the forehead (the long style leaves it bare)
    const hairMaterial = new THREE.MeshStandardMaterial({ color: ROQUI_HAIR, roughness: 0.9 });
    const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.055, 0.045), hairMaterial);
    bangs.position.set(0, headY + 0.085, 0.093);
    bangs.rotation.x = 0.25;
    roqui.add(bangs);

    // (No gray streaks: the spec mentions a touch of gray, but at this poly
    // count they read as objects in her hair rather than color in it, so her
    // hair stays uniformly dark brown by Steve's call.)

    // Big brown eyes: enlarge the whites and warm up the pupils
    roqui.traverse((child) => {
        if (child.userData && child.userData.isPupil) {
            child.material.color.setHex(0x5b3a1e);   // big brown eyes
            child.scale.setScalar(1.3);
        } else if (child.isMesh && child.geometry &&
            child.geometry.type === 'SphereGeometry' &&
            Math.abs(child.position.y - (headY + 0.02)) < 0.005 &&
            Math.abs(Math.abs(child.position.x) - 0.035) < 0.005) {
            child.scale.x = 1.3;
            child.scale.y = 1.3;   // (z stays flattened as built)
        }
    });

    // The smile that lights up the room: a real crescent, corners curving up,
    // white teeth showing. Two stacked crescent shapes do it: a dark lip
    // crescent behind, a slightly smaller white teeth crescent riding a
    // millimeter and a half proud of it, so the lips read as the outline.
    // Each crescent is one Shape: the outer (lower) arc swept left to right
    // under the mouth center, closed by a shallower inner arc back, which
    // tapers the tips the way a grin does.
    const smileCrescent = (outerR, innerR) => {
        const shape = new THREE.Shape();
        shape.absarc(0, 0, outerR, Math.PI * 1.12, Math.PI * 1.88, false);
        shape.absarc(0, 0, innerR, Math.PI * 1.88, Math.PI * 1.12, true);
        return new THREE.ShapeGeometry(shape, 12);
    };
    const lips = new THREE.Mesh(
        smileCrescent(0.046, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x8e3b30, roughness: 0.6 })
    );
    lips.position.set(0, headY - 0.026, 0.1105);
    roqui.add(lips);
    const teeth = new THREE.Mesh(
        smileCrescent(0.041, 0.024),
        new THREE.MeshStandardMaterial({ color: 0xf7f5ef, roughness: 0.35 })
    );
    teeth.position.set(0, headY - 0.026, 0.112);
    roqui.add(teeth);

    // Kit: headband, wristbands, capris baring the shin, bright sneakers
    roqui.add(createHeadband(PALETTE.yellow));
    addWristbands(roqui, PALETTE.teal);
    applyGymLegs(roqui, ROQUI_SKIN, 'capri');
    applySneakers(roqui, PALETTE.purple);

    // Slightly below average height, curvy in a good way: a touch shorter,
    // a touch fuller. Kept subtle and kind.
    roqui.scale.set(1.03, 0.94, 1.05);

    return roqui;
}

/** Build one of the class regulars from their cast entry. */
function buildDancer(cast) {
    const dancer = createPerson({
        role: 'pedestrian',
        x: 0,
        z: 0,
        rotationY: 0,
        shirtColor: cast.shirt,
        pantsColor: cast.pants,
        skinTone: cast.skin,
        hairColor: cast.hair,
        hairStyle: cast.hairStyle,
        dressShirt: false
    });
    applyGymLegs(dancer, cast.skin, cast.legs);
    applySneakers(dancer, cast.shoes);
    if (cast.headband) dancer.add(createHeadband(cast.headband));
    return dancer;
}

/** Cache the pose-able parts of a person group: the two arm groups (tagged
 *  isArm) and the two leg groups (the untagged groups hinged at y 0.75),
 *  keyed by which side of the body they hang on. */
function buildRig(person, baseX, baseZ, baseRotY) {
    const rig = { group: person, baseX, baseZ, baseRotY, armP: null, armN: null, legP: null, legN: null };
    person.children.forEach((group) => {
        if (!group.isGroup) return;
        if (group.userData.isArm) {
            if (group.position.x > 0) rig.armP = group; else rig.armN = group;
        } else if (Math.abs(group.position.y - 0.75) < 0.02) {
            if (group.position.x > 0) rig.legP = group; else rig.legN = group;
        }
    });
    person.position.set(baseX, 0, baseZ);
    person.rotation.y = baseRotY;
    return rig;
}

function createRoquiAndClass() {
    performers = [];

    const peopleGroup = new THREE.Group();
    peopleGroup.name = 'studioPeople';

    // --- Roqui, front and center, facing her class ---
    const { roqui: roquiSpot } = LAYOUT;
    const roqui = buildRoqui();
    const roquiRig = buildRig(roqui, roquiSpot.x, roquiSpot.z, 0);
    peopleGroup.add(roqui);

    const roquiTwin = buildRoqui();
    applyMirrorTint(roquiTwin);
    const roquiTwinRig = buildRig(roquiTwin, roquiSpot.x, mirrorZOf(roquiSpot.z), mirrorRotYOf(0));
    peopleGroup.add(roquiTwin);

    roquiPerformer = {
        rig: roquiRig,
        twinRig: roquiTwinRig,
        profile: { lag: 0, amp: 1.15, catchup: 0, wobblePhase: 0, leader: true },
        paused: false,
        pose: null
    };
    performers.push(roquiPerformer);

    // Floating ¡Hola! sign above her, only when the config asks for one
    // (ROQUI_CONFIG.greeterSign). Off by default here: Roqui is the first
    // greeter without a floating tag, and the shared parts are already
    // null-safe when no sign is registered (updateCheckoutSign and
    // getHelpSign both guard), so off simply means never built.
    if (ROQUI_CONFIG.greeterSign && ROQUI_CONFIG.greeterSign.enabled) {
        const sign = createHelpSign(roquiSpot.x, roquiSpot.z);
        repaintSignAsHola(sign);
        peopleGroup.add(sign);
        setHelpSign(sign);
    }

    // Collision so visitors keep a polite distance from the instructor
    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(roquiSpot.x - 0.45, 0, roquiSpot.z - 0.4),
            new THREE.Vector3(roquiSpot.x + 0.45, 1.8, roquiSpot.z + 0.4)
        ),
        type: 'host'
    });

    // --- The class ---
    const count = Math.min(
        (ROQUI_CONFIG.dancers && ROQUI_CONFIG.dancers.count) || 6,
        DANCER_CASTS.length
    );
    for (let i = 0; i < count; i++) {
        const cast = DANCER_CASTS[i];
        const dancer = buildDancer(cast);
        dancer.userData.isDancer = true;
        dancer.userData.dancerIndex = i;
        const rig = buildRig(dancer, cast.x, cast.z, Math.PI);   // facing Roqui (−Z)
        peopleGroup.add(dancer);

        const twin = buildDancer(cast);
        applyMirrorTint(twin);
        const twinRig = buildRig(twin, cast.x, mirrorZOf(cast.z), mirrorRotYOf(Math.PI));
        peopleGroup.add(twin);

        performers.push({
            rig,
            twinRig,
            profile: { lag: cast.lag, amp: cast.amp, catchup: cast.catchup, wobblePhase: i * 1.7, leader: false },
            paused: false,
            pose: null
        });

        // Dancers hold their spot (the moves shift them at most half a meter)
        collisionBoxes.push({
            box: new THREE.Box3(
                new THREE.Vector3(cast.x - 0.55, 0, cast.z - 0.35),
                new THREE.Vector3(cast.x + 0.55, 1.8, cast.z + 0.35)
            ),
            type: 'dancer'
        });
    }

    studioGroup.add(peopleGroup);

    // A reduced-motion class holds a warm, still pose instead of dancing.
    if (_reducedMotion.matches) {
        performers.forEach((p) => {
            applyPose(p.rig, STILL_POSE, false);
            applyPose(p.twinRig, STILL_POSE, true);
        });
    }
}

/** Repaint the shared floating sign to say ¡Hola! (createHelpSign hardcodes
 *  "Help", and the shared 1.0.0 files are frozen, so the texture is swapped
 *  here in experience code). Hot pink, like the rest of her kit. */
function repaintSignAsHola(sign) {
    const canvas = makeCanvas(256, 128);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#e0257f';
    ctx.beginPath();
    ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 20);
    ctx.fill();
    ctx.strokeStyle = '#ff8fbf';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('¡Hola!', canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    sign.traverse((child) => {
        if (child.isMesh && child.material && child.material.map) {
            child.material.map = texture;
            child.material.needsUpdate = true;
        } else if (child.isMesh && child.material && child.material.color) {
            // The glow plane behind the sign follows the new pink
            child.material.color.setHex(0xff8fbf);
        }
    });
}

// ============================================
// THE DANCE ENGINE
// ============================================
// One clock, in beats. Roqui dances the routine exactly on it; each dancer
// follows at (beats - lag) with their own amplitude, a light personal wobble,
// and a brief hesitation at move changes. The pose math is pure: beats and a
// profile in, a pose out. All the statefulness lives in updateStudio's
// smoothing pass.

const BEATS_PER_SEGMENT = 8;

/** A neutral standing pose (also the base every move starts from). */
function neutralPose() {
    return {
        bounce: 0, sway: 0, hipShift: 0, yawOffset: 0,
        armP: { swing: 0.08, lift: 0.06 },
        armN: { swing: 0.08, lift: 0.06 },
        legP: 0, legN: 0
    };
}

// The still pose reduced-motion visitors see: relaxed, friendly, hands ready.
const STILL_POSE = (() => {
    const pose = neutralPose();
    pose.armP.swing = 0.3; pose.armP.lift = 0.25;
    pose.armN.swing = 0.3; pose.armN.lift = 0.25;
    return pose;
})();

// ---- The move library ----
// Each move maps a beat position b (0..8 within its segment) to a pose.
// swing is radians forward, lift is radians out and up; the applier handles
// the side-specific signs. sin(PI*b) completes a cycle every two beats: one
// step per beat, the fitness-class pulse.

function moveMarch(b) {
    const pose = neutralPose();
    const s = Math.sin(Math.PI * b);
    pose.legP = 0.45 * s;
    pose.legN = -0.45 * s;
    pose.armP.swing = 0.15 - 0.5 * s;
    pose.armN.swing = 0.15 + 0.5 * s;
    pose.armP.lift = 0.18;
    pose.armN.lift = 0.18;
    pose.bounce = 0.045 * Math.abs(s);
    pose.sway = 0.03 * s;
    return pose;
}

function moveSalsa(b) {
    const pose = neutralPose();
    const s = Math.sin(Math.PI * b);
    const quick = Math.sin(Math.PI * 2 * b);
    pose.hipShift = 0.22 * s;
    pose.sway = 0.09 * s;
    pose.bounce = 0.03 * Math.abs(quick);
    pose.armP.swing = 0.5 + 0.25 * quick;
    pose.armN.swing = 0.5 - 0.25 * quick;
    pose.armP.lift = 0.38;
    pose.armN.lift = 0.38;
    pose.legP = 0.18 * Math.max(0, s);
    pose.legN = 0.18 * Math.max(0, -s);
    return pose;
}

function moveCumbia(b) {
    const pose = neutralPose();
    const s = Math.sin(Math.PI * b);
    pose.yawOffset = 0.3 * s;
    pose.armP.swing = 0.8 * s;
    pose.armN.swing = -0.8 * s;
    pose.armP.lift = 0.28;
    pose.armN.lift = 0.28;
    pose.legP = 0.25 * s;
    pose.legN = -0.25 * s;
    pose.hipShift = 0.06 * s;
    pose.bounce = 0.03 * Math.abs(s);
    return pose;
}

function moveRaise(b) {
    const pose = neutralPose();
    const s = Math.sin(Math.PI * b);
    const pump = Math.sin(Math.PI * 2 * b);
    pose.armP.swing = 0.15;
    pose.armN.swing = 0.15;
    pose.armP.lift = 2.45 + 0.3 * pump;
    pose.armN.lift = 2.45 - 0.3 * pump;
    pose.bounce = 0.05 * Math.abs(s);
    pose.hipShift = 0.12 * s;
    pose.legP = 0.2 * Math.max(0, s);
    pose.legN = 0.2 * Math.max(0, -s);
    pose.sway = 0.04 * s;
    return pose;
}

function moveGrapevine(b) {
    const pose = neutralPose();
    // Triangle wave, period 4 beats: travel right, come back, travel left
    const p = (b % 4) / 4;
    const tri = p < 0.5 ? (p * 4 - 1) : (3 - 4 * p);
    const quick = Math.sin(Math.PI * 2 * b);
    pose.hipShift = 0.5 * tri;
    pose.legP = 0.3 * quick;
    pose.legN = -0.3 * quick;
    pose.armP.swing = 0.1;
    pose.armN.swing = 0.1;
    pose.armP.lift = 1.15 + 0.15 * quick;
    pose.armN.lift = 1.15 - 0.15 * quick;
    pose.bounce = 0.035 * Math.abs(quick);
    pose.sway = 0.05 * tri;
    return pose;
}

function moveClap(b) {
    const pose = neutralPose();
    const s = Math.sin(Math.PI * b);
    const beatPulse = Math.max(0, Math.sin(Math.PI * 2 * b));
    pose.armP.swing = 1.05;
    pose.armN.swing = 1.05;
    // Hands spread a little between beats and sweep together in front on
    // every beat: the clap. Lift is outward, so the meet is a slight
    // negative (inward past parallel) at the pulse peak.
    pose.armP.lift = 0.35 - 0.45 * beatPulse;
    pose.armN.lift = 0.35 - 0.45 * beatPulse;
    pose.bounce = 0.05 * Math.abs(s);
    pose.legP = 0.15 * Math.max(0, s);
    pose.legN = 0.15 * Math.max(0, -s);
    pose.sway = 0.03 * s;
    return pose;
}

function moveSpin(b) {
    const pose = neutralPose();
    const s = Math.sin(Math.PI * b);
    // A full turn across beats 2..6, eased at both ends
    const raw = Math.min(1, Math.max(0, (b - 2) / 4));
    const eased = raw * raw * (3 - 2 * raw);
    pose.yawOffset = Math.PI * 2 * eased;
    pose.armP.swing = 0.2;
    pose.armN.swing = 0.2;
    pose.armP.lift = 1.3;
    pose.armN.lift = 1.3;
    pose.legP = 0.3 * s;
    pose.legN = -0.3 * s;
    pose.bounce = 0.04 * Math.abs(s);
    return pose;
}

// The routine: a 64-beat loop of 8-beat segments. Salsa comes around twice
// because salsa always comes around twice.
const ROUTINE = [moveMarch, moveSalsa, moveCumbia, moveRaise, moveSalsa, moveGrapevine, moveClap, moveSpin];

/** Which routine segment a beat count falls in. */
function routineIndexAt(beats) {
    const seg = Math.floor(Math.max(0, beats) / BEATS_PER_SEGMENT);
    return seg % ROUTINE.length;
}

/** Field-wise linear blend between two poses (t 0..1). */
function lerpPose(a, b, t) {
    const mix = (x, y) => x + (y - x) * t;
    return {
        bounce: mix(a.bounce, b.bounce),
        sway: mix(a.sway, b.sway),
        hipShift: mix(a.hipShift, b.hipShift),
        yawOffset: mix(a.yawOffset, b.yawOffset),
        armP: { swing: mix(a.armP.swing, b.armP.swing), lift: mix(a.armP.lift, b.armP.lift) },
        armN: { swing: mix(a.armN.swing, b.armN.swing), lift: mix(a.armN.lift, b.armN.lift) },
        legP: mix(a.legP, b.legP),
        legN: mix(a.legN, b.legN)
    };
}

/** Scale a pose's energy toward/away from neutral. yawOffset is exempt on
 *  purpose: scaling a full spin would leave a dancer facing the wall. */
function scalePoseAmp(pose, amp) {
    const n = neutralPose();
    const s = (v, base) => base + (v - base) * amp;
    pose.bounce = s(pose.bounce, 0);
    pose.sway = s(pose.sway, 0);
    pose.hipShift = s(pose.hipShift, 0);
    pose.armP.swing = s(pose.armP.swing, n.armP.swing);
    pose.armP.lift = s(pose.armP.lift, n.armP.lift);
    pose.armN.swing = s(pose.armN.swing, n.armN.swing);
    pose.armN.lift = s(pose.armN.lift, n.armN.lift);
    pose.legP = s(pose.legP, 0);
    pose.legN = s(pose.legN, 0);
    return pose;
}

/**
 * The pure heart of the class: the pose for any performer at any moment.
 *
 * profile: { lag, amp, catchup, wobblePhase, leader }
 *  - lag: how many beats behind Roqui this dancer runs (0 for Roqui)
 *  - amp: their energy relative to the routine (Roqui runs above 1)
 *  - catchup: extra beats they linger on the previous move at a change
 *  - wobblePhase: seeds a light personal sway so no two bodies are identical
 *  - leader: Roqui cues the next move with a raised arm at segment end
 */
function computeDancePose(beats, profile) {
    const eff = Math.max(0, beats - profile.lag);
    const idx = routineIndexAt(eff);
    const b = eff % BEATS_PER_SEGMENT;
    const cur = ROUTINE[idx];
    const prev = ROUTINE[(idx + ROUTINE.length - 1) % ROUTINE.length];

    // Crossfade from the previous move; followers start the fade late
    // (their catchup), which reads as "oh! new move" a half beat after
    // Roqui has already switched.
    const fadeStart = profile.catchup || 0;
    const t = Math.min(1, Math.max(0, (b - fadeStart) / 1.0));
    const smooth = t * t * (3 - 2 * t);
    // The previous move continues past its segment end (b + 8) so the blend
    // source keeps moving instead of freezing mid-step.
    const pose = lerpPose(prev(b + BEATS_PER_SEGMENT), cur(b), smooth);

    scalePoseAmp(pose, profile.amp);

    // Personal wobble: no two dancers are the same body
    if (profile.wobblePhase) {
        pose.sway += 0.025 * Math.sin(beats * 0.7 + profile.wobblePhase);
        pose.bounce += 0.004 * (1 + Math.sin(beats * 1.3 + profile.wobblePhase));
    }

    // Roqui cues the change: last beat of each segment, her arm goes up
    if (profile.leader && b > 6.9) {
        const cue = Math.min(1, (b - 6.9) / 0.5);
        pose.armP.lift = pose.armP.lift + (2.9 - pose.armP.lift) * cue;
        pose.armP.swing = pose.armP.swing * (1 - cue) + 0.1 * cue;
    }

    return pose;
}

/** Write a pose onto a rig. Mirrored rigs (the twins) get the true mirror
 *  image: sides swapped and every lateral term negated. */
function applyPose(rig, pose, mirrored) {
    const hip = mirrored ? -pose.hipShift : pose.hipShift;
    const sway = mirrored ? -pose.sway : pose.sway;
    const yaw = mirrored ? -pose.yawOffset : pose.yawOffset;
    const armP = mirrored ? pose.armN : pose.armP;
    const armN = mirrored ? pose.armP : pose.armN;
    const legP = mirrored ? pose.legN : pose.legP;
    const legN = mirrored ? pose.legP : pose.legN;

    rig.group.position.x = rig.baseX + hip;
    rig.group.position.y = pose.bounce;
    rig.group.rotation.y = rig.baseRotY + yaw;
    rig.group.rotation.z = sway;

    // Outward lift: the arms hang -Y from their shoulder pivots, and
    // rotating the +X arm by +z carries its hand toward +X (out to its own
    // side); the -X arm mirrors with -z. (The original signs here were
    // inverted, which folded every lifted arm across the torso — most
    // visibly in the grapevine's near-horizontal side reach.)
    if (rig.armP) {
        rig.armP.rotation.x = -armP.swing;
        rig.armP.rotation.z = armP.lift;
    }
    if (rig.armN) {
        rig.armN.rotation.x = -armN.swing;
        rig.armN.rotation.z = -armN.lift;
    }
    if (rig.legP) rig.legP.rotation.x = -legP;
    if (rig.legN) rig.legN.rotation.x = -legN;
}

/** In-place pose smoothing (avoids per-frame allocation in the update loop). */
function easePoseToward(pose, target, k) {
    pose.bounce += (target.bounce - pose.bounce) * k;
    pose.sway += (target.sway - pose.sway) * k;
    pose.hipShift += (target.hipShift - pose.hipShift) * k;
    pose.yawOffset += (target.yawOffset - pose.yawOffset) * k;
    pose.armP.swing += (target.armP.swing - pose.armP.swing) * k;
    pose.armP.lift += (target.armP.lift - pose.armP.lift) * k;
    pose.armN.swing += (target.armN.swing - pose.armN.swing) * k;
    pose.armN.lift += (target.armN.lift - pose.armN.lift) * k;
    pose.legP += (target.legP - pose.legP) * k;
    pose.legN += (target.legN - pose.legN) * k;
}

/** Wrap an angle to (-PI, PI] so paused dancers turn the short way around. */
function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

/** The pose a paused performer settles into: standing easy, facing the
 *  visitor who clicked them. */
function pausedPoseFor(rig, playerPosition) {
    const pose = neutralPose();
    pose.armP.swing = 0.25; pose.armP.lift = 0.2;
    pose.armN.swing = 0.25; pose.armN.lift = 0.2;
    if (playerPosition) {
        const facing = Math.atan2(playerPosition.x - rig.baseX, playerPosition.z - rig.baseZ);
        pose.yawOffset = wrapAngle(facing - rig.baseRotY);
    }
    return pose;
}

// ---- Public dancer interaction API (main.js) ----

/** Root groups for raycast targeting (click a dancer to say hi). */
export function getDancerMeshes() {
    return performers.filter((p) => !p.profile.leader).map((p) => p.rig.group);
}

/** Roqui's root group (the greeter click/hover path). */
export function getRoquiMesh() {
    return roquiPerformer ? roquiPerformer.rig.group : null;
}

/** Stop one dancer mid-song while their dialog is open. */
export function pauseDancerForDialog(rootGroup) {
    const performer = performers.find((p) => p.rig.group === rootGroup);
    if (performer) performer.paused = true;
}

/** Everybody back in it (dialog closed). */
export function resumeDancerFromDialog() {
    performers.forEach((p) => { if (!p.profile.leader) p.paused = false; });
}

/** Roqui steps out of the routine to say hola (her class keeps going). */
export function pauseRoquiForDialog() {
    if (roquiPerformer) roquiPerformer.paused = true;
}

export function resumeRoquiFromDialog() {
    if (roquiPerformer) roquiPerformer.paused = false;
}

// ============================================
// THE MUSIC (WebAudio percussion, click-to-play)
// ============================================
// A two-bar latin percussion loop at the config BPM: kick four to the floor,
// son clave over the top, shaker eighths, and a conga tumbao. Synthesized on
// the fly (no audio files, nothing downloaded), started only ever by a click
// on the speakers or the phone, and stopped the same way.

const STEPS_PER_LOOP = 32;   // 16th notes, two bars of 4/4

const MUSIC_PATTERN = {
    kick: [0, 4, 8, 12, 16, 20, 24, 28],
    clave: [0, 6, 12, 20, 24],           // 3-2 son clave
    congaLow: [4, 20],
    congaHi: [12, 14, 28, 30],
    shaker: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]
};

const music = {
    ctx: null,
    master: null,
    noiseBuffer: null,
    playing: false,
    step: 0,
    nextStepTime: 0,
    startTime: 0
};

function musicStepSeconds() {
    return 60 / ROQUI_CONFIG.music.bpm / 4;
}

// iOS quirk: plain WebAudio runs in the "ambient" audio session, and the
// phone's ring/silent hardware switch mutes that session outright (this is
// why a mix can sound great on a Mac and play nothing on an iPhone). Any
// playing HTML <audio> element promotes the session to "playback", the
// category the switch does not silence. So while the playlist runs we loop
// an inaudible wav through a hidden element. Everywhere else it is a no-op.
let keepAliveEl = null;

/** Half a second of 8-bit mono PCM silence as a same-origin blob URL
 *  (0x80 is the 8-bit midpoint, i.e. zero signal). */
function createSilentWavUrl() {
    const rate = 8000;
    const samples = rate / 2;
    const bytes = new Uint8Array(44 + samples);
    const view = new DataView(bytes.buffer);
    const writeTag = (offset, tag) => {
        for (let i = 0; i < tag.length; i++) bytes[offset + i] = tag.charCodeAt(i);
    };
    writeTag(0, 'RIFF');
    view.setUint32(4, 36 + samples, true);
    writeTag(8, 'WAVE');
    writeTag(12, 'fmt ');
    view.setUint32(16, 16, true);     // fmt chunk size
    view.setUint16(20, 1, true);      // PCM
    view.setUint16(22, 1, true);      // mono
    view.setUint32(24, rate, true);   // sample rate
    view.setUint32(28, rate, true);   // byte rate (1 byte per sample)
    view.setUint16(32, 1, true);      // block align
    view.setUint16(34, 8, true);      // bits per sample
    writeTag(36, 'data');
    view.setUint32(40, samples, true);
    bytes.fill(0x80, 44);
    return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}

function startSilentKeepAlive() {
    if (!keepAliveEl) {
        keepAliveEl = document.createElement('audio');
        keepAliveEl.loop = true;
        keepAliveEl.setAttribute('playsinline', '');
        keepAliveEl.src = createSilentWavUrl();
    }
    const attempt = keepAliveEl.play();
    if (attempt && attempt.catch) attempt.catch(() => {});
}

function stopSilentKeepAlive() {
    if (keepAliveEl) keepAliveEl.pause();
}

function ensureAudioContext() {
    if (music.ctx) return music.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    music.ctx = new Ctx();

    // iOS suspends the context when the visitor leaves the tab or takes a
    // call, and Safari parks it in a nonstandard 'interrupted' state that
    // never resumes itself. Nudge it back whenever the tab returns while
    // the playlist is meant to be on.
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && music.playing && music.ctx && music.ctx.state !== 'running') {
            music.ctx.resume().catch(() => {});
        }
    });
    music.master = music.ctx.createGain();
    music.master.gain.value = 0.5;
    music.master.connect(music.ctx.destination);

    // A short white-noise buffer shared by the shaker voice
    const rate = music.ctx.sampleRate;
    music.noiseBuffer = music.ctx.createBuffer(1, Math.floor(rate * 0.1), rate);
    const data = music.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    return music.ctx;
}

function playKick(t) {
    const ctx = music.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    gain.gain.setValueAtTime(0.85, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(gain).connect(music.master);
    osc.start(t);
    osc.stop(t + 0.18);
}

function playClave(t) {
    const ctx = music.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1750, t);
    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain).connect(music.master);
    osc.start(t);
    osc.stop(t + 0.06);
}

function playShaker(t, accent) {
    const ctx = music.ctx;
    const src = ctx.createBufferSource();
    src.buffer = music.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(accent ? 0.2 : 0.11, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src.connect(filter).connect(gain).connect(music.master);
    src.start(t);
    src.stop(t + 0.05);
}

function playConga(t, high) {
    const ctx = music.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const f = high ? 310 : 205;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.88, t + 0.09);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain).connect(music.master);
    osc.start(t);
    osc.stop(t + 0.12);
}

function scheduleStep(step, t) {
    const s = step % STEPS_PER_LOOP;
    if (MUSIC_PATTERN.kick.includes(s)) playKick(t);
    if (MUSIC_PATTERN.clave.includes(s)) playClave(t);
    if (MUSIC_PATTERN.shaker.includes(s)) playShaker(t, s % 8 === 0);
    if (MUSIC_PATTERN.congaLow.includes(s)) playConga(t, false);
    if (MUSIC_PATTERN.congaHi.includes(s)) playConga(t, true);
}

/** Keep the near-future scheduled. Called from the render loop while playing
 *  (frame cadence is far tighter than the 0.15s lookahead window). */
function pumpMusicScheduler() {
    if (!music.playing || !music.ctx) return;
    const horizon = music.ctx.currentTime + 0.15;
    while (music.nextStepTime < horizon) {
        scheduleStep(music.step, music.nextStepTime);
        music.step += 1;
        music.nextStepTime += musicStepSeconds();
    }
}

/** Toggle the playlist. Must be called from a user gesture (it is: the click
 *  on the speakers or the phone). Returns whether music is now playing. */
export function toggleStudioMusic() {
    if (music.playing) {
        music.playing = false;
        if (music.master && music.ctx) {
            music.master.gain.cancelScheduledValues(music.ctx.currentTime);
            music.master.gain.setValueAtTime(music.master.gain.value, music.ctx.currentTime);
            music.master.gain.linearRampToValueAtTime(0, music.ctx.currentTime + 0.2);
        }
        stopSilentKeepAlive();
        drawPhoneScreen(false);
        setSpeakerLEDs(false);
        setCeilingLights(true);   // house lights back up (panels bright again)
        if (discoDots) discoDots.visible = false;
        return false;
    }

    const ctx = ensureAudioContext();
    if (!ctx) return false;   // no WebAudio here; the class dances on in silence
    // 'suspended' on first use, and Safari's nonstandard 'interrupted' after
    // a call or a trip to another app: resume for anything not running.
    if (ctx.state !== 'running') {
        ctx.resume().catch(() => {});
    }
    // Still inside the click/tap gesture here, which is the only place iOS
    // allows a media element to start.
    startSilentKeepAlive();
    music.master.gain.cancelScheduledValues(ctx.currentTime);
    music.master.gain.setValueAtTime(0, ctx.currentTime);
    music.master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.15);
    music.playing = true;
    music.step = 0;
    music.startTime = ctx.currentTime + 0.08;
    music.nextStepTime = music.startTime;
    drawPhoneScreen(true);
    setSpeakerLEDs(true);
    // Party mode: the ceiling panels go dark (the rig's point lights stay on,
    // scaled down by the eased party factor in updateStudio), so the room
    // reads as a night out dancing rather than an afternoon class.
    setCeilingLights(false);
    if (discoDots && !_reducedMotion.matches) discoDots.visible = true;
    return true;
}

export function isMusicPlaying() {
    return music.playing;
}

function setSpeakerLEDs(on) {
    speakerRigs.forEach((rig) => {
        if (!rig.led) return;
        rig.led.material.emissive.setHex(on ? 0x22ff55 : 0x001100);
        rig.led.material.emissiveIntensity = on ? 1.6 : 1;
    });
}

/** The music's own beat position (for pulsing visuals in time with what the
 *  ears hear, independent of the dance clock's phase). */
function musicBeatNow() {
    if (!music.playing || !music.ctx) return 0;
    return Math.max(0, (music.ctx.currentTime - music.startTime)) * (ROQUI_CONFIG.music.bpm / 60);
}

// ============================================
// PER-FRAME UPDATE
// ============================================
let danceBeats = 0;

/**
 * Advance the studio each frame: the class dances, the mirror keeps up, the
 * disco ball turns, the speakers pulse when the playlist runs. Driven from
 * the render loop in main.js.
 */
export function updateStudio(playerPosition, deltaTime) {
    // Party dim: ease the room toward club lighting while the music plays
    // and back up when it stops. A gradual level change (never a flash), so
    // it runs for reduced-motion visitors too.
    const partyTarget = music.playing ? PARTY_DIM : 1;
    partyFactor += (partyTarget - partyFactor) * (1 - Math.exp(-3 * deltaTime));
    applyStudioLighting();
    applyPartyLighting();

    // Reduced motion: the still class was posed once at build time. The
    // playlist stays available (it is sound, not motion, and starts only
    // from a click), but nothing in the room animates: no sweeping dots and
    // no pulsing glow, just the gentle dim above.
    if (_reducedMotion.matches) {
        pumpMusicScheduler();
        return;
    }

    danceBeats += deltaTime * (ROQUI_CONFIG.music.bpm / 60);

    const k = 1 - Math.exp(-8 * deltaTime);   // pose smoothing factor
    performers.forEach((p) => {
        const target = p.paused
            ? pausedPoseFor(p.rig, playerPosition)
            : computeDancePose(danceBeats, p.profile);
        if (!p.pose) p.pose = target;
        else easePoseToward(p.pose, target, k);
        applyPose(p.rig, p.pose, false);
        applyPose(p.twinRig, p.pose, true);
    });

    // The disco ball turns gently, and with intent once the music is on
    if (discoBall) {
        discoBall.rotation.y += deltaTime * (music.playing ? 0.55 : 0.12);
    }
    if (discoDots && discoDots.visible) {
        discoDots.rotation.y -= deltaTime * 0.7;
        const pulse = Math.max(0, Math.sin(musicBeatNow() * Math.PI * 2));
        discoDots.children.forEach((dot, i) => {
            dot.material.opacity = 0.22 + 0.2 * pulse * ((i % 2) ? 1 : 0.7);
        });
    }

    // Speaker cones breathe with the kick, and the disco glow pulses with
    // them, painting the dimmed room pink on every beat
    if (music.playing) {
        const pulse = Math.max(0, Math.sin(musicBeatNow() * Math.PI * 2));
        const scale = 1 + 0.07 * pulse;
        speakerRigs.forEach((rig) => {
            rig.cones.forEach((cone) => cone.scale.set(scale, 1, scale));
        });
        if (discoLight) discoLight.intensity = 0.5 + 1.0 * pulse;
        pumpMusicScheduler();
    } else if (discoLight && discoLight.intensity > 0) {
        // Music off: let the glow fade out rather than snap
        discoLight.intensity = Math.max(0, discoLight.intensity - deltaTime * 2.5);
    }
}

// ============================================
// SCENE CLEANUP
// ============================================
function removeSceneTestObjects() {
    const scene = getScene();
    if (!scene) return;

    const testCube = scene.getObjectByName('testCube');
    const tempGround = scene.getObjectByName('tempGround');

    if (testCube) {
        testCube.geometry.dispose();
        testCube.material.dispose();
        scene.remove(testCube);
    }

    if (tempGround) {
        tempGround.geometry.dispose();
        tempGround.material.dispose();
        scene.remove(tempGround);
    }
}

/**
 * Get world collision boxes
 */
export function getStoreCollisionBoxes() {
    return collisionBoxes;
}

/**
 * Get the studio root group
 */
export function getStoreGroup() {
    return studioGroup;
}

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = {
    LAYOUT,
    DANCER_CASTS,
    ROUTINE_LENGTH: ROUTINE.length,
    BEATS_PER_SEGMENT,
    routineIndexAt,
    computeDancePose,
    applyPose,
    neutralPose,
    lerpPose,
    wrapAngle,
    subtractIntervals,
    mirrorZOf,
    mirrorRotYOf,
    MUSIC_PATTERN
};
