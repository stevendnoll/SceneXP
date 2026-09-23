// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Tornado Alley.
 *
 * Sixty seconds on the open prairie: a calm evening, a storm organizing on the
 * horizon, a tornado forming, crossing the fields and roping out, and the sky
 * clearing. A timed story, the second after High Water, and the first built
 * on the shared player (shared/js/player-1.0.0.js), which owns the welcome
 * card, the pause card, the scrubber, the fade, the ending and the usage
 * events. This file owns only the picture.
 *
 * UNRELEASED (M1, 2026-09-23). The page carries `noindex` and is on the
 * UNRELEASED list in tests/directory.test.mjs, so it is kept off the home
 * page, the sitemap and llms.txt until M8. See config.js for what is real
 * and what is a stand-in.
 *
 * THE STORY CLOCK AND THE ANIMATION CLOCK ARE DIFFERENT CLOCKS. The player's
 * arc decides what the storm is doing, and every piece of the tornado is a
 * pure function of it (funnel.js), so a seek needs no resync at all. A second
 * clock turns the textures, and it runs whenever the scene draws, including
 * behind the welcome card, so the storm base is already slowly turning when
 * the visitor arrives.
 */

import { TORNADO_CONFIG as CONFIG } from './config.min.js';
import { getProofOfWork } from '../../shared/js/boot-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';
import { installShare } from '../../shared/js/share-1.0.0.min.js';
import { createPlayer, isLocalHost } from '../../shared/js/player-1.0.0.min.js';
import { funnelStateAt, funnelUniforms, applyFunnelState } from './funnel.min.js';
import { initShells, setShellCount, updateShells } from './shells.min.js';
import { initWorld, updateWorld } from './world.min.js';

let renderer = null;
let scene = null;
let camera = null;
let player = null;
let shared = null;
let mobile = false;
let shellCount = CONFIG.shells.layers.length;
// The animation clock. See the header.
let anim = 0;

let sessionStart = 0;
let sessionEnded = false;

/** A phone or tablet, asked once: the camera never moves, so there is no
 *  later moment at which the answer could usefully change. */
function detectMobile() {
    if (typeof window === 'undefined') return false;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return Boolean(coarse) || Math.min(window.innerWidth, window.innerHeight) < 600;
}

function prefersReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function pixelRatio() {
    const cap = mobile ? CONFIG.render.mobilePixelRatio : CONFIG.render.maxPixelRatio;
    return Math.min(window.devicePixelRatio || 1, cap);
}

function buildRenderer(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
    // Every shader in this scene writes a display colour itself. See config.js.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(window.innerWidth, window.innerHeight, false);
}

function placeCamera() {
    const c = CONFIG.camera;
    camera = new THREE.PerspectiveCamera(c.fovDegrees,
        window.innerWidth / window.innerHeight, c.near, c.far);
    camera.position.set(0, c.height, 0);
    camera.rotation.x = c.pitchDegrees * Math.PI / 180;
}

function onResize() {
    if (!renderer || !camera) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(window.innerWidth, window.innerHeight, false);
}

/** One frame of the storm at story second `arc`. */
export function drawFrame(delta, arc) {
    anim += Math.max(0, Math.min(delta, 0.25));
    const state = funnelStateAt(arc, anim, CONFIG);
    applyFunnelState(shared, state);
    updateWorld(state, true, CONFIG);
    updateShells(state, shellCount);
    renderer.render(scene, camera);
}

function endSession() {
    if (sessionEnded || !sessionStart) return;
    sessionEnded = true;
    trackFinal('session-end', {
        seconds: Math.round((Date.now() - sessionStart) / 1000),
        ...player.summary()
    });
}

async function init() {
    const canvas = document.getElementById('scene');
    if (!canvas || typeof THREE === 'undefined') return;

    mobile = detectMobile();
    setMobile(mobile);
    const proof = await getProofOfWork(CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);

    buildRenderer(canvas);
    placeCamera();
    scene = new THREE.Scene();
    shared = funnelUniforms(CONFIG);
    initWorld(scene, CONFIG);
    initShells(scene, shared, CONFIG);
    if (mobile) shellCount = CONFIG.shells.mobileCount;
    setShellCount(shellCount);

    player = createPlayer({
        ...CONFIG.controls,
        seconds: CONFIG.story.seconds,
        fadeSeconds: CONFIG.story.fadeSeconds,
        stages: CONFIG.story.stages,
        reducedMotion: prefersReducedMotion(),
        track,
        frame: drawFrame,
        redraw: () => renderer.render(scene, camera)
    }).install();

    // A share sells the scene, not a result: there is nothing here to beat,
    // so it says what the sixty seconds are and stops short of the ending,
    // exactly as the og:description does.
    installShare(
        document.getElementById('share'),
        () => ({
            title: 'Tornado Alley',
            text: 'Sixty seconds on the open prairie, beginning on a calm summer evening, '
                + 'as a storm builds on the horizon. A browser 3D scene on SceneXP.'
        }),
        {
            status: document.getElementById('share-status'),
            onShare: (how) => track('share', { method: how })
        });

    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') endSession();
    });
    window.addEventListener('pagehide', endSession);

    player.start();
    track('session-start', { device: mobile ? 'touch' : 'desktop' });
    sessionStart = Date.now();

    if (isLocalHost()) installTuningAids();
}

/** Console hooks for the screenshot pass, on a local server only. A visitor
 *  is not meant to find a global that walks straight to the ending. */
function installTuningAids() {
    window.tornadoSetArc = (seconds) => player.jumpTo(Math.max(0, Number(seconds) || 0));
    window.tornadoArc = () => player.state().arc;
    window.tornadoState = () => funnelStateAt(player.state().arc, anim, CONFIG);
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
}

export { init };
