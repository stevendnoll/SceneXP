// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * forest.js - The wood around the clearing, and what grows under it.
 *
 * Split the usual way: where things go is pure arithmetic and fully testable,
 * and what they are made of touches THREE and does no arithmetic worth
 * asserting.
 *
 * ---- THE SHAPE OF THE CLEARING IS ONE FUNCTION ----
 *
 * `forestDensityAt(x, z)` answers "how thick is the wood here", from 0 on the
 * plot to 1 deep in the belt. Everything outside the wall is scattered against
 * it: trees, bushes, flowers. That means the shape of the clearing is stated
 * ONCE and cannot drift between the systems that fill it, and it means the
 * shape can be tested without drawing anything.
 *
 * ---- WHY THE FAR WOOD IS FLAT ----
 *
 * The far forest is instanced crossed quads, not fractal trees, and that is a
 * measurement rather than a preference. At 40 m a tree covers roughly 60
 * pixels; a real one is 3,000 triangles, which is fifty triangles per pixel,
 * and 120 of them would be 360k against a whole-scene budget of 400k.
 *
 * The reason it gets away with it: THIS CAMERA IS FIXED. Impostors betray
 * themselves when a viewer moves around them and ours only pans a little, so
 * the usual objection does not apply. The near treeline is real geometry
 * precisely because that is the distance where the eye would notice.
 *
 * ---- WINTER, WITHOUT A SECOND MESH ----
 *
 * The deciduous wood goes bare by RAISING `alphaTest` rather than by swapping
 * or cross-fading meshes. The canopy texture is drawn with opaque branches and
 * softer leaves, so lifting the threshold erodes the leaves first and leaves
 * the branch structure standing. One material, one draw call, and no
 * transparency sorting to get wrong.
 */

import { GARDEN_CONFIG } from './config.min.js';
import { makeRandom, resolveSpecies, SPECIES, speciesById } from './species.min.js';
import { phenologyAt, seasonAt, clamp01 } from './clock.min.js';
import { mixColor, packColor, unpackColor } from './sky.min.js';
import { buildSkeleton, bakeGeometry } from './tree.min.js';
import { worldHeightAt } from './terrain.min.js';

// ---- The shape of the clearing (pure) --------------------------------------

/**
 * How wide the northern opening is at a given depth.
 *
 * It widens as it goes, so the view funnels outward instead of running down a
 * corridor. Zero south of the opening's start, because the wood closes behind
 * the plot.
 */
export function openingHalfWidthAt(z, clearing = GARDEN_CONFIG.world.clearing) {
    if (z > clearing.openFromZ) return 0;
    const depth = clearing.openFromZ - z;
    return clearing.openHalfWidth + depth * clearing.openSpread;
}

/**
 * How thick the wood is at a point, 0 to 1.
 *
 * THE ONE STATEMENT OF THE CLEARING'S SHAPE. Trees, bushes and flowers are all
 * scattered against this, so they cannot disagree about where the wood is.
 */
export function forestDensityAt(x, z, config = GARDEN_CONFIG) {
    const C = config.world.clearing;

    // Nothing grows past the drawn edge of the world.
    const radius = Math.hypot(x, z);
    if (radius > C.outerRadius) return 0;

    // The clearing itself, measured the same square way the plot's own edge
    // damp is, so the belt follows the walls rather than a circle drawn
    // through their corners.
    const square = Math.max(Math.abs(x), Math.abs(z));
    if (square <= C.innerRadius) return 0;

    // The northern opening.
    if (z < C.openFromZ && Math.abs(x) < openingHalfWidthAt(z, C)) return 0;

    // Ramp in from the clearing edge. A hard edge reads as a hedge.
    const t = clamp01((square - C.innerRadius) / C.rampWidth);
    const ramp = t * t * (3 - 2 * t);

    // And soften the sides of the opening the same way, so the gap has edges
    // rather than a cut.
    if (z < C.openFromZ) {
        const gap = openingHalfWidthAt(z, C);
        const into = clamp01((Math.abs(x) - gap) / (C.rampWidth * 0.8));
        return ramp * (into * into * (3 - 2 * into));
    }

    return ramp;
}

/**
 * Scatter points across the wood on a jittered grid.
 *
 * A jittered grid rather than free random placement, because free placement
 * clumps: it leaves bald patches and piles three trees in one spot, and a wood
 * with bald patches reads as a mistake. One candidate per cell, nudged, kept
 * with probability equal to the density there.
 *
 * Pure and seeded, so the wood is the same wood on every visit.
 */
export function scatter(spacing, jitter, seed, accept, config = GARDEN_CONFIG) {
    const C = config.world.clearing;
    const random = makeRandom(seed);
    const out = [];
    const reach = C.outerRadius;

    for (let gx = -reach; gx <= reach; gx += spacing) {
        for (let gz = -reach; gz <= reach; gz += spacing) {
            const x = gx + (random() - 0.5) * spacing * 2 * jitter;
            const z = gz + (random() - 0.5) * spacing * 2 * jitter;
            const density = forestDensityAt(x, z, config);
            if (density <= 0) { random(); continue; }
            if (random() > density) continue;
            const point = { x, z, density, r1: random(), r2: random(), r3: random() };
            if (!accept || accept(point)) out.push(point);
        }
    }
    return out;
}

// ---- Seasonal colour (pure) ------------------------------------------------

/**
 * The colour the whole wood wears at an hour.
 *
 * THE SURROUNDINGS TURN WITH THE SEASONS OR THE ILLUSION COLLAPSES. A wood
 * that stays summer green while the plot goes scarlet does not read as a
 * background, it reads as a stage set with the garden painted on it. So this
 * reads the same `phenologyAt` the planted trees do, and everything outside
 * the wall is tinted from it.
 */
export function forestColorAt(hour, evergreen = false, config = GARDEN_CONFIG) {
    const phen = phenologyAt(hour, evergreen, config.season);
    const spring = 0x7d9e4e;
    const summer = 0x466b31;
    const autumn = 0x9a6a2c;
    const evergreenColor = 0x3f5c3c;

    if (evergreen) {
        // A conifer wood dulls and cools in the cold rather than turning.
        return packColor(mixColor(evergreenColor, 0x4a5c58, phen.color));
    }
    let colour = packColor(mixColor(summer, autumn, phen.color));
    if (phen.color <= 0) colour = packColor(mixColor(colour, spring, clamp01(1 - phen.leaf)));
    return colour;
}

/** How bare the deciduous wood is, 0 in full leaf and 1 stripped. Drives the
 *  alphaTest erosion rather than an opacity fade. */
export function barenessAt(hour, config = GARDEN_CONFIG) {
    return clamp01(phenologyAt(hour, false, config.season).drop);
}

// ---- The canopy texture ----------------------------------------------------

/**
 * A canopy silhouette, drawn once into a canvas.
 *
 * WHITE, so the material's colour can tint it to whatever the season says.
 * The alpha is what carries the shape, and it is deliberately layered:
 * branches at full opacity, leaves softer. That is what lets `alphaTest` strip
 * the leaves for winter and leave the branches behind.
 */
function buildCanopyTexture(size, seed, evergreen) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const random = makeRandom(seed);

    ctx.clearRect(0, 0, size, size);
    const mid = size / 2;

    // Trunk and main limbs, fully opaque so they survive any threshold.
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineCap = 'round';
    ctx.lineWidth = size * 0.045;
    ctx.beginPath();
    ctx.moveTo(mid, size);
    ctx.lineTo(mid + (random() - 0.5) * size * 0.05, size * 0.42);
    ctx.stroke();

    ctx.lineWidth = size * 0.022;
    for (let i = 0; i < 5; i++) {
        const y = size * (0.66 - i * 0.09);
        const side = i % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(mid, y);
        ctx.lineTo(mid + side * size * (0.10 + random() * 0.13), y - size * (0.08 + random() * 0.08));
        ctx.stroke();
    }

    // Foliage. Softer alpha, so raising the threshold takes it away first.
    const blobs = evergreen ? 26 : 34;
    for (let i = 0; i < blobs; i++) {
        const t = i / blobs;
        let cx, cy, r;
        if (evergreen) {
            // A cone: narrow at the top, wide at the base.
            cy = size * (0.10 + t * 0.62);
            const spread = size * (0.05 + t * 0.24);
            cx = mid + (random() - 0.5) * spread * 2;
            r = size * (0.05 + random() * 0.05);
        } else {
            // A rounded crown sitting above a bare lower trunk.
            const a = random() * Math.PI * 2;
            const rr = Math.sqrt(random());
            cx = mid + Math.cos(a) * rr * size * 0.34;
            cy = size * 0.34 + Math.sin(a) * rr * size * 0.26;
            r = size * (0.06 + random() * 0.07);
        }
        ctx.fillStyle = `rgba(255,255,255,${0.42 + random() * 0.26})`;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/** Two quads crossed at right angles: volume from any angle for four
 *  triangles, anchored at the base so the tree stands on the ground. */
function buildCrossedQuad() {
    const geo = new THREE.BufferGeometry();
    const h = 0.5;
    const position = new Float32Array([
        -h, 0, 0, h, 0, 0, h, 1, 0, -h, 1, 0,
        0, 0, -h, 0, 0, h, 0, 1, h, 0, 1, -h
    ]);
    const normal = new Float32Array([
        0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
        1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0
    ]);
    const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]);
    const index = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    return geo;
}

// ---- Imperative side -------------------------------------------------------

let sceneRef = null;
let deciduous = null;
let evergreen = null;
let nearTrees = [];
let bushes = null;
let flowers = null;
let flowerPlacements = [];
let lastBloom = -1;
const disposables = [];

function buildFarTier(points, isEvergreen, config, seedOffset) {
    const F = config.world.farForest;
    const texture = buildCanopyTexture(F.textureSize, config.world.seed + seedOffset, isEvergreen);
    const material = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        map: texture,
        transparent: false,
        alphaTest: F.leafyAlphaTest,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.InstancedMesh(buildCrossedQuad(), material, Math.max(1, points.length));
    mesh.name = isEvergreen ? 'forest-evergreen' : 'forest-deciduous';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // The bounding sphere is computed from one unit quad, so the wood would
    // vanish the moment its origin left the frustum.
    mesh.frustumCulled = false;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const colour = new THREE.Color();

    points.forEach((point, i) => {
        const height = F.minHeight + point.r1 * (F.maxHeight - F.minHeight);
        const width = height * (isEvergreen ? 0.46 : 0.78) * (0.85 + point.r2 * 0.3);
        p.set(point.x, worldHeightAt(point.x, point.z), point.z);
        // A little yaw so the crossed quads do not all line up into rows.
        e.set(0, point.r3 * Math.PI, 0);
        q.setFromEuler(e);
        s.set(width, height, width);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
        // Per-tree variation for free: three multiplies this by the material
        // colour, so the season sets the hue and this sets the individual.
        const shade = 0.82 + point.r2 * 0.34;
        colour.setRGB(shade, shade * (0.96 + point.r1 * 0.08), shade * 0.94);
        mesh.setColorAt(i, colour);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    disposables.push(mesh.geometry, material, texture);
    return mesh;
}

/**
 * Build the wood.
 *
 * @param {THREE.Scene} scene
 * @param {object} options { mobile }
 */
export function initForest(scene, config = GARDEN_CONFIG, options = {}) {
    sceneRef = scene;
    const W = config.world;
    const F = W.farForest;
    const spacing = options.mobile ? F.spacingMobile : F.spacing;

    const points = scatter(spacing, F.jitter, W.seed, null, config);
    // Split the wood rather than tagging it: an evergreen keeps its needles
    // and a deciduous does not, and one material cannot do both.
    const evergreenPoints = points.filter((p) => p.r1 < F.evergreenShare);
    const deciduousPoints = points.filter((p) => p.r1 >= F.evergreenShare);

    evergreen = buildFarTier(evergreenPoints, true, config, 11);
    deciduous = buildFarTier(deciduousPoints, false, config, 29);
    scene.add(evergreen);
    scene.add(deciduous);

    buildNearTreeline(scene, config, options);
    buildUndergrowth(scene, config, options);

    return {
        far: { evergreen, deciduous },
        counts: {
            evergreen: evergreenPoints.length,
            deciduous: deciduousPoints.length,
            near: nearTrees.length,
            bushes: bushes ? bushes.count : 0,
            flowers: flowers ? flowers.count : 0
        }
    };
}

/**
 * The near treeline: real fractal trees, at reduced recursion.
 *
 * THIS IS THE TIER THAT HIDES THE OTHER ONE. A wood made only of impostors
 * starts abruptly at whatever distance the eye can still resolve a flat quad.
 * A handful of real silhouettes in front of it means the flat ones are never
 * the nearest thing, which is the whole trick.
 *
 * A few distinct skeletons, each instanced, so sixteen trees cost five draw
 * calls rather than sixteen.
 */
function buildNearTreeline(scene, config, options) {
    const N = config.world.nearTreeline;
    const count = options.mobile ? N.countMobile : N.count;
    const random = makeRandom(config.world.seed ^ 0x51DE);

    // Species that suit a wild wood rather than a planted garden.
    const wild = ['bur-oak', 'paper-birch', 'scots-pine', 'blue-spruce', 'copper-beech']
        .map((id) => speciesById(id)).filter(Boolean);

    const placed = [];
    let guard = 0;
    while (placed.length < count && guard++ < count * 60) {
        const angle = random() * Math.PI * 2;
        const radius = N.minRadius + random() * (N.maxRadius - N.minRadius);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        if (forestDensityAt(x, z, config) < 0.35) continue;
        if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 4.5)) continue;
        placed.push({ x, z, pick: Math.floor(random() * wild.length), r: random() });
    }

    // One baked geometry per species, shared by every instance of it.
    const geometries = wild.map((species, i) => {
        const resolved = resolveSpecies(species.id, undefined);
        // Reduced recursion: at 25 m the last two orders of twig are invisible
        // and cost most of the triangles.
        resolved.depth = Math.max(4, resolved.depth - config.world.nearTreeline.depthReduction);
        const skeleton = buildSkeleton(resolved, config.world.seed + i * 7919, {
            maxSegments: Math.round(config.tree.maxSegments * 0.45)
        });
        return { geometry: bakeGeometry(skeleton), species, resolved, skeleton };
    });

    nearTrees = geometries.map((entry, i) => {
        const mine = placed.filter((p) => p.pick === i);
        const material = new THREE.MeshLambertMaterial({ color: entry.species.bark });
        const mesh = new THREE.InstancedMesh(entry.geometry, material, Math.max(1, mine.length));
        mesh.name = `treeline-${entry.species.id}`;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;

        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const e = new THREE.Euler();
        const p = new THREE.Vector3();
        const s = new THREE.Vector3();
        mine.forEach((point, j) => {
            const scale = N.minScale + point.r * (N.maxScale - N.minScale);
            p.set(point.x, worldHeightAt(point.x, point.z), point.z);
            e.set(0, point.r * Math.PI * 2, 0);
            q.setFromEuler(e);
            s.setScalar(scale);
            m.compose(p, q, s);
            mesh.setMatrixAt(j, m);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.count = mine.length;

        disposables.push(entry.geometry, material);
        scene.add(mesh);
        return { mesh, species: entry.species, resolved: entry.resolved, count: mine.length };
    });
}

/**
 * Bushes and wildflowers along the wall.
 *
 * WHAT STOPS THE WALL LOOKING DROPPED ONTO A LAWN. A mown plot with a hard
 * stone edge and then trees is a diagram; a plot with scrub and flowers
 * spilling around its outside is a place. These sit in the band between the
 * wall and the treeline, which is exactly the strip the eye travels through on
 * the way out of the garden.
 *
 * Two instanced meshes, both scattered against the same `forestDensityAt` the
 * trees use, so nothing grows where the clearing says it should not.
 */
function buildUndergrowth(scene, config, options) {
    const U = config.world.undergrowth;
    const bushCount = options.mobile ? U.bushesMobile : U.bushes;
    const flowerCount = options.mobile ? U.flowersMobile : U.flowers;

    // ---- Bushes: a squashed sphere, low-poly, instanced ---------------------
    const bushGeo = new THREE.SphereGeometry(1, 6, 4);
    bushGeo.scale(1, 0.68, 1);
    const bushMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
    bushes = new THREE.InstancedMesh(bushGeo, bushMaterial, Math.max(1, bushCount));
    bushes.name = 'undergrowth';
    bushes.receiveShadow = true;
    bushes.frustumCulled = false;

    const random = makeRandom(config.world.seed ^ 0xB0581);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const colour = new THREE.Color();

    let placed = 0;
    let guard = 0;
    while (placed < bushCount && guard++ < bushCount * 40) {
        const angle = random() * Math.PI * 2;
        const radius = U.bushRadius.min + random() * (U.bushRadius.max - U.bushRadius.min);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        // Just outside the wall the density is still near zero, so bushes are
        // allowed a little closer in than trees are.
        const square = Math.max(Math.abs(x), Math.abs(z));
        if (square < config.plot.halfSize + 1) continue;
        const size = 0.5 + random() * 1.1;
        p.set(x, worldHeightAt(x, z) + size * 0.34, z);
        e.set(0, random() * Math.PI, 0);
        q.setFromEuler(e);
        s.set(size * (0.8 + random() * 0.5), size, size * (0.8 + random() * 0.5));
        m.compose(p, q, s);
        bushes.setMatrixAt(placed, m);
        const shade = 0.78 + random() * 0.4;
        colour.setRGB(shade, shade, shade * 0.92);
        bushes.setColorAt(placed, colour);
        placed++;
    }
    bushes.count = placed;
    bushes.instanceMatrix.needsUpdate = true;
    if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
    scene.add(bushes);
    disposables.push(bushGeo, bushMaterial);

    // ---- Flowers: crossed quads again, tiny, coloured per plant -------------
    // THEY BLOOM AND GO OVER. `updateForest` scales them to nothing outside
    // spring and summer, so a winter meadow is bare rather than dotted with
    // colour that has no business being there.
    const flowerGeo = buildCrossedQuad();
    const flowerMaterial = new THREE.MeshLambertMaterial({
        color: 0xffffff, side: THREE.DoubleSide
    });
    flowers = new THREE.InstancedMesh(flowerGeo, flowerMaterial, Math.max(1, flowerCount));
    flowers.name = 'wildflowers';
    flowers.frustumCulled = false;

    flowerPlacements = [];
    guard = 0;
    while (flowerPlacements.length < flowerCount && guard++ < flowerCount * 40) {
        const angle = random() * Math.PI * 2;
        const radius = U.flowerRadius.min + random() * (U.flowerRadius.max - U.flowerRadius.min);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const square = Math.max(Math.abs(x), Math.abs(z));
        if (square < config.plot.halfSize + 0.6) continue;
        flowerPlacements.push({
            x, z,
            y: worldHeightAt(x, z),
            size: 0.22 + random() * 0.22,
            yaw: random() * Math.PI,
            hue: U.palette[Math.floor(random() * U.palette.length)]
        });
    }
    flowerPlacements.forEach((flower, i) => {
        colour.setHex(flower.hue);
        flowers.setColorAt(i, colour);
    });
    flowers.count = flowerPlacements.length;
    if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
    scene.add(flowers);
    disposables.push(flowerGeo, flowerMaterial);
}

/** Rewrite the flower transforms for a bloom level, 0 gone and 1 full. */
function setFlowerBloom(bloom) {
    if (!flowers || !flowerPlacements.length) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    flowerPlacements.forEach((flower, i) => {
        const size = flower.size * bloom;
        p.set(flower.x, flower.y, flower.z);
        e.set(0, flower.yaw, 0);
        q.setFromEuler(e);
        s.set(size, size, size);
        m.compose(p, q, s);
        flowers.setMatrixAt(i, m);
    });
    flowers.instanceMatrix.needsUpdate = true;
}

/**
 * How far the wildflowers are out, 0 to 1.
 *
 * Pure, so the bloom can be asserted against the calendar rather than watched.
 * They come with the spring leaves and are gone by the time the canopy turns,
 * which is roughly what a woodland edge actually does.
 */
export function bloomAt(hour, config = GARDEN_CONFIG) {
    const phen = phenologyAt(hour, false, config.season);
    // In leaf and not yet turning.
    return clamp01(phen.leaf) * clamp01(1 - phen.color);
}

/**
 * Turn the wood with the year. Two colour writes and a threshold.
 *
 * @param {number} hour
 * @param {number} snowCoverage
 */
export function updateForest(hour, snowCoverage = 0, config = GARDEN_CONFIG) {
    if (!deciduous) return;
    const F = config.world.farForest;
    const snow = clamp01(snowCoverage);
    const snowColor = config.terrain.snowColor;

    const decColour = packColor(mixColor(forestColorAt(hour, false, config), snowColor, snow * 0.55));
    const evgColour = packColor(mixColor(forestColorAt(hour, true, config), snowColor, snow * 0.4));
    deciduous.material.color.setHex(decColour);
    evergreen.material.color.setHex(evgColour);

    // The canopy erodes rather than fading. See the note at the top of the
    // file: opaque branches survive the threshold, softer leaves do not.
    const bare = barenessAt(hour, config);
    deciduous.material.alphaTest = F.leafyAlphaTest + (F.bareAlphaTest - F.leafyAlphaTest) * bare;

    for (const tree of nearTrees) {
        tree.mesh.material.color.setHex(
            packColor(mixColor(tree.species.bark, snowColor, snow * 0.35)));
    }

    // Scrub follows the deciduous wood, and takes snow more heavily because it
    // is low and the snow lies on top of it rather than sliding off.
    if (bushes) {
        bushes.material.color.setHex(
            packColor(mixColor(forestColorAt(hour, false, config), snowColor, snow * 0.8)));
    }

    // THE FLOWERS ARE REBUILT ONLY WHEN THE BLOOM ACTUALLY MOVES. Rewriting
    // nine hundred instance matrices every frame would be the most expensive
    // thing in the scene, for a value that changes over minutes.
    if (flowers) {
        const bloom = bloomAt(hour, config) * (1 - snow);
        if (Math.abs(bloom - lastBloom) > 0.01) {
            lastBloom = bloom;
            setFlowerBloom(bloom);
        }
        flowers.visible = bloom > 0.02;
    }
}

export function getForestMeshes() {
    return [evergreen, deciduous, bushes, flowers,
        ...nearTrees.map((t) => t.mesh)].filter(Boolean);
}

export function disposeForest() {
    for (const mesh of getForestMeshes()) {
        if (sceneRef) sceneRef.remove(mesh);
    }
    for (const item of disposables) {
        if (item && typeof item.dispose === 'function') item.dispose();
    }
    disposables.length = 0;
    deciduous = null;
    evergreen = null;
    bushes = null;
    flowers = null;
    flowerPlacements = [];
    lastBloom = -1;
    nearTrees = [];
    sceneRef = null;
}
