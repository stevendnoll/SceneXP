// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * sky.js - Fractal Garden's sky and light rig.
 *
 * The dome, the sun, the moon, the stars, the fog, and the four lights, all
 * driven by one number: the in-world hour. Split the way every module in this
 * scene is split, with the arithmetic in pure exported functions and the THREE
 * calls in code that does no arithmetic worth testing.
 *
 * ONE KEYFRAME TABLE COVERS ALL FOUR SEASONS. Because the seasons are the
 * sun's own hours, a table keyed by hour is already keyed by season: 06:00 is a
 * spring dawn, noon is high summer, 18:00 is an autumn sunset, and midnight is
 * the deep of winter. See config.sky.keys.
 *
 * ---- The three colour traps, all of which have cost this project time ----
 *
 * 1. BLEND IN sRGB, CONVERT AFTERWARDS. Interpolating a deep blue zenith and
 *    an orange horizon in linear space runs the midpoint through mud, because
 *    a straight line in linear space is not straight perceptually. Both the
 *    CPU keyframe blend and the shader's vertical gradient mix in sRGB and
 *    convert to linear second, so the two always agree.
 *
 * 2. A COLOUR SOLVE IS FOUR STAGES, NOT THREE. sRGB to linear, times the
 *    luminance and the exposure, tone map, then encode back to sRGB. Skipping
 *    the final encode is how the ocean scene once shipped a storm sky that was
 *    no darker than its clear one. `shownColor()` below runs all four, and it
 *    is the function to reason with when asking what an hour will actually
 *    look like on screen.
 *
 * 3. THREE'S FOG RUNS AFTER TONE MAPPING AND AFTER THE ENCODE. `fog.color` is
 *    therefore a SCREEN value, not a scene colour, and it is mixed into an
 *    already-encoded frame buffer. So it is set from `shownColor()` of the
 *    horizon and handed to THREE tagged LinearSRGBColorSpace, which stops the
 *    renderer converting it a second time. Set it the obvious way instead and
 *    the distance fades to a colour the sky never shows.
 *
 * The dome does its own tone mapping and encoding in the fragment shader
 * (`toneMapped: false` on the material), which is what makes `shownColor()` an
 * exact prediction of the pixel rather than an approximation.
 */

import { GARDEN_CONFIG } from './config.min.js';
import { solarAt, lunarAt, wrapHour, clamp01, smoothstep, HOURS_PER_DAY } from './clock.min.js';

// ---- Colour helpers (pure) -------------------------------------------------

/** Unpack a packed hex into three sRGB channels in 0 to 1. */
export function unpackColor(hex) {
    return [
        ((hex >> 16) & 0xff) / 255,
        ((hex >> 8) & 0xff) / 255,
        (hex & 0xff) / 255
    ];
}

/** Pack three channels in 0 to 1 back into a hex. */
export function packColor(rgb) {
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    return (c(rgb[0]) << 16) | (c(rgb[1]) << 8) | c(rgb[2]);
}

/** Blend two packed colours IN sRGB, returning three channels in 0 to 1. */
export function mixColor(a, b, t) {
    const ca = unpackColor(a);
    const cb = unpackColor(b);
    return [
        ca[0] + (cb[0] - ca[0]) * t,
        ca[1] + (cb[1] - ca[1]) * t,
        ca[2] + (cb[2] - ca[2]) * t
    ];
}

export function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c) {
    return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** The ACES filmic curve three.js uses, in its narrow-gamut approximation. The
 *  same maths the renderer applies to every lit surface, repeated here so the
 *  sky and the ground share one response. */
export function toneMapACES(rgbLinear, exposure = 1) {
    const map = (v) => {
        const x = Math.max(0, v * exposure * 0.6);
        const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
        return clamp01((x * (a * x + b)) / (x * (c * x + d) + e));
    };
    return [map(rgbLinear[0]), map(rgbLinear[1]), map(rgbLinear[2])];
}

/**
 * What a sky colour actually looks like on screen: all four stages, in order.
 *
 * This is the function to reason with when asking whether one hour is darker
 * than another. Comparing raw keyframe hexes answers a different and much less
 * useful question, because `lum` and the tone curve between them can reverse
 * the ordering.
 *
 * @param {number} hex     the sRGB keyframe colour
 * @param {number} lum     the linear luminance multiplier for that hour
 * @param {number} exposure renderer exposure
 * @returns {number} a packed hex of what the pixel will be
 */
export function shownColor(hex, lum = 1, exposure = GARDEN_CONFIG.sky.exposure) {
    const srgb = unpackColor(hex);
    const linear = srgb.map(srgbToLinear).map((v) => v * lum);
    const mapped = toneMapACES(linear, exposure);
    return packColor(mapped.map(linearToSrgb));
}

/** Relative luminance of a packed colour, for "is this darker than that". */
export function luminanceOf(hex) {
    const [r, g, b] = unpackColor(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ---- The keyframe table (pure) ---------------------------------------------

/**
 * The two keyframes either side of an hour, and how far between them it is.
 *
 * THE LIST WRAPS AND THERE IS NO KEYFRAME AT 24. Past the last entry the
 * second key is the first one, a day later, which is what closes the year into
 * a loop. Duplicating the first key at the end would work right up until
 * somebody edited one copy, which is the sort of bug that shows up as a one
 * frame flash at midnight and gets blamed on the renderer.
 */
export function bracketKeys(hour, keys = GARDEN_CONFIG.sky.keys) {
    const h = wrapHour(hour);
    const last = keys.length - 1;
    if (keys.length === 1) return { from: keys[0], to: keys[0], t: 0 };

    for (let i = 0; i < last; i++) {
        if (h >= keys[i].at && h < keys[i + 1].at) {
            const span = keys[i + 1].at - keys[i].at;
            return { from: keys[i], to: keys[i + 1], t: span > 0 ? (h - keys[i].at) / span : 0 };
        }
    }

    // Past the last key, or before the first one. Both are the wrap.
    const from = keys[last];
    const to = keys[0];
    const span = HOURS_PER_DAY - from.at + to.at;
    const along = h >= from.at ? h - from.at : HOURS_PER_DAY - from.at + h;
    return { from, to, t: span > 0 ? along / span : 0 };
}

/**
 * The sky's colours and brightness at an hour: two sRGB colours as packed
 * hexes, plus the linear luminance multiplier that goes with them.
 */
export function skyStateAt(hour, keys = GARDEN_CONFIG.sky.keys) {
    const { from, to, t } = bracketKeys(hour, keys);
    return {
        zenith: packColor(mixColor(from.zenith, to.zenith, t)),
        horizon: packColor(mixColor(from.horizon, to.horizon, t)),
        lum: from.lum + (to.lum - from.lum) * t
    };
}

/**
 * Pull a sky state toward the storm palette, 0 clear and 1 fully overcast.
 *
 * A second axis through the same keyframes rather than a second table. It
 * darkens AND flattens: the zenith and the horizon converge on one grey, which
 * is what makes an overcast sky look like a lid rather than like a dimmer
 * evening.
 */
export function applyGloom(state, gloom, sky = GARDEN_CONFIG.sky) {
    const g = clamp01(gloom);
    if (g <= 0 || !sky.storm) return state;
    const s = sky.storm;
    return {
        zenith: packColor(mixColor(state.zenith, s.zenith, g)),
        horizon: packColor(mixColor(state.horizon, s.horizon, g)),
        lum: state.lum * (1 - (1 - s.lumScale) * g)
    };
}

/**
 * The brightest zenith any hour of the year shows, as screen luminance.
 * Memoised against the key table it was computed from, because this is the
 * denominator of `skyDaylightAt` and recomputing it every frame would run the
 * tone curve eleven times for an answer that never changes.
 */
let _referenceCache = { keys: null, value: 1 };
export function referenceLuminance(keys = GARDEN_CONFIG.sky.keys, exposure = GARDEN_CONFIG.sky.exposure) {
    if (_referenceCache.keys === keys) return _referenceCache.value;
    let best = 0;
    for (const key of keys) {
        const lum = luminanceOf(shownColor(key.zenith, key.lum, exposure));
        if (lum > best) best = lum;
    }
    _referenceCache = { keys, value: best > 0 ? best : 1 };
    return _referenceCache.value;
}

/**
 * How much daylight the GROUND gets at an hour, 0 to 1.
 *
 * DERIVED FROM WHAT THE SKY ACTUALLY SHOWS, and that is the whole point of
 * this function existing rather than a line of arithmetic inside lightingAt.
 * The first version keyed the ground off the sun's elevation instead, which
 * reads plausibly and is wrong in a way that only appears at one hour: at
 * sunrise the sun is exactly on the horizon and contributes nothing, while the
 * whole sky is alight. That version rendered 06:00 with less ambient than
 * midnight. Reading the sky's own screen luminance means the ground can never
 * disagree with the sky above it, at any hour, whatever anybody later does to
 * the palette.
 */
export function skyDaylightAt(hour, config = GARDEN_CONFIG) {
    const S = config.sky;
    const sky = skyStateAt(hour, S.keys);
    const shown = luminanceOf(shownColor(sky.zenith, sky.lum, S.exposure));
    return clamp01(shown / referenceLuminance(S.keys, S.exposure));
}

// ---- Direction (pure) ------------------------------------------------------

/**
 * A unit direction from an elevation and an azimuth, both in degrees.
 *
 * Azimuth 0 is due south (-Z is north, +Z is south in this scene, and the
 * camera looks north up the plot), rising to +90 due west. Elevation is
 * measured up from the horizon.
 */
export function directionAt(elevationDegrees, azimuthDegrees) {
    const el = elevationDegrees * Math.PI / 180;
    const az = azimuthDegrees * Math.PI / 180;
    const horizontal = Math.cos(el);
    return {
        x: horizontal * Math.sin(az),
        y: Math.sin(el),
        z: horizontal * Math.cos(az)
    };
}

// ---- The light rig (pure) --------------------------------------------------

/**
 * Every light intensity and colour for an hour, given how much snow is down.
 *
 * THE WINTER FLOOR LIVES HERE, and it is why this function takes snow coverage
 * rather than just an hour. Winter in this garden is the middle of the night,
 * so the best-looking event in the scene, snow arriving and lying, would
 * otherwise happen where nobody can see it. Two terms fix that without turning
 * winter into daylight:
 *
 *   - `winterFloor` raises the moon, the ambient, and the hemisphere fill, on a
 *     curve peaked at midnight and zero at both equinox hours, so spring and
 *     autumn are untouched.
 *   - `snowBounce` adds the light fresh snow throws back up, and shifts the
 *     hemisphere light's GROUND colour from soil toward snow, so the bounce is
 *     the right colour as well as the right brightness.
 *
 * Both are config terms rather than shader constants precisely so they can be
 * moved during QA without a rebuild of anything else.
 *
 * `cloud` is separate from `gloom` and defaults to it. Gloom is how STORM
 * COLOURED the sky is and drives the palette. Cloud is how CLOSED it is, from
 * `weather.overcastAt`, and it is the greater of the gloom and whatever is
 * actually falling. They differ in exactly one case and it is a real one: the
 * winter snowfall is a calendar event, so a clear-state blizzard has gloom 0.
 */
export function lightingAt(hour, snowCoverage = 0, gloom = 0, cloud = null, config = GARDEN_CONFIG) {
    const L = config.sky.lighting;
    const S = config.sky.storm;
    const g = clamp01(gloom);
    const c = cloud == null ? g : clamp01(cloud);
    const sun = solarAt(hour, config.sun);
    const moon = lunarAt(hour, config.sun);
    const snow = clamp01(snowCoverage);

    // How high each body is, as a 0 to 1 factor. Below the horizon is zero.
    const sunUp = clamp01(Math.sin(sun.elevation * Math.PI / 180));
    const moonUp = clamp01(Math.sin(moon.elevation * Math.PI / 180));

    // Deepest at midnight, zero at both equinox hours (06:00 and 18:00), which
    // is exactly the negated solar elevation. Winter and "night" are the same
    // axis in this garden, so one number serves both.
    const winterness = clamp01(-Math.sin((wrapHour(hour) - 6) * Math.PI / 12));

    // A low sun is a warm sun. The atmosphere takes the blue out of it long
    // before it reaches the horizon.
    const warmth = 1 - clamp01(sun.elevation / L.warmElevation);
    const sunColor = packColor(mixColor(L.sunColorHigh, L.sunColorLow, warmth));

    // A sun ON the horizon is still delivering light, and a straight sine says
    // it delivers none. The lift keeps the disc worth something as it clears,
    // which is the whole of sunrise, and still lets it die out a few degrees
    // below rather than shining up through the ground. See lighting.horizonLift.
    const lift = L.horizonLift || 0;
    const sunFall = clamp01((Math.sin(sun.elevation * Math.PI / 180) + lift) / (1 + lift));
    // AN OVERCAST SKY TAKES THE KEY LIGHT, NOT THE SUN. The sun is still up
    // there and simply cannot be seen, so its direction is kept and only what
    // it delivers goes. That is the difference between a storm and a sunset:
    // keep the direction and the garden goes flat and grey, move it and the
    // garden looks like evening arrived early.
    const sunIntensity = Math.pow(sunFall, 0.7) * L.sunPeak * (1 - (1 - S.sunScale) * g);

    // AN OVERCAST SKY TAKES THE MOONLIGHT TOO, and this line spent four
    // milestones not knowing it. The sun directly above already loses its
    // delivery to the gloom while keeping its direction, which is the note
    // beside it. The moon did not, so a stormy midnight was a black lid of a
    // sky with full moonlight raking across the grass underneath it. Same
    // treatment, same constant, and it reads `cloud` rather than `gloom` so a
    // calendar blizzard dims it as well.
    const moonIntensity = moonUp * L.moonPeak
        * (1 + L.winterFloor.moonBoost * winterness)
        * (1 - (1 - S.sunScale) * c);

    // From the sky rather than from the sun. See skyDaylightAt: keying this off
    // the sun's elevation puts less light on the ground at sunrise than at
    // midnight, because at sunrise the sun contributes nothing and the sky
    // contributes everything.
    const day = skyDaylightAt(hour, config);
    // Cloud scatters light into the shadows, so a storm RAISES the fill even
    // as it takes the key away. Without this a stormy noon reads as dusk.
    const ambient = L.ambientNight + (L.ambientDay - L.ambientNight) * day
        + L.winterFloor.ambientBoost * winterness
        + L.snowBounce.ambient * snow
        + S.ambientLift * g * day;
    const hemi = L.hemiNight + (L.hemiDay - L.hemiNight) * day
        + L.winterFloor.hemiBoost * winterness
        + L.snowBounce.hemi * snow
        + S.hemiLift * g * day;

    return {
        daylight: day,
        sunIntensity,
        sunColor,
        sunElevation: sun.elevation,
        sunAzimuth: sun.azimuth,
        moonIntensity,
        moonColor: L.moonColor,
        moonElevation: moon.elevation,
        moonAzimuth: moon.azimuth,
        ambient,
        hemi,
        hemiSky: L.hemiSkyColor,
        // The ground half of the hemisphere light is what colours the bounce,
        // so it turns white as the snow comes down.
        hemiGround: packColor(mixColor(L.hemiGroundColor, L.snowBounce.groundColor, snow)),
        winterness
    };
}

/**
 * What a lightning flash does to the fill, as a pair of MULTIPLIERS.
 *
 * THE FLASH IS A RATIO, NOT AN AMOUNT, and getting that wrong is the whole of
 * M9-1. The first version added a fixed 1.6 to ambient and 1.2 to hemi. Those
 * are absolute numbers laid onto a fill that runs about 4.3 to 1 between noon
 * and midnight, so one flash was a modest brightening at noon and a white-out
 * at midnight. Winter in this garden IS midnight, so the worst case was also a
 * quarter of the year.
 *
 * This is the same mistake M1-5 fixed in the other direction: the sky and the
 * light rig each deriving brightness their own way and disagreeing at one hour.
 * The cure is the same. Lift what is there rather than adding to it, and the
 * flash cannot disagree with the hour at any hour.
 *
 * Pure, and separate from `lightingAt`, because the property worth asserting is
 * a comparison BETWEEN hours and a function that takes an hour cannot state it.
 */
export function flashLighting(light, flash = 0, config = GARDEN_CONFIG) {
    const F = config.weather.lightning.flashGain;
    const f = flash > 0 ? flash : 0;
    return {
        ambient: light.ambient * (1 + f * F.ambient),
        hemi: light.hemi * (1 + f * F.hemi)
    };
}

/** How visible the stars are: gone while the sun is up, full once it is well
 *  down. Separate from the light rig because the fade is a property of the
 *  sky rather than of anything the lights do. */
export function starFadeAt(hour, stars = GARDEN_CONFIG.sky.stars, sunCfg = GARDEN_CONFIG.sun) {
    const elevation = solarAt(hour, sunCfg).elevation;
    const t = (elevation - stars.hiddenAboveElevation)
        / (stars.fullBelowElevation - stars.hiddenAboveElevation);
    return smoothstep(t);
}

/**
 * How much of the sky the cloud has taken, 0 for none and 1 for all of it.
 *
 * DELIBERATELY NOT FOLDED INTO `starFadeAt`. That function answers "is the sun
 * down", which is a real and separately testable question with its own tests
 * standing on it. This answers "can anything be seen through the sky at all",
 * and the two multiply at the call site. Keeping them apart is also what lets
 * the MOON read the same number without inheriting the star fade.
 *
 * The ramp is steep on purpose. Cloudy sits at gloom 0.42 and stormy at 0.88, so
 * a linear fade would leave a cloudy night at 58 percent stars, and cloudy is
 * the most common non-clear state in the cycle. Fully open below 0.12 and fully
 * shut by 0.40 puts sunny at full stars, windy (0.24) at about half, which is a
 * night of broken cloud and worth having, and cloudy and stormy at none.
 */
export function starHidingAt(cloud, stars = GARDEN_CONFIG.sky.stars) {
    const t = (clamp01(cloud) - stars.clearBelow) / (stars.overcastAbove - stars.clearBelow);
    return smoothstep(t);
}

/** What survives the cloud, as a multiplier. The stars and both moon terms take
 *  this, so a sky that is a lid is a lid for everything behind it. */
export function skyOpennessAt(cloud, stars = GARDEN_CONFIG.sky.stars) {
    return 1 - starHidingAt(cloud, stars);
}

// ---- Shaders ---------------------------------------------------------------

/**
 * The colour helpers and the gradient itself, as GLSL, exported so the POND
 * can sample the identical function.
 *
 * NOT A COPY OF THE SKY, THE SKY ITSELF. A water surface that approximated the
 * gradient would drift from it the moment anybody retuned a keyframe, and the
 * symptom would be water reflecting a sky nobody can see. Sharing the source
 * makes that impossible, which is the same principle as the ground's daylight
 * deriving from the sky's own shown luminance.
 */
export const SKY_GLSL = `
vec3 gardenSrgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 gardenLinearToSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// The same narrow-gamut ACES approximation three.js uses, repeated here
// because these materials opt out of the renderer's own tone mapping so the
// CPU side can predict the result exactly.
vec3 gardenToneMap(vec3 x) {
    x *= 0.6;
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// The vertical gradient, MIXED IN sRGB and converted afterwards. A linear mix
// between a blue zenith and a warm horizon runs the midpoint through mud.
vec3 gardenSkyLinear(vec3 dir, vec3 zenith, vec3 horizon, float lum, float power) {
    float up = clamp(dir.y, 0.0, 1.0);
    vec3 sky = mix(horizon, zenith, pow(up, power));
    return gardenSrgbToLinear(sky) * lum;
}
`;

const SKY_VERT = `
varying vec3 vDir;
void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = `
precision highp float;
varying vec3 vDir;

uniform vec3  uZenith;      // sRGB 0..1
uniform vec3  uHorizon;     // sRGB 0..1
uniform float uLum;
uniform float uExposure;
uniform float uGradientPower;

uniform vec3  uSunDir;
uniform vec3  uSunColor;    // sRGB 0..1
uniform float uSunCos;      // cos of the disc radius
uniform float uSunSoftCos;  // cos of radius + softness
uniform float uSunDisc;
uniform float uSunGlowPower;
uniform float uSunGlow;
uniform float uSunAureolePower;
uniform float uSunAureole;
uniform float uSunUp;

uniform vec3  uMoonDir;
uniform vec3  uMoonColor;
uniform float uMoonCos;
uniform float uMoonSoftCos;
uniform float uMoonDisc;
uniform float uMoonGlowPower;
uniform float uMoonGlow;
uniform float uMoonUp;

uniform float uStarFade;
uniform float uStarDensity;
uniform float uStarBrightness;
uniform float uStarHorizon;

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// Stars as a hashed grid over the direction. Cheap, fixed to the dome, and it
// costs nothing at all in daylight because the fade multiplies out first.
float starField(vec3 dir) {
    vec2 uv = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0)));
    vec2 cell = floor(uv * uStarDensity);
    float h = hash21(cell);
    // Only a small fraction of cells hold a star, and their brightness varies.
    float present = step(0.9955, h);
    float mag = hash21(cell + 7.13);
    return present * (0.35 + 0.65 * mag);
}

void main() {
    vec3 dir = normalize(vDir);

    // The vertical gradient, from the shared chunk the pond also uses.
    vec3 col = gardenSkyLinear(dir, uZenith, uHorizon, uLum, uGradientPower);

    // Stars, before the sun and moon are added so a bright body drowns them.
    if (uStarFade > 0.001) {
        float horizonMask = smoothstep(0.0, uStarHorizon, dir.y);
        col += vec3(starField(dir)) * uStarFade * uStarBrightness * horizonMask;
    }

    // The sun: a disc with a soft limb, plus a wide bloom and a tight aureole.
    // Two halo terms because the real thing has two and one cannot be both.
    float sunCos = dot(dir, uSunDir);
    vec3 sunLin = gardenSrgbToLinear(uSunColor);
    float disc = smoothstep(uSunSoftCos, uSunCos, sunCos);
    col += sunLin * disc * uSunDisc * uSunUp;
    float g = max(sunCos, 0.0);
    col += sunLin * (pow(g, uSunGlowPower) * uSunGlow
                   + pow(g, uSunAureolePower) * uSunAureole) * uSunUp;

    // The moon: the same idea, softer, and it never saturates.
    float moonCos = dot(dir, uMoonDir);
    vec3 moonLin = gardenSrgbToLinear(uMoonColor);
    float moonDisc = smoothstep(uMoonSoftCos, uMoonCos, moonCos);
    col += moonLin * moonDisc * uMoonDisc * uMoonUp;
    col += moonLin * pow(max(moonCos, 0.0), uMoonGlowPower) * uMoonGlow * uMoonUp;

    gl_FragColor = vec4(gardenLinearToSrgb(gardenToneMap(col * uExposure)), 1.0);
}
`;

// ---- Imperative side -------------------------------------------------------

let dome = null;
let domeMaterial = null;
let sunLight = null;
let moonLight = null;
let hemiLight = null;
let ambientLight = null;
let sceneRef = null;
let rendererRef = null;
let shadowAccum = 0;

/** Set a THREE.Color from a packed hex that is already a SCREEN value, without
 *  letting the renderer convert it out of sRGB a second time. This is the
 *  fog-colour rule from the header, in one function so there is one place to
 *  get it right. */
function setScreenColor(color, hex) {
    color.setHex(hex, THREE.LinearSRGBColorSpace);
}

/**
 * Build the dome and the light rig and attach them to the scene.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 * @param {object} config
 * @param {object} options  { mobile: boolean }
 */
export function initSky(scene, renderer, config = GARDEN_CONFIG, options = {}) {
    sceneRef = scene;
    rendererRef = renderer;
    const S = config.sky;
    const L = S.lighting;

    const rad = (deg) => deg * Math.PI / 180;

    domeMaterial = new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_GLSL + SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        // The shader tone maps and encodes for itself, which is what makes
        // shownColor() an exact prediction rather than an estimate.
        toneMapped: false,
        fog: false,
        uniforms: {
            uZenith: { value: new THREE.Vector3(0, 0, 0) },
            uHorizon: { value: new THREE.Vector3(0, 0, 0) },
            uLum: { value: 1 },
            uExposure: { value: S.exposure },
            uGradientPower: { value: S.gradientPower },

            uSunDir: { value: new THREE.Vector3(0, 1, 0) },
            uSunColor: { value: new THREE.Vector3(1, 1, 1) },
            uSunCos: { value: Math.cos(rad(S.sun.angularDiameterDegrees / 2)) },
            uSunSoftCos: { value: Math.cos(rad(S.sun.angularDiameterDegrees / 2 + S.sun.limbSoftnessDegrees)) },
            uSunDisc: { value: S.sun.discStrength },
            uSunGlowPower: { value: S.sun.glowPower },
            uSunGlow: { value: S.sun.glowStrength },
            uSunAureolePower: { value: S.sun.glowPower * S.sun.aureoleRatio },
            uSunAureole: { value: S.sun.aureoleStrength },
            uSunUp: { value: 1 },

            uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
            uMoonColor: { value: new THREE.Vector3(1, 1, 1) },
            uMoonCos: { value: Math.cos(rad(S.moon.angularDiameterDegrees / 2)) },
            uMoonSoftCos: { value: Math.cos(rad(S.moon.angularDiameterDegrees / 2 + S.moon.limbSoftnessDegrees)) },
            uMoonDisc: { value: S.moon.discStrength },
            uMoonGlowPower: { value: S.moon.glowPower },
            uMoonGlow: { value: S.moon.glowStrength },
            uMoonUp: { value: 0 },

            uStarFade: { value: 0 },
            uStarDensity: { value: S.stars.density },
            uStarBrightness: { value: S.stars.brightness },
            uStarHorizon: { value: Math.sin(rad(S.stars.horizonFadeDegrees)) }
        }
    });

    dome = new THREE.Mesh(new THREE.SphereGeometry(S.domeRadius, 32, 20), domeMaterial);
    dome.name = 'sky';
    dome.frustumCulled = false;
    // Drawn before everything else, and it never writes depth, so the garden
    // always sits in front of it whatever the dome radius is.
    dome.renderOrder = -1000;
    scene.add(dome);

    // The fog fades distant ground into the horizon. Its colour is rewritten
    // every update from the tone-mapped horizon (see the header).
    scene.fog = new THREE.Fog(0x000000, S.fog.near, S.fog.far);

    ambientLight = new THREE.AmbientLight(0xffffff, L.ambientDay);
    ambientLight.name = 'ambientLight';
    scene.add(ambientLight);

    hemiLight = new THREE.HemisphereLight(L.hemiSkyColor, L.hemiGroundColor, L.hemiDay);
    hemiLight.name = 'hemiLight';
    scene.add(hemiLight);

    sunLight = new THREE.DirectionalLight(L.sunColorHigh, L.sunPeak);
    sunLight.name = 'sunLight';
    sunLight.castShadow = true;
    configureShadow(sunLight, L.shadow, options.mobile);
    scene.add(sunLight);
    scene.add(sunLight.target);

    // The moon casts too, which is most of what makes a snowy winter night
    // legible rather than merely bright.
    moonLight = new THREE.DirectionalLight(L.moonColor, 0);
    moonLight.name = 'moonLight';
    moonLight.castShadow = true;
    configureShadow(moonLight, L.shadow, options.mobile);
    scene.add(moonLight);
    scene.add(moonLight.target);

    return { dome, sunLight, moonLight, hemiLight, ambientLight };
}

function configureShadow(light, shadow, mobile) {
    const size = mobile ? shadow.mapSizeMobile : shadow.mapSize;
    light.shadow.mapSize.width = size;
    light.shadow.mapSize.height = size;
    const cam = light.shadow.camera;
    cam.left = -shadow.radius;
    cam.right = shadow.radius;
    cam.top = shadow.radius;
    cam.bottom = -shadow.radius;
    cam.near = 0.5;
    cam.far = shadow.depth;
    light.shadow.bias = shadow.bias;
    light.shadow.normalBias = shadow.normalBias;
}

/**
 * Move the sky to an hour. Called every frame from the conductor.
 *
 * @param {number} hour          in-world hour, 0 to 24
 * @param {number} deltaSeconds  real seconds since the last frame
 * @param {number} snowCoverage  0 to 1, from clock.snowCoverageAt
 * @param {number} gloom         how storm-coloured the sky is
 * @param {number} flash         lightning, 0 to 1
 * @param {number} cloud         from weather.overcastAt. NOT the same as gloom:
 *                               the winter snowfall is a calendar event and
 *                               closes the sky without ever touching gloom.
 */
export function updateSky(hour, deltaSeconds = 0, snowCoverage = 0, gloom = 0, flash = 0, cloud = 0, config = GARDEN_CONFIG) {
    if (!domeMaterial) return null;
    const S = config.sky;
    const u = domeMaterial.uniforms;

    const sky = applyGloom(skyStateAt(hour, S.keys), gloom, S);
    const light = lightingAt(hour, snowCoverage, gloom, cloud, config);

    setVec3FromHex(u.uZenith.value, sky.zenith);
    setVec3FromHex(u.uHorizon.value, sky.horizon);
    // A lightning flash lights the whole cloud base rather than a point, so it
    // arrives as a lift on the sky's own brightness rather than as an object.
    // This term was always RELATIVE and was always right. The two lights below
    // were not. See flashLighting.
    u.uLum.value = sky.lum * (1 + flash * config.weather.lightning.flashGain.sky);

    const sunDir = directionAt(light.sunElevation, light.sunAzimuth);
    const moonDir = directionAt(light.moonElevation, light.moonAzimuth);
    u.uSunDir.value.set(sunDir.x, sunDir.y, sunDir.z);
    u.uMoonDir.value.set(moonDir.x, moonDir.y, moonDir.z);
    setVec3FromHex(u.uSunColor.value, light.sunColor);
    setVec3FromHex(u.uMoonColor.value, light.moonColor);
    // The halo goes with the body rather than snapping off at the horizon, so
    // the glow lingers for a moment after the disc has set.
    u.uSunUp.value = clamp01((light.sunElevation + 6) / 8);
    u.uMoonUp.value = clamp01((light.moonElevation + 4) / 8);

    // CLOUD IS A LID, AND A LID IS OPAQUE TO EVERYTHING BEHIND IT. The stars
    // used to be a function of the sun's elevation and nothing else, so they
    // came out on schedule through rain, snow and a sky the season chip was
    // itself calling cloudy. The moon had the same fault one layer down: its
    // disc and its halo are ADDED over the gloomed sky, so a storm produced a
    // black lid with a bright moon painted on it.
    const open = skyOpennessAt(cloud, S.stars);
    u.uStarFade.value = starFadeAt(hour, S.stars, config.sun) * open;
    u.uMoonDisc.value = S.moon.discStrength * open;
    u.uMoonGlow.value = S.moon.glowStrength * open;

    // The lights. The flash lifts the fill rather than the sun, because what a
    // distant strike actually does is light the sky, and the sky is the fill.
    // It SCALES the fill rather than adding to it, so a midnight flash is as
    // bright relative to midnight as a noon flash is relative to noon.
    const lit = flashLighting(light, flash, config);
    ambientLight.intensity = lit.ambient;
    hemiLight.intensity = lit.hemi;
    hemiLight.color.setHex(light.hemiSky);
    hemiLight.groundColor.setHex(light.hemiGround);

    sunLight.intensity = light.sunIntensity;
    sunLight.color.setHex(light.sunColor);
    placeLight(sunLight, sunDir, S.lighting.shadow.depth);
    sunLight.castShadow = light.sunIntensity > 0.02;

    moonLight.intensity = light.moonIntensity;
    placeLight(moonLight, moonDir, S.lighting.shadow.depth);
    // Only one of the two ever casts, and never both: two shadow maps drawn
    // every refresh for a scene that has one visible light source is a cost
    // with nothing to show for it.
    moonLight.castShadow = !sunLight.castShadow && light.moonIntensity > 0.02;

    // FOG IS A SCREEN VALUE. Set from the tone-mapped, encoded horizon and
    // handed over tagged linear so the renderer does not convert it again.
    if (sceneRef && sceneRef.fog) {
        setScreenColor(sceneRef.fog.color, shownColor(sky.horizon, sky.lum, S.exposure));
    }

    // The sun moves slowly, so the shadow map is refreshed a few times a second
    // rather than every frame. Visually indistinguishable, and it takes a full
    // shadow pass out of most frames.
    if (rendererRef) {
        shadowAccum += deltaSeconds;
        const period = 1 / Math.max(1, S.lighting.shadow.refreshHz);
        if (shadowAccum >= period) {
            shadowAccum = 0;
            rendererRef.shadowMap.needsUpdate = true;
        }
    }

    return light;
}

/** Park a directional light along a direction at shadow-frustum distance, and
 *  aim it at the middle of the plot. */
function placeLight(light, dir, depth) {
    const d = depth * 0.45;
    light.position.set(dir.x * d, Math.max(dir.y * d, 0.5), dir.z * d);
    light.target.position.set(0, 0, 0);
    light.target.updateMatrixWorld();
}

function setVec3FromHex(vec, hex) {
    const [r, g, b] = unpackColor(hex);
    vec.set(r, g, b);
}

export function getSkyDome() { return dome; }
export function getSunLight() { return sunLight; }
export function getMoonLight() { return moonLight; }

export function disposeSky() {
    if (dome && sceneRef) sceneRef.remove(dome);
    if (dome) {
        dome.geometry.dispose();
        dome.material.dispose();
    }
    dome = null;
    domeMaterial = null;
    sunLight = null;
    moonLight = null;
    hemiLight = null;
    ambientLight = null;
    sceneRef = null;
    rendererRef = null;
    shadowAccum = 0;
}
