// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Tornado Alley.
 *
 * Thirty seconds on the open prairie: a calm evening, a storm organizing on the
 * horizon, a tornado touching down far out across the fields and roping out,
 * and a cow (or something else, on a replay) coming down under a rainbow. A
 * timed story, the second after High Water, and the first built
 * on the shared player (shared/js/player-1.0.0.js), which owns the welcome
 * card, the pause card, the scrubber, the fade, the ending and the usage
 * events. This file owns only the picture.
 *
 * RELEASED 2026-09-23 (M8): on the home page, in the sitemap and llms.txt,
 * and indexable. See config.js for how the look came to be what it is.
 *
 * THE STORY CLOCK AND THE ANIMATION CLOCK ARE DIFFERENT CLOCKS. The player's
 * arc decides what the storm is doing, and every piece of the tornado is a
 * pure function of it (funnel.js), so a seek needs no resync at all. A second
 * clock turns the textures, and it runs whenever the scene draws, including
 * behind the welcome card, so the storm base is already slowly turning when
 * the visitor arrives.
 */

import { TORNADO_CONFIG as CONFIG, TORNADO_LIGHTNING } from './config.min.js';
import { getProofOfWork } from '../../shared/js/boot-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';
import { installShare } from '../../shared/js/share-1.0.0.min.js';
import { createPlayer, isLocalHost } from '../../shared/js/player-1.0.0.min.js';
import { funnelStateAt, funnelUniforms, applyFunnelState } from './funnel.min.js';
import { initShells, setShellCount, updateShells } from './shells.min.js';
import { initWorld, updateWorld, flashUniforms } from './world.min.js';
import {
    initLightning, updateLightning, resetLightning, forceStrike
} from '../../shared/js/lightning-1.0.0.min.js';
import { TREE_DEFAULTS } from '../../shared/js/fractaltree-1.0.0.min.js';
import { windAt } from './wind.min.js';
import { initFarm, updateFarm } from './farm.min.js';
import { initPond, updatePond } from './pond.min.js';
import { initFlora, updateFlora } from './flora.min.js';
import { initCows, updateCows, cowPoseAt } from './cow.min.js';
import { initRainbow, updateRainbow } from './rainbow.min.js';
import {
    PAYLOADS, nextPayload, payloadLine, initPayloads, updatePayloads, surprisePoseAt
} from './payloads.min.js';
import { initTumbleweeds, updateTumbleweeds } from './tumbleweeds.min.js';

let renderer = null;
let scene = null;
let camera = null;
let player = null;
let shared = null;
let mobile = false;
let shellCount = CONFIG.shells.layers.length;
// 1, or the damped sway the shared trees use under reduced motion. The
// movement is the content, so it is damped rather than removed.
let motion = 1;
// The animation clock. See the header.
let anim = 0;

// WHAT THE TORNADO CARRIES THIS RUN (payloads.js). The cow first, always;
// each replay after that draws a surprise. `shown` is this visit's list, and
// `reached` how far into the story this run has been, so a restart before
// the pickup keeps the payload the visitor has not seen yet.
let payload = 'cow';
const shown = ['cow'];
let reached = 0;

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

/**
 * Light for the props, and the haze three's fog gives them.
 *
 * THE SKY, THE STORM AND THE FUNNEL IGNORE BOTH: they are custom shaders
 * that light and haze themselves. The lights are for what came from the
 * shared parts library and the farm, which are lit materials. The fog is
 * matched to the funnel's own haze, 1 - exp(-d / visibility), which for any
 * distance on this prairie is close to d / visibility, a linear fog from 0
 * to the visibility. Its color is a SCREEN value, since three applies fog
 * after the output encode, so it is set raw with no color space.
 */
function buildLighting() {
    const L = CONFIG.lights;
    const sun = new THREE.DirectionalLight(L.sun.color, L.sun.intensity);
    sun.position.set(CONFIG.sun.x, CONFIG.sun.y, CONFIG.sun.z).multiplyScalar(1000);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(L.sky.color, L.sky.ground, L.sky.intensity));
    const haze = CONFIG.colors.haze;
    scene.fog = new THREE.Fog(0x000000, 0, CONFIG.visibility);
    scene.fog.color.setRGB(haze[0], haze[1], haze[2]);
}

/** One frame of the storm at story second `arc`. */
export function drawFrame(delta, arc) {
    anim += Math.max(0, Math.min(delta, 0.25));
    const state = funnelStateAt(arc, anim, CONFIG);
    applyFunnelState(shared, state);
    updateWorld(state, true, CONFIG);
    updateShells(state, shellCount);
    const W = CONFIG.farm.windmill;
    updateFarm(windAt(W.x, W.z, state, CONFIG), delta * motion, CONFIG);
    updatePond(windAt(CONFIG.pond.x, CONFIG.pond.z, state, CONFIG), anim, CONFIG);
    updateFlora(state, anim, motion, CONFIG);
    updateTumbleweeds(arc, CONFIG);
    reached = Math.max(reached, arc);
    updateCows(arc, CONFIG, payload === 'cow');
    updatePayloads(arc, payload, CONFIG);
    updateRainbow(arc, CONFIG);
    // THE PHOTOSENSITIVITY GUARD. The flash-rate cap is written in story
    // seconds, and a scrub runs the story far faster than real time, so the
    // lightning holds through a drag and for a second after any seek, as
    // High Water's does. The shared player keeps that clock.
    if (player && player.flashAllowed()) updateLightning(arc, TORNADO_LIGHTNING);
    renderer.render(scene, camera);
}

/** The ending card names what came down. */
function showPayloadLine() {
    const line = document.getElementById('ending-line');
    if (line) line.textContent = payloadLine(payload, CONFIG);
}

/** Back to the start for a replay or a restart: a new payload, if this run
 *  got as far as showing the visitor what it picked up. */
function nextRun() {
    if (reached >= CONFIG.cow.pickupAt) {
        payload = nextPayload(shown);
        shown.push(payload);
        showPayloadLine();
    }
    reached = 0;
}

/** The usage counter, with the payload on the watched-to-the-end event, so
 *  the counts say which ones people stay for. */
function trackRun(name, params) {
    track(name, name === 'arc-complete' ? { ...params, payload } : params);
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
    // The props, on the approved look: lit, hazed, and bending in the wind.
    buildLighting();
    initFarm(scene, CONFIG);
    initPond(scene, CONFIG);
    initFlora(scene, CONFIG, { mobile });
    // Tumbleweeds, drawn in by the inflow.
    initTumbleweeds(scene, CONFIG);
    // The payoffs.
    initCows(scene, CONFIG);
    initRainbow(scene, CONFIG);
    // Built now, all four, so a replay's surprise costs no frame when it
    // first appears.
    initPayloads(scene, CONFIG);
    // High Water's lightning, shared. Built now, not at the first strike: it
    // adds a light, and three recompiles every lit material when the number
    // of lights changes, which would stall the frame of the first flash.
    initLightning(scene, camera, TORNADO_LIGHTNING, {
        sky: { uniforms: flashUniforms() },
        reducedMotion: prefersReducedMotion()
    });
    if (prefersReducedMotion()) motion = TREE_DEFAULTS.tree.reducedMotion;

    player = createPlayer({
        ...CONFIG.controls,
        seconds: CONFIG.story.seconds,
        fadeSeconds: CONFIG.story.fadeSeconds,
        stages: CONFIG.story.stages,
        reducedMotion: prefersReducedMotion(),
        track: trackRun,
        frame: drawFrame,
        // Any flash in the sky goes out when the clock jumps or a drag
        // begins; see the photosensitivity guard in drawFrame.
        onSeek: () => resetLightning(),
        onScrubStart: () => resetLightning(),
        onRewind: () => {
            resetLightning();
            nextRun();
        },
        redraw: () => renderer.render(scene, camera)
    }).install();

    // A share sells the scene, not a result: there is nothing here to beat,
    // so it says what the thirty seconds are and stops short of the ending,
    // exactly as the og:description does.
    installShare(
        document.getElementById('share'),
        () => ({
            title: 'Tornado Alley',
            text: 'Thirty seconds on the open prairie, beginning on a calm summer evening, '
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
    // Fire a strike on the next frame, optionally at a distance in metres, for
    // photographing a channel. It goes through the rate limit like any other.
    window.tornadoStrike = (metres) => forceStrike(metres === undefined ? null : metres);
    // Where the cow is and how it is holding itself right now.
    window.tornadoCow = () => cowPoseAt(player.state().arc, CONFIG);
    // Choose this run's payload by name ('cow', 'flamingo', 'outhouse',
    // 'trampoline', 'mailbox'), or ask which it is, and its pose right now.
    window.tornadoPayload = (name) => {
        if (PAYLOADS.includes(name)) {
            payload = name;
            showPayloadLine();
        }
        return payload;
    };
    window.tornadoPayloadPose = () => (payload === 'cow'
        ? cowPoseAt(player.state().arc, CONFIG)
        : surprisePoseAt(payload, player.state().arc, CONFIG));
    // The wind at any ground point right now, for tuning the props.
    window.tornadoWind = (x, z) => windAt(x, z, funnelStateAt(player.state().arc, anim, CONFIG), CONFIG);
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
}

export { init };
