// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Entry point for the Ocean experience.
 *
 * SCAFFOLD, NOT THE FINISHED PAGE. This exists so the water can be looked at in
 * a browser while it is being tuned. The sky is a flat colour, the sand is a
 * placeholder, there is no welcome screen, no day cycle, no mute control, and
 * the surf synthesiser next door is not wired up yet. Everything on that list
 * has a home already and is noted below where it will land.
 *
 * THE FRAME LOOP IS THE WHOLE FILE once those arrive. This experience has no
 * input to route, no state machine, and nothing to pause: past the welcome
 * screen there is a sea, a sky, and a mute button. That is the point of it, and
 * it is why this file should stay one of the shortest main.js in the project
 * rather than growing toward the Earth Defense one.
 *
 * NEITHER SHARED SCENE PART FITS. `scene-1.0.0` builds a walkable world with a
 * sky, clouds, and a day cycle geared to buildings; `space-1.0.0` builds an
 * airless one with a starfield and two cameras. A beach wants a third thing: one
 * camera that never moves, a sun that has to reach the water at a grazing angle,
 * and a horizon that is the whole composition. So the renderer is set up here
 * for now. If a second water scene ever appears, this is the part to lift into
 * a shared part rather than water.js, which is already reusable as it stands.
 */

import { OCEAN_CONFIG } from './config.min.js';
import {
    initWater, updateWater, consumeBreaks, breakDistance, disposeWater, bedHeightAt
} from './water.min.js';

const state = {
    running: false,
    lastTime: 0,
    mobile: false
};

let canvas = null;
let renderer = null;
let scene = null;
let camera = null;
let frame = 0;

/** A phone or tablet, asked once.
 *
 *  The camera never moves and the framing never changes, so unlike a walkable
 *  scene there is no later moment at which this answer could usefully be
 *  revisited. It halves the water grid and caps the pixel ratio, which together
 *  are most of the difference between a phone holding sixty frames and not. */
function detectMobile() {
    if (typeof window === 'undefined') return false;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return Boolean(coarse) || Math.min(window.innerWidth, window.innerHeight) < 600;
}

function buildRenderer() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !state.mobile, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Water is almost all specular highlight, and a linear pipeline clips those
    // to flat white the moment the sun catches a crest. Filmic tone mapping is
    // what keeps a glinting sea looking bright rather than looking blown out.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, state.mobile ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
}

/** A flat sky and a low sun, standing in until the day cycle lands.
 *
 *  The sun sits low and slightly off to one side on purpose. A sun overhead
 *  lights the tops of the waves and nothing else, which reads as a swimming
 *  pool. A sun near the horizon rakes across the faces of the waves and throws
 *  a specular path toward the camera, and that path is most of what makes a
 *  photograph of the sea look like the sea. */
function buildSky() {
    scene = new THREE.Scene();
    const sky = new THREE.Color(0x8fb6cc);
    scene.background = sky;
    // Haze rather than a hard edge. The far rows of the water are a few pixels
    // tall and fog is what turns them into a horizon instead of a seam.
    scene.fog = new THREE.Fog(sky, 90, 400);

    const sun = new THREE.DirectionalLight(0xfff1de, 2.4);
    sun.position.set(-45, 16, -160);
    sun.name = 'sun';
    scene.add(sun);

    // Sky fill from above, sand bounce from below. A single ambient would flatten
    // the troughs, which are lit by the sky and nothing else.
    const fill = new THREE.HemisphereLight(0xbcd8e8, 0x6b5b45, 1.1);
    fill.name = 'skyFill';
    scene.add(fill);
}

/** The beach under the water.
 *
 *  PLACEHOLDER. It takes its shape from `bedHeightAt` in water.js so the sand
 *  and the depth the waves are solved against can never disagree, which is the
 *  seam that matters. What it does not have yet is the wet band: sand stays
 *  dark for a few seconds after the sheet retreats, and `sand.wetColor` and
 *  `sand.dryingSeconds` in config are waiting for the module that does it. */
function buildSand() {
    const { beach } = OCEAN_CONFIG;
    const rows = 90;
    const cols = 60;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(rows * cols * 3);

    for (let r = 0; r < rows; r++) {
        const t = r / (rows - 1);
        const z = beach.nearZ + (beach.farZ - beach.nearZ) * Math.pow(t, 2.0);
        const halfWidth = beach.nearHalfWidth + (beach.farHalfWidth - beach.nearHalfWidth) * t;
        for (let c = 0; c < cols; c++) {
            const u = c / (cols - 1);
            const i = (r * cols + c) * 3;
            positions[i] = (u * 2 - 1) * halfWidth;
            positions[i + 1] = bedHeightAt(z, beach);
            positions[i + 2] = z;
        }
    }

    // Same winding as the water. See the note in water.js: the obvious order
    // faces these triangles at the seabed and the beach vanishes.
    const indices = new Uint16Array((rows - 1) * (cols - 1) * 6);
    let n = 0;
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const a = r * cols + c;
            indices[n++] = a; indices[n++] = a + 1; indices[n++] = a + cols;
            indices[n++] = a + 1; indices[n++] = a + cols + 1; indices[n++] = a + cols;
        }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        color: OCEAN_CONFIG.sand.color,
        roughness: 0.95,
        metalness: 0
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'sand';
    scene.add(mesh);
}

function placeCamera() {
    const cfg = OCEAN_CONFIG.camera;
    camera = new THREE.PerspectiveCamera(cfg.fov, window.innerWidth / window.innerHeight, 0.1, 900);
    camera.position.set(0, cfg.height, cfg.z);
    camera.up.set(0, 1, 0);
    // Dead level, out to sea. See config: even a degree of pitch starts the
    // frame feeling like a shot from something that might move.
    camera.lookAt(0, cfg.height + Math.tan(cfg.pitch) * 100, cfg.z - 100);
}

function onResize() {
    if (!renderer || !camera) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
}

/** A backgrounded tab should stop drawing. requestAnimationFrame already
 *  throttles, but stopping outright means a phone in a pocket is not warming
 *  itself on a sea nobody is watching. */
function onVisibility() {
    if (document.hidden) {
        stop();
    } else if (!state.running) {
        state.lastTime = 0;
        start();
    }
}

function loop(now) {
    if (!state.running) return;
    frame = requestAnimationFrame(loop);
    const seconds = now / 1000;
    const delta = state.lastTime ? seconds - state.lastTime : 0;
    state.lastTime = seconds;

    updateWater(delta);

    // THE AUDIO SEAM. Each entry is already shaped for `playBreak(strength,
    // pan)` in audio.min.js. Drained every frame whether or not anything is
    // listening, so the queue cannot grow while the page is muted.
    consumeBreaks();

    renderer.render(scene, camera);
}

function start() {
    if (state.running) return;
    state.running = true;
    frame = requestAnimationFrame(loop);
}

function stop() {
    state.running = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
}

function init() {
    canvas = document.getElementById('scene');
    if (!canvas || typeof THREE === 'undefined') return;

    state.mobile = detectMobile();
    buildRenderer();
    buildSky();
    buildSand();
    placeCamera();
    initWater(scene, OCEAN_CONFIG, { mobile: state.mobile });

    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    start();

    // Tuning aid while the sea is being dialled in. It is far easier to say the
    // break is at 22 metres and should be at 16 than to argue about a
    // screenshot. Goes away with the scaffold.
    window.oceanBreakDistance = breakDistance;
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
}

export { init, start, stop, disposeWater };
