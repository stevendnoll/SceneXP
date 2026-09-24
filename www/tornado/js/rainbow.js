// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * rainbow.js - the last payoff: a rainbow in the departing storm.
 *
 * A RAINBOW IS A CIRCLE ROUND THE POINT OPPOSITE THE SUN. Every raindrop that
 * sends color to the eye does it at about 42 degrees from that point (red
 * outermost), and a fainter second bow sits at about 51 with its colors
 * reversed. The sky inside the first bow is a little brighter, and the band
 * between the two a little darker (Alexander's band). So the bow is drawn as
 * a function of one angle: how far each direction on the dome is from that
 * point.
 *
 * WHERE THE POINT IS. Opposite this scene's sun, so just left of straight
 * ahead. The real sun is 9 degrees up, which would put the bow's crown just
 * above the top of the frame; the point sits a few degrees lower here
 * (config.rainbow.centerElevation, a sun of 14 degrees, still a low evening
 * sun) so the crown lands inside it and the arch spans the farm and the
 * herd.
 *
 * It is drawn on a dome far out in the rain, with depth test on, so the farm,
 * the trees, the cows, the ground and the wall cloud all stand in front of it
 * and the funnel's layers (drawn later) do too. Display colors, like every
 * custom shader in the scene (see config.js).
 */
import { TORNADO_CONFIG } from './config.min.js';
import { keyAt } from './funnel.min.js';

const deg = (r) => r * 180 / Math.PI;
const rad = (d) => d * Math.PI / 180;

/** The point the bow circles, as a bearing and elevation in degrees and as a
 *  unit vector (x right, y up, z behind the camera). */
export function rainbowCenter(config = TORNADO_CONFIG) {
    const bearing = deg(Math.atan2(-config.sun.x, config.sun.z));
    const elevation = config.rainbow.centerElevation;
    const b = rad(bearing);
    const e = rad(elevation);
    return {
        bearing,
        elevation,
        vector: [Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e)]
    };
}

/** How far, in degrees, the direction (bearing, elevation) is from it. */
export function angleFromCenter(bearing, elevation, config = TORNADO_CONFIG) {
    const c = rainbowCenter(config).vector;
    const b = rad(bearing);
    const e = rad(elevation);
    const d = [Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e)];
    const dot = c[0] * d[0] + c[1] * d[1] + c[2] * d[2];
    return deg(Math.acos(Math.max(-1, Math.min(1, dot))));
}

/** How much of the rainbow is out, 0 to 1, at story second t. */
export function rainbowAmount(t, config = TORNADO_CONFIG) {
    return keyAt(t, config.rainbow.amount);
}

const RAINBOW_VERT = /* glsl */`
varying vec3 vW;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// No backticks in these comments: they end the template literal.
const RAINBOW_FRAG = /* glsl */`
uniform vec3 uCenter;
uniform float uAmount;
uniform vec2 uPrimary;
uniform vec2 uSecondary;
uniform float uPrimaryStrength;
uniform float uSecondaryStrength;
uniform float uGlow;
uniform float uDark;
varying vec3 vW;

// Across a bow, 0 on its inner edge (violet) to 1 on its outer (red).
vec3 spectrum(float t) {
    vec3 violet = vec3(0.58, 0.40, 0.80);
    vec3 blue = vec3(0.36, 0.50, 0.96);
    vec3 green = vec3(0.42, 0.86, 0.48);
    vec3 yellow = vec3(0.98, 0.93, 0.42);
    vec3 orange = vec3(0.98, 0.63, 0.26);
    vec3 red = vec3(0.93, 0.30, 0.26);
    vec3 c = mix(violet, blue, smoothstep(0.0, 0.2, t));
    c = mix(c, green, smoothstep(0.2, 0.42, t));
    c = mix(c, yellow, smoothstep(0.42, 0.62, t));
    c = mix(c, orange, smoothstep(0.62, 0.8, t));
    return mix(c, red, smoothstep(0.8, 1.0, t));
}

// A bow's coverage at position p across it (0 inner edge, 1 outer), soft.
float band(float p) {
    return smoothstep(-0.15, 0.12, p) * (1.0 - smoothstep(0.88, 1.15, p));
}

void main() {
    vec3 d = normalize(vW - cameraPosition);
    float theta = degrees(acos(clamp(dot(d, uCenter), -1.0, 1.0)));
    float elevation = degrees(asin(clamp(d.y, -1.0, 1.0)));

    float p1 = (theta - uPrimary.x) / (uPrimary.y - uPrimary.x);
    float p2 = (theta - uSecondary.x) / (uSecondary.y - uSecondary.x);
    float a1 = band(p1) * uPrimaryStrength;
    // The second bow's colors run the other way: red on the inside.
    float a2 = band(p2) * uSecondaryStrength;
    // Brighter sky inside the first bow, darker between the two.
    float glow = uGlow * smoothstep(uPrimary.x - 20.0, uPrimary.x - 0.5, theta)
        * (1.0 - smoothstep(uPrimary.x - 0.5, uPrimary.x + 0.5, theta));
    float dark = uDark * smoothstep(uPrimary.y + 0.5, uPrimary.y + 2.0, theta)
        * (1.0 - smoothstep(uSecondary.x - 2.0, uSecondary.x - 0.5, theta));

    float total = a1 + a2 + glow + dark;
    if (total < 0.001) discard;
    vec3 col = (spectrum(clamp(p1, 0.0, 1.0)) * a1
        + spectrum(1.0 - clamp(p2, 0.0, 1.0)) * a2
        + vec3(1.0) * glow) / total;

    // Brighter and fainter stretches along the arc, where the rain is
    // thicker and thinner, and gone into the ground at the horizon.
    vec3 side = normalize(cross(uCenter, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(side, uCenter);
    float around = atan(dot(d, up), dot(d, side));
    float along = 0.72 + 0.28 * sin(around * 2.3 + 0.8);
    float ground = smoothstep(-0.3, 3.0, elevation);

    gl_FragColor = vec4(col, min(total, 1.0) * uAmount * along * ground);
}
`;

let bow = null;

export function initRainbow(scene, config = TORNADO_CONFIG) {
    const R = config.rainbow;
    const c = rainbowCenter(config).vector;
    bow = new THREE.Mesh(new THREE.SphereGeometry(R.distance, 64, 32), new THREE.ShaderMaterial({
        vertexShader: RAINBOW_VERT,
        fragmentShader: RAINBOW_FRAG,
        uniforms: {
            uCenter: { value: new THREE.Vector3(c[0], c[1], c[2]) },
            uAmount: { value: 0 },
            uPrimary: { value: new THREE.Vector2(R.primary.inner, R.primary.outer) },
            uSecondary: { value: new THREE.Vector2(R.secondary.inner, R.secondary.outer) },
            uPrimaryStrength: { value: R.primary.strength },
            uSecondaryStrength: { value: R.secondary.strength },
            uGlow: { value: R.glow },
            uDark: { value: R.dark }
        },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false
    }));
    bow.name = 'rainbow';
    // After the storm base (-900) and before the wall cloud and the funnel.
    bow.renderOrder = -800;
    bow.frustumCulled = false;
    bow.visible = false;
    scene.add(bow);
    return bow;
}

/** Bring the bow out for story second t. */
export function updateRainbow(t, config = TORNADO_CONFIG) {
    if (!bow) return;
    const amount = rainbowAmount(t, config);
    bow.material.uniforms.uAmount.value = amount;
    bow.visible = amount > 0.001;
}
