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
import { buildSkeleton, bakeGeometry, buildLeaves, leafClusterTexture, patchVertex } from './tree.min.js';
import { worldHeightAt, openingHalfWidthAt } from './terrain.min.js';
// One statement of where the eye can go, read rather than copied. view.js
// depends on nothing but the config and the clock, so there is no cycle.
import { dollyTrackZ } from './view.min.js';

// THE CLEARING'S OPENING LIVES IN terrain.js and is re-exported here, which is
// where everybody looks for it and where it was defined until the lake needed
// it too. `pondBasinAt` has to know how wide the gap is at the pond's own z, so
// the water can be derived from the opening rather than being a second number
// kept in step by hand, and terrain cannot import forest without a cycle.
export { openingHalfWidthAt };

// ---- The shape of the clearing (pure) --------------------------------------

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
 * Is this spot far enough from the eye to stand a tree in?
 *
 * THE CAMERA STANDS INSIDE THE NEAR TREELINE'S RING. The ring is measured from
 * the plot centre and the eye is at z = 22, so "17 to 38 metres from the middle
 * of the garden" includes the ground the visitor is standing on. A tree placed
 * there is not a distant tree that happens to be large, it is a tree the camera
 * is inside, and all the visitor sees is the underside of its branches spread
 * across the frame.
 *
 * Measured against the whole SEGMENT the eye can travel rather than against any
 * one point on it, because a portrait phone slides the eye back along +z and a
 * keep-out that only knew about the desktop framing would let a tree sit
 * exactly where a phone ends up.
 *
 * THE SEGMENT GREW WHEN THE ZOOM BECAME A DOLLY (M9-5), and this is the coupling
 * that was written down before it could bite. This used to read
 * `cameraKeepOut.dollyToZ` alone, z 22 to 39, because that was everywhere the
 * camera had ever been. The dolly track runs from inside the plot out to well
 * behind the composed viewpoint, so a rule that did not know about it would
 * leave trees standing where the eye can now go. `dollyTrackZ` in view.js is
 * the single statement of the track's ends and this reads it rather than
 * keeping a second copy of the numbers.
 *
 * Pure, so the rule can be asserted against the camera numbers instead of
 * spotted in a screenshot.
 */
export function clearsCamera(x, z, config = GARDEN_CONFIG, clearance = null) {
    const keep = config.world.nearTreeline.cameraKeepOut;
    if (!keep) return true;
    const want = clearance === null ? keep.clearance : clearance;
    // The composed z at the widest frame, plus the dolly's own two ends. The
    // portrait framing pushes the composed z further back than this on a tall
    // window, and `dollyTrackZ` clamps to it, so `dollyToZ` is the backstop
    // for that rather than the whole story.
    const track = dollyTrackZ(Math.max(config.camera.position.z, keep.dollyToZ), config);
    const z0 = track.near;
    const z1 = track.far;
    // Horizontal distance to the segment the eye travels along.
    let distance;
    if (z < z0) distance = Math.hypot(x, z0 - z);
    else if (z > z1) distance = Math.hypot(x, z - z1);
    else distance = Math.abs(x);
    return distance >= want;
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
            // THE KEEP-OUT LIVES HERE, NOT AT THE CALL SITE. `scatter` already
            // had an `accept` hook for this and `initForest` passed null, so
            // the far wood was free to stand next to the camera and one of its
            // impostors filled the left fifth of the frame. A rule the caller
            // has to remember is a rule that gets forgotten.
            //
            // The far tier needs a WIDER berth than the near treeline, and the
            // reason is what they are made of: a fractal tree at 15 m is
            // see-through, while an impostor is a solid crossed quad and reads
            // as a wall. See farForest.minCameraDistance.
            if (!clearsCamera(x, z, config, config.world.farForest.minCameraDistance)) continue;
            // The flat tier starts where the real trees stop. Inside this it
            // would be doing middle-distance work it was never built for, which
            // is what made it read as a row of cut-outs.
            if (Math.hypot(x, z) < config.world.farForest.minRadius) continue;
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
    // Red, so the GREEN channel is 0 here and the shader can tell wood from
    // leaf. The alpha stays 1 so the branches survive the winter threshold.
    ctx.strokeStyle = 'rgba(255,0,0,1)';
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

/**
 * One blossom on a stem, drawn once.
 *
 * The quad is anchored at its base, so v runs from the ground up: stem in the
 * lower half, head in the upper. White, for the same reason everything else
 * here is white, so the per-plant colour does the work.
 */
function buildFlowerTexture(size, seed) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const random = makeRandom(seed);

    ctx.clearRect(0, 0, size, size);
    const mid = size / 2;
    // The stem. Thin, and dimmer than the head so the threshold takes it last.
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath();
    ctx.moveTo(mid, size);
    ctx.lineTo(mid, size * 0.42);
    ctx.stroke();

    // Petals round a centre, sitting at the top of the stem.
    ctx.fillStyle = 'rgba(255,255,255,1)';
    const petals = 5;
    const headY = size * 0.34;
    for (let i = 0; i < petals; i++) {
        const a = (i / petals) * Math.PI * 2 + random() * 0.2;
        ctx.beginPath();
        ctx.ellipse(mid + Math.cos(a) * size * 0.17, headY + Math.sin(a) * size * 0.17,
            size * 0.13, size * 0.10, a, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(mid, headY, size * 0.09, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Merge a skeleton's leaves into ONE geometry of camera-agnostic cards.
 *
 * The planted trees instance a single card per leaf, which cannot be reused
 * here: an InstancedMesh cannot itself be instanced, and the treeline needs one
 * draw call per species rather than one per tree. So the cards are baked into
 * the shared per-species geometry instead, and the whole canopy rides the tree's
 * own instance matrix.
 *
 * Sampled down to `leafCards`, because at 17 m and beyond the eye is reading a
 * silhouette and paying full canopy density for it would be the most expensive
 * thing outside the wall.
 */
function bakeLeafCards(leaves, limit, scale) {
    const stride = Math.max(1, Math.ceil(leaves.length / limit));
    const used = [];
    for (let i = 0; i < leaves.length; i += stride) used.push(leaves[i]);
    if (!used.length) return null;

    const position = new Float32Array(used.length * 12);
    const normal = new Float32Array(used.length * 12);
    const uv = new Float32Array(used.length * 8);
    // The same weight the bark bakes, so a leaf moves with the branch holding
    // it. Baked per VERTEX here rather than per instance, because unlike the
    // planted trees these cards live inside the shared geometry.
    const sway = new Float32Array(used.length * 4);
    // A flutter phase per card, so no two clumps in one tree beat together.
    const flutter = new Float32Array(used.length * 4);
    const index = new Uint32Array(used.length * 6);

    used.forEach((leaf, i) => {
        const s = leaf.size * scale * 0.5;
        const cy = Math.cos(leaf.yaw), sy = Math.sin(leaf.yaw);
        const cp = Math.cos(leaf.pitch), sp = Math.sin(leaf.pitch);
        // Card axes: right and up, rotated by yaw about Y then pitch about X.
        const rx = cy, ry = 0, rz = -sy;
        const ux = sy * sp, uy = cp, uz = cy * sp;
        // The face normal is right x up, which the lighting needs to be honest.
        const nx = ry * uz - rz * uy, ny = rz * ux - rx * uz, nz = rx * uy - ry * ux;

        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        corners.forEach(([cxs, cys], c) => {
            const o = i * 12 + c * 3;
            position[o] = leaf.x + (rx * cxs + ux * cys) * s;
            position[o + 1] = leaf.y + (ry * cxs + uy * cys) * s;
            position[o + 2] = leaf.z + (rz * cxs + uz * cys) * s;
            normal[o] = nx;
            normal[o + 1] = ny;
            normal[o + 2] = nz;
            uv[i * 8 + c * 2] = (cxs + 1) / 2;
            uv[i * 8 + c * 2 + 1] = (cys + 1) / 2;
            sway[i * 4 + c] = leaf.sway;
            flutter[i * 4 + c] = leaf.phase;
        });
        const v = i * 4;
        const o = i * 6;
        index[o] = v; index[o + 1] = v + 1; index[o + 2] = v + 2;
        index[o + 3] = v; index[o + 4] = v + 2; index[o + 5] = v + 3;
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
    geo.setAttribute('aFlutter', new THREE.BufferAttribute(flutter, 1));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    return { geometry: geo, cards: used.length };
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

// ---- The wood sways (M8-5) --------------------------------------------------

/**
 * The same displacement the planted trees use, on the wood outside the wall.
 *
 * ---- THE TRAP THIS IS BUILT AROUND ----
 *
 * INSTANCES SHARE ONE GEOMETRY, SO THEY SHARE ONE PHASE. The bark shader takes
 * its phase from vertex position in LOCAL space, which is correct for a single
 * tree and identical for every instance drawn from the same geometry. A hundred
 * trees would sway in perfect unison and read as one object breathing rather
 * than as a wood.
 *
 * `aTreePhase` is the fix: one offset per instance, added into the wave. It is
 * cheap, and what makes it worth this much comment is that **it is invisible in
 * a still frame**. Every screenshot of a lockstep wood looks perfect, so the
 * test is the gate here, not the picture.
 *
 * Note the displacement is added in LOCAL space, before the instance matrix, so
 * an instance scaled to 1.25 sways 1.25 times as far without being told to.
 */
const SWAY_HEAD = `
uniform vec3  uWind;
uniform float uTime;
uniform float uSwayScale;
uniform float uMotion;
uniform float uFlutterRate;
uniform float uFlutterAlong;
uniform float uFlutterCross;
attribute float aSway;
attribute float aTreePhase;
`;

// The bark carries no flutter phase, so its block stops at the sway. Declaring
// aFlutter on a geometry that does not have it is an attribute the driver
// quietly feeds zeros, which is worse than not asking.
const LEAF_SWAY_HEAD = SWAY_HEAD + `
attribute float aFlutter;
`;

const SWAY_BODY = `
    float woodWP = uTime * 1.35 + aTreePhase + transformed.y * 0.42;
    transformed += vec3(uWind.x, 0.0, uWind.z)
        * (sin(woodWP) * 0.62 + sin(woodWP * 1.73 + 1.3) * 0.38)
        * aSway * uSwayScale * uMotion;
`;

// The wood's canopy flutters on the same terms the garden's does, at its own
// rate and across the wind as well as along it. Two motions at one frequency
// read as one motion, in a wood exactly as on a planted tree.
const LEAF_SWAY_BODY = SWAY_BODY + `
    float woodLP = uTime * uFlutterRate + aFlutter;
    transformed += (vec3(uWind.x, 0.0, uWind.z) * sin(woodLP) * uFlutterAlong
        + vec3(-uWind.z, 0.0, uWind.x) * sin(woodLP * 1.37 + aFlutter * 2.1) * uFlutterCross)
        * uMotion;
`;

/** One phase per tree, seeded, so the wood is the same wood on every visit. */
function treePhases(count, seed) {
    const random = makeRandom(seed);
    const out = new Float32Array(Math.max(1, count));
    for (let i = 0; i < count; i++) out[i] = random() * Math.PI * 2;
    return out;
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
    // ONE MATERIAL COLOUR TINTED THE TRUNK AS WELL AS THE LEAVES, so the whole
    // impostor went green and the perimeter wood grew green trunks. The canopy
    // texture now marks wood in its GREEN channel (wood is drawn red, foliage
    // white), and the fragment mixes bark against season by that mask. The
    // alpha still carries the shape, so the winter alphaTest erosion is
    // untouched.
    const material = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        map: texture,
        transparent: false,
        alphaTest: F.leafyAlphaTest,
        side: THREE.DoubleSide
    });
    material.userData.season = { value: new THREE.Vector3(1, 1, 1) };
    material.userData.bark = { value: new THREE.Vector3(...unpackColor(F.barkColor)) };
    material.customProgramCacheKey = () => 'garden-canopy';
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uCanopySeason = material.userData.season;
        shader.uniforms.uCanopyBark = material.userData.bark;
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
uniform vec3 uCanopySeason;
uniform vec3 uCanopyBark;`)
            .replace('#include <map_fragment>', `#include <map_fragment>
    // The mask: 1 where the texture drew foliage, 0 where it drew wood.
    //
    // ASSIGNED, NOT MULTIPLIED, and the difference is the whole fix. The
    // texture's RGB is the MASK, not a colour: wood is drawn pure red so its
    // green channel reads 0. map_fragment has already multiplied that red
    // into diffuseColor, so multiplying again by the bark colour left
    // (bark.r, 0, 0) and the perimeter wood grew CRIMSON trunks, with red
    // slashes wherever a limb stuck out past the foliage. Overwriting throws
    // the mask's own colour away, which is what it was always for. The alpha
    // survives, so the winter alphaTest erosion is untouched, and the
    // per-instance shade still lands afterwards in color_fragment.
    float canopyLeaf = texture2D(map, vMapUv).g;
    diffuseColor.rgb = mix(uCanopyBark, uCanopySeason, canopyLeaf);`);
    };

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
            near: nearTrees.reduce((total, t) => total + t.count, 0),
            nearGroups: nearTrees.length,
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
    const mobile = !!options.mobile;

    // Species that suit a wild wood rather than a planted garden. Ordered, so
    // a tier that uses fewer of them uses the same first few every time.
    //
    // ALL FIVE ARE DECIDUOUS, ON PURPOSE. Scots Pine and Blue Spruce used to be
    // in here and they are genuinely evergreen, but they did not READ as
    // conifers: only the spruce is conical, both wear the same generic leaf
    // clump mask, and at a reduced recursion neither keeps the habit that would
    // tell you what it is. A wood of trees that are secretly evergreen is worse
    // than a wood that plainly is not, and a fully deciduous wood buys the
    // thing this scene is about: in winter it goes to bare branches, and bare
    // branches in a gust are the best the sway ever looks.
    //
    // The horizon still has conifers. The flat tier is 42 percent evergreen by
    // `farForest.evergreenShare`, which is where dark winter mass belongs.
    const wild = ['bur-oak', 'paper-birch', 'quaking-aspen', 'sugar-maple', 'copper-beech']
        .map((id) => speciesById(id)).filter(Boolean);

    nearTrees = [];
    N.tiers.forEach((tier, tierIndex) => {
        const count = mobile ? tier.countMobile : tier.count;
        const species = wild.slice(0, Math.min(tier.species, wild.length));
        // One generator per tier, seeded from the tier, so adding or resizing a
        // tier cannot reshuffle the ones beside it.
        const random = makeRandom(config.world.seed ^ (0x51DE + tierIndex * 0x9E37));

        const placed = [];
        let guard = 0;
        while (placed.length < count && guard++ < count * 80) {
            const angle = random() * Math.PI * 2;
            const radius = tier.minRadius + random() * (tier.maxRadius - tier.minRadius);
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            if (forestDensityAt(x, z, config) < 0.35) continue;
            // Never inside the eye's own clearance. See `clearsCamera`.
            if (!clearsCamera(x, z, config)) continue;
            // Spacing scales with the tier, because a wood that is sparse near
            // the eye and packed further out reads as a wall behind a lawn.
            const gap = 3.2 + tierIndex * 1.4;
            if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < gap)) continue;
            placed.push({ x, z, pick: Math.floor(random() * species.length), r: random() });
        }

        // One baked geometry per species PER TIER. Recursion is what costs and
        // distance is what hides it, so the far tiers are cut deeper.
        const geometries = species.map((entry, i) => {
            const resolved = resolveSpecies(entry.id, undefined);
            resolved.depth = Math.max(3, resolved.depth - tier.depthReduction);
            const skeleton = buildSkeleton(resolved, config.world.seed + i * 7919 + tierIndex * 131, {
                maxSegments: Math.round(config.tree.maxSegments * 0.45)
            });
            const leaves = bakeLeafCards(
                buildLeaves(skeleton, resolved, config.world.seed + i * 7919),
                N.leafCards, N.leafScale);
            return { geometry: bakeGeometry(skeleton), species: entry, resolved, skeleton, leaves };
        });

        geometries.forEach((entry, i) => {
            const mine = placed.filter((point) => point.pick === i);
            if (!mine.length) return;
            // One phase per tree, shared between this tree's bark and its
            // leaves so the canopy never drifts off the branch under it.
            const phases = treePhases(mine.length, config.world.seed ^ (0x5A11 + tierIndex * 977 + i));
            const swayUniforms = {
                uWind: { value: new THREE.Vector3(0, 0, 0) },
                uTime: { value: 0 },
                uSwayScale: { value: entry.resolved.matureHeight * config.tree.swayPerMetre },
                uMotion: { value: 1 },
                uFlutterRate: { value: config.tree.leafFlutter.rate },
                uFlutterAlong: { value: config.tree.leafFlutter.along },
                uFlutterCross: { value: config.tree.leafFlutter.cross }
            };

            const material = patchVertex(
                new THREE.MeshLambertMaterial({ color: entry.species.bark }),
                swayUniforms, SWAY_HEAD, SWAY_BODY, 'garden-wood-bark');
            entry.geometry.setAttribute('aTreePhase',
                new THREE.InstancedBufferAttribute(phases, 1));
            const mesh = new THREE.InstancedMesh(entry.geometry, material, mine.length);
            mesh.name = `treeline-${tierIndex}-${entry.species.id}`;
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            mesh.frustumCulled = false;

            const m = new THREE.Matrix4();
            const q = new THREE.Quaternion();
            const e = new THREE.Euler();
            const p = new THREE.Vector3();
            const sc = new THREE.Vector3();
            mine.forEach((point, j) => {
                const scale = N.minScale + point.r * (N.maxScale - N.minScale);
                p.set(point.x, worldHeightAt(point.x, point.z), point.z);
                e.set(0, point.r * Math.PI * 2, 0);
                q.setFromEuler(e);
                sc.setScalar(scale);
                m.compose(p, q, sc);
                mesh.setMatrixAt(j, m);
            });
            mesh.instanceMatrix.needsUpdate = true;
            mesh.count = mine.length;
            disposables.push(entry.geometry, material);
            scene.add(mesh);

            // ---- The canopy, on the same transforms ------------------------
            // A second instanced mesh sharing the bark mesh's matrices exactly,
            // so the leaves cannot drift from the branches they sit on.
            let leafMesh = null;
            if (entry.leaves) {
                const texture = leafClusterTexture();
                const leafMaterial = patchVertex(new THREE.MeshLambertMaterial({
                    color: 0xffffff,
                    map: texture,
                    transparent: false,
                    alphaTest: config.world.farForest.leafyAlphaTest,
                    side: THREE.DoubleSide
                }), swayUniforms, LEAF_SWAY_HEAD, LEAF_SWAY_BODY, 'garden-wood-leaf');
                entry.leaves.geometry.setAttribute('aTreePhase',
                    new THREE.InstancedBufferAttribute(phases, 1));
                leafMesh = new THREE.InstancedMesh(entry.leaves.geometry, leafMaterial, mine.length);
                leafMesh.name = `treeline-leaves-${tierIndex}-${entry.species.id}`;
                leafMesh.castShadow = false;
                leafMesh.receiveShadow = false;
                leafMesh.frustumCulled = false;
                leafMesh.instanceMatrix.array.set(mesh.instanceMatrix.array);
                leafMesh.instanceMatrix.needsUpdate = true;
                leafMesh.count = mine.length;
                // The geometry and material are ours; the mask is shared and
                // outlives us, so it is deliberately not in this list.
                disposables.push(entry.leaves.geometry, leafMaterial);
                scene.add(leafMesh);
            }

            nearTrees.push({
                mesh, leafMesh, species: entry.species, resolved: entry.resolved,
                evergreen: !!entry.species.evergreen, count: mine.length,
                cards: entry.leaves ? entry.leaves.cards : 0, tier: tierIndex,
                sway: swayUniforms, phases
            });
        });
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
    // A CROSSED QUAD WITHOUT A MASK IS A COLOURED SQUARE. Untextured, these
    // read in the QA screenshots as confetti or scraps of litter dropped round
    // the wall, which is the opposite of what flowers by a path are for. The
    // blossom shape has to come from alpha, exactly as the canopy's does.
    const flowerGeo = buildCrossedQuad();
    const flowerTexture = buildFlowerTexture(32, config.world.seed ^ 0xF10);
    const flowerMaterial = new THREE.MeshLambertMaterial({
        color: 0xffffff, map: flowerTexture, alphaTest: 0.42, side: THREE.DoubleSide
    });
    if (flowerTexture) disposables.push(flowerTexture);
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
export function updateForest(hour, snowCoverage = 0, wind = null, elapsed = 0, motion = 1, config = GARDEN_CONFIG) {
    if (!deciduous) return;
    const F = config.world.farForest;
    const snow = clamp01(snowCoverage);
    const snowColor = config.terrain.snowColor;

    // THE SEASON GOES TO THE FOLIAGE ONLY. Writing it to material.color tinted
    // the trunks too, which is how the perimeter wood grew green trunks. The
    // material colour stays white and the mask in the shader decides which
    // pixels are wood and which are leaf.
    const decColour = packColor(mixColor(forestColorAt(hour, false, config), snowColor, snow * 0.55));
    const evgColour = packColor(mixColor(forestColorAt(hour, true, config), snowColor, snow * 0.4));
    setSeason(deciduous.material, decColour);
    setSeason(evergreen.material, evgColour);

    // The canopy erodes rather than fading. See the note at the top of the
    // file: opaque branches survive the threshold, softer leaves do not.
    const bare = barenessAt(hour, config);
    deciduous.material.alphaTest = F.leafyAlphaTest + (F.bareAlphaTest - F.leafyAlphaTest) * bare;

    for (const tree of nearTrees) {
        // THE SAME WIND VECTOR THE PLANTED TREES READ. One source, so nothing
        // in frame can disagree about the weather.
        if (tree.sway) {
            if (wind) tree.sway.uWind.value.set(wind.x, 0, wind.z);
            tree.sway.uTime.value = elapsed;
            tree.sway.uMotion.value = motion;
        }
        tree.mesh.material.color.setHex(
            packColor(mixColor(tree.species.bark, snowColor, snow * 0.35)));

        // The treeline turns with the same phenology the far wood does, and
        // sheds the same way, so the two tiers can never disagree about the
        // season. An evergreen keeps its needles: it dulls, it does not erode.
        if (!tree.leafMesh) continue;
        const leafColour = forestColorAt(hour, tree.evergreen, config);
        tree.leafMesh.material.color.setHex(
            packColor(mixColor(leafColour, snowColor, snow * (tree.evergreen ? 0.4 : 0.55))));
        // THE WOOD'S OWN BARE THRESHOLD, not the flat tier's. The flat tier
        // draws its trunk and limbs INTO the canopy texture, so its threshold
        // has to stop short of erasing them: 0.82 takes the leaves and leaves
        // the branches. This mask has no wood in it at all, because the
        // branches here are real geometry, so it can and must go all the way.
        // At 0.82 the mask's own 0.62 to 0.92 alpha left about a third of the
        // canopy standing through deep winter, which is why the wood kept full
        // tan crowns under snow when M7-2 and M3-3 both call for bare.
        const N = config.world.nearTreeline;
        tree.leafMesh.material.alphaTest = tree.evergreen
            ? F.leafyAlphaTest
            : F.leafyAlphaTest + (N.bareAlphaTest - F.leafyAlphaTest) * bare;
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

/** Push a season colour into a canopy material's own uniform. */
function setSeason(material, hex) {
    const rgb = unpackColor(hex);
    if (material.userData.season) material.userData.season.value.set(rgb[0], rgb[1], rgb[2]);
    // Snow whitens the wood a little too, which is what a snowy wood does.
    if (material.userData.bark) {
        const bark = unpackColor(GARDEN_CONFIG.world.farForest.barkColor);
        material.userData.bark.value.set(bark[0], bark[1], bark[2]);
    }
}

export function getForestMeshes() {
    return [evergreen, deciduous, bushes, flowers,
        ...nearTrees.map((t) => t.mesh),
        ...nearTrees.map((t) => t.leafMesh)].filter(Boolean);
}

// The tree groups, for the suite. `getForestMeshes` returns meshes and the
// sway lives on the group beside them.
export const __test__ = { nearTrees: () => nearTrees };

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
