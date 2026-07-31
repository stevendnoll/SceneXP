// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * store.js - Store Environment Construction
 * Creates the store building geometry, textures, and lighting
 */

import { getScene, isNightTime, getInteriorLightState } from '../../shared/js/scene-1.0.0.min.js';
import {
    initWorld, getColliders, registerOutdoorProp, getOutdoorPropMeshes, isMobileDevice
} from '../../shared/js/world-1.0.0.min.js';
import { INTERSTATE_CONFIG } from './config.min.js';
import {
    createTileFloorTexture, createConcreteFloorTexture, createStuccoTexture
} from '../../shared/js/textures-1.0.0.min.js';
import {
    createTallPlant, createSmallPlant, createSnakePlant, createFernPlant,
    createSofa, createLoungeChair, createVendingMachine
} from '../../shared/js/furniture-1.0.0.min.js';
import { createPerson, shuffled, pickBalanced } from '../../shared/js/people-1.0.0.min.js';
import {
    createWall, createWallSegment, createWindowFrame, createDoorFrame
} from '../../shared/js/structures-1.0.0.min.js';
import {
    createCeilingLights, createInteriorAmbientLight, createLightSwitch, createExitSign
} from '../../shared/js/lighting-1.0.0.min.js';
import {
    createTree, createStreetLamp, createBench, createPlanter
} from '../../shared/js/street-1.0.0.min.js';
import { createBackgroundScenery } from '../../shared/js/scenery-1.0.0.min.js';
import { initDoorAudio, registerDoors } from '../../shared/js/doors-1.0.0.min.js';
import { registerHost, setHelpSign, createHelpSign } from '../../shared/js/npcs-1.0.0.min.js';
import { createSidewalkPedestrians } from '../../shared/js/pedestrians-1.0.0.min.js';

// Re-exports: main.js keeps importing these from store.min.js (stable import
// block); the implementations now live in the shared parts library.
export {
    updateInteriorAmbientLight, setInteriorLightScale, getInteriorLightScale,
    getLightSwitchMesh
} from '../../shared/js/lighting-1.0.0.min.js';
export { updateBackgroundAnimations } from '../../shared/js/scenery-1.0.0.min.js';
export { updateDoors } from '../../shared/js/doors-1.0.0.min.js';
export {
    setWanderWaypoints as setGalleryWaypoints, initGalleryVisitors, getVisitorMeshes,
    findClearSpawn, pauseCustomerForDialog, resumeCustomerFromDialog,
    updateStorePeople, updateCheckoutSign, getGalleryHost, getHelpSign
} from '../../shared/js/npcs-1.0.0.min.js';
export {
    updateSidewalkPedestrians, getPedestrianMeshes, pausePedestrianForDialog,
    resumePedestrianFromDialog, arePedestriansZombies
} from '../../shared/js/pedestrians-1.0.0.min.js';

// Building dimensions now live in config.js (one frozen home for every
// per-experience value). Re-exported under the legacy name so gallery.js and
// main.js keep importing STORE_CONFIG from this module unchanged.
export const STORE_CONFIG = INTERSTATE_CONFIG.building;

// Outdoor props register with the shared world context; main.js still imports
// the getter from this module.
export { getOutdoorPropMeshes };

// Store mesh groups
let storeGroup = null;
let collisionBoxes = [];

// Textures
let stuccoTexture = null;
let tileFloorTexture = null;
let concreteFloorTexture = null;

// Visitors who ask for reduced motion get a still studio-monitor screen (full
// log shown, no blinking cursor or typing), matching the reduced-motion handling
// of the sky/comet in scene.js.
const _reducedMotion = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

// The studio desk's animated terminal screen (a gentle faux build log + blinking
// cursor). Holds the canvas/2D-context/texture and the small bit of animation
// state, driven by updateGalleryMonitor() from the render loop.
let galleryMonitor = null;
const MONITOR_SCRIPT = [
    '$ npm run open:shop',
    '✓ bay door · rolled up',
    '✓ lift · car raised and steady',
    '✓ tires · racks stocked and stacked',
    '✓ waiting room · coffee warm, TV on',
    '✓ host · ready to welcome guests',
    'Shop: open for business',
    '✨ Ready to roll'
];

/**
 * Initialize the store
 */
export function initStore() {
    const scene = getScene();
    if (!scene) {
        // console.error('Scene not available');
        return;
    }

    // The shared world context owns the root group, the collider registry, and
    // the outdoor-prop registry. Local aliases keep every builder below (and
    // the direct collisionBoxes.push sites) working unchanged.
    storeGroup = initWorld(INTERSTATE_CONFIG);
    collisionBoxes = getColliders();

    // Initialize door audio system
    initDoorAudio();

    // Create textures first
    createTextures();

    // Build store components
    greeterMeshes = [];       // reset the shop greeter registry
    shopFootprints = [];      // reset the enterable-shop footprints
    createExteriorGround();
    createInteriorFloor();
    createWalls();
    createPartitionWall();       // waiting room | garage divider with door + window
    createWaitingRoomPaint();    // light-gray painted liner for the waiting room walls
    createOutdoorBench();
    createCeiling();
    createGlassStorefront();
    createStoreSign();
    createUpperMassing();        // facade-only second story and parapets
    createFrontExteriorLogo();   // logo on the stucco beside the door
    createExitSign();            // illuminated green EXIT sign above the door (interior)
    createLightSwitch();         // clickable light switch beside the door (interior)
    createInteriorDecor();       // waiting room furnishings, plants, TV
    createLogoWallArt();         // framed logo prints on the interior walls
    createCheckoutCounter();     // service counter the host works behind
    createGarageEquipment();     // lift + SUV, tire racks, workbench, stacks
    createWaitingRoomWhiteboard(); // rolling board carrying the discovery checklist
    createGalleryHost();         // the host behind the counter with a floating Help sign
    createStorefrontExtras();

    // Build the street: sidewalk, main street, and the green strip across
    // the way (no neighboring buildings, comet, or telescope here).
    createMainStreetEnvironment();

    // Historic Cockeysville: Railroad Ave runs down the shop's west side from
    // the main street, with the 1892 Pennsylvania RR freight depot alongside.
    createRailroadAve();
    createFreightDepot();

    // Add background scenery (drifting clouds, per the config toggles)
    createBackgroundScenery();

    // Add pedestrians walking on the sidewalk
    createSidewalkPedestrians();

    // (The root group was added to the scene by initWorld.)

    // Update lighting for store
    updateLighting();

    return collisionBoxes;
}

/**
 * Create procedural textures
 */
function createTextures() {
    // Create stucco texture procedurally
    stuccoTexture = createStuccoTexture();

    // Create the two interior floor textures procedurally: tile for the
    // waiting room, stained concrete for the garage
    tileFloorTexture = createTileFloorTexture();
    concreteFloorTexture = createConcreteFloorTexture();
}

/**
 * Create exterior ground plane
 */
function createExteriorGround() {
    const { groundSize } = STORE_CONFIG;

    // Concrete/asphalt ground
    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a4a4a,
        roughness: 0.9,
        metalness: 0.1
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0; // Ground level
    ground.receiveShadow = true;
    ground.name = 'exteriorGround';

    storeGroup.add(ground);

    // Sidewalk in front of store
    const sidewalkGeometry = new THREE.PlaneGeometry(
        STORE_CONFIG.width + 4,
        STORE_CONFIG.sidewalkDepth
    );
    const sidewalkMaterial = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.8,
        metalness: 0.0
    });

    const sidewalk = new THREE.Mesh(sidewalkGeometry, sidewalkMaterial);
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(
        STORE_CONFIG.positionX,
        0.005,
        STORE_CONFIG.positionZ + STORE_CONFIG.depth / 2 + STORE_CONFIG.sidewalkDepth / 2
    );
    sidewalk.receiveShadow = true;
    sidewalk.name = 'sidewalk';

    storeGroup.add(sidewalk);
}

/**
 * Create interior floor
 */
function createInteriorFloor() {
    const { width, depth, positionX, positionZ, partitionX } = STORE_CONFIG;

    // Two floors split at the partition: ceramic tile in the waiting room,
    // working concrete in the garage. Lambert keeps these big, screen-filling
    // surfaces cheap to shade.
    const leftEdge = positionX - width / 2;
    const rightEdge = positionX + width / 2;

    const waitingWidth = partitionX - leftEdge;
    const waitingFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(waitingWidth - 0.05, depth - 0.1),
        new THREE.MeshLambertMaterial({ map: tileFloorTexture })
    );
    waitingFloor.rotation.x = -Math.PI / 2;
    waitingFloor.position.set(leftEdge + waitingWidth / 2, 0.005, positionZ);
    waitingFloor.receiveShadow = false; // Interior floor doesn't receive sun shadows
    waitingFloor.name = 'waitingRoomFloor';
    storeGroup.add(waitingFloor);

    const garageWidth = rightEdge - partitionX;
    const garageFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(garageWidth - 0.05, depth - 0.1),
        new THREE.MeshLambertMaterial({ map: concreteFloorTexture })
    );
    garageFloor.rotation.x = -Math.PI / 2;
    garageFloor.position.set(partitionX + garageWidth / 2, 0.005, positionZ);
    garageFloor.receiveShadow = false;
    garageFloor.name = 'garageFloor';
    storeGroup.add(garageFloor);
}

/**
 * The interior partition between the waiting room and the garage: drywall
 * white, with a connecting door near the front and a viewing window so
 * waiting customers can watch their car being worked on. Every solid segment
 * registers player collision (NPCs read the same boxes).
 */
function createPartitionWall() {
    const { depth, height, positionZ, partitionX } = STORE_CONFIG;
    const t = 0.3;
    const innerBack = positionZ - depth / 2 + 0.2;
    const innerFront = positionZ + depth / 2 - 0.2;
    const group = new THREE.Group();
    group.name = 'partitionWall';

    const drywallMaterial = new THREE.MeshStandardMaterial({
        color: 0xeceae4,
        roughness: 0.95,
        metalness: 0.0
    });

    const seg = (z0, z1, y0, y1, name) => {
        const len = z1 - z0;
        const h = y1 - y0;
        if (len <= 0 || h <= 0) return;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(t, h, len), drywallMaterial);
        mesh.position.set(partitionX, y0 + h / 2, z0 + len / 2);
        mesh.name = name;
        group.add(mesh);
        collisionBoxes.push({ box: new THREE.Box3().setFromObject(mesh), type: 'wall' });
    };

    // Viewing window (seated eye height) and connecting door (near the front)
    const winZ0 = 6.5, winZ1 = 9.5, winY0 = 1.1, winY1 = 2.3;
    const doorZ0 = 14.8, doorZ1 = 16.2, doorH = 2.2;

    seg(innerBack, winZ0, 0, height, 'partitionBack');
    seg(winZ0, winZ1, 0, winY0, 'partitionBelowWindow');
    seg(winZ0, winZ1, winY1, height, 'partitionAboveWindow');
    seg(winZ1, doorZ0, 0, height, 'partitionMiddle');
    seg(doorZ0, doorZ1, doorH, height, 'partitionAboveDoor');
    seg(doorZ1, innerFront, 0, height, 'partitionFront');

    // Clear glass in the viewing window (no collider needed: the sill segment
    // below already blocks the player and NPCs)
    const viewGlass = new THREE.Mesh(
        new THREE.PlaneGeometry(winZ1 - winZ0 - 0.06, winY1 - winY0 - 0.06),
        new THREE.MeshStandardMaterial({
            color: 0xcfe2ec,
            transparent: true,
            opacity: 0.18,
            roughness: 0.05,
            metalness: 0.1,
            side: THREE.DoubleSide
        })
    );
    viewGlass.rotation.y = Math.PI / 2;
    viewGlass.position.set(partitionX, (winY0 + winY1) / 2, (winZ0 + winZ1) / 2);
    viewGlass.name = 'partitionViewGlass';
    group.add(viewGlass);

    // Simple dark trim around the window and door openings
    const trimMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a3d42,
        roughness: 0.6,
        metalness: 0.3
    });
    const trim = (h, len, y, z, name) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(t + 0.04, h, len), trimMaterial);
        mesh.position.set(partitionX, y, z);
        mesh.name = name;
        group.add(mesh);
    };
    // Each piece is nudged 2cm INTO its opening so it laps over the drywall's
    // cut face instead of ending exactly on it. Flush placement put the trim
    // surface and the wall surface on the same plane, which z-fights (striped
    // flicker in the jambs). The overlap buries the shared plane inside the
    // trim, so the depth test has a clear winner.
    trim(0.06, winZ1 - winZ0 + 0.12, winY0 - 0.01, (winZ0 + winZ1) / 2, 'viewWindowSillTrim');
    trim(0.06, winZ1 - winZ0 + 0.12, winY1 + 0.01, (winZ0 + winZ1) / 2, 'viewWindowHeadTrim');
    trim(winY1 - winY0 + 0.12, 0.06, (winY0 + winY1) / 2, winZ0 - 0.01, 'viewWindowJambBack');
    trim(winY1 - winY0 + 0.12, 0.06, (winY0 + winY1) / 2, winZ1 + 0.01, 'viewWindowJambFront');
    trim(doorH + 0.06, 0.06, doorH / 2, doorZ0 - 0.01, 'doorJambBack');
    trim(doorH + 0.06, 0.06, doorH / 2, doorZ1 + 0.01, 'doorJambFront');
    trim(0.06, doorZ1 - doorZ0 + 0.12, doorH + 0.01, (doorZ0 + doorZ1) / 2, 'doorHeadTrim');

    storeGroup.add(group);
}

// Shared tire geometry and rubber for every rack and stack tire: one geometry
// and one material across dozens of tires keeps the garage cheap on mobile.
let sharedTireGeometry = null;
let sharedTireMaterial = null;
function getSharedTire() {
    if (!sharedTireGeometry) {
        sharedTireGeometry = new THREE.TorusGeometry(0.32, 0.13, 8, 16);
        sharedTireMaterial = new THREE.MeshStandardMaterial({
            color: 0x1b1c1e,
            roughness: 0.92,
            metalness: 0.0
        });
    }
    return { geometry: sharedTireGeometry, material: sharedTireMaterial };
}

/**
 * A steel tire rack: uprights, three shelves, and rows of standing tires.
 * Built with its length along X, facing +Z; the caller positions and rotates.
 */
function createTireRack(rackWidth = 4.6) {
    const rack = new THREE.Group();
    const { geometry: tireGeo, material: tireMat } = getSharedTire();

    const steelMaterial = new THREE.MeshStandardMaterial({
        color: 0x8c9096,
        roughness: 0.5,
        metalness: 0.7
    });

    // Uprights at the ends and middle
    [-rackWidth / 2, 0, rackWidth / 2].forEach((ux, i) => {
        const upright = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.9, 0.66), steelMaterial);
        upright.position.set(ux, 1.45, 0);
        upright.castShadow = true;
        upright.name = `rackUpright${i}`;
        rack.add(upright);
    });

    // Shelves with standing tires
    const shelfYs = [0.5, 1.35, 2.2];
    const tireOuter = 0.45;
    const perShelf = Math.floor((rackWidth - 0.4) / 0.74);
    shelfYs.forEach((shelfY, s) => {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(rackWidth, 0.05, 0.66), steelMaterial);
        shelf.position.set(0, shelfY, 0);
        shelf.name = `rackShelf${s}`;
        rack.add(shelf);

        for (let i = 0; i < perShelf; i++) {
            const tire = new THREE.Mesh(tireGeo, tireMat);
            tire.rotation.y = Math.PI / 2; // stand upright, tread along the rack
            tire.position.set(
                -rackWidth / 2 + 0.55 + i * 0.74,
                shelfY + 0.025 + tireOuter,
                0
            );
            rack.add(tire);
        }
    });

    return rack;
}

/**
 * A short stack of tires lying flat.
 */
function createTireStack(count = 4) {
    const stack = new THREE.Group();
    const { geometry: tireGeo, material: tireMat } = getSharedTire();
    for (let i = 0; i < count; i++) {
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.rotation.x = Math.PI / 2;
        tire.rotation.z = Math.random() * Math.PI;
        tire.position.set(
            (Math.random() - 0.5) * 0.06,
            0.13 + i * 0.265,
            (Math.random() - 0.5) * 0.06
        );
        stack.add(tire);
    }
    return stack;
}

/**
 * The two-post lift with the shop's white SUV raised on it. The lift's
 * whole footprint registers one conservative collider so nobody clips
 * through the posts or the raised car.
 */
function createTwoPostLift(x, z, vehicle) {
    const liftGroup = new THREE.Group();
    liftGroup.name = 'twoPostLift';

    const postMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d6bbf,       // safety blue, like real shop lifts
        roughness: 0.45,
        metalness: 0.6
    });
    const armMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a3d42,
        roughness: 0.5,
        metalness: 0.7
    });

    // Posts either side of the car, joined by an overhead crossbar
    [-1, 1].forEach(side => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.7, 0.46), postMaterial);
        post.position.set(x + side * 1.75, 1.85, z);
        post.castShadow = true;
        post.name = side < 0 ? 'liftPostLeft' : 'liftPostRight';
        liftGroup.add(post);

        // Base plate
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.9), armMaterial);
        base.position.set(x + side * 1.75, 0.04, z);
        liftGroup.add(base);

        // Lift pads running under the car's rockers
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 3.0), armMaterial);
        pad.position.set(x + side * 0.85, 1.5, z);
        liftGroup.add(pad);

        // Swing arms from post to pad
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.09, 0.14), armMaterial);
        arm.position.set(x + side * 1.3, 1.44, z);
        liftGroup.add(arm);
    });

    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.22, 0.3), postMaterial);
    crossbar.position.set(x, 3.72, z);
    crossbar.name = 'liftCrossbar';
    liftGroup.add(crossbar);

    liftGroup.userData.isScenery = true;
    liftGroup.userData.sceneryKind = 'lift';
    storeGroup.add(liftGroup);
    galleryDecorMeshes.push(liftGroup);

    // The vehicle, raised on the pads. Each bay can hoist a different build
    // via the vehicle option; liftY seats that vehicle's rockers on the pads
    // (pad top ~1.55, so liftY ≈ 1.53 minus the vehicle's sill height).
    const v = vehicle || { build: createParkedSUV, name: 'liftedSUV', liftY: 1.1 };
    const raised = v.build(x, z, 0);
    raised.position.y = v.liftY;
    raised.name = v.name;
    raised.userData.isScenery = true;
    raised.userData.sceneryKind = 'lift';
    galleryDecorMeshes.push(raised);

    // Tight colliders instead of one conservative whole-bay box, whose empty
    // corners read as invisible walls on the walking paths beside the bay.
    // Each collider hugs a real part: a slim box per post + base plate, a
    // thin blade per swing arm (they cross the flanks at chest height), and
    // one box under the raised vehicle sized to that vehicle's actual length.
    const halfLen = v.halfLen || 2.75;
    [-1, 1].forEach(side => {
        // Post + base plate (plate spans x ±1.4..2.1 about the bay center).
        collisionBoxes.push({
            box: new THREE.Box3(
                new THREE.Vector3(x + Math.min(side * 1.35, side * 2.1), 0, z - 0.5),
                new THREE.Vector3(x + Math.max(side * 1.35, side * 2.1), 4, z + 0.5)
            ),
            type: 'decor'
        });
        // Swing arm: a thin bar reaching inward to the lift pads.
        collisionBoxes.push({
            box: new THREE.Box3(
                new THREE.Vector3(x + Math.min(side * 0.8, side * 1.35), 0, z - 0.18),
                new THREE.Vector3(x + Math.max(side * 0.8, side * 1.35), 4, z + 0.18)
            ),
            type: 'decor'
        });
    });
    collisionBoxes.push({
        box: new THREE.Box3(
            new THREE.Vector3(x - 1.05, 0, z - halfLen),
            new THREE.Vector3(x + 1.05, 4, z + halfLen)
        ),
        type: 'decor'
    });
}

/**
 * A garage workbench with a pegboard of painted tool outlines above it.
 * Built facing +Z (pegboard on the -Z side); the caller rotates it to a wall.
 */
function createGarageWorkbench() {
    const bench = new THREE.Group();

    const topMaterial = new THREE.MeshStandardMaterial({
        color: 0x8a6f4d,
        roughness: 0.8,
        metalness: 0.05
    });
    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a4e54,
        roughness: 0.5,
        metalness: 0.6
    });

    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.8), topMaterial);
    top.position.set(0, 0.92, 0);
    top.castShadow = true;
    bench.add(top);

    const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.7), frameMaterial);
    shelf.position.set(0, 0.28, 0);
    bench.add(shelf);

    [[-1.2, -0.32], [1.2, -0.32], [-1.2, 0.32], [1.2, 0.32]].forEach(([lx, lz], i) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.92, 0.08), frameMaterial);
        leg.position.set(lx, 0.46, lz);
        leg.name = `benchLeg${i}`;
        bench.add(leg);
    });

    // Bench vise
    const vise = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.2), frameMaterial);
    vise.position.set(-0.95, 1.07, 0.2);
    bench.add(vise);

    // Pegboard with painted tool outlines
    const pegCanvas = document.createElement('canvas');
    pegCanvas.width = 512;
    pegCanvas.height = 288;
    const pctx = pegCanvas.getContext('2d');
    pctx.fillStyle = '#c9b586';
    pctx.fillRect(0, 0, 512, 288);
    pctx.fillStyle = 'rgba(70, 60, 40, 0.5)';
    for (let py = 16; py < 288; py += 24) {
        for (let px = 16; px < 512; px += 24) {
            pctx.beginPath();
            pctx.arc(px, py, 2.5, 0, Math.PI * 2);
            pctx.fill();
        }
    }
    // Simple white tool outlines: two wrenches, a hammer, pliers
    pctx.strokeStyle = 'rgba(245, 245, 240, 0.85)';
    pctx.lineWidth = 5;
    const outline = (points) => {
        pctx.beginPath();
        pctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) pctx.lineTo(points[i][0], points[i][1]);
        pctx.stroke();
    };
    outline([[70, 60], [70, 220]]);                       // wrench shaft
    pctx.strokeRect(52, 36, 36, 28);                      // wrench head
    outline([[150, 70], [150, 210]]);                     // second wrench
    pctx.strokeRect(132, 210, 36, 28);
    outline([[250, 60], [250, 200]]);                     // hammer handle
    pctx.strokeRect(218, 36, 64, 26);                     // hammer head
    outline([[370, 80], [350, 200]]);                     // pliers
    outline([[390, 80], [410, 200]]);
    const pegTexture = new THREE.CanvasTexture(pegCanvas);
    const pegboard = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 1.45),
        new THREE.MeshStandardMaterial({ map: pegTexture, roughness: 0.9 })
    );
    pegboard.position.set(0, 2.05, -0.38);
    pegboard.name = 'pegboard';
    bench.add(pegboard);

    return bench;
}

/**
 * A red rolling tool chest.
 */
function createRollingToolbox() {
    const box = new THREE.Group();

    const redMaterial = new THREE.MeshStandardMaterial({
        color: 0xa32126,
        roughness: 0.35,
        metalness: 0.4
    });
    const chromeMaterial = new THREE.MeshStandardMaterial({
        color: 0xc9ccd2,
        roughness: 0.3,
        metalness: 0.7
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
        color: 0x232529,
        roughness: 0.6,
        metalness: 0.4
    });

    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.85, 0.55), redMaterial);
    cabinet.position.set(0, 0.58, 0);
    cabinet.castShadow = true;
    box.add(cabinet);

    // Drawer fronts and handles
    for (let i = 0; i < 4; i++) {
        const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 0.02), redMaterial);
        drawer.position.set(0, 0.28 + i * 0.19, 0.285);
        box.add(drawer);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.03), chromeMaterial);
        handle.position.set(0, 0.33 + i * 0.19, 0.3);
        box.add(handle);
    }

    // Worktop and casters
    const workTop = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.6), darkMaterial);
    workTop.position.set(0, 1.03, 0);
    box.add(workTop);
    [[-0.45, -0.2], [0.45, -0.2], [-0.45, 0.2], [0.45, 0.2]].forEach(([cx, cz], i) => {
        const caster = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10), darkMaterial);
        caster.rotation.z = Math.PI / 2;
        caster.position.set(cx, 0.07, cz);
        caster.name = `caster${i}`;
        box.add(caster);
    });

    return box;
}

/**
 * A small shop air compressor: horizontal tank, motor, and gauge.
 */
function createAirCompressor() {
    const compressor = new THREE.Group();

    const tankMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d6bbf,
        roughness: 0.4,
        metalness: 0.6
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
        color: 0x232529,
        roughness: 0.6,
        metalness: 0.4
    });

    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.15, 14), tankMaterial);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(0, 0.5, 0);
    tank.castShadow = true;
    compressor.add(tank);

    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.36), darkMaterial);
    motor.position.set(-0.18, 0.95, 0);
    compressor.add(motor);

    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12),
        new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.4 }));
    gauge.rotation.x = Math.PI / 2;
    gauge.position.set(0.35, 0.92, 0.05);
    compressor.add(gauge);

    [[-0.42, 0], [0.42, 0]].forEach(([wx], i) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10), darkMaterial);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx, 0.09, 0.28);
        wheel.name = `compressorWheel${i}`;
        compressor.add(wheel);
    });

    return compressor;
}

/**
 * Furnish the garage: the lift with the raised SUV, tire racks along the
 * back and right walls, tire stacks by the bay, the workbench and pegboard,
 * the rolling tool chest, and the compressor. Everything registers collision
 * here, inside initStore, before main.js snapshots the collider list.
 */
function createGarageEquipment() {
    const equipment = new THREE.Group();
    equipment.name = 'garageEquipment';

    const addPiece = (piece, x, z, rotationY, kind, name) => {
        piece.position.set(x, 0, z);
        if (rotationY) piece.rotation.y = rotationY;
        piece.name = name;
        if (kind) {
            piece.userData.isScenery = true;
            piece.userData.sceneryKind = kind;
            galleryDecorMeshes.push(piece);
        }
        equipment.add(piece);
        collisionBoxes.push({ box: new THREE.Box3().setFromObject(piece), type: 'decor' });
        return piece;
    };

    // Tire racks: two along the back wall, one down the right wall
    addPiece(createTireRack(4.6), 5.5, -5.35, 0, 'tires', 'tireRackBackLeft');
    addPiece(createTireRack(4.6), 10.5, -5.35, 0, 'tires', 'tireRackBackRight');
    addPiece(createTireRack(4.6), 15.35, 2, -Math.PI / 2, 'tires', 'tireRackRightWall');

    // Tire stacks near the bay mouth
    addPiece(createTireStack(4), 1.2, 17.6, 0, 'tires', 'tireStackA');
    addPiece(createTireStack(3), 13.7, 16.8, 0, 'tires', 'tireStackB');

    // Workbench and pegboard on the right wall, past the rack
    addPiece(createGarageWorkbench(), 15.1, 11, -Math.PI / 2, 'workbench', 'garageWorkbench');

    // Rolling tool chest near the lift
    addPiece(createRollingToolbox(), 5.2, 2.3, 0.35, 'workbench', 'rollingToolbox');

    // Compressor in the back-right corner
    addPiece(createAirCompressor(), 14.6, -4.9, Math.PI / 2, null, 'airCompressor');

    storeGroup.add(equipment);

    // The lifts add themselves (each also places its vehicle): the white SUV
    // on the original bay, and a red sports car on the second bay beside it,
    // seated lower to match its lower rockers.
    createTwoPostLift(9, 5);
    createTwoPostLift(4, 5, { build: createSportsCar, name: 'liftedSportsCar', liftY: 1.27, halfLen: 2.4 });

    // A stack of tires waiting outside beside the bay, like the photos
    const outdoorStack = createTireStack(3);
    outdoorStack.position.set(3.2, 0, 20.9);
    outdoorStack.name = 'tireStackOutdoor';
    registerOutdoorProp(outdoorStack, 'tirestack');
    storeGroup.add(outdoorStack);
    collisionBoxes.push({ box: new THREE.Box3().setFromObject(outdoorStack), type: 'decor' });
}

/**
 * Create all walls
 */
function createWalls() {
    const { width, depth, height, wallThickness, positionX, positionZ } = STORE_CONFIG;

    const wallMaterial = new THREE.MeshStandardMaterial({
        map: stuccoTexture.clone(),
        roughness: 0.9,
        metalness: 0.1
    });

    // Back wall (solid)
    createWall(
        width, height, wallThickness,
        positionX, height / 2, positionZ - depth / 2,
        0, wallMaterial, 'backWall'
    );

    // (The portfolio site's starship mural is gone from the back wall: that
    // side of the shop now faces Railroad Ave and the 1892 freight depot,
    // and plain stucco suits the historic neighbors better.)

    // Left wall (solid)
    createWall(
        depth, height, wallThickness,
        positionX - width / 2, height / 2, positionZ,
        Math.PI / 2, wallMaterial, 'leftWall'
    );

    // Right wall (solid)
    createWall(
        depth, height, wallThickness,
        positionX + width / 2, height / 2, positionZ,
        Math.PI / 2, wallMaterial, 'rightWall'
    );

    // Front wall (with door and window openings)
    createFrontWall(wallMaterial);
}

/**
 * Build a procedural wordmark texture (name + tagline) so the gallery has no
 * external logo-image dependency. Transparent background, light text.
 */
function createWordmarkTexture(name, tagline) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 1024, 384);

    ctx.fillStyle = '#f5f5f2';
    ctx.font = '600 130px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 512, 150);

    if (tagline) {
        ctx.fillStyle = 'rgba(245, 245, 242, 0.72)';
        ctx.font = '300 52px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.letterSpacing = '8px';
        ctx.fillText(tagline, 512, 270);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return { texture, aspect: canvas.width / canvas.height };
}

/**
 * The shop's logo on the stucco beside the customer entrance.
 */
function createFrontExteriorLogo() {
    const { width, depth, height, positionX, positionZ, doorOffsetX, doorWidth, wallThickness } = STORE_CONFIG;
    const frontZ = positionZ + depth / 2;

    const logoHeight = 1.15;
    const logoWidth = logoHeight;   // the webp logo is square

    const logo = new THREE.Mesh(
        new THREE.PlaneGeometry(logoWidth, logoHeight),
        new THREE.MeshBasicMaterial({ map: getLogoTexture(), transparent: true })
    );

    // Center of the left stucco section next to the doors
    const leftSectionWidth = (width / 2) + doorOffsetX - doorWidth / 2;
    const leftSectionCenterX = positionX - width / 2 + leftSectionWidth / 2;
    logo.position.set(leftSectionCenterX, height * 0.6, frontZ + wallThickness / 2 + 0.02);
    logo.name = 'frontExteriorLogo';
    storeGroup.add(logo);
}

/**
 * Framed prints of the shop logo for the interior walls: one above the
 * waiting-room sofa on the left wall, and one on the garage's right wall in
 * the clear stretch between the tire rack and the workbench. A dark frame,
 * a white mat, and the same webp logo the rest of the shop wears.
 */
function createLogoWallArt() {
    const { width, positionX, positionZ, wallThickness } = STORE_CONFIG;
    const faceOffset = wallThickness / 2 + 0.03;

    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x2e2a26,
        roughness: 0.6,
        metalness: 0.1
    });
    const matMaterial = new THREE.MeshStandardMaterial({
        color: 0xf4f5f2,
        roughness: 0.9,
        metalness: 0
    });
    const printMaterial = new THREE.MeshStandardMaterial({
        map: getLogoTexture(),
        transparent: true,
        roughness: 0.85,
        metalness: 0
    });

    const buildFramedPrint = (name) => {
        const art = new THREE.Group();
        const printSize = 1.0;               // the square logo print
        const matSize = printSize + 0.18;
        const frameSize = matSize + 0.1;

        const frame = new THREE.Mesh(
            new THREE.BoxGeometry(frameSize, frameSize, 0.05),
            frameMaterial
        );
        frame.castShadow = true;
        art.add(frame);

        const mat = new THREE.Mesh(
            new THREE.BoxGeometry(matSize, matSize, 0.052),
            matMaterial
        );
        art.add(mat);

        const print = new THREE.Mesh(
            new THREE.PlaneGeometry(printSize, printSize),
            printMaterial
        );
        print.position.z = 0.032;
        art.add(print);

        art.name = name;
        return art;
    };

    // Waiting room: centered above the sofa on the left wall, facing +X.
    const sofaArt = buildFramedPrint('logoArtWaitingRoom');
    sofaArt.position.set(positionX - width / 2 + faceOffset, 2.55, positionZ + 3);
    sofaArt.rotation.y = Math.PI / 2;
    storeGroup.add(sofaArt);

    // Garage: on the right wall between the tire rack (z ≈ 2) and the
    // workbench (z ≈ 11), facing -X into the work floor.
    const garageArt = buildFramedPrint('logoArtGarage');
    garageArt.position.set(positionX + width / 2 - faceOffset, 2.3, positionZ - 0.5);
    garageArt.rotation.y = -Math.PI / 2;
    storeGroup.add(garageArt);
}

/**
 * Create outdoor bench beneath the front exterior logo
 */
function createOutdoorBench() {
    const { width, depth, positionX, positionZ, doorOffsetX, doorWidth, wallThickness } = STORE_CONFIG;
    const frontZ = positionZ + depth / 2;

    // Calculate position to match the logo location
    const leftSectionWidth = (width / 2) + doorOffsetX - doorWidth / 2;
    const leftSectionCenterX = positionX - width / 2 + leftSectionWidth / 2;

    const benchGroup = new THREE.Group();
    benchGroup.name = 'outdoorBench';

    // Bench dimensions
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

    // Materials
    const woodMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B4513,  // Saddle brown
        roughness: 0.8,
        metalness: 0.1
    });

    const metalMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,  // Dark metal
        roughness: 0.4,
        metalness: 0.8
    });

    // === SEAT (wooden slats) ===
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

    // === BACKREST (wooden slats) ===
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

    // === METAL LEGS (decorative curved style) ===
    const legPositions = [-seatWidth / 2 + 0.15, seatWidth / 2 - 0.15];

    legPositions.forEach(legX => {
        // Front leg
        const frontLeg = new THREE.Mesh(
            new THREE.BoxGeometry(legWidth, seatHeight, legWidth),
            metalMaterial
        );
        frontLeg.position.set(legX, seatHeight / 2, seatDepth / 2 - legWidth / 2);
        benchGroup.add(frontLeg);

        // Back leg (taller to support backrest)
        const backLeg = new THREE.Mesh(
            new THREE.BoxGeometry(legWidth, seatHeight + backHeight, legWidth),
            metalMaterial
        );
        backLeg.position.set(legX, (seatHeight + backHeight) / 2, -seatDepth / 2 + legWidth / 2);
        benchGroup.add(backLeg);

        // Horizontal support between legs
        const legSupport = new THREE.Mesh(
            new THREE.BoxGeometry(legWidth, legWidth, seatDepth - legWidth),
            metalMaterial
        );
        legSupport.position.set(legX, legWidth / 2 + 0.1, 0);
        benchGroup.add(legSupport);
    });

    // === ARMRESTS ===
    const armrestPositions = [-seatWidth / 2 + 0.05, seatWidth / 2 - 0.05];

    armrestPositions.forEach(armX => {
        // Vertical armrest support
        const armSupport = new THREE.Mesh(
            new THREE.BoxGeometry(armrestWidth, armrestHeight, armrestWidth),
            metalMaterial
        );
        armSupport.position.set(armX, seatHeight + armrestHeight / 2, seatDepth / 4);
        benchGroup.add(armSupport);

        // Horizontal armrest top
        const armTop = new THREE.Mesh(
            new THREE.BoxGeometry(armrestWidth, armrestWidth, armrestLength),
            woodMaterial
        );
        armTop.position.set(armX, seatHeight + armrestHeight, 0);
        benchGroup.add(armTop);
    });

    // Position the bench against the wall, beneath the logo
    benchGroup.position.set(
        leftSectionCenterX,
        0,
        frontZ + wallThickness / 2 + seatDepth / 2 + 0.1
    );

    registerOutdoorProp(benchGroup, 'bench');
    storeGroup.add(benchGroup);
}

/**
 * Create front wall with openings for the customer door, the tinted display
 * window, and the open garage bay (left to right across the facade).
 */
function createFrontWall(material) {
    const {
        width, height, wallThickness, positionX, positionZ, depth,
        doorWidth, doorHeight, doorOffsetX,
        windowWidth, windowHeight, windowBottom, windowOffsetX,
        bayWidth, bayHeight, bayOffsetX
    } = STORE_CONFIG;

    const frontZ = positionZ + depth / 2;

    // Calculate segment positions
    // Front wall is divided into segments around the door, window, and bay

    // Section above door
    const aboveDoorHeight = height - doorHeight;
    if (aboveDoorHeight > 0) {
        createWallSegment(
            doorWidth, aboveDoorHeight, wallThickness,
            positionX + doorOffsetX, doorHeight + aboveDoorHeight / 2, frontZ,
            material, 'frontWallAboveDoor'
        );
    }

    // Section above window
    const aboveWindowHeight = height - (windowBottom + windowHeight);
    if (aboveWindowHeight > 0) {
        createWallSegment(
            windowWidth, aboveWindowHeight, wallThickness,
            positionX + windowOffsetX, windowBottom + windowHeight + aboveWindowHeight / 2, frontZ,
            material, 'frontWallAboveWindow'
        );
    }

    // Section below window
    if (windowBottom > 0) {
        createWallSegment(
            windowWidth, windowBottom, wallThickness,
            positionX + windowOffsetX, windowBottom / 2, frontZ,
            material, 'frontWallBelowWindow'
        );
    }

    // Header above the garage bay (the bay itself stays open: no wall, no
    // collider, so visitors can walk straight in like the real shop)
    const aboveBayHeight = height - bayHeight;
    if (aboveBayHeight > 0) {
        createWallSegment(
            bayWidth, aboveBayHeight, wallThickness,
            positionX + bayOffsetX, bayHeight + aboveBayHeight / 2, frontZ,
            material, 'frontWallAboveBay'
        );
    }

    // Left section (between left edge and door)
    const leftSectionWidth = (width / 2) + doorOffsetX - doorWidth / 2;
    if (leftSectionWidth > 0) {
        createWallSegment(
            leftSectionWidth, height, wallThickness,
            positionX - width / 2 + leftSectionWidth / 2, height / 2, frontZ,
            material, 'frontWallLeft'
        );
    }

    // Middle section (between door and window)
    const doorRightEdge = doorOffsetX + doorWidth / 2;
    const windowLeftEdge = windowOffsetX - windowWidth / 2;
    const middleSectionWidth = windowLeftEdge - doorRightEdge;
    if (middleSectionWidth > 0) {
        createWallSegment(
            middleSectionWidth, height, wallThickness,
            positionX + doorRightEdge + middleSectionWidth / 2, height / 2, frontZ,
            material, 'frontWallMiddle'
        );
    }

    // Section between the window and the garage bay
    const windowRightEdge = windowOffsetX + windowWidth / 2;
    const bayLeftEdge = bayOffsetX - bayWidth / 2;
    const midRightSectionWidth = bayLeftEdge - windowRightEdge;
    if (midRightSectionWidth > 0) {
        createWallSegment(
            midRightSectionWidth, height, wallThickness,
            positionX + windowRightEdge + midRightSectionWidth / 2, height / 2, frontZ,
            material, 'frontWallMidRight'
        );
    }

    // Right section (between bay and right edge)
    const bayRightEdge = bayOffsetX + bayWidth / 2;
    const rightSectionWidth = (width / 2) - bayRightEdge;
    if (rightSectionWidth > 0) {
        createWallSegment(
            rightSectionWidth, height, wallThickness,
            positionX + bayRightEdge + rightSectionWidth / 2, height / 2, frontZ,
            material, 'frontWallRight'
        );
    }

    // Dress the bay opening as a rolled-up overhead door
    createGarageBay();
}

/**
 * Freshly painted walls for the customer waiting room. The shell keeps its
 * worn stucco (it suits the working garage), but the front-of-house gets thin
 * light-gray liner panels on its room-facing surfaces: the left wall, the
 * waiting-room stretch of the back wall, and the front-wall segments around
 * the entrance door and the display window. The panels sit 1cm off the stucco,
 * behind the light switch and the EXIT sign, which mount further into the
 * room. The partition is already clean off-white drywall and stays as it is,
 * reading as trim against the gray. No colliders needed: the real walls
 * behind the paint already block movement.
 */
function createWaitingRoomPaint() {
    const {
        width, depth, height, wallThickness, positionX, positionZ, partitionX,
        doorWidth, doorHeight, doorOffsetX,
        windowWidth, windowHeight, windowBottom, windowOffsetX
    } = STORE_CONFIG;

    const lift = 0.01;                                    // clear of the stucco (no z-fighting)
    const partitionFace = partitionX - 0.15;              // partition t = 0.3 (createPartitionWall)
    const innerLeftX = positionX - width / 2 + wallThickness / 2;
    const innerBackZ = positionZ - depth / 2 + wallThickness / 2;
    const innerFrontZ = positionZ + depth / 2 - wallThickness / 2;

    const paintMaterial = new THREE.MeshStandardMaterial({
        color: 0xd7dadb,           // a fresh coat of light gray
        roughness: 0.92,
        metalness: 0
    });

    const group = new THREE.Group();
    group.name = 'waitingRoomPaint';

    const panel = (w, h, x, y, z, rotY, name) => {
        if (w <= 0 || h <= 0) return;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paintMaterial);
        mesh.position.set(x, y, z);
        mesh.rotation.y = rotY;
        mesh.receiveShadow = true;
        mesh.name = name;
        group.add(mesh);
    };

    // Left wall, the room's full run between the shells (faces +X).
    panel(innerFrontZ - innerBackZ, height,
        innerLeftX + lift, height / 2, (innerBackZ + innerFrontZ) / 2,
        Math.PI / 2, 'paintLeftWall');

    // Back wall, left shell to the partition (faces +Z).
    panel(partitionFace - innerLeftX, height,
        (innerLeftX + partitionFace) / 2, height / 2, innerBackZ + lift,
        0, 'paintBackWall');

    // Front wall (faces -Z): segments mirroring the door and window openings.
    const face = (w, h, cx, cy, name) =>
        panel(w, h, cx, cy, innerFrontZ - lift, Math.PI, name);
    const doorL = positionX + doorOffsetX - doorWidth / 2;
    const doorR = positionX + doorOffsetX + doorWidth / 2;
    const winL = positionX + windowOffsetX - windowWidth / 2;
    const winR = positionX + windowOffsetX + windowWidth / 2;
    const winTop = windowBottom + windowHeight;

    face(doorL - innerLeftX, height, (innerLeftX + doorL) / 2, height / 2, 'paintFrontLeft');
    face(doorWidth, height - doorHeight, positionX + doorOffsetX, (doorHeight + height) / 2, 'paintFrontAboveDoor');
    face(winL - doorR, height, (doorR + winL) / 2, height / 2, 'paintFrontMiddle');
    face(windowWidth, height - winTop, positionX + windowOffsetX, (winTop + height) / 2, 'paintFrontAboveWindow');
    face(windowWidth, windowBottom, positionX + windowOffsetX, windowBottom / 2, 'paintFrontBelowWindow');
    face(partitionFace - winR, height, (winR + partitionFace) / 2, height / 2, 'paintFrontRight');

    storeGroup.add(group);
}

/**
 * Dress the open garage bay: the rolled-up door curtain tucked under the
 * header, a short strip of visible corrugated curtain below the roll, and the
 * vertical guide tracks at the jambs. Purely visual, the opening itself stays
 * walkable.
 */
function createGarageBay() {
    const { positionX, positionZ, depth, wallThickness, bayWidth, bayHeight, bayOffsetX } = STORE_CONFIG;
    const frontZ = positionZ + depth / 2;
    const bayX = positionX + bayOffsetX;

    const bayGroup = new THREE.Group();
    bayGroup.name = 'garageBay';

    const steelMaterial = new THREE.MeshStandardMaterial({
        color: 0x5a5e63,
        roughness: 0.45,
        metalness: 0.7
    });
    const trackMaterial = new THREE.MeshStandardMaterial({
        color: 0x2e3236,
        roughness: 0.5,
        metalness: 0.7
    });

    // The rolled-up curtain: a ribbed horizontal cylinder just inside the header
    const roll = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.26, bayWidth - 0.5, 12),
        steelMaterial
    );
    roll.rotation.z = Math.PI / 2;
    roll.position.set(bayX, bayHeight + 0.12, frontZ - wallThickness / 2 - 0.28);
    roll.name = 'bayDoorRoll';
    bayGroup.add(roll);

    // A short strip of curtain still hanging below the roll (corrugated slats)
    const slatCanvas = document.createElement('canvas');
    slatCanvas.width = 512;
    slatCanvas.height = 64;
    const slatCtx = slatCanvas.getContext('2d');
    slatCtx.fillStyle = '#9aa0a6';
    slatCtx.fillRect(0, 0, 512, 64);
    for (let y = 0; y < 64; y += 8) {
        slatCtx.fillStyle = 'rgba(40, 44, 48, 0.35)';
        slatCtx.fillRect(0, y, 512, 2);
        slatCtx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        slatCtx.fillRect(0, y + 3, 512, 1);
    }
    const slatTexture = new THREE.CanvasTexture(slatCanvas);
    const curtain = new THREE.Mesh(
        new THREE.PlaneGeometry(bayWidth - 0.4, 0.45),
        new THREE.MeshStandardMaterial({
            map: slatTexture,
            roughness: 0.6,
            metalness: 0.5,
            side: THREE.DoubleSide
        })
    );
    curtain.position.set(bayX, bayHeight - 0.18, frontZ - wallThickness / 2 - 0.05);
    curtain.name = 'bayDoorCurtain';
    bayGroup.add(curtain);

    // Vertical guide tracks at the jambs
    [-1, 1].forEach(side => {
        const track = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, bayHeight, 0.12),
            trackMaterial
        );
        track.position.set(
            bayX + side * (bayWidth / 2 - 0.06),
            bayHeight / 2,
            frontZ - wallThickness / 2 - 0.1
        );
        track.name = side < 0 ? 'bayTrackLeft' : 'bayTrackRight';
        bayGroup.add(track);
    });

    storeGroup.add(bayGroup);
}

/**
 * The facade-only second story: the real shop is a two-story stucco building
 * with stepped massing (the taller block on the left and rear, a lower parapet
 * over the garage). Everything here sits above the y = 5 interior ceiling, is
 * purely visual, and registers no colliders (the player and NPCs can never
 * reach it).
 */
function createUpperMassing() {
    const { width, height, positionX, positionZ, depth, wallThickness } = STORE_CONFIG;
    const frontZ = positionZ + depth / 2;
    const backZ = positionZ - depth / 2;
    const massingGroup = new THREE.Group();
    massingGroup.name = 'upperMassing';

    const capMaterial = new THREE.MeshStandardMaterial({
        color: 0xd9d0ba,
        roughness: 0.8,
        metalness: 0.05
    });

    const stuccoBox = (w, h, d, x, y, z, name) => {
        const mat = new THREE.MeshStandardMaterial({
            map: stuccoTexture.clone(),
            roughness: 0.9,
            metalness: 0.1
        });
        mat.map.repeat.set(Math.max(w, d) / 6, h / 3);
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        box.position.set(x, y, z);
        box.castShadow = true;
        box.receiveShadow = true;
        box.name = name;
        massingGroup.add(box);
        return box;
    };

    // Second-story dimensions. The tall block covers the waiting-room side and
    // wraps behind the garage; the garage front keeps a lower parapet.
    const upperH = 3.4;                       // y 5 .. 8.4
    const upperY = height + upperH / 2;
    const tallRightEdge = positionX + 2;      // tall block spans left edge .. +2
    const tallW = tallRightEdge - (positionX - width / 2);
    const tallX = positionX - width / 2 + tallW / 2;
    const fullD = depth + wallThickness;      // flush with the wall faces

    // Tall block (left side, full depth)
    stuccoBox(tallW, upperH, fullD, tallX, upperY, positionZ, 'upperTallBlock');

    // Rear strip over the back of the garage
    const rearW = positionX + width / 2 - tallRightEdge;
    stuccoBox(rearW, upperH, 8, tallRightEdge + rearW / 2, upperY, backZ + 4, 'upperRearStrip');

    // Parapet across the garage front (the sign mounts on this face)
    const parapetH = 1.6;
    stuccoBox(rearW, parapetH, wallThickness, tallRightEdge + rearW / 2, height + parapetH / 2, frontZ, 'garageParapetFront');

    // Parapet along the garage's right edge
    stuccoBox(wallThickness, parapetH, fullD, positionX + width / 2, height + parapetH / 2, positionZ, 'garageParapetRight');

    // Stepped parapet caps, slightly proud of each face
    const cap = (w, d, x, y, z, name) => {
        const capMesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), capMaterial);
        capMesh.position.set(x, y, z);
        capMesh.castShadow = true;
        capMesh.name = name;
        massingGroup.add(capMesh);
    };
    cap(tallW + 0.3, 0.55, tallX, height + upperH + 0.06, frontZ, 'tallBlockFrontCap');
    cap(0.55, fullD + 0.3, positionX - width / 2, height + upperH + 0.06, positionZ, 'tallBlockLeftCap');
    cap(rearW + 0.3, 0.55, tallRightEdge + rearW / 2, height + parapetH + 0.06, frontZ, 'garageParapetFrontCap');
    cap(0.55, fullD + 0.3, positionX + width / 2, height + parapetH + 0.06, positionZ, 'garageParapetRightCap');

    // Upstairs windows on the tall block's front face: dark glass, pale frames
    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0xcfc8b4,
        roughness: 0.7,
        metalness: 0.05
    });
    const paneMaterial = new THREE.MeshStandardMaterial({
        color: 0x14181c,
        roughness: 0.2,
        metalness: 0.4
    });
    const windowFaceZ = frontZ + wallThickness / 2 + 0.02;
    [-13, -8.5, -3].forEach((wx, i) => {
        const frame = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), frameMaterial);
        frame.position.set(positionX + wx, height + 1.8, windowFaceZ);
        frame.name = `upperWindowFrame${i}`;
        massingGroup.add(frame);
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.1), paneMaterial);
        pane.position.set(positionX + wx, height + 1.8, windowFaceZ + 0.005);
        pane.name = `upperWindowPane${i}`;
        massingGroup.add(pane);
    });

    // The phone banner high on the tall block, like the real building
    const bannerCanvas = document.createElement('canvas');
    bannerCanvas.width = 1024;
    bannerCanvas.height = 144;
    const bctx = bannerCanvas.getContext('2d');
    bctx.fillStyle = '#f4f5f2';
    bctx.fillRect(0, 0, 1024, 144);
    bctx.fillStyle = '#1d3f9e';
    bctx.font = '700 96px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    bctx.textAlign = 'center';
    bctx.textBaseline = 'middle';
    bctx.fillText('410-666-7333', 512, 76);
    const bannerTexture = new THREE.CanvasTexture(bannerCanvas);
    bannerTexture.colorSpace = THREE.SRGBColorSpace;
    bannerTexture.anisotropy = 4;
    const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(5.2, 0.73),
        new THREE.MeshBasicMaterial({ map: bannerTexture })
    );
    banner.position.set(tallX, height + 2.9, windowFaceZ);
    banner.name = 'upperPhoneBanner';
    massingGroup.add(banner);

    storeGroup.add(massingGroup);
}

/**
 * Create ceiling
 */
function createCeiling() {
    const { width, depth, height, positionX, positionZ } = STORE_CONFIG;

    // Main ceiling - use a box with thickness to properly cast shadows and block sunlight
    const ceilingThickness = 0.5;
    const ceilingGeometry = new THREE.BoxGeometry(width + 1, ceilingThickness, depth + 1);
    const ceilingMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a35,
        roughness: 0.9,
        metalness: 0.0
    });

    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.position.set(positionX, height + ceilingThickness / 2 - 0.1, positionZ);
    ceiling.castShadow = true;
    ceiling.receiveShadow = true;
    ceiling.name = 'ceiling';

    storeGroup.add(ceiling);

    // Add visible ceiling surface (bottom face inside store)
    const ceilingSurfaceGeometry = new THREE.PlaneGeometry(width - 0.1, depth - 0.1);
    const ceilingSurfaceMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a35,
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.DoubleSide
    });
    const ceilingSurface = new THREE.Mesh(ceilingSurfaceGeometry, ceilingSurfaceMaterial);
    ceilingSurface.rotation.x = Math.PI / 2;
    ceilingSurface.position.set(positionX, height - 0.1, positionZ);
    ceilingSurface.name = 'ceilingSurface';
    storeGroup.add(ceilingSurface);

    // Add ceiling beams
    createCeilingBeams();
}

/**
 * Create exposed ceiling beams
 */
function createCeilingBeams() {
    const { width, depth, height, positionX, positionZ } = STORE_CONFIG;

    const beamMaterial = new THREE.MeshLambertMaterial({
        color: 0x4a3728
    });

    const beamWidth = 0.3;
    const beamHeight = 0.4;
    const beamCount = 5;
    const spacing = depth / (beamCount + 1);

    for (let i = 1; i <= beamCount; i++) {
        const beamGeometry = new THREE.BoxGeometry(width - 1, beamHeight, beamWidth);
        const beam = new THREE.Mesh(beamGeometry, beamMaterial);
        beam.position.set(
            positionX,
            height - beamHeight / 2 - 0.1,
            positionZ - depth / 2 + spacing * i
        );
        beam.castShadow = false;    // Interior - no sun shadow interaction
        beam.receiveShadow = false; // Interior - no sun shadow interaction
        beam.name = `ceilingBeam${i}`;
        storeGroup.add(beam);
    }

    // Ceiling lights, at explicit positions threaded between the beams
    // (beams run across X at z -1.67/2.67/7/11.33/15.67) and clear of the
    // full-height partition at x -2: one column over the waiting room, two
    // over the garage. The default grid put a row inside beam three and a
    // column inside the partition face.
    createCeilingLights({
        xs: [-9, 3, 10],
        zs: [0.5, 4.83, 9.17, 13.5]
    });
}

/**
 * Create glass storefront (windows and doors)
 */
function createGlassStorefront() {
    const {
        positionX, positionZ, depth, wallThickness,
        doorWidth, doorHeight, doorOffsetX,
        windowWidth, windowHeight, windowBottom, windowOffsetX
    } = STORE_CONFIG;

    const frontZ = positionZ + depth / 2;

    // Glass material: dark smoked tint, matching the real shop's storefront
    const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x232a30,
        transparent: true,
        opacity: 0.6,
        roughness: 0.05,
        metalness: 0.1,
        reflectivity: 0.9,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        side: THREE.DoubleSide
    });

    // Frame material (dark metal)
    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.4,
        metalness: 0.8
    });

    // === DISPLAY WINDOW ===
    const windowGlass = new THREE.Mesh(
        new THREE.PlaneGeometry(windowWidth - 0.2, windowHeight - 0.2),
        glassMaterial
    );
    windowGlass.position.set(
        positionX + windowOffsetX,
        windowBottom + windowHeight / 2,
        frontZ + wallThickness / 2 + 0.01
    );
    windowGlass.name = 'displayWindowGlass';
    storeGroup.add(windowGlass);

    // White service lettering across the tinted window, like the real shop
    const lettering = createWindowLetteringTexture();
    const letteringMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(windowWidth - 0.7, (windowWidth - 0.7) / lettering.aspect),
        new THREE.MeshBasicMaterial({ map: lettering.texture, transparent: true })
    );
    letteringMesh.position.set(
        positionX + windowOffsetX,
        windowBottom + windowHeight / 2,
        frontZ + wallThickness / 2 + 0.02
    );
    letteringMesh.name = 'windowLettering';
    storeGroup.add(letteringMesh);

    // Window frame
    createWindowFrame(
        windowWidth, windowHeight,
        positionX + windowOffsetX,
        windowBottom + windowHeight / 2,
        frontZ + wallThickness / 2,
        frameMaterial, 'displayWindow'
    );

    // === ENTRANCE DOORS ===
    const doorGlassWidth = (doorWidth - 0.3) / 2 - 0.1;

    // Left door glass
    const leftDoorGlass = new THREE.Mesh(
        new THREE.PlaneGeometry(doorGlassWidth, doorHeight - 0.4),
        glassMaterial
    );
    leftDoorGlass.position.set(
        positionX + doorOffsetX - doorGlassWidth / 2 - 0.1,
        doorHeight / 2,
        frontZ + wallThickness / 2 + 0.01
    );
    leftDoorGlass.name = 'leftDoorGlass';
    leftDoorGlass.userData.closedX = positionX + doorOffsetX - doorGlassWidth / 2 - 0.1;
    storeGroup.add(leftDoorGlass);

    // Right door glass
    const rightDoorGlass = new THREE.Mesh(
        new THREE.PlaneGeometry(doorGlassWidth, doorHeight - 0.4),
        glassMaterial
    );
    rightDoorGlass.position.set(
        positionX + doorOffsetX + doorGlassWidth / 2 + 0.1,
        doorHeight / 2,
        frontZ + wallThickness / 2 + 0.01
    );
    rightDoorGlass.name = 'rightDoorGlass';
    rightDoorGlass.userData.closedX = positionX + doorOffsetX + doorGlassWidth / 2 + 0.1;
    storeGroup.add(rightDoorGlass);
    registerDoors(leftDoorGlass, rightDoorGlass);

    // Door decals ride along as children so they slide with the glass: the
    // Interstate Tire logo on the left pane, posted hours on the right.
    const logoDecal = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.62),
        new THREE.MeshBasicMaterial({ map: getLogoTexture(), transparent: true })
    );
    logoDecal.position.set(0, 0.25, 0.01);
    logoDecal.name = 'doorLogoDecal';
    leftDoorGlass.add(logoDecal);

    const hoursTexture = createHoursTexture();
    const hoursDecal = new THREE.Mesh(
        new THREE.PlaneGeometry(0.52, 0.65),
        new THREE.MeshBasicMaterial({ map: hoursTexture, transparent: true })
    );
    hoursDecal.position.set(0, 0.2, 0.01);
    hoursDecal.name = 'doorHoursDecal';
    rightDoorGlass.add(hoursDecal);

    // Door frames
    createDoorFrame(
        doorWidth, doorHeight,
        positionX + doorOffsetX,
        frontZ + wallThickness / 2,
        frameMaterial
    );
}

/**
 * White vinyl-style service lettering for the tinted display window:
 * the services on one line, the shop name and phone below.
 */
function createWindowLetteringTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 1024, 400);

    const face = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#f4f5f2';
    ctx.font = `600 78px ${face}`;
    ctx.fillText('Tires, Brakes, & Alignments', 512, 120);

    ctx.font = `700 68px ${face}`;
    ctx.fillText('INTERSTATE TIRE', 512, 245);
    ctx.font = `600 62px ${face}`;
    ctx.fillText('410-666-7333', 512, 330);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return { texture, aspect: canvas.width / canvas.height };
}

/**
 * The shop's real logo (assets/interstate-logo.webp), loaded once and shared
 * by every logo surface: the mark on the stucco beside the entrance, the
 * entrance-door decal, and the framed prints on the interior walls. The file
 * ships with the experience, so the load stays same-origin (CSP img-src 'self').
 */
let logoTexture = null;
function getLogoTexture() {
    if (!logoTexture) {
        logoTexture = new THREE.TextureLoader().load('assets/interstate-logo.webp');
        logoTexture.colorSpace = THREE.SRGBColorSpace;
        logoTexture.anisotropy = 4;
    }
    return logoTexture;
}

/**
 * Posted business hours for the entrance door glass.
 */
function createHoursTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 320);

    const face = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f4f5f2';

    ctx.font = `700 34px ${face}`;
    ctx.fillText('HOURS', 128, 36);

    ctx.font = `500 24px ${face}`;
    ctx.fillText('Mon to Fri', 128, 92);
    ctx.fillText('8:00 to 5:30', 128, 124);
    ctx.fillText('Saturday', 128, 172);
    ctx.fillText('8:00 to 1:00', 128, 204);
    ctx.fillText('Sunday Closed', 128, 252);

    ctx.font = `600 26px ${face}`;
    ctx.fillText('410-666-7333', 128, 298);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

/**
 * Create store sign
 */
function createStoreSign() {
    const { positionX, positionZ, depth, height, bayOffsetX } = STORE_CONFIG;
    const frontZ = positionZ + depth / 2;

    // The shop's signature sign: a white panel with INTERSTATE TIRE in bold
    // blue on one line, bookended by small versions of the shop's real logo,
    // mounted on the parapet above the garage bay just like the real building.
    const signWidth = 11;
    const signHeight = 1.6;
    const signX = positionX + bayOffsetX;
    // Centered on the parapet band (y 5.0 to 6.6) so the whole panel sits
    // above the bay-door header and nothing at bay height crowds the text.
    const signY = height + 0.8;

    const signBacking = new THREE.Mesh(
        new THREE.BoxGeometry(signWidth, signHeight, 0.2),
        new THREE.MeshStandardMaterial({
            color: 0xf4f4f0,
            roughness: 0.55,
            metalness: 0.05
        })
    );
    signBacking.position.set(
        signX,
        signY,
        frontZ + 0.3
    );
    signBacking.name = 'signBacking';
    storeGroup.add(signBacking);

    // Sign face: one line of lettering with tread bands at both ends,
    // large and bright so it stays legible even in a 1200x630 storefront
    // screenshot (free advertising when shared).
    const textCanvas = document.createElement('canvas');
    textCanvas.width = 2048;
    textCanvas.height = 320;
    const ctx = textCanvas.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const bannerFace = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    // INTERSTATE TIRE on one line, all in the brand blue. Shrink-to-fit
    // leaves room for the logo badges bookending the panel.
    const signName = 'INTERSTATE TIRE';
    let bannerFont = 190;
    ctx.font = `800 ${bannerFont}px ${bannerFace}`;
    while (ctx.measureText(signName).width > 1500 && bannerFont > 60) {
        bannerFont -= 4;
        ctx.font = `800 ${bannerFont}px ${bannerFace}`;
    }
    ctx.fillStyle = '#1d3f9e';
    ctx.fillText(signName, 1024, 160);

    const textTexture = new THREE.CanvasTexture(textCanvas);
    textTexture.needsUpdate = true;

    const signText = new THREE.Mesh(
        new THREE.PlaneGeometry(signWidth - 0.8, signHeight - 0.2),
        new THREE.MeshBasicMaterial({
            map: textTexture,
            transparent: true,
            side: THREE.DoubleSide
        })
    );
    signText.position.set(
        signX,
        signY,
        frontZ + 0.42
    );
    signText.name = 'signText';
    storeGroup.add(signText);

    // Small versions of the shop's real logo bookend the lettering. Separate
    // square planes (not painted into the text canvas) so the mark keeps its
    // true proportions and shares the one cached logo texture. They sit 5cm
    // proud of the text plane: the full-width text plane passes behind them,
    // and two coplanar transparent surfaces would z-fight (fuzzy shimmer).
    [-1, 1].forEach((side) => {
        const badge = new THREE.Mesh(
            new THREE.PlaneGeometry(1.0, 1.0),
            new THREE.MeshBasicMaterial({ map: getLogoTexture(), transparent: true })
        );
        badge.position.set(signX + side * (signWidth / 2 - 1.1), signY, frontZ + 0.47);
        badge.name = side < 0 ? 'signLogoLeft' : 'signLogoRight';
        storeGroup.add(badge);
    });

    // Add subtle glow light for sign
    const signLight = new THREE.PointLight(0xffffff, 0.5, 8);
    signLight.position.set(signX, signY + 0.4, frontZ + 1);
    signLight.name = 'signLight';
    storeGroup.add(signLight);
}

// The clickable light switch beside the door (opens the lighting control).
/**
 * Create "Grand Opening" banner on the store window
 */
function createGrandOpeningSign() {
    const { positionX, positionZ, depth, windowOffsetX, windowBottom, windowHeight, wallThickness } = STORE_CONFIG;
    const frontZ = positionZ + depth / 2;

    // Banner dimensions
    const bannerWidth = 8;
    const bannerHeight = 0.8;

    // Position on the upper portion of the window
    const bannerY = windowBottom + windowHeight - bannerHeight / 2 - 0.7;
    const bannerX = positionX + windowOffsetX;
    const bannerZ = frontZ + wallThickness / 2 + 0.05;

    // Create banner backing with festive gold/amber color
    const bannerBacking = new THREE.Mesh(
        new THREE.BoxGeometry(bannerWidth, bannerHeight, 0.05),
        new THREE.MeshStandardMaterial({
            color: 0xb8860b,  // Dark goldenrod
            roughness: 0.3,
            metalness: 0.5,
            emissive: 0x4a3600,
            emissiveIntensity: 0.3
        })
    );
    bannerBacking.position.set(bannerX, bannerY, bannerZ);
    bannerBacking.name = 'grandOpeningBacking';
    storeGroup.add(bannerBacking);

    // Create text texture for banner
    const textCanvas = document.createElement('canvas');
    textCanvas.width = 1024;
    textCanvas.height = 128;
    const ctx = textCanvas.getContext('2d');

    // Gradient background
    const gradient = ctx.createLinearGradient(0, 0, 1024, 0);
    gradient.addColorStop(0, '#8B0000');     // Dark red
    gradient.addColorStop(0.5, '#DC143C');   // Crimson
    gradient.addColorStop(1, '#8B0000');     // Dark red
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 128);

    // Main text with shadow
    ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Text shadow
    ctx.fillStyle = '#000000';
    ctx.fillText('GRAND OPENING', 514, 66);

    // Gold text
    ctx.fillStyle = '#FFD700';
    ctx.fillText('GRAND OPENING', 512, 64);

    const textTexture = new THREE.CanvasTexture(textCanvas);
    textTexture.needsUpdate = true;

    const bannerText = new THREE.Mesh(
        new THREE.PlaneGeometry(bannerWidth - 0.2, bannerHeight - 0.1),
        new THREE.MeshBasicMaterial({
            map: textTexture,
            transparent: false,
            side: THREE.DoubleSide
        })
    );
    bannerText.position.set(bannerX, bannerY, bannerZ + 0.03);
    bannerText.name = 'grandOpeningText';
    storeGroup.add(bannerText);

    // Add subtle glow light for the banner
    const bannerLight = new THREE.PointLight(0xffd700, 0.4, 5);
    bannerLight.position.set(bannerX, bannerY, bannerZ + 0.5);
    bannerLight.name = 'grandOpeningLight';
    storeGroup.add(bannerLight);
}

/**
 * Create the checkout counter with cash register near the front of the store
 */
function createCheckoutCounter() {
    const { positionX, positionZ, depth } = STORE_CONFIG;
    const frontZ = positionZ + depth / 2;

    const counterGroup = new THREE.Group();
    counterGroup.name = 'checkoutCounter';

    // Counter dimensions
    const counterWidth = 3.5;
    const counterDepth = 1.2;
    const counterHeight = 1.0;
    const counterThickness = 0.08;

    // Position: mid waiting room, facing the entrance, with the host behind it
    const counterX = positionX - 9;
    const counterZ = frontZ - 10;

    // === COUNTER BASE (gray laminate service counter) ===
    const woodMaterial = new THREE.MeshStandardMaterial({
        color: 0x6b6e73,
        roughness: 0.55,
        metalness: 0.15
    });

    const darkWoodMaterial = new THREE.MeshStandardMaterial({
        color: 0x3f4247,
        roughness: 0.5,
        metalness: 0.2
    });

    // Main counter body
    const counterBody = new THREE.Mesh(
        new THREE.BoxGeometry(counterWidth, counterHeight - counterThickness, counterDepth),
        woodMaterial
    );
    counterBody.position.set(0, (counterHeight - counterThickness) / 2, 0);
    counterBody.castShadow = true;
    counterBody.receiveShadow = true;
    counterGroup.add(counterBody);

    // Counter top (slightly larger, darker wood)
    const counterTop = new THREE.Mesh(
        new THREE.BoxGeometry(counterWidth + 0.1, counterThickness, counterDepth + 0.1),
        darkWoodMaterial
    );
    counterTop.position.set(0, counterHeight - counterThickness / 2, 0);
    counterTop.castShadow = true;
    counterTop.receiveShadow = true;
    counterGroup.add(counterTop);

    // Front panel detail (recessed)
    const frontPanel = new THREE.Mesh(
        new THREE.BoxGeometry(counterWidth - 0.3, counterHeight - 0.3, 0.05),
        darkWoodMaterial
    );
    frontPanel.position.set(0, (counterHeight - 0.15) / 2, counterDepth / 2 - 0.03);
    counterGroup.add(frontPanel);

    // === CASH REGISTER ===
    const registerGroup = new THREE.Group();
    registerGroup.name = 'cashRegister';

    // Register base
    const registerMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.3,
        metalness: 0.7
    });

    const registerBase = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.15, 0.4),
        registerMaterial
    );
    registerBase.position.set(0, 0.075, 0);
    registerBase.castShadow = true;
    registerGroup.add(registerBase);

    // Register body (angled display area)
    const registerBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.25, 0.35),
        registerMaterial
    );
    registerBody.position.set(0, 0.15 + 0.125, -0.02);
    registerBody.castShadow = true;
    registerGroup.add(registerBody);

    // Display screen
    const screenMaterial = new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        roughness: 0.1,
        metalness: 0.3,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.3
    });

    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.35, 0.15),
        screenMaterial
    );
    screen.position.set(0, 0.35, 0.15);
    screen.rotation.x = -0.3;
    registerGroup.add(screen);

    // Number pad buttons (on the shopkeeper side - negative Z)
    const buttonMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a5568,
        roughness: 0.5,
        metalness: 0.3
    });

    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const button = new THREE.Mesh(
                new THREE.BoxGeometry(0.06, 0.02, 0.06),
                buttonMaterial
            );
            button.position.set(
                (col - 1) * 0.08,
                0.16,
                -0.05 - row * 0.08  // Negative Z - facing shopkeeper
            );
            registerGroup.add(button);
        }
    }

    // Cash drawer (opens toward shopkeeper)
    const drawerMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d3748,
        roughness: 0.4,
        metalness: 0.5
    });

    const drawer = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.08, 0.38),
        drawerMaterial
    );
    drawer.position.set(0, 0.04, -0.02);
    drawer.castShadow = true;
    registerGroup.add(drawer);

    // Drawer handle (on shopkeeper side)
    const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.02, 0.02),
        new THREE.MeshStandardMaterial({
            color: 0x718096,
            roughness: 0.3,
            metalness: 0.8
        })
    );
    handle.position.set(0, 0.05, -0.2);
    registerGroup.add(handle);

    // Position register on counter
    registerGroup.position.set(0.5, counterHeight, 0);
    counterGroup.add(registerGroup);

    // === SMALL ITEMS ON COUNTER ===
    // Receipt paper roll holder
    const paperHolder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.12, 12),
        new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.9 })
    );
    paperHolder.position.set(-0.8, counterHeight + 0.06, 0.2);
    paperHolder.rotation.z = Math.PI / 2;
    counterGroup.add(paperHolder);

    // Pen cup
    const penCup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.035, 0.1, 12),
        new THREE.MeshStandardMaterial({ color: 0x2da6ed, roughness: 0.5 })
    );
    penCup.position.set(-1.2, counterHeight + 0.05, 0.3);
    counterGroup.add(penCup);

    // A few pens
    const penMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    for (let i = 0; i < 3; i++) {
        const pen = new THREE.Mesh(
            new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6),
            penMaterial
        );
        pen.position.set(
            -1.2 + (Math.random() - 0.5) * 0.03,
            counterHeight + 0.12,
            0.3 + (Math.random() - 0.5) * 0.03
        );
        pen.rotation.x = (Math.random() - 0.5) * 0.3;
        pen.rotation.z = (Math.random() - 0.5) * 0.3;
        counterGroup.add(pen);
    }

    // The shop contact's business card, standing in its holder on the customer
    // side of the counter between the register and the receipt roll. The card
    // builder faces +Z, which here is already toward the entrance. Registered
    // as clickable scenery: hovering invites visitors to take the card, and a
    // click opens the card close-up modal (wired in main.js).
    const card = createBusinessCard();
    card.position.set(-0.35, counterHeight, 0.38);
    card.userData.isScenery = true;
    card.userData.sceneryKind = 'businesscard';
    counterGroup.add(card);
    galleryDecorMeshes.push(card);

    // Position the entire counter group
    counterGroup.position.set(counterX, 0, counterZ);
    storeGroup.add(counterGroup);

    // Add collision box for counter
    const counterBox = new THREE.Box3(
        new THREE.Vector3(
            counterX - counterWidth / 2 - 0.2,
            0,
            counterZ - counterDepth / 2 - 0.2
        ),
        new THREE.Vector3(
            counterX + counterWidth / 2 + 0.2,
            counterHeight + 0.5,
            counterZ + counterDepth / 2 + 0.2
        )
    );
    collisionBoxes.push({ box: counterBox, type: 'counter' });
}

/**
 * Create a foldout table
 */
function createFoldoutTable(width, depth, height, legWidth, topMaterial, legMaterial) {
    const table = new THREE.Group();

    // Table top (thin, slightly textured for that plastic folding table look)
    const topGeometry = new THREE.BoxGeometry(width, 0.03, depth);
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.y = height;
    top.castShadow = true;
    top.receiveShadow = true;
    table.add(top);

    // Edge trim (slightly darker)
    const edgeMaterial = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.5,
        metalness: 0.2
    });

    // Front and back edges
    const frontEdge = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.04, 0.02),
        edgeMaterial
    );
    frontEdge.position.set(0, height - 0.02, depth / 2);
    table.add(frontEdge);

    const backEdge = frontEdge.clone();
    backEdge.position.z = -depth / 2;
    table.add(backEdge);

    // Side edges
    const sideEdge = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.04, depth),
        edgeMaterial
    );
    sideEdge.position.set(-width / 2, height - 0.02, 0);
    table.add(sideEdge);

    const sideEdge2 = sideEdge.clone();
    sideEdge2.position.x = width / 2;
    table.add(sideEdge2);

    // Folding legs (X-frame style, simplified)
    const legHeight = height - 0.03;
    const legGeometry = new THREE.BoxGeometry(legWidth, legHeight, legWidth);

    // Create leg pairs (angled slightly inward)
    const legInset = 0.1;
    const legPositions = [
        { x: -width / 2 + legInset, z: -depth / 2 + legInset },
        { x: width / 2 - legInset, z: -depth / 2 + legInset },
        { x: -width / 2 + legInset, z: depth / 2 - legInset },
        { x: width / 2 - legInset, z: depth / 2 - legInset }
    ];

    legPositions.forEach(pos => {
        const leg = new THREE.Mesh(legGeometry, legMaterial);
        leg.position.set(pos.x, legHeight / 2, pos.z);
        leg.castShadow = true;
        table.add(leg);
    });

    // Cross braces under table for stability
    const braceGeometry = new THREE.BoxGeometry(width - 0.3, 0.02, 0.02);
    const brace = new THREE.Mesh(braceGeometry, legMaterial);
    brace.position.set(0, height * 0.4, 0);
    table.add(brace);

    return table;
}

// Interior decor (plants) the player can click for a "how to explore" hint.
let galleryDecorMeshes = [];

/** The clickable decor meshes (plants), for raycasting in main.js. */
export function getDecorMeshes() {
    return galleryDecorMeshes;
}

// Outdoor props (benches, lamps, planters, the welcome mat, bushes, trees) the
// player can click for a short on-theme quip. The registry itself lives in the
// shared world context (registerOutdoorProp / getOutdoorPropMeshes, imported
// and re-exported at the top of this file).

// Stationary greeter NPCs inside the neighboring shops (cafe + bookstore),
// exposed so main.js can register them as clickable raycast targets.
let greeterMeshes = [];

/** The shop greeter groups, for click/hover raycasting in main.js. */
export function getGreeterMeshes() {
    return greeterMeshes;
}

// Footprints of the enterable shops, slightly inset from the walls, so main.js
// can fire enter/leave telemetry as the player crosses the threshold.
let shopFootprints = [];

/** Enterable shop footprints: [{ id, minX, maxX, minZ, maxZ }]. */
export function getShopFootprints() {
    return shopFootprints;
}

/**
 * Create interior decorations along the side walls
 * Plants, chairs, sofas, vending machines, etc.
 */
/**
 * A small studio desk: a wood top on metal legs, a monitor running a gentle faux
 * build log, a keyboard, and a coffee mug. Built facing local +Z (the screen
 * faces +Z), so the caller can drop it against the back wall facing the entrance.
 */
function createStudioDesk() {
    const desk = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6f4a2f, roughness: 0.6, metalness: 0.1 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.7 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.6 });

    const topW = 1.7, topD = 0.75, topY = 0.74;
    const top = new THREE.Mesh(new THREE.BoxGeometry(topW, 0.05, topD), woodMat);
    top.position.set(0, topY, 0);
    top.castShadow = true; top.receiveShadow = true;
    desk.add(top);

    // Four legs at the corners.
    const legH = topY - 0.025;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, legH, 0.06), metalMat);
        leg.position.set(sx * (topW / 2 - 0.1), legH / 2, sz * (topD / 2 - 0.1));
        leg.castShadow = true;
        desk.add(leg);
    });

    // Monitor near the back of the desk, screen facing +Z.
    const screenZ = -topD / 2 + 0.12;
    const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.16), darkMat);
    standBase.position.set(0, topY + 0.04, screenZ);
    desk.add(standBase);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.04), darkMat);
    neck.position.set(0, topY + 0.18, screenZ);
    desk.add(neck);
    const bezelW = 0.66, bezelH = 0.4, bezelCY = topY + 0.42;
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(bezelW, bezelH, 0.035), darkMat);
    bezel.position.set(0, bezelCY, screenZ);
    bezel.castShadow = true;
    desk.add(bezel);
    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(bezelW - 0.06, bezelH - 0.06),
        // MeshBasic so the screen reads as self-lit (glowing) at any room brightness.
        new THREE.MeshBasicMaterial({ map: createMonitorScreen() })
    );
    screen.position.set(0, bezelCY, screenZ + 0.019); // just proud of the bezel front (+Z)
    desk.add(screen);

    // One cheap localized point light for the monitor's glow on the desk (cool,
    // short range, no shadow). A single light here is negligible, unlike a real
    // light per gallery piece.
    const glow = new THREE.PointLight(0x9fc4ff, 0.4, 3.2, 1.5);
    glow.position.set(0, bezelCY, screenZ + 0.5);
    desk.add(glow);

    // Keyboard and a coffee mug, for a lived-in feel.
    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.15), darkMat);
    keyboard.position.set(0, topY + 0.04, topD / 2 - 0.2);
    keyboard.castShadow = true;
    desk.add(keyboard);
    const mug = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.04, 0.1, 14),
        new THREE.MeshStandardMaterial({ color: 0xb5483a, roughness: 0.5 })
    );
    mug.position.set(topW / 2 - 0.3, topY + 0.08, topD / 2 - 0.18);
    mug.castShadow = true;
    desk.add(mug);

    return desk;
}

/** The printed face of the desk business card, drawn to a canvas so the name and
 *  brand stay crisp up close with no external image. ~1.75:1, the real card ratio. */
function createBusinessCardTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 292;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#fbfaf8';                 // warm card stock
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#2b6cb0';                 // slim accent bar down the left edge
    ctx.fillRect(0, 0, 26, canvas.height);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const lx = 62;

    // This is the shop's card, not any one person's: everything comes from
    // INTERSTATE_CONFIG.site.business, so the painted card always matches the
    // card modal. The headline keeps the two-tone treatment (last word in
    // accent), and the shop's phone and website fill the contact lines.
    const business = INTERSTATE_CONFIG.site.business;
    const nameParts = business.name.split(' ');
    const nameB = nameParts.length > 1 ? nameParts.pop() : '';
    const nameA = nameParts.join(' ') + (nameB ? ' ' : '');

    ctx.font = '700 50px Georgia, "Times New Roman", serif';   // shop name headline
    ctx.fillStyle = '#2c3138';
    ctx.fillText(nameA, lx, 104);
    const nameAW = ctx.measureText(nameA).width;
    ctx.fillStyle = '#2b6cb0';
    ctx.fillText(nameB, lx + nameAW, 104);

    ctx.font = '400 26px Georgia, serif';      // what the shop does
    ctx.fillStyle = '#6b7280';
    ctx.fillText('Tires, Brakes, & Alignments', lx, 168);

    ctx.font = '400 25px Georgia, serif';      // how to reach them
    ctx.fillStyle = '#2c3138';
    ctx.fillText(business.phone, lx, 214);
    ctx.fillStyle = '#2b6cb0';
    ctx.fillText(new URL(business.websiteUrl).host, lx, 256);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
}

/** A small business card standing in a holder, built facing local +Z so the
 *  caller can drop it on the desk facing the entrance. Its printed face carries a
 *  faint emissive of its own texture so it stays legible even at low brightness. */
function createBusinessCard() {
    const card = new THREE.Group();

    // A small holder/tray the card stands in.
    const trayMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.6 });
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.012, 0.05), trayMat);
    tray.position.set(0, 0.006, 0);
    tray.castShadow = true; tray.receiveShadow = true;
    card.add(tray);

    // The card itself: standing, tilted gently back so it reads from the front and
    // slightly above (the player looks down on the desk).
    const cardW = 0.11, cardH = 0.062, cardT = 0.004;
    const tex = createBusinessCardTexture();
    const faceMat = new THREE.MeshStandardMaterial({
        map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.32, roughness: 0.85
    });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xfbfaf8, roughness: 0.85 });
    // BoxGeometry material order is +X, -X, +Y, -Y, +Z, -Z; the printed face is +Z.
    const cardMesh = new THREE.Mesh(
        new THREE.BoxGeometry(cardW, cardH, cardT),
        [sideMat, sideMat, sideMat, sideMat, faceMat, sideMat]
    );
    cardMesh.position.set(0, 0.045, 0.006);
    cardMesh.rotation.x = -0.26; // lean back into the holder
    cardMesh.castShadow = true;
    card.add(cardMesh);

    return card;
}

/**
 * Build the monitor's terminal screen as an animated CanvasTexture and stash the
 * drawing state in `galleryMonitor` for updateGalleryMonitor() to drive. With
 * reduced motion, the full log is drawn once with a steady cursor and never
 * animates.
 */
function createMonitorScreen() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    galleryMonitor = {
        ctx, texture,
        shown: _reducedMotion.matches ? MONITOR_SCRIPT.length : 0,
        done: _reducedMotion.matches,
        cursorOn: true,
        lineAcc: 0, cursorAcc: 0, holdAcc: 0, lastT: 0
    };
    drawMonitor();
    return texture;
}

/**
 * Paint the current terminal state (visible lines + cursor) onto any 2D context
 * at any size. The layout is authored against a 512x320 reference and scaled
 * uniformly by `k`, so the same faux build log renders identically on the little
 * in-world screen texture and on the big "click the monitor" modal canvas. Both
 * read the one shared `galleryMonitor` animation state, so they stay in sync.
 */
export function drawMonitorTo(ctx, W, H) {
    const m = galleryMonitor;
    if (!m) return;
    const k = H / 320; // reference design is 512x320 (16:10)

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);
    // Title bar with the three "window" dots.
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, W, 34 * k);
    ['#ff5f56', '#ffbd2e', '#27c93f'].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc((24 + i * 22) * k, 17 * k, 6 * k, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.font = `${Math.round(17 * k)}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textBaseline = 'top';
    const marginX = 16 * k;
    const startY = 48 * k, lineH = 24 * k;
    const maxW = W - marginX * 2;

    // The log is authored as full sentences; wrap each one to the screen width the
    // way a real terminal would, so a long message becomes several rows. Reveal
    // still advances one message at a time (m.shown) — a message just spans >1 row.
    const segs = [];
    MONITOR_SCRIPT.slice(0, m.shown).forEach((ln) => {
        let color;
        if (ln.startsWith('$')) color = '#e6edf3';                  // command (bright)
        else if (ln.startsWith('✓') || ln.startsWith('✨') || ln.includes('passed'))
            color = '#3fb950';                                      // the green "pass" font
        else color = '#8b949e';                                     // dimmer terminal output
        wrapMonitorLine(ctx, ln, maxW).forEach((seg) => segs.push({ seg, color }));
    });

    // Bottom-anchored scrollback: once the conversation is taller than the screen,
    // the oldest rows scroll off the top like a real terminal, so the log can grow
    // without clipping. One row is reserved for the cursor.
    const maxRows = Math.max(1, Math.floor((H - startY) / lineH) - 1);
    const visible = segs.slice(-maxRows);
    visible.forEach((r, i) => {
        ctx.fillStyle = r.color;
        ctx.fillText(r.seg, marginX, startY + i * lineH);
    });
    // The block cursor blinks below the last row — a terminal waiting on its human.
    if (m.cursorOn) {
        ctx.fillStyle = '#3fb950';
        ctx.fillRect(marginX, startY + visible.length * lineH + 2 * k, 10 * k, 18 * k);
    }
}

// Greedy word-wrap to a pixel width using the context's current font, preserving a
// line's leading indent on every wrapped row (so replies stay hanging-indented).
// Always returns at least one segment so blank lines still advance a row.
function wrapMonitorLine(ctx, text, maxW) {
    const indent = text.match(/^\s*/)[0];
    const words = text.slice(indent.length).split(' ');
    const rows = [];
    let line = indent;
    for (const w of words) {
        const next = line === indent ? line + w : line + ' ' + w;
        if (line !== indent && ctx.measureText(next).width > maxW) {
            rows.push(line);
            line = indent + w;
        } else {
            line = next;
        }
    }
    rows.push(line);
    return rows;
}

/** Paint the in-world monitor texture (512x320) and flag it for upload. */
function drawMonitor() {
    const m = galleryMonitor;
    if (!m) return;
    drawMonitorTo(m.ctx, 512, 320);
    m.texture.needsUpdate = true;
}

/**
 * Drive the studio monitor: blink the cursor and reveal the faux build log a line
 * at a time, then hold and loop. Called every frame from the render loop with the
 * cumulative elapsed seconds. Only redraws when something actually changes (a few
 * times a second at most), and does nothing under reduced motion.
 */
export function updateGalleryMonitor(elapsed) {
    const m = galleryMonitor;
    if (!m || _reducedMotion.matches) return;

    const dt = Math.max(0, elapsed - m.lastT);
    m.lastT = elapsed;
    let changed = false;

    m.cursorAcc += dt;
    if (m.cursorAcc >= 0.53) { m.cursorAcc = 0; m.cursorOn = !m.cursorOn; changed = true; }

    if (!m.done) {
        m.lineAcc += dt;
        if (m.lineAcc >= 1.4) {
            m.lineAcc = 0;
            m.shown++;
            if (m.shown >= MONITOR_SCRIPT.length) m.done = true;
            changed = true;
        }
    } else {
        m.holdAcc += dt;
        if (m.holdAcc >= 4) { m.holdAcc = 0; m.shown = 0; m.done = false; changed = true; }
    }

    if (changed) drawMonitor();
}

/**
 * A modest colophon plaque: a dark plate with light, engraved-looking text noting
 * how the gallery was built. Drawing sits on the local +Z face.
 */
function createColophonPlaque() {
    const group = new THREE.Group();

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#20242b';
    ctx.fillRect(0, 0, 1024, 384);
    ctx.strokeStyle = '#3a4150';
    ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, 976, 336);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fb4d0';
    ctx.font = '600 34px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('C O L O P H O N', 512, 70);
    ctx.fillStyle = '#f2f0ea';
    ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Made with Claude', 512, 158);
    ctx.fillStyle = '#c4ccd6';
    ctx.font = '38px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Three.js and vanilla JavaScript.', 512, 244);
    ctx.fillText('The art here is all drawn in code.', 512, 298);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;

    const w = 1.5, h = w * (384 / 1024);
    const plate = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, 0.04),
        new THREE.MeshStandardMaterial({
            color: 0x20242b, roughness: 0.5,
            emissive: 0x20242b, emissiveIntensity: 0.25
        })
    );
    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true })
    );
    face.position.z = 0.021;
    group.add(plate);
    group.add(face);
    return group;
}

function createInteriorDecor() {
    const { depth, positionX, positionZ, partitionX } = STORE_CONFIG;
    const decorGroup = new THREE.Group();
    decorGroup.name = 'interiorDecor';
    galleryDecorMeshes = [];

    const { width } = STORE_CONFIG;
    const backZ = positionZ - depth / 2;
    const frontZ = positionZ + depth / 2;

    // The waiting room gets the softer furnishings; the garage next door is
    // furnished separately by createGarageEquipment(). Plants hug the waiting
    // room's left wall and corners so the seating and counter stay clear.
    const leftX = positionX - width / 2 + 0.8;

    const allItems = [
        // Left wall: back corner, mid stretch, front corner
        { type: 'tallPlant',  x: leftX,  z: backZ + 1.2 },
        { type: 'fern',       x: leftX,  z: positionZ - 2 },
        { type: 'snakePlant', x: leftX,  z: frontZ - 1.4 },
        // Front corner beside the partition, near the chairs
        { type: 'fern',       x: partitionX - 1.2, z: frontZ - 1.3 },
    ];

    allItems.forEach((item, index) => {
        let decor;

        switch (item.type) {
            case 'tallPlant':
                decor = createTallPlant();
                break;
            case 'smallPlant':
                decor = createSmallPlant();
                break;
            case 'snakePlant':
                decor = createSnakePlant();
                break;
            case 'fern':
                decor = createFernPlant();
                break;
            case 'sofa':
                decor = createSofa();
                break;
            case 'chair':
                decor = createLoungeChair();
                break;
            case 'vendingMachine':
                decor = createVendingMachine();
                break;
            default:
                return;
        }

        decor.position.set(item.x, 0, item.z);
        if (item.rotation) {
            decor.rotation.y = item.rotation;
        }
        decor.name = `decor_${item.type}_${index}`;
        // Tag as clickable scenery so a click pops a friendly how-to hint
        // (resolved by climbing to this root group in main.js).
        decor.userData.isScenery = true;
        decor.userData.sceneryKind = 'plant';
        decor.userData.sceneryIndex = index; // stable id → a consistent name in main.js
        decorGroup.add(decor);
        galleryDecorMeshes.push(decor);

        // Add collision for larger items
        if (['sofa', 'vendingMachine', 'tallPlant', 'snakePlant', 'fern'].includes(item.type)) {
            const box = new THREE.Box3().setFromObject(decor);
            collisionBoxes.push({ box, type: 'decor' });
        }
    });

    // A sofa along the waiting room's left wall (built facing +Z, rotated to
    // face into the room). Its own clickable scenery kind with a dialog in
    // main.js.
    const sofa = createSofa();
    sofa.position.set(positionX - width / 2 + 0.85, 0, positionZ + 3);
    sofa.rotation.y = Math.PI / 2; // face +X, into the waiting room
    sofa.name = 'decor_sofa';
    sofa.userData.isScenery = true;
    sofa.userData.sceneryKind = 'sofa';
    decorGroup.add(sofa);
    galleryDecorMeshes.push(sofa);
    collisionBoxes.push({ box: new THREE.Box3().setFromObject(sofa), type: 'decor' });

    // The vending machine stands against the partition wall mid-room, easy to
    // spot from the chairs. Built facing +Z, rotated to face -X (into the
    // waiting room).
    const vendingMachine = createVendingMachine();
    vendingMachine.position.set(partitionX - 0.65, 0, positionZ - 3);
    vendingMachine.rotation.y = -Math.PI / 2; // face into the waiting room
    vendingMachine.name = 'decor_vending';
    vendingMachine.userData.isScenery = true;
    vendingMachine.userData.sceneryKind = 'vending';
    decorGroup.add(vendingMachine);
    galleryDecorMeshes.push(vendingMachine);
    collisionBoxes.push({ box: new THREE.Box3().setFromObject(vendingMachine), type: 'decor' });

    // The back-office desk in the waiting room's back corner, facing the room.
    // Its monitor runs a gentle faux work log. Clickable scenery with its own
    // dialog in main.js.
    const desk = createStudioDesk();
    desk.position.set(positionX - width / 2 + 3, 0, backZ + 0.95);
    desk.name = 'decor_desk';
    desk.userData.isScenery = true;
    desk.userData.sceneryKind = 'desk';
    decorGroup.add(desk);
    galleryDecorMeshes.push(desk);
    collisionBoxes.push({ box: new THREE.Box3().setFromObject(desk), type: 'decor' });

    // A row of waiting chairs along the inside of the front glass, plus a low
    // magazine table, just like the real waiting room.
    const chairXs = [-7.6, -6.4, -5.2, -4.0];
    chairXs.forEach((cx, i) => {
        const chair = createLoungeChair();
        chair.position.set(cx, 0, frontZ - 0.95);
        chair.rotation.y = Math.PI; // backs to the window, facing the room
        chair.name = `decor_waitingChair${i}`;
        chair.userData.isScenery = true;
        chair.userData.sceneryKind = 'sofa';
        decorGroup.add(chair);
        galleryDecorMeshes.push(chair);
    });

    const magTableTop = new THREE.MeshStandardMaterial({ color: 0xb9bcbf, roughness: 0.5, metalness: 0.2 });
    const magTableLeg = new THREE.MeshStandardMaterial({ color: 0x4a4e54, roughness: 0.5, metalness: 0.5 });
    const magTable = createFoldoutTable(1.1, 0.6, 0.45, 0.05, magTableTop, magTableLeg);
    magTable.position.set(-5.8, 0, frontZ - 2.3);
    magTable.name = 'decor_magazineTable';
    decorGroup.add(magTable);
    collisionBoxes.push({ box: new THREE.Box3().setFromObject(magTable), type: 'decor' });

    // A couple of magazines on the table
    const magazineColors = [0x2d6bbf, 0xa32126];
    magazineColors.forEach((color, i) => {
        const magazine = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.012, 0.32),
            new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
        );
        magazine.position.set(-5.9 + i * 0.2, 0.48, frontZ - 2.35 + i * 0.06);
        magazine.rotation.y = (i - 0.5) * 0.4;
        magazine.name = `decor_magazine${i}`;
        decorGroup.add(magazine);
    });

    // The wall-mounted TV on the waiting room side of the partition, angled
    // toward the chairs.
    const tv = createWallTV();
    tv.position.set(partitionX - 0.19, 3.0, positionZ + 6);
    tv.rotation.y = -Math.PI / 2; // face -X, into the waiting room
    tv.name = 'decor_tv';
    tv.userData.isScenery = true;
    tv.userData.sceneryKind = 'tv';
    decorGroup.add(tv);
    galleryDecorMeshes.push(tv);

    // (The shop contact's business card sits on the checkout counter; see
    // createCheckoutCounter. The portfolio-era visitor-activity screen,
    // leaderboard board, and colophon plaque are all gone from this theme.)

    storeGroup.add(decorGroup);
}

/**
 * The waiting room's wall-mounted TV: a dark bezel with a softly glowing
 * screen showing the shop's welcome slide. Built facing +Z; the caller
 * positions and rotates it onto a wall.
 */
// ---- Waiting-room TV channels ----------------------------------------------
// The TV flips through a little channel lineup on its own: the shop's welcome
// slide, a tire-care tip, a live stock-car race, and the classics channel,
// with a quick burst of static between channels (the flicker that sells a
// channel change). updateWaitingRoomTV drives it from the main loop.
const TV_W = 640, TV_H = 360;
const TV_FACE = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const TV_CHANNELS = 4;
const TV_CHANNEL_SECONDS = 7;    // dwell per channel
const TV_STATIC_SECONDS = 0.18;  // burst of static between channels
const TV_RACE_FPS = 12;          // repaint rate for the live race channel
let _tvCtx = null, _tvTexture = null;
const _tvState = { channel: 0, dwell: 0, staticLeft: 0, tipIndex: 0, racePaint: 0, classicPaint: 0 };

// One tip per visit to the tips channel, in rotation.
const TV_TIPS = [
    'Check your tire pressure once a month, and before any long trip.',
    'Rotate your tires about every five thousand miles for even wear.',
    "The penny test: if you can see all of Lincoln's head, it is time for new tread.",
    'Uneven wear on one edge usually means the alignment is asking for help.',
    'Cold mornings drop tire pressure. A quick top-up keeps the ride smooth.'
];

/** Word-wrap helper for the channel painters (centered lines). */
function drawTvWrapped(ctx, text, centerX, startY, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let y = startY;
    words.forEach((word) => {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
            ctx.fillText(line, centerX, y);
            line = word;
            y += lineHeight;
        } else {
            line = test;
        }
    });
    if (line) ctx.fillText(line, centerX, y);
}

/** Channel 1: the shop's welcome slide (name, services, phone). */
function drawTvChannelWelcome(ctx) {
    const bg = ctx.createLinearGradient(0, 0, 0, TV_H);
    bg.addColorStop(0, '#16294f');
    bg.addColorStop(1, '#0d1a33');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, TV_W, TV_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f4f5f2';
    ctx.font = `700 55px ${TV_FACE}`;
    ctx.fillText('Interstate Tire', 320, 120);
    ctx.fillStyle = '#bcd0f5';
    ctx.font = `500 38px ${TV_FACE}`;
    ctx.fillText('Tires, Brakes, & Alignments', 320, 198);
    ctx.fillStyle = '#e8b73a';
    ctx.font = `600 40px ${TV_FACE}`;
    ctx.fillText('410-666-7333', 320, 272);
}

/** Channel 2: the tire-care tips show. */
function drawTvChannelTip(ctx, tipIndex) {
    const bg = ctx.createLinearGradient(0, 0, 0, TV_H);
    bg.addColorStop(0, '#143434');
    bg.addColorStop(1, '#0b2020');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, TV_W, TV_H);
    // Header band
    ctx.fillStyle = '#0f5132';
    ctx.fillRect(0, 0, TV_W, 62);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e9f5ec';
    ctx.font = `700 32px ${TV_FACE}`;
    ctx.fillText('TIRE CARE TIPS', 26, 33);
    ctx.textAlign = 'right';
    ctx.font = `600 26px ${TV_FACE}`;
    ctx.fillText(`Tip ${(tipIndex % TV_TIPS.length) + 1} of ${TV_TIPS.length}`, TV_W - 26, 33);
    // A friendly tire, presenting
    ctx.fillStyle = '#15161a';
    ctx.beginPath();
    ctx.arc(104, 218, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9ccd2';
    ctx.beginPath();
    ctx.arc(104, 218, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7c828c';
    ctx.beginPath();
    ctx.arc(104, 218, 10, 0, Math.PI * 2);
    ctx.fill();
    // The tip itself
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eef3ee';
    ctx.font = `500 31px ${TV_FACE}`;
    drawTvWrapped(ctx, TV_TIPS[tipIndex % TV_TIPS.length], 396, 168, 400, 44);
}

// Race-channel simulation: three cars in their own lanes (so a faster car
// passes alongside a slower one rather than through it), with an occasional
// side-by-side tangle that ends in a little fire, a smoke plume, and a
// polite restart. Advanced only while the channel is on the air, so a
// returning viewer sometimes tunes in mid-blaze.
const TV_RACE_CARS = [
    { color: '#c0392b', speed: 1.15, rx: 216, ry: 94 },   // inside lane
    { color: '#2a62c9', speed: 1.0,  rx: 236, ry: 106 },  // middle lane
    { color: '#e8b73a', speed: 0.88, rx: 256, ry: 118 }   // outside lane
];
const TV_RACE_CRASH_SECONDS = 4.2;   // how long a tangle burns
const TV_RACE_CRASH_COOLDOWN = 18;   // minimum air-seconds between tangles
const _tvRace = {
    prog: [0, 2.2, 4.3],   // each car's angle around the oval
    sinceCrash: 12,        // pre-warmed so the first tangle isn't too long a wait
    crash: null            // { a, b, angle, timer } while a tangle plays out
};

/** Signed shortest angular distance between two track positions. */
function tvRaceAngleGap(a, b) {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
}

/** Advance the race sim: lap the cars, spot side-by-side pairs, run crashes. */
function updateTvRace(dt) {
    if (_tvRace.crash) {
        _tvRace.crash.timer += dt;
        // The uninvolved car keeps lapping past the scene.
        TV_RACE_CARS.forEach((car, i) => {
            if (i !== _tvRace.crash.a && i !== _tvRace.crash.b) _tvRace.prog[i] += car.speed * dt;
        });
        if (_tvRace.crash.timer >= TV_RACE_CRASH_SECONDS) {
            // Everyone drives away, politely separated.
            _tvRace.prog[_tvRace.crash.a] = _tvRace.crash.angle + 0.4;
            _tvRace.prog[_tvRace.crash.b] = _tvRace.crash.angle - 0.4;
            _tvRace.crash = null;
            _tvRace.sinceCrash = 0;
        }
        return;
    }
    _tvRace.sinceCrash += dt;
    TV_RACE_CARS.forEach((car, i) => { _tvRace.prog[i] += car.speed * dt; });
    if (_tvRace.sinceCrash < TV_RACE_CRASH_COOLDOWN) return;
    for (let a = 0; a < TV_RACE_CARS.length; a++) {
        for (let b = a + 1; b < TV_RACE_CARS.length; b++) {
            const gap = tvRaceAngleGap(_tvRace.prog[a], _tvRace.prog[b]);
            if (Math.abs(gap) < 0.22) {
                _tvRace.crash = { a, b, angle: _tvRace.prog[b] + gap / 2, timer: 0 };
                return;
            }
        }
    }
}

/** One race car, drawn at a point with a heading. */
function drawTvRaceCar(ctx, color, x, y, heading) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);
    ctx.fillStyle = color;
    ctx.fillRect(-17, -9, 34, 18);
    ctx.fillStyle = '#101318';
    ctx.fillRect(2, -6, 8, 12);   // windshield
    ctx.restore();
}

/** Channel 3: live stock-car racing (repainted while it is on the air). */
function drawTvChannelRace(ctx) {
    // Infield and track (the stroke is wide enough to hold all three lanes)
    ctx.fillStyle = '#2e6b34';
    ctx.fillRect(0, 0, TV_W, TV_H);
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 58;
    ctx.beginPath();
    ctx.ellipse(320, 200, 236, 106, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Start/finish line
    ctx.save();
    ctx.translate(320 + 236, 200);
    ctx.fillStyle = '#f4f5f2';
    ctx.fillRect(-29, -3, 58, 6);
    ctx.restore();

    const crash = _tvRace.crash;
    TV_RACE_CARS.forEach((car, i) => {
        if (crash && (i === crash.a || i === crash.b)) return;
        const a = _tvRace.prog[i];
        const x = 320 + car.rx * Math.cos(a);
        const y = 200 + car.ry * Math.sin(a);
        const heading = Math.atan2(car.ry * Math.cos(a), -car.rx * Math.sin(a));
        drawTvRaceCar(ctx, car.color, x, y, heading);
    });

    // The tangle: both cars skewed into each other between their lanes, a
    // flickering fire (fresh randomness at every 12fps repaint), and a smoke
    // plume that climbs and thins as the timer runs.
    if (crash) {
        const carA = TV_RACE_CARS[crash.a];
        const carB = TV_RACE_CARS[crash.b];
        const rx = (carA.rx + carB.rx) / 2;
        const ry = (carA.ry + carB.ry) / 2;
        const x = 320 + rx * Math.cos(crash.angle);
        const y = 200 + ry * Math.sin(crash.angle);
        const heading = Math.atan2(ry * Math.cos(crash.angle), -rx * Math.sin(crash.angle));
        drawTvRaceCar(ctx, carA.color, x - 7, y + 4, heading + 0.55);
        drawTvRaceCar(ctx, carB.color, x + 7, y - 4, heading - 0.3);
        // Fire
        for (let f = 0; f < 4; f++) {
            const fx = x - 12 + f * 8;
            const fh = 10 + Math.random() * 16;
            ctx.fillStyle = f % 2 ? '#f39c12' : '#e74c3c';
            ctx.beginPath();
            ctx.moveTo(fx - 4, y - 2);
            ctx.lineTo(fx, y - 2 - fh);
            ctx.lineTo(fx + 4, y - 2);
            ctx.closePath();
            ctx.fill();
        }
        // Smoke
        const rise = Math.min(crash.timer, TV_RACE_CRASH_SECONDS) * 9;
        for (let s = 0; s < 3; s++) {
            ctx.fillStyle = `rgba(110, 112, 118, ${Math.max(0, 0.45 - s * 0.1 - crash.timer * 0.05)})`;
            ctx.beginPath();
            ctx.arc(x + (s - 1) * 7 + 5, y - 18 - rise - s * 14, 7 + s * 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    // Broadcast chrome
    ctx.fillStyle = 'rgba(12, 14, 18, 0.82)';
    ctx.fillRect(0, 0, TV_W, 52);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f4f5f2';
    ctx.font = `700 28px ${TV_FACE}`;
    ctx.fillText('THE MOTOR CHANNEL', 26, 27);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e05545';
    ctx.beginPath();
    ctx.arc(TV_W - 118, 27, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4f5f2';
    ctx.font = `600 26px ${TV_FACE}`;
    ctx.fillText('LIVE', TV_W - 26, 27);
}

// Classics-channel state: a rolling shot (scrolling road, spinning wheels,
// a gentle body bob) with a different classic on the road each time the
// channel comes around, tip-style. Advanced only while on the air.
// All cars "drive" screen-right (the road scrolls left), so the long hood
// sits right of the cabin and anything cargo (wagon roof, pickup bed)
// trails behind it on the left.
const TV_CLASSICS = [
    { body: '#7a1f24', roof: '#f4f5f2', cabX: 196, cabW: 216, windows: 2 },             // the cherry two-tone cruiser
    { body: '#2f6f62', roof: '#f4f5f2', cabX: 170, cabW: 274, windows: 3 },             // the seafoam wagon, long roof to the rear
    { body: '#23252a', roof: '#23252a', cabX: 340, cabW: 104, windows: 1, bed: true },  // the midnight pickup, bed behind the cab
    { body: '#e6dcc0', roof: '#8e2f34', cabX: 236, cabW: 168, windows: 2 }              // the cream coupe
];
const _tvClassic = { t: 0, carIndex: 0 };

/** Channel 4: the classics channel, a vintage classic rolling at golden hour. */
function drawTvChannelClassic(ctx) {
    const t = _tvClassic.t;
    const spec = TV_CLASSICS[_tvClassic.carIndex % TV_CLASSICS.length];

    // Sunset sky over a quiet highway
    const sky = ctx.createLinearGradient(0, 0, 0, 250);
    sky.addColorStop(0, '#2b3a67');
    sky.addColorStop(0.55, '#b3562e');
    sky.addColorStop(1, '#e8a23a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, TV_W, 250);
    ctx.fillStyle = '#f0c05a';
    ctx.beginPath();
    ctx.arc(505, 232, 42, Math.PI, 0);   // setting sun on the horizon
    ctx.fill();
    ctx.fillStyle = '#3a3a3d';
    ctx.fillRect(0, 250, TV_W, TV_H - 250);
    // Lane dashes scroll past (the car "drives" while staying center frame).
    ctx.fillStyle = '#e8d9a0';
    const scroll = (t * 90) % 160;
    for (let x = -160; x < TV_W + 160; x += 160) {
        ctx.fillRect(x + 80 - scroll, 300, 56, 5);
    }

    // Tonight's classic: long body, chrome trim, whitewall tires, and a
    // gentle bob so it reads as rolling footage rather than a still.
    const bodyY = 208;
    ctx.save();
    ctx.translate(0, Math.sin(t * 7) * 1.5);
    ctx.fillStyle = spec.body;
    ctx.fillRect(140, bodyY, 360, 52);
    ctx.fillRect(spec.cabX, bodyY - 42, spec.cabW, 46);   // cabin
    ctx.fillStyle = spec.roof;                            // (two-tone when it differs)
    ctx.fillRect(spec.cabX, bodyY - 42, spec.cabW, 14);
    // Windows split evenly across the cabin.
    ctx.fillStyle = '#9fb6c9';
    const winW = (spec.cabW - 28 - (spec.windows - 1) * 12) / spec.windows;
    for (let w = 0; w < spec.windows; w++) {
        ctx.fillRect(spec.cabX + 14 + w * (winW + 12), bodyY - 26, winW, 28);
    }
    // Pickup bed: a low side wall with a shadowed opening BEHIND the cab,
    // trailing to the rear on the screen-left side.
    if (spec.bed) {
        const bedX = 144;
        const bedW = spec.cabX - 10 - bedX;
        ctx.fillStyle = spec.body;
        ctx.fillRect(bedX, bodyY - 14, bedW, 14);
        ctx.fillStyle = '#101318';
        ctx.fillRect(bedX + 6, bodyY - 10, bedW - 12, 10);
    }
    ctx.fillStyle = '#d8dade';                       // chrome side spear + bumpers
    ctx.fillRect(140, bodyY + 20, 360, 6);
    ctx.fillRect(126, bodyY + 40, 34, 10);
    ctx.fillRect(480, bodyY + 40, 34, 10);
    // Whitewall tires with a spinning spoke highlight.
    [216, 424].forEach((x) => {
        const wy = bodyY + 54;
        ctx.fillStyle = '#15161a';
        ctx.beginPath();
        ctx.arc(x, wy, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e9e7e0';
        ctx.beginPath();
        ctx.arc(x, wy, 19, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8c9096';
        ctx.beginPath();
        ctx.arc(x, wy, 9, 0, Math.PI * 2);
        ctx.fill();
        const a = -t * 9;
        ctx.strokeStyle = '#5a5f66';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * 15, wy - Math.sin(a) * 15);
        ctx.lineTo(x + Math.cos(a) * 15, wy + Math.sin(a) * 15);
        ctx.stroke();
    });
    ctx.restore();

    // Broadcast chrome
    ctx.fillStyle = 'rgba(12, 14, 18, 0.82)';
    ctx.fillRect(0, 0, TV_W, 52);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f4f5f2';
    ctx.font = `700 28px ${TV_FACE}`;
    ctx.fillText('THE CLASSICS CHANNEL', 26, 27);
}

/** Between channels: a quick burst of static. */
function drawTvStatic(ctx) {
    ctx.fillStyle = '#0c0d0f';
    ctx.fillRect(0, 0, TV_W, TV_H);
    for (let i = 0; i < 420; i++) {
        const g = 40 + Math.floor(Math.random() * 180);
        ctx.fillStyle = `rgb(${g}, ${g}, ${g})`;
        ctx.fillRect(Math.random() * TV_W, Math.random() * TV_H, 3, 3);
    }
}

/** Paint whichever channel is currently on. */
function paintTvChannel() {
    if (!_tvCtx) return;
    if (_tvState.channel === 0) drawTvChannelWelcome(_tvCtx);
    else if (_tvState.channel === 1) drawTvChannelTip(_tvCtx, _tvState.tipIndex);
    else if (_tvState.channel === 2) drawTvChannelRace(_tvCtx);
    else drawTvChannelClassic(_tvCtx);
    _tvTexture.needsUpdate = true;
}

/**
 * Advance the waiting-room TV: dwell on each channel, flip through static to
 * the next, and keep the race channel live while it is on. Called from the
 * main update loop; a no-op until the TV has been built.
 */
export function updateWaitingRoomTV(deltaTime) {
    if (!_tvCtx || !_tvTexture) return;
    if (_tvState.staticLeft > 0) {
        _tvState.staticLeft -= deltaTime;
        drawTvStatic(_tvCtx);
        _tvTexture.needsUpdate = true;
        if (_tvState.staticLeft <= 0) {
            _tvState.channel = (_tvState.channel + 1) % TV_CHANNELS;
            if (_tvState.channel === 1) _tvState.tipIndex++;
            if (_tvState.channel === 3) _tvClassic.carIndex++;   // a fresh classic each visit
            paintTvChannel();
        }
        return;
    }
    _tvState.dwell += deltaTime;
    if (_tvState.dwell >= TV_CHANNEL_SECONDS) {
        _tvState.dwell = 0;
        _tvState.staticLeft = TV_STATIC_SECONDS;
        return;
    }
    // The race channel is live: advance the sim (laps, tangles, and fires)
    // and repaint at a modest rate.
    if (_tvState.channel === 2) {
        updateTvRace(deltaTime);
        _tvState.racePaint += deltaTime;
        if (_tvState.racePaint >= 1 / TV_RACE_FPS) {
            _tvState.racePaint = 0;
            drawTvChannelRace(_tvCtx);
            _tvTexture.needsUpdate = true;
        }
    }
    // The classics channel is a rolling shot: the road scrolls, the wheels
    // spin, and tonight's classic gently bobs down the highway.
    if (_tvState.channel === 3) {
        _tvClassic.t += deltaTime;
        _tvState.classicPaint += deltaTime;
        if (_tvState.classicPaint >= 1 / TV_RACE_FPS) {
            _tvState.classicPaint = 0;
            drawTvChannelClassic(_tvCtx);
            _tvTexture.needsUpdate = true;
        }
    }
}

function createWallTV() {
    const tv = new THREE.Group();

    // A properly sized waiting-room flatscreen (was 1.6m and read as a photo).
    const bezel = new THREE.Mesh(
        new THREE.BoxGeometry(2.3, 1.34, 0.07),
        new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.4, metalness: 0.4 })
    );
    bezel.castShadow = false;
    tv.add(bezel);

    // Wall mount arm behind the bezel
    const mount = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.6 })
    );
    mount.position.set(0, 0, -0.09);
    tv.add(mount);

    // Screen: a live canvas the channel painters draw into, softly emissive
    // so it reads as switched on at any room brightness.
    const canvas = document.createElement('canvas');
    canvas.width = TV_W;
    canvas.height = TV_H;
    _tvCtx = canvas.getContext('2d');
    const screenTexture = new THREE.CanvasTexture(canvas);
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    _tvTexture = screenTexture;
    paintTvChannel();   // start on the welcome slide

    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 1.24),
        new THREE.MeshStandardMaterial({
            map: screenTexture,
            emissive: 0xffffff,
            emissiveMap: screenTexture,
            emissiveIntensity: 0.55,
            roughness: 0.3
        })
    );
    screen.position.z = 0.037;
    screen.name = 'tvScreen';
    tv.add(screen);

    return tv;
}

/**
 * A rolling whiteboard for the front of the gallery: an aluminium-framed board
 * on a castored stand, a marker tray with a few markers and an eraser, and a
 * canvas of developer/engineering sketches on the room-facing side. Built with
 * its drawing on the local +Z face; the caller rotates the group so that face
 * turns into the room.
 */
/**
 * Place the rolling whiteboard at the back of the waiting room, facing the
 * chairs, where every waiting customer can read it. Its marker drawing
 * carries the live discovery checklist (updateWhiteboardChecklist repaints
 * it as items tick) beside the tire-rotation diagram, and clicking it opens
 * the full-screen close-up overlay, which is how visitors browse the
 * "things to discover" list in this experience (no floating HUD panel: the
 * board itself is the checklist).
 */
function createWaitingRoomWhiteboard() {
    const board = createWhiteboard();
    board.position.set(-6, 0, -4.55);
    board.rotation.y = 0;   // drawing faces +Z, into the waiting room
    board.userData.isScenery = true;
    board.userData.sceneryKind = 'whiteboard';
    board.name = 'waitingRoomWhiteboard';
    storeGroup.add(board);
    galleryDecorMeshes.push(board);
    collisionBoxes.push({ box: new THREE.Box3().setFromObject(board), type: 'decor' });
}

function createWhiteboard() {
    const board = new THREE.Group();

    const boardW = 2.0;
    const boardH = 1.2;
    const centerY = 1.45;            // bottom ≈ 0.85m, top ≈ 2.05m: comfortable reading height

    const metalMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.45, metalness: 0.8 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.4 });

    // --- Frame + white writing surface -----------------------------------
    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(boardW + 0.09, boardH + 0.09, 0.05),
        metalMat
    );
    frame.position.y = centerY;
    frame.castShadow = true;
    board.add(frame);

    const surface = new THREE.Mesh(
        new THREE.BoxGeometry(boardW, boardH, 0.03),
        // A small self-illumination floor: this panel is a vertical white face, so
        // the (downward) interior lights and the hemisphere's dark ground color
        // make it fall off much faster than the horizontal floor as the room dims.
        // The emissive keeps it reading as a board rather than a dark gray slab.
        new THREE.MeshStandardMaterial({
            color: 0xf7f8f7, roughness: 0.35, metalness: 0.0,
            emissive: 0xf7f8f7, emissiveIntensity: 0.4
        })
    );
    surface.position.set(0, centerY, 0.022); // protrude just past the frame front
    surface.castShadow = true;
    board.add(surface);

    // The marker sketches sit a hair in front of the white surface on a
    // transparent plane, lit-independent (MeshBasic) so they stay crisp.
    const drawing = new THREE.Mesh(
        new THREE.PlaneGeometry(boardW - 0.06, boardH - 0.06),
        new THREE.MeshBasicMaterial({ map: createWhiteboardDrawingTexture(), transparent: true })
    );
    drawing.position.set(0, centerY, 0.04);
    board.add(drawing);

    // --- Marker tray, markers, eraser ------------------------------------
    const trayY = centerY - boardH / 2 - 0.02;
    const tray = new THREE.Mesh(new THREE.BoxGeometry(boardW * 0.8, 0.03, 0.1), metalMat);
    tray.position.set(0, trayY, 0.08);
    tray.castShadow = true;
    board.add(tray);

    [0x2b6cb0, 0xc0392b, 0x2f8f4e].forEach((c, i) => {
        const marker = new THREE.Mesh(
            new THREE.CylinderGeometry(0.012, 0.012, 0.13, 10),
            new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })
        );
        marker.rotation.z = Math.PI / 2;        // lie flat along X
        marker.rotation.y = (i - 1) * 0.12;     // fan them out a touch
        marker.position.set(-0.35 + i * 0.22, trayY + 0.03, 0.09);
        marker.castShadow = true;
        board.add(marker);
    });

    const eraser = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.045, 0.07),
        new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.9 })
    );
    eraser.position.set(0.5, trayY + 0.035, 0.09);
    eraser.castShadow = true;
    board.add(eraser);

    // --- Rolling stand ---------------------------------------------------
    const postX = boardW / 2 - 0.06;
    const postTopY = centerY + boardH / 2 - 0.05;
    const postBottomY = 0.12;
    const postH = postTopY - postBottomY;
    [-postX, postX].forEach(px => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, postH, 12), metalMat);
        post.position.set(px, postBottomY + postH / 2, -0.02); // just behind the board
        post.castShadow = true;
        board.add(post);

        // Foot bar running front-to-back at the base of each post.
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.7), metalMat);
        foot.position.set(px, 0.1, 0);
        foot.castShadow = true;
        board.add(foot);

        // A caster wheel at each end of the foot.
        [-0.32, 0.32].forEach(cz => {
            const caster = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), darkMat);
            caster.rotation.z = Math.PI / 2;   // axle along X so it "rolls"
            caster.position.set(px, 0.05, cz);
            board.add(caster);
        });
    });

    // Cross brace between the posts.
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, postX * 2, 10), metalMat);
    brace.rotation.z = Math.PI / 2;
    brace.position.set(0, 0.32, -0.02);
    board.add(brace);

    return board;
}

// --- Whiteboard drawing -------------------------------------------------------
// The board leads with the live "things to discover" checklist on the LEFT (it
// mirrors the HUD panel and is the board's focus). A single studio sketch, the
// app's component tree, sits on the right for a hand-built-by-a-developer touch.
// The checklist region is redrawn in place as items get ticked (updateWhiteboardChecklist).

const WB_INK = '#2c3138';
const WB_BLUE = '#2b6cb0';
const WB_RED = '#c0392b';
const WB_GREEN = '#2f8f4e';
const WB_MUTED = '#6b7280';
const WB_FONT = '"Comic Sans MS", "Segoe Print", "Bradley Hand", cursive';

// Left-hand region reserved for the discovery checklist (cleared + redrawn live).
// The lone studio sketch sits right of x≈600, so it never collides with it.
const WB_LIST_REGION = { x: 24, y: 20, w: 500, h: 560 };

// Live-redraw handles, set when the board's texture is first built.
let _wbCanvas = null, _wbCtx = null, _wbTexture = null, _wbChecklistData = null;

// A straight segment broken into a few jittered points, so it reads as marker on
// a board rather than a CAD stroke. `jitter` is the max ± pixel wander per point
// (defaults to 3 for the loose sketch look). The jitter is absolute, so short
// strokes look proportionally rougher than long ones — pass a smaller value for
// small shapes like the checklist boxes, which otherwise read as too squiggly.
function wbLine(ctx, x1, y1, x2, y2, color, width, jitter) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 3;
    ctx.beginPath();
    const j = jitter == null ? 3 : jitter;
    const segs = 6;
    for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const x = x1 + (x2 - x1) * t + (Math.random() - 0.5) * j;
        const y = y1 + (y2 - y1) * t + (Math.random() - 0.5) * j;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function wbRect(ctx, x, y, w, h, color, width, jitter) {
    wbLine(ctx, x, y, x + w, y, color, width, jitter);
    wbLine(ctx, x + w, y, x + w, y + h, color, width, jitter);
    wbLine(ctx, x + w, y + h, x, y + h, color, width, jitter);
    wbLine(ctx, x, y + h, x, y, color, width, jitter);
}

function wbArrow(ctx, x1, y1, x2, y2, color) {
    wbLine(ctx, x1, y1, x2, y2, color, 2.5);
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 12 * Math.cos(a - 0.4), y2 - 12 * Math.sin(a - 0.4));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 12 * Math.cos(a + 0.4), y2 - 12 * Math.sin(a + 0.4));
    ctx.stroke();
}

function wbLabel(ctx, text, x, y, color, size, align) {
    ctx.fillStyle = color || WB_INK;
    ctx.font = `${size || 18}px ${WB_FONT}`;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
}

/** The lone marker sketch, in the right-hand column: the classic X-pattern
 *  tire rotation diagram every real tire shop has on a board somewhere.
 *  (The portfolio studio's component tree lived here before.) */
function drawWhiteboardSketches(ctx) {
    // A faint vertical divider between the checklist (left) and the sketch (right).
    wbLine(ctx, 548, 60, 548, 548, WB_MUTED, 1.5, 0);

    wbLabel(ctx, 'tire rotation', 786, 36, WB_BLUE, 22);
    wbLabel(ctx, 'front', 786, 84, WB_MUTED, 16);

    // The car, seen from above: a light body outline between the four tires,
    // with a windshield line so the front reads as the front.
    wbRect(ctx, 706, 110, 160, 390, WB_MUTED, 2.5);
    wbLine(ctx, 722, 190, 850, 190, WB_MUTED, 2.5);

    // Four tires (top view), with a couple of tread hatches apiece.
    [[644, 130], [896, 130], [644, 386], [896, 386]].forEach(([tx, ty]) => {
        wbRect(ctx, tx, ty, 44, 94, WB_INK, 3.5);
        wbLine(ctx, tx + 8, ty + 32, tx + 36, ty + 32, WB_MUTED, 2);
        wbLine(ctx, tx + 8, ty + 62, tx + 36, ty + 62, WB_MUTED, 2);
    });

    // The X-pattern: each tire crosses to the opposite corner.
    wbArrow(ctx, 700, 236, 884, 374, WB_GREEN);
    wbArrow(ctx, 884, 236, 700, 374, WB_GREEN);

    wbLabel(ctx, 'every 5,000 miles', 786, 528, WB_RED, 20);
}

/**
 * Draw the "things to discover" checklist into the reserved right-hand region.
 * `data` is { items: [{short, done}], progress: {done, total} } from checklist.js;
 * when it's null (before the HUD seeds it), only the heading is drawn.
 */
function drawWhiteboardChecklist(ctx, data) {
    const lx = WB_LIST_REGION.x + 24;        // left edge of the column
    const rightEdge = WB_LIST_REGION.x + WB_LIST_REGION.w - 18;
    // The checklist now leads on the left, so it's drawn a touch larger.
    wbLabel(ctx, 'things to discover', lx, 38, WB_BLUE, 25, 'left');
    wbLine(ctx, lx, 58, rightEdge, 58, WB_INK, 2);

    if (!data || !data.items) return;

    if (data.progress) {
        wbLabel(ctx, `${data.progress.done}/${data.progress.total}`,
            rightEdge, 38, WB_RED, 20, 'right');
    }

    const boxX = lx;
    const textX = lx + 44;
    const startY = 108;
    // Tighten the row spacing once the list grows past eight items, so a
    // ninth discovery still fits inside the board's cleared region.
    const step = data.items.length > 8 ? 52 : 58;
    data.items.forEach((it, i) => {
        const y = startY + i * step;
        // Low jitter here so the small boxes read as tidy, not squiggly.
        wbRect(ctx, boxX, y - 13, 26, 26, WB_INK, 2.5, 0.6);
        if (it.done) {
            // A green check in the box, and the line gently struck through. Low
            // jitter so the short check strokes read tidy, not squiggly (matches
            // the boxes).
            wbLine(ctx, boxX + 5, y, boxX + 11, y + 8, WB_GREEN, 4, 0.6);
            wbLine(ctx, boxX + 11, y + 8, boxX + 22, y - 9, WB_GREEN, 4, 0.6);
            wbLabel(ctx, it.short, textX, y, WB_MUTED, 18, 'left');
            ctx.font = `18px ${WB_FONT}`;
            const w = ctx.measureText(it.short).width;
            wbLine(ctx, textX, y + 1, textX + w, y + 1, WB_MUTED, 2);
        } else {
            wbLabel(ctx, it.short, textX, y, WB_INK, 18, 'left');
        }
    });
}

/**
 * Build the whiteboard's transparent drawing texture: the studio sketches plus
 * the discovery checklist. Stashes canvas/ctx/texture handles so the checklist
 * region can be redrawn live (see updateWhiteboardChecklist).
 */
function createWhiteboardDrawingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 614;             // matches the board's 2.0 : 1.2 aspect
    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    _wbCanvas = canvas;
    _wbCtx = ctx;

    drawWhiteboardSketches(ctx);
    drawWhiteboardChecklist(ctx, _wbChecklistData);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    _wbTexture = texture;
    return texture;
}

/**
 * Redraw just the checklist region of the whiteboard to match the current state.
 * Called from main.js whenever a discovery item is ticked (and once to seed it).
 * No-op until the board's texture has been built.
 */
export function updateWhiteboardChecklist(items, progress) {
    _wbChecklistData = { items, progress };
    if (!_wbCtx || !_wbTexture) return;
    _wbCtx.clearRect(WB_LIST_REGION.x, WB_LIST_REGION.y, WB_LIST_REGION.w, WB_LIST_REGION.h);
    drawWhiteboardChecklist(_wbCtx, _wbChecklistData);
    _wbTexture.needsUpdate = true;
}

/**
 * Paint the whiteboard (white writing surface + its current marker drawing) into
 * a 2D context at w×h. Used by the click-to-enlarge whiteboard overlay in main.js
 * to mirror the in-world board, including its live checklist state.
 */
export function drawWhiteboardTo(ctx, w, h) {
    ctx.fillStyle = '#f7f8f7';
    ctx.fillRect(0, 0, w, h);
    if (_wbCanvas) ctx.drawImage(_wbCanvas, 0, 0, w, h);
}

/**
 * Create storefront extras - welcome mat
 */
function createStorefrontExtras() {
    const { width, depth, height, positionX, positionZ, doorOffsetX, doorWidth } = STORE_CONFIG;
    const frontZ = positionZ + depth / 2;
    const extrasGroup = new THREE.Group();
    extrasGroup.name = 'storefrontExtras';

    // ========== WELCOME MAT (Star Trek Themed) ==========
    const welcomeMatGroup = new THREE.Group();
    welcomeMatGroup.name = 'welcomeMat';

    // Mat dimensions (larger size)
    const matWidth = 2.4;
    const matDepth = 1.6;
    const matThickness = 0.025;

    // Mat position (in front of the door)
    const doorX = positionX + doorOffsetX;
    const matZ = frontZ + 1.8;  // Further from door to clear the center divider

    // Mat base (dark rubber-like material)
    const matBaseMaterial = new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        roughness: 0.95,
        metalness: 0.0
    });

    const matBase = new THREE.Mesh(
        new THREE.BoxGeometry(matWidth, matThickness, matDepth),
        matBaseMaterial
    );
    matBase.position.set(doorX, matThickness / 2, matZ);
    matBase.receiveShadow = true;
    welcomeMatGroup.add(matBase);

    // Create a clean, modern portfolio-themed mat texture
    const welcomeCanvas = document.createElement('canvas');
    welcomeCanvas.width = 512;
    welcomeCanvas.height = 340;
    const ctx = welcomeCanvas.getContext('2d');

    const matAccent = '#5b7fd4';   // shop blue accent (matches the logo's blue field)
    const matInk = '#e9edf2';      // soft off-white text

    // Mat background - charcoal coir tone
    ctx.fillStyle = '#1b1b20';
    ctx.fillRect(0, 0, 512, 340);

    // Subtle woven texture flecks
    for (let i = 0; i < 800; i++) {
        ctx.fillStyle = `rgba(120, 130, 150, ${Math.random() * 0.16})`;
        ctx.fillRect(
            Math.random() * 512,
            Math.random() * 340,
            3,
            3
        );
    }

    // Thin slate inner border frame
    ctx.strokeStyle = matAccent;
    ctx.lineWidth = 3;
    ctx.strokeRect(34, 30, 444, 280);

    // "WELCOME" wordmark, centered
    ctx.fillStyle = matInk;
    ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '12px';
    ctx.fillText('WELCOME', 256, 170);

    const welcomeTexture = new THREE.CanvasTexture(welcomeCanvas);
    welcomeTexture.needsUpdate = true;

    const welcomeTextMaterial = new THREE.MeshStandardMaterial({
        map: welcomeTexture,
        roughness: 0.85,
        metalness: 0.1
    });

    const welcomeTextMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(matWidth - 0.1, matDepth - 0.1),
        welcomeTextMaterial
    );
    welcomeTextMesh.rotation.x = -Math.PI / 2;
    welcomeTextMesh.position.set(doorX, matThickness + 0.005, matZ);
    welcomeMatGroup.add(welcomeTextMesh);

    // Brushed metallic border around the mat, in the shop's blue
    const borderMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a6cc4,
        roughness: 0.5,
        metalness: 0.5
    });

    const borderWidth = 0.05;
    const borderHeight = 0.02;

    // Top border
    const topBorder = new THREE.Mesh(
        new THREE.BoxGeometry(matWidth + 0.02, borderHeight, borderWidth),
        borderMaterial
    );
    topBorder.position.set(doorX, matThickness, matZ - matDepth / 2);
    welcomeMatGroup.add(topBorder);

    // Bottom border
    const bottomBorder = new THREE.Mesh(
        new THREE.BoxGeometry(matWidth + 0.02, borderHeight, borderWidth),
        borderMaterial
    );
    bottomBorder.position.set(doorX, matThickness, matZ + matDepth / 2);
    welcomeMatGroup.add(bottomBorder);

    // Left border
    const leftBorder = new THREE.Mesh(
        new THREE.BoxGeometry(borderWidth, borderHeight, matDepth + 0.02),
        borderMaterial
    );
    leftBorder.position.set(doorX - matWidth / 2, matThickness, matZ);
    welcomeMatGroup.add(leftBorder);

    // Right border
    const rightBorder = new THREE.Mesh(
        new THREE.BoxGeometry(borderWidth, borderHeight, matDepth + 0.02),
        borderMaterial
    );
    rightBorder.position.set(doorX + matWidth / 2, matThickness, matZ);
    welcomeMatGroup.add(rightBorder);

    registerOutdoorProp(welcomeMatGroup, 'welcomemat');
    extrasGroup.add(welcomeMatGroup);

    storeGroup.add(extrasGroup);
}

/** A rounded-rectangle THREE.Shape spanning (x0,y0)->(x1,y1) with corner radius r.
 *  Used to give the SUV's extruded panels soft, non-boxy corners. */
function roundedRectShape(x0, y0, x1, y1, r) {
    const s = new THREE.Shape();
    s.moveTo(x0 + r, y0);
    s.lineTo(x1 - r, y0);
    s.quadraticCurveTo(x1, y0, x1, y0 + r);
    s.lineTo(x1, y1 - r);
    s.quadraticCurveTo(x1, y1, x1 - r, y1);
    s.lineTo(x0 + r, y1);
    s.quadraticCurveTo(x0, y1, x0, y1 - r);
    s.lineTo(x0, y0 + r);
    s.quadraticCurveTo(x0, y0, x0 + r, y0);
    return s;
}

/**
 * A parked luxury SUV on the street in front of the agency window, so the view
 * out the window shows an aspirational "successful realtor" ride instead of an
 * empty scene. Styled on a modern white Toyota Grand Highlander (a large 3-row
 * crossover): glossy white paint, tinted greenhouse, chunky wheels, alloy hubs.
 *
 * The body and roof are extruded side-profiles with a width-wise bevel, so every
 * edge is softly rounded instead of boxy. The liftgate glass and roof run almost
 * to the tail, so the rear reads as a proper SUV hatch with a short bumper rather
 * than a protruding wagon trunk. Built facing +Z; the caller rotates it parallel
 * to the curb. Sized in world meters to match the people and buildings around it.
 */
function createParkedSUV(x, z, rotationY) {
    const suv = new THREE.Group();

    // Glossy white paint: low roughness so the sun gives it a bright, reflective
    // highlight (no env map needed). Tinted glass is dark and shiny.
    const paint = new THREE.MeshStandardMaterial({ color: 0xf4f5f6, roughness: 0.18, metalness: 0.15 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0e1116, roughness: 0.08, metalness: 0.5 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.6, metalness: 0.2 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.9 });
    const rim = new THREE.MeshStandardMaterial({ color: 0xd2d5da, roughness: 0.35, metalness: 0.3 });
    const head = new THREE.MeshStandardMaterial({ color: 0xeef4ff, roughness: 0.25, metalness: 0.2, emissive: 0x334455, emissiveIntensity: 0.4 });
    const tail = new THREE.MeshStandardMaterial({ color: 0x8e1b1b, roughness: 0.3, emissive: 0x330a0a, emissiveIntensity: 0.5 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.3, metalness: 0.4 });

    const L = 5.0, W = 1.98, wheelR = 0.38, wheelW = 0.28;
    const sill = 0.42, beltline = 1.18, bodyH = beltline - sill; // lower body 0.42 -> 1.18
    const fZ = L / 2, rZ = -L / 2; // front (+Z) and rear (-Z)

    // A profile is authored in (SUV-Z, world-Y) and extruded across the width; a
    // -90deg Y-rotation maps the profile X-axis to SUV-Z and the extrude depth to
    // width. This helper builds and places one such panel, centred on x=0, with a
    // small bevel so the width-wise edges are rounded (bt = bevel thickness/size).
    const extrudePanel = (shape, mat, bt, panelW = W) => {
        const depth = panelW - 2 * bt;
        const geo = new THREE.ExtrudeGeometry(shape, {
            depth, bevelEnabled: bt > 0, bevelThickness: bt, bevelSize: bt, bevelSegments: 3, curveSegments: 12,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = -Math.PI / 2;
        mesh.position.x = depth / 2; // recentre after the -90deg rotation
        return mesh;
    };

    // Rounded lower body: a soft-cornered slab from sill to beltline, with a
    // bevel across the width so the long edges are no longer sharp.
    const bodyShape = roundedRectShape(rZ + 0.06, sill + 0.02, fZ + 0.06, beltline, 0.24);
    const body = extrudePanel(bodyShape, paint, 0.06);
    body.castShadow = true; suv.add(body);
    // Black lower cladding / rocker + bumper wrap, genuinely proud of the
    // paint: the wider panel keeps its bevel extremity 1.5cm outside the
    // body's, so the two curved surfaces never share a plane (flush panels
    // z-fight into a speckled band along the rocker).
    const cladShape = roundedRectShape(rZ + 0.02, sill - 0.02, fZ + 0.02, sill + 0.16, 0.14);
    suv.add(extrudePanel(cladShape, trim, 0.05, W + 0.03));

    // Tinted greenhouse: an extruded side-profile so the FRONT gets a raked
    // windshield (the key "which way is it facing" cue) while the rear liftgate is
    // near-vertical and reaches almost to the tail. Inset from the body sides.
    const ghH = 0.5, ghW = 1.66;
    const roofY = beltline + ghH;
    const prof = new THREE.Shape();
    prof.moveTo(-2.14, 0);      // rear-bottom (beltline, near the tail)
    prof.lineTo(1.24, 0);       // front-bottom (windshield base, forward)
    prof.quadraticCurveTo(1.02, ghH, 0.52, ghH); // raked windshield into the roof
    prof.lineTo(-2.02, ghH);    // roof rear
    prof.quadraticCurveTo(-2.2, ghH, -2.2, ghH - 0.14); // rounded rear roof corner
    prof.lineTo(-2.14, 0);      // near-vertical liftgate
    const greenhouse = new THREE.Mesh(
        new THREE.ExtrudeGeometry(prof, { depth: ghW, bevelEnabled: false, curveSegments: 12 }), glass);
    greenhouse.rotation.y = -Math.PI / 2;
    greenhouse.position.set(ghW / 2, beltline, 0);
    suv.add(greenhouse);

    // Rounded white roof running the flat top of the greenhouse (z: 0.55 .. -2.2),
    // built as its own beveled panel so its edges match the body.
    const roofShape = roundedRectShape(-2.24, roofY, 0.55, roofY + 0.13, 0.1);
    const roof = extrudePanel(roofShape, paint, 0.04, ghW + 0.06);
    suv.add(roof);
    [-1, 1].forEach(s => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 2.5), trim);
        rail.position.set(s * (ghW / 2 - 0.12), roofY + 0.17, -0.75); suv.add(rail);
    });
    // White B-pillars break the side glass into front/rear doors.
    [-1, 1].forEach(s => {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.09, ghH, 0.08), paint);
        pillar.position.set(s * (ghW / 2 + 0.01), beltline + ghH / 2, -0.45); suv.add(pillar);
    });
    // Small rear roof spoiler over the liftgate (a rear-only cue).
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(ghW, 0.06, 0.16), trim);
    spoiler.position.set(0, roofY + 0.16, -2.22); suv.add(spoiler);

    // Wheels (tire + alloy hub) and rounded dark wheel-arch flares.
    [[1, 1.62], [1, -1.62], [-1, 1.62], [-1, -1.62]].forEach(([sx, wz]) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 20), tire);
        wheel.rotation.z = Math.PI / 2; wheel.position.set(sx * (W / 2 - 0.02), wheelR, wz); suv.add(wheel);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, wheelW + 0.02, 12), rim);
        hub.rotation.z = Math.PI / 2; hub.position.set(sx * (W / 2 - 0.01), wheelR, wz); suv.add(hub);
        // Half-torus fender flare arching over the wheel (rounded, not a flat
        // box), seated 2cm outboard of the body side so the flare's surface
        // never grazes the body's bevel plane (grazing contact z-fights).
        const arch = new THREE.Mesh(
            new THREE.TorusGeometry(wheelR + 0.05, 0.055, 8, 16, Math.PI), trim);
        arch.rotation.y = Math.PI / 2; arch.position.set(sx * (W / 2 + 0.02), wheelR, wz); suv.add(arch);
    });

    // FRONT (distinct): tall body-colour bumper, a big dark grille with a chrome
    // bar, a lower intake, and slim swept headlights up near the hood line.
    const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.58, 0.42, 0.06), trim);
    grille.position.set(0, sill + 0.42, fZ + 0.03); suv.add(grille);
    const grilleBar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.58, 0.05, 0.09), chrome);
    grilleBar.position.set(0, sill + 0.5, fZ + 0.05); suv.add(grilleBar);
    const intake = new THREE.Mesh(new THREE.BoxGeometry(W * 0.48, 0.12, 0.05), trim);
    intake.position.set(0, sill + 0.03, fZ + 0.03); suv.add(intake);
    [-1, 1].forEach(s => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.06), head);
        hl.position.set(s * (W * 0.33), beltline - 0.14, fZ + 0.02); suv.add(hl);
    });

    // REAR (distinct): a full-width horizontal taillight bar + bumper.
    const tlBar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.13, 0.05), tail);
    tlBar.position.set(0, beltline - 0.18, rZ - 0.02); suv.add(tlBar);
    const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.2, 0.1), trim);
    rearBumper.position.set(0, sill + 0.12, rZ - 0.03); suv.add(rearBumper);

    // Side mirrors (at the front of the doors).
    [-1, 1].forEach(s => {
        const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.16), paint);
        mirror.position.set(s * (W / 2 + 0.08), beltline - 0.04, 1.2); suv.add(mirror);
    });

    suv.position.set(x, 0, z);
    suv.rotation.y = rotationY;
    suv.name = 'parkedSUV';
    storeGroup.add(suv);
    return suv;
}

/**
 * A low red sports car, sharing the SUV builder's contract (positions itself,
 * joins storeGroup, returns the group) and its extruded-panel technique: a
 * low wedge body, a fast raked coupe greenhouse, a splitter, a rear wing,
 * and wide low-profile wheels. Faces +Z like the SUV.
 */
function createSportsCar(x, z, rotationY) {
    const car = new THREE.Group();

    const paint = new THREE.MeshStandardMaterial({ color: 0xc0272d, roughness: 0.14, metalness: 0.25 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0e1116, roughness: 0.08, metalness: 0.5 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.6, metalness: 0.2 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.9 });
    const rim = new THREE.MeshStandardMaterial({ color: 0xd2d5da, roughness: 0.3, metalness: 0.5 });
    const head = new THREE.MeshStandardMaterial({ color: 0xeef4ff, roughness: 0.25, metalness: 0.2, emissive: 0x334455, emissiveIntensity: 0.4 });
    const tail = new THREE.MeshStandardMaterial({ color: 0x8e1b1b, roughness: 0.3, emissive: 0x330a0a, emissiveIntensity: 0.5 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.3, metalness: 0.4 });

    const L = 4.4, W = 1.9, wheelR = 0.33, wheelW = 0.3;
    const sill = 0.26, beltline = 0.78;
    const fZ = L / 2, rZ = -L / 2;

    // Same extrusion helper as the SUV: profile in (car-Z, world-Y), extruded
    // across the width, -90deg Y-rotation, beveled width-wise edges.
    const extrudePanel = (shape, mat, bt, panelW = W) => {
        const depth = panelW - 2 * bt;
        const geo = new THREE.ExtrudeGeometry(shape, {
            depth, bevelEnabled: bt > 0, bevelThickness: bt, bevelSize: bt, bevelSegments: 3, curveSegments: 12,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = -Math.PI / 2;
        mesh.position.x = depth / 2;
        return mesh;
    };

    // Aerodynamic wedge profile (car-Z, world-Y): a tall tail, a beltline
    // that holds through the cabin to the windshield base, then a hood that
    // dives toward a low, raked nose whose face leans back like a real
    // sports car's, ending just above the splitter.
    const noseTipY = 0.58;
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(rZ + 0.05, sill + 0.02);                                // rear-bottom
    bodyShape.lineTo(rZ + 0.05, beltline - 0.06);                            // tail face
    bodyShape.quadraticCurveTo(rZ + 0.05, beltline, rZ + 0.28, beltline);    // rounded tail shoulder
    bodyShape.lineTo(0.95, beltline);                                        // beltline through the cabin
    bodyShape.quadraticCurveTo(1.7, beltline - 0.12, 2.05, noseTipY);        // the hood dives
    bodyShape.lineTo(fZ + 0.05, noseTipY - 0.12);                            // raked nose face
    bodyShape.lineTo(fZ + 0.05, sill + 0.02);                                // down to the splitter
    bodyShape.closePath();
    const body = extrudePanel(bodyShape, paint, 0.04);
    body.castShadow = true;
    car.add(body);

    // Dark splitter and rocker wrap, proud of the paint (same 1.5cm rule as
    // the SUV's cladding, so the curved surfaces never z-fight).
    const cladShape = roundedRectShape(rZ, sill - 0.06, fZ, sill + 0.08, 0.1);
    car.add(extrudePanel(cladShape, trim, 0.04, W + 0.03));

    // Fast coupe greenhouse: steeply raked windshield, short roof, and a
    // fastback tail that slides all the way down to the rear deck.
    const ghH = 0.34, ghW = 1.5;
    const prof = new THREE.Shape();
    prof.moveTo(-1.9, 0);                            // rear deck, near the tail
    prof.lineTo(0.9, 0);                             // windshield base, well forward
    prof.quadraticCurveTo(0.55, ghH, 0, ghH);        // fast raked windshield
    prof.lineTo(-0.85, ghH);                         // short roof
    prof.quadraticCurveTo(-1.55, ghH * 0.5, -1.9, 0); // fastback glass
    const greenhouse = new THREE.Mesh(
        new THREE.ExtrudeGeometry(prof, { depth: ghW, bevelEnabled: false, curveSegments: 12 }), glass);
    greenhouse.rotation.y = -Math.PI / 2;
    greenhouse.position.set(ghW / 2, beltline, 0);
    greenhouse.castShadow = true;
    car.add(greenhouse);

    // Slim painted roof strip over the flat of the greenhouse, kept to a
    // few centimeters (shape 0.025 + slim bevels) so it reads as a skin of
    // paint over the glass rather than a thick cap.
    const roofShape = roundedRectShape(-0.9, beltline + ghH, 0.05, beltline + ghH + 0.025, 0.012);
    car.add(extrudePanel(roofShape, paint, 0.01, ghW + 0.04));

    // Rear wing on two posts.
    [-1, 1].forEach(s => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.12), trim);
        post.position.set(s * 0.55, beltline + 0.1, rZ + 0.18);
        car.add(post);
    });
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.05, 0.34), paint);
    wing.position.set(0, beltline + 0.22, rZ + 0.14);
    wing.castShadow = true;
    car.add(wing);

    // Wide low-profile wheels with big rims.
    [-1, 1].forEach(sx => [1.32, -1.32].forEach(wz => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 20), tire);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(sx * (W / 2 - 0.02), wheelR, wz);
        wheel.castShadow = true;
        car.add(wheel);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, wheelW + 0.02, 14), rim);
        hub.rotation.z = Math.PI / 2;
        hub.position.set(sx * (W / 2 - 0.01), wheelR, wz);
        car.add(hub);
    }));

    // Slim headlights laid on the raked nose face (tilted to follow it),
    // a full-width taillight bar, and twin exhaust tips.
    [-1, 1].forEach(s => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.06), head);
        hl.position.set(s * (W * 0.3), 0.51, fZ - 0.03);
        hl.rotation.x = -0.55;
        car.add(hl);
    });
    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.05), tail);
    tailBar.position.set(0, beltline - 0.08, rZ - 0.03);
    car.add(tailBar);
    [-1, 1].forEach(s => {
        const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), chrome);
        exhaust.rotation.x = Math.PI / 2;
        exhaust.position.set(s * 0.32, sill + 0.02, rZ - 0.04);
        car.add(exhaust);
    });

    car.position.set(x, 0, z);
    car.rotation.y = rotationY;
    car.name = 'sportsCar';
    storeGroup.add(car);
    return car;
}

function createMainStreetEnvironment() {
    const { positionZ, depth } = STORE_CONFIG;
    const frontZ = positionZ + depth / 2;

    // The tire shop anchors the block on its own. The street furniture below
    // hugs the shop's stretch of sidewalk, keeping the block feeling alive
    // without the portfolio site's old neighboring cafe and bookstore.

    // One tree caps the east end of the block. (Its west twin was removed:
    // it crowded the Railroad Ave street sign, which deserves the visitor's
    // eye on the walk out of the shop.)
    const treePositions = [
        { x: 18, z: frontZ + 4 },
    ];

    treePositions.forEach(pos => {
        createTree(pos.x, pos.z, 0.8 + Math.random() * 0.4);
    });

    // Street lamps flank the storefront at the curb line.
    const lampPositions = [
        { x: -13, z: frontZ + 6 },
        { x: 13, z: frontZ + 6 },
    ];

    lampPositions.forEach(pos => {
        createStreetLamp(pos.x, pos.z);
    });

    // A parked luxury SUV hugging the near curb, centered on the storefront window
    // (window is at X = +4), parallel to the building and facing screen-right (its
    // front toward -X, since the window view looks +Z). Fills the otherwise-empty
    // view out the window with the realtor's aspirational "success" ride.
    // Temporarily not rendered (createParkedSUV kept for later reuse).
    // createParkedSUV(4, frontZ + sidewalkDepth + 1.5, -Math.PI / 2);

    // One bench in the clear stretch between the entrance and the garage bay.
    createBench(1, frontZ + 3, 0);

    // Flower planters on either side of the storefront.
    const planterPositions = [
        { x: -15, z: frontZ + 2 },
        { x: 15, z: frontZ + 2 },
    ];

    planterPositions.forEach(pos => {
        createPlanter(pos.x, pos.z);
    });

    // Sidewalk caps, street, and lane markings sized to the small block
    createExtendedSidewalk();

    // Trees and bushes on the green strip across the street
    createFarSideLandscaping();
}

/**
 * Railroad Ave: the historic side street running down the shop's west side
 * from the main street, past the old freight depot. An older, unmarked strip
 * of worn asphalt with gravel shoulders, plus the green street-name blade at
 * the corner (clickable for a note about the neighborhood).
 */
function createRailroadAve() {
    const aveGroup = new THREE.Group();
    aveGroup.name = 'railroadAve';

    // Worn asphalt, a shade lighter and browner than the main street, with no
    // lane markings: a lane this old never got them.
    const road = new THREE.Mesh(
        new THREE.PlaneGeometry(7, 44),
        new THREE.MeshStandardMaterial({ color: 0x51504b, roughness: 1.0, metalness: 0 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(-25, 0.004, 6);   // z -16 up to the main street at z 28
    road.receiveShadow = true;
    road.name = 'railroadAveRoad';
    aveGroup.add(road);

    // Gravel shoulders on both edges.
    [-28.9, -21.1].forEach((x, i) => {
        const shoulder = new THREE.Mesh(
            new THREE.PlaneGeometry(1.4, 44),
            new THREE.MeshStandardMaterial({ color: 0x7d786d, roughness: 1.0, metalness: 0 })
        );
        shoulder.rotation.x = -Math.PI / 2;
        shoulder.position.set(x, 0.003, 6);
        shoulder.receiveShadow = true;
        shoulder.name = `railroadAveShoulder${i}`;
        aveGroup.add(shoulder);
    });

    // Street-name blade at the corner with the main street.
    const signGroup = new THREE.Group();
    signGroup.name = 'railroadAveSign';

    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 2.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x3c4046, roughness: 0.5, metalness: 0.6 })
    );
    pole.position.y = 1.3;
    pole.castShadow = true;
    signGroup.add(pole);

    const bladeCanvas = document.createElement('canvas');
    bladeCanvas.width = 512;
    bladeCanvas.height = 96;
    const bctx = bladeCanvas.getContext('2d');
    bctx.fillStyle = '#1d6b3f';
    bctx.fillRect(0, 0, 512, 96);
    bctx.strokeStyle = '#f4f5f2';
    bctx.lineWidth = 6;
    bctx.strokeRect(6, 6, 500, 84);
    bctx.fillStyle = '#f4f5f2';
    bctx.font = '600 52px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    bctx.textAlign = 'center';
    bctx.textBaseline = 'middle';
    bctx.fillText('RAILROAD AVE', 256, 50);
    const bladeTexture = new THREE.CanvasTexture(bladeCanvas);
    bladeTexture.colorSpace = THREE.SRGBColorSpace;
    bladeTexture.anisotropy = 4;

    // Two single-sided faces mounted back to back (a hair apart, no
    // z-fighting), so the street name reads left-to-right from either side.
    // A lone DoubleSide plane would mirror the text on its back face.
    const bladeMaterial = new THREE.MeshStandardMaterial({
        map: bladeTexture, roughness: 0.5, metalness: 0.2
    });
    [Math.PI / 2, -Math.PI / 2].forEach((rotY, i) => {
        const bladeFace = new THREE.Mesh(
            new THREE.PlaneGeometry(1.15, 0.22),
            bladeMaterial
        );
        bladeFace.position.set(i === 0 ? 0.006 : -0.006, 2.73, 0); // top-mounted, clearing the pole's cap
        bladeFace.rotation.y = rotY;   // each face reads from along the main street
        signGroup.add(bladeFace);
    });

    // On the sidewalk corner just east of the avenue's curb (the ave's east
    // edge is x -21.5), so neither the pole nor the blade hangs over the road.
    signGroup.position.set(-20.7, 0, 27.2);
    registerOutdoorProp(signGroup, 'railsign');
    aveGroup.add(signGroup);

    // A pair of shade trees framing the depot from just past the walkable edge.
    createTree(-41, 7, 1.0);
    createTree(-41.5, -13, 0.9);

    storeGroup.add(aveGroup);
}

/**
 * The Pennsylvania RR Freight Depot-1892, Cockeysville's historic landmark on
 * Railroad Ave, modeled from the reference photos (specs/building-1..3.png):
 * a long gray board-and-batten body on a darker skirted foundation, a hipped
 * shingle roof with wide bracketed eaves, crossbuck freight doors, small paned
 * windows, end steps, ridge finials, and a vent pipe. Registered as a
 * clickable outdoor prop ('depot') and celebrated on the discovery checklist.
 */
function createFreightDepot() {
    const DEPOT = { x: -34, z: -3, w: 6.5, len: 14, wallH: 3.0, baseH: 0.55, eave: 1.3 };
    const wallTop = DEPOT.baseH + DEPOT.wallH;            // 3.55
    const ridgeY = wallTop + 1.9;                          // 5.45

    const depot = new THREE.Group();
    depot.name = 'freightDepot';

    // --- Materials -------------------------------------------------------
    const sidingTexture = createDepotSidingTexture();
    const longSiding = sidingTexture.clone();
    longSiding.repeat.set(2.2, 1);                         // batten spacing on the 14m sides
    const endSiding = sidingTexture.clone();
    endSiding.repeat.set(1, 1);                            // and on the 6.5m ends
    const longMaterial = new THREE.MeshStandardMaterial({ map: longSiding, roughness: 0.95, metalness: 0 });
    const endMaterial = new THREE.MeshStandardMaterial({ map: endSiding, roughness: 0.95, metalness: 0 });
    const skirtMaterial = new THREE.MeshStandardMaterial({ color: 0x76736c, roughness: 0.95, metalness: 0 });
    const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xa19f98, roughness: 0.9, metalness: 0 });
    const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x8c8c86, roughness: 0.9, metalness: 0 });
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x4b4239, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });

    // --- Gravel apron under and around the building ----------------------
    const apron = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 22),
        new THREE.MeshStandardMaterial({ color: 0x8a8377, roughness: 1.0, metalness: 0 })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = 0.0035;
    apron.receiveShadow = true;
    apron.name = 'depotApron';
    depot.add(apron);

    // --- Walls: the freight room is walk-in. Real board walls replace the
    // old solid box, and the avenue wall carries an open doorway (local z 0
    // to 2.4, 2.5 tall, down to grade) where the crossbuck door has been
    // slid aside on its track. Side walls are 2cm shorter than the ends so
    // no corner faces share a plane (coplanar siding z-fights).
    const wallT = 0.15;
    // Cloned siding per span keeps the batten spacing consistent on the
    // shorter avenue-wall segments.
    const sidingFor = (spanM) => {
        const tex = sidingTexture.clone();
        tex.repeat.set(Math.max(0.4, 2.2 * spanM / DEPOT.len), 1);
        tex.needsUpdate = true;
        return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    };
    const addWall = (mat, bw, bh, bd, x, y, z, name) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
        wall.position.set(x, y, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.name = name;
        depot.add(wall);
    };
    addWall(longMaterial, wallT, wallTop, DEPOT.len - 0.02, -(DEPOT.w / 2 - wallT / 2), wallTop / 2, 0, 'depotWallRail');
    addWall(endMaterial, DEPOT.w - 0.02, wallTop, wallT, 0, wallTop / 2, DEPOT.len / 2 - wallT / 2, 'depotWallNorth');
    addWall(endMaterial, DEPOT.w - 0.02, wallTop, wallT, 0, wallTop / 2, -(DEPOT.len / 2 - wallT / 2), 'depotWallSouth');
    const aveWallX = DEPOT.w / 2 - wallT / 2;
    addWall(sidingFor(6.99), wallT, wallTop, 6.99, aveWallX, wallTop / 2, -3.495, 'depotWallAveSouth');
    addWall(sidingFor(4.59), wallT, wallTop, 4.59, aveWallX, wallTop / 2, 4.695, 'depotWallAveNorth');
    addWall(sidingFor(2.4), wallT, wallTop - 2.5, 2.4, aveWallX, (2.5 + wallTop) / 2, 1.2, 'depotDoorHeader');

    // Wood plank floor at grade, so visitors step straight in.
    const depotFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(DEPOT.w - 0.35, DEPOT.len - 0.35),
        new THREE.MeshStandardMaterial({ color: 0x8a6f52, roughness: 0.95, metalness: 0 })
    );
    depotFloor.rotation.x = -Math.PI / 2;
    depotFloor.position.y = 0.02;
    depotFloor.receiveShadow = true;
    depotFloor.name = 'depotFloor';
    depot.add(depotFloor);

    // Skirted foundation as perimeter strips (gap at the doorway threshold).
    const skirtStrip = (bw, bd, x, z, name) => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(bw, DEPOT.baseH, bd), skirtMaterial);
        strip.position.set(x, DEPOT.baseH / 2, z);
        strip.castShadow = true;
        strip.name = name;
        depot.add(strip);
    };
    skirtStrip(0.12, DEPOT.len + 0.24, -(DEPOT.w / 2 + 0.06), 0, 'depotSkirtRail');
    skirtStrip(DEPOT.w + 0.22, 0.12, 0, DEPOT.len / 2 + 0.06, 'depotSkirtNorth');
    skirtStrip(DEPOT.w + 0.22, 0.12, 0, -(DEPOT.len / 2 + 0.06), 'depotSkirtSouth');
    skirtStrip(0.12, 7.06, DEPOT.w / 2 + 0.06, -3.53, 'depotSkirtAveSouth');
    skirtStrip(0.12, 4.66, DEPOT.w / 2 + 0.06, 4.73, 'depotSkirtAveNorth');

    // Horizontal trim band at sill height, like the reference photos (the
    // avenue side splits around the doorway).
    const bandY = DEPOT.baseH + 0.85;
    [[0.05, 0.14, 7.03, DEPOT.w / 2 + 0.028, -3.515],
     [0.05, 0.14, 4.63, DEPOT.w / 2 + 0.028, 4.715],
     [0.05, 0.14, DEPOT.len + 0.06, -(DEPOT.w / 2 + 0.028), 0],
     [DEPOT.w + 0.06, 0.14, 0.05, 0, DEPOT.len / 2 + 0.028],
     [DEPOT.w + 0.06, 0.14, 0.05, 0, -(DEPOT.len / 2 + 0.028)]].forEach(([bw, bh, bd, bx, bz], i) => {
        const band = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), trimMaterial);
        band.position.set(bx, bandY, bz);
        band.name = `depotBand${i}`;
        depot.add(band);
    });

    // --- Hipped roof (custom geometry: eave rectangle to a short ridge) ---
    const hw = DEPOT.w / 2 + DEPOT.eave;                   // eave half width  (4.55)
    const hl = DEPOT.len / 2 + DEPOT.eave;                 // eave half length (8.3)
    const rz = DEPOT.len / 2 - 2.4;                        // ridge half length (4.6)
    const v = {
        a: [-hw, wallTop, -hl], b: [hw, wallTop, -hl],
        c: [hw, wallTop, hl],  d: [-hw, wallTop, hl],
        r0: [0, ridgeY, -rz],  r1: [0, ridgeY, rz]
    };
    // Triangles wound counter-clockwise viewed from outside.
    const roofTriangles = [
        v.b, v.c, v.r1,   v.b, v.r1, v.r0,   // +x slope (faces the avenue)
        v.d, v.r1, v.c,   v.d, v.r0, v.r1,   // -x slope
        v.b, v.a, v.r0,                       // -z hip end
        v.d, v.c, v.r1                        // +z hip end
    ];
    const roofGeometry = new THREE.BufferGeometry();
    roofGeometry.setAttribute('position',
        new THREE.Float32BufferAttribute(roofTriangles.flat(), 3));
    roofGeometry.computeVertexNormals();
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.castShadow = true;
    depot.add(roof);

    // Flat soffit closing the underside of the wide eaves.
    const soffit = new THREE.Mesh(
        new THREE.PlaneGeometry(hw * 2, hl * 2),
        new THREE.MeshStandardMaterial({ color: 0xb3b1aa, roughness: 0.95, metalness: 0 })
    );
    soffit.rotation.x = Math.PI / 2;                       // face down
    soffit.position.y = wallTop - 0.01;
    soffit.name = 'depotSoffit';
    depot.add(soffit);

    // Fascia boards around the eave edges.
    [[hw * 2 + 0.08, 0.2, 0.08, 0, hl],
     [hw * 2 + 0.08, 0.2, 0.08, 0, -hl],
     [0.08, 0.2, hl * 2 + 0.08, hw, 0],
     [0.08, 0.2, hl * 2 + 0.08, -hw, 0]].forEach(([fw, fh, fd, fx, fz], i) => {
        const fascia = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, fd), trimMaterial);
        fascia.position.set(fx, wallTop + 0.04, fz);
        fascia.name = `depotFascia${i}`;
        depot.add(fascia);
    });

    // Ridge finials (the little rust-orange balls in the photos) + vent pipe.
    [-rz, rz].forEach((fz, i) => {
        const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 0.16, 6),
            trimMaterial
        );
        post.position.set(0, ridgeY + 0.08, fz);
        depot.add(post);
        const ball = new THREE.Mesh(
            new THREE.SphereGeometry(0.07, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0x8a3324, roughness: 0.6, metalness: 0.2 })
        );
        ball.position.set(0, ridgeY + 0.2, fz);
        ball.name = `depotFinial${i}`;
        depot.add(ball);
    });
    // The roof jack sits directly above the pot-belly stove at local
    // (2.3, -5.8); the avenue-slope roof surface there is y ≈ 4.49, so the
    // pipe's base is buried in the shingles and its flue continues the
    // stove pipe rising through the room below.
    const vent = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 1.3, 8),
        new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.35, metalness: 0.7 })
    );
    vent.position.set(2.3, 4.89, -5.8);
    vent.name = 'depotVentPipe';
    depot.add(vent);

    // --- Knee brackets under the eaves (the depot's signature detail) -----
    const addBracket = (px, pz, rotY) => {
        const bracket = new THREE.Group();
        const drop = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.75, 0.09), trimMaterial);
        drop.position.set(0, -0.45, 0.05);
        bracket.add(drop);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1.15), trimMaterial);
        arm.position.set(0, -0.06, 0.5);
        bracket.add(arm);
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1.1), trimMaterial);
        strut.position.set(0, -0.45, 0.42);
        strut.rotation.x = -Math.PI / 4;
        bracket.add(strut);
        bracket.position.set(px, wallTop - 0.05, pz);
        bracket.rotation.y = rotY;
        depot.add(bracket);
    };
    [-6.3, -3.15, 0, 3.15, 6.3].forEach((z) => {
        addBracket(DEPOT.w / 2, z, Math.PI / 2);           // avenue side
        addBracket(-DEPOT.w / 2, z, -Math.PI / 2);         // rail side
    });
    [-1.6, 1.6].forEach((x) => {
        addBracket(x, DEPOT.len / 2, 0);                   // north end
        addBracket(x, -DEPOT.len / 2, Math.PI);            // south end
    });

    // --- Crossbuck freight door, slid OPEN along its overhead track so the
    // --- doorway welcomes visitors in (freight doors roll, they don't swing).
    const doorGroup = new THREE.Group();
    doorGroup.name = 'depotFreightDoor';
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 2.6), doorMaterial);
    doorGroup.add(slab);
    const diagonalLength = Math.sqrt(2.3 * 2.3 + 2.6 * 2.6) - 0.35;
    [1, -1].forEach((dir) => {
        const cross = new THREE.Mesh(
            new THREE.BoxGeometry(0.03, 0.1, diagonalLength),
            trimMaterial
        );
        cross.position.x = 0.04;
        cross.rotation.x = dir * Math.atan2(2.3, 2.6);
        doorGroup.add(cross);
    });
    [[2.6, 0.12, 1.09], [2.6, 0.12, -1.09]].forEach(([dw, dh, dy]) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, dh, dw), trimMaterial);
        rail.position.set(0.03, dy, 0);
        doorGroup.add(rail);
    });
    // Parked north of the opening, hung 1cm clear of the skirting's outer
    // face (x w/2 + 0.13) so the door's lower reach never shares its plane.
    doorGroup.position.set(DEPOT.w / 2 + 0.16, 1.35, 3.85);
    depot.add(doorGroup);
    const doorTrack = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 6.0), trimMaterial);
    doorTrack.position.set(DEPOT.w / 2 + 0.16, 2.62, 2.5);   // plumb above the door
    doorTrack.name = 'depotDoorTrack';
    depot.add(doorTrack);

    // --- A paned window on the avenue side, and one on the north end ------
    const addWindow = (px, py, pz, rotY) => {
        const win = new THREE.Group();
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.15, 0.06), trimMaterial);
        win.add(frame);
        const glass = new THREE.Mesh(
            new THREE.PlaneGeometry(0.74, 0.99),
            new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.2, metalness: 0.3 })
        );
        glass.position.z = 0.035;
        win.add(glass);
        const muntinV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.0, 0.02), trimMaterial);
        muntinV.position.z = 0.04;
        win.add(muntinV);
        const muntinH = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.04, 0.02), trimMaterial);
        muntinH.position.z = 0.04;
        win.add(muntinH);
        win.position.set(px, py, pz);
        win.rotation.y = rotY;
        depot.add(win);
    };
    // Each window sits centered in a clear span between the eave brackets
    // (avenue-side brackets hang at z -6.3/-3.15/0/3.15/6.3, end brackets at
    // x ±1.6), so the frames never overlap the bracket drops.
    addWindow(DEPOT.w / 2 + 0.03, DEPOT.baseH + 1.9, -4.7, Math.PI / 2);
    addWindow(-0.3, DEPOT.baseH + 1.9, DEPOT.len / 2 + 0.03, 0);

    // --- Person door and timber steps at the north end --------------------
    const personDoor = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.0, 0.06), doorMaterial);
    personDoor.position.set(0.9, DEPOT.baseH + 1.0, DEPOT.len / 2 + 0.04);
    personDoor.name = 'depotPersonDoor';
    depot.add(personDoor);

    const steps = new THREE.Group();
    steps.name = 'depotSteps';
    [[0.18, 7.95], [0.36, 7.7], [0.54, 7.45]].forEach(([top, z], i) => {
        const step = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.18, 0.4),
            skirtMaterial
        );
        step.position.set(0.9, top - 0.09, z);
        step.castShadow = true;
        steps.add(step);
    });
    depot.add(steps);

    // --- The landmark's name board on the avenue-side fascia --------------
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 2048;
    signCanvas.height = 192;
    const sctx = signCanvas.getContext('2d');
    sctx.fillStyle = '#3f3d38';
    sctx.fillRect(0, 0, 2048, 192);
    sctx.strokeStyle = '#d8d6cf';
    sctx.lineWidth = 8;
    sctx.strokeRect(10, 10, 2028, 172);
    sctx.fillStyle = '#e9e7e0';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    // Shrink-to-fit so the full landmark name always clears the border.
    const depotSignText = 'PENNSYLVANIA RR FREIGHT DEPOT  ·  1892';
    let signFont = 88;
    sctx.font = `600 ${signFont}px Georgia, "Times New Roman", serif`;
    while (sctx.measureText(depotSignText).width > 1880 && signFont > 40) {
        signFont -= 2;
        sctx.font = `600 ${signFont}px Georgia, "Times New Roman", serif`;
    }
    sctx.fillText(depotSignText, 1024, 100);
    const signTexture = new THREE.CanvasTexture(signCanvas);
    signTexture.colorSpace = THREE.SRGBColorSpace;
    signTexture.anisotropy = 4;
    const nameBoard = new THREE.Mesh(
        new THREE.PlaneGeometry(4.8, 0.45),
        new THREE.MeshStandardMaterial({ map: signTexture, roughness: 0.8, metalness: 0 })
    );
    nameBoard.position.set(hw + 0.05, wallTop + 0.04, 1.2);
    nameBoard.rotation.y = Math.PI / 2;
    nameBoard.name = 'depotNameBoard';
    depot.add(nameBoard);

    // --- The freight room's furnishings ------------------------------------
    const interiorProps = createDepotInterior(depot);

    // --- Place, register, and collide --------------------------------------
    depot.position.set(DEPOT.x, 0, DEPOT.z);
    registerOutdoorProp(depot, 'depot');
    storeGroup.add(depot);

    // Per-wall colliders (world space) with a gap at the open doorway
    // (world z -3 to -0.6), so visitors can walk in. The eaves stay
    // uncollided, so locals can still shelter under the overhang.
    const hwx = DEPOT.w / 2, hlz = DEPOT.len / 2;
    [[DEPOT.x - hwx - 0.15, DEPOT.x - hwx + 0.2, DEPOT.z - hlz, DEPOT.z + hlz],       // rail side
     [DEPOT.x - hwx, DEPOT.x + hwx, DEPOT.z + hlz - 0.2, DEPOT.z + hlz + 0.15],       // north end
     [DEPOT.x - hwx, DEPOT.x + hwx, DEPOT.z - hlz - 0.15, DEPOT.z - hlz + 0.2],       // south end
     [DEPOT.x + hwx - 0.2, DEPOT.x + hwx + 0.15, DEPOT.z - hlz, DEPOT.z],             // avenue, south of the doorway
     [DEPOT.x + hwx - 0.2, DEPOT.x + hwx + 0.15, DEPOT.z + 2.4, DEPOT.z + hlz]        // avenue, north of the doorway
    ].forEach(([x0, x1, z0, z1]) => {
        collisionBoxes.push({
            box: new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 4, z1)),
            type: 'wall'
        });
    });
    // This three.js build's setFromObject refreshes the object and its
    // children but NOT its ancestors, and the depot group's position has not
    // reached any matrixWorld yet, so these boxes come back in depot-LOCAL
    // coordinates (once a ghost collider in the middle of the garage).
    // Translate each into world space by the depot's position explicitly.
    const depotOffset = new THREE.Vector3(DEPOT.x, 0, DEPOT.z);
    [steps, ...interiorProps].forEach((prop) => {
        const propBox = new THREE.Box3().setFromObject(prop);
        propBox.translate(depotOffset);
        collisionBoxes.push({ box: propBox, type: 'decor' });
    });
}

/**
 * The depot's freight room, dressed the way the railroad left it: stacked
 * crates and barrels, a baggage cart, a pot-belly stove with its pipe up
 * through the roof, the old COCKEYSVILLE station board on the rail-side
 * wall, and a hanging lantern that warms the room (and glows through the
 * open door after dark). Everything is built in depot-local coordinates;
 * returns the prop groups that need collision boxes.
 */
function createDepotInterior(depot) {
    const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x8a6b47, roughness: 0.9, metalness: 0 });
    const darkWoodMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4c32, roughness: 0.85, metalness: 0 });
    const ironMaterial = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.55, metalness: 0.5 });

    // Freight: three crates (one stacked askew) and two barrels, south end.
    const freight = new THREE.Group();
    freight.name = 'depotFreight';
    [[-1.6, 0.45, -5.2, 0.9, 0], [-0.55, 0.375, -5.35, 0.75, 0.15], [-1.25, 1.25, -5.1, 0.7, 0.3]].forEach(([fx, fy, fz, size, rot], i) => {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), woodMaterial);
        crate.position.set(fx, fy, fz);
        crate.rotation.y = rot;
        crate.castShadow = true;
        crate.name = `depotCrate${i}`;
        freight.add(crate);
    });
    [[-2.35, -3.9], [-2.15, -5.2]].forEach(([bx, bz], i) => {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.85, 12), darkWoodMaterial);
        barrel.position.set(bx, 0.425, bz);
        barrel.castShadow = true;
        barrel.name = `depotBarrel${i}`;
        freight.add(barrel);
    });
    depot.add(freight);

    // Baggage cart mid-room, angled as if just wheeled in.
    const cart = new THREE.Group();
    cart.name = 'depotBaggageCart';
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.85), woodMaterial);
    bed.position.y = 0.55;
    bed.castShadow = true;
    cart.add(bed);
    [[-0.6, -0.34], [0.6, -0.34], [-0.6, 0.34], [0.6, 0.34]].forEach(([wx, wz]) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 14), ironMaterial);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx, 0.28, wz);
        cart.add(wheel);
    });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), ironMaterial);
    handle.rotation.z = 0.9;
    handle.position.set(1.15, 0.75, 0);
    cart.add(handle);
    cart.position.set(0.7, 0, -2.4);
    cart.rotation.y = 0.35;
    depot.add(cart);

    // Pot-belly stove in the south-east corner, pipe up through the soffit.
    const stove = new THREE.Group();
    stove.name = 'depotStove';
    const stoveBody = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.95, 12), ironMaterial);
    stoveBody.position.y = 0.475;
    stoveBody.castShadow = true;
    stove.add(stoveBody);
    // The flue runs up through the soffit to meet the roof jack, which sits
    // directly above this stove's position on the roof outside.
    const stovePipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.55, 8), ironMaterial);
    stovePipe.position.y = 2.725;
    stove.add(stovePipe);
    stove.position.set(2.3, 0, -5.8);
    depot.add(stove);

    // The old station board on the rail-side wall, facing the doorway.
    const boardCanvas = document.createElement('canvas');
    boardCanvas.width = 1024;
    boardCanvas.height = 160;
    const bctx = boardCanvas.getContext('2d');
    bctx.fillStyle = '#1e4d38';
    bctx.fillRect(0, 0, 1024, 160);
    bctx.strokeStyle = '#d8d6cf';
    bctx.lineWidth = 8;
    bctx.strokeRect(10, 10, 1004, 140);
    bctx.fillStyle = '#e9e7e0';
    bctx.font = '600 88px Georgia, "Times New Roman", serif';
    bctx.textAlign = 'center';
    bctx.textBaseline = 'middle';
    bctx.fillText('COCKEYSVILLE', 512, 84);
    const boardTexture = new THREE.CanvasTexture(boardCanvas);
    boardTexture.colorSpace = THREE.SRGBColorSpace;
    boardTexture.anisotropy = 4;
    const stationBoard = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 0.41),
        new THREE.MeshStandardMaterial({ map: boardTexture, roughness: 0.8, metalness: 0 })
    );
    stationBoard.position.set(-3.07, 2.3, 0.5);   // just proud of the rail wall's interior face (x -3.1)
    stationBoard.rotation.y = Math.PI / 2;
    stationBoard.name = 'depotStationBoard';
    depot.add(stationBoard);

    // Hanging lantern: a warm little light of the depot's own, so the room
    // reads at dusk and spills a glow through the open door at night.
    const lantern = new THREE.Group();
    lantern.name = 'depotLantern';
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6), ironMaterial);
    rod.position.y = 3.26;
    lantern.add(rod);
    const lanternBody = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.3, 8), ironMaterial);
    lanternBody.position.y = 2.85;
    lantern.add(lanternBody);
    const glow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.16, 8),
        new THREE.MeshStandardMaterial({
            color: 0xffc773, roughness: 0.4, metalness: 0,
            emissive: 0xffb45e, emissiveIntensity: 0.9
        })
    );
    glow.position.y = 2.85;
    lantern.add(glow);
    const lanternLight = new THREE.PointLight(0xffd9a0, 0.55, 9, 1.4);
    lanternLight.position.y = 2.8;
    lanternLight.castShadow = false;
    lantern.add(lanternLight);
    lantern.position.set(0, 0, -0.5);
    depot.add(lantern);

    // The station board and lantern need no colliders; the floor freight does.
    return [freight, cart, stove];
}

/**
 * Weathered gray board-and-batten siding for the freight depot, drawn as a
 * small tiling canvas: a gray field, regular batten shadow lines, and a few
 * soft weathering streaks.
 */
function createDepotSidingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#9c9a92';
    ctx.fillRect(0, 0, 256, 256);

    // Battens every 16px: a dark seam line with a lighter highlight beside it.
    for (let x = 0; x < 256; x += 16) {
        ctx.fillStyle = 'rgba(70, 68, 62, 0.55)';
        ctx.fillRect(x, 0, 2, 256);
        ctx.fillStyle = 'rgba(235, 233, 226, 0.25)';
        ctx.fillRect(x + 2, 0, 1, 256);
    }

    // Soft vertical weathering streaks (deterministic, so tiles match).
    [[24, 0.10], [70, 0.14], [128, 0.08], [166, 0.13], [214, 0.09]].forEach(([x, a]) => {
        const streak = ctx.createLinearGradient(0, 0, 0, 256);
        streak.addColorStop(0, `rgba(60, 58, 52, ${a})`);
        streak.addColorStop(1, 'rgba(60, 58, 52, 0)');
        ctx.fillStyle = streak;
        ctx.fillRect(x, 0, 10, 256);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

/**
 * Create extended sidewalk along main street
 */
function createExtendedSidewalk() {
    const { positionZ, depth, sidewalkDepth } = STORE_CONFIG;
    const frontZ = positionZ + depth / 2;

    // Extended sidewalk material
    const sidewalkMaterial = new THREE.MeshStandardMaterial({
        color: 0x999999,
        roughness: 0.8,
        metalness: 0.0
    });

    // Short sidewalk caps past the building's corners (the main sidewalk in
    // front of the store is built in createExteriorGround and spans ±18).
    // The left cap stops at Railroad Ave's east curb (x -21.5) so the avenue
    // crosses the sidewalk band as open pavement, and a separate cap resumes
    // on the far side of the avenue.
    const leftSidewalk = new THREE.Mesh(
        new THREE.PlaneGeometry(3.5, sidewalkDepth),
        sidewalkMaterial
    );
    leftSidewalk.rotation.x = -Math.PI / 2;
    leftSidewalk.position.set(-19.75, 0.02, frontZ + sidewalkDepth / 2);
    leftSidewalk.receiveShadow = true;
    storeGroup.add(leftSidewalk);

    const farLeftSidewalk = new THREE.Mesh(
        new THREE.PlaneGeometry(6, sidewalkDepth),
        sidewalkMaterial
    );
    farLeftSidewalk.rotation.x = -Math.PI / 2;
    farLeftSidewalk.position.set(-31.5, 0.02, frontZ + sidewalkDepth / 2);
    farLeftSidewalk.receiveShadow = true;
    storeGroup.add(farLeftSidewalk);

    const rightSidewalk = new THREE.Mesh(
        new THREE.PlaneGeometry(8, sidewalkDepth),
        sidewalkMaterial
    );
    rightSidewalk.rotation.x = -Math.PI / 2;
    rightSidewalk.position.set(22, 0.02, frontZ + sidewalkDepth / 2);
    rightSidewalk.receiveShadow = true;
    storeGroup.add(rightSidewalk);

    // Street (darker asphalt)
    const streetMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.9,
        metalness: 0.1
    });

    // Widened westward so the main street fully receives Railroad Ave's
    // mouth (the ave spans x -28.5 to -21.5) at their T intersection.
    const street = new THREE.Mesh(
        new THREE.PlaneGeometry(58, STORE_CONFIG.streetWidth),
        streetMaterial
    );
    street.rotation.x = -Math.PI / 2;
    street.position.set(-3, 0.005, frontZ + sidewalkDepth + STORE_CONFIG.streetWidth / 2);
    street.receiveShadow = true;
    storeGroup.add(street);

    // Street markings (center line)
    const lineMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFFF00,
        roughness: 0.5
    });

    for (let i = -20; i < 20; i += 10) {
        const line = new THREE.Mesh(
            new THREE.PlaneGeometry(5, 0.15),
            lineMaterial
        );
        line.rotation.x = -Math.PI / 2;
        line.position.set(i, 0.01, frontZ + sidewalkDepth + STORE_CONFIG.streetWidth / 2);
        storeGroup.add(line);
    }
}

/**
 * Create landscaping (trees and bushes) on the far side of the street
 */
function createFarSideLandscaping() {
    const { positionZ, depth, sidewalkDepth, streetWidth } = STORE_CONFIG;
    const frontZ = positionZ + depth / 2;

    // Far side of street position
    const farSideZ = frontZ + sidewalkDepth + streetWidth + 4;

    const landscapeGroup = new THREE.Group();
    landscapeGroup.name = 'farSideLandscaping';

    // Shared materials for efficiency
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a3728,
        roughness: 0.9,
        metalness: 0.0
    });

    const darkGreenFoliage = new THREE.MeshStandardMaterial({
        color: 0x1a472a,
        roughness: 0.8,
        metalness: 0.0
    });

    const mediumGreenFoliage = new THREE.MeshStandardMaterial({
        color: 0x2d5a27,
        roughness: 0.8,
        metalness: 0.0
    });

    const lightGreenFoliage = new THREE.MeshStandardMaterial({
        color: 0x4a7c23,
        roughness: 0.8,
        metalness: 0.0
    });

    const bushMaterial = new THREE.MeshStandardMaterial({
        color: 0x355e3b,
        roughness: 0.85,
        metalness: 0.0
    });

    // Create large oak-style trees
    function createLargeTree(x, z, height = 8) {
        const tree = new THREE.Group();

        // Thick trunk
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.4, 0.6, height * 0.4, 8),
            trunkMaterial
        );
        trunk.position.y = height * 0.2;
        trunk.castShadow = true;
        tree.add(trunk);

        // Large rounded canopy (multiple spheres)
        const canopyMaterial = [darkGreenFoliage, mediumGreenFoliage, lightGreenFoliage][Math.floor(Math.random() * 3)];
        const canopyBase = height * 0.45;

        // Main canopy sphere
        const mainCanopy = new THREE.Mesh(
            new THREE.SphereGeometry(height * 0.35, 8, 8),
            canopyMaterial
        );
        mainCanopy.position.y = canopyBase + height * 0.25;
        mainCanopy.castShadow = true;
        tree.add(mainCanopy);

        // Additional canopy spheres for fuller look
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

    // Create pine/conifer trees
    function createPineTree(x, z, height = 6) {
        const tree = new THREE.Group();

        // Trunk
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.25, height * 0.3, 6),
            trunkMaterial
        );
        trunk.position.y = height * 0.15;
        trunk.castShadow = true;
        tree.add(trunk);

        // Layered cone foliage
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

    // Create bush clusters
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

    // Create flowering bush
    function createFloweringBush(x, z) {
        const bush = new THREE.Group();

        // Main bush body
        const body = new THREE.Mesh(
            new THREE.SphereGeometry(0.8, 6, 6),
            bushMaterial
        );
        body.position.y = 0.6;
        body.scale.y = 0.8;
        bush.add(body);

        // Flower dots (small colored spheres)
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
        return bush;
    }

    // Place large trees along the far side (minimized: a pair framing the view)
    const largeTreePositions = [
        { x: -14, z: farSideZ + 3, height: 9 },
        { x: 12, z: farSideZ + 4, height: 10 },
    ];

    largeTreePositions.forEach(pos => {
        landscapeGroup.add(createLargeTree(pos.x, pos.z, pos.height));
    });

    // Place pine trees behind them for depth
    const pinePositions = [
        { x: -4, z: farSideZ + 6, height: 6 },
        { x: 18, z: farSideZ + 5, height: 7 },
    ];

    pinePositions.forEach(pos => {
        landscapeGroup.add(registerOutdoorProp(createPineTree(pos.x, pos.z, pos.height), 'tree'));
    });

    // Place bush clusters
    const bushPositions = [
        { x: -18, z: farSideZ + 1, size: 1.0 },
        { x: 6, z: farSideZ + 1, size: 1.2 },
    ];

    bushPositions.forEach(pos => {
        landscapeGroup.add(registerOutdoorProp(createBushCluster(pos.x, pos.z, pos.size), 'bush'));
    });

    // Place flowering bushes
    const flowerBushPositions = [
        { x: -8, z: farSideZ },
        { x: 16, z: farSideZ + 1 },
    ];

    flowerBushPositions.forEach(pos => {
        landscapeGroup.add(registerOutdoorProp(createFloweringBush(pos.x, pos.z), 'bush'));
    });

    // Add some ground grass patches
    const grassMaterial = new THREE.MeshStandardMaterial({
        color: 0x3d8b37,
        roughness: 0.9,
        metalness: 0.0
    });

    // Grass strip along far side
    const grassStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(52, 12),
        grassMaterial
    );
    grassStrip.rotation.x = -Math.PI / 2;
    grassStrip.position.set(0, 0.01, farSideZ + 4);
    grassStrip.receiveShadow = true;
    landscapeGroup.add(grassStrip);

    storeGroup.add(landscapeGroup);
}

/**
 * Create the gallery host (greeter) standing in the center of the room with a
 * floating "Help" sign. Unlike the old store shopkeeper, there are no customers
 * and no checkout counter — just a single greeter who turns to face visitors as
 * they approach. Placed at the room center so he's visible the moment the scene
 * loads (the visitor spawns near the doors looking in).
 */
function createGalleryHost() {
    const { positionX, positionZ } = STORE_CONFIG;
    const peopleGroup = new THREE.Group();
    peopleGroup.name = 'storePeople';

    // The host works the service counter in the waiting room, behind the
    // counter and facing the entrance, in clear view the moment a visitor
    // walks in. He still turns toward the player on approach.
    const hostX = positionX - 9;
    // Pin his depth a fixed distance behind the front wall (Z = +20, which
    // never moves) so resizing the room never slides him into the counter
    // (whose builder uses the same frontZ anchor). Lands just behind the
    // counter at world Z = +8.2.
    const frontZ = positionZ + STORE_CONFIG.depth / 2;
    const hostZ = frontZ - 11.8;
    const defaultRotation = 0;          // face the entrance (+Z) to greet arrivals

    const host = createPerson({
        role: 'shopkeeper',             // reuse the shopkeeper look-at behavior
        x: hostX,
        z: hostZ,
        rotationY: defaultRotation,
        shirtColor: 0x33517d,           // navy mechanic work shirt
        pantsColor: 0x2e3338,           // dark work trousers
        skinTone: 0xd9a87d,             // warm tan
        hairColor: 0x9a7b52,            // dirty-blonde buzz cut
        hairStyle: 'buzz',
        eyeColor: 0x3a6ea8,             // blue eyes
        hasApron: false,
        handScale: 1.25,                // working hands
        footScale: 1.25,                // sturdy work boots
        dressShirt: true                // button-down work shirt (placket + long sleeves)
    });
    peopleGroup.add(host);

    // The greeter is a touch taller and larger than the visiting NPCs, so he
    // reads as the host of the room. Scaling about the group origin would lift his
    // feet, so nudge his Y back down to keep his shoes on the floor.
    const HOST_SCALE = 1.06;
    host.scale.setScalar(HOST_SCALE);
    host.position.y = 0.005 + 0.05 * HOST_SCALE;

    registerHost(host, defaultRotation);

    // Floating "Help" sign above the host, bobbing + billboarding toward camera
    const helpSign = createHelpSign(hostX, hostZ);
    peopleGroup.add(helpSign);
    setHelpSign(helpSign);

    // Collision so visitors walk around the host rather than through him
    const box = new THREE.Box3().setFromObject(host);
    box.expandByScalar(0.1);
    collisionBoxes.push({ box, type: 'host' });

    storeGroup.add(peopleGroup);
}

/**
 * Add collision box for a mesh
 */
function addCollisionBox(mesh) {
    const box = new THREE.Box3().setFromObject(mesh);
    collisionBoxes.push({
        box: box,
        mesh: mesh
    });
}

/**
 * Update scene lighting for store environment
 */
function updateLighting() {
    const scene = getScene();
    if (!scene) return;

    // Remove test objects from scene.js
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

    // Add warm interior point lights
    const { width, depth, height, positionX, positionZ } = STORE_CONFIG;

    const lightPositions = [
        { x: -8, z: -10 },
        { x: 8, z: -10 },
        { x: -8, z: 10 },
        { x: 8, z: 10 },
        { x: 0, z: 0 }
    ];

    lightPositions.forEach((pos, index) => {
        const light = new THREE.PointLight(0xfff0dd, 0.6, 20);
        light.position.set(
            positionX + pos.x,
            height - 1,
            positionZ + pos.z
        );
        light.castShadow = false;
        light.name = `interiorLight${index}`;
        scene.add(light);
    });
}

/**
 * Get store collision boxes
 */
export function getStoreCollisionBoxes() {
    return collisionBoxes;
}

/**
 * Get store group
 */
export function getStoreGroup() {
    return storeGroup;
}

// ============================================
// BACKGROUND SCENERY
// ============================================

// Exposed for unit tests only; production code uses the named exports above.
// (The waypoint/easing/people helpers this once held all live in the shared
// parts library now; shuffled/pickBalanced are re-exposed from people.js.)
export const __test__ = {
    shuffled, pickBalanced,
};
