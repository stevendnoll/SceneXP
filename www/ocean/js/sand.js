// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * sand.js - The beach, and the record the water leaves on it.
 *
 * THE WET BAND IS THE WHOLE POINT. A flat tan surface under the water is a
 * placeholder, and that is what this replaces. What a beach actually looks like
 * between two waves is a dark saturated band with a ragged upper edge, drying
 * unevenly back to pale, and that band is the only thing in a still frame that
 * says a wave was here four seconds ago. It costs one number per row.
 *
 * THE SWASH IS BALLISTIC AND THAT IS NOT A FLOURISH. A sheet of water thrown up
 * a plane beach is decelerated by the downslope component of gravity and
 * nothing else, so its position is a parabola in time and the whole motion
 * follows from the run up distance alone: how far it goes fixes how fast it
 * left and how long it takes to come back. One number, no free parameters, and
 * the rhythm comes out at about three seconds, which is the rhythm the surf
 * synthesiser next door was independently tuned to.
 *
 * IT IS DRIVEN BY THE WAVES THAT ACTUALLY BROKE. `consumeBreaks()` in water.js
 * already returns the arrivals with a strength and a distance, and main.js hands
 * them here. So the sheet that runs up the sand is the wave the visitor watched
 * stand up, delayed by the time a bore takes to cross the surf zone, rather than
 * a second rhythm running alongside the first.
 *
 * WET SAND IS A MIRROR, and that is most of the effect. A film of water over
 * sand reflects the sky at a grazing angle exactly as the sea does, which is why
 * a beach at sunset has a band of sky lying on it. It runs through the same
 * `oceanSkyColor` and the same Fresnel term as the water, handed in by main.js,
 * so the sand, the sea, and the sky cannot disagree about what is overhead.
 *
 * PURE CORE, THIN SHELL, the same division water.js and sky.js use.
 */

import { OCEAN_CONFIG } from './config.min.js';
import { bedHeightAt, tideOffset, rowPositions, halfWidthAt } from './water.min.js';

/** Metres per second squared. Same constant the sea runs on, for the same
 *  reason: the swash should take the time a swash takes. */
const GRAVITY = 9.81;

// ---------------------------------------------------------------------------
// The pure core: where the water reaches, and how wet it leaves the sand
// ---------------------------------------------------------------------------

/** Downslope acceleration of a sheet of water on this beach, in m/s^2.
 *
 *  g sin(beta) cos(beta), which is the horizontal component of gravity along a
 *  slope, and the only force acting on a swash lens once it has left the bore.
 *  Derived from `beach.slope` rather than configured, so the beach cannot be
 *  made steeper without the water running back down it faster. */
export function swashDecel(beach = OCEAN_CONFIG.beach) {
    const beta = Math.atan(beach.slope);
    return GRAVITY * Math.sin(beta) * Math.cos(beta);
}

/** How long a swash reaching `runUp` metres takes to go up and come back.
 *
 *  Falls out of the parabola: the sheet leaves at sqrt(2 a X) and decelerates at
 *  a, so it is back where it started at 2 u0 / a. Nothing to tune. */
export function swashDuration(runUp, beach = OCEAN_CONFIG.beach) {
    const a = swashDecel(beach);
    if (a <= 0 || runUp <= 0) return 0;
    return 2 * Math.sqrt(2 * runUp / a);
}

/** How far past the still water line a swash has reached, `age` seconds in.
 *
 *  Zero before it starts and zero once it is back, so a caller can take the
 *  maximum over several without special casing the dead ones. */
export function swashReach(age, runUp, beach = OCEAN_CONFIG.beach) {
    if (!(age > 0) || !(runUp > 0)) return 0;
    const a = swashDecel(beach);
    const u0 = Math.sqrt(2 * a * runUp);
    const x = u0 * age - 0.5 * a * age * age;
    return x > 0 ? x : 0;
}

/** Where still water meets the sand right now, as a z.
 *
 *  The tide slides it up and down the slope, which is most of what the tide is
 *  for: over a few minutes nobody sees it move, and over ten the beach is a
 *  different width. */
export function waterlineZ(elapsed, beach = OCEAN_CONFIG.beach, water = OCEAN_CONFIG.water) {
    return beach.shoreZ + tideOffset(elapsed, water) / beach.slope;
}

/** Turn a break event from water.js into a swash waiting to happen.
 *
 *  The delay is the honest part: the wave breaks out at the surf line and the
 *  bore has to cross the zone before any water arrives at the sand. At 2.4 m/s
 *  over a twelve metre zone that is five seconds, which is long enough that
 *  running the two together would look wrong. */
export function swashFromBreak(event, now, sand = OCEAN_CONFIG.sand) {
    const { minRunUp, maxRunUp, boreSpeed } = sand.swash;
    const strength = Math.max(0, Math.min(1, event.strength || 0));
    const runUp = minRunUp + (maxRunUp - minRunUp) * strength;
    const distance = Math.max(0, event.distance || 0);
    return { start: now + distance / boreSpeed, runUp };
}

/** The shoreward-most z the water has reached at this instant.
 *
 *  The maximum over every swash on the beach, floored at the still waterline,
 *  because the sea is always at least where the sea is. */
export function reachZ(swashes, now, elapsed, config = OCEAN_CONFIG, surge = 0) {
    // THE SURGE HAS TO REACH THE SAND OR THE TWO SHEETS DISAGREE ABOUT WHERE
    // THE SEA IS. The water draws its own waterline from the tide plus the arc's
    // surge, and if this one used the tide alone then during the drawback the
    // sea would visibly retreat down the beach while the wet band stayed put,
    // and during the storm the flooded sand would be drawn dry. Neither is
    // currently on screen, because everything between the water's edge and the
    // camera sits under the bottom of the frame, which is exactly the sort of
    // reason a bug survives to the day somebody moves the camera.
    const line = waterlineZ(elapsed, config.beach, config.water) + surge / config.beach.slope;
    let reach = line;
    for (let i = 0; i < swashes.length; i++) {
        const s = swashes[i];
        const x = swashReach(now - s.start, s.runUp, config.beach);
        if (line + x > reach) reach = line + x;
    }
    return reach;
}

/** Advance the per-row wetness by `delta` seconds.
 *
 *  Anything the water is standing on is soaked. Everything else dries toward
 *  zero on an exponential with `dryingSeconds` as its time constant, which is
 *  the right shape rather than a convenient one: sand dries by evaporation from
 *  a film whose rate goes with how much is left.
 *
 *  IN PLACE AND ALLOCATION FREE, because it runs a dozen times a second for the
 *  life of the tab and this is a scene people are meant to leave open. */
export function soak(wet, rowZ, reach, delta, sand = OCEAN_CONFIG.sand) {
    const decay = Math.exp(-Math.max(0, delta) / Math.max(0.01, sand.dryingSeconds));
    for (let r = 0; r < wet.length; r++) {
        if (rowZ[r] <= reach) wet[r] = 1;
        else wet[r] *= decay;
    }
    return wet;
}

/** The rows the sand is built on: the water's own curve, cut off where the sea
 *  above it has gone opaque.
 *
 *  BORROWED RATHER THAN INVENTED, so the two sheets cannot disagree about where
 *  anything is. The placeholder this replaced had its own even curve over the
 *  whole 415 metre sheet, which put a row every five centimetres out at the
 *  horizon where they are invisible and a row every half metre in the shallows
 *  where the eye is.
 *
 *  The cut off is not an optimisation. Past the depth where the water stops
 *  showing its bed there is nothing to draw, and drawing it anyway spends rows
 *  on sand nobody can see. It lands at about 89 rows reaching 30 metres out.
 *
 *  RESOLUTION IN THE SWASH ZONE IS COARSE AND THAT IS SETTLED, at roughly 0.65
 *  metres per row, because at `camera.z` 8 that zone falls inside the first
 *  eight rows of the water's curve, which are the flat near strip. It does not
 *  matter: see the note in config under `sand`, the swash zone is entirely below
 *  the bottom edge of the frame and the camera is staying there. Moving back to
 *  11.6 does spread the zone over 22 rows, and it was tried, and it broke the
 *  composition in a way that had nothing to do with rows. Read `camera.z` before
 *  reaching for that again. */
export function sandRows(config = OCEAN_CONFIG, scale = 1) {
    const rows = Math.max(8, Math.round(config.water.rows * scale));
    const all = rowPositions(rows, config);
    // Where the sea goes opaque: `uDeepReference` in water.js is the depth at
    // which the shallow tint has fully given way, and the alpha follows it.
    const limit = config.beach.shoreZ - (config.beach.maxDepth * 0.55) / config.beach.slope;
    const kept = [];
    for (let i = 0; i < all.length; i++) {
        kept.push(all[i]);
        if (all[i] < limit) break;
    }
    return Float32Array.from(kept);
}

// ---------------------------------------------------------------------------
// The THREE shell
// ---------------------------------------------------------------------------

/** Injected after `#include <common>` in the fragment program. The sky's own
 *  function is appended after this by `buildMaterial` when one is handed in. */
const FRAGMENT_HEAD = `
uniform vec3 uDryColor;
uniform vec3 uWetColor;
uniform float uGrainScale;
uniform float uGrainStrength;
uniform float uGrainFade;
uniform float uRippleScale;
uniform float uRippleStrength;
uniform float uWetRoughness;
uniform float uDryRoughness;
uniform float uWetReflect;
varying float vWet;
varying vec3 vWorld;

float sandHash(vec2 p) {
    return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453123);
}

float sandNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = sandHash(i);
    float b = sandHash(i + vec2(1.0, 0.0));
    float c = sandHash(i + vec2(0.0, 1.0));
    float d = sandHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

/** Injected after `#include <map_fragment>`, where `diffuseColor` exists and
 *  nothing has lit it yet.
 *
 *  THE EDGE OF THE WET BAND IS TORN, NOT DRAWN. A waterline that is a clean
 *  line across the beach is the one thing that would give this away instantly,
 *  because the real one is a lace of fingers left by the last sheet draining
 *  unevenly. The noise goes into the wetness THRESHOLD rather than on top of
 *  the colour, so it disturbs where the band ends instead of speckling it. */
const FRAGMENT_BODY = `
    float viewDistance = distance(cameraPosition.xz, vWorld.xz);
    float near = 1.0 - smoothstep(0.0, uGrainFade, viewDistance);

    vec2 grain = vWorld.xz * uGrainScale;
    float n = sandNoise(grain);
    n = mix(n, 0.6 * n + 0.4 * sandNoise(grain * 3.7 + 4.1), near);

    // The lace at the top of the run up. A coarse noise, stretched along the
    // shore so the fingers point up the beach the way draining water leaves
    // them, pushed into the threshold and not into the colour.
    float lace = sandNoise(vec2(vWorld.x * 1.7, vWorld.z * 0.55));
    float wet = clamp(vWet * (1.25 - 0.5 * lace) - 0.12, 0.0, 1.0);
    wet = smoothstep(0.0, 0.55, wet);

    // Ripples run PARALLEL TO THE WATERLINE, which is what makes them read as a
    // beach rather than as noise, and only where the sand is wet, because dry
    // sand does not hold them.
    float ripple = sin(vWorld.z * uRippleScale + n * 1.6) * uRippleStrength * wet * near;

    vec3 base = mix(uDryColor, uWetColor, wet);
    // Grain lightens and darkens rather than tinting: a beach is one mineral
    // catching the light at a thousand angles, not a thousand colours.
    diffuseColor.rgb = base * (1.0 + (n - 0.5) * 2.0 * uGrainStrength * near + ripple);
`;

/** Replaces `#include <roughnessmap_fragment>`. Wet sand is glossy and dry sand
 *  is chalk, and one material doing both is most of why the band reads as water
 *  rather than as a darker sand. */
const FRAGMENT_ROUGHNESS = `
    float roughnessFactor = mix(uDryRoughness, uWetRoughness, wet);
`;

/** Injected after `#include <opaque_fragment>`, and only when a sky is handed
 *  in. The same Fresnel term the water uses, scaled down by how wet the sand is
 *  and by `wetReflect`, because a film over a rough bed is not a body of water.
 *  See the long note in water.js: this has to sit before tone mapping and fog. */
const FRAGMENT_REFLECT = `
    vec3 sandNormal = inverseTransformDirection(geometryNormal, viewMatrix);
    vec3 sandToEye = inverseTransformDirection(geometryViewDir, viewMatrix);
    float sandCos = clamp(dot(sandToEye, sandNormal), 0.0, 1.0);
    float sandFresnel = (0.020 + 0.980 * pow(1.0 - sandCos, 5.0)) * wet * uWetReflect;
    vec3 sandSky = oceanSkyColor(reflect(-sandToEye, sandNormal), 0.0);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, sandSky, sandFresnel);
`;

const VERTEX_HEAD = `
attribute float aWet;
varying float vWet;
varying vec3 vWorld;
`;

/** Replaces `#include <begin_vertex>`. The sand does not move, so this only
 *  forwards what the fragment program needs. */
const VERTEX_BODY = `
    vec3 transformed = position;
    vWet = aWet;
    vWorld = position;
`;

let mesh = null;
let material = null;
let geometry = null;
let uniforms = null;
let wetAttribute = null;
let rowZ = null;
let wet = null;
let grid = null;
let swashes = [];
let settings = null;
let elapsed = 0;
let sinceProfile = 0;

/** Build the beach and add it to the scene.
 *
 *  Takes the same `options.sky` shape water.js does, and works without it: the
 *  wet band still darkens and still goes glossy, it simply has nothing to
 *  mirror. */
export function initSand(scene, config = OCEAN_CONFIG, options = {}) {
    settings = config;
    elapsed = 0;
    sinceProfile = 0;
    swashes = [];

    const scale = options.mobile ? config.water.mobileScale : 1;
    rowZ = sandRows(config, scale);
    const rows = rowZ.length;
    const cols = Math.max(8, Math.round(config.water.cols * scale));
    grid = { rows, cols };

    wet = new Float32Array(rows);
    geometry = buildGeometry(rows, cols, rowZ, config.beach);
    material = buildMaterial(config, options.sky || null);

    mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'sand';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.frustumCulled = false;
    if (scene) scene.add(mesh);
    return mesh;
}

/** The beach, in its own shape.
 *
 *  Height comes from `bedHeightAt` and width from `halfWidthAt`, both borrowed
 *  from water.js, so the sand and the depth the waves are solved against can
 *  never drift apart. That is the seam that matters here: a beach half a
 *  centimetre above the seabed the surf is standing in produces a tan slab
 *  hanging in the water, which this scene has already met once. */
function buildGeometry(rows, cols, zs, beach) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(rows * cols * 3);
    const wetValues = new Float32Array(rows * cols);

    for (let r = 0; r < rows; r++) {
        const z = zs[r];
        const halfWidth = halfWidthAt(z, beach);
        const y = bedHeightAt(z, beach);
        for (let c = 0; c < cols; c++) {
            const u = cols > 1 ? c / (cols - 1) : 0.5;
            const i = (r * cols + c) * 3;
            positions[i] = (u * 2 - 1) * halfWidth;
            positions[i + 1] = y;
            positions[i + 2] = z;
        }
    }

    // Same winding as the water. See the note in water.js: the obvious order
    // faces these triangles at the seabed and the beach vanishes.
    const indices = new Uint32Array((rows - 1) * (cols - 1) * 6);
    let n = 0;
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const a = r * cols + c;
            indices[n++] = a; indices[n++] = a + 1; indices[n++] = a + cols;
            indices[n++] = a + 1; indices[n++] = a + cols + 1; indices[n++] = a + cols;
        }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    wetAttribute = new THREE.BufferAttribute(wetValues, 1);
    wetAttribute.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aWet', wetAttribute);
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    return geo;
}

function buildMaterial(config, sky) {
    const sand = config.sand;
    const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: sand.dryRoughness,
        metalness: 0
    });

    uniforms = {
        uDryColor: { value: new THREE.Color(sand.color) },
        uWetColor: { value: new THREE.Color(sand.wetColor) },
        uGrainScale: { value: sand.grainScale },
        uGrainStrength: { value: sand.grainStrength },
        uGrainFade: { value: sand.grainFadeMetres },
        uRippleScale: { value: sand.rippleScale },
        uRippleStrength: { value: sand.rippleStrength },
        uWetRoughness: { value: sand.wetRoughness },
        uDryRoughness: { value: sand.dryRoughness },
        uWetReflect: { value: sand.wetReflect }
    };

    mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        if (sky) Object.assign(shader.uniforms, sky.uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\n' + VERTEX_HEAD)
            .replace('#include <begin_vertex>', VERTEX_BODY);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\n' + FRAGMENT_HEAD
                + (sky ? sky.uniformGlsl + sky.glsl : ''))
            .replace('#include <roughnessmap_fragment>', FRAGMENT_ROUGHNESS)
            .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAGMENT_BODY);
        if (sky) {
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + FRAGMENT_REFLECT);
        }
    };

    // See water.js: Three shares a compiled program between materials with
    // identical parameters and the key does not include onBeforeCompile.
    mat.customProgramCacheKey = () => (sky ? 'ocean-sand-1-sky' : 'ocean-sand-1');
    return mat;
}

/** Take the waves that just broke and put them on the beach.
 *
 *  Handed the array `consumeBreaks()` returned rather than calling it, because
 *  that queue has one reader and audio.js is about to be the other. main.js
 *  drains it once and gives it to both. */
export function addBreaks(events) {
    if (!events || !settings) return;
    const max = settings.sand.swash.maxActive;
    for (let i = 0; i < events.length; i++) {
        swashes.push(swashFromBreak(events[i], elapsed, settings.sand));
    }
    if (swashes.length > max) swashes = swashes.slice(swashes.length - max);
}

/** Advance the beach.
 *
 *  The wetness is rebuilt at `sand.profileHz` rather than every frame, for the
 *  same reason the water's profile is: the fastest thing in it is a swash that
 *  takes three seconds, and the sand does not move at all. */
export function updateSand(deltaTime, sea = null) {
    if (!settings || !wet) return;
    const delta = Number.isFinite(deltaTime) ? deltaTime : 0;
    elapsed += delta;
    sinceProfile += delta;

    const interval = 1 / Math.max(1, settings.sand.profileHz);
    if (sinceProfile < interval) return;

    const surge = sea && Number.isFinite(sea.surge) ? sea.surge : 0;
    const reach = reachZ(swashes, elapsed, elapsed, settings, surge);
    soak(wet, rowZ, reach, sinceProfile, settings.sand);
    sinceProfile = 0;

    // Drop swashes that have drained, so the list cannot grow while the tab is
    // left open for an afternoon.
    if (swashes.length) {
        swashes = swashes.filter((s) => {
            const age = elapsed - s.start;
            return age < swashDuration(s.runUp, settings.beach) + 0.5;
        });
    }

    writeWet();
}

/** Broadcast one wetness value per row across its whole row of vertices. */
function writeWet() {
    const { rows, cols } = grid;
    const array = wetAttribute.array;
    for (let r = 0; r < rows; r++) {
        const value = wet[r];
        const base = r * cols;
        for (let c = 0; c < cols; c++) array[base + c] = value;
    }
    wetAttribute.needsUpdate = true;
}

/** How far up the beach the water is right now, in metres past the still water
 *  line. A tuning aid, like `breakDistance` next door. */
export function swashReachMetres() {
    if (!settings) return 0;
    return reachZ(swashes, elapsed, elapsed, settings) - waterlineZ(elapsed, settings.beach, settings.water);
}

export function getSandMesh() { return mesh; }
export function getWet() { return wet; }

export function disposeSand() {
    if (mesh && mesh.parent) mesh.parent.remove(mesh);
    if (geometry) geometry.dispose();
    if (material) material.dispose();
    mesh = null;
    geometry = null;
    material = null;
    uniforms = null;
    wetAttribute = null;
    rowZ = null;
    wet = null;
    grid = null;
    swashes = [];
    settings = null;
}

/** Test seam, matching water.js and sky.js. Not used by the page. */
export const __sand = {
    state: () => ({ grid, rowZ, wet, swashes, uniforms, elapsed })
};
