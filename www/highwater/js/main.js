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
 * the page fades to black. Sixty seconds. That is a timeline with an ending, so
 * there is a clock to run, stages
 * to move between, and a finish.
 *
 * THERE IS INPUT PAST THE WELCOME SCREEN NOW (2026-09-23), and this note used to
 * say there was none. Steve's real-world QA asked for a way to stop a
 * frightening minute part way through and to go back to a moment that was
 * missed, so there is a pause button, Escape, a pause card with Restart, and a
 * scrubber. They fade out when the pointer is still, so the visitor still
 * mostly watches.
 *
 * THE PLAYER IS SHARED NOW (2026-09-24). Everything around the picture (the
 * welcome and pause card, the controls, the story clock, the fade, the ending
 * and the usage events) is shared/js/player-1.0.0.js, which was lifted out of
 * this file for Tornado Alley. This scene's numbers for it are in player.js.
 * What stays here is the sea: `drawFrame` draws one frame at the story second
 * the player hands it, and the hooks below put the sea's own clocks where a
 * replay would have them when the player's clock jumps.
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
import { installShare } from '../../shared/js/share-1.0.0.min.js';
import {
    initWater, updateWater, consumeBreaks, breakDistance, resetWater, disposeWater,
    setProfileHz, profileRate
} from './water.min.js';
import {
    initSky, updateSky, disposeSky, skyUniforms, getPhase, setPhase, resetSky,
    SKY_GLSL, SKY_UNIFORM_GLSL
} from './sky.min.js';
import {
    initSand, updateSand, addBreaks, surfaceWithSwash, resetSand, disposeSand,
    swashReachMetres
} from './sand.min.js';
import { stormStateAt, surgeAt, frontAt, frontLevelAt, washEnvelope } from './storm.min.js';
import { initBuoy, updateBuoy, resetBuoy, disposeBuoy } from './buoy.min.js';
import {
    initLightning, updateLightning, resetLightning, disposeLightning, forceStrike
} from './lightning.min.js';
import { createPlayer } from '../../shared/js/player-1.0.0.min.js';
import { playerOptions } from './player.min.js';
import { createNarrator } from '../../shared/js/narration-1.0.0.min.js';

// The story told to a screen reader, beat by beat (config.narration).
let narrator = null;

// THE STORY'S CLOCK IS THE PLAYER'S. It holds the arc at zero behind the
// welcome card while the sea keeps moving, so the card sits over a living
// ordinary afternoon: the card carries a content warning this scene owes
// anybody who opens it, and a sixty second story should not be a third over
// before the visitor has finished reading it. A PAUSE FREEZES EVERYTHING, the
// sea included, because a sea left running behind the pause card would drift
// the tide away from the second the story is held at, which is the
// weaker-storm fault `resetWater` exists to prevent.
let player = null;

const state = {
    mobile: false,
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
let wash = null;        // the white-out when the water comes over the camera

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
    // A resize clears the canvas, and a paused scene is not drawing. The
    // player puts the frozen moment back on the next frame through `redraw`,
    // after this has run.
}

/** One frame of the scene at story second `arc`, called by the player every
 *  animation frame it runs: behind the welcome card (where `arc` holds at
 *  zero and the sea still moves), through the story, and under a drag (where
 *  the thumb is the clock). Never while paused, and never after the ending.
 *
 *  `info` is the player's { begun, scrubbing, fade }. */
function drawFrame(delta, arc, info) {
    adaptQuality(delta);
    // Every frame, so it keeps its place quietly behind the card, under a drag
    // and across a seek, and speaks only as the story plays into a beat.
    if (narrator) narrator.update(arc, info);

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
    const surge = surgeAt(arc, OCEAN_CONFIG.storm)
        + frontLevelAt(OCEAN_CONFIG.camera.z, frontAt(arc, OCEAN_CONFIG.storm));
    const storm = stormStateAt(arc, OCEAN_CONFIG,
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
    //
    // HELD THROUGH A DRAG AND FOR A MOMENT AFTER ANY SEEK. A drag moves the arc
    // clock far faster than real time, and the rate cap is written in arc
    // seconds, so without the hold a scrub through the storm could flash
    // faster than the welcome card promises. The player keeps that hold (see
    // `controls.lightningHoldSeconds`).
    if (player && player.flashAllowed()) updateLightning(arc, OCEAN_CONFIG);
    updateWater(delta, storm);
    // AFTER THE WATER AND NOT BEFORE IT. `waveSurfaceAt` reads the profile that
    // `updateWater` has just rebuilt, so asking first would float the buoy on
    // last frame's sea. At one frame that is a fraction of a millimetre and
    // invisible; the reason to get it right is that the profile is rebuilt six
    // times a second rather than sixty, so the stale frame is not the previous
    // one, it is up to a sixth of a second old, which at the storm's peak is a
    // visible step.
    updateBuoy(arc, delta, OCEAN_CONFIG);

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
    // THE FLOOR IS WHY THE ENDING IS NOT A HOLE. Past a certain depth the sea is
    // over the eye with nothing under it to draw, so the white-out holds instead
    // of draining to zero and hands the frame straight to the fade. It cannot
    // fire during the storm: see `washFloorAt`.
    state.wash = washEnvelope(state.wash, storm.engulf, delta, OCEAN_CONFIG.storm,
        storm.washFloor);
    if (wash) wash.style.opacity = state.wash.wash.toFixed(3);
    // THE CLOSING FADE IS THE PLAYER'S, and so is stepping the controls aside
    // for it and stopping the loop once it is black: this is the one scene in
    // the project that can honestly stop drawing, and now Tornado Alley is the
    // second. The fade's curve is still this scene's own smoothstep, handed to
    // the player in player.js.
}

/** The seek has landed at story second `at`: bring every clock in the scene
 *  with it.
 *
 *  THE STORY CLOCK IS THE EASY PART. The storm, the sky, the buoy and the
 *  lightning's schedule are all read straight off it. What is not: the tide and
 *  the sets run on the sea's own clock, the bores on the beach carry the swell
 *  of the moment they broke, and the white-out remembers whether it is mid
 *  attack. Each of those is put where a replay would have it at this second,
 *  so a scrubbed-to storm is the same storm an untouched watch gets there.
 *
 *  Mid drag only the story clock moves, and the sea rebuilds its own profile
 *  from it a few times a second anyway, so the storm tracks the thumb without
 *  this, which is saved for the moment the thumb is let go. */
function resyncTo(at) {
    resetWater(at);
    resetSand(at);
    resetLightning();
    resetBuoy();
    state.wash = { wash: 0, target: 0, attacking: false };
}

/** Back to the first second for a replay or a restart, without rebuilding the
 *  scene.
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
 *  The storm's lightning schedule goes back with it, for the same reason: a
 *  replay that came back half way through its own timetable would not be the
 *  storm the first watch was.
 *
 *  THE SKY IS THE ONE THING THAT DELIBERATELY DOES NOT GO BACK. It used to: the
 *  note here said a second run was the same afternoon rather than a different
 *  one, and that was a reasonable call while the only thing a rewatch offered
 *  was the story again. Steve asked on 2026-08-24 for a second viewing to be
 *  worth something, and a fresh hour is the cheapest honest answer, since it
 *  changes the composition rather than adding a prop to it. See `resetSky` for
 *  how far it really moves, which is the glint path and not the mood. */
function rewindScene() {
    resetWater();
    resetSand();
    resetLightning();
    resetBuoy();
    resetSky();
    state.wash = { wash: 0, target: 0, attacking: false };
    if (wash) wash.style.opacity = '0';
}

// Dwell time, reported once when the page is first hidden or torn down. It is
// really a "time to first leave" rather than a total, because backgrounding the
// tab ends the measured session, which makes it an honest lower bound on how
// long somebody stayed.
let sessionStart = 0;
let sessionEnded = false;

function endSession() {
    if (sessionEnded || !sessionStart) return;
    sessionEnded = true;
    trackFinal('session-end', {
        seconds: Math.round((Date.now() - sessionStart) / 1000),
        // WHERE THEY GOT TO, which is the question this scene actually wants
        // answered. A sixty second arc that people leave at thirty is a
        // different problem from one nobody starts, and the two look identical
        // in a plain session count. `runs` distinguishes a first watch from a
        // second, so `finished` stays meaningful after a replay.
        ...(player ? player.summary() : { arc: 0, finished: 0, runs: 0 })
    });
}

function start() {
    if (player) player.start();
}

function stop() {
    if (player) player.stop();
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
    narrator = createNarrator(document.getElementById('story-status'), OCEAN_CONFIG.narration);
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
    // THE LIGHTNING GOES IN NOW EVEN THOUGH THE FIRST STRIKE IS TEN SECONDS
    // AWAY, because it adds a light to the scene and Three keys its compiled
    // programs on how many lights there are. Adding one at the first flash would
    // recompile the water, the sand, and the sky in the middle of the arc, on
    // the frame of a flash, which is the worst moment available.
    //
    // REDUCED MOTION IS READ ONCE AND PASSED IN rather than reached for inside
    // the module, matching how `mobile` is handled: the camera never moves and
    // the visit is sixty seconds, so there is no later moment at which this
    // answer could usefully change.
    initLightning(scene, camera, OCEAN_CONFIG, { sky, reducedMotion: prefersReducedMotion() });
    // AFTER THE WATER, because it rides the water's own profile and there is
    // nothing to float on until that exists. It carries no light of its own, so
    // unlike the lightning it has no bearing on when the shaders compile.
    initBuoy(scene, OCEAN_CONFIG, { reducedMotion: prefersReducedMotion() });

    wash = document.getElementById('wash');
    window.addEventListener('resize', onResize, { passive: true });

    // SHARING A SCENE IS NOT SHARING A SCORE, which is why the text below sells
    // the thing rather than a result. There is nothing to be proud of here and
    // nothing to beat: the only honest share is "look at this", so it says what
    // the sixty seconds are and stops short of the last twenty, exactly as the
    // og:description does and for the same reason.
    installShare(
        document.getElementById('share'),
        () => ({
            title: 'High Water',
            text: 'Sixty seconds at the water\'s edge, beginning on an ordinary bright '
                + 'afternoon. The weather turns while you stand there. A browser 3D scene '
                + 'on SceneXP.'
        }),
        {
            status: document.getElementById('share-status'),
            onShare: (how) => track('share', { method: how })
        });

    // THE PLAYER: the welcome card that is also the pause card, the pause
    // button, Escape, the scrubber, the fade and the ending, all found by their
    // `player-` ids. With no Begin button on the page it begins at once, which
    // is the path a stripped-down embed would take.
    //
    // THE CONVERSION ON THE CONTENT WARNING is its `begin-watching` event.
    // `session-start` counts everybody who arrived; that counts everybody who
    // read what was coming and pressed the button anyway. The gap between the
    // two is the cost of the warning, and if it turns out to be large the
    // answer is better wording and not a quieter warning.
    //
    // A REPLAY IS THE CLOSEST THING THIS PROJECT HAS TO A MEASURE OF DELIGHT,
    // and a restart from the pause card is counted apart from it: "watched it
    // again" after the ending is the delight signal, and "started again" from
    // the middle is closer to "missed the beginning".
    player = createPlayer({
        ...playerOptions(OCEAN_CONFIG),
        frame: drawFrame,
        // A paused scene draws nothing by itself, so after a resize or a
        // background tab clears the canvas, the frozen frame is put back once.
        redraw: () => renderer.render(scene, camera),
        onSeek: resyncTo,
        onRewind: rewindScene,
        // Any flash in the sky goes out now, and nothing new strikes until the
        // drag has settled.
        onScrubStart: resetLightning,
        track,
        reducedMotion: prefersReducedMotion()
    }).install();

    // Session end, for dwell time. visibilitychange to hidden is the reliable
    // terminal signal, especially on mobile where unload often does not fire,
    // and pagehide is the backup. Both are page-lifetime listeners and
    // `endSession` is idempotent, so being called twice costs nothing.
    //
    // NOT FOLDED INTO THE PLAYER'S OWN visibility listener, which pauses the
    // story mid-watch and is about the sea; this one closes the books and is
    // about the visit, and a visitor who switches away and comes back resumes
    // the first without reopening the second.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') endSession();
    });
    window.addEventListener('pagehide', endSession);

    // SHOW THE FLOATING CHROME. `.ui-float` is `display: none` in the shared
    // stylesheet and only `.ui-float.visible` is shown, which is how the other
    // experiences keep their buttons off the screen until the world behind them
    // exists. Adding the markup without this line puts a button on the page
    // that nobody can see, which is exactly what shipped for an hour on
    // 2026-08-21 and what Steve caught by looking at the scene. (This page
    // declares no float of its own since the Home button was retired on
    // 2026-09-07; the sweep stays for the pan row and anything added later.)
    //
    // Done here rather than after a loading screen, because this scene has no
    // loading screen: the welcome card is the thing in front of the sea, and a
    // visitor reading a content warning is precisely the visitor most likely to
    // want a way out. So the button is there before they decide.
    document.querySelectorAll('.ui-float').forEach((el) => el.classList.add('visible'));

    start();

    // The visit is on the record from here. Recorded at init rather than at
    // Begin, so the count includes visitors who read the content warning
    // and decided not to watch, which is a number worth being able to see.
    track('session-start', { device: state.mobile ? 'touch' : 'desktop' });
    sessionStart = Date.now();

    // The console hooks for tuning and for the screenshot pass, which an
    // ordinary visitor never gets. See `installTuningAids`.
    if (tuningAidsWanted()) installTuningAids();
}

/** Whether this page should carry the QA console hooks.
 *
 *  True when the site is being served locally, which is where the screenshot
 *  pass and every tuning session happen, and true anywhere with `?qa` on the
 *  URL, which is how the same hooks are reached on the deployed page when
 *  something needs checking there.
 *
 *  A VISITOR IS NOT MEANT TO FIND THESE. They are harmless in the sense that
 *  they only reach the caller's own copy of the page, but `oceanSetArc` walks
 *  straight to the ending, and this scene is sixty seconds with a shape to it.
 *  Handing a stranger the last twenty seconds by way of a global is not a
 *  kindness. No other experience in the repository installs a window global at
 *  all, so the gate also puts this one back in line with the rest. */
export function tuningAidsWanted() {
    if (typeof window === 'undefined' || !window.location) return false;
    // THE HOSTNAME AND NOTHING ELSE. There was a `?qa` escape hatch here so the
    // deployed page could be opened with the hooks on purpose, and it was
    // removed on 2026-08-24 in the audit before release.
    //
    // Nothing behind these is sensitive: they read and write scene state and
    // there is no account, no data and no secret anywhere near them. The reason
    // to drop it is smaller and duller. It was a second way in that nobody
    // needed, since the screenshot pass runs on a local server, and every extra
    // door on a public page is a thing somebody has to reason about later.
    //
    // If a production hook is ever genuinely wanted, put it back deliberately
    // rather than finding this comment and assuming it was an oversight.
    const { hostname } = window.location;
    return hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname === '[::1]'
        || hostname === '';
}

/** Tuning aids while the sea is being dialled in. It is far easier to say the
 *  break is at 22 metres and should be at 16 than to argue about a screenshot,
 *  and easier still to say a screenshot was taken at phase 0.84 than to call it
 *  the orange one.
 *
 *  Gated by `tuningAidsWanted`, so this runs on a local server or behind `?qa`
 *  and nowhere else. */
function installTuningAids() {
    window.oceanBreakDistance = breakDistance;
    window.oceanSwashReach = swashReachMetres;
    window.oceanPhase = getPhase;
    // Jump the day to a given phase, so a screenshot pass can walk the whole
    // cycle in a minute instead of in the forty two it actually takes.
    window.oceanSetPhase = setPhase;
    // AND JUMP THE ARC, which is the one that matters now. A screenshot pass
    // wants the drawback at 145 seconds without sitting through the two and a
    // half minutes in front of it. Takes seconds from the start of the story.
    //
    // It jumps the way the scrubber does, from before Begin, from the pause
    // card or from the ending, and brings the tide and the beach with it, so a
    // screenshot at a second is the storm a visitor sees at that second.
    window.oceanSetArc = (seconds) => {
        player.jumpTo(Math.max(0, Number(seconds) || 0));
        return player.state().arc;
    };
    window.oceanArc = () => player.state().arc;
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
    // It also takes the player controls out of shot (the pause button and the
    // scrubber, 2026-09-23). The floating Home button it hid before that was
    // retired on 2026-09-07.
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
        // The player controls are chrome again since 2026-09-23, so a capture
        // takes them out of shot too (the rule is in experience.css).
        document.body.classList.toggle('hw-capture', !!on);
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
