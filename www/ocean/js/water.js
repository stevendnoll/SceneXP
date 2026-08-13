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

// ---------------------------------------------------------------------------
// The pure core: depth, dispersion, shoaling, breaking
// ---------------------------------------------------------------------------

/** The seabed height at a given z, in metres, with still water at zero.
 *
 *  Out to sea (z below `shoreZ`) this is negative and gets more negative on the
 *  configured slope until it flattens off at `maxDepth`. Shoreward of the water
 *  line it keeps climbing on the same slope, which is the dry beach, and is why
 *  the sand mesh can be built from this same function rather than from a second
 *  set of numbers that would drift out of step with it. */
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
 *  faceted and the first thing to raise if the near water looks coarse. */
export function rowPositions(rows, beach = OCEAN_CONFIG.beach, bias = OCEAN_CONFIG.water.rowBias) {
    const out = new Float32Array(rows);
    const span = beach.farZ - beach.nearZ;
    for (let i = 0; i < rows; i++) {
        const t = rows > 1 ? i / (rows - 1) : 0;
        out[i] = beach.nearZ + span * Math.pow(t, bias);
    }
    return out;
}

/** Half the width of the mesh at row parameter t, 0 nearest the camera.
 *
 *  A trapezoid rather than a rectangle. The camera's field of view is a wedge,
 *  so a rectangular sheet would either waste most of its near columns off the
 *  sides of the screen or run out of width at the horizon. */
export function halfWidthAt(t, beach = OCEAN_CONFIG.beach) {
    return beach.nearHalfWidth + (beach.farHalfWidth - beach.nearHalfWidth) * t;
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
export function buildProfile(rowZ, elapsed, config = OCEAN_CONFIG, out = null) {
    const { beach, water } = config;
    const rows = rowZ.length;
    const constants = waveConstants(water.waves);
    const n = constants.length;
    const tide = tideOffset(elapsed, water);

    const p = out || {
        depth: new Float32Array(rows),
        breaking: new Float32Array(rows),
        foamBed: new Float32Array(rows),
        edge: new Float32Array(rows),
        phase: new Float32Array(rows * n),
        amp: new Float32Array(rows * n),
        k: new Float32Array(rows * n)
    };

    const envelope = [];
    for (let i = 0; i < n; i++) envelope.push(envelopeAt(elapsed, i, water));

    // Whitewater carries shoreward and thins out. The length scale is derived
    // from `foamPersistence` rather than being its own number, so there is one
    // knob for "how far does the foam run" instead of two that can disagree.
    const foamDecayMetres = 4 + 40 * water.foamPersistence;

    const carried = new Float32Array(n);   // accumulated phase per component
    let foam = 0;
    let previousZ = rowZ[rows - 1];

    // From the horizon inward: index counts down because row 0 is the row
    // nearest the camera and the waves arrive from the far end.
    for (let r = rows - 1; r >= 0; r--) {
        const z = rowZ[r];
        const step = z - previousZ;   // positive: we are moving shoreward
        previousZ = z;

        const depth = depthAt(z, tide, beach, water);
        p.depth[r] = depth;

        // Above the water line: no wave, no foam, nothing to draw.
        if (depth <= 0) {
            p.breaking[r] = 0;
            p.foamBed[r] = 0;
            p.edge[r] = 0;
            for (let i = 0; i < n; i++) {
                p.phase[r * n + i] = carried[i];
                p.amp[r * n + i] = 0;
                p.k[r * n + i] = constants[i].k0;
            }
            continue;
        }

        let breakingWeight = 0;
        let ampTotal = 0;

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

            // Grow the wave as it shallows, then cap it at what the depth can
            // physically carry. `shoalGain` blends between no shoaling at all
            // and the full Green's law answer, which is the dial for how
            // dramatically waves stand up on their way in.
            const ks = shoalingAt(k, depth, w.c0);
            const grown = w.amplitude * envelope[i] * (1 + water.shoalGain * (ks - 1));

            // How hard this component is breaking, measured on the height it
            // WANTS to be rather than the height it ends up with, since the cap
            // below is precisely the consequence of breaking.
            const breaking = breakAmount(grown * 2, depth, water);

            // Cap the height at what the depth can carry, but round the corner
            // rather than cutting it. A hard min creases the sea along one row;
            // an asymptotic cap like tanh has the opposite problem, and it is a
            // worse one: tanh is already eight percent below the identity at
            // half the ceiling, so every wave is quietly flattened long before
            // it breaks and the moment of STANDING UP, which is the single most
            // watchable thing a wave does, never happens. A smooth minimum is
            // exactly the ceiling far from it and exactly the wave everywhere
            // else, with the blend confined to the last third.
            const ceiling = (water.breakRatio * depth) / 2;
            const amp = smoothMin(grown, ceiling, ceiling * 0.3);

            p.amp[r * n + i] = amp;
            ampTotal += amp;
            breakingWeight += breaking * amp;
        }

        const breaking = ampTotal > EPSILON ? clamp(breakingWeight / ampTotal, 0, 1) : 0;
        p.breaking[r] = breaking;

        // Foam left behind. Whatever is breaking here tops the bed up, and
        // whatever was carried from further out decays over the step. This is
        // the cheap stand-in for advecting a foam field, and it gets the thing
        // that matters: whitewater exists shoreward of where it was made, not
        // only exactly on the wave that made it.
        foam = Math.max(breaking, foam * Math.exp(-Math.abs(step) / foamDecayMetres));
        p.foamBed[r] = foam;

        // Fade the sheet out over the last few centimetres rather than ending
        // it on a hard geometric edge against the sand.
        p.edge[r] = smoothstep(0, 0.35, depth);
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
uniform float uFoamLag;
uniform float uFoamTrail;
varying vec4 vSurf;
varying vec4 vFoam;
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

        waveOffset.x += h * sinTheta * c;
        waveOffset.z += h * cosTheta * c;
        waveOffset.y += amp * s;
        ampTotal += amp;

        float kx = k * sinTheta;
        float kz = k * cosTheta;
        dXdx += -h * sinTheta * s * kx;
        dYdx += amp * c * kx;
        dZdx += -h * cosTheta * s * kx;
        dXdz += -h * sinTheta * s * kz;
        dYdz += amp * c * kz;
        dZdz += -h * cosTheta * s * kz;
    }

    vec3 tangentX = vec3(1.0 + dXdx, dYdx, dZdx);
    vec3 tangentZ = vec3(dXdz, dYdz, 1.0 + dZdz);
    vec3 objectNormal = normalize(cross(tangentZ, tangentX));

    float jacobian = (1.0 + dXdx) * (1.0 + dZdz) - dZdx * dXdz;
    float fold = clamp(1.0 - jacobian, 0.0, 1.0);
    float crest = ampTotal > 0.0001 ? waveOffset.y / ampTotal : 0.0;

    // The foam pulse rides the longest component, which is the one that reads
    // as arriving. A raised cosine rather than a sawtooth on the wrapped phase:
    // a sawtooth has a discontinuity once per wavelength, and interpolating
    // across it puts a hard seam in the foam at every crest, which is precisely
    // where nobody should be looking at a seam.
    float foamPhase = aPhase[0] + uKSin[0] * position.x - uOmega[0] * uTime;
    // The max is not paranoia. A raised cosine is in [0, 1] on paper, but a
    // float can land a hair below zero at the trough, and pow() of a negative
    // base is undefined in GLSL: one NaN there spreads through the foam term
    // and takes the fragment colour with it.
    float trail = pow(max(0.0, 0.5 + 0.5 * cos(foamPhase - uFoamLag)), uFoamTrail);

    vSurf = vec4(aShore.x, aShore.y, crest, fold);
    vFoam = vec4(position.x + waveOffset.x, position.z + waveOffset.z, aShore.z, trail);
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
varying vec4 vSurf;
varying vec4 vFoam;

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

    vec2 grain = vFoam.xy * uFoamNoiseScale;
    float n = oceanNoise(grain + vec2(0.0, uTime * uFoamDrift));
    n = 0.65 * n + 0.35 * oceanNoise(grain * 2.7 - vec2(0.0, uTime * uFoamDrift * 1.6));

    float breakFoam = smoothstep(uFoamBreakThreshold, 1.0, breaking * (0.45 + 0.75 * n));
    float foldFoam = smoothstep(0.12, 0.7, fold) * (0.55 + 0.45 * n);
    float crestFoam = smoothstep(uFoamCrestThreshold, 1.0, crest) * (0.4 + 0.6 * n) * 0.8;
    // The depth answer, gated by the pulse travelling with the crest. Without
    // the second factor this term alone paints the inner zone permanently white.
    float bedFoam = vFoam.z * vFoam.w * (0.25 + 0.75 * n) * 0.9;

    float foam = clamp(max(max(breakFoam, foldFoam), max(crestFoam, bedFoam)), 0.0, 1.0);

    diffuseColor.rgb = mix(waterColor, uFoamColor, foam);
    // Thin water shows the sand under it; deep water does not. Foam is opaque
    // wherever it is, because whitewater is air and you cannot see through it.
    diffuseColor.a *= mix(uOpacityNear, 1.0, max(deepMix, foam));
`;

/** Replaces `#include <roughnessmap_fragment>`. Open water is close to a
 *  mirror and foam is close to chalk, and having one material do both is most
 *  of why the surf reads as a different substance from the water around it. */
const FRAGMENT_ROUGHNESS = `
    float roughnessFactor = roughness;
    {
        vec2 g = vFoam.xy * uFoamNoiseScale;
        float fn = oceanNoise(g + vec2(0.0, uTime * uFoamDrift));
        float f = clamp(max(smoothstep(uFoamBreakThreshold, 1.0, vSurf.y * (0.45 + 0.75 * fn)),
                            max(smoothstep(0.12, 0.7, vSurf.w), vFoam.z * vFoam.w * 0.85)), 0.0, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.92, f);
    }
`;

// ---------------------------------------------------------------------------
// The THREE shell
// ---------------------------------------------------------------------------

let mesh = null;
let material = null;
let geometry = null;
let uniforms = null;
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
 *  later at which the answer could become different. */
export function initWater(scene, config = OCEAN_CONFIG, options = {}) {
    settings = config;
    const water = config.water;
    const scale = options.mobile ? water.mobileScale : 1;
    const rows = Math.max(8, Math.round(water.rows * scale));
    const cols = Math.max(8, Math.round(water.cols * scale));
    grid = { rows, cols };

    constants = waveConstants(water.waves);
    rowZ = rowPositions(rows, config.beach, water.rowBias);
    profile = buildProfile(rowZ, 0, config);
    cycles = new Array(SOUNDING_WAVES).fill(null);

    geometry = buildGeometry(rows, cols, rowZ, config.beach);
    material = buildMaterial(config);
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
        const t = rows > 1 ? r / (rows - 1) : 0;
        const halfWidth = halfWidthAt(t, beach);
        for (let c = 0; c < cols; c++) {
            const u = cols > 1 ? c / (cols - 1) : 0.5;
            const i = (r * cols + c) * 3;
            positions[i] = (u * 2 - 1) * halfWidth;
            positions[i + 1] = 0;
            positions[i + 2] = zs[r];
            normals[i + 1] = 1;
        }
    }

    // 16 bit indices top out at 65535 vertices and the full grid is 28500, so
    // the narrower type is safe here. It is asserted rather than assumed
    // because raising `water.rows` past about 400 would silently wrap.
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
function buildMaterial(config) {
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
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\n' + VERTEX_HEAD)
            .replace('#include <beginnormal_vertex>', VERTEX_BODY)
            .replace('#include <begin_vertex>', VERTEX_POSITION);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\n' + FRAGMENT_HEAD)
            .replace('#include <roughnessmap_fragment>', FRAGMENT_ROUGHNESS)
            .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAGMENT_BODY);
    };

    // Two materials with identical parameters share a compiled program in
    // Three, and the cache key does not include onBeforeCompile. Nothing else
    // in the scene uses a standard material with these settings today, but a
    // shared program would be a genuinely baffling bug to meet later.
    mat.customProgramCacheKey = () => 'ocean-water-1';
    return mat;
}

/** Allocate the four per-vertex attributes and fill them from the profile.
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
            shore: new Float32Array(count * 4)
        };
        for (const name of ['phase', 'amp', 'waveK', 'shore']) {
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

    for (const name of ['aPhase', 'aAmp', 'aWaveK', 'aShore']) {
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
export function updateWater(deltaTime) {
    if (!mesh) return;
    // A tab that has been in the background hands back an enormous delta on the
    // first frame. Clamping it means the sea resumes rather than teleporting
    // through a minute of wave motion in one step.
    const dt = Math.max(0, Math.min(0.25, deltaTime));
    elapsed += dt;
    if (uniforms) uniforms.uTime.value = elapsed;

    sinceProfile += dt;
    const interval = 1 / Math.max(1, settings.water.profileHz);
    if (sinceProfile >= interval) {
        sinceProfile = 0;
        buildProfile(rowZ, elapsed, settings, profile);
        refreshAttributes();
    }
    detectBreaks();
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
    setElapsed: (v) => { elapsed = v; },
    state: () => ({ grid, profile, constants, rowZ, uniforms, attributes, cycles })
};
