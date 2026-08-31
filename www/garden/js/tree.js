// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * tree.js - The fractal tree: skeleton, geometry, and the shaders that grow it.
 *
 * Split three ways. `buildSkeleton` is pure arithmetic and fully testable.
 * `bakeGeometry` writes typed arrays and touches THREE only to wrap them.
 * `createTree` assembles meshes and does no arithmetic worth asserting.
 *
 * ---- THE ONE IDEA THIS FILE IS BUILT ON ----
 *
 * A tree is baked ONCE, at maturity, and grown entirely in a vertex shader.
 * Growth is a uniform. Nothing is rebuilt, nothing is re-uploaded, and the CPU
 * cost of a tree growing for twenty minutes is about six uniform writes a
 * frame.
 *
 * That works because of a single invariant:
 *
 *     A BRANCH NEVER BEGINS TO EXTEND BEFORE ITS PARENT HAS FINISHED.
 *     birth(child) >= birth(parent) + emergeSpan
 *
 * Every vertex carries `aBirth`, the growth value at which its segment starts
 * extending, and `aOrigin`, the point it extends FROM. A branch's origin is
 * its parent's mature end point, so the invariant is what guarantees the
 * parent is already there when the child appears. Break it and half grown
 * branches leave their children hanging in space, and the only repairs are a
 * full transform chain per vertex or a rebuild every frame. Both are much
 * worse than an ordering rule.
 *
 * It is also how real trees work. Extension growth runs along an axis in
 * sequence, which is why a sapling is a thick short trunk with two or three
 * orders of branching rather than a shrunken adult.
 *
 * ---- Determinism ----
 *
 * Every jitter comes from the seeded generator in species.js. The same
 * (params, seed) pair must produce the same tree forever, because that is what
 * makes a saved garden come back as the same garden.
 */

import { GARDEN_CONFIG } from './config.min.js';
import { makeRandom, tintColor } from './species.min.js';
import { unpackColor, srgbToLinear } from './sky.min.js';

// ---- Small vector helpers (pure, no THREE) ---------------------------------

function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}

/** Rodrigues rotation of v about a unit axis k by angle radians. */
function rotate(v, k, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const kv = cross(k, v);
    const kd = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    return [
        v[0] * c + kv[0] * s + k[0] * kd * (1 - c),
        v[1] * c + kv[1] * s + k[1] * kd * (1 - c),
        v[2] * c + kv[2] * s + k[2] * kd * (1 - c)
    ];
}

/** Any unit vector perpendicular to d. */
function perpendicular(d) {
    const ref = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    return norm(cross(d, ref));
}

// The golden angle, which is what real phyllotaxis uses and what stops
// successive branches from stacking into flat fans.
const GOLDEN_ANGLE = 137.5 * Math.PI / 180;

// ---- The skeleton (pure) ---------------------------------------------------

/**
 * Build a tree's branch skeleton.
 *
 * Returns segments in plain numbers, scaled so the tallest point sits at
 * exactly `params.matureHeight`. Births are normalised into 0 to 1 with the
 * invariant above intact.
 *
 * @param {object} params  from species.resolveSpecies
 * @param {number} seed
 * @param {object} options { maxSegments }
 */
export function buildSkeleton(params, seed, options = {}) {
    const T = GARDEN_CONFIG.tree;
    const maxSegments = options.maxSegments || T.maxSegments;
    const random = makeRandom(seed);
    const segments = [];

    // One birth step per level of recursion, with the last level still
    // finishing by growth 1. This is the emergeSpan the invariant is stated in.
    const levels = params.depth + 1;
    const emergeSpan = 1 / (levels + 1);

    const jitter = (amount) => 1 + (random() - 0.5) * 2 * amount;

    function grow(origin, dir, length, radius, depth, parent) {
        if (depth > params.depth || segments.length >= maxSegments) return;

        const end = [
            origin[0] + dir[0] * length,
            origin[1] + dir[1] * length,
            origin[2] + dir[2] * length
        ];
        const endRadius = radius * params.taper;

        const index = segments.length;
        segments.push({
            x0: origin[0], y0: origin[1], z0: origin[2],
            x1: end[0], y1: end[1], z1: end[2],
            r0: radius, r1: endRadius,
            depth,
            parent,
            // THE INVARIANT, in one line. A child is born exactly one span
            // after its parent, so a parent is always fully extended before
            // any of its children begin.
            birth: depth * emergeSpan
        });

        if (depth === params.depth) return;

        // Two children usually, three now and then. A third child is what
        // makes a crown dense rather than forked, and it is the main thing the
        // density slider moves.
        const count = params.branches + (random() < params.thirdChance ? 1 : 0);
        const base = perpendicular(dir);
        // A conical species keeps a leader: one child carries straight on and
        // the rest come off it as a whorl, which is what makes a spruce a cone
        // rather than a ball.
        const leader = params.conical;

        for (let i = 0; i < count; i++) {
            const isLeader = leader && i === 0;
            const roll = GOLDEN_ANGLE * (index + i) + random() * params.jitter;
            const swing = base.length ? rotate(base, dir, roll) : base;

            const divergence = isLeader
                ? params.divergence * 0.12 * Math.PI / 180
                : params.divergence * jitter(params.jitter * 0.5) * Math.PI / 180;

            let child = norm([
                dir[0] * Math.cos(divergence) + swing[0] * Math.sin(divergence),
                dir[1] * Math.cos(divergence) + swing[1] * Math.sin(divergence),
                dir[2] * Math.cos(divergence) + swing[2] * Math.sin(divergence)
            ]);

            // Gravitropism: a bias toward (or, for a willow, away from) the
            // vertical, applied per level so it accumulates down the tree.
            const g = params.gravitropism;
            child = norm([child[0], child[1] + g, child[2]]);

            const childLength = length * params.lengthRatio * jitter(params.jitter * 0.4)
                * (isLeader ? 1.14 : 1);
            const childRadius = endRadius * params.radiusRatio * (isLeader ? 1.08 : 1);

            grow(end, child, childLength, childRadius, depth + 1, index);
        }
    }

    // The trunk starts dead vertical with a touch of lean, in unit space. The
    // whole thing is scaled to the mature height at the end, so proportions
    // are set here and size is set there.
    const lean = norm([(random() - 0.5) * 0.05, 1, (random() - 0.5) * 0.05]);
    grow([0, 0, 0], lean, 1, T.trunkRadiusRatio * params.trunkScale, 0, -1);

    // ---- Scale to the mature height ---------------------------------------
    let top = 0;
    for (const s of segments) top = Math.max(top, s.y1, s.y0);
    const scale = top > 0 ? params.matureHeight / top : 1;
    for (const s of segments) {
        s.x0 *= scale; s.y0 *= scale; s.z0 *= scale;
        s.x1 *= scale; s.y1 *= scale; s.z1 *= scale;
        s.r0 *= scale; s.r1 *= scale;
    }

    return {
        segments,
        emergeSpan,
        height: params.matureHeight,
        maxDepth: params.depth
    };
}

/**
 * Where the leaves go.
 *
 * Clusters ride the outer two levels of branching, spread along each segment.
 * A leaf is born a little after the branch that carries it, so foliage arrives
 * with its branch rather than ahead of it.
 *
 * `drop` is the autumn fall order, and it is not random: outer and higher
 * leaves go first, which is the order a real canopy empties in.
 */
export function buildLeaves(skeleton, params, seed) {
    const random = makeRandom(seed ^ 0x9E3779B9);
    const leaves = [];
    const fromDepth = Math.max(1, params.depth - GARDEN_CONFIG.tree.leafLevels + 1);
    const height = Math.max(0.001, skeleton.height);

    for (const s of skeleton.segments) {
        if (s.depth < fromDepth) continue;
        const count = Math.max(1, Math.round(params.leafDensity));
        for (let i = 0; i < count; i++) {
            const t = (i + 0.5) / count + (random() - 0.5) * 0.25;
            const u = Math.max(0, Math.min(1, t));
            const x = s.x0 + (s.x1 - s.x0) * u;
            const y = s.y0 + (s.y1 - s.y0) * u;
            const z = s.z0 + (s.z1 - s.z0) * u;

            // Outer and higher first. Distance from the trunk axis and height
            // both count, so a low inner leaf is the last to let go.
            const radial = Math.hypot(x, z);
            const exposure = Math.min(1, (y / height) * 0.6 + (radial / (height * 0.5)) * 0.4);

            // THE SAME SWAY WEIGHT THE BARK BAKES, computed the same way from
            // the same segment. A leaf that did not carry this would sit still
            // while the branch holding it moved, which is exactly what shipped:
            // the leaf shader's only wind term was a 12 percent one-sided
            // flutter and it never applied the branch's own displacement at
            // all. Same family as the growth bug in M2-7, and for the same
            // underlying reason: a leaf's position lives in its instance
            // matrix, baked at rest, so nothing the bark does reaches it.
            const depthWeight = Math.pow(s.depth / Math.max(1, skeleton.maxDepth), 1.5);
            const sway = depthWeight * (0.25 + 0.75 * Math.min(1, y / height));

            leaves.push({
                x, y, z, sway,
                // Splayed off the branch, seeded so a canopy is not a hedgehog.
                yaw: random() * Math.PI * 2,
                pitch: (random() - 0.5) * 1.5,
                size: params.leafSize * (0.75 + random() * 0.5),
                birth: Math.min(0.999, s.birth + skeleton.emergeSpan * 0.55),
                drop: Math.max(0, Math.min(1, exposure * 0.85 + random() * 0.15)),
                tint: random(),
                phase: random() * Math.PI * 2
            });
        }
    }
    return leaves;
}

/**
 * The anchors a tree's blossom and fruit hang from.
 *
 * A FRUIT ANCHOR IS A LEAF ANCHOR, thinned. Building a second set from the
 * skeleton would be a second answer to the question of where the outside of a
 * canopy is, and the two would drift the first time anybody touched
 * `leafLevels`. It also means `birth` comes across for free, and `birth` is the
 * one field here that MUST NOT be lost: `step(aBirth, uGrowth)` is what stops a
 * leaf appearing on a branch that has not been born yet, and an apple hanging in
 * the air off the end of an unborn twig is the same defect with a much bigger
 * silhouette than a leaf has.
 *
 * ONE SET SERVES BOTH, at BLOSSOM density, because blossom is far denser than
 * fruit: most flowers never set. `aRole` is what picks the share that do, so the
 * fruit is a subset of the flowers rather than an independent scattering, which
 * is both true and cheaper than two meshes.
 */
export function buildFruit(leaves, resolved, seed, config = GARDEN_CONFIG) {
    if (!resolved || !resolved.schedule) return null;
    const F = config.garden.fruit;
    const random = makeRandom((seed ^ 0x5EEDF00D) >>> 0);
    const anchors = [];

    for (const leaf of leaves) {
        if (random() > F.blossomDensity) continue;
        anchors.push({
            x: leaf.x, y: leaf.y, z: leaf.z,
            // The same sway weight the branch under it carries. See buildLeaves.
            sway: leaf.sway,
            birth: leaf.birth,
            // Scattered rather than keyed to exposure, unlike a leaf. Petals do
            // not come off a cherry from the outside in.
            drop: random(),
            crop: random(),
            role: random(),
            phase: random() * Math.PI * 2,
            yaw: random() * Math.PI * 2
        });
    }

    return {
        anchors,
        // A species can flower and set nothing. The Flowering Dogwood does, and
        // has claimed to since M2. Its share is zero, so `aRole` never lets an
        // instance through into the fruit stage.
        fruitShare: resolved.fruit ? Math.min(1, F.density / F.blossomDensity) : 0
    };
}

/** Total triangle count a skeleton will bake to, for the budget checks. */
export function sidesForDepth(depth) {
    return Math.max(3, GARDEN_CONFIG.tree.trunkSides - depth);
}

// ---- The bake --------------------------------------------------------------

/**
 * Write a skeleton into typed arrays.
 *
 * NO BufferGeometryUtils EXISTS IN THIS BUILD (the UMD three.min.js ships no
 * addons), so there is no mergeGeometries to lean on. Counting up front and
 * writing directly into pre-allocated arrays is both the only option and the
 * faster one.
 *
 * The attributes are what the growth shader needs to rebuild each vertex:
 *
 *   position  the MATURE rest pose, which also gives an honest bounding sphere
 *   aOrigin   the segment's start point, the anchor growth extends from
 *   aRadial   unit outward direction, doubling as the world normal
 *   aRadius   mature radius here, so thickening is a multiply
 *   aBirth    the growth value at which this segment starts
 *   aSway     wind weight, from depth and height
 */
export function bakeGeometry(skeleton) {
    const segs = skeleton.segments;
    const height = Math.max(0.001, skeleton.height);

    let vertexCount = 0;
    let indexCount = 0;
    for (const s of segs) {
        const n = sidesForDepth(s.depth);
        vertexCount += n * 2;
        indexCount += n * 6;
    }

    const position = new Float32Array(vertexCount * 3);
    const normal = new Float32Array(vertexCount * 3);
    const aOrigin = new Float32Array(vertexCount * 3);
    const aRadial = new Float32Array(vertexCount * 3);
    const aRadius = new Float32Array(vertexCount);
    const aBirth = new Float32Array(vertexCount);
    const aSway = new Float32Array(vertexCount);
    const index = new Uint32Array(indexCount);

    let v = 0;
    let i = 0;
    for (const s of segs) {
        const n = sidesForDepth(s.depth);
        const dir = norm([s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0]);
        const u = perpendicular(dir);
        const w = cross(dir, u);
        const base = v;

        // A twig moves most and a trunk barely at all, and the higher up the
        // tree a vertex is the more it goes with the wind.
        const depthWeight = Math.pow(s.depth / Math.max(1, skeleton.maxDepth), 1.5);

        for (let ring = 0; ring < 2; ring++) {
            const px = ring ? s.x1 : s.x0;
            const py = ring ? s.y1 : s.y0;
            const pz = ring ? s.z1 : s.z0;
            const r = ring ? s.r1 : s.r0;
            const sway = depthWeight * (0.25 + 0.75 * Math.min(1, py / height));

            for (let j = 0; j < n; j++) {
                const a = (j / n) * Math.PI * 2;
                const ca = Math.cos(a);
                const sa = Math.sin(a);
                const rx = u[0] * ca + w[0] * sa;
                const ry = u[1] * ca + w[1] * sa;
                const rz = u[2] * ca + w[2] * sa;

                const o = v * 3;
                position[o] = px + rx * r;
                position[o + 1] = py + ry * r;
                position[o + 2] = pz + rz * r;
                normal[o] = rx; normal[o + 1] = ry; normal[o + 2] = rz;
                aOrigin[o] = s.x0; aOrigin[o + 1] = s.y0; aOrigin[o + 2] = s.z0;
                aRadial[o] = rx; aRadial[o + 1] = ry; aRadial[o + 2] = rz;
                aRadius[v] = r;
                aBirth[v] = s.birth;
                aSway[v] = sway;
                v++;
            }
        }

        for (let j = 0; j < n; j++) {
            const a0 = base + j;
            const a1 = base + (j + 1) % n;
            const b0 = a0 + n;
            const b1 = a1 + n;
            index[i++] = a0; index[i++] = b0; index[i++] = b1;
            index[i++] = a0; index[i++] = b1; index[i++] = a1;
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geo.setAttribute('aOrigin', new THREE.BufferAttribute(aOrigin, 3));
    geo.setAttribute('aRadial', new THREE.BufferAttribute(aRadial, 3));
    geo.setAttribute('aRadius', new THREE.BufferAttribute(aRadius, 1));
    geo.setAttribute('aBirth', new THREE.BufferAttribute(aBirth, 1));
    geo.setAttribute('aSway', new THREE.BufferAttribute(aSway, 1));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeBoundingSphere();
    geo.userData.counts = { vertices: vertexCount, triangles: indexCount / 3 };
    return geo;
}

// ---- Shaders ---------------------------------------------------------------

// Shared by the bark's visible material and its shadow-depth twin, so a
// sapling casts a sapling's shadow rather than a full grown tree's. Getting
// this wrong is invisible in the geometry and glaring on the ground.
const BARK_HEAD = `
uniform float uGrowth;
uniform float uSpan;
uniform float uScale;
uniform float uThick;
uniform vec3  uWind;
uniform float uTime;
uniform float uPhase;
uniform float uSwayScale;
uniform float uMotion;
attribute vec3 aOrigin;
attribute vec3 aRadial;
attribute float aRadius;
attribute float aBirth;
attribute float aSway;
varying vec3 vBarkNormal;
varying float vBarkHeight;
`;

const BARK_BODY = `
    float barkT = clamp((uGrowth - aBirth) / uSpan, 0.0, 1.0);
    float barkEase = barkT * barkT * (3.0 - 2.0 * barkT);
    vec3 barkAxis = position - aRadial * aRadius;
    vec3 barkGrown = mix(aOrigin, barkAxis, barkEase);
    transformed = (barkGrown + aRadial * aRadius * uThick) * uScale;

    float barkWP = uTime * 1.35 + uPhase + transformed.y * 0.42;
    vec3 barkGust = vec3(uWind.x, 0.0, uWind.z);
    // uSwayScale IS THE TREE'S OWN HEIGHT, AND WITHOUT IT EVERY TREE MOVED THE
    // SAME NUMBER OF METRES. aSway is normalised 0 to 1, so the displacement
    // used to be absolute: at wind 1.0 a 3 m Japanese Maple's tip swung a full
    // third of its height while a 14 m Coast Redwood's moved 7 percent of its.
    // Read as one tree thrashing while the rest barely stirred, which is not
    // what one wind looks like. Multiplying by uScale as well means a sapling
    // sways like a sapling rather than like the tree it will become.
    transformed += barkGust
        * (sin(barkWP) * 0.62 + sin(barkWP * 1.73 + 1.3) * 0.38)
        * aSway * uSwayScale * uScale * uMotion;

    vBarkNormal = aRadial;
    vBarkHeight = transformed.y;
`;

const LEAF_HEAD = `
uniform float uGrowth;
uniform float uLeafScale;
uniform float uDrop;
uniform float uBud;
uniform vec3  uWind;
uniform float uTime;
uniform float uPhase;
uniform float uTremble;
uniform float uScale;
uniform float uFlutterRate;
uniform float uFlutterAlong;
uniform float uFlutterCross;
uniform float uMotion;
attribute float aBirth;
attribute float aDrop;
attribute float aTint;
attribute float aPhase;
attribute float aLeafSway;
uniform float uSwayScale;
varying float vLeafTint;
varying float vLeafFall;
varying float vLeafBud;
`;

// THE LEAVES HAVE TO GROW WITH THE TREE, and this is the part that is easy to
// miss. Every leaf's position lives in its instance matrix, baked at MATURE
// coordinates, and the bark's `uScale` never touches it. Left alone, a freshly
// planted sapling wears a full sized canopy hanging in the air around it.
//
// Both that correction and the autumn fall are WORLD space offsets, while
// `transformed` is in the leaf card's own space and the instance matrix is not
// applied until later. So the offsets are rotated back through the instance
// matrix before being added. The instance carries a rotation and a uniform
// scale only, which is what makes the inverse cheap: the transpose of the
// rotation, over the length of a column.
const LEAF_BODY = `
    float leafBorn = step(aBirth, uGrowth);
    float leafFall = clamp((uDrop - aDrop) / 0.14, 0.0, 1.0);
    float leafBud = (aDrop < uBud * 0.55) ? uBud : 0.0;
    float leafOpenMax = max(uLeafScale, leafBud * 0.42);
    // A young tree carries smaller leaves as well as fewer of them. Not as
    // small as the trunk is short, because a sapling's leaves really are
    // close to full size, but a straight mature leaf on a 14 percent tree
    // reads as a mistake.
    // Named leafOpen rather than the obvious "size": three declares a uniform
    // of that name in its points shader. Nothing here uses that material, so
    // this is caution rather than a fix, but a name collision inside an
    // injected main() is a compile error with a confusing message.
    float leafOpen = leafBorn * leafOpenMax * (1.0 - leafFall) * mix(0.55, 1.0, uScale);

    transformed *= leafOpen;

    // TWO MOTIONS, NOT ONE. This runs at its own rate, well clear of the
    // branch's 1.35, and it swings BOTH WAYS: the old sin * 0.5 + 0.5 never
    // came back through rest, so at a steady wind it was a static offset with a
    // wobble on it. uFlutterCross pushes across the wind as well as along it,
    // which is a leaf turning rather than a leaf sliding.
    float leafLP = uTime * (uFlutterRate + uTremble) + aPhase;
    vec3 leafAlong = vec3(uWind.x, 0.0, uWind.z);
    vec3 leafAcross = vec3(-uWind.z, 0.0, uWind.x);
    vec3 leafWorld = (leafAlong * sin(leafLP) * uFlutterAlong
        + leafAcross * sin(leafLP * 1.37 + aPhase * 2.1) * uFlutterCross) * uMotion;
    leafWorld.y -= leafFall * 1.6 * uScale;
    leafWorld.x += leafFall * (sin(aPhase * 3.1) * 0.9);
    leafWorld.z += leafFall * (cos(aPhase * 2.3) * 0.9);

    #ifdef USE_INSTANCING
    // EVERY NAME HERE IS PREFIXED, and the prefix is not decoration. This block
    // is spliced into the middle of three's own main(), where 589 names are
    // already in scope. "im" was one of them: defaultnormal_vertex declares
    // mat3 im = mat3(instanceMatrix) inside its own USE_INSTANCING branch, and
    // it runs BEFORE begin_vertex, so an innocent local of the same name cost
    // the whole vertex shader with only "'im' : redefinition" to go on.
    mat3 leafIM = mat3(instanceMatrix);
    float leafISC = max(length(leafIM[0]), 0.0001);
    mat3 leafRot = leafIM / leafISC;
    // Written out rather than using transpose(), which exists only in GLSL ES
    // 3.00. three emits #version 300 es on a WebGL2 context, so transpose()
    // would work today, but it would fail on the WebGL1 fallback and the
    // failure mode is a whole shader that will not compile.
    mat3 leafRotT = mat3(leafRot[0][0], leafRot[1][0], leafRot[2][0],
                         leafRot[0][1], leafRot[1][1], leafRot[2][1],
                         leafRot[0][2], leafRot[1][2], leafRot[2][2]);
    // Pull the whole leaf back toward the trunk by however much the tree is
    // short of mature. This is the line that keeps the canopy on the tree.
    leafWorld += instanceMatrix[3].xyz * (uScale - 1.0);

    // THE LINE THAT KEEPS THE CANOPY ON THE MOVING BRANCH. Everything above is
    // the leaf's own flutter; this is the branch underneath it going past. It
    // has to be the SAME expression the bark uses, evaluated at this leaf's own
    // height, or the canopy drifts off the wood it is attached to. Without it
    // the branches swayed and the leaves hung in the air where the branch used
    // to be, and because a canopy hides its own twigs the whole tree read as
    // standing still.
    float leafBWP = uTime * 1.35 + uPhase + (instanceMatrix[3].y * uScale) * 0.42;
    leafWorld += vec3(uWind.x, 0.0, uWind.z)
        * (sin(leafBWP) * 0.62 + sin(leafBWP * 1.73 + 1.3) * 0.38)
        * aLeafSway * uSwayScale * uScale * uMotion;
    transformed += (leafRotT * leafWorld) / leafISC;
    #else
    transformed += leafWorld;
    #endif

    vLeafTint = aTint;
    vLeafFall = leafFall;
    vLeafBud = leafBud;
`;

// ---- Blossom and fruit -----------------------------------------------------

const FRUIT_HEAD = `
uniform float uGrowth;
uniform float uBloom;
uniform float uFruitSize;
uniform float uRipe;
uniform float uFruitDrop;
uniform float uCrop;
uniform float uFruitShare;
uniform float uPetalDrift;
uniform vec3  uWind;
uniform float uTime;
uniform float uPhase;
uniform float uScale;
uniform float uSwayScale;
uniform float uMotion;
attribute float aBirth;
attribute float aDrop;
attribute float aCrop;
attribute float aRole;
attribute float aPhase;
attribute float aFruitSway;
varying float vStage;
varying float vRipe;
`;

// FRUIT HANGS WHERE A LEAF HANGS AND MOVES HOW A LEAF MOVES, so this is the
// leaf program with three terms changed and one removed. What it must keep,
// exactly, is the growth pull-back and the branch sway at the bottom: both are
// the answer to the same trap that has now caught this scene twice (M2-7,
// M8-6), which is that an instanced card's position is baked at rest and
// NOTHING the bark shader does reaches it unless it is handed over.
//
// What it drops is the flutter. A leaf turns edge-on in a gust and an apple
// does not, so fruit gets one slow swing on its stalk instead.
const FRUIT_BODY = `
    float frBorn = step(aBirth, uGrowth);
    // THE CROP GATE THINS THE SET RATHER THAN SHRINKING EVERY FRUIT. A tree at
    // half health carrying a full count of half-sized apples reads as a
    // rendering fault; one carrying half as many full-sized apples reads as a
    // poor year, which is what it is.
    float frKept = step(aCrop, uCrop);
    // Blossom uses every anchor. Fruit uses the share of the flowers that set.
    float frIsFruit = step(aRole, uFruitShare);
    float frFall = clamp((uFruitDrop - aDrop) / 0.16, 0.0, 1.0);

    // BLOSSOM AND FRUIT NEVER COEXIST, and that is what lets one mesh and one
    // draw call carry both. Every schedule in species.js sets bloomEnd and
    // the start of fruit set to the SAME HOUR, with both sizes at zero there,
    // so this max() is never blending two things and the stage swap below has
    // nothing on screen to pop.
    float frFruitOpen = uFruitSize * frIsFruit;
    float frOpen = max(uBloom, frFruitOpen) * frBorn * frKept * (1.0 - frFall);
    // A young tree's fruit is smaller as well as scarcer.
    frOpen *= mix(0.6, 1.0, uScale);

    transformed *= frOpen;

    // 0 while the blossom is out, 1 once there is fruit. Both are zero out of
    // season, when nothing is drawn and it does not matter which this says.
    vStage = step(uBloom, frFruitOpen);
    vRipe = uRipe;

    vec3 frWorld = vec3(0.0);
    // One slow swing on the stalk, both ways through rest, well clear of the
    // branch's 1.35 and of the leaf flutter's rate.
    float frLP = uTime * 0.9 + aPhase;
    frWorld += vec3(uWind.x, 0.0, uWind.z) * sin(frLP) * 0.045 * uMotion;
    // Coming off. PETALS DRIFT AND FRUIT DOES NOT, which is the whole of
    // uPetalDrift: a cherry petal fall is the most recognisable thing the
    // tree does and it wants the sideways travel a leaf gets, while a windfall
    // apple goes more or less straight down.
    frWorld.y -= frFall * 1.5 * uScale;
    frWorld.x += frFall * sin(aPhase * 3.1) * 0.9 * uPetalDrift;
    frWorld.z += frFall * cos(aPhase * 2.3) * 0.9 * uPetalDrift;

    #ifdef USE_INSTANCING
    // Prefixed for the reason spelled out in LEAF_BODY: this block is spliced
    // into the middle of three's own main() with hundreds of names in scope.
    mat3 frIM = mat3(instanceMatrix);
    float frISC = max(length(frIM[0]), 0.0001);
    mat3 frRot = frIM / frISC;
    mat3 frRotT = mat3(frRot[0][0], frRot[1][0], frRot[2][0],
                       frRot[0][1], frRot[1][1], frRot[2][1],
                       frRot[0][2], frRot[1][2], frRot[2][2]);
    frWorld += instanceMatrix[3].xyz * (uScale - 1.0);

    // THE LINE THAT KEEPS THE BLOSSOM ON THE MOVING BRANCH. Identical
    // expression to the leaves', evaluated at this anchor's own height, because
    // they are on the same branches and any difference at all would show as
    // blossom sliding through its own canopy.
    float frBWP = uTime * 1.35 + uPhase + (instanceMatrix[3].y * uScale) * 0.42;
    frWorld += vec3(uWind.x, 0.0, uWind.z)
        * (sin(frBWP) * 0.62 + sin(frBWP * 1.73 + 1.3) * 0.38)
        * aFruitSway * uSwayScale * uScale * uMotion;
    transformed += (frRotT * frWorld) / frISC;
    #else
    transformed += frWorld;
    #endif
`;

/**
 * Blossom and fruit colour, and the shape swap.
 *
 * TWO SHAPES IN ONE TEXTURE, ONE PER CHANNEL, rather than two tiles of an
 * atlas. A UV rect would have to be slid in the vertex shader, which means
 * reaching into three's own uv chunk, and it would bleed one tile into the
 * other at the coarse mip levels this card spends most of its life at. Picking
 * a channel has neither problem and costs one mix.
 */
function wrapFruitFragment(previous) {
    return (shader) => {
        if (previous) previous(shader);
        const u = shader.uniforms;
        u.uBlossomColor = u.uBlossomColor || { value: new THREE.Vector3(1, 1, 1) };
        u.uUnripeColor = u.uUnripeColor || { value: new THREE.Vector3(0.4, 0.6, 0.2) };
        u.uRipeColor = u.uRipeColor || { value: new THREE.Vector3(0.7, 0.2, 0.1) };
        u.uSnow = u.uSnow || { value: 0 };
        u.uSnowColor = u.uSnowColor || { value: new THREE.Vector3(0.9, 0.92, 0.95) };
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
uniform vec3 uBlossomColor;
uniform vec3 uUnripeColor;
uniform vec3 uRipeColor;
uniform vec3 uSnowColor;
uniform float uSnow;
varying float vStage;
varying float vRipe;`)
            .replace('#include <map_fragment>', `#include <map_fragment>
    vec4 frTex = texture2D(map, vMapUv);
    // Blossom is drawn into the RED channel and fruit into the GREEN, so the
    // stage picks a mask. The alpha the sampler carries is the union of the two
    // and is deliberately thrown away here.
    diffuseColor.a = mix(frTex.r, frTex.g, vStage);
    // GREEN TO RIPE, NEVER FLAT RIPE. A summer apple is a green apple and an
    // orange spends most of its year green, so the colour is a mix driven by
    // the schedule rather than a constant that switches on.
    vec3 frCol = mix(uBlossomColor, mix(uUnripeColor, uRipeColor, vRipe), vStage);
    // ROUNDNESS COMES OUT OF THE BLUE CHANNEL, and only for fruit. The card is
    // a flat quad facing the camera, so every lamp in the scene lights it
    // evenly and an apple is a disc of one colour however good its outline is.
    // The mask bakes a sphere's falloff into the channel the two alphas left
    // empty, so this costs one multiply. A petal is flat and keeps its flat
    // colour, which is also why this is mixed rather than applied outright.
    frCol *= mix(1.0, 0.72 + 0.54 * frTex.b, vStage);
    frCol = mix(frCol, uSnowColor, uSnow * 0.30);
    diffuseColor.rgb = frCol;`);
    };
}

/**
 * What each fruit tree actually hangs on its branches.
 *
 * ONE ROUND BLOB IS NOT FOUR DIFFERENT FRUITS, and the first pass drew exactly
 * that: one shared cluster of three equal circles whose three stalks met at a
 * single point near the top of the card. Two faults came out of it, both
 * visible in the screenshots rather than in any number. The stalks filled in
 * as a solid wedge, so the card read as an arrowhead with a lump on the end,
 * and the three circles touched, so there was never more than one silhouette
 * to see. An apple tree, a pear tree and a cherry tree carried the same shape
 * in three different colours.
 *
 * So the shape is per species now, and each one is chosen for the single cue
 * that survives being eight pixels across:
 *
 *   apple    round, a shade wider than tall, with the stem well cut into the
 *            crown. Two out on the shoulders and a smaller one set back
 *            behind them, which is how a cluster hangs once it has thinned.
 *   pear     pyriform, and it is the one fruit here a person can name from the
 *            outline alone, so it gets the neck it has earned. Pears hang in
 *            twos far more often than in threes.
 *   orange   the truest sphere of the four, on the shortest stalk, because a
 *            citrus sits tight against the twig rather than swinging under it.
 *   cherry   small bodies on LONG thin pedicels. The stalk is the recognisable
 *            half of a cherry, it is longer than the fruit is wide, and the
 *            fruit itself is the smallest thing in this orchard.
 *
 * `x` and `r` are shares of the card WIDTH and `y` a share of its HEIGHT
 * measured from the top, since the canvas is flipped on upload. `r` is always
 * the HALF-WIDTH OF THE WIDEST PART, which is what keeps `fruitClusterSpan`
 * honest for a pear as well as for a sphere.
 *
 * BODIES MUST NOT TOUCH. Two circles that overlap at 128 px are one blob at
 * the 8 px mip this card spends most of its life at, which is the whole of the
 * old fault, so `tests/garden-tree.test.mjs` asserts the gaps.
 */
export const FRUIT_SHAPES = {
    apple: {
        // A SHORT STALK IS PART OF THE SHAPE. Drawn at the cherry's length the
        // apples came out as cherries, which is the whole argument for the
        // table: the four differ as much in how they hang as in their outline.
        kind: 'round', node: 0.210, stalk: 0.018, enter: 0.92,
        squash: 0.90, dimple: 0.36,
        bodies: [
            { x: -0.185, y: 0.600, r: 0.130 },
            { x: 0.180, y: 0.560, r: 0.120 },
            { x: -0.020, y: 0.335, r: 0.095 }
        ]
    },
    pear: {
        // `axis` is the neck length in half-widths and `neck` the half-width at
        // the top of it, both as a share of `r`. Together they set the profile
        // at a height of about 1.5 widths, which is a dessert pear.
        kind: 'pear', node: 0.120, stalk: 0.014, enter: 1.92,
        axis: 1.70, neck: 0.32,
        bodies: [
            { x: -0.135, y: 0.585, r: 0.115 },
            { x: 0.150, y: 0.520, r: 0.100 }
        ]
    },
    orange: {
        kind: 'round', node: 0.300, stalk: 0.020, enter: 0.86,
        squash: 0.95, dimple: 0,
        bodies: [
            { x: -0.160, y: 0.560, r: 0.130 },
            { x: 0.170, y: 0.480, r: 0.115 }
        ]
    },
    cherry: {
        kind: 'round', node: 0.090, stalk: 0.011, enter: 0.88,
        squash: 0.96, dimple: 0.34,
        bodies: [
            { x: -0.150, y: 0.700, r: 0.105 },
            { x: 0.135, y: 0.615, r: 0.097 }
        ]
    },
    // A LEMON IS THE ONE THAT IS TALLER THAN IT IS WIDE, and at eight pixels
    // that is the whole of what separates it from the orange beside it in the
    // list. `squash` is the y radius as a fraction of the x radius, so this is
    // the only entry above 1. The real nipple at each end is not drawn: this
    // machinery cuts a stem WELL with `destination-out` and cannot add a bump,
    // and at this size the silhouette's proportion carries it anyway.
    lemon: {
        kind: 'round', node: 0.140, stalk: 0.013, enter: 0.90,
        squash: 1.32, dimple: 0.20,
        bodies: [
            { x: -0.165, y: 0.545, r: 0.108 },
            { x: 0.170, y: 0.475, r: 0.100 }
        ]
    }
};

/**
 * How much of the card's width the drawn cluster spans.
 *
 * Exported because the pixel test that keeps fruit visible has to measure the
 * DRAWING rather than the config, or repainting a mask smaller would quietly
 * shrink the fruit back out of sight, which is how it was invisible the first
 * time. Reading the table is the same guarantee the old regex over this file
 * gave, minus the regex.
 */
export function fruitClusterSpan(shape) {
    const s = FRUIT_SHAPES[shape] || FRUIT_SHAPES.apple;
    return Math.max(...s.bodies.map((b) => b.x + b.r))
        - Math.min(...s.bodies.map((b) => b.x - b.r));
}

/**
 * Trace one fruit's outline, leaving the path open for `fill` or `clip`.
 *
 * A pear is A CHAIN OF OVERLAPPING CIRCLES rather than a bezier, because the
 * profile is far easier to read as arithmetic than as four control points, and
 * the union of the arcs fills exactly the same silhouette under the nonzero
 * rule that a single closed outline would.
 */
function traceFruitBody(ctx, shape, b, size, mid, grow = 1) {
    const cx = mid + b.x * size;
    const cy = b.y * size;
    const r = b.r * size;
    ctx.beginPath();
    if (shape.kind === 'pear') {
        const neckY = cy - shape.axis * r;
        for (let i = 0; i <= 12; i++) {
            const s = i / 12;
            const y = neckY + (cy - neckY) * s;
            // Slow at the neck, quick into the belly. The exponent is the only
            // thing here that decides whether it reads as a pear or as a bulb.
            const rad = r * (shape.neck + (1 - shape.neck) * Math.pow(s, 1.6));
            ctx.moveTo(cx + rad * grow, y);
            ctx.arc(cx, y, rad * grow, 0, Math.PI * 2);
        }
        return;
    }
    ctx.ellipse(cx, cy, r * grow, r * shape.squash * grow, 0, 0, Math.PI * 2);
}

/**
 * The fruit half of the mask, painted on its own canvas.
 *
 * ITS OWN CANVAS IS NOT TIDINESS, it is what buys the two effects below. The
 * shared mask composites with `lighter` so that blossom and fruit cannot erase
 * each other, and `lighter` also means a gradient would ADD to whatever it was
 * drawn over and a cut would do nothing at all. On a layer of its own the fruit
 * can use `destination-out` for the stem well and a clipped gradient for the
 * roundness, and the finished layer still arrives at the shared canvas as one
 * `lighter` composite.
 */
function drawFruitLayer(shape, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const mid = size / 2;

    // ---- The bodies, in GREEN ----------------------------------------------
    ctx.fillStyle = 'rgb(0,255,0)';
    for (const b of shape.bodies) {
        traceFruitBody(ctx, shape, b, size, mid);
        ctx.fill();
    }

    // ---- Roundness, painted into the BLUE channel ---------------------------
    // THE CARD IS A FLAT QUAD AND NOTHING WILL EVER LIGHT IT AS A SPHERE. Its
    // normal faces the camera, so a lit apple is a disc of one colour, which is
    // the other half of why the old cluster read as a blob. Rather than pay for
    // a normal map on a card that is nine pixels across, the shading is BAKED
    // into the one channel this mask has spare: red carries the blossom, green
    // carries the fruit, and blue was empty. `wrapFruitFragment` multiplies by
    // it, and the whole effect costs nothing beyond a mix.
    ctx.globalCompositeOperation = 'lighter';
    for (const b of shape.bodies) {
        const cx = mid + b.x * size;
        const cy = b.y * size;
        const r = b.r * size;
        // Sun from over the visitor's left shoulder. The pear's gradient is
        // stretched up its neck, or the neck sits outside the falloff entirely
        // and comes back flat.
        const pear = shape.kind === 'pear';
        const fx = cx - r * (pear ? 0.32 : 0.34);
        const fy = cy - r * (pear ? 0.85 : 0.36);
        const g = ctx.createRadialGradient(
            fx, fy, r * 0.05,
            cx, cy - (pear ? r * 0.50 : 0), r * (pear ? 1.90 : 1.30));
        // Stops chosen AFTER the sRGB decode the sampler applies, not before:
        // 190 arrives at the shader as 0.53 and 105 as 0.14, which puts the
        // body between about 0.8 and 1.26 of its own colour.
        g.addColorStop(0, 'rgb(0,0,255)');
        g.addColorStop(0.45, 'rgb(0,0,190)');
        g.addColorStop(1, 'rgb(0,0,105)');
        ctx.save();
        // CLIPPED WIDE, ON PURPOSE. A card this small is sampled from a mip of
        // 8 px or so, where every texel over the edge of a fruit averages in
        // the empty space around it. Stopping the shading exactly at the
        // silhouette therefore does not give a clean edge, it gives a fruit
        // that dims as it recedes, and this scene has already spent a lot of
        // care on fruit being a different colour from the leaves. Painting the
        // falloff a little past the outline costs nothing (the green channel
        // is zero out there, so none of it is ever drawn) and keeps the
        // average honest at every level.
        traceFruitBody(ctx, shape, b, size, mid, 1.16);
        ctx.clip();
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
        ctx.restore();
    }

    // ---- The stem well, cut out of the crown --------------------------------
    // An apple and a cherry are both dimpled where the stalk goes in, and at
    // this size that notch is most of what separates them from a berry.
    if (shape.dimple) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgb(0,0,0)';
        for (const b of shape.bodies) {
            const cx = mid + b.x * size;
            const cy = b.y * size;
            const r = b.r * size;
            ctx.beginPath();
            ctx.ellipse(cx, cy - r * shape.squash, r * shape.dimple,
                r * shape.dimple * 0.62, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ---- Pedicels, drawn LAST so they can end inside the well ----------------
    // CURVED, AND SPREAD AT THE TOP. Three straight lines converging on one
    // point is a wedge, and a wedge is what the old card looked like from any
    // distance at which the fruit itself was small. Each stalk leaves the spur
    // near its own fruit's side and bends outward under the weight, which is
    // both what a pedicel does and what keeps the top of the card open.
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgb(0,255,0)';
    ctx.lineCap = 'round';
    ctx.lineWidth = shape.stalk * size;
    for (const b of shape.bodies) {
        const x0 = mid + b.x * 0.30 * size;
        const y0 = shape.node * size;
        const x1 = mid + b.x * size;
        const y1 = (b.y - b.r * shape.enter) * size;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(x0 + (x1 - x0) * 0.22, y0 + (y1 - y0) * 0.70, x1, y1);
        ctx.stroke();
    }
    return canvas;
}

/**
 * The blossom and fruit mask, drawn once per fruit shape and shared by the
 * scene.
 *
 * TWO SHAPES, TWO CHANNELS, ONE UPLOAD PER SPECIES THAT BEARS. Blossom goes in
 * red and fruit in green, composited with `lighter` so drawing one does not
 * erase the other where they overlap, and blue carries the shading. Cached and
 * never disposed, exactly like `leafClusterTexture`, so sixteen apple trees
 * still cost one upload and no two of them can disagree about what an apple
 * looks like. Callers must NOT dispose it.
 *
 * THE BLOSSOM IS THE SAME DRAWING IN EVERY ONE OF THEM, deliberately. Five
 * petals at this size is five petals, the four species already differ by
 * colour, and one shared flower is what lets a tree flower and fruit from a
 * single mesh and a single draw call.
 *
 * The card is anchored at its BASE and `CanvasTexture` flips y by default, so
 * canvas row 0 is the top of the card. Hence the stalk at the top and the fruit
 * hanging below it, which is the way round fruit actually hangs.
 */
const fruitMasks = new Map();
export function blossomFruitTexture(shape = 'apple', size = 128) {
    const key = FRUIT_SHAPES[shape] ? shape : 'apple';
    if (fruitMasks.has(key)) return fruitMasks.get(key);
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const random = makeRandom(0xB105);

    ctx.clearRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    const mid = size / 2;

    // ---- Blossom, in RED: a small cluster of five-petal flowers -------------
    ctx.fillStyle = 'rgba(255,0,0,1)';
    for (let i = 0; i < 5; i++) {
        const a = random() * Math.PI * 2;
        const rr = Math.sqrt(random()) * 0.26;
        const cx = mid + Math.cos(a) * rr * size;
        const cy = mid + Math.sin(a) * rr * size;
        const petal = size * (0.070 + random() * 0.030);
        const spin = random() * Math.PI * 2;
        for (let k = 0; k < 5; k++) {
            const t = spin + (k / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(t) * petal * 0.95, cy + Math.sin(t) * petal * 0.95,
                petal * 0.62, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ---- Fruit, in GREEN: a CLUSTER, never a single fruit --------------------
    // TWO OR THREE RATHER THAN ONE, AND THAT IS A LEGIBILITY DECISION BEFORE
    // IT IS A BOTANICAL ONE. A single fruit drawn at life size is 2.8 px at the
    // composed camera, which is below the size at which anything reads at all,
    // and the first version of this drew one fruit filling less than half a
    // card and measured 1.6 px. See the note on `garden.fruit.size`.
    //
    // It is also true: apples, pears, oranges and cherries all set in clusters
    // of two to five. So the card is a cluster exactly as a leaf card is a
    // clump of nine leaves, the individual fruit inside it stay close to life
    // size relative to the cluster, and what carries at distance is the mass
    // and the colour rather than the outline of any one of them. What the
    // shapes in `FRUIT_SHAPES` buy is the near view, where the outline is
    // suddenly all a visitor can see.
    const layer = drawFruitLayer(FRUIT_SHAPES[key], size);
    if (layer) ctx.drawImage(layer, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    fruitMasks.set(key, texture);
    return texture;
}

/**
 * Give a material the garden's vertex program.
 *
 * Applied to the visible material AND to a matching MeshDepthMaterial, because
 * three renders the shadow pass with a different material entirely, and a tree
 * that grows only in the colour pass casts its adult shadow from the day it is
 * planted.
 *
 * ---- WHY THE `key` ARGUMENT IS NOT OPTIONAL ----
 *
 * three caches compiled programs, and for a built-in material modified through
 * onBeforeCompile the default cache key is literally
 * `this.onBeforeCompile.toString()`. This helper is one function, so every
 * material that passes through it produces the SAME string, however different
 * the `head` and `body` it closed over. Without an explicit key, three hands
 * the leaf depth material the bark's compiled program: the console fills with
 * "uniform location not for current program" every frame, the wrong attributes
 * are demanded of the wrong geometry, and, quietly, onBeforeCompile is never
 * run for the second material, so its uniforms never reach a shader at all.
 *
 * Every distinct shader source needs its own key. Two trees sharing a key is
 * correct and wanted: same source, different uniform values, one program.
 */
/**
 * Splice a vertex-shader block into a stock material.
 *
 * EXPORTED so the wood outside the wall uses the SAME mechanism the planted
 * trees do. Two injectors would be two answers to how a branch bends.
 *
 * `key` is not optional and not decoration: three's default program cache key
 * is literally `onBeforeCompile.toString()`, so two materials sharing this
 * helper stringify identically and the second is handed the first one's
 * compiled program. That cost this project a day once already.
 */
export function patchVertex(material, uniforms, head, body, key) {
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${head}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>\n${body}`);
        material.userData.shader = shader;
    };
    material.customProgramCacheKey = () => key;
    return material;
}

// ---- Building a tree -------------------------------------------------------

/**
 * Assemble a planted tree: one bark mesh, one instanced leaf mesh, and the
 * uniform block that drives both.
 *
 * Two draw calls per tree and two shader programs for the whole garden: every
 * tree gets its OWN material instances so growth, health, and bark colour can
 * differ, but they all share identical shader source, so three compiles the
 * program once and reuses it.
 */
export function createTree(resolved, seed, options = {}) {
    const T = GARDEN_CONFIG.tree;
    const maxSegments = options.mobile ? T.maxSegmentsMobile : T.maxSegments;

    const skeleton = buildSkeleton(resolved, seed, { maxSegments });
    const leaves = buildLeaves(skeleton, resolved, seed);

    const group = new THREE.Group();
    group.name = `tree-${resolved.id}`;

    const barkUniforms = {
        uGrowth: { value: 0.05 },
        uSpan: { value: skeleton.emergeSpan },
        uScale: { value: T.saplingScale },
        uThick: { value: T.saplingThickness },
        uWind: { value: new THREE.Vector3(0, 0, 0) },
        uTime: { value: 0 },
        uPhase: { value: (seed % 1000) / 1000 * Math.PI * 2 },
        // The tree's own size, so sway is a fraction of the tree rather than a
        // number of metres. See the note in BARK_BODY.
        uSwayScale: { value: resolved.matureHeight * T.swayPerMetre },
        // 1 normally, damped by reduced motion. Never 0: see config.tree.
        uMotion: { value: 1 }
    };

    const barkGeo = bakeGeometry(skeleton);
    const barkMaterial = new THREE.MeshStandardMaterial({
        color: resolved.bark,
        roughness: 0.94,
        metalness: 0
    });
    patchVertex(barkMaterial, barkUniforms, BARK_HEAD, BARK_BODY, 'garden-bark');
    barkMaterial.onBeforeCompile = wrapBarkFragment(barkMaterial.onBeforeCompile);

    const bark = new THREE.Mesh(barkGeo, barkMaterial);
    bark.castShadow = true;
    bark.receiveShadow = true;
    bark.customDepthMaterial = patchVertex(
        new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }),
        barkUniforms, BARK_HEAD, BARK_BODY, 'garden-bark-depth'
    );
    group.add(bark);

    // ---- Leaves ------------------------------------------------------------
    const leafUniforms = {
        uGrowth: barkUniforms.uGrowth,
        uLeafScale: { value: 0 },
        uDrop: { value: 0 },
        uBud: { value: 0 },
        uWind: barkUniforms.uWind,
        uSwayScale: barkUniforms.uSwayScale,
        uMotion: barkUniforms.uMotion,
        uFlutterRate: { value: T.leafFlutter.rate },
        uFlutterAlong: { value: T.leafFlutter.along },
        uFlutterCross: { value: T.leafFlutter.cross },
        uTime: barkUniforms.uTime,
        uPhase: barkUniforms.uPhase,
        uTremble: { value: resolved.tremble || 0 },
        uScale: barkUniforms.uScale
    };

    const leafGeo = buildLeafCard();
    const count = leaves.length;
    // The mask carries the leaf shape. Note that `wrapLeafFragment` writes only
    // `diffuseColor.rgb` and hooks `#include <map_fragment>`, so the texture's
    // ALPHA passes through it untouched and reaches `alphatest_fragment`. That
    // is why this needs no shader change: the seam was always there.
    const leafTexture = leafClusterTexture();
    const leafMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: leafTexture,
        alphaTest: T.leafAlphaTest,
        roughness: 0.85,
        metalness: 0,
        side: THREE.DoubleSide
    });
    patchVertex(leafMaterial, leafUniforms, LEAF_HEAD, LEAF_BODY, 'garden-leaf');
    leafMaterial.onBeforeCompile = wrapLeafFragment(leafMaterial.onBeforeCompile);

    const leafMesh = new THREE.InstancedMesh(leafGeo, leafMaterial, Math.max(1, count));
    leafMesh.castShadow = true;
    leafMesh.receiveShadow = true;
    // THE DEPTH MATERIAL NEEDS THE SAME MASK AND THRESHOLD. Without them the
    // leaves stop being rectangles while their shadows carry on being
    // rectangles, which is more obviously wrong than the original bug.
    leafMesh.customDepthMaterial = patchVertex(
        new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            map: leafTexture,
            alphaTest: T.leafAlphaTest
        }),
        leafUniforms, LEAF_HEAD, LEAF_BODY, 'garden-leaf-depth'
    );

    const birth = new Float32Array(Math.max(1, count));
    const drop = new Float32Array(Math.max(1, count));
    const tint = new Float32Array(Math.max(1, count));
    const phase = new Float32Array(Math.max(1, count));
    const leafSway = new Float32Array(Math.max(1, count));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
        const leaf = leaves[i];
        p.set(leaf.x, leaf.y, leaf.z);
        e.set(leaf.pitch, leaf.yaw, 0);
        q.setFromEuler(e);
        // The mask paints roughly the middle half of the quad, so a card sized
        // as before would read SMALLER than the bare rectangle it replaces.
        // See the note on tree.leafCardScale.
        const card = leaf.size * T.leafCardScale;
        s.set(card, card, card);
        m.compose(p, q, s);
        leafMesh.setMatrixAt(i, m);
        birth[i] = leaf.birth;
        drop[i] = leaf.drop;
        tint[i] = leaf.tint;
        phase[i] = leaf.phase;
        leafSway[i] = leaf.sway;
    }
    leafMesh.instanceMatrix.needsUpdate = true;
    leafGeo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(birth, 1));
    leafGeo.setAttribute('aDrop', new THREE.InstancedBufferAttribute(drop, 1));
    leafGeo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 1));
    leafGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    leafGeo.setAttribute('aLeafSway', new THREE.InstancedBufferAttribute(leafSway, 1));
    // The instanced bounding sphere is computed from the card, not the canopy,
    // so a tree would be culled the moment its origin left the frustum.
    leafMesh.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, skeleton.height * 0.6, 0), skeleton.height);
    leafMesh.frustumCulled = false;

    group.add(leafMesh);

    // ---- Blossom and fruit -------------------------------------------------
    // Only for the species that carry a schedule, so twelve of the sixteen pay
    // nothing at all: no mesh, no material, no draw call.
    let fruitMesh = null;
    let fruitMaterial = null;
    let fruitUniforms = null;
    let fruitCount = 0;
    const fruit = buildFruit(leaves, resolved, seed);

    if (fruit && fruit.anchors.length) {
        fruitCount = fruit.anchors.length;
        // SHARED BY REFERENCE, NOT COPIED, and that is the Addendum B invariant
        // rather than a tidiness. One wind vector, one clock, one phase, one
        // growth: copies would agree until the day somebody updated one of
        // them, and the symptom would be blossom sliding through its own
        // canopy in a gust.
        fruitUniforms = {
            uGrowth: barkUniforms.uGrowth,
            uWind: barkUniforms.uWind,
            uTime: barkUniforms.uTime,
            uPhase: barkUniforms.uPhase,
            uScale: barkUniforms.uScale,
            uSwayScale: barkUniforms.uSwayScale,
            uMotion: barkUniforms.uMotion,
            uBloom: { value: 0 },
            uFruitSize: { value: 0 },
            uRipe: { value: 0 },
            uFruitDrop: { value: 0 },
            uCrop: { value: 0 },
            uFruitShare: { value: fruit.fruitShare },
            // 1 while the petals are coming off, small once it is fruit.
            uPetalDrift: { value: 1 }
        };

        const fruitGeo = buildLeafCard();
        // A tree that flowers and sets nothing (the dogwood) has no shape of its
        // own and needs none: the blossom drawing is shared, and its fruit share
        // is zero, so the green channel it is handed is never sampled.
        const fruitTexture = blossomFruitTexture(resolved.fruit && resolved.fruit.shape);
        fruitMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: fruitTexture,
            // The mask is drawn at full opacity, so this is a shape threshold
            // rather than an erosion. Nothing here fades the way a canopy does.
            alphaTest: 0.5,
            roughness: 0.62,
            metalness: 0,
            side: THREE.DoubleSide
        });
        patchVertex(fruitMaterial, fruitUniforms, FRUIT_HEAD, FRUIT_BODY, 'garden-fruit');
        fruitMaterial.onBeforeCompile = wrapFruitFragment(fruitMaterial.onBeforeCompile);

        fruitMesh = new THREE.InstancedMesh(fruitGeo, fruitMaterial, fruitCount);
        fruitMesh.name = `fruit-${resolved.id}`;
        // NO SHADOW, DELIBERATELY. A shadow pass would need a second patched
        // depth material per fruit tree for cards that are a few pixels across
        // and sit inside a canopy that is already shadowing the ground.
        fruitMesh.castShadow = false;
        fruitMesh.receiveShadow = true;
        fruitMesh.raycast = () => {};

        const fBirth = new Float32Array(fruitCount);
        const fDrop = new Float32Array(fruitCount);
        const fCrop = new Float32Array(fruitCount);
        const fRole = new Float32Array(fruitCount);
        const fPhase = new Float32Array(fruitCount);
        const fSway = new Float32Array(fruitCount);
        const fSize = GARDEN_CONFIG.garden.fruit.size * (resolved.fruitSize || 1);

        for (let i = 0; i < fruitCount; i++) {
            const a = fruit.anchors[i];
            p.set(a.x, a.y, a.z);
            e.set(0, a.yaw, 0);
            q.setFromEuler(e);
            s.set(fSize, fSize, fSize);
            m.compose(p, q, s);
            fruitMesh.setMatrixAt(i, m);
            fBirth[i] = a.birth;
            fDrop[i] = a.drop;
            fCrop[i] = a.crop;
            fRole[i] = a.role;
            fPhase[i] = a.phase;
            fSway[i] = a.sway;
        }
        fruitMesh.instanceMatrix.needsUpdate = true;
        fruitGeo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(fBirth, 1));
        fruitGeo.setAttribute('aDrop', new THREE.InstancedBufferAttribute(fDrop, 1));
        fruitGeo.setAttribute('aCrop', new THREE.InstancedBufferAttribute(fCrop, 1));
        fruitGeo.setAttribute('aRole', new THREE.InstancedBufferAttribute(fRole, 1));
        fruitGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(fPhase, 1));
        fruitGeo.setAttribute('aFruitSway', new THREE.InstancedBufferAttribute(fSway, 1));
        // Same reason as the leaves': the instanced bounding sphere comes from
        // one card, so the whole canopy would cull the moment the origin left.
        fruitMesh.boundingSphere = new THREE.Sphere(
            new THREE.Vector3(0, skeleton.height * 0.6, 0), skeleton.height);
        fruitMesh.frustumCulled = false;
        group.add(fruitMesh);
    }

    return {
        group,
        bark,
        leafMesh,
        fruitMesh,
        barkUniforms,
        leafUniforms,
        fruitUniforms,
        barkMaterial,
        leafMaterial,
        fruitMaterial,
        skeleton,
        leafCount: count,
        fruitCount,
        // Which drawing from `FRUIT_SHAPES` this tree was handed, for the debug
        // probe. Two species quietly sharing a mask is invisible in a
        // screenshot and one line here.
        fruitShape: (resolved.fruit && resolved.fruit.shape) || 'none',
        counts: barkGeo.userData.counts
    };
}

/**
 * A crossed pair of quads, so a leaf cluster has volume from any angle.
 *
 * IT CARRIES UVs BECAUSE THE SHAPE COMES FROM AN ALPHA MASK. This used to be a
 * bare quad, on the reasoning that a clustered card needs no texture, and at
 * the composed camera the QA screenshots showed the result plainly: a mature
 * canopy of hard-edged rectangles with sky straight through it. A leaf card is
 * about five pixels across from 23 m, and at five pixels the only thing that
 * separates foliage from confetti is its outline.
 */
function buildLeafCard() {
    const geo = new THREE.BufferGeometry();
    const h = 0.5;
    const position = new Float32Array([
        -h, 0, 0, h, 0, 0, h, 2 * h, 0, -h, 2 * h, 0,
        0, 0, -h, 0, 0, h, 0, 2 * h, h, 0, 2 * h, -h
    ]);
    const normal = new Float32Array([
        0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
        1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0
    ]);
    const uv = new Float32Array([
        0, 0, 1, 0, 1, 1, 0, 1,
        0, 0, 1, 0, 1, 1, 0, 1
    ]);
    const index = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    return geo;
}

/**
 * The leaf mask: a clump of leaves drawn once into a canvas.
 *
 * ONE TEXTURE FOR THE WHOLE SCENE, cached and never disposed. Every planted
 * tree and every tier of the wood outside the wall shares it, so a canopy
 * cannot disagree with itself about what a leaf clump looks like, and sixteen
 * trees cost one 64 by 64 upload rather than sixteen. Callers must NOT dispose
 * it: it outlives any one tree.
 *
 * White, so the season's colour can tint it, and with soft alpha so the same
 * `alphaTest` erosion the far wood uses can strip it for winter. There is no
 * trunk in it, unlike the far forest's canopy silhouette, because these sit on
 * real branches that are already drawn.
 */
let leafMask = null;
// 256 RATHER THAN 64, BECAUSE THE VISITOR CAN NOW WALK UP TO IT (M9-5). Every
// radius below is a fraction of `size`, so the drawing and its alpha
// distribution are unchanged and `bareAlphaTest` still means what it meant.
// What changes is how close the eye can get before the blob turns to mush.
// Measured against a 1280x800 frame: the widest leaf card in the scene, a Bur
// Oak's at 0.425 m, covered 14.7 px at the composed camera and covers 94 px on
// a tree 3.4 m from the eye at the close end of the dolly. At 64 the painted
// blob is about 32 texels, so that was a threefold magnification of a thumbnail.
// One cached texture serves the whole scene, so this costs 256 KB of VRAM once.
export function leafClusterTexture(size = 256) {
    if (leafMask) return leafMask;
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const random = makeRandom(0x1EAF5);

    ctx.clearRect(0, 0, size, size);
    const mid = size / 2;
    for (let i = 0; i < 9; i++) {
        const a = random() * Math.PI * 2;
        const rr = Math.sqrt(random()) * 0.30;
        const r = size * (0.11 + random() * 0.10);
        ctx.fillStyle = `rgba(255,255,255,${0.62 + random() * 0.30})`;
        ctx.beginPath();
        ctx.ellipse(mid + Math.cos(a) * rr * size, mid + Math.sin(a) * rr * size,
            r, r * (0.62 + random() * 0.4), a, 0, Math.PI * 2);
        ctx.fill();
    }

    leafMask = new THREE.CanvasTexture(canvas);
    leafMask.colorSpace = THREE.SRGBColorSpace;
    return leafMask;
}

/** Bark colour: snow on the upward faces, and a grey cast as health goes. */
function wrapBarkFragment(previous) {
    return (shader) => {
        if (previous) previous(shader);
        shader.uniforms.uSnow = shader.uniforms.uSnow || { value: 0 };
        shader.uniforms.uSnowColor = shader.uniforms.uSnowColor || { value: new THREE.Vector3(0.93, 0.96, 0.99) };
        shader.uniforms.uHealth = shader.uniforms.uHealth || { value: 1 };
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
uniform float uSnow;
uniform vec3 uSnowColor;
uniform float uHealth;
varying vec3 vBarkNormal;
varying float vBarkHeight;`)
            .replace('#include <map_fragment>', `#include <map_fragment>
    // Snow settles on what faces up. Squared, so it gathers on the tops of
    // limbs and leaves the undersides bare, which is what makes it read as
    // snow lying rather than as a tree painted white.
    float barkUp = clamp(vBarkNormal.y, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, uSnow * barkUp * barkUp * 0.85);
    // Failing bark greys out rather than going dark, which is what dead wood
    // actually does.
    float barkGrey = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    diffuseColor.rgb = mix(vec3(barkGrey) * 0.86, diffuseColor.rgb, uHealth);`);
    };
}

/** Leaf colour: the season, the per-leaf tint variation, health, and the bud
 *  reward, all in the fragment stage. */
function wrapLeafFragment(previous) {
    return (shader) => {
        if (previous) previous(shader);
        const u = shader.uniforms;
        u.uSpringColor = u.uSpringColor || { value: new THREE.Vector3(0.5, 0.7, 0.3) };
        u.uSummerColor = u.uSummerColor || { value: new THREE.Vector3(0.3, 0.5, 0.2) };
        u.uAutumnColor = u.uAutumnColor || { value: new THREE.Vector3(0.8, 0.4, 0.15) };
        u.uBudColor = u.uBudColor || { value: new THREE.Vector3(0.55, 0.85, 0.35) };
        u.uColorMix = u.uColorMix || { value: 0 };
        u.uSpringMix = u.uSpringMix || { value: 0 };
        u.uHealth = u.uHealth || { value: 1 };
        u.uSnow = u.uSnow || { value: 0 };
        u.uSnowColor = u.uSnowColor || { value: new THREE.Vector3(0.93, 0.96, 0.99) };

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
uniform vec3 uSpringColor;
uniform vec3 uSummerColor;
uniform vec3 uAutumnColor;
uniform vec3 uBudColor;
uniform float uColorMix;
uniform float uSpringMix;
uniform float uHealth;
uniform float uSnow;
uniform vec3 uSnowColor;
varying float vLeafTint;
varying float vLeafFall;
varying float vLeafBud;`)
            .replace('#include <map_fragment>', `#include <map_fragment>
    vec3 leafCol = mix(uSummerColor, uAutumnColor, uColorMix);
    leafCol = mix(leafCol, uSpringColor, uSpringMix);
    // Per leaf variation, seeded, so a canopy of one species is still a
    // canopy of individuals rather than one flat swatch.
    leafCol *= 0.86 + vLeafTint * 0.28;
    // A failing canopy yellows and dulls rather than simply darkening.
    leafCol = mix(mix(leafCol, vec3(0.62, 0.58, 0.32), 0.7) * 0.8, leafCol, uHealth);
    // The bud reward wins over everything, in any season.
    leafCol = mix(leafCol, uBudColor, vLeafBud);
    leafCol = mix(leafCol, uSnowColor, uSnow * 0.45);
    diffuseColor.rgb = leafCol;`);
    };
}

/**
 * Drive one tree for a frame. Six uniform writes and no CPU walk of anything.
 *
 * @param {object} tree     from createTree
 * @param {object} view     { growth, health, leaf, color, spring, drop, bud,
 *                            snow, wind, time }
 */
export function updateTree(tree, view, resolved) {
    const T = GARDEN_CONFIG.tree;
    const b = tree.barkUniforms;
    const l = tree.leafUniforms;

    const ease = view.growth * view.growth * (3 - 2 * view.growth);
    b.uGrowth.value = view.growth;
    b.uScale.value = T.saplingScale + (1 - T.saplingScale) * ease;
    // A young tree is a proportionally SLENDER trunk and a mature one a stout
    // one, so thickness runs on its own curve rather than following scale.
    b.uThick.value = T.saplingThickness + (1 - T.saplingThickness) * Math.pow(view.growth, 0.75);
    b.uTime.value = view.time;
    b.uWind.value.set(view.wind.x, 0, view.wind.z);
    // Shared with the leaf material, so a damped tree cannot have undamped
    // leaves. Absent means full motion, never none.
    b.uMotion.value = view.motion === undefined ? 1 : view.motion;

    l.uLeafScale.value = view.leaf;
    l.uDrop.value = view.drop;
    l.uBud.value = view.bud;

    const barkShader = tree.barkMaterial.userData.shader;
    if (barkShader) {
        barkShader.uniforms.uSnow.value = view.snow;
        barkShader.uniforms.uHealth.value = view.health;
    }
    const leafShader = tree.leafMaterial.userData.shader;
    if (leafShader) {
        const u = leafShader.uniforms;
        u.uColorMix.value = view.color;
        u.uSpringMix.value = view.spring;
        u.uHealth.value = view.health;
        u.uSnow.value = resolved.evergreen ? view.snow : view.snow * 0.3;
        setVec(u.uSpringColor.value, tintColor(resolved.foliage.spring, resolved.tint));
        setVec(u.uSummerColor.value, tintColor(resolved.foliage.summer, resolved.tint));
        setVec(u.uAutumnColor.value, tintColor(resolved.foliage.autumn, resolved.tint));
    }

    // ---- Blossom and fruit -------------------------------------------------
    // Four more uniform writes, and only on the four species that have any.
    if (tree.fruitUniforms && view.fruit) {
        const f = tree.fruitUniforms;
        const stage = view.fruit;
        f.uBloom.value = stage.bloom;
        f.uFruitSize.value = stage.size;
        f.uRipe.value = stage.ripe;
        f.uFruitDrop.value = stage.drop;
        f.uCrop.value = view.crop;
        // PETALS DRIFT AND FRUIT DOES NOT. The blossom stage gets the full
        // sideways travel a falling leaf gets, and a windfall apple goes
        // more or less straight down.
        f.uPetalDrift.value = stage.bloom > 0 ? 1 : 0.18;

        const fruitShader = tree.fruitMaterial.userData.shader;
        if (fruitShader) {
            const u = fruitShader.uniforms;
            u.uSnow.value = view.snow;
            setVec(u.uBlossomColor.value, resolved.blossom || 0xffffff);
            if (resolved.fruit) {
                setVec(u.uUnripeColor.value, resolved.fruit.unripe);
                setVec(u.uRipeColor.value, resolved.fruit.ripe);
            }
        }
    }
}

/**
 * A colour into a shader uniform, CONVERTED TO LINEAR on the way.
 *
 * three renders in linear and encodes at output. `material.color.setHex()`
 * converts for you and the pond shader converts explicitly with
 * `gardenSrgbToLinear`, but this went in raw: the sRGB digits of the hex were
 * written straight into `diffuseColor`, which the renderer then treats as
 * linear. The effect is that every leaf colour rendered LIGHTER and FLATTER
 * than the hex it was authored as, and it only became obvious when a dark red
 * Japanese Maple came out salmon pink. A green is forgiving about this. A
 * saturated dark colour is not.
 *
 * Same family as the ocean's "colour solves need the encode": the pipeline has
 * four stages and skipping one does not fail, it just quietly renders a
 * different colour than the one written down.
 */
function setVec(vec, hex) {
    const [r, g, b] = unpackColor(hex).map(srgbToLinear);
    vec.set(r, g, b);
}

export function disposeTree(tree) {
    if (!tree) return;
    tree.bark.geometry.dispose();
    tree.barkMaterial.dispose();
    tree.leafMesh.geometry.dispose();
    tree.leafMaterial.dispose();
    if (tree.bark.customDepthMaterial) tree.bark.customDepthMaterial.dispose();
    if (tree.leafMesh.customDepthMaterial) tree.leafMesh.customDepthMaterial.dispose();
    // The geometry and the material are this tree's own. The MASK is shared by
    // the whole scene and outlives any one tree, so it is deliberately not
    // disposed here, exactly as with `leafClusterTexture`.
    if (tree.fruitMesh) {
        tree.fruitMesh.geometry.dispose();
        tree.fruitMaterial.dispose();
    }
}
