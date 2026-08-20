// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * sky.js - The sky, the sun, and the day it belongs to.
 *
 * THIS FILE IS THE WATER'S LIGHT SOURCE. It draws a dome, but that is the small
 * half of its job. The large half is that `SKY_GLSL` below is compiled into the
 * water's own fragment shader as well, so the sea reflects exactly the sky that
 * is over it rather than a second approximation of it. One function, two
 * programs, one set of uniforms shared by reference between the two materials.
 *
 * WHY THAT MATTERS MORE THAN IT SOUNDS. Water is close to a mirror, so nearly
 * everything the eye reads as the colour of the sea is the sky bouncing off it,
 * and the closer to the horizon the more completely so: Fresnel reflectance at
 * a degree below the eye is about 0.95. Before this file existed the sea had no
 * environment to reflect at all, so the band under the horizon fell back to
 * `deepColor` and measured (0, 11, 20) against a sky of (132, 173, 197). The
 * horizon was a hard black seam. See the note on `sky` in config.js.
 *
 * THE CYCLE IS SLOW AND THE ENTRY POINT IS RANDOM, which is the opposite of the
 * usual arrangement and is a deliberate choice recorded in config.js under
 * `cycle`. The short version: a fast day cycle makes the sky the fastest moving
 * thing in a scene built on a horizon that never moves.
 *
 * PURE CORE, THIN SHELL, the same division water.js uses. Everything above the
 * THREE section is arithmetic on plain numbers and is exercised directly by the
 * suite. THREE appears only in the last third.
 */

import { OCEAN_CONFIG } from './config.min.js';

/** Radians per degree. */
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// The pure core: the day as a number, and what the sky looks like at it
// ---------------------------------------------------------------------------

/** A phase brought back into [0, 1), for any input including negatives.
 *
 *  The cycle wraps, so every consumer below can assume its argument is in range
 *  and none of them has to think about it again. */
export function wrapPhase(phase) {
    if (!Number.isFinite(phase)) return 0;
    return phase - Math.floor(phase);
}

/** Move the day on by `deltaSeconds`.
 *
 *  Separate from `wrapPhase` only so the caller never has to know the cycle
 *  length, which lives in config and should stay there.
 *
 *  A CYCLE OF ZERO SECONDS MEANS HELD, and that is the case config ships today.
 *  It reads as a special case and it is the honest one: a day that takes no time
 *  to pass is not a day passing infinitely fast, it is a day that does not pass.
 *  This used to divide by 1 instead, purely as a guard against dividing by zero,
 *  which would have spun the sky through a full day every second the moment
 *  anyone tried to hold it. Non-finite input is held too, for the same reason. */
export function advancePhase(phase, deltaSeconds, cycle = OCEAN_CONFIG.cycle) {
    const seconds = cycle.seconds;
    if (!Number.isFinite(seconds) || seconds <= 0) return wrapPhase(phase);
    return wrapPhase(phase + deltaSeconds / seconds);
}

/** Where this visit starts, drawn from the weighted windows in config.
 *
 *  `random` is injected rather than reached for, so the suite can pin it and so
 *  a future "share this exact sky" link has somewhere to plug in.
 *
 *  THE WEIGHTS ARE OVER WINDOWS, NOT OVER POINTS, so the result is continuous
 *  inside each window. A list of named times of day would put every visitor on
 *  one of a dozen skies and the repeat visit would show the same one back. */
export function entryPhase(random = Math.random, cycle = OCEAN_CONFIG.cycle) {
    const windows = cycle.entry;
    if (!windows || windows.length === 0) return wrapPhase(random());

    let total = 0;
    for (let i = 0; i < windows.length; i++) total += Math.max(0, windows[i].weight);
    if (total <= 0) return wrapPhase(random());

    let pick = random() * total;
    for (let i = 0; i < windows.length; i++) {
        const weight = Math.max(0, windows[i].weight);
        if (pick < weight || i === windows.length - 1) {
            const w = windows[i];
            return wrapPhase(w.from + (w.to - w.from) * random());
        }
        pick -= weight;
    }
    return wrapPhase(random());
}

/** Split a packed 0xRRGGBB into three channels in 0..1, still in sRGB.
 *
 *  Deliberately NOT converted to linear here. Interpolating two skies in linear
 *  light is the physically defensible thing to do and it looks wrong: the
 *  midpoint between a deep blue zenith and an orange horizon comes out muddy
 *  and dark, because linear interpolation follows the straight line between two
 *  points and perceptual space is not straight. Blending in sRGB keeps the
 *  midpoints as bright as the ends, which is what a real sky does as it turns. */
export function unpackColor(hex) {
    return [
        ((hex >> 16) & 0xff) / 255,
        ((hex >> 8) & 0xff) / 255,
        (hex & 0xff) / 255
    ];
}

/** Blend two packed colours, returning three channels in 0..1 sRGB. */
export function mixColor(a, b, t) {
    const ca = unpackColor(a);
    const cb = unpackColor(b);
    return [
        ca[0] + (cb[0] - ca[0]) * t,
        ca[1] + (cb[1] - ca[1]) * t,
        ca[2] + (cb[2] - ca[2]) * t
    ];
}

/** The two keyframes either side of a phase, and how far between them it is.
 *
 *  THE LIST WRAPS AND THERE IS NO KEYFRAME AT 1.0. Past the last entry the
 *  second key is the first one, one turn later, which is what closes the day
 *  into a loop. Duplicating the first key at the end would work until somebody
 *  edited one copy, which is the sort of bug that shows up as a one frame flash
 *  at midnight and gets blamed on the renderer. */
export function bracketKeys(phase, keys) {
    const p = wrapPhase(phase);
    const last = keys.length - 1;

    if (keys.length === 1) return { from: keys[0], to: keys[0], t: 0 };

    for (let i = 0; i < last; i++) {
        if (p >= keys[i].at && p < keys[i + 1].at) {
            const span = keys[i + 1].at - keys[i].at;
            return { from: keys[i], to: keys[i + 1], t: span > 0 ? (p - keys[i].at) / span : 0 };
        }
    }

    // Past the last key, or before the first one. Both are the wrap.
    const from = keys[last];
    const to = keys[0];
    const span = 1 - from.at + to.at;
    const along = p >= from.at ? p - from.at : 1 - from.at + p;
    return { from, to, t: span > 0 ? along / span : 0 };
}

/** Darken a sky state toward the storm palette, 0 clear and 1 fully overcast.
 *
 *  A SECOND AXIS THROUGH THE SAME KEYFRAMES, not a second set of them. The day
 *  has eleven hours in it and the arc has a storm building through one of them,
 *  and writing eleven more keyframes for "the same hour but overcast" would be
 *  eleven more chances for the two lists to drift apart. Blending toward one
 *  palette gives the storm at any hour for the price of one table, which also
 *  means it still works if the held sun is ever moved.
 *
 *  THE SUN DOES NOT MOVE AND THAT IS THE POINT. Only the light it delivers goes,
 *  because that is what an overcast sky does: the sun is still up there and you
 *  simply cannot see it any more. Keeping the direction means the water's
 *  specular lobe stays where it was and the sea goes flat and grey rather than
 *  going dark, which is the difference between a storm and a sunset. */
export function applyGloom(state, gloom, sky = OCEAN_CONFIG.sky) {
    const g = Math.max(0, Math.min(1, gloom || 0));
    if (g <= 0 || !sky.storm) return state;
    const s = sky.storm;
    const lerp = (a, b) => a + (b - a) * g;
    const blend = (from, to) => {
        const target = unpackColor(to);
        return [lerp(from[0], target[0]), lerp(from[1], target[1]), lerp(from[2], target[2])];
    };
    return {
        ...state,
        // The disc itself is left alone. It is drawn behind the cloud and the
        // cloud is what hides it, so fading the disc as well would take it out
        // twice and leave a bright patch of sky with no sun in it.
        sunIntensity: lerp(state.sunIntensity, state.sunIntensity * s.sunIntensityScale),
        // Everything the sun puts into the SKY, as opposed to onto the water.
        // One number for four uniforms, because a cloud thick enough to hide the
        // disc hides the halo around it too and they cannot disagree.
        sunGlow: lerp(1, s.sunGlowScale, g),
        zenith: blend(state.zenith, s.zenith),
        horizon: blend(state.horizon, s.horizon),
        hemiSky: blend(state.hemiSky, s.hemiSky),
        hemiGround: blend(state.hemiGround, s.hemiGround),
        hemiIntensity: lerp(state.hemiIntensity, state.hemiIntensity * s.hemiIntensityScale),
        cloudColor: blend(state.cloudColor, s.cloudColor),
        cloudOpacity: lerp(state.cloudOpacity, s.cloudOpacity),
        cloudCoverage: lerp(sky.cloud.coverage, s.cloudCoverage),
        // Only the outer edge. See config: the inner one clamps the projection
        // divisor and moving it is what brings the horizon shimmer back.
        cloudFadeTo: lerp(sky.cloud.horizonFadeTo, s.cloudFadeTo),
        // THE STORM BASE, which exists at all only because of this line: it is
        // the one part of the sky with no clear weather equivalent, so the gloom
        // does not darken it, it brings it into being.
        shelfOpacity: lerp(0, s.shelfOpacity),
        // BOTH EDGES MOVE HERE, unlike the sheet above, and moving them is the
        // storm arriving. The base walks down out of the top of the frame until
        // the only light left in the sky is the strip along the horizon. Nothing
        // clamps a divisor on these: see the note in `skyShelf`.
        shelfFadeFrom: lerp(sky.shelf.horizonFadeFrom, s.shelfFadeFrom),
        shelfFadeTo: lerp(sky.shelf.horizonFadeTo, s.shelfFadeTo),
        // A SPEED, NOT A POSITION. `updateSky` integrates it. See the note there
        // for why multiplying an elapsed time by this would lurch.
        driftSpeed: lerp(state.driftSpeed, state.driftSpeed * s.driftSpeedScale),
        exposure: lerp(state.exposure, s.exposure)
    };
}

/** The whole look of the sky at a given phase, as plain numbers.
 *
 *  Angles in degrees, colours as three channels in 0..1 sRGB, intensities as
 *  they go to the lights. Nothing here knows THREE exists, which is the point:
 *  this is the function the suite can hold to a standard, and everything below
 *  it is plumbing. */
export function skyStateAt(phase, sky = OCEAN_CONFIG.sky) {
    const { from, to, t } = bracketKeys(phase, sky.keys);
    const lerp = (a, b) => a + (b - a) * t;

    return {
        // Clear sky by default. `applyGloom` is what moves these, and carrying
        // them here means `applyState` has one place to read them from whether
        // there is a storm on or not.
        cloudCoverage: sky.cloud.coverage,
        cloudFadeTo: sky.cloud.horizonFadeTo,
        sunGlow: 1,
        // No storm base at all under a clear sky, and the fade edges carry the
        // ends of the ramp the gloom walks down from. See `applyGloom`.
        shelfOpacity: 0,
        shelfFadeFrom: sky.shelf.horizonFadeFrom,
        shelfFadeTo: sky.shelf.horizonFadeTo,
        driftSpeed: sky.cloud.driftSpeed,
        name: t < 0.5 ? from.name : to.name,
        elevation: lerp(from.elevation, to.elevation),
        azimuth: lerp(from.azimuth, to.azimuth),
        sunColor: mixColor(from.sunColor, to.sunColor, t),
        sunIntensity: lerp(from.sunIntensity, to.sunIntensity),
        zenith: mixColor(from.zenith, to.zenith, t),
        horizon: mixColor(from.horizon, to.horizon, t),
        hemiSky: mixColor(from.hemiSky, to.hemiSky, t),
        hemiGround: mixColor(from.hemiGround, to.hemiGround, t),
        hemiIntensity: lerp(from.hemiIntensity, to.hemiIntensity),
        cloudColor: mixColor(from.cloudColor, to.cloudColor, t),
        cloudOpacity: lerp(from.cloudOpacity, to.cloudOpacity),
        exposure: lerp(from.exposure, to.exposure)
    };
}

/** A unit vector pointing from the eye toward the sun.
 *
 *  Azimuth is degrees from straight out to sea, which is -Z, positive turning
 *  toward +X. Elevation is degrees above the horizon and goes negative at
 *  night, which is how the disc takes itself out of the sky without anything
 *  needing to switch it off. */
export function sunDirectionAt(elevationDegrees, azimuthDegrees) {
    const el = elevationDegrees * DEG;
    const az = azimuthDegrees * DEG;
    const horizontal = Math.cos(el);
    return {
        x: horizontal * Math.sin(az),
        y: Math.sin(el),
        z: -horizontal * Math.cos(az)
    };
}

/** Fresnel reflectance of water at a given angle, by Schlick.
 *
 *  Not used by the renderer, which does this in GLSL, and kept here because it
 *  is the number the whole design rests on and it deserves to be assertable.
 *  `cosTheta` is the cosine of the angle between the view ray and the surface
 *  normal, so 1 is straight down into the water and 0 is along the surface.
 *
 *  R0 is 0.020 for air to water at n = 1.33, and the point of the function is
 *  that it does not stay there: at 88 degrees off the normal it is 0.87, and by
 *  90 it is 1. That climb is the whole reason the sea is bright at the horizon
 *  and dark at your feet. */
export function fresnelWater(cosTheta, r0 = 0.020) {
    const c = Math.min(1, Math.max(0, cosTheta));
    const f = Math.pow(1 - c, 5);
    return r0 + (1 - r0) * f;
}

/** How much of the sun's halo survives at a given elevation, 1 to 0.
 *
 *  THE DISC TAKES ITSELF OUT OF THE SKY AT NIGHT AND THE HALO DOES NOT, which is
 *  the whole reason this exists. The disc is gated on the view ray being above
 *  the horizon, so a sun that has set simply is not drawn. The glow is a smooth
 *  falloff over tens of degrees, so a sun twelve degrees under still lights most
 *  of the sky in front of it. With the night keyframe's own sky at 0.004 of
 *  linear and its sun colour still the warm one left over from dawn, the halo
 *  came out TWENTY TIMES the sky it was added to, and midnight rendered a flat
 *  warm brown: (123, 65, 49) where it should have been nearly black and blue.
 *
 *  So the halo fades out over twilight, which is also what the real one does.
 *  The sun is level at 0 degrees, civil twilight runs to -6 and nautical to -12,
 *  and past the end of nautical there is no glow left to see. The ramp here runs
 *  from -12 to -1, so sunset keeps its full glow, dusk at -5 keeps two thirds of
 *  it, which is the afterglow, and night keeps none. */
export function twilightGlow(elevationDegrees) {
    const t = Math.min(1, Math.max(0, (elevationDegrees + 12) / 11));
    return t * t * (3 - 2 * t);
}

/** One sRGB channel in 0..1, brought back to linear light. */
export function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** One linear channel in 0..1, encoded back to sRGB. The inverse of the above.
 *
 *  THIS IS THE STAGE THAT KEEPS GETTING LEFT OUT, and it has now cost two rounds
 *  of tuning on the storm palette. It is what `<colorspace_fragment>` does to
 *  every pixel on its way to the screen, because `renderer.outputColorSpace` is
 *  sRGB, and it is the LAST thing that happens rather than the first. */
export function linearToSrgb(c) {
    return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Three's ACES filmic curve, run on the CPU. Linear in, linear out.
 *
 *  THIS EXISTS BECAUSE OF THE ORDER THREE APPLIES FOG IN, and the reason is
 *  worth the twenty lines. Fog is the LAST thing in the fragment program, after
 *  tone mapping and after the colour space encode, which means `fogColor` is not
 *  a colour in the scene, it is a colour on the screen: whatever a surface fades
 *  to is that value shown literally. So handing it the sky's horizon colour is
 *  wrong. The sky itself does not appear on screen as its own colour, it appears
 *  as its colour through the filmic curve, and the far water would have faded
 *  toward something the sky above it never renders as.
 *
 *  The gap is not academic. At the day horizon the sky renders (191, 205, 214)
 *  where the raw colour is (175, 202, 221), and under a sunset (229, 129, 69)
 *  against (228, 112, 63), because ACES compresses a saturated colour far harder
 *  than a pale one. Either way it is sixteen or seventeen levels in one channel,
 *  laid down exactly along the horizon, which is the one line in the frame this
 *  whole file exists to keep clean.
 *
 *  CAREFUL: this is a copy of a curve that lives in the renderer, so it is only
 *  true while `renderer.toneMapping` is ACESFilmic. Change that in main.js and
 *  this has to change with it, or the seam comes back with no other symptom.
 *  There is a test that pins the two to each other by the numbers above. */
export function toneMapACES(rgbLinear, exposure = 1) {
    const s = exposure / 0.6;
    let r = rgbLinear[0] * s;
    let g = rgbLinear[1] * s;
    let b = rgbLinear[2] * s;

    // Into the ACES working space.
    let x = 0.59719 * r + 0.35458 * g + 0.04823 * b;
    let y = 0.07600 * r + 0.90834 * g + 0.01566 * b;
    let z = 0.02840 * r + 0.13383 * g + 0.83777 * b;

    const fit = (v) => (v * (v + 0.0245786) - 0.000090537)
        / (v * (0.983729 * v + 0.4329510) + 0.238081);
    x = fit(x);
    y = fit(y);
    z = fit(z);

    // And back out of it.
    r = 1.60475 * x - 0.53108 * y - 0.07367 * z;
    g = -0.10208 * x + 1.10813 * y - 0.00605 * z;
    b = -0.00327 * x - 0.07276 * y + 1.07602 * z;

    const clamp01 = (v) => Math.min(1, Math.max(0, v));
    return [clamp01(r), clamp01(g), clamp01(b)];
}

/** What a packed 0xRRGGBB colour in this sky ACTUALLY LOOKS LIKE, as three
 *  bytes on the screen. The whole pipeline, in the order the GPU runs it.
 *
 *  WRITE THIS DOWN ONCE SO NOBODY HAS TO REMEMBER IT AGAIN. Every colour handed
 *  to the sky is a pipeline input rather than a screen value, and there are FOUR
 *  stages between the two, not three:
 *
 *      hex -> srgbToLinear -> exposure and ACES -> linearToSrgb -> screen
 *
 *  The storm palette has been solved backwards through this twice. The first
 *  attempt skipped the first stage and wrote screen colours directly, which
 *  rendered a grey lid as near black. The second caught that and still stopped
 *  one stage short of the encode, which put every colour about forty seven
 *  levels ABOVE its target and shipped a storm sky no darker than the clear one.
 *  See the note in `sky.storm` for the measurements both times.
 *
 *  Solving the other way, from a target to a hex, has no closed form worth
 *  writing because ACES mixes the channels: a per channel bisection overshoots a
 *  grey by about twelve levels. Iterate on all three together against this. */
export function shownColor(hex, exposure = 1) {
    return toneMapACES(unpackColor(hex).map(srgbToLinear), exposure)
        .map((c) => Math.round(linearToSrgb(c) * 255));
}

// ---------------------------------------------------------------------------
// The shared sky program
// ---------------------------------------------------------------------------

/** The uniform block, as GLSL. Declared once and injected into both programs,
 *  so a uniform can never exist in one and not the other. */
export const SKY_UNIFORM_GLSL = `
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCloudColor;
uniform float uSkyGradientPower;
uniform float uSunDiscCos;
uniform float uSunLimbCos;
uniform float uSunDiscStrength;
uniform float uSunGlowPower;
uniform float uSunGlowStrength;
uniform float uSunAureolePower;
uniform float uSunAureoleStrength;
uniform float uCloudOpacity;
uniform float uCloudScale;
uniform float uCloudStretch;
uniform float uCloudCoverage;
uniform float uCloudSoftness;
uniform float uCloudFadeFrom;
uniform float uCloudFadeTo;
uniform float uCloudSunlitMix;
uniform vec2 uCloudDrift;
uniform vec3 uShelfLight;
uniform vec3 uShelfDark;
uniform float uShelfOpacity;
uniform float uShelfScale;
uniform float uShelfStretch;
uniform float uShelfCoverage;
uniform float uShelfSoftness;
uniform float uShelfDepth;
uniform float uShelfWarp;
uniform float uShelfFadeFrom;
uniform float uShelfFadeTo;
uniform vec2 uShelfDrift;
uniform vec3 uFlashColor;
uniform vec3 uFlashDir;
uniform float uFlash;
uniform float uFlashSpread;
`;

/** `oceanSkyColor(dir, discWeight)` and the noise it needs.
 *
 *  SELF CONTAINED ON PURPOSE. It declares its own hash rather than borrowing
 *  water.js's, because it is compiled into two different programs and a shared
 *  function that only works when something else happens to be above it is a
 *  trap for whoever adds the third one.
 *
 *  `discWeight` exists so THE SUN IS ONLY DRAWN ONCE. The dome passes 1 and the
 *  water passes 0, because the water already has a sun: Three's directional
 *  light at roughness 0.08 produces a tight specular lobe, and that lobe smeared
 *  across the wave slopes IS the glint path. Reflecting the disc as well would
 *  put a second, harder sun on top of the first one. The broad glow and the
 *  clouds stay in the reflection, since the directional light provides neither.
 */
export const SKY_GLSL = `
float skyHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float skyNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = skyHash(i);
    float b = skyHash(i + vec2(1.0, 0.0));
    float c = skyHash(i + vec2(0.0, 1.0));
    float d = skyHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/* How much cloud is in a given direction, 0 to 1.
 *
 * The sheet is a plane overhead and the sample point is where the view ray
 * meets it, which is where the perspective comes from: the divide by dir.y
 * spreads features overhead and crushes them together toward the horizon,
 * exactly as real cloud does, with no distance term anywhere in it.
 *
 * The fade is not decoration. That same divide runs away to infinity at the
 * horizon, so without it the noise there is finer than the pixel it lands on,
 * which does not read as cloud. It reads as a shimmer in the stillest part of
 * the frame. It also buys the water's reflection an early exit: a ray leaving
 * the sea near the horizon comes back at a shallow angle and returns here
 * before any noise is fetched. */
float skyCloudAmount(vec3 dir) {
    float lift = smoothstep(uCloudFadeFrom, uCloudFadeTo, dir.y);
    if (lift <= 0.0) return 0.0;
    vec2 p = dir.xz * (uCloudScale / max(dir.y, uCloudFadeFrom)) + uCloudDrift;
    p.x *= uCloudStretch;
    float n = skyNoise(p);
    n = 0.62 * n + 0.38 * skyNoise(p * 2.7 + 11.3);
    return smoothstep(uCloudCoverage, uCloudCoverage + uCloudSoftness, n) * lift;
}

/* The storm base: how much of it is in a given direction, and how thick.
 *
 * Returns coverage in x and thickness in y, which are DELIBERATELY TWO
 * DIFFERENT QUANTITIES. Coverage says whether there is cloud here at all and is
 * nearly always one, thickness says how much of it there is and is where all
 * the contrast comes from. Building this the way skyCloudAmount is built, with
 * the threshold deciding presence, gave a base that opened up into clear sky
 * whenever the drift carried a low patch across the frame. See sky.shelf.
 *
 * THE FIRST THING IT DOES IS GIVE UP. Under a clear sky the opacity is zero, so
 * the whole layer, warp and octaves and all, costs one compare for the entire
 * opening of the arc. That matters more here than it looks: this function is
 * compiled into the water's shader as well as the dome's, so it runs per water
 * fragment across a full screen sheet.
 *
 * The second early out is worth as much again. The base stops well above the
 * horizon, so a reflection leaving flat water at a grazing angle comes back at
 * a grazing angle and returns here before any noise is fetched. Only a tilted
 * wave face pointing steeply up pays for the rest. */
vec2 skyShelf(vec3 dir) {
    if (uShelfOpacity <= 0.0) return vec2(0.0);
    float lift = smoothstep(uShelfFadeFrom, uShelfFadeTo, dir.y);
    if (lift <= 0.0) return vec2(0.0);

    /* THE DIVISOR IS CLAMPED AGAINST A CONSTANT AND NOT AGAINST uShelfFadeFrom,
     * which is what the sheet above does. That edge MOVES as the gloom rises,
     * and clamping to it would rescale the projection underneath the cloud as
     * the storm built, so the pattern would breathe in place rather than drift.
     * lift has already guaranteed dir.y is above the edge, so this only ever
     * catches an edge configured at zero. */
    vec2 p = dir.xz * (uShelfScale / max(dir.y, 0.02)) + uShelfDrift;
    p.x *= uShelfStretch;

    /* THE WARP IS WHAT MAKES IT CONVECTION. Bending the sample point by a
     * coarser noise before the octaves are taken turns straight features into
     * billows and curls, which is the difference between a cloud and a gradient.
     * Two fetches, and it is the only term in this sky that says the air is
     * moving vertically. */
    vec2 warp = vec2(skyNoise(p * 0.5 + 19.7), skyNoise(p * 0.5 + 4.3)) - 0.5;
    p += warp * uShelfWarp;

    float n = skyNoise(p);
    n = 0.66 * n + 0.34 * skyNoise(p * 2.4 + 5.1);
    return vec2(
        smoothstep(uShelfCoverage, uShelfCoverage + uShelfSoftness, n) * lift,
        /* Centred on the noise's OWN mean rather than on the coverage threshold,
         * so the thickness uses the full swing of the noise symmetrically and
         * the base has as much thick in it as thin. */
        smoothstep(0.5 - uShelfDepth, 0.5 + uShelfDepth, n)
    );
}

vec3 oceanSkyColor(vec3 rayDir, float discWeight) {
    vec3 dir = normalize(rayDir);
    float up = clamp(dir.y, 0.0, 1.0);

    /* Pale at the horizon, saturated overhead. A horizontal line of sight runs
     * through far more air than a vertical one, so this is the way round the
     * real thing goes and a linear ramp draws it backwards. */
    vec3 color = mix(uSkyHorizon, uSkyZenith, pow(up, uSkyGradientPower));

    /* Two halo terms, because the sky around the sun has two: a wide bloom from
     * the whole depth of the atmosphere and a tight aureole from the air just
     * around the disc. One exponent cannot be both. */
    float toSun = max(dot(dir, uSunDir), 0.0);
    color += uSunColor * (pow(toSun, uSunGlowPower) * uSunGlowStrength
        + pow(toSun, uSunAureolePower) * uSunAureoleStrength);

    /* Cloud, underlit by a low sun. This term is the sunset. */
    float cloud = skyCloudAmount(dir) * uCloudOpacity;
    vec3 litCloud = mix(uCloudColor, uSunColor, pow(toSun, 3.0) * uCloudSunlitMix);
    color = mix(color, litCloud, cloud);

    /* THE STORM BASE GOES OVER THE TOP OF THE SHEET, because it is BELOW it and
     * therefore in front of it from down here. Its own noise picks between a
     * light grey and a much darker one, and that pick is the entire point of the
     * layer: the sky it replaced had a contrast of thirteen levels and this one
     * measures ninety two. See sky.shelf. */
    vec2 shelf = skyShelf(dir);
    float base = shelf.x * uShelfOpacity;
    color = mix(color, mix(uShelfLight, uShelfDark, shelf.y), base);

    /* LIGHTNING, AND IT LIGHTS THE CLOUD RATHER THAN THE SKY. Multiplying by the
     * cloud means a flash brightens the deck it is inside and leaves clear sky
     * alone, which is what sheet lightning is and is the reason this reads as
     * being INSIDE the storm rather than as the exposure jumping. It also means
     * no flash can happen before there is weather to hold it, however the arc is
     * retimed, because with no cloud the term is zero.
     *
     * The base counts for more than the sheet: the thick low deck is what a
     * channel is actually buried in, and the thin stuff above it is lit second
     * hand. And because this whole function is compiled into the water's shader,
     * every wave facing the strike reflects the lit cloud without the sea being
     * told a thing about it. */
    float toFlash = max(dot(dir, uFlashDir), 0.0);
    float lit = pow(toFlash, uFlashSpread) * (base + cloud * 0.45);
    color += uFlashColor * (uFlash * lit);

    /* The disc goes on last so cloud can pass in front of it, and it is gated
     * on the ray being above the horizon so a sun that has set stays set. The
     * base hides it harder than the sheet does, because it is thicker: a sun
     * still burning through a cumulonimbus would undo the whole layer. */
    float disc = smoothstep(uSunLimbCos, uSunDiscCos, dot(dir, uSunDir));
    disc *= smoothstep(-0.010, 0.010, dir.y) * (1.0 - cloud * 0.85) * (1.0 - base * 0.98);
    color += uSunColor * (disc * uSunDiscStrength * discWeight);

    return color;
}
`;

// ---------------------------------------------------------------------------
// The THREE shell
// ---------------------------------------------------------------------------

const VERTEX_SHADER = `
varying vec3 vRayDir;
void main() {
    vRayDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** The dome's own program.
 *
 *  THE LAST TWO LINES ARE NOT OPTIONAL. A ShaderMaterial gets no tone mapping
 *  and no colour space transform of its own, and the sky HAS to go through the
 *  same filmic curve and the same encode as the water, or the horizon is a seam
 *  again for a brand new reason: the sea reflecting a sky that is a different
 *  colour from the sky above it.
 *
 *  Only the two `_fragment` chunks, and NOT their `_pars_` halves. Three puts
 *  `tonemapping_pars_fragment` and `colorspace_pars_fragment` into the fragment
 *  prefix of every material that is not a RawShaderMaterial, so the functions
 *  these two call are already declared above anything written here. Including
 *  the pars again defines `LinearToneMapping` and its siblings twice, which is
 *  a GLSL compile error and takes the whole sky down with it. */
const FRAGMENT_SHADER = `
#include <common>
${SKY_UNIFORM_GLSL}
${SKY_GLSL}
varying vec3 vRayDir;
void main() {
    gl_FragColor = vec4(oceanSkyColor(vRayDir, 1.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

let uniforms = null;
let dome = null;
let domeGeometry = null;
let domeMaterial = null;
let sunLight = null;
let fillLight = null;
let sceneRef = null;
let rendererRef = null;
let settings = null;
let phase = 0;
let elapsed = 0;
// HOW FAR THE CLOUD HAS TRAVELLED, accumulated rather than derived, because the
// speed is no longer constant. See `updateSky`.
let drifted = 0;
// The last gloom the arc asked for, held so `setPhase` can jump the hour for a
// screenshot without also clearing the storm out of the sky.
let lastGloom = 0;

/** The uniform objects, for water.js to graft into its own material.
 *
 *  Handed over BY REFERENCE and never replaced, so one write in `updateSky`
 *  moves both programs. Returning copies here would produce a sea reflecting
 *  yesterday's sky, which is the kind of fault that looks like a colour grading
 *  choice rather than a bug. */
export function skyUniforms() {
    return uniforms;
}

/** Build the sky, its two lights, and the fog they share.
 *
 *  Takes the camera because the dome is centred on the eye rather than on the
 *  world origin: the camera sits 1.15 metres up and never moves, so a dome at
 *  the origin would put its equator a degree and a half below the horizon the
 *  visitor is actually looking at. Takes the renderer because the day cycle
 *  drives tone mapping exposure, which is the cheapest lever there is on how
 *  night and midday read. */
export function initSky(scene, camera, config = OCEAN_CONFIG, options = {}) {
    settings = config;
    sceneRef = scene;
    rendererRef = options.renderer || null;

    const sky = config.sky;
    const random = options.random || Math.random;
    phase = options.phase != null ? wrapPhase(options.phase) : entryPhase(random, config.cycle);
    elapsed = 0;
    drifted = 0;
    lastGloom = 0;

    const discRadius = (sky.sun.angularDiameterDegrees / 2) * DEG;
    const limbRadius = discRadius + sky.sun.limbSoftnessDegrees * DEG;

    uniforms = {
        uSkyZenith: { value: new THREE.Color() },
        uSkyHorizon: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 0.2, -1) },
        uSunColor: { value: new THREE.Color() },
        uCloudColor: { value: new THREE.Color() },
        uSkyGradientPower: { value: sky.gradientPower },
        uSunDiscCos: { value: Math.cos(discRadius) },
        uSunLimbCos: { value: Math.cos(limbRadius) },
        uSunDiscStrength: { value: sky.sun.discStrength },
        uSunGlowPower: { value: sky.sun.glowPower },
        uSunGlowStrength: { value: sky.sun.glowStrength },
        uSunAureolePower: { value: sky.sun.glowPower * sky.sun.aureoleRatio },
        uSunAureoleStrength: { value: sky.sun.aureoleStrength },
        // Opacity is per keyframe, not per cloud sheet: thin cloud at midday is
        // the same cloud lit differently at sunset. `applyState` fills it in
        // before the first frame, so the zero here is never seen.
        uCloudOpacity: { value: 0 },
        uCloudScale: { value: sky.cloud.height * sky.cloud.scale },
        uCloudStretch: { value: sky.cloud.stretch },
        uCloudCoverage: { value: sky.cloud.coverage },
        uCloudSoftness: { value: sky.cloud.softness },
        uCloudFadeFrom: { value: sky.cloud.horizonFadeFrom },
        uCloudFadeTo: { value: sky.cloud.horizonFadeTo },
        uCloudSunlitMix: { value: sky.cloud.sunlitMix },
        uCloudDrift: { value: new THREE.Vector2() },
        // The storm base. Everything the gloom moves is filled in by
        // `applyState` before the first frame, so the zeroes here are never
        // seen, and everything it does not is set once right here.
        //
        // THE TWO COLOURS DO NOT FOLLOW THE HOUR, which is the same bargain the
        // rest of `sky.storm` strikes and is worth knowing about. The shipped
        // scene holds the sun near midday, so there is no hour for them to
        // follow; drive the day round with `oceanSetPhase` and a grey base will
        // sit under an orange sky, exactly as the grey lid already does.
        uShelfLight: { value: new THREE.Color() },
        uShelfDark: { value: new THREE.Color() },
        uShelfOpacity: { value: 0 },
        uShelfScale: { value: sky.shelf.scale },
        uShelfStretch: { value: sky.shelf.stretch },
        uShelfCoverage: { value: sky.shelf.coverage },
        uShelfSoftness: { value: sky.shelf.softness },
        uShelfDepth: { value: sky.shelf.depth },
        uShelfWarp: { value: sky.shelf.warp },
        uShelfFadeFrom: { value: sky.shelf.horizonFadeFrom },
        uShelfFadeTo: { value: sky.shelf.horizonFadeTo },
        uShelfDrift: { value: new THREE.Vector2() },
        // THE FLASH IS DECLARED HERE AND DRIVEN FROM lightning.js, which is the
        // same division water.js and sand.js already work under: the sky owns
        // its program and its uniforms, and whoever has something to say writes
        // through the objects `skyUniforms` hands out. Left at zero, so a page
        // that never builds the lightning has a sky with no flash in it rather
        // than a shader with an undefined uniform, which silently reads as zero
        // anyway and would have been indistinguishable from working.
        uFlashColor: { value: new THREE.Color(sky.flash.color) },
        uFlashDir: { value: new THREE.Vector3(0, 1, 0) },
        uFlash: { value: 0 },
        uFlashSpread: { value: sky.flash.spread }
    };
    uniforms.uShelfLight.value.setRGB(...unpackColor(sky.shelf.light), THREE.SRGBColorSpace);
    uniforms.uShelfDark.value.setRGB(...unpackColor(sky.shelf.dark), THREE.SRGBColorSpace);

    domeGeometry = new THREE.SphereGeometry(sky.domeRadius, 32, 16);
    domeMaterial = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false
    });

    dome = new THREE.Mesh(domeGeometry, domeMaterial);
    dome.name = 'sky';
    dome.frustumCulled = false;
    // First in the queue and it writes no depth, so it is a background that
    // happens to be geometry rather than something the sea has to sort against.
    dome.renderOrder = -1;
    if (camera) dome.position.copy(camera.position);
    if (scene) scene.add(dome);

    // The sun. Position is a direction times a distance, since a directional
    // light only reads the direction from its position to its target.
    sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.name = 'sun';
    if (scene) scene.add(sunLight);

    // Sky from above, sand bounce from below. A single ambient would flatten the
    // troughs, which are lit by the sky and by nothing else.
    fillLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    fillLight.name = 'skyFill';
    if (scene) scene.add(fillLight);

    // Haze rather than a hard edge, and its colour is the sky's own horizon so
    // the far water and the sky it fades into can never disagree. The far rows
    // are a few pixels tall and fog is what turns them into a horizon instead
    // of a seam.
    if (scene) scene.fog = new THREE.Fog(0x000000, sky.fog.near, sky.fog.far);

    applyState(skyStateAt(phase, sky));
    return dome;
}

/** Push one interpolated state out to everything that consumes it. */
function applyState(state) {
    const dir = sunDirectionAt(state.elevation, state.azimuth);

    uniforms.uSkyZenith.value.setRGB(state.zenith[0], state.zenith[1], state.zenith[2], THREE.SRGBColorSpace);
    uniforms.uSkyHorizon.value.setRGB(state.horizon[0], state.horizon[1], state.horizon[2], THREE.SRGBColorSpace);
    uniforms.uSunColor.value.setRGB(state.sunColor[0], state.sunColor[1], state.sunColor[2], THREE.SRGBColorSpace);
    uniforms.uCloudColor.value.setRGB(state.cloudColor[0], state.cloudColor[1], state.cloudColor[2], THREE.SRGBColorSpace);
    uniforms.uSunDir.value.set(dir.x, dir.y, dir.z);
    // Both halo terms fade out through twilight. Applied to the strengths on the
    // CPU rather than as another smoothstep in the shader, because it is one
    // number per frame either way and this one is testable. See twilightGlow.
    const halo = twilightGlow(state.elevation);
    // TIMES THE GLOOM AS WELL AS THE TWILIGHT, and the gloom half was missing.
    // A sun behind a thick lid contributes almost nothing to the sky, and since
    // the sea reflects this exact function it was putting a sunny glare on a
    // storm. The disc and the cloud's sunlit mix are set here for the same
    // reason: both used to be written once when the sky was built, so no amount
    // of cloud could take them down.
    const sun = halo * (state.sunGlow == null ? 1 : state.sunGlow);
    uniforms.uSunGlowStrength.value = settings.sky.sun.glowStrength * sun;
    uniforms.uSunAureoleStrength.value = settings.sky.sun.aureoleStrength * sun;
    uniforms.uSunDiscStrength.value = settings.sky.sun.discStrength * sun;
    uniforms.uCloudSunlitMix.value = settings.sky.cloud.sunlitMix
        * (state.sunGlow == null ? 1 : state.sunGlow);
    uniforms.uCloudOpacity.value = state.cloudOpacity;
    // Coverage is the noise threshold, so lowering it does not make the same
    // clouds darker, it makes there be MORE of them. That is what turns a few
    // high streaks into an overcast lid, and it is why the storm needs this as
    // well as the opacity rather than instead of it.
    if (state.cloudCoverage != null) uniforms.uCloudCoverage.value = state.cloudCoverage;
    // The lid has to reach the horizon, or the water reflects a storm the sky
    // has not got. See `sky.storm.cloudFadeTo` for the whole account.
    if (state.cloudFadeTo != null) uniforms.uCloudFadeTo.value = state.cloudFadeTo;
    // READ, NOT COMPUTED. This used to be `elapsed * driftSpeed`, which is only
    // correct while the speed never changes. See `updateSky`.
    uniforms.uCloudDrift.value.set(0, drifted);
    uniforms.uShelfDrift.value.set(0, drifted * settings.sky.shelf.driftRatio);
    if (state.shelfOpacity != null) uniforms.uShelfOpacity.value = state.shelfOpacity;
    if (state.shelfFadeFrom != null) uniforms.uShelfFadeFrom.value = state.shelfFadeFrom;
    if (state.shelfFadeTo != null) uniforms.uShelfFadeTo.value = state.shelfFadeTo;

    sunLight.color.setRGB(state.sunColor[0], state.sunColor[1], state.sunColor[2], THREE.SRGBColorSpace);
    sunLight.intensity = state.sunIntensity;
    sunLight.position.set(dir.x, dir.y, dir.z).multiplyScalar(300);

    fillLight.color.setRGB(state.hemiSky[0], state.hemiSky[1], state.hemiSky[2], THREE.SRGBColorSpace);
    fillLight.groundColor.setRGB(state.hemiGround[0], state.hemiGround[1], state.hemiGround[2], THREE.SRGBColorSpace);
    fillLight.intensity = state.hemiIntensity;

    if (sceneRef && sceneRef.fog) {
        // The fog is the horizon AS THE SCREEN WILL SHOW IT, not as the sky is.
        // See toneMapACES: fog is applied after tone mapping, so anything set
        // here is taken literally, and the untouched colour would fade the far
        // water to something the sky above it never renders as. Stored in the
        // working space so Three's own encode on upload is the only one applied.
        const shown = toneMapACES(state.horizon.map(srgbToLinear), state.exposure);
        sceneRef.fog.color.setRGB(shown[0], shown[1], shown[2], THREE.LinearSRGBColorSpace);
    }
    if (rendererRef) rendererRef.toneMappingExposure = state.exposure;
}

/** Advance the day.
 *
 *  Everything here moves on a clock measured in tens of minutes, so there is no
 *  case for rebuilding it less often than the frame: it is one interpolation
 *  between two keyframes and a handful of uniform writes, and skipping frames
 *  to save that would trade nothing for a visible step in the light. */
export function updateSky(deltaSeconds, gloom = 0, clarity = 0) {
    if (!uniforms) return phase;
    const delta = Number.isFinite(deltaSeconds) ? deltaSeconds : 0;
    elapsed += delta;
    lastGloom = gloom;
    // HOW FAR YOU CAN SEE, and it opens up for the tsunami. The fog's far edge
    // was a fixed 400 m, which is fine for a horizon and fatal for a wall of
    // water that has to be watched coming from four hundred metres away: the
    // fog colour IS the horizon colour, so the wall arrived painted the exact
    // shade of the sky behind it. See `sky.fog` in config for the measurements.
    if (sceneRef && sceneRef.fog) {
        const f = settings.sky.fog;
        sceneRef.fog.far = f.far + (f.clearFar - f.far) * Math.max(0, Math.min(1, clarity));
    }
    phase = advancePhase(phase, delta, settings.cycle);
    const state = applyGloom(skyStateAt(phase, settings.sky), gloom, settings.sky);
    // THE DRIFT IS INTEGRATED AND IT HAS TO BE. The storm speeds the sky up by
    // six times, so the drift is a rate that changes, and position is the
    // integral of a rate rather than the product of it with the clock. Written
    // the obvious way, as `elapsed * speed`, every rise in the speed would
    // reprice the WHOLE history at the new rate and shunt the clouds forward by
    // minutes in one frame, and the fall at the end of the arc would drag them
    // back again. Adding this frame's own travel is the only version that has
    // no seam in it.
    drifted += delta * state.driftSpeed;
    applyState(state);
    return phase;
}

/** Where in the day we are, 0 to 1. Mostly here so a screenshot can be
 *  described as "at 0.84" rather than as "the orange one". */
export function getPhase() { return phase; }

/** Jump the day, keeping every uniform object it already handed out.
 *
 *  THE POINT IS THAT IT DOES NOT REBUILD ANYTHING. The obvious way to move the
 *  sky is to dispose it and init it again, and that quietly breaks the sea: the
 *  water's compiled shader holds references to the OLD uniform objects, so the
 *  dome would jump to the new hour and the reflection in the water would stay
 *  at the old one. Two skies in one frame, and the only clue is that the
 *  horizon has gone back to being a seam. */
export function setPhase(next) {
    if (!uniforms) return phase;
    phase = wrapPhase(next);
    // Keeps whatever gloom the arc had put on, so jumping the hour for a
    // screenshot does not also clear the storm out of the sky.
    applyState(applyGloom(skyStateAt(phase, settings.sky), lastGloom, settings.sky));
    return phase;
}

/** The current look, for anything that wants to read the light without
 *  reaching into THREE objects to get it. The sand's wet band will want this. */
export function getSkyState() { return skyStateAt(phase, settings.sky); }

export function disposeSky() {
    if (sceneRef) {
        if (dome) sceneRef.remove(dome);
        if (sunLight) sceneRef.remove(sunLight);
        if (fillLight) sceneRef.remove(fillLight);
        sceneRef.fog = null;
    }
    if (domeGeometry) domeGeometry.dispose();
    if (domeMaterial) domeMaterial.dispose();
    dome = null;
    domeGeometry = null;
    domeMaterial = null;
    sunLight = null;
    fillLight = null;
    sceneRef = null;
    rendererRef = null;
    uniforms = null;
    elapsed = 0;
    drifted = 0;
    lastGloom = 0;
}

/** Test seam, matching water.js. Not used by the page. */
export const __sky = {
    state: () => ({ uniforms, dome, sunLight, fillLight, phase, elapsed, drifted })
};
