// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * water.js - The sea: geometry, wave simulation, breaking, and foam.
 *
 * THE ONE THING THIS SCENE HAS TO GET RIGHT. The camera never moves, there is
 * nothing to click, and the day cycle turns over slowly, so if the water is not
 * convincing then nothing else can rescue the experience. Everything below is
 * in service of one question: does it read as the sea within about two seconds
 * of the welcome screen clearing?
 *
 * WHY A HEIGHTFIELD IS NOT A COMPROMISE HERE. Most subjects lose something when
 * they are flattened into a displaced plane. An ocean surface genuinely is a
 * heightfield almost everywhere, so a subdivided plane is not an approximation
 * of the sea, it is the same object. The exception is a wave that has folded
 * over into a barrel, which a heightfield cannot represent at all. We do not
 * attempt one. What we do instead is push the crest into a forward-leaning cusp
 * right at the break, which is the silhouette of a wave about to pitch, and let
 * the foam take over from there. That is a deliberate boundary and it is why
 * the shot was chosen as a shorebreak seen from the sand rather than a surf
 * break seen from the side.
 *
 * ---- The physics that is actually load bearing --------------------------
 *
 * GERSTNER WAVES, NOT SINES. A sine wave has crests and troughs of the same
 * shape, which the eye reads as corrugated iron. A Gerstner wave moves each
 * particle in a circle rather than up and down, which narrows the crests and
 * broadens the troughs. That single change is most of the difference between
 * water and fabric. Four of them at wavelengths that do not divide evenly never
 * quite repeat.
 *
 * THE BEACH DOES THE DIRECTING. Nothing in this file places a break line. The
 * seabed profile in config gives every point a depth, and three consequences
 * follow from depth alone:
 *
 *   1. Wavelength shortens as the bottom comes up, so waves bunch together.
 *   2. Amplitude grows to keep the energy flux constant (Green's law), so they
 *      stand up as they arrive.
 *   3. A wave cannot be taller than about 0.78 of the water it is standing in,
 *      so past that point it breaks and its height is capped by the depth.
 *
 * Together those three are why the surf forms a line parallel to the beach and
 * why the line sits where it does. Change `beach.slope` in config and the whole
 * break line moves, because it was never a number anyone typed.
 *
 * REFRACTION FOR FREE. Snell's law says k * sin(theta) is conserved as a wave
 * crosses depth contours. Since k grows in shallow water, sin(theta) must
 * shrink, so waves swing round to arrive parallel to the beach however they
 * were angled out at sea. This costs one division per wave and it is the reason
 * the swell can come in at an angle without the surf arriving crooked.
 *
 * ---- How the work is divided --------------------------------------------
 *
 * THE CPU OWNS THE PROFILE, THE GPU OWNS THE WAVES. Every quantity that depends
 * on depth is constant along a row of the mesh, because the beach runs straight
 * and depth varies only with z. So the CPU computes one small profile per row
 * (local wave number, shoaled amplitude, how hard it is breaking, how much foam
 * has been left behind) and hands it over as vertex attributes. Those change
 * only as the tide and the set envelope move, both measured in minutes, so the
 * rebuild runs a handful of times a second rather than every frame. The vertex
 * shader then does the part that changes at wave speed: sum four Gerstner terms
 * and their analytic derivatives.
 *
 * THE ACCUMULATED PHASE IS THE SUBTLE PART. When wavelength varies with
 * position you cannot write the phase as k * x, because k is different at each
 * end and the crests tear. The honest answer is to integrate k along the
 * direction of travel, which is a running sum down the rows and therefore
 * something the CPU can hand over as one more attribute. The cross-shore half
 * of the phase needs no integration at all: Snell's law makes k * sin(theta)
 * constant, so the x term is a single multiply with a number that never
 * changes.
 *
 * IT IS THE FIRST SHADER IN THIS CODEBASE, and that is worth flagging rather
 * than slipping in. Nothing else in www uses ShaderMaterial or onBeforeCompile.
 * Displacing this many vertices in JavaScript will not hold a frame rate on a
 * phone, so the GPU has to do it. The compromise is that the injection goes
 * into a stock MeshStandardMaterial rather than a material written from
 * scratch: Three's lighting, fog, tone mapping, and colour space keep working
 * untouched, which means the day cycle lands later and drives the water for
 * free instead of needing a second implementation inside a custom shader.
 *
 * THAT BET PAID, AND ONLY HALF OF IT. When sky.js arrived, the sun, the fill,
 * the fog, and the exposure all reached the water through Three with no change
 * here at all, exactly as promised. The half it did not cover is the one that
 * turned out to matter most: a standard material has no specular except the
 * punctual lights, so the sea reflected nothing, and a sea that reflects nothing
 * is black at the horizon where it should be brightest. That needed real work,
 * and it is `FRAGMENT_REFLECT` below.
 *
 * THE AUDIO SEAM IS ONE FUNCTION. `consumeBreaks()` returns the waves that
 * actually reached the break line since the last call. audio.js already takes
 * `playBreak(strength, pan)`, so the crash the visitor hears is the wave they
 * just watched rather than a timer running alongside it. That is the whole
 * reason the two were built separably.
 *
 * PURE CORE, THIN SHELL. Everything above the THREE section is arithmetic on
 * plain numbers and is exercised directly by the suite. THREE appears only in
 * the last third, where those numbers become a mesh.
 */

import { OCEAN_CONFIG } from './config.min.js';

/** Metres per second squared. The only physical constant in the file, and it
 *  sets the speed of every wave through the dispersion relation, so the sea
 *  runs at the speed a sea actually runs at rather than at a tuned one. */
const GRAVITY = 9.81;

/** Below this the shoaling maths stops being worth computing and starts being
 *  a source of infinities. Depth is clamped to config's `minDepth` first, so
 *  this is only a floor under the floor. */
const EPSILON = 1e-6;

/** Waves that get their own break event for the audio. The two longest, which
 *  are the two that actually read as arriving. The short components are chop
 *  riding on top and firing a crash for each of them would turn the beach into
 *  a rattle. */
const SOUNDING_WAVES = 2;

/** A sea with no storm on it, which is what every caller gets by default.
 *
 *  THE DEFAULT IS THE OLD BEHAVIOUR EXACTLY. water.js knew nothing about an arc
 *  until storm.js existed and it still does not: it takes a swell multiplier and
 *  a surge, and whether those come from a three minute story or from a slider is
 *  none of its business. That is what keeps the file reusable for the next water
 *  scene, and it is the same seam that keeps the sky an argument rather than an
 *  import. Frozen because it is shared by every default call. */
const CALM = Object.freeze({ swell: 1, surge: 0 });

// ---------------------------------------------------------------------------
// The pure core: depth, dispersion, shoaling, breaking
// ---------------------------------------------------------------------------

/** The seabed height at a given z, in metres, with still water at zero.
 *
 *  Out to sea (z below `shoreZ`) this is negative and gets more negative on the
 *  configured slope until it flattens off at `maxDepth`. Shoreward of the water
 *  line it keeps climbing on the same slope, which is the dry beach, and is why
 *  the sand mesh can be built from this same function rather than from a second
 *  set of numbers that would drift out of step with it.
 *
 *  A SANDBAR WAS TRIED HERE AND MEASURED OUT, and the reason is worth keeping
 *  because the idea is a good one and will come back. On a barred beach the
 *  swell trips on a ridge parked offshore, rides the trough behind it as
 *  whitewater without rebuilding, and breaks a second time small at the sand:
 *  two break lines with calm water between them, which is what most people
 *  picture when they picture surf. A Gaussian ridge added here gets all of it
 *  for about fifteen lines, since everything downstream reads depth and nothing
 *  cares what shape the bed is.
 *
 *  It does not survive contact with the geometry. A trough only exists if the
 *  ridge falls away faster than the beach climbs, which needs the bed nearly
 *  flat where the trough goes, which puts the bar far out. Every version that
 *  broke the wave in the right depth put the bar past thirty metres, and a wave
 *  breaking at thirty metres is a third the height on screen of one breaking at
 *  twelve. That is also true of the real thing: offshore breakers look enormous
 *  in photographs because they are shot on long lenses, not because they are
 *  large in the eye. The scene gets the same effect from the lens for free. */
export function bedHeightAt(z, beach = OCEAN_CONFIG.beach) {
    return Math.max(-beach.maxDepth, (z - beach.shoreZ) * beach.slope);
}

/** Where still water sits right now, in metres, relative to mean level.
 *
 *  A single slow sine. Its period is deliberately long and deliberately not a
 *  neat fraction of the day cycle: over a visit of a few minutes the tide is
 *  never noticed happening, only noticed having happened, which is exactly how
 *  a tide behaves. */
export function tideOffset(elapsed, water = OCEAN_CONFIG.water) {
    return (water.tideRange / 2) * Math.sin((Math.PI * 2 * elapsed) / water.tidePeriodSeconds);
}

/** Depth of water over the bed at a given z, never negative and never below
 *  `minDepth` unless it is genuinely dry, in which case it is exactly zero.
 *
 *  The zero is load bearing: it is how the rest of the file knows a row is
 *  above the water line and should carry no wave and no opacity at all. */
export function depthAt(z, tide, beach = OCEAN_CONFIG.beach, water = OCEAN_CONFIG.water) {
    const d = tide - bedHeightAt(z, beach);
    if (d <= 0) return 0;
    return Math.max(water.minDepth, d);
}

/** Local wave number for a wave whose deep-water wave number is k0, standing in
 *  water of the given depth.
 *
 *  The exact relation is omega squared = g k tanh(k d), which has no closed form
 *  for k and would need Newton iterations per row. Eckart's 1952 approximation
 *  gives k = k0 / sqrt(tanh(k0 d)) explicitly and lands within a few percent
 *  everywhere, which is far inside what anyone can see in a wave crest. In deep
 *  water tanh goes to one and this returns k0 unchanged, so the approximation
 *  costs nothing where it is not needed. */
export function waveNumberAt(k0, depth) {
    if (depth <= EPSILON) return k0;
    const t = Math.tanh(k0 * depth);
    return k0 / Math.sqrt(Math.max(t, EPSILON));
}

/** Green's law shoaling: how much taller a wave is here than it was out at sea.
 *
 *  Energy flux is conserved as a wave crosses depth contours, and the flux is
 *  the energy times the GROUP speed rather than the phase speed, which is why
 *  the awkward `n` term is here rather than a simple ratio of phase speeds.
 *  In deep water n is a half and this returns one. In shallow water n goes to
 *  one and the whole thing grows as depth to the minus one quarter, which is
 *  the classic Green's law result and the reason a swell that was unnoticeable
 *  offshore stands up over a sandbar. */
export function shoalingAt(k, depth, c0) {
    if (depth <= EPSILON || k <= EPSILON) return 1;
    const kd = k * depth;
    // sinh overflows long before the term stops mattering. Past about kd = 10
    // the wave has no idea the bottom is there and n is a half to more decimal
    // places than a float carries.
    const n = kd > 10 ? 0.5 : 0.5 * (1 + (2 * kd) / Math.sinh(2 * kd));
    const c = Math.sqrt((GRAVITY / k) * Math.tanh(kd));
    return Math.sqrt(c0 / Math.max(2 * n * c, EPSILON));
}

/** How sharp the crest of this component is, as a fraction of its own amplitude.
 *
 *  A sum of sines cannot look like surf, and the reason is arithmetic rather
 *  than artistic. A four second wave breaking in a metre and a half of water is
 *  a metre tall over a fifteen metre wavelength, so its face is nine degrees.
 *  Nine degrees is a gradient, not a wave. What makes a real shoaling wave look
 *  the way it does is that it stops being a sine on the way in: the crest draws
 *  up into a peak and the trough spreads out flat beneath it.
 *
 *  That shape is a second harmonic riding in phase with the fundamental, and
 *  second order Stokes theory says exactly how much of one. The ratio grows as
 *  the water shallows, and then it diverges, which is the theory announcing that
 *  cnoidal theory has taken over. So THE CLAMP IS THE MODEL HERE, not a guard on
 *  it. A quarter is also the largest ratio that leaves one trough per wave: past
 *  it the trough splits in two around a bump in the middle, which reads as a
 *  bug rather than as water.
 *
 *  Written with tanh rather than the textbook's cosh and sinh, which are the
 *  same thing rearranged and do not overflow out where the bottom stops
 *  mattering. In deep water it settles on the familiar a*k/2. */
export function sharpenAt(amp, k, depth, limit = OCEAN_CONFIG.water.crestSharpen) {
    if (amp <= EPSILON || k <= EPSILON || depth <= EPSILON) return 0;
    const t = Math.tanh(k * depth);
    if (t <= EPSILON) return limit;
    const ratio = ((amp * k) / 4) * (3 / (t * t * t) - 1 / t);
    return Math.min(limit, ratio);
}

/** How hard a wave of height h is breaking in water of the given depth.
 *
 *  Zero for a wave comfortably inside what the depth can carry, one for a wave
 *  well past it, and a smooth ramp between. The threshold is the McCowan
 *  criterion: a wave breaks when its height passes about 0.78 of the local
 *  depth. `breakSoftness` widens the ramp, which is the difference between a
 *  hard line of surf and a broad zone of whitewater, and is the second knob to
 *  reach for after the beach slope. */
export function breakAmount(h, depth, water = OCEAN_CONFIG.water) {
    if (depth <= EPSILON) return 1;
    const ratio = h / depth;
    const lo = water.breakRatio - water.breakSoftness;
    const hi = water.breakRatio + water.breakSoftness;
    return smoothstep(lo, hi, ratio);
}

/** The set envelope for one wave component: a slow multiplier on its amplitude.
 *
 *  Two sines whose periods do not divide evenly, multiplied together, which
 *  takes minutes to come back around. Each component is offset in phase from
 *  the last so they peak at different moments, and the result is that some
 *  arrivals are noticeably larger than others and break further out. Without
 *  this the sea is correct and completely inert: the same four waves rolling in
 *  at the same size forever, which is the failure mode that turns an ambient
 *  scene into wallpaper.
 *
 *  It is the same trick the river in www/dad uses on its audio and the same one
 *  the surf scheduler next door uses on its gaps. Three places now, at three
 *  tempos, which is probably enough evidence that it is the house answer to
 *  "make this feel alive without a random number generator". */
export function envelopeAt(elapsed, index, water = OCEAN_CONFIG.water) {
    const offset = index * 7.3;
    const a = Math.sin((Math.PI * 2 * (elapsed + offset)) / water.setPeriodSeconds);
    const b = Math.sin((Math.PI * 2 * (elapsed + offset)) / water.setSubPeriodSeconds);
    return 1 + water.setDepth * a * b;
}

/** The z position of each row of the mesh, from the row nearest the camera out
 *  to the horizon.
 *
 *  Power spaced rather than even. A fixed camera a metre above the water sees
 *  the nearest few metres at something like a hundred times the screen size of
 *  the water two hundred metres out, so even spacing would spend most of the
 *  budget on rows that are three pixels tall. `rowBias` above one packs rows
 *  toward the camera; it is the first thing to lower if the far water looks
 *  faceted and the first thing to raise if the near water looks coarse.
 *
 *  PACKED TOWARD THE CAMERA, NOT TOWARD THE SHEET'S OWN NEAR EDGE. Those sound
 *  like the same sentence and they are not, and the difference cost a
 *  screenshot round. The sheet has to start behind the camera so the waterline
 *  has something under it at high tide, so a curve anchored at the sheet's edge
 *  crowds its rows behind the viewer, where no arrangement of them can be seen:
 *  the first draft put a fifth of the entire grid back there and left the near
 *  water, which fills the bottom half of the frame, with about fifteen rows to
 *  cover three hundred pixels. Every one of those rows was twenty pixels of
 *  linear interpolation, which is what "the sea looks soft" turned out to be.
 *
 *  So the curve is anchored at `rowNear`, a distance IN FRONT of the camera,
 *  and the strip from there back to the sheet's edge gets a flat `nearRows`.
 *  That strip sits below the bottom of the frame by construction and is only
 *  there to be covered and uncovered by the tide. */
export function rowPositions(rows, config = OCEAN_CONFIG) {
    const { beach, camera, water } = config;
    const out = new Float32Array(rows);
    const nearRows = Math.max(0, Math.min(beach.nearRows, rows - 2));
    const curveRows = rows - nearRows;
    // Distances in front of the camera. The near edge is behind it, so this one
    // is negative, which is exactly why it cannot be the anchor of a power curve.
    const nearEdge = camera.z - beach.nearZ;
    const far = camera.z - beach.farZ;

    for (let i = 0; i < nearRows; i++) {
        out[i] = camera.z - (nearEdge + (beach.rowNear - nearEdge) * (i / nearRows));
    }
    for (let i = 0; i < curveRows; i++) {
        const t = curveRows > 1 ? i / (curveRows - 1) : 0;
        out[nearRows + i] = camera.z - (beach.rowNear + (far - beach.rowNear) * Math.pow(t, water.rowBias));
    }
    return out;
}

/** Half the width of the mesh at a given z.
 *
 *  THE SHEET IS THE CAMERA'S OWN FOOTPRINT, which is what makes this a function
 *  of distance rather than of the row index. Widening on the row parameter
 *  instead looks equivalent and is not, because the rows are not evenly spaced:
 *  it made the sheet three and a half times wider than the frustum at the break
 *  line, so most of the columns fell off the sides of the screen and the surf
 *  was left with a metre and a half between samples.
 *
 *  Growing the half width linearly with distance puts the columns on radial
 *  lines from the eye, so every column is the same number of pixels wide from
 *  the foreground to the horizon, which is the best a fixed grid can do. */
export function halfWidthAt(z, beach = OCEAN_CONFIG.beach, camera = OCEAN_CONFIG.camera) {
    return beach.baseHalfWidth + Math.max(0, camera.z - z) * beach.widthPerMetre;
}

/** Constants for one wave component that never change once config is read.
 *
 *  Deep water wave number, deep water phase speed, angular frequency, and the
 *  conserved Snell invariant k * sin(theta). Pulled out of the per-row loop
 *  because none of them depend on depth, and the Snell invariant in particular
 *  is the reason the cross-shore phase term needs no integration.
 *
 *  `speed` is an honest detune rather than physics. It multiplies the frequency
 *  only, which breaks the dispersion relation very slightly, and it is here so
 *  four components whose wavelengths already do not divide evenly also cannot
 *  drift back into step through their periods. */
export function waveConstants(waves) {
    return waves.map((w) => {
        const k0 = (Math.PI * 2) / w.length;
        const c0 = Math.sqrt(GRAVITY / k0);
        const sin0 = Math.max(-0.95, Math.min(0.95, w.dirX));
        return {
            k0,
            c0,
            omega: k0 * c0 * w.speed,
            kSin: k0 * sin0,
            amplitude: w.amplitude,
            steepness: w.steepness
        };
    });
}

/** The whole per-row profile, which is the heart of the file.
 *
 *  Walks the rows from the horizon in to the sand, because two of the values
 *  are running totals that only make sense in the direction the waves travel:
 *  the accumulated phase, which integrates the local wave number along the
 *  path, and the foam bed, which carries whitewater shoreward from wherever it
 *  was created and lets it decay.
 *
 *  Returns flat arrays rather than an array of objects. They are uploaded to
 *  the GPU as vertex attributes a few times a second and rebuilt in place, so
 *  allocating twenty eight thousand small objects per rebuild would be the one
 *  genuinely wasteful thing in the frame budget. */
export function buildProfile(rowZ, elapsed, config = OCEAN_CONFIG, out = null, sea = CALM) {
    const { beach, water } = config;
    const rows = rowZ.length;
    const constants = waveConstants(water.waves);
    const n = constants.length;
    // The arc rides on top of the tide rather than replacing it, so a storm
    // surge and a slow tide are the same kind of quantity and the sea has one
    // water level rather than two competing ones.
    const swell = sea.swell > 0 ? sea.swell : 0;
    const tide = tideOffset(elapsed, water) + sea.surge;
    // THE ONE THING IN THIS FILE THAT IS NOT THE SAME EVERYWHERE. Every other
    // quantity here varies with depth, which varies with z, so the sea is
    // uniform in the sense that one rule makes all of it. A tsunami front is
    // not: it is a step in the water level that is in a PLACE and travels, and
    // there is genuinely more water on one side of it than the other.
    const front = sea.front || null;

    const p = out || {
        depth: new Float32Array(rows),
        breaking: new Float32Array(rows),
        foamBed: new Float32Array(rows),
        edge: new Float32Array(rows),
        phase: new Float32Array(rows * n),
        amp: new Float32Array(rows * n),
        sharp: new Float32Array(rows * n),
        k: new Float32Array(rows * n)
    };

    const envelope = [];
    for (let i = 0; i < n; i++) envelope.push(envelopeAt(elapsed, i, water));

    // Whitewater carries shoreward and thins out. The length scale is derived
    // from `foamPersistence` rather than being its own number, so there is one
    // knob for "how far does the foam run" instead of two that can disagree.
    const foamDecayMetres = 4 + 40 * water.foamPersistence;

    const carried = new Float32Array(n);   // accumulated phase per component
    const grown = new Float32Array(n);     // shoaled height, before the cap
    let foam = 0;
    // The biggest wave this sea has managed on the way in, which is the one at
    // the break line. Whitewater is scaled against it, so the surf fades toward
    // the sand instead of painting the near field one flat white.
    let tallest = 0;
    let previousZ = rowZ[rows - 1];

    // From the horizon inward: index counts down because row 0 is the row
    // nearest the camera and the waves arrive from the far end.
    for (let r = rows - 1; r >= 0; r--) {
        const z = rowZ[r];
        const step = z - previousZ;   // positive: we are moving shoreward
        previousZ = z;

        // Behind the front (seaward, smaller z) the water stands higher, and
        // `frontWidth` is what stops it being a one row cliff that strobes as it
        // crosses the grid.
        //
        // ASCENDING EDGES AND THEN INVERTED. Writing it the natural way round,
        // `smoothstep(front.z + width, front.z - width, z)`, is a REVERSED range,
        // and `smoothstep` above guards that with `edge1 <= edge0` and returns a
        // hard 1. So the front raised the entire sheet the instant it existed.
        // It has to match `frontLevelAt` in storm.js exactly, and there is a
        // test that walks the sheet and checks that it does.
        let level = tide;
        let behindFront = 0;
        if (front) {
            behindFront = 1 - smoothstep(front.z - front.width, front.z + front.width, z);
            level += front.rise * behindFront;
        }
        // THE SEA IS A DIFFERENT SIZE ON THE TWO SIDES OF THE FRONT, and that is
        // what turns a step in the water level into a WALL. The level alone is
        // only a few pixels tall at three hundred metres, so on its own it
        // arrives without ever having been seen. Put a huge swell behind it and
        // leave the drawn back water in front of it calm, and the horizon grows
        // a ridge that stands above the eye line while the sea in front of it
        // lies flat. That contrast is the whole picture.
        //
        // It is also what actually happens. The water behind a tsunami front is
        // the disturbed water the front is made of, and the water ahead of it
        // has just been pulled out and has nothing driving it.
        const rowSwell = front
            ? swell + (front.swellBehind - swell) * behindFront
            : swell;

        const depth = depthAt(z, level, beach, water);
        p.depth[r] = depth;

        // Above the water line: no wave, no foam, nothing to draw.
        if (depth <= 0) {
            p.breaking[r] = 0;
            p.foamBed[r] = 0;
            p.edge[r] = 0;
            for (let i = 0; i < n; i++) {
                p.phase[r * n + i] = carried[i];
                p.amp[r * n + i] = 0;
                p.sharp[r * n + i] = 0;
                p.k[r * n + i] = constants[i].k0;
            }
            continue;
        }

        // First pass: how tall each component WANTS to be here, having grown on
        // the way in. Nothing is capped yet, because the cap is on the sum.
        let wanted = 0;
        for (let i = 0; i < n; i++) {
            const w = constants[i];
            const k = waveNumberAt(w.k0, depth);
            p.k[r * n + i] = k;

            // Integrate the cross-shore component of the wave number along the
            // path. sin(theta) comes straight from the Snell invariant, and the
            // cross-shore direction cosine follows from it.
            const sinTheta = clamp(w.kSin / k, -0.95, 0.95);
            const cosTheta = Math.sqrt(1 - sinTheta * sinTheta);
            carried[i] += k * cosTheta * step;
            p.phase[r * n + i] = carried[i];

            // Grow the wave as it shallows. `shoalGain` blends between no
            // shoaling at all and the full Green's law answer, which is the dial
            // for how dramatically waves stand up on their way in.
            const ks = shoalingAt(k, depth, w.c0);
            // The storm scales the DEEP WATER amplitude and nothing else, which
            // is the only place it can be applied without lying. Everything
            // downstream of here is the sea's own response to that: the shoaling
            // grows it, the depth cap limits it, and the break line moves itself
            // seaward because a bigger wave runs out of water further out. Scale
            // the answer instead of the input and the surf zone stays put while
            // the waves in it get taller, which is not a thing a sea does.
            grown[i] = w.amplitude * rowSwell * envelope[i] * (1 + water.shoalGain * (ks - 1));
            wanted += grown[i];
        }

        // THE DEPTH LIMIT IS ON THE WHOLE SEA, NOT ON EACH WAVE IN IT, and
        // getting that backwards is not a subtle error. McCowan says the water
        // surface cannot stand more than about 0.78 of the local depth above
        // the trough, and there is one water surface. Capping each of the four
        // components at that figure separately lets them sum to four times it:
        // half a metre of water was carrying a metre and a third of wave, the
        // trough went a clear nineteen centimetres BELOW the seabed, and the
        // beach came through the sea as a hard edged tan slab. Which is what
        // ocean-4.png caught. So the cap is computed once on the total and
        // shared out, which shrinks the whole sea together and keeps the
        // relative sizes of the components intact.
        //
        // Round the corner rather than cutting it. A hard min creases the sea
        // along one row; an asymptotic cap like tanh has the opposite problem
        // and it is a worse one, since tanh is already eight percent below the
        // identity at half the ceiling, so every wave is quietly flattened long
        // before it breaks and the moment of STANDING UP, which is the single
        // most watchable thing a wave does, never happens. A smooth minimum is
        // exactly the ceiling far from it and exactly the wave everywhere else,
        // with the blend confined to the last third.
        //
        // And the sea has to die out entirely at the water's edge. `minDepth`
        // stops the depth reaching zero so the arithmetic stays well behaved,
        // which means the cap by itself still permits a few centimetres of wave
        // in water that is really only a few millimetres deep, and the trough of
        // it sits just under the sand. Fading the waves out over the same span
        // the sheet itself fades out over settles both at once, and it is what
        // the last stretch of a beach looks like anyway: a sheet of water, not
        // a wave.
        const edge = smoothstep(0, 0.35, depth);
        p.edge[r] = edge;

        const ceiling = (water.breakRatio * depth) / 2;
        const allowed = smoothMin(wanted, ceiling, ceiling * 0.3) * edge;
        const scale = wanted > EPSILON ? allowed / wanted : 1;

        // Second pass: the final amplitude, and the second harmonic that turns
        // it from a sine into something with a crest. `sharpenAt` needs the
        // amplitude the component actually ended up with, which is why this
        // cannot fold into the pass above.
        //
        // The harmonic does NOT change the wave height, so nothing above it
        // needs revisiting. It lifts the crest and the trough by the same
        // amount, leaving trough-to-crest exactly where the depth cap left it,
        // which is the quantity McCowan's ratio is about. What moves is where
        // the still water line sits within the wave, and that is the point.
        let ampTotal = 0;
        for (let i = 0; i < n; i++) {
            const amp = grown[i] * scale;
            p.amp[r * n + i] = amp;
            p.sharp[r * n + i] = amp * sharpenAt(amp, p.k[r * n + i], depth, water.crestSharpen);
            ampTotal += amp;
        }

        // Measured on the height the sea WANTED, not the height it ended up
        // with, because the cap above is precisely the consequence of breaking.
        const breaking = breakAmount(wanted * 2, depth, water);
        p.breaking[r] = breaking;

        // Foam left behind. Whatever is breaking here tops the bed up, and
        // whatever was carried from further out decays over the step. This is
        // the cheap stand-in for advecting a foam field, and it gets the thing
        // that matters: whitewater exists shoreward of where it was made, not
        // only exactly on the wave that made it.
        //
        // HOW HARD IT IS BREAKING IS NOT HOW MUCH FOAM THERE IS, and conflating
        // the two is what made the surf a flat sheet. `breaking` is pinned at 1
        // across the entire inner zone, correctly: everything shoreward of the
        // break line is collapsing and gets more so as the water thins. Used
        // directly as the amount of whitewater it says a fifteen centimetre bore
        // sliding over wet sand throws as much foam as a metre and a half of
        // water falling on itself at the break, which is plainly untrue and
        // painted the near field one uniform white from the break line to the
        // sand. Steve's screenshots caught the surge at its peak twice out of
        // four and the whole picture was a wash.
        //
        // Whitewater goes with the SIZE of the thing breaking. Scaling by the
        // wave height here against the biggest it managed on the way in gives
        // that for free and costs one running maximum, because the loop already
        // runs from the horizon inward and the largest wave is the one at the
        // break by construction. It also makes the decay term matter for the
        // first time: with the bed pinned at 1 the max always chose `breaking`
        // and the exponential was dead code.
        tallest = Math.max(tallest, ampTotal);
        const size = tallest > EPSILON ? ampTotal / tallest : 0;
        foam = Math.max(breaking * size, foam * Math.exp(-Math.abs(step) / foamDecayMetres));
        // A WHITE LINE ON THE HORIZON IS WHAT MAKES THE THING VISIBLE. A step in
        // the water level is only a couple of pixels tall out at the fog limit,
        // and the sea there is already the colour of the sky, so the level alone
        // arrives without ever having been seen coming. The front of a tsunami
        // bore is broken water and it is white, and white against a grey sea
        // reads at any distance, which is the whole reason this term exists.
        //
        // Written into the bed rather than into `breaking`, because it is not a
        // wave collapsing: it is whitewater that is already there and being
        // carried. Taken at the maximum so a front crossing the surf zone does
        // not fight with the surf that is already breaking in it.
        //
        // NOT folded into `foam` itself, which is the running total the next row
        // inherits. Doing that would carry the line shoreward as the loop walks
        // in, smearing the front's whitewater across the water AHEAD of it,
        // which is the one side of a bore that is still clean.
        p.foamBed[r] = front
            ? Math.max(foam, front.foam * Math.exp(-(((z - front.z) / front.width) ** 2)))
            : foam;

        // `p.edge` was set above, before the cap, because the waves are faded
        // out over the same span the sheet is. One number, one water's edge.
    }

    return p;
}

/** The break line: the seaward-most row where the surf is collapsing, or -1 if
 *  nothing is breaking anywhere.
 *
 *  THE SEAWARD EDGE, NOT THE STRONGEST ROW, and the difference is the whole
 *  function. Everything shoreward of the break is also breaking, and gets more
 *  so as the water thins, so asking for the maximum returns the row closest to
 *  the sand every single time. That is the swash, not the surf. The break line
 *  is where the collapse STARTS, which is the outer edge of the zone.
 *
 *  Used for two things: deciding when a wave has arrived so audio.js can be
 *  told, and reporting the break distance so the scene can be tuned by looking
 *  at a number rather than at a screenshot. */
export function breakRow(profile, threshold = 0.5) {
    // Rows count down toward the camera, so walking down from the last index is
    // walking in from the horizon.
    for (let r = profile.breaking.length - 1; r >= 0; r--) {
        if (profile.depth[r] > 0 && profile.breaking[r] >= threshold) return r;
    }
    return -1;
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/** The smaller of two values, with the corner rounded off over a width of k.
 *
 *  The standard polynomial smooth minimum. Returns `a` exactly while a is more
 *  than k below b, returns `b` exactly while it is more than k above, and
 *  curves between. Used to cap wave height against depth without either
 *  creasing the sea or flattening every wave that is nowhere near breaking. */
export function smoothMin(a, b, k) {
    if (k <= EPSILON) return Math.min(a, b);
    const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
    return b * (1 - h) + a * h - k * h * (1 - h);
}

function smoothstep(edge0, edge1, x) {
    if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// The shader
// ---------------------------------------------------------------------------

/** Injected just after `#include <common>` in the vertex program.
 *
 *  Everything here is per row except `position`, which is why the wave state
 *  arrives as attributes that are identical across each row rather than as
 *  something recomputed per vertex. */
const VERTEX_HEAD = `
uniform float uTime;
uniform vec4 uOmega;
uniform vec4 uSteepness;
uniform vec4 uKSin;
uniform float uLeanGain;
attribute vec4 aPhase;
attribute vec4 aAmp;
attribute vec4 aWaveK;
attribute vec4 aShore;
attribute vec4 aSharp;
varying vec4 vSurf;
varying vec3 vFoam;
varying vec2 vPulse;
`;

/** Replaces `#include <beginnormal_vertex>`.
 *
 *  The whole wave sum lives here rather than in `begin_vertex` because Three
 *  computes the normal BEFORE it computes the position, and both need the same
 *  four sines. Every chunk is inlined into one main(), so `waveOffset` declared
 *  here is still in scope when the position chunk below wants it.
 *
 *  THE NORMALS ARE ANALYTIC, not from a finite difference and not from
 *  computeVertexNormals on the CPU. A Gerstner sum differentiates in closed
 *  form, so the exact surface tangents cost four more sines and nothing else.
 *  That matters more than usual here: water is almost all specular, so a normal
 *  that is slightly wrong shows up as the sun glinting in the wrong place,
 *  which is far more visible than a slightly wrong shape would be.
 *
 *  THE FOLD TERM IS THE FOAM. The determinant of the horizontal displacement
 *  tells you whether the surface is being stretched or compressed, and where it
 *  compresses past the point of folding back on itself is exactly where a real
 *  wave throws whitewater. It falls out of the tangents we already have, so the
 *  best foam signal in the file is also the cheapest. */
const VERTEX_BODY = `
    vec3 waveOffset = vec3(0.0);
    float dXdx = 0.0, dYdx = 0.0, dZdx = 0.0;
    float dXdz = 0.0, dYdz = 0.0, dZdz = 0.0;
    float ampTotal = 0.0;
    vec2 phasor = vec2(0.0);
    float ampFund = 0.0;
    float lean = 1.0 + uLeanGain * aShore.y;

    for (int i = 0; i < 4; i++) {
        float k = aWaveK[i];
        float amp = aAmp[i];
        if (amp <= 0.0 || k <= 0.0) continue;

        float sinTheta = clamp(uKSin[i] / k, -0.95, 0.95);
        float cosTheta = sqrt(1.0 - sinTheta * sinTheta);

        // Cross-shore phase was integrated on the CPU; the along-shore half is
        // a plain multiply because k * sin(theta) is a Snell invariant.
        float phase = aPhase[i] + uKSin[i] * position.x - uOmega[i] * uTime;
        float s = sin(phase);
        float c = cos(phase);

        // Q * A, the horizontal swing of the orbit. Scaled by the wave's own
        // amplitude so a component that has died away stops moving water
        // sideways as well as vertically, and pushed past its normal limit
        // approaching the break so the crest cusps forward.
        float h = uSteepness[i] * amp * lean;

        // THE SECOND HARMONIC IS WHAT MAKES IT A WAVE. A sine has a crest
        // exactly as round as its trough, which is why the sea read as a floor
        // no matter how tall the waves were made. This term is in phase with
        // the fundamental and at twice its wave number, so it adds to the crest
        // and fills in the trough: the peak draws up, the hollow flattens out.
        // The CPU decided how much of it there should be, from the local depth,
        // in sharpenAt.
        //
        // Minus cosine rather than plus, because the fundamental here is a sine.
        // At the crest, where phase is a quarter turn, cos(2 * phase) is minus
        // one, so subtracting it lifts the crest rather than flattening it. Get
        // the sign backwards and the sea grows sharp troughs and round crests,
        // which looks like a photographic negative of surf.
        float sharp = aSharp[i];
        float c2 = cos(2.0 * phase);
        float s2 = sin(2.0 * phase);

        waveOffset.x += h * sinTheta * c;
        waveOffset.z += h * cosTheta * c;
        waveOffset.y += amp * s - sharp * c2;
        // The crest signal that drives the foam is normalised by this, so the
        // harmonic belongs in it. Leave it out and a sharpened crest reads as
        // greater than one and every wave whitecaps.
        ampTotal += amp + sharp;

        // WHERE IN THE WAVE ARE WE. Summed as a vector rather than picked from
        // one component, which is the whole point: see the note by vPulse
        // below. cos and sin of each phase, weighted by how much of the sea
        // that component is, so the answer is the phase of the wave the eye
        // actually sees rather than of whichever one happens to be listed first.
        phasor += amp * vec2(c, s);
        ampFund += amp;

        float kx = k * sinTheta;
        float kz = k * cosTheta;
        // d/dphase of (amp * sin - sharp * cos(2 phase)) is amp * cos + 2 sharp
        // sin(2 phase). The horizontal terms are untouched: the harmonic moves
        // water up and down, not along.
        float dY = amp * c + 2.0 * sharp * s2;
        dXdx += -h * sinTheta * s * kx;
        dYdx += dY * kx;
        dZdx += -h * cosTheta * s * kx;
        dXdz += -h * sinTheta * s * kz;
        dYdz += dY * kz;
        dZdz += -h * cosTheta * s * kz;
    }

    vec3 tangentX = vec3(1.0 + dXdx, dYdx, dZdx);
    vec3 tangentZ = vec3(dXdz, dYdz, 1.0 + dZdz);
    vec3 objectNormal = normalize(cross(tangentZ, tangentX));

    float jacobian = (1.0 + dXdx) * (1.0 + dZdz) - dZdx * dXdz;
    float fold = clamp(1.0 - jacobian, 0.0, 1.0);
    float crest = ampTotal > 0.0001 ? waveOffset.y / ampTotal : 0.0;

    // THE FOAM HAS TO RIDE THE WAVE THE EYE SEES, and for a while it did not.
    // The pulse used to be built from aPhase[0], the first component in the
    // list, on the reasoning that the longest wave is the one that reads as
    // arriving. That held while the swell carried nearly all the height. It
    // stopped holding the moment the height was split between a 58 metre swell
    // and a 17.5 metre chop: the foam went on riding the swell while the crests
    // on screen were the chop, so the white and the wave under it were on
    // different rhythms. Measured at the break, the breaking term peaked at one
    // phase, the fold term a third of a wave later, and the residue a third of
    // a wave after that. Three signals, three timings, one wave.
    //
    // So the phase is summed as a VECTOR over all four components, weighted by
    // amplitude. Adding phases is meaningless, adding unit vectors and reading
    // the direction back is not, and it gives the phase of the combined wave
    // for free. It also comes with an amplitude: the phasor is short exactly
    // when the components disagree, which is a lull, and the foam eases off
    // there on its own.
    //
    // Handed to the fragment shader as the vector rather than as the pulses, so
    // the pulses are evaluated per PIXEL. A pulse is a power of a raised cosine
    // and interpolating one across a triangle leaves the foam edge visibly
    // faceted at column spacing, which near the camera is a dozen pixels.
    // Interpolating the vector is safe where interpolating the angle would not
    // be: the angle wraps once per wavelength and a linear blend across the
    // wrap runs backwards through the whole cycle, putting a seam in the foam
    // at every crest.
    vPulse = phasor / max(ampFund, 0.0001);

    vSurf = vec4(aShore.x, aShore.y, crest, fold);
    vFoam = vec3(position.x + waveOffset.x, position.z + waveOffset.z, aShore.z);
`;

/** Replaces `#include <begin_vertex>`. The displacement was already solved
 *  above; this is only where Three expects to find it. */
const VERTEX_POSITION = `
    vec3 transformed = position + waveOffset;
    transformed.y += aShore.w;
`;

/** Injected just after `#include <common>` in the fragment program.
 *
 *  The noise is value noise from a hash rather than a texture, which keeps the
 *  page to a single request and means there is no tile to spot. Two octaves is
 *  enough: foam wants to look torn rather than detailed, and the near water is
 *  where the pixels are. */
const FRAGMENT_HEAD = `
uniform float uTime;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uFoamColor;
uniform float uOpacityNear;
uniform float uFoamBreakThreshold;
uniform float uFoamCrestThreshold;
uniform float uFoamNoiseScale;
uniform float uFoamDrift;
uniform float uDeepReference;
uniform float uFoamLag;
uniform float uFoamTrail;
uniform float uFoamSheetLag;
uniform float uFoamSheetTrail;
varying vec4 vSurf;
varying vec3 vFoam;
varying vec2 vPulse;

/** Where the wave is, a given lag behind its crest, as a raised cosine.
 *
 *  vPulse is the amplitude-weighted phasor of the four components, so rotating
 *  it by the lag and reading the projection back is cos(phase - lag) for the
 *  combined wave. Same quantity the old per-vertex pulse computed from one
 *  component, minus the assumption that one component speaks for the whole sea.
 *
 *  The max is not paranoia. A raised cosine is in [0, 1] on paper, but a float
 *  can land a hair below zero at the trough, and pow() of a negative base is
 *  undefined in GLSL: one NaN there spreads through the foam and takes the
 *  fragment colour with it. */
float oceanPulse(vec2 wave, float lag, float trail) {
    float projection = wave.x * cos(lag) + wave.y * sin(lag);
    return pow(max(0.0, 0.5 + 0.5 * projection), trail);
}

float oceanHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float oceanNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = oceanHash(i);
    float b = oceanHash(i + vec2(1.0, 0.0));
    float c = oceanHash(i + vec2(0.0, 1.0));
    float d = oceanHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

/** Injected after `#include <map_fragment>`, which is where `diffuseColor`
 *  exists and before anything has lit it.
 *
 *  FOAM IS FOUR SIGNALS TAKEN AT THEIR MAXIMUM rather than added together.
 *  Adding them turns the whole break zone white the moment two agree; taking
 *  the maximum lets each one own the situation it is actually describing. The
 *  fold term catches the pitching crest, the break term the zone that is
 *  collapsing, the crest term the odd whitecap out in deeper water, and the bed
 *  term everything the last wave left behind on its way past. */
const FRAGMENT_BODY = `
    float depth = vSurf.x;
    float breaking = vSurf.y;
    float crest = vSurf.z;
    float fold = vSurf.w;

    float deepMix = smoothstep(0.0, uDeepReference, depth);
    vec3 waterColor = mix(uShallowColor, uDeepColor, deepMix);

    // THE GRAIN IS MIPMAPPED BY HAND. Whitewater has structure from a hand's
    // width down, and the first version drew all of it at a single scale of
    // about a metre, which in the foreground is a third of the screen across
    // and at the break line is finer than a pixel. Both ends were wrong: the
    // near water had no texture to speak of, which is most of what "the sea
    // looks soft" was, and the far water was being handed detail smaller than
    // the pixel it lands on, which does not read as detail at all. It reads as
    // a shimmer that moves when nothing in the scene has moved.
    //
    // So the fine octaves fade in as the water comes toward the camera. The
    // distances are here rather than in config because they are meaningless
    // apart from the octave multipliers beside them, and a number that can only
    // be moved together with another number should live where that one does.
    float viewDistance = distance(cameraPosition.xz, vFoam.xy);
    float midOctave = 1.0 - smoothstep(24.0, 95.0, viewDistance);
    float fineOctave = 1.0 - smoothstep(5.0, 26.0, viewDistance);

    vec2 grain = vFoam.xy * uFoamNoiseScale;
    vec2 drift = vec2(0.0, uTime * uFoamDrift);
    float n = oceanNoise(grain + drift);
    n = mix(n, 0.62 * n + 0.38 * oceanNoise(grain * 3.1 - drift * 1.7), midOctave);
    n = mix(n, 0.68 * n + 0.32 * oceanNoise(grain * 9.7 + drift * 2.6), fineOctave);

    // TORN AT THE EDGES, SOLID IN THE MIDDLE. The first version multiplied the
    // breaking signal by the noise and then thresholded it, which is the wrong
    // way round. Noise averaging about eight tenths scaled the whole surf zone
    // down before it was ever tested, so a row that was breaking hard came out
    // around four tenths white and the entire break line read as haze. Noise
    // belongs on the EDGE of the foam, taking bites out of the thin stuff and
    // leaving the thick stuff alone, because that is what a breaking wave does:
    // it is ragged where it is running out and it is opaque where it is not.
    //
    // BOTH DEPTH TERMS ARE GATED BY A PULSE, and it took getting this wrong to
    // see why it matters. Depth alone says the whole inner twenty metres is
    // breaking, and it is right, so a foam term driven by depth alone is a
    // white carpet nailed to the seabed from the surf line to the sand. It does
    // not travel, it does not arrive, and nothing about it is a wave. Only the
    // pulse makes it surf.
    // Named arriving and not active, because active is a reserved word in GLSL
    // ES 3.00, which is what Three asks for on a WebGL2 context. There is a
    // test in the suite for the whole class. (No back quotes in here: this
    // whole shader is a JavaScript template literal and one would end it.)
    float trail = oceanPulse(vPulse, uFoamLag, uFoamTrail);
    float sheet = oceanPulse(vPulse, uFoamLag + uFoamSheetLag, uFoamSheetTrail);

    float b = smoothstep(uFoamBreakThreshold, uFoamBreakThreshold + 0.45, breaking);
    float arriving = b * trail;
    float breakFoam = arriving * mix(clamp(0.35 + 0.9 * n, 0.0, 1.0), 1.0, arriving * arriving);
    // THE FOLD IS A LIP, NOT A FLASH. It is the best trigger in the file, since
    // the surface compressing past the point of folding is exactly where a real
    // wave throws whitewater, but it is a derivative and it behaves like one:
    // measured across the breaking zone it sits at zero three quarters of the
    // time and its ninety ninth percentile is 0.43. Sent through a window of
    // 0.10 to 0.55 it spent its life on the steep part of that ramp and went
    // from nothing to very nearly white in a quarter of a second, once every
    // couple of seconds. That is not surf pitching over, that is a light being
    // switched on, and it is what "glitchy when they crest" was.
    //
    // Narrowing the window made it worse, which is the useful part. A narrow
    // window is a STEEPER ramp, so the term reached white sooner and the worst
    // step per frame went up rather than down. The rate is set by the wave and
    // no reshaping of the threshold can slow it.
    //
    // So the lip rides the same pulse as everything else instead of standing
    // alone. Multiplied by trail it can only brighten where the wave front
    // already is, and its rise is the product of a fast ramp and a slow one,
    // which the slow one bounds.
    //
    // Measured over ninety seconds across the surf zone, the frame to frame
    // change in the foam: mean 0.0033 to 0.0026, 99.9th percentile 0.042 to
    // 0.039, worst single frame 0.055 to 0.057. So the typical pixel settled
    // by about a fifth and the worst one did not move. Said plainly, because
    // the honest reading is that the envelope fixed the term that was flashing
    // and the remaining worst case belongs to something else.
    float foldFoam = smoothstep(0.04, 0.30, fold) * trail * (0.55 + 0.45 * n) * 0.78;
    float crestFoam = smoothstep(uFoamCrestThreshold, 1.0, crest) * (0.4 + 0.6 * n) * 0.8;
    // The sheet the last wave left, on the broad pulse rather than the tight
    // one, so it lingers and fades where the break itself has already gone.
    float bedFoam = vFoam.z * sheet * (0.25 + 0.75 * n) * 0.85;

    float foam = clamp(max(max(breakFoam, foldFoam), max(crestFoam, bedFoam)), 0.0, 1.0);

    diffuseColor.rgb = mix(waterColor, uFoamColor, foam);
    // Thin water shows the sand under it; deep water does not. Foam is opaque
    // wherever it is, because whitewater is air and you cannot see through it.
    diffuseColor.a *= mix(uOpacityNear, 1.0, max(deepMix, foam));
`;

/** Replaces `#include <roughnessmap_fragment>`. Open water is close to a
 *  mirror and foam is close to chalk, and having one material do both is most
 *  of why the surf reads as a different substance from the water around it.
 *
 *  `foam` is the one computed in the colour block above, not a second cheaper
 *  guess at it. Three inlines every chunk into a single main() and this one
 *  runs after `map_fragment`, so the variable is simply in scope. The earlier
 *  version recomputed an approximation here, which cost a second noise fetch to
 *  arrive at a slightly different answer: the surf could then be white and
 *  glossy at the same pixel, which is exactly the seam this is meant to avoid. */
const FRAGMENT_ROUGHNESS = `
    float roughnessFactor = mix(roughness, 0.92, foam);
`;

/** Injected after `#include <opaque_fragment>`, and ONLY when the caller hands
 *  `initWater` a sky to reflect. Everything before this point is the water's own
 *  colour and the light that lands on it; this is the light that bounces off it.
 *
 *  THE SEA IS MOSTLY A MIRROR AND THIS IS THE ENTIRE MIRROR. Without it a
 *  MeshStandardMaterial has no specular at all except the punctual sun, so every
 *  pixel off the glint path falls back to `deepColor` and the band under the
 *  horizon, which should be the brightest water in the frame, comes out the
 *  darkest. Measured on specs/ocean/ocean-1.png: sky (132, 173, 197), sea
 *  (0, 11, 20) at half a degree below the eye, where Fresnel says 0.95.
 *
 *  IT GOES HERE, AFTER `opaque_fragment` AND BEFORE TONE MAPPING, on purpose.
 *  A reflection is light, so it has to be added in linear space and then
 *  survive the same filmic curve and the same fog as everything else. Put it
 *  after `colorspace_fragment` instead and the sky reflected in the sea is a
 *  different colour from the sky above it, which is the seam this exists to
 *  close, reopened one chunk further down.
 *
 *  `geometryNormal` and `geometryViewDir` are Three's own, set up in
 *  `lights_fragment_begin` and still in scope. Using them rather than a private
 *  varying means the normal here is the SAME one the lighting used, flip and
 *  all, so the mirror and the sun highlight can never disagree about which way
 *  the water is facing. That matters on this mesh: it is double sided, and the
 *  strip of sea seen from underneath near the horizon has its normal flipped. */
const FRAGMENT_REFLECT = `
    vec3 waterWorldNormal = inverseTransformDirection(geometryNormal, viewMatrix);
    vec3 waterToEye = inverseTransformDirection(geometryViewDir, viewMatrix);
    // Schlick, with R0 = 0.020 for air to water at n = 1.33. The constant is
    // not the interesting part. The fifth power is: it holds the reflection
    // near two percent for most of the frame and then runs to one in the last
    // degree or so before grazing, which is why a sea is dark at your feet and
    // silver at the horizon, and why no amount of fog could have faked this.
    float waterCosTheta = clamp(dot(waterToEye, waterWorldNormal), 0.0, 1.0);
    float waterFresnel = 0.020 + 0.980 * pow(1.0 - waterCosTheta, 5.0);
    // Whitewater is air, not glass. It scatters rather than reflects, so the
    // mirror switches off exactly where the foam switches on, and the surf goes
    // back to being the one part of the sea that is its own colour.
    waterFresnel *= 1.0 - foam;
    // AND A SHEET WITH NO WATER IN IT REFLECTS NOTHING. The sheet carries on
    // shoreward past the water's edge so the waterline always has geometry
    // beneath it, and those rows are hidden by folding the edge fade into the
    // vertex colour alpha, which Three multiplies into diffuseColor for us.
    // Without this line the mirror ignores that entirely: alpha arrives at zero
    // on a dry row and the assignment at the bottom of this block lifts it back
    // to the Fresnel value, which is 0.14 near the eye and 0.34 out at the
    // water's edge. The result is a pane of sky laid over the dry beach, and it
    // is invisible today only because nothing dry is in frame at camera.z 8.
    // It would not stay invisible.
    //
    // vColor.a IS the edge fade rather than a second copy of it, so the two
    // cannot drift. USE_COLOR_ALPHA is Three's own define, set whenever a
    // material has vertexColors and a four wide colour attribute, which is
    // exactly what applyEdgeFade builds. The guard matters because that
    // attribute is created on the first update rather than at build time, so
    // there is a window in which the varying does not exist.
#ifdef USE_COLOR_ALPHA
    waterFresnel *= vColor.a;
#endif
    // Zero, because the sun is drawn ONCE. Three's directional light at
    // roughness 0.08 already puts a tight specular lobe on the water, and that
    // lobe smeared across the wave slopes is the glint path. Reflecting the
    // disc as well would lay a second, harder sun over the first.
    vec3 waterSky = oceanSkyColor(reflect(-waterToEye, waterWorldNormal), 0.0);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, waterSky, waterFresnel);
    // Thin water shows the sand through it, but only while there is still
    // transmission to see through. At a grazing angle there is not, so the
    // shallows stop showing sand at the same rate they start showing sky.
    gl_FragColor.a = mix(gl_FragColor.a, 1.0, waterFresnel);
`;

// ---------------------------------------------------------------------------
// The THREE shell
// ---------------------------------------------------------------------------

let mesh = null;
let material = null;
let geometry = null;
let uniforms = null;
// The four colours the gloom blends between, built once. Kept beside the
// uniforms rather than read from config every frame because these are THREE
// Colors in the working space and re-parsing a hex sixty times a second to get
// the same object back is the sort of thing that never shows up in a profile
// and never should have been written either.
let palette = null;
let settings = null;
let constants = null;
let profile = null;
let rowZ = null;
let grid = null;          // { rows, cols }
let attributes = null;    // the four Float32Arrays and their BufferAttributes
let elapsed = 0;
let sinceProfile = 0;
let breaks = [];
let cycles = null;        // last seen crest count per sounding wave

/** Build the sea and add it to the scene.
 *
 *  `options.mobile` halves the grid. It is asked once and never again, because
 *  the camera never moves and the framing never changes, so there is no moment
 *  later at which the answer could become different.
 *
 *  `options.sky` is `{ uniformGlsl, glsl, uniforms }`, which is exactly what
 *  sky.js exports, and the sea reflects nothing at all without it. IT ARRIVES AS
 *  AN ARGUMENT RATHER THAN AN IMPORT so this file still knows nothing about the
 *  one next door: water.js is the piece of this experience most likely to be
 *  wanted by a second scene, and a scene that wants a lake at dusk under someone
 *  else's sky should be able to hand one over without editing anything here. The
 *  contract is a function named `oceanSkyColor(vec3 dir, float discWeight)` and
 *  the uniforms it reads. */
export function initWater(scene, config = OCEAN_CONFIG, options = {}) {
    settings = config;
    const water = config.water;
    const scale = options.mobile ? water.mobileScale : 1;
    const rows = Math.max(8, Math.round(water.rows * scale));
    const cols = Math.max(8, Math.round(water.cols * scale));
    grid = { rows, cols };

    constants = waveConstants(water.waves);
    rowZ = rowPositions(rows, config);
    profile = buildProfile(rowZ, 0, config);
    cycles = new Array(SOUNDING_WAVES).fill(null);

    geometry = buildGeometry(rows, cols, rowZ, config.beach);
    material = buildMaterial(config, options.sky || null);
    writeAttributes();

    mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'ocean';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    // Every vertex moves, so any bounding volume Three computed from the rest
    // pose is a lie. The sea fills the frame by construction and there is only
    // one of it, so there is nothing a cull could usefully save.
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;

    if (scene) scene.add(mesh);
    return mesh;
}

/** The trapezoid sheet, in its rest pose. Rows at the z values the profile was
 *  built for, columns fanning out toward the horizon. */
function buildGeometry(rows, cols, zs, beach) {
    const geo = new THREE.BufferGeometry();
    const count = rows * cols;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);

    for (let r = 0; r < rows; r++) {
        const halfWidth = halfWidthAt(zs[r], beach);
        for (let c = 0; c < cols; c++) {
            const u = cols > 1 ? c / (cols - 1) : 0.5;
            const i = (r * cols + c) * 3;
            positions[i] = (u * 2 - 1) * halfWidth;
            positions[i + 1] = 0;
            positions[i + 2] = zs[r];
            normals[i + 1] = 1;
        }
    }

    // 16 bit indices top out at 65535 vertices and the full grid is 52000, so
    // the narrower type still fits, but not by much any more. The wider type is
    // chosen rather than assumed because one more bump to rows or cols would
    // otherwise wrap the indices silently and shred the mesh.
    const IndexArray = count > 65535 ? Uint32Array : Uint16Array;
    const indices = new IndexArray((rows - 1) * (cols - 1) * 6);
    let n = 0;
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const a = r * cols + c;
            const b = a + 1;
            const d = a + cols;
            const e = d + 1;
            // WINDING MATTERS AND IT IS EASY TO GET BACKWARDS. Columns run left
            // to right in +x and rows run AWAY from the camera in -z, so the
            // obvious (a, d, b) order gives a cross product pointing at the
            // seabed. Faces then point down, the whole sea is culled from
            // above, and the only thing left on screen is the underside of
            // distant crests standing higher than the eye. Ask the suite rather
            // than the eye: there is a test that takes the cross product of the
            // first triangle and insists it points at the sky.
            indices[n++] = a; indices[n++] = b; indices[n++] = d;
            indices[n++] = b; indices[n++] = e; indices[n++] = d;
        }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    return geo;
}

/** A stock MeshStandardMaterial with the wave program grafted into it.
 *
 *  See the file header for why this is an injection rather than a ShaderMaterial
 *  written from scratch. The short version: the day cycle is coming, and this
 *  way it drives the water through Three's own lighting without the water
 *  needing to know it exists. */
function buildMaterial(config, sky = null) {
    const water = config.water;
    const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.08,
        metalness: 0.0,
        transparent: true,
        // DOUBLE SIDED, WHICH IS UNUSUAL FOR A HEIGHTFIELD and worth the note.
        // The camera sits at 1.15 metres, and offshore crests reach about the
        // same height, so a strip of sea near the horizon is genuinely seen
        // from underneath. Culling those faces punches sky-coloured holes along
        // the horizon, which is the one line in the frame the eye rests on.
        // Three flips the normal for back faces on its own, so the underside
        // lights correctly, and the extra fill is confined to that strip.
        side: THREE.DoubleSide
    });

    // The two ends of the gloom blend, built once. Re-parsing a hex sixty times
    // a second to get the same object back is the sort of thing that never shows
    // up in a profile and never should have been written either.
    palette = {
        deep: new THREE.Color(water.deepColor),
        shallow: new THREE.Color(water.shallowColor),
        stormDeep: new THREE.Color(water.stormDeepColor),
        stormShallow: new THREE.Color(water.stormShallowColor)
    };

    uniforms = {
        uTime: { value: 0 },
        uOmega: { value: new THREE.Vector4() },
        uSteepness: { value: new THREE.Vector4() },
        uKSin: { value: new THREE.Vector4() },
        uLeanGain: { value: water.leanGain },
        uDeepColor: { value: new THREE.Color(water.deepColor) },
        uShallowColor: { value: new THREE.Color(water.shallowColor) },
        uFoamColor: { value: new THREE.Color(water.foamColor) },
        uOpacityNear: { value: water.opacityNear },
        uFoamBreakThreshold: { value: water.foamBreakThreshold },
        uFoamCrestThreshold: { value: water.foamCrestThreshold },
        uFoamNoiseScale: { value: water.foamNoiseScale },
        uFoamDrift: { value: water.foamDriftSpeed },
        uFoamLag: { value: water.foamLag },
        uFoamTrail: { value: water.foamTrail },
        uFoamSheetLag: { value: water.foamSheetLag },
        uFoamSheetTrail: { value: water.foamSheetTrail },
        uDeepReference: { value: config.beach.maxDepth * 0.55 }
    };

    for (let i = 0; i < 4; i++) {
        const w = constants[i];
        const key = ['x', 'y', 'z', 'w'][i];
        uniforms.uOmega.value[key] = w ? w.omega : 0;
        uniforms.uSteepness.value[key] = w ? w.steepness : 0;
        uniforms.uKSin.value[key] = w ? w.kSin : 0;
    }

    mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        // The sky's uniforms are shared BY REFERENCE with the sky dome's own
        // material rather than copied. One write in updateSky moves both
        // programs, which is the only arrangement in which the sea can be
        // trusted to be reflecting the sky that is actually over it.
        if (sky) Object.assign(shader.uniforms, sky.uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\n' + VERTEX_HEAD)
            .replace('#include <beginnormal_vertex>', VERTEX_BODY)
            .replace('#include <begin_vertex>', VERTEX_POSITION);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\n' + FRAGMENT_HEAD
                + (sky ? sky.uniformGlsl + sky.glsl : ''))
            .replace('#include <roughnessmap_fragment>', FRAGMENT_ROUGHNESS)
            .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAGMENT_BODY);
        if (sky) {
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + FRAGMENT_REFLECT);
        }
    };

    // Two materials with identical parameters share a compiled program in
    // Three, and the cache key does not include onBeforeCompile. Nothing else
    // in the scene uses a standard material with these settings today, but a
    // shared program would be a genuinely baffling bug to meet later.
    //
    // The sky is in the key because it changes the program. Without it a page
    // that built one sea with a sky and one without would compile the first and
    // hand the same binary to the second.
    mat.customProgramCacheKey = () => (sky ? 'ocean-water-1-sky' : 'ocean-water-1');
    return mat;
}

/** Allocate the five per-vertex attributes and fill them from the profile.
 *
 *  Each value is constant along a row, so this is a row loop with an inner
 *  broadcast rather than a real per-vertex computation. The arrays are marked
 *  dynamic because they are rewritten a few times a second for the life of the
 *  page. */
function writeAttributes() {
    const { rows, cols } = grid;
    const count = rows * cols;
    if (!attributes) {
        attributes = {
            phase: new Float32Array(count * 4),
            amp: new Float32Array(count * 4),
            waveK: new Float32Array(count * 4),
            shore: new Float32Array(count * 4),
            sharp: new Float32Array(count * 4)
        };
        for (const name of ['phase', 'amp', 'waveK', 'shore', 'sharp']) {
            const attribute = new THREE.BufferAttribute(attributes[name], 4);
            attribute.setUsage(THREE.DynamicDrawUsage);
            geometry.setAttribute('a' + name.charAt(0).toUpperCase() + name.slice(1), attribute);
        }
    }
    refreshAttributes();
}

/** Push the current profile into the attribute arrays and flag them for upload.
 *
 *  The phase attribute is the only one that has to be handled carefully. It
 *  grows without bound as it integrates shoreward, and a float32 loses its
 *  fractional precision somewhere past a few hundred thousand radians, so it is
 *  wrapped into a single turn per row. That is safe because only the phase
 *  MODULO two pi is ever used, and it keeps the near rows as precise as the far
 *  ones instead of degrading toward the sand. */
function refreshAttributes() {
    const { rows, cols } = grid;
    const n = constants.length;
    const TAU = Math.PI * 2;
    const tide = tideOffset(elapsed, settings.water);

    for (let r = 0; r < rows; r++) {
        const base = r * cols * 4;
        const p0 = profile.phase[r * n];
        const p1 = n > 1 ? profile.phase[r * n + 1] : 0;
        const p2 = n > 2 ? profile.phase[r * n + 2] : 0;
        const p3 = n > 3 ? profile.phase[r * n + 3] : 0;
        const wrapped = [
            p0 - Math.floor(p0 / TAU) * TAU,
            p1 - Math.floor(p1 / TAU) * TAU,
            p2 - Math.floor(p2 / TAU) * TAU,
            p3 - Math.floor(p3 / TAU) * TAU
        ];

        for (let c = 0; c < cols; c++) {
            const i = base + c * 4;
            for (let w = 0; w < 4; w++) {
                attributes.phase[i + w] = wrapped[w];
                attributes.amp[i + w] = w < n ? profile.amp[r * n + w] : 0;
                attributes.sharp[i + w] = w < n ? profile.sharp[r * n + w] : 0;
                attributes.waveK[i + w] = w < n ? profile.k[r * n + w] : 1;
            }
            attributes.shore[i] = profile.depth[r];
            attributes.shore[i + 1] = profile.breaking[r];
            attributes.shore[i + 2] = profile.foamBed[r];
            // The tide rides in the attribute rather than moving the mesh, so
            // the sheet stays put and only the water level in it changes.
            attributes.shore[i + 3] = tide;
        }
    }

    for (const name of ['aPhase', 'aAmp', 'aWaveK', 'aShore', 'aSharp']) {
        const attribute = geometry.getAttribute(name);
        if (attribute) attribute.needsUpdate = true;
    }
    applyEdgeFade();
}

/** Hide the mesh where it is above the water line, by folding the row's edge
 *  fade into the vertex colours Three already multiplies into alpha.
 *
 *  Kept separate from `refreshAttributes` because it needs the vertex colour
 *  attribute to exist, which it only does once, and because it is the one part
 *  of the upload that is about the mesh rather than about the waves. */
function applyEdgeFade() {
    const { rows, cols } = grid;
    let colors = geometry.getAttribute('color');
    if (!colors) {
        colors = new THREE.BufferAttribute(new Float32Array(rows * cols * 4), 4);
        colors.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute('color', colors);
        material.vertexColors = true;
        material.needsUpdate = true;
    }
    const array = colors.array;
    for (let r = 0; r < rows; r++) {
        const fade = profile.edge[r];
        for (let c = 0; c < cols; c++) {
            const i = (r * cols + c) * 4;
            array[i] = 1; array[i + 1] = 1; array[i + 2] = 1;
            array[i + 3] = fade;
        }
    }
    colors.needsUpdate = true;
}

/** Advance the sea by one frame.
 *
 *  Two clocks on purpose. `uTime` runs every frame and is what actually moves
 *  the waves, and it is the only thing that has to. The profile rebuild is on
 *  its own much slower clock because everything in it is driven by the tide and
 *  the set envelope, neither of which changes measurably between frames. On a
 *  phone that is the difference between a per-frame pass over twenty eight
 *  thousand vertices and a per-frame pass over one uniform. */
export function updateWater(deltaTime, sea = CALM) {
    if (!mesh) return;
    // A tab that has been in the background hands back an enormous delta on the
    // first frame. Clamping it means the sea resumes rather than teleporting
    // through a minute of wave motion in one step.
    const dt = Math.max(0, Math.min(0.25, deltaTime));
    elapsed += dt;
    if (uniforms) uniforms.uTime.value = elapsed;

    // THE LEAN GOES EVERY FRAME AND THE SWELL GOES SIX TIMES A SECOND, and the
    // asymmetry is not an oversight. The lean is one uniform, so animating it
    // per frame is free. The swell is baked into a per row profile that costs a
    // pass over the rows and an upload, and it is a quantity that takes tens of
    // seconds to move, so putting it on the profile clock is the same trade
    // already made for the tide and the sets.
    if (uniforms && sea.lean != null) uniforms.uLeanGain.value = sea.lean;

    // THE SEA GOES GREY WITH THE SKY, and it has to be here rather than in the
    // reflection. The reflected sky already matches by construction, since it is
    // the sky's own function reading the sky's own uniforms, but it is only most
    // of the pixel near the horizon where Fresnel approaches one. Across the
    // rest of the frame the pixel is body colour, and a body colour tuned for a
    // blue afternoon under a grey lid reads as two different scenes. See
    // `water.stormDeepColor` in config for the whole account.
    if (uniforms && palette && sea.gloom > 0) {
        const g = Math.min(1, sea.gloom);
        uniforms.uDeepColor.value.copy(palette.deep).lerp(palette.stormDeep, g);
        uniforms.uShallowColor.value.copy(palette.shallow).lerp(palette.stormShallow, g);
    }

    sinceProfile += dt;
    const interval = 1 / Math.max(1, settings.water.profileHz);
    if (sinceProfile >= interval) {
        sinceProfile = 0;
        buildProfile(rowZ, elapsed, settings, profile, sea);
        refreshAttributes();
    }
    detectBreaks();
}

// THERE WAS A `surfaceAt` HERE AND IT WAS DELETED THE DAY THE BORE ARRIVED.
// It reported the still water surface, which answers "has the sea reached this
// z" and was the right question right up until the white-out needed answering
// "is there water over your head". Only broken whitewater says yes to the
// second one, and only sand.js tracks that, so `surfaceWithSwash` over there is
// now the single answer. Two functions reporting the water level from two
// modules is exactly the split that put the sky and the sea on different hours
// once already.

/** Put the sea back to its first frame, without rebuilding any of it.
 *
 *  FOR THE REPLAY, AND IT RESETS MORE THAN IT FIRST SEEMS IT SHOULD. The obvious
 *  version left the sea running and only put the story back, on the reasoning
 *  that a replay should open on a living sea rather than on one frozen at phase
 *  zero. That was a nice idea and it was wrong, because THE TIDE IS ON THIS
 *  CLOCK TOO. The tide swings the water level a quarter of a metre either way on
 *  a 560 second period, the arc is 120, and the whole storm was tuned against
 *  the tide rising through it. Leaving the clock running meant the second replay
 *  ran the storm at half tide and the third at low water, where measurably NO
 *  wave breaks over the visitor at all. A visitor pressing "watch it again" and
 *  getting a visibly weaker storm is the worst possible answer.
 *
 *  So a replay is a replay. It also makes the line on the ending card true. */
export function resetWater() {
    elapsed = 0;
    sinceProfile = 0;
    breaks = [];
    if (cycles) cycles.fill(null);
    if (profile && rowZ) {
        buildProfile(rowZ, 0, settings, profile);
        refreshAttributes();
    }
    if (uniforms) uniforms.uTime.value = 0;
}

/** Notice when a crest reaches the break line, so the sound and the sight agree.
 *
 *  The break line is a row, and the accumulated phase at that row is known, so
 *  the phase of any component AT the break is a subtraction. Every time that
 *  phase passes another multiple of two pi, one more crest has arrived there.
 *  Counting the turns rather than watching for a peak means nothing is missed
 *  if a frame runs long, and nothing fires twice if two frames run short.
 *
 *  Only the two longest components get a voice. The short ones are chop riding
 *  on the back of the long ones and giving each of them a crash would turn the
 *  beach into a rattle. */
function detectBreaks() {
    const row = breakRow(profile);
    if (row < 0) {
        cycles.fill(null);
        return;
    }
    const n = constants.length;
    const TAU = Math.PI * 2;

    for (let i = 0; i < Math.min(SOUNDING_WAVES, n); i++) {
        const phase = profile.phase[row * n + i] - constants[i].omega * elapsed;
        const turn = Math.floor(phase / TAU);
        const previous = cycles[i];
        cycles[i] = turn;
        // First sight of this component, or the break line jumped rows as the
        // tide moved. Either way there is no arrival to report, only a new
        // reference point.
        if (previous === null || Math.abs(turn - previous) > 2) continue;
        if (turn >= previous) continue;

        // Strength is this component's share of what is actually breaking,
        // which folds in both the set envelope and the shoaling, so a set wave
        // is louder than a lull wave without anything saying so directly.
        const amp = profile.amp[row * n + i];
        const total = totalAmpAt(row);
        const strength = clamp(0.25 + 1.6 * (total > EPSILON ? amp / total : 0) * profile.breaking[row], 0, 1);
        // The surf runs the whole width of the frame, so where a given wave
        // sounds loudest drifts rather than sitting in the centre. Derived from
        // the wave's own phase so it moves with the water rather than randomly.
        const pan = Math.sin(phase * 0.37 + i * 2.1) * 0.6;
        breaks.push({ strength, pan, row, distance: settings.beach.shoreZ - rowZ[row] });
    }
}

function totalAmpAt(row) {
    const n = constants.length;
    let total = 0;
    for (let i = 0; i < n; i++) total += profile.amp[row * n + i];
    return total;
}

/** The waves that reached the break line since the last call, and clears them.
 *
 *  THE SEAM WITH audio.js. Each entry is ready to hand straight to
 *  `playBreak(strength, pan)`. It is a queue rather than a callback so the
 *  frame loop stays in charge of ordering, and so a muted or suspended page can
 *  drain and discard without the water knowing anything about sound. */
export function consumeBreaks() {
    const out = breaks;
    breaks = [];
    return out;
}

/** How far out the surf is breaking right now, in metres from the water line.
 *  Reported for tuning: it is much easier to say "the break is at 22 metres and
 *  it should be at 16" than to argue about a screenshot. */
export function breakDistance() {
    if (!profile) return 0;
    const row = breakRow(profile);
    return row < 0 ? 0 : settings.beach.shoreZ - rowZ[row];
}

export function getWaterMesh() { return mesh; }
export function getProfile() { return profile; }
export function getElapsed() { return elapsed; }

/** Give every GPU resource back. Called on teardown, and safe to call twice. */
export function disposeWater() {
    if (mesh && mesh.parent) mesh.parent.remove(mesh);
    if (geometry) geometry.dispose();
    if (material) material.dispose();
    mesh = null;
    geometry = null;
    material = null;
    uniforms = null;
    palette = null;
    attributes = null;
    profile = null;
    rowZ = null;
    grid = null;
    constants = null;
    cycles = null;
    breaks = [];
    elapsed = 0;
    sinceProfile = 0;
}

export const __test__ = {
    GRAVITY, SOUNDING_WAVES, clamp, smoothstep, totalAmpAt, detectBreaks,
    VERTEX_HEAD, VERTEX_BODY, VERTEX_POSITION, FRAGMENT_HEAD, FRAGMENT_BODY,
    FRAGMENT_ROUGHNESS, FRAGMENT_REFLECT,
    setElapsed: (v) => { elapsed = v; },
    state: () => ({ grid, profile, constants, rowZ, uniforms, attributes, cycles })
};
