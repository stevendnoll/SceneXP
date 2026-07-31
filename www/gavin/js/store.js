// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * store.js - The Bug Patrol Garden Construction
 *
 * Builds the seventh SceneXP micro-environment, and the first passive one:
 * a close-up of the Confederate Jasmine on the front-yard patio, potted in
 * its big cedar planter box. Every spring Gavin releases store-bought
 * ladybugs and praying mantises into these plants, and then he and his
 * friends spend weeks searching the leaves for signs of them. Here the
 * visitor gets the view the bugs get: ladybugs on patrol, two mantises
 * keeping still the way mantises do, an ant line working the planter, a
 * spider minding her web in the blackberry trellis, bees commuting between
 * the flowers, and three kids' faces peering in through the far side of
 * the plant. After dark the garden changes crews: the solar lights wake
 * up, the day bugs turn in, and fireflies, snails, and slugs come out.
 *
 * The camera never moves in this experience, so the whole world is
 * composed for one fixed viewpoint (see GAVIN_CONFIG.camera): the planter
 * in the center, lavender and catmint flanking it, the blackberry vine on
 * its trellis behind, the cedar fence and lawn beyond, and the kids
 * face-on. The scene provides all the motion via updateGarden(deltaTime).
 *
 * The module keeps the store.js name and its initStore export so the
 * conductor in main.js reads like every other experience's, but the
 * interactive seams (collision boxes, prop registries, checklists) are
 * gone on purpose: there is nothing to walk into and nothing to click.
 *
 * PATIO PLAN (viewed from above, the camera at the bottom looking up):
 *
 *        - - - cedar fence - - -
 *      lawn                  lawn
 *   [blackberry]
 *      (G)   (Gavin)   (F)          <- the kids, faces toward us
 *        +-----------------+
 *  [catmint] | jasmine |  [lavender]
 *        |  cedar planter  |
 *        +-----------------+
 *          patio pavers
 *            (camera)
 */

import { getScene, getNightFactor } from '../../shared/js/scene-1.0.0.min.js';
import { initWorld, registerOutdoorProp } from '../../shared/js/world-1.0.0.min.js';
import { GAVIN_CONFIG } from './config.min.js';
import { createPerson } from '../../shared/js/people-1.0.0.min.js';
import { createBackgroundScenery } from '../../shared/js/scenery-1.0.0.min.js';

// World mesh groups
let gardenGroup = null;   // the static world: ground, planter, pots, fence, kids
let plantGroup = null;    // the jasmine itself, pivoted at the soil so it can sway

// Visitors who ask for reduced motion get a perfectly still garden: the
// bugs hold their poses and the plant stops swaying. Matches the
// reduced-motion handling of the sky in the shared scene part.
const _reducedMotion = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

// ============================================
// LAYOUT
// ============================================
// Everything is composed around the planter, centered on x 0 at PLANT_Z,
// with the fixed camera on the positive-Z side looking in. All meters.
const LAYOUT = {
    plantZ: -1.55,          // planter (and vine) center
    planter: { size: 0.85, height: 0.62 },   // the cedar cube
    // The jasmine grows the way the real one does: up a tall central
    // support post, with vines that spiral up it, branch off, arch
    // outward, and droop. postH is the post's height above the soil;
    // canopyRadiusAt below shapes the vine spread by height.
    jasmine: { postH: 1.6, maxR: 0.56 },
    // The see-through channel kept clear of leaves so Gavin reads through
    // the vines from the fixed camera. Offset to the right of the post
    // (cx), because Gavin peeks around it, not through it, and tall enough
    // to clear the corridor past his face AND his shirt (a stray leaf once
    // floated on his chest like a name badge). halfW carries a few cm of
    // margin beyond the corridor so the wind sway can't carry a leaf in.
    peekWindow: { cx: 0.22, halfW: 0.28, cy: 0.62, halfH: 0.34 },
    patio: { width: 5.2, depth: 5.0, centerZ: -1.3 },
    fenceZ: -7.6,
    // The plant is a column now, not a ball, so the friends stand clear
    // of it (visible head to waist) and turn slightly inward toward the
    // leaves they are searching. Gavin stands just right of the post.
    kids: {
        gavin: { x: 0.30, z: -2.20, scale: 0.84, lift: 0.07, yaw: 0 },
        left: { x: -0.85, z: -2.45, scale: 0.80, lift: 0, yaw: 0.35 },
        right: { x: 1.15, z: -2.35, scale: 0.86, lift: 0, yaw: -0.35 }
    }
};

// The garden palette. Spring on purpose.
const PALETTE = {
    leafDark: 0x2a5c2e,      // jasmine foliage, shaded
    leafLight: 0x3f7a3a,     // jasmine foliage, sunlit
    jasmineWhite: 0xfdfcf5,  // the pinwheel flowers
    cedarWarm: 0x9b6a43,     // planter and fence base tone
    soil: 0x3a2c1e,
    terracotta: 0xb5623b,
    paver: 0xb9b2a6,
    grass: 0x4d7a3c
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

/** Warm cedar planks with soft grain, running horizontally (planter sides
 *  and the fence both read as horizontal boards at this scale). */
function createCedarTexture() {
    const canvas = makeCanvas(512, 256);
    const ctx = canvas.getContext('2d');

    const tones = ['#9b6a43', '#a5714a', '#8f6240', '#a3754e'];
    for (let p = 0; p < 4; p++) {
        ctx.fillStyle = tones[p];
        ctx.fillRect(0, p * 64, 512, 64);

        // Soft horizontal grain within the plank
        for (let g = 0; g < 9; g++) {
            ctx.strokeStyle = g % 2 ? 'rgba(122, 80, 48, 0.35)' : 'rgba(180, 132, 90, 0.4)';
            ctx.lineWidth = 1 + Math.random() * 1.5;
            const y = p * 64 + 4 + Math.random() * 56;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(170, y + Math.random() * 6 - 3, 340, y + Math.random() * 6 - 3, 512, y + Math.random() * 4 - 2);
            ctx.stroke();
        }

        // The gap between boards
        ctx.fillStyle = 'rgba(40, 26, 14, 0.85)';
        ctx.fillRect(0, p * 64 + 62, 512, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** Patio pavers: big warm-gray squares with sanded joints and a little
 *  per-paver tone drift, so the slab reads as laid stone, not paint. */
function createPaverTexture() {
    const canvas = makeCanvas(512, 512);
    const ctx = canvas.getContext('2d');

    // Joint sand base
    ctx.fillStyle = '#8f887c';
    ctx.fillRect(0, 0, 512, 512);

    const cell = 128, joint = 6;
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            const drift = Math.random() * 20 - 10;
            ctx.fillStyle = `rgb(${185 + drift}, ${178 + drift}, ${166 + drift})`;
            ctx.fillRect(col * cell + joint / 2, row * cell + joint / 2, cell - joint, cell - joint);
            // Speckle so each paver has a bit of aggregate
            for (let i = 0; i < 26; i++) {
                ctx.fillStyle = Math.random() < 0.5
                    ? 'rgba(96, 90, 80, 0.18)'
                    : 'rgba(228, 222, 210, 0.2)';
                const s = 1 + Math.random() * 3;
                ctx.fillRect(
                    col * cell + joint + Math.random() * (cell - joint * 2),
                    row * cell + joint + Math.random() * (cell - joint * 2),
                    s, s
                );
            }
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** Lawn grass: layered green mottle so the big plane doesn't read flat. */
function createGrassTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#4d7a3c';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 130; i++) {
        ctx.fillStyle = ['#456f36', '#558342', '#3f6831', '#5a8a47'][i % 4];
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 18, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    // A scattering of blade-like ticks
    ctx.strokeStyle = 'rgba(30, 52, 24, 0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 220; i++) {
        const x = Math.random() * 256, y = Math.random() * 256;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.random() * 3 - 1.5, y - 3 - Math.random() * 3);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** Potting soil: dark, crumbly, with a few perlite flecks. */
function createSoilTexture() {
    const canvas = makeCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#3a2c1e';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 420; i++) {
        const white = Math.random() < 0.06;
        ctx.fillStyle = white
            ? 'rgba(226, 220, 208, 0.8)'
            : (Math.random() < 0.5 ? 'rgba(20, 14, 8, 0.5)' : 'rgba(88, 66, 44, 0.5)');
        const s = white ? 1.5 : 1 + Math.random() * 2.5;
        ctx.fillRect(Math.random() * 128, Math.random() * 128, s, s);
    }

    return new THREE.CanvasTexture(canvas);
}

// ============================================
// SHARED MATERIALS
// ============================================
const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,      // per-instance colors carry the green variation
    roughness: 0.45,      // Confederate Jasmine leaves are glossy
    metalness: 0.0
});
const flowerMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.jasmineWhite, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide
});
const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.9, metalness: 0.0 });
const greenStemMaterial = new THREE.MeshStandardMaterial({ color: 0x4a6e38, roughness: 0.8, metalness: 0.0 });
const ladybugRed = new THREE.MeshStandardMaterial({ color: 0xc42d1c, roughness: 0.3, metalness: 0.0 });
const bugBlack = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.5, metalness: 0.0 });
const mantisGreen = new THREE.MeshStandardMaterial({ color: 0x6fae4e, roughness: 0.6, metalness: 0.0 });
const beeGold = new THREE.MeshStandardMaterial({ color: 0xe0a92c, roughness: 0.6, metalness: 0.0 });
const wingMaterial = new THREE.MeshStandardMaterial({
    color: 0xdfe8ef, roughness: 0.3, metalness: 0.0,
    transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false
});

// ============================================
// ANIMATION REGISTRIES (filled during build, driven by updateGarden)
// ============================================
let ladybugs = [];      // { mesh, curve, t, dir, speed, pause, walkFor } — walk the vines
let mantises = [];      // { head, arms, group, phase }
let ants = [];          // { mesh, offset }
let antCurve = null;
let bees = [];          // { group, wings, curve, u, speed, phase }
let spider = null;      // { mesh, baseY, phase }
let kids = [];          // { group, baseYaw, baseLean, phase, pointArm }
let vineCurves = [];    // the jasmine's growth curves; ladybugs walk these
let mantisPerches = []; // chosen during the jasmine build, before the leaves
let blackberryGroup = null;   // the potted blackberry; the spider webs its trellis

// The night shift (see updateGarden's crossfade at NIGHT_SWAP):
let fireflies = [];     // { mesh, material, base, p1, p2, p3, blink }
let snails = [];        // { mesh, offset, speed } — take over the ants' rim highway
let slugs = [];         // { mesh, curve, offset, speed } — work the patio
let bats = [];          // { group, wings, curve, u, speed, jink } — hunting overhead
let solarLights = [];   // { light, headMaterial } — glow with the night factor
const NIGHT_SWAP = 0.6; // night factor above which the shift changes

/**
 * Initialize the garden world
 */
export function initStore() {
    const scene = getScene();
    if (!scene) {
        return;
    }

    // The shared world context owns the root group (added to the scene).
    gardenGroup = initWorld(GAVIN_CONFIG);

    createGround();          // lawn and the paver patio
    createFence();           // the cedar fence across the back of the yard
    createBackyardTrees();   // the neighbors' trees, filling the sky beyond it
    createPlanter();         // the cedar cube, soil, and ant line
    createJasmine();         // support post, spiraling vines, instanced leaves and flowers
    createLadybugs();        // on patrol along the vines
    createMantises();        // two, holding very still
    createBees();            // commuting between the jasmine and the side pots
    createSidePlants();      // lavender, catmint, and the potted blackberry
    createSpiderWeb();       // strung in the blackberry's trellis, spider included
    createLadybugCarton();   // the little carton the ladybugs arrived in
    createSolarLights();     // two stake lights that wake up at dusk
    createNightLife();       // fireflies, snails, and slugs, hidden until dark
    createKids();            // Gavin and two friends, peering in from the far side

    // Add background scenery (drifting clouds, per the config toggles)
    createBackgroundScenery();

    return gardenGroup;
}

// ============================================
// GROUND: LAWN AND PATIO
// ============================================
function createGround() {
    const grassTexture = createGrassTexture();
    grassTexture.repeat.set(40, 40);
    const lawn = new THREE.Mesh(
        new THREE.PlaneGeometry(160, 160),
        new THREE.MeshStandardMaterial({ map: grassTexture, roughness: 0.95, metalness: 0.0 })
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -0.02;
    lawn.receiveShadow = true;
    lawn.name = 'lawn';
    gardenGroup.add(lawn);

    const paverTexture = createPaverTexture();
    paverTexture.repeat.set(LAYOUT.patio.width / 1.2, LAYOUT.patio.depth / 1.2);
    const patio = new THREE.Mesh(
        new THREE.BoxGeometry(LAYOUT.patio.width, 0.06, LAYOUT.patio.depth),
        new THREE.MeshStandardMaterial({ map: paverTexture, roughness: 0.9, metalness: 0.0 })
    );
    patio.position.set(0, 0.0, LAYOUT.patio.centerZ);
    patio.receiveShadow = true;
    patio.name = 'patio';
    gardenGroup.add(patio);
}

// ============================================
// THE CEDAR FENCE (backdrop beyond the kids)
// ============================================
function createFence() {
    const fence = new THREE.Group();
    fence.name = 'fence';

    const cedarTexture = createCedarTexture();
    cedarTexture.repeat.set(10, 1.4);
    const cedar = new THREE.MeshStandardMaterial({ map: cedarTexture, roughness: 0.85, metalness: 0.0 });
    const cedarPlain = new THREE.MeshStandardMaterial({ color: PALETTE.cedarWarm, roughness: 0.85, metalness: 0.0 });

    const run = new THREE.Mesh(new THREE.BoxGeometry(30, 1.5, 0.05), cedar);
    run.position.set(0, 0.75, LAYOUT.fenceZ);
    run.castShadow = true;
    run.receiveShadow = true;
    fence.add(run);

    // Posts and a top rail so the run doesn't read as one flat board
    for (let x = -14; x <= 14; x += 2.4) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.62, 0.12), cedarPlain);
        post.position.set(x, 0.81, LAYOUT.fenceZ + 0.05);
        fence.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(30, 0.09, 0.14), cedarPlain);
    rail.position.set(0, 1.53, LAYOUT.fenceZ + 0.02);
    fence.add(rail);

    gardenGroup.add(registerOutdoorProp(fence, 'fence'));
}

// ============================================
// THE NEIGHBORS' TREES (beyond the fence, filling the back sky)
// ============================================
function createBackyardTrees() {
    const trees = new THREE.Group();
    trees.name = 'backyardTrees';

    const barkBrown = new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 0.9, metalness: 0.0 });
    const barkBirch = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.7, metalness: 0.0 });

    // A round-canopied tree (oak or maple): a trunk with a cluster of
    // overlapping foliage spheres. Height h, canopy fullness r, color per
    // species.
    const roundTree = (h, r, color, bark) => {
        const tree = new THREE.Group();
        const canopyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0 });
        const trunkH = h * 0.42;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.03, h * 0.045, trunkH, 7), bark || barkBrown);
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        tree.add(trunk);
        const canopyY = trunkH + r * 0.55;
        [
            [0, 0, 0, 1],
            [r * 0.55, r * 0.15, r * 0.2, 0.72],
            [-r * 0.5, r * 0.2, -r * 0.15, 0.68],
            [r * 0.1, r * 0.55, -r * 0.25, 0.62],
            [-r * 0.15, -r * 0.25, r * 0.4, 0.6]
        ].forEach(([x, y, z, s]) => {
            const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), canopyMaterial);
            puff.position.set(x, canopyY + y, z);
            puff.scale.setScalar(s);
            puff.castShadow = true;
            tree.add(puff);
        });
        return tree;
    };

    // An evergreen: a short trunk with three stacked cones.
    const pineTree = (h, color) => {
        const tree = new THREE.Group();
        const needleMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.0 });
        const trunkH = h * 0.18;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.025, h * 0.035, trunkH, 6), barkBrown);
        trunk.position.y = trunkH / 2;
        tree.add(trunk);
        const tiers = 3;
        for (let i = 0; i < tiers; i++) {
            const tierH = h * (0.42 - i * 0.07);
            const tierR = h * (0.2 - i * 0.05);
            const cone = new THREE.Mesh(new THREE.ConeGeometry(tierR, tierH, 8), needleMaterial);
            cone.position.y = trunkH + tierH * 0.4 + i * h * 0.22;
            cone.castShadow = true;
            tree.add(cone);
        }
        return tree;
    };

    // The back line: varied species and heights, staggered in depth so the
    // silhouettes overlap naturally above the fence instead of picketing.
    [
        { build: () => pineTree(4.8, 0x2a5230), x: -8.8, z: -12.0 },         // evergreen, far left
        { build: () => roundTree(5.2, 1.5, 0x2f5d31), x: -5.6, z: -11.0 },   // big oak
        { build: () => pineTree(6.5, 0x1f4a2a), x: -2.3, z: -12.5 },         // tall spruce
        { build: () => roundTree(4.2, 1.25, 0x4a7a3a), x: 0.9, z: -11.4 },   // maple, lighter green
        { build: () => pineTree(5.4, 0x275430), x: 3.3, z: -13.0 },          // second evergreen
        { build: () => roundTree(3.8, 0.95, 0x5d8a46, barkBirch), x: 6.0, z: -10.4 },  // slim birch
        { build: () => roundTree(4.8, 1.4, 0x336030), x: 9.0, z: -12.2 }     // one more oak, far right
    ].forEach(({ build, x, z }, i) => {
        const tree = build();
        tree.position.set(x, 0, z);
        tree.rotation.y = i * 1.7;    // vary each silhouette a little
        trees.add(tree);
    });

    gardenGroup.add(registerOutdoorProp(trees, 'trees'));
}

// ============================================
// THE CEDAR PLANTER (with soil, trellis base, and the ant line)
// ============================================
function createPlanter() {
    const planter = new THREE.Group();
    planter.name = 'planter';
    const { size, height } = LAYOUT.planter;
    const z = LAYOUT.plantZ;

    const cedarTexture = createCedarTexture();
    cedarTexture.repeat.set(1.6, 1.2);
    const cedar = new THREE.MeshStandardMaterial({ map: cedarTexture, roughness: 0.8, metalness: 0.0 });

    const box = new THREE.Mesh(new THREE.BoxGeometry(size, height, size), cedar);
    box.position.set(0, height / 2, z);
    box.castShadow = true;
    box.receiveShadow = true;
    planter.add(box);

    // A proud top rim, the classic planter cap
    const rim = new THREE.Mesh(
        new THREE.BoxGeometry(size + 0.08, 0.05, size + 0.08),
        new THREE.MeshStandardMaterial({ color: 0x8a5c38, roughness: 0.8, metalness: 0.0 })
    );
    rim.position.set(0, height + 0.025, z);
    rim.castShadow = true;
    planter.add(rim);

    // Soil, slightly mounded below the rim
    const soilTexture = createSoilTexture();
    soilTexture.repeat.set(2, 2);
    const soil = new THREE.Mesh(
        new THREE.CylinderGeometry(size * 0.5, size * 0.52, 0.05, 16),
        new THREE.MeshStandardMaterial({ map: soilTexture, roughness: 1.0, metalness: 0.0 })
    );
    soil.position.set(0, height + 0.02, z);
    planter.add(soil);

    gardenGroup.add(registerOutdoorProp(planter, 'planter'));

    // ---- The ant line ----
    // A closed loop the ants march along forever: across the patio, up the
    // planter's front face, out and around the rim cap's 4 cm overhang
    // (without the detour points the smoothed curve tunnels straight
    // through the lip), along the rim top, and back down the same way.
    // World space, hugging the surfaces.
    const s = size / 2;                    // the box's half width
    const lip = s + 0.04;                  // the rim cap overhangs the box
    const faceZ = z + s + 0.009;           // riding the front face, ant-radius proud
    const lipFaceZ = z + lip + 0.008;      // swinging around the lip's outer face
    const rimTopY = height + 0.05 + 0.008; // walking the rim cap's top
    // The corner points trace the cap's actual profile (under the corner,
    // up the outer face, over the top corner, then inboard): without them
    // the smoothed curve cuts the corner diagonally through the wood, and
    // an 8 mm ant vanishes entirely inside it at the crossing.
    antCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.62, 0.035, z + s + 0.5),
        new THREE.Vector3(0.3, 0.035, z + s + 0.12),
        new THREE.Vector3(0.24, 0.3, faceZ),                  // climbing the front face
        new THREE.Vector3(0.21, 0.56, faceZ),                 // high on the face, under the lip
        new THREE.Vector3(0.2, height - 0.008, lipFaceZ),     // hanging under the lip's outer corner
        new THREE.Vector3(0.19, height + 0.03, lipFaceZ),     // up the lip's outer face
        new THREE.Vector3(0.185, rimTopY + 0.004, lipFaceZ),  // over the top corner, still outside
        new THREE.Vector3(0.17, rimTopY, z + lip - 0.03),     // onto the rim top
        new THREE.Vector3(0.0, rimTopY, z + lip - 0.04),      // along the rim top
        new THREE.Vector3(-0.26, rimTopY, z + lip - 0.03),
        new THREE.Vector3(-0.28, rimTopY + 0.004, lipFaceZ),  // back over the top corner
        new THREE.Vector3(-0.29, height + 0.03, lipFaceZ),    // down the lip's outer face
        new THREE.Vector3(-0.3, height - 0.008, lipFaceZ),    // under the corner again
        new THREE.Vector3(-0.32, 0.45, faceZ),                // down the face
        new THREE.Vector3(-0.42, 0.035, z + s + 0.2),
        new THREE.Vector3(-0.1, 0.035, z + s + 0.62)
    ], true, 'catmullrom', 0.1);

    const antBody = new THREE.SphereGeometry(0.008, 6, 5);
    for (let i = 0; i < 9; i++) {
        const ant = new THREE.Group();
        [[-0.011, 0.9], [0, 0.75], [0.012, 1.0]].forEach(([oz, sc]) => {
            const seg = new THREE.Mesh(antBody, bugBlack);
            seg.position.z = oz;
            seg.scale.setScalar(sc);
            ant.add(seg);
        });
        ant.name = `ant_${i}`;
        // Placed on the line at build so the still (reduced-motion) garden
        // already shows the march in progress.
        antCurve.getPointAt(i / 9, ant.position);
        gardenGroup.add(registerOutdoorProp(ant, 'ants'));
        ants.push({ mesh: ant, offset: i / 9 });
    }
}

// ============================================
// THE CONFEDERATE JASMINE
// ============================================
/** True if a plant-local point sits inside the peek window kept clear so
 *  Gavin's face reads through the vines from the fixed camera. */
function inPeekWindow(x, y) {
    const w = LAYOUT.peekWindow;
    return Math.abs(x - w.cx) < w.halfW && Math.abs(y - w.cy) < w.halfH;
}

/** The vine spread at a given height above the soil: narrow at the base,
 *  widest through the middle, tapering again toward the post top. This one
 *  profile shapes the vines, the ladybug patrols, and the mantis perches,
 *  so the canopy silhouette stays consistent everywhere. */
function canopyRadiusAt(y) {
    const t = Math.max(0, Math.min(1, y / LAYOUT.jasmine.postH));
    return 0.16 + Math.sin(t * Math.PI) * (LAYOUT.jasmine.maxR - 0.16);
}

/** True if a plant-local point would cover Gavin's FACE from the fixed
 *  camera: the point is projected along the camera's ray onto Gavin's
 *  plane, and blocks only if that projection lands on the face band.
 *  Projective on purpose: a fixed-width corridor test rejected so much of
 *  the near-post volume that the plant went bald. Derived from the real
 *  camera position and Gavin's configured spot (so it tracks if either
 *  ever moves); the margins absorb the tube radius and the wind sway. */
function blocksGavinView(p) {
    const pivotY = LAYOUT.planter.height + 0.04;         // plantGroup's world lift
    const cam = GAVIN_CONFIG.camera.position;
    const camY = cam.y - pivotY;
    const camZ = cam.z - LAYOUT.plantZ;
    const g = LAYOUT.kids.gavin;
    const gZ = g.z - LAYOUT.plantZ;
    const u = (camZ - p.z) / (camZ - gZ);                // 0 at the camera, 1 at Gavin
    if (u < 0.3 || u > 1) return false;                  // behind the camera side or past him
    // Where the camera ray through p lands on Gavin's plane
    const xAtGavin = cam.x + (p.x - cam.x) / u;
    const yAtGavin = camY + (p.y - camY) / u;
    // His face band: head plus hair with margin (world y 1.16 to 1.55)
    return Math.abs(xAtGavin - g.x) < 0.17 &&
        yAtGavin > (1.16 - pivotY) && yAtGavin < (1.55 - pivotY);
}

function createJasmine() {
    // The sway pivot sits at the soil surface, so the whole plant rocks
    // gently from its base (see updateGarden).
    plantGroup = new THREE.Group();
    plantGroup.name = 'jasmine';
    plantGroup.position.set(0, LAYOUT.planter.height + 0.04, LAYOUT.plantZ);
    registerOutdoorProp(plantGroup, 'jasmine');
    gardenGroup.add(plantGroup);

    const postH = LAYOUT.jasmine.postH;

    // ---- The support post: one tall wooden stake, like the real one ----
    const postWood = new THREE.MeshStandardMaterial({ color: 0x77593a, roughness: 0.9, metalness: 0.0 });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, postH, 0.06), postWood);
    post.position.y = postH / 2;
    post.castShadow = true;
    plantGroup.add(post);
    // A short cross bar for the highest vines to drape over, tucked down
    // into the canopy so the bare post top doesn't read as a scarecrow cross
    const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 0.045), postWood);
    crossBar.position.y = postH - 0.28;
    crossBar.castShadow = true;
    plantGroup.add(crossBar);

    // ---- Vines: spiral up the post, branch off, arch outward, droop ----
    // Each vine remembers its curve (module-level vineCurves) so the leaves
    // and flowers below can be strung along the actual growth, and so the
    // ladybugs can walk the real vines instead of orbiting a shape.
    vineCurves = [];
    const VINE_COUNT = 12;
    // Gavin stands just past the plant's rear-right shoulder: vines whose
    // arch heads his way keep their reach short, so no branch (and none of
    // its sway) can ever pass through him. His direction from the post,
    // in the vine loop's azimuth convention (x = cos, z = sin):
    const gavinAz = Math.atan2(
        LAYOUT.kids.gavin.z - LAYOUT.plantZ,     // sin component (local z)
        LAYOUT.kids.gavin.x                      // cos component (local x)
    );
    const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    for (let i = 0; i < VINE_COUNT; i++) {
        // Each vine re-rolls its arc until it misses the sight corridor to
        // Gavin (blocksGavinView): no branch may ever cross his face. The
        // az offset gets fresh randomness per attempt so re-rolls actually
        // explore new directions.
        let curve = null;
        for (let attempt = 0; attempt < 8 && !curve; attempt++) {
            const a0 = (i / VINE_COUNT) * Math.PI * 2 + Math.random() * 0.5;
            // Branch heights spread along the whole post so the column fills
            const branchH = 0.3 + (i / VINE_COUNT) * (postH - 0.45) + Math.random() * 0.12;
            const az = a0 + 2.2 + Math.random() * 0.8;    // azimuth where it leaves the post
            const towardGavin = Math.abs(wrapAngle(az + 0.85 - gavinAz)) < 0.9;
            const rOut = canopyRadiusAt(branchH) * (0.85 + Math.random() * 0.35) * (towardGavin ? 0.55 : 1);
            const droop = towardGavin ? 0.15 : 0.2 + Math.random() * 0.2;
            const candidate = new THREE.CatmullRomCurve3([
                new THREE.Vector3(Math.cos(a0) * 0.1, 0.02, Math.sin(a0) * 0.1),
                new THREE.Vector3(Math.cos(a0 + 1.3) * 0.06, branchH * 0.5, Math.sin(a0 + 1.3) * 0.06),
                new THREE.Vector3(Math.cos(az) * 0.06, branchH, Math.sin(az) * 0.06),
                new THREE.Vector3(Math.cos(az + 0.35) * rOut * 0.6, branchH + 0.14, Math.sin(az + 0.35) * rOut * 0.6),
                new THREE.Vector3(Math.cos(az + 0.7) * rOut, branchH + 0.04, Math.sin(az + 0.7) * rOut),
                new THREE.Vector3(Math.cos(az + 1.0) * (rOut + 0.07), branchH - droop, Math.sin(az + 1.0) * (rOut + 0.07))
            ]);
            let blocked = false;
            for (let s = 0; s <= 14 && !blocked; s++) {
                if (blocksGavinView(candidate.getPoint(s / 14))) blocked = true;
            }
            if (!blocked) curve = candidate;
        }
        if (!curve) continue;    // rare: rather one vine short than one in his face

        // Older wood is brown, the newest growth still green
        const material = i % 3 === 2 ? greenStemMaterial : stemMaterial;
        const vine = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.009, 5), material);
        vine.castShadow = true;
        plantGroup.add(vine);
        vineCurves.push(curve);
    }

    // ---- Choose the mantis perches before the leaves go on ----
    // Perches come first so the leaf pass below can keep a small clearing
    // around each one: a mantis buried under the canopy is unfindable, and
    // the game promises "hidden", not "invisible". Candidates must sit on
    // the camera-facing half of a vine, near the canopy surface.
    chooseMantisPerches();

    // ---- Leaves: strung along the vines, one InstancedMesh (one draw) ----
    const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const LEAVES_PER_VINE = isMobile ? 28 : 48;

    const _p = new THREE.Vector3();
    const _q = new THREE.Quaternion();
    const _e = new THREE.Euler();
    const _s = new THREE.Vector3();
    const _m = new THREE.Matrix4();

    // Pre-generate placements (rejecting the peek window) so the instanced
    // mesh is built at exactly the placed count.
    const leafSpots = [];
    vineCurves.forEach((curve) => {
        for (let i = 0; i < LEAVES_PER_VINE; i++) {
            // Leaves favor the outer two thirds of each vine, past the post
            const t = 0.35 + Math.random() * 0.65;
            curve.getPoint(t, _p);
            _p.x += (Math.random() - 0.5) * 0.14;
            _p.y += (Math.random() - 0.5) * 0.12;
            _p.z += (Math.random() - 0.5) * 0.14;
            if (inPeekWindow(_p.x, _p.y)) continue;    // keep Gavin's face clear
            if (nearMantisPerch(_p)) continue;         // keep the mantises findable
            leafSpots.push(_p.clone());
        }
    });

    const leafGeometry = new THREE.SphereGeometry(1, 6, 4);
    const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, leafSpots.length);
    leaves.castShadow = true;
    const _colorA = new THREE.Color(PALETTE.leafDark);
    const _colorB = new THREE.Color(PALETTE.leafLight);
    const _c = new THREE.Color();
    leafSpots.forEach((p, i) => {
        _e.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        _q.setFromEuler(_e);
        const sc = 0.8 + Math.random() * 0.5;
        _s.set(0.052 * sc, 0.016 * sc, 0.08 * sc);
        _m.compose(p, _q, _s);
        leaves.setMatrixAt(i, _m);
        _c.copy(_colorA).lerp(_colorB, Math.random());
        leaves.setColorAt(i, _c);
    });
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    plantGroup.add(leaves);

    // ---- Flowers: little white pinwheels near the vine tips, one draw ----
    const _out = new THREE.Vector3();
    const _zAxis = new THREE.Vector3(0, 0, 1);
    const _spin = new THREE.Quaternion();

    const flowerSpots = [];
    vineCurves.forEach((curve) => {
        // Two or three loose clusters per vine, out where the light is
        const clusters = 2 + Math.floor(Math.random() * 2);
        for (let c = 0; c < clusters; c++) {
            const t = 0.6 + Math.random() * 0.4;
            const blooms = 2 + Math.floor(Math.random() * 3);
            for (let b = 0; b < blooms; b++) {
                curve.getPoint(t, _p);
                _p.x += (Math.random() - 0.5) * 0.12;
                _p.y += (Math.random() - 0.5) * 0.09;
                _p.z += (Math.random() - 0.5) * 0.12;
                if (inPeekWindow(_p.x, _p.y)) continue;
                if (nearMantisPerch(_p)) continue;
                flowerSpots.push(_p.clone());
            }
        }
    });

    const flowers = new THREE.InstancedMesh(
        createPinwheelGeometry(), flowerMaterial, flowerSpots.length);
    flowerSpots.forEach((p, i) => {
        // Face outward from the post axis, tilted a little skyward, with a
        // random pinwheel spin
        _out.set(p.x, 0.35, p.z).normalize();
        _q.setFromUnitVectors(_zAxis, _out);
        _spin.setFromAxisAngle(_out, Math.random() * Math.PI * 2);
        _spin.multiply(_q);
        _s.setScalar(0.85 + Math.random() * 0.35);
        _m.compose(p.addScaledVector(_out, 0.012), _spin, _s);
        flowers.setMatrixAt(i, _m);
    });
    flowers.instanceMatrix.needsUpdate = true;
    plantGroup.add(flowers);
}

/** Pick the two mantis perches from the freshly built vines. A perch must
 *  sit on the camera-facing half of the plant (local z toward the camera)
 *  and near the canopy surface (not buried toward the post), so a mantis
 *  is always at least partially visible from the fixed viewpoint. The
 *  leaf and flower passes keep a clearing around each chosen perch.
 *  Occasionally the second mantis takes the planter rim instead, which is
 *  below the canopy and always visible by construction. */
const MANTIS_COUNT = 3;

function chooseMantisPerches() {
    mantisPerches = [];
    const usedVines = new Set();
    const rimForLast = Math.random() < 0.3;
    for (let i = 0; i < MANTIS_COUNT; i++) {
        if (i === MANTIS_COUNT - 1 && rimForLast) {
            mantisPerches.push({ parent: 'garden' });    // rim; placed in createMantises
            continue;
        }
        let chosen = null;
        for (let attempt = 0; attempt < 60 && !chosen; attempt++) {
            const vi = Math.floor(Math.random() * vineCurves.length);
            if (usedVines.has(vi)) continue;
            const t = 0.55 + Math.random() * 0.4;
            const p = vineCurves[vi].getPoint(t);
            if (p.z < 0.08) continue;                                    // camera-facing half only
            if (Math.hypot(p.x, p.z) < canopyRadiusAt(p.y) * 0.7) continue;  // near the surface, not buried
            // Spread the hunt out: no two perches close enough for their
            // sight-line clearings to merge into one giveaway gap
            if (mantisPerches.some((perch) => perch.parent === 'plant' && perch.point.distanceTo(p) < 0.3)) continue;
            chosen = { parent: 'plant', point: p, vi };
        }
        if (!chosen) {
            // Statistically almost impossible with 60 draws, but never
            // leave the game short a mantis: the rim is always visible.
            mantisPerches.push({ parent: 'garden' });
            continue;
        }
        usedVines.add(chosen.vi);
        mantisPerches.push(chosen);
    }
}

// Scratch vectors for the sight-line occlusion test below
const _perchSeg = new THREE.Vector3();
const _perchToP = new THREE.Vector3();

/** True if a plant-local point would hide a chosen mantis from the fixed
 *  camera: within a small radius of the LINE SEGMENT from the camera to
 *  the perch (not merely near the perch itself; the leaf that hides a
 *  mantis usually hangs well in front of it, on the sight line). The
 *  leaf and flower passes skip these points, so every mantis keeps a
 *  clear peephole from the viewpoint. The segment's endpoint is the
 *  perch, so this also keeps the old close-quarters clearing. */
function nearMantisPerch(p) {
    const pivotY = LAYOUT.planter.height + 0.04;
    const cam = GAVIN_CONFIG.camera.position;
    const camX = cam.x, camY = cam.y - pivotY, camZ = cam.z - LAYOUT.plantZ;
    return mantisPerches.some((perch) => {
        if (perch.parent !== 'plant') return false;
        // Distance from p to the camera→perch segment
        _perchSeg.set(perch.point.x - camX, perch.point.y - camY, perch.point.z - camZ);
        _perchToP.set(p.x - camX, p.y - camY, p.z - camZ);
        const segLen2 = _perchSeg.lengthSq();
        const t = Math.max(0, Math.min(1, _perchToP.dot(_perchSeg) / segLen2));
        _perchSeg.multiplyScalar(t);
        return _perchToP.sub(_perchSeg).length() < 0.1;
    });
}

/** The Confederate Jasmine's signature bloom: five slender petals swept
 *  around the center like a pinwheel. One flat BufferGeometry (five
 *  triangles) shared by every instanced flower, about 2.5 cm across. */
function createPinwheelGeometry() {
    const petals = 5;
    const inner = 0.0035;    // petal base, just off the center
    const len = 0.013;       // petal reach
    const positions = [];
    for (let i = 0; i < petals; i++) {
        const a = (i / petals) * Math.PI * 2;
        const tip = a + 0.55;    // the swept tip is what makes it a pinwheel
        positions.push(
            Math.cos(a - 0.5) * inner, Math.sin(a - 0.5) * inner, 0,
            Math.cos(a + 0.5) * inner, Math.sin(a + 0.5) * inner, 0,
            Math.cos(tip) * len, Math.sin(tip) * len, 0
        );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
}

// ============================================
// LADYBUGS
// ============================================
/** A tiny ladybug: red dome, black head, four spots, and a wing seam. */
function createLadybug() {
    const bug = new THREE.Group();

    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), ladybugRed);
    shell.scale.set(0.014, 0.008, 0.018);
    bug.add(shell);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), bugBlack);
    head.position.set(0, -0.001, 0.017);
    head.scale.set(1, 0.75, 0.8);
    bug.add(head);

    // Wing seam down the middle of the shell
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.002, 0.03), bugBlack);
    seam.position.y = 0.0068;
    bug.add(seam);

    // Spots (two a side)
    const spotGeometry = new THREE.SphereGeometry(0.0034, 6, 5);
    [[-0.007, 0.006], [0.007, 0.006], [-0.006, -0.008], [0.006, -0.008]].forEach(([x, z]) => {
        const spot = new THREE.Mesh(spotGeometry, bugBlack);
        spot.position.set(x, 0.0062, z);
        spot.scale.y = 0.35;
        bug.add(spot);
    });

    return bug;
}

// The stretch of vine a ladybug patrols: from just past the post out to
// near the drooping tip, walked out and back (they cannot leave the vine,
// so they can never float in the air).
const LADYBUG_T_MIN = 0.3;
const LADYBUG_T_MAX = 0.97;

function createLadybugs() {
    for (let i = 0; i < 5; i++) {
        const mesh = createLadybug();
        mesh.name = `ladybug_${i}`;
        plantGroup.add(registerOutdoorProp(mesh, 'ladybug'));
        // Each ladybug claims a vine (spread across the plant, one per)
        const curve = vineCurves[(i * 2 + 1) % vineCurves.length];
        const t = LADYBUG_T_MIN + Math.random() * (LADYBUG_T_MAX - LADYBUG_T_MIN);
        // Placed on the vine at build so the still (reduced-motion) garden
        // already shows a patrol mid-walk.
        curve.getPoint(t, mesh.position);
        ladybugs.push({
            mesh,
            curve,
            t,
            dir: Math.random() < 0.5 ? 1 : -1,
            speed: 0.02 + Math.random() * 0.02,     // slow, busy little walks
            pause: 0,
            walkFor: 4 + Math.random() * 6
        });
    }
}

// ============================================
// PRAYING MANTISES
// ============================================
/** A praying mantis, wonderfully still: swollen abdomen, upright thorax,
 *  triangular head with bead eyes, folded raptorial forearms, four
 *  walking legs, and two thread antennae. About 9 cm nose to tail. */
function createMantis() {
    const mantis = new THREE.Group();

    // Abdomen, sweeping back and slightly up
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), mantisGreen);
    abdomen.scale.set(0.009, 0.008, 0.032);
    abdomen.position.set(0, 0.008, -0.028);
    abdomen.rotation.x = -0.25;
    mantis.add(abdomen);

    // Upright thorax
    const thorax = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.034, 6), mantisGreen);
    thorax.position.set(0, 0.022, -0.002);
    thorax.rotation.x = 0.5;
    mantis.add(thorax);

    // Head: the classic triangle, carried level, free to scan
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.011, 5), mantisGreen);
    skull.rotation.x = Math.PI;      // point down
    head.add(skull);
    const eyeGeometry = new THREE.SphereGeometry(0.0035, 6, 5);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x39511f, roughness: 0.35 });
    [-1, 1].forEach((side) => {
        const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        eye.position.set(side * 0.0062, 0.003, 0);
        head.add(eye);
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0003, 0.03, 3), mantisGreen);
        antenna.position.set(side * 0.003, 0.017, 0.004);
        antenna.rotation.z = -side * 0.35;
        antenna.rotation.x = 0.3;
        head.add(antenna);
    });
    head.position.set(0, 0.038, 0.007);
    mantis.add(head);

    // The famous folded forearms
    const arms = [];
    [-1, 1].forEach((side) => {
        const arm = new THREE.Group();
        const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0026, 0.02, 5), mantisGreen);
        upper.position.y = -0.008;
        arm.add(upper);
        const claw = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.002, 0.018, 5), mantisGreen);
        claw.position.set(0, -0.016, 0.006);
        claw.rotation.x = 2.4;        // folded tightly back up
        arm.add(claw);
        arm.position.set(side * 0.005, 0.032, 0.006);
        arm.rotation.x = -0.7;
        mantis.add(arm);
        arms.push(arm);
    });

    // Four long walking legs
    [-1, 1].forEach((side) => {
        [[-0.018, -0.9], [-0.03, -0.5]].forEach(([z, lean]) => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0009, 0.036, 4), mantisGreen);
            leg.position.set(side * 0.011, 0.006, z);
            leg.rotation.z = side * 1.0;
            leg.rotation.x = lean * 0.4;
            mantis.add(leg);
        });
    });

    return { group: mantis, head, arms };
}

function createMantises() {
    // Both mantises live on the jasmine, the way Gavin's real ones do.
    // Their perches were chosen during the jasmine build (see
    // chooseMantisPerches): points on the camera-facing surface of actual
    // vine curves, each with a small leaf clearing kept around it, so a
    // mantis can neither spawn in the air nor vanish behind the canopy.
    mantisPerches.forEach((perch, i) => {
        const mantis = createMantis();
        // Each mantis in the trio runs a little smaller than the last
        if (i > 0) mantis.group.scale.setScalar([1, 0.88, 0.8][i] || 0.85);

        // The find-me game needs a tap target bigger than a 9 cm insect:
        // an invisible sphere around the body catches near-miss taps.
        const hitProxy = new THREE.Mesh(
            new THREE.SphereGeometry(0.09, 8, 6),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
        );
        hitProxy.position.y = 0.02;
        mantis.group.add(hitProxy);
        mantis.group.userData.isMantis = true;

        if (perch.parent === 'plant') {
            mantis.group.position.copy(perch.point);
            mantis.group.position.y += 0.004;        // feet on the vine, not in it
            // Face outward from the post, with a little wander
            mantis.group.rotation.y =
                Math.atan2(mantis.group.position.x, mantis.group.position.z) +
                (Math.random() - 0.5) * 1.2;
            plantGroup.add(mantis.group);
        } else {
            // The rim cap's top runs at planter height + the cap's 5 cm,
            // spanning the front edge (world coords, static group).
            const side = Math.random() < 0.5 ? -1 : 1;
            mantis.group.position.set(
                side * (0.1 + Math.random() * 0.24),
                LAYOUT.planter.height + 0.05,
                LAYOUT.plantZ + LAYOUT.planter.size / 2 + 0.01
            );
            mantis.group.rotation.y = side * -0.6;   // quartered along the rim
            gardenGroup.add(mantis.group);
        }

        mantises.push({ ...mantis, phase: i * Math.PI, celebrate: 0 });
    });
}

/** The mantis root groups, for main.js's find-me tap test. */
export function getMantisMeshes() {
    return mantises.map((m) => m.group);
}

/** A visitor spotted this mantis: rear up and wave the forearms for a
 *  moment (see the celebrate branch in updateGarden). */
export function celebrateMantisFound(group) {
    const m = mantises.find((entry) => entry.group === group);
    if (m) m.celebrate = 1.6;
}

// ============================================
// THE SPIDER AND HER WEB
// ============================================
function createSpiderWeb() {
    const web = new THREE.Group();
    web.name = 'spiderWeb';

    // Orb web geometry: 8 spokes and 4 rings as one LineSegments pass
    const points = [];
    const spokes = 8, rings = 4, R = 0.13;
    const spokeEnds = [];
    for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        spokeEnds.push([Math.cos(a) * R, Math.sin(a) * R]);
        points.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0));
    }
    for (let r = 1; r <= rings; r++) {
        const rr = (r / rings) * R * 0.92;
        for (let i = 0; i < spokes; i++) {
            const a1 = (i / spokes) * Math.PI * 2;
            const a2 = ((i + 1) / spokes) * Math.PI * 2;
            points.push(
                new THREE.Vector3(Math.cos(a1) * rr, Math.sin(a1) * rr, 0),
                new THREE.Vector3(Math.cos(a2) * rr, Math.sin(a2) * rr, 0)
            );
        }
    }
    // Anchor threads running from the web's rim to the trellis frame: the
    // two posts sideways and the two wires above and below, so the silk is
    // visibly strung to wood, not floating.
    [[0, 2.0], [2, 1.35], [4, 2.3], [6, 1.15]].forEach(([spoke, reach]) => {
        const a = (spoke / spokes) * Math.PI * 2;
        points.push(
            new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0),
            new THREE.Vector3(Math.cos(a) * R * reach, Math.sin(a) * R * reach, 0)
        );
    });

    const webGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const webLines = new THREE.LineSegments(
        webGeometry,
        new THREE.LineBasicMaterial({ color: 0xeef2f5, transparent: true, opacity: 0.55 })
    );
    web.add(webLines);

    // The spider at the hub: two-part body, eight simple legs
    const spiderGroup = new THREE.Group();
    const brown = new THREE.MeshStandardMaterial({ color: 0x4a3421, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), brown);
    body.scale.set(0.9, 1.1, 0.8);
    spiderGroup.add(body);
    const headPart = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 5), brown);
    headPart.position.y = -0.011;
    spiderGroup.add(headPart);
    for (let i = 0; i < 8; i++) {
        const side = i < 4 ? -1 : 1;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0005, 0.024, 3), brown);
        leg.position.set(side * 0.008, -0.004 + (i % 4) * 0.003, 0.001);
        leg.rotation.z = side * (0.9 + (i % 4) * 0.35);
        spiderGroup.add(leg);
    }
    spiderGroup.position.set(0.01, -0.015, 0.004);   // just off the hub
    web.add(spiderGroup);

    // Strung inside the blackberry trellis frame, where a real orb weaver
    // would build: centered between the posts, hung between the two wires.
    // Local coords in the trellis (blackberryGroup); the anchors above are
    // sized to land on the posts and wires exactly.
    web.position.set(0.02, 0.6, 0.02);
    (blackberryGroup || gardenGroup).add(registerOutdoorProp(web, 'spider'));

    spider = { mesh: spiderGroup, baseY: spiderGroup.position.y, phase: Math.random() * Math.PI * 2 };
}

// ============================================
// BEES
// ============================================
function createBee() {
    const bee = new THREE.Group();

    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), beeGold);
    body.scale.set(0.011, 0.01, 0.016);
    bee.add(body);

    // Two black bands
    [-0.004, 0.005].forEach((z) => {
        const band = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), bugBlack);
        band.scale.set(0.0112, 0.0102, 0.0028);
        band.position.z = z;
        bee.add(band);
    });

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 5), bugBlack);
    head.position.z = 0.017;
    bee.add(head);

    // Wings, blurred by flutter in updateGarden
    const wings = [];
    const wingGeometry = new THREE.SphereGeometry(1, 6, 4);
    [-1, 1].forEach((side) => {
        const wing = new THREE.Mesh(wingGeometry, wingMaterial);
        wing.scale.set(0.009, 0.002, 0.014);
        wing.position.set(side * 0.008, 0.009, -0.002);
        wing.rotation.z = side * 0.5;
        bee.add(wing);
        wings.push(wing);
    });

    return { group: bee, wings };
}

function createBees() {
    // Each bee flies its own closed commute between the jasmine crown and
    // the flanking pots, world space, never quite repeating in sync.
    const routes = [
        [
            new THREE.Vector3(0.35, 1.75, -1.25),
            new THREE.Vector3(1.3, 1.25, -1.7),     // lavender
            new THREE.Vector3(1.05, 1.0, -2.3),
            new THREE.Vector3(-0.15, 1.9, -1.9),
            new THREE.Vector3(-0.55, 1.6, -1.15)
        ],
        [
            new THREE.Vector3(-0.5, 1.5, -1.2),
            new THREE.Vector3(-1.35, 1.15, -1.65),  // catmint
            new THREE.Vector3(-1.0, 1.45, -2.4),
            new THREE.Vector3(0.3, 1.95, -2.0),
            new THREE.Vector3(0.62, 1.55, -1.3)
        ],
        [
            new THREE.Vector3(0.15, 1.85, -1.5),
            new THREE.Vector3(1.4, 1.3, -2.1),
            new THREE.Vector3(0.4, 1.1, -0.9),      // a low pass right in front
            new THREE.Vector3(-1.2, 1.35, -1.5),
            new THREE.Vector3(-0.4, 1.9, -2.2)
        ]
    ];

    routes.forEach((waypoints, i) => {
        const bee = createBee();
        bee.group.name = `bee_${i}`;
        const curve = new THREE.CatmullRomCurve3(waypoints, true, 'catmullrom', 0.7);
        const u = i / routes.length;
        // Placed on the route at build so the still (reduced-motion) garden
        // already shows the commute in progress.
        curve.getPointAt(u, bee.group.position);
        gardenGroup.add(registerOutdoorProp(bee.group, 'bee'));
        bees.push({
            ...bee,
            curve,
            u,
            speed: 0.022 + Math.random() * 0.01,
            phase: Math.random() * Math.PI * 2
        });
    });
}

// ============================================
// THE SIDE PLANTS: LAVENDER, CATMINT, BLACKBERRY
// ============================================
function createTerracottaPot(radiusTop, height) {
    const pot = new THREE.Group();
    const clay = new THREE.MeshStandardMaterial({ color: PALETTE.terracotta, roughness: 0.85, metalness: 0.0 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusTop * 0.72, height, 12), clay);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    pot.add(body);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop * 1.08, radiusTop * 1.05, height * 0.16, 12), clay);
    lip.position.y = height - height * 0.08;
    pot.add(lip);
    const soil = new THREE.Mesh(
        new THREE.CylinderGeometry(radiusTop * 0.92, radiusTop * 0.9, 0.03, 12),
        new THREE.MeshStandardMaterial({ color: PALETTE.soil, roughness: 1.0 })
    );
    soil.position.y = height - 0.02;
    pot.add(soil);
    return pot;
}

/** The lavender: gray-green stems in a fan, each topped with a violet
 *  flower spike. */
function createLavender() {
    const plant = new THREE.Group();
    plant.name = 'lavender';
    plant.add(createTerracottaPot(0.19, 0.3));

    const stemGeometry = new THREE.CylinderGeometry(0.003, 0.004, 0.42, 4);
    const grayGreen = new THREE.MeshStandardMaterial({ color: 0x7d8f70, roughness: 0.8 });
    const spikeGeometry = new THREE.SphereGeometry(1, 6, 5);
    const violet = new THREE.MeshStandardMaterial({ color: 0x7b62b8, roughness: 0.7 });
    for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const lean = 0.1 + Math.random() * 0.22;
        const stem = new THREE.Mesh(stemGeometry, grayGreen);
        stem.position.set(Math.cos(a) * lean * 0.35, 0.48, Math.sin(a) * lean * 0.35);
        stem.rotation.z = -Math.cos(a) * lean;
        stem.rotation.x = Math.sin(a) * lean;
        plant.add(stem);
        const spike = new THREE.Mesh(spikeGeometry, violet);
        spike.scale.set(0.014, 0.038, 0.014);
        spike.position.set(
            Math.cos(a) * lean * 0.35 + Math.sin(stem.rotation.z) * -0.22,
            0.48 + 0.22,
            Math.sin(a) * lean * 0.35 + Math.sin(stem.rotation.x) * 0.22
        );
        plant.add(spike);
    }

    plant.position.set(1.35, 0, -1.85);
    return plant;
}

/** The catmint: a soft sage mound with loose blue-violet flower wands. */
function createCatmint() {
    const plant = new THREE.Group();
    plant.name = 'catmint';
    plant.add(createTerracottaPot(0.21, 0.26));

    const sage = new THREE.MeshStandardMaterial({ color: 0x6f8563, roughness: 0.85 });
    const moundGeometry = new THREE.SphereGeometry(1, 8, 6);
    [[0, 0.3, 0, 0.2], [-0.1, 0.27, 0.06, 0.15], [0.1, 0.28, -0.05, 0.16]].forEach(([x, y, z, s]) => {
        const mound = new THREE.Mesh(moundGeometry, sage);
        mound.position.set(x, y, z);
        mound.scale.set(s, s * 0.7, s);
        mound.castShadow = true;
        plant.add(mound);
    });

    const wandGeometry = new THREE.CylinderGeometry(0.002, 0.003, 0.2, 4);
    const blueViolet = new THREE.MeshStandardMaterial({ color: 0x8a7fc9, roughness: 0.7 });
    const budGeometry = new THREE.SphereGeometry(1, 5, 4);
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.3;
        const wand = new THREE.Mesh(wandGeometry, sage);
        const lean = 0.25 + Math.random() * 0.3;
        wand.position.set(Math.cos(a) * 0.1, 0.42, Math.sin(a) * 0.1);
        wand.rotation.z = -Math.cos(a) * lean;
        wand.rotation.x = Math.sin(a) * lean;
        plant.add(wand);
        const bud = new THREE.Mesh(budGeometry, blueViolet);
        bud.scale.set(0.011, 0.026, 0.011);
        bud.position.set(
            Math.cos(a) * 0.1 - Math.sin(wand.rotation.z) * 0.11,
            0.52,
            Math.sin(a) * 0.1 + Math.sin(wand.rotation.x) * 0.11
        );
        plant.add(bud);
    }

    plant.position.set(-1.35, 0, -1.8);
    return plant;
}

/** The blackberry vine, potted like its neighbors: a big terracotta pot
 *  with a little trellis rising out of it, arching canes, a scatter of
 *  leaves, and clusters of dark berries. The spider strings her web in
 *  the trellis frame (createSpiderWeb attaches it here). */
function createBlackberry() {
    const plant = new THREE.Group();
    plant.name = 'blackberry';

    const potH = 0.34;
    plant.add(createTerracottaPot(0.26, potH));

    // Everything growing sits in an inner group raised to the pot's soil,
    // so the trellis and canes clearly live in the pot.
    const growth = new THREE.Group();
    growth.name = 'blackberryGrowth';
    growth.position.y = potH - 0.03;
    plant.add(growth);

    const slat = new THREE.MeshStandardMaterial({ color: 0x6e5136, roughness: 0.9 });
    [-0.28, 0.28].forEach((x) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.0, 0.035), slat);
        post.position.set(x, 0.5, 0);
        post.castShadow = true;
        growth.add(post);
    });
    [0.45, 0.78].forEach((y) => {
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.6, 4), slat);
        wire.rotation.z = Math.PI / 2;
        wire.position.set(0, y, 0);
        growth.add(wire);
    });

    const cane = new THREE.MeshStandardMaterial({ color: 0x59703c, roughness: 0.85 });
    for (let i = 0; i < 4; i++) {
        const x0 = -0.24 + i * 0.16;
        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(x0, 0, 0.04),
            new THREE.Vector3(x0 + 0.08, 0.5, -0.02),
            new THREE.Vector3(x0 + 0.22, 0.85, 0.02),
            new THREE.Vector3(x0 + 0.4, 0.62, 0.05)
        ]);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.008, 4), cane);
        tube.castShadow = true;
        growth.add(tube);
    }

    // Leaves along the wires
    const leafGeometry = new THREE.SphereGeometry(1, 6, 4);
    const berryLeaf = new THREE.MeshStandardMaterial({ color: 0x3c6633, roughness: 0.7 });
    for (let i = 0; i < 20; i++) {
        const leaf = new THREE.Mesh(leafGeometry, berryLeaf);
        leaf.scale.set(0.05, 0.014, 0.07);
        leaf.position.set(
            Math.random() * 0.7 - 0.35,
            0.35 + Math.random() * 0.55,
            Math.random() * 0.1 - 0.05
        );
        leaf.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        growth.add(leaf);
    }

    // Berry clusters: some ripe black, some still red
    const berryGeometry = new THREE.IcosahedronGeometry(0.012, 0);
    const ripe = new THREE.MeshStandardMaterial({ color: 0x1c1022, roughness: 0.35 });
    const unripe = new THREE.MeshStandardMaterial({ color: 0x8c2f36, roughness: 0.4 });
    for (let c = 0; c < 5; c++) {
        const cx = Math.random() * 0.5 - 0.25;
        const cy = 0.45 + Math.random() * 0.35;
        for (let b = 0; b < 3; b++) {
            const berry = new THREE.Mesh(berryGeometry, Math.random() < 0.6 ? ripe : unripe);
            berry.position.set(cx + Math.random() * 0.04 - 0.02, cy - b * 0.02, 0.04 + Math.random() * 0.03);
            berry.scale.setScalar(0.8 + Math.random() * 0.4);
            growth.add(berry);
        }
    }

    // Fully on the patio (it was drifting onto the lawn before the pot)
    plant.position.set(-1.85, 0, -3.0);
    plant.rotation.y = 0.45;
    blackberryGroup = growth;    // the spider webs this trellis frame
    return plant;
}

function createSidePlants() {
    gardenGroup.add(registerOutdoorProp(createLavender(), 'lavender'));
    gardenGroup.add(registerOutdoorProp(createCatmint(), 'catmint'));
    gardenGroup.add(registerOutdoorProp(createBlackberry(), 'blackberry'));
}

// ============================================
// THE LADYBUG CARTON (the little tub they arrived in, a spring tradition)
// ============================================
function createLadybugCarton() {
    const carton = new THREE.Group();
    carton.name = 'ladybugCarton';

    // Label drawn onto canvas so the tub reads at a glance
    const canvas = makeCanvas(128, 64);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4efe2';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#b3241a';
    ctx.beginPath();
    ctx.arc(24, 32, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#221f1c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, 19);
    ctx.lineTo(24, 45);
    ctx.stroke();
    ctx.fillStyle = '#221f1c';
    [[19, 27], [29, 27], [18, 37], [30, 37]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.font = 'bold 15px Arial';
    ctx.fillText('LIVE', 48, 28);
    ctx.fillText('LADYBUGS', 48, 46);
    const labelTexture = new THREE.CanvasTexture(canvas);

    const tub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.06, 0.1, 12),
        new THREE.MeshStandardMaterial({ map: labelTexture, roughness: 0.7 })
    );
    tub.position.y = 0.05;
    tub.castShadow = true;
    carton.add(tub);
    const lid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.072, 0.072, 0.014, 12),
        new THREE.MeshStandardMaterial({ color: 0x2e6b34, roughness: 0.6 })
    );
    lid.position.y = 0.107;
    carton.add(lid);

    // Set by the planter's front corner, lid ajar: patrol deployed
    carton.position.set(0.62, 0.03, -1.02);
    carton.rotation.y = 0.7;
    lid.position.x = 0.03;
    lid.rotation.z = 0.15;
    gardenGroup.add(registerOutdoorProp(carton, 'carton'));
}

// ============================================
// SOLAR LIGHTS (wake up at dusk, driven by the shared night factor)
// ============================================
function createSolarLights() {
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.6, metalness: 0.4 });
    [
        { x: 0.95, z: -0.78 },
        { x: -0.95, z: -0.82 }
    ].forEach(({ x, z }, i) => {
        const lamp = new THREE.Group();
        lamp.name = `solarLight_${i}`;

        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6), poleMaterial);
        pole.position.y = 0.2;
        lamp.add(pole);

        // The glow head: emissive ramps with the night factor in updateGarden
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0xfff3d6, roughness: 0.4, metalness: 0.0,
            emissive: 0xffc978, emissiveIntensity: 0
        });
        const glowHead = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.024, 0.05, 8), headMaterial);
        glowHead.position.y = 0.395;
        lamp.add(glowHead);

        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.016, 8), poleMaterial);
        cap.position.y = 0.428;
        lamp.add(cap);

        // A small warm pool of light on the patio and planter after dark
        const light = new THREE.PointLight(0xffd9a0, 0, 3.2);
        light.position.y = 0.4;
        lamp.add(light);

        lamp.position.set(x, 0.03, z);
        gardenGroup.add(registerOutdoorProp(lamp, 'solar'));
        solarLights.push({ light, headMaterial });
    });
}

// ============================================
// THE NIGHT SHIFT: FIREFLIES, SNAILS, AND SLUGS
// ============================================
// Gavin knows the garden changes crews after dark. The ladybugs, ants, and
// bees turn in; the fireflies rise off the lawn, and the snails and slugs
// come out to work the damp stone. All start hidden; updateGarden swaps
// the shifts as the shared night factor crosses NIGHT_SWAP.
function createNightLife() {
    // ---- Fireflies: drifting points of blinking light ----
    const fireflyGeometry = new THREE.SphereGeometry(0.011, 6, 5);
    for (let i = 0; i < 8; i++) {
        // One material per firefly so each blinks on its own clock
        const material = new THREE.MeshBasicMaterial({
            color: 0xd8ff5a, transparent: true, opacity: 0, fog: false
        });
        const fly = new THREE.Mesh(fireflyGeometry, material);
        fly.name = `firefly_${i}`;
        fly.position.set(
            Math.random() * 4.4 - 2.2,
            0.7 + Math.random() * 1.5,
            -3.4 + Math.random() * 3.2
        );
        fly.visible = false;
        gardenGroup.add(fly);
        fireflies.push({
            mesh: fly,
            material,
            base: fly.position.clone(),
            p1: Math.random() * Math.PI * 2,
            p2: Math.random() * Math.PI * 2,
            p3: Math.random() * Math.PI * 2,
            blink: Math.random() * Math.PI * 2
        });
    }

    // ---- Snails: shells on the move (barely), on the ants' rim highway ----
    const snailBody = new THREE.MeshStandardMaterial({ color: 0x9a8c74, roughness: 0.85 });
    const snailShell = new THREE.MeshStandardMaterial({ color: 0x6d4f2e, roughness: 0.6 });
    for (let i = 0; i < 2; i++) {
        const snail = new THREE.Group();
        snail.name = `snail_${i}`;
        const body = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), snailBody);
        body.scale.set(0.011, 0.009, 0.026);
        body.position.y = 0.006;
        snail.add(body);
        // Eye stalks, the giveaway silhouette
        [-1, 1].forEach((side) => {
            const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.012, 3), snailBody);
            stalk.position.set(side * 0.004, 0.016, 0.02);
            stalk.rotation.x = 0.5;
            snail.add(stalk);
        });
        const shell = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), snailShell);
        shell.scale.set(0.85, 1, 1);
        shell.position.set(0, 0.016, -0.006);
        snail.add(shell);
        const whorl = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 5), snailBody);
        whorl.position.set(0, 0.02, -0.013);
        snail.add(whorl);

        snail.visible = false;
        const offset = 0.15 + i * 0.45;
        antCurve.getPointAt(offset, snail.position);
        gardenGroup.add(registerOutdoorProp(snail, 'snail'));
        snails.push({ mesh: snail, offset, speed: 0.0012 + i * 0.0006 });
    }

    // ---- Slugs: two dark commas working the pavers by the planter ----
    const slugMaterial = new THREE.MeshStandardMaterial({ color: 0x4c4238, roughness: 0.5 });
    const slugRoutes = [
        new THREE.CatmullRomCurve3([
            new THREE.Vector3(0.35, 0.045, -0.85),
            new THREE.Vector3(0.6, 0.045, -1.1),
            new THREE.Vector3(0.35, 0.045, -1.3),
            new THREE.Vector3(0.05, 0.045, -1.0)
        ], true, 'catmullrom', 0.7),
        new THREE.CatmullRomCurve3([
            new THREE.Vector3(-0.5, 0.045, -0.9),
            new THREE.Vector3(-0.75, 0.045, -1.2),
            new THREE.Vector3(-0.45, 0.045, -1.35),
            new THREE.Vector3(-0.2, 0.045, -1.05)
        ], true, 'catmullrom', 0.7)
    ];
    slugRoutes.forEach((curve, i) => {
        const slug = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), slugMaterial);
        slug.name = `slug_${i}`;
        slug.scale.set(0.009, 0.007, 0.024);
        slug.visible = false;
        const offset = i * 0.5;
        curve.getPointAt(offset, slug.position);
        gardenGroup.add(registerOutdoorProp(slug, 'slug'));
        slugs.push({ mesh: slug, curve, offset, speed: 0.002 });
    });

    // ---- Bats: hunting the fireflies' airspace, high over the yard ----
    const batMaterial = new THREE.MeshStandardMaterial({ color: 0x232025, roughness: 0.8 });
    const wingGeometry = new THREE.ConeGeometry(0.05, 0.13, 3);
    const batRoutes = [
        [
            new THREE.Vector3(-2.5, 3.6, -4.5),
            new THREE.Vector3(0.5, 4.4, -6.5),
            new THREE.Vector3(3.0, 3.2, -4.0),
            new THREE.Vector3(0.5, 2.8, -2.5),
            new THREE.Vector3(-1.8, 3.9, -3.2)
        ],
        [
            new THREE.Vector3(2.2, 4.8, -7.0),
            new THREE.Vector3(-1.5, 3.4, -5.5),
            new THREE.Vector3(-3.5, 4.5, -7.5),
            new THREE.Vector3(0.8, 5.2, -8.5),
            new THREE.Vector3(2.8, 3.8, -5.0)
        ]
    ];
    batRoutes.forEach((waypoints, i) => {
        const bat = new THREE.Group();
        bat.name = `bat_${i}`;
        const body = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), batMaterial);
        body.scale.set(0.028, 0.022, 0.045);
        bat.add(body);
        // Perky little ears, the silhouette that says bat and not bird
        [-1, 1].forEach((side) => {
            const ear = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.018, 4), batMaterial);
            ear.position.set(side * 0.01, 0.022, 0.028);
            bat.add(ear);
        });
        const wings = [];
        [-1, 1].forEach((side) => {
            const wing = new THREE.Mesh(wingGeometry, batMaterial);
            wing.scale.set(1, side, 0.35);      // mirrored, membrane-thin
            wing.rotation.z = side * Math.PI / 2;
            wing.position.set(side * 0.09, 0, -0.005);
            bat.add(wing);
            wings.push(wing);
        });
        bat.visible = false;
        const curve = new THREE.CatmullRomCurve3(waypoints, true, 'catmullrom', 0.8);
        const u = i * 0.5;
        curve.getPointAt(u, bat.position);
        gardenGroup.add(registerOutdoorProp(bat, 'bat'));
        bats.push({ group: bat, wings, curve, u, speed: 0.045 + i * 0.015, jink: Math.random() * Math.PI * 2 });
    });
}

// ============================================
// GAVIN AND HIS FRIENDS
// ============================================
/** Shaggy skater/surfer hair: one mop cap tilted back over the crown, a
 *  fringe hanging over the brow (above the eyes), tufts hanging down over
 *  the ears, and a shaggy nape at the back. Reads as one grown-out wavy
 *  mop rather than styled hair. Wear it over the rig's 'buzz' base style:
 *  the tight buzz cap tucks fully inside this mop and still covers the
 *  back of the head below its rim, where the 'short' style's raised dome
 *  pokes out through the top of the mop like a bowl. */
function applyShaggyHair(person, hairColor) {
    const shag = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.95, metalness: 0.0 });
    const headY = 1.5;    // the rig's head center (legs + torso + neck + radius)

    // The mop: a hemisphere cap slightly larger than the head, tilted back
    // so the front edge rides the brow and the back edge drops to the nape.
    const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.131, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.52),
        shag
    );
    cap.position.set(0, headY + 0.005, -0.01);
    cap.rotation.x = -0.28;
    person.add(cap);

    // The fringe: a soft bar of hair hanging over the brow, clear of the eyes
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.025), shag);
    fringe.position.set(0, headY + 0.055, 0.1);
    fringe.rotation.x = -0.15;
    person.add(fringe);

    // Tufts hanging flat over the ears (covering them, not bunned up)
    [-1, 1].forEach((side) => {
        const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), shag);
        tuft.position.set(side * 0.104, headY - 0.02, -0.005);
        tuft.scale.set(0.55, 1.15, 0.95);
        person.add(tuft);
    });

    // The shaggy nape trailing down the back of the neck
    const nape = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), shag);
    nape.position.set(0, headY - 0.035, -0.078);
    nape.scale.set(1.35, 1.0, 0.55);
    person.add(nape);
}

function createKids() {
    const K = LAYOUT.kids;

    // Gavin: tan skin, dark brown eyes, wavy dark brown hair over the ears,
    // and a ladybug-red t-shirt (the uniform of the patrol's founder).
    const gavin = createPerson({
        role: 'customer',
        x: 0, z: 0, rotationY: 0,
        shirtColor: 0xb03528,
        pantsColor: 0x3a5a80,
        skinTone: 0xd7a678,
        hairColor: 0x2e2013,
        eyeColor: 0x2c1810,
        hairStyle: 'buzz'    // the mop's base layer; see applyShaggyHair
    });
    applyShaggyHair(gavin, 0x2e2013);
    placeKid(gavin, K.gavin, { phase: 0, kind: 'gavin' });

    // Friend on the left: buzz cut, a sunny yellow tee, and the pointing
    // arm. Somebody just spotted a ladybug.
    const friendLeft = createPerson({
        role: 'customer',
        x: 0, z: 0, rotationY: 0,
        shirtColor: 0xd9a520,
        pantsColor: 0x2c3e50,
        skinTone: 0x8d5a3b,
        hairColor: 0x1b1410,
        eyeColor: 0x1d130c,
        hairStyle: 'buzz'
    });
    const pointArm = poseKidPointing(friendLeft);
    placeKid(friendLeft, K.left, { phase: 2.1, pointArm, kind: 'friendLeft' });

    // Friend on the right: sandy hair, a green tee, leaning in close.
    const friendRight = createPerson({
        role: 'customer',
        x: 0, z: 0, rotationY: 0,
        shirtColor: 0x3f7a52,
        pantsColor: 0x54452f,
        skinTone: 0xf0c8a0,
        hairColor: 0xa9834f,
        eyeColor: 0x4a3a20,
        hairStyle: 'short'
    });
    placeKid(friendRight, K.right, { phase: 4.4, kind: 'friendRight' });
}

/** Raise one arm to point into the foliage; returns the arm group so the
 *  update loop can give it a small excited waggle. */
function poseKidPointing(person) {
    let arm = null;
    person.children.forEach((group) => {
        if (group.isGroup && group.userData.isArm && group.position.x > 0) arm = group;
    });
    if (arm) {
        arm.rotation.x = -1.85;    // raised, pointing forward into the plant
        arm.rotation.z = -0.25;
    }
    return arm;
}

/** Scale a rig figure down to eleven-year-old height, stand them at their
 *  spot facing the camera, lean them into the plant, and register them
 *  for the idle searching sway. */
function placeKid(person, spot, extra) {
    person.scale.setScalar(spot.scale);
    // The rig's shoe soles sit 5 cm below the person origin (scaled here).
    person.position.set(spot.x, 0.05 * spot.scale + spot.lift, spot.z);
    // The rig faces positive Z (the camera); spot.yaw turns the friends
    // slightly inward toward the plant they are searching.
    person.rotation.y = spot.yaw || 0;
    const baseLean = 0.14;             // leaning in over the planter
    person.rotation.x = baseLean;
    person.castShadow = true;
    if (extra.kind) registerOutdoorProp(person, extra.kind);
    gardenGroup.add(person);
    kids.push({
        group: person,
        baseYaw: spot.yaw || 0,
        baseLean,
        phase: extra.phase || 0,
        pointArm: extra.pointArm || null
    });
}

// ============================================
// PER-FRAME UPDATE
// ============================================
let _t = 0;                             // garden clock, seconds
const _pos = new THREE.Vector3();       // scratch vectors, reused every frame
const _ahead = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Advance the garden one frame: the plant sways, the ladybugs patrol (with
 * believable little stops), the mantises scan in slow motion, the ants
 * march, the spider bobs on her web, the bees commute with fluttering
 * wings, and the kids lean and peer, searching the leaves. Everything
 * holds still under prefers-reduced-motion. Driven by main.js's loop.
 */
export function updateGarden(deltaTime) {
    if (_reducedMotion.matches) return;
    _t += deltaTime;

    // The whole jasmine rocks gently from its base, like a light breeze
    if (plantGroup) {
        plantGroup.rotation.z = Math.sin(_t * 0.5) * 0.018;
        plantGroup.rotation.x = Math.sin(_t * 0.37 + 1.3) * 0.011;
    }

    // ---- The shift change ----
    // The shared sky says how dark it is (0 day .. 1 night). The day crew
    // (ladybugs, ants, bees) turns in after dusk; the night crew (fireflies,
    // snails, slugs) comes out. Mantises and the spider work both shifts.
    const nightFactor = getNightFactor();
    const isNight = nightFactor > NIGHT_SWAP;
    ladybugs.forEach((bug) => { bug.mesh.visible = !isNight; });
    ants.forEach((ant) => { ant.mesh.visible = !isNight; });
    bees.forEach((bee) => { bee.group.visible = !isNight; });
    fireflies.forEach((fly) => { fly.mesh.visible = isNight; });
    snails.forEach((snail) => { snail.mesh.visible = isNight; });
    slugs.forEach((slug) => { slug.mesh.visible = isNight; });
    bats.forEach((bat) => { bat.group.visible = isNight; });

    // Solar lights fade up with the dark, like the real ones on the patio
    solarLights.forEach(({ light, headMaterial }) => {
        light.intensity = nightFactor * 1.1;
        headMaterial.emissiveIntensity = nightFactor * 1.5;
    });

    if (isNight) {
        // Fireflies drift and blink on their own clocks
        fireflies.forEach((fly) => {
            fly.mesh.position.set(
                fly.base.x + Math.sin(_t * 0.3 + fly.p1) * 0.5,
                fly.base.y + Math.sin(_t * 0.23 + fly.p2) * 0.3,
                fly.base.z + Math.cos(_t * 0.27 + fly.p3) * 0.5
            );
            const pulse = Math.max(0, Math.sin(_t * 1.7 + fly.blink));
            fly.material.opacity = nightFactor * pulse * pulse * pulse;
        });

        // Snails inch along the rim highway the ants used all day
        snails.forEach((snail) => {
            snail.offset = (snail.offset + snail.speed * deltaTime) % 1;
            antCurve.getPointAt(snail.offset, _pos);
            snail.mesh.position.copy(_pos);
            antCurve.getPointAt((snail.offset + 0.01) % 1, _ahead);
            snail.mesh.lookAt(_ahead);
        });

        // Slugs work their slow patrols on the pavers
        slugs.forEach((slug) => {
            slug.offset = (slug.offset + slug.speed * deltaTime) % 1;
            slug.curve.getPointAt(slug.offset, _pos);
            slug.mesh.position.copy(_pos);
            slug.curve.getPointAt((slug.offset + 0.02) % 1, _ahead);
            slug.mesh.lookAt(_ahead);
        });

        // Bats sweep their hunting loops with a nervous jink, wings
        // beating hard: nothing else in the scene moves like they do
        bats.forEach((bat) => {
            bat.u = (bat.u + bat.speed * deltaTime) % 1;
            bat.curve.getPointAt(bat.u, _pos);
            _pos.y += Math.sin(_t * 5.2 + bat.jink) * 0.25;
            _pos.x += Math.sin(_t * 3.7 + bat.jink * 2) * 0.15;
            bat.group.position.copy(_pos);
            bat.curve.getPointAt((bat.u + 0.015) % 1, _ahead);
            _ahead.y += Math.sin(_t * 5.2 + bat.jink) * 0.25;
            bat.group.lookAt(_ahead);
            const flap = Math.sin(_t * 16 + bat.jink) * 0.75;
            bat.wings[0].rotation.z = Math.PI / 2 + flap;
            bat.wings[1].rotation.z = -Math.PI / 2 - flap;
        });
    }

    // Ladybugs: walk their vine out and back, stopping now and then, the
    // way real ones do. Hidden after dark (the night shift takes over).
    ladybugs.forEach((bug) => {
        if (!bug.mesh.visible) return;
        if (bug.pause > 0) {
            bug.pause -= deltaTime;
        } else {
            bug.t += bug.dir * bug.speed * deltaTime;
            if (bug.t >= LADYBUG_T_MAX) { bug.t = LADYBUG_T_MAX; bug.dir = -1; }
            if (bug.t <= LADYBUG_T_MIN) { bug.t = LADYBUG_T_MIN; bug.dir = 1; }
            bug.walkFor -= deltaTime;
            if (bug.walkFor <= 0) {
                bug.pause = 1 + Math.random() * 2.5;
                bug.walkFor = 4 + Math.random() * 6;
            }
            bug.curve.getPoint(bug.t, _pos);
            bug.mesh.position.copy(_pos);
            // Face along the walk
            bug.curve.getPoint(Math.min(LADYBUG_T_MAX, Math.max(LADYBUG_T_MIN, bug.t + bug.dir * 0.03)), _ahead);
            bug.mesh.lookAt(_ahead.applyMatrix4(plantGroup.matrixWorld));
        }
    });

    // Mantises: heads scan in extreme slow motion, forearms breathe. A
    // just-spotted mantis celebrates: rears up and waves both forearms.
    mantises.forEach((m) => {
        m.head.rotation.y = Math.sin(_t * 0.22 + m.phase) * 0.55;
        m.head.rotation.z = Math.sin(_t * 0.13 + m.phase * 2) * 0.12;
        if (m.celebrate > 0) {
            m.celebrate -= deltaTime;
            const wave = Math.sin(_t * 14) * 0.5;
            m.arms.forEach((arm, i) => { arm.rotation.x = -1.5 + wave * (i ? 1 : -1); });
        } else {
            const armBreath = Math.sin(_t * 0.8 + m.phase) * 0.04;
            m.arms.forEach((arm, i) => { arm.rotation.x = -0.7 + armBreath * (i ? 1 : -1); });
        }
    });

    // Ants: steady single file around the loop (day shift only)
    ants.forEach((ant) => {
        if (!ant.mesh.visible) return;
        const u = (_t * 0.012 + ant.offset) % 1;
        antCurve.getPointAt(u, _pos);
        ant.mesh.position.copy(_pos);
        antCurve.getPointAt((u + 0.005) % 1, _ahead);
        ant.mesh.lookAt(_ahead);
    });

    // The spider bobs almost imperceptibly at her hub
    if (spider) {
        spider.mesh.position.y = spider.baseY + Math.sin(_t * 1.1 + spider.phase) * 0.004;
    }

    // Bees: fly the commute, flutter the wings, bob a little (day shift only)
    bees.forEach((bee) => {
        if (!bee.group.visible) return;
        bee.u = (bee.u + bee.speed * deltaTime) % 1;
        bee.curve.getPointAt(bee.u, _pos);
        _pos.y += Math.sin(_t * 9 + bee.phase) * 0.012;   // hover wobble
        bee.group.position.copy(_pos);
        bee.curve.getPointAt((bee.u + 0.01) % 1, _ahead);
        _ahead.y += Math.sin(_t * 9 + bee.phase) * 0.012;
        bee.group.lookAt(_ahead);
        const flutter = Math.sin(_t * 55 + bee.phase) * 0.7;
        bee.wings[0].rotation.z = 0.5 + flutter;
        bee.wings[1].rotation.z = -0.5 - flutter;
    });

    // The kids sway and lean, searching the leaves the way they really do
    kids.forEach((kid) => {
        kid.group.rotation.y = kid.baseYaw + Math.sin(_t * 0.4 + kid.phase) * 0.1;
        kid.group.rotation.x = kid.baseLean + Math.sin(_t * 0.27 + kid.phase * 1.7) * 0.03;
        if (kid.pointArm) {
            // The pointing arm waggles with eleven-year-old certainty
            kid.pointArm.rotation.x = -1.85 + Math.sin(_t * 2.2) * 0.08;
        }
    });
}

/** The root garden group (exposed for tests and future passes). */
export function getGardenGroup() {
    return gardenGroup;
}

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = { LAYOUT, PALETTE, inPeekWindow, canopyRadiusAt };
