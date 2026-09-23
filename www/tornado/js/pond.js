// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * pond.js - a farm pond in the foreground, reflecting the storm.
 *
 * THE GARDEN'S LAKE IN TECHNIQUE, NOT IN CODE. Its shader samples the
 * garden's own sky program and tone map, so it cannot stand under this sky.
 * What carries over is how it moves and how it reflects:
 *
 *   - THREE RIPPLE WAVES AT AWKWARD ANGLES, never a product of sines along x
 *     and z, which draws a grid. Directions whose ratios are not simple
 *     fractions never line up into a repeating cell.
 *   - A FRESNEL TERM, or water reflects nothing and reads as a hole. Real
 *     water reflects two percent looking straight down and nearly all of it
 *     at a grazing angle, which from 1.6 m up is most of this pond.
 *
 * It reflects THIS scene's sky: the bright strip along the horizon, and above
 * about five degrees the dark storm base, which is where the stand-in base's
 * far edge sits. The ripples roughen and drift downwind as the storm pulls
 * the air in.
 *
 * CLOSE ON PURPOSE. From an eye 1.6 m above the ground a pond 300 m away is a
 * line a few pixels tall; at 22 to 46 m this one is a band of about 45.
 * Display colors, like every custom shader here (see config.js).
 */
import { TORNADO_CONFIG } from './config.min.js';

const POND_VERT = /* glsl */`
varying vec3 vW;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const POND_FRAG = /* glsl */`
uniform vec2 uCenter;
uniform vec2 uRadii;
uniform float uTime;
uniform vec2 uWind;
uniform float uRipple;
uniform float uRippleScale;
uniform vec3 uHorizon;
uniform vec3 uSkyLow;
uniform vec3 uBaseCore;
uniform vec3 uBaseOuter;
uniform vec3 uBody;
uniform vec3 uShore;
uniform vec3 uHaze;
uniform float uVisibility;
varying vec3 vW;

vec3 rippleNormal(vec2 p, float t) {
    vec2 d1 = vec2(0.94, 0.34);
    vec2 d2 = vec2(-0.42, 0.91);
    vec2 d3 = vec2(0.71, -0.70);
    float k = uRippleScale;
    vec2 slope = d1 * cos(dot(p, d1) * k + t * 0.9) * 0.55
               + d2 * cos(dot(p, d2) * k * 1.63 - t * 1.17) * 0.30 * 1.63
               + d3 * cos(dot(p, d3) * k * 2.41 + t * 1.61) * 0.15 * 2.41;
    slope *= uRipple;
    return normalize(vec3(-slope.x, 1.0, -slope.y));
}

void main() {
    vec2 local = (vW.xz - uCenter) / uRadii;
    float r = length(local);
    if (r > 1.0) discard;

    // Ripples drift downwind.
    vec2 p = vW.xz - uWind * uTime * 0.8;
    vec3 n = rippleNormal(p, uTime);
    vec3 eye = normalize(vW - cameraPosition);
    vec3 refl = reflect(eye, n);
    float e = abs(refl.y);

    vec3 sky = mix(uHorizon, uSkyLow, smoothstep(0.0, 0.05, e));
    vec3 base = mix(uBaseOuter, uBaseCore, smoothstep(0.12, 0.45, e));
    sky = mix(sky, base, smoothstep(0.07, 0.10, e));

    float cosT = clamp(dot(-eye, n), 0.0, 1.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
    vec3 col = mix(uBody, sky, fresnel);
    // A muddy margin, and a soft edge into the grass.
    col = mix(col, uShore, smoothstep(0.82, 1.0, r) * 0.7);
    float alpha = 1.0 - smoothstep(0.93, 1.0, r);

    col = mix(col, uHaze, 1.0 - exp(-length(vW - cameraPosition) / uVisibility));
    gl_FragColor = vec4(col, alpha);
}
`;

const v3 = (c) => new THREE.Vector3(c[0], c[1], c[2]);

let pond = null;

/** How rough the water is in a wind of `speed`. */
export function rippleFor(speed, config = TORNADO_CONFIG) {
    return config.pond.ripple + config.pond.rippleWind * speed;
}

export function initPond(scene, config = TORNADO_CONFIG) {
    const P = config.pond;
    const C = config.colors;
    const geometry = new THREE.PlaneGeometry(P.radiusX * 2, P.radiusZ * 2, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    pond = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
        vertexShader: POND_VERT,
        fragmentShader: POND_FRAG,
        uniforms: {
            uCenter: { value: new THREE.Vector2(P.x, P.z) },
            uRadii: { value: new THREE.Vector2(P.radiusX, P.radiusZ) },
            uTime: { value: 0 },
            uWind: { value: new THREE.Vector2() },
            uRipple: { value: P.ripple },
            uRippleScale: { value: P.rippleScale },
            uHorizon: { value: v3(C.horizon) },
            uSkyLow: { value: v3(C.skyLow) },
            uBaseCore: { value: v3(C.baseCore) },
            uBaseOuter: { value: v3(C.baseOuter) },
            uBody: { value: v3(P.body) },
            uShore: { value: v3(P.shore) },
            uHaze: { value: v3(C.haze) },
            uVisibility: { value: config.visibility }
        },
        transparent: true,
        depthWrite: false
    }));
    pond.name = 'pond';
    // A few centimetres over the ground plane, so the two never fight.
    pond.position.set(P.x, 0.03, P.z);
    scene.add(pond);
    return pond;
}

/** This frame's wind at the pond ({ x, z, speed }) and the clock. */
export function updatePond(wind, time, config = TORNADO_CONFIG) {
    if (!pond) return;
    const u = pond.material.uniforms;
    u.uTime.value = time;
    u.uWind.value.set(wind.x, wind.z);
    u.uRipple.value = rippleFor(wind.speed, config);
}

/** Whether ground point (x, z) is in the water, with a margin in metres. */
export function inPond(x, z, margin = 0, config = TORNADO_CONFIG) {
    const P = config.pond;
    const dx = (x - P.x) / (P.radiusX + margin);
    const dz = (z - P.z) / (P.radiusZ + margin);
    return dx * dx + dz * dz <= 1;
}
