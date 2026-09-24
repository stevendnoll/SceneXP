// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * funnel.js - the tornado's shape as a pure function of time.
 *
 * The one place that says what the tornado IS at a given second: a spine (a
 * bent line from the ground to the wall cloud) and a radius along it. The
 * JavaScript half answers for the debris and for the tests. FUNNEL_GLSL is
 * the same arithmetic for the shaders, and the two must be edited together.
 *
 * EVERYTHING HERE IS A FUNCTION OF (arc seconds, animation seconds), with no
 * state carried between frames, which is what makes a seek or a Restart land
 * on exactly the tornado an untouched watch has at that second. High Water
 * learned that the hard way with its tide. The animation clock is separate
 * only so the texture keeps turning behind the welcome card; it decides the
 * phase of the spin and nothing about the story.
 *
 * FROM THE M0 SPIKE (2026-09-23), with two fixes the spike found before any
 * browser saw it: the tip taper must end below the ground once the funnel is
 * down (`tipOf`), or a touched-down tornado still narrows to a point; and the
 * shells' tube winding (see shells.js). tests/tornado-funnel.test.mjs holds
 * both.
 */
import { TORNADO_CONFIG } from './config.min.js';

// ---------------------------------------------------------------------------
// Keyframes
// ---------------------------------------------------------------------------

function smooth(x) { return x * x * (3 - 2 * x); }

/** A value from [[seconds, value], ...] keys, smoothstepped between them. */
export function keyAt(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
        const [t1, v1] = keys[i];
        if (t <= t1) {
            const [t0, v0] = keys[i - 1];
            return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0));
        }
    }
    return keys[keys.length - 1][1];
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * Everything the shaders need at arc second `t`. `anim` is the clock the
 * texture spins on (see the header).
 */
export function funnelStateAt(t, anim = t, config = TORNADO_CONFIG) {
    const L = config.lifecycle;
    const F = config.funnel;
    const S = config.storm;
    const distance = S.distance;
    const azimuth = F.leanAzimuthDegrees * Math.PI / 180;

    const wall = keyAt(t, L.wall);
    const width = keyAt(t, L.width);
    const rope = keyAt(t, L.rope);
    const dust = keyAt(t, L.dust);

    return {
        t,
        anim,
        wall,
        extent: keyAt(t, L.extent),
        dust,
        width,
        rope,
        breakup: keyAt(t, L.breakup),
        inflow: keyAt(t, L.inflow),
        origin: { x: S.trackX, z: -distance },
        top: S.baseHeight - S.wallDrop * wall,
        lean: F.leanBase + F.leanRope * rope,
        leanDir: { x: -Math.cos(azimuth), z: -Math.sin(azimuth) },
        snake: F.snakeBase + F.snakeRope * rope,
        waves: F.snakeWaves,
        snakeRate: F.snakeRate,
        trunk: F.trunkRadius * width,
        // A cone while mature, a uniform tube as it ropes out.
        cone: F.coneBase + (1 - F.coneBase) * rope,
        flare: F.flareRadius * (0.4 + 0.6 * wall),
        flareStart: F.flareStart,
        dustRadius: config.dust.radius * (0.35 + 0.65 * dust),
        dustHeight: config.dust.height * (0.3 + 0.7 * dust)
    };
}

// ---------------------------------------------------------------------------
// Shape (mirrored in FUNNEL_GLSL)
// ---------------------------------------------------------------------------

/** Point on the spine at u (0 ground, 1 wall cloud). */
export function spineAt(u, s) {
    const bend = Math.pow(1 - u, 1.4) * s.lean;
    const env = Math.sin(Math.PI * u);
    const phase = s.anim * s.snakeRate;
    return {
        x: s.origin.x + s.leanDir.x * bend
            + s.snake * env * Math.sin(2 * Math.PI * s.waves * u + phase),
        y: u * s.top,
        z: s.origin.z + s.leanDir.z * bend
            + 0.35 * s.snake * env * Math.cos(1.4 * Math.PI * s.waves * u + 0.8 * phase)
    };
}

function smoothstep(e0, e1, x) {
    const k = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
    return k * k * (3 - 2 * k);
}

/**
 * Height fraction of the funnel's tip. The taper is 0.12 long and must END
 * at the ground when the funnel is fully down, or a touched-down tornado
 * still narrows to a point at the ground.
 */
export function tipOf(extent) {
    return 1 - extent * 1.12;
}

/** Radius of the condensation funnel at u. Zero below its tip. */
export function radiusAt(u, s) {
    const cone = s.cone + (1 - s.cone) * Math.pow(u, 0.8);
    const f = smoothstep(s.flareStart, 1, u);
    const r = s.trunk * cone + s.flare * f * f;
    return r * smoothstep(tipOf(s.extent), tipOf(s.extent) + 0.12, u);
}

/** Axis-aligned box around funnel and dust, padded for torn edges. */
export function boundsOf(s, pad = 1.6) {
    const min = { x: Infinity, y: 0, z: Infinity };
    const max = { x: -Infinity, y: s.top + 10, z: -Infinity };
    for (let i = 0; i <= 40; i++) {
        const u = i / 40;
        const c = spineAt(u, s);
        const r = radiusAt(u, s) * pad + 4;
        min.x = Math.min(min.x, c.x - r); max.x = Math.max(max.x, c.x + r);
        min.z = Math.min(min.z, c.z - r); max.z = Math.max(max.z, c.z + r);
    }
    const g = spineAt(0, s);
    const d = s.dustRadius * 1.3;
    min.x = Math.min(min.x, g.x - d); max.x = Math.max(max.x, g.x + d);
    min.z = Math.min(min.z, g.z - d); max.z = Math.max(max.z, g.z + d);
    return { min, max };
}

// ---------------------------------------------------------------------------
// Debris
// ---------------------------------------------------------------------------

function hash(n) {
    let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
}

/**
 * Where debris chunk i is at this moment, as a pure function of time. Each
 * chunk loops: lifted near the core, carried up and out, dropped at the edge.
 * Writes {x, y, z, size, spin} into `out` (size 0 hides it).
 */
export function debrisPose(i, s, config = TORNADO_CONFIG, out = {}) {
    const D = config.debris;
    const period = D.periodMin + (D.periodMax - D.periodMin) * hash(i * 3 + 1);
    const phase = (s.anim / period + hash(i * 3 + 2)) % 1;
    const radial = 0.35 + 0.95 * hash(i * 3 + 3);
    const lift = D.maxHeight * (0.25 + 0.75 * hash(i * 7 + 5)) * s.dust;
    const g = spineAt(0, s);
    const r = s.dustRadius * radial * (0.6 + 0.7 * phase);
    // Faster close in, like the wind.
    const omega = 0.9 / Math.max(radial, 0.3);
    const a = hash(i * 5 + 9) * 6.2832 + omega * s.anim;
    const shown = hash(i * 11 + 4) < s.dust ? 1 : 0;
    out.x = g.x + Math.cos(a) * r;
    out.z = g.z + Math.sin(a) * r;
    out.y = 2 + lift * Math.sin(Math.PI * phase);
    out.size = shown * (D.minSize + (D.maxSize - D.minSize) * hash(i * 13 + 7));
    out.spin = s.anim * (1 + 3 * hash(i * 17 + 3));
    return out;
}

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

// Uniform declarations and the shape functions. The spine and radius here
// MUST match spineAt and radiusAt above. No backticks in the comments below:
// a backtick ends the template literal.
export const FUNNEL_GLSL = /* glsl */`
uniform float uTime;
uniform vec3 uOrigin;
uniform float uTop;
uniform float uLean;
uniform vec2 uLeanDir;
uniform float uSnake;
uniform float uWaves;
uniform float uSnakeRate;
uniform float uTrunk;
uniform float uCone;
uniform float uFlare;
uniform float uFlareStart;
uniform float uExtent;
uniform float uBreakup;
uniform float uSpinBottom;
uniform float uSpinTop;
uniform float uTwist;
uniform float uUpdraft;
uniform float uVScale;
uniform float uNoiseK;
uniform vec3 uDustCenter;
uniform float uDustRadius;
uniform float uDustHeight;
uniform float uDustAmount;
uniform vec3 uSunDir;
uniform vec3 uHaze;
uniform float uVisibility;
uniform vec3 uCondLit;
uniform vec3 uCondShade;
uniform vec3 uDustLit;
uniform vec3 uDustShade;

vec3 spineAt(float u) {
    float bend = pow(1.0 - u, 1.4) * uLean;
    float env = sin(3.14159265 * u);
    float phase = uTime * uSnakeRate;
    return vec3(
        uOrigin.x + uLeanDir.x * bend + uSnake * env * sin(6.2831853 * uWaves * u + phase),
        u * uTop,
        uOrigin.z + uLeanDir.y * bend + 0.35 * uSnake * env * cos(4.3982297 * uWaves * u + 0.8 * phase)
    );
}

// Must match tipOf() above.
float funnelTip() {
    return 1.0 - uExtent * 1.12;
}

float radiusAt(float u) {
    float cone = mix(uCone, 1.0, pow(max(u, 0.0), 0.8));
    float f = smoothstep(uFlareStart, 1.0, u);
    float r = uTrunk * cone + uFlare * f * f;
    float tip = funnelTip();
    return r * smoothstep(tip, tip + 0.12, u);
}

// Hash without sine, so it holds on mobile GPUs.
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

float fbm(vec3 p, int octaves) {
    float sum = 0.0;
    float amp = 0.5;
    float norm = 0.0;
    for (int i = 0; i < 5; i++) {
        if (i >= octaves) break;
        sum += amp * vnoise(p);
        norm += amp;
        p = p * 2.03 + vec3(17.1, 3.7, 9.2);
        amp *= 0.5;
    }
    return sum / norm;
}

// Gaps that open along the funnel as it dissipates. 1 where it survives.
float breakMask(float u, float seed) {
    float n = vnoise(vec3(u * 7.0, uTime * 0.12, seed));
    float k = uBreakup * 1.15 - 0.08;
    return smoothstep(k - 0.04, k + 0.10, n);
}

vec3 applyHaze(vec3 col, vec3 worldPos) {
    float d = length(worldPos - cameraPosition);
    return mix(col, uHaze, 1.0 - exp(-d / uVisibility));
}
`;

function vec3(c) { return new THREE.Vector3(c[0], c[1], c[2]); }

/** The shared uniforms, as THREE uniform objects every funnel material holds. */
export function funnelUniforms(config = TORNADO_CONFIG) {
    const F = config.funnel;
    const C = config.colors;
    const sun = new THREE.Vector3(config.sun.x, config.sun.y, config.sun.z).normalize();
    return {
        uTime: { value: 0 },
        uOrigin: { value: new THREE.Vector3() },
        uTop: { value: config.storm.baseHeight },
        uLean: { value: 0 },
        uLeanDir: { value: new THREE.Vector2(-1, 0) },
        uSnake: { value: 0 },
        uWaves: { value: F.snakeWaves },
        uSnakeRate: { value: F.snakeRate },
        uTrunk: { value: 0 },
        uCone: { value: F.coneBase },
        uFlare: { value: 0 },
        uFlareStart: { value: F.flareStart },
        uExtent: { value: 0 },
        uBreakup: { value: 0 },
        uSpinBottom: { value: F.spinBottom },
        uSpinTop: { value: F.spinTop },
        uTwist: { value: F.twist },
        uUpdraft: { value: F.updraft },
        uVScale: { value: F.verticalScale },
        uNoiseK: { value: F.noiseK },
        uDustCenter: { value: new THREE.Vector3() },
        uDustRadius: { value: 0 },
        uDustHeight: { value: 0 },
        uDustAmount: { value: 0 },
        uSunDir: { value: sun },
        uHaze: { value: vec3(C.haze) },
        uVisibility: { value: config.visibility },
        uCondLit: { value: vec3(C.condLit) },
        uCondShade: { value: vec3(C.condShade) },
        uDustLit: { value: vec3(C.dustLit) },
        uDustShade: { value: vec3(C.dustShade) }
    };
}

/** Copy a funnelStateAt() result into the shared uniforms. */
export function applyFunnelState(u, s) {
    u.uTime.value = s.anim;
    u.uOrigin.value.set(s.origin.x, 0, s.origin.z);
    u.uTop.value = s.top;
    u.uLean.value = s.lean;
    u.uLeanDir.value.set(s.leanDir.x, s.leanDir.z);
    u.uSnake.value = s.snake;
    u.uTrunk.value = s.trunk;
    u.uCone.value = s.cone;
    u.uFlare.value = s.flare;
    u.uExtent.value = s.extent;
    u.uBreakup.value = s.breakup;
    const g = spineAt(0, s);
    u.uDustCenter.value.set(g.x, 0, g.z);
    u.uDustRadius.value = s.dustRadius;
    u.uDustHeight.value = s.dustHeight;
    u.uDustAmount.value = s.dust;
}
