// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * vista.js - What the opening looks out onto: mountains, a pond, and a path.
 *
 * ---- THE MOUNTAINS CANNOT USE THE SCENE'S FOG ----
 *
 * Scene fog runs to 260 m and is total past it, so a ridge drawn with fog on
 * is a ridge painted exactly the colour of the sky behind it: invisible. These
 * carry `fog: false` and compute their OWN aerial perspective, mixing toward
 * the sky's horizon colour by height above the ridge base. That is also how a
 * real range reads, so it is the honest answer rather than a workaround.
 *
 * The other limit is `camera.far`, which is 400. A ridge past that is clipped
 * away entirely, which is why these sit at 285 and 340 m.
 *
 * ---- THE POND SAMPLES THE SKY, IT DOES NOT IMITATE IT ----
 *
 * The water reflects by running the SAME GLSL the dome runs, imported from
 * sky.js as `SKY_GLSL`. A surface that approximated the gradient would drift
 * from it the moment anybody retuned a keyframe, and the symptom would be
 * water reflecting a sky nobody can see.
 *
 * Two traps from the ocean work apply directly and are handled here:
 *
 *   - WITHOUT A FRESNEL TERM A WATER SURFACE REFLECTS NOTHING, and the far
 *     edge becomes a black seam against the sky. Real water reflects about two
 *     percent looking straight down and nearly everything at a grazing angle,
 *     which at this camera is most of the pond.
 *   - The water does its own tone mapping and encoding, like the dome, so
 *     nothing downstream has to guess what space it is in.
 */

import { GARDEN_CONFIG } from './config.min.js';
import { makeRandom } from './species.min.js';
import { clamp01 } from './clock.min.js';
import {
    SKY_GLSL, skyStateAt, applyGloom, lightingAt, directionAt,
    cloudUniforms, driveClouds,
    shownColor, unpackColor, mixColor, packColor
} from './sky.min.js';
import { worldHeightAt, outerWavesAt, pondWaterLevel, pondHalfWidth } from './terrain.min.js';

// ---- Shaders ---------------------------------------------------------------

const RIDGE_VERT = `
varying float vRidgeUp;
void main() {
    // Zero at the ridge base and one at its crest, which is the axis aerial
    // perspective actually runs along: haze pools low and thins with height.
    vRidgeUp = clamp(uv.y, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RIDGE_FRAG = `
precision highp float;
uniform vec3 uRock;
uniform vec3 uHaze;
uniform float uHazeAmount;
varying float vRidgeUp;
void main() {
    // The crest keeps a little of its own colour; the base dissolves into the
    // horizon. Squared, because haze does not fall off linearly.
    float clear = vRidgeUp * vRidgeUp;
    vec3 col = mix(uHaze, uRock, clear * (1.0 - uHazeAmount) + (1.0 - uHazeAmount) * 0.35);
    gl_FragColor = vec4(col, 1.0);
}
`;

const POND_VERT = `
varying vec3 vWorld;
varying vec2 vPondUv;
void main() {
    vPondUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const POND_FRAG = `
precision highp float;

uniform vec3  uZenith;
uniform vec3  uHorizon;
uniform float uLum;
uniform float uExposure;
uniform float uGradientPower;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform float uSunUp;
uniform vec3  uBody;
uniform vec3  uIce;
uniform float uFreeze;
uniform float uTime;
uniform float uRippleScale;
uniform float uRippleHeight;
uniform float uReflectance;
uniform float uCloudCover;
uniform float uCloudDrift;
uniform vec4  uCloudShape;
uniform vec3  uCloudForm;
uniform vec3  uCloudColor;
uniform vec3  uCloudStorm;
uniform float uCloudWarmth;
uniform float uCloudWet;
uniform float uCloudOpacity;
uniform vec3  uEye;

varying vec3 vWorld;
varying vec2 vPondUv;

// Two crossing wave trains rather than one, so the surface never shows an
// obvious direction. Still water, so the amplitudes are small.
/**
 * The ripple normal.
 *
 * THREE WAVES AT AWKWARD ANGLES, NOT A PRODUCT OF AXIS-ALIGNED SINES. The old
 * version multiplied a sine in x by a cosine in y, which is separable, and a
 * separable function draws a GRID. On a small pond that read as ripples; on a
 * lake three times the size it read as a crosshatch woven into the water, and
 * making the scale finer only made the weave finer.
 *
 * Directions chosen so their ratios are not simple fractions, so the three
 * never line up into a repeating cell within the size of the water.
 */
vec3 pondNormal(vec2 p, float t) {
    vec2 d1 = vec2(0.94, 0.34);
    vec2 d2 = vec2(-0.42, 0.91);
    vec2 d3 = vec2(0.71, -0.70);
    float w1 = sin(dot(p, d1) * uRippleScale + t * 0.9);
    float w2 = sin(dot(p, d2) * uRippleScale * 1.63 - t * 1.17);
    float w3 = sin(dot(p, d3) * uRippleScale * 2.41 + t * 1.61);
    // The slope is the derivative of the sum, so each wave pushes along its own
    // direction rather than along x or y.
    vec2 slope = d1 * cos(dot(p, d1) * uRippleScale + t * 0.9) * 0.55
               + d2 * cos(dot(p, d2) * uRippleScale * 1.63 - t * 1.17) * 0.30 * 1.63
               + d3 * cos(dot(p, d3) * uRippleScale * 2.41 + t * 1.61) * 0.15 * 2.41;
    slope *= uRippleHeight * (0.85 + 0.15 * (w1 + w2 + w3) * 0.33);
    return normalize(vec3(-slope.x, 1.0, -slope.y));
}

void main() {
    vec3 eyeDir = normalize(vWorld - uEye);
    // The ripples flatten as the pond freezes: ice is a mirror, not a surface.
    vec3 normal = mix(pondNormal(vWorld.xz, uTime), vec3(0.0, 1.0, 0.0), uFreeze);

    // WITHOUT THIS TERM THE FAR EDGE IS A BLACK SEAM. Water reflects about two
    // percent looking straight down and nearly everything at a grazing angle,
    // and at this camera almost the whole pond is a grazing angle.
    float cosTheta = clamp(dot(-eyeDir, normal), 0.0, 1.0);
    float fresnel = uReflectance + (1.0 - uReflectance) * pow(1.0 - cosTheta, 5.0);

    // The reflection, sampled from the SAME sky function the dome uses.
    vec3 reflected = reflect(eyeDir, normal);
    reflected.y = abs(reflected.y);
    vec3 sky = gardenSkyLinear(reflected, uZenith, uHorizon, uLum, uGradientPower);

    // ---- AND THE CLOUDS IN IT ---------------------------------------------
    // The whole reason this shader imports the dome's GLSL rather than
    // approximating it: a cloudy sky over a cloudless lake is the same fault as
    // water reflecting a gradient nobody can see. One function, both surfaces.
    float pondCloud =
        gardenCloudCover(reflected, uCloudCover, uCloudDrift, uCloudShape, uCloudForm) * uCloudOpacity;
    vec3 pondCloudBody = mix(uCloudColor, uCloudStorm, uCloudWet);
    vec3 pondCloudSrgb = mix(pondCloudBody, uHorizon,
        uCloudWarmth * (1.0 - clamp(reflected.y * 2.2, 0.0, 1.0)));
    sky = mix(sky, gardenSrgbToLinear(pondCloudSrgb) * uLum, pondCloud);

    // A sun glint, which is most of what makes water read as water at dawn.
    float glint = pow(max(dot(reflected, uSunDir), 0.0), 220.0);
    sky += gardenSrgbToLinear(uSunColor) * glint * 5.0 * uSunUp * (1.0 - uFreeze);

    vec3 body = gardenSrgbToLinear(uBody) * uLum * 0.35;
    vec3 col = mix(body, sky, fresnel);

    // Ice: brighter, flatter, and it takes the sky far less.
    col = mix(col, gardenSrgbToLinear(uIce) * uLum * 0.55 + sky * 0.16, uFreeze);

    // A soft edge so the water meets the shore without a hard rim. RADIAL,
    // because the surface is an ellipse now rather than a rectangle: a circle's
    // uv puts the centre at 0.5 and the rim at 0.5 from it, so this is exactly
    // the normalised basin radius pondBasinAt uses. It is insurance rather than
    // the shore: the rim sits at r = 1 and the real waterline is at 0.84, so
    // this band is under the bank and unseen unless the terrain is retuned.
    float rim = length(vPondUv - vec2(0.5)) * 2.0;
    float edge = smoothstep(1.0, 0.94, rim);

    gl_FragColor = vec4(gardenLinearToSrgb(gardenToneMap(col * uExposure)), edge);
}
`;

// ---- State -----------------------------------------------------------------

let sceneRef = null;
let ridges = [];
let pond = null;
let pathMesh = null;
let gateGroup = null;
const disposables = [];

// ---- Mountains -------------------------------------------------------------

/**
 * One ridge, as a curtain of triangles along an arc.
 *
 * The profile is a seeded sum of sines rather than noise, for the same reason
 * the ground is: it has to be the same range on every visit, and a handful of
 * sines is cheaper to be sure about than a noise implementation.
 */
function buildRidge(layer, index, config) {
    const M = config.world.mountains;
    const random = makeRandom(config.world.seed + 977 * (index + 1));
    const spread = M.spreadDegrees * Math.PI / 180;
    const segments = layer.segments;

    // Three sine terms with seeded phases: a broad shape, peaks, and detail.
    const terms = [
        { amp: 0.55, freq: 1.4 + random() * 0.5, phase: random() * 6.28 },
        { amp: 0.30, freq: 3.6 + random() * 1.4, phase: random() * 6.28 },
        { amp: 0.15, freq: 8.5 + random() * 3.0, phase: random() * 6.28 }
    ];

    const position = new Float32Array((segments + 1) * 2 * 3);
    const uv = new Float32Array((segments + 1) * 2 * 2);
    const index16 = new Uint32Array(segments * 6);

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = -spread + t * spread * 2;
        // North is -Z, so the arc is centred there.
        const x = Math.sin(angle) * layer.distance;
        const z = -Math.cos(angle) * layer.distance;

        let profile = 0;
        for (const term of terms) profile += term.amp * Math.sin(t * term.freq * 6.283 + term.phase);
        // Fold to positive and bias, so the ridge never dips below its base.
        const height = layer.height * (0.42 + 0.58 * clamp01(profile * layer.roughness + 0.5));

        const base = i * 2;
        position[base * 3] = x;
        position[base * 3 + 1] = 0;
        position[base * 3 + 2] = z;
        position[(base + 1) * 3] = x;
        position[(base + 1) * 3 + 1] = height;
        position[(base + 1) * 3 + 2] = z;
        uv[base * 2] = t; uv[base * 2 + 1] = 0;
        uv[(base + 1) * 2] = t; uv[(base + 1) * 2 + 1] = 1;

        if (i < segments) {
            const o = i * 6;
            index16[o] = base; index16[o + 1] = base + 1; index16[o + 2] = base + 3;
            index16[o + 3] = base; index16[o + 4] = base + 3; index16[o + 5] = base + 2;
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(index16, 1));
    geo.computeBoundingSphere();

    const uniforms = {
        // PER LAYER, FALLING BACK TO THE RANGE'S OWN ROCK. The near tier is a
        // wooded rise rather than a peak, and a third grey silhouette would
        // have added distance without adding a middle distance. See M14-2.
        uRock: { value: new THREE.Vector3(...unpackColor(layer.color || M.rockColor)) },
        uHaze: { value: new THREE.Vector3(0.6, 0.7, 0.8) },
        uHazeAmount: { value: layer.haze }
    };

    const material = new THREE.ShaderMaterial({
        vertexShader: RIDGE_VERT,
        fragmentShader: RIDGE_FRAG,
        uniforms,
        // See the header: fog here would paint the ridge the colour of the sky.
        fog: false,
        toneMapped: false,
        side: THREE.DoubleSide,
        depthWrite: true
    });

    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `ridge-${index}`;
    mesh.frustumCulled = false;
    // Behind everything except the sky.
    mesh.renderOrder = -900 + index;
    disposables.push(geo, material);
    return { mesh, uniforms, layer };
}

// ---- The pond --------------------------------------------------------------

function buildPond(config) {
    const P = config.world.pond;
    // THE WIDTH IS DERIVED, NOT A CONFIG KEY. Reading `P.halfWidth` here after
    // it moved into `pondHalfWidth()` built the plane NaN metres wide, and a
    // NaN plane draws nothing at all: the lake simply was not there. Nothing
    // threw, and the whole suite stayed green, because under the test stub a
    // geometry is a proxy and NaN is just another number it absorbs.
    // ---- THE WATER IS AN ELLIPSE BECAUSE THE BASIN IS (QA 2026-08-31) -----
    //
    // It was a RECTANGLE over an elliptical basin, and the corners of a
    // rectangle are outside the ellipse it contains. `lakeShelfAt` levels the
    // ground toward the pond's centre out to a normalised radius of 1.8 and a
    // rectangle's corner is at 1.41, so the levelling is only two thirds done
    // there and the raw meadow waves still dip. Measured, the far-left corner
    // sat 44 cm BELOW the water line, which is a puddle of lake sitting out on
    // the grass with nothing around it. QA: "a small puddle behind the back
    // left corner of the lake."
    //
    // A unit circle scaled to the basin's own two radii makes the drawn shape
    // the dug shape, so the artefact is gone by construction rather than by a
    // fade or a threshold. Measured, the true waterline is a clean ellipse at
    // r = 0.84 at every angle, so the rim at r = 1 is buried under a metre and
    // a half of bank all the way round: what the visitor sees is the shore,
    // never the mesh.
    //
    // 64 segments for 64 triangles against a 400,000 budget. THE RIPPLES DO NOT
    // CARE: `pondNormal` is fed `vWorld.xz`, so the surface pattern is in world
    // space and is not attached to this geometry at all.
    const geo = new THREE.CircleGeometry(1, 64);
    geo.rotateX(-Math.PI / 2);
    geo.scale(pondHalfWidth(config.world), 1, P.halfDepth);

    const uniforms = {
        uZenith: { value: new THREE.Vector3() },
        uHorizon: { value: new THREE.Vector3() },
        uLum: { value: 1 },
        uExposure: { value: config.sky.exposure },
        uGradientPower: { value: config.sky.gradientPower },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Vector3(1, 1, 1) },
        uSunUp: { value: 0 },
        uBody: { value: new THREE.Vector3(...unpackColor(P.bodyColor)) },
        uIce: { value: new THREE.Vector3(...unpackColor(P.iceColor)) },
        uFreeze: { value: 0 },
        uTime: { value: 0 },
        uRippleScale: { value: P.rippleScale },
        uRippleHeight: { value: P.rippleHeight },
        uReflectance: { value: P.baseReflectance },
        ...cloudUniforms(config),
        uEye: { value: new THREE.Vector3() }
    };

    const material = new THREE.ShaderMaterial({
        vertexShader: POND_VERT,
        fragmentShader: SKY_GLSL + POND_FRAG,
        uniforms,
        transparent: true,
        depthWrite: false,
        fog: false,
        toneMapped: false
    });

    const mesh = new THREE.Mesh(geo, material);
    mesh.name = 'pond';
    mesh.position.set(P.x, pondWaterLevel(config.world), P.z);
    mesh.renderOrder = 5;
    disposables.push(geo, material);
    return { mesh, uniforms };
}

// ---- The path and the gate -------------------------------------------------

/**
 * A worn track from the gate, past the pond, and away into the trees.
 *
 * A ribbon of triangles laid on the ground rather than a texture on it: the
 * meadow rolls, and a flat decal would float over the rises. Each pair of
 * vertices sits at `worldHeightAt` plus a hair, which is the same function the
 * trees stand on, so the path can never sink into a slope the trees are
 * standing on top of.
 */
function buildPath(config) {
    const P = config.world.path;
    const points = P.points;
    const position = new Float32Array(points.length * 2 * 3);
    const index = new Uint32Array((points.length - 1) * 6);

    for (let i = 0; i < points.length; i++) {
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(points.length - 1, i + 1)];
        // Perpendicular to the direction of travel, so the ribbon keeps its
        // width through the bends instead of pinching.
        const dx = next.x - prev.x;
        const dz = next.z - prev.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        const half = P.width / 2 * (i === points.length - 1 ? 1.6 : 1);

        for (const side of [-1, 1]) {
            const v = i * 2 + (side > 0 ? 1 : 0);
            const x = points[i].x + nx * half * side;
            const z = points[i].z + nz * half * side;
            position[v * 3] = x;
            position[v * 3 + 1] = worldHeightAt(x, z) + 0.02;
            position[v * 3 + 2] = z;
        }

        if (i < points.length - 1) {
            const o = i * 6;
            const b = i * 2;
            index[o] = b; index[o + 1] = b + 2; index[o + 2] = b + 3;
            index[o + 3] = b; index[o + 4] = b + 3; index[o + 5] = b + 1;
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const material = new THREE.MeshLambertMaterial({ color: P.color });
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = 'path';
    mesh.receiveShadow = true;
    disposables.push(geo, material);
    return mesh;
}

/** Two posts and a lintel in the north wall, where the path leaves. */
function buildGate(config) {
    const G = config.world.path.gate;
    const group = new THREE.Group();
    group.name = 'gate';
    const material = new THREE.MeshLambertMaterial({ color: G.color });
    const half = config.plot.halfSize;

    for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, G.height, 0.22), material);
        const x = side * G.width / 2;
        post.position.set(x, worldHeightAt(x, -half) + G.height / 2, -half);
        post.castShadow = true;
        group.add(post);
        disposables.push(post.geometry);
    }

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(G.width + 0.5, 0.18, 0.26), material);
    lintel.position.set(0, worldHeightAt(0, -half) + G.height, -half);
    lintel.castShadow = true;
    group.add(lintel);
    disposables.push(lintel.geometry, material);
    return group;
}

// ---- Build and drive -------------------------------------------------------

export function initVista(scene, camera, config = GARDEN_CONFIG) {
    sceneRef = scene;

    ridges = config.world.mountains.layers.map((layer, i) => buildRidge(layer, i, config));
    for (const ridge of ridges) scene.add(ridge.mesh);

    pond = buildPond(config);
    scene.add(pond.mesh);

    // BOTH OF THESE WERE BUILT TO LEAD THE EYE OUT OF THE CLEARING, which is
    // the opposite of what the scene is now for. Off by a flag rather than by a
    // deletion, and gating CONSTRUCTION rather than visibility so nothing is
    // built and then hidden. See PRD Addendum B.1.
    const P = config.world.path;
    if (P.enabled) {
        pathMesh = buildPath(config);
        scene.add(pathMesh);
    }
    if (P.gateEnabled) {
        gateGroup = buildGate(config);
        scene.add(gateGroup);
    }

    return { ridges, pond, pathMesh, gateGroup };
}

/**
 * Move the vista to an hour.
 *
 * @param {number} hour
 * @param {number} snowCoverage drives the freeze, so the pond and the ground
 *        change together rather than on two schedules
 * @param {number} gloom        the weather, so the water dulls under a storm
 */
/**
 * Tell the water which eye is looking at it.
 *
 * The pond's Fresnel is `normalize(vWorld - uEye)`, so the eye position decides
 * how much sky the surface returns. `updateVista` sets it from the scene's
 * camera once a frame, which is right until something renders the same water
 * from somewhere ELSE: www/garden's duck card puts a second camera four metres
 * off the surface, and drawing that pass with the main camera's eye would light
 * a close-up with a grazing angle taken from sixty metres away.
 *
 * Set it, draw, set it back. Cheaper and far narrower than running the whole of
 * `updateVista` twice, and it is the only uniform in here that is about the
 * VIEWER rather than about the world.
 */
export function setVistaEye(position) {
    if (pond && position) pond.uniforms.uEye.value.copy(position);
}

export function updateVista(hour, elapsed, snowCoverage = 0, gloom = 0, camera = null, cloud = 0, wet = 0, config = GARDEN_CONFIG) {
    const sky = applyGloom(skyStateAt(hour, config.sky.keys), gloom, config.sky);
    const light = lightingAt(hour, snowCoverage, gloom, null, config);
    const snow = clamp01(snowCoverage);

    // The ridge haze is the sky's horizon AS SHOWN, not the raw keyframe: it
    // has to match the pixels beside it, and those have been through the tone
    // curve and the encode.
    // The water reflects the same clouds the dome draws, driven from the same
    // two numbers. See the note beside gardenCloudCover in sky.js.
    if (pond) driveClouds(pond.uniforms, cloud, elapsed, wet, light.sunElevation, config);

    const haze = shownColor(sky.horizon, sky.lum, config.sky.exposure);
    for (const ridge of ridges) {
        setVec(ridge.uniforms.uHaze.value, haze);
        // A snowy world puts snow on the tops too.
        setVec(ridge.uniforms.uRock.value,
            packColor(mixColor(config.world.mountains.rockColor, config.terrain.snowColor, snow * 0.7)));
    }

    if (pond) {
        const u = pond.uniforms;
        setVec(u.uZenith.value, sky.zenith);
        setVec(u.uHorizon.value, sky.horizon);
        u.uLum.value = sky.lum;
        u.uTime.value = elapsed * config.world.pond.rippleSpeed;
        u.uFreeze.value = snow;
        const dir = directionAt(light.sunElevation, light.sunAzimuth);
        u.uSunDir.value.set(dir.x, dir.y, dir.z);
        setVec(u.uSunColor.value, light.sunColor);
        u.uSunUp.value = clamp01((light.sunElevation + 4) / 8);
        if (camera) u.uEye.value.copy(camera.position);
    }

    if (pathMesh) {
        pathMesh.material.color.setHex(
            packColor(mixColor(config.world.path.color, config.terrain.snowColor, snow * 0.85)));
    }
}

function setVec(vec, hex) {
    const [r, g, b] = unpackColor(hex);
    vec.set(r, g, b);
}

/**
 * The lake's surface. Used for the SNOW LINE and, since the lake became a tap
 * target, for picking: unlike a mulch bed this one is worth a raycast, because
 * an ellipse 58 m by 32 m is hundreds of pixels even from the composed
 * viewpoint. "Did the ray hit it" has an answer where "which of three
 * twelve-pixel ducks is nearest" did not.
 */
export function getPondMesh() { return pond ? pond.mesh : null; }

export function disposeVista() {
    const all = [...ridges.map((r) => r.mesh), pond && pond.mesh, pathMesh, gateGroup];
    for (const item of all) {
        if (item && sceneRef) sceneRef.remove(item);
    }
    for (const item of disposables) {
        if (item && typeof item.dispose === 'function') item.dispose();
    }
    disposables.length = 0;
    ridges = [];
    pond = null;
    pathMesh = null;
    gateGroup = null;
    sceneRef = null;
}
