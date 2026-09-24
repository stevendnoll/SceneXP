// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * wildflowers-1.0.0.js - Wildflowers: a petal mask on crossed cards, one
 * color per plant, and, if a scene wants it, a sway in the wind.
 *
 * PROMOTED FROM www/garden/js/forest.js ON 2026-09-23, with the fractal trees
 * (fractaltree-1.0.0.js), so Tornado Alley's meadow and the garden's flowers
 * are the same flowers. The card, the mask and the placement are the
 * garden's, verbatim, and the garden builds its flowers from them. The sway
 * is new, off unless asked for, which is why the garden's are unchanged.
 *
 * ---- A CROSSED QUAD WITHOUT A MASK IS A COLORED SQUARE ----
 *
 * Learned in the garden's QA: untextured, these read as confetti. The blossom
 * shape comes from the alpha of a small canvas drawing (a stem and five
 * petals round a center), drawn white so the per-plant color does the work,
 * and cut with alphaTest.
 *
 * ---- THE SWAY IS IN WORLD SPACE ----
 *
 * Every flower is yawed at random so the crossed cards do not line up, and a
 * wind added in each flower's own space would blow each one a different way.
 * So the offset is added after the instance transform, along the scene's
 * wind, growing with the square of the height up the stem (the root stays
 * put), and scaled by the flower's own height so a tall one moves further.
 * Each flower's phase comes from where it stands, so a meadow ripples rather
 * than breathing in unison.
 */
import { makeRandom } from './treespecies-1.0.0.min.js';

/**
 * One blossom on a stem, drawn once.
 *
 * The quad is anchored at its base, so v runs from the ground up: stem in the
 * lower half, head in the upper. White, for the same reason everything else
 * here is white, so the per-plant colour does the work.
 */
export function flowerTexture(size = 32, seed = 1) {
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

/** A crossed pair of unit quads standing on the origin, so a flower has volume
 *  from any angle. The garden's weeds and bushes stand on it too. */
export function crossedQuad() {
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

/** Rewrite the flower transforms for a bloom level, 0 gone and 1 full. */
export function placeWildflowers(mesh, placements, bloom = 1) {
    if (!mesh || !placements.length) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    placements.forEach((flower, i) => {
        const size = flower.size * bloom;
        p.set(flower.x, flower.y, flower.z);
        e.set(0, flower.yaw, 0);
        q.setFromEuler(e);
        s.set(size, size, size);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
}

// The sway, replacing three's project_vertex chunk (r160) so the offset lands
// after the instance transform. No backticks in these comments.
const SWAY_HEAD = /* glsl */`
uniform vec3 uWind;
uniform float uTime;
uniform float uSway;
uniform float uSwayRate;
`;

const SWAY_PROJECT = /* glsl */`
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
    float flowerHeight = length(instanceMatrix[1].xyz);
    float flowerPhase = dot(instanceMatrix[3].xz, vec2(0.37, 0.23));
#else
    float flowerHeight = 1.0;
    float flowerPhase = 0.0;
#endif
float bend = position.y * position.y * flowerHeight * uSway;
float gust = 0.75 + 0.25 * sin(uTime * uSwayRate + flowerPhase);
mvPosition.xyz += vec3(uWind.x, 0.0, uWind.z) * bend * gust;
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;

/**
 * Build a meadow's worth of wildflowers as one instanced mesh.
 *
 * placements: [{ x, y, z, size, yaw, hue }], hue a packed hex.
 * options:
 *   texture     a mask from flowerTexture(); drawn fresh when absent
 *   alphaTest   the mask threshold, the garden's 0.42
 *   sway        { amount, rate } to bend in the wind, or absent for none.
 *               amount is how far a flower's head moves, as a fraction of
 *               its height, in a wind of 1.
 *
 * Returns { mesh, material, geometry, uniforms }. `uniforms` is null without
 * sway. Lit by the scene's lights (a Lambert material, as in the garden).
 */
export function createWildflowers(placements, options = {}) {
    const geometry = crossedQuad();
    const texture = options.texture || flowerTexture(32, options.seed || 1);
    const material = new THREE.MeshLambertMaterial({
        color: 0xffffff, map: texture, alphaTest: options.alphaTest ?? 0.42, side: THREE.DoubleSide
    });
    let uniforms = null;
    if (options.sway) {
        uniforms = {
            uWind: { value: new THREE.Vector3() },
            uTime: { value: 0 },
            uSway: { value: options.sway.amount },
            uSwayRate: { value: options.sway.rate }
        };
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', `#include <common>\n${SWAY_HEAD}`)
                .replace('#include <project_vertex>', SWAY_PROJECT);
        };
        material.customProgramCacheKey = () => 'wildflowers-sway';
    }
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, placements.length));
    mesh.name = 'wildflowers';
    mesh.frustumCulled = false;
    const color = new THREE.Color();
    placements.forEach((flower, i) => {
        color.setHex(flower.hue);
        mesh.setColorAt(i, color);
    });
    mesh.count = placements.length;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    placeWildflowers(mesh, placements, 1);
    return { mesh, material, geometry, uniforms };
}

/** This frame's wind ({ x, z }) and clock for swaying flowers. */
export function updateWildflowers(flowers, wind, time) {
    if (!flowers || !flowers.uniforms) return;
    flowers.uniforms.uWind.value.set(wind.x, 0, wind.z);
    flowers.uniforms.uTime.value = time;
}
