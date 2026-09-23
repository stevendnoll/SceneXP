// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * shells.js - technique A: nested translucent tubes around the spine.
 *
 * Each layer is a static grid of (u, angle) pairs; the vertex shader places
 * every vertex on the spine from FUNNEL_GLSL, so the CPU uploads nothing but
 * uniforms each frame. The fragment shader tears each layer with a spinning,
 * climbing noise field, fades it toward the silhouette (so no layer shows a
 * hard polygon edge), and lights it from the low sun behind the camera.
 *
 * DRAW ORDER IS BUILT BY HAND. Nothing writes depth, so the order is the
 * whole compositing story: every layer's far side, outermost first, then
 * every layer's near side, innermost first. Three's own two-pass for
 * DoubleSide would draw inner-back, inner-front, outer-back, outer-front,
 * which paints the outer layer's far wall over the inner layer's near one.
 * Each layer is therefore two meshes, BackSide and FrontSide, with a
 * renderOrder from that sequence. The dust whirl wraps the lot.
 */
import { TORNADO_CONFIG } from './config.min.js';
import { FUNNEL_GLSL } from './funnel.min.js';

const FUNNEL_VERT = /* glsl */`
${FUNNEL_GLSL}
attribute vec2 aUA;
uniform float uShellScale;
varying float vU;
varying float vA;
varying vec3 vN;
varying vec3 vW;

void main() {
    float u = aUA.x;
    float a = aUA.y;
    vec3 c = spineAt(u);
    vec3 t = normalize(spineAt(min(u + 0.01, 1.0)) - spineAt(max(u - 0.01, 0.0)));
    vec3 ref = vec3(0.0, 0.0, 1.0);
    vec3 n = normalize(ref - t * dot(t, ref));
    vec3 b = cross(t, n);
    vec3 dir = cos(a) * n + sin(a) * b;
    vec3 w = c + dir * radiusAt(u) * uShellScale;
    vU = u;
    vA = a;
    vN = dir;
    vW = w;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const DUST_VERT = /* glsl */`
${FUNNEL_GLSL}
attribute vec2 aUA;
uniform float uShellScale;
varying float vU;
varying float vA;
varying vec3 vN;
varying vec3 vW;

void main() {
    float u = aUA.x;
    float a = aUA.y;
    // A squat, bulging whirl that closes over the top.
    float prof = (0.75 + 0.35 * sin(3.14159265 * u)) * sqrt(max(1.0 - u * u * u, 0.0));
    // Same handedness as the funnel (angle 0 is +z), so the winding agrees.
    vec3 dir = vec3(sin(a), 0.0, cos(a));
    vec3 w = uDustCenter + dir * uDustRadius * prof * uShellScale
        + vec3(0.0, u * uDustHeight * uShellScale, 0.0);
    vU = u;
    vA = a;
    vN = normalize(dir + vec3(0.0, u * 0.8, 0.0));
    vW = w;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const SHELL_FRAG = /* glsl */`
${FUNNEL_GLSL}
uniform float uShellOpacity;
uniform float uShellWisp;
uniform float uShellSpin;
uniform float uShellSeed;
uniform float uIsDust;
varying float vU;
varying float vA;
varying vec3 vN;
varying vec3 vW;

void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    float facing = abs(dot(N, V));

    float height = uIsDust > 0.5 ? vU * uDustHeight : vU * uTop;
    float spin = (uIsDust > 0.5 ? uSpinBottom * 1.4 : mix(uSpinBottom, uSpinTop, vU)) * uShellSpin;
    float ang = vA + spin * uTime + uTwist * vU * (1.0 - uIsDust);
    vec3 q = vec3(cos(ang) * uNoiseK, sin(ang) * uNoiseK,
                  (height - uTime * uUpdraft) / uVScale) + uShellSeed;
    float n = fbm(q, 4);

    float body = mix(1.0, smoothstep(0.38, 0.72, n), uShellWisp);
    float edge = smoothstep(0.02, 0.5, facing);
    float alpha = uShellOpacity * body * edge;

    vec3 lit;
    vec3 shade;
    if (uIsDust > 0.5) {
        alpha *= uDustAmount * (1.0 - smoothstep(0.55, 1.0, vU));
        lit = uDustLit;
        shade = uDustShade;
    } else {
        alpha *= breakMask(vU, uShellSeed);
        float tip = funnelTip();
        alpha *= smoothstep(tip, tip + 0.06, vU);
        // Dissolve into the wall cloud rather than end in a rim. QA round 1
        // (tornado-4, 6, 8): the scaled outer layers' top rings stood out
        // past the wall cloud as stacked plates.
        alpha *= 1.0 - smoothstep(0.9, 1.0, vU);
        float low = smoothstep(0.0, 0.28, vU);
        lit = mix(uDustLit, uCondLit, low);
        shade = mix(uDustShade, uCondShade, low);
    }
    if (alpha < 0.004) discard;

    // The outward normal lights the far wall too, so it reads as the shaded
    // back of the funnel rather than a second lit surface.
    float lam = clamp(dot(N, uSunDir) * 0.8 + 0.2, 0.0, 1.0);
    vec3 col = mix(shade, lit, lam * (0.65 + 0.45 * n));
    col *= mix(1.0, 0.72, smoothstep(0.78, 1.0, vU) * (1.0 - uIsDust));
    col = applyHaze(col, vW);
    gl_FragColor = vec4(col, alpha);
}
`;

/** The (u, angle) pair for every vertex of a tube, ring by ring. */
export function tubeUA(rings, segments) {
    const ua = new Float32Array((rings + 1) * (segments + 1) * 2);
    let k = 0;
    for (let i = 0; i <= rings; i++) {
        for (let j = 0; j <= segments; j++) {
            ua[k++] = i / rings;
            ua[k++] = (j / segments) * Math.PI * 2;
        }
    }
    return ua;
}

/**
 * The tube's triangles, COUNTER-CLOCKWISE SEEN FROM OUTSIDE, so FrontSide is
 * the near wall and the hand-built draw order means what it says. The spike's
 * first version wound them the other way, which swapped every layer's near
 * and far side. Angle 0 is +z and a quarter turn is +x, the same frame as n
 * and b in the vertex shader. tests/tornado-funnel.test.mjs holds it.
 */
export function tubeIndex(rings, segments) {
    const index = [];
    const row = segments + 1;
    for (let i = 0; i < rings; i++) {
        for (let j = 0; j < segments; j++) {
            const a = i * row + j;
            const b = a + row;
            index.push(a, a + 1, b, b, a + 1, b + 1);
        }
    }
    return index;
}

/** A (u, angle) grid, indexed as a tube. */
function tubeGeometry(rings, segments) {
    const ua = tubeUA(rings, segments);
    const index = tubeIndex(rings, segments);
    const geometry = new THREE.BufferGeometry();
    // Placeholder positions: the vertex shader builds the real ones.
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ua.length / 2 * 3), 3));
    geometry.setAttribute('aUA', new THREE.BufferAttribute(ua, 2));
    geometry.setIndex(index);
    return geometry;
}

let group = null;
let layers = [];

/**
 * Build technique A into `scene`. `shared` is the funnelUniforms() object;
 * every material references the same uniform objects, so one
 * applyFunnelState() moves them all.
 */
export function initShells(scene, shared, config = TORNADO_CONFIG) {
    const C = config.shells;
    group = new THREE.Group();
    group.name = 'shells';
    const funnelGeo = tubeGeometry(C.rings, C.segments);
    const dustGeo = tubeGeometry(24, 40);

    const make = (geo, vert, layer, isDust, side) => {
        const material = new THREE.ShaderMaterial({
            vertexShader: vert,
            fragmentShader: SHELL_FRAG,
            uniforms: {
                ...shared,
                uShellScale: { value: layer.scale },
                uShellOpacity: { value: layer.opacity },
                uShellWisp: { value: layer.wisp },
                uShellSpin: { value: layer.spin },
                uShellSeed: { value: layer.seed },
                uIsDust: { value: isDust ? 1 : 0 }
            },
            transparent: true,
            depthWrite: false,
            side
        });
        const mesh = new THREE.Mesh(geo, material);
        mesh.frustumCulled = false;
        group.add(mesh);
        return mesh;
    };

    layers = [];
    const funnel = C.layers.map((layer) => ({
        back: make(funnelGeo, FUNNEL_VERT, layer, false, THREE.BackSide),
        front: make(funnelGeo, FUNNEL_VERT, layer, false, THREE.FrontSide),
        dust: false
    }));
    const dust = C.dustLayers.map((layer) => ({
        back: make(dustGeo, DUST_VERT, layer, true, THREE.BackSide),
        front: make(dustGeo, DUST_VERT, layer, true, THREE.FrontSide),
        dust: true
    }));
    layers = { funnel, dust };
    setShellCount(C.defaultCount);
    scene.add(group);
    return group;
}

/**
 * Show the innermost `count` funnel layers and set the draw order: far
 * sides outermost first, then near sides innermost first, with the dust
 * whirl wrapped around the outside of both.
 */
export function setShellCount(count) {
    const shown = layers.funnel.slice(0, count);
    layers.funnel.forEach((l, i) => {
        l.back.visible = l.front.visible = i < count;
    });
    let order = 1;
    for (const l of [...layers.dust].reverse()) l.back.renderOrder = order++;
    for (const l of [...shown].reverse()) l.back.renderOrder = order++;
    for (const l of shown) l.front.renderOrder = order++;
    for (const l of layers.dust) l.front.renderOrder = order++;
}

/** Hide the funnel layers while there is no funnel, and the dust likewise. */
export function updateShells(state, count) {
    const funnelOn = state.extent > 0.001;
    layers.funnel.forEach((l, i) => {
        l.back.visible = l.front.visible = funnelOn && i < count;
    });
    const dustOn = state.dust > 0.001;
    for (const l of layers.dust) l.back.visible = l.front.visible = dustOn;
}
