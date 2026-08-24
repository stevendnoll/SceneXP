// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * lightning.js - The strikes, the flash they throw, and the bolts they draw.
 *
 * THREE THINGS THAT LOOK LIKE ONE. A strike is a schedule (when), a flash (a
 * brightness that lights the cloud and the sea), and sometimes a bolt (geometry).
 * They are separable and worth separating: most real lightning is a flash with no
 * visible channel at all, because the channel is inside the cloud or behind it,
 * and a scene that draws a bolt for every flash reads as a cartoon.
 *
 * THE FLASH IS THE PART THAT DOES THE WORK AND THE BOLT IS THE PART PEOPLE ASK
 * FOR. Worth knowing in that order. A sky that lights up from within is
 * unmistakable at any distance and costs four instructions; a bolt is a fractal,
 * a ribbon, and a buffer. Both are here, and the flash is what the arc leans on
 * early, with bolts arriving as the storm closes.
 *
 * IT LIGHTS THE SEA FOR FREE, which is the one genuinely lucky thing about where
 * this sits. The flash term lives in `SKY_GLSL`, and that function is compiled
 * into the water's fragment shader as well as the dome's, so a flash that
 * brightens the cloud is reflected by every wave facing it without this file
 * knowing the sea exists. What it adds on top is a directional light, so the
 * strike also puts a glint path on the water pointing back at itself.
 *
 * ---------------------------------------------------------------------------
 * THE FLASH RATE IS CAPPED AND THE CAP IS NOT A STYLE CHOICE.
 * ---------------------------------------------------------------------------
 *
 * Real lightning flickers. A single strike is typically three or four return
 * strokes about fifty milliseconds apart, which is twenty flashes a second, and
 * twenty hertz sits in the middle of the band most likely to provoke a seizure in
 * a photosensitive viewer. WCAG 2.3.1 asks for no more than three general flashes
 * in any one second, and a general flash is a luminance change this scene very
 * much clears: the flash covers the whole sky and most of the sea.
 *
 * So the flicker is not reproduced. Every flash in this file, including the
 * second stroke of a double, is held at least `minGapSeconds` from the one before
 * it, which puts a hard ceiling under three per second no matter what the arc
 * asks for or what the random draw returns. `flashesPerSecondCeiling` states that
 * ceiling as a number and there is a test that beats on the scheduler for the
 * length of the arc and checks it holds.
 *
 * THAT IS THE DEFAULT AND NOT THE REDUCED MOTION PATH, deliberately. Putting the
 * safe version behind a setting protects the people who have already found the
 * setting, and a first time visitor having a bad time is the case that matters.
 * A double flash a third of a second apart still reads unmistakably as lightning,
 * because a real strike with a distinct second stroke looks exactly like that.
 * `prefers-reduced-motion` then goes further again: one stroke, a quarter of the
 * amplitude, and an attack slow enough to be a swell rather than a snap.
 *
 * PURE CORE, THIN SHELL, matching water.js, sky.js and sand.js. Everything above
 * the THREE section is arithmetic on plain numbers and plain arrays: the
 * schedule, the envelope, the fractal, and the ribbon are all testable without a
 * browser, which for a thing that happens for a quarter of a second at a time is
 * the difference between tuning it and guessing at it.
 */

import { OCEAN_CONFIG } from './config.min.js';
import { curveAt } from './storm.min.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Small vector helpers, on plain arrays
// ---------------------------------------------------------------------------
//
// Plain arrays rather than THREE.Vector3 because the whole fractal runs in the
// pure half of this file and must not need a browser to be exercised. There are
// six of them and they are all three lines.

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
];

/** A unit vector, or a stated fallback when the input has no length.
 *
 *  The fallback is not defensive padding. The fractal takes perpendiculars of
 *  segments, and a segment can be reduced to nothing by an unlucky pair of
 *  offsets. Normalising that gives three NaNs, NaNs propagate into the vertex
 *  buffer, and a single NaN vertex takes out the WHOLE DRAW CALL rather than one
 *  triangle. A bolt that quietly fails to appear is far harder to find than one
 *  that draws a short straight segment. */
function normalize(a, fallback = [0, 1, 0]) {
    const l = len(a);
    return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : fallback;
}

// ---------------------------------------------------------------------------
// The pure core: when strikes happen
// ---------------------------------------------------------------------------

/** Strikes per second at a given point in the arc.
 *
 *  Uses storm.js's own curve reader rather than a fourth hand written one, which
 *  is what the note on `curveAt` asks any later curve to do. */
export function strikeRateAt(seconds, config = OCEAN_CONFIG) {
    return curveAt(seconds, config.storm.lightning.rate, config.storm);
}

/** The hard ceiling on flashes per second that `minGapSeconds` buys.
 *
 *  Stated as a function rather than left implicit in the config, because it is
 *  the number the accessibility claim in the header rests on and a claim nobody
 *  can evaluate is not a claim. Anyone lowering `minGapSeconds` should watch this
 *  go above three and stop. */
export function flashesPerSecondCeiling(config = OCEAN_CONFIG) {
    const gap = config.storm.lightning.minGapSeconds;
    return gap > 0 ? 1 / gap : Infinity;
}

/** What the next strike costs, as a draw from the unit exponential.
 *
 *  THE RATE CHANGES THROUGH THE ARC, WHICH RULES OUT THE OBVIOUS DESIGN, and the
 *  obvious design is what this was first. Drawing a gap in SECONDS from the rate
 *  at the moment of drawing, then waiting that long, is correct only for a rate
 *  that never moves. Here the rate ramps up from exactly zero, so the first draw
 *  after it left zero was taken at a rate of about a millionth and returned a gap
 *  of 4e28 seconds. Nothing rechecked it, so the storm scheduled its first strike
 *  for a trillion times the age of the universe away and the scene had no
 *  lightning in it at all.
 *
 *  The fix is to spend rate rather than to wait out time. This returns a
 *  THRESHOLD, the caller accumulates `rate * delta` against it, and a strike
 *  happens when the accumulation catches up. That is exactly an inhomogeneous
 *  Poisson process, it costs one multiply and one add per frame, and it has the
 *  property the naive version lacked: a rate that is zero contributes nothing and
 *  a rate that rises later still arrives on time.
 *
 *  The mean is 1, so at a steady rate of one a second a strike lands about every
 *  second, and the gaps have no preferred length. That last part is what makes
 *  lightning feel unscheduled: strikes clump and then leave a hole. A fixed
 *  interval with jitter on it reads as a metronome however much jitter there is.
 *
 *  `random` is injected, matching `entryPhase` in sky.js. */
export function drawStrikeThreshold(random = Math.random) {
    // Guarded against random() returning exactly 1, which would be a log of zero.
    const u = Math.min(1 - 1e-12, Math.max(0, random()));
    return -Math.log(1 - u);
}

/** One flash's brightness at `dt` seconds after it began, 0 to 1.
 *
 *  Fast up and slow down, like the wash envelope in storm.js and for the same
 *  reason: that is the shape of the event. The decay is quadratic rather than
 *  exponential SO THAT IT REACHES EXACTLY ZERO. An exponential leaves a
 *  percentage of the flash on the screen forever, which on a sky this dark reads
 *  as the storm having a permanent glow in it, and it is the bug storm.js
 *  documents having already hit once in `washEnvelope`. */
export function flashPulse(dt, cfg) {
    if (!(dt >= 0)) return 0;
    if (dt < cfg.attackSeconds) {
        return cfg.attackSeconds > 0 ? dt / cfg.attackSeconds : 1;
    }
    const k = (dt - cfg.attackSeconds) / cfg.decaySeconds;
    if (k >= 1) return 0;
    const f = 1 - k;
    return f * f;
}

/** The brightest of a list of flashes at time `t`.
 *
 *  THE MAX AND NOT THE SUM, for two reasons that happen to agree. Two strokes
 *  overlapping would otherwise stack to twice the peak, which is both wrong
 *  physically, since the second stroke is not brighter than the first, and the
 *  one case where a rate limit on flashes could still deliver a brightness spike.
 *  `flashes` is a list of `{ at, power }` in the same clock as `t`. */
export function flashLevelAt(t, flashes, cfg) {
    let best = 0;
    for (let i = 0; i < flashes.length; i++) {
        const f = flashes[i];
        const v = f.power * flashPulse(t - f.at, cfg);
        if (v > best) best = v;
    }
    return best;
}

/** Where a strike happens and when its flashes land.
 *
 *  `now` is the arc clock, `lastFlashAt` the time of the most recent flash
 *  already scheduled or shown, which is what the minimum gap is measured from.
 *  Everything random is drawn through `random` so a test can pin the lot.
 *
 *  THE GAP IS MEASURED FROM THE LAST FLASH, NOT FROM THE LAST STRIKE, and that
 *  distinction is the whole safety property. A strike is a group of one or two
 *  flashes, so spacing STRIKES apart still allows the second stroke of one and
 *  the first of the next to land back to back. Measuring flash to flash means the
 *  ceiling holds across the boundary between strikes as well as inside one. */
export function planStrike(now, lastFlashAt, random = Math.random,
    config = OCEAN_CONFIG, soft = false) {
    const cfg = config.storm.lightning;
    const reduced = cfg.reduced;
    const gap = cfg.minGapSeconds;

    // The first flash may not crowd whatever came before it.
    const first = Math.max(now, lastFlashAt + gap);
    const flashes = [{ at: first, power: 1 }];

    // A second return stroke, sometimes, and never closer than the gap. Off
    // entirely under reduced motion, where one soft swell is the whole event.
    const chance = soft ? reduced.strokeChance : cfg.strokeChance;
    if (random() < chance) {
        const wanted = first + cfg.strokeGapSeconds;
        flashes.push({ at: Math.max(wanted, first + gap), power: cfg.secondStrokePower });
    }

    // Where it is. Azimuth is degrees off straight out to sea, and the spread is
    // DELIBERATELY WIDER THAN THE FRAME: a strike behind your shoulder that only
    // shows as a flash is most of what a storm actually does, and it costs
    // nothing to allow because the bolt simply is not drawn.
    const azimuth = (random() * 2 - 1) * cfg.azimuthDegrees * DEG;

    // How far out. The arc walks the draw from the far end of the range to the
    // near end, so the storm closes in rather than merely getting busier.
    const approach = curveAt(now, cfg.approach, config.storm)
        + (random() * 2 - 1) * cfg.approachSpread;
    const t = Math.max(0, Math.min(1, approach));
    const distance = cfg.farMetres + (cfg.nearMetres - cfg.farMetres) * t;

    // Whether there is a channel to see. Off frame strikes never draw one, and
    // even in frame most distant flashes have no visible channel.
    const inFrame = Math.abs(azimuth) < cfg.boltAzimuthDegrees * DEG;
    // A CURVE RATHER THAN A NUMBER, because the tsunami needs the frame. See the
    // note in config: the flash rate carries on, so the sky still lights the wall
    // as it comes in, but the channels thin out so there is one thing to look at
    // rather than two competing.
    const drawBolt = inFrame && random() < curveAt(now, cfg.boltChance, config.storm);

    return { flashes, azimuth, distance, drawBolt };
}

/** A unit vector pointing from the eye toward a strike.
 *
 *  Elevation comes from the cloud base and the distance rather than being drawn,
 *  because the flash has to light the cloud that the bolt comes out of and the
 *  two disagreeing is visible immediately. Azimuth matches sky.js: degrees from
 *  straight out to sea, which is -Z, positive turning toward +X. */
export function strikeDirection(azimuth, distance, config = OCEAN_CONFIG) {
    const height = config.storm.lightning.bolt.baseHeightMetres;
    const horizontal = Math.max(1, distance);
    const v = [
        horizontal * Math.sin(azimuth),
        height,
        -horizontal * Math.cos(azimuth)
    ];
    return normalize(v, [0, 1, 0]);
}

// ---------------------------------------------------------------------------
// The pure core: what a bolt looks like
// ---------------------------------------------------------------------------

/** A random vector perpendicular to `dir`, of length `amount`.
 *
 *  Built from a basis rather than by rejection sampling, so it costs the same
 *  every call and can never loop. `dir` is assumed unit. */
function perpendicularOffset(dir, amount, random) {
    // Any axis not parallel to dir. Picking the one dir points at LEAST along
    // keeps the cross product well conditioned.
    const away = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const p1 = normalize(cross(dir, away), [1, 0, 0]);
    const p2 = normalize(cross(dir, p1), [0, 0, 1]);
    const angle = random() * TAU;
    return add(scale(p1, Math.cos(angle) * amount), scale(p2, Math.sin(angle) * amount));
}

/** The channel, as a list of segments, by midpoint displacement.
 *
 *  THE CLASSIC FRACTAL AND IT IS THE RIGHT ONE. Start with one segment from the
 *  cloud base to the water. Split it at the middle, shove the middle sideways by
 *  a random amount, and repeat on both halves with half the shove. After six
 *  passes there are sixty four segments in the trunk and the displacement has
 *  fallen from tens of metres to under one, which is what produces the
 *  characteristic look: large scale wander, small scale jitter, and the same
 *  statistics at every zoom.
 *
 *  BRANCHES ARE THE OTHER HALF AND THEY ONLY LOOK RIGHT IN THE MIDDLE PASSES.
 *  Branching on the first pass gives two trunks and no main channel. Branching on
 *  the last gives fuzz, because the children are then too short to be subdivided
 *  by anything and come out as straight whiskers. `branchFrom` and `branchTo`
 *  confine it to the passes where a child is still long enough to develop
 *  structure of its own, since a branch is pushed back into the working set and
 *  is subdivided by every remaining pass exactly like the trunk.
 *
 *  A branch heads DOWNWARD and away, never back up: it is drawn from the parent's
 *  own direction turned by up to `branchSpreadDegrees`, and gravity is not the
 *  reason, the reason is that these are stepped leaders working toward the water
 *  and an upward branch reads as a mistake.
 *
 *  Returns `{ segments, truncated }`. Segments carry a generation, which the
 *  ribbon turns into width and brightness so the trunk reads as the trunk. */
export function generateBolt(from, to, random = Math.random, config = OCEAN_CONFIG) {
    const cfg = config.storm.lightning.bolt;
    let segments = [{ a: from, b: to, generation: 0 }];
    let jitter = cfg.jitterMetres;
    let truncated = false;

    for (let pass = 0; pass < cfg.iterations; pass++) {
        const next = [];
        const branching = pass >= cfg.branchFrom && pass <= cfg.branchTo;
        for (let i = 0; i < segments.length; i++) {
            const s = segments[i];
            const span = sub(s.b, s.a);
            const dir = normalize(span, [0, -1, 0]);
            // Smaller features on the branches, so they read as thinner rather
            // than as equally important channels that happen to be shorter.
            const shove = jitter * Math.pow(cfg.branchJitterDecay, s.generation);
            const m = add(mid(s.a, s.b), perpendicularOffset(dir, shove, random));
            next.push({ a: s.a, b: m, generation: s.generation });
            next.push({ a: m, b: s.b, generation: s.generation });

            if (branching && s.generation < cfg.branchGenerations
                && next.length + segments.length < cfg.maxSegments
                && random() < cfg.branchChance) {
                const turn = perpendicularOffset(dir, Math.tan(
                    cfg.branchSpreadDegrees * DEG) * (0.4 + random() * 0.6), random);
                const away = normalize(add(dir, turn), dir);
                const reach = len(span) * cfg.branchLength * (0.6 + random() * 0.8);
                next.push({ a: m, b: add(m, scale(away, reach)),
                    generation: s.generation + 1 });
            }
        }
        segments = next;
        jitter *= cfg.jitterDecay;
        // A HARD STOP, because branching compounds. Each pass doubles the set and
        // then adds branches to it, so an unlucky seed at a high branch chance
        // grows faster than the doubling alone. Better a bolt with slightly less
        // detail than a frame that allocates for a second.
        if (segments.length >= cfg.maxSegments) {
            segments.length = cfg.maxSegments;
            truncated = true;
            break;
        }
    }
    return { segments, truncated };
}

/** Turn segments into a triangle ribbon facing the eye.
 *
 *  WHY A RIBBON AND NOT LINES. A GL line is one pixel wide on every platform that
 *  matters, because `linewidth` has been ignored by every desktop driver for
 *  years. One pixel of lightning on a high density display is a scratch, and it
 *  cannot glow, so the thing everybody actually recognises, a blinding core with
 *  light bleeding off it, is unreachable. Six vertices per segment gets both: an
 *  opaque centre line and two edges that fall to nothing.
 *
 *  THE BILLBOARD IS COMPUTED ONCE, ON THE CPU, AND THAT IS ONLY LEGAL BECAUSE THE
 *  CAMERA NEVER MOVES. Normally facing a ribbon at the eye is a vertex shader's
 *  job, since it changes as the camera does. Here `camera.position` is fixed for
 *  the life of the page, so the perpendicular can be baked into the buffer at
 *  generation time and the bolt costs nothing per frame but a draw call. If this
 *  scene ever gains a moving camera, THIS is the function that breaks, and it
 *  will break by the bolts turning edge on and vanishing rather than by erroring.
 *
 *  WIDTH IS ANGULAR RATHER THAN METRIC, which is a deliberate departure from
 *  perspective. A channel is only a few centimetres across, so a true to life
 *  width at four hundred metres is far under a pixel and the bolt disappears.
 *  Scaling the width with distance holds it at a constant size on screen, which
 *  is what a photograph of lightning looks like anyway, because the glow around
 *  the channel is what is being photographed rather than the channel.
 *
 *  Writes into caller supplied arrays and returns how much it used, so the
 *  buffers can be allocated once and reused for every strike of the visit. */
export function boltRibbon(segments, eye, positions, brights, powers, indices,
    config = OCEAN_CONFIG) {
    const cfg = config.storm.lightning.bolt;
    let v = 0;      // vertices written
    let n = 0;      // indices written

    for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        if ((v + 6) * 3 > positions.length || n + 12 > indices.length) break;

        const centre = mid(s.a, s.b);
        const toEye = sub(eye, centre);
        const distance = Math.max(1, len(toEye));
        const along = normalize(sub(s.b, s.a), [0, -1, 0]);
        // Perpendicular to the segment AND to the view, which is the direction
        // the ribbon has to open along to face the eye.
        const side = normalize(cross(along, normalize(toEye, [0, 0, 1])), [1, 0, 0]);

        const generation = s.generation;
        const fade = Math.pow(cfg.branchDim, generation);
        const half = distance * cfg.widthRadians * Math.pow(cfg.branchThin, generation);

        const base = v;
        // Three vertices at each end: one edge, the core, the other edge.
        for (const point of [s.a, s.b]) {
            const l = sub(point, scale(side, half));
            const r = add(point, scale(side, half));
            positions[v * 3] = l[0]; positions[v * 3 + 1] = l[1]; positions[v * 3 + 2] = l[2];
            brights[v] = 0; powers[v] = fade; v++;
            positions[v * 3] = point[0]; positions[v * 3 + 1] = point[1]; positions[v * 3 + 2] = point[2];
            brights[v] = 1; powers[v] = fade; v++;
            positions[v * 3] = r[0]; positions[v * 3 + 1] = r[1]; positions[v * 3 + 2] = r[2];
            brights[v] = 0; powers[v] = fade; v++;
        }

        // Four triangles: edge to core, core to edge, on both halves of the quad.
        const [al, ac, ar, bl, bc, br] = [base, base + 1, base + 2, base + 3, base + 4, base + 5];
        indices[n++] = al; indices[n++] = ac; indices[n++] = bl;
        indices[n++] = bl; indices[n++] = ac; indices[n++] = bc;
        indices[n++] = ac; indices[n++] = ar; indices[n++] = bc;
        indices[n++] = bc; indices[n++] = ar; indices[n++] = br;
    }
    return { vertices: v, indices: n };
}

/** Where a strike starts and where it ends, in world metres.
 *
 *  The top is the cloud base and is usually well out of frame: at four hundred
 *  metres out and four hundred up the top of the channel is forty five degrees
 *  above the horizon and the frame stops at twenty. That is not a problem to be
 *  fixed, it is what lightning looks like. You see the part of it that is between
 *  the sea and the top of your field of view, which is the part that reads as
 *  enormous precisely because the top is missing. */
export function strikeEndpoints(azimuth, distance, config = OCEAN_CONFIG) {
    const cfg = config.storm.lightning.bolt;
    const x = distance * Math.sin(azimuth);
    const z = -distance * Math.cos(azimuth);
    return {
        from: [x, cfg.baseHeightMetres, z],
        // Ends at mean sea level. The water there stands higher than that
        // through most of the storm, so the foot of the channel goes behind a
        // wave rather than stopping in mid air, which the depth test handles.
        to: [x, 0, z]
    };
}

// ---------------------------------------------------------------------------
// The THREE shell
// ---------------------------------------------------------------------------

const BOLT_VERTEX = `
attribute float aBright;
attribute float aPower;
varying float vBright;
varying float vPower;
void main() {
    vBright = aBright;
    vPower = aPower;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** The bolt's program.
 *
 *  NO TONE MAPPING AND NO COLOUR SPACE CHUNK, WHICH IS THE OPPOSITE OF WHAT THE
 *  SKY DOES, and the difference is the blend mode. The sky REPLACES what is in
 *  the frame buffer, so it has to go through the same curve and the same encode
 *  as everything else or the horizon becomes a seam. This ADDS to a frame buffer
 *  that has already been tone mapped and encoded by the sky and the sea, so
 *  running the bolt through the curve as well would be a second encode on top of
 *  a first one and the channel would come out grey. Adding straight sRGB is what
 *  every additive glow does, and for a light source it is also the right answer:
 *  the core saturates the buffer to white, which is exactly what a channel that
 *  is briefly hotter than the surface of the sun does to a camera. */
const BOLT_FRAGMENT = `
uniform vec3 uBoltColor;
uniform vec3 uBoltCoreColor;
uniform float uBoltIntensity;
varying float vBright;
varying float vPower;
void main() {
    // Squared, so the glow falls away from the core rather than ramping
    // linearly, and the eye reads a channel with light around it instead of a
    // flat band.
    float glow = vBright * vBright;
    float core = pow(vBright, 12.0);
    vec3 c = uBoltColor * glow + uBoltCoreColor * core;
    gl_FragColor = vec4(c * (vPower * uBoltIntensity), 1.0);
}
`;

let sceneRef = null;
let settings = null;
let skyUniforms = null;
let boltMesh = null;
let boltGeometry = null;
let boltMaterial = null;
let boltPositions = null;
let boltBrights = null;
let boltPowers = null;
let boltIndices = null;
let flashLight = null;
let eye = [0, 0, 0];
let randomFn = Math.random;
let softMotion = false;

// The live strike. Null between strikes, which is most of the arc.
let strike = null;
let clock = 0;              // the arc clock, as this file last saw it
let lastFlashAt = -Infinity;
// The Poisson accumulator. `credit` is the integral of the strike rate since the
// last strike and `threshold` is what it has to reach. See drawStrikeThreshold
// for why this is spent rather than waited out.
let credit = 0;
let threshold = 0;
// A distance pinned by `forceStrike`, for a screenshot pass. Cleared as soon as
// it is used, so it can never quietly hold the whole storm at one distance.
let forcedDistance = null;

/** How the flash is shaped right now, which reduced motion changes wholesale. */
function envelope() {
    const cfg = settings.storm.lightning;
    return softMotion ? cfg.reduced : cfg;
}

/** Build the bolt mesh, its buffers, and the light a strike throws.
 *
 *  EVERY BUFFER IS ALLOCATED ONCE, HERE, and never grows. A strike happens up to
 *  three times a second at the peak of the arc and allocating a fresh geometry
 *  for each one would hand the collector a steady stream of typed arrays during
 *  the busiest ten seconds in the scene. `setDrawRange` is what lets one fixed
 *  buffer draw a bolt of any size, including none at all.
 *
 *  THE LIGHT IS CREATED NOW AND LEFT AT ZERO, which matters more than it looks.
 *  Three keys its compiled programs on how many lights are in the scene, so
 *  adding one when the first strike lands would recompile the water's shader, the
 *  sand's, and the sky's, mid arc, on the frame of a flash. That is a stall of
 *  tens of milliseconds exactly when the scene is least able to afford one. */
export function initLightning(scene, camera, config = OCEAN_CONFIG, options = {}) {
    settings = config;
    sceneRef = scene;
    randomFn = options.random || Math.random;
    skyUniforms = (options.sky && options.sky.uniforms) || null;
    softMotion = Boolean(options.reducedMotion);
    if (camera && camera.position) {
        eye = [camera.position.x, camera.position.y, camera.position.z];
    }
    resetLightning();

    const cfg = config.storm.lightning;
    const max = cfg.bolt.maxSegments;
    boltPositions = new Float32Array(max * 6 * 3);
    boltBrights = new Float32Array(max * 6);
    boltPowers = new Float32Array(max * 6);
    boltIndices = new Uint16Array(max * 12);

    boltGeometry = new THREE.BufferGeometry();
    boltGeometry.setAttribute('position', new THREE.BufferAttribute(boltPositions, 3));
    boltGeometry.setAttribute('aBright', new THREE.BufferAttribute(boltBrights, 1));
    boltGeometry.setAttribute('aPower', new THREE.BufferAttribute(boltPowers, 1));
    boltGeometry.setIndex(new THREE.BufferAttribute(boltIndices, 1));
    boltGeometry.setDrawRange(0, 0);

    boltMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uBoltColor: { value: new THREE.Color(cfg.bolt.glowColor) },
            uBoltCoreColor: { value: new THREE.Color(cfg.bolt.coreColor) },
            uBoltIntensity: { value: 0 }
        },
        vertexShader: BOLT_VERTEX,
        fragmentShader: BOLT_FRAGMENT,
        blending: THREE.AdditiveBlending,
        // DOUBLE SIDED, AND NOT AS A SHRUG. The ribbon is built to face the eye,
        // so in principle every quad is front on, but whether a given quad's
        // winding comes out clockwise depends on which way its segment happened
        // to point relative to the perpendicular. Under the default front side
        // culling roughly half the segments of any given bolt would be discarded,
        // and the failure looks like a channel with pieces missing rather than
        // like a bug. A ribbon of light has no back face to cull anyway.
        side: THREE.DoubleSide,
        // Reads depth so a wave in front of the strike hides the foot of it, and
        // writes none so the bolt never occludes anything itself.
        depthWrite: false,
        depthTest: true,
        transparent: true,
        // The channel is a light source rather than a lit surface, so haze
        // should not paint it the colour of the horizon. Distance dimming is
        // handled by the strike's own brightness instead.
        fog: false
    });

    boltMesh = new THREE.Mesh(boltGeometry, boltMaterial);
    boltMesh.name = 'lightning';
    boltMesh.frustumCulled = false;
    boltMesh.visible = false;
    if (scene) scene.add(boltMesh);

    // The flash on the sea. A directional light rather than a point one: at four
    // hundred metres the difference in falloff across the visible water is under
    // a percent, and a directional light is what gives the specular lobe a clean
    // glint path pointing back at the strike.
    flashLight = new THREE.DirectionalLight(new THREE.Color(cfg.lightColor), 0);
    flashLight.name = 'lightningFlash';
    if (scene) scene.add(flashLight);

    return boltMesh;
}

/** Put the strikes back to the beginning, without touching the buffers.
 *
 *  Called by `initLightning` and by a replay. The scene's replay resets the sea
 *  and the sand so the storm runs against the same tide it was tuned on, and a
 *  storm that came back with its lightning half way through its schedule would
 *  be the same class of fault. */
export function resetLightning() {
    strike = null;
    clock = 0;
    credit = 0;
    threshold = drawStrikeThreshold(randomFn);
    lastFlashAt = -Infinity;
    forcedDistance = null;
    if (boltGeometry) boltGeometry.setDrawRange(0, 0);
    if (boltMesh) boltMesh.visible = false;
    if (flashLight) flashLight.intensity = 0;
    if (skyUniforms && skyUniforms.uFlash) skyUniforms.uFlash.value = 0;
}

/** Build the geometry for a strike that has one. */
function buildBolt(current) {
    const { from, to } = strikeEndpoints(current.azimuth, current.distance, settings);
    const { segments } = generateBolt(from, to, randomFn, settings);
    const used = boltRibbon(segments, eye, boltPositions, boltBrights, boltPowers,
        boltIndices, settings);
    boltGeometry.attributes.position.needsUpdate = true;
    boltGeometry.attributes.aBright.needsUpdate = true;
    boltGeometry.attributes.aPower.needsUpdate = true;
    boltGeometry.index.needsUpdate = true;
    boltGeometry.setDrawRange(0, used.indices);
    current.hasGeometry = used.indices > 0;
}

/** Advance the storm's electricity by one frame.
 *
 *  `seconds` is the arc clock rather than an accumulated delta, so a replay or a
 *  jump with `oceanSetArc` lands the lightning where the rest of the scene is
 *  rather than leaving it running on a clock of its own. */
export function updateLightning(seconds, config = OCEAN_CONFIG) {
    if (!settings || !skyUniforms) return 0;
    const cfg = settings.storm.lightning;
    const env = envelope();
    const previous = clock;
    clock = Number.isFinite(seconds) ? seconds : previous;

    // A jump backwards is a replay or a screenshot pass, and the schedule has to
    // go with it rather than holding an accumulator built against a clock that
    // no longer exists.
    if (clock < previous) {
        strike = null;
        credit = 0;
        threshold = drawStrikeThreshold(randomFn);
        lastFlashAt = -Infinity;
    }

    // SPEND THE RATE, DO NOT WAIT OUT A GAP. See drawStrikeThreshold. The delta
    // is clamped for the same reason main.js clamps the arc's own: a tab coming
    // back from the background should not deliver a minute of accumulated storm
    // in a single frame.
    const rate = strikeRateAt(clock, settings);
    credit += Math.max(0, Math.min(0.25, clock - previous)) * Math.max(0, rate);

    // Due, and nothing already on screen. One strike at a time is not a
    // limitation worth lifting: the flash covers the whole sky, so a second one
    // underneath it is invisible, and it is the rate limit's simplest guarantee.
    if (credit >= threshold && (!strike || clock > strike.endsAt)) {
        strike = planStrike(clock, lastFlashAt, randomFn, settings, softMotion);
        if (forcedDistance != null) {
            strike.distance = forcedDistance;
            strike.drawBolt = Math.abs(strike.azimuth) < cfg.boltAzimuthDegrees * DEG;
            forcedDistance = null;
        }
        lastFlashAt = strike.flashes[strike.flashes.length - 1].at;
        strike.endsAt = lastFlashAt + env.attackSeconds + env.decaySeconds;
        strike.hasGeometry = false;
        if (strike.drawBolt) buildBolt(strike);
        credit = 0;
        threshold = drawStrikeThreshold(randomFn);
    }

    let level = 0;
    if (strike) {
        level = flashLevelAt(clock, strike.flashes, env);
        if (clock > strike.endsAt) strike = null;
    }

    // Distant strikes are dimmer, which is the only distance cue a flash has.
    // Inverse rather than inverse square: the flash is lighting a cloud deck that
    // extends most of the way to it, not a point.
    const reach = strike
        ? cfg.referenceMetres / Math.max(cfg.referenceMetres, strike.distance) : 1;
    const flash = level * reach * (softMotion ? cfg.reduced.gain : 1);

    skyUniforms.uFlash.value = flash * cfg.skyGain;
    if (strike && skyUniforms.uFlashDir) {
        const dir = strikeDirection(strike.azimuth, strike.distance, settings);
        skyUniforms.uFlashDir.value.set(dir[0], dir[1], dir[2]);
    }
    if (flashLight) {
        flashLight.intensity = flash * cfg.lightIntensity;
        if (strike) {
            const dir = strikeDirection(strike.azimuth, strike.distance, settings);
            flashLight.position.set(dir[0], dir[1], dir[2]).multiplyScalar(400);
        }
    }
    if (boltMaterial && boltMesh) {
        const lit = strike && strike.hasGeometry ? flash * cfg.bolt.intensity : 0;
        boltMaterial.uniforms.uBoltIntensity.value = lit;
        boltMesh.visible = lit > 0.001;
    }
    return flash;
}

/** Fire a strike on the next frame, for a screenshot pass.
 *
 *  A STRIKE LASTS THREE HUNDRED MILLISECONDS AND QA HERE IS SCREENSHOT DRIVEN,
 *  which makes catching one by waiting a genuinely poor use of an afternoon.
 *  This tops up the accumulator rather than building a strike directly, so the
 *  forced one goes through exactly the same path as a real one, INCLUDING the
 *  minimum gap. A debug hook that could produce a flash the rate limiter would
 *  not have allowed is a debug hook that can lie to you about the thing the rate
 *  limiter exists for.
 *
 *  Takes an optional distance in metres, so the near and far ends of the range
 *  can both be photographed without waiting for the arc to offer them. */
export function forceStrike(distanceMetres = null) {
    if (!settings) return false;
    credit = Math.max(credit, threshold);
    if (distanceMetres != null) forcedDistance = Number(distanceMetres) || null;
    return true;
}

export function disposeLightning() {
    if (sceneRef) {
        if (boltMesh) sceneRef.remove(boltMesh);
        if (flashLight) sceneRef.remove(flashLight);
    }
    if (boltGeometry) boltGeometry.dispose();
    if (boltMaterial) boltMaterial.dispose();
    boltMesh = null;
    boltGeometry = null;
    boltMaterial = null;
    boltPositions = null;
    boltBrights = null;
    boltPowers = null;
    boltIndices = null;
    flashLight = null;
    sceneRef = null;
    settings = null;
    skyUniforms = null;
    strike = null;
    clock = 0;
    credit = 0;
    threshold = 0;
    lastFlashAt = -Infinity;
}

/** Test seam, matching water.js and sky.js. Not used by the page. */
export const __lightning = {
    state: () => ({ strike, clock, credit, threshold, lastFlashAt, boltMesh, flashLight,
        boltGeometry, softMotion })
};
