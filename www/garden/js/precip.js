// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * precip.js - Rain, sleet, and snow, plus the lightning flash.
 *
 * NO PARTICLE IS EVER MOVED ON THE CPU. Both systems bake a box of randomly
 * placed particles once and then compute each one's position in the vertex
 * shader from the elapsed time, so a thousand drops cost one uniform write a
 * frame instead of six thousand float writes and a buffer upload. The box
 * travels with the camera, so the visitor is always in the middle of the
 * weather without anything being respawned.
 *
 * Rain is drawn as line segments rather than points, because a raindrop is a
 * streak and a point cannot be one at any size. Snow is points, because a
 * flake is.
 *
 * The lightning here is deliberately modest: distant strikes above the
 * horizon, a forked channel, and a flash that lifts the sky and the fill
 * rather than lighting an object. Nothing in this garden is ever struck.
 */

import { GARDEN_CONFIG } from './config.min.js';
import { makeRandom } from './species.min.js';
import { unpackColor } from './sky.min.js';
import { solarAt, clamp01, smoothstep, isSnowingAt, seasonAt, WINTER } from './clock.min.js';

// ---- Shaders ---------------------------------------------------------------

const RAIN_VERT = `
uniform float uTime;
uniform float uHeight;
uniform vec3 uWind;
uniform float uSpeed;
uniform float uLength;
uniform float uLeanBase;
uniform float uLeanWind;
attribute float aTop;
attribute float aOffset;
varying float vFade;
void main() {
    vec3 p = position;
    // Wrapped fall. Nothing respawns, nothing is written back: the whole
    // system is a function of time.
    float fall = mod(p.y - uTime * uSpeed + aOffset * uHeight, uHeight);
    p.y = fall;
    // The streak leans with the wind, and its top trails behind its bottom.
    // THE LEAN HAS A FLOOR: scaling it by the wind alone drops rain vertically
    // in a lull, and a vertical line does not read as rain.
    float rainMag = length(vec2(uWind.x, uWind.z));
    vec2 rainDir = rainMag > 0.001 ? vec2(uWind.x, uWind.z) / rainMag : vec2(0.0, 1.0);
    vec2 lean = rainDir * (uLeanBase + uLeanWind * min(rainMag, 1.6));
    p += vec3(lean.x * uLength, uLength, lean.y * uLength) * aTop;
    // The whole column drifts downwind as it falls, and that one tracks the
    // real wind rather than the leaning floor.
    p.xz += vec2(uWind.x, uWind.z) * fall * 0.12;
    vFade = smoothstep(0.0, 0.15, fall / uHeight);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const RAIN_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
void main() {
    gl_FragColor = vec4(uColor, uOpacity * vFade);
}
`;

const SNOW_VERT = `
uniform float uTime;
uniform float uHeight;
uniform vec3 uWind;
uniform float uSpeed;
uniform float uSize;
uniform float uPixelRatio;
attribute float aOffset;
attribute float aPhase;
varying float vFade;
void main() {
    vec3 p = position;
    float fall = mod(p.y - uTime * uSpeed + aOffset * uHeight, uHeight);
    p.y = fall;
    // A flake does not fall straight. Two out of phase swings give it a
    // wander that never repeats visibly.
    float t = uTime + aPhase;
    p.x += sin(t * 0.7) * 0.5 + sin(t * 1.9) * 0.2;
    p.z += cos(t * 0.6) * 0.5 + cos(t * 1.7) * 0.2;
    p.xz += vec2(uWind.x, uWind.z) * fall * 0.20;
    vFade = smoothstep(0.0, 0.1, fall / uHeight);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * uPixelRatio * (14.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
}
`;

const SNOW_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
void main() {
    // A round flake rather than a square one, at the cost of one length().
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if (r > 0.5) discard;
    float soft = 1.0 - smoothstep(0.28, 0.5, r);
    gl_FragColor = vec4(uColor, uOpacity * vFade * soft);
}
`;

const BOLT_VERT = `
attribute float aBright;
varying float vBright;
void main() {
    vBright = aBright;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BOLT_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vBright;
void main() {
    gl_FragColor = vec4(uColor, uOpacity * vBright);
}
`;

// ---- State -----------------------------------------------------------------

let rain = null;
let snow = null;
let bolt = null;
let sceneRef = null;
let cameraRef = null;
let reducedMotion = false;

// The flash envelope, and the accumulator that drives the strike rate. A
// VARYING RATE NEEDS AN ACCUMULATOR rather than a drawn gap: draw a gap from
// the current rate and the distribution is wrong every time the rate moves,
// which is exactly when a storm is building.
let flashLevel = 0;
let flashAge = 1e9;
let strikeAccum = 0;

export function initPrecipitation(scene, camera, config = GARDEN_CONFIG, options = {}) {
    sceneRef = scene;
    cameraRef = camera;
    reducedMotion = !!options.reducedMotion;
    const P = config.weather.precipitation;
    const mobile = !!options.mobile;
    const scale = reducedMotion ? 0.34 : 1;

    const rainCount = Math.round((mobile ? P.rainDropsMobile : P.rainDrops) * scale);
    const snowCount = Math.round((mobile ? P.snowFlakesMobile : P.snowFlakes) * scale);

    rain = buildRain(rainCount, P, config);
    snow = buildSnow(snowCount, P, config, options.pixelRatio || 1);
    bolt = buildBolt(config);

    scene.add(rain.mesh);
    scene.add(snow.mesh);
    scene.add(bolt.mesh);
    return { rain, snow, bolt };
}

function scatter(count, radius, height, seed) {
    const random = makeRandom(seed);
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        // Square root on the radius, or every drop crowds the middle.
        const r = Math.sqrt(random()) * radius;
        const a = random() * Math.PI * 2;
        out[i * 3] = Math.cos(a) * r;
        out[i * 3 + 1] = random() * height;
        out[i * 3 + 2] = Math.sin(a) * r;
    }
    return out;
}

function buildRain(count, P, config) {
    const base = scatter(count, P.radius, P.height, 0x5EED1);
    const position = new Float32Array(count * 6);
    const aTop = new Float32Array(count * 2);
    const aOffset = new Float32Array(count * 2);
    const random = makeRandom(0xBEEF01);

    for (let i = 0; i < count; i++) {
        const o = random();
        for (let end = 0; end < 2; end++) {
            const v = i * 2 + end;
            position[v * 3] = base[i * 3];
            position[v * 3 + 1] = base[i * 3 + 1];
            position[v * 3 + 2] = base[i * 3 + 2];
            aTop[v] = end;
            aOffset[v] = o;
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('aTop', new THREE.BufferAttribute(aTop, 1));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(aOffset, 1));

    const uniforms = {
        uTime: { value: 0 },
        uHeight: { value: P.height },
        uWind: { value: new THREE.Vector3() },
        uSpeed: { value: P.rainSpeed },
        uLength: { value: P.rainLength },
        uLeanBase: { value: P.leanBase },
        uLeanWind: { value: P.leanWind },
        uColor: { value: new THREE.Vector3(...unpackColor(P.rainColor)) },
        uOpacity: { value: 0 }
    };

    const material = new THREE.ShaderMaterial({
        vertexShader: RAIN_VERT,
        fragmentShader: RAIN_FRAG,
        uniforms,
        transparent: true,
        depthWrite: false,
        fog: false
    });

    const mesh = new THREE.LineSegments(geo, material);
    mesh.name = 'rain';
    mesh.frustumCulled = false;
    mesh.visible = false;
    return { mesh, uniforms, material, geo };
}

function buildSnow(count, P, config, pixelRatio) {
    const position = scatter(count, P.radius, P.height, 0x5F0C1E);
    const aOffset = new Float32Array(count);
    const aPhase = new Float32Array(count);
    const random = makeRandom(0xC0FFEE);
    for (let i = 0; i < count; i++) {
        aOffset[i] = random();
        aPhase[i] = random() * Math.PI * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(aOffset, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));

    const uniforms = {
        uTime: { value: 0 },
        uHeight: { value: P.height },
        uWind: { value: new THREE.Vector3() },
        uSpeed: { value: P.snowSpeed },
        uSize: { value: 2.6 },
        uPixelRatio: { value: pixelRatio },
        uColor: { value: new THREE.Vector3(...unpackColor(P.snowColor)) },
        uOpacity: { value: 0 }
    };

    const material = new THREE.ShaderMaterial({
        vertexShader: SNOW_VERT,
        fragmentShader: SNOW_FRAG,
        uniforms,
        transparent: true,
        depthWrite: false,
        fog: false
    });

    const mesh = new THREE.Points(geo, material);
    mesh.name = 'snow';
    mesh.frustumCulled = false;
    mesh.visible = false;
    return { mesh, uniforms, material, geo };
}

function buildBolt(config) {
    const L = config.weather.lightning;
    const position = new Float32Array(L.segments * 2 * 3);
    const aBright = new Float32Array(L.segments * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('aBright', new THREE.BufferAttribute(aBright, 1));

    const uniforms = {
        uColor: { value: new THREE.Vector3(...unpackColor(L.boltColor)) },
        uOpacity: { value: 0 }
    };

    const material = new THREE.ShaderMaterial({
        vertexShader: BOLT_VERT,
        fragmentShader: BOLT_FRAG,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
    });

    const mesh = new THREE.LineSegments(geo, material);
    mesh.name = 'lightning';
    mesh.frustumCulled = false;
    mesh.visible = false;
    return { mesh, uniforms, material, geo, position, aBright };
}

// ---- Lightning (pure parts) ------------------------------------------------

/**
 * The flash envelope: a fast attack and a slow decay, which is the shape of
 * the real thing and the reason a flash reads as electrical rather than as
 * somebody turning a light on.
 */
export function flashAt(age, config = GARDEN_CONFIG) {
    const L = config.weather.lightning;
    if (age < 0) return 0;
    if (age < L.attackSeconds) return age / L.attackSeconds;
    const t = (age - L.attackSeconds) / L.decaySeconds;
    return Math.max(0, Math.exp(-t * 3.2) * (1 - t * 0.25));
}

/**
 * How much of the full strike rate an hour gets, 0 to 1.
 *
 * Thunderstorms are convective and daytime, so the rate follows the sun rather
 * than the calendar. A SMOOTH FUNCTION OF SOLAR ELEVATION rather than a branch
 * on an hour, for the same reason `temperatureAt` is: a threshold on the clock
 * would switch the whole sky's behaviour between two adjacent frames.
 *
 * `nightRate` is the floor, and setting it to 0 makes this the hard cut the
 * request originally asked for. It is a taper because night in this garden is
 * all of winter, and a hard cut takes lightning out of three of the four
 * seasons rather than out of the dark.
 */
export function strikeFactorAt(hour, config = GARDEN_CONFIG) {
    const L = config.weather.lightning;
    // WINTER IS SILENT, AND IT IS A SEASON GATE RATHER THAN A DEEPER TAPER.
    // "No lightning in winter" is a different request from "no lightning at
    // night" (M9) and it has a cleaner answer, because winter IS a season here
    // and can simply be named. Deepening the elevation taper instead would take
    // the storms out of autumn and spring nights as well, which is exactly what
    // the taper was chosen over a cut to protect.
    //
    // The weights already stop winter DRAWING a storm. This stops one that
    // crossed the boundary from late autumn from flashing, which the weights
    // cannot: a dwell runs up to 45 seconds against a 60 second winter.
    if (seasonAt(hour) === WINTER) return L.winterRate;

    const elevation = solarAt(hour, config.sun).elevation;
    const span = L.dayAboveElevation - L.nightBelowElevation;
    const t = span > 0 ? clamp01((elevation - L.nightBelowElevation) / span) : 1;
    return L.nightRate + (1 - L.nightRate) * smoothstep(t);
}

/**
 * How hard the rain and the snow are falling, given the weather and the
 * calendar. 0 to 1 each, and BOTH can be non-zero at once, which is sleet.
 *
 * THIS IS THE ONLY PLACE THAT DECIDES WHAT IS FALLING, and that is the point of
 * it being a pure function rather than four lines inside the frame update. The
 * season chip used to answer the same question separately, off the weather
 * state alone, and so reported "cloudy" over a blizzard: the winter snowfall
 * arrives from the CALENDAR and never touches `weather.rain`. One source, and
 * the chip now reads this.
 */
export function fallRates(weather, hour = 12, config = GARDEN_CONFIG) {
    const P = config.weather.precipitation;
    const rate = weather.rain || 0;
    const kind = weather.precip;

    let rain = kind === 'rain' ? rate : 0;
    let snow = kind === 'snow' ? rate : 0;
    // SLEET IS A MIXTURE, not both systems at full rate. Handing the whole rate
    // to each drew a downpour and a blizzard on top of each other, and the
    // white points won on sheer legibility, so sleet read as plain snow.
    if (kind === 'sleet') {
        rain = rate * P.sleetWet;
        snow = rate * P.sleetWhite;
    }

    // The winter snowfall is a SCHEDULED event rather than a weather one, so it
    // falls whatever the state machine is doing.
    //
    // IT ASKS `isSnowingAt`, AND THAT IS THE WHOLE OF M12-3. This used to test
    // `snowCoverage > 0 && snowCoverage < 1`, with a comment saying plainly
    // that melting counted. Coverage is strictly between 0 and 1 during the
    // MELT, hours 3 to 5, which is the first third of SPRING, so the garden
    // snowed hard all the way through its own thaw. The condition was written
    // to mean "snow is accumulating" and it also matched "snow is
    // disappearing", which is the opposite event.
    //
    // `isSnowingAt` was correct, was tested, and had NO CALLER. The scene held
    // two answers to "is it snowing" and the one nobody ran was the right one.
    // There is one now, and the melt goes back to being what the config comment
    // beside it always said it was: the thaw, and the arrival of spring.
    if (isSnowingAt(hour, config.season)) snow = Math.max(snow, 0.7);

    return { rain, snow };
}

/** Opacity for a fall rate. NOT LINEAR: the windy state's 0.12 is deliberately
 *  light rain, and a linear curve draws light rain as nothing. */
export function fallOpacity(rate, peak, curve) {
    if (!(rate > 0)) return 0;
    return Math.pow(clamp01(rate), curve) * peak;
}

/**
 * Whether a strike happens this frame, and the rate cap that governs it.
 *
 * THE ACCUMULATOR IS THE POINT. Drawing a gap from the current rate is wrong
 * whenever the rate is moving, which in a storm is always. Accumulating
 * expected strikes and firing when the accumulator passes one keeps the
 * long-run rate correct through any amount of change.
 */
export function accumulateStrikes(accum, dt, ratePerSecond, config = GARDEN_CONFIG) {
    const L = config.weather.lightning;
    const capped = Math.min(ratePerSecond, L.maxFlashesPerSecond);
    return accum + capped * dt;
}

/** A forked channel from a point in the sky down toward the horizon. */
function drawBolt(random, config) {
    const L = config.weather.lightning;
    const distance = L.minDistance + random() * (L.maxDistance - L.minDistance);
    const elevation = (L.minElevation + random() * (L.maxElevation - L.minElevation)) * Math.PI / 180;
    const azimuth = random() * Math.PI * 2;

    const topY = Math.tan(elevation) * distance;
    let x = Math.cos(azimuth) * distance;
    let z = Math.sin(azimuth) * distance;
    let y = topY;

    const pos = bolt.position;
    const bright = bolt.aBright;
    const step = topY / L.segments;

    for (let i = 0; i < L.segments; i++) {
        const nx = x + (random() - 0.5) * L.spread;
        const nz = z + (random() - 0.5) * L.spread;
        const ny = Math.max(0, y - step * (0.6 + random() * 0.8));
        const v = i * 2;
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        pos[(v + 1) * 3] = nx; pos[(v + 1) * 3 + 1] = ny; pos[(v + 1) * 3 + 2] = nz;
        // The channel fades toward the ground, which is where a distant bolt
        // is thinnest and most often hidden by whatever is between.
        const b = 1 - (i / L.segments) * 0.55;
        bright[v] = b;
        bright[v + 1] = b;
        x = nx; y = ny; z = nz;
    }
    bolt.geo.attributes.position.needsUpdate = true;
    bolt.geo.attributes.aBright.needsUpdate = true;
}

// ---- Per frame -------------------------------------------------------------

/**
 * @param {object} weather from weather.js
 * NO `snowCoverage` ARGUMENT ANY MORE. It existed only to tell `fallRates`
 * whether the scheduled winter snow was falling, and it got the answer wrong:
 * coverage is strictly between 0 and 1 during the MELT as well as the
 * accumulation, so the garden snowed through its own thaw. `fallRates` asks
 * `isSnowingAt` now, so the coverage is nobody's business here. Removed rather
 * than left unused, for the same reason `rainFill` was deleted rather than
 * zeroed: a live-looking argument that does nothing is a trap for later.
 *
 * @param {number} hour     in-world hour, which decides what is falling
 *        when the weather is merely cloudy
 * @param {number} hour the in-world hour, which the strike rate follows
 * @returns {{flash: number, rain: number, snow: number}} what was actually
 *          drawn this frame. The sky takes the flash and the season chip takes
 *          the two rates, so nothing downstream has to decide for itself what
 *          the weather is doing.
 */
export function updatePrecipitation(dt, time, weather, random = Math.random, hour = 12, config = GARDEN_CONFIG) {
    const P = config.weather.precipitation;
    const L = config.weather.lightning;
    if (!rain || !cameraRef) return { flash: 0, rain: 0, snow: 0 };

    // The box travels with the viewer, so the visitor is always inside the
    // weather and nothing has to be respawned to keep them there.
    const cam = cameraRef.position;
    rain.mesh.position.set(cam.x, 0, cam.z);
    snow.mesh.position.set(cam.x, 0, cam.z);
    bolt.mesh.position.set(cam.x, 0, cam.z);

    const rates = fallRates(weather, hour, config);
    const wetRate = rates.rain;
    const snowRate = rates.snow;

    rain.uniforms.uTime.value = time;
    rain.uniforms.uWind.value.set(weather.wind.x, 0, weather.wind.z);
    rain.uniforms.uOpacity.value = fallOpacity(wetRate, P.rainOpacityPeak, P.rainOpacityCurve);
    rain.mesh.visible = wetRate >= P.visibleRate;

    snow.uniforms.uTime.value = time;
    snow.uniforms.uWind.value.set(weather.wind.x, 0, weather.wind.z);
    snow.uniforms.uOpacity.value = fallOpacity(snowRate, P.snowOpacityPeak, P.rainOpacityCurve);
    snow.mesh.visible = snowRate >= P.visibleRate;

    // ---- Lightning ---------------------------------------------------------
    const stormy = weather.state === 'stormy' || weather.from === 'stormy';
    const strength = stormy ? weather.gloom : 0;
    // THE TAPER GOES IN BEFORE THE ACCUMULATOR, not after. The accumulator is
    // what keeps a varying rate's distribution honest, so scaling the rate it
    // is given is correct and scaling what it produces would defeat it.
    const rate = (strength > 0.5 ? L.strikesPerMinute / 60 : 0)
        * strikeFactorAt(hour, config)
        * (reducedMotion ? L.reducedRate : 1);

    strikeAccum = accumulateStrikes(strikeAccum, dt, rate, config);
    if (strikeAccum >= 1) {
        strikeAccum -= 1;
        drawBolt(random, config);
        flashAge = 0;
        bolt.mesh.visible = true;
    }

    flashAge += dt;
    const peak = reducedMotion ? L.reducedPeak : L.peak;
    flashLevel = flashAt(flashAge, config) * peak;
    bolt.uniforms.uOpacity.value = Math.min(1, flashLevel * 2.2);
    if (flashLevel < 0.01) bolt.mesh.visible = false;

    return { flash: flashLevel, rain: wetRate, snow: snowRate };
}

export function disposePrecipitation() {
    for (const part of [rain, snow, bolt]) {
        if (!part) continue;
        if (sceneRef) sceneRef.remove(part.mesh);
        part.geo.dispose();
        part.material.dispose();
    }
    rain = null;
    snow = null;
    bolt = null;
    sceneRef = null;
    cameraRef = null;
    flashLevel = 0;
    flashAge = 1e9;
    strikeAccum = 0;
}
