// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * storm.js - The three minute arc. The clock the whole scene now runs on.
 *
 * THIS FILE IS THE ONLY THING IN THE SCENE THAT KNOWS WHAT TIME IT IS. Everything
 * else takes numbers and draws them: water.js is handed a swell scale and a
 * surge, sand.js is handed a waterline, main.js is handed a fade. None of them
 * know there is a story going on, which is what keeps them reusable and what
 * lets the whole arc be retimed by editing one table in config.
 *
 * WHAT THE ARC IS. An ordinary bright day at a beach that turns. The swell
 * builds, the break line marches out to sea, the horizon starts disappearing
 * behind the swell, waves begin coming over the camera, the sea withdraws, and a
 * tsunami arrives. Then black. Three minutes, agreed with Steve on 2026-08-19.
 *
 * THE DRAWBACK IS THE MOST IMPORTANT TWENTY SECONDS IN IT. A sea that goes the
 * wrong way is more frightening than any amount of water arriving, because
 * everybody watching already knows what it means. It costs almost nothing: the
 * surge goes negative, the waterline walks down the beach, and the sand that has
 * been sitting under the shallows all this time is suddenly the subject.
 *
 * PURE CORE, NO SHELL AT ALL. There is no THREE in this file and there should
 * never be. It is arithmetic on a clock, which means the entire arc can be
 * inspected, tested, and retimed without a browser, and a screenshot pass can
 * jump to 2:24 rather than waiting for it.
 */

import { OCEAN_CONFIG } from './config.min.js';

/** Smoothstep, matching the one in water.js and the GLSL of the same name.
 *
 *  Duplicated rather than imported because this file deliberately depends on
 *  nothing but config, and one five line function is a smaller price than a
 *  dependency that makes the arc unloadable without the sea. */
function smoothstep(edge0, edge1, x) {
    if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function lerp(a, b, t) { return a + (b - a) * t; }

/** Where we are in the arc, 0 at the first frame and 1 at black. */
export function arcProgress(seconds, storm = OCEAN_CONFIG.storm) {
    const total = storm.seconds > 0 ? storm.seconds : 1;
    return Math.max(0, Math.min(1, seconds / total));
}

/** The named stage at a given time, for anything that needs to branch rather
 *  than interpolate: the audio bed, the copy on the ending card, a debug label.
 *
 *  Returns the LAST stage whose `from` has passed, so the table reads as a
 *  sequence of start times rather than as a set of ranges that have to be kept
 *  from overlapping. Times are seconds from the first frame. */
export function stageAt(seconds, storm = OCEAN_CONFIG.storm) {
    const stages = storm.stages;
    let found = stages[0];
    for (let i = 0; i < stages.length; i++) {
        if (seconds >= stages[i].from) found = stages[i];
    }
    return found;
}

/** How far through its own stage a given time is, 0 to 1.
 *
 *  Kept separate from `stageAt` because most of the arc interpolates rather
 *  than switches, and every curve below wants this rather than the stage. */
export function stageProgress(seconds, storm = OCEAN_CONFIG.storm) {
    const stages = storm.stages;
    for (let i = 0; i < stages.length; i++) {
        const from = stages[i].from;
        const to = i + 1 < stages.length ? stages[i + 1].from : storm.seconds;
        if (seconds >= from && (seconds < to || i === stages.length - 1)) {
            if (to <= from) return 1;
            return Math.max(0, Math.min(1, (seconds - from) / (to - from)));
        }
    }
    return 0;
}

/** How big the sea is, as a multiple of the calm spectrum in `water.waves`.
 *
 *  ONE CURVE THROUGH FOUR MEASURED POINTS rather than a formula, because the
 *  ceiling on this number is not a matter of taste. Past about 2.5 the Gerstner
 *  displacement folds the mesh through itself, and the margin at each step was
 *  measured rather than guessed. See `storm.swell` in config for the table.
 *
 *  Interpolated with smoothstep between the keys so the sea has no moment where
 *  it visibly changes gear. A linear ramp is perfectly smooth in value and has a
 *  corner in its slope, and on something that takes a minute to happen the
 *  corner is the only part anybody notices. */
export function swellAt(seconds, storm = OCEAN_CONFIG.storm) {
    return curveAt(seconds, storm.swell, storm);
}

/** The crest cusping, which trades against swell through the fold limit.
 *
 *  Comes DOWN as the swell goes up, and that is a physical bargain rather than
 *  a stylistic one: amplitude times wave number times this is what drives the
 *  Jacobian of the horizontal displacement to zero, and zero is where the
 *  surface passes through itself. Holding 3.2 all the way to a 2.5x swell puts
 *  the margin at 0.125, which is close enough to the edge that a set arriving on
 *  a high tide could cross it. */
export function leanAt(seconds, storm = OCEAN_CONFIG.storm) {
    return curveAt(seconds, storm.lean, storm);
}

/** Metres the still water level stands above its normal mean.
 *
 *  Negative during the drawback, which is the whole point of it. Added to the
 *  tide rather than replacing it, so the slow tide carries on underneath and the
 *  surge is a departure from it rather than a different system. */
export function surgeAt(seconds, storm = OCEAN_CONFIG.storm) {
    return curveAt(seconds, storm.surge, storm);
}

/** The shared shape behind the three curves above.
 *
 *  A key list of `{ at, value }` in seconds, smoothstepped between neighbours,
 *  clamped at both ends. Exported for the tests and for any curve added later,
 *  because a fourth one written by hand would drift from these three. */
export function curveAt(seconds, keys, storm = OCEAN_CONFIG.storm) {
    if (!keys || keys.length === 0) return 0;
    if (keys.length === 1) return keys[0].value;
    const t = Math.max(0, Math.min(storm.seconds, seconds));
    if (t <= keys[0].at) return keys[0].value;
    const last = keys[keys.length - 1];
    if (t >= last.at) return last.value;
    for (let i = 1; i < keys.length; i++) {
        if (t <= keys[i].at) {
            const a = keys[i - 1];
            const b = keys[i];
            return lerp(a.value, b.value, smoothstep(a.at, b.at, t));
        }
    }
    return last.value;
}

/** How much of the frame is water, 0 clear and 1 fully engulfed.
 *
 *  NOT RENDERED AS UNDERWATER, AND THAT IS THE DESIGN. A wave breaking over your
 *  head is not a clear green view with fish in it, it is an opaque white-out
 *  that arrives faster than the eye adapts. So this drives a full screen wash
 *  rather than a submerged camera, which is both cheaper and closer to what the
 *  thing actually looks like.
 *
 *  It is also why the camera never has to move. Steve's no bob decision was
 *  about motion sickness and it still holds: the eye stays exactly where it is
 *  and the water comes up over it.
 *
 *  Driven by the water surface against the eye rather than by a curve, so it can
 *  never disagree with the sea that is actually being drawn. `surfaceY` is the
 *  height of the water at the camera, in the same metres as `camera.height`. */
export function engulfAt(surfaceY, config = OCEAN_CONFIG) {
    const eye = config.camera.height;
    const wash = config.storm.engulfWashMetres;
    return smoothstep(eye - wash, eye + wash, surfaceY);
}

/** The still water surface at the camera from the surge alone, in world metres.
 *
 *  A FALLBACK, NOT THE ANSWER. water.js knows the real water level because it
 *  also knows the tide, and the tide is a quarter of a metre either way against
 *  a wash that ramps over 0.35, so the two disagree by enough to matter. Pass
 *  `surfaceY` into `stormStateAt` from `surfaceAt` in water.js wherever there is
 *  a sea to ask. This exists for the frames before one has been built and for
 *  the tests, and it is deliberately the conservative half of the answer.
 *
 *  The bed under the camera is above mean sea level, since the beach climbs
 *  shoreward, so a surge has to clear that before there is any water here at
 *  all. Returns the bed height when the sea has not arrived, which is what dry
 *  means to `engulfAt`. */
export function surfaceAtCamera(surge, config = OCEAN_CONFIG) {
    const { beach, camera } = config;
    const bed = (camera.z - beach.shoreZ) * beach.slope;
    return Math.max(bed, surge);
}

/** The closing fade, 0 fully visible and 1 fully black. */
export function fadeAt(seconds, storm = OCEAN_CONFIG.storm) {
    const start = storm.seconds - storm.fadeSeconds;
    return smoothstep(start, storm.seconds, seconds);
}

/** Everything the frame needs, in one object, built once per frame.
 *
 *  Returned as a fresh object rather than mutated in place because it is one
 *  small allocation per frame against a scene that uploads four megabytes six
 *  times a second, and having it be plain immutable data makes the whole arc
 *  trivial to assert on. */
export function stormStateAt(seconds, config = OCEAN_CONFIG, surfaceY = null) {
    const storm = config.storm;
    const surge = surgeAt(seconds, storm);
    // The live surface where there is a sea to ask, because it carries the tide.
    const surface = surfaceY == null ? surfaceAtCamera(surge, config) : surfaceY;
    return {
        seconds,
        progress: arcProgress(seconds, storm),
        stage: stageAt(seconds, storm).name,
        swell: swellAt(seconds, storm),
        lean: leanAt(seconds, storm),
        surge,
        engulf: engulfAt(surface, config),
        fade: fadeAt(seconds, storm),
        // The arc is over when the fade is complete, which is the moment main.js
        // is allowed to stop drawing. This is the only scene in the project that
        // can honestly do that, and it should.
        finished: seconds >= storm.seconds
    };
}
