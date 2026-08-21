// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Entry point for the Ocean experience.
 *
 * NOT THE FINISHED PAGE YET, but no longer a bare bench either. The welcome
 * card and the arc are wired as of 2026-08-19. What is still owed before this
 * can ship is page furniture rather than behaviour: the Open Graph and Twitter
 * blocks, the JSON-LD, the canonical URL, entries in sitemap.xml, llms.txt and
 * robots.txt, dropping the noindex, and an init test. Reduced motion also still
 * needs a real answer for the arc, which is a harder question than the
 * stylesheet handles today.
 *
 * THE SCENE IS SILENT AND THAT IS A DECISION. A full procedural surf synth was
 * built and wired here and removed on 2026-08-19 after three rounds of listening
 * QA. See the note in config.js for what was wrong with it and what was never
 * found. Recover it from git if it is ever wanted.
 *
 * THIS FILE IS ABOUT TO NEED A STATE MACHINE, AND IT USED TO SAY THE OPPOSITE.
 * The note here read "no input to route, no state machine, and nothing to
 * pause", and that was true of an ambient sea that ran forever. Steve reframed
 * the scene on 2026-08-19: it now opens as an ordinary bright day, the sky closes
 * over, a storm swell builds until the sea is frightening, a tsunami arrives, and
 * the page fades to black. Ninety seconds. That is a timeline with an ending, so
 * there is a clock to run, stages
 * to move between, and a finish.
 *
 * There is still no INPUT to route past the welcome screen, which is the part of
 * the original claim that survives. The visitor watches.
 *
 * ONE GENUINELY NEW PROPERTY: this is the first scene in the project that can
 * legitimately STOP RENDERING. Once the fade is complete there is nothing left
 * to draw, so the loop should end rather than idle, and a phone left on the
 * finished page should be doing no work at all.
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
// THE ONLY TWO SHARED PARTS THIS SCENE USES. Everything that draws the sea is
// local, because none of it existed before; these two are the house's anonymous
// visit counter and the soft bot deterrent that tags it, and every other
// experience on the site carries them.
import { getProofOfWork } from '../../shared/js/boot-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';
import {
    initWater, updateWater, consumeBreaks, breakDistance, resetWater, disposeWater,
    setProfileHz, profileRate
} from './water.min.js';
import {
    initSky, updateSky, disposeSky, skyUniforms, getPhase, setPhase, SKY_GLSL, SKY_UNIFORM_GLSL
} from './sky.min.js';
import {
    initSand, updateSand, addBreaks, surfaceWithSwash, resetSand, disposeSand,
    swashReachMetres
} from './sand.min.js';
import { stormStateAt, surgeAt, frontAt, frontLevelAt, washEnvelope, stageAt } from './storm.min.js';
import { initBuoy, updateBuoy, resetBuoy, disposeBuoy } from './buoy.min.js';
import {
    initLightning, updateLightning, resetLightning, disposeLightning, forceStrike
} from './lightning.min.js';

const state = {
    running: false,
    lastTime: 0,
    mobile: false,
    // THE STORY WAITS FOR THE VISITOR AND THE SEA DOES NOT. The water runs from
    // the moment the page loads, so what sits behind the welcome card is a
    // living ordinary sea rather than a freeze frame, but the arc holds at zero
    // until somebody presses Begin.
    //
    // It was originally the only arrangement that worked, because a browser will
    // not build an AudioContext without a gesture. The sound is gone and this
    // stays, because the reasons that survive it are better ones: the card
    // carries a content warning this scene owes anybody who opens it, and a
    // ninety second story should not be a third over before the visitor has
    // finished reading the page it is on.
    begun: false,
    // Seconds since the arc began, which is the clock the whole scene runs on.
    // Deliberately NOT the same as water.js's own elapsed: that one keeps
    // running so the sea is never reset mid wave, and this one is what a replay
    // puts back to zero.
    arc: 0,
    finished: false,
    // The white-out envelope, carried whole rather than as a number, because it
    // has to remember whether it is mid attack. See washEnvelope: it fires on
    // the water ARRIVING rather than on it being there, and the arrival is a
    // single frame, so without a latch the flash never gets off the ground.
    wash: { wash: 0, target: 0, attacking: false }
};

let canvas = null;
let renderer = null;
let scene = null;
let camera = null;
let frame = 0;
let wash = null;        // the white-out when the water comes over the camera
let blackout = null;    // the closing fade
let ending = null;      // the card that sits on the black
let replay = null;
let welcome = null;     // the card that holds the arc until the visitor is ready

// What the renderer would use if nothing were slow, and how far below it we have
// had to settle. See `nextPixelScale`.
const quality = {
    ceiling: 1,
    scale: 1,
    frame: 0,           // smoothed seconds per frame
    best: Infinity,     // the fastest we have seen, which estimates the display
    since: 0,           // seconds since the ratio last changed
    frames: 0,
    // Held at full resolution for a screenshot, and ignored by `adaptQuality`
    // while it is set. Off for every real visitor. See `oceanCapture`.
    pinned: false
};

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

/** Whether the visitor has asked for less movement.
 *
 *  THE ANSWER IS NOT "DO NOT SHOW THE STORM". The stylesheet already drops the
 *  card transitions, and what this gates is the lightning's envelope: one stroke
 *  instead of two, a quarter of the amplitude, and an attack slow enough to be a
 *  swell rather than a snap. The channel still draws and still branches. The
 *  setting asks for less motion, not for less story, and a storm with the
 *  electricity taken out of it is a worse scene rather than a gentler one. */
function prefersReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function buildRenderer() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !state.mobile, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Water is almost all specular highlight, and a linear pipeline clips those
    // to flat white the moment the sun catches a crest. Filmic tone mapping is
    // what keeps a glinting sea looking bright rather than looking blown out.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    quality.ceiling = Math.min(window.devicePixelRatio || 1, state.mobile ? 1.5 : 2);
    renderer.setPixelRatio(quality.ceiling * quality.scale);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
}

/**
 * How far below the device's own pixel ratio to render, given how the last few
 * seconds went. Pure, so the whole policy can be tested without a GPU, which
 * matters here more than usual because the thing it is protecting against is the
 * one part of this scene that cannot be measured off a browser.
 *
 * Returns the scale unchanged when nothing should happen, so the caller can
 * compare and only pay for a resize when there is a real decision.
 *
 * MEASURED AGAINST THE DISPLAY, NOT AGAINST 60. A fixed millisecond budget calls
 * a 30 Hz panel permanently slow and never notices a 120 Hz one struggling, so
 * the yardstick is the best frame this device has managed. `slowSeconds` sits
 * underneath as a backstop for a device that was never fast even once, which is
 * the case the relative test cannot see by construction.
 */
export function nextPixelScale(sample, config = OCEAN_CONFIG) {
    const q = config.quality;
    const { frame, best, scale, since, frames } = sample;
    if (frames < q.settleFrames) return scale;

    const slow = frame > best * q.slowRatio || frame > q.slowSeconds;
    if (slow) {
        if (since < q.holdDownSeconds) return scale;
        return Math.max(q.minScale, scale * q.stepDown);
    }
    // Only reach upward from below, and only with real headroom under us.
    if (scale < 1 && frame < best * q.fastRatio && since >= q.holdUpSeconds) {
        return Math.min(1, scale * q.stepUp);
    }
    return scale;
}

/** Fold this frame into the running estimate and act on it if it says so. */
function adaptQuality(delta) {
    const q = OCEAN_CONFIG.quality;
    // A frame this long is a tab coming back or a machine waking, and letting it
    // into the average would drop the resolution for something that never
    // happened while anybody was watching.
    if (!renderer || delta <= 0 || delta > q.ignoreAboveSeconds) return;
    // A capture in progress owns the resolution. See `oceanCapture`.
    if (quality.pinned) return;

    quality.frame = quality.frame === 0
        ? delta : quality.frame + (delta - quality.frame) * q.smoothing;
    quality.since += delta;
    quality.frames += 1;
    // The best frame is read from the SMOOTHED value rather than from a single
    // frame, or one lucky frame early on would set an unreachable target and the
    // scene would spend the rest of the visit trying to live up to it.
    if (quality.frames >= q.settleFrames && quality.frame < quality.best) {
        quality.best = quality.frame;
    }

    const next = nextPixelScale(quality, OCEAN_CONFIG);
    if (Math.abs(next - quality.scale) < 0.005) return;
    quality.scale = next;
    quality.since = 0;
    renderer.setPixelRatio(quality.ceiling * quality.scale);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
}

/** The empty scene. Everything that lights it now lives in sky.js, which owns
 *  the sun, the fill, the fog, and the renderer's exposure, because all four are
 *  the same decision made once and a day cycle that moved only three of them
 *  would come apart at dusk. */
function buildScene() {
    scene = new THREE.Scene();
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
    // The ceiling can change under us when a laptop is moved to another monitor,
    // and the scale we have settled on is kept across the move: it describes how
    // hard this scene is, not how many pixels that particular screen has.
    quality.ceiling = Math.min(window.devicePixelRatio || 1, state.mobile ? 1.5 : 2);
    renderer.setPixelRatio(quality.ceiling * quality.scale);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
}

/** A backgrounded tab should stop drawing. requestAnimationFrame already
 *  throttles, but stopping outright means a phone in a pocket is not warming
 *  itself on a sea nobody is watching. */
function onVisibility() {
    if (document.hidden) {
        stop();
    } else if (!state.running && !state.finished) {
        // `lastTime` is cleared so the first frame back reports a delta of zero
        // rather than however long the tab was hidden. That matters more now
        // than it used to: the arc is a ninety second story, and a visitor who
        // switched away for two minutes should come back to the sea they left
        // rather than to the credits.
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
    adaptQuality(delta);
    // The sea moves while the welcome card is up; the story does not.
    if (state.begun) {
        state.arc += Math.max(0, Math.min(0.25, delta));
        // Read off the arc clock rather than off wall time, which is what makes
        // these honest: the clock stops when the tab is hidden, so a visitor who
        // walked away for five minutes does not come back having "reached" the
        // tsunami they never saw.
        reportStage();
    }

    // THE ARC IS READ BEFORE ANYTHING IS DRAWN, and the water level under the
    // camera is read from the SEA rather than from the arc, so the white-out can
    // never disagree with the water actually on screen. The surge has to be
    // asked for first because the sea needs it to answer, which is the one place
    // the two modules have to be unpicked in the right order.
    //
    // IT COMES FROM sand.js AND NOT FROM water.js, and that is the whole reason
    // the bore exists. water.js knows the still water level, which answers "has
    // the sea arrived" and during the storm says yes, ankle deep. sand.js knows
    // what the bores are doing, which answers "is there water over your head",
    // and that is a different question that only broken whitewater says yes to.
    // THE FRONT COUNTS AS SURGE ONCE IT HAS PASSED YOU, and leaving it out was
    // the reason the tsunami stopped covering the eye when the surge curve
    // handed that job over to the front. sand.js is told about a water level
    // rather than about a tsunami, which is what keeps it reusable.
    const surge = surgeAt(state.arc, OCEAN_CONFIG.storm)
        + frontLevelAt(OCEAN_CONFIG.camera.z, frontAt(state.arc, OCEAN_CONFIG.storm));
    const storm = stormStateAt(state.arc, OCEAN_CONFIG,
        surfaceWithSwash(OCEAN_CONFIG.camera.z, surge));

    // The sky first, because the water's own shader reads the sky's uniforms
    // and the sand is lit by the sky's lights. Updating it after would draw one
    // frame of sea under yesterday's sun, which at a frame is invisible and at
    // a breakpoint is an hour of confusion.
    // The gloom goes with it: the sky closing over is the first sign anything is
    // wrong, and it runs ahead of the swell for the same reason real weather
    // does, which is that a cloud front does not have to travel as a wave.
    updateSky(delta, storm.gloom, storm.clarity);
    // AFTER THE SKY AND BEFORE THE WATER, and the order is not arbitrary. The
    // flash is a term in the sky's own program, so it has to be written after
    // `updateSky` has finished pushing this frame's state out or it would be
    // overwritten before anything read it, and before `updateWater` because the
    // sea reflects that program. Handed the arc clock rather than a delta, so a
    // replay or an `oceanSetArc` jump lands the storm's electricity where the
    // rest of the scene is.
    updateLightning(state.arc, OCEAN_CONFIG);
    updateWater(delta, storm);
    // AFTER THE WATER AND NOT BEFORE IT. `waveSurfaceAt` reads the profile that
    // `updateWater` has just rebuilt, so asking first would float the buoy on
    // last frame's sea. At one frame that is a fraction of a millimetre and
    // invisible; the reason to get it right is that the profile is rebuilt six
    // times a second rather than sixty, so the stale frame is not the previous
    // one, it is up to a sixth of a second old, which at the storm's peak is a
    // visible step.
    updateBuoy(state.arc, delta, OCEAN_CONFIG);

    // THE BREAK QUEUE. sand.js turns each entry into a sheet of water running up
    // the beach. It had a second reader until the sound was removed, which is
    // why it is drained once here and handed on rather than each consumer
    // calling `consumeBreaks`: the second caller would get an empty array and
    // the sand would silently stop moving. Worth keeping that shape, since the
    // queue is the obvious seam for anything else that wants to know a wave
    // broke. Drained every frame whether or not anyone is reading it, so it
    // cannot grow.
    const breaks = consumeBreaks();
    // The swell goes with them, because a bore's depth is set by the wave that
    // made it and has to be baked in at that moment rather than read later.
    addBreaks(breaks, storm);
    // Handed the same state the water got, so the wet band and the water's edge
    // are the same edge. During the drawback that is the whole shot.
    updateSand(delta, storm);

    renderer.render(scene, camera);
    state.wash = washEnvelope(state.wash, storm.engulf, delta, OCEAN_CONFIG.storm);
    paintOverlay(state.wash.wash, storm.fade);

    // THE ONE SCENE IN THIS PROJECT THAT CAN HONESTLY STOP DRAWING. Once the
    // fade is complete there is nothing left on screen, so idling the loop would
    // be a phone warming itself on a black rectangle.
    if (storm.finished && storm.fade >= 1) finish();
}

/** The white-out and the closing fade, both plain DOM.
 *
 *  KEPT OUT OF WEBGL ON PURPOSE. Neither is a 3D effect: one is a face full of
 *  whitewater and the other is the end of a film. Doing them as two divs means
 *  the renderer never learns about the story, the reduced-motion variant is a
 *  stylesheet rather than a branch, and the fade keeps working on a frame the
 *  GPU has already stopped producing. */
function paintOverlay(washAmount, fade) {
    if (wash) wash.style.opacity = washAmount.toFixed(3);
    if (blackout) blackout.style.opacity = fade.toFixed(3);
}

/** The visitor is ready. Start the story.
 *
 *  THE CARD OUTLIVED THE REASON IT WAS BUILT. It arrived because a browser will
 *  not build an AudioContext without a gesture, and the scene has no sound any
 *  more. It stays because the other two jobs it does are the ones that mattered:
 *  it carries the content warning, which this scene owes anybody who opens it,
 *  and it stops a ninety second story running while the visitor is still reading
 *  the page. */
function beginArc() {
    if (state.begun) return;
    state.begun = true;
    // THE CONVERSION ON THE CONTENT WARNING, which is the one number this card
    // was always going to raise and nobody could answer. `session-start` counts
    // everybody who arrived; this counts everybody who read what was coming and
    // pressed the button anyway. The gap between the two is the cost of the
    // warning, and it is worth knowing rather than guessing, because if it turns
    // out to be large the answer is better wording and not a quieter warning.
    //
    // Inside the `begun` guard on purpose, so the QA hooks that call through
    // here (`oceanSetArc`) cannot log a second one.
    watch = 1;
    track('begin-watching', { reduced: prefersReducedMotion() ? 1 : 0 });
    if (welcome) {
        welcome.style.opacity = '0';
        // Stops catching clicks the instant it starts fading rather than when it
        // finishes. Under reduced motion there is no fade at all, so without
        // this the card would sit invisible over the whole page for most of a
        // second, swallowing anything aimed at what is behind it.
        welcome.style.pointerEvents = 'none';
        // Then out of the flow entirely once the fade is done.
        setTimeout(() => { if (welcome) welcome.hidden = true; }, 700);
    }
}

/** The end of the arc: stop drawing, and show the card.
 *
 *  THE CARD IS NOT OPTIONAL AND A BARE BLACK SCREEN WAS THE FIRST PLAN. Steve
 *  and I both landed on the same objection: a black rectangle with nothing in it
 *  does not read as an ending, it reads as a page that has broken, and a visitor
 *  who thinks the scene crashed does not share it with anyone. One line and a
 *  way back is the whole fix. */
function finish() {
    if (state.finished) return;
    state.finished = true;
    // MADE IT TO THE END. Ninety seconds is a long time to ask for, and the
    // difference between a scene people start and a scene people finish is the
    // difference between a good idea and a good experience. `runs` distinguishes
    // a first watch from a second, so this stays meaningful after a replay.
    runs += 1;
    track('arc-complete', { watch });
    stop();
    if (ending) {
        ending.hidden = false;
        // Requested on the next frame so the transition has a frame to start
        // from. Setting hidden and opacity in the same tick skips the fade.
        requestAnimationFrame(() => { ending.style.opacity = '1'; });
    }
    if (replay) replay.focus();
}

/** Put the arc back to the beginning without rebuilding the scene.
 *
 *  THE SEA IS RESET TOO, AND THE FIRST VERSION DID NOT DO THAT. It left the
 *  water and the sand running on their own clocks, so that a replay would open
 *  on a living sea rather than on one frozen at phase zero. That reasoning was
 *  fine and the consequence was not: THE TIDE IS ON THE SAME CLOCK. It swings
 *  the water level a quarter of a metre either way over 560 seconds, the arc is
 *  120, and the storm was tuned against the tide rising through it. Measured
 *  across the tide, the second replay ran the storm at half tide and the third
 *  at low water, where no wave breaks over the visitor at all. Somebody pressing
 *  "watch it again" and getting a weaker storm is the worst answer available.
 *
 *  The sky is deliberately NOT reset. It holds the hour the visit drew and the
 *  gloom follows the arc, so a second run is the same afternoon rather than a
 *  different one. */
function replayArc() {
    // THE CLOSEST THING THIS PROJECT HAS TO A MEASURE OF DELIGHT. The stated
    // goal for every scene on the site is that somebody enjoys it enough to pass
    // it on, and there is no honest way to count that from here. Watching it a
    // second time is the nearest available proxy and it costs one line.
    //
    // Not guarded: a third watch is worth knowing about too.
    watch += 1;
    // The funnel starts again with it, or the second watch would report no
    // stages at all and read as somebody who pressed replay and left.
    stageReached = 0;
    track('replay', { watch });
    state.arc = 0;
    resetWater();
    resetSand();
    // The storm's schedule goes back with it. A replay that came back with its
    // lightning half way through its own timetable would be the same class of
    // fault as the tide one above: the second watch would not be the storm the
    // first one was.
    resetLightning();
    resetBuoy();
    state.finished = false;
    state.lastTime = 0;
    if (ending) {
        ending.style.opacity = '0';
        ending.hidden = true;
    }
    state.wash = { wash: 0, target: 0, attacking: false };
    paintOverlay(0, 0);
    start();
}

// Dwell time, reported once when the page is first hidden or torn down. It is
// really a "time to first leave" rather than a total, because backgrounding the
// tab ends the measured session, which makes it an honest lower bound on how
// long somebody stayed.
let sessionStart = 0;
let sessionEnded = false;
// Which viewing this is, 1 based, so every event on the arc can say which watch
// it belongs to and a funnel can be read over first watches alone.
let watch = 0;
// How many times the arc has been watched all the way through this load.
let runs = 0;
// The furthest stage reported this watch, as an index into `storm.stages`.
// Compared rather than counted, so jumping the clock with `oceanSetArc` reports
// the stage it lands in and not every stage it skipped over.
let stageReached = 0;

/** Report each stage of the story the first time this watch reaches it.
 *
 *  THE DROP OFF CURVE, AND WHY IT IS NOT A THIRTY SECOND TIMER. Steve asked for
 *  a checkpoint every half minute so we could see where people leave. The arc
 *  already divides itself into six named stages and `stageAt` already answers
 *  which one a second belongs to, so hanging the checkpoints on those costs no
 *  second schedule and reads better at the far end: "forty five per cent reached
 *  the drawback" is a sentence, and "forty five per cent reached sixty seconds"
 *  is a lookup.
 *
 *  IT ALSO SURVIVES A RETIME, which a grid of seconds does not. This arc has
 *  been three minutes, then two, then ninety seconds, and every hardcoded second
 *  in the tests went stale each time. The stage names did not move once.
 *
 *  The seconds go along as a parameter anyway, so nothing is lost.
 *
 *  `ordinary` is deliberately not reported: it starts at zero, so it would be
 *  the same event as `begin-watching` with a different name on it. */
function reportStage() {
    const index = nextStageIndex(state.arc, stageReached, OCEAN_CONFIG);
    if (index < 0) return;
    stageReached = index;
    track(`reached-${OCEAN_CONFIG.storm.stages[index].name}`,
        { at: Math.round(state.arc), watch });
}

/** Which stage index is newly reached at `seconds`, or -1 for nothing to report.
 *
 *  PULLED OUT AND EXPORTED BECAUSE THE IDEMPOTENCE IS THE WHOLE THING. This runs
 *  on every animation frame, so a version that returned a stage rather than a
 *  CHANGE of stage would fire sixty telemetry requests a second and turn a quiet
 *  usage counter into a flood aimed at the site's own server. That is not a
 *  subtle failure but it is a silent one from inside the browser, and it is
 *  exactly the sort of guard that gets refactored away by somebody simplifying
 *  the caller. Pure, so a test can beat on it without a canvas.
 *
 *  Returns at most one index per call even when the clock jumps, so
 *  `oceanSetArc(73)` reports the drawback rather than every stage in front of
 *  it. A QA jump should leave one mark in the log, not a fake session. */
export function nextStageIndex(seconds, reached, config = OCEAN_CONFIG) {
    const stages = config.storm.stages;
    const name = stageAt(seconds, config.storm).name;
    const index = stages.findIndex((st) => st.name === name);
    return index > reached ? index : -1;
}

function endSession() {
    if (sessionEnded || !sessionStart) return;
    sessionEnded = true;
    trackFinal('session-end', {
        seconds: Math.round((Date.now() - sessionStart) / 1000),
        // WHERE THEY GOT TO, which is the question this scene actually wants
        // answered. A ninety second arc that people leave at forty is a
        // different problem from one nobody starts, and the two look identical
        // in a plain session count.
        arc: Math.round(state.arc),
        finished: state.finished ? 1 : 0,
        runs
    });
}

function start() {
    if (state.running || state.finished) return;
    state.running = true;
    frame = requestAnimationFrame(loop);
}

function stop() {
    state.running = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
}

async function init() {
    canvas = document.getElementById('scene');
    if (!canvas || typeof THREE === 'undefined') return;

    state.mobile = detectMobile();
    // Tag every ping with the input mode, then solve a tiny proof of work (or
    // reuse a still-valid one from sessionStorage) and hand its hash to the
    // telemetry layer, which is what ties one visitor's hits together.
    //
    // AWAITED BEFORE THE SCENE IS BUILT, matching the other experiences. It
    // costs a few milliseconds on a cold visit and nothing on a warm one, and
    // this page has a welcome card in front of it anyway, so there is no frame
    // anybody is waiting on. `getProofOfWork` resolves rather than rejects when
    // it cannot solve one, so a failure here degrades to an untagged ping.
    setMobile(state.mobile);
    const proof = await getProofOfWork(OCEAN_CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);
    buildRenderer();
    buildScene();
    // The camera comes before the sky because the dome is centred on the eye
    // rather than on the world origin. See the note in sky.js: a dome at the
    // origin puts its equator a degree and a half below the horizon the visitor
    // is looking at, and that is the one line in the frame nobody can miss.
    placeCamera();
    initSky(scene, camera, OCEAN_CONFIG, { renderer });
    // Both sheets reflect the sky by compiling the sky's own program into their
    // shaders, so the sky has to exist first. Handed over rather than imported:
    // water.js and sand.js deliberately know nothing about sky.js.
    const sky = { uniformGlsl: SKY_UNIFORM_GLSL, glsl: SKY_GLSL, uniforms: skyUniforms() };
    initSand(scene, OCEAN_CONFIG, { mobile: state.mobile, sky });
    initWater(scene, OCEAN_CONFIG, { mobile: state.mobile, sky });
    // THE LIGHTNING GOES IN NOW EVEN THOUGH THE FIRST STRIKE IS THIRTY SECONDS
    // AWAY, because it adds a light to the scene and Three keys its compiled
    // programs on how many lights there are. Adding one at the first flash would
    // recompile the water, the sand, and the sky in the middle of the arc, on
    // the frame of a flash, which is the worst moment available.
    //
    // REDUCED MOTION IS READ ONCE AND PASSED IN rather than reached for inside
    // the module, matching how `mobile` is handled: the camera never moves and
    // the visit is ninety seconds, so there is no later moment at which this
    // answer could usefully change.
    initLightning(scene, camera, OCEAN_CONFIG, { sky, reducedMotion: prefersReducedMotion() });
    // AFTER THE WATER, because it rides the water's own profile and there is
    // nothing to float on until that exists. It carries no light of its own, so
    // unlike the lightning it has no bearing on when the shaders compile.
    initBuoy(scene, OCEAN_CONFIG, { reducedMotion: prefersReducedMotion() });

    wash = document.getElementById('wash');
    blackout = document.getElementById('blackout');
    ending = document.getElementById('ending');
    replay = document.getElementById('replay');
    welcome = document.getElementById('welcome');
    if (replay) replay.addEventListener('click', replayArc);

    const beginBtn = document.getElementById('begin');
    if (beginBtn) {
        beginBtn.addEventListener('click', beginArc);
    } else {
        // No card on the page, so nothing is holding the story back. This is the
        // path the old scaffold took and the one a stripped-down embed would
        // take.
        beginArc();
    }

    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    // Session end, for dwell time. visibilitychange to hidden is the reliable
    // terminal signal, especially on mobile where unload often does not fire,
    // and pagehide is the backup. Both are page-lifetime listeners and
    // `endSession` is idempotent, so being called twice costs nothing.
    //
    // NOT FOLDED INTO `onVisibility` ABOVE, which already handles hidden. That
    // one pauses the render loop and is about the sea; this one closes the
    // books and is about the visit, and a visitor who switches away and comes
    // back resumes the first without reopening the second.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') endSession();
    });
    window.addEventListener('pagehide', endSession);

    // SHOW THE FLOATING CHROME. `.ui-float` is `display: none` in the shared
    // stylesheet and only `.ui-float.visible` is shown, which is how the other
    // experiences keep their buttons off the screen until the world behind them
    // exists. Adding the markup without this line puts a home button on the page
    // that nobody can see, which is exactly what shipped for an hour on
    // 2026-08-21 and what Steve caught by looking at the scene.
    //
    // Done here rather than after a loading screen, because this scene has no
    // loading screen: the welcome card is the thing in front of the sea, and a
    // visitor reading a content warning is precisely the visitor most likely to
    // want a way out. So the button is there before they decide.
    document.querySelectorAll('.ui-float').forEach((el) => el.classList.add('visible'));

    start();

    // The visit is on the record from here. Recorded at init rather than at
    // `beginArc`, so the count includes visitors who read the content warning
    // and decided not to watch, which is a number worth being able to see.
    track('session-start', { device: state.mobile ? 'touch' : 'desktop' });
    sessionStart = Date.now();

    // Tuning aids while the sea is being dialled in. It is far easier to say the
    // break is at 22 metres and should be at 16 than to argue about a
    // screenshot, and easier still to say a screenshot was taken at phase 0.84
    // than to call it the orange one. Both go away with the scaffold.
    window.oceanBreakDistance = breakDistance;
    window.oceanSwashReach = swashReachMetres;
    window.oceanPhase = getPhase;
    // Jump the day to a given phase, so a screenshot pass can walk the whole
    // cycle in a minute instead of in the forty two it actually takes.
    window.oceanSetPhase = setPhase;
    // AND JUMP THE ARC, which is the one that matters now. A screenshot pass
    // wants the drawback at 145 seconds without sitting through the two and a
    // half minutes in front of it. Takes seconds from the start of the story.
    window.oceanSetArc = (seconds) => {
        const at = Math.max(0, Number(seconds) || 0);
        // Jumping the arc implies starting it, or the clock would be set and
        // then sit there while the welcome card held it at that number.
        beginArc();
        // Coming back from the ending has to clear the card and restart the
        // loop, and `replayArc` is the only thing that knows how, so it runs
        // first and the time is set after it rather than before.
        if (state.finished) replayArc();
        state.arc = at;
        return state.arc;
    };
    window.oceanArc = () => state.arc;
    // FIRE A STRIKE ON THE NEXT FRAME. A flash lasts about three hundred
    // milliseconds, so catching one for a screenshot by waiting is a poor use of
    // an afternoon. Takes an optional distance in metres, since the near and far
    // ends of the range look quite different and both want photographing. It
    // goes through the same path as a real strike, minimum gap included, so it
    // cannot show you a flash the rate limiter would have refused.
    window.oceanStrike = (metres) => forceStrike(metres);
    // What the adaptive resolution has settled on, which is the only way to tell
    // a scene that is running slowly from one that has quietly stopped trying.
    // How smoothly the storm moves, which is a different question from how fast
    // the scene draws. Everything the arc moves quickly arrives through the
    // profile, so this is the number to try if the withdrawal or the wall look
    // steppy. Its ceiling is the attribute upload and that can only be found by
    // trying it here. Call with no argument to read it, a number to set it, or
    // null to go back to config.
    window.oceanProfileHz = (hz) => (hz === undefined ? profileRate() : setProfileHz(hz));
    // CAPTURE MODE, FOR THE SOCIAL CARD, and it exists because of one specific
    // trap. The adaptive resolution can sit as low as `quality.minScale` (0.60)
    // and climbs back at 6 per cent every three seconds, so recovering from the
    // floor takes the better part of half a minute. The frame worth
    // photographing is t=73, which is the single heaviest moment in the arc:
    // the wall fills most of the picture and the fill rate cost peaks. So the
    // one frame anybody wants to capture is the frame most likely to be
    // rendering at 60 per cent and being upscaled, and a soft social card with
    // no explanation is exactly how that would show up.
    //
    // It also takes the floating home button out of shot, which is chrome
    // rather than scene and does not belong on a picture of the sea.
    //
    // Pass false to put both back.
    window.oceanCapture = (on = true) => {
        quality.pinned = !!on;
        if (on) {
            quality.scale = 1;
            quality.since = 0;
            renderer.setPixelRatio(quality.ceiling);
            renderer.setSize(window.innerWidth, window.innerHeight, false);
        }
        document.querySelectorAll('.ui-float').forEach((el) => {
            el.classList.toggle('visible', !on);
        });
        return { pinned: quality.pinned, ratio: quality.ceiling * quality.scale };
    };
    window.oceanQuality = () => ({
        ratio: quality.ceiling * quality.scale,
        ceiling: quality.ceiling,
        scale: Number(quality.scale.toFixed(3)),
        frameMs: Number((quality.frame * 1000).toFixed(2)),
        bestMs: Number((quality.best * 1000).toFixed(2))
    });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
}

export { init, start, stop, disposeWater, disposeSky, disposeSand, disposeLightning };
