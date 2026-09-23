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
 * mostly watches. The rules behind them live in controls.js, and the wiring is
 * the "player controls" section below.
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
import { stormStateAt, surgeAt, frontAt, frontLevelAt, washEnvelope, stageAt } from './storm.min.js';
import { initBuoy, updateBuoy, resetBuoy, disposeBuoy } from './buoy.min.js';
import {
    initLightning, updateLightning, resetLightning, disposeLightning, forceStrike
} from './lightning.min.js';
import {
    escapeAction, isEditable, seekTarget, keySeekTarget, clockLabel, valueText,
    progressPercent, mayIdle, lightningAllowed
} from './controls.min.js';

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
    // sixty second story should not be a third over before the visitor has
    // finished reading the page it is on.
    begun: false,
    // Seconds since the arc began, which is the clock the whole scene runs on.
    // Deliberately NOT the same as water.js's own elapsed: that one keeps
    // running so the sea is never reset mid wave, and this one is what a replay
    // puts back to zero.
    arc: 0,
    finished: false,
    // THE PAUSE FREEZES EVERYTHING, the sea included, unlike the welcome card,
    // which holds only the story over a living sea. Two reasons. It is what a
    // visitor expects from a pause, and it is the only arrangement that keeps
    // the tide in step with the storm: a sea left running behind the card would
    // drift the tide away from the second the story is held at, which is the
    // weaker-storm fault `resetWater` exists to prevent.
    paused: false,
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

// The player controls. See the section of that name below.
const controlsEl = { root: null, pause: null, scrubber: null, scrub: null };
const card = { begin: null, actions: null, resume: null, restart: null, pausedAt: null };
const ui = {
    scrubbing: false,
    hoverPause: false,
    hoverScrub: false,
    // True through the closing fade, when the controls step aside for the
    // ending and do not come back on a mere pointer move.
    ending: false,
    idleTimer: 0,
    cardTimer: 0,
    // Real seconds the lightning is still held for after a seek.
    lightningHold: 0,
    // Where the story was when the current drag started, for the seek report.
    dragFrom: 0,
    // The whole second last written to the scrubber's aria-valuetext.
    lastWhole: -1,
    // A seek waiting to be reported, so a run of them leaves one event.
    seekFrom: null,
    seekTo: 0,
    seekTimer: 0,
    // Whether this watch has been scrubbed at all, carried on the funnel
    // events so a visitor who skipped to the end does not read as one who sat
    // through it.
    scrubbed: false
};

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
    // A resize clears the canvas, and a paused scene is not drawing, so without
    // this the pause card would sit over a blank rectangle after a phone was
    // turned on its side. One frame puts the frozen moment back.
    if (state.paused && scene) renderer.render(scene, camera);
}

/** A backgrounded tab should stop drawing. requestAnimationFrame already
 *  throttles, but stopping outright means a phone in a pocket is not warming
 *  itself on a sea nobody is watching.
 *
 *  MID STORY, LEAVING THE TAB PAUSES IT (Steve, 2026-09-23). It used to resume
 *  by itself the moment the tab came back, so somebody who switched away during
 *  the storm returned to a scene already running under them. Now they come back
 *  to the pause card and choose when to go on. Before Begin there is no story to
 *  pause, so the sea simply stops and starts again as it always did. */
function onVisibility() {
    if (document.hidden) {
        if (escapeAction(state) === 'pause') pauseArc('hidden');
        else stop();
    } else if (!state.running && !state.finished && !state.paused) {
        // `lastTime` is cleared so the first frame back reports a delta of zero
        // rather than however long the tab was hidden. That matters more now
        // than it used to: the arc is a sixty second story, and a visitor who
        // switched away for two minutes should come back to the sea they left
        // rather than to the credits.
        state.lastTime = 0;
        start();
    } else if (state.paused && renderer && scene) {
        // Some mobile browsers drop a background tab's canvas, and a paused
        // scene draws nothing by itself, so the frozen frame is put back once.
        renderer.render(scene, camera);
    }
}

function loop(now) {
    if (!state.running) return;
    frame = requestAnimationFrame(loop);
    const seconds = now / 1000;
    const delta = state.lastTime ? seconds - state.lastTime : 0;
    state.lastTime = seconds;
    adaptQuality(delta);
    // The sea moves while the welcome card is up; the story does not. Nor does
    // it while a scrubber thumb is held down: the thumb is the clock then, the
    // way a video holds still under a finger.
    if (state.begun && !ui.scrubbing) {
        state.arc += Math.max(0, Math.min(0.25, delta));
        paintScrubber();
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
    //
    // HELD THROUGH A DRAG AND FOR A MOMENT AFTER ANY SEEK. A drag moves the arc
    // clock far faster than real time, and the rate cap is written in arc
    // seconds, so without the hold a scrub through the storm could flash
    // faster than the welcome card promises. See `controls.lightningHoldSeconds`.
    ui.lightningHold = Math.max(0, ui.lightningHold - Math.max(0, delta));
    if (lightningAllowed({ scrubbing: ui.scrubbing, holdSeconds: ui.lightningHold })) {
        updateLightning(state.arc, OCEAN_CONFIG);
    }
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
    // THE FLOOR IS WHY THE ENDING IS NOT A HOLE. Past a certain depth the sea is
    // over the eye with nothing under it to draw, so the white-out holds instead
    // of draining to zero and hands the frame straight to the fade. It cannot
    // fire during the storm: see `washFloorAt`.
    state.wash = washEnvelope(state.wash, storm.engulf, delta, OCEAN_CONFIG.storm,
        storm.washFloor);
    paintOverlay(state.wash.wash, storm.fade);

    // THE CONTROLS STEP ASIDE FOR THE FADE. The last seconds are the sea closing
    // over the visitor and then black, and a pause button floating over that is
    // the one frame of chrome that would cost the scene most. They stay if the
    // visitor is using them at that moment, and they do not come back on a mere
    // pointer move until the next watch.
    const ending = storm.fade > 0;
    if (ending !== ui.ending) {
        ui.ending = ending;
        if (ending) idleControls();
    }

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
 *  and it stops a sixty second story running while the visitor is still reading
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
    hideCard();
    showControls();
}

/** Put the welcome card up again, as the pause card.
 *
 *  THE SAME CARD, NOT A SECOND ONE, because Steve asked for the pause screen to
 *  say what the welcome screen says, and one copy of the content warning cannot
 *  drift from another. What changes is the buttons: Resume in place of Begin,
 *  Restart beside it, and a line saying where the story was held. */
function showCard() {
    if (!welcome) return;
    clearTimeout(ui.cardTimer);
    if (card.begin) card.begin.hidden = true;
    if (card.actions) card.actions.hidden = false;
    if (card.pausedAt) {
        card.pausedAt.hidden = false;
        card.pausedAt.textContent = `Paused at ${clockLabel(state.arc)}`;
    }
    welcome.hidden = false;
    welcome.style.pointerEvents = '';
    // On the next frame, so the fade has a frame to start from. A hidden tab
    // runs no frames, so a pause on the way out fades in on the way back,
    // which is exactly when the visitor is there to see it.
    requestAnimationFrame(() => { if (state.paused && welcome) welcome.style.opacity = '1'; });
}

/** Fade the card out, as Begin, Resume and Restart all do. */
function hideCard() {
    if (!welcome) return;
    clearTimeout(ui.cardTimer);
    welcome.style.opacity = '0';
    // Stops catching clicks the instant it starts fading rather than when it
    // finishes. Under reduced motion there is no fade at all, so without this
    // the card would sit invisible over the whole page for most of a second,
    // swallowing anything aimed at what is behind it.
    welcome.style.pointerEvents = 'none';
    // Then out of the flow entirely once the fade is done. The timer is kept so
    // a pause inside those 700ms cannot have its card hidden from under it.
    ui.cardTimer = setTimeout(() => { if (welcome && !state.paused) welcome.hidden = true; }, 700);
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
    // MADE IT TO THE END. A minute is a long time to ask for, and the
    // difference between a scene people start and a scene people finish is the
    // difference between a good idea and a good experience. `runs` distinguishes
    // a first watch from a second, so this stays meaningful after a replay.
    runs += 1;
    flushSeek();
    track('arc-complete', { watch, scrubbed: ui.scrubbed ? 1 : 0 });
    stop();
    hideControls();
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
 *  THE SKY IS THE ONE THING THAT DELIBERATELY DOES NOT GO BACK. It used to: the
 *  note here said a second run was the same afternoon rather than a different
 *  one, and that was a reasonable call while the only thing a rewatch offered
 *  was the story again. Steve asked on 2026-08-24 for a second viewing to be
 *  worth something, and a fresh hour is the cheapest honest answer, since it
 *  changes the composition rather than adding a prop to it.
 *
 *  Everything else on this list resets so the second watch is the SAME STORM.
 *  This one is here so it is not the same light. See `resetSky` for how far it
 *  really moves, which is the glint path and not the mood. */
function replayArc(fromKeyboard = false) {
    // THE CLOSEST THING THIS PROJECT HAS TO A MEASURE OF DELIGHT. The stated
    // goal for every scene on the site is that somebody enjoys it enough to pass
    // it on, and there is no honest way to count that from here. Watching it a
    // second time is the nearest available proxy and it costs one line.
    //
    // Not guarded: a third watch is worth knowing about too.
    watch += 1;
    track('replay', { watch });
    rewind();
    showControls();
    placeFocus(fromKeyboard);
    start();
}

/** Back to the first second of the story, from the pause card.
 *
 *  A NEW WATCH, THE SAME AS A REPLAY, and reported apart from one. "Watched it
 *  again" after the ending is the delight signal; "started again" from the
 *  middle is closer to "missed the beginning", and the two should not be
 *  counted as the same thing. `at` says how far in they were. */
function restartArc(fromKeyboard) {
    if (!state.paused) return;
    const at = Math.round(state.arc);
    flushSeek();
    watch += 1;
    track('restart', { at, watch });
    state.paused = false;
    hideCard();
    rewind();
    showControls();
    placeFocus(fromKeyboard);
    start();
}

/** Everything a replay and a restart both put back, and neither starts. */
function rewind() {
    // The funnel starts again with a new watch, or the second watch would
    // report no stages at all and read as somebody who pressed replay and left.
    stageReached = 0;
    ui.scrubbed = false;
    ui.ending = false;
    ui.lightningHold = 0;
    state.arc = 0;
    resetWater();
    resetSand();
    // The storm's schedule goes back with it. A replay that came back with its
    // lightning half way through its own timetable would be the same class of
    // fault as the tide one above: the second watch would not be the storm the
    // first one was.
    resetLightning();
    resetBuoy();
    // AND THE SKY DRAWS A FRESH HOUR, which is the one thing on this list that
    // is not about putting the scene back exactly as it was. Everything above
    // resets so the second watch is the same storm. This is here so it is not
    // the same afternoon: see `resetSky` for how far it actually moves, which is
    // the glint path rather than the mood.
    resetSky();
    state.finished = false;
    state.lastTime = 0;
    if (ending) {
        ending.style.opacity = '0';
        ending.hidden = true;
    }
    state.wash = { wash: 0, target: 0, attacking: false };
    paintOverlay(0, 0);
    paintScrubber();
}

// ---- The player controls -----------------------------------------------------
//
// A pause button in the top right corner, Escape, a pause card with Restart, and
// a scrubber along the bottom, all added 2026-09-23. The rules are in
// controls.js; this is only the wiring.

/** Stop the story and put the pause card up. `how` is 'button', 'key' or
 *  'hidden', for the report. */
function pauseArc(how) {
    if (escapeAction(state) !== 'pause') return;
    // Escape in the middle of a drag lands the drag first, so the card says
    // where the story actually is.
    if (ui.scrubbing) endScrub();
    flushSeek();
    state.paused = true;
    stop();
    track('pause', { at: Math.round(state.arc), how, watch });
    hideControls();
    showCard();
    if (card.resume) card.resume.focus();
}

/** Take the card down and carry on from the frame the pause froze. */
function resumeArc(fromKeyboard) {
    if (escapeAction(state) !== 'resume') return;
    state.paused = false;
    track('resume', { at: Math.round(state.arc), watch });
    hideCard();
    showControls();
    placeFocus(fromKeyboard);
    // The first frame back reports no delta, or the pause itself would arrive
    // as a quarter second of storm in one frame.
    state.lastTime = 0;
    start();
}

/** Where focus goes when a card button has just been hidden under it.
 *
 *  FOLLOW A KEYBOARD, STAY OUT OF THE WAY OF A POINTER. A keyboard visitor lands
 *  on the pause button, so the next Escape or Enter is where they expect it.
 *  Somebody who clicked or tapped gets focus dropped, so there is no ring left
 *  on a button they did not aim at and the controls are free to fade. */
function placeFocus(fromKeyboard) {
    if (fromKeyboard && controlsEl.pause) {
        controlsEl.pause.focus();
    } else if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
    }
}

/** The controls belong to a story in progress: shown from Begin, hidden by a
 *  pause and by the ending. */
function showControls() {
    if (!controlsEl.root) return;
    controlsEl.root.hidden = false;
    paintScrubber();
    // A resume inside the closing fade brings them back already out of the way.
    if (ui.ending) idleControls();
    else revealControls();
}

function hideControls() {
    if (!controlsEl.root) return;
    clearTimeout(ui.idleTimer);
    controlsEl.root.hidden = true;
    document.body.classList.remove('hw-idle');
}

/** Bring the controls up, and start the clock on putting them away. */
function revealControls() {
    const root = controlsEl.root;
    if (!root || root.hidden) return;
    if (ui.ending && !ui.scrubbing) return;
    root.classList.remove('is-idle');
    document.body.classList.remove('hw-idle');
    clearTimeout(ui.idleTimer);
    ui.idleTimer = setTimeout(idleControls, OCEAN_CONFIG.controls.idleSeconds * 1000);
}

/** Fade the controls out, unless the visitor is using them, in which case look
 *  again after another idle period. */
function idleControls() {
    const root = controlsEl.root;
    if (!root || root.hidden) return;
    clearTimeout(ui.idleTimer);
    const busy = !mayIdle({
        scrubbing: ui.scrubbing,
        hovering: ui.hoverPause || ui.hoverScrub,
        keyboardFocus: keyboardFocusInControls()
    });
    if (busy) {
        ui.idleTimer = setTimeout(idleControls, OCEAN_CONFIG.controls.idleSeconds * 1000);
        return;
    }
    root.classList.add('is-idle');
    // The cursor goes with them, the way it does over a playing video, so the
    // storm is not watched through an arrow. Scoped to the canvas in the
    // stylesheet, so it never hides over a card.
    document.body.classList.add('hw-idle');
}

/** Whether keyboard focus, as opposed to a click's leftover focus, is inside the
 *  controls. `:focus-visible` is the browser's own answer to exactly that. */
function keyboardFocusInControls() {
    const el = document.activeElement;
    if (!el || !controlsEl.root || !controlsEl.root.contains(el)) return false;
    try { return el.matches(':focus-visible'); } catch { return true; }
}

/** Put the story's position on the scrubber: the thumb, the filled track, and
 *  the words a screen reader hears. Left alone mid drag, when the thumb is the
 *  visitor's and not the clock's. */
function paintScrubber() {
    const scrub = controlsEl.scrub;
    if (!scrub || ui.scrubbing) return;
    scrub.value = state.arc.toFixed(1);
    paintTrack(state.arc);
}

function paintTrack(seconds) {
    const scrub = controlsEl.scrub;
    if (!scrub) return;
    // CSSOM, not a style attribute, so the CSP has nothing to say about it.
    // Same as the overlays' opacity.
    scrub.style.setProperty('--progress', progressPercent(seconds));
    // Only on a new whole second, so a screen reader is not handed a new value
    // sixty times a second.
    const whole = Math.floor(seconds);
    if (whole !== ui.lastWhole) {
        ui.lastWhole = whole;
        scrub.setAttribute('aria-valuetext', valueText(seconds));
    }
}

/** A finger or a mouse button has gone down on the scrubber. */
function beginScrub() {
    if (ui.scrubbing || escapeAction(state) !== 'pause') return;
    ui.scrubbing = true;
    ui.dragFrom = state.arc;
    // Any flash in the sky goes out now, and nothing new strikes until the
    // drag has settled. See `controls.lightningHoldSeconds`.
    resetLightning();
    revealControls();
}

/** Mid drag, the story follows the thumb and nothing else is touched. The sea
 *  rebuilds its own profile from the arc a few times a second anyway, so the
 *  storm tracks the thumb without the full resync, which is saved for the
 *  moment the thumb is let go. */
function dragTo(value) {
    if (!ui.scrubbing) return;
    state.arc = seekTarget(value);
    paintTrack(state.arc);
}

/** The thumb has been let go: land the seek properly. */
function endScrub() {
    if (!ui.scrubbing) return;
    ui.scrubbing = false;
    seekArc(controlsEl.scrub ? controlsEl.scrub.value : state.arc, ui.dragFrom);
}

/** Move the story to `value` seconds and bring every clock in the scene with it.
 *
 *  THE STORY CLOCK IS THE EASY PART. The storm, the sky, the buoy and the
 *  lightning's schedule are all read straight off it. What is not: the tide and
 *  the sets run on the sea's own clock, the bores on the beach carry the swell
 *  of the moment they broke, and the white-out remembers whether it is mid
 *  attack. Each of those is put where a replay would have it at this second,
 *  so a scrubbed-to storm is the same storm an untouched watch gets there. */
function seekArc(value, from = state.arc) {
    if (!state.begun || state.finished) return;
    const at = seekTarget(value);
    state.arc = at;
    resetWater(at);
    resetSand(at);
    resetLightning();
    resetBuoy();
    state.wash = { wash: 0, target: 0, attacking: false };
    ui.lightningHold = OCEAN_CONFIG.controls.lightningHoldSeconds;
    ui.scrubbed = true;
    // A frame at a time: the loop's next delta should not include however long
    // this took.
    state.lastTime = 0;
    noteSeek(from, at);
    paintScrubber();
    revealControls();
}

/** Remember a seek for the report, which goes once they stop. */
function noteSeek(from, to) {
    if (ui.seekFrom === null) ui.seekFrom = from;
    ui.seekTo = to;
    clearTimeout(ui.seekTimer);
    ui.seekTimer = setTimeout(flushSeek, OCEAN_CONFIG.controls.seekReportSeconds * 1000);
}

function flushSeek() {
    clearTimeout(ui.seekTimer);
    if (ui.seekFrom === null) return;
    track('seek', { from: Math.round(ui.seekFrom), to: Math.round(ui.seekTo), watch });
    ui.seekFrom = null;
}

/** Escape pauses and resumes. Any other key brings the controls up, the way a
 *  video player's do. */
function onKeyDown(event) {
    if (event.key === 'Escape' && !event.repeat && !isEditable(event.target)) {
        const action = escapeAction(state);
        if (action === 'pause') {
            event.preventDefault();
            pauseArc('key');
            return;
        }
        if (action === 'resume') {
            event.preventDefault();
            resumeArc(true);
            return;
        }
    }
    revealControls();
}

/** The scrubber's own keys, five seconds a press. See `keySeekTarget`. */
function onScrubKey(event) {
    const at = keySeekTarget(event.key, state.arc);
    if (at === null) return;
    event.preventDefault();
    seekArc(at);
}

/** Find the elements and wire them. Every one is optional, so a stripped-down
 *  embed without the controls simply has none. */
function installControls() {
    controlsEl.root = document.getElementById('controls');
    controlsEl.pause = document.getElementById('pause-btn');
    controlsEl.scrubber = document.getElementById('scrubber');
    controlsEl.scrub = document.getElementById('scrub');
    card.begin = document.getElementById('begin');
    card.actions = document.getElementById('pause-actions');
    card.resume = document.getElementById('resume');
    card.restart = document.getElementById('restart');
    card.pausedAt = document.getElementById('paused-at');

    if (controlsEl.pause) {
        controlsEl.pause.addEventListener('click', () => pauseArc('button'));
        controlsEl.pause.addEventListener('pointerenter', () => { ui.hoverPause = true; });
        controlsEl.pause.addEventListener('pointerleave', () => { ui.hoverPause = false; });
    }
    if (card.resume) card.resume.addEventListener('click', (event) => resumeArc(event.detail === 0));
    if (card.restart) card.restart.addEventListener('click', (event) => restartArc(event.detail === 0));

    const scrub = controlsEl.scrub;
    if (scrub) {
        scrub.max = String(OCEAN_CONFIG.storm.seconds);
        scrub.addEventListener('pointerdown', beginScrub);
        // An `input` with no pointer behind it is assistive technology moving
        // the value, which is a drag that starts and ends in one event.
        scrub.addEventListener('input', () => {
            const solo = !ui.scrubbing;
            beginScrub();
            dragTo(scrub.value);
            if (solo) endScrub();
        });
        scrub.addEventListener('change', endScrub);
        scrub.addEventListener('keydown', onScrubKey);
    }
    if (controlsEl.scrubber) {
        controlsEl.scrubber.addEventListener('pointerenter', () => { ui.hoverScrub = true; });
        controlsEl.scrubber.addEventListener('pointerleave', () => { ui.hoverScrub = false; });
    }
    if (controlsEl.root) controlsEl.root.addEventListener('focusin', revealControls);

    // A release anywhere ends a drag, since a finger routinely leaves the
    // slider before it lifts.
    window.addEventListener('pointerup', endScrub);
    window.addEventListener('pointercancel', endScrub);
    window.addEventListener('pointermove', revealControls, { passive: true });
    window.addEventListener('pointerdown', revealControls, { passive: true });
    window.addEventListener('keydown', onKeyDown);
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
 *  been three minutes, then two, then ninety seconds, then sixty, and every
 *  hardcoded second
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
        { at: Math.round(state.arc), watch, scrubbed: ui.scrubbed ? 1 : 0 });
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
        // answered. A sixty second arc that people leave at thirty is a
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
    blackout = document.getElementById('blackout');
    ending = document.getElementById('ending');
    replay = document.getElementById('replay');
    welcome = document.getElementById('welcome');
    installControls();
    // `detail` is 0 for a click the keyboard made, which is how focus knows
    // whether to follow the visitor or get out of their way. See `placeFocus`.
    if (replay) replay.addEventListener('click', (event) => replayArc(event.detail === 0));

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
    // `beginArc`, so the count includes visitors who read the content warning
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
    window.oceanSetArc = (seconds) => {
        const at = Math.max(0, Number(seconds) || 0);
        // Jumping the arc implies starting it, or the clock would be set and
        // then sit there while the welcome card held it at that number.
        beginArc();
        // Coming back from the ending has to clear the card and restart the
        // loop, and `replayArc` is the only thing that knows how, so it runs
        // first and the time is set after it rather than before.
        if (state.finished) replayArc();
        // And from the pause card, which would otherwise hold the jump behind
        // a frozen frame.
        if (state.paused) resumeArc(false);
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
        // takes them out of shot too.
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
