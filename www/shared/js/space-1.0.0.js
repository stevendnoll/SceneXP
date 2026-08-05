// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * space.js - Renderer, cameras, lights, and starfield for airless scenes
 * (shared engine part).
 *
 * The space-scene counterpart to scene.js. That module builds a sky, a sun, a
 * moon, clouds, and a day/night cycle for terrestrial worlds, none of which a
 * scene in orbit wants. Rather than fight it through config, a space
 * experience starts here: a renderer, two cameras, one key light, one ambient
 * fill, and a starfield. Roughly a tenth the size, and nothing to switch off.
 *
 * THE TWO CAMERAS are the reason this module exists. A space scene spans a
 * huge depth range (a cockpit a metre from the eye, a planet 200,000 units
 * away), and a single camera covering both would need either a logarithmic
 * depth buffer, which costs real performance on mobile GPUs, or a near/far
 * ratio that z-fights. Instead:
 *
 *   worldCamera    near 100,  far 500000   planets, ships, tracers, stars
 *   overlayCamera  near 0.1,  far 100      the cockpit, drawn after a depth clear
 *
 * Both share aspect and field of view, so the overlay lines up with the world.
 * renderSpace() draws the world, clears depth, then draws the overlay on top.
 *
 * THE STARFIELD follows the camera position every frame rather than sitting at
 * the origin. That is what makes it read as infinitely distant: no parallax,
 * no chance of flying out of it, and its radius can stay comfortably inside
 * the far plane instead of chasing it.
 *
 * Nothing here knows what is being rendered. Bodies, ships, and cockpits are
 * the caller's business; this module owns the frame.
 */

const DEFAULTS = {
    worldCamera: { fov: 70, near: 100, far: 500000 },
    overlayCamera: { fov: 70, near: 0.1, far: 100 },
    keyLight: { direction: [0.4, 0.7, 1.0], intensity: 1.2, color: 0xfff4e8 },
    ambient: { intensity: 0.18, color: 0x4a5a7a },
    starCount: 6000,
    starRadius: 450000,
    starSize: 1200,
    maxPixelRatio: 2
};

let renderer = null;
let worldCamera = null;
let overlayCamera = null;
let starfield = null;
let keyLight = null;
let ambientLight = null;
let settings = null;

/** Mulberry32: a tiny seeded PRNG so a seeded starfield is reproducible in
 *  tests. Callers who want a different sky each visit pass their own rng. */
export function makeRng(seed) {
    let a = seed >>> 0;
    return function rng() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Points uniformly distributed on a sphere of the given radius, returned as a
 *  flat [x, y, z, x, y, z, ...] array.
 *
 *  Uses the inverse-cosine method rather than three independent uniforms:
 *  picking each angle uniformly would crowd the poles, which reads as two
 *  bright patches in the sky. Pure, so the suite can assert the distribution.
 */
export function starPositions(count, radius, rng = Math.random) {
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        // z uniform in [-1, 1] gives uniform area density on the sphere.
        const z = rng() * 2 - 1;
        const theta = rng() * Math.PI * 2;
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        out[i * 3] = radius * r * Math.cos(theta);
        out[i * 3 + 1] = radius * r * Math.sin(theta);
        out[i * 3 + 2] = radius * z;
    }
    return out;
}

/** Build the renderer, both cameras, the lights, and the starfield.
 *  Returns the world scene the caller should add content to. */
export function initSpace(canvas, config = {}) {
    const cfg = config.space || {};
    settings = {
        ...DEFAULTS,
        ...cfg,
        worldCamera: { ...DEFAULTS.worldCamera, ...(cfg.worldCamera || {}) },
        overlayCamera: { ...DEFAULTS.overlayCamera, ...(cfg.overlayCamera || {}) },
        keyLight: { ...DEFAULTS.keyLight, ...(cfg.keyLight || {}) },
        ambient: { ...DEFAULTS.ambient, ...(cfg.ambient || {}) }
    };

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    // The two-camera split draws twice per frame, so the renderer must not
    // clear between them. renderSpace() owns clearing from here on.
    renderer.autoClear = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setPixelRatio(Math.min(devicePixelRatioOf(), settings.maxPixelRatio));
    renderer.setSize(viewportWidth(), viewportHeight());

    const aspect = viewportWidth() / viewportHeight();
    const w = settings.worldCamera;
    const o = settings.overlayCamera;
    worldCamera = new THREE.PerspectiveCamera(w.fov, aspect, w.near, w.far);
    overlayCamera = new THREE.PerspectiveCamera(o.fov, aspect, o.near, o.far);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000005);

    ambientLight = new THREE.AmbientLight(settings.ambient.color, settings.ambient.intensity);
    ambientLight.name = 'ambientLight';
    scene.add(ambientLight);

    // A single directional key light standing in for a sun that is never
    // rendered. Its position is a DIRECTION, pushed far out so the light is
    // effectively parallel across the whole scene.
    const d = settings.keyLight.direction;
    keyLight = new THREE.DirectionalLight(settings.keyLight.color, settings.keyLight.intensity);
    keyLight.name = 'keyLight';
    keyLight.position.set(d[0], d[1], d[2]).normalize().multiplyScalar(w.far);
    scene.add(keyLight);

    starfield = buildStarfield(settings);
    scene.add(starfield);

    return scene;
}

function buildStarfield(cfg) {
    const geometry = new THREE.BufferGeometry();
    const positions = starPositions(cfg.starCount, cfg.starRadius, cfg.starRng || Math.random);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: cfg.starSize,
        sizeAttenuation: true,
        depthWrite: false,
        transparent: true,
        opacity: 0.9
    });
    const points = new THREE.Points(geometry, material);
    points.name = 'starfield';
    // Never culled: it is always centred on the camera, so a stale bounding
    // sphere can otherwise pop the whole sky out of view.
    points.frustumCulled = false;
    return points;
}

/** Draw one frame: world, depth clear, overlay. The overlay scene is optional,
 *  so an experience without a cockpit can pass nothing. */
export function renderSpace(scene, overlayScene) {
    if (!renderer || !scene) return;
    // Keep the sky centred on the eye so it never shows parallax.
    if (starfield && worldCamera) starfield.position.copy(worldCamera.position);

    renderer.clear();
    renderer.render(scene, worldCamera);
    if (overlayScene && overlayCamera) {
        renderer.clearDepth();
        renderer.render(overlayScene, overlayCamera);
    }
}

/** Resize the renderer and BOTH cameras. Forgetting the overlay camera here is
 *  the classic bug in a two-camera setup: the world reframes correctly and the
 *  cockpit skews, which looks like a modelling error rather than a resize one. */
export function resizeSpace(width, height) {
    if (!renderer) return;
    const w = width || viewportWidth();
    const h = height || viewportHeight();
    const aspect = w / h;

    renderer.setPixelRatio(Math.min(devicePixelRatioOf(), settings.maxPixelRatio));
    renderer.setSize(w, h);

    if (worldCamera) {
        worldCamera.aspect = aspect;
        worldCamera.updateProjectionMatrix();
    }
    if (overlayCamera) {
        overlayCamera.aspect = aspect;
        overlayCamera.updateProjectionMatrix();
    }
}

/** Lower the pixel ratio ceiling for the reduced-effects setting. */
export function setMaxPixelRatio(max) {
    if (!settings) return;
    settings.maxPixelRatio = max;
    if (renderer) renderer.setPixelRatio(Math.min(devicePixelRatioOf(), max));
}

export function getRenderer() { return renderer; }
export function getWorldCamera() { return worldCamera; }
export function getOverlayCamera() { return overlayCamera; }
export function getStarfield() { return starfield; }
export function getKeyLight() { return keyLight; }
export function getAmbientLight() { return ambientLight; }

/** Release GPU resources. Safe to call more than once. */
export function disposeSpace() {
    if (starfield) {
        if (starfield.geometry) starfield.geometry.dispose();
        if (starfield.material) starfield.material.dispose();
        starfield = null;
    }
    if (renderer) {
        renderer.setAnimationLoop(null);
        renderer.dispose();
        renderer = null;
    }
    worldCamera = null;
    overlayCamera = null;
    keyLight = null;
    ambientLight = null;
}

/** True when the visitor is on a touch-first device. Mirrors scene.js's check
 *  so the two modules agree, rather than importing across versions. */
export function isTouchDevice() {
    if (typeof window === 'undefined') return false;
    return ('ontouchstart' in window) ||
        (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
}

// Guarded window reads, so the module imports and runs under Node in tests.
function viewportWidth() {
    return (typeof window !== 'undefined' && window.innerWidth) || 1280;
}
function viewportHeight() {
    return (typeof window !== 'undefined' && window.innerHeight) || 720;
}
function devicePixelRatioOf() {
    return (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
}
