// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * beds.js - The mulch bed under each planted tree, and the water level on it.
 *
 * THE BED IS THE TREE'S TAP TARGET, and that is what it is for. Before it, a
 * tree's target was its CANOPY: the largest thing it owns, hanging over exactly
 * the ground somebody wants to plant in, so the fuller the plot got the harder
 * it became to say "plant here" rather than "tend that one". A small patch at
 * the base cannot overlap a neighbour's, because the planting grid is 1.5 m and
 * a bed is 1.1 m across, so the ambiguity goes away by construction.
 *
 * ---- THE BED IS DRAWN FLAT AND PICKED IN SCREEN SPACE ----
 *
 * This is the load-bearing decision and it came out of a measurement. The
 * camera looks along the ground at about 17 degrees, so a bed of radius 0.55 m
 * on a 1280x800 frame is 60 x 30 px at the near edge of the plot, 36 x 11 in
 * the middle, and 24 x 5 at the far edge. **Five pixels tall is not a touch
 * target**, and no bigger bed fixes it: at 1.5 m spacing, a bed tappable at the
 * back would swallow its neighbours at the front.
 *
 * So a ray is never cast at a bed. Each tree's base is projected to the screen
 * once a frame, and a tap picks the NEAREST base within a radius that follows
 * the drawn bed's own projected width, floored so the back row stays reachable.
 * Same idea as www/gavin's tolerance ring, applied to a target that is
 * foreshortened rather than small.
 *
 * Everything that decides is a pure function of plain numbers, so the pick can
 * be asserted without a renderer.
 */

import { GARDEN_CONFIG } from './config.min.js';
import { heightAt, cellCenter } from './terrain.min.js';
import { clamp01 } from './clock.min.js';
import { unpackColor, srgbToLinear } from './sky.min.js';

// ---- The rules (pure) ------------------------------------------------------

/**
 * How the ground sits under a bed: the lowest and highest terrain inside its
 * footprint.
 *
 * THE PLOT ROLLS, and a flat disc dropped at the cell's centre height buries
 * its downhill edge and floats its uphill one. Relief runs -0.67 to +0.86 m
 * with a steepest slope of 17.7 degrees, which across a 1.1 m bed moves the
 * ground by up to 0.35 m. Sampling the rim is what lets the bed be raised
 * enough to clear whatever it is standing on.
 */
export function groundUnderBed(x, z, radius, samples = 8) {
    let low = heightAt(x, z);
    let high = low;
    for (let i = 0; i < samples; i++) {
        const a = (i / samples) * Math.PI * 2;
        const h = heightAt(x + Math.cos(a) * radius, z + Math.sin(a) * radius);
        if (h < low) low = h;
        if (h > high) high = h;
    }
    return { low, high };
}

/**
 * Where a bed's body starts and stops, in metres.
 *
 * It spans from a little under the lowest ground it covers to a lip above the
 * highest, so no part of the rim is ever buried and no part of it floats. The
 * height is capped, because a pathological slope would otherwise draw a pillar
 * rather than a bed.
 */
export function bedSpan(x, z, config = GARDEN_CONFIG) {
    const B = config.garden.bed;
    const { low, high } = groundUnderBed(x, z, B.radius);
    const bottom = low - B.skirt;
    const top = Math.min(high + B.lip, bottom + B.maxHeight);
    return { bottom, top, height: Math.max(B.lip, top - bottom) };
}

/**
 * The radius, in pixels, within which a tap counts as landing on a bed.
 *
 * It FOLLOWS THE DRAWN BED so the target matches what the visitor sees, and it
 * has a floor so the back of the plot stays reachable: a bed there is about 24
 * px wide, and a 12 px target is not one.
 */
export function bedPickRadius(projectedHalfWidthPx, config = GARDEN_CONFIG) {
    const B = config.garden.bed;
    return Math.max(B.minPickPx, projectedHalfWidthPx * B.pickScale);
}

/**
 * Which tree a tap belongs to, or null for "none of them, so plant".
 *
 * NEAREST WINS, which is what makes crowding degrade gracefully. Two trees on
 * adjacent cells are 1.5 m apart, which is 24 px at the back of the plot, so
 * their targets overlap. "Which disc did the ray hit" has no answer there and
 * "which centre is closest" always does.
 *
 * @param {number} tapX,tapY  in CSS pixels
 * @param {Array} bases       [{ entry, x, y, radiusPx }], already projected
 */
export function pickBase(tapX, tapY, bases, config = GARDEN_CONFIG) {
    let best = null;
    let bestDistance = Infinity;
    for (const base of bases) {
        if (!base || base.behind) continue;
        const dx = tapX - base.x;
        const dy = tapY - base.y;
        const distance = Math.hypot(dx, dy);
        if (distance > bedPickRadius(base.radiusPx, config)) continue;
        if (distance < bestDistance) {
            bestDistance = distance;
            best = base.entry;
        }
    }
    return best;
}

/**
 * How full a tree's water level reads, 0 to 1.
 *
 * Not the raw moisture. The level is ALWAYS ON SCREEN, sixteen of them, in a
 * scene whose whole point is watching trees move, so a full tank has to be
 * quiet and an empty one has to be plain. This is the fill; `levelUrgency`
 * below is the contrast, and keeping them separate is what lets a healthy
 * garden look like a garden rather than like sixteen warnings.
 */
export function levelFill(moisture) {
    return clamp01(moisture);
}

/**
 * How loudly a level asserts itself, 0 (quiet, full) to 1 (empty).
 *
 * Zero until the tank is down to `noticeAbove`, so watering a tree puts its
 * level back to silent rather than merely less shrill.
 */
export function levelUrgency(moisture, config = GARDEN_CONFIG) {
    const B = config.garden.bed;
    const m = clamp01(moisture);
    if (m >= B.noticeAbove) return 0;
    return clamp01((B.noticeAbove - m) / B.noticeAbove);
}

// ---- State -----------------------------------------------------------------

let bedMesh = null;
let levelMesh = null;
let bedUniforms = null;
let levelUniforms = null;
let sceneRef = null;
let fillAttr = null;
let urgencyAttr = null;
let scratch = null;

const LEVEL_VERT = `
uniform float uPxPerRad;
uniform float uMinPx;
uniform float uWorldHeight;
attribute float aFill;
attribute float aUrgency;
varying vec2 vBedUv;
varying float vBedFill;
varying float vBedUrgency;
void main() {
    vBedUv = uv;
    vBedFill = aFill;
    vBedUrgency = aUrgency;
    // BILLBOARDED IN VIEW SPACE: take the instance's origin through the view
    // matrix, then offset by the quad's own corners. The bar always faces the
    // eye with no per-instance work on the CPU and no orientation to keep in
    // step. A strip lying flat on the bed would be nearly edge-on at this
    // camera's 17 degrees, which is to say a line.
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

    // IT HAS A FLOOR IN PIXELS, BECAUSE IT IS A READOUT AND NOT A PROP. Sized
    // in metres alone it measured 24 x 3.3 px at the middle of the plot and
    // 17 x 2.3 at the back, and three pixels cannot show a fraction of
    // anything. This grows the quad, uniformly so the shape holds, until it is
    // at least uMinPx tall, and leaves it alone once the eye is close enough
    // that its own size is bigger. The floor is what a visitor reads across
    // the plot; the world size is what makes it grow when they come and look.
    float bedDepth = max(0.001, -mv.z);
    float bedPx = (uWorldHeight * uPxPerRad) / bedDepth;
    float bedGrow = max(1.0, uMinPx / max(0.0001, bedPx));
    mv.xy += position.xy * bedGrow;
    gl_Position = projectionMatrix * mv;
}
`;

const LEVEL_FRAG = `
uniform vec3 uEmpty;
uniform vec3 uFull;
uniform vec3 uTrack;
uniform float uOpacity;
varying vec2 vBedUv;
varying float vBedFill;
varying float vBedUrgency;
void main() {
    // uv.x runs 0 to 1 across the bar. Everything left of the fill is water.
    float wet = step(vBedUv.x, vBedFill);
    vec3 water = mix(uFull, uEmpty, vBedUrgency);
    vec3 shown = mix(uTrack, water, wet);
    // A full tank is nearly transparent and an empty one is plain. Sixteen
    // healthy trees must not read as sixteen warnings.
    float alpha = uOpacity * (0.35 + 0.65 * vBedUrgency);
    gl_FragColor = vec4(shown, alpha);
}
`;

function setVec(vec, hex) {
    const [r, g, b] = unpackColor(hex).map(srgbToLinear);
    vec.set(r, g, b);
}

// ---- Building --------------------------------------------------------------

function buildBedMesh(config, capacity) {
    const B = config.garden.bed;
    // A unit-height truncated cone, so a per-instance Y scale is the bed's
    // height in metres with no second number to keep in step.
    const geo = new THREE.CylinderGeometry(
        B.radius * B.taper, B.radius, 1, B.segments, 1, false);

    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const uniforms = {
        uMulch: { value: new THREE.Vector3() },
        uSnowColor: { value: new THREE.Vector3() },
        uSnow: { value: 0 },
        uSnowMix: { value: B.snowMix }
    };
    setVec(uniforms.uMulch.value, B.color);
    setVec(uniforms.uSnowColor.value, config.terrain.snowColor);

    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        // FRAGMENT ONLY, ON PURPOSE. A previous version also injected a
        // `varying vec3 vBedWorld` into the vertex shader to drive a world
        // space mottle, and the batch of screenshots after it came back with
        // two of four beds simply not drawn. Nothing in Node could see it: the
        // instance counts, the matrices and the geometry all measured correct,
        // batched and incrementally. A vertex injection into a shared three
        // chunk is the one thing here a green suite cannot check, so it is out
        // until there is a reason to want it back that is worth the risk.
        shader.fragmentShader = `
uniform vec3 uMulch;
uniform vec3 uSnowColor;
uniform float uSnow;
uniform float uSnowMix;
` + shader.fragmentShader.replace('#include <map_fragment>', `
    #include <map_fragment>
    // The bed takes the season the ground takes. A bed that stayed brown
    // through a covered winter would be the only bare earth in the frame.
    //
    // BUT IT STOPS SHORT OF THE SNOW, and that is a functional line rather
    // than a decorative one. Taken all the way it came out a flat, uniform
    // white against ground that carries a thaw pattern and a grass mottle, so
    // in QA it read as a row of little pale slabs. It is also the tap target,
    // and a target that disappears in winter takes the whole care loop with
    // it for a quarter of the year.
    diffuseColor.rgb = mix(uMulch, uSnowColor, uSnow * uSnowMix);
`);
    };
    // three's default program cache key is onBeforeCompile.toString(), so every
    // injected material in this scene names its own or two of them silently
    // share one compiled program.
    material.customProgramCacheKey = () => 'garden-bed';

    const mesh = new THREE.InstancedMesh(geo, material, capacity);
    mesh.name = 'mulch-beds';
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    // NEVER A RAY TARGET. The bed is picked in screen space, and leaving it
    // raycastable would let it intercept the ground pick that decides where a
    // new tree goes.
    mesh.raycast = () => { };
    return { mesh, uniforms };
}

function buildLevelMesh(config, capacity) {
    const B = config.garden.bed;
    const geo = new THREE.PlaneGeometry(B.levelWidth, B.levelHeight);

    const fill = new Float32Array(capacity);
    const urgency = new Float32Array(capacity);
    fillAttr = new THREE.InstancedBufferAttribute(fill, 1);
    urgencyAttr = new THREE.InstancedBufferAttribute(urgency, 1);
    geo.setAttribute('aFill', fillAttr);
    geo.setAttribute('aUrgency', urgencyAttr);

    const uniforms = {
        uEmpty: { value: new THREE.Vector3() },
        uFull: { value: new THREE.Vector3() },
        uTrack: { value: new THREE.Vector3() },
        uOpacity: { value: B.levelOpacity },
        // Pixels per radian of vertical field, which is the one number that
        // turns a world size into a screen size. It moves with the viewport
        // and with the orientation's composed FOV, so it is published every
        // frame rather than captured here.
        uPxPerRad: { value: 800 },
        uMinPx: { value: B.minLevelPx },
        uWorldHeight: { value: B.levelHeight }
    };
    setVec(uniforms.uEmpty.value, B.levelEmptyColor);
    setVec(uniforms.uFull.value, B.levelFullColor);
    setVec(uniforms.uTrack.value, B.levelTrackColor);

    const material = new THREE.ShaderMaterial({
        vertexShader: LEVEL_VERT,
        fragmentShader: LEVEL_FRAG,
        uniforms,
        transparent: true,
        depthWrite: false,
        // UNLIT, for the same reason the droplet it replaces was: a readout has
        // to be legible at midnight, and anything lit disappears exactly when
        // the garden is hardest to read.
        fog: false
    });

    const instanced = new THREE.InstancedMesh(geo, material, capacity);
    instanced.name = 'water-levels';
    instanced.count = 0;
    instanced.frustumCulled = false;
    instanced.renderOrder = 2;
    instanced.raycast = () => { };
    return { mesh: instanced, uniforms };
}

export function initBeds(scene, config = GARDEN_CONFIG, options = {}) {
    sceneRef = scene;
    const capacity = options.mobile ? config.plot.maxTreesMobile : config.plot.maxTrees;
    const beds = buildBedMesh(config, capacity);
    const levels = buildLevelMesh(config, capacity);
    bedMesh = beds.mesh;
    bedUniforms = beds.uniforms;
    levelMesh = levels.mesh;
    levelUniforms = levels.uniforms;
    scratch = {
        matrix: new THREE.Matrix4(),
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
        scale: new THREE.Vector3()
    };
    if (scene) {
        scene.add(bedMesh);
        scene.add(levelMesh);
    }
    return { bedMesh, levelMesh };
}

/**
 * Rebuild the instance matrices from the live tree list.
 *
 * Called when a tree is planted, removed, or restored, and never per frame: the
 * beds do not move, and the level's fill rides an attribute rather than a
 * matrix.
 */
export function syncBeds(entries, config = GARDEN_CONFIG) {
    if (!bedMesh || !scratch) return 0;
    const B = config.garden.bed;
    const n = Math.min(entries.length, bedMesh.instanceMatrix.count);

    for (let i = 0; i < n; i++) {
        const record = entries[i].record;
        const { x, z } = cellCenter(record.gx, record.gz);
        const span = bedSpan(x, z, config);

        scratch.position.set(x, span.bottom + span.height / 2, z);
        scratch.quaternion.set(0, 0, 0, 1);
        scratch.scale.set(1, span.height, 1);
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        bedMesh.setMatrixAt(i, scratch.matrix);

        // The level stands at the front of the bed, just clear of the trunk.
        scratch.position.set(x, span.top + B.levelLift, z + B.radius * 0.72);
        scratch.scale.set(1, 1, 1);
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        levelMesh.setMatrixAt(i, scratch.matrix);
    }

    bedMesh.count = n;
    levelMesh.count = n;
    bedMesh.instanceMatrix.needsUpdate = true;
    levelMesh.instanceMatrix.needsUpdate = true;
    return n;
}

/**
 * Per frame: the season on the beds, and each tree's tank on its level.
 *
 * `pxPerRadian` is the viewport height over the camera's vertical field in
 * radians, and it is what keeps the level legible at every distance. It is
 * passed in rather than derived because this module has no camera and no
 * window, which is also what keeps it testable.
 */
export function updateBeds(entries, snowCoverage = 0, pxPerRadian = 0, config = GARDEN_CONFIG) {
    if (!bedMesh || !bedUniforms) return;
    bedUniforms.uSnow.value = clamp01(snowCoverage);
    if (levelUniforms && pxPerRadian > 0) levelUniforms.uPxPerRad.value = pxPerRadian;
    const n = Math.min(entries.length, levelMesh ? levelMesh.count : 0);
    for (let i = 0; i < n; i++) {
        const m = entries[i].record.moisture;
        fillAttr.array[i] = levelFill(m);
        urgencyAttr.array[i] = levelUrgency(m, config);
    }
    if (n > 0) {
        fillAttr.needsUpdate = true;
        urgencyAttr.needsUpdate = true;
    }
}

export function getBedMesh() { return bedMesh; }
export function getLevelMesh() { return levelMesh; }

// Under the shared stub a material is a proxy and a geometry absorbs whatever
// is set on it, so neither the season nor the per-tree tanks can be read back
// through them. These hand over the real objects instead, the way forest.js
// exposes its tree list.
export const __test__ = {
    uniforms: () => bedUniforms,
    levelUniforms: () => levelUniforms,
    levelAttributes: () => ({ fill: fillAttr, urgency: urgencyAttr })
};

export function disposeBeds() {
    for (const mesh of [bedMesh, levelMesh]) {
        if (!mesh) continue;
        if (sceneRef) sceneRef.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
    }
    bedMesh = null;
    levelMesh = null;
    bedUniforms = null;
    levelUniforms = null;
    fillAttr = null;
    urgencyAttr = null;
    scratch = null;
    sceneRef = null;
}
