// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * terrain.js - The plot: ground, wall, and the planting grid.
 *
 * Split the way the rest of this scene is split. The height field, the grid
 * arithmetic, and the seasonal grass colour are pure and exported; the mesh
 * building is imperative and does no arithmetic worth asserting.
 *
 * ONE HEIGHT FUNCTION, EVALUATED ONCE. `heightAt` is the single source of the
 * ground's shape. It is called at build time to displace the mesh vertices and
 * at run time to sit a tree trunk or a wall stone on the surface, and there is
 * deliberately no second copy of it in a shader: the plot mesh is static, so
 * the displacement is baked rather than computed per frame. Two functions that
 * had to be kept in agreement would drift, and the symptom would be trees
 * floating a few centimetres off ground that looked perfectly fine.
 *
 * THE RELIEF FADES TO NOTHING AT THE PLOT EDGE. That is what lets the rolling
 * plot meet the flat ground beyond it at exactly y = 0, with no seam to cover
 * and no crack between two meshes at different resolutions. It also means the
 * outermost planting row is level, and it is what a walled garden looks like
 * anyway.
 */

import { GARDEN_CONFIG } from './config.min.js';
import { bracketKeys, mixColor, packColor, unpackColor } from './sky.min.js';

// ---- The height field (pure) -----------------------------------------------

/**
 * How much of the relief applies at a point, 1 across the middle of the plot
 * and 0 from the boundary outward. Uses the Chebyshev distance (the larger of
 * |x| and |z|) so the flat border follows the square plot rather than a circle
 * inscribed in it.
 */
export function edgeDamp(x, z, terrain = GARDEN_CONFIG.terrain, plot = GARDEN_CONFIG.plot) {
    const m = Math.max(Math.abs(x), Math.abs(z));
    const inner = terrain.edgeFlatFrom;
    const outer = plot.halfSize;
    if (m <= inner) return 1;
    if (m >= outer) return 0;
    const t = (m - inner) / (outer - inner);
    // Smoothstep rather than a straight ramp, so the transition has no crease
    // in it for a grazing sun to pick out.
    return 1 - t * t * (3 - 2 * t);
}

/** The ground height at a point, in metres. Zero at and beyond the plot edge. */
export function heightAt(x, z, terrain = GARDEN_CONFIG.terrain, plot = GARDEN_CONFIG.plot) {
    const damp = edgeDamp(x, z, terrain, plot);
    if (damp <= 0) return 0;
    let h = 0;
    for (const w of terrain.relief) {
        h += w.amp * Math.sin(x * w.fx + z * w.fz + w.phase);
    }
    return h * damp;
}

/**
 * The surface normal at a point, as a unit vector.
 *
 * Central differences rather than an analytic derivative, because `heightAt`
 * is a product of the relief and the edge damp and differentiating the pair by
 * hand is a good way to get a subtly wrong normal that only shows up as odd
 * shading in the border. At a quarter-metre mesh and wavelengths of tens of
 * metres, the difference from the true derivative is far below anything the
 * shading could reveal.
 */
export function normalAt(x, z, terrain = GARDEN_CONFIG.terrain, plot = GARDEN_CONFIG.plot) {
    const e = 0.05;
    const dx = (heightAt(x + e, z, terrain, plot) - heightAt(x - e, z, terrain, plot)) / (2 * e);
    const dz = (heightAt(x, z + e, terrain, plot) - heightAt(x, z - e, terrain, plot)) / (2 * e);
    const len = Math.hypot(-dx, 1, -dz);
    return { x: -dx / len, y: 1 / len, z: -dz / len };
}

/**
 * The relief of the world OUTSIDE the plot.
 *
 * The exact mirror of `edgeDamp`: that one flattens the plot's own relief as it
 * approaches the boundary, and this one holds the outer world flat at the
 * boundary and lets it rise as it goes away. The two meet at exactly zero, so
 * the seam that `heightAt` was built to avoid stays perfect while the meadow
 * beyond it still rolls.
 *
 * Long wavelengths on purpose. This ground is 30 to 120 metres away and any
 * detail in it is smaller than a pixel.
 */
export function outerWavesAt(x, z, world = GARDEN_CONFIG.world) {
    const O = world.outerRelief;
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (m <= O.rampFrom) return 0;
    const t = Math.min(1, (m - O.rampFrom) / O.rampOver);
    const ramp = t * t * (3 - 2 * t);
    let h = 0;
    for (const w of O.waves) {
        h += w.amp * Math.sin(x * w.fx + z * w.fz + w.phase);
    }
    return h * ramp;
}

/**
 * How deep the ground dips for the pond, in metres, zero everywhere else.
 *
 * A BASIN RATHER THAN A PLANE LAID ON A FIELD. Water sitting flat on flat
 * ground has no shoreline: the edge is wherever the mesh happens to stop, and
 * it reads as a mirror dropped on the grass. Carving a dip and then filling it
 * to a level puts the shoreline where the ground crosses the water, which
 * makes it irregular for free, because the meadow's own waves run through it.
 */
export function pondBasinAt(x, z, world = GARDEN_CONFIG.world) {
    const P = world.pond;
    if (!P) return 0;
    const dx = (x - P.x) / P.halfWidth;
    const dz = (z - P.z) / P.halfDepth;
    const r = Math.hypot(dx, dz);
    if (r >= 1) return 0;
    // Smooth all the way to the rim, so there is no crease for a low sun to
    // pick out around the shore.
    const t = 1 - r;
    return P.depth * t * t * (3 - 2 * t);
}

export function outerReliefAt(x, z, world = GARDEN_CONFIG.world) {
    return outerWavesAt(x, z, world) - pondBasinAt(x, z, world);
}

/**
 * The height the water sits at.
 *
 * Taken from the un-dug ground at the pond's centre, less part of the basin
 * depth, so the pond is filled rather than brim full and there is a band of
 * damp shore between the water and the grass.
 */
export function pondWaterLevel(world = GARDEN_CONFIG.world) {
    const P = world.pond;
    return outerWavesAt(P.x, P.z, world) - P.depth * P.fill;
}

/**
 * The ground height anywhere in the world.
 *
 * ONE FUNCTION FOR EVERYTHING THAT STANDS ON THE GROUND, inside the wall or
 * out. Trees, bushes, flowers, wall stones and the meadow mesh all call this,
 * so nothing can float or sink relative to anything else.
 */
export function worldHeightAt(x, z, terrain = GARDEN_CONFIG.terrain, plot = GARDEN_CONFIG.plot) {
    return heightAt(x, z, terrain, plot) + outerReliefAt(x, z);
}

/** How steep the ground is at a point, in degrees from level. */
export function slopeAt(x, z, terrain = GARDEN_CONFIG.terrain, plot = GARDEN_CONFIG.plot) {
    const n = normalAt(x, z, terrain, plot);
    return Math.acos(Math.min(1, Math.max(-1, n.y))) * 180 / Math.PI;
}

// ---- The planting grid (pure) ----------------------------------------------

/** The grid cell a world point falls in. */
export function snapToGrid(x, z, spacing = GARDEN_CONFIG.plot.gridSpacing) {
    return { gx: Math.round(x / spacing), gz: Math.round(z / spacing) };
}

/** The world point at the centre of a cell. */
export function cellCenter(gx, gz, spacing = GARDEN_CONFIG.plot.gridSpacing) {
    return { x: gx * spacing, z: gz * spacing };
}

/** A stable key for a cell, for the occupancy set. */
export function cellKey(gx, gz) {
    return `${gx},${gz}`;
}

/** Whether a cell sits inside the plantable area. Held a little inside the
 *  wall, so a mature trunk never grows through the stonework. */
export function cellInPlot(gx, gz, config = GARDEN_CONFIG) {
    const { x, z } = cellCenter(gx, gz, config.plot.gridSpacing);
    const margin = config.terrain.wall.thickness + config.plot.gridSpacing;
    const limit = config.plot.halfSize - margin;
    return Math.abs(x) <= limit && Math.abs(z) <= limit;
}

/**
 * The nearest free cell to the one asked for, searched outward in rings.
 *
 * THE INTERACTION NEVER SAYS NO. A tap that lands on an occupied cell, or just
 * outside the plantable area, resolves to the closest spot that works rather
 * than refusing and leaving the visitor to guess what was wrong with where
 * they pointed. Returns null only when the plot is genuinely full.
 *
 * @param {Set<string>} occupied  cell keys already holding a tree
 */
export function nearestFreeCell(gx, gz, occupied, maxRings = 12, config = GARDEN_CONFIG) {
    const free = (cx, cz) => cellInPlot(cx, cz, config) && !occupied.has(cellKey(cx, cz));
    if (free(gx, gz)) return { gx, gz };

    for (let r = 1; r <= maxRings; r++) {
        let best = null;
        let bestDist = Infinity;
        // Walk the ring rather than the whole square, and keep the closest by
        // true distance so a diagonal never beats a nearer orthogonal.
        for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                const cx = gx + dx;
                const cz = gz + dz;
                if (!free(cx, cz)) continue;
                const d = dx * dx + dz * dz;
                if (d < bestDist) { bestDist = d; best = { gx: cx, gz: cz }; }
            }
        }
        if (best) return best;
    }
    return null;
}

// ---- Seasonal colour (pure) ------------------------------------------------

/** The grass colour at an hour. Keyed by hour exactly like the sky, which in
 *  this garden means keyed by season: dun in winter, new green at the spring
 *  dawn, deep at the summer noon, going to straw through the autumn dusk. */
export function grassColorAt(hour, terrain = GARDEN_CONFIG.terrain) {
    const { from, to, t } = bracketKeys(hour, terrain.grassKeys);
    return packColor(mixColor(from.color, to.color, t));
}

// ---- Shader patch ----------------------------------------------------------

// Injected into a standard material so the ground keeps real lighting,
// shadows, fog, and tone mapping while gaining a seasonal colour, a mottle,
// and a patchy snow cover.
//
// THE PATCHINESS IS COMPUTED FROM THE WORLD POSITION, NOT FROM A VERTEX
// ATTRIBUTE. A smoothstep applied to an interpolated varying facets at mesh
// cell size, which on this ground would draw the snow line as a staircase of
// quarter-metre polygons. Sampling a continuous function of the interpolated
// POSITION has no such problem: the position varies smoothly and the noise
// built on it does too.
const GROUND_COMMON = `
uniform vec3 uGrassColor;
uniform vec3 uSnowColor;
uniform float uSnow;
uniform float uPatchScale;
uniform float uMottle;
varying vec3 vGardenWorld;

float gardenHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float gardenNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(gardenHash(i), gardenHash(i + vec2(1.0, 0.0)), u.x),
               mix(gardenHash(i + vec2(0.0, 1.0)), gardenHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

const GROUND_COLOR = `
    // A slow mottle so a lawn is never one flat swatch, plus a finer one for
    // close-up texture.
    float gardenCoarse = gardenNoise(vGardenWorld.xz * 0.17);
    float gardenFine = gardenNoise(vGardenWorld.xz * 1.9);
    vec3 gardenGround = uGrassColor * (1.0 + (gardenCoarse - 0.5) * 2.0 * uMottle
                                           + (gardenFine - 0.5) * uMottle * 0.6);

    // The thaw breaks up rather than fading evenly. Each piece of ground has
    // its own threshold, so the last snow sits where a real thaw leaves it.
    //
    // Named gardenThaw and not the obvious "patch": PATCH IS A RESERVED WORD
    // in GLSL ES 3.00, held for tessellation shaders, and three emits
    // "#version 300 es" on a WebGL2 context. It costs the entire fragment
    // shader, and the message says only "Illegal use of reserved word", which
    // does not hint that the culprit is a name you chose. Every identifier in
    // this block is prefixed for the same reason.
    float gardenThaw = gardenNoise(vGardenWorld.xz * uPatchScale);
    float gardenCover = smoothstep(gardenThaw * 0.55, gardenThaw * 0.55 + 0.45, uSnow);
    diffuseColor.rgb = mix(gardenGround, uSnowColor, gardenCover);
`;

// ---- Imperative side -------------------------------------------------------

let groundMesh = null;
let surroundMesh = null;
let wallMesh = null;
let groundMaterial = null;
let groundUniforms = null;
let sceneRef = null;

/**
 * The one ground material, shared by the plot and the world beyond it.
 *
 * ONE MATERIAL RATHER THAN TWO, deliberately. Both want the same grass, the
 * same season, and the same snow, so a second material would be a second
 * uniform block to keep in step and a second shader program to compile, in
 * exchange for nothing. It also sidesteps the question of whether two
 * materials injecting different uniforms into identical shader source would
 * end up sharing a cached program, which is a question with a fiddly answer
 * and no good reason to have to know it.
 */
function buildGroundMaterial(config) {
    const T = config.terrain;
    const uniforms = {
        uGrassColor: { value: new THREE.Vector3(0.3, 0.5, 0.2) },
        uSnowColor: { value: new THREE.Vector3(...unpackColor(T.snowColor)) },
        uSnow: { value: 0 },
        uPatchScale: { value: T.patchScale },
        uMottle: { value: T.mottle }
    };

    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: T.roughness,
        metalness: 0
    });

    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\nvarying vec3 vGardenWorld;`)
            // begin_vertex rather than worldpos_vertex: the latter is only
            // included when something else in the material happens to need it.
            .replace('#include <begin_vertex>',
                `#include <begin_vertex>\nvGardenWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${GROUND_COMMON}`)
            .replace('#include <map_fragment>', `#include <map_fragment>\n${GROUND_COLOR}`);
    };

    // three's default program cache key for a material modified through
    // onBeforeCompile is that function's source text. This one is unique in
    // the scene today, but naming it explicitly is the documented contract and
    // costs nothing. See the long note beside patchVertex in tree.js for what
    // leaving it to the default actually breaks.
    material.customProgramCacheKey = () => 'garden-ground';

    return { material, uniforms };
}

/**
 * Build the plot, the wall, and the ground beyond, and attach them.
 *
 * @param {THREE.Scene} scene
 * @param {object} config
 * @param {object} options { mobile: boolean }
 */
export function initTerrain(scene, config = GARDEN_CONFIG, options = {}) {
    sceneRef = scene;
    const T = config.terrain;
    const P = config.plot;
    const size = P.halfSize * 2;
    const segments = options.mobile ? T.segmentsMobile : T.segments;

    // ---- The plot ----------------------------------------------------------
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        pos.setY(i, heightAt(x, z, T, P));
        const n = normalAt(x, z, T, P);
        nrm.setXYZ(i, n.x, n.y, n.z);
    }
    pos.needsUpdate = true;
    nrm.needsUpdate = true;
    geo.computeBoundingSphere();

    const built = buildGroundMaterial(config);
    groundMaterial = built.material;
    groundUniforms = built.uniforms;

    groundMesh = new THREE.Mesh(geo, groundMaterial);
    groundMesh.name = 'ground';
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // ---- The world beyond --------------------------------------------------
    // The meadow. It meets the plot at exactly y = 0 because the plot's relief
    // damps to nothing at the boundary AND the outer relief ramps up from it,
    // so there is no seam here at all rather than a seam something must hide.
    //
    // SEGMENTED, unlike the flat sheet this used to be: the outer relief needs
    // vertices to move. Long wavelengths mean the resolution can stay coarse.
    const M = config.world.meadow;
    const meadowSegments = options.mobile ? M.segmentsMobile : M.segments;
    const surroundGeo = new THREE.PlaneGeometry(M.size, M.size, meadowSegments, meadowSegments);
    surroundGeo.rotateX(-Math.PI / 2);
    const mpos = surroundGeo.attributes.position;
    const mnrm = surroundGeo.attributes.normal;
    for (let i = 0; i < mpos.count; i++) {
        const x = mpos.getX(i);
        const z = mpos.getZ(i);
        mpos.setY(i, outerReliefAt(x, z, config.world));
        // Central differences on the outer relief alone: inside the plot it is
        // flat zero, so the plot mesh's own normals are untouched.
        const e = 0.6;
        const dx = (outerReliefAt(x + e, z, config.world) - outerReliefAt(x - e, z, config.world)) / (2 * e);
        const dz = (outerReliefAt(x, z + e, config.world) - outerReliefAt(x, z - e, config.world)) / (2 * e);
        const len = Math.hypot(-dx, 1, -dz);
        mnrm.setXYZ(i, -dx / len, 1 / len, -dz / len);
    }
    mpos.needsUpdate = true;
    mnrm.needsUpdate = true;
    surroundGeo.computeBoundingSphere();

    surroundMesh = new THREE.Mesh(surroundGeo, groundMaterial);
    surroundMesh.name = 'meadow';
    // A hair below the plot, so the two never fight for the same pixel where
    // they meet.
    surroundMesh.position.y = -0.01;
    surroundMesh.receiveShadow = false;
    scene.add(surroundMesh);

    // ---- The wall ----------------------------------------------------------
    buildWall(scene, config);

    return { groundMesh, surroundMesh, wallMesh };
}

/**
 * A dry-stone wall as one instanced box per stone: four sides, a single draw
 * call, and every stone sat on the ground by `heightAt` (which is zero along
 * the boundary, so they sit level).
 *
 * The per-stone variation is a hash of the instance index rather than a random
 * number, so the wall is the same wall on every visit. Nothing in this garden
 * is allowed to be different tomorrow.
 */
function buildWall(scene, config) {
    const T = config.terrain;
    const W = T.wall;
    const half = config.plot.halfSize;
    const perSide = W.stonesPerSide;
    const total = perSide * 4;
    const span = half * 2;
    const stoneLength = span / perSide;

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
        color: W.color,
        roughness: 0.95,
        metalness: 0
    });

    wallMesh = new THREE.InstancedMesh(geo, material, total);
    wallMesh.name = 'wall';
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const posv = new THREE.Vector3();
    const scale = new THREE.Vector3();

    let i = 0;
    for (let side = 0; side < 4; side++) {
        for (let s = 0; s < perSide; s++) {
            // Deterministic per-stone wobble. Two hashes off the index, so no
            // seeded generator is needed and the wall never reshuffles.
            const h1 = hashIndex(i * 1.0);
            const h2 = hashIndex(i * 1.0 + 97.3);
            const along = -half + stoneLength * (s + 0.5);
            const outer = half - W.thickness / 2;

            let x, z, lenX, lenZ;
            if (side === 0) { x = along; z = -outer; lenX = stoneLength; lenZ = W.thickness; }
            else if (side === 1) { x = along; z = outer; lenX = stoneLength; lenZ = W.thickness; }
            else if (side === 2) { x = -outer; z = along; lenX = W.thickness; lenZ = stoneLength; }
            else { x = outer; z = along; lenX = W.thickness; lenZ = stoneLength; }

            const height = W.height * (0.82 + h1 * 0.36);
            posv.set(x, heightAt(x, z, T, config.plot) + height / 2, z);
            euler.set(0, (h2 - 0.5) * 0.12, (h1 - 0.5) * 0.05);
            q.setFromEuler(euler);
            scale.set(lenX * (0.9 + h2 * 0.14), height, lenZ * (0.9 + h1 * 0.14));
            m.compose(posv, q, scale);
            wallMesh.setMatrixAt(i, m);
            i++;
        }
    }
    wallMesh.instanceMatrix.needsUpdate = true;
    scene.add(wallMesh);
}

/** A stable 0 to 1 hash of a number. The GLSL one-liner, on the CPU, so the
 *  wall's variation needs no generator and no stored seed. */
function hashIndex(n) {
    const v = Math.sin(n * 12.9898) * 43758.5453123;
    return v - Math.floor(v);
}

/**
 * Move the ground to an hour. Cheap: two colour writes and a float.
 *
 * @param {number} hour
 * @param {number} snowCoverage 0 to 1
 */
export function updateTerrain(hour, snowCoverage = 0, config = GARDEN_CONFIG) {
    if (!groundUniforms) return;
    const [r, g, b] = unpackColor(grassColorAt(hour, config.terrain));
    groundUniforms.uGrassColor.value.set(r, g, b);
    groundUniforms.uSnow.value = snowCoverage;

    // Snow is smoother than grass, which is most of why fresh snow reads as
    // snow rather than as white grass.
    if (groundMaterial) {
        const T = config.terrain;
        groundMaterial.roughness = T.roughness + (T.snowRoughness - T.roughness) * snowCoverage;
    }
}

export function getGroundMesh() { return groundMesh; }
export function getWallMesh() { return wallMesh; }

export function disposeTerrain() {
    for (const mesh of [groundMesh, surroundMesh, wallMesh]) {
        if (!mesh) continue;
        if (sceneRef) sceneRef.remove(mesh);
        mesh.geometry.dispose();
    }
    // The plot and the surround SHARE one material, so it is disposed once
    // here rather than per mesh.
    if (groundMaterial) groundMaterial.dispose();
    if (wallMesh) wallMesh.material.dispose();
    groundMesh = null;
    surroundMesh = null;
    wallMesh = null;
    groundMaterial = null;
    groundUniforms = null;
    sceneRef = null;
}
