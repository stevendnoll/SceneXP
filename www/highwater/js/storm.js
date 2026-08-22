// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * storm.js - The ninety second arc. The clock the whole scene now runs on.
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
 * tsunami arrives. Then black. It was three minutes, then two, and is now ninety
 * seconds: every viewing since has said the same thing, which is that the parts
 * with nothing happening in them are longer than they feel while writing them.
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
 * jump to 1:12 rather than waiting for it.
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
 *  than interpolate: the copy on the ending card, a debug label.
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

/** How far the sky has closed over, 0 the day the visit drew and 1 overcast.
 *
 *  Leads the swell rather than tracking it, because weather arrives before the
 *  sea it makes does: a swell has to travel and a cloud front does not. It is
 *  also the only warning the visitor gets before the water starts behaving
 *  badly, which makes it the most useful thing in the arc dramatically and the
 *  cheapest thing in it computationally. */
export function gloomAt(seconds, storm = OCEAN_CONFIG.storm) {
    return curveAt(seconds, storm.gloom, storm);
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
    // THE RAMP STARTS AT EYE LEVEL AND IT USED TO START BELOW IT, which left the
    // frame permanently milky. The first version ran from eye - 0.35 to
    // eye + 0.35 on the reasoning that a hard switch would flicker as crests
    // passed. What it actually did was return a small non-zero value for any
    // water standing anywhere near the camera, and through the storm the surge
    // alone sits in that band, so the white never fully cleared between waves.
    //
    // Water below the eye is water you are standing IN, not water you are
    // looking THROUGH, so it has to contribute exactly nothing. The flicker the
    // old lower edge was guarding against is handled properly by the release
    // envelope in `washEnvelope`, which is the right tool for it.
    return smoothstep(eye, eye + wash, surfaceY);
}

/** Smooth the white-out over time: fast on, slow off.
 *
 *  A WAVE HITTING YOU IS FAST AND DRAINING OFF IS NOT, so this is deliberately
 *  asymmetric rather than a symmetric smoothing.
 *
 *  FAST IS NOT THE SAME AS INSTANT, AND THAT WAS THE SECOND BUG HERE. The first
 *  version returned the target unchanged whenever it was rising, which takes the
 *  screen from clear to full white in a SINGLE FRAME. Sixteen milliseconds is
 *  not how water arrives, it is how a camera flash goes off, and that is exactly
 *  what Steve saw twice running. The lens model makes it worse: the bore is at
 *  full thickness the instant it arrives, so the underlying signal really is a
 *  step, and something has to turn that into water.
 *
 *  A fifth of a second is about how long a wall of whitewater takes to cover a
 *  face, which is fast enough to be violent and slow enough to be a wave.
 *
 *  IT FIRES ON THE ARRIVAL AND NOT ON THE STATE, which is the third fix here and
 *  the one that finally made it read as water. Following the engulfment directly
 *  meant the screen stayed white for as long as the sea was over the eye, and a
 *  big bore sits there for three or four seconds. Steve's note is the right test
 *  for it: a brief flash is fine, but the picture has to come back within a
 *  second or two or you lose sight of the next wave, and losing sight of the
 *  next wave is losing the scene.
 *
 *  So the attack runs only while the water is still RISING over the eye, and
 *  everything else releases. Physically that is water on a lens rather than a
 *  camera underwater: it sheets off on its own schedule and does not wait for
 *  the sea to let go. It also means a visitor standing in a wave sees the wave,
 *  which is the entire point of putting them there.
 *
 *  Pure, with both previous values passed in, so the frame loop owns the state
 *  and this stays testable. BOTH EDGES ARE LINEAR, so the release reaches
 *  exactly zero, which an exponential never would: an exponential leaves a
 *  percent of white on the screen forever, which was the first bug here. */
export function washEnvelope(previous, target, deltaSeconds, storm = OCEAN_CONFIG.storm) {
    const prev = previous && typeof previous === 'object'
        ? previous : { wash: 0, target: 0, attacking: false };
    const delta = Math.max(0, deltaSeconds);
    const release = storm.washReleaseSeconds > 0 ? storm.washReleaseSeconds : 1;
    const attack = storm.washAttackSeconds > 0 ? storm.washAttackSeconds : 0.2;

    // RISING IS A RATE, NOT A DIFFERENCE, and testing it as a difference is what
    // kept the screen white for three seconds after this was supposedly fixed.
    // The tide moves under the whole scene, so once a bore is sitting over the
    // camera the water keeps creeping up by about a thousandth of the wash per
    // frame. Any tolerance near zero reads that as an arrival, the attack stays
    // latched, and the picture never comes back until the wave leaves.
    //
    // The threshold is the release rate itself, which is the one number here
    // that does not need choosing: if the water is coming up slower than it
    // drains off the lens, then it is not arriving, it is just there. An onset
    // runs at about eight per second against a creep of six hundredths, so the
    // two are nowhere near each other and nothing has to be tuned.
    //
    // AND THE ONSET HAS TO LATCH. The rate test is true for one frame only,
    // because the arrival is a step: the water goes over the eye between two
    // frames and then simply stays there. Attacking only on frames that pass the
    // test therefore moved the wash by a single frame's worth, about eight per
    // cent, and the white-out disappeared entirely. So the onset arms the
    // attack, the attack runs until it has caught the target, and everything
    // after that releases. A second wave arriving mid release arms it again.
    const gained = target - prev.target;
    let attacking = prev.attacking;
    if (delta > 0 && gained / delta > 1 / release) attacking = true;

    let wash;
    if (attacking) {
        wash = Math.min(target, prev.wash + delta / attack);
        if (wash >= target - 1e-9) attacking = false;
    } else {
        wash = Math.max(0, prev.wash - delta / release);
    }
    return { wash, target, attacking };
}

/** Where the tsunami front is, as a z, and how much water is standing behind it.
 *
 *  THE TSUNAMI HAD NO OBJECT IN IT AND THIS IS THE FIX. Everything before this
 *  raised the water level EVERYWHERE AT ONCE, which is what a surge is and is
 *  not what anybody means by a tsunami arriving. The sea got higher, the swell
 *  got bigger, and there was nothing to watch approach, because nothing was
 *  approaching: the whole ocean was simply inflating in place. Steve watched it
 *  and said he could not see it coming, which is precisely correct.
 *
 *  So the surge becomes a STEP THAT TRAVELS. Water behind the front stands
 *  `rise` metres higher, water ahead of it is at the level the arc otherwise
 *  says, and the front sweeps from the fog limit to the beach. That gives three
 *  things at once and all of them are the point: a visible line on the horizon
 *  that grows as it closes, deeper water behind it so the swell back there
 *  stands taller than the swell in front, and a real arrival time.
 *
 *  Returns `null` before the front exists, which is most of the arc, so callers
 *  can skip the whole per-row branch on the cheap. */
export function frontAt(seconds, storm = OCEAN_CONFIG.storm) {
    const t = storm.tsunami;
    if (!t || seconds < t.startAt) return null;
    const span = t.arriveAt - t.startAt;
    const p = span > 0 ? Math.min(1, (seconds - t.startAt) / span) : 1;
    // Linear in TIME rather than smoothed, because this one is a body of water
    // with momentum and easing it in would read as hesitation. The only thing a
    // tsunami does is keep coming.
    // GROWS AND STEEPENS ON THE WAY IN, because a tsunami shoals: the same body
    // of water piles into less and less depth, so it stands taller and its front
    // face gets shorter. Green's law does this for the ordinary swell on its own
    // and cannot do it here, since the rise is a step in the water LEVEL rather
    // than a wave, so it is walked along the front's own progress instead.
    const grown = t.riseFar + (t.riseNear - t.riseFar) * p;
    // IT SLOWS DOWN AS IT COMES IN, which is both what a shoaling wave does and
    // what the scene needs. A tsunami's speed is sqrt(g h), so it runs at about
    // ten metres a second in eleven metres of water and half that in the
    // shallows. Travelling at a constant rate it crossed the whole visible band
    // in five seconds and the rise had no time to read; this spends most of the
    // approach in the near half, where a metre of water is worth ten times the
    // pixels it is worth at the fog limit.
    const travelled = Math.pow(p, 0.7);
    return {
        z: t.fromZ + (t.toZ - t.fromZ) * travelled,
        // THE FADE IN IS SHORT ON PURPOSE. It used to ramp over the first
        // quarter of the approach, which meant the wall came out of the fog at
        // half the height the OLD constant rise had, and Steve read it correctly
        // as having got smaller. It is fully formed inside a second now. Nothing
        // pops, because at four hundred metres it is behind the fog anyway; the
        // ramp is only here so the step does not spring into existence on a
        // frame where somebody happens to be looking at the horizon.
        rise: grown * smoothstep(0, 0.10, p),
        width: t.frontWidthFar + (t.frontWidthNear - t.frontWidthFar) * p,
        // How far back the raised water reaches before it tapers away. Carried
        // on the front rather than read from config by water.js, the same way
        // `rise` and `width` are, so the sea never has to know what a tsunami
        // is. See the note beside `p.lift` in water.js for why this is not
        // simply infinite.
        body: t.bodyMetres,
        foam: t.frontFoam * smoothstep(0, 0.15, p),
        // The sea BEHIND the front, as a swell multiplier. Full from the moment
        // it appears, because the wall is supposed to be already enormous when
        // it comes out of the fog rather than to grow on the way in.
        swellBehind: t.swellBehind
    };
}

/** How far the air has cleared, 0 the scene's usual fog and 1 wide open.
 *
 *  Exists because a wall of water four hundred metres out was being painted the
 *  exact colour of the sky behind it. See `sky.fog` in config. */
export function clarityAt(seconds, storm = OCEAN_CONFIG.storm) {
    return curveAt(seconds, storm.clarity, storm);
}

/** Where the calm has reached, during the lull, as a z.
 *
 *  THE SEA CANNOT GO FLAT ALL AT ONCE AND IT KEPT DOING EXACTLY THAT. Amplitude
 *  here is a function of the row and the CURRENT swell, with no memory of the
 *  waves already in flight, so dropping the swell shrinks every wave in place at
 *  the same instant. What that looks like is the large one you are watching
 *  quietly melting ten metres from the break, which Steve reported twice, and
 *  the second time after a fix that had only slowed the melting down.
 *
 *  The calm has to TRAVEL, because that is what it is: the storm stops making
 *  waves out at sea, and the last ones it made keep coming until they arrive.
 *  So the boundary starts offshore and sweeps in, the sea seaward of it is
 *  already flat, and the waves shoreward of it are still full size and still
 *  have somewhere to go. The sea empties from the horizon inward and the last
 *  few waves break properly. Same mechanism as the tsunami front, opposite
 *  errand: one brings water in, the other takes the waves away.
 *
 *  Returns null outside the lull, which is most of the arc. */
export function lullFrontAt(seconds, storm = OCEAN_CONFIG.storm) {
    const l = storm.lull;
    if (!l || seconds < l.startAt) return null;
    const span = l.endAt - l.startAt;
    const p = span > 0 ? Math.min(1, (seconds - l.startAt) / span) : 1;
    if (p >= 1) return null;      // past the lull the arc's own swell is the sea
    return {
        z: l.fromZ + (l.toZ - l.fromZ) * p,
        width: l.width,
        // The sea as it was when the storm stopped. Rows the calm has not
        // reached yet are still this big, which is the whole point.
        before: swellAt(l.startAt, storm)
    };
}

/** How much the front raises the water at a given z, in metres.
 *
 *  THE SHAPE IS WRITTEN TWICE ON PURPOSE AND THERE IS A TEST THAT SAYS SO.
 *  water.js applies it per row while building the profile, and it cannot import
 *  this file, because water.js knowing about a ninety second story is exactly the
 *  coupling that keeps being avoided here: the sea takes numbers and draws them.
 *  So the same smoothstep exists in both places and `highwater-storm.test.mjs`
 *  asserts they agree across the whole sheet. Duplicating four characters of
 *  arithmetic is cheaper than a dependency, but only while something checks it.
 *
 *  One is seaward of the front and zero shoreward, because the raised water is
 *  what is CHASING the front rather than what is waiting for it. */
export function frontLevelAt(z, front) {
    if (!front) return 0;
    // ASCENDING EDGES AND THEN INVERTED, NOT DESCENDING EDGES. This read
    // `smoothstep(front.z + width, front.z - width, z)` for a day, which is a
    // REVERSED range, and both smoothsteps in this codebase guard that case with
    // `if (edge1 <= edge0) return x >= edge1 ? 1 : 0`. That guard is meant for a
    // zero width range and it silently turns a reversed one into a hard step
    // returning 1 almost everywhere. So the front raised the WHOLE OCEAN the
    // instant it appeared, which is precisely the behaviour it was built to
    // replace, and it went unnoticed because the white line uses a Gaussian and
    // looked perfect while the level under it was wrong.
    return front.rise * (1 - smoothstep(front.z - front.width, front.z + front.width, z));
}

/** The still water surface at the camera from the surge alone, in world metres.
 *
 *  A FALLBACK, NOT THE ANSWER, AND IT IS MISSING THE HALF THAT MATTERS. The
 *  still water level says whether the sea has reached the camera, and during the
 *  storm the answer is yes and ankle deep. What puts water over somebody's head
 *  is the BORE, the broken whitewater running shoreward, which is not limited by
 *  the local depth the way an unbroken wave is. sand.js is what tracks that, so
 *  pass `surfaceY` in from `surfaceWithSwash` wherever there is a beach to ask.
 *  This exists for the frames before one has been built and for the tests, and
 *  it is deliberately the conservative half of the answer.
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
    const front = frontAt(seconds, storm);
    // The front counts as water once it has passed the camera, and leaving it
    // out of the fallback was wrong the moment the surge handed the covering
    // over to it: the estimate said the eye was dry through the entire ending.
    const level = surge + frontLevelAt(config.camera.z, front);
    // The live surface where there is a sea to ask, because it carries the tide
    // and the bores, neither of which this file can see.
    const surface = surfaceY == null ? surfaceAtCamera(level, config) : surfaceY;
    return {
        seconds,
        progress: arcProgress(seconds, storm),
        stage: stageAt(seconds, storm).name,
        swell: swellAt(seconds, storm),
        lean: leanAt(seconds, storm),
        gloom: gloomAt(seconds, storm),
        clarity: clarityAt(seconds, storm),
        surge,
        front,
        lull: lullFrontAt(seconds, storm),
        engulf: engulfAt(surface, config),
        fade: fadeAt(seconds, storm),
        // The arc is over when the fade is complete, which is the moment main.js
        // is allowed to stop drawing. This is the only scene in the project that
        // can honestly do that, and it should.
        finished: seconds >= storm.seconds
    };
}
