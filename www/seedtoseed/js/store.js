// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * store.js - Seed to Seed Garden Environment Construction
 *
 * Builds the Seed to Seed world: a very professional backyard vegetable
 * garden. Raised planter boxes bursting with tomatoes, lettuce, carrots,
 * and peppers, a walk-in greenhouse with seedling shelves, a pumpkin patch
 * and a corn row growing straight from the ground, compost bins, a rain
 * barrel by the greenhouse, a potting bench, and a picket fence ringing
 * all of it. The owner stands among his beds as the greeter, and a
 * butterfly works the flower borders.
 *
 * The module keeps the store.js name and its main exports (initStore,
 * STORE_CONFIG, getStoreCollisionBoxes, ...) so the conductor in main.js
 * keeps its stable import block, same as the other experiences.
 */

import { getScene } from '../../shared/js/scene-1.0.0.min.js';
import {
    initWorld, getColliders, registerOutdoorProp, getOutdoorPropMeshes, isMobileDevice
} from '../../shared/js/world-1.0.0.min.js';
import { SEED_CONFIG } from './config.min.js';
import { createPerson, shuffled, pickBalanced } from '../../shared/js/people-1.0.0.min.js';
import { createBackgroundScenery } from '../../shared/js/scenery-1.0.0.min.js';
import { registerHost, setHelpSign, createHelpSign, getVisitorMeshes } from '../../shared/js/npcs-1.0.0.min.js';

// Re-exports: main.js keeps importing these from store.min.js (stable import
// block); the implementations live in the shared parts library.
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
export const STORE_CONFIG = SEED_CONFIG.building;

// Outdoor props register with the shared world context; main.js still imports
// the getter from this module.
export { getOutdoorPropMeshes };

// World mesh groups
let gardenGroup = null;
let collisionBoxes = [];

// Visitors who ask for reduced motion get still butterflies (no flutter
// loops), matching the reduced-motion handling of the sky in scene.js.
const _reducedMotion = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

// ============================================
// LAYOUT
// ============================================
// The garden's heart is the raised beds in the middle, the greenhouse
// holds the northeast corner, the pumpkin patch and compost bins take the
// west side, and the lawn and the garden gate are to the south where the
// visitor spawns. The picket fence rings all four sides.
const LAYOUT = {
    lawnWidth: 56,          // visual extent along X
    lawnDepth: 44,          // visual extent along Z
    fenceX: 21,             // picket fence lines (east/west)
    fenceNorthZ: -13.6,     // picket fence line (north)
    fenceSouthZ: 15,        // picket fence line (south)
    gateX: -2,              // gate gap in the south fence, near the spawn
    beds: [                 // raised planter boxes: 2 rows x 2 columns, drawn
                            // in close around the paths without touching them
        { x: -4, z: 1.8, crop: 'tomato' },  { x: 4, z: 1.8, crop: 'pepper' },
        { x: -4, z: 5.2, crop: 'lettuce' }, { x: 4, z: 5.2, crop: 'carrot' }
    ],
    bedWidth: 2.6,
    bedDepth: 1.3,
    bedHeight: 0.42,
    greenhouse: { minX: 10.5, maxX: 16.5, minZ: -8, maxZ: -4, height: 2.6, ridge: 3.4 },
    pumpkinPatch: { minX: -15, maxX: -8.5, minZ: 1, maxZ: 7.5 },
    cornRowZ: -10.8,        // northmost corn row (rows step south from here)
    ownerSpot: { x: 1.5, z: -1 }
};

// ============================================
// TEXTURES (procedural, canvas-based)
// ============================================
let grassTexture = null;
let soilTexture = null;
let mulchTexture = null;

function makeCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
}

/** Well-kept lawn: layered greens with light blade speckle. */
function createGrassTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#4f8340';
    ctx.fillRect(0, 0, 256, 256);

    // Mottled patches so large planes don't read as one flat color
    for (let i = 0; i < 60; i++) {
        const shade = ['#457537', '#579048', '#3f6d33', '#5f9a4d'][i % 4];
        ctx.fillStyle = shade;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(Math.random() * 256, Math.random() * 256, 12 + Math.random() * 30, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Fine blade speckle
    for (let i = 0; i < 900; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#63a04f' : '#3d6a33';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 2.5);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(16, 12);
    return texture;
}

/** Rich, dark, well-amended garden soil (the kind Seed to Seed would insist on). */
function createSoilTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#3d2f22';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 1800; i++) {
        const tone = ['#33271c', '#4a3a2a', '#2c221a', '#554233', '#463527'][i % 5];
        ctx.fillStyle = tone;
        const s = 1 + Math.random() * 3;
        ctx.fillRect(Math.random() * 256, Math.random() * 256, s, s);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 1);
    return texture;
}

/** Shredded hardwood mulch for the garden paths. */
function createMulchTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#6b4a32';
    ctx.fillRect(0, 0, 256, 256);

    // Long thin chips laid every which way
    for (let i = 0; i < 700; i++) {
        const tone = ['#7d5940', '#5a3d28', '#8a6549', '#4e3623'][i % 4];
        ctx.strokeStyle = tone;
        ctx.lineWidth = 1.5 + Math.random() * 2;
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const angle = Math.random() * Math.PI;
        const len = 5 + Math.random() * 9;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 6);
    return texture;
}

function createTextures() {
    grassTexture = createGrassTexture();
    soilTexture = createSoilTexture();
    mulchTexture = createMulchTexture();
}

// ============================================
// SHARED MATERIALS
// ============================================
const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9, metalness: 0.0 });
const darkGreenFoliage = new THREE.MeshStandardMaterial({ color: 0x1a472a, roughness: 0.8, metalness: 0.0 });
const mediumGreenFoliage = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8, metalness: 0.0 });
const lightGreenFoliage = new THREE.MeshStandardMaterial({ color: 0x4a7c23, roughness: 0.8, metalness: 0.0 });
const bushMaterial = new THREE.MeshStandardMaterial({ color: 0x355e3b, roughness: 0.85, metalness: 0.0 });
const cedarWood = new THREE.MeshStandardMaterial({ color: 0x9a6b47, roughness: 0.85, metalness: 0.0 });
const weatheredWood = new THREE.MeshStandardMaterial({ color: 0x9c7b52, roughness: 0.9, metalness: 0.0 });
const darkWood = new THREE.MeshStandardMaterial({ color: 0x6b4f33, roughness: 0.85, metalness: 0.05 });
const whitePicket = new THREE.MeshStandardMaterial({ color: 0xeceae2, roughness: 0.8, metalness: 0.0 });
const greenhouseFrame = new THREE.MeshStandardMaterial({ color: 0x4c5a52, roughness: 0.5, metalness: 0.4 });
const greenhouseGlass = new THREE.MeshStandardMaterial({
    color: 0xd8ecdf, transparent: true, opacity: 0.45,
    roughness: 0.15, metalness: 0.05, side: THREE.DoubleSide
});
// The roof runs much more opaque than the walls: seen near edge-on against
// the sky, panels at wall opacity all but disappear.
const greenhouseRoofGlass = new THREE.MeshStandardMaterial({
    color: 0xd8ecdf, transparent: true, opacity: 0.8,
    roughness: 0.25, metalness: 0.05, side: THREE.DoubleSide
});
const stemGreen = new THREE.MeshStandardMaterial({ color: 0x3f7030, roughness: 0.8, metalness: 0.0 });
const leafGreen = new THREE.MeshStandardMaterial({ color: 0x4a8a38, roughness: 0.8, metalness: 0.0 });
const tomatoRed = new THREE.MeshStandardMaterial({ color: 0xd8482a, roughness: 0.55, metalness: 0.0 });
const pepperYellow = new THREE.MeshStandardMaterial({ color: 0xe6a817, roughness: 0.55, metalness: 0.0 });
const pumpkinOrange = new THREE.MeshStandardMaterial({ color: 0xd9721f, roughness: 0.7, metalness: 0.0 });
const carrotGreen = new THREE.MeshStandardMaterial({ color: 0x5a9a42, roughness: 0.8, metalness: 0.0 });
const galvanized = new THREE.MeshStandardMaterial({ color: 0x9aa4a8, roughness: 0.5, metalness: 0.6 });
const terracotta = new THREE.MeshStandardMaterial({ color: 0xb0603c, roughness: 0.85, metalness: 0.0 });

/**
 * Initialize the garden world
 */
export function initStore() {
    const scene = getScene();
    if (!scene) {
        return;
    }

    // The shared world context owns the root group, the collider registry, and
    // the outdoor-prop registry. Local aliases keep every builder below (and
    // the direct collisionBoxes.push sites) working unchanged.
    gardenGroup = initWorld(SEED_CONFIG);
    collisionBoxes = getColliders();

    createTextures();

    createTerrain();          // lawn and the mulch garden paths
    createPerimeterFence();   // white pickets around the yard, with a gate
    createRaisedBeds();       // the signature Seed to Seed planter boxes
    createGreenhouse();       // walk-in greenhouse with seedling shelves
    createGroundCrops();      // pumpkin patch and the corn row
    createCompostAndBarrel(); // compost bins and the rain barrel
    createGardenFurniture();  // bench, potting bench, wheelbarrow, signs
    createOrchardAndFlowers();// fruit trees and the flower borders
    createOwner();            // the gardener himself, plus his Hello sign
    createGardenLights();     // landscape spotlights that wake at dusk
    createButterflies();      // a little life over the flowers

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

    const { lawnWidth, lawnDepth } = LAYOUT;

    const grassMaterial = new THREE.MeshStandardMaterial({
        map: grassTexture, roughness: 0.95, metalness: 0.0
    });

    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(lawnWidth, lawnDepth), grassMaterial);
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(0, 0, -1);
    lawn.receiveShadow = true;
    terrainGroup.add(lawn);

    const mulchMaterial = new THREE.MeshStandardMaterial({
        map: mulchTexture, roughness: 0.95, metalness: 0.0
    });

    // Main path: gate to the beds, ending on the lawn just short of the
    // corn block's tilled bed (which starts near z -7.95)
    const mainPath = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 22), mulchMaterial);
    mainPath.rotation.x = -Math.PI / 2;
    mainPath.position.set(LAYOUT.gateX + 2, 0.014, 3.5);
    mainPath.receiveShadow = true;
    terrainGroup.add(mainPath);

    // Cross path between the two rows of beds
    const crossPath = new THREE.Mesh(new THREE.PlaneGeometry(19, 1.8), mulchMaterial.clone());
    crossPath.material.map = mulchTexture.clone();
    crossPath.material.map.needsUpdate = true;
    crossPath.material.map.repeat.set(6, 2);
    crossPath.rotation.x = -Math.PI / 2;
    crossPath.position.set(0, 0.012, 3.5);
    crossPath.receiveShadow = true;
    terrainGroup.add(crossPath);

    // Spur to the greenhouse door
    const spur = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 8), mulchMaterial.clone());
    spur.material.map = mulchTexture.clone();
    spur.material.map.needsUpdate = true;
    spur.material.map.repeat.set(2, 3);
    spur.rotation.x = -Math.PI / 2;
    spur.position.set(13.5, 0.016, 0.2);
    spur.receiveShadow = true;
    terrainGroup.add(spur);

    gardenGroup.add(terrainGroup);
}

// ============================================
// PERIMETER FENCE (white pickets, with a gate)
// ============================================
function createPicketRun(fenceGroup, x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.sqrt(dx * dx + dz * dz);
    const count = Math.max(2, Math.round(length / 0.5)) + 1;

    // One InstancedMesh per run: every picket in a single draw call instead
    // of a mesh (and a shadow-pass draw) apiece. ~200 pickets ring the yard,
    // so this is the difference between 4 draws and ~200.
    const pickets = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.12, 1.0, 0.04), whitePicket, count
    );
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(0, Math.atan2(dx, dz), 0));
    const unit = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        pos.set(x1 + dx * t, 0.5, z1 + dz * t);
        matrix.compose(pos, quaternion, unit);
        pickets.setMatrixAt(i, matrix);
    }
    pickets.instanceMatrix.needsUpdate = true;
    pickets.castShadow = true;
    fenceGroup.add(pickets);

    // Two horizontal rails
    [0.35, 0.78].forEach((y) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, length), whitePicket);
        rail.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
        rail.rotation.y = Math.atan2(dx, dz);
        fenceGroup.add(rail);
    });
}

function createPerimeterFence() {
    const fenceGroup = new THREE.Group();
    fenceGroup.name = 'picketFence';

    const { fenceX, fenceNorthZ, fenceSouthZ, gateX } = LAYOUT;

    // East and west runs, corner to corner
    createPicketRun(fenceGroup, -fenceX, fenceNorthZ, -fenceX, fenceSouthZ);
    createPicketRun(fenceGroup, fenceX, fenceNorthZ, fenceX, fenceSouthZ);

    // North run, closing off the top of the yard
    createPicketRun(fenceGroup, -fenceX, fenceNorthZ, fenceX, fenceNorthZ);

    // South run, split by the gate near the spawn
    createPicketRun(fenceGroup, -fenceX, fenceSouthZ, gateX - 1.2, fenceSouthZ);
    createPicketRun(fenceGroup, gateX + 1.2, fenceSouthZ, fenceX, fenceSouthZ);

    // The gate itself: a proper picket gate, hinged on the gap's west post
    // and swung inward in welcome. Built along local +X (hinge at origin)
    // so rotating the group swings it like a door.
    const gate = new THREE.Group();
    const gateWidth = 2.2;
    for (let i = 0; i < 5; i++) {
        const picket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.04), whitePicket);
        picket.position.set(0.2 + i * ((gateWidth - 0.4) / 4), 0.48, 0);
        gate.add(picket);
    }
    [0.32, 0.72].forEach((y) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(gateWidth, 0.09, 0.05), whitePicket);
        rail.position.set(gateWidth / 2, y, 0.03);
        gate.add(rail);
    });
    gate.position.set(gateX - 1.2, 0, fenceSouthZ);
    gate.rotation.y = 0.55; // swung into the yard, holding the door for you
    fenceGroup.add(gate);

    registerOutdoorProp(fenceGroup, 'fence');

    // Colliders (the player is clamped by worldBounds first; these keep the
    // strolling visitors honest)
    collisionBoxes.push({
        box: new THREE.Box3(new THREE.Vector3(-fenceX - 0.2, 0, fenceNorthZ), new THREE.Vector3(-fenceX + 0.2, 1.2, fenceSouthZ)),
        type: 'fence'
    });
    collisionBoxes.push({
        box: new THREE.Box3(new THREE.Vector3(fenceX - 0.2, 0, fenceNorthZ), new THREE.Vector3(fenceX + 0.2, 1.2, fenceSouthZ)),
        type: 'fence'
    });
    collisionBoxes.push({
        box: new THREE.Box3(new THREE.Vector3(-fenceX, 0, fenceNorthZ - 0.2), new THREE.Vector3(fenceX, 1.2, fenceNorthZ + 0.2)),
        type: 'fence'
    });
    collisionBoxes.push({
        box: new THREE.Box3(new THREE.Vector3(-fenceX, 0, fenceSouthZ - 0.2), new THREE.Vector3(fenceX, 1.2, fenceSouthZ + 0.2)),
        type: 'fence'
    });

    gardenGroup.add(fenceGroup);
}

// ============================================
// RAISED BEDS (the signature planter boxes)
// ============================================

/** A tomato plant: a stake, a leafy column, and ripe fruit. */
function createTomatoPlant(x, z) {
    const plant = new THREE.Group();

    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 5), darkWood);
    stake.position.set(0.06, 0.75, 0);
    plant.add(stake);

    const tufts = [];
    for (let i = 0; i < 3; i++) {
        const radius = 0.19 - i * 0.03;
        const tuft = new THREE.Mesh(new THREE.SphereGeometry(radius, 6, 5), leafGreen);
        tuft.position.set((Math.random() - 0.5) * 0.08, 0.42 + i * 0.34, (Math.random() - 0.5) * 0.08);
        tuft.scale.y = 0.85;
        plant.add(tuft);
        tufts.push({ x: tuft.position.x, y: tuft.position.y, z: tuft.position.z, r: radius });
    }

    // Fruit hangs off the foliage tufts themselves (poking out of the leaf
    // ball, a touch low, like real trusses) rather than floating on a fixed
    // ring around the stake wherever the tufts happen not to be.
    for (let i = 0; i < 4; i++) {
        const tuft = tufts[i % tufts.length];
        const angle = Math.random() * Math.PI * 2;
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), tomatoRed);
        fruit.position.set(
            tuft.x + Math.cos(angle) * tuft.r * 0.85,
            tuft.y - tuft.r * 0.25,
            tuft.z + Math.sin(angle) * tuft.r * 0.85
        );
        plant.add(fruit);
    }

    plant.position.set(x, 0, z);
    return plant;
}

/** A pepper plant: a low leafy mound with bright fruit. */
function createPepperPlant(x, z) {
    const plant = new THREE.Group();

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), mediumGreenFoliage);
    body.position.y = 0.2;
    body.scale.y = 0.9;
    plant.add(body);

    for (let i = 0; i < 3; i++) {
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), pepperYellow);
        const angle = (i / 3) * Math.PI * 2 + Math.random();
        fruit.position.set(Math.cos(angle) * 0.13, 0.15 + Math.random() * 0.12, Math.sin(angle) * 0.13);
        fruit.scale.y = 1.5;
        plant.add(fruit);
    }

    plant.position.set(x, 0, z);
    return plant;
}

/** A lettuce head: a flattened rosette. */
function createLettuceHead(x, z) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 5), lightGreenFoliage);
    head.position.set(x, 0.08, z);
    head.scale.y = 0.55;
    return head;
}

/** Carrot tops: a couple of feathery cones. */
function createCarrotTop(x, z) {
    const top = new THREE.Group();
    for (let i = 0; i < 3; i++) {
        const frond = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 5), carrotGreen);
        frond.position.set((Math.random() - 0.5) * 0.06, 0.11, (Math.random() - 0.5) * 0.06);
        frond.rotation.z = (Math.random() - 0.5) * 0.4;
        top.add(frond);
    }
    top.position.set(x, 0, z);
    return top;
}

/** One raised cedar bed, filled with dark soil and a healthy crop. */
function createRaisedBed(bedSpec) {
    const bed = new THREE.Group();
    bed.name = 'raisedBed';

    const { bedWidth, bedDepth, bedHeight } = LAYOUT;
    const t = 0.09; // plank thickness

    // Four cedar sides (long sides run along X)
    const longGeometry = new THREE.BoxGeometry(bedWidth, bedHeight, t);
    const shortGeometry = new THREE.BoxGeometry(t, bedHeight, bedDepth);
    [[0, -bedDepth / 2], [0, bedDepth / 2]].forEach(([dx, dz]) => {
        const side = new THREE.Mesh(longGeometry, cedarWood);
        side.position.set(dx, bedHeight / 2, dz);
        side.castShadow = true;
        bed.add(side);
    });
    [[-bedWidth / 2, 0], [bedWidth / 2, 0]].forEach(([dx, dz]) => {
        const side = new THREE.Mesh(shortGeometry, cedarWood);
        side.position.set(dx, bedHeight / 2, dz);
        side.castShadow = true;
        bed.add(side);
    });

    // Corner posts, slightly proud of the planks (the joinery detail that
    // makes a bed read as built rather than placed)
    const postGeometry = new THREE.BoxGeometry(0.12, bedHeight + 0.08, 0.12);
    [[-bedWidth / 2, -bedDepth / 2], [bedWidth / 2, -bedDepth / 2],
     [-bedWidth / 2, bedDepth / 2], [bedWidth / 2, bedDepth / 2]].forEach(([dx, dz]) => {
        const post = new THREE.Mesh(postGeometry, darkWood);
        post.position.set(dx, (bedHeight + 0.08) / 2, dz);
        bed.add(post);
    });

    // The soil, just below the rim
    const soil = new THREE.Mesh(
        new THREE.PlaneGeometry(bedWidth - t * 2, bedDepth - t * 2),
        new THREE.MeshStandardMaterial({ map: soilTexture.clone(), roughness: 1.0 })
    );
    soil.material.map.needsUpdate = true;
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = bedHeight - 0.07;
    bed.add(soil);

    // The crop, planted in tidy offsets above the soil line
    const soilY = bedHeight - 0.07;
    const cols = bedSpec.crop === 'tomato' || bedSpec.crop === 'pepper' ? 3 : 5;
    for (let i = 0; i < cols; i++) {
        const px = -bedWidth / 2 + (i + 0.5) * (bedWidth / cols);
        for (let j = 0; j < 2; j++) {
            const pz = -bedDepth / 4 + j * (bedDepth / 2);
            let plant = null;
            if (bedSpec.crop === 'tomato' && j === 0 && i % 1 === 0) {
                if (i % 2 === 0 || cols === 3) plant = createTomatoPlant(px, pz);
            } else if (bedSpec.crop === 'tomato') {
                plant = createLettuceHead(px, pz); // interplanted, like a pro would
            } else if (bedSpec.crop === 'pepper') {
                plant = createPepperPlant(px, pz);
            } else if (bedSpec.crop === 'lettuce') {
                plant = createLettuceHead(px, pz);
            } else if (bedSpec.crop === 'carrot') {
                plant = createCarrotTop(px, pz);
            }
            if (plant) {
                plant.position.y = soilY;
                bed.add(plant);
            }
        }
    }

    bed.position.set(bedSpec.x, 0, bedSpec.z);

    registerOutdoorProp(bed, 'planter');

    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(bedSpec.x - bedWidth / 2 - 0.05, 0, bedSpec.z - bedDepth / 2 - 0.05),
            new THREE.Vector3(bedSpec.x + bedWidth / 2 + 0.05, bedHeight + 0.4, bedSpec.z + bedDepth / 2 + 0.05)
        ),
        type: 'decor'
    });

    gardenGroup.add(bed);
}

function createRaisedBeds() {
    LAYOUT.beds.forEach(createRaisedBed);

    // Drip irrigation header line along the cross path (the professional touch)
    const line = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 17, 5),
        new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.8 })
    );
    line.rotation.z = Math.PI / 2;
    line.position.set(0, 0.05, 2.6);
    gardenGroup.add(line);
}

// ============================================
// THE GREENHOUSE
// ============================================
// A walk-in frame greenhouse with translucent panels, its door standing
// open to the garden, and seedling shelves inside. isInsideGreenhouse lets
// main.js tick the discovery when a visitor actually steps in.

function createGreenhouse() {
    const gh = LAYOUT.greenhouse;
    const width = gh.maxX - gh.minX;
    const depth = gh.maxZ - gh.minZ;
    const cx = (gh.minX + gh.maxX) / 2;
    const cz = (gh.minZ + gh.maxZ) / 2;

    const ghGroup = new THREE.Group();
    ghGroup.name = 'greenhouse';

    // Frame posts at the corners and the door
    const postGeometry = new THREE.BoxGeometry(0.1, gh.height, 0.1);
    [[gh.minX, gh.minZ], [gh.maxX, gh.minZ], [gh.minX, gh.maxZ], [gh.maxX, gh.maxZ]].forEach(([x, z]) => {
        const post = new THREE.Mesh(postGeometry, greenhouseFrame);
        post.position.set(x, gh.height / 2, z);
        post.castShadow = true;
        ghGroup.add(post);
    });

    // Glass walls. The south wall (facing the garden) leaves a door gap in
    // the middle; everything else is a full panel.
    const doorHalf = 0.65;
    const wallY = gh.height / 2;

    // North wall (full)
    const north = new THREE.Mesh(new THREE.PlaneGeometry(width, gh.height), greenhouseGlass);
    north.position.set(cx, wallY, gh.minZ);
    ghGroup.add(north);

    // South wall (two panels flanking the door gap)
    const southPanelW = (width - doorHalf * 2) / 2;
    [gh.minX + southPanelW / 2, gh.maxX - southPanelW / 2].forEach((x) => {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(southPanelW, gh.height), greenhouseGlass);
        panel.position.set(x, wallY, gh.maxZ);
        ghGroup.add(panel);
    });
    // Transom over the door
    const transom = new THREE.Mesh(new THREE.PlaneGeometry(doorHalf * 2, gh.height - 2.0), greenhouseGlass);
    transom.position.set(cx, 2.0 + (gh.height - 2.0) / 2, gh.maxZ);
    ghGroup.add(transom);
    // Door frame uprights
    [cx - doorHalf, cx + doorHalf].forEach((x) => {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.08, gh.height, 0.08), greenhouseFrame);
        jamb.position.set(x, gh.height / 2, gh.maxZ);
        ghGroup.add(jamb);
    });

    // East and west walls (full)
    [gh.minX, gh.maxX].forEach((x) => {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(depth, gh.height), greenhouseGlass);
        side.rotation.y = Math.PI / 2;
        side.position.set(x, wallY, cz);
        ghGroup.add(side);
    });

    // Gable roof: two glass slopes meeting at a ridge. Each plane is first
    // laid flat (rotation.x) and then tilted about the world Z axis
    // (rotation.z, applied last via the ZXY order): a positive Z rotation
    // raises a flat plane's +X end, so the west slope (+angle) climbs
    // eastward to the ridge and the east slope (-angle) climbs westward.
    const slopeLen = Math.sqrt((width / 2) ** 2 + (gh.ridge - gh.height) ** 2);
    const slopeAngle = Math.atan2(gh.ridge - gh.height, width / 2);
    [[1, cx - width / 4], [-1, cx + width / 4]].forEach(([tilt, x]) => {
        const slope = new THREE.Mesh(new THREE.PlaneGeometry(slopeLen, depth), greenhouseRoofGlass);
        slope.rotation.order = 'ZXY';
        slope.rotation.x = -Math.PI / 2;
        slope.rotation.z = tilt * slopeAngle;
        slope.position.set(x, (gh.height + gh.ridge) / 2, cz);
        ghGroup.add(slope);
    });
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, depth), greenhouseFrame);
    ridge.position.set(cx, gh.ridge, cz);
    ghGroup.add(ridge);

    // Gable end triangles, closing the gap between the wall tops and the
    // roof slopes. Vertical like the walls, so they glaze at wall opacity.
    [gh.minZ, gh.maxZ].forEach((z) => {
        const tri = new THREE.BufferGeometry();
        tri.setAttribute('position', new THREE.Float32BufferAttribute([
            gh.minX, gh.height, z,
            cx, gh.ridge, z,
            gh.maxX, gh.height, z
        ], 3));
        tri.computeVertexNormals();
        ghGroup.add(new THREE.Mesh(tri, greenhouseGlass));
    });

    // Seedling shelves inside: two staging tables with rows of tiny starts
    [[gh.minZ + 0.55], [gh.maxZ - 0.55]].forEach(([z], tableIdx) => {
        if (tableIdx === 1) return; // one long table along the back keeps the walk-in clear
        const table = new THREE.Mesh(new THREE.BoxGeometry(width - 0.8, 0.06, 0.9), weatheredWood);
        table.position.set(cx, 0.85, z);
        table.castShadow = true;
        ghGroup.add(table);
        [-1.8, 0, 1.8].forEach((dx) => {
            const legPair = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.85, 0.7), darkWood);
            legPair.position.set(cx + dx, 0.42, z);
            ghGroup.add(legPair);
        });
        // Trays of seedlings
        for (let i = 0; i < 6; i++) {
            const tray = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.35),
                new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 }));
            const tx = gh.minX + 0.9 + i * ((width - 1.8) / 5);
            tray.position.set(tx, 0.91, z);
            ghGroup.add(tray);
            for (let s = 0; s < 4; s++) {
                const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), lightGreenFoliage);
                sprout.position.set(tx - 0.18 + s * 0.12, 0.99, z + (Math.random() - 0.5) * 0.12);
                ghGroup.add(sprout);
            }
        }
        // A few terracotta pots under the table, in the clear span between
        // the west leg (x ~11.7) and the center leg (x ~13.5)
        for (let i = 0; i < 3; i++) {
            const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.18, 8), terracotta);
            pot.position.set(cx - 1.2 + i * 0.45, 0.09, z + 0.1);
            ghGroup.add(pot);
        }
    });

    // Shadows: only the frame posts and the seedling table cast (set where
    // they are built above). Blanketing every tray and sprout with castShadow
    // doubled the shadow pass for no visible gain.

    registerOutdoorProp(ghGroup, 'greenhouse');

    // Colliders: three solid walls, plus the two south segments flanking the
    // open door, so visitors walk in through the doorway like anyone else.
    const wall = 0.15;
    collisionBoxes.push({ box: new THREE.Box3(new THREE.Vector3(gh.minX - wall, 0, gh.minZ - wall), new THREE.Vector3(gh.maxX + wall, gh.height, gh.minZ + wall)), type: 'wall' });
    collisionBoxes.push({ box: new THREE.Box3(new THREE.Vector3(gh.minX - wall, 0, gh.minZ), new THREE.Vector3(gh.minX + wall, gh.height, gh.maxZ)), type: 'wall' });
    collisionBoxes.push({ box: new THREE.Box3(new THREE.Vector3(gh.maxX - wall, 0, gh.minZ), new THREE.Vector3(gh.maxX + wall, gh.height, gh.maxZ)), type: 'wall' });
    const doorMinX = (gh.minX + gh.maxX) / 2 - doorHalf;
    const doorMaxX = (gh.minX + gh.maxX) / 2 + doorHalf;
    collisionBoxes.push({ box: new THREE.Box3(new THREE.Vector3(gh.minX, 0, gh.maxZ - wall), new THREE.Vector3(doorMinX, gh.height, gh.maxZ + wall)), type: 'wall' });
    collisionBoxes.push({ box: new THREE.Box3(new THREE.Vector3(doorMaxX, 0, gh.maxZ - wall), new THREE.Vector3(gh.maxX, gh.height, gh.maxZ + wall)), type: 'wall' });
    // The seedling table
    collisionBoxes.push({ box: new THREE.Box3(new THREE.Vector3(gh.minX + 0.3, 0, gh.minZ + 0.1), new THREE.Vector3(gh.maxX - 0.3, 1.0, gh.minZ + 1.0)), type: 'decor' });

    gardenGroup.add(ghGroup);
}

/** True when a position is inside the greenhouse footprint (used by main.js
 *  to tick the 'greenhouse' discovery the moment a visitor steps in). */
export function isInsideGreenhouse(position) {
    const gh = LAYOUT.greenhouse;
    return position.x > gh.minX + 0.2 && position.x < gh.maxX - 0.2 &&
           position.z > gh.minZ + 0.2 && position.z < gh.maxZ - 0.2;
}

// ============================================
// GROUND CROPS (pumpkin patch and the corn row)
// ============================================
function createGroundCrops() {
    const cropsGroup = new THREE.Group();
    cropsGroup.name = 'groundCrops';

    // --- The pumpkin patch: tilled mounds, sprawling leaves, proud pumpkins ---
    const patch = LAYOUT.pumpkinPatch;
    const patchGroup = new THREE.Group();
    patchGroup.name = 'pumpkinPatch';

    const tilled = new THREE.Mesh(
        new THREE.PlaneGeometry(patch.maxX - patch.minX, patch.maxZ - patch.minZ),
        new THREE.MeshStandardMaterial({ map: soilTexture.clone(), roughness: 1.0 })
    );
    tilled.material.map.needsUpdate = true;
    tilled.material.map.repeat.set(3, 3);
    tilled.rotation.x = -Math.PI / 2;
    tilled.position.set((patch.minX + patch.maxX) / 2, 0.014, (patch.minZ + patch.maxZ) / 2);
    tilled.receiveShadow = true;
    patchGroup.add(tilled);

    const pumpkinSpots = [
        { x: -13.6, z: 2.2, s: 0.34 }, { x: -11.2, z: 3.1, s: 0.42 },
        { x: -9.6, z: 2.0, s: 0.27 }, { x: -13.9, z: 5.4, s: 0.3 },
        { x: -11.6, z: 6.2, s: 0.48 }, { x: -9.3, z: 5.6, s: 0.36 }
    ];
    pumpkinSpots.forEach((spot) => {
        const pumpkin = new THREE.Mesh(new THREE.SphereGeometry(spot.s, 9, 7), pumpkinOrange);
        pumpkin.position.set(spot.x, spot.s * 0.7, spot.z);
        pumpkin.scale.y = 0.75;
        pumpkin.castShadow = true;
        patchGroup.add(pumpkin);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.14, 5), stemGreen);
        stem.position.set(spot.x, spot.s * 1.35, spot.z);
        stem.rotation.z = 0.25;
        patchGroup.add(stem);
        // Big sprawling leaves around each fruit
        for (let i = 0; i < 3; i++) {
            const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.2 + Math.random() * 0.1, 6), leafGreen);
            const angle = Math.random() * Math.PI * 2;
            leaf.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.4;
            leaf.position.set(spot.x + Math.cos(angle) * 0.55, 0.06 + Math.random() * 0.05, spot.z + Math.sin(angle) * 0.55);
            patchGroup.add(leaf);
        }
    });

    registerOutdoorProp(patchGroup, 'pumpkin');
    cropsGroup.add(patchGroup);

    // --- The corn block along the north end of the yard ---
    // Corn is wind-pollinated, so it is planted in a block of rows rather
    // than a single line (one lonely row barely sets ears, as Seed to Seed
    // would be the first to point out). Rows step south from cornRowZ, each
    // offset half a spacing so the stalks stagger like a real planting.
    const cornGroup = new THREE.Group();
    cornGroup.name = 'cornBlock';

    const ROW_SPACING = 0.9;
    const cornRows = isMobileDevice() ? 2 : 3;

    // Tilled soil bed under the whole block (matching the pumpkin patch), a
    // little wider than the rows so the jittered stalks all land on dirt
    const bedDepthZ = (cornRows - 1) * ROW_SPACING + 2.0;
    const cornBed = new THREE.Mesh(
        new THREE.PlaneGeometry(8.5, bedDepthZ),
        new THREE.MeshStandardMaterial({ map: soilTexture.clone(), roughness: 1.0 })
    );
    cornBed.material.map.needsUpdate = true;
    cornBed.material.map.repeat.set(4, 2);
    cornBed.rotation.x = -Math.PI / 2;
    cornBed.position.set(0.5, 0.014, LAYOUT.cornRowZ + (cornRows - 1) * ROW_SPACING / 2);
    cornBed.receiveShadow = true;
    cornGroup.add(cornBed);

    const tasselMaterial = new THREE.MeshStandardMaterial({ color: 0xd7c176, roughness: 0.8 });
    const huskMaterial = new THREE.MeshStandardMaterial({ color: 0xbdb45e, roughness: 0.8 });
    for (let row = 0; row < cornRows; row++) {
        const rowZ = LAYOUT.cornRowZ + row * ROW_SPACING;
        const rowOffsetX = (row % 2) * 0.55;   // stagger alternate rows
        // Six stalks per row (was nine): with the three-piece tassels the
        // longer rows pushed the block's mesh count into visible frame cost
        for (let x = -2.25; x <= 3.3; x += 1.1) {
            const stalkHeight = 1.9 + Math.random() * 0.4;
            const sx = x + rowOffsetX + (Math.random() - 0.5) * 0.2;
            const sz = rowZ + (Math.random() - 0.5) * 0.25;

            const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, stalkHeight, 5), stemGreen);
            stalk.position.set(sx, stalkHeight / 2, sz);
            cornGroup.add(stalk);

            // Leaves: long flattened blades arching up and outward, alternating
            // sides in a single plane the way real corn leaves grow. (The first
            // pass rotated round cones nearly horizontal, which read as spikes.)
            for (let i = 0; i < 4; i++) {
                const side = i % 2 ? 1 : -1;
                const attachY = stalkHeight * (0.28 + i * 0.16);
                const tilt = 0.68 + i * 0.08;      // upper leaves arch wider
                const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.75, 4), leafGreen);
                blade.scale.z = 0.28;              // a blade, not a spike
                blade.rotation.z = -side * tilt;
                blade.position.set(
                    sx + side * Math.sin(tilt) * 0.375,
                    attachY + Math.cos(tilt) * 0.375,
                    sz
                );
                cornGroup.add(blade);
            }

            // A husk-wrapped ear hugging the stalk (front row only: it is the
            // row visitors see up close, and it keeps the mesh count down)
            if (row === cornRows - 1) {
                const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), huskMaterial);
                ear.scale.set(1, 2.2, 1);
                ear.position.set(sx + 0.07, stalkHeight * 0.48, sz + 0.03);
                ear.rotation.z = -0.25;
                cornGroup.add(ear);
            }

            // Tassel: a tall center spike with a shorter frond splayed out to
            // each side at ~45 degrees, the way a real tassel frays open
            const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), tasselMaterial);
            tassel.position.set(sx, stalkHeight + 0.16, sz);
            cornGroup.add(tassel);
            [-1, 1].forEach((side) => {
                const frond = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 4), tasselMaterial);
                frond.rotation.z = -side * Math.PI / 4;
                frond.position.set(sx + side * 0.07, stalkHeight + 0.09, sz);
                cornGroup.add(frond);
            });
        }
    }

    registerOutdoorProp(cornGroup, 'corn');
    // Keep the strolling visitors from wandering through the stalks
    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(-3.1, 0, LAYOUT.cornRowZ - 0.6),
            new THREE.Vector3(4.7, 2.2, LAYOUT.cornRowZ + (cornRows - 1) * ROW_SPACING + 0.6)
        ),
        type: 'decor'
    });
    cropsGroup.add(cornGroup);

    gardenGroup.add(cropsGroup);
}

// ============================================
// COMPOST BINS AND THE RAIN BARREL
// ============================================
function createCompostAndBarrel() {
    // --- Two-bay compost bin along the west fence ---
    const compostGroup = new THREE.Group();
    compostGroup.name = 'compostBins';

    const bayW = 1.5, bayD = 1.3, bayH = 0.95;
    [-8.2, -5.6].forEach((z, idx) => {
        const bay = new THREE.Group();
        // Slatted back and sides
        [[-bayW / 2, 0, 0.06, bayD], [bayW / 2, 0, 0.06, bayD]].forEach(([dx, dz, w, d]) => {
            for (let y = 0.14; y < bayH; y += 0.24) {
                const slat = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), weatheredWood);
                slat.position.set(dx, y, dz);
                bay.add(slat);
            }
        });
        for (let y = 0.14; y < bayH; y += 0.24) {
            const back = new THREE.Mesh(new THREE.BoxGeometry(bayW, 0.16, 0.06), weatheredWood);
            back.position.set(0, y, -bayD / 2);
            bay.add(back);
        }
        // Corner posts
        [[-bayW / 2, -bayD / 2], [bayW / 2, -bayD / 2], [-bayW / 2, bayD / 2], [bayW / 2, bayD / 2]].forEach(([dx, dz]) => {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, bayH + 0.1, 0.09), darkWood);
            post.position.set(dx, (bayH + 0.1) / 2, dz);
            bay.add(post);
        });
        // The pile itself: one bay fresh and leafy, one dark and finished
        const pile = new THREE.Mesh(
            new THREE.SphereGeometry(bayW * 0.42, 8, 6),
            idx === 0
                ? new THREE.MeshStandardMaterial({ color: 0x4d5a2e, roughness: 1.0 })
                : new THREE.MeshStandardMaterial({ color: 0x2e2419, roughness: 1.0 })
        );
        pile.position.set(0, 0.3, 0);
        pile.scale.y = 0.55;
        bay.add(pile);

        bay.position.set(-17.8, 0, z);
        bay.rotation.y = Math.PI / 2; // open side faces the garden
        compostGroup.add(bay);
    });

    registerOutdoorProp(compostGroup, 'compost');
    collisionBoxes.push({
        box: new THREE.Box3(new THREE.Vector3(-18.6, 0, -9.2), new THREE.Vector3(-17.0, 1.1, -4.8)),
        type: 'decor'
    });
    gardenGroup.add(compostGroup);

    // --- Rain barrel beside the greenhouse, fed from its roof ---
    const barrelGroup = new THREE.Group();
    barrelGroup.name = 'rainBarrel';

    const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.42, 1.05, 12),
        new THREE.MeshStandardMaterial({ color: 0x3e5748, roughness: 0.7 })
    );
    barrel.position.y = 0.53;
    barrel.castShadow = true;
    barrelGroup.add(barrel);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.06, 12), galvanized);
    lid.position.y = 1.08;
    barrelGroup.add(lid);
    const spigot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6), galvanized);
    spigot.rotation.x = Math.PI / 2;
    spigot.position.set(0, 0.25, 0.5);
    barrelGroup.add(spigot);
    // A watering can waiting beside it (on the garden side, clear of the wall)
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.32, 10), galvanized);
    can.position.set(-0.75, 0.16, 0.2);
    barrelGroup.add(can);
    const canSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.34, 6), galvanized);
    canSpout.rotation.z = -0.8;
    canSpout.position.set(-0.55, 0.26, 0.2);
    barrelGroup.add(canSpout);

    barrelGroup.position.set(9.6, 0, -7.2); // tucked against the greenhouse's west wall
    registerOutdoorProp(barrelGroup, 'barrel');
    collisionBoxes.push({
        box: new THREE.Box3(new THREE.Vector3(8.6, 0, -7.75), new THREE.Vector3(10.15, 1.2, -6.65)),
        type: 'decor'
    });
    gardenGroup.add(barrelGroup);
}

// ============================================
// GARDEN FURNITURE
// ============================================

/** Wooden-slat bench with metal legs (carried over from the shared outdoor
 *  bench design, placed by position and facing). */
function createGardenBench(x, z, rotationY = 0) {
    const benchGroup = new THREE.Group();
    benchGroup.name = 'gardenBench';

    const seatWidth = 2.0;
    const seatDepth = 0.45;
    const seatHeight = 0.45;
    const seatThickness = 0.06;
    const backHeight = 0.5;
    const backThickness = 0.05;
    const legWidth = 0.08;

    const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8, metalness: 0.1 });
    const metalMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.8 });

    const slatCount = 5;
    const slatWidth = (seatWidth - 0.1) / slatCount;
    for (let i = 0; i < slatCount; i++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(slatWidth - 0.02, seatThickness, seatDepth), woodMaterial);
        slat.position.set(-seatWidth / 2 + slatWidth / 2 + i * slatWidth + 0.05, seatHeight, 0);
        benchGroup.add(slat);
    }
    for (let i = 0; i < 4; i++) {
        const backSlatHeight = (backHeight - 0.08) / 4;
        const backSlat = new THREE.Mesh(new THREE.BoxGeometry(seatWidth - 0.1, backSlatHeight - 0.02, backThickness), woodMaterial);
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

    registerOutdoorProp(benchGroup, 'bench');
    const box = new THREE.Box3().setFromObject(benchGroup);
    collisionBoxes.push({ box, type: 'decor' });
    gardenGroup.add(benchGroup);
}

/** The potting bench: a sturdy work table with pots, a soil bag, and tools. */
function createPottingBench(x, z, rotationY = 0) {
    const bench = new THREE.Group();
    bench.name = 'pottingBench';

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.75), weatheredWood);
    top.position.y = 0.92;
    top.castShadow = true;
    bench.add(top);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.6), weatheredWood);
    shelf.position.y = 0.3;
    bench.add(shelf);
    const backboard = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 0.05), weatheredWood);
    backboard.position.set(0, 1.25, -0.35);
    bench.add(backboard);
    [[-0.85, -0.3], [0.85, -0.3], [-0.85, 0.3], [0.85, 0.3]].forEach(([dx, dz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.92, 0.08), darkWood);
        leg.position.set(dx, 0.46, dz);
        bench.add(leg);
    });

    // Stacked terracotta pots and a bag of potting mix
    for (let i = 0; i < 3; i++) {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.075, 0.16, 8), terracotta);
        pot.position.set(-0.6 + i * 0.16, 1.03 + i * 0.045, -0.1);
        bench.add(pot);
    }
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.22),
        new THREE.MeshStandardMaterial({ color: 0x5c4a35, roughness: 0.95 }));
    bag.position.set(0.55, 1.2, -0.12);
    bag.rotation.z = -0.15;
    bench.add(bag);
    // A trowel resting on the top
    const trowelHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 5), darkWood);
    trowelHandle.rotation.z = Math.PI / 2;
    trowelHandle.position.set(0.05, 0.98, 0.2);
    bench.add(trowelHandle);
    const trowelBlade = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 6), galvanized);
    trowelBlade.rotation.z = -Math.PI / 2;
    trowelBlade.position.set(-0.12, 0.98, 0.2);
    bench.add(trowelBlade);

    bench.position.set(x, 0, z);
    bench.rotation.y = rotationY;
    // Shadows: the tabletop alone casts (set at creation); the clutter need not.

    registerOutdoorProp(bench, 'potting');
    const box = new THREE.Box3().setFromObject(bench);
    collisionBoxes.push({ box, type: 'decor' });
    gardenGroup.add(bench);
}

/** A well-used wheelbarrow, parked by the beds mid-chore. */
function createWheelbarrow(x, z, rotationY = 0) {
    const barrow = new THREE.Group();
    barrow.name = 'wheelbarrow';

    const tubMaterial = new THREE.MeshStandardMaterial({ color: 0x2e5f3e, roughness: 0.6, metalness: 0.2 });
    const tub = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.32, 0.62), tubMaterial);
    tub.position.set(0, 0.42, 0);
    tub.castShadow = true;
    barrow.add(tub);
    // A load of compost in the tub
    const load = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 5),
        new THREE.MeshStandardMaterial({ color: 0x2e2419, roughness: 1.0 }));
    load.position.set(0, 0.55, 0);
    load.scale.set(1.3, 0.5, 0.85);
    barrow.add(load);

    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.05, 7, 14),
        new THREE.MeshStandardMaterial({ color: 0x22201e, roughness: 0.9 }));
    wheel.position.set(0.6, 0.19, 0);
    barrow.add(wheel);

    [[-0.15], [0.15]].forEach(([dz]) => {
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.15, 5), darkWood);
        handle.rotation.z = Math.PI / 2 - 0.12;
        handle.position.set(-0.35, 0.36, dz === -0.15 ? -0.22 : 0.22);
        barrow.add(handle);
    });
    [[-0.28], [0.28]].forEach(([dz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), galvanized);
        leg.position.set(-0.42, 0.14, dz === -0.28 ? -0.2 : 0.2);
        barrow.add(leg);
    });

    barrow.position.set(x, 0, z);
    barrow.rotation.y = rotationY;
    // Shadows: the tub alone casts (set at creation); it carries the silhouette.

    registerOutdoorProp(barrow, 'barrow');
    const box = new THREE.Box3().setFromObject(barrow);
    collisionBoxes.push({ box, type: 'decor' });
    gardenGroup.add(barrow);
}

// ---- The garden chalkboard and its discovery list ----
// The board carries the discovery list (mirroring the checklist, the way the
// trail theme's kiosk did) plus the Seed to Seed mission. main.js opens a
// close-up view of it, drawn by drawKioskTo below. The kiosk name is kept so
// the shared board plumbing carries over unchanged.
let kioskBoard = null;   // { canvas, ctx, texture }
let kioskItems = [];     // latest checklist rows, [{ short, done }]

const BOARD_MISSION = [
    'Seed to Seed educates, inspires, and supports home',
    'vegetable and edible gardening, from seed sow to',
    'seed save and every step in between. Beds, greenhouses,',
    'coaching, pest and plant care, and honest advice.',
    'Grow more food.'
];

function drawKioskBoard(ctx, W, H) {
    // A well-kept chalkboard in a cedar frame
    ctx.fillStyle = '#2d3b32';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#9a6b47';
    ctx.lineWidth = W * 0.02;
    ctx.strokeRect(0, 0, W, H);

    const pad = W * 0.06;

    // Header
    ctx.fillStyle = '#e8e3d4';
    ctx.font = `bold ${Math.round(H * 0.045)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText('THE BACKYARD GARDEN  ·  #GROWMOREFOOD', W / 2, H * 0.09);

    ctx.fillStyle = '#f3efe2';
    ctx.font = `bold ${Math.round(H * 0.1)}px Georgia, serif`;
    ctx.fillText('SEED TO SEED', W / 2, H * 0.2);

    ctx.strokeStyle = '#8fa896';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, H * 0.24);
    ctx.lineTo(W - pad, H * 0.24);
    ctx.stroke();

    // Discovery list, two columns (chalk on board)
    ctx.textAlign = 'left';
    ctx.font = `${Math.round(H * 0.042)}px Georgia, serif`;
    ctx.fillStyle = '#d8d3c2';
    ctx.fillText('Things worth finding in the garden:', pad, H * 0.31);

    const colItems = Math.ceil(kioskItems.length / 2) || 4;
    const rowH = H * 0.062;
    const listTop = H * 0.37;
    kioskItems.forEach((item, i) => {
        const col = Math.floor(i / colItems);
        const row = i % colItems;
        const x = pad + col * (W / 2 - pad * 0.6);
        const y = listTop + row * rowH;

        // Checkbox
        ctx.strokeStyle = '#d8d3c2';
        ctx.lineWidth = 2;
        const boxSize = H * 0.032;
        ctx.strokeRect(x, y - boxSize + 4, boxSize, boxSize);
        if (item.done) {
            ctx.strokeStyle = '#a4d18f';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x + boxSize * 0.2, y - boxSize * 0.4 + 4);
            ctx.lineTo(x + boxSize * 0.45, y - boxSize * 0.1 + 4);
            ctx.lineTo(x + boxSize * 1.05, y - boxSize * 0.95 + 4);
            ctx.stroke();
        }

        ctx.fillStyle = item.done ? '#a4d18f' : '#d8d3c2';
        ctx.font = `${Math.round(H * 0.038)}px Georgia, serif`;
        ctx.fillText(item.short, x + boxSize + W * 0.015, y);
    });

    // Mission
    const dedTop = H * 0.68;
    ctx.strokeStyle = '#8fa896';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, dedTop - H * 0.045);
    ctx.lineTo(W - pad, dedTop - H * 0.045);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#c9d6bc';
    ctx.font = `italic ${Math.round(H * 0.042)}px Georgia, serif`;
    BOARD_MISSION.forEach((line, i) => {
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

/** Draw the chalkboard into any 2D context (the close-up overlay). */
export function drawKioskTo(ctx, w, h) {
    drawKioskBoard(ctx, w, h);
}

function createChalkboard(x, z) {
    const kioskGroup = new THREE.Group();
    kioskGroup.name = 'gardenChalkboard';

    // Posts
    const postGeometry = new THREE.BoxGeometry(0.14, 2.9, 0.14); // tall enough to meet the roof panels (~y 2.8)
    [-1.35, 1.35].forEach((offset) => {
        const post = new THREE.Mesh(postGeometry, darkWood);
        post.position.set(offset, 1.45, 0);
        post.castShadow = true;
        kioskGroup.add(post);
    });

    // Chalkboard (canvas texture on the front face)
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

    // Little peaked roof to keep the chalk dry. Positive-X rotation drops a
    // front (+Z) panel's outer edge, so each panel tilts side * +0.45 to
    // slope DOWN and outward from the center ridge (side * -0.45 raised the
    // outer edges instead, an upside-down V).
    [-1, 1].forEach((side) => {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.05, 0.75), darkWood);
        panel.position.set(0, 2.62 + 0.16, side * 0.31);
        panel.rotation.x = side * 0.45;
        panel.castShadow = true;
        kioskGroup.add(panel);
    });

    kioskGroup.position.set(x, 0, z);
    // Built facing +Z; the board stands south of the beds, so turn it around
    // to face the garden's heart (negative Z side)
    kioskGroup.rotation.y = Math.PI;

    registerOutdoorProp(kioskGroup, 'kiosk');

    const box = new THREE.Box3().setFromObject(kioskGroup);
    collisionBoxes.push({ box, type: 'decor' });

    gardenGroup.add(kioskGroup);
}

/** The Our Services sign: a tidy painted panel on a post by the gate. Clicking
 *  it (main.js) opens the card that links out to Seed to Seed's services page. */
function createServicesSign(x, z) {
    const signGroup = new THREE.Group();
    signGroup.name = 'servicesSign';

    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.9, 0.12), darkWood);
    post.position.y = 0.95;
    post.castShadow = true;
    signGroup.add(post);

    // The canvas keeps the same pixels-per-meter as the smaller original
    // (256 px/m), so growing the panel adds breathing room around the text
    // instead of scaling the text up with it.
    const canvas = makeCanvas(512, 304);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2f5b3d';
    ctx.fillRect(0, 0, 512, 304);
    ctx.strokeStyle = '#e8e3d4';
    ctx.lineWidth = 7;
    ctx.strokeRect(11, 11, 490, 282);
    ctx.fillStyle = '#f3efe2';
    ctx.textAlign = 'center';
    ctx.font = 'bold 52px Georgia, serif';
    ctx.fillText('OUR SERVICES', 256, 122);
    ctx.font = 'italic 30px Georgia, serif';
    ctx.fillStyle = '#cfe0c2';
    ctx.fillText('From seed sow to seed save', 256, 180);
    ctx.font = '26px Georgia, serif';
    ctx.fillText('(step closer and give me a click)', 256, 236);
    const texture = new THREE.CanvasTexture(canvas);

    const panel = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 1.19, 0.05),
        [
            darkWood, darkWood, darkWood, darkWood,
            new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 }),  // front (+Z)
            darkWood
        ]
    );
    panel.position.set(0, 1.4, 0.04);
    panel.castShadow = true;
    signGroup.add(panel);

    signGroup.position.set(x, 0, z);
    // Built facing +Z; turned around to face the spawn, which is just
    // north of the sign (visitors start inside the yard, not at the gate)
    signGroup.rotation.y = Math.PI;

    registerOutdoorProp(signGroup, 'services');

    const box = new THREE.Box3().setFromObject(signGroup);
    collisionBoxes.push({ box, type: 'decor' });

    gardenGroup.add(signGroup);
}

function createGardenFurniture() {
    // A bench with a view of the whole garden, facing the beds
    createGardenBench(12.5, 10.5, Math.PI);

    // The potting bench along the east fence, near the greenhouse
    createPottingBench(18.2, 0.5, -Math.PI / 2);

    // The wheelbarrow, parked mid-chore between the path and the pumpkin
    // patch (clear of the chalkboard, whose posts reach world x -6.65)
    createWheelbarrow(-4.5, 9.4, 0.4);

    // The garden chalkboard, south of the beds where visitors arrive
    createChalkboard(-8, 8.6);

    // The Our Services sign, greeting visitors just inside the gate
    createServicesSign(2.5, 11.6);
}

// ============================================
// ORCHARD, FLOWERS, AND SHADE
// ============================================

/** Large shade tree: thick trunk, multi-sphere canopy. */
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

/** Apple tree: a compact canopy hung with red fruit. */
function createAppleTree(x, z) {
    const tree = new THREE.Group();

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.4, 7), trunkMaterial);
    trunk.position.y = 0.7;
    trunk.castShadow = true;
    tree.add(trunk);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.25, 8, 7), mediumGreenFoliage);
    canopy.position.y = 2.1;
    canopy.castShadow = true;
    tree.add(canopy);

    // Apples sit ON the canopy sphere (center y 2.1, radius 1.25): each one
    // is a direction from the canopy center pushed to just inside the
    // foliage, so it half-nests in the leaves. The old downward offset put
    // low apples outside the canopy (floating) and top ones inside (hidden).
    for (let i = 0; i < 9; i++) {
        const apple = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), tomatoRed);
        const angle = Math.random() * Math.PI * 2;
        const tilt = Math.PI * (0.2 + Math.random() * 0.5); // off the hidden top and the underside
        apple.position.set(
            Math.cos(angle) * Math.sin(tilt) * 1.18,
            2.1 + Math.cos(tilt) * 1.18,
            Math.sin(angle) * Math.sin(tilt) * 1.18
        );
        tree.add(apple);
    }

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

/** Bush with scattered flower dots (the pollinator borders). */
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

    // Blossoms stay within the bush body (a 0.8 sphere squashed to 0.64
    // tall at y 0.6) so none drift off into the air beside it
    for (let i = 0; i < 12; i++) {
        const flower = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 4, 4),
            flowerMaterial
        );
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.45 + Math.random() * 0.25;
        flower.position.set(
            Math.cos(angle) * radius,
            0.45 + Math.random() * 0.35,
            Math.sin(angle) * radius
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

function createOrchardAndFlowers() {
    const greenGroup = new THREE.Group();
    greenGroup.name = 'orchardAndFlowers';

    // Apple trees along the west fence (an edible landscape, naturally)
    [{ x: -16, z: 10 }, { x: -17, z: 3.5 }].forEach((t) => {
        const tree = createAppleTree(t.x, t.z);
        registerOutdoorProp(tree, 'tree');
        greenGroup.add(tree);
        addTrunkCollider(t.x, t.z);
    });

    // One big shade tree in the southeast corner, over the bench
    const shade = createLargeTree(15.5, 12.5, 8);
    registerOutdoorProp(shade, 'tree');
    greenGroup.add(shade);
    addTrunkCollider(15.5, 12.5);

    // Neighbor trees beyond the fence, so the yard sits in a real neighborhood
    const mobile = isMobileDevice();
    const backdropSpots = [
        { x: -26, z: -6, h: 9 }, { x: 26, z: -2, h: 10 },
        { x: 25, z: 10, h: 8 }, { x: -12, z: 20, h: 9 }, { x: 12, z: 20.5, h: 8 },
        { x: -9, z: -20, h: 9 }, { x: 8, z: -19, h: 8 }, { x: -22, z: -18, h: 10 }
    ];
    backdropSpots.forEach((t, i) => {
        if (mobile && i % 2) return;
        greenGroup.add(createLargeTree(t.x, t.z, t.h));
    });

    // Flowering pollinator borders along the fences (butterfly territory)
    const flowerSpots = [{ x: -19, z: 12.5 }, { x: 19, z: 6 }, { x: 19.5, z: 13 }, { x: -19.5, z: -1.5 }];
    flowerSpots.forEach((spot) => {
        const bush = createFloweringBush(spot.x, spot.z);
        registerOutdoorProp(bush, 'bush');
        greenGroup.add(bush);
    });

    // A plain bush softening the northwest corner (the stretch behind the
    // corn stays clear so the stalks read cleanly against the fence)
    const bushSpots = [{ x: -14, z: -12, size: 1.1 }];
    bushSpots.forEach((spot) => {
        const bush = createBushCluster(spot.x, spot.z, spot.size);
        registerOutdoorProp(bush, 'bush');
        greenGroup.add(bush);
    });

    gardenGroup.add(greenGroup);
}

// ============================================
// THE GARDENER (the owner, as greeter)
// ============================================
// He stands among his raised beds, turning to greet visitors as they come
// up the path (the shared shopkeeper look-at behavior). Tall with a stocky
// build, blue eyes, graying reddish hair and a trimmed graying reddish
// beard, dressed for a day in the garden: a dark brick red work shirt with
// the sleeves down, sturdy trousers, and big capable hands and boots.

const OWNER_POSITION = LAYOUT.ownerSpot;

/** A trimmed beard fitted to the shared person builder's head (a 0.12-radius
 *  sphere centered at y 1.5, eyes at y 1.52). The jaw band starts well below
 *  the eye line and hugs the chin, with a modest chin pad and mustache. */
function createBeard(color) {
    const beard = new THREE.Group();
    beard.name = 'beard';

    const beardMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.0 });

    // Jaw band: a slim slice of a slightly-larger sphere, from just below
    // the mouth line (theta 0.58pi ~ y 1.47) down toward the jaw.
    const jaw = new THREE.Mesh(
        new THREE.SphereGeometry(0.124, 12, 8, Math.PI, Math.PI, Math.PI * 0.58, Math.PI * 0.3),
        beardMaterial
    );
    jaw.rotation.y = Math.PI; // open side to the back; hair faces forward
    jaw.position.set(0, 1.5, 0.002);
    beard.add(jaw);

    // Chin pad, a modest one
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), beardMaterial);
    chin.position.set(0, 1.405, 0.08);
    chin.scale.set(1.2, 1.0, 0.8);
    beard.add(chin);

    // Mustache
    const stache = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.016, 0.018), beardMaterial);
    stache.position.set(0, 1.452, 0.114);
    beard.add(stache);

    return beard;
}


/** Repaint the shared floating sign to say Hello (createHelpSign hardcodes
 *  "Help", and the shared 1.0.0 files are frozen, so the texture is swapped
 *  here in experience code). Garden green. */
function repaintSignAsHello(sign) {
    const canvas = makeCanvas(256, 128);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#2f5b3d';
    ctx.beginPath();
    ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 20);
    ctx.fill();
    ctx.strokeStyle = '#7ba86a';
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
            // The glow plane behind the sign follows the garden green
            child.material.color.setHex(0x7ba86a);
        }
    });
}

function createOwner() {
    const peopleGroup = new THREE.Group();
    peopleGroup.name = 'storePeople';

    const { x: ownerX, z: ownerZ } = OWNER_POSITION;
    const defaultRotation = 0;    // face south toward the beds and the gate

    const OWNER_SKIN = 0xf0c8a0;          // fair skin (a gardener's tan comes free)
    const OWNER_HAIR = 0xa98a72;          // light reddish brown, going gray
    const OWNER_HAIR_TOP = 0x84695a;      // the crown holds its color a shade darker
    const OWNER_BEARD = 0xa8917f;         // the beard is a shade grayer still

    const owner = createPerson({
        role: 'shopkeeper',               // reuse the greeter look-at behavior
        x: ownerX,
        z: ownerZ,
        rotationY: defaultRotation,
        shirtColor: 0x7a2f2a,             // dark brick red work shirt
        pantsColor: 0x4f5666,             // sturdy work trousers
        skinTone: OWNER_SKIN,
        hairColor: OWNER_HAIR,
        hasApron: false,
        bald: false,
        muscular: true,                   // stocky build
        dressShirt: true                  // sleeves down for a day in the sun
    });

    // Tall: the whole figure scaled up a notch (position stays on the ground)
    owner.scale.setScalar(1.08);

    // Blue eyes: recolor the tagged pupils (both share one material). And a
    // gardener's big capable hands and boots: the shared builder's hand (the
    // 0.04-radius sphere in each arm group) and shoe (the only box with the
    // 0.18 foot length) are found by their geometry and scaled up in place.
    owner.traverse((child) => {
        if (child.userData && child.userData.isPupil) {
            child.material.color.setHex(0x3f6fae);
            return;
        }
        if (!child.isMesh || !child.geometry) return;
        const params = child.geometry.parameters || {};
        if (child.geometry.type === 'SphereGeometry' && params.radius === 0.04 &&
            child.parent && child.parent.userData && child.parent.userData.isArm) {
            child.scale.multiplyScalar(1.75);
        } else if (child.geometry.type === 'BoxGeometry' && params.depth === 0.18) {
            child.scale.set(1.6, 1.25, 1.5);
        } else if (child.geometry.type === 'SphereGeometry' && params.thetaLength &&
            Math.abs(params.thetaLength - Math.PI * 0.45) < 0.01) {
            // The crown of his hair (the short cut's partial-sphere dome):
            // worn a shade darker than the graying sides. The builder shares
            // one material across the cut, so the dome gets its own copy.
            child.material = child.material.clone();
            child.material.color.setHex(OWNER_HAIR_TOP);
        }
    });

    owner.add(createBeard(OWNER_BEARD));

    peopleGroup.add(owner);
    registerHost(owner, defaultRotation);

    // Floating Hello sign above him
    const sign = createHelpSign(ownerX, ownerZ);
    repaintSignAsHello(sign);
    peopleGroup.add(sign);
    setHelpSign(sign);

    // Collision so visitors walk around him, not through him
    const ownerBox = new THREE.Box3().setFromObject(owner);
    ownerBox.expandByScalar(0.1);
    collisionBoxes.push({ box: ownerBox, type: 'host' });

    gardenGroup.add(peopleGroup);
}

// (The garden's strolling guests use the shared visitor cast exactly as
// spawned: a mix of presentations, drawn fresh each page load.)

// ============================================
// NIGHT LIGHTING
// ============================================
// Four landscape spotlights that fade up as the sun goes down (driven by
// updateGardenLights from the render loop): one washing the gardener and
// the raised beds, one on the Our Services sign, one on the garden
// chalkboard, and one inside the greenhouse over the seedling table (which
// sets the whole glass building glowing). Real lights are capped at four,
// cast no shadows, and are fully disabled by day, so the night look stays
// cheap.

let gardenLights = [];

const spotHeadMaterial = new THREE.MeshStandardMaterial({ color: 0x2e3230, roughness: 0.6, metalness: 0.4 });

function createLandscapeSpot(x, z, target, opts = {}) {
    const group = new THREE.Group();
    group.name = 'landscapeSpot';

    const height = opts.height || 0.4;

    // Ground stake
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, height, 6), galvanized);
    stake.position.y = height / 2;
    group.add(stake);

    // Angled head with a lens that glows when the light is on. The housing
    // flares open toward the beam (+Y): narrow at the stake, wide at the
    // mouth, like a real reflector.
    const headGroup = new THREE.Group();
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.14, 8), spotHeadMaterial);
    headGroup.add(head);
    const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.065, 8),
        new THREE.MeshStandardMaterial({ color: 0x37322a, emissive: 0xffd9a0, emissiveIntensity: 0 })
    );
    lens.rotation.x = -Math.PI / 2;   // face out the top of the head cylinder
    lens.position.y = 0.071;
    headGroup.add(lens);

    // Aim the head (cylinder axis +Y) along the beam direction
    const direction = new THREE.Vector3(target.x - x, (target.y || 1) - height, target.z - z).normalize();
    headGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    headGroup.position.y = height;
    group.add(headGroup);

    // The light itself (target is in group-local coordinates)
    const light = new THREE.SpotLight(0xffd9a0, 0, opts.distance || 18, opts.angle || 0.65, 0.6, 1);
    light.position.set(0, height, 0);
    group.add(light);
    const lightTarget = new THREE.Object3D();
    lightTarget.position.set(target.x - x, target.y || 1, target.z - z);
    group.add(lightTarget);
    light.target = lightTarget;
    light.visible = false;   // day: off entirely, so it costs nothing

    group.position.set(x, 0, z);
    gardenGroup.add(group);
    gardenLights.push({ light, lens, max: opts.intensity || 1.6 });
}

function createGardenLights() {
    // The garden's heart: washes the gardener and the front row of beds
    createLandscapeSpot(-2.6, -3.2, { x: 1.5, y: 1.2, z: 0.5 }, { intensity: 2.0, angle: 0.75 });

    // The Our Services sign, lit from the path side it faces
    createLandscapeSpot(4.8, 10.2, { x: 2.5, y: 1.5, z: 11.6 }, { distance: 10 });

    // The garden chalkboard, lit from the path side it faces (offset a step
    // east so the stake never sits on the tour's chalkboard stop at x -8)
    createLandscapeSpot(-6.9, 6.9, { x: -8, y: 1.6, z: 8.6 }, { distance: 8 });

    // Inside the greenhouse, over the seedling table: the glass glows from
    // across the yard once this comes on
    createLandscapeSpot(13.5, -5.2, { x: 13.5, y: 1.0, z: -7.4 }, { height: 0.45, distance: 8, angle: 0.8 });
}

/**
 * Fade the landscape lighting with the night (nightFactor 0..1 from the
 * shared scene's day/night cycle). Driven from the render loop in main.js.
 */
export function updateGardenLights(nightFactor) {
    const level = Math.min(1, Math.max(0, (nightFactor - 0.2) / 0.5));
    gardenLights.forEach((entry) => {
        entry.light.visible = level > 0.01;
        entry.light.intensity = entry.max * level;
        entry.lens.material.emissiveIntensity = level;
    });
}

// ============================================
// BUTTERFLIES
// ============================================
// A little life over the flower borders: three butterflies drifting slow
// loops, wings flapping. Reduced-motion visitors get them resting mid-air.

let butterflies = [];

function createButterfly(color) {
    const b = new THREE.Group();
    const wingMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide });
    const wingGeometry = new THREE.CircleGeometry(0.09, 5);

    // Wings lie flat (XZ plane) and flap about the body's long axis, so
    // they beat up and down. The ZYX order applies the flap (rotation.z)
    // in the world frame after the flatten (rotation.x).
    const left = new THREE.Mesh(wingGeometry, wingMaterial);
    left.position.x = -0.06;
    left.rotation.order = 'ZYX';
    left.rotation.x = -Math.PI / 2;
    b.add(left);
    const right = new THREE.Mesh(wingGeometry, wingMaterial);
    right.position.x = 0.06;
    right.rotation.order = 'ZYX';
    right.rotation.x = -Math.PI / 2;
    b.add(right);

    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.12, 4),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 })
    );
    body.rotation.x = Math.PI / 2;
    b.add(body);

    return { group: b, left, right };
}

function createButterflies() {
    // One butterfly (performance: it moves every frame). It works the
    // pumpkin patch and the west beds, the most-visited stretch.
    const casts = [
        { color: 0xe8a33d, cx: -11.5, cz: 4, r: 2.2, y: 1.1, speed: 0.5, phase: 0 }
    ];
    butterflies = casts.map((cast) => {
        const { group, left, right } = createButterfly(cast.color);
        group.position.set(cast.cx + cast.r, cast.y, cast.cz);
        gardenGroup.add(group);
        return { ...cast, group, left, right, t: cast.phase };
    });
}

/**
 * Animate the butterflies: a slow drifting loop over their flower patch,
 * wings flapping. Driven from the render loop in main.js. Reduced-motion
 * visitors get still air.
 */
export function updateGarden(deltaTime) {
    if (_reducedMotion.matches) return;

    butterflies.forEach((b) => {
        b.t += deltaTime * b.speed;
        const x = b.cx + Math.cos(b.t) * b.r;
        const z = b.cz + Math.sin(b.t * 1.3) * b.r * 0.7;
        const y = b.y + Math.sin(b.t * 2.1) * 0.25;
        b.group.position.set(x, y, z);
        b.group.rotation.y = Math.atan2(
            -(Math.sin(b.t * 1.3) * 1.3 * b.r * 0.7),
            -(Math.sin(b.t) * b.r)
        ) + Math.PI / 2;
        // Wing flap: both wings rise and fall together (rotation about the
        // body axis; the outer tips beat up and down, not back and forth)
        const flap = Math.sin(b.t * 18) * 0.9;
        b.left.rotation.z = -flap;
        b.right.rotation.z = flap;
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
 * Get the garden root group
 */
export function getStoreGroup() {
    return gardenGroup;
}

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = {
    shuffled, pickBalanced,
    createBeard,
    LAYOUT
};
