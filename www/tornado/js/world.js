// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * world.js - A STAND-IN: just enough storm and prairie to judge a funnel
 * against, carried over from the M0 spike unchanged.
 *
 * None of this is the M2 or M3 build, and all of it is replaced there. A
 * funnel looks different against a flat gray backdrop than against a dark
 * base with a bright horizon strip under it, so the stand-in gives it:
 * a sky gradient, the rain-free base (a disc seen from below, turning slowly
 * about the funnel), the lowered wall cloud the funnel hangs from, a prairie
 * lit gold by a low sun behind the camera, and the debris orbiting the base.
 * Every shader writes display colours directly (see config.js).
 */
import { TORNADO_CONFIG } from './config.min.js';
import { debrisPose } from './funnel.min.js';

const NOISE_GLSL = /* glsl */`
float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
            mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
        mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
            mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
        f.z);
}
float fbm4(vec3 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        s += a * vnoise(p);
        p = p * 2.03 + vec3(17.1, 3.7, 9.2);
        a *= 0.5;
    }
    return s / 0.9375;
}
uniform vec3 uHaze;
uniform float uVisibility;
vec3 applyHaze(vec3 col, vec3 worldPos) {
    float d = length(worldPos - cameraPosition);
    return mix(col, uHaze, 1.0 - exp(-d / uVisibility));
}
`;

const WORLD_VERT = /* glsl */`
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SKY_FRAG = /* glsl */`
uniform vec3 uHorizon;
uniform vec3 uSkyLow;
uniform vec3 uZenith;
varying vec3 vW;
void main() {
    vec3 d = normalize(vW - cameraPosition);
    float e = max(d.y, 0.0);
    vec3 col = mix(uHorizon, uSkyLow, smoothstep(0.0, 0.09, e));
    col = mix(col, uZenith, smoothstep(0.09, 0.6, e));
    // Below the horizon the ground covers it; keep it the horizon colour.
    gl_FragColor = vec4(col, 1.0);
}
`;

const BASE_FRAG = /* glsl */`
${NOISE_GLSL}
uniform vec3 uCenter;
uniform float uRadius;
uniform vec3 uCore;
uniform vec3 uOuter;
uniform vec3 uFunnelTop;
uniform float uTime;
uniform float uWall;
varying vec3 vW;
void main() {
    vec2 rel = vW.xz - uFunnelTop.xz;
    float r = length(rel);
    // Slow rotation about the funnel, faster close in: the mesocyclone.
    float spin = uTime * (0.05 + 0.25 * uWall) * 2200.0 / (r + 1400.0);
    float cs = cos(spin);
    float sn = sin(spin);
    vec2 p = vec2(cs * rel.x - sn * rel.y, sn * rel.x + cs * rel.y);
    float n = fbm4(vec3(p / 700.0, uTime * 0.02));
    float streak = fbm4(vec3(p / 260.0, 3.1));
    vec3 col = mix(uCore, uOuter, smoothstep(300.0, 3800.0, r));
    col *= 0.78 + 0.36 * n + 0.10 * (streak - 0.5);
    float fromCenter = length(vW.xz - uCenter.xz) / uRadius;
    float alpha = 1.0 - smoothstep(0.72, 1.0, fromCenter + (n - 0.5) * 0.18);
    col = applyHaze(col, vW);
    gl_FragColor = vec4(col, alpha);
}
`;

const WALL_FRAG = /* glsl */`
${NOISE_GLSL}
uniform vec3 uColor;
uniform vec3 uCenter;
uniform float uTime;
uniform vec3 uSunDir;
varying vec3 vW;
varying vec3 vN;
void main() {
    vec2 rel = vW.xz - uCenter.xz;
    float spin = uTime * 0.35;
    float cs = cos(spin);
    float sn = sin(spin);
    vec2 p = vec2(cs * rel.x - sn * rel.y, sn * rel.x + cs * rel.y);
    float n = fbm4(vec3(p / 120.0, vW.y / 60.0));
    float lam = clamp(dot(normalize(vN), uSunDir) * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = uColor * (0.75 + 0.5 * n) * (0.8 + 0.35 * lam);
    col = applyHaze(col, vW);
    gl_FragColor = vec4(col, 1.0);
}
`;

const GROUND_FRAG = /* glsl */`
${NOISE_GLSL}
uniform vec3 uWheat;
uniform vec3 uPasture;
uniform vec3 uShade;
uniform vec3 uTarget;
uniform float uTime;
uniform float uInflow;
varying vec3 vW;
void main() {
    vec2 p = vW.xz;
    float d = length(p - cameraPosition.xz);
    float fields = fbm4(vec3(p / 380.0, 0.0));
    float fine = fbm4(vec3(p / 9.0, 1.7));
    vec3 col = mix(uWheat, uPasture, smoothstep(0.48, 0.56, fields));
    // The fine grain only near the camera, or it shimmers at distance.
    col *= 1.0 + 0.24 * (fine - 0.55) * (1.0 - smoothstep(150.0, 1200.0, d));
    // Gusts running toward the storm: the inflow.
    vec2 toward = normalize(uTarget.xz - p + vec2(1e-3));
    float gust = fbm4(vec3(p / 60.0 - toward * uTime * 0.22, uTime * 0.05));
    col *= 1.0 + uInflow * 0.22 * (smoothstep(0.45, 0.75, gust) - 0.4);
    // Sunlit near the camera, under the storm's shadow further out.
    col = mix(col, uShade * (0.9 + 0.2 * fields), smoothstep(700.0, 2200.0, d));
    col = applyHaze(col, vW);
    gl_FragColor = vec4(col, 1.0);
}
`;

const DEBRIS_VERT = /* glsl */`
varying vec3 vW;
void main() {
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const DEBRIS_FRAG = /* glsl */`
uniform vec3 uColor;
uniform vec3 uHaze;
uniform float uVisibility;
varying vec3 vW;
void main() {
    float d = length(vW - cameraPosition);
    gl_FragColor = vec4(mix(uColor, uHaze, 1.0 - exp(-d / uVisibility)), 1.0);
}
`;

const v3 = (c) => new THREE.Vector3(c[0], c[1], c[2]);

// The wall cloud's flat underside, as a fraction of its radius. It must be
// wider than the funnel's flared top at every second, or the funnel's top
// ring shows as a lip (about 260 m when mature against 0.7 x 430 = 301 m).
const UNDERSIDE = 0.7;

/**
 * How much the wall cloud is scaled across at this moment. In its last half
 * (wall under 0.5, once the funnel is gone) it also draws in to nothing as it
 * lifts into the base, so its flat underside never lingers as a disc under
 * the storm: that disc is what hid the rainbow in QA (2026-09-23, tornado-5).
 */
function wallScale(state) {
    const k = Math.min(1, Math.max(0, state.wall / 0.5));
    return (0.7 + 0.3 * state.wall) * k * k * (3 - 2 * k);
}

/** The radius of the wall cloud's flat underside at this moment, metres. */
export function wallUndersideRadius(state, config = TORNADO_CONFIG) {
    return config.storm.wallRadius * UNDERSIDE * wallScale(state);
}

let base = null;
let wall = null;
let ground = null;
let debris = null;
const pose = {};
const dummy = { matrix: null, position: null, rotation: null, scale: null };

export function initWorld(scene, config = TORNADO_CONFIG) {
    const C = config.colors;
    const S = config.storm;
    const haze = { uHaze: { value: v3(C.haze) }, uVisibility: { value: config.visibility } };
    const sun = new THREE.Vector3(config.sun.x, config.sun.y, config.sun.z).normalize();

    const sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 32, 16), new THREE.ShaderMaterial({
        vertexShader: WORLD_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: { uHorizon: { value: v3(C.horizon) }, uSkyLow: { value: v3(C.skyLow) }, uZenith: { value: v3(C.zenith) } },
        side: THREE.BackSide,
        depthWrite: false
    }));
    sky.renderOrder = -1000;
    sky.frustumCulled = false;
    scene.add(sky);

    base = new THREE.Mesh(new THREE.CircleGeometry(S.baseRadius, 96), new THREE.ShaderMaterial({
        vertexShader: WORLD_VERT,
        fragmentShader: BASE_FRAG,
        uniforms: {
            ...haze,
            uCenter: { value: new THREE.Vector3() },
            uRadius: { value: S.baseRadius },
            uCore: { value: v3(C.baseCore) },
            uOuter: { value: v3(C.baseOuter) },
            uFunnelTop: { value: new THREE.Vector3() },
            uTime: { value: 0 },
            uWall: { value: 0 }
        },
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false
    }));
    base.rotation.x = Math.PI / 2;     // facing down
    base.renderOrder = -900;
    scene.add(base);

    // The wall cloud: a lathe that is flat on top (hidden in the base) and
    // rounds down to a flat underside the funnel hangs from. See UNDERSIDE.
    const R = S.wallRadius;
    const profile = [
        [0, -1], [UNDERSIDE, -1], [0.86, -0.88], [0.94, -0.6], [0.98, -0.25], [1.05, 0.02], [0, 0.02]
    ].map(([x, y]) => new THREE.Vector2(x * R, y));
    wall = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), new THREE.ShaderMaterial({
        vertexShader: WORLD_VERT,
        fragmentShader: WALL_FRAG,
        uniforms: {
            ...haze,
            uColor: { value: v3(C.wall) },
            uCenter: { value: new THREE.Vector3() },
            uTime: { value: 0 },
            uSunDir: { value: sun }
        },
        side: THREE.DoubleSide
    }));
    wall.name = 'wall-cloud';
    scene.add(wall);

    ground = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000), new THREE.ShaderMaterial({
        vertexShader: WORLD_VERT,
        fragmentShader: GROUND_FRAG,
        uniforms: {
            ...haze,
            uWheat: { value: v3(C.wheat) },
            uPasture: { value: v3(C.pasture) },
            uShade: { value: v3(C.groundShade) },
            uTarget: { value: new THREE.Vector3() },
            uTime: { value: 0 },
            uInflow: { value: 0 }
        }
    }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.35, 0.7), new THREE.ShaderMaterial({
        vertexShader: DEBRIS_VERT,
        fragmentShader: DEBRIS_FRAG,
        uniforms: { ...haze, uColor: { value: v3(C.debris) } }
    }), config.debris.count);
    debris.frustumCulled = false;
    scene.add(debris);

    dummy.matrix = new THREE.Matrix4();
    dummy.position = new THREE.Vector3();
    dummy.rotation = new THREE.Quaternion();
    dummy.euler = new THREE.Euler();
    dummy.scale = new THREE.Vector3();
}

/** Move everything to this moment. `showDebris` false hides the chunks. */
export function updateWorld(state, showDebris, config = TORNADO_CONFIG) {
    const S = config.storm;
    const top = state.origin;
    base.position.set(top.x, S.baseHeight, top.z + S.baseOffsetZ);
    base.material.uniforms.uCenter.value.copy(base.position);
    base.material.uniforms.uFunnelTop.value.set(top.x, S.baseHeight, top.z);
    base.material.uniforms.uTime.value = state.anim;
    base.material.uniforms.uWall.value = state.wall;

    // The lathe's y runs 0 (top) to -1 (underside), scaled to the drop, and
    // tucked 20 m up into the base so its top edge never shows.
    const drop = Math.max(S.baseHeight - state.top, 1) + 20;
    wall.position.set(top.x, S.baseHeight + 20, top.z);
    wall.scale.set(wallScale(state), drop, wallScale(state));
    // Gone means gone: a wall cloud of nothing would only fight the base.
    wall.visible = wallScale(state) > 0.005;
    wall.material.uniforms.uCenter.value.copy(wall.position);
    wall.material.uniforms.uTime.value = state.anim;

    ground.material.uniforms.uTarget.value.set(top.x, 0, top.z);
    ground.material.uniforms.uTime.value = state.anim;
    ground.material.uniforms.uInflow.value = state.inflow;

    debris.visible = showDebris && state.dust > 0.001;
    if (!debris.visible) return;
    for (let i = 0; i < config.debris.count; i++) {
        debrisPose(i, state, config, pose);
        dummy.position.set(pose.x, pose.y, pose.z);
        dummy.euler.set(pose.spin, pose.spin * 0.7, pose.spin * 0.3);
        dummy.rotation.setFromEuler(dummy.euler);
        dummy.scale.setScalar(Math.max(pose.size, 1e-4));
        dummy.matrix.compose(dummy.position, dummy.rotation, dummy.scale);
        debris.setMatrixAt(i, dummy.matrix);
    }
    debris.instanceMatrix.needsUpdate = true;
}
