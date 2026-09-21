// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * store.js - Home Office Environment Construction
 *
 * Builds the first SceneXP micro-environment: the real home office in
 * Steve's house, measured from life (the footprint runs generous for
 * first-person camera comfort and furniture room, see PLAN_SCALE). Dark
 * green walls,
 * white ceiling and trim, a medium-dark faux wood floor, one window in the
 * far wall, and a closet tucked beside the door. In the passes to come the
 * room gains its furniture (the sit-stand desk first) and then Steve
 * himself, standing at the desk working on SceneXP.
 *
 * The module keeps the store.js name and its main exports (initStore,
 * STORE_CONFIG, getStoreCollisionBoxes, ...) so the conductor in main.js
 * keeps its stable import block, same as every other experience. The studio
 * interaction seams from the copied theme (getRoquiMesh, toggleStudioMusic,
 * updateStudioBoard, ...) are kept as documented no-op stubs at the bottom
 * of this file; they get wired to the office's own props and to the Steve
 * character in the later passes.
 *
 * FLOOR PLAN (viewed from above, north up, all at true scale):
 *
 *          window wall (10 ft, window 1 ft off the NE corner)
 *     +--------------------====window====+
 *     |                                  |
 *     |                                  |
 *  w  |          main room               |  east wall
 *  e  |          ~10 x ~10 ft            |  (13 ft, the
 *  s  |                                  |  longest wall)
 *  t  |                                  |
 *     +---------------------------+      |
 *     |  closet (7 x 3 ft,        | walk |
 *     |  boxed out, not walkable) | way  |
 *     +---------------------------+ 3 ft |
 *     +-----------------------------door-+
 *                south wall
 */

import { getScene } from '../../shared/js/scene-1.0.0.min.js';
import {
    initWorld, getWorldGroup, getColliders, registerOutdoorProp, getOutdoorPropMeshes
} from '../../shared/js/world-1.0.0.min.js';
import { STEVE_CONFIG } from './config.min.js';
import { createPerson } from '../../shared/js/people-1.0.0.min.js';
import { createBackgroundScenery } from '../../shared/js/scenery-1.0.0.min.js';
import { createWall, createWallSegment, createWindowFrame } from '../../shared/js/structures-1.0.0.min.js';
import { createWoodFloorTexture } from '../../shared/js/textures-1.0.0.min.js';
import { createCeilingLights, setInteriorLightScale } from '../../shared/js/lighting-1.0.0.min.js';

// Re-exported for main.js's update loop: with the day/night cycle on, the
// interior rig rebalances against the moving sun every frame.
export { updateInteriorAmbientLight } from '../../shared/js/lighting-1.0.0.min.js';

// Re-exports: main.js keeps importing these from store.min.js (stable import
// block); the implementations live in the shared parts library.
export { updateBackgroundAnimations } from '../../shared/js/scenery-1.0.0.min.js';
export { updateCheckoutSign, getHelpSign, findClearSpawn } from '../../shared/js/npcs-1.0.0.min.js';

// The room rectangle drives the shared lighting rig and gallery.js's height
// fallback. Re-exported under the legacy name so main.js and gallery.js keep
// importing STORE_CONFIG from this module unchanged.
export const STORE_CONFIG = STEVE_CONFIG.building;

// Indoor props register with the shared world context (the registry predates
// the indoor themes, hence the "outdoor" in its name); main.js still imports
// the getter from this module.
export { getOutdoorPropMeshes };

// World mesh groups
let officeGroup = null;
let collisionBoxes = [];

// Visitors who ask for reduced motion get a perfectly still room: the cat
// holds her sleeping pose without the breathing animation. Matches the
// reduced-motion handling of the sky in the shared scene part.
const _reducedMotion = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

// ============================================
// LAYOUT
// ============================================
// The room is measured from the real office in feet and built in meters,
// centered on the origin. North (negative Z) is the window wall; the door is
// in the south wall. Every position below derives from the plan in the
// header comment, so a change to one measurement flows everywhere.
//
// The room runs generous: at exact scale it read as cramped through the
// first-person camera's field of view and left no floor for the furniture,
// so plan measurements use the scaled "plan foot" below, and the heights
// (which read low through the same camera) use the gentler "vertical foot".
// Proportions stay true to life in both directions.
const FT = 0.3048;             // one foot, in meters
const PLAN_SCALE = 1.5625;     // the footprint's camera-comfort factor (1.25 twice)
const PFT = FT * PLAN_SCALE;   // one "plan foot", for X/Z measurements
const VERT_SCALE = 1.25;       // the heights' camera-comfort factor
const VFT = FT * VERT_SCALE;   // one "vertical foot", for Y measurements

const LAYOUT = {
    room: {
        minX: -5 * PFT, maxX: 5 * PFT,       // 10 ft across (the window wall)
        minZ: -6.5 * PFT, maxZ: 6.5 * PFT,   // 13 ft deep (the long east wall)
        height: 8 * VFT,                     // 8 ft ceiling
        wallT: 0.15
    },

    // The closet: a boxed-out volume in the southwest corner, 7 ft along the
    // south wall and 3 ft deep. Its east end cap is the short wall a visitor
    // sees on their left when stepping through the doorway.
    closet: { minX: -5 * PFT, maxX: 2 * PFT, minZ: 3.5 * PFT, maxZ: 6.5 * PFT },

    // The closet opening: a 5 ft cutout centered in the front wall, at the
    // same height as the room door, fitted with the two folding accordion
    // doors (2.5 ft each). The front wall spans 7 ft, so a foot of green
    // wall remains at either side of the casing.
    closetOpening: { minX: -4 * PFT, maxX: 1 * PFT, height: 6.67 * VFT },

    // The door: south wall, centered in the walkway the closet leaves in
    // front of the doorway. The whole leaf scales with the heights so it
    // keeps a real 30 x 80 in door's proportions (a taller door at true
    // width would read stretched and skinny).
    door: { x: 3.5 * PFT, width: 2.5 * VFT, height: 6.67 * VFT },

    // The window: the only one in the room, in the north wall, its east edge
    // about 1 ft from the corner it shares with the long east wall. Width
    // scales with the wall and the sill and head heights scale with the
    // walls, so both compositions stay the same.
    window: { x: 2.5 * PFT, width: 3 * PFT, sillY: 2.8 * VFT, topY: 6.6 * VFT }
};

// The office palette. Quiet on purpose: the real room is dark green paint,
// white trim, and wood, and the scene honors it.
const PALETTE = {
    wallGreen: 0x335241,      // the dark green paint
    trimWhite: 0xf8f6f1,      // ceiling, molding, door, window frame
    floorTint: 0xaa9583       // multiplies the shared wood texture darker
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

/** Dark green painted wall with a hint of roller texture. */
function createWallPaintTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#335241';
    ctx.fillRect(0, 0, 256, 256);

    // Soft roller mottle so the walls don't read as one flat sheet
    for (let i = 0; i < 70; i++) {
        ctx.fillStyle = ['#2e4b3b', '#385846', '#2c463a'][i % 3];
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

/** Soft gray curtain fabric: gathered vertical folds drawn as smooth
 *  dark-light-dark bands, so a flat panel reads as hanging cloth. */
function createCurtainTexture() {
    const canvas = makeCanvas(128, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#87898c';
    ctx.fillRect(0, 0, 128, 256);
    const folds = 5;
    const foldW = 128 / folds;
    for (let f = 0; f < folds; f++) {
        const shade = ctx.createLinearGradient(f * foldW, 0, (f + 1) * foldW, 0);
        shade.addColorStop(0, '#6d6f72');
        shade.addColorStop(0.45, '#9fa1a4');
        shade.addColorStop(1, '#6d6f72');
        ctx.fillStyle = shade;
        ctx.fillRect(f * foldW, 0, foldW, 256);
    }

    return new THREE.CanvasTexture(canvas);
}

function createTextures() {
    wallTexture = createWallPaintTexture();
}

// ============================================
// SHARED MATERIALS
// ============================================
const whiteTrim = new THREE.MeshStandardMaterial({ color: PALETTE.trimWhite, roughness: 0.7, metalness: 0.0 });
const brushedMetal = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.35, metalness: 0.7 });
const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9, metalness: 0.0 });
const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8, metalness: 0.0 });

/**
 * Initialize the office world
 */
export function initStore() {
    const scene = getScene();
    if (!scene) {
        return;
    }

    // The shared world context owns the root group, the collider registry, and
    // the prop registry. Local aliases keep every builder below (and the
    // direct collisionBoxes.push sites) working unchanged.
    officeGroup = initWorld(STEVE_CONFIG);
    collisionBoxes = getColliders();

    createTextures();

    createRoom();             // floor, walls, closet, window, door, ceiling, baseboards
    createClosetDoors();      // the folding accordion doors in the closet opening
    createFileCabinetCorner();// file cabinet, banker's lamp, router, surge strip
    createSonDeskNook();      // the son's small navy desk, chair, and ring lamp
    createNorthwestCorner();  // trash can, hooded litter box, and its mat
    createSitStandDeskWall(); // Steve's sit-stand desk, standing, west wall
    createWallDashboard();    // the visitor-activity display on the east wall
    createWhiteboardWall();   // the three rules, on the north wall behind Steve
    createClosetComputer();   // the old machine still running behind the doors
    createCatBowls();         // food and water, desk-to-closet stretch
    createOfficeLighting();   // shared interior rig, sized for one small room
    createExterior();         // lawn and trees seen through the window

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
    roomGroup.name = 'homeOffice';

    const { room, closet, closetOpening, door, window: win } = LAYOUT;
    const { height, wallT } = room;
    const width = room.maxX - room.minX;
    const depth = room.maxZ - room.minZ;

    // --- Floor: medium-dark faux wood. The shared wood texture is a lighter
    // sprung-floor look, so the material tint pulls it down to the real
    // room's laminate. The repeat keeps plank widths near 20 cm at this
    // tiny room size. ---
    const floorTexture = createWoodFloorTexture();
    floorTexture.repeat.set(3.1, 4.1);
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        new THREE.MeshStandardMaterial({
            map: floorTexture, color: PALETTE.floorTint, roughness: 0.5, metalness: 0.05
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0);
    floor.receiveShadow = true;
    roomGroup.add(floor);

    // --- Ceiling: white, a thin slab rather than a plane so it reliably
    // casts shadow and the frozen noon sun cannot blast through the roof. ---
    const ceiling = new THREE.Mesh(
        new THREE.BoxGeometry(width + wallT * 2, 0.12, depth + wallT * 2),
        new THREE.MeshStandardMaterial({ color: PALETTE.trimWhite, roughness: 0.9, metalness: 0.0 })
    );
    ceiling.position.set(0, height + 0.06, 0);
    ceiling.castShadow = true;
    roomGroup.add(ceiling);

    // --- The heat vent: a small rectangular ceiling register above the
    // window, about a foot and a half off the wall, white frame with a
    // dark throat behind angled slats ---
    const ventGroup = new THREE.Group();
    ventGroup.name = 'heatVent';
    const ventFrame = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.012, 0.26), whiteTrim);
    ventGroup.add(ventFrame);
    const ventThroat = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x1e1f22, roughness: 0.95, metalness: 0.0 })
    );
    ventThroat.rotation.x = Math.PI / 2;   // facing down into the room
    ventThroat.position.y = -0.007;
    ventGroup.add(ventThroat);
    for (let sIdx = 0; sIdx < 5; sIdx++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.008, 0.03), whiteTrim);
        slat.position.set(0, -0.01, -0.08 + sIdx * 0.04);
        slat.rotation.x = 0.5;
        ventGroup.add(slat);
    }
    ventGroup.position.set(win.x, height - 0.008, room.minZ + wallT / 2 + 1.5 * PFT);
    registerOutdoorProp(ventGroup, 'vent');
    roomGroup.add(ventGroup);

    const wallMaterial = new THREE.MeshStandardMaterial({
        map: wallTexture, roughness: 0.85, metalness: 0.0
    });

    // --- East and west walls: single slabs the full depth of the room
    // (createWall registers their colliders). The closet hides the south
    // stretch of the west wall from inside the room, which is fine. ---
    createWall(depth, height, wallT, room.minX, height / 2, 0, Math.PI / 2, wallMaterial, 'westWall');
    createWall(depth, height, wallT, room.maxX, height / 2, 0, Math.PI / 2, wallMaterial, 'eastWall');

    // --- North wall: solid piers around the window opening ---
    const nz = room.minZ;   // wall centerline
    const winLeft = win.x - win.width / 2;
    const winRight = win.x + win.width / 2;
    [
        { from: room.minX, to: winLeft, name: 'northPierWest' },
        { from: winRight, to: room.maxX, name: 'northPierEast' }
    ].forEach((p) => {
        createWallSegment(p.to - p.from, height, wallT, (p.from + p.to) / 2, height / 2, nz, wallMaterial, p.name);
    });

    // Bands under and over the window
    createWallSegment(win.width, win.sillY, wallT, win.x, win.sillY / 2, nz, wallMaterial, 'windowSill');
    const headH = height - win.topY;
    createWallSegment(win.width, headH, wallT, win.x, win.topY + headH / 2, nz, wallMaterial, 'windowHead');

    // --- Window glass, frame, and sill ledge ---
    const winH = win.topY - win.sillY;
    const winCenterY = (win.topY + win.sillY) / 2;
    const innerN = nz + wallT / 2;   // the wall's room-side face
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0xcfe6f2, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.1,
        side: THREE.DoubleSide
    });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(win.width - 0.08, winH - 0.08), glassMaterial);
    pane.position.set(win.x, winCenterY, nz);
    roomGroup.add(pane);
    createWindowFrame(win.width, winH, win.x, winCenterY, innerN + 0.02, whiteTrim, 'officeWindow');
    // Center muntin, and a white sill ledge proud of the wall
    const muntin = new THREE.Mesh(new THREE.BoxGeometry(0.04, winH - 0.08, 0.05), whiteTrim);
    muntin.position.set(win.x, winCenterY, innerN + 0.02);
    roomGroup.add(muntin);
    const sillLedge = new THREE.Mesh(new THREE.BoxGeometry(win.width + 0.12, 0.035, 0.11), whiteTrim);
    sillLedge.position.set(win.x, win.sillY - 0.017, innerN + 0.04);
    roomGroup.add(sillLedge);

    // --- Curtains: a white rod above the window with ball finials, and two
    // gray floor-length panels hanging open at either side, half on the
    // casing and half on the wall, so the glass stays clear ---
    const rodY = win.topY + 0.12;
    const rodZ = innerN + 0.09;   // clear of the frame, in front of the panels' fold depth
    const rodLen = win.width + 0.44;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, rodLen, 10), whiteTrim);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(win.x, rodY, rodZ);
    roomGroup.add(rod);
    [-1, 1].forEach((side) => {
        const finial = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), whiteTrim);
        finial.position.set(win.x + side * (rodLen / 2 + 0.02), rodY, rodZ);
        roomGroup.add(finial);
    });

    const curtainMaterial = new THREE.MeshStandardMaterial({
        map: createCurtainTexture(), roughness: 0.9, metalness: 0.0
    });
    // Panels run from just below the rod to just below the window sill
    const curtainBottom = win.sillY - 0.12;
    const curtainH = (rodY - 0.02) - curtainBottom;
    [-1, 1].forEach((side) => {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.28, curtainH, 0.07), curtainMaterial);
        panel.position.set(win.x + side * (win.width / 2 + 0.02), curtainBottom + curtainH / 2, rodZ - 0.005);
        panel.name = side < 0 ? 'curtainWest' : 'curtainEast';
        roomGroup.add(panel);
    });

    // --- South wall: solid piers either side of the door opening ---
    const sz = room.maxZ;   // wall centerline
    const doorLeft = door.x - door.width / 2;
    const doorRight = door.x + door.width / 2;
    [
        { from: room.minX, to: doorLeft, name: 'southPierWest' },
        { from: doorRight, to: room.maxX, name: 'southPierEast' }
    ].forEach((p) => {
        createWallSegment(p.to - p.from, height, wallT, (p.from + p.to) / 2, height / 2, sz, wallMaterial, p.name);
    });
    const doorHeadH = height - door.height;
    createWallSegment(door.width, doorHeadH, wallT, door.x, door.height + doorHeadH / 2, sz, wallMaterial, 'doorHead');

    // --- The door: a closed white single leaf with a brushed knob ---
    const doorGroup = new THREE.Group();
    doorGroup.name = 'officeDoor';
    const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(door.width - 0.04, door.height - 0.04, 0.05),
        new THREE.MeshStandardMaterial({ color: PALETTE.trimWhite, roughness: 0.55, metalness: 0.0 })
    );
    leaf.position.set(door.x, (door.height - 0.04) / 2 + 0.02, sz);
    leaf.castShadow = true;
    doorGroup.add(leaf);

    // Knob on the closet side of the leaf (the hinge rides the east jamb)
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), brushedMetal);
    knob.position.set(doorLeft + 0.07, 0.95, sz - 0.06);
    doorGroup.add(knob);

    // A dark backer panel tucked into the wall's thickness just behind the
    // leaf, a whisker larger than the opening. The thin reveal gap around a
    // real closed door shows the unlit hallway beyond, and without this the
    // gap showed blue sky from certain angles.
    const doorBacker = new THREE.Mesh(
        new THREE.BoxGeometry(door.width + 0.04, door.height + 0.04, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.95, metalness: 0.0 })
    );
    doorBacker.position.set(door.x, (door.height + 0.04) / 2, sz + 0.055);
    doorGroup.add(doorBacker);

    // Door frame trim, proud of the wall on both sides. Each jamb also
    // rides a few millimeters INTO the opening, and the lintel the same
    // amount below the header, so the white trim covers the wall's cut
    // faces around the opening. Butted exactly, the trim's side faces land
    // on the very planes of those cut faces and the two z-fight.
    const REVEAL = 0.003;
    [doorLeft - 0.05 + REVEAL, doorRight + 0.05 - REVEAL].forEach((jx) => {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.1, door.height + 0.1, wallT + 0.04), whiteTrim);
        jamb.position.set(jx, (door.height + 0.1) / 2, sz);
        doorGroup.add(jamb);
    });
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(door.width + 0.3, 0.1, wallT + 0.04), whiteTrim);
    lintel.position.set(door.x, door.height + 0.05 - REVEAL, sz);
    doorGroup.add(lintel);

    registerOutdoorProp(doorGroup, 'door');
    roomGroup.add(doorGroup);
    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(doorLeft, 0, sz - 0.15),
            new THREE.Vector3(doorRight, door.height, sz + 0.15)
        ),
        type: 'door'
    });

    // The little round white doorknob guard on the east wall, at knob
    // height, exactly where the knob lands when the door swings fully open
    // into the walkway (hinged at the east jamb, the knob rides ~0.88 m
    // out along the leaf, so its arc meets the wall that far from the
    // south wall). Beveled edge faces the room.
    const guardGroup = new THREE.Group();
    guardGroup.name = 'knobGuard';
    const guardDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.018, 16), whiteTrim);
    guardDisc.rotation.z = Math.PI / 2;
    guardGroup.add(guardDisc);
    guardGroup.position.set(room.maxX - wallT / 2 - 0.01, 0.95, sz - wallT / 2 - (door.width - 0.07));
    registerOutdoorProp(guardGroup, 'knobGuard');
    roomGroup.add(guardGroup);

    // The light switch on the closet's end cap (the short wall facing the
    // doorknob guard across the walkway), at standard height just inside
    // the door, where a hand finds it in the dark.
    const lightSwitch = createLightSwitchPlate();
    lightSwitch.position.set(closet.maxX + wallT / 2 + 0.008, 1.22, sz - wallT / 2 - 0.27);
    registerOutdoorProp(lightSwitch, 'lightswitch');
    roomGroup.add(lightSwitch);

    // --- The closet: a boxed-out volume, not walkable. Its front wall
    // opens over a 5 ft door-height cutout for the accordion doors (built
    // in createClosetDoors); green piers remain at either side, and a green
    // header band runs above. ---
    const closetD = closet.maxZ - closet.minZ;
    const co = closetOpening;
    // The east pier carries past the cap wall's centerline to the cap's
    // outer face (2 mm shy of it, so no coplanar faces flicker), closing
    // what would otherwise be an open notch at the closet's outside corner.
    const closetFrontEndX = closet.maxX + wallT / 2 - 0.002;
    createWallSegment(co.minX - closet.minX, height, wallT,
        (closet.minX + co.minX) / 2, height / 2,
        closet.minZ, wallMaterial, 'closetFrontWest');
    createWallSegment(closetFrontEndX - co.maxX, height, wallT,
        (co.maxX + closetFrontEndX) / 2, height / 2,
        closet.minZ, wallMaterial, 'closetFrontEast');
    const closetHeadH = height - co.height;
    createWallSegment(co.maxX - co.minX, closetHeadH, wallT,
        (co.minX + co.maxX) / 2, co.height + closetHeadH / 2,
        closet.minZ, wallMaterial, 'closetFrontHead');
    createWall(closetD, height, wallT, closet.maxX, height / 2,
        (closet.minZ + closet.maxZ) / 2, Math.PI / 2, wallMaterial, 'closetCap');

    // White casing around the opening, matching the room door's trim (and
    // riding into the opening by the same reveal, for the same reason)
    [co.minX - 0.05 + REVEAL, co.maxX + 0.05 - REVEAL].forEach((jx) => {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.1, co.height + 0.1, wallT + 0.04), whiteTrim);
        jamb.position.set(jx, (co.height + 0.1) / 2, closet.minZ);
        roomGroup.add(jamb);
    });
    const closetLintel = new THREE.Mesh(new THREE.BoxGeometry(co.maxX - co.minX + 0.3, 0.1, wallT + 0.04), whiteTrim);
    closetLintel.position.set((co.minX + co.maxX) / 2, co.height + 0.05 - REVEAL, closet.minZ);
    roomGroup.add(closetLintel);
    // One box over the whole volume so no corner seam ever lets a visitor in
    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(closet.minX, 0, closet.minZ),
            new THREE.Vector3(closet.maxX, height, closet.maxZ)
        ),
        type: 'closet'
    });

    // --- Baseboards: the white molding along the floor. Each run hugs its
    // wall's room-side face, proud of the paint by a lip, and every run is
    // measured corner to corner so the trim connects all the way around.
    //
    // Corner rule: boards running along X carry through each corner (to the
    // crossing board's back plane at an inside corner, or all the way to its
    // outer face plane around an outside corner), and boards running along Z
    // butt into them. The one outside corner in the room, the closet's
    // northeast, wraps clean in white: the front board's end face lands
    // flush with the cap board's face, a painted butt-jointed corner. ---
    const baseH = 0.1;
    const baseD = 0.045;
    const baseLip = 0.04;                   // board centerline, proud of the paint
    const baseBack = baseLip - baseD / 2;   // back plane, proud of the paint
    const baseFace = baseLip + baseD / 2;   // face plane, proud of the paint
    const addBaseboard = (name, alongX, at, from, to) => {
        if (to - from < 0.05) return;   // a stub that small reads as a mistake
        const geom = alongX
            ? new THREE.BoxGeometry(to - from, baseH, baseD)
            : new THREE.BoxGeometry(baseD, baseH, to - from);
        const board = new THREE.Mesh(geom, whiteTrim);
        board.position.set(alongX ? (from + to) / 2 : at, baseH / 2, alongX ? at : (from + to) / 2);
        board.name = name;
        roomGroup.add(board);
    };
    const innerE = room.maxX - wallT / 2;   // room-side wall faces
    const innerW = room.minX + wallT / 2;
    const innerS = sz - wallT / 2;
    const faceCF = closet.minZ - wallT / 2; // the closet front's room-side face
    const faceCC = closet.maxX + wallT / 2; // the closet cap's walkway-side face
    // North wall, corner to corner
    addBaseboard('baseNorth', true, innerN + baseLip, innerW + baseBack, innerE - baseBack);
    // East wall, butting the north and south runs
    addBaseboard('baseEast', false, innerE - baseLip, innerN + baseFace, innerS - baseFace);
    // West wall, from the north corner down to the closet front
    addBaseboard('baseWest', false, innerW + baseLip, innerN + baseFace, faceCF - baseFace);
    // The closet front, in two runs that stop clear of the door casing:
    // one from the west wall to the casing, one from the casing out and
    // around the outside corner
    addBaseboard('baseClosetFrontWest', true, faceCF - baseLip, innerW + baseBack, closetOpening.minX - 0.1 + REVEAL - 0.002);
    addBaseboard('baseClosetFrontEast', true, faceCF - baseLip, closetOpening.maxX + 0.1 - REVEAL + 0.002, faceCC + baseFace);
    // The closet cap, from behind that corner down to the south wall run
    addBaseboard('baseClosetCap', false, faceCC + baseLip, faceCF - baseBack, innerS - baseFace);
    // South wall: the walkway stub between the cap and the door trim, and
    // the sliver between the door trim and the east wall
    addBaseboard('baseSouthWalkway', true, innerS - baseLip, faceCC + baseBack, doorLeft - 0.1 + REVEAL - 0.002);
    addBaseboard('baseSouthEast', true, innerS - baseLip, doorRight + 0.1 - REVEAL + 0.002, innerE - baseBack);

    officeGroup.add(roomGroup);
}

// ============================================
// THE CLOSET DOORS
// ============================================
/** Light faux wood for the accordion doors: paler than the floor but
 *  honestly wooden. Board-width tonal bands, wandering grain with real
 *  contrast, and a few knots keep it from reading as vinyl. */
function createLightWoodTexture() {
    const canvas = makeCanvas(128, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#c19a63';
    ctx.fillRect(0, 0, 128, 256);

    // Board-width tonal bands, the way milled slats never quite match
    const bandTones = ['#b8905a', '#c9a26b', '#b08852', '#c49d66'];
    for (let b = 0; b < 4; b++) {
        ctx.fillStyle = bandTones[b];
        ctx.globalAlpha = 0.55;
        ctx.fillRect(b * 32, 0, 32, 256);
    }
    ctx.globalAlpha = 1;

    // Wandering vertical grain, in tones dark and light enough to read
    for (let i = 0; i < 44; i++) {
        ctx.strokeStyle = ['rgba(112, 80, 44, 0.42)', 'rgba(224, 190, 140, 0.5)', 'rgba(90, 62, 32, 0.3)'][i % 3];
        ctx.lineWidth = 1 + Math.random() * 2;
        const x = Math.random() * 128;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + Math.random() * 10 - 5, 85, x + Math.random() * 10 - 5, 170, x + Math.random() * 6 - 3, 256);
        ctx.stroke();
    }

    // A few knots: a dark heart with a grain ring around it
    for (let k = 0; k < 3; k++) {
        const kx = 20 + Math.random() * 88;
        const ky = 30 + Math.random() * 196;
        ctx.strokeStyle = 'rgba(96, 66, 34, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(kx, ky, 4.5, 7.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(74, 50, 26, 0.65)';
        ctx.beginPath();
        ctx.ellipse(kx, ky, 2, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** Two folding accordion doors filling the closet opening, about 2.5 ft
 *  each, closed. Each door is four vertical slats in a shallow zigzag:
 *  alternating each slat's yaw about a shared center plane makes adjacent
 *  slat edges meet exactly, and the fold stays inside the wall's thickness.
 *  Both doors start their fold with the same sign, so the two edges meeting
 *  at the center land at the same depth, where the little pulls sit. */
function createClosetDoors() {
    const { closet, closetOpening: co } = LAYOUT;
    const doorsGroup = new THREE.Group();
    doorsGroup.name = 'closetDoors';

    const woodTexture = createLightWoodTexture();
    const slatMaterial = new THREE.MeshStandardMaterial({
        map: woodTexture, roughness: 0.85, metalness: 0.0
    });

    const openW = co.maxX - co.minX;
    const edgeGap = 0.008;    // daylight at the jambs
    const centerGap = 0.02;   // the seam where the two doors meet
    const doorW = (openW - edgeGap * 2 - centerGap) / 2;
    const slatsPerDoor = 4;
    const foldAngle = 0.22;
    const span = doorW / slatsPerDoor;              // horizontal reach per slat
    const slatW = span / Math.cos(foldAngle);       // actual slat width, folded
    const slatH = co.height - 0.08;
    const zc = closet.minZ;                         // fold about the wall centerline

    for (let d = 0; d < 2; d++) {
        const x0 = co.minX + edgeGap + d * (doorW + centerGap);
        for (let i = 0; i < slatsPerDoor; i++) {
            // Each slat samples the grain at its own offset, so no two slats
            // repeat the same pattern (uniform repeats read as plastic).
            const slat = new THREE.Mesh(new THREE.BoxGeometry(slatW, slatH, 0.025), slatMaterial.clone());
            slat.material.map = woodTexture.clone();
            slat.material.map.offset.x = ((d * slatsPerDoor + i) * 0.31) % 1;
            slat.material.map.needsUpdate = true;
            slat.position.set(x0 + (i + 0.5) * span, slatH / 2 + 0.03, zc);
            slat.rotation.y = (i % 2 === 0 ? 1 : -1) * foldAngle;
            slat.castShadow = true;
            doorsGroup.add(slat);
        }
    }

    // The pulls, one on each door beside the center seam
    const seamX = co.minX + edgeGap + doorW + centerGap / 2;
    [-1, 1].forEach((side) => {
        const pull = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), brushedMetal);
        pull.position.set(seamX + side * 0.07, 1.0, zc - 0.055);
        doorsGroup.add(pull);
    });

    registerOutdoorProp(doorsGroup, 'closet');
    officeGroup.add(doorsGroup);
}

// ---- The thing in the closet ------------------------------------------------
//
// AN EASTER EGG FOR ANYBODY WHO TURNS AROUND. The eye faces north, away from
// the closet, so this is only ever found by a visitor who takes the view all
// the way round. What they get for it is a green glow in the dark through the
// 2 cm seam between the accordion doors: an old beige tower with a CRT on it,
// still on, still working on something.
//
// PLACED ON THE SIGHT LINE, NOT IN THE MIDDLE OF THE CLOSET. The seam is a 2 cm
// aperture 62 cm from the eye, so what is visible through it is a narrow fan:
// about 6 cm of the closet's back, and only along the line the eye draws
// through the seam (which is not square to the doors, because the eye does not
// stand in front of them). Everything below is measured against that line
// rather than centered in the closet, and tests/steve-view.test.mjs raycasts
// the real doors to hold it there.
//
// THE GLOW IS EMISSIVE, NOT A LIGHT. A point light in here would cost every
// material in the room a lamp it can never see, which is a poor trade for a
// prop behind a closed door on a phone. An emissive screen glows for free.

/** The terminal on the old CRT: a black screen, a few lines of green, and a
 *  block cursor sitting at a prompt that has been waiting a long time. */
function createTerminalTexture() {
    const W = 160, H = 120;
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#061007';
    ctx.fillRect(0, 0, W, H);

    // Lines of output, shortening as a build log does, then the prompt
    ctx.fillStyle = '#5bea79';
    const lines = [96, 78, 110, 64, 88, 52, 70];
    lines.forEach((w, i) => ctx.fillRect(10, 12 + i * 12, w, 4));
    ctx.fillRect(10, 12 + lines.length * 12, 8, 4);      // the prompt
    ctx.fillRect(22, 9 + lines.length * 12, 7, 9);       // the block cursor

    // CRT scanlines, which is most of what makes a green rectangle read as a
    // tube rather than as a sticker.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/** The old family computer, still running in the back of the closet: a beige
 *  tower with a CRT on top, screen toward the doors. Origin on the floor at
 *  the tower's center, facing -Z (the doors are to the -Z side). */
function createClosetComputer() {
    const pc = new THREE.Group();
    pc.name = 'closetComputer';

    // Beige that has been beige for twenty years.
    const beige = new THREE.MeshStandardMaterial({ color: 0xc3b896, roughness: 0.8, metalness: 0.0 });
    const darkPlastic = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.85, metalness: 0.0 });

    const TOWER_W = 0.2, TOWER_H = 0.44, TOWER_D = 0.42;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(TOWER_W, TOWER_H, TOWER_D), beige);
    tower.position.y = TOWER_H / 2;
    pc.add(tower);

    // The front face: a drive bay, a floppy slot, and the two little lights
    // that are the only reason any of this is visible through a seam.
    const bay = new THREE.Mesh(new THREE.BoxGeometry(TOWER_W * 0.72, 0.03, 0.004), darkPlastic);
    bay.position.set(0, TOWER_H - 0.07, -TOWER_D / 2 - 0.002);
    pc.add(bay);
    const floppy = new THREE.Mesh(new THREE.BoxGeometry(TOWER_W * 0.6, 0.012, 0.004), darkPlastic);
    floppy.position.set(0, TOWER_H - 0.13, -TOWER_D / 2 - 0.002);
    pc.add(floppy);
    const powerLed = new THREE.Mesh(
        new THREE.CircleGeometry(0.006, 8),
        new THREE.MeshStandardMaterial({ color: 0x1b6b2a, emissive: 0x4fe06a, emissiveIntensity: 1.2 })
    );
    powerLed.position.set(-0.04, 0.12, -TOWER_D / 2 - 0.003);
    powerLed.rotation.y = Math.PI;
    pc.add(powerLed);
    const activityLed = new THREE.Mesh(
        new THREE.CircleGeometry(0.005, 8),
        new THREE.MeshStandardMaterial({ color: 0x6b4a1b, emissive: 0xe0a24f, emissiveIntensity: 1.2 })
    );
    activityLed.position.set(-0.02, 0.12, -TOWER_D / 2 - 0.003);
    activityLed.rotation.y = Math.PI;
    pc.add(activityLed);
    closetActivityLed = activityLed;

    // The CRT on top: a deep box with a slight taper, a dark bezel, and the
    // tube itself.
    const CRT_W = 0.34, CRT_H = 0.3, CRT_D = 0.33;
    const crtY = TOWER_H + CRT_H / 2;
    const crt = new THREE.Mesh(new THREE.BoxGeometry(CRT_W, CRT_H, CRT_D), beige);
    crt.position.y = crtY;
    pc.add(crt);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(CRT_W * 0.88, CRT_H * 0.8, 0.012), darkPlastic);
    bezel.position.set(0, crtY + 0.008, -CRT_D / 2 - 0.004);
    pc.add(bezel);

    const terminal = createTerminalTexture();
    const tube = new THREE.Mesh(
        new THREE.PlaneGeometry(CRT_W * 0.74, CRT_H * 0.62),
        new THREE.MeshStandardMaterial({
            map: terminal, emissive: 0xffffff, emissiveMap: terminal,
            emissiveIntensity: 1.15, roughness: 0.3, metalness: 0.0
        })
    );
    tube.name = 'closetTerminal';
    tube.position.set(0, crtY + 0.008, -CRT_D / 2 - 0.011);
    tube.rotation.y = Math.PI;        // facing the doors
    pc.add(tube);

    // ON THE SIGHT LINE THROUGH THE SEAM. The seam sits at x = -0.714 and the
    // eye at x = -0.8, z = 1.05, so the line through it drifts east as it goes
    // back: x = -0.8 + 0.139 * (z - 1.05). At the screen's depth that is -0.60.
    pc.position.set(-0.6, 0, 2.62);
    registerOutdoorProp(pc, 'oldPc');
    officeGroup.add(pc);
}

// ============================================
// FURNITURE
// ============================================
const brassMaterial = new THREE.MeshStandardMaterial({ color: 0xb08d3e, roughness: 0.35, metalness: 0.8 });
const cabinetBlack = new THREE.MeshStandardMaterial({ color: 0x1e2023, roughness: 0.5, metalness: 0.3 });

/** The black two-drawer file cabinet: body, two drawer fronts with brushed
 *  handles and little label holders. Origin at floor center; drawer fronts
 *  face +Z (rotated into place by the corner builder). */
function createFileCabinet(w, h, d) {
    const cabinet = new THREE.Group();
    cabinet.name = 'fileCabinet';

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cabinetBlack);
    body.position.y = h / 2;
    body.castShadow = true;
    cabinet.add(body);

    // Two drawer fronts, slightly proud of the body
    [0.26, 0.57].forEach((fy, i) => {
        const front = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, 0.26, 0.02), cabinetBlack);
        front.position.set(0, fy, d / 2 + 0.01);
        cabinet.add(front);

        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.018, 0.018), brushedMetal);
        handle.position.set(0, fy + 0.09, d / 2 + 0.03);
        cabinet.add(handle);

        const label = new THREE.Mesh(
            new THREE.PlaneGeometry(0.05, 0.035),
            new THREE.MeshStandardMaterial({ color: 0xf1eee6, roughness: 0.9 })
        );
        label.position.set(0, fy + 0.04, d / 2 + 0.022);
        label.name = `drawerLabel${i}`;
        cabinet.add(label);
    });

    return cabinet;
}

/** The banker's lamp: brass base and stem, green glass half-cylinder shade,
 *  and a little pull chain. About 13 in tall. Origin at its base. */
function createBankersLamp() {
    const lamp = new THREE.Group();
    lamp.name = 'bankersLamp';

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.022, 14), brassMaterial);
    base.position.y = 0.011;
    lamp.add(base);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.24, 8), brassMaterial);
    stem.position.y = 0.14;
    lamp.add(stem);

    // The green glass shade: a half cylinder lying on its side, opening
    // tipped forward the way a banker's lamp shade tilts over the desk
    const shade = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 0.24, 14, 1, true, 0, Math.PI),
        new THREE.MeshStandardMaterial({
            color: 0x1f6f4a, emissive: 0x2f8f5f, emissiveIntensity: 0.3,
            roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide
        })
    );
    shade.rotation.z = Math.PI / 2;   // axis horizontal
    shade.rotation.x = -0.25;         // tipped forward
    shade.position.set(0, 0.27, 0.015);
    lamp.add(shade);

    // Brass shade rod and the pull chain
    const shadeRod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.27, 8), brassMaterial);
    shadeRod.rotation.z = Math.PI / 2;
    shadeRod.position.y = 0.27;
    lamp.add(shadeRod);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.05, 6), brassMaterial);
    chain.position.set(0.04, 0.225, 0.05);
    lamp.add(chain);

    return lamp;
}

/** The black wifi router: a flat unit with two antennas and status LEDs. */
function createWifiRouter() {
    const router = new THREE.Group();
    router.name = 'wifiRouter';

    const unit = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.032, 0.11),
        new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.6, metalness: 0.1 })
    );
    unit.position.y = 0.016;
    router.add(unit);

    [-0.05, 0.05].forEach((ax) => {
        const antenna = new THREE.Mesh(
            new THREE.CylinderGeometry(0.005, 0.006, 0.1, 6),
            new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.7 })
        );
        antenna.position.set(ax, 0.08, -0.045);
        antenna.rotation.x = -0.15;
        router.add(antenna);
    });

    [-0.045, -0.015, 0.015].forEach((lx) => {
        const led = new THREE.Mesh(
            new THREE.BoxGeometry(0.008, 0.004, 0.002),
            new THREE.MeshStandardMaterial({
                color: 0x1a3320, emissive: 0x37e06a, emissiveIntensity: 1.2
            })
        );
        led.position.set(lx, 0.02, 0.0555);
        router.add(led);
    });

    return router;
}

/** The beige surge protector: outlet dots along the top and a lit switch. */
function createSurgeProtector() {
    const strip = new THREE.Group();
    strip.name = 'surgeProtector';

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.035, 0.06),
        new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: 0.7, metalness: 0.0 })
    );
    body.position.y = 0.0175;
    strip.add(body);

    const outletMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.8 });
    [-0.08, -0.03, 0.02, 0.07].forEach((ox) => {
        const outlet = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.002, 0.028), outletMaterial);
        outlet.position.set(ox, 0.036, 0);
        strip.add(outlet);
    });

    const rocker = new THREE.Mesh(
        new THREE.BoxGeometry(0.022, 0.004, 0.014),
        new THREE.MeshStandardMaterial({
            color: 0x662222, emissive: 0xd0402a, emissiveIntensity: 0.9
        })
    );
    rocker.position.set(0.113, 0.036, 0);
    strip.add(rocker);

    return strip;
}

/** Assemble the corner across from the door: the file cabinet tucked into
 *  the narrow stretch between the window and the east wall, drawers facing
 *  the doorway, with the banker's lamp, the router, and the surge protector
 *  arranged on top (lamp east of the curtain panel's swing, router tucked
 *  low behind it, surge strip along the front edge). */
function createFileCabinetCorner() {
    const { room } = LAYOUT;
    const innerE = room.maxX - room.wallT / 2;
    const innerN = room.minZ + room.wallT / 2;

    const cabW = 0.38, cabH = 0.72, cabD = 0.5;   // a real 15 x 28 in two-drawer
    // Stand off both walls far enough to clear the baseboards (their face
    // sits ~6 cm proud of the paint), the way a real cabinet rests against
    // the molding rather than inside it.
    const cx = innerE - 0.08 - cabW / 2;
    const cz = innerN + 0.08 + cabD / 2;

    const cabinet = createFileCabinet(cabW, cabH, cabD);
    cabinet.position.set(cx, 0, cz);
    registerOutdoorProp(cabinet, 'cabinet');
    officeGroup.add(cabinet);

    const lamp = createBankersLamp();
    lamp.position.set(cx + 0.045, cabH, cz);
    registerOutdoorProp(lamp, 'lamp');
    officeGroup.add(lamp);

    const router = createWifiRouter();
    router.position.set(cx - 0.11, cabH, cz - 0.12);
    router.rotation.y = 0.12;
    registerOutdoorProp(router, 'router');
    officeGroup.add(router);

    const surge = createSurgeProtector();
    surge.position.set(cx - 0.04, cabH, cz + 0.17);
    registerOutdoorProp(surge, 'surge');
    officeGroup.add(surge);

    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(cx - cabW / 2 - 0.02, 0, cz - cabD / 2 - 0.02),
            new THREE.Vector3(cx + cabW / 2 + 0.02, cabH + 0.02, cz + cabD / 2 + 0.02)
        ),
        type: 'decor'
    });
}

// ---- The son's desk ----

const navyPaint = new THREE.MeshStandardMaterial({ color: 0x28466e, roughness: 0.55, metalness: 0.0 });
const knobPale = new THREE.MeshStandardMaterial({ color: 0xe9e5db, roughness: 0.6, metalness: 0.0 });

/** White and blue striped seat fabric for the chair cushion. */
function createSeatStripeTexture() {
    const canvas = makeCanvas(64, 64);
    const ctx = canvas.getContext('2d');
    for (let s = 0; s < 8; s++) {
        ctx.fillStyle = s % 2 ? '#4a6ba0' : '#f2f2ee';
        ctx.fillRect(s * 8, 0, 8, 64);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    return texture;
}

/** The son's navy blue wooden desk. Bought when he was nine, so it is a
 *  genuinely small desk: a column of three drawers on the west side (away
 *  from the file cabinet) and one shallow pencil drawer on the east side,
 *  above where the chair tucks in. Origin at the center of its footprint;
 *  the sitter faces the window (north). */
function createSonDesk(deskW) {
    const desk = new THREE.Group();
    desk.name = 'sonDesk';

    const deskH = 0.66;      // a true 26 in kid-desk height
    const deskD = 0.55;
    const halfW = deskW / 2;

    const top = new THREE.Mesh(new THREE.BoxGeometry(deskW, 0.035, deskD), navyPaint);
    top.position.y = deskH - 0.0175;
    top.castShadow = true;
    desk.add(top);

    // The three-drawer pedestal, west end
    const pedW = 0.38, pedH = deskH - 0.035, pedD = deskD - 0.05;
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(pedW, pedH, pedD), navyPaint);
    pedestal.position.set(-halfW + pedW / 2 + 0.01, pedH / 2, -0.01);
    pedestal.castShadow = true;
    desk.add(pedestal);
    [0.13, 0.32, 0.51].forEach((fy, i) => {
        const front = new THREE.Mesh(new THREE.BoxGeometry(pedW - 0.04, 0.165, 0.015), navyPaint);
        front.position.set(pedestal.position.x, fy, pedD / 2 - 0.01 + 0.01);
        front.name = `sonDrawer${i}`;
        desk.add(front);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), knobPale);
        knob.position.set(pedestal.position.x, fy + 0.045, pedD / 2 + 0.015);
        desk.add(knob);
    });

    // The shallow pencil drawer on the east side, above the chair seat
    const pencilDrawer = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, pedD), navyPaint);
    pencilDrawer.position.set(halfW - 0.33, deskH - 0.035 - 0.045 - 0.005, -0.01);
    desk.add(pencilDrawer);
    const pencilKnob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), knobPale);
    pencilKnob.position.set(pencilDrawer.position.x, pencilDrawer.position.y, pedD / 2 + 0.012);
    desk.add(pencilKnob);

    // Legs at the east end, and a modesty panel across the back
    [-0.24, 0.24].forEach((lz) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, deskH - 0.035, 0.04), navyPaint);
        leg.position.set(halfW - 0.04, (deskH - 0.035) / 2, lz);
        desk.add(leg);
    });
    const modesty = new THREE.Mesh(
        new THREE.BoxGeometry(deskW - pedW - 0.12, 0.24, 0.02),
        navyPaint
    );
    modesty.position.set((pedW - 0.06) / 2, deskH - 0.18, -deskD / 2 + 0.06);
    desk.add(modesty);

    return desk;
}

/** The matching navy wooden chair, its seat upholstered in white and blue
 *  striped fabric. Faces the desk (north). Origin at seat-center floor. */
function createSonChair() {
    const chair = new THREE.Group();
    chair.name = 'sonChair';

    const seatH = 0.35;
    [-0.15, 0.15].forEach((lx) => {
        [-0.15, 0.15].forEach((lz) => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.035, seatH, 0.035), navyPaint);
            leg.position.set(lx, seatH / 2, lz);
            chair.add(leg);
        });
    });

    const seatFrame = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.03, 0.38), navyPaint);
    seatFrame.position.y = seatH + 0.015;
    seatFrame.castShadow = true;
    chair.add(seatFrame);

    const cushion = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.045, 0.36),
        new THREE.MeshStandardMaterial({ map: createSeatStripeTexture(), roughness: 0.9, metalness: 0.0 })
    );
    cushion.position.y = seatH + 0.03 + 0.022;
    chair.add(cushion);

    // Backrest behind the sitter (the south side: the sitter faces north)
    [-0.155, 0.155].forEach((sx) => {
        const stile = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.03), navyPaint);
        stile.position.set(sx, seatH + 0.2, 0.17);
        chair.add(stile);
    });
    [0.55, 0.67].forEach((sy) => {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.07, 0.02), navyPaint);
        slat.position.set(0, sy, 0.17);
        chair.add(slat);
    });

    return chair;
}

/** The son's desk lamp: a pencil-holder cup base (pencils included), a
 *  flexible two-segment arm, and a glowing ring light head. */
function createRingLamp() {
    const lamp = new THREE.Group();
    lamp.name = 'ringLamp';

    const whiteBody = new THREE.MeshStandardMaterial({ color: 0xf2f0ec, roughness: 0.5, metalness: 0.0 });

    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 14), whiteBody);
    cup.position.y = 0.05;
    lamp.add(cup);
    const cupMouth = new THREE.Mesh(
        new THREE.CylinderGeometry(0.036, 0.036, 0.006, 14),
        new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.9 })
    );
    cupMouth.position.y = 0.102;
    lamp.add(cupMouth);

    // A few pencils poking out of the cup
    [[0xe8c840, -0.012, 0.006, 0.12], [0xc84032, 0.014, -0.008, 0.1], [0x3c5c8e, 0.002, 0.014, 0.13]].forEach(([color, px, pz, ph], i) => {
        const pencil = new THREE.Mesh(
            new THREE.CylinderGeometry(0.006, 0.006, ph, 6),
            new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
        );
        pencil.position.set(px, 0.1 + ph / 2 - 0.02, pz);
        pencil.rotation.z = (i - 1) * 0.14;
        lamp.add(pencil);
    });

    // The flexible arm: two segments with a joint, leaning toward the desk
    const armLow = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 8), whiteBody);
    armLow.position.set(-0.02, 0.17, 0.01);
    armLow.rotation.z = 0.25;
    lamp.add(armLow);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), whiteBody);
    joint.position.set(-0.04, 0.245, 0.015);
    lamp.add(joint);
    const armHigh = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8), whiteBody);
    armHigh.position.set(-0.055, 0.3, 0.045);
    armHigh.rotation.set(0.5, 0, 0.15);
    lamp.add(armHigh);

    // The ring light: a white shell with a glowing inner ring, tipped to
    // shine down at the desktop
    const ringHead = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.013, 10, 24), whiteBody);
    ringHead.add(shell);
    const glow = new THREE.Mesh(
        new THREE.TorusGeometry(0.044, 0.006, 8, 24),
        new THREE.MeshStandardMaterial({
            color: 0xffffff, emissive: 0xfff6e8, emissiveIntensity: 1.1, roughness: 0.3
        })
    );
    glow.position.z = 0.004;
    ringHead.add(glow);
    ringHead.position.set(-0.065, 0.37, 0.075);
    ringHead.rotation.x = -1.1;   // facing down-forward over the desk
    lamp.add(ringHead);

    return lamp;
}

/** Assemble the son's desk nook: the desk runs along the window wall from
 *  beside the file cabinet to just past the window's west edge, the chair
 *  tucks under the pencil drawer, and the ring lamp stands on the desktop. */
function createSonDeskNook() {
    const { room, window: win } = LAYOUT;
    const innerE = room.maxX - room.wallT / 2;
    const innerN = room.minZ + room.wallT / 2;

    // Width from the placement brief (east edge shy of the file cabinet,
    // west edge just past the window's west jamb), with the whole nook then
    // slid west so the desk keeps a clear gap from the cabinet and sits a
    // little nearer the litter-box corner.
    const nookShift = 0.12;
    const cabinetWestEdge = innerE - 0.08 - 0.38;   // mirrors createFileCabinetCorner
    const deskEast = cabinetWestEdge - 0.055 - nookShift;
    const deskWest = win.x - win.width / 2 - 0.045 - nookShift;
    const deskW = deskEast - deskWest;
    const deskX = (deskEast + deskWest) / 2;
    const deskZ = innerN + 0.08 + 0.275;   // clear of the baseboards, like the cabinet

    const desk = createSonDesk(deskW);
    desk.position.set(deskX, 0, deskZ);
    registerOutdoorProp(desk, 'sonDesk');
    officeGroup.add(desk);

    const chair = createSonChair();
    const chairX = deskX + deskW / 2 - 0.33;   // centered under the pencil drawer
    chair.position.set(chairX, 0, deskZ + 0.36);
    registerOutdoorProp(chair, 'sonChair');
    officeGroup.add(chair);

    // The lamp lives near the desk's west end, over the drawer pedestal
    // (kept a touch forward of the wall so its ring head clears the west
    // curtain panel, which hangs into that corner of the desktop's airspace)
    const lamp = createRingLamp();
    lamp.position.set(deskX - 0.48, 0.66, deskZ - 0.1);
    registerOutdoorProp(lamp, 'ringLamp');
    officeGroup.add(lamp);

    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(deskWest - 0.01, 0, deskZ - 0.29),
            new THREE.Vector3(deskEast + 0.01, 0.7, deskZ + 0.29)
        ),
        type: 'decor'
    });
    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(chairX - 0.2, 0, deskZ + 0.16),
            new THREE.Vector3(chairX + 0.2, 0.78, deskZ + 0.56)
        ),
        type: 'decor'
    });

    // The cat, asleep on the desktop just under the window, angled a touch
    // toward the room. Kept between the lamp and the pencil-drawer end so
    // she overlaps nothing (including the curtain panels above).
    const cat = createSleepingCat();
    cat.group.position.set(deskX + 0.11, 0.66, deskZ - 0.09);
    cat.group.rotation.y = -0.25;
    registerOutdoorProp(cat.group, 'cat');
    officeGroup.add(cat.group);
    sleepingCat = { mesh: cat.body, baseY: cat.body.scale.y };
}

// ---- The cat ----

/** The tuxedo cat, fast asleep in a loaf on the son's desk: black coat,
 *  white bib, muzzle, paws, and tail tip, ears up even in sleep, eyes
 *  closed (she has green eyes, but you will have to wake her someday to
 *  see them). Origin at the surface she sleeps on, body lying along +X
 *  with her head at the +X end. Returns { group, body } so the update
 *  loop can breathe her body gently. */
function createSleepingCat() {
    const cat = new THREE.Group();
    cat.name = 'sleepingCat';

    const furBlack = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95, metalness: 0.0 });
    const furWhite = new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.9, metalness: 0.0 });

    // The loaf: an ellipsoid body low on the desk
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), furBlack);
    body.scale.set(1.75, 0.78, 1.1);
    body.position.y = 0.068;
    body.castShadow = true;
    cat.add(body);

    // White chest bib peeking out at the front
    const bib = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), furWhite);
    bib.scale.set(1.0, 0.72, 0.85);
    bib.position.set(0.12, 0.048, 0.018);
    cat.add(bib);

    // Head resting forward on her paws
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), furBlack);
    head.position.set(0.15, 0.075, 0.015);
    head.castShadow = true;
    cat.add(head);

    // White muzzle and the little pink nose
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), furWhite);
    muzzle.scale.set(0.9, 0.7, 0.95);
    muzzle.position.set(0.19, 0.058, 0.018);
    cat.add(muzzle);
    const nose = new THREE.Mesh(
        new THREE.SphereGeometry(0.007, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xd48a94, roughness: 0.7 })
    );
    nose.position.set(0.207, 0.073, 0.018);
    cat.add(nose);

    // Ears stay up even in sleep
    [-0.018, 0.05].forEach((ez) => {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.032, 4), furBlack);
        ear.position.set(0.135, 0.128, ez);
        ear.rotation.x = (ez < 0 ? -1 : 1) * 0.2;
        cat.add(ear);
    });

    // Closed eyes: two soft charcoal lines on the black fur
    [-0.006, 0.042].forEach((ez) => {
        const lid = new THREE.Mesh(
            new THREE.BoxGeometry(0.014, 0.0025, 0.002),
            new THREE.MeshStandardMaterial({ color: 0x3c3c3c, roughness: 0.9 })
        );
        lid.position.set(0.192, 0.089, ez);
        lid.rotation.y = (ez < 0 ? 1 : -1) * 0.35;
        cat.add(lid);
    });

    // White front paws tucked under her chin
    [0.0, 0.036].forEach((pz) => {
        const paw = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), furWhite);
        paw.scale.set(1.3, 0.55, 0.9);
        paw.position.set(0.19, 0.012, pz);
        cat.add(paw);
    });

    // The tail curled around the loaf, white at the tip
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.017, 8, 18, 3.6), furBlack);
    tail.rotation.x = Math.PI / 2;
    tail.position.set(-0.04, 0.028, 0.02);
    cat.add(tail);
    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6), furWhite);
    tailTip.position.set(-0.139, 0.028, -0.029);
    cat.add(tailTip);

    return { group: cat, body };
}

// ---- The sit-stand desk ----

/** Steve's black IKEA-style sit-stand desk, shown in the standing
 *  position: a wide top on two telescoping T-legs with long feet, a
 *  crossbar for rigidity, and the little height-control paddle under the
 *  front edge. Origin at the floor center of its footprint; the top runs
 *  along Z (it lives against the west wall) with the front toward +X. */
function createSitStandDesk(topW, topL) {
    const desk = new THREE.Group();
    desk.name = 'sitStandDesk';

    const topBlack = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.6, metalness: 0.05 });
    const legBlack = new THREE.MeshStandardMaterial({ color: 0x232529, roughness: 0.4, metalness: 0.5 });

    const standH = 1.1;    // raised to standing height

    const top = new THREE.Mesh(new THREE.BoxGeometry(topW, 0.03, topL), topBlack);
    top.position.y = standH - 0.015;
    top.castShadow = true;
    desk.add(top);

    // Telescoping legs: a thicker lower stage and a thinner upper stage,
    // inset from the ends; feet run most of the top's depth
    const legZ = topL / 2 - 0.16;
    [-legZ, legZ].forEach((lz) => {
        const lower = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), legBlack);
        lower.position.set(0, 0.275, lz);
        desk.add(lower);
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.56, 0.058), legBlack);
        upper.position.set(0, 0.79, lz);
        desk.add(upper);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(topW - 0.2, 0.028, 0.1), legBlack);
        foot.position.set(0, 0.014, lz);
        foot.castShadow = true;
        desk.add(foot);
    });

    // Crossbar between the legs, and the height-control paddle under the
    // front edge
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, legZ * 2 - 0.1), legBlack);
    crossbar.position.set(0, standH - 0.06, 0);
    desk.add(crossbar);
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.06), legBlack);
    paddle.position.set(topW / 2 - 0.08, standH - 0.04, topL * 0.36);
    desk.add(paddle);

    return desk;
}

/** The black faux leather desk chair: five-star caster base, gas column,
 *  padded seat, raked backrest, and armrests. Faces -X (the desk). Sized
 *  so the whole chair rolls under the desk at standing height. */
function createDeskChair() {
    const chair = new THREE.Group();
    chair.name = 'deskChair';

    const leather = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.5, metalness: 0.05 });
    const chairMetal = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.4, metalness: 0.6 });

    // Five-star base with casters
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.05), chairMetal);
        leg.position.set(Math.cos(a) * 0.13, 0.06, Math.sin(a) * 0.13);
        leg.rotation.y = -a;
        chair.add(leg);
        const caster = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), chairMetal);
        caster.position.set(Math.cos(a) * 0.24, 0.028, Math.sin(a) * 0.24);
        chair.add(caster);
    }

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.36, 10), chairMetal);
    column.position.y = 0.26;
    chair.add(column);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.075, 0.46), leather);
    seat.position.y = 0.47;
    seat.castShadow = true;
    chair.add(seat);

    // Backrest on the +X side, raked back a touch
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.52, 0.44), leather);
    back.position.set(0.24, 0.78, 0);
    back.rotation.z = -0.12;
    back.castShadow = true;
    chair.add(back);

    // Armrests
    [-0.26, 0.26].forEach((az) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.03), chairMetal);
        post.position.set(0.1, 0.6, az);
        chair.add(post);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.06), leather);
        pad.position.set(0.04, 0.71, az);
        chair.add(pad);
    });

    return chair;
}

/** A two-receptacle power outlet with a beige face plate, built flat against the
 *  west wall (plate faces +X): two receptacles with slot marks. The surge
 *  protector's cord will run from here in a later pass. */
function createPowerOutlet() {
    const outlet = new THREE.Group();
    outlet.name = 'powerOutlet';

    const beige = new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: 0.7, metalness: 0.0 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.115, 0.075), beige);
    outlet.add(plate);

    const receptacleBeige = new THREE.MeshStandardMaterial({ color: 0xcabd9f, roughness: 0.65, metalness: 0.0 });
    const slotDark = new THREE.MeshStandardMaterial({ color: 0x54503f, roughness: 0.9, metalness: 0.0 });
    [-0.026, 0.026].forEach((ry) => {
        const receptacle = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.038, 0.028), receptacleBeige);
        receptacle.position.set(0.005, ry, 0);
        outlet.add(receptacle);
        [-0.007, 0.007].forEach((sz) => {
            const slot = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.013, 0.0035), slotDark);
            slot.position.set(0.01, ry + 0.003, sz);
            outlet.add(slot);
        });
    });

    return outlet;
}

// ---- The screens ----
// The meta payoff: the big monitor shows the source code of this very room
// mid-edit, and the MacBook shows scenexp.com, where that code ends up.

let monitorScreen = null;   // { canvas, ctx, texture }: redrawn for the cursor blink
let _cursorTime = 0;
let _cursorOn = true;
let closetActivityLed = null;   // the old tower's blinking drive light
let _closetBlink = 0;

// The editor's visible lines: recognizably this file. [text, color] pairs
// in a familiar dark-theme palette.
const EDITOR_LINES = [
    ['// steve/store.js - the room you are standing in', '#6a9955'],
    ['const LAYOUT = {', '#9cdcfe'],
    ['    room: { width: 10 * PFT, depth: 13 * PFT },', '#ce9178'],
    ['    closet: { minX: -5 * PFT, maxX: 2 * PFT },', '#ce9178'],
    ['    window: { x: 2.5 * PFT, width: 3 * PFT }', '#ce9178'],
    ['};', '#9cdcfe'],
    ['createRoom();', '#dcdcaa'],
    ['createClosetDoors();', '#dcdcaa'],
    ['createSleepingCat();   // do not wake', '#dcdcaa'],
    ['placeSteve(deskX, deskZ);', '#dcdcaa'],
    ['', '#d4d4d4'],
    ['// TODO: ship it', '#6a9955']
];

/** Paint the code editor onto the monitor's canvas: title bar, gutter,
 *  the room's own source, a blinking cursor, and a status bar painted the
 *  office's wall green. */
function drawCodeEditor(ctx, W, H, cursorOn) {
    ctx.fillStyle = '#1e1f24';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#17181c';
    ctx.fillRect(0, 0, W * 0.075, H);

    ctx.fillStyle = '#2b2d33';
    ctx.fillRect(0, 0, W, H * 0.075);
    ctx.fillStyle = '#9aa0a8';
    ctx.font = `${Math.round(H * 0.045)}px Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('store.js — SceneXP', W / 2, H * 0.055);

    const lineFont = `${Math.round(H * 0.048)}px Menlo, Consolas, monospace`;
    const lh = H * 0.066;
    const top = H * 0.155;
    ctx.font = lineFont;
    EDITOR_LINES.forEach((line, i) => {
        const y = top + i * lh;
        ctx.fillStyle = '#4d525a';
        ctx.textAlign = 'right';
        ctx.fillText(String(i + 1), W * 0.062, y);
        ctx.textAlign = 'left';
        ctx.fillStyle = line[1];
        ctx.fillText(line[0], W * 0.095, y);
    });

    if (cursorOn) {
        const last = EDITOR_LINES[EDITOR_LINES.length - 1][0];
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(
            W * 0.095 + ctx.measureText(last).width + 4,
            top + (EDITOR_LINES.length - 1) * lh - lh * 0.6,
            3, lh * 0.72
        );
    }

    ctx.fillStyle = '#335241';
    ctx.fillRect(0, H * 0.94, W, H * 0.06);
    ctx.fillStyle = '#e6efe9';
    ctx.font = `${Math.round(H * 0.036)}px Menlo, Consolas, monospace`;
    ctx.fillText('main*   utf-8   js   Ln 12', W * 0.02, H * 0.982);
}

/**
 * Paint the editor into any context, at any size, in the state the monitor on
 * the wall is in right now (including which half of the cursor blink it is on).
 *
 * THE SAME ROUTINE, THE SECOND SURFACE. main.js opens an enlarged monitor over
 * the room and repaints it through here, so the close-up cannot drift from the
 * screen it enlarges: one drawing, one set of lines, two canvases. Every
 * measurement in drawCodeEditor is a fraction of W and H, so this is crisp at
 * a 1600 px overlay and at the 512 px texture alike, which is the whole reason
 * the texture was written that way.
 */
let _overlayCursor = null;   // the blink state the enlarged view last painted

export function drawMonitorTo(ctx, W, H, force) {
    if (!ctx || !W || !H) return false;
    // ONLY WHEN SOMETHING CHANGED. The caller repaints on every animation
    // frame, and the only thing that moves on this screen is a cursor blinking
    // twice a second, so painting 60 times a second would redraw an identical
    // image 58 of them. Under reduced motion the blink stops entirely and this
    // paints exactly once. `force` is for the moments the picture has to be
    // laid down whatever the cursor is doing: opening the view, and resizing
    // the canvas out from under it.
    if (!force && _overlayCursor === _cursorOn) return false;
    _overlayCursor = _cursorOn;
    drawCodeEditor(ctx, W, H, _cursorOn);
    return true;
}

/** The lines the monitor is showing, for anybody who cannot see a canvas. The
 *  enlarged view puts these in the page as text, so a screen reader reads the
 *  room's own source rather than "canvas". */
export function getEditorLines() {
    return EDITOR_LINES.map(([text]) => text);
}

/** The MacBook's screen: scenexp.com in a little browser window, matching
 *  the real site's dark theme (site.css: bg #0e0f14, raised #171922,
 *  violet #8b71ff to cyan #22d3ee accents). Traffic lights, address bar,
 *  the gradient wordmark, and a grid of experience cards. */
function createMacScreenTexture() {
    const canvas = makeCanvas(384, 256);
    const ctx = canvas.getContext('2d');

    // Browser chrome with traffic lights and the address pill, dark
    ctx.fillStyle = '#171922';
    ctx.fillRect(0, 0, 384, 28);
    [['#f26d63', 14], ['#f4bf4f', 30], ['#57c353', 46]].forEach(([color, cx]) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, 14, 5, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.fillStyle = '#1e2130';
    ctx.beginPath();
    ctx.roundRect(70, 6, 244, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#a3a7b5';
    ctx.font = '11px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('scenexp.com', 192, 18);

    // The page: near-black, with the gradient wordmark
    ctx.fillStyle = '#0e0f14';
    ctx.fillRect(0, 28, 384, 228);
    const wordmark = ctx.createLinearGradient(120, 0, 264, 0);
    wordmark.addColorStop(0, '#8b71ff');
    wordmark.addColorStop(1, '#22d3ee');
    ctx.fillStyle = wordmark;
    ctx.font = 'bold 30px -apple-system, "Segoe UI", sans-serif';
    ctx.fillText('SceneXP', 192, 72);
    ctx.fillStyle = '#a3a7b5';
    ctx.font = '12px -apple-system, "Segoe UI", sans-serif';
    ctx.fillText('Custom 3D experiences, built with love', 192, 94);

    // The experience cards: raised dark tiles, each with its scene's
    // colorful capture up top and a soft text line below
    const cardColors = ['#ff5d8f', '#4a90d9', '#19c3b1', '#ffd23f', '#8e5bd9', '#5a8f4a'];
    cardColors.forEach((color, i) => {
        const cx = 22 + (i % 3) * 118;
        const cy = 118 + Math.floor(i / 3) * 62;
        ctx.fillStyle = '#171922';
        ctx.beginPath();
        ctx.roundRect(cx - 2, cy - 2, 104, 56, 6);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(cx, cy, 100, 36, 5);
        ctx.fill();
        ctx.fillStyle = '#2a2e3d';
        ctx.beginPath();
        ctx.roundRect(cx + 4, cy + 41, 60, 7, 3);
        ctx.fill();
    });

    return new THREE.CanvasTexture(canvas);
}

/** The MacBook's deck, drawn rather than modeled: the black keyboard well up
 *  by the hinge and the trackpad below it, on an aluminum ground that matches
 *  the body so the plate's edge disappears into the case. One pixel per
 *  millimetre of deck, so the numbers below read as real sizes. */
function createMacDeckTexture() {
    const W = 304, H = 212;               // the deck, in millimetres
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#c9cbce';
    ctx.fillRect(0, 0, W, H);

    // The keyboard well. The plane this lands on is laid down with its top
    // edge toward the hinge, so y = 0 here is the back of the laptop.
    const wellX = 18, wellY = 9, wellW = W - 36, wellH = 98;
    ctx.fillStyle = '#26282c';
    ctx.beginPath();
    ctx.roundRect(wellX, wellY, wellW, wellH, 5);
    ctx.fill();

    // Keys: a short function row, then four full rows, the last with a
    // spacebar through the middle of it.
    const cols = 14;
    const keyW = wellW / cols;
    const fnH = 11, rowH = (wellH - fnH - 8) / 4;
    const key = (x, y, w, h) => {
        ctx.fillStyle = '#15161a';
        ctx.beginPath();
        ctx.roundRect(x + 1.2, y + 1.2, w - 2.4, h - 2.4, 1.8);
        ctx.fill();
    };
    for (let c = 0; c < cols; c++) key(wellX + c * keyW, wellY + 4, keyW, fnH);
    for (let r = 0; r < 4; r++) {
        const y = wellY + 4 + fnH + r * rowH;
        if (r === 3) {
            // command, option, spacebar, option, command
            key(wellX, y, keyW * 2, rowH);
            key(wellX + keyW * 2, y, keyW * 1.5, rowH);
            key(wellX + keyW * 3.5, y, keyW * 7, rowH);
            key(wellX + keyW * 10.5, y, keyW * 1.5, rowH);
            key(wellX + keyW * 12, y, keyW * 2, rowH);
        } else {
            for (let c = 0; c < cols; c++) key(wellX + c * keyW, y, keyW, rowH);
        }
    }

    // The trackpad: the same aluminum, a shade cooler, with a hairline seam.
    // Centred, and sized off the real one (about 124 by 76 of these).
    const padW = 124, padH = 76;
    ctx.fillStyle = '#c2c5c9';
    ctx.strokeStyle = '#a7abb0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect((W - padW) / 2, 120, padW, padH, 7);
    ctx.fill();
    ctx.stroke();

    // TAGGED sRGB, UNLIKE THE SCREENS ABOVE, and on purpose: this texture
    // butts up against the case, which is a material colour and therefore
    // decoded. Left untagged, the same #c9cbce drawn here comes out brighter
    // than the aluminum around it and the deck reads as a lid on a box.
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/** The MacBook Air, open on a small aluminum laptop stand: foot, riser,
 *  tilted plate, and the laptop with keyboard and a soft glowing screen.
 *  Faces +Z before placement. */
function createMacBookOnStand() {
    const group = new THREE.Group();
    group.name = 'macbookAir';

    const aluminum = new THREE.MeshStandardMaterial({ color: 0xd6d8da, roughness: 0.35, metalness: 0.7 });

    // ---- The stand: foot, riser, and the plate the laptop rests on ----
    const PLATE_TILT = 0.22;              // the plate's rake, back edge high
    const PLATE_T = 0.01;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.22), aluminum);
    foot.position.y = 0.009;
    group.add(foot);
    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.04), aluminum);
    riser.position.set(0, 0.05, -0.07);
    group.add(riser);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, PLATE_T, 0.24), aluminum);
    plate.position.y = 0.1;
    plate.rotation.x = PLATE_TILT;
    group.add(plate);

    // ---- The laptop, built flat and tipped onto the plate as ONE piece ----
    //
    // THE HINGE USED TO BE TWO SETS OF NUMBERS AND THEY DRIFTED. The deck and
    // the lid were each placed in the stand's frame, with their own position
    // and their own tilt, which left the lid's bottom edge 4 cm below the deck
    // and 1 cm in front of its back edge: the screen grew out of the middle of
    // the keyboard, and its bottom corner came through the deck to the plate
    // (specs/screenshots, 2026-09-21). Nothing in the code said the two were
    // joined, so nothing kept them joined.
    //
    // Here the laptop is a group of its own, built flat with its deck on
    // y = 0, and the lid hangs off a hinge pinned to the deck's back edge.
    // Tipping the laptop onto the plate moves both together, so the joint
    // survives any rake on the stand and any opening angle on the lid.
    const DECK_W = 0.304, DECK_D = 0.212, DECK_T = 0.011;
    const LID_H = 0.2, LID_T = 0.006;
    const HINGE_R = DECK_T / 2;           // the barrel is the deck's own thickness
    // The lid's angle from the deck: 90 degrees would stand it straight up,
    // and this reclines it another 29 for the room's eye, which looks slightly
    // down on the desk. It is the same angle the lid was drawn at before.
    const LID_OPEN = -0.5;

    const laptop = new THREE.Group();
    laptop.name = 'macLaptop';
    // Sitting on the plate's top face: the plate's centre, lifted along the
    // plate's own normal rather than straight up.
    laptop.position.set(
        0,
        plate.position.y + (PLATE_T / 2) * Math.cos(PLATE_TILT),
        (PLATE_T / 2) * Math.sin(PLATE_TILT)
    );
    laptop.rotation.x = PLATE_TILT;
    group.add(laptop);

    const macBody = new THREE.MeshStandardMaterial({ color: 0xc9cbce, roughness: 0.4, metalness: 0.6 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(DECK_W, DECK_T, DECK_D), macBody);
    deck.name = 'macDeck';
    deck.position.y = DECK_T / 2;
    laptop.add(deck);

    const deckTexture = createMacDeckTexture();
    const deckFace = new THREE.Mesh(
        new THREE.PlaneGeometry(DECK_W - 0.004, DECK_D - 0.004),
        new THREE.MeshStandardMaterial({ map: deckTexture, roughness: 0.55, metalness: 0.25 })
    );
    deckFace.rotation.x = -Math.PI / 2;   // face up, texture's top edge to the hinge
    deckFace.position.y = DECK_T + 0.0004;
    laptop.add(deckFace);

    // The hinge itself: the axis the lid turns on, seated in the deck's back
    // edge at half the deck's thickness, so the lid comes up through the top
    // face a couple of millimetres in front of the back, the way a seated lid
    // does. Everything the lid is made of hangs off this, which is what makes
    // "where the lid meets the deck" one number instead of two.
    const hinge = new THREE.Group();
    hinge.name = 'macHinge';
    hinge.position.set(0, DECK_T / 2, -DECK_D / 2 + HINGE_R);
    hinge.rotation.x = LID_OPEN;
    laptop.add(hinge);

    // The barrel fills the joint. At the angle below it is tucked inside the
    // case and barely shows; it earns its ten sides at any wider one, where
    // the lid's foot swings clear of the deck and would otherwise leave a slot.
    const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(HINGE_R, HINGE_R, DECK_W - 0.012, 10),
        new THREE.MeshStandardMaterial({ color: 0x8d9094, roughness: 0.5, metalness: 0.6 })
    );
    barrel.rotation.z = Math.PI / 2;      // lying across the back of the case
    hinge.add(barrel);

    const lid = new THREE.Mesh(new THREE.BoxGeometry(DECK_W, LID_H, LID_T), macBody);
    lid.name = 'macLid';
    lid.position.y = LID_H / 2;           // standing on the hinge
    hinge.add(lid);

    const macScreenTexture = createMacScreenTexture();
    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.288, 0.185),
        new THREE.MeshStandardMaterial({
            map: macScreenTexture, emissive: 0xffffff, emissiveMap: macScreenTexture,
            emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.0
        })
    );
    screen.name = 'macScreen';
    // Just proud of the lid's front face, with a slightly deeper chin than
    // brow, the way the real one wears its bezel.
    screen.position.set(0, LID_H / 2 + 0.002, LID_T / 2 + 0.0004);
    hinge.add(screen);

    return group;
}

/** The big silver and beige widescreen Samsung: beige bezel, silver stand,
 *  trim line, dark glossy panel, and the wordmark on the bottom bezel.
 *  Faces +Z before placement. */
function createSamsungMonitor() {
    const monitor = new THREE.Group();
    monitor.name = 'samsungMonitor';

    const beigeBezel = new THREE.MeshStandardMaterial({ color: 0xd6d0c2, roughness: 0.6, metalness: 0.05 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.02, 16), brushedMetal);
    base.scale.x = 1.5;
    base.position.y = 0.01;
    monitor.add(base);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.17, 0.035), brushedMetal);
    neck.position.set(0, 0.1, -0.02);
    monitor.add(neck);

    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.42, 0.045), beigeBezel);
    bezel.position.y = 0.37;
    bezel.castShadow = true;
    monitor.add(bezel);
    const editorCanvas = makeCanvas(512, 300);
    const editorCtx = editorCanvas.getContext('2d');
    const editorTexture = new THREE.CanvasTexture(editorCanvas);
    drawCodeEditor(editorCtx, 512, 300, true);
    editorTexture.needsUpdate = true;
    monitorScreen = { canvas: editorCanvas, ctx: editorCtx, texture: editorTexture };
    const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6, 0.35),
        new THREE.MeshStandardMaterial({
            map: editorTexture, emissive: 0xffffff, emissiveMap: editorTexture,
            emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.0
        })
    );
    panel.position.set(0, 0.375, 0.0235);
    monitor.add(panel);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.012, 0.047), brushedMetal);
    trim.position.set(0, 0.168, 0);
    monitor.add(trim);

    const markCanvas = makeCanvas(128, 24);
    const markCtx = markCanvas.getContext('2d');
    markCtx.fillStyle = '#d6d0c2';
    markCtx.fillRect(0, 0, 128, 24);
    markCtx.fillStyle = '#57534a';
    markCtx.font = 'bold 15px "Segoe UI", Verdana, sans-serif';
    markCtx.textAlign = 'center';
    markCtx.textBaseline = 'middle';
    markCtx.fillText('SAMSUNG', 64, 13);
    const wordmark = new THREE.Mesh(
        new THREE.PlaneGeometry(0.1, 0.018),
        new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(markCanvas), roughness: 0.6 })
    );
    wordmark.position.set(0, 0.181, 0.0236);
    monitor.add(wordmark);

    return monitor;
}

/** A cable: a slim dark tube sagging through the given points. */
function createCord(points, radius, color) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    return new THREE.Mesh(
        new THREE.TubeGeometry(curve, 20, radius || 0.005, 6, false),
        new THREE.MeshStandardMaterial({ color: color || 0x1b1c1e, roughness: 0.8, metalness: 0.0 })
    );
}

/** Everything on the sit-stand desktop: the ring lamp in the back-left
 *  corner (mirroring the son's desk), then the MacBook on its stand, the
 *  surge protector, and the Samsung, with power cords from lamp, MacBook,
 *  and monitor to the surge protector, an HDMI cable from monitor to
 *  MacBook, and the surge protector's own cord dropping behind the desk
 *  to the wall outlet. Back-left is the wall side, south end (the desk's
 *  user faces west). */
function createDesktopGear(deskX, deskZ, innerW) {
    const s = 1.1;   // the desktop surface height

    const lamp = createRingLamp();
    lamp.position.set(deskX - 0.33, s, deskZ + 0.7);
    lamp.rotation.y = Math.PI / 2;   // head out toward the room (east)
    registerOutdoorProp(lamp, 'ringLamp');
    officeGroup.add(lamp);

    const mac = createMacBookOnStand();
    mac.position.set(deskX - 0.28, s, deskZ + 0.33);
    mac.rotation.y = Math.PI / 2;    // screen east, toward the user
    registerOutdoorProp(mac, 'macbook');
    officeGroup.add(mac);

    const surge = createSurgeProtector();
    surge.position.set(deskX - 0.42, s, deskZ - 0.02);
    surge.rotation.y = Math.PI / 2;  // strip runs along the desk's length
    registerOutdoorProp(surge, 'surge');
    officeGroup.add(surge);

    const monitor = createSamsungMonitor();
    monitor.position.set(deskX - 0.3, s, deskZ - 0.48);
    monitor.rotation.y = Math.PI / 2;
    registerOutdoorProp(monitor, 'monitor');
    officeGroup.add(monitor);

    // The wireless Magic Keyboard in the clear space at the front center
    // of the desk, and the Magic Mouse on its black pad to the typist's
    // right (both wireless, so no cords to the surge protector)
    const kbAluminum = new THREE.MeshStandardMaterial({ color: 0xd8dadc, roughness: 0.4, metalness: 0.6 });
    const keyboard = new THREE.Group();
    keyboard.name = 'magicKeyboard';
    const kbBody = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.009, 0.279), kbAluminum);
    kbBody.position.set(0, 0.0045, 0);
    keyboard.add(kbBody);
    const kbKeys = new THREE.Mesh(
        new THREE.PlaneGeometry(0.1, 0.26),
        new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.6, metalness: 0.0 })
    );
    kbKeys.rotation.x = -Math.PI / 2;
    kbKeys.position.set(-0.004, 0.0095, 0);
    keyboard.add(kbKeys);
    keyboard.position.set(deskX + 0.27, s, deskZ - 0.08);
    registerOutdoorProp(keyboard, 'keyboard');
    officeGroup.add(keyboard);

    const mouseSet = new THREE.Group();
    mouseSet.name = 'magicMouse';
    const mousepad = new THREE.Mesh(
        new THREE.BoxGeometry(0.23, 0.004, 0.19),
        new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.95, metalness: 0.0 })
    );
    mousepad.position.y = 0.002;
    mouseSet.add(mousepad);
    const mouse = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.3, metalness: 0.05 })
    );
    mouse.scale.set(1.42, 0.32, 0.72);   // the low Magic Mouse arc, long axis toward the user
    mouse.position.y = 0.016;
    mouseSet.add(mouse);
    mouseSet.position.set(deskX + 0.28, s, deskZ - 0.38);
    registerOutdoorProp(mouseSet, 'mouse');
    officeGroup.add(mouseSet);

    // Power cords to the surge protector, resting on the desktop
    officeGroup.add(createCord([
        [deskX - 0.36, s + 0.004, deskZ + 0.64],
        [deskX - 0.46, s + 0.004, deskZ + 0.3],
        [deskX - 0.45, s + 0.004, deskZ + 0.08]
    ]));
    officeGroup.add(createCord([
        [deskX - 0.31, s + 0.004, deskZ + 0.22],
        [deskX - 0.42, s + 0.004, deskZ + 0.12],
        [deskX - 0.44, s + 0.004, deskZ + 0.03]
    ]));
    officeGroup.add(createCord([
        [deskX - 0.34, s + 0.004, deskZ - 0.44],
        [deskX - 0.47, s + 0.004, deskZ - 0.26],
        [deskX - 0.46, s + 0.004, deskZ - 0.08]
    ]));

    // The HDMI cable, monitor to MacBook, a slightly heavier lead
    officeGroup.add(createCord([
        [deskX - 0.26, s + 0.004, deskZ - 0.42],
        [deskX - 0.18, s + 0.004, deskZ - 0.06],
        [deskX - 0.24, s + 0.004, deskZ + 0.26]
    ], 0.006, 0x26282c));

    // The surge protector's own cord, over the back edge and down to the
    // outlet on the wall behind the desk
    officeGroup.add(createCord([
        [deskX - 0.47, s + 0.002, deskZ - 0.12],
        [deskX - 0.56, s - 0.02, deskZ - 0.05],
        [innerW + 0.16, 0.55, deskZ + 0.12],
        [innerW + 0.022, 0.335, deskZ + 0.2]
    ], 0.006));
}

/** A light switch with a beige face plate matching the power outlet:
 *  built flat against a wall face, plate facing +X, the traditional
 *  toggle flipped up because the ceiling light is on. */
function createLightSwitchPlate() {
    const sw = new THREE.Group();
    sw.name = 'lightSwitch';

    const beige = new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: 0.7, metalness: 0.0 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.115, 0.075), beige);
    sw.add(plate);

    const toggle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.034, 0.013), beige);
    toggle.position.set(0.014, 0.004, 0);
    toggle.rotation.z = -0.3;   // flipped up: on
    sw.add(toggle);

    return sw;
}

/** Place the sit-stand desk against the west wall, centered along the
 *  wall's exposed run (window wall to closet front), standing off the
 *  baseboards like the rest of the furniture. */
function createSitStandDeskWall() {
    const { room, closet } = LAYOUT;
    const innerW = room.minX + room.wallT / 2;
    const innerN = room.minZ + room.wallT / 2;
    const closetFront = closet.minZ - room.wallT / 2;

    // Scaled up ~25% from a true 5 x 3 ft so it sits right in the
    // plan-scaled room (a true-size top read as too small here).
    const deskDepth = 1.15;
    const deskLen = 1.9;
    const deskX = innerW + 0.08 + deskDepth / 2;
    const deskZ = (innerN + closetFront) / 2;

    const desk = createSitStandDesk(deskDepth, deskLen);
    desk.position.set(deskX, 0, deskZ);
    registerOutdoorProp(desk, 'standDesk');
    officeGroup.add(desk);

    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(deskX - deskDepth / 2 - 0.02, 0, deskZ - deskLen / 2 - 0.03),
            new THREE.Vector3(deskX + deskDepth / 2 + 0.02, 1.12, deskZ + deskLen / 2 + 0.03)
        ),
        type: 'decor'
    });

    // The chair, pushed in under the raised desk between its legs (its
    // backrest tops out just below the desk's underside)
    const chair = createDeskChair();
    chair.position.set(deskX + 0.25, 0, deskZ);
    registerOutdoorProp(chair, 'deskChair');
    officeGroup.add(chair);

    // The power outlet low on the wall behind the desk, visible in the gap
    // behind the legs, with the surge protector's cord running to it
    const outlet = createPowerOutlet();
    outlet.position.set(innerW + 0.009, 0.32, deskZ + 0.2);
    registerOutdoorProp(outlet, 'outlet');
    officeGroup.add(outlet);

    // Everything on the desktop: lamp, MacBook, surge protector, monitor,
    // and the cabling between them (and down to the outlet)
    createDesktopGear(deskX, deskZ, innerW);

    // And the man himself, standing at the desk working on SceneXP
    placeSteve(deskX, deskZ);
}

// ---- The northwest corner: trash can, litter box, and mat ----

/** The small black trash can beside the son's desk: a tapered cylinder
 *  with a rim and a dark open mouth. */
function createTrashCan() {
    const can = new THREE.Group();
    can.name = 'trashCan';

    const black = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.6, metalness: 0.1 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.085, 0.28, 14), black);
    body.position.y = 0.14;
    body.castShadow = true;
    can.add(body);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.109, 0.109, 0.018, 14), black);
    rim.position.y = 0.281;
    can.add(rim);
    const mouth = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095, 0.095, 0.004, 14),
        new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.95 })
    );
    mouth.position.y = 0.292;
    can.add(mouth);

    return can;
}

/** The hooded kitty litter box: beige pan, slightly darker beige hood with
 *  a carry handle, an arched dark opening in the east face, and the small
 *  black mat on the floor just outside it. Opening faces +X; the corner
 *  builder aims it at the rest of the room. */
function createLitterBox() {
    const litter = new THREE.Group();
    litter.name = 'litterBox';

    const beigePan = new THREE.MeshStandardMaterial({ color: 0xdcd0b6, roughness: 0.7, metalness: 0.0 });
    const beigeHood = new THREE.MeshStandardMaterial({ color: 0xcbbd9e, roughness: 0.7, metalness: 0.0 });

    const pan = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.4), beigePan);
    pan.position.y = 0.07;
    pan.castShadow = true;
    litter.add(pan);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.26, 0.38), beigeHood);
    hood.position.y = 0.27;
    hood.castShadow = true;
    litter.add(hood);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.03), beigePan);
    handle.position.y = 0.41;
    litter.add(handle);

    // The arched opening in the east face: a dark rectangle capped by a
    // half circle, sitting a hair proud of the hood so it never z-fights
    const openingDark = new THREE.MeshStandardMaterial({ color: 0x2c2721, roughness: 0.95 });
    const doorway = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.16), openingDark);
    doorway.rotation.y = Math.PI / 2;
    doorway.position.set(0.241, 0.24, 0);
    litter.add(doorway);
    const arch = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12, 0, Math.PI), openingDark);
    arch.rotation.y = Math.PI / 2;
    arch.position.set(0.241, 0.32, 0);
    litter.add(arch);

    // The little black mat just outside the opening
    const mat = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.008, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.95, metalness: 0.0 })
    );
    mat.position.set(0.43, 0.004, 0);
    mat.receiveShadow = true;
    litter.add(mat);

    return litter;
}

/** A kettlebell: a slightly flattened ball with a thick arched handle,
 *  all one color the way competition bells are. r is the ball radius. */
function createKettlebell(r, color) {
    const bell = new THREE.Group();

    const bellMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), bellMaterial);
    ball.scale.y = 0.94;
    ball.position.y = r * 0.9;   // settled: the flattened base meets the floor
    ball.castShadow = true;
    bell.add(ball);

    const handle = new THREE.Mesh(
        new THREE.TorusGeometry(r * 0.58, r * 0.16, 8, 14, Math.PI),
        bellMaterial
    );
    handle.position.y = r * 1.72;
    handle.castShadow = true;
    bell.add(handle);

    return bell;
}

/** Three kettlebells along the wall between the trash can and the litter
 *  mat, heaviest to lightest: competition red, blue, yellow. Currently
 *  unplaced (see the note in createNorthwestCorner), kept ready for a
 *  future pass. */
function createKettlebellRow(innerN) {
    const row = new THREE.Group();
    row.name = 'kettlebells';

    const bells = [
        { r: 0.105, color: 0xb03030, x: -0.95 },   // the big red
        { r: 0.085, color: 0x3a5fa8, x: -0.5 },    // the middle blue
        { r: 0.07,  color: 0xd8b13c, x: -0.12 }    // the little yellow
    ];
    bells.forEach((spec, i) => {
        const bell = createKettlebell(spec.r, spec.color);
        bell.position.set(spec.x, 0, innerN + 0.08 + spec.r);
        bell.rotation.y = (i - 1) * 0.35;   // handles angled a bit differently
        row.add(bell);
    });

    registerOutdoorProp(row, 'kettlebells');
    officeGroup.add(row);
    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(-1.09, 0, innerN + 0.06),
            new THREE.Vector3(0.0, 0.36, innerN + 0.3)
        ),
        type: 'decor'
    });
}

/** Place the trash can beside the son's desk and the litter box in the
 *  northwest corner, opening (and mat) facing back toward the room. */
function createNorthwestCorner() {
    const { room, window: win } = LAYOUT;
    const innerW = room.minX + room.wallT / 2;
    const innerN = room.minZ + room.wallT / 2;
    const deskWest = win.x - win.width / 2 - 0.045 - 0.12;   // mirrors createSonDeskNook (incl. its westward nookShift)

    const trashX = deskWest - 0.05 - 0.105;
    const trashZ = innerN + 0.08 + 0.105;
    const trash = createTrashCan();
    trash.position.set(trashX, 0, trashZ);
    registerOutdoorProp(trash, 'trash');
    officeGroup.add(trash);
    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(trashX - 0.12, 0, trashZ - 0.12),
            new THREE.Vector3(trashX + 0.12, 0.3, trashZ + 0.12)
        ),
        type: 'decor'
    });

    // (The kettlebell row is benched for now: createKettlebellRow(innerN)
    // places three bells along this wall whenever Steve wants them back.)

    const litterX = innerW + 0.08 + 0.25;
    const litterZ = innerN + 0.08 + 0.2;
    const litter = createLitterBox();
    litter.position.set(litterX, 0, litterZ);
    registerOutdoorProp(litter, 'litter');
    officeGroup.add(litter);
    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(litterX - 0.27, 0, litterZ - 0.22),
            new THREE.Vector3(litterX + 0.27, 0.44, litterZ + 0.22)
        ),
        type: 'decor'
    });

    return { trash, litter };
}

// ============================================
// LIGHTING
// ============================================
// The shared rig's default fixture grid is spaced from (width - 4), which
// goes negative in a room this small, so the office passes one explicit
// fixture centered over the main floor (clear of the closet). The rig's
// rectangular troffer suits the big activity rooms but not a home office,
// so its housing and panel meshes are hidden (the point light and the
// dimmer plumbing stay live) and the room's real fixture, the swirled
// glass dome below, hangs in their place. All experience code: the frozen
// shared 1.0.0 parts stay untouched.
function createOfficeLighting() {
    const { room, closet } = LAYOUT;
    const mainRoomCenterZ = (room.minZ + closet.minZ) / 2;
    createCeilingLights({ xs: [0], zs: [mainRoomCenterZ] });

    const rigFixture = getWorldGroup().getObjectByName('ceilingLight_1_1');
    if (rigFixture) {
        rigFixture.traverse((child) => { if (child.isMesh) child.visible = false; });
        const dome = createDomeLightFixture();
        // The rig hangs its group 0.2 below the ceiling; the dome builds
        // downward from the ceiling plane, so lift it back up flush.
        dome.position.y = 0.2;
        rigFixture.add(dome);
    }
}

/** The office's actual ceiling light: a round flush-mount about 11 in
 *  across. A slim white base sits against the ceiling, a frosted glass
 *  dome with a spiral swirl in the glass extends about 4.5 in down from
 *  it, and a small white screw cap finishes the bottom center. Origin at
 *  the ceiling plane, building downward. */
function createDomeLightFixture() {
    const group = new THREE.Group();
    group.name = 'domeLight';

    const baseR = 0.14;      // ~11 in diameter
    const baseH = 0.035;
    const domeR = baseR - 0.015;
    const domeDrop = 0.115;  // ~4.5 in of glass below the base

    // Base canopy, flush to the ceiling. A soft warm gray, darker than the
    // ceiling paint so the fixture reads against it instead of blending in.
    const fixtureGray = new THREE.MeshStandardMaterial({ color: 0xc9c5bd, roughness: 0.55, metalness: 0.05 });
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(baseR, baseR - 0.012, baseH, 24),
        fixtureGray
    );
    base.position.y = -baseH / 2;
    group.add(base);

    // The swirl in the glass: diagonal streaks on a tiling canvas wrap into
    // a helix around the dome's UV seam-free, reading as spiraled glasswork.
    const swirlCanvas = makeCanvas(256, 128);
    const swirlCtx = swirlCanvas.getContext('2d');
    swirlCtx.fillStyle = '#d6d3cc';
    swirlCtx.fillRect(0, 0, 256, 128);
    swirlCtx.lineWidth = 4;
    for (let i = 0; i < 14; i++) {
        const x = (i / 14) * 256;
        swirlCtx.strokeStyle = i % 2 ? 'rgba(236, 234, 229, 0.85)' : 'rgba(158, 152, 141, 0.5)';
        // Draw each streak three times, shifted a full tile, so the pattern
        // wraps cleanly where the texture repeats around the dome.
        [-256, 0, 256].forEach((shift) => {
            swirlCtx.beginPath();
            swirlCtx.moveTo(x + shift, 0);
            swirlCtx.lineTo(x + shift + 96, 128);
            swirlCtx.stroke();
        });
    }
    const swirlTexture = new THREE.CanvasTexture(swirlCanvas);
    swirlTexture.wrapS = THREE.RepeatWrapping;

    // Frosted glass dome, glowing gently (the rig's point light is the real
    // light source; the emissive keeps the glass reading lit from inside)
    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(domeR, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({
            map: swirlTexture,
            transparent: true, opacity: 0.92,
            emissive: 0xe9e2d2, emissiveMap: swirlTexture, emissiveIntensity: 0.4,
            roughness: 0.25, metalness: 0.0
        })
    );
    dome.rotation.x = Math.PI;              // hemisphere opens up, pole down
    dome.scale.y = domeDrop / domeR;        // ellipsoidal drop, not a full half ball
    dome.position.y = -baseH;
    group.add(dome);

    // The little screw cap at the bottom center of the glass
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.022, 12), whiteTrim);
    cap.position.y = -baseH - domeDrop - 0.008;
    group.add(cap);

    return group;
}

// ============================================
// THE EXTERIOR (seen through the window)
// ============================================
/** Cedar fence texture: a tile of four flat vertical planks, each ~4.5 in
 *  wide, with per-plank tone shifts, soft grain, and a thin gap shadow
 *  between boards. Tiled along the fence's length. */
function createCedarFenceTexture() {
    const canvas = makeCanvas(256, 512);
    const ctx = canvas.getContext('2d');

    const tones = ['#9b6a43', '#a5714a', '#8f6240', '#a3754e'];
    for (let p = 0; p < 4; p++) {
        ctx.fillStyle = tones[p];
        ctx.fillRect(p * 64, 0, 64, 512);

        // Soft vertical grain within the plank
        for (let g = 0; g < 9; g++) {
            ctx.strokeStyle = g % 2 ? 'rgba(122, 80, 48, 0.35)' : 'rgba(180, 132, 90, 0.4)';
            ctx.lineWidth = 1 + Math.random() * 1.5;
            const x = p * 64 + 4 + Math.random() * 56;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.bezierCurveTo(x + Math.random() * 6 - 3, 170, x + Math.random() * 6 - 3, 340, x + Math.random() * 4 - 2, 512);
            ctx.stroke();
        }

        // The gap between boards
        ctx.fillStyle = 'rgba(40, 26, 14, 0.85)';
        ctx.fillRect(p * 64 + 62, 0, 2, 512);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** Green vinyl lap siding for the neighbor's house: horizontal courses
 *  with a shadow under each lap and slight per-course tone drift. */
function createSidingTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    const courses = 8;
    const ch = 256 / courses;
    const tones = ['#5f7f5a', '#63845e', '#5a7955', '#618059'];
    for (let c = 0; c < courses; c++) {
        ctx.fillStyle = tones[c % tones.length];
        ctx.fillRect(0, c * ch, 256, ch);
        // Shadow tucked under the lap above, highlight at the butt edge
        ctx.fillStyle = 'rgba(30, 44, 28, 0.5)';
        ctx.fillRect(0, c * ch, 256, 3);
        ctx.fillStyle = 'rgba(214, 226, 208, 0.15)';
        ctx.fillRect(0, c * ch + ch - 2, 256, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** Black asphalt shingles: dark courses with staggered tab shadows. */
function createShingleTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#24262a';
    ctx.fillRect(0, 0, 256, 256);

    const ch = 32;
    for (let c = 0; c < 8; c++) {
        // The shadow line of each course
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, c * ch, 256, 3);
        // Staggered tab separators
        const offset = (c % 2) * 16;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        for (let x = offset; x < 256; x += 32) {
            ctx.fillRect(x, c * ch + 3, 2, ch - 3);
        }
        // A few lighter worn patches so the field is not dead flat
        ctx.fillStyle = 'rgba(78, 82, 90, 0.12)';
        ctx.fillRect((c * 53) % 220, c * ch + 8, 26, 12);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** The side of the neighbor's one-story house, seen beyond the tree: green
 *  lap siding, two windows facing back toward the office, a black shingle
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
    const sidingPlain = new THREE.MeshStandardMaterial({ color: 0x5f7f5a, roughness: 0.85, metalness: 0.0 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(len, wallH, dep), siding);
    body.position.y = wallH / 2;
    body.castShadow = true;
    house.add(body);

    // Two windows on the face looking toward Steve's office
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

    // Gable roof, ridge running the house's length: two shingled slabs,
    // white rake trim riding the sloped edges at both gable ends
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

    // Ridge cap
    const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(len + overhang * 2, 0.09, 0.2), roofDark);
    ridgeCap.position.set(0, wallH + rise + 0.02, 0);
    house.add(ridgeCap);

    // Gable end triangles, sided green like the walls
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
// perched, holding still.

const FENCE_TOP_Y = 5 * FT;   // mirrors createExterior's fence height
const FENCE_LINE_Z = -5;      // and its distance beyond the window
let fenceBirds = [];

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
    b.perchX = -2 + Math.random() * 6;   // the stretch the window frames
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
        still.group.position.set(1.5, FENCE_TOP_Y, FENCE_LINE_Z);
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
            timer: 3 + i * 8 + Math.random() * 5,   // staggered debuts
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

    // The cedar privacy fence between the window and the tree: 5 ft tall,
    // flat top, flat vertical planks. One textured slab instead of a couple
    // hundred plank meshes, since it is scenery only ever seen through the
    // window; the planks live in the texture. Edges stay plain cedar so the
    // visible flat top reads as solid boards.
    const fenceH = 5 * FT;
    const fenceLen = 24;
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
    fence.position.set(0, fenceH / 2, -5);
    fence.castShadow = true;
    outsideGroup.add(fence);

    // The birds that come and go on the fence top
    createFenceBirds(outsideGroup);

    // The neighbor's house, past the tree: lawn, fence, tree, house, in
    // that order of depth through the window.
    const neighborHouse = createNeighborHouse();
    neighborHouse.position.set(-0.5, 0, -12.5);
    outsideGroup.add(neighborHouse);

    // One tree framed by the window, beyond the fence (the window looks
    // north, so it sits on negative Z at a depth that reads nicely through
    // the glass). There were three: the near-left one and the far-center
    // one crowded the view, so the mid-distance tree carries it alone.
    const treeSpots = [{ x: 1.8, z: -7 }];
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

    officeGroup.add(outsideGroup);
}

// ---- The cat's bowls ----

/** Food and water bowls on the floor between the sit-stand desk and the
 *  closet: two stainless bowls, one with kibble and one with water. */
function createCatBowls() {
    const { room, closet } = LAYOUT;
    const innerW = room.minX + room.wallT / 2;

    const bowls = new THREE.Group();
    bowls.name = 'catBowls';

    const contents = [
        { z: 0.75, color: 0x6b4a2f, rough: 0.9 },    // kibble
        { z: 0.98, color: 0x4a7fa8, rough: 0.15 }    // water
    ];
    contents.forEach((spec) => {
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.05, 16), brushedMetal);
        bowl.position.set(0, 0.025, spec.z);
        bowl.castShadow = true;
        bowls.add(bowl);
        // The contents ride a millimeter above the rim rather than flush
        // with it: flush put the fill's face on the same plane as the
        // bowl's top and the two z-fought.
        const fill = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.07, 0.004, 16),
            new THREE.MeshStandardMaterial({ color: spec.color, roughness: spec.rough, metalness: 0.0 })
        );
        fill.position.set(0, 0.053, spec.z);
        bowls.add(fill);
    });

    // Against the west wall in the clear stretch south of the desk, north
    // of the closet, where the office manager takes her meals (held off
    // the baseboard face by a few centimeters)
    bowls.position.set(innerW + 0.175, 0, 0);
    registerOutdoorProp(bowls, 'catBowls');
    officeGroup.add(bowls);
}

// ============================================
// THE WALL DASHBOARD
// ============================================
// The display on the east wall behind Steve, where the whiteboard used to
// hang. It carries the day's visitor activity, repainted by the shared
// analytics part each time it polls (see updateDashboardScreen).
//
// IT SHOWS A HEADLINE, NOT A TABLE. A visitor reads this from across a
// ten-foot room, on a surface that is a few hundred pixels wide once it is
// drawn at that distance, so the numbers here are the few worth seeing at a
// glance. Clicking it opens the real dashboard, which is DOM and therefore
// scrollable, keyboard reachable and legible to a screen reader.

const DASH_W = 768, DASH_H = 432;     // the screen's canvas, 16:9
const DASH_ROWS = 4;                  // recent visitors listed down the right

let dashboardScreen = null;           // { ctx, texture } once the wall is built
let dashboardSummary = null;          // the latest summary, or null before one lands

/** Paint the dashboard's face. `summary` is what analytics-1.0.0.js hands the
 *  scene, or null before the first poll answers (or when it fails), which is a
 *  state worth drawing rather than leaving the screen blank. */
function drawDashboardFace(ctx, W, H, summary) {
    // The panel, matching the overlay's dark "ops monitor" palette so the
    // enlarged view reads as the same screen rather than a different one.
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#131a28');
    bg.addColorStop(1, '#0b1018');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // The subtitle sits after the wordmark, measured while the wordmark's own
    // font is still set. Measuring it rather than hardcoding a gap keeps the
    // two from colliding if the font falls back to something wider.
    const headX = W * 0.06;
    ctx.fillStyle = '#9fc4ff';
    ctx.font = `600 ${Math.round(H * 0.058)}px "Segoe UI", Verdana, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('SceneXP', headX, H * 0.13);
    const headW = ctx.measureText('SceneXP').width;

    ctx.fillStyle = '#6c7686';
    ctx.font = `${Math.round(H * 0.042)}px "Segoe UI", Verdana, sans-serif`;
    ctx.fillText('VISITOR ACTIVITY', headX + headW + W * 0.03, H * 0.13);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = Math.max(1, H * 0.004);
    ctx.beginPath();
    ctx.moveTo(W * 0.06, H * 0.175);
    ctx.lineTo(W * 0.94, H * 0.175);
    ctx.stroke();

    if (!summary) {
        ctx.fillStyle = '#6c7686';
        ctx.font = `${Math.round(H * 0.05)}px "Segoe UI", Verdana, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('Waiting for today\u2019s numbers', W / 2, H * 0.52);
        return;
    }

    // The two figures the day is actually about, big enough to read from the
    // doorway. Everything else on the screen is supporting detail.
    const stat = (label, value, x) => {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#e8edf4';
        ctx.font = `700 ${Math.round(H * 0.16)}px "Segoe UI", Verdana, sans-serif`;
        ctx.fillText(String(value), x, H * 0.43);
        ctx.fillStyle = '#8a94a6';
        ctx.font = `${Math.round(H * 0.042)}px "Segoe UI", Verdana, sans-serif`;
        ctx.fillText(label, x, H * 0.50);
    };
    stat('VISITS', summary.sessionCount, W * 0.06);
    stat('THINGS DONE', summary.eventCount, W * 0.26);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#8fd9b0';
    ctx.font = `600 ${Math.round(H * 0.046)}px "Segoe UI", Verdana, sans-serif`;
    if (summary.busiestScene) {
        ctx.fillText(`Busiest: ${summary.busiestScene}`, W * 0.06, H * 0.63);
        ctx.fillStyle = '#6c7686';
        ctx.font = `${Math.round(H * 0.04)}px "Segoe UI", Verdana, sans-serif`;
        ctx.fillText(`${summary.busiestSceneEvents} of ${summary.eventCount} across ${summary.sceneCount} scenes`,
            W * 0.06, H * 0.70);
    }

    // The most recent few, which is the part that makes the room feel visited.
    const rows = (summary.recent || []).slice(0, DASH_ROWS);
    rows.forEach((row, i) => {
        const y = H * 0.30 + i * H * 0.115;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#c4ccda';
        ctx.font = `${Math.round(H * 0.04)}px "Segoe UI", Verdana, sans-serif`;
        ctx.fillText(row.label || '', W * 0.52, y);
        ctx.fillStyle = '#6c7686';
        ctx.font = `${Math.round(H * 0.035)}px "Segoe UI", Verdana, sans-serif`;
        ctx.fillText(`${row.action}${row.scene ? ` \u00b7 ${row.scene}` : ''}`, W * 0.52, y + H * 0.048);
        ctx.textAlign = 'right';
        ctx.fillText(row.ago || '', W * 0.94, y);
    });
    if (!rows.length) {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#6c7686';
        ctx.font = `${Math.round(H * 0.04)}px "Segoe UI", Verdana, sans-serif`;
        ctx.fillText('No visits recorded yet today.', W * 0.52, H * 0.32);
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = summary.stale ? '#e8b54a' : '#4a5364';
    ctx.font = `${Math.round(H * 0.034)}px "Segoe UI", Verdana, sans-serif`;
    ctx.fillText(summary.stale
        ? `${summary.date} \u00b7 not updating`
        : `${summary.date} \u00b7 updated ${summary.updatedAgo}`, W * 0.06, H * 0.92);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#4a5364';
    ctx.fillText('click for the full dashboard', W * 0.94, H * 0.92);
}

/** The wall-mounted display: a slim dark bezel around an emissive panel, on a
 *  low-profile mount. Wider than the whiteboard it replaced, because a wall of
 *  numbers wants the room the board never used. Registered as the 'dashboard'
 *  prop, so clicking it opens the overlay. */
function createWallDashboard() {
    const { room } = LAYOUT;
    const innerE = room.maxX - room.wallT / 2;

    const group = new THREE.Group();
    group.name = 'wallDashboard';

    const panelW = 1.5, panelH = 0.845;          // ~16:9, a big wall display
    const bezel = 0.022;

    const shell = new THREE.Mesh(
        new THREE.BoxGeometry(panelW + bezel * 2, panelH + bezel * 2, 0.045),
        new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.45, metalness: 0.2 })
    );
    shell.castShadow = true;
    group.add(shell);

    const canvas = makeCanvas(DASH_W, DASH_H);
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    drawDashboardFace(ctx, DASH_W, DASH_H, null);
    texture.needsUpdate = true;
    dashboardScreen = { ctx, texture };

    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(panelW, panelH),
        new THREE.MeshStandardMaterial({
            map: texture, emissive: 0xffffff, emissiveMap: texture,
            emissiveIntensity: 0.6, roughness: 0.32, metalness: 0.0
        })
    );
    face.position.z = 0.0235;
    group.add(face);

    // The mount: a plate behind the shell, hidden from the room but there when
    // a visitor looks at the screen edge-on.
    const mount = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.03), brushedMetal
    );
    mount.position.z = -0.035;
    group.add(mount);

    // Same spot on the east wall the whiteboard held, a touch higher so the
    // taller panel keeps its lower edge clear of the desk's sight line.
    group.position.set(innerE - 0.03, 1.5, -0.8);
    group.rotation.y = -Math.PI / 2;
    registerOutdoorProp(group, 'dashboard');
    officeGroup.add(group);
}

// ============================================
// THE WHITEBOARD
// ============================================
// It hung on the east wall until 2026-09-18, when the visitor-activity display
// took that spot, and the room lost the one surface that said out loud what
// every scene on this site is for. It is back on the north wall, the bare one
// behind Steve, unchanged apart from where it hangs and one thing noted below.
//
// CLICKING IT OPENS A STORY CARD, not the close-up overlay it used to open.
// That overlay repainted the board into a full-screen view, and the room has a
// full-screen view now: the dashboard. Two would be one too many.

/**
 * WHERE THE BOXES ARE, in the drawing's own canvas space, and the reason it is
 * up here in module scope rather than inside the function that draws it: the
 * view suite asks this object where the diagram's two columns are and then
 * raycasts those exact rectangles through the room. Written out inside
 * drawOfficeWhiteboard, the test would have to repeat the numbers, and a box
 * moved into the band Steve covers would pass a test still measuring the
 * rectangle it used to occupy.
 */
const BOARD_LAYOUT = {
    canvas: { w: 512, h: 384 },
    box: { w: 112, h: 44 },
    cols: { left: 24, right: 512 - 24 - 112 },
    rows: { left: [54, 140, 226], right: [96, 196] }
};

/**
 * The diagram on the whiteboard: the loop every software project runs on,
 * boxed and arrowed in marker. Drawn at 512 x 384, the board's own aspect.
 *
 * LAID OUT IN TWO COLUMNS, AND THAT IS THE WHOLE DESIGN. The board hangs
 * centered in the wall's bare run, and Steve stands in front of the middle of
 * it: measured through the drawn room, the middle 30% of this canvas (x 180 to
 * 330) is behind him from the fixed eye at every aspect, and another 10 either
 * side is partly behind him. So every box lives in an outer third, where the
 * eye has a clear line to it, and only the connectors cross the middle. A line
 * passing behind somebody standing at a whiteboard reads as a line passing
 * behind somebody standing at a whiteboard. A word does not.
 */
function drawOfficeWhiteboard(ctx, W, H) {
    const BLUE = '#2456a8', GREEN = '#2e7d4f', RED = '#c0392b';
    const scale = W / BOARD_LAYOUT.canvas.w;   // the layout is written at 512 x 384
    const s = (n) => n * scale;

    ctx.fillStyle = '#fcfcf9';
    ctx.fillRect(0, 0, W, H);

    // Ghosts of erased sessions past, kept from the board this replaces.
    ctx.fillStyle = 'rgba(150, 152, 148, 0.08)';
    [[0.14, 0.55, 0.3, 0.2], [0.55, 0.18, 0.32, 0.14], [0.4, 0.72, 0.22, 0.12]].forEach(([gx, gy, gw, gh]) => {
        ctx.fillRect(W * gx, H * gy, W * gw, H * gh);
    });

    const { box: { w: BOX_W, h: BOX_H }, cols, rows } = BOARD_LAYOUT;
    const LEFT_X = cols.left, RIGHT_X = cols.right;
    const lead = (x) => x + BOX_W / 2;   // a box's vertical centre line

    /** A marker box with its label. */
    const box = (x, y, label) => {
        ctx.strokeStyle = BLUE;
        ctx.lineWidth = s(3);
        ctx.beginPath();
        ctx.roundRect(s(x), s(y), s(BOX_W), s(BOX_H), s(7));
        ctx.stroke();
        ctx.fillStyle = BLUE;
        ctx.font = `bold ${Math.round(s(23))}px "Segoe UI", "Comic Sans MS", Verdana, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, s(x + BOX_W / 2), s(y + BOX_H / 2 + 1));
    };

    /** A marker stroke through the given points, with a head on the last one. */
    const arrow = (points, color, dashed) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = s(dashed ? 2.5 : 3);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (dashed) ctx.setLineDash([s(9), s(7)]);
        ctx.beginPath();
        points.forEach(([px, py], i) => (i ? ctx.lineTo(s(px), s(py)) : ctx.moveTo(s(px), s(py))));
        ctx.stroke();
        ctx.setLineDash([]);
        // The head, aimed along the last segment
        const [ax, ay] = points[points.length - 2];
        const [bx, by] = points[points.length - 1];
        const a = Math.atan2(by - ay, bx - ax);
        const head = 11;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(s(bx), s(by));
        ctx.lineTo(s(bx - head * Math.cos(a - 0.42)), s(by - head * Math.sin(a - 0.42)));
        ctx.lineTo(s(bx - head * Math.cos(a + 0.42)), s(by - head * Math.sin(a + 0.42)));
        ctx.closePath();
        ctx.fill();
    };

    // The left column: plan, build, test, top to bottom.
    const LY = rows.left;
    box(LEFT_X, LY[0], 'PLAN');
    box(LEFT_X, LY[1], 'BUILD');
    box(LEFT_X, LY[2], 'TEST');
    arrow([[lead(LEFT_X), LY[0] + BOX_H], [lead(LEFT_X), LY[1] - 4]], GREEN);
    arrow([[lead(LEFT_X), LY[1] + BOX_H], [lead(LEFT_X), LY[2] - 4]], GREEN);

    // The right column: ship, then learn.
    const RY = rows.right;
    box(RIGHT_X, RY[0], 'SHIP');
    box(RIGHT_X, RY[1], 'LEARN');
    arrow([[lead(RIGHT_X), RY[0] + BOX_H], [lead(RIGHT_X), RY[1] - 4]], GREEN);

    // Test to ship, the one crossing that carries the flow. Its elbow sits in
    // the middle band, which is the part nobody can see anyway.
    arrow([[LEFT_X + BOX_W, LY[2] + BOX_H / 2], [256, LY[2] + BOX_H / 2],
        [256, RY[0] + BOX_H / 2], [RIGHT_X - 5, RY[0] + BOX_H / 2]], GREEN);

    // And round again: learn back to plan, through the second corridor.
    //
    // IT USED TO RUN ROUND THE OUTSIDE, down to y 334 and up the left at x 14,
    // and that is very probably what Steve was seeing as "a dashed black line
    // going around the edge of the board". It was: at this board's size a
    // texture pixel is about 2.3 mm, so that line sat 33 mm in from the face's
    // edge, which is a handful of screen pixels inside the frame, and it was
    // drawn dashed in a dark red that reads as near black at two pixels wide.
    // A diagram whose own strokes hug the frame will be read as a rendering
    // fault, and it was. Nothing on the board comes near an edge now: the
    // return runs up the corridor at x 296, which is inside the band Steve
    // stands in front of, and arrives at PLAN across the top.
    arrow([[RIGHT_X - 5, RY[1] + BOX_H / 2], [296, RY[1] + BOX_H / 2],
        [296, LY[0] + BOX_H / 2], [LEFT_X + BOX_W + 5, LY[0] + BOX_H / 2]], RED, true);

    // SHIP circled in red, the way "ship it" was circled on the board this
    // replaces. It is still the hard one.
    ctx.strokeStyle = RED;
    ctx.lineWidth = s(3);
    ctx.beginPath();
    ctx.ellipse(s(RIGHT_X + BOX_W / 2), s(RY[0] + BOX_H / 2), s(BOX_W * 0.62), s(BOX_H * 0.78), -0.05, 0, Math.PI * 2);
    ctx.stroke();

    ctx.textBaseline = 'alphabetic';
}

/** The whiteboard: white surface in an aluminum frame, marker tray with
 *  markers and an eraser, on the north wall behind Steve. */
function createWhiteboardWall() {
    const { room, window: win } = LAYOUT;
    const innerN = room.minZ + room.wallT / 2;
    const innerW = room.minX + room.wallT / 2;

    const boardGroup = new THREE.Group();
    boardGroup.name = 'whiteboard';

    const canvas = makeCanvas(BOARD_LAYOUT.canvas.w, BOARD_LAYOUT.canvas.h);
    drawOfficeWhiteboard(canvas.getContext('2d'), BOARD_LAYOUT.canvas.w, BOARD_LAYOUT.canvas.h);
    const boardTexture = new THREE.CanvasTexture(canvas);
    // TAGGED sRGB, which the east-wall original was not. Left linear, the
    // marker colours come out pale (that blue lands nearer #6699d4 than
    // #2456a8) and the list reads as a ghost of itself from across the room.
    // The board is meant to be legible at four metres, so the ink is decoded.
    boardTexture.colorSpace = THREE.SRGBColorSpace;

    const surface = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 0.9),
        new THREE.MeshStandardMaterial({ map: boardTexture, roughness: 0.35, metalness: 0.05 })
    );
    surface.name = 'whiteboardFace';
    surface.position.z = 0.018;
    boardGroup.add(surface);

    // ---- The frame, and the two faults it has had ------------------------
    //
    // The horizontal rails span the full outer width (1.28, flush with the
    // vertical rails' outer faces at ±0.64), and the verticals butt between
    // them, so every corner meets square.
    //
    // 1. THE RAILS STAND ENTIRELY IN FRONT OF THE FACE. The board this was
    //    restored from used rails 35 mm deep set at z 0.005, running -0.0125
    //    to 0.0225, with the face at 0.018: the face plane passed THROUGH
    //    every rail, and along the line where it crossed each rail's inner
    //    wall the two surfaces met at the same depth. That is the jagged seam
    //    that crawls while the view pans, and no amount of separation or near
    //    plane fixes it, because the surfaces really are in the same place.
    //
    // 2. AND THEY BARELY STAND PROUD OF IT, 7 mm rather than the 15 the first
    //    fix left. What is visible at the opening's edge is the rail's INNER
    //    WALL, a face perpendicular to the board, and its width on screen is
    //    the lip's depth times the sine of the angle the eye sits off the
    //    board's normal, which is 3 degrees. At 15 mm that sliver is half a
    //    millimetre, which at this distance is part of a pixel: it lands on
    //    some pixels and misses others, so it reads as a dashed line rather
    //    than an edge, and it crawls when anything moves. Shallower is
    //    narrower, and the material below is the other half of the answer.
    // 3. AND THE RAILS HAVE NO SIDE WALLS AT ALL. They are four flat pieces
    //    now rather than four boxes, so the frame has nothing perpendicular to
    //    the board and there is no inner wall to catch the eye at the opening.
    //    That removes the last surface that could show as a line where white
    //    meets silver, whatever the lighting does. The thickness it gives up
    //    is thickness nobody can see: this eye sits 3 degrees off the board's
    //    normal and cannot move, so a 6 mm lip was already under a tenth of a
    //    pixel of edge. The tray below keeps its solid shape, being a thing
    //    the visitor sees in profile.
    //
    // ALUMINIUM THAT CANNOT GO BLACK, either. The shared brushedMetal is
    // metalness 0.7, and nothing in this room supplies an environment map, so
    // a metal face that catches no direct light has almost nothing to reflect
    // and renders near black. At metalness 0.2 the ambient and hemisphere
    // terms carry it, which is 3.1x the diffuse response of the shared metal.
    const frameMetal = new THREE.MeshStandardMaterial({
        color: 0xc6cbd1, roughness: 0.5, metalness: 0.2
    });
    [[0, 0.46, 1.28, 0.05], [0, -0.46, 1.28, 0.05], [-0.615, 0, 0.05, 0.87], [0.615, 0, 0.05, 0.87]].forEach(([fx, fy, fw, fh]) => {
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), frameMetal);
        strip.name = 'whiteboardFrame';
        strip.position.set(fx, fy, surface.position.z + 0.004);
        boardGroup.add(strip);
    });

    // The tray takes the frame's aluminium too, so the board's hardware is one
    // material and its channel does not go black the way the rails did.
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.07), frameMetal);
    tray.position.set(0, -0.51, 0.035);
    boardGroup.add(tray);
    // Two markers, end to end with a gap. They used to overlap by 2 cm at the
    // same height and depth, which is two cylinders of the same radius sharing
    // an axis: their curved surfaces were coincident along the overlap, in
    // blue and green. Nobody could see it behind Steve, and it was still two
    // surfaces fighting for the same pixels.
    [[0x2456a8, -0.13], [0x2e7d4f, 0.01]].forEach(([color, mx]) => {
        const marker = new THREE.Mesh(
            new THREE.CylinderGeometry(0.011, 0.011, 0.12, 8),
            new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.0 })
        );
        marker.rotation.z = Math.PI / 2;
        marker.position.set(mx, -0.495, 0.045);
        boardGroup.add(marker);
    });
    // A shade slimmer front to back (35 mm, was 50) and forward on the tray,
    // so it rests IN FRONT of the bottom rail rather than halfway into it. At
    // z 0.045 it reached back to 0.02, which clipped 2 mm into the old rail
    // and would clip 5 into this one: the same crawling seam as above, in dark
    // grey against silver. It still sits in the tray, which is a block resting
    // in a channel and not two surfaces fighting over the same pixels.
    const eraser = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.035, 0.035),
        new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.8, metalness: 0.0 })
    );
    eraser.position.set(0.15, -0.49, 0.0525);
    boardGroup.add(eraser);

    // ---- CENTERED IN THE WALL'S BARE RUN --------------------------------
    //
    // Corner to window: the west wall's inner face at x -2.31 to the window's
    // west edge at 0.48, so the board hangs at -0.92. Derived rather than
    // typed, so it stays centered if the window or the room ever moves.
    //
    // STEVE STANDS IN FRONT OF THE MIDDLE OF IT, and that is a fact about this
    // room rather than a problem with the placement: measured through the
    // drawn room, the middle 30% of the board is behind him from the fixed eye
    // at every aspect. What answers it is the DIAGRAM rather than the hanging.
    // drawOfficeWhiteboard puts every box in an outer third and lets only the
    // connectors cross the middle, so nothing anybody needs to read is behind
    // him. tests/steve-view.test.mjs holds the placement and the clear columns.
    // AND HUNG ON THE WINDOW'S CENTRE LINE. The two openings in this wall are
    // the window and the board, so they are levelled with each other: the
    // window's glass runs from the sill at 1.07 to its head at 2.51, and the
    // board takes the middle of that, 1.79. Derived from the same numbers the
    // window is cut from, so the pair cannot drift apart.
    const bareFrom = innerW;
    const bareTo = win.x - win.width / 2;
    boardGroup.position.set((bareFrom + bareTo) / 2, (win.sillY + win.topY) / 2, innerN + 0.013);
    registerOutdoorProp(boardGroup, 'board');
    officeGroup.add(boardGroup);
}

// ============================================
// STEVE
// ============================================
// The host himself, standing at the sit-stand desk working on SceneXP.
// Built on the shared person rig (as a 'pedestrian', the same trick the
// Roqui experience used to get real hairstyles), then retagged as the
// greeter so the shared click/hover path treats him as the host.

let steveGroup = null;
let steveArms = { p: null, n: null };
let stevePaused = false;          // a dialog is open: stop typing, face the visitor
// Arm poses, solved from the shared rig (shoulders at y 1.25 plus the 0.05
// sole lift, hands 0.57 m from the pivot). The two hands have different
// jobs: the left rides the keyboard (keys at y ~1.11), and the right
// reaches a little outward to rest on the Magic Mouse (crown at ~1.13),
// which its shoulder happens to line up with almost exactly. rx is the
// forward swing, rz the lateral splay.
// (rx runs ~0.03 past the original contact solve: the enlarged hands hang
// lower, and this keeps their undersides on the keys and mouse.)
const STEVE_KEYBOARD_POSE = { rx: -1.33, rz: -0.1 };
const STEVE_MOUSE_POSE = { rx: -1.36, rz: -0.3 };

/** Recolor the rig's default black shoes into gray New Balance runners,
 *  with a small white N on each outer side. (Same leg-group walk the
 *  other experiences use: legs are the untagged groups hinged at y 0.75,
 *  and shoe parts sit below y -0.7 inside them.) */
function applyGraySneakers(person) {
    const sneaker = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.7, metalness: 0.05 });
    const nBadge = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6, metalness: 0.0 });
    person.children.forEach((group) => {
        if (!group.isGroup || group.userData.isArm) return;
        if (Math.abs(group.position.y - 0.75) > 0.02) return;
        group.children.forEach((part) => {
            if (part.isMesh && part.position.y < -0.7) {
                part.material = sneaker;
                const side = group.position.x > 0 ? 1 : -1;
                const badge = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.024, 0.02), nBadge);
                badge.position.set(side * 0.048, part.position.y + 0.005, part.position.z + 0.01);
                group.add(badge);
            }
        });
    });
}

/** Build Steve: black t-shirt, blue jeans, gray New Balance sneakers,
 *  dark brown hair, and a black beard graying around the chin. Caucasian
 *  with tan skin, average-to-slender build. */
function buildSteve() {
    const steve = createPerson({
        role: 'pedestrian',
        x: 0,
        z: 0,
        rotationY: 0,
        shirtColor: 0x1d1e21,     // the black t-shirt
        pantsColor: 0x35567e,     // blue jeans
        skinTone: 0xd7a678,       // caucasian, tan
        hairColor: 0x2e2013,      // dark brown
        hairStyle: 'short',
        handScale: 1.4,           // the rig's default hands read small at the ends of working arms
        dressShirt: false
    });
    steve.userData.isShopkeeper = true;   // the greeter click/hover path
    steve.userData.isPedestrian = false;

    // (Clean shaven: a beard was tried at two prominences and neither read
    // right at this poly count, so Steve keeps the rig's bare face.)

    applyGraySneakers(steve);

    // Average-to-slender: a touch narrower than the rig's default
    steve.scale.set(0.97, 1, 0.97);

    // Cache the arm groups and set the typing reach toward the keyboard
    steve.children.forEach((group) => {
        if (group.isGroup && group.userData.isArm) {
            if (group.position.x > 0) steveArms.p = group;
            else steveArms.n = group;
        }
    });
    if (steveArms.p) {
        steveArms.p.rotation.x = STEVE_KEYBOARD_POSE.rx;
        steveArms.p.rotation.z = STEVE_KEYBOARD_POSE.rz;
    }
    if (steveArms.n) {
        steveArms.n.rotation.x = STEVE_MOUSE_POSE.rx;
        steveArms.n.rotation.z = STEVE_MOUSE_POSE.rz;
    }

    return steve;
}

/** Stand Steve at the desk, facing it (west), squared up to the keyboard,
 *  with a polite-distance collision box like every host. */
function placeSteve(deskX, deskZ) {
    const steve = buildSteve();
    const sx = deskX + 0.79;      // just behind the desk's front edge
    const sz = deskZ - 0.08;      // squared to the keyboard
    // The shared rig's shoe soles sit 5 cm below the person origin, so
    // everyone placed at y 0 stands ankle-deep in the floor. Lift him.
    steve.position.set(sx, 0.05, sz);
    steve.rotation.y = -Math.PI / 2;
    steveGroup = steve;
    officeGroup.add(steve);

    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(sx - 0.18, 0, sz - 0.18),
            new THREE.Vector3(sx + 0.18, 1.8, sz + 0.18)
        ),
        type: 'host'
    });
}

/** Wrap an angle to (-PI, PI] so Steve turns the short way around. */
function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

// ============================================
// PER-FRAME UPDATE
// ============================================
let sleepingCat = null;   // { mesh, baseY }: the cat's body, for breathing
let _catBreath = 0;
let _typeTime = 0;

/**
 * Advance the office each frame: the cat breathes in her sleep, and Steve
 * types at the keyboard. While a dialog is open he pauses and turns to
 * face the visitor, turning back to work when it closes. All motion holds
 * still under prefers-reduced-motion. Driven from the render loop in
 * main.js, which passes the player position and frame delta.
 */
export function updateStudio(playerPosition, deltaTime) {
    if (_reducedMotion.matches) return;

    if (sleepingCat) {
        _catBreath += deltaTime;
        sleepingCat.mesh.scale.y = sleepingCat.baseY * (1 + 0.035 * Math.sin(_catBreath * 1.7));
    }

    // Birds visit the fence outside the window
    updateFenceBirds(deltaTime);

    // The old machine in the closet is doing something. One material's
    // brightness on a slow, uneven beat, with no texture work behind it: a
    // steady light reads as a sticker, and a blinking one is why anybody
    // looks twice at a 2 cm seam. (Reduced motion leaves it lit and steady,
    // by the early return above.)
    if (closetActivityLed) {
        _closetBlink += deltaTime;
        const on = (_closetBlink % 1.7) < 0.22 || (_closetBlink % 1.7) > 1.55;
        closetActivityLed.material.emissiveIntensity = on ? 1.4 : 0.12;
    }

    // The editor's cursor blinks on the big monitor. (Under reduced motion
    // the early return above leaves it lit and steady.)
    if (monitorScreen) {
        _cursorTime += deltaTime;
        if (_cursorTime > 0.53) {
            _cursorTime = 0;
            _cursorOn = !_cursorOn;
            drawCodeEditor(monitorScreen.ctx, monitorScreen.canvas.width, monitorScreen.canvas.height, _cursorOn);
            monitorScreen.texture.needsUpdate = true;
        }
    }

    if (steveGroup) {
        const ease = 1 - Math.exp(-6 * deltaTime);

        // Face the desk while working, the visitor while chatting
        const targetYaw = (stevePaused && playerPosition)
            ? Math.atan2(playerPosition.x - steveGroup.position.x, playerPosition.z - steveGroup.position.z)
            : -Math.PI / 2;
        steveGroup.rotation.y += wrapAngle(targetYaw - steveGroup.rotation.y) * ease;

        // Left hand typing on the keys, right hand nudging the mouse; both
        // ease down to his sides during a chat
        _typeTime += deltaTime;
        const armTargets = stevePaused
            ? [[steveArms.p, -0.3, 0.15], [steveArms.n, -0.3, -0.15]]
            : [
                [steveArms.p, STEVE_KEYBOARD_POSE.rx + 0.025 * Math.sin(_typeTime * 8.5), STEVE_KEYBOARD_POSE.rz],
                [steveArms.n, STEVE_MOUSE_POSE.rx, STEVE_MOUSE_POSE.rz + 0.02 * Math.sin(_typeTime * 2.3)]
            ];
        armTargets.forEach(([arm, rx, rz]) => {
            if (!arm) return;
            arm.rotation.x += (rx - arm.rotation.x) * ease;
            arm.rotation.z += (rz - arm.rotation.z) * ease;
        });
    }
}

/** The visitor's Ambient Brightness slider (main.js), straight through to
 *  the shared rig's one dimmer dial. */
export function setStudioBrightness(value) {
    setInteriorLightScale(Math.max(0, value));
}

// ============================================
// STUDIO API SEAMS (kept for main.js's stable import block)
// ============================================
// The conductor still imports the copied theme's interaction API. Each stub
// below is honest about the empty room: no NPCs, no music, no board. They
// get real implementations as the office fills in — the desk pass claims the
// prop hooks, and the character pass points the host functions at Steve.

/** No class here: the only person will be Steve (the character pass). */
export function getDancerMeshes() {
    return [];
}

/** The host mesh for the greeter click/hover path: Steve at his desk.
 *  (The legacy name stays so main.js's import block is untouched; the
 *  copy pass will rename the seams along with the rest of the text.) */
export function getRoquiMesh() {
    return steveGroup;
}

export function pauseDancerForDialog() { /* no dancers to pause */ }
export function resumeDancerFromDialog() { /* no dancers to resume */ }

/** Steve stops typing and turns to the visitor while his dialog is open. */
export function pauseRoquiForDialog() {
    stevePaused = true;
}

export function resumeRoquiFromDialog() {
    stevePaused = false;
}

/** No sound rig in the office (yet); the click path never fires without
 *  speaker props, and the stub keeps the seam shaped right. */
export function toggleStudioMusic() {
    return false;
}

export function isMusicPlaying() {
    return false;
}

/** Repaint the wall display with a fresh summary from the analytics part.
 *  Safe before the wall exists and safe with null, which is the state between
 *  the page opening and the first poll answering. Returns whether it painted,
 *  so a caller (and a test) can tell the difference between "drawn" and
 *  "there is no screen in this scene". */
export function updateDashboardScreen(summary) {
    dashboardSummary = summary || null;
    if (!dashboardScreen) return false;
    drawDashboardFace(dashboardScreen.ctx, DASH_W, DASH_H, dashboardSummary);
    dashboardScreen.texture.needsUpdate = true;
    return true;
}

/** The summary currently on the wall, for the tests and for anything that needs
 *  to know whether the screen has real numbers on it yet. */
export function getDashboardSummary() {
    return dashboardSummary;
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
 * Get the office root group
 */
export function getStoreGroup() {
    return officeGroup;
}

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = { FT, PLAN_SCALE, PFT, VERT_SCALE, VFT, LAYOUT, PALETTE, BOARD_LAYOUT };
