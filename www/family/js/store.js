// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * store.js - Pirate Mini Golf Environment Construction (Phase 8)
 *
 * Builds a warm summer evening at a pirate themed miniature golf course on
 * Coastal Highway in Ocean City, Maryland: a winding putt putt course, a
 * boardable pirate ship floating in a sunken lagoon with holes on its deck,
 * and the famous plank hole where the ball has to roll a wooden plank over
 * the water. Mom, Dad, and ten year old Steve are playing a round together,
 * and visitors are welcome to wander, watch, and say hi.
 *
 * There is no greeter in this experience (the family is mid-round), so
 * nothing here calls registerHost or builds a floating sign.
 *
 * The module keeps the store.js name and its main exports (initStore,
 * STORE_CONFIG, getStoreCollisionBoxes, ...) so the conductor in main.js
 * keeps its stable import block, same as the tire and trail experiences.
 */

import { getScene } from '../../shared/js/scene-1.0.0.min.js';
import {
    initWorld, getColliders, registerOutdoorProp, getOutdoorPropMeshes, isMobileDevice
} from '../../shared/js/world-1.0.0.min.js';
import { FAMILY_CONFIG } from './config.min.js';
import { createPerson } from '../../shared/js/people-1.0.0.min.js';
import { createBackgroundScenery } from '../../shared/js/scenery-1.0.0.min.js';
import { createSidewalkPedestrians } from '../../shared/js/pedestrians-1.0.0.min.js';

// Re-exports: main.js keeps importing these from store.min.js (stable import
// block); the implementations live in the shared parts library. The greeter
// and gallery-visitor re-exports from the trail theme are gone (no greeter
// here, and the family trio below is experience code); the sidewalk
// pedestrians come back in from the tire theme for the passersby out on the
// Coastal Highway sidewalk.
export { updateBackgroundAnimations } from '../../shared/js/scenery-1.0.0.min.js';
export { findClearSpawn } from '../../shared/js/npcs-1.0.0.min.js';
export {
    updateSidewalkPedestrians, getPedestrianMeshes,
    pausePedestrianForDialog, resumePedestrianFromDialog
} from '../../shared/js/pedestrians-1.0.0.min.js';

// The "building" here is only the fenced course rectangle (see config.js).
// Re-exported under the legacy name so main.js keeps importing STORE_CONFIG
// from this module unchanged.
export const STORE_CONFIG = FAMILY_CONFIG.building;

// Outdoor props register with the shared world context; main.js still imports
// the getter from this module.
export { getOutdoorPropMeshes };

// World mesh groups
let courseGroup = null;
let collisionBoxes = [];

// Visitors who ask for reduced motion get still water, a still flag, and a
// family standing easy at their hole instead of playing the loop, matching
// the reduced-motion handling of the sky in scene.js.
const _reducedMotion = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

// ============================================
// LAYOUT
// ============================================
// The course runs along the X axis with Coastal Highway along the south edge
// (negative Z). The entrance, booth, and scorecard board sit by the spawn in
// the southwest corner; the land holes wind east and north; the lagoon and
// the pirate ship fill the northeast. Every walkable surface sits at y 0
// (the engine walks a flat world), so the lagoon water is sunken below grade
// and boarding the ship means crossing the gangplank over it.
const LAYOUT = {
    lagoon: { minX: 6, maxX: 34, minZ: 18, maxZ: 30, waterY: -0.55, floorY: -0.8 },
    ship: { minX: 12, maxX: 28, minZ: 20, maxZ: 28, wallTop: 1.05, wallBottom: -0.78 },
    gangplank: { x: 14, minZ: 15.9, maxZ: 20.3, width: 1.4 },
    plank: { x: 22, minZ: 27.9, maxZ: 30.5, width: 0.9 },
    island: { x: 22, z: 31.5, r: 1.9 },
    mast: { x: 17.5, z: 25 },
    stern: { minX: 26.3, maxX: 28, minZ: 20.2, maxZ: 27.8, height: 1.7 },
    sidewalk: { minZ: -9.3, maxZ: -6.7 },
    highway: { minZ: -15.5, maxZ: -9.3 },
    fenceZ: -6.4,
    arch: { x: -21, z: -5.8 },
    booth: { x: -24.5, z: -3.2 },
    board: { x: -17, z: -4.2 },
    bgHole: { teeX: 26, cupX: 30, z: 8 }
};

// ============================================
// TEXTURES (procedural, canvas-based)
// ============================================
let grassTexture = null;
let feltTexture = null;
let pavementTexture = null;
let sandTexture = null;
let waterTexture = null;
let foamTexture = null;
let shipWoodTexture = null;
let sailTexture = null;
let asphaltTexture = null;

function makeCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
}

/** Lawn grass: layered greens with light blade speckle (trail recipe). */
function createGrassTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#4a7c3a';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 60; i++) {
        const shade = ['#41702f', '#528a41', '#3d6b32', '#5c9448'][i % 4];
        ctx.fillStyle = shade;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(Math.random() * 256, Math.random() * 256, 12 + Math.random() * 30, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (let i = 0; i < 900; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#5e9a4a' : '#3a6530';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 2.5);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(20, 12);
    return texture;
}

/** Putting-green felt: flat bright green with a fine mowed nap. */
function createFeltTexture() {
    const canvas = makeCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#2f9e58';
    ctx.fillRect(0, 0, 128, 128);

    // Mowing stripes, the freshly-vacuumed-carpet look every course has
    ctx.globalAlpha = 0.1;
    for (let y = 0; y < 128; y += 16) {
        ctx.fillStyle = (y / 16) % 2 ? '#27874b' : '#38b365';
        ctx.fillRect(0, y, 128, 16);
    }
    ctx.globalAlpha = 1;

    // Felt nap speckle
    for (let i = 0; i < 500; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#37aa61' : '#2a8f50';
        ctx.fillRect(Math.random() * 128, Math.random() * 128, 1, 1.5);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    return texture;
}

/** Sun-bleached concrete walking path. */
function createPavementTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#cfc8b8';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 1600; i++) {
        const tone = ['#c2bba9', '#d9d3c4', '#b8b09d', '#e2dccf'][i % 4];
        ctx.fillStyle = tone;
        const s = 1 + Math.random() * 2;
        ctx.fillRect(Math.random() * 256, Math.random() * 256, s, s);
    }

    // Expansion joints
    ctx.strokeStyle = 'rgba(140, 132, 116, 0.5)';
    ctx.lineWidth = 3;
    [64, 128, 192].forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 256);
        ctx.stroke();
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 1);
    return texture;
}

/** Beach sand for the lagoon floor and the far shoulder. */
function createSandTexture() {
    const canvas = makeCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ddc9a3';
    ctx.fillRect(0, 0, 128, 128);

    for (let i = 0; i < 700; i++) {
        ctx.fillStyle = ['#d3bd94', '#e6d4b1', '#c9b289'][i % 3];
        ctx.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 4);
    return texture;
}

/** Tropical lagoon water: bright teal with lighter ripple streaks. */
function createWaterTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#2b8fa3';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 26; i++) {
        ctx.strokeStyle = ['rgba(150,215,225,0.32)', 'rgba(40,120,135,0.35)', 'rgba(205,240,245,0.18)'][i % 3];
        ctx.lineWidth = 2 + Math.random() * 5;
        const y = Math.random() * 256;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(80, y + (Math.random() - 0.5) * 26, 176, y + (Math.random() - 0.5) * 26, 256, y);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 4);
    return texture;
}

/** White water for foam edges and the splash burst. */
function createFoamTexture() {
    const canvas = makeCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(235, 244, 246, 0.9)';
    ctx.fillRect(0, 0, 128, 128);

    for (let i = 0; i < 90; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.85)' : 'rgba(200,230,235,0.6)';
        ctx.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 3, 10 + Math.random() * 22);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 1);
    return texture;
}

/** Weathered ship decking: brown boards with seams and nail heads. */
function createShipWoodTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#7a5a3a';
    ctx.fillRect(0, 0, 256, 256);

    const boardW = 32;
    for (let x = 0; x < 256; x += boardW) {
        // Each board a slightly different stain
        ctx.fillStyle = ['#775636', '#82613f', '#6f5232', '#7d5c3b'][(x / boardW) % 4];
        ctx.fillRect(x, 0, boardW, 256);
        // Grain
        ctx.strokeStyle = 'rgba(60, 42, 24, 0.35)';
        ctx.lineWidth = 1;
        for (let g = 0; g < 4; g++) {
            const gx = x + 4 + Math.random() * (boardW - 8);
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.bezierCurveTo(gx + 3, 80, gx - 3, 176, gx, 256);
            ctx.stroke();
        }
        // Board seam
        ctx.strokeStyle = 'rgba(40, 28, 16, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 256);
        ctx.stroke();
        // Nail heads at staggered butt joints
        ctx.fillStyle = 'rgba(35, 25, 15, 0.8)';
        const joint = ((x / boardW) % 2) ? 84 : 172;
        ctx.fillRect(x + 8, joint, 3, 3);
        ctx.fillRect(x + boardW - 11, joint, 3, 3);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 2);
    return texture;
}

/** Canvas sailcloth: warm off-white with a woven weave and seam lines. */
function createSailTexture() {
    const canvas = makeCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ece4d2';
    ctx.fillRect(0, 0, 128, 128);

    for (let i = 0; i < 400; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#e2d9c4' : '#f2ecdd';
        ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 1);
    }

    // Horizontal seams
    ctx.strokeStyle = 'rgba(150, 138, 112, 0.5)';
    ctx.lineWidth = 2;
    [32, 64, 96].forEach((y) => {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(128, y);
        ctx.stroke();
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** Coastal Highway asphalt with a dashed yellow centerline. */
function createAsphaltTexture() {
    const canvas = makeCanvas(256, 128);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#3c3c40';
    ctx.fillRect(0, 0, 256, 128);

    for (let i = 0; i < 900; i++) {
        ctx.fillStyle = ['#444448', '#343438', '#4a4a4e'][i % 3];
        ctx.fillRect(Math.random() * 256, Math.random() * 128, 1.5, 1.5);
    }

    // Dashed centerline runs along the canvas X axis (the highway's long axis)
    ctx.fillStyle = '#d8b23c';
    for (let x = 8; x < 256; x += 48) {
        ctx.fillRect(x, 61, 24, 6);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(6, 1);
    return texture;
}

function createTextures() {
    grassTexture = createGrassTexture();
    feltTexture = createFeltTexture();
    pavementTexture = createPavementTexture();
    sandTexture = createSandTexture();
    waterTexture = createWaterTexture();
    foamTexture = createFoamTexture();
    shipWoodTexture = createShipWoodTexture();
    sailTexture = createSailTexture();
    asphaltTexture = createAsphaltTexture();
}

// ============================================
// SHARED MATERIALS
// ============================================
const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9, metalness: 0.0 });
const palmTrunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9, metalness: 0.0 });
const palmFrondMaterial = new THREE.MeshStandardMaterial({ color: 0x2f7a33, roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide });
const darkGreenFoliage = new THREE.MeshStandardMaterial({ color: 0x1a472a, roughness: 0.8, metalness: 0.0 });
const mediumGreenFoliage = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8, metalness: 0.0 });
const lightGreenFoliage = new THREE.MeshStandardMaterial({ color: 0x4a7c23, roughness: 0.8, metalness: 0.0 });
const bushMaterial = new THREE.MeshStandardMaterial({ color: 0x355e3b, roughness: 0.85, metalness: 0.0 });
const hedgeMaterial = new THREE.MeshStandardMaterial({ color: 0x2c5233, roughness: 0.9, metalness: 0.0 });
const darkWood = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.85, metalness: 0.05 });
const ropeMaterial = new THREE.MeshStandardMaterial({ color: 0xb59a6a, roughness: 0.95, metalness: 0.0 });
const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x7d7a72, roughness: 0.95, metalness: 0.0 });
const brickBorderMaterial = new THREE.MeshStandardMaterial({ color: 0x9b4a3c, roughness: 0.85, metalness: 0.0 });
const blackIron = new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.5, metalness: 0.6 });

/**
 * Initialize the mini golf world
 */
export function initStore() {
    const scene = getScene();
    if (!scene) {
        return;
    }

    // The shared world context owns the root group, the collider registry, and
    // the outdoor-prop registry. Local aliases keep every builder below (and
    // the direct collisionBoxes.push sites) working unchanged.
    courseGroup = initWorld(FAMILY_CONFIG);
    collisionBoxes = getColliders();

    createTextures();

    createTerrain();          // lawn, paths, sidewalk, Coastal Highway backdrop
    createEntrance();         // arch, ticket booth, conch, fence, scorecard board
    createCourseHoles();      // the land holes and the far background hole
    createLagoon();           // the sunken water, basin, island, rocks, foam
    createPirateShip();       // hull, deck holes, mast, gangplank, the plank
    createProps();            // palms, cannons, chest, skull rock, torches
    createFamilyGolfers();    // Mom, Dad, and young Steve, mid round
    createBackgroundGolfers();// a pair of players on the far hole (desktop)
    createSidewalkPedestrians(); // passersby out on the sidewalk (shared part)

    // Add background scenery (drifting clouds, per the config toggles)
    createBackgroundScenery();

    // (The root group was added to the scene by initWorld.)

    removeSceneTestObjects();

    return collisionBoxes;
}

// ============================================
// TERRAIN
// ============================================
// Layered planes, each on its own Y step (0, 0.012, 0.016, 0.02, ...), per
// the hard-won z-fighting rule: nothing decorative sits flush on what it
// decorates. The lawn is split into four planes around the lagoon rectangle
// so the sunken basin shows through the hole.
function createTerrain() {
    const terrainGroup = new THREE.Group();
    terrainGroup.name = 'terrain';

    const { lagoon, sidewalk, highway } = LAYOUT;

    const grassMaterial = new THREE.MeshStandardMaterial({
        map: grassTexture, roughness: 0.95, metalness: 0.0
    });

    // Lawn quadrants around the lagoon cutout (x 6..34, z 18..30)
    const lawnPieces = [
        { w: 90, d: lagoon.minZ - (-6.8), x: 0, z: (lagoon.minZ + (-6.8)) / 2 },           // south
        { w: 90, d: 38 - lagoon.maxZ, x: 0, z: (lagoon.maxZ + 38) / 2 },                    // north
        { w: lagoon.minX - (-45), d: lagoon.maxZ - lagoon.minZ, x: (lagoon.minX + (-45)) / 2, z: (lagoon.minZ + lagoon.maxZ) / 2 }, // west
        { w: 45 - lagoon.maxX, d: lagoon.maxZ - lagoon.minZ, x: (lagoon.maxX + 45) / 2, z: (lagoon.minZ + lagoon.maxZ) / 2 }        // east
    ];
    lawnPieces.forEach((p) => {
        const lawn = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), grassMaterial);
        lawn.rotation.x = -Math.PI / 2;
        lawn.position.set(p.x, 0, p.z);
        lawn.receiveShadow = true;
        terrainGroup.add(lawn);
    });

    // Sidewalk along the fence line, then Coastal Highway, then a sandy far
    // shoulder fading toward the beach blocks east of the highway.
    const walkway = new THREE.Mesh(
        new THREE.PlaneGeometry(90, sidewalk.maxZ - sidewalk.minZ),
        new THREE.MeshStandardMaterial({ map: pavementTexture.clone(), roughness: 0.95 })
    );
    walkway.material.map.needsUpdate = true;
    walkway.material.map.repeat.set(18, 1);
    walkway.rotation.x = -Math.PI / 2;
    walkway.position.set(0, 0.004, (sidewalk.minZ + sidewalk.maxZ) / 2);
    walkway.receiveShadow = true;
    terrainGroup.add(walkway);

    const road = new THREE.Mesh(
        new THREE.PlaneGeometry(90, highway.maxZ - highway.minZ),
        new THREE.MeshStandardMaterial({ map: asphaltTexture, roughness: 0.98 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.002, (highway.minZ + highway.maxZ) / 2);
    road.receiveShadow = true;
    terrainGroup.add(road);

    const shoulder = new THREE.Mesh(
        new THREE.PlaneGeometry(90, 5),
        new THREE.MeshStandardMaterial({ map: sandTexture, roughness: 1.0 })
    );
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.set(0, 0, highway.minZ - 2.5);
    terrainGroup.add(shoulder);

    // The winding concrete path: entrance east along the front of the course,
    // then a spur north past the fourth hole to the gangplank. Disjoint
    // rectangles at one step above the lawn.
    const pathMaterial = new THREE.MeshStandardMaterial({ map: pavementTexture, roughness: 0.95 });
    const pathPieces = [
        { w: 36, d: 2.0, x: -5, z: -1.6 },       // main front walk, arch to the third hole
        { w: 2.0, d: 6.4, x: 12.4, z: 1.8 },     // turn north
        { w: 2.0, d: 12.4, x: 13.4, z: 10.6 },   // north spur toward the lagoon
        { w: 3.2, d: 2.0, x: -19.6, z: -3.4 },   // spawn pad inside the arch
        { w: 2.0, d: 3.5, x: -16, z: -1.35 },    // spur to the first tee (north end stops shy of hole 1's border, z 0.57)
        { w: 8.0, d: 1.8, x: -10, z: 6.9 },      // link across to the second hole
        { w: 8.8, d: 1.8, x: 1.6, z: 9.6 },      // link past the fourth hole (west end stops shy of hole 2's border, x -3.07)
        { w: 1.8, d: 4.4, x: 26.5, z: 3.6 }      // spur to the far background hole
    ];
    pathPieces.forEach((p) => {
        const seg = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), pathMaterial);
        seg.rotation.x = -Math.PI / 2;
        seg.position.set(p.x, 0.014, p.z);
        seg.receiveShadow = true;
        terrainGroup.add(seg);
    });

    // Back berm: a low run of boulders against the rear fence line
    for (let x = -30; x <= 32; x += 4.5) {
        const rock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(1.1 + Math.random() * 0.7, 0),
            rockMaterial
        );
        rock.position.set(x + (Math.random() - 0.5) * 1.5, 0.35, 34.8 + (Math.random() - 0.5) * 0.8);
        rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        rock.scale.y = 0.65;
        rock.castShadow = true;
        terrainGroup.add(rock);
    }
    collisionBoxes.push({
        box: new THREE.Box3(new THREE.Vector3(-32, 0, 33.8), new THREE.Vector3(33, 2, 36)),
        type: 'berm'
    });

    courseGroup.add(terrainGroup);
}

// ============================================
// THE ENTRANCE
// ============================================
// Rope-and-post fence along the sidewalk with a gap at the arch, the ticket
// booth with the conch shell on its counter, and the scorecard board.

/** Cylinder stretched between two points (ropes, rigging, frame tubes). */
function tubeBetween(p1, p2, radius, material) {
    const direction = new THREE.Vector3().subVectors(p2, p1);
    const length = direction.length();
    const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, length, 6),
        material
    );
    tube.position.copy(p1).addScaledVector(direction, 0.5);
    tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return tube;
}

/** A run of nautical rope fence: dark posts with a rope swagging between. */
function createRopeFence(xStart, xEnd, z) {
    const fenceGroup = new THREE.Group();
    fenceGroup.name = 'ropeFence';

    const postSpacing = 2.6;
    const postCount = Math.max(2, Math.round((xEnd - xStart) / postSpacing) + 1);
    const actualSpacing = (xEnd - xStart) / (postCount - 1);

    const postGeometry = new THREE.CylinderGeometry(0.07, 0.09, 0.95, 8);

    for (let i = 0; i < postCount; i++) {
        const x = xStart + i * actualSpacing;
        const post = new THREE.Mesh(postGeometry, darkWood);
        post.position.set(x, 0.47, z);
        post.castShadow = true;
        fenceGroup.add(post);

        // Rope swags to the next post: two straight segments meeting at a sag
        if (i < postCount - 1) {
            const nx = x + actualSpacing;
            const mid = new THREE.Vector3((x + nx) / 2, 0.62, z);
            fenceGroup.add(tubeBetween(new THREE.Vector3(x, 0.82, z), mid, 0.028, ropeMaterial));
            fenceGroup.add(tubeBetween(mid, new THREE.Vector3(nx, 0.82, z), 0.028, ropeMaterial));
        }
    }

    registerOutdoorProp(fenceGroup, 'fence');

    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(xStart - 0.1, 0, z - 0.2),
            new THREE.Vector3(xEnd + 0.1, 1.1, z + 0.2)
        ),
        type: 'fence'
    });

    courseGroup.add(fenceGroup);
}

/** The entrance arch: two heavy posts and a painted sign board overhead. */
function createEntranceArch() {
    const archGroup = new THREE.Group();
    archGroup.name = 'entranceArch';

    const { arch } = LAYOUT;
    const half = 2.4;

    [-half, half].forEach((offset) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, 0.3), darkWood);
        post.position.set(offset, 1.6, 0);
        post.castShadow = true;
        archGroup.add(post);
        // A little round shield on each post
        const shield = new THREE.Mesh(
            new THREE.CircleGeometry(0.16, 12),
            new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7 })
        );
        shield.position.set(offset, 2.1, 0.17);
        archGroup.add(shield);
    });

    // Sign board: the course name painted on weathered wood
    const canvas = makeCanvas(512, 128);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2c2118';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#c9a75a';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 500, 116);
    ctx.fillStyle = '#e8d9b0';
    // 40px clears the gold border with margin (52px ran the full 500px width)
    ctx.font = 'bold 40px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SHIPWRECK COVE', 256, 44);
    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillStyle = '#c9a75a';
    ctx.fillText('PUTT PUTT', 256, 95);
    const signTexture = new THREE.CanvasTexture(canvas);
    const signFace = new THREE.MeshStandardMaterial({ map: signTexture, roughness: 0.8 });

    const sign = new THREE.Mesh(
        new THREE.BoxGeometry(5.4, 1.1, 0.12),
        [darkWood, darkWood, darkWood, darkWood, signFace, signFace]
    );
    sign.position.set(0, 3.1, 0);
    sign.castShadow = true;
    archGroup.add(sign);

    archGroup.position.set(arch.x, 0, arch.z);
    registerOutdoorProp(archGroup, 'arch');

    [-half, half].forEach((offset) => {
        collisionBoxes.push({
            box: new THREE.Box3(
                new THREE.Vector3(arch.x + offset - 0.25, 0, arch.z - 0.25),
                new THREE.Vector3(arch.x + offset + 0.25, 3.2, arch.z + 0.25)
            ),
            type: 'decor'
        });
    });

    courseGroup.add(archGroup);
}

// The conch shell material, kept so the audio toggle can light it up while
// the ocean plays (see setConchGlow in the audio block).
let conchMaterial = null;

/** The ticket booth: a little hut with a counter window, striped awning, and
 *  the conch shell sitting on the counter. */
function createTicketBooth() {
    const boothGroup = new THREE.Group();
    boothGroup.name = 'ticketBooth';

    const { booth } = LAYOUT;
    const W = 2.2, D = 2.0, H = 2.5;
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x3d6b8f, roughness: 0.85 });

    // Walls: solid back and sides, front (east) wall split around the window
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.1, H, D), wallMaterial);
    back.position.set(-W / 2, H / 2, 0);
    boothGroup.add(back);
    [-D / 2, D / 2].forEach((z) => {
        const side = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.1), wallMaterial);
        side.position.set(0, H / 2, z);
        boothGroup.add(side);
    });
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, D), wallMaterial);
    sill.position.set(W / 2, 0.5, 0);
    boothGroup.add(sill);
    const header = new THREE.Mesh(new THREE.BoxGeometry(0.1, H - 1.9, D), wallMaterial);
    header.position.set(W / 2, 1.9 + (H - 1.9) / 2, 0);
    boothGroup.add(header);

    // Counter plank at the window
    const counter = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, D - 0.2), darkWood);
    counter.position.set(W / 2 + 0.1, 1.03, 0);
    counter.castShadow = true;
    boothGroup.add(counter);

    // The dark interior behind the window (so it doesn't read hollow)
    const interior = new THREE.Mesh(
        new THREE.PlaneGeometry(D - 0.2, 0.9),
        new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 1.0 })
    );
    interior.rotation.y = Math.PI / 2;
    interior.position.set(0.1, 1.45, 0);
    boothGroup.add(interior);

    // TICKETS sign over the window
    const tCanvas = makeCanvas(256, 64);
    const tCtx = tCanvas.getContext('2d');
    tCtx.fillStyle = '#e8d9b0';
    tCtx.fillRect(0, 0, 256, 64);
    tCtx.fillStyle = '#2c2118';
    tCtx.font = 'bold 40px Georgia, serif';
    tCtx.textAlign = 'center';
    tCtx.textBaseline = 'middle';
    tCtx.fillText('TICKETS', 128, 34);
    const ticketSign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1, 0.28),
        new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(tCanvas), roughness: 0.8 })
    );
    ticketSign.rotation.y = Math.PI / 2;
    ticketSign.position.set(W / 2 + 0.06, 2.12, 0);
    boothGroup.add(ticketSign);

    // Striped awning tilting out over the counter
    const aCanvas = makeCanvas(128, 64);
    const aCtx = aCanvas.getContext('2d');
    for (let i = 0; i < 8; i++) {
        aCtx.fillStyle = i % 2 ? '#e8e2d2' : '#b8433a';
        aCtx.fillRect(i * 16, 0, 16, 64);
    }
    const awningTexture = new THREE.CanvasTexture(aCanvas);
    const awning = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.04, D + 0.3),
        new THREE.MeshStandardMaterial({ map: awningTexture, roughness: 0.85 })
    );
    awning.position.set(W / 2 + 0.35, 2.45, 0);
    awning.rotation.z = 0.35;
    awning.castShadow = true;
    boothGroup.add(awning);

    // Flat roof cap
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.08, D + 0.3), darkWood);
    roof.position.set(0, H + 0.04, 0);
    roof.castShadow = true;
    boothGroup.add(roof);

    boothGroup.position.set(booth.x, 0, booth.z);
    registerOutdoorProp(boothGroup, 'booth');

    const boothBox = new THREE.Box3().setFromObject(boothGroup);
    collisionBoxes.push({ box: boothBox, type: 'decor' });

    courseGroup.add(boothGroup);

    // --- The conch shell, its own clickable prop on the counter ---
    // Hold it to your ear: it toggles the ocean ambience (see the audio block).
    const conchGroup = new THREE.Group();
    conchGroup.name = 'conchShell';

    conchMaterial = new THREE.MeshStandardMaterial({
        color: 0xf2d9c8, roughness: 0.55, metalness: 0.05,
        emissive: 0x000000, emissiveIntensity: 1
    });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), conchMaterial);
    body.scale.set(1.25, 0.75, 0.9);
    conchGroup.add(body);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 8), conchMaterial);
    spire.rotation.z = -Math.PI / 2.4;
    spire.position.set(0.13, 0.04, 0);
    conchGroup.add(spire);
    const lip = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xdf9a94, roughness: 0.5 })
    );
    lip.scale.set(1, 0.6, 1);
    lip.position.set(-0.08, 0.01, 0.04);
    conchGroup.add(lip);
    conchGroup.traverse((child) => { if (child.isMesh) child.castShadow = true; });

    conchGroup.position.set(booth.x + W / 2 + 0.1, 1.13, booth.z + 0.55);
    registerOutdoorProp(conchGroup, 'conch');
    courseGroup.add(conchGroup);
}

// ---- The scorecard board ----
// The board carries the discovery list drawn as a scorecard (mirroring the
// checklist, the way the trail's kiosk notice board did) plus a few words for
// Mom and Dad. main.js opens a close-up view of it, drawn by drawScorecardTo.
let scoreBoard = null;   // { canvas, ctx, texture }
let scoreItems = [];     // latest checklist rows, [{ short, done }]

const BOARD_DEDICATION = [
    'For Mom and Dad, the best mini golf partners',
    'a kid ever had. Every summer we played a course',
    'like this one by the beach, and every summer it',
    'was the best night of the year. One more round,',
    'any summer you like. I will bring the scorecard.'
];

function drawScorecardBoard(ctx, W, H) {
    // Sun-faded scorecard on a weathered board
    ctx.fillStyle = '#e8ddc0';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#6b4f33';
    ctx.lineWidth = W * 0.02;
    ctx.strokeRect(0, 0, W, H);

    const pad = W * 0.06;

    // Header
    ctx.fillStyle = '#7a4a3a';
    ctx.font = `bold ${Math.round(H * 0.045)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText('COASTAL HIGHWAY  ·  OCEAN CITY, MARYLAND', W / 2, H * 0.09);

    ctx.fillStyle = '#2c2118';
    ctx.font = `bold ${Math.round(H * 0.085)}px Georgia, serif`;
    ctx.fillText('SHIPWRECK COVE PUTT PUTT', W / 2, H * 0.19);

    ctx.strokeStyle = '#6b4f33';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, H * 0.24);
    ctx.lineTo(W - pad, H * 0.24);
    ctx.stroke();

    // The scorecard: discoveries as holes (par is a suggestion)
    ctx.textAlign = 'left';
    ctx.font = `${Math.round(H * 0.042)}px Georgia, serif`;
    ctx.fillStyle = '#4a3c28';
    ctx.fillText("Tonight's scorecard (par is a suggestion):", pad, H * 0.31);

    const colItems = Math.ceil(scoreItems.length / 2) || 5;
    const rowH = H * 0.062;
    const listTop = H * 0.37;
    scoreItems.forEach((item, i) => {
        const col = Math.floor(i / colItems);
        const row = i % colItems;
        const x = pad + col * (W / 2 - pad * 0.6);
        const y = listTop + row * rowH;

        // Checkbox
        ctx.strokeStyle = '#4a3c28';
        ctx.lineWidth = 2;
        const boxSize = H * 0.032;
        ctx.strokeRect(x, y - boxSize + 4, boxSize, boxSize);
        if (item.done) {
            ctx.strokeStyle = '#2f7a4a';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x + boxSize * 0.2, y - boxSize * 0.4 + 4);
            ctx.lineTo(x + boxSize * 0.45, y - boxSize * 0.1 + 4);
            ctx.lineTo(x + boxSize * 1.05, y - boxSize * 0.95 + 4);
            ctx.stroke();
        }

        ctx.fillStyle = item.done ? '#2f7a4a' : '#4a3c28';
        ctx.font = `${Math.round(H * 0.038)}px Georgia, serif`;
        ctx.fillText(item.short, x + boxSize + W * 0.015, y);
    });

    // Dedication
    const dedTop = H * 0.7;
    ctx.strokeStyle = '#6b4f33';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, dedTop - H * 0.045);
    ctx.lineTo(W - pad, dedTop - H * 0.045);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#5a4a34';
    ctx.font = `italic ${Math.round(H * 0.042)}px Georgia, serif`;
    BOARD_DEDICATION.forEach((line, i) => {
        ctx.fillText(line, W / 2, dedTop + i * H * 0.055);
    });
}

/** Redraw the in-world board (called on checklist changes from main.js). */
export function updateScorecardChecklist(items, progress) {
    if (items) {
        scoreItems = items.map((item) => ({
            short: item.short || item.label,
            // item.done comes from getChecklistItems. (The progress arg is a
            // summary {done: count, total, complete}, not a per-id map, so
            // reading progress[item.id] here left every box unticked.)
            done: !!item.done
        }));
    }
    if (scoreBoard) {
        drawScorecardBoard(scoreBoard.ctx, scoreBoard.canvas.width, scoreBoard.canvas.height);
        scoreBoard.texture.needsUpdate = true;
    }
}

/** Draw the scorecard into any 2D context (the close-up overlay). */
export function drawScorecardTo(ctx, w, h) {
    drawScorecardBoard(ctx, w, h);
}

function createScorecardBoardStand(x, z) {
    const standGroup = new THREE.Group();
    standGroup.name = 'scorecardBoard';

    // Posts
    const postGeometry = new THREE.BoxGeometry(0.14, 2.9, 0.14); // tall enough to meet the roof panels (~y 2.8)
    [-1.35, 1.35].forEach((offset) => {
        const post = new THREE.Mesh(postGeometry, darkWood);
        post.position.set(offset, 1.45, 0);
        post.castShadow = true;
        standGroup.add(post);
    });

    // The board itself (canvas texture on the front face)
    const canvas = makeCanvas(768, 448);
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    scoreBoard = { canvas, ctx, texture };
    drawScorecardBoard(ctx, canvas.width, canvas.height);
    texture.needsUpdate = true;

    const board = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 1.45, 0.06),
        [
            darkWood, darkWood, darkWood, darkWood,
            new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }),  // front (+Z)
            darkWood
        ]
    );
    board.position.set(0, 1.5, 0.04);
    board.castShadow = true;
    standGroup.add(board);

    // Little peaked roof
    [-1, 1].forEach((side) => {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.05, 0.75), darkWood);
        panel.position.set(0, 2.62 + 0.16, side * 0.31);
        // side * +0.45 drops each panel's outer edge for a peaked roof
        // (side * -0.45 raised them into an upside-down V).
        panel.rotation.x = side * 0.45;
        panel.castShadow = true;
        standGroup.add(panel);
    });

    standGroup.position.set(x, 0, z);
    // Built facing +Z: the board stands at the entrance and its front already
    // looks north into the course, where the visitor is.

    registerOutdoorProp(standGroup, 'scoreboard');

    const box = new THREE.Box3().setFromObject(standGroup);
    collisionBoxes.push({ box, type: 'decor' });

    courseGroup.add(standGroup);
}

function createEntrance() {
    const { fenceZ, arch, board } = LAYOUT;

    // Rope fence along the sidewalk with a gap at the arch
    createRopeFence(-32, arch.x - 2.6, fenceZ);
    createRopeFence(arch.x + 2.6, 32, fenceZ);

    // Hedge wall along the rear property line, behind the berm
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(66, 1.6, 0.9), hedgeMaterial);
    hedge.position.set(0, 0.8, 36.2);
    courseGroup.add(hedge);

    createEntranceArch();
    createTicketBooth();
    createScorecardBoardStand(board.x, board.z);
}

// ============================================
// THE COURSE (mini golf holes)
// ============================================
// One reusable builder handles every hole: a felt green with a brick border,
// a tee pad at the near end (the border opens there so the ball rolls in), a
// cup and numbered flag at the far end. Holes are axis-aligned on purpose:
// the collision system is AABB boxes, so straight borders collide honestly.

/** Numbered pennant flag on a pole at the cup. */
function createHoleFlag(num, poleHeight = 1.05) {
    const flagGroup = new THREE.Group();

    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, poleHeight, 6),
        new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.5, metalness: 0.3 })
    );
    pole.position.y = poleHeight / 2;
    flagGroup.add(pole);

    const canvas = makeCanvas(64, 64);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = '#b8433a';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(64, 32);
    ctx.lineTo(0, 64);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), 6, 34);
    const flagTexture = new THREE.CanvasTexture(canvas);

    const pennant = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.22),
        new THREE.MeshStandardMaterial({ map: flagTexture, roughness: 0.7, side: THREE.DoubleSide, transparent: true })
    );
    pennant.position.set(0.17, poleHeight - 0.14, 0);
    flagGroup.add(pennant);

    return flagGroup;
}

/**
 * Build one mini golf hole from its spec:
 *   { num, tee: {x,z}, cup: {x,z}, baseY, width, margin, solid }
 * tee and cup must share an axis (see the note above). baseY lifts the whole
 * hole onto the ship deck. solid: false skips the border colliders (used on
 * the deck, where the bulwarks already fence the player in).
 */
function createMiniGolfHole(spec) {
    const holeGroup = new THREE.Group();
    holeGroup.name = `hole${spec.num}`;

    const baseY = spec.baseY || 0;
    const width = spec.width || 1.8;
    const margin = spec.margin !== undefined ? spec.margin : 0.8;
    const alongX = Math.abs(spec.cup.x - spec.tee.x) > Math.abs(spec.cup.z - spec.tee.z);

    const teeA = alongX ? spec.tee.x : spec.tee.z;   // along-axis coordinates
    const cupA = alongX ? spec.cup.x : spec.cup.z;
    const cross = alongX ? spec.tee.z : spec.tee.x;  // shared cross-axis line
    const dir = cupA > teeA ? 1 : -1;

    const nearEdge = teeA - dir * margin;
    const farEdge = cupA + dir * margin;
    const length = Math.abs(farEdge - nearEdge);
    const centerA = (nearEdge + farEdge) / 2;

    const cx = alongX ? centerA : cross;
    const cz = alongX ? cross : centerA;

    // The felt
    const felt = new THREE.Mesh(
        new THREE.PlaneGeometry(alongX ? length : width, alongX ? width : length),
        new THREE.MeshStandardMaterial({ map: feltTexture, roughness: 0.9 })
    );
    felt.rotation.x = -Math.PI / 2;
    felt.position.set(cx, baseY + 0.012, cz);
    felt.receiveShadow = true;
    holeGroup.add(felt);

    // Brick border: two long rails, a solid far end, and two stubs at the tee
    // end leaving a gap for the ball (and the story) to enter.
    const railH = 0.13;
    const railT = 0.13;
    const railY = baseY + railH / 2 + 0.02;
    const gap = 0.7;

    const addRail = (w, d, x, z) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(w, railH, d), brickBorderMaterial);
        rail.position.set(x, railY, z);
        rail.castShadow = true;
        holeGroup.add(rail);
        if (spec.solid !== false) {
            collisionBoxes.push({
                box: new THREE.Box3(
                    new THREE.Vector3(x - w / 2, baseY, z - d / 2),
                    new THREE.Vector3(x + w / 2, baseY + 0.45, z + d / 2)
                ),
                type: 'curb'
            });
        }
    };

    const halfW = width / 2 + railT / 2;
    const endStub = (width - gap) / 2;
    if (alongX) {
        addRail(length + railT * 2, railT, centerA, cross - halfW);
        addRail(length + railT * 2, railT, centerA, cross + halfW);
        addRail(railT, width, farEdge + dir * railT / 2, cross);                       // far end, solid
        addRail(railT, endStub, nearEdge - dir * railT / 2, cross - (gap + endStub) / 2);
        addRail(railT, endStub, nearEdge - dir * railT / 2, cross + (gap + endStub) / 2);
    } else {
        addRail(railT, length + railT * 2, cross - halfW, centerA);
        addRail(railT, length + railT * 2, cross + halfW, centerA);
        addRail(width, railT, cross, farEdge + dir * railT / 2);
        addRail(endStub, railT, cross - (gap + endStub) / 2, nearEdge - dir * railT / 2);
        addRail(endStub, railT, cross + (gap + endStub) / 2, nearEdge - dir * railT / 2);
    }

    // Tee pad: a dark rubber disc just outside the gap
    const teePad = new THREE.Mesh(
        new THREE.CircleGeometry(0.26, 16),
        new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.95 })
    );
    teePad.rotation.x = -Math.PI / 2;
    teePad.position.set(spec.tee.x, baseY + 0.016, spec.tee.z);
    holeGroup.add(teePad);

    // The cup, and its numbered flag
    const cup = new THREE.Mesh(
        new THREE.CircleGeometry(0.075, 16),
        new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 1.0 })
    );
    cup.rotation.x = -Math.PI / 2;
    cup.position.set(spec.cup.x, baseY + 0.018, spec.cup.z);
    holeGroup.add(cup);

    const flag = createHoleFlag(spec.num);
    flag.position.set(spec.cup.x, baseY + 0.02, spec.cup.z);
    holeGroup.add(flag);

    registerOutdoorProp(holeGroup, 'hole');
    courseGroup.add(holeGroup);

    return holeGroup;
}

/** The land holes. The ship holes are built with the ship so the deck work
 *  stays together. */
function createCourseHoles() {
    // Hole 1: straight north from the entrance path
    createMiniGolfHole({ num: 1, tee: { x: -16, z: 1.5 }, cup: { x: -16, z: 8 } });
    // Hole 2: east along the second link path
    createMiniGolfHole({ num: 2, tee: { x: -10, z: 10 }, cup: { x: -4, z: 10 } });
    // Hole 3: east along the front walk, through the barrel tunnel
    createMiniGolfHole({ num: 3, tee: { x: 4, z: 2 }, cup: { x: 10, z: 2 } });
    // Hole 4: east past the treasure chest
    createMiniGolfHole({ num: 4, tee: { x: 0, z: 13 }, cup: { x: 6, z: 13 } });

    // Hole 3's barrel tunnel: a rum barrel on its side straddling the felt,
    // open at both ends so the ball rolls straight through.
    const tunnel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 1.0, 12, 1, true),
        new THREE.MeshStandardMaterial({ map: shipWoodTexture, roughness: 0.85, side: THREE.DoubleSide })
    );
    tunnel.rotation.z = Math.PI / 2;
    tunnel.position.set(7, 0.38, 2);
    tunnel.castShadow = true;
    courseGroup.add(tunnel);
    [-0.45, 0.45].forEach((off) => {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.025, 6, 16), blackIron);
        band.rotation.y = Math.PI / 2;
        band.position.set(7 + off, 0.38, 2);
        courseGroup.add(band);
    });

    // The far background hole, where the background pair plays
    const { bgHole } = LAYOUT;
    createMiniGolfHole({ num: 8, tee: { x: bgHole.teeX, z: bgHole.z }, cup: { x: bgHole.cupX, z: bgHole.z } });
}

// ============================================
// THE LAGOON
// ============================================
// A rectangular basin sunken 0.8m below the course, holding bright teal
// water at -0.55 (the trail's transparent scrolling-water technique). The
// pirate ship floats in the middle, and the island green for the plank hole
// pokes up along the north edge. The perimeter is sealed with colliders
// except at exactly two crossings: the gangplank and the plank.
let lagoonState = null;

function createLagoon() {
    const lagoonGroup = new THREE.Group();
    lagoonGroup.name = 'lagoon';

    const { lagoon, island, gangplank, plank, ship } = LAYOUT;
    const width = lagoon.maxX - lagoon.minX;
    const depth = lagoon.maxZ - lagoon.minZ;
    const midX = (lagoon.minX + lagoon.maxX) / 2;
    const midZ = (lagoon.minZ + lagoon.maxZ) / 2;

    // Sandy basin floor
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(width + 1, depth + 1),
        new THREE.MeshStandardMaterial({ map: sandTexture, roughness: 1.0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(midX, lagoon.floorY, midZ);
    lagoonGroup.add(floor);

    // Rock curb ring: the basin's inner walls, with a lip proud of the lawn
    // (the z-fighting rule working in our favor: the lip reads as edging).
    const curbMaterial = new THREE.MeshStandardMaterial({ color: 0x6e6a62, roughness: 0.95 });
    const curbH = 0.92;   // floorY -0.8 up to a +0.12 lip
    const curbY = lagoon.floorY + curbH / 2;
    const curbs = [
        { w: width + 0.9, d: 0.35, x: midX, z: lagoon.minZ - 0.1 },
        { w: width + 0.9, d: 0.35, x: midX, z: lagoon.maxZ + 0.1 },
        { w: 0.35, d: depth + 0.2, x: lagoon.minX - 0.1, z: midZ },
        { w: 0.35, d: depth + 0.2, x: lagoon.maxX + 0.1, z: midZ }
    ];
    curbs.forEach((c) => {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(c.w, curbH, c.d), curbMaterial);
        curb.position.set(c.x, curbY, c.z);
        curb.castShadow = true;
        lagoonGroup.add(curb);
    });

    // The water: one plane, cloned texture so updateLagoon can drift it
    const waterMap = waterTexture.clone();
    waterMap.needsUpdate = true;
    const water = new THREE.Mesh(
        new THREE.PlaneGeometry(width - 0.5, depth - 0.5),
        new THREE.MeshStandardMaterial({
            map: waterMap,
            color: 0xbfe6ea,
            transparent: true,
            opacity: 0.82,
            roughness: 0.25,
            metalness: 0.1
        })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(midX, lagoon.waterY, midZ);
    lagoonGroup.add(water);

    // Foam collars where the hull meets the water, and around the island
    const foamMaterial = new THREE.MeshStandardMaterial({
        map: foamTexture, transparent: true, opacity: 0.5, roughness: 0.4
    });
    const foamStrips = [
        { w: ship.maxX - ship.minX + 1, d: 0.5, x: (ship.minX + ship.maxX) / 2, z: ship.minZ - 0.3 },
        { w: ship.maxX - ship.minX + 1, d: 0.5, x: (ship.minX + ship.maxX) / 2, z: ship.maxZ + 0.3 },
        { w: 0.5, d: ship.maxZ - ship.minZ, x: ship.minX - 0.3, z: (ship.minZ + ship.maxZ) / 2 },
        { w: 0.5, d: ship.maxZ - ship.minZ, x: ship.maxX + 0.3, z: (ship.minZ + ship.maxZ) / 2 }
    ];
    const foamMeshes = foamStrips.map((f) => {
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.d), foamMaterial.clone());
        strip.rotation.x = -Math.PI / 2;
        strip.position.set(f.x, lagoon.waterY + 0.012, f.z);
        lagoonGroup.add(strip);
        return strip;
    });

    // A few rocks breaking the surface near the edges
    const rockSpots = [
        { x: 8.5, z: 27.5, s: 0.7 }, { x: 31.5, z: 19.6, s: 0.9 },
        { x: 30.8, z: 28.8, s: 0.6 }, { x: 9.5, z: 19.2, s: 0.8 }
    ];
    rockSpots.forEach((spot) => {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(spot.s, 0), rockMaterial);
        rock.position.set(spot.x, lagoon.waterY - 0.15 + spot.s * 0.35, spot.z);
        rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        rock.scale.y = 0.7;
        rock.castShadow = true;
        lagoonGroup.add(rock);
    });

    // The island: a rock pedestal rising to ground level at the north edge.
    // Its round green (the plank hole's landing) is built with the plank.
    const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(island.r, island.r + 0.4, 0.8, 18),
        curbMaterial
    );
    pedestal.position.set(island.x, -0.4, island.z);
    pedestal.castShadow = true;
    lagoonGroup.add(pedestal);
    const islandFoam = new THREE.Mesh(new THREE.RingGeometry(island.r, island.r + 0.5, 18), foamMaterial.clone());
    islandFoam.rotation.x = -Math.PI / 2;
    islandFoam.position.set(island.x, lagoon.waterY + 0.012, island.z);
    lagoonGroup.add(islandFoam);

    registerOutdoorProp(lagoonGroup, 'lagoon');
    courseGroup.add(lagoonGroup);

    // --- Perimeter colliders: the water is sealed off except at exactly two
    // crossings (the gangplank on the south edge, the plank on the north).
    // A missing box here means a visitor standing on the water, so these are
    // laid out edge by edge with the gaps called out explicitly. ---
    const seal = (minX, maxX, minZ, maxZ) => {
        collisionBoxes.push({
            box: new THREE.Box3(new THREE.Vector3(minX, 0, minZ), new THREE.Vector3(maxX, 1.4, maxZ)),
            type: 'lagoon'
        });
    };
    const gpHalf = gangplank.width / 2 + 0.1;
    const plHalf = plank.width / 2 + 0.15;
    // South edge, gap at the gangplank (x 13.3..14.7)
    seal(lagoon.minX - 0.3, gangplank.x - gpHalf, lagoon.minZ - 0.35, lagoon.minZ + 0.05);
    seal(gangplank.x + gpHalf, lagoon.maxX + 0.3, lagoon.minZ - 0.35, lagoon.minZ + 0.05);
    // North edge, gap at the plank (x 21.4..22.6)
    seal(lagoon.minX - 0.3, plank.x - plHalf, lagoon.maxZ - 0.05, lagoon.maxZ + 0.35);
    seal(plank.x + plHalf, lagoon.maxX + 0.3, lagoon.maxZ - 0.05, lagoon.maxZ + 0.35);
    // West and east edges, no gaps
    seal(lagoon.minX - 0.35, lagoon.minX + 0.05, lagoon.minZ - 0.3, lagoon.maxZ + 0.3);
    seal(lagoon.maxX - 0.05, lagoon.maxX + 0.35, lagoon.minZ - 0.3, lagoon.maxZ + 0.3);

    // Island ring: walkable only from the plank (its gap faces the plank's
    // landing on the south side). Approximated with four AABB arcs.
    const ir = island.r;
    seal(island.x - ir - 0.2, island.x + ir + 0.2, island.z + ir - 0.1, island.z + ir + 0.25);      // north arc
    seal(island.x - ir - 0.25, island.x - ir + 0.1, island.z - ir, island.z + ir);                   // west arc
    seal(island.x + ir - 0.1, island.x + ir + 0.25, island.z - ir, island.z + ir);                   // east arc
    seal(island.x - ir - 0.2, plank.x - plHalf, island.z - ir - 0.25, island.z - ir + 0.1);          // south arc, west of the plank
    seal(plank.x + plHalf, island.x + ir + 0.2, island.z - ir - 0.25, island.z - ir + 0.1);          // south arc, east of the plank

    lagoonState = {
        water,
        foamMeshes: foamMeshes.concat([islandFoam]),
        flag: null,      // the Jolly Roger registers itself in createPirateShip
        sails: [],
        elapsed: 0
    };
}

/**
 * Animate the lagoon: the water drifts, the foam breathes, the Jolly Roger
 * and sails sway in the sea breeze. Driven from the render loop in main.js.
 * Reduced-motion visitors get still water and a still flag.
 */
export function updateLagoon(deltaTime) {
    if (!lagoonState || _reducedMotion.matches) return;

    lagoonState.elapsed += deltaTime;
    const t = lagoonState.elapsed;

    lagoonState.water.material.map.offset.x += deltaTime * 0.018;
    lagoonState.water.material.map.offset.y += deltaTime * 0.006;

    lagoonState.foamMeshes.forEach((foam, i) => {
        foam.material.opacity = 0.42 + Math.sin(t * 1.8 + i * 1.3) * 0.1;
    });

    if (lagoonState.flag) {
        lagoonState.flag.rotation.y = Math.sin(t * 1.7) * 0.22;
        lagoonState.flag.rotation.x = Math.sin(t * 2.3 + 1) * 0.05;
    }
    lagoonState.sails.forEach((sail, i) => {
        sail.scale.z = 1 + Math.sin(t * 0.9 + i * 2) * 0.04;
    });
}

// ============================================
// THE PIRATE SHIP
// ============================================
// The signature piece: a boardable pirate ship floating in the lagoon, with
// three playable holes on deck (5, 6, and 7, the plank hole). The deck sits
// at y 0 like every walkable surface; the hull walls double as bulwarks with
// exactly two openings, one at the gangplank and one at the plank, so a
// visitor aboard can only leave the way a golf ball would.

/** One hull-and-bulwark wall segment with its collider. */
function addShipWall(minX, maxX, minZ, maxZ) {
    const { ship } = LAYOUT;
    const wall = new THREE.Mesh(
        new THREE.BoxGeometry(maxX - minX, ship.wallTop - ship.wallBottom, maxZ - minZ),
        new THREE.MeshStandardMaterial({ map: shipWoodTexture, roughness: 0.85 })
    );
    wall.position.set((minX + maxX) / 2, (ship.wallTop + ship.wallBottom) / 2, (minZ + maxZ) / 2);
    wall.castShadow = true;
    courseGroup.add(wall);

    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(minX, 0, minZ),
            new THREE.Vector3(maxX, ship.wallTop, maxZ)
        ),
        type: 'hull'
    });
    return wall;
}

/** A pirate cannon: carriage, two wheels, and a tapered barrel. Built aiming
 *  down positive Z; rotate the group to point it politely elsewhere. */
function createCannon(x, z, rotationY, baseY = 0) {
    const cannonGroup = new THREE.Group();
    cannonGroup.name = 'cannon';

    const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.6), darkWood);
    carriage.position.y = 0.26;
    carriage.castShadow = true;
    cannonGroup.add(carriage);

    [-0.28, 0.28].forEach((side) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 10), darkWood);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side, 0.17, 0.1);
        wheel.castShadow = true;
        cannonGroup.add(wheel);
    });

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.15, 12), blackIron);
    barrel.rotation.x = Math.PI / 2 - 0.18;   // muzzle up a touch
    barrel.position.set(0, 0.45, 0.25);
    barrel.castShadow = true;
    cannonGroup.add(barrel);
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.02, 6, 12), blackIron);
    muzzle.position.set(0, 0.55, 0.8);
    muzzle.rotation.x = -0.18;
    cannonGroup.add(muzzle);

    cannonGroup.position.set(x, baseY, z);
    cannonGroup.rotation.y = rotationY;
    registerOutdoorProp(cannonGroup, 'cannon');

    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(x - 0.45, baseY, z - 0.55),
            new THREE.Vector3(x + 0.45, baseY + 0.7, z + 0.55)
        ),
        type: 'decor'
    });

    courseGroup.add(cannonGroup);
}

/** The ship's wheel, mounted on the stern castle face, looking over the deck. */
function createShipsWheel() {
    const wheelGroup = new THREE.Group();
    wheelGroup.name = 'shipsWheel';

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 8, 20), darkWood);
    wheelGroup.add(rim);
    for (let i = 0; i < 4; i++) {
        const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.82, 6), darkWood);
        spoke.rotation.z = (i / 4) * Math.PI;
        wheelGroup.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.09, 10), blackIron);
    hub.rotation.x = Math.PI / 2;
    wheelGroup.add(hub);

    const { stern } = LAYOUT;
    wheelGroup.position.set(stern.minX - 0.12, 1.2, 24);
    wheelGroup.rotation.y = Math.PI / 2;   // face the deck
    wheelGroup.traverse((child) => { if (child.isMesh) child.castShadow = true; });

    registerOutdoorProp(wheelGroup, 'wheel');
    courseGroup.add(wheelGroup);
}

/** The plank hole (hole 7): a tee and felt runway on deck, the plank itself
 *  over the water, and the island green with the cup. The plank is walkable
 *  by visitors too, funneled by rope posts (their colliders keep everyone
 *  from stepping off sideways, exactly like the real thing should have). */
function createPlankHole() {
    const { plank, island, ship } = LAYOUT;
    const plankGroup = new THREE.Group();
    plankGroup.name = 'plankHole';

    // Deck runway: tee pad and a felt strip leading to the bulwark opening
    const runway = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, ship.maxZ - 25.1),
        new THREE.MeshStandardMaterial({ map: feltTexture, roughness: 0.9 })
    );
    runway.rotation.x = -Math.PI / 2;
    runway.position.set(plank.x, 0.032, (25.1 + ship.maxZ) / 2);
    plankGroup.add(runway);

    const teePad = new THREE.Mesh(
        new THREE.CircleGeometry(0.24, 16),
        new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.95 })
    );
    teePad.rotation.x = -Math.PI / 2;
    teePad.position.set(plank.x, 0.038, 25.5);
    plankGroup.add(teePad);

    // Low rails along the runway sides (visual only, the deck is fenced)
    [-0.55, 0.55].forEach((off) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, ship.maxZ - 25.0), brickBorderMaterial);
        rail.position.set(plank.x + off, 0.07, (25.0 + ship.maxZ) / 2);
        plankGroup.add(rail);
    });

    // The plank itself: a weathered board from the bulwark gap to the island
    const board = new THREE.Mesh(
        new THREE.BoxGeometry(plank.width, 0.07, plank.maxZ - plank.minZ),
        new THREE.MeshStandardMaterial({ map: shipWoodTexture, roughness: 0.9 })
    );
    board.position.set(plank.x, 0.015, (plank.minZ + plank.maxZ) / 2);
    board.castShadow = true;
    plankGroup.add(board);

    // Rope posts funneling the walk (and their colliders)
    const postZs = [plank.minZ + 0.2, (plank.minZ + plank.maxZ) / 2, plank.maxZ - 0.2];
    [-1, 1].forEach((side) => {
        const px = plank.x + side * (plank.width / 2 + 0.1);
        let prev = null;
        postZs.forEach((pz) => {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.55, 6), darkWood);
            post.position.set(px, 0.3, pz);
            plankGroup.add(post);
            if (prev !== null) {
                plankGroup.add(tubeBetween(
                    new THREE.Vector3(px, 0.52, prev),
                    new THREE.Vector3(px, 0.52, pz),
                    0.02, ropeMaterial
                ));
            }
            prev = pz;
        });
        collisionBoxes.push({
            box: new THREE.Box3(
                new THREE.Vector3(px - 0.08, 0, plank.minZ - 0.1),
                new THREE.Vector3(px + 0.08, 1.0, plank.maxZ + 0.1)
            ),
            type: 'plankrail'
        });
    });

    // The island green: round felt, cup, and the number 7 flag
    const green = new THREE.Mesh(
        new THREE.CircleGeometry(island.r - 0.35, 20),
        new THREE.MeshStandardMaterial({ map: feltTexture, roughness: 0.9 })
    );
    green.rotation.x = -Math.PI / 2;
    green.position.set(island.x, 0.012, island.z);
    plankGroup.add(green);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(island.r - 0.3, 0.06, 6, 24), brickBorderMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(island.x, 0.05, island.z);
    plankGroup.add(ring);

    const cup = new THREE.Mesh(
        new THREE.CircleGeometry(0.075, 16),
        new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 1.0 })
    );
    cup.rotation.x = -Math.PI / 2;
    cup.position.set(island.x, 0.018, island.z);
    plankGroup.add(cup);

    const flag = createHoleFlag(7);
    flag.position.set(island.x, 0.02, island.z);
    plankGroup.add(flag);

    registerOutdoorProp(plankGroup, 'plank');
    courseGroup.add(plankGroup);

    // The ball skimmer net, leaning on the bulwark beside the plank gap. A
    // thousand golf balls owe it their lives.
    const skimmerGroup = new THREE.Group();
    skimmerGroup.name = 'skimmer';
    const handle = tubeBetween(
        new THREE.Vector3(23.3, 0.2, 27.5),
        new THREE.Vector3(24.6, 1.55, 27.75),
        0.03, darkWood
    );
    skimmerGroup.add(handle);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.022, 6, 14), blackIron);
    hoop.rotation.x = Math.PI / 2.6;
    hoop.position.set(23.15, 0.18, 27.4);
    skimmerGroup.add(hoop);
    const net = new THREE.Mesh(
        new THREE.CircleGeometry(0.25, 14),
        new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.9, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    );
    net.rotation.x = Math.PI / 2.6;
    net.position.copy(hoop.position);
    skimmerGroup.add(net);
    registerOutdoorProp(skimmerGroup, 'skimmer');
    courseGroup.add(skimmerGroup);

    // Splash FX, parked hidden at the plank's splash spot
    createSplashFX(plank.x, LAYOUT.lagoon.waterY, 29.35);
}

function createPirateShip() {
    const { ship, gangplank, plank, mast, stern } = LAYOUT;
    const gpHalf = gangplank.width / 2 + 0.1;
    const plHalf = plank.width / 2 + 0.15;

    // Hull walls / bulwarks, with the two openings
    addShipWall(ship.minX - 0.15, gangplank.x - gpHalf, ship.minZ - 0.15, ship.minZ + 0.15);  // south, west of gangplank
    addShipWall(gangplank.x + gpHalf, ship.maxX + 0.15, ship.minZ - 0.15, ship.minZ + 0.15);  // south, east of gangplank
    addShipWall(ship.minX - 0.15, plank.x - plHalf, ship.maxZ - 0.15, ship.maxZ + 0.15);      // north, west of plank
    addShipWall(plank.x + plHalf, ship.maxX + 0.15, ship.maxZ - 0.15, ship.maxZ + 0.15);      // north, east of plank
    addShipWall(ship.minX - 0.15, ship.minX + 0.15, ship.minZ, ship.maxZ);                    // west (bow end)
    addShipWall(ship.maxX - 0.15, ship.maxX + 0.15, ship.minZ, ship.maxZ);                    // east (stern end)

    // The deck
    const deck = new THREE.Mesh(
        new THREE.PlaneGeometry(ship.maxX - ship.minX - 0.3, ship.maxZ - ship.minZ - 0.3),
        new THREE.MeshStandardMaterial({ map: shipWoodTexture, roughness: 0.85 })
    );
    deck.rotation.x = -Math.PI / 2;
    deck.position.set((ship.minX + ship.maxX) / 2, 0.02, (ship.minZ + ship.maxZ) / 2);
    deck.receiveShadow = true;
    courseGroup.add(deck);

    // The pointed prow beyond the west wall (decorative, sealed off)
    const prowTip = new THREE.Vector3(9.4, 0, 24);
    [{ z: 20.4 }, { z: 27.6 }].forEach((corner) => {
        const from = new THREE.Vector3(ship.minX, 0, corner.z);
        const dx = prowTip.x - from.x;
        const dz = prowTip.z - from.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        const wall = new THREE.Mesh(
            new THREE.BoxGeometry(len, 1.6, 0.22),
            new THREE.MeshStandardMaterial({ map: shipWoodTexture, roughness: 0.85 })
        );
        wall.position.set((from.x + prowTip.x) / 2, 0.1, (from.z + prowTip.z) / 2);
        wall.rotation.y = -Math.atan2(dz, dx);
        wall.castShadow = true;
        courseGroup.add(wall);
    });
    // Prow deck fill (a flat triangle; shape XY maps to world XZ via -z)
    const prowShape = new THREE.Shape();
    prowShape.moveTo(ship.minX, -20.4);
    prowShape.lineTo(ship.minX, -27.6);
    prowShape.lineTo(prowTip.x, -24);
    prowShape.closePath();
    const prowDeck = new THREE.Mesh(
        new THREE.ShapeGeometry(prowShape),
        new THREE.MeshStandardMaterial({ map: shipWoodTexture, roughness: 0.85 })
    );
    prowDeck.rotation.x = -Math.PI / 2;
    prowDeck.position.y = 0.6;
    courseGroup.add(prowDeck);
    // Bowsprit
    courseGroup.add(tubeBetween(
        new THREE.Vector3(9.6, 0.8, 24),
        new THREE.Vector3(6.8, 1.9, 24),
        0.06, darkWood
    ));

    // Stern castle: the captain's cabin, with portholes and a railed roof
    const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(stern.maxX - stern.minX, stern.height, stern.maxZ - stern.minZ),
        new THREE.MeshStandardMaterial({ map: shipWoodTexture, roughness: 0.85 })
    );
    cabin.position.set((stern.minX + stern.maxX) / 2, stern.height / 2, (stern.minZ + stern.maxZ) / 2);
    cabin.castShadow = true;
    courseGroup.add(cabin);
    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(stern.minX, 0, stern.minZ),
            new THREE.Vector3(stern.maxX, stern.height, stern.maxZ)
        ),
        type: 'decor'
    });
    // Portholes on the cabin's deck face
    const portholeMaterial = new THREE.MeshStandardMaterial({
        color: 0xf5d76e, roughness: 0.4, emissive: 0x6b5a20, emissiveIntensity: 0.6
    });
    [21.8, 24, 26.2].forEach((z) => {
        const porthole = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), portholeMaterial);
        porthole.rotation.y = -Math.PI / 2;
        porthole.position.set(stern.minX - 0.01, 0.75, z);
        courseGroup.add(porthole);
    });
    // Roof rail
    const roofRailY = stern.height + 0.32;
    [stern.minZ + 0.1, stern.maxZ - 0.1].forEach((z) => {
        courseGroup.add(tubeBetween(
            new THREE.Vector3(stern.minX + 0.1, roofRailY, z),
            new THREE.Vector3(stern.maxX - 0.1, roofRailY, z),
            0.02, ropeMaterial
        ));
    });
    for (let z = stern.minZ + 0.1; z <= stern.maxZ; z += 1.9) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 6), darkWood);
        post.position.set(stern.minX + 0.1, stern.height + 0.17, z);
        courseGroup.add(post);
        const post2 = post.clone();
        post2.position.x = stern.maxX - 0.1;
        courseGroup.add(post2);
    }

    createShipsWheel();

    // The mast, boom, sails, crow's nest, and the Jolly Roger
    const mastPole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 7, 10), darkWood);
    mastPole.position.set(mast.x, 3.5, mast.z);
    mastPole.castShadow = true;
    courseGroup.add(mastPole);
    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(mast.x - 0.25, 0, mast.z - 0.25),
            new THREE.Vector3(mast.x + 0.25, 2.5, mast.z + 0.25)
        ),
        type: 'decor'
    });

    courseGroup.add(tubeBetween(
        new THREE.Vector3(mast.x, 4.4, mast.z - 2.6),
        new THREE.Vector3(mast.x, 4.4, mast.z + 2.6),
        0.05, darkWood
    ));

    // Two billowed sails: open partial cylinders bulging toward the bow
    const sailMaterial = new THREE.MeshStandardMaterial({
        map: sailTexture, roughness: 0.9, side: THREE.DoubleSide
    });
    const mainSail = new THREE.Mesh(
        new THREE.CylinderGeometry(2.3, 2.6, 2.6, 14, 1, true, Math.PI - 0.75, 1.5),
        sailMaterial
    );
    mainSail.position.set(mast.x + 1.1, 3.0, mast.z);
    mainSail.castShadow = true;
    courseGroup.add(mainSail);
    const topSail = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.8, 1.7, 12, 1, true, Math.PI - 0.7, 1.4),
        sailMaterial
    );
    topSail.position.set(mast.x + 0.7, 5.35, mast.z);
    topSail.castShadow = true;
    courseGroup.add(topSail);

    // Crow's nest
    const nest = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.4, 10), darkWood);
    nest.position.set(mast.x, 6.3, mast.z);
    courseGroup.add(nest);
    const nestRim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 14), darkWood);
    nestRim.rotation.x = Math.PI / 2;
    nestRim.position.set(mast.x, 6.5, mast.z);
    courseGroup.add(nestRim);

    // The Jolly Roger (waved by updateLagoon)
    const flagCanvas = makeCanvas(128, 80);
    const fctx = flagCanvas.getContext('2d');
    fctx.fillStyle = '#141414';
    fctx.fillRect(0, 0, 128, 80);
    fctx.fillStyle = '#f2f2f2';
    fctx.beginPath();
    fctx.arc(64, 32, 14, 0, Math.PI * 2);   // skull
    fctx.fill();
    fctx.fillRect(58, 42, 12, 8);           // jaw
    fctx.fillStyle = '#141414';
    fctx.beginPath();
    fctx.arc(59, 30, 3.5, 0, Math.PI * 2);  // eyes
    fctx.arc(69, 30, 3.5, 0, Math.PI * 2);
    fctx.fill();
    fctx.strokeStyle = '#f2f2f2';
    fctx.lineWidth = 5;
    fctx.beginPath();                        // crossbones
    fctx.moveTo(38, 58); fctx.lineTo(90, 66);
    fctx.moveTo(90, 58); fctx.lineTo(38, 66);
    fctx.stroke();
    const flagTexture = new THREE.CanvasTexture(flagCanvas);

    const flagGroup = new THREE.Group();
    const flagCloth = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.6),
        new THREE.MeshStandardMaterial({ map: flagTexture, roughness: 0.85, side: THREE.DoubleSide })
    );
    flagCloth.position.set(0.5, 0, 0);
    flagGroup.add(flagCloth);
    flagGroup.position.set(mast.x, 7.15, mast.z);
    courseGroup.add(flagGroup);
    if (lagoonState) {
        lagoonState.flag = flagGroup;
        lagoonState.sails = [mainSail, topSail];
    }

    // Rigging: three ropes from the masthead
    const masthead = new THREE.Vector3(mast.x, 6.9, mast.z);
    [
        new THREE.Vector3(9.7, 0.95, 24),
        new THREE.Vector3(stern.maxX - 0.2, stern.height + 0.1, stern.minZ + 0.4),
        new THREE.Vector3(stern.maxX - 0.2, stern.height + 0.1, stern.maxZ - 0.4)
    ].forEach((anchorPoint) => {
        courseGroup.add(tubeBetween(masthead, anchorPoint, 0.014, ropeMaterial));
    });

    // Deck furniture: cannons, a barrel, a coiled line
    createCannon(12.9, 26.9, 0, 0.02);            // aimed out over the bow rail
    createCannon(25.2, 20.9, Math.PI, 0.02);      // aimed south over the water
    const deckBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.8, 12), shipWoodBarrelMaterial());
    deckBarrel.position.set(16.6, 0.42, 21.2);
    deckBarrel.castShadow = true;
    courseGroup.add(deckBarrel);
    collisionBoxes.push({
        box: new THREE.Box3(new THREE.Vector3(16.2, 0, 20.8), new THREE.Vector3(17.0, 1, 21.6)),
        type: 'decor'
    });
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 8, 16), ropeMaterial);
    coil.rotation.x = -Math.PI / 2;
    coil.position.set(25.5, 0.09, 27.3);
    courseGroup.add(coil);

    // The anchor, hung on the bow where every kid checks it is real
    const anchorGroup = new THREE.Group();
    anchorGroup.name = 'anchor';
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), blackIron);
    anchorGroup.add(shaft);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.07), blackIron);
    stock.position.y = 0.45;
    anchorGroup.add(stock);
    const arms = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 12, Math.PI), blackIron);
    arms.rotation.z = Math.PI;
    arms.position.y = -0.42;
    anchorGroup.add(arms);
    const anchorRing = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 10), blackIron);
    anchorRing.position.y = 0.66;
    anchorGroup.add(anchorRing);
    anchorGroup.traverse((child) => { if (child.isMesh) child.castShadow = true; });
    anchorGroup.position.set(11.55, 0.2, 21.2);
    anchorGroup.rotation.y = Math.PI / 2;
    registerOutdoorProp(anchorGroup, 'anchor');
    courseGroup.add(anchorGroup);

    // The gangplank: a cleated boarding ramp with rope rails
    const gp = gangplank;
    const gpBoard = new THREE.Mesh(
        new THREE.BoxGeometry(gp.width, 0.08, gp.maxZ - gp.minZ),
        new THREE.MeshStandardMaterial({ map: shipWoodTexture, roughness: 0.9 })
    );
    gpBoard.position.set(gp.x, 0.01, (gp.minZ + gp.maxZ) / 2);
    gpBoard.castShadow = true;
    courseGroup.add(gpBoard);
    for (let z = gp.minZ + 0.4; z < gp.maxZ - 0.3; z += 0.55) {
        const cleat = new THREE.Mesh(new THREE.BoxGeometry(gp.width - 0.15, 0.03, 0.09), darkWood);
        cleat.position.set(gp.x, 0.065, z);
        courseGroup.add(cleat);
    }
    [-1, 1].forEach((side) => {
        const px = gp.x + side * (gp.width / 2 + 0.12);
        const posts = [gp.minZ + 0.25, (gp.minZ + gp.maxZ) / 2, gp.maxZ - 0.25];
        let prev = null;
        posts.forEach((pz) => {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.85, 6), darkWood);
            post.position.set(px, 0.45, pz);
            courseGroup.add(post);
            if (prev !== null) {
                courseGroup.add(tubeBetween(
                    new THREE.Vector3(px, 0.82, prev),
                    new THREE.Vector3(px, 0.82, pz),
                    0.022, ropeMaterial
                ));
            }
            prev = pz;
        });
        collisionBoxes.push({
            box: new THREE.Box3(
                new THREE.Vector3(px - 0.09, 0, gp.minZ - 0.1),
                new THREE.Vector3(px + 0.09, 1.1, gp.maxZ + 0.1)
            ),
            type: 'plankrail'
        });
    });

    // The deck holes (5 and 6), then the plank hole (7)
    createMiniGolfHole({ num: 5, tee: { x: 15, z: 21.5 }, cup: { x: 15, z: 26.5 }, baseY: 0.02, width: 1.5, margin: 0.5, solid: false });
    createMiniGolfHole({ num: 6, tee: { x: 18, z: 22 }, cup: { x: 24, z: 22 }, baseY: 0.02, width: 1.5, margin: 0.5, solid: false });
    createPlankHole();
}

function shipWoodBarrelMaterial() {
    return new THREE.MeshStandardMaterial({ map: shipWoodTexture, roughness: 0.85 });
}

// ============================================
// COURSE PROPS
// ============================================

/** A leaning palm: stacked trunk segments curving up to a frond crown. */
function createPalmTree(x, z, lean = 0.25) {
    const palm = new THREE.Group();
    palm.name = 'palmTree';

    const segments = 7;
    const segH = 0.62;
    let px = 0, py = 0;
    for (let i = 0; i < segments; i++) {
        const seg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14 - i * 0.008, 0.17 - i * 0.008, segH, 8),
            palmTrunkMaterial
        );
        px += lean * (i / segments) * segH;
        seg.position.set(px, py + segH / 2, 0);
        seg.rotation.z = -lean * (i / segments) * 1.2;
        seg.castShadow = true;
        palm.add(seg);
        py += segH * 0.96;
    }

    // Frond crown: flattened cones arching outward and drooping past
    // horizontal like real fronds (1.25 rad left every tip pointing at the
    // sky). The same jitter drives attach height and droop, so the lower a
    // frond sits on the crown, the harder it hangs, like the older fronds
    // on a real palm.
    const crownX = px, crownY = py + 0.1;
    for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2;
        const sag = Math.abs(Math.sin(i * 2.7));
        const tilt = 1.75 + 0.35 * sag;   // 90 deg is horizontal: 1.75..2.1 droops 10..30 deg below
        const frond = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.9, 4), palmFrondMaterial);
        frond.scale.y = 0.5;
        frond.scale.z = 0.28;
        frond.position.set(
            crownX + Math.cos(angle) * 0.75,
            crownY + 0.12 - sag * 0.15,
            Math.sin(angle) * 0.75
        );
        // One rotation about the crown's tangent axis tilts the blade
        // outward by exactly `tilt` at every angle. (The earlier cos/sin
        // Euler mix under-tilted the diagonal fronds, leaving them sticking
        // straight out while the cardinal ones drooped.)
        frond.quaternion.setFromAxisAngle(
            new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle)), tilt
        );
        frond.castShadow = true;
        palm.add(frond);
    }
    // Coconuts
    for (let i = 0; i < 3; i++) {
        const coconut = new THREE.Mesh(
            new THREE.SphereGeometry(0.09, 6, 6),
            new THREE.MeshStandardMaterial({ color: 0x5a4228, roughness: 0.9 })
        );
        const angle = i * 2.1;
        coconut.position.set(crownX + Math.cos(angle) * 0.16, crownY - 0.08, Math.sin(angle) * 0.16);
        palm.add(coconut);
    }

    palm.position.set(x, 0, z);
    palm.rotation.y = Math.random() * Math.PI * 2;
    registerOutdoorProp(palm, 'palm');

    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(x - 0.4, 0, z - 0.4),
            new THREE.Vector3(x + 0.4, 2.4, z + 0.4)
        ),
        type: 'tree'
    });

    courseGroup.add(palm);
}

/** Large oak-style shade tree (trail recipe). */
function createLargeTree(x, z, height = 8) {
    const tree = new THREE.Group();

    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.6, height * 0.4, 8),
        trunkMaterial
    );
    trunk.position.y = height * 0.2;
    trunk.castShadow = true;
    tree.add(trunk);

    const canopyMaterial = [darkGreenFoliage, mediumGreenFoliage, lightGreenFoliage][Math.floor(Math.random() * 3)];
    const canopyBase = height * 0.45;

    const mainCanopy = new THREE.Mesh(
        new THREE.SphereGeometry(height * 0.35, 8, 8),
        canopyMaterial
    );
    mainCanopy.position.y = canopyBase + height * 0.25;
    mainCanopy.castShadow = true;
    tree.add(mainCanopy);

    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(height * 0.22, 6, 6),
            canopyMaterial
        );
        sphere.position.set(
            Math.cos(angle) * height * 0.2,
            canopyBase + height * 0.15 + Math.random() * 0.5,
            Math.sin(angle) * height * 0.2
        );
        sphere.castShadow = true;
        tree.add(sphere);
    }

    tree.position.set(x, 0, z);
    registerOutdoorProp(tree, 'tree');
    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(x - 0.5, 0, z - 0.5),
            new THREE.Vector3(x + 0.5, 2.5, z + 0.5)
        ),
        type: 'tree'
    });
    courseGroup.add(tree);
}

/** Cluster of low bushes (trail recipe). */
function createBushCluster(x, z, size = 1) {
    const cluster = new THREE.Group();

    const numBushes = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < numBushes; i++) {
        const bushSize = (0.4 + Math.random() * 0.4) * size;
        const bush = new THREE.Mesh(
            new THREE.SphereGeometry(bushSize, 6, 6),
            bushMaterial
        );
        bush.position.set(
            (Math.random() - 0.5) * size * 1.5,
            bushSize * 0.7,
            (Math.random() - 0.5) * size * 1.5
        );
        bush.scale.y = 0.7 + Math.random() * 0.3;
        bush.castShadow = true;
        cluster.add(bush);
    }

    cluster.position.set(x, 0, z);
    registerOutdoorProp(cluster, 'bush');
    courseGroup.add(cluster);
}

/** Bush with scattered hibiscus-bright flower dots (trail recipe). */
function createFloweringBush(x, z) {
    const bush = new THREE.Group();

    const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 6, 6),
        bushMaterial
    );
    body.position.y = 0.6;
    body.scale.y = 0.8;
    bush.add(body);

    const flowerColors = [0xff69b4, 0xff6347, 0xffd700, 0xee82ee];
    const flowerMaterial = new THREE.MeshStandardMaterial({
        color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
        roughness: 0.6
    });

    for (let i = 0; i < 12; i++) {
        const flower = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 4, 4),
            flowerMaterial
        );
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.5 + Math.random() * 0.3;
        flower.position.set(
            Math.cos(angle) * radius,
            0.4 + Math.random() * 0.5,
            Math.sin(angle) * radius
        );
        bush.add(flower);
    }

    bush.position.set(x, 0, z);
    registerOutdoorProp(bush, 'bush');
    courseGroup.add(bush);
}

/** Skull Rock, the course mascot: a boulder with eye sockets and a grin. */
function createSkullRock(x, z) {
    const skullGroup = new THREE.Group();
    skullGroup.name = 'skullRock';

    const boneMaterial = new THREE.MeshStandardMaterial({ color: 0xc9c2b0, roughness: 0.9 });
    const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 1), boneMaterial);
    skull.scale.set(1, 0.85, 0.9);
    skull.position.y = 1.5;
    skull.castShadow = true;
    skullGroup.add(skull);

    const socketMaterial = new THREE.MeshStandardMaterial({ color: 0x14110d, roughness: 1.0 });
    [-0.75, 0.75].forEach((off) => {
        const socket = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), socketMaterial);
        socket.scale.z = 0.5;
        socket.position.set(off, 1.85, 1.72);
        skullGroup.add(socket);
    });
    // The grin: a row of gap teeth
    for (let i = -2; i <= 2; i++) {
        if (i === 1) continue;   // the missing tooth makes the smile
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.14), boneMaterial);
        tooth.position.set(i * 0.3, 0.72, 1.86);
        skullGroup.add(tooth);
    }

    skullGroup.position.set(x, 0, z);
    skullGroup.rotation.y = 0.5;   // grinning back toward the course
    registerOutdoorProp(skullGroup, 'skullrock');

    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(x - 2.2, 0, z - 2),
            new THREE.Vector3(x + 2.2, 3, z + 2)
        ),
        type: 'decor'
    });

    courseGroup.add(skullGroup);
}

/** The treasure chest, lid ajar, doubloons catching the light. */
function createTreasureChest(x, z, rotationY = 0) {
    const chestGroup = new THREE.Group();
    chestGroup.name = 'treasureChest';

    const chestMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 0.6), chestMaterial);
    body.position.y = 0.28;
    body.castShadow = true;
    chestGroup.add(body);

    // Iron banding
    [-0.3, 0.3].forEach((off) => {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.57, 0.62), blackIron);
        band.position.set(off, 0.28, 0);
        chestGroup.add(band);
    });

    // Lid: a half cylinder, hinged open at the back
    const lid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.95, 10, 1, false, 0, Math.PI),
        chestMaterial
    );
    lid.rotation.z = Math.PI / 2;
    lid.rotation.x = -0.9;   // ajar
    lid.position.set(0, 0.62, -0.28);
    lid.castShadow = true;
    chestGroup.add(lid);

    // The gold: a mound of doubloons peeking out
    const goldMaterial = new THREE.MeshStandardMaterial({
        color: 0xf2c14e, roughness: 0.3, metalness: 0.7,
        emissive: 0x8a6a1a, emissiveIntensity: 0.35
    });
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), goldMaterial);
    mound.scale.y = 0.45;
    mound.position.y = 0.56;
    chestGroup.add(mound);
    for (let i = 0; i < 5; i++) {
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 8), goldMaterial);
        const angle = i * 1.8;
        coin.position.set(Math.cos(angle) * 0.55, 0.03, 0.35 + Math.sin(angle) * 0.15);
        coin.rotation.x = Math.random() * 0.4;
        chestGroup.add(coin);
    }

    chestGroup.position.set(x, 0, z);
    chestGroup.rotation.y = rotationY;
    registerOutdoorProp(chestGroup, 'treasure');

    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(x - 0.6, 0, z - 0.5),
            new THREE.Vector3(x + 0.6, 1, z + 0.5)
        ),
        type: 'decor'
    });

    courseGroup.add(chestGroup);
}

/** A tiki torch: bamboo pole, woven head, and a steady flame. The flame is
 *  emissive so it glows for free; desktop torches also cast a little light. */
function createTikiTorch(x, z) {
    const torchGroup = new THREE.Group();
    torchGroup.name = 'tikiTorch';

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 8), palmTrunkMaterial);
    pole.position.y = 0.8;
    pole.castShadow = true;
    torchGroup.add(pole);

    const head = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.07, 0.28, 8),
        new THREE.MeshStandardMaterial({ color: 0x9a7a4a, roughness: 0.95 })
    );
    head.position.y = 1.7;
    torchGroup.add(head);

    const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.3, 8),
        new THREE.MeshStandardMaterial({
            color: 0xff8c2a, roughness: 0.6,
            emissive: 0xff6a00, emissiveIntensity: 1.4
        })
    );
    flame.position.y = 1.98;
    torchGroup.add(flame);

    if (!isMobileDevice()) {
        const light = new THREE.PointLight(0xffa54a, 0.5, 4.5);
        light.position.y = 2.0;
        torchGroup.add(light);
    }

    torchGroup.position.set(x, 0, z);
    registerOutdoorProp(torchGroup, 'torch');
    courseGroup.add(torchGroup);
}

/** Wooden-slat bench with metal legs (trail recipe, placed by position and
 *  facing). */
function createCourseBench(x, z, rotationY = 0) {
    const benchGroup = new THREE.Group();
    benchGroup.name = 'courseBench';

    const seatWidth = 2.0;
    const seatDepth = 0.45;
    const seatHeight = 0.45;
    const seatThickness = 0.06;
    const backHeight = 0.5;
    const backThickness = 0.05;
    const legWidth = 0.08;

    const woodMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B4513, roughness: 0.8, metalness: 0.1
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a, roughness: 0.4, metalness: 0.8
    });

    const slatCount = 5;
    const slatWidth = (seatWidth - 0.1) / slatCount;
    for (let i = 0; i < slatCount; i++) {
        const slat = new THREE.Mesh(
            new THREE.BoxGeometry(slatWidth - 0.02, seatThickness, seatDepth),
            woodMaterial
        );
        slat.position.set(-seatWidth / 2 + slatWidth / 2 + i * slatWidth + 0.05, seatHeight, 0);
        benchGroup.add(slat);
    }

    const backSlatCount = 4;
    const backSlatHeight = (backHeight - 0.08) / backSlatCount;
    for (let i = 0; i < backSlatCount; i++) {
        const backSlat = new THREE.Mesh(
            new THREE.BoxGeometry(seatWidth - 0.1, backSlatHeight - 0.02, backThickness),
            woodMaterial
        );
        backSlat.position.set(0, seatHeight + seatThickness / 2 + backSlatHeight / 2 + i * backSlatHeight + 0.04, -seatDepth / 2 + backThickness / 2);
        benchGroup.add(backSlat);
    }

    [-seatWidth / 2 + 0.15, seatWidth / 2 - 0.15].forEach(legX => {
        const frontLeg = new THREE.Mesh(new THREE.BoxGeometry(legWidth, seatHeight, legWidth), metalMaterial);
        frontLeg.position.set(legX, seatHeight / 2, seatDepth / 2 - legWidth / 2);
        benchGroup.add(frontLeg);
        const backLeg = new THREE.Mesh(new THREE.BoxGeometry(legWidth, seatHeight + backHeight, legWidth), metalMaterial);
        backLeg.position.set(legX, (seatHeight + backHeight) / 2, -seatDepth / 2 + legWidth / 2);
        benchGroup.add(backLeg);
    });

    benchGroup.position.set(x, 0, z);
    benchGroup.rotation.y = rotationY;
    benchGroup.traverse((child) => { if (child.isMesh) child.castShadow = true; });

    registerOutdoorProp(benchGroup, 'bench');

    const box = new THREE.Box3().setFromObject(benchGroup);
    collisionBoxes.push({ box, type: 'decor' });

    courseGroup.add(benchGroup);
}

function createProps() {
    // Palms: clustered near the lagoon, scattered along the back berm
    createPalmTree(-28, 12, 0.3);
    createPalmTree(-24, 24, -0.2);
    createPalmTree(-6, 16, 0.25);
    createPalmTree(30, 4, -0.3);
    createPalmTree(2, 26, 0.35);
    createPalmTree(31, 15, 0.2);
    createPalmTree(-16, 33.6, 0.3);
    createPalmTree(-2, 33.9, -0.25);
    createPalmTree(10, 34.2, 0.2);
    createPalmTree(26, 33.7, -0.3);

    // A couple of proper shade trees for the benches
    createLargeTree(-30, 2, 9);
    createLargeTree(24, 12, 8);

    // Bushes and flowers along the paths
    createBushCluster(-26, 6, 1.1);
    createBushCluster(-12, 3.4, 1.0);
    createBushCluster(2, 5.4, 1.2);
    createBushCluster(18, 4, 1.0);
    createBushCluster(8, 16, 1.1);
    createBushCluster(-20, 12, 1.2);
    createFloweringBush(-14, 7.5);
    createFloweringBush(5, 10.8);
    createFloweringBush(-22, 2);

    // Skull Rock, grinning from the northwest corner
    createSkullRock(-28, 30);

    // The treasure chest beside the fourth hole
    createTreasureChest(7.8, 15.2, -0.5);

    // The land cannon, aimed harmlessly out at Coastal Highway
    createCannon(-4, 4.2, Math.PI);

    // Tiki torches along the main walk and the lagoon spur
    createTikiTorch(-13, -0.35);
    createTikiTorch(-4, -0.35);
    createTikiTorch(5, -0.35);
    createTikiTorch(12.5, 8);
    createTikiTorch(14.6, 13);

    // Benches with a view
    createCourseBench(-20, 10, Math.PI / 2);   // facing east over the course
    createCourseBench(16.5, 9, 0);             // facing north toward the ship

    // A spare barrel by the path
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.8, 12), shipWoodBarrelMaterial());
    barrel.position.set(11.4, 0.42, 0.9);
    barrel.castShadow = true;
    courseGroup.add(barrel);
    collisionBoxes.push({
        box: new THREE.Box3(new THREE.Vector3(11, 0, 0.5), new THREE.Vector3(11.8, 1, 1.3)),
        type: 'decor'
    });
}

// ============================================
// THE FAMILY (Mom, Dad, and young Steve)
// ============================================
// The heart of the experience: the trio plays a four-station loop around the
// course (hole 1, hole 2, hole 5 on the ship, and the plank hole), taking
// turns at each tee. The pose math is pure (phase and time in, a pose out),
// the same pattern as the Zumba studio's dance engine, so the swing reads
// smoothly and the whole loop is unit-testable. The plank hole plays a fixed
// little story: Steve's first ball takes the swim, Dad rescues it with the
// skimmer, and the second putt rolls true.

const FAMILY_CASTS = [
    // Young Steve, ten years old: jeans and a tee shirt, scaled down to kid
    // size (createPerson has no scale knob, so the group is scaled after).
    {
        key: 'steve', shirt: 0xf2c14e, pants: 0x3d5a80, skin: 0xf0c8a0,
        hair: 0x3a2817, hairStyle: 'short', hasSkirt: false, glasses: false,
        scale: 0.7, ball: 0x3fa34d
    },
    // Mom: red shirt, blue jeans, a light jacket for the evening sea breeze,
    // long brown hair, and blue eyes.
    {
        key: 'mom', shirt: 0xc0392b, pants: 0x4a6d99, skin: 0xf0c8a0,
        hair: 0x6b4a2f, hairStyle: 'long', hasSkirt: false, glasses: false,
        jacket: 0xd9d5c9, eyes: 0x3f6fae,
        scale: 1.0, ball: 0x3d7bd9
    },
    // Dad: tee shirt and khaki shorts, glasses (the same wire frames he
    // always wore).
    {
        key: 'dad', shirt: 0x2f4e6e, pants: 0xb99d6b, skin: 0xf0c8a0,
        hair: 0x3a2817, hairStyle: 'short', hasSkirt: false, glasses: true,
        shorts: true,
        scale: 1.0, ball: 0xd94f3d
    }
];

/** Thin wire-frame glasses fitted to the shared person builder's face
 *  geometry (head center y 1.5, eyes at x ±0.035, z ~0.11). Trail recipe. */
function createGlasses() {
    const glasses = new THREE.Group();
    glasses.name = 'glasses';

    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.4, metalness: 0.7 });
    const eyeY = 1.52;
    const lensZ = 0.115;

    [-0.035, 0.035].forEach((offsetX) => {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0035, 6, 12), frameMaterial);
        rim.position.set(offsetX, eyeY, lensZ);
        glasses.add(rim);
    });

    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.022, 4), frameMaterial);
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, eyeY + 0.004, lensZ);
    glasses.add(bridge);

    [-1, 1].forEach((side) => {
        const temple = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.13, 4), frameMaterial);
        temple.rotation.x = Math.PI / 2;
        temple.position.set(side * 0.058, eyeY + 0.002, lensZ - 0.065);
        glasses.add(temple);
    });

    return glasses;
}

/** Turn the person builder's long trousers into summer shorts: the thigh
 *  keeps the pants material and the knee and shin below it go to skin. The
 *  leg groups are the untagged groups hinged at hip height (y 0.75); the arm
 *  groups are excluded by their isArm tag, and the shoe (y -0.77 within the
 *  leg) keeps its own material. Trail recipe (it made bike shorts there). */
function applyShorts(person, skinTone) {
    const skin = new THREE.MeshStandardMaterial({ color: skinTone, roughness: 0.8, metalness: 0.05 });
    person.children.forEach((group) => {
        if (!group.isGroup || group.userData.isArm) return;
        if (Math.abs(group.position.y - 0.75) > 0.02) return;
        group.children.forEach((part) => {
            // Knee (y -0.375) and shin (y -0.5625) turn to skin.
            if (part.isMesh && part.position.y < -0.3 && part.position.y > -0.7) {
                part.material = skin;
            }
        });
    });
}

/** A light open-front jacket worn over the shirt: back and side panels, two
 *  front panels leaving the shirt visible down the middle, a collar band,
 *  and sleeves over the upper arms. Fitted to the person builder's torso
 *  (a 0.38 x 0.55 x 0.22 box topping out at y 1.3) with the usual 1cm
 *  anti-z-fighting lip on every face. */
function addLightJacket(person, jacketColor) {
    const jacketMaterial = new THREE.MeshStandardMaterial({ color: jacketColor, roughness: 0.85, metalness: 0.0 });

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.5, 0.02), jacketMaterial);
    back.position.set(0, 1.03, -0.122);
    back.castShadow = true;
    person.add(back);

    [-1, 1].forEach((side) => {
        // Front panels, open down the middle so the shirt shows
        const front = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.48, 0.02), jacketMaterial);
        front.position.set(side * 0.115, 1.02, 0.122);
        front.castShadow = true;
        person.add(front);

        const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.25), jacketMaterial);
        sidePanel.position.set(side * 0.2, 1.03, 0);
        person.add(sidePanel);
    });

    // Collar band across the shoulders
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.24), jacketMaterial);
    collar.position.set(0, 1.285, 0);
    person.add(collar);

    // Sleeves over the upper arms, parented to the arm groups so they swing
    // with the putt
    person.children.forEach((group) => {
        if (!group.isGroup || !group.userData.isArm) return;
        const sleeve = new THREE.Mesh(
            new THREE.CylinderGeometry(0.056, 0.061, 0.28, 8),
            jacketMaterial
        );
        sleeve.position.y = -0.14;
        group.add(sleeve);
    });
}

/** A little putter, parented to the right arm so it swings with the pose. */
function createPutter() {
    const putter = new THREE.Group();
    putter.name = 'putter';

    const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.011, 0.62, 6),
        new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.4, metalness: 0.7 })
    );
    shaft.position.y = -0.31;
    putter.add(shaft);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.035), blackIron);
    head.position.set(0.03, -0.62, 0);
    putter.add(head);

    const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.12, 6),
        new THREE.MeshStandardMaterial({ color: 0x22201e, roughness: 0.95 })
    );
    grip.position.y = 0.02;
    putter.add(grip);

    return putter;
}

/** Cache the pose-able parts of a person group: the two arm groups (tagged
 *  isArm) and the two leg groups (the untagged groups hinged at y 0.75). */
function buildRig(person) {
    const rig = { group: person, armP: null, armN: null, legP: null, legN: null };
    person.children.forEach((group) => {
        if (!group.isGroup) return;
        if (group.userData.isArm) {
            if (group.position.x > 0) rig.armP = group; else rig.armN = group;
        } else if (Math.abs(group.position.y - 0.75) < 0.02) {
            if (group.position.x > 0) rig.legP = group; else rig.legN = group;
        }
    });
    return rig;
}

// ---- The pure pose engine ----

// Two-handed grip: each arm folds this far inward so the hands stack on the
// putter grip at the body's midline (the putter mount counter-rotates by the
// same angle, so the shaft hangs plumb at address).
const GRIP_FOLD = 0.3;
// How far the hands reach past the feet to the ball at address.
const PUTT_REACH = 0.34;

/** A neutral standing pose (also the base every phase starts from). */
function neutralGolfPose() {
    return {
        bounce: 0, sway: 0, lean: 0, yaw: 0,
        armP: { swing: 0.08, lift: 0.06 },
        armN: { swing: 0.08, lift: 0.06 },
        legP: 0, legN: 0
    };
}

/**
 * The pose for a golfer in a given phase at time t01 (0..1 within the
 * phase; 'idle' and 'walk' treat t01 as a repeating cycle instead). Pure:
 * phase and time in, pose out.
 */
export function puttPoseAt(phase, t01) {
    const pose = neutralGolfPose();
    const t = Math.max(0, t01);

    if (phase === 'walk') {
        const s = Math.sin(Math.PI * 2 * t);
        pose.legP = 0.5 * s;
        pose.legN = -0.5 * s;
        pose.armP.swing = 0.12 - 0.4 * s;
        pose.armN.swing = 0.12 + 0.4 * s;
        pose.armP.lift = 0.1;
        pose.armN.lift = 0.1;
        pose.bounce = 0.035 * Math.abs(s);
        pose.lean = 0.05;
    } else if (phase === 'aim') {
        // Side-on address: bowed over the ball, knees soft, both hands
        // folded inward and stacked on the grip (left hand on top, the way
        // a right-handed player holds a putter)
        pose.lean = 0.24;
        pose.armP.swing = 0.52;
        pose.armN.swing = 0.52;
        pose.armP.lift = -GRIP_FOLD;
        pose.armN.lift = -GRIP_FOLD;
        pose.legP = 0.03;
        pose.legN = -0.03;
    } else if (phase === 'swing') {
        // A two-handed pendulum stroke along the target line: both arms
        // rock together about the shoulders (their world rotations shift in
        // lockstep, so the hands never leave the grip), drawing back toward
        // the trail side, accelerating through the ball, and holding the
        // finish toward the hole.
        let stroke;
        if (t < 0.45) {
            stroke = -(t / 0.45) * 0.38;                       // draw back
        } else if (t < 0.68) {
            stroke = -0.38 + ((t - 0.45) / 0.23) * 0.88;       // through the ball
        } else {
            stroke = 0.5;                                       // hold the finish
        }
        pose.lean = 0.24 - Math.max(0, (t - 0.68)) * 0.2;
        pose.armP.swing = 0.52;
        pose.armN.swing = 0.52;
        pose.armP.lift = -GRIP_FOLD + stroke;
        pose.armN.lift = -GRIP_FOLD - stroke;
        pose.legP = 0.03;
        pose.legN = -0.03;
    } else if (phase === 'watch') {
        // Ball away: straighten up and track it
        pose.lean = 0.06;
        pose.armP.swing = 0.55;
        pose.armN.swing = 0.35;
        pose.armP.lift = 0.1;
        pose.armN.lift = 0.1;
    } else if (phase === 'react') {
        const up = Math.min(1, t * 2.5);
        pose.armP.lift = 2.3 * up;
        pose.armN.lift = 2.3 * up;
        pose.armP.swing = 0.15;
        pose.armN.swing = 0.15;
        pose.bounce = 0.05 * Math.abs(Math.sin(Math.PI * 2 * 1.5 * t));
    } else if (phase === 'skim') {
        // Leaning out over the rail, working the net
        const reach = Math.sin(Math.PI * Math.min(1, t)) * 0.15;
        pose.lean = 0.42 + reach;
        pose.armP.swing = 1.1 + reach;
        pose.armN.swing = 0.85;
        pose.armP.lift = 0.3;
        pose.armN.lift = 0.2;
        pose.legP = 0.08;
        pose.legN = -0.12;
    } else if (phase === 'celebrate') {
        const s = Math.abs(Math.sin(Math.PI * 2 * 2 * t));
        pose.armP.lift = 2.2 + 0.35 * Math.sin(Math.PI * 2 * 2 * t);
        pose.armN.lift = 2.2 - 0.35 * Math.sin(Math.PI * 2 * 2 * t);
        pose.armP.swing = 0.2;
        pose.armN.swing = 0.2;
        pose.bounce = 0.07 * s;
    } else {
        // idle: standing easy, a gentle breathing sway
        pose.armP.swing = 0.22;
        pose.armN.swing = 0.22;
        pose.armP.lift = 0.15;
        pose.armN.lift = 0.15;
        pose.sway = 0.025 * Math.sin(Math.PI * 2 * t);
        pose.bounce = 0.008 * (1 + Math.sin(Math.PI * 2 * t + 1));
    }

    return pose;
}

/** Write a pose onto a member's rig at their current spot. */
function applyGolfPose(member, pose) {
    const g = member.rig.group;
    g.position.x = member.x;
    g.position.z = member.z;
    g.position.y = member.groundY + pose.bounce * member.scale;
    g.rotation.y = member.rotY + pose.yaw;
    g.rotation.z = pose.sway;
    g.rotation.x = pose.lean;

    // Outward lift signs per the studio's hard-won correction: +z carries the
    // +X arm out to its own side, the -X arm mirrors with -z.
    if (member.rig.armP) {
        member.rig.armP.rotation.x = -pose.armP.swing;
        member.rig.armP.rotation.z = pose.armP.lift;
    }
    if (member.rig.armN) {
        member.rig.armN.rotation.x = -pose.armN.swing;
        member.rig.armN.rotation.z = -pose.armN.lift;
    }
    if (member.rig.legP) member.rig.legP.rotation.x = -pose.legP;
    if (member.rig.legN) member.rig.legN.rotation.x = -pose.legN;
}

// ---- Pure ball and path helpers ----

/** Total length of a polyline of {x,z} points. */
export function polylineLength(points) {
    let len = 0;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dz = points[i].z - points[i - 1].z;
        len += Math.sqrt(dx * dx + dz * dz);
    }
    return len;
}

/** The point (and travel heading) a given distance along a polyline. */
export function pointAlongPolyline(points, dist) {
    let remaining = Math.max(0, dist);
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dz = points[i].z - points[i - 1].z;
        const segLen = Math.sqrt(dx * dx + dz * dz);
        if (remaining <= segLen || i === points.length - 1) {
            const t = segLen > 0 ? Math.min(1, remaining / segLen) : 1;
            return {
                x: points[i - 1].x + dx * t,
                z: points[i - 1].z + dz * t,
                angle: Math.atan2(dx, dz)
            };
        }
        remaining -= segLen;
    }
    const last = points[points.length - 1];
    return { x: last.x, z: last.z, angle: 0 };
}

/** Ball position at eased progress t01 (0..1) along its path. Starts quick
 *  off the putter face and rolls out gently, like a real putt. */
export function ballPositionAt(path, t01) {
    const t = Math.min(1, Math.max(0, t01));
    const eased = 1 - (1 - t) * (1 - t);
    const total = polylineLength(path);
    const pt = pointAlongPolyline(path, eased * total);
    return { x: pt.x, z: pt.z };
}

// ---- The circuit ----

const WALK_SPEED = 1.15;      // m/s along the paths between stations
const FOLLOW_SPACING = 0.85;  // single-file gap, Steve up front

const DURATIONS = {
    aim: 1.3,
    swing: 0.85,
    react: 1.0,
    skim: 3.0,
    celebrate: 2.6
};

const STANDARD_TURNS = [
    { member: 'steve', kind: 'putt', ballDur: 1.8 },
    { member: 'mom', kind: 'putt', ballDur: 1.8 },
    { member: 'dad', kind: 'putt', ballDur: 1.8 }
];

// The plank hole's little story, in order: the splash, the rescue, the
// redemption, then the grown-ups make it look easy.
const PLANK_TURNS = [
    { member: 'steve', kind: 'splash', ballDur: 1.5 },
    { member: 'dad', kind: 'skim' },
    { member: 'steve', kind: 'putt', ballDur: 2.5 },
    { member: 'mom', kind: 'putt', ballDur: 2.5 },
    { member: 'dad', kind: 'putt', ballDur: 2.5 }
];

// Each station: where the active golfer stands (facing rotY), where the
// others wait, the ball's path to the cup, and the walk in from the previous
// station. Paths thread the gaps between hole borders, the gangplank, and
// the deck furniture; NPCs don't collide, so these routes are the whole
// steering system.
export const GOLF_CIRCUIT = [
    {
        key: 'hole1', baseY: 0,
        stand: { x: -16, z: 0.8 }, rotY: 0,
        waitSpots: [{ x: -17.5, z: 0.3 }, { x: -14.5, z: 0.1 }],
        ballPath: [{ x: -16, z: 1.5 }, { x: -16, z: 7.92 }],
        turns: STANDARD_TURNS,
        path: [
            { x: 21.4, z: 26.2 }, { x: 18.6, z: 25.6 }, { x: 16.4, z: 22.8 },
            { x: 16.2, z: 20.6 }, { x: 14.2, z: 20.6 }, { x: 14, z: 19.3 },
            { x: 14, z: 16.5 }, { x: 13.4, z: 13 }, { x: 11, z: 10.4 },
            { x: 6, z: 9.2 }, { x: 0, z: 8.6 }, { x: -6, z: 7.6 },
            { x: -11, z: 4.6 }, { x: -14.2, z: 1.8 }, { x: -16, z: 0.8 }
        ]
    },
    {
        key: 'hole2', baseY: 0,
        stand: { x: -11.4, z: 10 }, rotY: Math.PI / 2,
        waitSpots: [{ x: -12.3, z: 9 }, { x: -12, z: 11.2 }],
        ballPath: [{ x: -10, z: 10 }, { x: -4.08, z: 10 }],
        turns: STANDARD_TURNS,
        path: [
            { x: -17.6, z: 3 }, { x: -17.7, z: 8.8 }, { x: -15.6, z: 10.3 },
            { x: -13.4, z: 10.2 }, { x: -11.4, z: 10 }
        ]
    },
    {
        key: 'hole5', baseY: 0.02,
        stand: { x: 15, z: 20.6 }, rotY: 0,
        waitSpots: [{ x: 13.3, z: 21.3 }, { x: 16.6, z: 20.7 }],
        ballPath: [{ x: 15, z: 21.5 }, { x: 15, z: 26.42 }],
        turns: STANDARD_TURNS,
        path: [
            { x: -9.6, z: 9.2 }, { x: -6, z: 8.4 }, { x: -1, z: 9 },
            { x: 4, z: 9.4 }, { x: 9, z: 10 }, { x: 12, z: 12 },
            { x: 13.4, z: 14.5 }, { x: 14, z: 17 }, { x: 14, z: 19.4 },
            { x: 14.2, z: 20.6 }, { x: 15, z: 20.6 }
        ]
    },
    {
        key: 'plank', baseY: 0.02,
        stand: { x: 22, z: 24.75 }, rotY: 0,
        waitSpots: [{ x: 20.5, z: 24.4 }, { x: 23.5, z: 24.6 }],
        ballPath: [{ x: 22, z: 25.6 }, { x: 22, z: 29.2 }, { x: 22, z: 31.42 }],
        splashPath: [{ x: 22, z: 25.6 }, { x: 22, z: 29.35 }],
        splashSpot: { x: 22, z: 29.35 },
        skimSpot: { x: 23.1, z: 27.3 },
        turns: PLANK_TURNS,
        path: [
            { x: 15.4, z: 20.6 }, { x: 16.6, z: 20.6 }, { x: 16.9, z: 23.1 },
            { x: 18.7, z: 24.1 }, { x: 20.6, z: 24.4 }, { x: 22, z: 24.75 }
        ]
    }
];

// Precomputed path lengths (cached on the station objects on first use)
function stationPathLength(station) {
    if (station._len === undefined) station._len = polylineLength(station.path);
    return station._len;
}

/** The ball-phase duration for a turn (skim turns have no ball). */
function turnBallDuration(turn) {
    return turn.ballDur || 1.8;
}

/** The side-on mark for a right-handed putt: perpendicular to the target
 *  line with the hole to the golfer's left, the ball a hands' reach in
 *  front and a touch toward the lead foot. Cached per station. */
function puttingStance(station) {
    if (!station._stance) {
        const ball = station.ballPath[0];
        const next = station.ballPath[1];
        const travel = Math.atan2(next.x - ball.x, next.z - ball.z);
        const rotY = travel - Math.PI / 2;
        station._stance = {
            rotY,
            x: ball.x - Math.sin(rotY) * PUTT_REACH - Math.sin(travel) * 0.06,
            z: ball.z - Math.cos(rotY) * PUTT_REACH - Math.cos(travel) * 0.06
        };
    }
    return station._stance;
}

/**
 * Advance the group state machine by dt. Pure over (state, circuit): the
 * caller owns the state object, and the returned array lists the events
 * that fired ('arrive', 'ball-start', 'sink', 'splash', 'skim-done',
 * 'depart'). Time-driven throughout, so the loop can never wedge.
 */
export function advanceGolfState(state, dt, circuit = GOLF_CIRCUIT) {
    const events = [];
    const station = circuit[state.station];

    if (state.mode === 'walking') {
        state.dist += WALK_SPEED * dt;
        // Everyone is at the station once the leader has overshot far enough
        // for the last follower to close up
        if (state.dist >= stationPathLength(station) + FOLLOW_SPACING * 2 + 0.2) {
            state.mode = 'turn';
            state.turn = 0;
            state.phase = station.turns[0].kind === 'skim' ? 'skim' : 'aim';
            state.phaseT = 0;
            events.push('arrive');
        }
    } else if (state.mode === 'turn') {
        state.phaseT += dt;
        const turn = station.turns[state.turn];

        const nextTurn = () => {
            state.turn += 1;
            if (state.turn >= station.turns.length) {
                state.mode = 'celebrate';
                state.phaseT = 0;
            } else {
                state.phase = station.turns[state.turn].kind === 'skim' ? 'skim' : 'aim';
                state.phaseT = 0;
            }
        };

        if (state.phase === 'aim' && state.phaseT >= DURATIONS.aim) {
            state.phase = 'swing';
            state.phaseT = 0;
        } else if (state.phase === 'swing' && state.phaseT >= DURATIONS.swing) {
            state.phase = 'ball';
            state.phaseT = 0;
            events.push('ball-start');
        } else if (state.phase === 'ball' && state.phaseT >= turnBallDuration(turn)) {
            events.push(turn.kind === 'splash' ? 'splash' : 'sink');
            state.phase = 'react';
            state.phaseT = 0;
        } else if (state.phase === 'react' && state.phaseT >= DURATIONS.react) {
            nextTurn();
        } else if (state.phase === 'skim' && state.phaseT >= DURATIONS.skim) {
            events.push('skim-done');
            nextTurn();
        }
    } else if (state.mode === 'celebrate') {
        state.phaseT += dt;
        if (state.phaseT >= DURATIONS.celebrate) {
            state.mode = 'walking';
            state.station = (state.station + 1) % circuit.length;
            state.dist = 0;
            state.phaseT = 0;
            events.push('depart');
        }
    }

    return events;
}

// ---- The live system (members, balls, splash, per-frame update) ----

let familyMembers = [];    // [{ key, cast, rig, x, z, rotY, groundY, scale, ball }]
let famState = null;       // the state machine object advanceGolfState drives
let famPausedKey = null;   // golferKey frozen for a dialog, or null
let famPausePoint = null;  // where the visitor stood when they clicked
let famPosedStill = false; // reduced-motion: posed once, then left alone
let splashFX = null;       // { group, ring, drops, t }

function createSplashFX(x, waterY, z) {
    const group = new THREE.Group();
    group.name = 'splashFX';

    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.08, 0.3, 16),
        new THREE.MeshStandardMaterial({
            map: foamTexture, transparent: true, opacity: 0, roughness: 0.4, side: THREE.DoubleSide
        })
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    const drops = [];
    const dropMaterial = new THREE.MeshStandardMaterial({ color: 0xeaf6f8, roughness: 0.3, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 6; i++) {
        const drop = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), dropMaterial);
        drop.visible = false;
        const angle = (i / 6) * Math.PI * 2;
        drop.userData.vx = Math.cos(angle) * 0.55;
        drop.userData.vz = Math.sin(angle) * 0.55;
        drop.userData.vy = 1.6 + (i % 3) * 0.3;
        group.add(drop);
        drops.push(drop);
    }

    group.position.set(x, waterY + 0.02, z);
    courseGroup.add(group);
    splashFX = { group, ring, drops, t: -1 };
}

function triggerSplash() {
    if (!splashFX || _reducedMotion.matches) return;
    splashFX.t = 0;
    splashFX.drops.forEach((drop) => {
        drop.visible = true;
        drop.position.set(0, 0, 0);
    });
    playSplashSound();
}

function updateSplashFX(dt) {
    if (!splashFX || splashFX.t < 0) return;
    splashFX.t += dt;
    const t = splashFX.t;
    const life = 0.85;
    if (t >= life) {
        splashFX.t = -1;
        splashFX.ring.material.opacity = 0;
        splashFX.drops.forEach((drop) => { drop.visible = false; });
        return;
    }
    const k = t / life;
    splashFX.ring.scale.setScalar(1 + k * 3.2);
    splashFX.ring.material.opacity = 0.75 * (1 - k);
    splashFX.drops.forEach((drop) => {
        drop.position.x = drop.userData.vx * t;
        drop.position.z = drop.userData.vz * t;
        drop.position.y = drop.userData.vy * t - 4.4 * t * t;
        drop.material.opacity = 0.9 * (1 - k);
    });
}

function buildGolfer(cast) {
    const person = createPerson({
        role: 'customer',
        x: 0,
        z: 0,
        rotationY: 0,
        shirtColor: cast.shirt,
        pantsColor: cast.pants,
        skinTone: cast.skin,
        hairColor: cast.hair,
        hairStyle: cast.hairStyle,
        hasSkirt: cast.hasSkirt,
        hasApron: false,
        bald: false,
        muscular: false,
        dressShirt: false
    });
    person.userData.isGolfer = true;
    person.userData.golferKey = cast.key;

    if (cast.glasses) person.add(createGlasses());
    if (cast.shorts) applyShorts(person, cast.skin);
    if (cast.jacket) addLightJacket(person, cast.jacket);
    if (cast.eyes) {
        // Recolor the tagged pupils (the material is per person, so this
        // only touches this member's eyes)
        person.traverse((child) => {
            if (child.userData && child.userData.isPupil) {
                child.material.color.setHex(cast.eyes);
            }
        });
    }

    // Kid sizing: uniform scale plus the matching ground offset (shoe bottoms
    // sit at local y -0.05, so the builder's 0.055 lift scales with the body)
    person.scale.setScalar(cast.scale);

    const rig = buildRig(person);
    if (rig.armP) {
        const putter = createPutter();
        putter.position.set(0.02, -0.52, 0.04);
        putter.rotation.x = 0.15;
        putter.rotation.z = GRIP_FOLD;   // undo the grip fold: shaft hangs plumb
        rig.armP.add(putter);
    }

    return { person, rig };
}

function createFamilyGolfers() {
    familyMembers = [];

    const peopleGroup = new THREE.Group();
    peopleGroup.name = 'familyGolfers';

    const station = GOLF_CIRCUIT[0];
    const spots = [station.stand, station.waitSpots[0], station.waitSpots[1]];

    FAMILY_CASTS.forEach((cast, i) => {
        const { person, rig } = buildGolfer(cast);
        const spot = spots[i] || station.stand;
        const member = {
            key: cast.key,
            cast,
            rig,
            x: spot.x,
            z: spot.z,
            rotY: station.rotY,
            groundY: 0.055 * cast.scale,
            scale: cast.scale,
            idleSeed: i * 2.1,
            ball: null
        };
        peopleGroup.add(person);

        // Their ball, waiting by the tee (shown during their turn)
        const ball = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 10, 8),
            new THREE.MeshStandardMaterial({ color: cast.ball, roughness: 0.35 })
        );
        ball.castShadow = true;
        ball.visible = false;
        peopleGroup.add(ball);
        member.ball = ball;

        familyMembers.push(member);
        applyGolfPose(member, puttPoseAt('idle', 0));
    });

    courseGroup.add(peopleGroup);

    // Playing starts at the first hole, mid-turn, so visitors spawning at the
    // entrance see the family in action right away.
    famState = { mode: 'turn', station: 0, dist: 0, turn: 0, phase: 'aim', phaseT: 0 };
}

function memberByKey(key) {
    return familyMembers.find((m) => m.key === key) || null;
}

/** Wrap an angle to (-PI, PI] so easing turns the short way around. */
function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

/** Where each member should be right now, given the state machine. Returns
 *  [{ member, x, z, rotY, phase, phaseT01 }]. */
function computeMemberTargets(elapsed) {
    const station = GOLF_CIRCUIT[famState.station];
    const targets = [];

    if (famState.mode === 'walking') {
        const len = stationPathLength(station);
        familyMembers.forEach((member, i) => {
            const d = Math.min(len, Math.max(0, famState.dist - i * FOLLOW_SPACING));
            const pt = pointAlongPolyline(station.path, d);
            const atEnd = d >= len - 0.01;
            targets.push({
                member,
                x: pt.x, z: pt.z,
                rotY: atEnd ? station.rotY : pt.angle,
                phase: atEnd ? 'idle' : 'walk',
                phaseT01: atEnd ? (elapsed * 0.35 + member.idleSeed) % 1 : (d / 0.8) % 1
            });
        });
        return targets;
    }

    if (famState.mode === 'celebrate') {
        const offsets = [{ x: 0, z: -0.2 }, { x: -1, z: -0.5 }, { x: 1, z: -0.6 }];
        familyMembers.forEach((member, i) => {
            targets.push({
                member,
                x: station.stand.x + offsets[i].x,
                z: station.stand.z + offsets[i].z,
                rotY: station.rotY,
                phase: 'celebrate',
                phaseT01: (famState.phaseT / DURATIONS.celebrate + member.idleSeed) % 1
            });
        });
        return targets;
    }

    // mode 'turn'
    const turn = station.turns[famState.turn];
    const activeKey = turn.member;
    let waitIdx = 0;

    familyMembers.forEach((member) => {
        if (member.key === activeKey) {
            if (turn.kind === 'skim') {
                targets.push({
                    member,
                    x: station.skimSpot.x, z: station.skimSpot.z,
                    rotY: Math.atan2(station.splashSpot.x - station.skimSpot.x, station.splashSpot.z - station.skimSpot.z),
                    phase: 'skim',
                    phaseT01: famState.phaseT / DURATIONS.skim
                });
            } else {
                const phase = famState.phase === 'ball' ? 'watch' : famState.phase;
                const dur = famState.phase === 'aim' ? DURATIONS.aim
                    : famState.phase === 'swing' ? DURATIONS.swing
                        : famState.phase === 'react' ? DURATIONS.react
                            : turnBallDuration(turn);
                // Step up to the ball side-on for the address and the
                // stroke, then turn from the same spot to watch it roll.
                const stance = puttingStance(station);
                targets.push({
                    member,
                    x: stance.x, z: stance.z,
                    rotY: (phase === 'aim' || phase === 'swing') ? stance.rotY : station.rotY,
                    phase,
                    phaseT01: Math.min(1, famState.phaseT / dur)
                });
            }
        } else {
            const spot = station.waitSpots[waitIdx++] || station.waitSpots[0];
            targets.push({
                member,
                x: spot.x, z: spot.z,
                rotY: Math.atan2(station.stand.x - spot.x, station.stand.z - spot.z),
                phase: 'idle',
                phaseT01: (elapsed * 0.35 + member.idleSeed) % 1
            });
        }
    });
    return targets;
}

let famElapsed = 0;

/**
 * Advance the family each frame: the state machine ticks, members ease
 * toward their marks, poses and the active ball follow. Driven from the
 * render loop in main.js. Reduced-motion visitors get the family standing
 * easy at the first hole instead of the loop.
 */
export function updateFamilyGolfers(playerPosition, deltaTime) {
    if (!famState || familyMembers.length === 0) return;

    if (_reducedMotion.matches) {
        if (!famPosedStill) {
            famPosedStill = true;
            familyMembers.forEach((member) => {
                applyGolfPose(member, puttPoseAt('idle', 0.25));
            });
        }
        return;
    }

    famElapsed += deltaTime;
    updateSplashFX(deltaTime);
    updateBackgroundGolfers(deltaTime);

    // A dialog freezes the whole round (the family waits politely). The
    // clicked member turns to face the visitor; the others hold their pose.
    if (famPausedKey) {
        const paused = memberByKey(famPausedKey);
        if (paused && famPausePoint) {
            const facing = Math.atan2(famPausePoint.x - paused.x, famPausePoint.z - paused.z);
            paused.rotY += wrapAngle(facing - paused.rotY) * Math.min(1, deltaTime * 6);
            applyGolfPose(paused, puttPoseAt('idle', (famElapsed * 0.35) % 1));
        }
        return;
    }

    const station = GOLF_CIRCUIT[famState.station];
    const events = advanceGolfState(famState, deltaTime);
    events.forEach((event) => {
        if (event === 'splash') triggerSplash();
        if (event === 'depart') {
            familyMembers.forEach((member) => { member.ball.visible = false; });
        }
    });

    // Ease everyone toward their marks and pose them
    const k = 1 - Math.exp(-6 * deltaTime);
    computeMemberTargets(famElapsed).forEach((target) => {
        const member = target.member;
        member.x += (target.x - member.x) * k;
        member.z += (target.z - member.z) * k;
        member.rotY += wrapAngle(target.rotY - member.rotY) * k;

        // Anyone still sliding to their mark reads as walking, not gliding
        const slide = Math.abs(target.x - member.x) + Math.abs(target.z - member.z);
        const phase = (slide > 0.35 && target.phase !== 'walk') ? 'walk' : target.phase;
        const t01 = phase === 'walk' && target.phase !== 'walk'
            ? (famElapsed * 1.6 + member.idleSeed) % 1
            : target.phaseT01;
        applyGolfPose(member, puttPoseAt(phase, t01));
    });

    // The active ball: on the tee through the aim and swing, rolling during
    // the ball phase, gone once it drops (or swims)
    if (famState.mode === 'turn') {
        const turn = station.turns[famState.turn];
        const active = memberByKey(turn.member);
        if (active && turn.kind !== 'skim') {
            const ball = active.ball;
            const ballY = (station.baseY || 0) + 0.06;
            const path = turn.kind === 'splash' ? station.splashPath : station.ballPath;
            if (famState.phase === 'aim' || famState.phase === 'swing') {
                ball.visible = true;
                ball.position.set(path[0].x, ballY, path[0].z);
            } else if (famState.phase === 'ball') {
                const t = Math.min(1, famState.phaseT / turnBallDuration(turn));
                const pos = ballPositionAt(path, t);
                ball.visible = true;
                ball.position.set(pos.x, ballY, pos.z);
                ball.rotation.x += deltaTime * 8;
                if (turn.kind === 'splash' && t > 0.86) {
                    // The teeter and the drop: the ball tips off the plank edge
                    const fall = (t - 0.86) / 0.14;
                    ball.position.y = ballY - fall * fall * (ballY - LAYOUT.lagoon.waterY);
                } else if (turn.kind === 'putt' && t > 0.94) {
                    // Sinking into the cup
                    ball.position.y = ballY - ((t - 0.94) / 0.06) * 0.08;
                }
            } else if (famState.phase === 'react') {
                ball.visible = false;
            }
        }
    }
}

// ---- Family interaction API (main.js) ----

/** Root groups for raycast targeting (click a family member to say hi). */
export function getFamilyMeshes() {
    return familyMembers.map((m) => m.rig.group);
}

/** Freeze the round while a family member's dialog is open. */
export function pauseGolferForDialog(rootGroup, playerPosition) {
    const member = familyMembers.find((m) => m.rig.group === rootGroup);
    if (!member) return;
    famPausedKey = member.key;
    famPausePoint = playerPosition
        ? { x: playerPosition.x, z: playerPosition.z }
        : null;
}

/** Dialog closed: play on. */
export function resumeGolferFromDialog() {
    famPausedKey = null;
    famPausePoint = null;
}

// ============================================
// BACKGROUND GOLFERS (desktop only)
// ============================================
// A pair of players on the far hole so the course doesn't feel rented out.
// One putts on a lazy cycle, the other watches. Skipped on mobile: two more
// rigged people aren't worth the frames there.

let bgGolfers = [];
let bgPaused = false;
let bgElapsed = 0;

function createBackgroundGolfers() {
    bgGolfers = [];
    if (isMobileDevice()) return;
    if (!(FAMILY_CONFIG.backgroundGolfers && FAMILY_CONFIG.backgroundGolfers.enabled)) return;

    const { bgHole } = LAYOUT;
    const casts = [
        // The putter stands side-on to his eastward line (rotY 0 faces +Z,
        // hole to his left), a hands' reach south of his imagined ball.
        { shirt: 0x67b8b0, pants: 0x8a92a2, skin: 0xc68642, hair: 0x2c1810, hairStyle: 'short', hasSkirt: false, x: bgHole.teeX - 0.7, z: bgHole.z - 0.34, rotY: 0, putts: true },
        { shirt: 0xc9805e, pants: 0xe8e2d2, skin: 0xffdbac, hair: 0x704214, hairStyle: 'long', hasSkirt: true, x: bgHole.teeX - 1.4, z: bgHole.z + 1.5, rotY: 2.5, putts: false }
    ];

    casts.forEach((cast, i) => {
        const person = createPerson({
            role: 'customer',
            x: cast.x,
            z: cast.z,
            rotationY: cast.rotY,
            shirtColor: cast.shirt,
            pantsColor: cast.pants,
            skinTone: cast.skin,
            hairColor: cast.hair,
            hairStyle: cast.hairStyle,
            hasSkirt: cast.hasSkirt,
            dressShirt: false
        });
        person.userData.isBgGolfer = true;
        const rig = buildRig(person);
        if (cast.putts && rig.armP) {
            const putter = createPutter();
            putter.position.set(0.02, -0.52, 0.04);
            putter.rotation.z = GRIP_FOLD;   // undo the grip fold: shaft hangs plumb
            rig.armP.add(putter);
        }
        courseGroup.add(person);
        bgGolfers.push({
            rig,
            x: cast.x, z: cast.z, rotY: cast.rotY,
            groundY: 0.055, scale: 1,
            putts: cast.putts, seed: i * 2.7
        });
    });
}

function updateBackgroundGolfers(deltaTime) {
    if (bgGolfers.length === 0 || bgPaused) return;
    bgElapsed += deltaTime;

    bgGolfers.forEach((golfer) => {
        let phase = 'idle';
        let t01 = (bgElapsed * 0.3 + golfer.seed) % 1;
        if (golfer.putts) {
            // A lazy 7 second cycle: line it up, stroke it, admire it
            const cycle = (bgElapsed + golfer.seed) % 7;
            if (cycle < 1.4) { phase = 'aim'; t01 = cycle / 1.4; }
            else if (cycle < 2.25) { phase = 'swing'; t01 = (cycle - 1.4) / 0.85; }
            else if (cycle < 4) { phase = 'watch'; t01 = (cycle - 2.25) / 1.75; }
        }
        applyGolfPose(golfer, puttPoseAt(phase, t01));
    });
}

/** Root groups for raycast targeting. */
export function getBackgroundGolferMeshes() {
    return bgGolfers.map((g) => g.rig.group);
}

export function pauseBackgroundGolferForDialog(rootGroup, playerPosition) {
    bgPaused = true;
    const golfer = bgGolfers.find((g) => g.rig.group === rootGroup);
    if (golfer && playerPosition) {
        golfer.rotY = Math.atan2(playerPosition.x - golfer.x, playerPosition.z - golfer.z);
        applyGolfPose(golfer, puttPoseAt('idle', 0.2));
    }
}

export function resumeBackgroundGolferFromDialog() {
    bgPaused = false;
}

// ============================================
// DISCOVERY ZONES
// ============================================
// main.js checks these on a throttle to auto-mark the walk-the-plank and
// board-the-ship discoveries from the player's position alone.

/** True while the visitor is out on the plank (over the water). */
export function isOnPlank(position) {
    const { plank } = LAYOUT;
    return Math.abs(position.x - plank.x) < plank.width / 2 + 0.3 &&
        position.z > plank.minZ && position.z < plank.maxZ;
}

/** True while the visitor is aboard the ship's deck. */
export function isOnShipDeck(position) {
    const { ship } = LAYOUT;
    return position.x > ship.minX + 0.2 && position.x < ship.maxX - 0.2 &&
        position.z > ship.minZ + 0.2 && position.z < ship.maxZ - 0.2;
}

// ============================================
// THE OCEAN (WebAudio ambience, click-to-listen)
// ============================================
// Hold the conch shell to your ear and the beach two blocks east comes to
// you: looping surf swells, a foam hiss chasing each wave, and the
// occasional gull. Synthesized on the fly (no audio files, nothing
// downloaded), started only ever by a click on the conch, and stopped the
// same way. The keep-alive element and interruption handling follow the
// studio experience's music player, which learned the iOS lessons the hard
// way.

const ocean = {
    ctx: null,
    master: null,
    noiseBuffer: null,
    surfGain: null,
    hissGain: null,
    playing: false,
    elapsed: 0,
    nextGullAt: 0
};

// iOS quirk: plain WebAudio runs in the "ambient" audio session, and the
// phone's ring/silent hardware switch mutes that session outright. Any
// playing HTML <audio> element promotes the session to "playback", the
// category the switch does not silence. So while the ocean runs we loop an
// inaudible wav through a hidden element. Everywhere else it is a no-op.
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

function ensureOceanContext() {
    if (ocean.ctx) return ocean.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ocean.ctx = new Ctx();

    // iOS suspends the context when the visitor leaves the tab or takes a
    // call, and Safari parks it in a nonstandard 'interrupted' state that
    // never resumes itself. Nudge it back whenever the tab returns while
    // the ocean is meant to be on.
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && ocean.playing && ocean.ctx && ocean.ctx.state !== 'running') {
            ocean.ctx.resume().catch(() => {});
        }
    });

    ocean.master = ocean.ctx.createGain();
    ocean.master.gain.value = 0;
    ocean.master.connect(ocean.ctx.destination);

    // Two seconds of white noise, shared by the surf and the hiss
    const rate = ocean.ctx.sampleRate;
    ocean.noiseBuffer = ocean.ctx.createBuffer(1, Math.floor(rate * 2), rate);
    const data = ocean.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // The surf bed: deep filtered noise whose gain swells like waves arriving
    const surfSrc = ocean.ctx.createBufferSource();
    surfSrc.buffer = ocean.noiseBuffer;
    surfSrc.loop = true;
    const surfFilter = ocean.ctx.createBiquadFilter();
    surfFilter.type = 'lowpass';
    surfFilter.frequency.value = 480;
    ocean.surfGain = ocean.ctx.createGain();
    ocean.surfGain.gain.value = 0.1;
    surfSrc.connect(surfFilter).connect(ocean.surfGain).connect(ocean.master);
    surfSrc.start();

    // The foam wash: a brighter hiss that peaks just after each swell
    const hissSrc = ocean.ctx.createBufferSource();
    hissSrc.buffer = ocean.noiseBuffer;
    hissSrc.loop = true;
    const hissFilter = ocean.ctx.createBiquadFilter();
    hissFilter.type = 'highpass';
    hissFilter.frequency.value = 2600;
    ocean.hissGain = ocean.ctx.createGain();
    ocean.hissGain.gain.value = 0.02;
    hissSrc.connect(hissFilter).connect(ocean.hissGain).connect(ocean.master);
    hissSrc.start();

    return ocean.ctx;
}

/** A gull, somewhere overhead: two or three descending cries, panned. */
function playGull() {
    const ctx = ocean.ctx;
    if (!ctx) return;
    const cries = 2 + Math.floor(Math.random() * 2);
    const basePan = (Math.random() - 0.5) * 1.4;
    for (let i = 0; i < cries; i++) {
        const t = ctx.currentTime + 0.05 + i * 0.3;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const f = 1450 - i * 120;
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 0.66, t + 0.24);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.09, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
        let out = gain;
        if (ctx.createStereoPanner) {
            const pan = ctx.createStereoPanner();
            pan.pan.value = Math.max(-1, Math.min(1, basePan + (Math.random() - 0.5) * 0.2));
            gain.connect(pan);
            out = pan;
        }
        osc.connect(gain);
        out.connect(ocean.master);
        osc.start(t);
        osc.stop(t + 0.3);
    }
}

/** A soft plop when Steve's ball finds the water (only if the ocean is on:
 *  the splash is visual first and audio only ever by invitation). */
function playSplashSound() {
    if (!ocean.playing || !ocean.ctx) return;
    const ctx = ocean.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = ocean.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.25);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(filter).connect(gain).connect(ocean.master);
    src.start(t);
    src.stop(t + 0.32);
}

/** Light the conch up softly while the ocean plays. */
function setConchGlow(on) {
    if (!conchMaterial) return;
    conchMaterial.emissive.setHex(on ? 0xff9a7a : 0x000000);
    conchMaterial.emissiveIntensity = on ? 0.6 : 1;
}

/** Toggle the ocean. Must be called from a user gesture (it is: the click on
 *  the conch shell). Returns whether the ocean is now playing. */
export function toggleOceanAudio() {
    if (ocean.playing) {
        ocean.playing = false;
        if (ocean.master && ocean.ctx) {
            ocean.master.gain.cancelScheduledValues(ocean.ctx.currentTime);
            ocean.master.gain.setValueAtTime(ocean.master.gain.value, ocean.ctx.currentTime);
            ocean.master.gain.linearRampToValueAtTime(0, ocean.ctx.currentTime + 0.4);
        }
        stopSilentKeepAlive();
        setConchGlow(false);
        return false;
    }

    const ctx = ensureOceanContext();
    if (!ctx) return false;   // no WebAudio here; the course stays peaceful
    if (ctx.state !== 'running') {
        ctx.resume().catch(() => {});
    }
    // Still inside the click/tap gesture here, which is the only place iOS
    // allows a media element to start.
    startSilentKeepAlive();
    ocean.master.gain.cancelScheduledValues(ctx.currentTime);
    ocean.master.gain.setValueAtTime(0, ctx.currentTime);
    ocean.master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.8);
    ocean.playing = true;
    ocean.nextGullAt = ocean.elapsed + 2.5;
    setConchGlow(true);
    return true;
}

export function isOceanAudioOn() {
    return ocean.playing;
}

/** Shape the surf each frame and keep the gulls coming. Cheap early-return
 *  when the ocean is off. Driven from the render loop in main.js. */
export function updateOceanAudio(deltaTime) {
    if (!ocean.playing || !ocean.ctx) return;
    ocean.elapsed += deltaTime;
    const e = ocean.elapsed;

    // Two offset swell periods so waves arrive irregularly, like the real
    // ocean and unlike a metronome
    const swell = Math.sin(Math.PI * 2 * e / 9.2) + 0.6 * Math.sin(Math.PI * 2 * e / 13.7 + 1.3);
    ocean.surfGain.gain.value = 0.1 + 0.075 * Math.max(0, swell);
    // The foam wash peaks a beat after the swell
    const wash = Math.sin(Math.PI * 2 * (e - 1.1) / 9.2);
    ocean.hissGain.gain.value = 0.018 + 0.03 * Math.max(0, wash);

    if (e >= ocean.nextGullAt) {
        playGull();
        ocean.nextGullAt = e + 6 + Math.random() * 9;
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
 * Get the course root group
 */
export function getStoreGroup() {
    return courseGroup;
}

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = {
    puttPoseAt, puttingStance, ballPositionAt, advanceGolfState,
    polylineLength, pointAlongPolyline,
    GOLF_CIRCUIT, LAYOUT, DURATIONS,
    STANDARD_TURNS, PLANK_TURNS,
    isOnPlank, isOnShipDeck
};
