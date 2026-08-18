// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Entry point for the Ocean experience.
 *
 * SCAFFOLD, NOT THE FINISHED PAGE. This exists so the water can be looked at in
 * a browser while it is being tuned. The sand is still a placeholder, there is
 * no welcome screen, no mute control, and the surf synthesiser next door is not
 * wired up yet. Everything on that list has a home already and is noted below
 * where it will land.
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
    initWater, updateWater, consumeBreaks, breakDistance, disposeWater, bedHeightAt, halfWidthAt
} from './water.min.js';
import {
    initSky, updateSky, disposeSky, skyUniforms, getPhase, setPhase, SKY_GLSL, SKY_UNIFORM_GLSL
} from './sky.min.js';

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

/** The empty scene. Everything that lights it now lives in sky.js, which owns
 *  the sun, the fill, the fog, and the renderer's exposure, because all four are
 *  the same decision made once and a day cycle that moved only three of them
 *  would come apart at dusk. */
function buildScene() {
    scene = new THREE.Scene();
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
        // Same frustum footprint as the water, from the same helper, so the two
        // sheets can never disagree about how wide the world is.
        const halfWidth = halfWidthAt(z, beach);
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

    // The sky first, because the water's own shader reads the sky's uniforms
    // and the sand is lit by the sky's lights. Updating it after would draw one
    // frame of sea under yesterday's sun, which at a frame is invisible and at
    // a breakpoint is an hour of confusion.
    updateSky(delta);
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
    buildScene();
    // The camera comes before the sky because the dome is centred on the eye
    // rather than on the world origin. See the note in sky.js: a dome at the
    // origin puts its equator a degree and a half below the horizon the visitor
    // is looking at, and that is the one line in the frame nobody can miss.
    placeCamera();
    initSky(scene, camera, OCEAN_CONFIG, { renderer });
    buildSand();
    // The sea reflects the sky by compiling the sky's own program into its
    // shader, so the sky has to exist first. Handed over rather than imported:
    // water.js deliberately knows nothing about sky.js.
    initWater(scene, OCEAN_CONFIG, {
        mobile: state.mobile,
        sky: { uniformGlsl: SKY_UNIFORM_GLSL, glsl: SKY_GLSL, uniforms: skyUniforms() }
    });

    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    start();

    // Tuning aids while the sea is being dialled in. It is far easier to say the
    // break is at 22 metres and should be at 16 than to argue about a
    // screenshot, and easier still to say a screenshot was taken at phase 0.84
    // than to call it the orange one. Both go away with the scaffold.
    window.oceanBreakDistance = breakDistance;
    window.oceanPhase = getPhase;
    // Jump the day to a given phase, so a screenshot pass can walk the whole
    // cycle in a minute instead of in the forty two it actually takes.
    window.oceanSetPhase = setPhase;
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
}

export { init, start, stop, disposeWater, disposeSky };
