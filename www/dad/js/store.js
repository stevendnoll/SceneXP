// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * store.js - NCR Trail Environment Construction (Phase 6)
 *
 * Builds the memorial trail world: a crushed-gravel rail trail running
 * east-west through Maryland woods, the old Northern Central Railroad
 * tracks alongside, and the Gunpowder River with a small waterfall on the
 * other side. Dad stands beside his hybrid bike as the greeter, and a few
 * of his riding friends pass by on the trail.
 *
 * The module keeps the store.js name and its main exports (initStore,
 * STORE_CONFIG, getStoreCollisionBoxes, ...) so the conductor in main.js
 * keeps its stable import block, same as the tire and realtor experiences.
 */

import { getScene } from '../../shared/js/scene-1.0.0.min.js';
import {
    initWorld, getColliders, registerOutdoorProp, getOutdoorPropMeshes, isMobileDevice
} from '../../shared/js/world-1.0.0.min.js';
import { DAD_CONFIG } from './config.min.js';
import { createPerson, shuffled, pickBalanced } from '../../shared/js/people-1.0.0.min.js';
import { createBackgroundScenery } from '../../shared/js/scenery-1.0.0.min.js';
import { registerHost, setHelpSign, createHelpSign, getVisitorMeshes } from '../../shared/js/npcs-1.0.0.min.js';

// Re-exports: main.js keeps importing these from store.min.js (stable import
// block); the implementations live in the shared parts library. The interior
// lighting, doors, and sidewalk-pedestrian re-exports from the tire theme are
// gone: there is no interior and the riders below replace the pedestrians.
export { updateBackgroundAnimations } from '../../shared/js/scenery-1.0.0.min.js';
export {
    setWanderWaypoints as setGalleryWaypoints, initGalleryVisitors,
    findClearSpawn, pauseCustomerForDialog, resumeCustomerFromDialog,
    updateStorePeople, updateCheckoutSign, getGalleryHost, getHelpSign
} from '../../shared/js/npcs-1.0.0.min.js';
export { getVisitorMeshes };

// The "building" here is only the greeter's can-see-you rectangle (see
// config.js). Re-exported under the legacy name so main.js keeps importing
// STORE_CONFIG from this module unchanged.
export const STORE_CONFIG = DAD_CONFIG.building;

// Outdoor props register with the shared world context; main.js still imports
// the getter from this module.
export { getOutdoorPropMeshes };

// World mesh groups
let trailGroup = null;
let collisionBoxes = [];

// Visitors who ask for reduced motion get still water (no flow scroll, no
// foam pulse), matching the reduced-motion handling of the sky in scene.js.
const _reducedMotion = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

// ============================================
// LAYOUT
// ============================================
// The trail runs along the X axis. North (negative Z) holds the old railroad
// and deep woods; south (positive Z) holds the grass shoulder where Dad
// stands, then the split-rail fence, the bank, the river, and the far woods.
const LAYOUT = {
    groundLength: 140,     // visual extent along X
    trailWidth: 4,         // crushed gravel surface
    trailZ: 0,             // trail centerline
    railsZ: -6,            // old railroad centerline
    railsSpan: 110,        // rails/ballast length along X
    fenceZ: 8.5,           // split-rail fence line above the bank
    bankTopZ: 9,           // grass ends, slope begins
    riverNearZ: 11,        // water plane, near edge
    riverFarZ: 21,         // water plane, far edge
    farBankZ: 23,          // far slope tops out, far woods begin
    upperWaterY: -0.45,    // water level upstream of the falls
    lowerWaterY: -1.05,    // water level below the falls
    fallsX: 18             // the little waterfall ledge
};

// ============================================
// TEXTURES (procedural, canvas-based)
// ============================================
let grassTexture = null;
let gravelTexture = null;
let waterTexture = null;
let foamTexture = null;
let fallsStripTexture = null;
let frothTexture = null;

function makeCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
}

/** Meadow grass: layered greens with light blade speckle. */
function createGrassTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#4a7c3a';
    ctx.fillRect(0, 0, 256, 256);

    // Mottled patches so large planes don't read as one flat color
    for (let i = 0; i < 60; i++) {
        const shade = ['#41702f', '#528a41', '#3d6b32', '#5c9448'][i % 4];
        ctx.fillStyle = shade;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(Math.random() * 256, Math.random() * 256, 12 + Math.random() * 30, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Fine blade speckle
    for (let i = 0; i < 900; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#5e9a4a' : '#3a6530';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 2.5);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(22, 10);
    return texture;
}

/** Crushed limestone gravel, the NCR trail's pale surface. */
function createGravelTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#c9c2b4';
    ctx.fillRect(0, 0, 256, 256);

    // Aggregate speckle (same recipe family as the shared concrete texture)
    for (let i = 0; i < 2400; i++) {
        const tone = ['#b5ad9d', '#d8d2c5', '#a99f8e', '#e2ddd2', '#948b7b'][i % 5];
        ctx.fillStyle = tone;
        const s = 1 + Math.random() * 2.5;
        ctx.fillRect(Math.random() * 256, Math.random() * 256, s, s);
    }

    // A few faint tire lines worn along the length (the canvas X axis maps
    // to the trail's long axis)
    ctx.strokeStyle = 'rgba(150, 142, 128, 0.35)';
    ctx.lineWidth = 7;
    [88, 168].forEach((y) => {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(64, y - 4, 192, y + 4, 256, y);
        ctx.stroke();
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(26, 1);
    return texture;
}

/** Blue river water with lighter current streaks. */
function createWaterTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#3b6d8f';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 26; i++) {
        ctx.strokeStyle = ['rgba(130,175,205,0.30)', 'rgba(55,100,130,0.35)', 'rgba(185,215,235,0.18)'][i % 3];
        ctx.lineWidth = 2 + Math.random() * 5;
        const y = Math.random() * 256;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(80, y + (Math.random() - 0.5) * 26, 176, y + (Math.random() - 0.5) * 26, 256, y);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(14, 2);
    return texture;
}

/** White water for the falls face and foam patches. */
function createFoamTexture() {
    const canvas = makeCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(235, 244, 246, 0.9)';
    ctx.fillRect(0, 0, 128, 128);

    // Vertical streaks (the canvas Y axis maps to the falling direction)
    for (let i = 0; i < 90; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.85)' : 'rgba(190,215,220,0.6)';
        ctx.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 3, 10 + Math.random() * 22);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 1);
    return texture;
}

/** A single falls chute: the foam streaks with feathered transparent side
 *  edges, so a strip of falling water fades out softly at its sides instead
 *  of ending in a hard vertical line. Repeats vertically for the scroll. */
function createFallsStripTexture() {
    const canvas = makeCanvas(64, 128);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(235, 244, 246, 0.9)';
    ctx.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 55; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.85)' : 'rgba(190,215,220,0.6)';
        ctx.fillRect(Math.random() * 64, Math.random() * 128, 2 + Math.random() * 3, 10 + Math.random() * 22);
    }

    // Feather the sides to nothing
    const feather = ctx.createLinearGradient(0, 0, 64, 0);
    feather.addColorStop(0, 'rgba(255,255,255,0)');
    feather.addColorStop(0.28, 'rgba(255,255,255,1)');
    feather.addColorStop(0.72, 'rgba(255,255,255,1)');
    feather.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = feather;
    ctx.fillRect(0, 0, 64, 128);
    ctx.globalCompositeOperation = 'source-over';

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapT = THREE.RepeatWrapping;   // vertical scroll only; the sides stay feathered
    return texture;
}

/** Bubbly froth on a transparent field: soft white bubbles clustered toward
 *  the center, fading to nothing at the edges, so a froth patch shows a
 *  wavy rounded silhouette instead of its rectangle. */
function createFrothTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);

    for (let i = 0; i < 110; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 100;
        const x = 128 + Math.cos(angle) * dist;
        const y = 128 + Math.sin(angle) * dist * 0.85;
        const radius = 5 + Math.random() * 15;
        const alpha = 0.45 + Math.random() * 0.45;
        const bubble = ctx.createRadialGradient(x, y, 0, x, y, radius);
        bubble.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        bubble.addColorStop(0.65, `rgba(240, 248, 250, ${alpha * 0.5})`);
        bubble.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = bubble;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    return new THREE.CanvasTexture(canvas);
}

function createTextures() {
    grassTexture = createGrassTexture();
    gravelTexture = createGravelTexture();
    waterTexture = createWaterTexture();
    foamTexture = createFoamTexture();
    fallsStripTexture = createFallsStripTexture();
    frothTexture = createFrothTexture();
}

// ============================================
// SHARED MATERIALS
// ============================================
// Vegetation materials are file-scoped so the woods builders (lifted from the
// tire theme's far-side landscaping) can be reused anywhere in the scene.
const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9, metalness: 0.0 });
const darkGreenFoliage = new THREE.MeshStandardMaterial({ color: 0x1a472a, roughness: 0.8, metalness: 0.0 });
const mediumGreenFoliage = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8, metalness: 0.0 });
const lightGreenFoliage = new THREE.MeshStandardMaterial({ color: 0x4a7c23, roughness: 0.8, metalness: 0.0 });
const bushMaterial = new THREE.MeshStandardMaterial({ color: 0x355e3b, roughness: 0.85, metalness: 0.0 });
const weatheredWood = new THREE.MeshStandardMaterial({ color: 0x9c7b52, roughness: 0.9, metalness: 0.0 });
const darkWood = new THREE.MeshStandardMaterial({ color: 0x6b4f33, roughness: 0.85, metalness: 0.05 });
const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x7d7a72, roughness: 0.95, metalness: 0.0 });
const wetRockMaterial = new THREE.MeshStandardMaterial({ color: 0x5c5a54, roughness: 0.6, metalness: 0.05 });

/**
 * Initialize the trail world
 */
export function initStore() {
    const scene = getScene();
    if (!scene) {
        return;
    }

    // The shared world context owns the root group, the collider registry, and
    // the outdoor-prop registry. Local aliases keep every builder below (and
    // the direct collisionBoxes.push sites) working unchanged.
    trailGroup = initWorld(DAD_CONFIG);
    collisionBoxes = getColliders();

    createTextures();

    createTerrain();          // grass, the gravel trail, the overlook spur
    createRiver();            // banks, water, rocks, the little waterfall
    createRailroad();         // ballast, ties, and the two old rails
    createWoods();            // trees and bushes on both sides of the valley
    createTrailFurniture();   // benches, split-rail fences, kiosk, mile marker
    createDadAndBike();       // the greeter, his hybrid bike, the Hello sign
    createTrailCyclists();    // his riding friends, out on the trail

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
// decorates.
function createTerrain() {
    const terrainGroup = new THREE.Group();
    terrainGroup.name = 'terrain';

    const { groundLength, trailWidth, trailZ, bankTopZ, farBankZ } = LAYOUT;

    const grassMaterial = new THREE.MeshStandardMaterial({
        map: grassTexture, roughness: 0.95, metalness: 0.0
    });

    // Near-side meadow: from the north woods to the top of the riverbank
    const nearDepth = bankTopZ - (-30);
    const nearGrass = new THREE.Mesh(new THREE.PlaneGeometry(groundLength, nearDepth), grassMaterial);
    nearGrass.rotation.x = -Math.PI / 2;
    nearGrass.position.set(0, 0, (bankTopZ + (-30)) / 2);
    nearGrass.receiveShadow = true;
    terrainGroup.add(nearGrass);

    // Far bank meadow, beyond the river
    const farGrass = new THREE.Mesh(new THREE.PlaneGeometry(groundLength, 14), grassMaterial);
    farGrass.rotation.x = -Math.PI / 2;
    farGrass.position.set(0, 0, farBankZ + 7);
    farGrass.receiveShadow = true;
    terrainGroup.add(farGrass);

    // Packed-dirt edge strips beside the gravel (the worn shoulder in the
    // photos), slightly wider than the trail and a step below it
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 0.95 });
    const edgeStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(groundLength - 10, trailWidth + 1.6),
        edgeMaterial
    );
    edgeStrip.rotation.x = -Math.PI / 2;
    edgeStrip.position.set(0, 0.012, trailZ);
    edgeStrip.receiveShadow = true;
    terrainGroup.add(edgeStrip);

    // The trail itself: crushed limestone
    const gravelMaterial = new THREE.MeshStandardMaterial({
        map: gravelTexture, roughness: 0.95, metalness: 0.0
    });
    const trail = new THREE.Mesh(
        new THREE.PlaneGeometry(groundLength - 10, trailWidth),
        gravelMaterial
    );
    trail.rotation.x = -Math.PI / 2;
    trail.position.set(0, 0.02, trailZ);
    trail.receiveShadow = true;
    terrainGroup.add(trail);

    // Gravel spur from the trail to the falls overlook at the fence
    const spur = new THREE.Mesh(new THREE.PlaneGeometry(5, 6.5), gravelMaterial.clone());
    spur.material.map = gravelTexture.clone();
    spur.material.map.needsUpdate = true;
    spur.material.map.repeat.set(2, 2);
    spur.rotation.x = -Math.PI / 2;
    spur.position.set(LAYOUT.fallsX, 0.016, 4.6);
    spur.receiveShadow = true;
    terrainGroup.add(spur);

    trailGroup.add(terrainGroup);
}

// ============================================
// THE GUNPOWDER RIVER
// ============================================
let riverState = null;

function createRiver() {
    const riverGroup = new THREE.Group();
    riverGroup.name = 'gunpowderRiver';

    const {
        groundLength, bankTopZ, riverNearZ, riverFarZ, farBankZ,
        upperWaterY, lowerWaterY, fallsX
    } = LAYOUT;
    const riverWidth = riverFarZ - riverNearZ;
    const riverMidZ = (riverNearZ + riverFarZ) / 2;

    // --- Banks: two sloped planes from grass level down to the water ---
    const bankMaterial = new THREE.MeshStandardMaterial({ color: 0x6b5b43, roughness: 0.95 });

    const nearSlopeAngle = Math.atan2(1.3, riverNearZ - bankTopZ);
    const nearSlopeLen = Math.sqrt((riverNearZ - bankTopZ) ** 2 + 1.3 ** 2);
    const nearBank = new THREE.Mesh(new THREE.PlaneGeometry(groundLength, nearSlopeLen), bankMaterial);
    nearBank.rotation.x = -Math.PI / 2 + nearSlopeAngle;
    nearBank.position.set(0, -0.65, (bankTopZ + riverNearZ) / 2);
    nearBank.receiveShadow = true;
    riverGroup.add(nearBank);

    const farSlopeLen = Math.sqrt((farBankZ - riverFarZ) ** 2 + 1.3 ** 2);
    const farBank = new THREE.Mesh(new THREE.PlaneGeometry(groundLength, farSlopeLen), bankMaterial);
    farBank.rotation.x = -Math.PI / 2 - nearSlopeAngle;
    farBank.position.set(0, -0.65, (riverFarZ + farBankZ) / 2);
    farBank.receiveShadow = true;
    riverGroup.add(farBank);

    // --- Riverbed, visible through the transparent water ---
    const bed = new THREE.Mesh(
        new THREE.PlaneGeometry(groundLength, riverWidth + 2),
        new THREE.MeshStandardMaterial({ color: 0x4a3d2e, roughness: 1.0 })
    );
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(0, -1.35, riverMidZ);
    riverGroup.add(bed);

    // --- Water: an upper pool and a lower pool split at the falls ledge ---
    // Each pool clones the texture so updateRiver can drift them at slightly
    // different speeds without scrolling one map twice per frame.
    const makeWaterMaterial = () => {
        const map = waterTexture.clone();
        map.needsUpdate = true;
        return new THREE.MeshStandardMaterial({
            map,
            color: 0xa8c8de,
            transparent: true,
            opacity: 0.82,
            roughness: 0.25,
            metalness: 0.1
        });
    };

    // The pools span PAST the bed width so their edges tuck under the bank
    // slopes at the waterline (the banks cross upperWaterY at z 9.7/22.3).
    // Sized to the bed alone, the water's edge floated up to 0.85 above the
    // submerged bank and the gap read as a flat sheet hovering mid-air.
    const waterSpan = riverWidth + 2.6;
    const upperLength = fallsX - (-groundLength / 2);
    const upperWater = new THREE.Mesh(new THREE.PlaneGeometry(upperLength, waterSpan), makeWaterMaterial());
    upperWater.rotation.x = -Math.PI / 2;
    upperWater.position.set((-groundLength / 2 + fallsX) / 2, upperWaterY, riverMidZ);
    riverGroup.add(upperWater);

    const lowerLength = groundLength / 2 - fallsX;
    const lowerWater = new THREE.Mesh(new THREE.PlaneGeometry(lowerLength, waterSpan), makeWaterMaterial());
    lowerWater.rotation.x = -Math.PI / 2;
    lowerWater.position.set((fallsX + groundLength / 2) / 2, lowerWaterY, riverMidZ);
    riverGroup.add(lowerWater);

    // Wet shoreline: dark mud strips lying on the bank slopes right at each
    // pool's waterline, seating the water against the ground. Four strips:
    // near/far bank, upstream (upperWaterY) and downstream of the falls
    // (lowerWaterY, where the waterline crosses the banks lower down).
    const wetEarth = new THREE.MeshStandardMaterial({ color: 0x4a3d2c, roughness: 1.0 });
    const bankRun = riverNearZ - bankTopZ;   // z-run of each 1.3-deep slope
    [
        { y: upperWaterY, x: (-groundLength / 2 + fallsX) / 2, len: upperLength },
        { y: lowerWaterY, x: (fallsX + groundLength / 2) / 2, len: lowerLength }
    ].forEach(({ y, x, len }) => {
        const drop = -y;   // how far below grass level this waterline sits
        [
            { z: bankTopZ + (drop / 1.3) * bankRun, tilt: -Math.PI / 2 + nearSlopeAngle },
            { z: farBankZ - (drop / 1.3) * bankRun, tilt: -Math.PI / 2 - nearSlopeAngle }
        ].forEach(({ z, tilt }) => {
            const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.55), wetEarth);
            strip.rotation.x = tilt;
            strip.position.set(x, y + 0.015, z);
            riverGroup.add(strip);
        });
    });

    // --- Scattered rocks, in the water and along the banks ---
    const rockSpots = [
        { x: -26, z: riverNearZ + 2, s: 0.9 }, { x: -12, z: riverMidZ, s: 0.7 },
        { x: -2, z: riverFarZ - 2.5, s: 1.1 }, { x: 6, z: riverNearZ + 3, s: 0.6 },
        { x: 10, z: riverMidZ + 1, s: 0.8 }, { x: 26, z: riverMidZ, s: 1.0 },
        { x: 32, z: riverNearZ + 1.5, s: 0.7 }, { x: 44, z: riverFarZ - 2, s: 0.9 },
        { x: -38, z: riverFarZ - 1.5, s: 0.8 }, { x: -48, z: riverMidZ, s: 1.2 }
    ];
    rockSpots.forEach((spot) => {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(spot.s, 0), rockMaterial);
        rock.position.set(spot.x, upperWaterY - 0.25 + spot.s * 0.4, spot.z);
        rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        rock.scale.y = 0.7;
        rock.castShadow = true;
        riverGroup.add(rock);
    });

    registerOutdoorProp(riverGroup, 'river');
    trailGroup.add(riverGroup);

    // --- The little waterfall (its own prop, so it is its own discovery) ---
    const fallsGroup = new THREE.Group();
    fallsGroup.name = 'theFalls';

    // Rock ledge across the river
    for (let i = 0; i < 7; i++) {
        const z = riverNearZ + 0.8 + (i / 6) * (riverWidth - 1.6);
        const ledgeRock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.75 + Math.random() * 0.35, 0),
            wetRockMaterial
        );
        ledgeRock.position.set(fallsX + (Math.random() - 0.5) * 0.5, upperWaterY - 0.3, z);
        ledgeRock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        ledgeRock.scale.y = 0.8;
        ledgeRock.castShadow = true;
        fallsGroup.add(ledgeRock);
    }

    // The falling water: six chute strips, one pouring through each gap
    // between the ledge rocks, instead of one full-width curtain (a single
    // rectangle overlapping the rocks read as a flat printed sheet). Each
    // strip has feathered side edges, its own width, height, scroll speed,
    // and streak scale, and a slight outward lean at the bottom like a real
    // overfall. The wet ledge rocks show between the chutes.
    const fallsHeight = upperWaterY - lowerWaterY + 0.35;
    const fallsSheets = [];
    const chuteSpecs = [
        { z: 12.5, w: 1.05, h: 0.94, speed: 1.35, streaks: 1.6 },
        { z: 13.9, w: 1.3, h: 1.0, speed: 1.7, streaks: 1.2 },
        { z: 15.3, w: 0.95, h: 0.9, speed: 1.2, streaks: 1.8 },
        { z: 16.7, w: 1.35, h: 1.0, speed: 1.85, streaks: 1.3 },
        { z: 18.1, w: 1.1, h: 0.96, speed: 1.5, streaks: 1.5 },
        { z: 19.5, w: 1.25, h: 0.92, speed: 1.3, streaks: 1.4 }
    ];
    chuteSpecs.forEach((spec, idx) => {
        const map = fallsStripTexture.clone();
        map.needsUpdate = true;
        map.repeat.set(1, spec.streaks);
        const sheet = new THREE.Mesh(
            new THREE.PlaneGeometry(spec.w, fallsHeight * spec.h),
            new THREE.MeshStandardMaterial({
                map,
                transparent: true,
                opacity: 0.88,
                roughness: 0.3,
                side: THREE.DoubleSide
            })
        );
        sheet.rotation.y = Math.PI / 2;
        sheet.rotation.z = 0.05 + (idx % 3) * 0.025;   // bottom kicks downstream
        sheet.position.set(
            fallsX + 0.68 + (idx % 2) * 0.08,
            (upperWaterY + lowerWaterY) / 2 + 0.05,
            spec.z
        );
        fallsGroup.add(sheet);
        fallsSheets.push({ mesh: sheet, speed: spec.speed });
    });

    // Rough water at the base: overlapping round froth patches that swirl
    // and breathe. (The first pass here was a single foam-textured
    // rectangle, which read as a flat gray slab with hard corners.)
    const froth = [];
    const frothSpots = [
        { x: fallsX + 1.5, z: riverMidZ - 2.8, s: 2.3, spin: 0.14 },
        { x: fallsX + 2.1, z: riverMidZ + 0.3, s: 3.2, spin: -0.1 },
        { x: fallsX + 1.6, z: riverMidZ + 3.1, s: 2.2, spin: 0.17 },
        { x: fallsX + 3.4, z: riverMidZ + 1.7, s: 1.9, spin: -0.14 },
        { x: fallsX + 3.2, z: riverMidZ - 1.6, s: 2.0, spin: 0.11 }
    ];
    frothSpots.forEach((spot, idx) => {
        const patch = new THREE.Mesh(
            new THREE.PlaneGeometry(spot.s, spot.s * 0.8),
            new THREE.MeshStandardMaterial({
                map: frothTexture,
                transparent: true,
                opacity: 0.8,
                depthWrite: false,   // overlapping transparents sort cleanly
                roughness: 0.35
            })
        );
        patch.rotation.x = -Math.PI / 2;
        patch.rotation.z = idx * 1.7;   // varied grain, deterministic
        patch.position.set(spot.x, lowerWaterY + 0.012 + idx * 0.004, spot.z);
        fallsGroup.add(patch);
        froth.push({ mesh: patch, spin: spot.spin, phase: idx * 1.3 });
    });

    registerOutdoorProp(fallsGroup, 'falls');
    trailGroup.add(fallsGroup);

    // A soft collider along the bank keeps walkers (and any future NPC) out
    // of the water even where the fence has gaps. The player is clamped by
    // worldBounds before reaching it, so this is belt and suspenders.
    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(-groundLength / 2, 0, bankTopZ - 0.2),
            new THREE.Vector3(groundLength / 2, 2, riverNearZ)
        ),
        type: 'bank'
    });

    riverState = {
        upperWater, lowerWater, fallsSheets, froth,
        elapsed: 0
    };
}

/**
 * Animate the river: the current drifts downstream toward the falls, the
 * falls face streams downward, and the churn breathes. Driven from the
 * render loop in main.js. Reduced-motion visitors get still water.
 */
export function updateRiver(deltaTime) {
    if (!riverState || _reducedMotion.matches) return;

    riverState.elapsed += deltaTime;

    // Both pools drift toward positive X (downstream, over the falls)
    riverState.upperWater.material.map.offset.x -= deltaTime * 0.035;
    riverState.lowerWater.material.map.offset.x -= deltaTime * 0.028;

    // Each chute streams downward at its own speed (increasing the offset
    // samples ever higher parts of the streak texture, which reads as the
    // water sliding down the face; decreasing it looked like water flowing
    // uphill). Different speeds per chute keep the falls from scrolling
    // like one printed sheet.
    riverState.fallsSheets.forEach((sheet) => {
        sheet.mesh.material.map.offset.y += deltaTime * sheet.speed;
    });

    // The froth at the base swirls slowly and breathes, each patch on its
    // own phase so the cluster roils instead of pulsing in unison
    riverState.froth.forEach((patch) => {
        patch.mesh.rotation.z += deltaTime * patch.spin;
        patch.mesh.material.opacity = 0.66 + 0.18 * Math.sin(riverState.elapsed * 1.8 + patch.phase);
    });
}

// ============================================
// THE RIVER SOUND (WebAudio ambience, click-to-listen)
// ============================================
// Click the little waterfall and the Gunpowder starts to sing: a steady low
// rumble under a burbling midrange (a wandering bandpass does the gurgle)
// and a fine spray hiss. Synthesized on the fly (no audio files, nothing
// downloaded), started only ever by a click on the falls, and stopped the
// same way. Unlike the golf course's ocean, a river has no wave rhythm:
// the sound holds steady with small fast flutters. The keep-alive element
// and interruption handling follow the family experience's conch, which
// learned the iOS lessons from the studio before it.

const riverSound = {
    ctx: null,
    master: null,
    noiseBuffer: null,
    rumbleGain: null,
    babbleGain: null,
    babbleFilter: null,
    hissGain: null,
    playing: false,
    elapsed: 0
};

// iOS quirk: plain WebAudio runs in the "ambient" audio session, and the
// phone's ring/silent hardware switch mutes that session outright. Any
// playing HTML <audio> element promotes the session to "playback", the
// category the switch does not silence. So while the river runs we loop an
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

function ensureRiverContext() {
    if (riverSound.ctx) return riverSound.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    riverSound.ctx = new Ctx();

    // iOS suspends the context when the visitor leaves the tab or takes a
    // call, and Safari parks it in a nonstandard 'interrupted' state that
    // never resumes itself. Nudge it back whenever the tab returns while
    // the river is meant to be on.
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && riverSound.playing && riverSound.ctx && riverSound.ctx.state !== 'running') {
            riverSound.ctx.resume().catch(() => {});
        }
    });

    riverSound.master = riverSound.ctx.createGain();
    riverSound.master.gain.value = 0;
    riverSound.master.connect(riverSound.ctx.destination);

    // Two seconds of white noise, shared by all three layers
    const rate = riverSound.ctx.sampleRate;
    riverSound.noiseBuffer = riverSound.ctx.createBuffer(1, Math.floor(rate * 2), rate);
    const data = riverSound.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // The body of the river: deep steady rumble
    const rumbleSrc = riverSound.ctx.createBufferSource();
    rumbleSrc.buffer = riverSound.noiseBuffer;
    rumbleSrc.loop = true;
    const rumbleFilter = riverSound.ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 320;
    riverSound.rumbleGain = riverSound.ctx.createGain();
    riverSound.rumbleGain.gain.value = 0.14;
    rumbleSrc.connect(rumbleFilter).connect(riverSound.rumbleGain).connect(riverSound.master);
    rumbleSrc.start();

    // The burble: a midrange band whose center frequency wanders (a slow
    // LFO), which is what turns flat noise into water talking over rocks
    const babbleSrc = riverSound.ctx.createBufferSource();
    babbleSrc.buffer = riverSound.noiseBuffer;
    babbleSrc.loop = true;
    riverSound.babbleFilter = riverSound.ctx.createBiquadFilter();
    riverSound.babbleFilter.type = 'bandpass';
    riverSound.babbleFilter.frequency.value = 850;
    riverSound.babbleFilter.Q.value = 1.4;
    riverSound.babbleGain = riverSound.ctx.createGain();
    riverSound.babbleGain.gain.value = 0.1;
    babbleSrc.connect(riverSound.babbleFilter).connect(riverSound.babbleGain).connect(riverSound.master);
    babbleSrc.start();
    const babbleLfo = riverSound.ctx.createOscillator();
    babbleLfo.frequency.value = 0.9;
    const babbleLfoDepth = riverSound.ctx.createGain();
    babbleLfoDepth.gain.value = 260;
    babbleLfo.connect(babbleLfoDepth).connect(riverSound.babbleFilter.frequency);
    babbleLfo.start();

    // The spray off the falls: a fine constant hiss
    const hissSrc = riverSound.ctx.createBufferSource();
    hissSrc.buffer = riverSound.noiseBuffer;
    hissSrc.loop = true;
    const hissFilter = riverSound.ctx.createBiquadFilter();
    hissFilter.type = 'highpass';
    hissFilter.frequency.value = 2800;
    riverSound.hissGain = riverSound.ctx.createGain();
    riverSound.hissGain.gain.value = 0.03;
    hissSrc.connect(hissFilter).connect(riverSound.hissGain).connect(riverSound.master);
    hissSrc.start();

    return riverSound.ctx;
}

/** Brighten the white water softly while the river plays (the falls'
 *  answer to the conch shell's glow). */
function setFallsGlow(on) {
    if (!riverState) return;
    riverState.fallsSheets.forEach((sheet) => {
        sheet.mesh.material.emissive.setHex(on ? 0x9fc4d8 : 0x000000);
        sheet.mesh.material.emissiveIntensity = on ? 0.35 : 1;
    });
}

/** Toggle the river. Must be called from a user gesture (it is: the click
 *  on the waterfall). Returns whether the river is now playing. */
export function toggleRiverAudio() {
    if (riverSound.playing) {
        riverSound.playing = false;
        if (riverSound.master && riverSound.ctx) {
            riverSound.master.gain.cancelScheduledValues(riverSound.ctx.currentTime);
            riverSound.master.gain.setValueAtTime(riverSound.master.gain.value, riverSound.ctx.currentTime);
            riverSound.master.gain.linearRampToValueAtTime(0, riverSound.ctx.currentTime + 0.4);
        }
        stopSilentKeepAlive();
        setFallsGlow(false);
        return false;
    }

    const ctx = ensureRiverContext();
    if (!ctx) return false;   // no WebAudio here; the trail stays peaceful
    if (ctx.state !== 'running') {
        ctx.resume().catch(() => {});
    }
    // Still inside the click/tap gesture here, which is the only place iOS
    // allows a media element to start.
    startSilentKeepAlive();
    riverSound.master.gain.cancelScheduledValues(ctx.currentTime);
    riverSound.master.gain.setValueAtTime(0, ctx.currentTime);
    riverSound.master.gain.linearRampToValueAtTime(0.45, ctx.currentTime + 0.7);
    riverSound.playing = true;
    setFallsGlow(true);
    return true;
}

export function isRiverAudioOn() {
    return riverSound.playing;
}

/** Flutter the layers each frame: small, fast, irregular, the texture of
 *  moving water rather than the ocean's slow swells. Cheap early-return
 *  when the river is off. Driven from the render loop in main.js. */
export function updateRiverAudio(deltaTime) {
    if (!riverSound.playing || !riverSound.ctx) return;
    riverSound.elapsed += deltaTime;
    const e = riverSound.elapsed;

    // Two incommensurate flutters multiplied make the burble irregular
    const flutter = Math.sin(Math.PI * 2 * e / 0.9) * Math.sin(Math.PI * 2 * e / 2.3 + 0.7);
    riverSound.babbleGain.gain.value = 0.1 + 0.03 * flutter;
    riverSound.rumbleGain.gain.value = 0.14 + 0.015 * Math.sin(Math.PI * 2 * e / 3.1);
    riverSound.hissGain.gain.value = 0.03 + 0.01 * Math.max(0, Math.sin(Math.PI * 2 * e / 1.6 + 2));
}

// ============================================
// THE OLD RAILROAD
// ============================================
// The NCR is a rail trail: the Northern Central Railroad ran this line, and
// stretches of the old rails and ties still sit in the ballast beside the
// path. Half-buried and not solid, visitors can step right over them.
function createRailroad() {
    const railGroup = new THREE.Group();
    railGroup.name = 'oldRailroad';

    const { railsZ, railsSpan } = LAYOUT;

    // Ballast bed
    const ballast = new THREE.Mesh(
        new THREE.PlaneGeometry(railsSpan, 3.2),
        new THREE.MeshStandardMaterial({ map: gravelTexture.clone(), color: 0x9a948a, roughness: 1.0 })
    );
    ballast.material.map.needsUpdate = true;
    ballast.rotation.x = -Math.PI / 2;
    ballast.position.set(0, 0.016, railsZ);
    ballast.receiveShadow = true;
    railGroup.add(ballast);

    // Wooden ties, shared geometry, half sunk into the ballast
    const tieGeometry = new THREE.BoxGeometry(0.22, 0.12, 2.4);
    const tieMaterial = new THREE.MeshStandardMaterial({ color: 0x4d3b28, roughness: 0.95 });
    for (let x = -railsSpan / 2 + 1; x <= railsSpan / 2 - 1; x += 1.0) {
        const tie = new THREE.Mesh(tieGeometry, tieMaterial);
        tie.position.set(x + (Math.random() - 0.5) * 0.06, 0.05, railsZ);
        railGroup.add(tie);
    }

    // Two rusted rails
    const railGeometry = new THREE.BoxGeometry(railsSpan - 2, 0.14, 0.08);
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x5e4633, roughness: 0.6, metalness: 0.5 });
    [-0.72, 0.72].forEach((offset) => {
        const rail = new THREE.Mesh(railGeometry, railMaterial);
        rail.position.set(0, 0.18, railsZ + offset);
        rail.castShadow = true;
        railGroup.add(rail);
    });

    registerOutdoorProp(railGroup, 'rails');
    trailGroup.add(railGroup);
}

// ============================================
// THE WOODS
// ============================================
// Tree and bush builders carried over from the tire theme's far-side
// landscaping, lifted to file scope so the whole valley can use them.

/** Large oak-style tree: thick trunk, multi-sphere canopy. */
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
    return tree;
}

/** Pine/conifer: layered cones. */
function createPineTree(x, z, height = 6) {
    const tree = new THREE.Group();

    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.25, height * 0.3, 6),
        trunkMaterial
    );
    trunk.position.y = height * 0.15;
    trunk.castShadow = true;
    tree.add(trunk);

    const coneHeights = [0.3, 0.5, 0.7, 0.85];
    const coneSizes = [0.5, 0.4, 0.3, 0.2];

    coneHeights.forEach((h, i) => {
        const cone = new THREE.Mesh(
            new THREE.ConeGeometry(height * coneSizes[i], height * 0.25, 8),
            darkGreenFoliage
        );
        cone.position.y = height * h;
        cone.castShadow = true;
        tree.add(cone);
    });

    tree.position.set(x, 0, z);
    return tree;
}

/** Cluster of low bushes. */
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
    return cluster;
}

/** Bush with scattered flower dots. */
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

    // Blooms nest ON the foliage: a random upper-hemisphere direction
    // pushed out to the body ellipsoid (radius 0.8, squashed 0.8 in y) and
    // pulled in a touch, so each flower sits half-in half-out of the
    // leaves. (A fixed cylindrical radius left the high flowers hovering
    // in the air off the bush's narrowing shoulder.)
    for (let i = 0; i < 12; i++) {
        const flower = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 4, 4),
            flowerMaterial
        );
        const angle = Math.random() * Math.PI * 2;
        const up = Math.random() * 0.9;   // 0 equator .. ~1 crown
        const horiz = Math.sqrt(Math.max(0, 1 - up * up));
        flower.position.set(
            Math.cos(angle) * horiz * 0.76,
            0.6 + up * 0.61,
            Math.sin(angle) * horiz * 0.76
        );
        bush.add(flower);
    }

    bush.position.set(x, 0, z);
    return bush;
}

/** A tree trunk is solid; the canopy overhead is not. */
function addTrunkCollider(x, z) {
    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(x - 0.5, 0, z - 0.5),
            new THREE.Vector3(x + 0.5, 2.5, z + 0.5)
        ),
        type: 'tree'
    });
}

function createWoods() {
    const woodsGroup = new THREE.Group();
    woodsGroup.name = 'woods';

    const mobile = isMobileDevice();
    const { groundLength, farBankZ } = LAYOUT;

    // North woods: a deep band behind the railroad. Two staggered rows so
    // the treeline reads dense without a huge mesh count.
    const step = mobile ? 9 : 6;
    for (let x = -groundLength / 2 + 6; x <= groundLength / 2 - 6; x += step) {
        const jitterX = (Math.random() - 0.5) * 3;
        if (Math.random() > 0.35) {
            woodsGroup.add(createLargeTree(x + jitterX, -11 - Math.random() * 3, 7 + Math.random() * 4));
        } else {
            woodsGroup.add(createPineTree(x + jitterX, -11 - Math.random() * 3, 6 + Math.random() * 3));
        }
        // Second, deeper row
        if (!mobile) {
            woodsGroup.add(createLargeTree(x + jitterX * 2 + 3, -17 - Math.random() * 4, 8 + Math.random() * 4));
        }
    }

    // South woods, across the river on the far bank
    for (let x = -groundLength / 2 + 8; x <= groundLength / 2 - 8; x += step + 2) {
        const jitterX = (Math.random() - 0.5) * 4;
        if (Math.random() > 0.4) {
            woodsGroup.add(createLargeTree(x + jitterX, farBankZ + 3 + Math.random() * 4, 8 + Math.random() * 4));
        } else {
            woodsGroup.add(createPineTree(x + jitterX, farBankZ + 4 + Math.random() * 4, 6 + Math.random() * 3));
        }
    }

    // A few shade trees on the walkable grass, clear of the trail, Dad's
    // spot (x 2, z 3), the kiosk (x -13), the overlook spur (x 18), and the
    // benches. These are close enough to touch, so their trunks are solid.
    const shoulderTrees = [
        { x: -26, z: 5.6, h: 9 }, { x: -4, z: 6.6, h: 8 },
        { x: 9, z: 6.2, h: 10 }, { x: 30, z: 6.4, h: 9 },
        { x: -34, z: -3.4, h: 8 }, { x: 14, z: -3.2, h: 9 }, { x: 36, z: -3.6, h: 8 }
    ];
    shoulderTrees.forEach((t) => {
        const tree = createLargeTree(t.x, t.z, t.h);
        registerOutdoorProp(tree, 'tree');
        woodsGroup.add(tree);
        addTrunkCollider(t.x, t.z);
    });

    // Bushes along the trail edges and the treeline
    const bushSpots = [
        { x: -30, z: 3.4, size: 1.1 }, { x: -18, z: -3.0, size: 1.0 },
        { x: 6, z: -3.2, size: 1.2 }, { x: 24, z: 3.2, size: 1.0 },
        // Treeline pair: far enough north that jitter plus bush radius
        // (about 2 worst-case) can never sprawl onto the ballast (z -7.6)
        { x: 34, z: 3.6, size: 1.1 }, { x: -8, z: -9.8, size: 1.3 },
        { x: 20, z: -10.0, size: 1.2 }
    ];
    bushSpots.forEach((spot) => {
        const bush = createBushCluster(spot.x, spot.z, spot.size);
        registerOutdoorProp(bush, 'bush');
        woodsGroup.add(bush);
    });

    // Flowering bushes where riders slow down anyway
    const flowerSpots = [{ x: -16, z: 4.4 }, { x: 13, z: 4.2 }, { x: -38, z: 3.8 }];
    flowerSpots.forEach((spot) => {
        const bush = createFloweringBush(spot.x, spot.z);
        registerOutdoorProp(bush, 'bush');
        woodsGroup.add(bush);
    });

    trailGroup.add(woodsGroup);
}

// ============================================
// TRAIL FURNITURE
// ============================================

/**
 * Wooden-slat bench with metal legs (carried over from the tire theme's
 * outdoor bench, now placed by position and facing).
 */
function createTrailBench(x, z, rotationY = 0) {
    const benchGroup = new THREE.Group();
    benchGroup.name = 'trailBench';

    const seatWidth = 2.0;
    const seatDepth = 0.45;
    const seatHeight = 0.45;
    const seatThickness = 0.06;
    const backHeight = 0.5;
    const backThickness = 0.05;
    const legWidth = 0.08;
    const armrestHeight = 0.25;
    const armrestWidth = 0.08;
    const armrestLength = seatDepth + 0.05;

    const woodMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B4513,
        roughness: 0.8,
        metalness: 0.1
    });

    const metalMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.4,
        metalness: 0.8
    });

    // Seat slats
    const slatCount = 5;
    const slatWidth = (seatWidth - 0.1) / slatCount;
    const slatGap = 0.02;

    for (let i = 0; i < slatCount; i++) {
        const slat = new THREE.Mesh(
            new THREE.BoxGeometry(slatWidth - slatGap, seatThickness, seatDepth),
            woodMaterial
        );
        const slatX = -seatWidth / 2 + slatWidth / 2 + i * slatWidth + 0.05;
        slat.position.set(slatX, seatHeight, 0);
        benchGroup.add(slat);
    }

    // Backrest slats
    const backSlatCount = 4;
    const backSlatHeight = (backHeight - 0.08) / backSlatCount;

    for (let i = 0; i < backSlatCount; i++) {
        const backSlat = new THREE.Mesh(
            new THREE.BoxGeometry(seatWidth - 0.1, backSlatHeight - slatGap, backThickness),
            woodMaterial
        );
        const slatY = seatHeight + seatThickness / 2 + backSlatHeight / 2 + i * backSlatHeight + 0.04;
        backSlat.position.set(0, slatY, -seatDepth / 2 + backThickness / 2);
        benchGroup.add(backSlat);
    }

    // Metal legs
    const legPositions = [-seatWidth / 2 + 0.15, seatWidth / 2 - 0.15];
    legPositions.forEach(legX => {
        const frontLeg = new THREE.Mesh(
            new THREE.BoxGeometry(legWidth, seatHeight, legWidth),
            metalMaterial
        );
        frontLeg.position.set(legX, seatHeight / 2, seatDepth / 2 - legWidth / 2);
        benchGroup.add(frontLeg);

        const backLeg = new THREE.Mesh(
            new THREE.BoxGeometry(legWidth, seatHeight + backHeight, legWidth),
            metalMaterial
        );
        backLeg.position.set(legX, (seatHeight + backHeight) / 2, -seatDepth / 2 + legWidth / 2);
        benchGroup.add(backLeg);

        const legSupport = new THREE.Mesh(
            new THREE.BoxGeometry(legWidth, legWidth, seatDepth - legWidth),
            metalMaterial
        );
        legSupport.position.set(legX, legWidth / 2 + 0.1, 0);
        benchGroup.add(legSupport);
    });

    // Armrests
    const armrestPositions = [-seatWidth / 2 + 0.05, seatWidth / 2 - 0.05];
    armrestPositions.forEach(armX => {
        const armSupport = new THREE.Mesh(
            new THREE.BoxGeometry(armrestWidth, armrestHeight, armrestWidth),
            metalMaterial
        );
        armSupport.position.set(armX, seatHeight + armrestHeight / 2, seatDepth / 4);
        benchGroup.add(armSupport);

        const armTop = new THREE.Mesh(
            new THREE.BoxGeometry(armrestWidth, armrestWidth, armrestLength),
            woodMaterial
        );
        armTop.position.set(armX, seatHeight + armrestHeight, 0);
        benchGroup.add(armTop);
    });

    benchGroup.position.set(x, 0, z);
    benchGroup.rotation.y = rotationY;

    registerOutdoorProp(benchGroup, 'bench');

    const box = new THREE.Box3().setFromObject(benchGroup);
    collisionBoxes.push({ box, type: 'decor' });

    trailGroup.add(benchGroup);
}

/**
 * A run of split-rail fence: rustic posts with two rails, slight jitter so
 * it reads hand-built like the ones in the photos.
 */
function createSplitRailFence(xStart, xEnd, z) {
    const fenceGroup = new THREE.Group();
    fenceGroup.name = 'splitRailFence';

    const postSpacing = 2.4;
    const postCount = Math.max(2, Math.round((xEnd - xStart) / postSpacing) + 1);
    const actualSpacing = (xEnd - xStart) / (postCount - 1);

    const postGeometry = new THREE.BoxGeometry(0.13, 1.05, 0.13);

    for (let i = 0; i < postCount; i++) {
        const post = new THREE.Mesh(postGeometry, weatheredWood);
        post.position.set(xStart + i * actualSpacing, 0.52, z + (Math.random() - 0.5) * 0.05);
        post.rotation.y = (Math.random() - 0.5) * 0.15;
        post.castShadow = true;
        fenceGroup.add(post);

        // Two rails reaching to the next post
        if (i < postCount - 1) {
            [0.55, 0.9].forEach((y) => {
                const rail = new THREE.Mesh(
                    new THREE.BoxGeometry(actualSpacing + 0.15, 0.09, 0.07),
                    weatheredWood
                );
                rail.position.set(
                    xStart + (i + 0.5) * actualSpacing,
                    y + (Math.random() - 0.5) * 0.04,
                    z
                );
                rail.rotation.z = (Math.random() - 0.5) * 0.02;
                rail.castShadow = true;
                fenceGroup.add(rail);
            });
        }
    }

    registerOutdoorProp(fenceGroup, 'fence');

    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(xStart - 0.1, 0, z - 0.2),
            new THREE.Vector3(xEnd + 0.1, 1.2, z + 0.2)
        ),
        type: 'fence'
    });

    trailGroup.add(fenceGroup);
}

// ---- The trailhead kiosk and its notice board ----
// The board carries the discovery list (mirroring the checklist, the way the
// tire theme's garage whiteboard did) plus the dedication. main.js opens a
// close-up view of it, drawn by drawKioskTo below.
let kioskBoard = null;   // { canvas, ctx, texture }
let kioskItems = [];     // latest checklist rows, [{ short, done }]

const KIOSK_DEDICATION = [
    'This stretch of trail is kept in loving memory',
    'of a wonderful dad. He rode here most weekends,',
    '15 or 20 miles at a time, and once finished the',
    'hundred mile Seagull Century. Kind, funny, and',
    'generous, and always good company. Happy trails.'
];

function drawKioskBoard(ctx, W, H) {
    // Sun-faded cork board in a wooden frame
    ctx.fillStyle = '#d8c9a3';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#8a6f4d';
    ctx.lineWidth = W * 0.02;
    ctx.strokeRect(0, 0, W, H);

    const pad = W * 0.06;

    // Header
    ctx.fillStyle = '#3d5a3f';
    ctx.font = `bold ${Math.round(H * 0.045)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText('GUNPOWDER FALLS STATE PARK  ·  MARYLAND', W / 2, H * 0.09);

    ctx.fillStyle = '#2c3e2e';
    ctx.font = `bold ${Math.round(H * 0.1)}px Georgia, serif`;
    ctx.fillText('THE NCR TRAIL', W / 2, H * 0.2);

    ctx.strokeStyle = '#8a6f4d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, H * 0.24);
    ctx.lineTo(W - pad, H * 0.24);
    ctx.stroke();

    // Discovery list, two columns
    ctx.textAlign = 'left';
    ctx.font = `${Math.round(H * 0.042)}px Georgia, serif`;
    ctx.fillStyle = '#4a3c28';
    ctx.fillText('Things to find along the trail:', pad, H * 0.31);

    const colItems = Math.ceil(kioskItems.length / 2) || 4;
    const rowH = H * 0.062;
    const listTop = H * 0.37;
    kioskItems.forEach((item, i) => {
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
            ctx.strokeStyle = '#3d6b4f';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x + boxSize * 0.2, y - boxSize * 0.4 + 4);
            ctx.lineTo(x + boxSize * 0.45, y - boxSize * 0.1 + 4);
            ctx.lineTo(x + boxSize * 1.05, y - boxSize * 0.95 + 4);
            ctx.stroke();
        }

        ctx.fillStyle = item.done ? '#3d6b4f' : '#4a3c28';
        ctx.font = `${Math.round(H * 0.038)}px Georgia, serif`;
        ctx.fillText(item.short, x + boxSize + W * 0.015, y);
    });

    // Dedication
    const dedTop = H * 0.68;
    ctx.strokeStyle = '#8a6f4d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, dedTop - H * 0.045);
    ctx.lineTo(W - pad, dedTop - H * 0.045);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#5a4a34';
    ctx.font = `italic ${Math.round(H * 0.042)}px Georgia, serif`;
    KIOSK_DEDICATION.forEach((line, i) => {
        ctx.fillText(line, W / 2, dedTop + i * H * 0.055);
    });
}

/** Redraw the in-world board (called on checklist changes from main.js). */
export function updateKioskChecklist(items, progress) {
    if (items) {
        kioskItems = items.map((item) => ({
            short: item.short || item.label,
            // item.done comes from getChecklistItems. (The progress arg is a
            // summary {done: count, total, complete}, not a per-id map, so
            // reading progress[item.id] here left every box unticked.)
            done: !!item.done
        }));
    }
    if (kioskBoard) {
        drawKioskBoard(kioskBoard.ctx, kioskBoard.canvas.width, kioskBoard.canvas.height);
        kioskBoard.texture.needsUpdate = true;
    }
}

/** Draw the notice board into any 2D context (the close-up overlay). */
export function drawKioskTo(ctx, w, h) {
    drawKioskBoard(ctx, w, h);
}

function createKiosk(x, z) {
    const kioskGroup = new THREE.Group();
    kioskGroup.name = 'trailheadKiosk';

    // Posts
    const postGeometry = new THREE.BoxGeometry(0.14, 2.9, 0.14); // tall enough to meet the roof panels (~y 2.8)
    [-1.35, 1.35].forEach((offset) => {
        const post = new THREE.Mesh(postGeometry, darkWood);
        post.position.set(offset, 1.45, 0);
        post.castShadow = true;
        kioskGroup.add(post);
    });

    // Notice board (canvas texture on the front face)
    const canvas = makeCanvas(768, 448);
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    kioskBoard = { canvas, ctx, texture };
    drawKioskBoard(ctx, canvas.width, canvas.height);
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
    kioskGroup.add(board);

    // Little peaked roof
    [-1, 1].forEach((side) => {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.05, 0.75), darkWood);
        panel.position.set(0, 2.62 + 0.16, side * 0.31);
        // side * +0.45 drops each panel's outer edge for a peaked roof
        // (side * -0.45 raised them into an upside-down V).
        panel.rotation.x = side * 0.45;
        panel.castShadow = true;
        kioskGroup.add(panel);
    });

    kioskGroup.position.set(x, 0, z);
    // Built facing +Z; the kiosk stands on the south shoulder, so turn the
    // board around to face the trail (negative Z side)
    kioskGroup.rotation.y = Math.PI;

    registerOutdoorProp(kioskGroup, 'kiosk');

    const box = new THREE.Box3().setFromObject(kioskGroup);
    collisionBoxes.push({ box, type: 'decor' });

    trailGroup.add(kioskGroup);
}

/** NCR-style white mile marker post. */
function createMileMarker(x, z) {
    const markerGroup = new THREE.Group();
    markerGroup.name = 'mileMarker';

    const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.95, 0.18),
        new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.8 })
    );
    post.position.y = 0.48;
    post.castShadow = true;
    markerGroup.add(post);

    // Painted number
    const canvas = makeCanvas(64, 64);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#2c3e2e';
    ctx.font = 'bold 44px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('7', 32, 34);
    const numberTexture = new THREE.CanvasTexture(canvas);

    const numberPlate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.16, 0.16),
        new THREE.MeshStandardMaterial({ map: numberTexture, roughness: 0.8 })
    );
    numberPlate.position.set(0, 0.72, -0.092);
    numberPlate.rotation.y = Math.PI;  // face the trail
    markerGroup.add(numberPlate);

    markerGroup.position.set(x, 0, z);

    registerOutdoorProp(markerGroup, 'marker');
    trailGroup.add(markerGroup);
}

function createTrailFurniture() {
    // Benches with a view of the water (like the one by the fence in the
    // photos), plus one on the north side facing the trail
    createTrailBench(-14, 7.3, 0);
    createTrailBench(10, 7.3, 0);
    createTrailBench(26, -2.8, 0);

    // Split-rail fence along the bank: a long run at the falls overlook and
    // a shorter one further west, with open grass between
    createSplitRailFence(11, 27, LAYOUT.fenceZ);
    createSplitRailFence(-32, -18, LAYOUT.fenceZ);

    // Trailhead kiosk near the spawn, on the south shoulder
    createKiosk(-13, 4.8);

    // Mile marker 7, further up the trail
    createMileMarker(30, 2.6);
}

// ============================================
// BICYCLES
// ============================================

/** Cylinder stretched between two points (frame tubes, fork legs). */
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

/**
 * A hybrid bike (part road, part mountain, the kind everyone on the NCR
 * rides). Built facing positive X. Returns { group, wheels, crank } so the
 * cyclist driver can spin the wheels and pedals.
 */
function createHybridBike(frameColor = 0x5b7d99, parked = false) {
    const bikeGroup = new THREE.Group();
    bikeGroup.name = 'hybridBike';

    const frameMaterial = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.35, metalness: 0.55 });
    const blackMetal = new THREE.MeshStandardMaterial({ color: 0x1e1e1e, roughness: 0.5, metalness: 0.6 });
    const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x22201e, roughness: 0.95, metalness: 0.0 });

    const wheelRadius = 0.34;

    // Frame anchor points (side view, X forward / Y up)
    const rearHub = new THREE.Vector3(-0.55, wheelRadius, 0);
    const frontHub = new THREE.Vector3(0.55, wheelRadius, 0);
    const bottomBracket = new THREE.Vector3(-0.05, 0.32, 0);
    const seatTop = new THREE.Vector3(-0.28, 0.95, 0);
    const headTop = new THREE.Vector3(0.42, 0.9, 0);

    // Wheels: torus in the XY plane rolls along X, spokes show the spin
    function makeWheel(hub) {
        const wheelGroup = new THREE.Group();
        const tire = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius, 0.035, 8, 20), tireMaterial);
        wheelGroup.add(tire);
        for (let i = 0; i < 4; i++) {
            const spoke = new THREE.Mesh(
                new THREE.CylinderGeometry(0.006, 0.006, wheelRadius * 2 - 0.05, 4),
                blackMetal
            );
            spoke.rotation.z = (i / 4) * Math.PI;
            wheelGroup.add(spoke);
        }
        const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8), blackMetal);
        hubCap.rotation.x = Math.PI / 2;
        wheelGroup.add(hubCap);
        wheelGroup.position.copy(hub);
        bikeGroup.add(wheelGroup);
        return wheelGroup;
    }
    const rearWheel = makeWheel(rearHub);
    const frontWheel = makeWheel(frontHub);

    // Frame tubes
    const tubeR = 0.024;
    bikeGroup.add(tubeBetween(headTop, bottomBracket, tubeR, frameMaterial));                   // down tube
    bikeGroup.add(tubeBetween(seatTop, headTop, tubeR, frameMaterial));                         // top tube
    bikeGroup.add(tubeBetween(bottomBracket, seatTop, tubeR, frameMaterial));                   // seat tube
    bikeGroup.add(tubeBetween(rearHub, bottomBracket, 0.016, frameMaterial));                   // chain stay
    bikeGroup.add(tubeBetween(rearHub, new THREE.Vector3(-0.28, 0.88, 0), 0.016, frameMaterial)); // seat stay
    bikeGroup.add(tubeBetween(headTop, frontHub, 0.018, frameMaterial));                        // fork

    // Flat handlebar (a hybrid's upright bar) on a riser stem: the bar sits
    // high and slightly back of the head tube, which is both how a hybrid
    // is set up and what puts the bar within the seated riders' arm reach.
    // The bar lies crosswise (cylinders extrude along Y, so it needs the
    // quarter turn), with a grip at each end.
    const barTop = new THREE.Vector3(0.36, 1.06, 0);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.52, 6), blackMetal);
    bar.position.copy(barTop);
    bar.rotation.x = Math.PI / 2;
    bikeGroup.add(bar);
    [-1, 1].forEach((side) => {
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.1, 6), blackMetal);
        grip.position.set(barTop.x, barTop.y, side * 0.21);
        grip.rotation.x = Math.PI / 2;
        bikeGroup.add(grip);
    });
    bikeGroup.add(tubeBetween(headTop, barTop, 0.014, blackMetal));

    // Saddle
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.12), blackMetal);
    saddle.position.set(-0.28, 0.99, 0);
    bikeGroup.add(saddle);

    // Crank and pedals (spin with the wheels)
    const crank = new THREE.Group();
    crank.position.copy(bottomBracket);
    [1, -1].forEach((side) => {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.17, 0.02), blackMetal);
        arm.position.set(0, side * 0.085, side * 0.06);
        crank.add(arm);
        const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.06), blackMetal);
        pedal.position.set(0, side * 0.17, side * 0.09);
        crank.add(pedal);
    });
    bikeGroup.add(crank);

    if (parked) {
        // Kickstand: clipped to the chain stay near the bottom bracket and
        // planted on the side the parked lean below tips the bike toward
        // (-Z), splayed slightly rearward like the real hinge.
        bikeGroup.add(tubeBetween(
            new THREE.Vector3(-0.18, 0.33, 0),
            new THREE.Vector3(-0.24, 0.01, -0.26),
            0.012, blackMetal
        ));
        bikeGroup.rotation.x = -0.08;   // the gentle lean of a parked bike
    }

    bikeGroup.traverse((child) => { if (child.isMesh) child.castShadow = true; });

    return { group: bikeGroup, wheels: [frontWheel, rearWheel], crank };
}

// ============================================
// DAD, THE GREETER
// ============================================
// He stands on the grass shoulder beside his hybrid bike, facing the trail,
// and turns to say hello as visitors approach (the shared shopkeeper look-at
// behavior). Light skin, dark brown hair, hazel eyes, glasses, no facial
// hair, average build and height, exactly as remembered, and dressed to
// ride: short sleeve riding shirt and bike shorts, his helmet hanging from
// the parked bike's handlebar.

const DAD_POSITION = { x: 2, z: 3 };

/** Thin wire-frame glasses fitted to the shared person builder's face
 *  geometry (head center y 1.5, eyes at x ±0.035, z ~0.11). */
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

    // Bridge
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.022, 4), frameMaterial);
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, eyeY + 0.004, lensZ);
    glasses.add(bridge);

    // Temples back to the ears
    [-1, 1].forEach((side) => {
        const temple = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.13, 4), frameMaterial);
        temple.rotation.x = Math.PI / 2;
        temple.position.set(side * 0.058, eyeY + 0.002, lensZ - 0.065);
        glasses.add(temple);
    });

    return glasses;
}

/** Bike helmet, shared by Dad and the riders. A hollow shell that sits ON the
 *  head rather than through it: the person builder's head is a 0.12 sphere at
 *  y 1.5 and the hair cap tops out near y 1.67, so the dome is sized to clear
 *  both, with its rim resting just above the ears and glasses. Road-helmet
 *  details: elongated front to back, a rim lip, and dark air slits running
 *  the length of the dome so the rider's head stays cool. */
function createBikeHelmet(color) {
    const helmetGroup = new THREE.Group();
    helmetGroup.name = 'bikeHelmet';

    const shellMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 });
    const ventMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.85 });

    // Dome: a hemisphere (open underneath), stretched longer than it is wide.
    // The group origin is the center of the rim circle.
    const R = 0.16;
    const SCALE_X = 0.95, SCALE_Y = 0.8, SCALE_Z = 1.12;
    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(R, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        shellMaterial
    );
    dome.scale.set(SCALE_X, SCALE_Y, SCALE_Z);
    dome.castShadow = true;
    helmetGroup.add(dome);

    // Rim lip: a thin band around the open edge so it reads as a shell with
    // thickness, not a cap painted onto the skull.
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.013, 6, 20), shellMaterial);
    rim.scale.set(SCALE_X, SCALE_Z, 1);   // torus lies in XY; y maps to world Z after the tilt
    rim.rotation.x = Math.PI / 2;
    helmetGroup.add(rim);

    // Air slits: dark recessed channels running front to back. Each lane is
    // two short segments (front and rear) pitched to hug the shell's slope,
    // sunk so only a dark ridge shows. (A single straight full-length box
    // sat at apex height while the dome curved away under it, so its ends
    // hovered out past the silhouette like fins.)
    [-0.62, -0.31, 0, 0.31, 0.62].forEach((t) => {
        const arc = Math.sqrt(Math.max(0, 1 - t * t));
        const ay = R * SCALE_Y * arc;   // this lane's profile semi-axes
        const az = R * SCALE_Z * arc;
        const TILT = 0.32;   // atan of the shell slope at the segment centers
        [-1, 1].forEach((end) => {
            const slit = new THREE.Mesh(
                new THREE.BoxGeometry(0.016, 0.024, 0.6 * az),
                ventMaterial
            );
            slit.position.set(t * R * SCALE_X, ay * 0.9075 - 0.005, end * 0.42 * az - 0.01);
            slit.rotation.x = end * TILT;   // front pitches down-forward, rear down-aft
            slit.rotation.z = -Math.asin(t) * 0.85;
            helmetGroup.add(slit);
        });
    });

    // Rest the rim just above the ears and glasses; hair tucks inside.
    helmetGroup.position.set(0, 1.555, 0);
    return helmetGroup;
}

/** Turn the person builder's long trousers into bike shorts: the thigh keeps
 *  the pants (lycra) material and the knee and shin below it go to skin. The
 *  leg groups are the untagged groups hinged at hip height (y 0.75); the arm
 *  groups are excluded by their isArm tag, and the shoe (y -0.77 within the
 *  leg) keeps its own material. */
function applyBikeShorts(person, skinTone) {
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

/** Trail dress code: nobody walks the NCR in a skirt. The shared visitor
 *  cast (npcs initGalleryVisitors) mixes in A-line skirts; the trousers are
 *  already built underneath, so removing the skirt mesh is enough. It is the
 *  only direct-child cylinder flaring at the waist (y ~0.63) in the person
 *  builder, so it can be identified safely without a tag. Called from
 *  main.js right after the walkers spawn. */
export function dressWalkersForTheTrail() {
    getVisitorMeshes().forEach((walker) => {
        for (let i = walker.children.length - 1; i >= 0; i--) {
            const child = walker.children[i];
            if (child.isMesh && child.geometry && child.geometry.type === 'CylinderGeometry' &&
                Math.abs(child.position.y - 0.63) < 0.03) {
                child.geometry.dispose();
                walker.remove(child);
            }
        }
    });
}

/** Repaint the shared floating sign to say Hello (createHelpSign hardcodes
 *  "Help", and the shared 1.0.0 files are frozen, so the texture is swapped
 *  here in experience code). Warm trail green instead of gallery slate. */
function repaintSignAsHello(sign) {
    const canvas = makeCanvas(256, 128);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#3d6b4f';
    ctx.beginPath();
    ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 20);
    ctx.fill();
    ctx.strokeStyle = '#6f9d83';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Hello', canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    sign.traverse((child) => {
        if (child.isMesh && child.material && child.material.map) {
            child.material.map = texture;
            child.material.needsUpdate = true;
        } else if (child.isMesh && child.material && child.material.color) {
            // The glow plane behind the sign follows the new green
            child.material.color.setHex(0x6f9d83);
        }
    });
}

function createDadAndBike() {
    const peopleGroup = new THREE.Group();
    peopleGroup.name = 'storePeople';

    const { x: dadX, z: dadZ } = DAD_POSITION;
    const defaultRotation = Math.PI;    // face the trail (negative Z) between visitors

    const DAD_SKIN = 0xf0c8a0;          // light skin
    const dad = createPerson({
        role: 'shopkeeper',             // reuse the greeter look-at behavior
        x: dadX,
        z: dadZ,
        rotationY: defaultRotation,
        shirtColor: 0x3f7bbf,           // favorite blue riding shirt (short sleeves: dressShirt false)
        pantsColor: 0x23262b,           // black lycra (the thigh keeps this as the bike shorts)
        skinTone: DAD_SKIN,
        hairColor: 0x3a2817,            // dark brown, neat (shopkeeper style)
        hasApron: false,
        bald: false,
        muscular: false,                // average build, average height (scale 1)
        dressShirt: false
    });

    // Hazel eyes: recolor the tagged pupils (both share one material)
    dad.traverse((child) => {
        if (child.userData && child.userData.isPupil) {
            child.material.color.setHex(0x8a7033);
        }
    });

    // He always wore glasses. The helmet comes along too, but while he
    // stands chatting trailside it hangs from the bike's handlebar (below)
    // instead of sitting on his head.
    dad.add(createGlasses());
    applyBikeShorts(dad, DAD_SKIN);

    peopleGroup.add(dad);
    registerHost(dad, defaultRotation);

    // Floating sign above him. The spec's one hard requirement: it says
    // Hello, not Help.
    const sign = createHelpSign(dadX, dadZ);
    repaintSignAsHello(sign);
    peopleGroup.add(sign);
    setHelpSign(sign);

    // His hybrid bike, parked on its kickstand beside him
    const bike = createHybridBike(0x5b7d99, true);
    bike.group.position.set(dadX + 1.4, 0, dadZ + 0.15);

    // His helmet hangs hooked over the near handlebar grip: the rim's top
    // arc wraps the bar and the dome swings out on the bike's lean side.
    const helmet = createBikeHelmet(0xe8e8e8);
    helmet.position.set(0.36, 0.93, -0.205);
    helmet.rotation.x = -1.3;
    helmet.rotation.z = 0.15;
    bike.group.add(helmet);

    peopleGroup.add(bike.group);
    registerOutdoorProp(bike.group, 'dadbike');

    // Collision so visitors walk around him and the bike, not through them
    const dadBox = new THREE.Box3().setFromObject(dad);
    dadBox.expandByScalar(0.1);
    collisionBoxes.push({ box: dadBox, type: 'host' });

    const bikeBox = new THREE.Box3().setFromObject(bike.group);
    collisionBoxes.push({ box: bikeBox, type: 'decor' });

    trailGroup.add(peopleGroup);
}

// ============================================
// THE RIDERS (trail cyclists)
// ============================================
// Dad's riding friends, out on the trail. The shared pedestrian system only
// walks a fixed lane with the standard walker mesh, so the riders are an
// experience-side driver: a hybrid bike, a seated rider with a helmet, and
// a simple back-and-forth patrol with a smooth U-turn at each end.

const CYCLIST_CASTS = [
    { frame: 0x2e6b46, shirt: 0xe8702a, pants: 0x2c3e50, helmet: 0xf2f2f2, skin: 0xffdbac, hair: 0x4a3728, lane: 1.0, speed: 3.8, startX: -20, dir: 1 },
    { frame: 0x2b5f8a, shirt: 0xc0392b, pants: 0x3a3f44, helmet: 0xd9534f, skin: 0x8d5524, hair: 0x2c1810, lane: -1.0, speed: 4.3, startX: 12, dir: -1 },
    { frame: 0x7a2f3a, shirt: 0xd4a017, pants: 0x2f4f4f, helmet: 0x3a6ea5, skin: 0xe0ac69, hair: 0x704214, lane: 0.35, speed: 3.2, startX: 30, dir: -1 }
];

const CYCLIST_RANGE = { minX: -36, maxX: 36 };
const WHEEL_RADIUS = 0.34;
const RIDER_LEAN = 0.18;      // forward pitch of the seated torso (rad)
// Pedalling IK: each frame the two-bone leg (thigh, shin) is solved so the
// foot sits on its pedal's actual position around the crank circle. The hip
// is the seated rider's hip in bike space (rig offset and torso lean
// applied); the bone lengths come from the people-1.0.0.js leg build.
const HIP = { x: -0.13, y: 0.935 };
const THIGH_LEN = 0.375;      // hip hinge to knee pivot
const SHIN_LEN = Math.hypot(0.395, 0.036);   // knee pivot to shoe center (with its toe offset)
const TOE_TILT = Math.atan2(0.036, 0.395);   // the shoe center's forward angle off the shin axis
const CRANK_CENTER = { x: -0.05, y: 0.32 };   // the bottom bracket
const CRANK_ARM = 0.17;       // pedal circle radius
const ANKLE_LIFT = 0.04;      // shoe center rides this far above the pedal top

let cyclists = [];

function createCyclist(cast, index) {
    const cyclistGroup = new THREE.Group();
    cyclistGroup.name = `trailCyclist${index}`;
    cyclistGroup.userData.isCyclist = true;
    cyclistGroup.userData.cyclistIndex = index;

    const bike = createHybridBike(cast.frame, false);
    cyclistGroup.add(bike.group);

    // The rider sits upright (hybrid posture), hands reaching for the bar
    const riderRig = new THREE.Group();
    const rider = createPerson({
        role: 'pedestrian',
        shirtColor: cast.shirt,
        pantsColor: cast.pants,
        skinTone: cast.skin,
        hairColor: cast.hair
    });
    rider.rotation.y = Math.PI / 2;   // person faces +Z by default; the bike faces +X
    rider.traverse((child) => {
        if (child.userData && child.userData.isArm) {
            // Solved empirically against the real transform chain (see the
            // note below): -1.01 lands the hand centers on the bar tube.
            // Counter-intuitively the torso lean SUBTRACTS from the arm's
            // world angle (lean forward and a hanging arm stays plumb), so
            // the reach must be steeper than flat-footed math suggests.
            child.rotation.x = -1.01;
            // And clear the builder's resting outward flare, which pushed
            // the hands laterally past the grip ends.
            child.rotation.z = 0;
        }
    });

    // The leg groups (untagged, hinged at hip height y 0.75, same selection
    // as applyBikeShorts), sorted for a stable left/right pedal phase.
    const legs = rider.children
        .filter((group) => group.isGroup && !group.userData.isArm
            && Math.abs(group.position.y - 0.75) < 0.02)
        .sort((a, b) => a.position.x - b.position.x);

    // Riding kit: helmet on, bike shorts (same helpers as Dad's)
    rider.add(createBikeHelmet(cast.helmet));
    applyBikeShorts(rider, cast.skin);

    // Re-hinge each leg at the knee AFTER the shorts recolor (which finds
    // parts by their original positions): everything at or below the knee
    // sphere (y -0.375 in leg space) moves into a subgroup pivoted there,
    // so the shin can fold behind the thigh during the pedal stroke. The
    // knee sphere lands on the pivot and covers the joint at any bend.
    const shins = legs.map((leg) => {
        const shinGroup = new THREE.Group();
        shinGroup.position.y = -0.375;
        [...leg.children].forEach((part) => {
            if (part.position.y <= -0.375 + 0.001) {
                leg.remove(part);
                part.position.y += 0.375;
                shinGroup.add(part);
            }
        });
        leg.add(shinGroup);
        return shinGroup;
    });

    riderRig.add(rider);
    // Hips back over the saddle, torso pitched into the riding lean that
    // brings the hands down onto the riser bar.
    rider.position.set(0, 0.2, 0);
    riderRig.rotation.z = -RIDER_LEAN;
    riderRig.position.set(-0.3, 0, 0);
    cyclistGroup.add(riderRig);

    cyclistGroup.position.set(cast.startX, 0, LAYOUT.trailZ + cast.lane);
    cyclistGroup.rotation.y = cast.dir > 0 ? 0 : Math.PI;

    trailGroup.add(cyclistGroup);

    return {
        group: cyclistGroup,
        wheels: bike.wheels,
        crank: bike.crank,
        legs,
        shins,
        lane: LAYOUT.trailZ + cast.lane,
        baseSpeed: cast.speed,
        dir: cast.dir,
        targetRotation: cast.dir > 0 ? 0 : Math.PI,
        paused: false
    };
}

function createTrailCyclists() {
    cyclists = [];
    const count = Math.min(
        (DAD_CONFIG.cyclists && DAD_CONFIG.cyclists.count) || 3,
        isMobileDevice() ? 2 : CYCLIST_CASTS.length
    );
    for (let i = 0; i < count; i++) {
        cyclists.push(createCyclist(CYCLIST_CASTS[i], i));
    }
}

/** Root groups for raycast targeting (click a rider to say hello). */
export function getCyclistMeshes() {
    return cyclists.map((c) => c.group);
}

/** Stop a rider mid-trail while their dialog is open. */
export function pauseCyclistForDialog(rootGroup) {
    const cyclist = cyclists.find((c) => c.group === rootGroup);
    if (cyclist) cyclist.paused = true;
}

/** Send the paused rider on their way again. */
export function resumeCyclistFromDialog() {
    cyclists.forEach((c) => { c.paused = false; });
}

/**
 * Advance the riders each frame: patrol the trail, slow briefly around the
 * player, U-turn smoothly at each end, spin wheels and pedals to match.
 */
export function updateTrailCyclists(playerPosition, deltaTime) {
    cyclists.forEach((cyclist) => {
        if (cyclist.paused) return;

        // Ease the U-turn: rotate toward the travel direction, ride slower
        // while still turning
        let rotationDiff = cyclist.targetRotation - cyclist.group.rotation.y;
        while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
        const turning = Math.abs(rotationDiff) > 0.05;
        if (turning) {
            const maxTurn = 5 * deltaTime;
            cyclist.group.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, rotationDiff));
        }

        // Courteous riders slow down near a visitor standing on the trail
        let speed = cyclist.baseSpeed * (turning ? 0.35 : 1);
        if (playerPosition) {
            const dx = playerPosition.x - cyclist.group.position.x;
            const dz = playerPosition.z - cyclist.group.position.z;
            if (Math.abs(dx) < 3.5 && Math.abs(dz) < 1.4) {
                speed *= 0.3;
            }
        }

        cyclist.group.position.x += speed * cyclist.dir * deltaTime;

        // Turn around at the ends of the stretch
        if (cyclist.group.position.x > CYCLIST_RANGE.maxX && cyclist.dir > 0) {
            cyclist.dir = -1;
            cyclist.targetRotation = Math.PI;
        } else if (cyclist.group.position.x < CYCLIST_RANGE.minX && cyclist.dir < 0) {
            cyclist.dir = 1;
            cyclist.targetRotation = 0;
        }

        // Wheels and pedals spin with ground speed (local forward is always
        // +X, so the spin direction is constant in the bike's frame)
        const wheelSpin = (speed / WHEEL_RADIUS) * deltaTime;
        cyclist.wheels.forEach((wheel) => { wheel.rotation.z -= wheelSpin; });
        cyclist.crank.rotation.z -= wheelSpin * 0.38;

        // Pedalling: two-bone IK per leg, so each foot rides its own pedal
        // around the crank circle. legs[0] sits at bike z +0.095 and pairs
        // with the +z crank arm; legs[1] mirrors. Knee bend falls out of
        // the geometry: deep at the top of the stroke, long at the bottom.
        const crankAngle = cyclist.crank.rotation.z;
        cyclist.legs.forEach((leg, i) => {
            const s = i === 0 ? 1 : -1;
            // This side's shoe target: its pedal, plus the ankle lift
            const px = CRANK_CENTER.x - s * CRANK_ARM * Math.sin(crankAngle);
            const py = CRANK_CENTER.y + s * CRANK_ARM * Math.cos(crankAngle) + ANKLE_LIFT;
            const dx = px - HIP.x;
            const dy = py - HIP.y;
            // Clamp the reach inside what the two bones can span
            const D = Math.min(THIGH_LEN + SHIN_LEN - 0.005,
                Math.max(Math.abs(THIGH_LEN - SHIN_LEN) + 0.005, Math.hypot(dx, dy)));
            const hipToPedal = Math.atan2(dx, -dy);   // from straight down, + forward
            const thighOff = Math.acos(Math.min(1, Math.max(-1,
                (THIGH_LEN * THIGH_LEN + D * D - SHIN_LEN * SHIN_LEN) / (2 * THIGH_LEN * D))));
            const kneeInterior = Math.acos(Math.min(1, Math.max(-1,
                (THIGH_LEN * THIGH_LEN + SHIN_LEN * SHIN_LEN - D * D) / (2 * THIGH_LEN * SHIN_LEN))));
            // Person-frame angles: the torso lean subtracts from a child's
            // world angle (same lesson as the arms), so add it back; the
            // knee fold is thigh-relative and needs no correction.
            leg.rotation.x = -(hipToPedal + thighOff + RIDER_LEAN);
            cyclist.shins[i].rotation.x = Math.PI - kneeInterior + TOE_TILT;
        });
    });
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
 * Get the trail root group
 */
export function getStoreGroup() {
    return trailGroup;
}

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = {
    shuffled, pickBalanced,
    createHybridBike, createGlasses,
    LAYOUT
};
