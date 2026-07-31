// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * store.js - The Cosmos Construction, and the Infinite Dive
 *
 * Builds the ninth SceneXP micro-environment: the visitor floats in a
 * deep starfield while the Mandelbrot set hangs in the middle of the
 * view like a monument. The set's interior is pure black, its boundary
 * burns neon orange, and the space around it is never fully dark:
 * thousands of stars and wide faint nebulae keep the void softly
 * illuminated.
 *
 * The shared scene part (scene-1.0.0.js) builds a daytime patio sky by
 * default: a gradient dome, a sun, a moon, its own small star dome, and
 * drifting clouds. None of that belongs in deep space, so initStore
 * begins by removing those named groups and replacing them wholesale
 * (clearSharedSky below). main.js cooperates by never calling
 * updateDayNightCycle, so nothing repaints the sky after we clear it.
 *
 * THE INFINITE DIVE (round 3: the TUNNEL). The zoom controls do not
 * drive a lens here: they drive depth. The dive keeps a continuous
 * depth Z in doublings of magnification and renders the set as LEVELS,
 * where level L covers span0 / 2^L of the complex plane around ONE
 * fixed target point (config fractal.dive): the Misiurewicz point
 * M(24,2) in Seahorse Valley, the burning seam where the set's two
 * great circles pinch together, refined to full double precision so
 * the boundary's self-similar spirals never run out beneath the dive.
 *
 * The levels are not stacked flat. Each level is a fixed-size plane
 * whose DISTANCE from the camera doubles per level: the current level
 * sits at the composed distance, the next twice as far, the previous
 * half as far. Because every level shows half its parent's span on the
 * same-size plane, the 2:1 distance ratio makes their projections tile
 * EXACTLY (tan-linear planes: a feature at complex offset d projects to
 * the same screen angle from every level that renders it). Diving
 * therefore moves the world, not a scale factor: planes physically fly
 * past the camera, and three more cues ride along - each plane is
 * DISPLACED TERRAIN (the worker returns a relief lattice, so the neon
 * boundary rises as ridges that loom and shear in perspective), the
 * whole stack ROLLS slowly with depth (the classic deep-zoom
 * corkscrew), and a faint field of dust motes streams by with real
 * depth attenuation whenever the dive has velocity.
 *
 * Rendering is fed by a POOL of 2-4 classic workers (by core count,
 * js/fractal-worker.min.js). Levels are independent, so each worker
 * takes a whole level (no tile reassembly) and the pool precomputes the
 * next few levels while the visitor crosses the current one. Level 0 is
 * rendered synchronously at init. All world positions are computed in
 * JS doubles each frame, so float32 scene-graph precision never becomes
 * the limit; the real floor is double precision itself (config
 * fractal.floorDoublings), where the dive glides to a stop and main.js
 * tells the story.
 *
 * COSMOS PLAN (viewed from the fixed camera, looking down -Z):
 *
 *        nebulae, on a far sphere
 *      *      .    *        .      *     .
 *         .      +-------------+      *
 *      *    dust | THE SET     |   .        deeper levels
 *          .   ' |  (black on  | '    *       recede down
 *      .       ' |   orange)   | '  .          the tunnel
 *         *      +-------------+  *
 *      .     *       .    *     .     *
 */

import { getScene, getCamera } from '../../shared/js/scene-1.0.0.min.js';
import { initWorld, registerOutdoorProp, isMobileDevice } from '../../shared/js/world-1.0.0.min.js';
import { MANDELBROT_CONFIG } from './config.min.js';

// World mesh groups and animated references
let cosmosGroup = null;    // the root: starfield, nebulae, fractal
let starLayers = [];       // [{ points, material, baseOpacity, phase, speed }]
let elapsed = 0;

// Visitors who ask for reduced motion get a still cosmos: the starfield
// holds, the twinkle stops, and the decorative dust stays hidden. The
// dive itself still responds (it only ever moves when the visitor asks).
const _reducedMotion = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

// ============================================
// LAYOUT
// ============================================
// Everything is composed around the fractal tunnel, centered dead ahead
// of the fixed camera. The stars and nebulae live on far
// shells so the parallax-free backdrop reads as infinitely distant. All
// meters.
const LAYOUT = {
    // The Mandelbrot planes: squares, facing the camera. size is each
    // level's fixed world size; z is where the CURRENT level sits (the
    // composed monument distance), deeper levels doubling away behind it.
    fractal: { x: 0, y: 1.3, z: -3.0, size: 3.3 },
    stars: { radiusMin: 250, radiusMax: 290 },
    nebulaRadius: 300,
    // The dust field the dive streams through: a box between the camera
    // (z 0.6) and the resting fractal plane (z -3.0).
    dust: { x: 2.2, y: 1.5, zNear: 0.3, zFar: -2.8 }
};

// The cosmos palette. The space between the stars is deep indigo on
// purpose: all that starlight and nebula glow adds up, so the void is
// never a dead black. Only the inside of the set gets true black.
const PALETTE = {
    space: 0x0b0e20,          // the softly illuminated background
    starWhite: 0xffffff,
    starBlue: 0xbfd2ff,
    starWarm: 0xffe3c2,
    dustBlue: 0xcfe0ff,       // motes streaming past during the dive
    dustEmber: 0xff9a40,      // a few sparks of the boundary's fire
    neonOrange: '#ff7a1a',    // the burning boundary
    emberDeep: '#3a1102'      // the far outer wash of the glow ramp
};

// ============================================
// CLEARING THE SHARED SKY
// ============================================

/** Remove the shared scene's daytime sky (dome, sun, moon, its small star
 *  dome, and the clouds), kill the fog, and settle the lights into a dim
 *  steady spacelight. Everything we draw is self-lit (basic materials,
 *  points, and sprites), so the lights only matter if a future
 *  contributor adds a lit mesh; they get a cool faint ambience to land in. */
function clearSharedSky(scene) {
    ['sky', 'sun', 'moon', 'stars', 'clouds'].forEach((name) => {
        const obj = scene.getObjectByName(name);
        if (!obj) return;
        obj.traverse((o) => {
            if (o.isMesh || o.isPoints) {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    if (o.material.map) o.material.map.dispose();
                    o.material.dispose();
                }
            }
        });
        scene.remove(obj);
    });

    // Space has no atmosphere to fog through, and no horizon to hide.
    scene.fog = null;
    scene.background = new THREE.Color(PALETTE.space);

    const ambient = scene.getObjectByName('ambientLight');
    if (ambient) {
        ambient.color.setHex(0x8fa3d9);   // cool accumulated starlight
        ambient.intensity = 0.35;
    }
    const hemi = scene.getObjectByName('hemiLight');
    if (hemi) {
        hemi.color.setHex(0x9db4ff);
        hemi.groundColor.setHex(0x1a1430);
        hemi.intensity = 0.15;
    }
    const dir = scene.getObjectByName('dirLight');
    if (dir) {
        dir.intensity = 0.05;             // no sun out here
        dir.castShadow = false;           // and nothing to shadow
    }
}

// ============================================
// TEXTURES (procedural, canvas-based)
// ============================================
function makeCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
}

/** A thin soft ring for the touchpoint markers, drawn NEUTRAL WHITE on
 *  purpose: the sprite material's color tints it, and a white source
 *  keeps those tints clean (an orange source would muddy them). */
function createRingTexture() {
    const canvas = makeCanvas(64, 64);
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 5;
    ctx.shadowColor = 'rgba(235,245,255,0.9)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(32, 32, 24, 0, Math.PI * 2);
    ctx.stroke();
    return new THREE.CanvasTexture(canvas);
}

/** A tiny soft dot, shared by the star layers and the dive dust, so
 *  points render as round twinkles instead of hard squares. */
function createStarDotTexture() {
    const canvas = makeCanvas(32, 32);
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(canvas);
}

/** A wide faint nebula: a few overlapping soft blobs of one hue. These
 *  are the main reason the void reads as illuminated instead of black. */
function createNebulaTexture(hue) {
    const size = 256;
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const blobs = [
        { x: 128, y: 128, r: 120, a: 0.30 },
        { x: 84, y: 96, r: 76, a: 0.24 },
        { x: 176, y: 150, r: 84, a: 0.22 },
        { x: 120, y: 184, r: 60, a: 0.18 },
        { x: 180, y: 76, r: 56, a: 0.16 }
    ];
    blobs.forEach((b) => {
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        grad.addColorStop(0, hexToRgba(hue, b.a));
        grad.addColorStop(1, hexToRgba(hue, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
    });
    return new THREE.CanvasTexture(canvas);
}

/** '#rrggbb' + alpha -> 'rgba(r,g,b,a)' for the canvas painters above. */
function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// ============================================
// THE STARFIELD
// ============================================

/** Thousands of stars on a full sphere: above, below, and behind, because
 *  there is no ground in space and the pan and tilt controls can look
 *  anywhere. Three layers give color variety and let the twinkle phases
 *  differ per layer instead of per star (cheap and convincing). */
function createStarfield(dotTexture) {
    const mobile = isMobileDevice();
    const layers = [
        { color: PALETTE.starWhite, count: mobile ? 750 : 1500, size: 2.2, baseOpacity: 0.9, speed: 0.9 },
        { color: PALETTE.starBlue, count: mobile ? 320 : 650, size: 3.0, baseOpacity: 0.8, speed: 0.6 },
        { color: PALETTE.starWarm, count: mobile ? 230 : 450, size: 2.6, baseOpacity: 0.75, speed: 0.45 }
    ];

    layers.forEach((layer, li) => {
        const positions = new Float32Array(layer.count * 3);
        for (let i = 0; i < layer.count; i++) {
            // Uniform direction on the sphere (acos keeps the poles honest)
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = LAYOUT.stars.radiusMin +
                Math.random() * (LAYOUT.stars.radiusMax - LAYOUT.stars.radiusMin);
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi);
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: layer.color,
            size: layer.size,
            sizeAttenuation: false,
            map: dotTexture,
            transparent: true,
            opacity: layer.baseOpacity,
            depthWrite: false,
            fog: false
        });

        const points = new THREE.Points(geometry, material);
        points.name = `starLayer_${li}`;
        cosmosGroup.add(points);
        starLayers.push({
            points,
            material,
            baseOpacity: layer.baseOpacity,
            phase: li * 2.1,
            speed: layer.speed
        });
    });
}

// ============================================
// NEBULAE
// ============================================
// (This scene once carried a set of spiral and elliptical galaxy
// sprites too; Steve had them removed as too busy. The nebulae stay:
// they are the reason the void reads as softly illuminated.)

// Fixed placements, composed by hand: the brightest sit inside the
// default landscape frame (the -Z hemisphere). Directions are
// normalized onto the nebula shell at build time.
const NEBULAE = [
    { dir: { x: -0.45, y: 0.20, z: -0.87 }, scale: 220, hue: '#25336e', opacity: 0.30 },
    { dir: { x: 0.55, y: -0.30, z: -0.78 }, scale: 190, hue: '#3a2560', opacity: 0.26 },
    { dir: { x: 0.10, y: 0.75, z: -0.65 }, scale: 200, hue: '#173d52', opacity: 0.24 },
    { dir: { x: -0.30, y: -0.70, z: 0.65 }, scale: 210, hue: '#301d4a', opacity: 0.22 },
    { dir: { x: 0.80, y: 0.35, z: 0.49 }, scale: 180, hue: '#1d2f5e', opacity: 0.22 },
    // One faint warm nebula, an echo of the boundary's fire.
    { dir: { x: -0.75, y: 0.55, z: 0.37 }, scale: 170, hue: '#4a2410', opacity: 0.20 }
];

/** Place a sprite on a far shell along a hand-composed direction. */
function placeOnShell(sprite, dir, radius) {
    const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z) || 1;
    sprite.position.set(
        (dir.x / len) * radius,
        (dir.y / len) * radius,
        (dir.z / len) * radius
    );
}

/** The nebulae: huge, faint, additive washes of color on the farthest
 *  shell. Not clickable on purpose: they would swallow every tap. */
function createNebulae() {
    NEBULAE.forEach((n, i) => {
        const material = new THREE.SpriteMaterial({
            map: createNebulaTexture(n.hue),
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: n.opacity,
            depthWrite: false,
            fog: false,
            rotation: i * 1.3
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(n.scale, n.scale, 1);
        placeOnShell(sprite, n.dir, LAYOUT.nebulaRadius);
        sprite.name = `nebula_${i}`;
        cosmosGroup.add(sprite);
    });
}

// ============================================
// THE MANDELBROT SET: RENDERING ONE FRAME
// ============================================

/** Plain HSL -> {r,g,b} 0-255, for the hue-cycled glow ramps.
 *  KEEP IN SYNC with js/fractal-worker.js, which carries a deliberate
 *  copy (a classic worker cannot import this module). */
function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else { r = c; b = x; }
    const m = l - c / 2;
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/** The three anchor colors of the glow ramp for one hue: a dark ember,
 *  the bright neon edge, and the near-white hot core. At hue 25 these
 *  land on the classic orange ramp the scene launched with. */
function rampForHue(hue) {
    return {
        ember: hslToRgb(hue - 9, 0.93, 0.12),
        neon: hslToRgb(hue, 1, 0.55),
        hot: hslToRgb(hue + 10, 1, 0.81)
    };
}

/** The hue a level renders with: the classic orange until the color
 *  cycle's start level, then a steady drift that BOUNCES between the
 *  configured band ends (a triangle wave), so the cycle stays in the
 *  warm gold-to-violet band and never wraps through green or blue.
 *  Depends only on the level number, so re-rendered frames match. */
function hueForLevel(level) {
    const cc = MANDELBROT_CONFIG.fractal.colorCycle;
    const range = cc.maxHue - cc.minHue;
    const travel = (cc.baseHue - cc.minHue) +
        Math.max(0, level - cc.startLevel) * cc.degreesPerLevel;
    let phase = travel % (2 * range);
    if (phase > range) phase = 2 * range - phase;
    return cc.minHue + phase;
}

/** The glow ramp for escaped points. g runs 0 (escaped instantly, far
 *  from the set) to 1 (barely escaped, hugging the boundary): deep ember
 *  far out, the ramp's neon color approaching the edge, near-white hot
 *  on it. KEEP IN SYNC with js/fractal-worker.js. */
function boundaryColor(g, ramp) {
    // Two-stop lerp: ember -> neon at 0.75, neon -> hot above.
    const neonAt = 0.75;
    let r, grn, b;
    if (g < neonAt) {
        const t = g / neonAt;
        r = ramp.ember.r + t * (ramp.neon.r - ramp.ember.r);
        grn = ramp.ember.g + t * (ramp.neon.g - ramp.ember.g);
        b = ramp.ember.b + t * (ramp.neon.b - ramp.ember.b);
    } else {
        const t = (g - neonAt) / (1 - neonAt);
        r = ramp.neon.r + t * (ramp.hot.r - ramp.neon.r);
        grn = ramp.neon.g + t * (ramp.hot.g - ramp.neon.g);
        b = ramp.neon.b + t * (ramp.hot.b - ramp.neon.b);
    }
    return { r, g: grn, b };
}

/** Exposure-normalized glow value for one smooth escape count. */
function glowOf(nu, nuLo, W) {
    return Math.pow(Math.min(1, Math.max(0, (nu - nuLo) / W)), 1.35);
}

/** Render one frame of the set synchronously, by escape-time iteration:
 *  black opaque interior, transparent far field, glowing boundary, plus
 *  the relief lattice for the displaced plane. Used only for level 0 at
 *  init (deeper levels come from the worker pool, which carries a copy
 *  of this math). Also returns the adaptive exposure ramp it used
 *  (nuLo / W), which the dive chains into every deeper frame: each
 *  level anchors its glow to its own escape-count floor, EMA-blended
 *  with its parent's, so the deep frames keep the black-void-and-neon-
 *  edge character instead of washing out white-hot. */
function renderFrame(center, span, size, maxIter, grid, hue) {
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const data = img.data;
    const ramp = rampForHue(typeof hue === 'number' ? hue : MANDELBROT_CONFIG.fractal.colorCycle.baseHue);

    const reMin = center.re - span / 2;
    const imMin = center.im - span / 2;
    const step = span / size;
    const invLog2 = 1 / Math.LN2;

    // Pass 1: smooth escape counts (-1 marks interior) and a sparse
    // subsample for the percentiles.
    const nus = new Float32Array(size * size);
    const sample = [];

    for (let py = 0; py < size; py++) {
        const ci = imMin + py * step;
        for (let px = 0; px < size; px++) {
            const cr = reMin + px * step;
            let zr = 0, zi = 0, zr2 = 0, zi2 = 0, n = 0;
            while (zr2 + zi2 <= 4 && n < maxIter) {
                zi = 2 * zr * zi + ci;
                zr = zr2 - zi2 + cr;
                zr2 = zr * zr;
                zi2 = zi * zi;
                n++;
            }

            const at = py * size + px;
            if (n >= maxIter) {
                nus[at] = -1;
            } else {
                const logZn = Math.log(zr2 + zi2) / 2;
                nus[at] = n + 1 - Math.log(logZn * invLog2) * invLog2;
                if ((py & 3) === 0 && (px & 3) === 0) sample.push(nus[at]);
            }
        }
    }

    let nuLo = 0;
    let W = maxIter * 0.45;
    if (sample.length >= 50) {
        sample.sort((a, b) => a - b);
        nuLo = sample[Math.floor(sample.length * 0.05)];
        const p99 = sample[Math.min(sample.length - 1, Math.floor(sample.length * 0.99))];
        W = Math.max(40, (p99 - nuLo) * 1.3);
    }

    // Pass 2: colorize from the stored counts.
    for (let i = 0; i < nus.length; i++) {
        const idx = i * 4;
        const value = nus[i];
        if (value < 0) {
            // Inside the set: the one truly black thing in the scene.
            data[idx + 3] = 255;
        } else {
            const g = glowOf(value, nuLo, W);
            const c = boundaryColor(g, ramp);
            data[idx] = Math.min(255, c.r);
            data[idx + 1] = Math.min(255, c.g);
            data[idx + 2] = Math.min(255, c.b);
            // Far field fades to fully transparent so the stars and
            // nebulae show through right up to the ember wash.
            data[idx + 3] = Math.min(255, Math.round(g * 640));
        }
    }
    ctx.putImageData(img, 0, 0);

    // Pass 3: the relief lattice (row 0 = top of frame, PlaneGeometry order).
    const heights = new Float32Array((grid + 1) * (grid + 1));
    for (let gy = 0; gy <= grid; gy++) {
        const sy = Math.min(size - 1, Math.round(gy * (size - 1) / grid));
        for (let gx = 0; gx <= grid; gx++) {
            const sx = Math.min(size - 1, Math.round(gx * (size - 1) / grid));
            const nuv = nus[sy * size + sx];
            heights[gy * (grid + 1) + gx] = nuv < 0 ? 0 : glowOf(nuv, nuLo, W);
        }
    }

    return { canvas, heights, nuLo, W };
}

/** The bloom pass: a blurred half-size copy of a frame, drawn by an
 *  additive halo plane behind the sharp one. Half size on purpose: the
 *  blur erases the detail anyway and the smaller canvas keeps the
 *  per-level cost to a few milliseconds. */
function makeHaloCanvas(sharpCanvas) {
    const size = Math.max(256, sharpCanvas.width / 2);
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.filter = `blur(${Math.max(3, Math.round(size / 96))}px)`;
    ctx.drawImage(sharpCanvas, 0, 0, size, size);
    ctx.filter = 'none';
    return canvas;
}

// ============================================
// THE DIVE ENGINE
// ============================================
// Depth is measured in doublings of magnification, Z. Level L covers
// span0 / 2^L around the ONE fixed dive target, and sits at distance
// refDist * 2^(L - Z) from the camera: at Z = L it is at the composed
// monument distance, deeper levels twice as far each, shallower levels
// rushing past. All distances are computed in JS doubles per frame.

const dive = {
    z: 0,                 // current depth, in doublings
    targetZ: 0,           // where the inputs are asking to be
    vel: 0,               // measured dZ/dt, for the dust and the glow
    maxZ: 0,              // deepest point reached this visit (telemetry)
    reveal: 0,            // 0 at rest (monument alone), eases to 1 in flight
    levels: new Map(),    // level index -> record
    normCache: new Map(), // level index -> { nuLo, W }, kept past eviction:
                          // a re-rendered level reuses its exact exposure
                          // ramp, so the ride out replays the ride in
    group: null,          // all level planes hang here
    workers: [],          // the render pool: [{ worker, busy, level }]
    requested: new Set(), // level indexes currently at a worker
    workerDead: false,    // no pool could be started at all
    floor: 38.5,          // overwritten from config at init
    revealZ: 2.6,         // depth where the tunnel resolves (from config)
    target: null,         // the boundary point the dive falls toward
    targetIndex: 0,       // its index in config fractal.targets
    gen: 0,               // bumped on retarget; stale worker frames are dropped
    markers: [],          // touchpoint sprites on the resting monument
    markersGroup: null,
    dust: null            // { blue, ember } mote fields
};

/** Iteration budget for a level: deeper frames need more iterations to
 *  resolve the boundary, so the budget climbs linearly with depth. */
function maxIterFor(level) {
    const f = MANDELBROT_CONFIG.fractal;
    const mobile = isMobileDevice();
    const base = mobile ? f.maxIterMobile : f.maxIter;
    const per = mobile ? f.iterPerLevelMobile : f.iterPerLevel;
    return Math.round(base + per * level);
}

function textureSize() {
    const f = MANDELBROT_CONFIG.fractal;
    return isMobileDevice() ? f.textureSizeMobile : f.textureSize;
}

function reliefGrid() {
    const f = MANDELBROT_CONFIG.fractal;
    return isMobileDevice() ? f.relief.gridMobile : f.relief.grid;
}

// Flat shared geometry for the halo planes (never disposed per level).
let haloGeometry = null;

/** A displaced plane geometry from a worker relief lattice: unit-height
 *  ridges (scaled per frame via mesh.scale.z), rows top-down, matching
 *  both PlaneGeometry's vertex order and the texture orientation. */
function buildReliefGeometry(heights, grid) {
    const geometry = new THREE.PlaneGeometry(LAYOUT.fractal.size, LAYOUT.fractal.size, grid, grid);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
        position.setZ(i, heights[i]);
    }
    return geometry;
}

/** Build the displaced plane (and its additive halo) for a rendered frame
 *  and file the level record. Fresh levels fade in over a third of a
 *  second so the resolution never pops. */
function adoptLevel(level, sharpCanvas, heights, norm) {
    const sharpTexture = new THREE.CanvasTexture(sharpCanvas);
    sharpTexture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
        map: sharpTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false
    });
    const plane = new THREE.Mesh(buildReliefGeometry(heights, reliefGrid()), material);
    plane.renderOrder = 10 + level * 2;
    dive.group.add(plane);

    // Halos everywhere on desktop; phones keep only level 0's (each halo
    // is another full-screen transparent quad, and mobile fill rate is
    // the scene's tightest budget).
    let halo = null;
    if (level === 0 || !isMobileDevice()) {
        const haloTexture = new THREE.CanvasTexture(makeHaloCanvas(sharpCanvas));
        haloTexture.colorSpace = THREE.SRGBColorSpace;
        const haloMaterial = new THREE.MeshBasicMaterial({
            map: haloTexture,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            fog: false
        });
        halo = new THREE.Mesh(haloGeometry, haloMaterial);
        halo.renderOrder = 9 + level * 2;
        dive.group.add(halo);
    }

    const record = { level, plane, halo, norm, fade: 0 };
    dive.levels.set(level, record);
    dive.normCache.set(level, norm);
    return record;
}

/** Drop a level's GPU resources (the shared halo geometry stays). */
function evictLevel(level) {
    const record = dive.levels.get(level);
    if (!record) return;
    record.plane.geometry.dispose();
    [record.plane, record.halo].forEach((mesh) => {
        if (!mesh) return;
        if (mesh.material.map) mesh.material.map.dispose();
        mesh.material.dispose();
        dive.group.remove(mesh);
    });
    dive.levels.delete(level);
}

/** Keep the pool fed: every missing level in the working window goes to
 *  an idle worker, nearest-needed first. With 2-4 workers this is the
 *  precompute buffer: the next few levels render in parallel while the
 *  visitor crosses the current one. */
function ensureLevels() {
    if (dive.workerDead || !dive.workers.length) return;

    const f = MANDELBROT_CONFIG.fractal;
    const baseLevel = Math.max(0, Math.floor(dive.z));
    // Several below the floor too: those planes are on screen (huge,
    // behind the current one) while they pass, and on the way back OUT
    // they are the ones being re-entered, so evicted shallow levels
    // re-render a few steps before the dive reaches them.
    const first = Math.max(0, baseLevel - 3);
    const last = Math.min(Math.ceil(dive.floor) + 1, baseLevel + 4);

    for (let level = first; level <= last; level++) {
        if (dive.levels.has(level) || dive.requested.has(level)) continue;
        const slot = dive.workers.find((w) => !w.busy);
        if (!slot) return;

        // A level rendered before reuses its exact cached exposure ramp,
        // so the ride out replays the ride in. A first-time level chains
        // from its nearest ready neighbor (shallower preferred), so the
        // glow adapts smoothly down the tunnel. Chaining from a DISTANT
        // shallow anchor is the one forbidden move: a surface-calibrated
        // ramp saturates a deep frame into a flat white-hot sheet.
        const cached = dive.normCache.get(level) || null;
        let parentNorm = null;
        if (!cached) {
            for (let step = 1; step <= 2 && !parentNorm; step++) {
                const below = dive.levels.get(level - step);
                const above = dive.levels.get(level + step);
                parentNorm = (below && below.norm) || (above && above.norm) || null;
            }
        }

        slot.busy = true;
        slot.level = level;   // so a worker crash can release its claim
        dive.requested.add(level);
        slot.worker.postMessage({
            gen: dive.gen,
            level,
            re: dive.target.re,
            im: dive.target.im,
            span: f.span / Math.pow(2, level),
            size: textureSize(),
            maxIter: maxIterFor(level),
            grid: reliefGrid(),
            hue: hueForLevel(level),
            feather: level > 0,   // soft edges; level 0 fades out on its own
            fixedNuLo: cached ? cached.nuLo : null,
            fixedW: cached ? cached.W : null,
            parentNuLo: parentNorm ? parentNorm.nuLo : null,
            parentW: parentNorm ? parentNorm.W : null
        });
    }
}

function onWorkerMessage(slot, event) {
    slot.busy = false;
    const msg = event.data;
    if (!msg || typeof msg.level !== 'number') return;
    // A frame rendered for a previous target: drop it (the slot is free
    // again, so ensureLevels can put the worker onto current work).
    if (msg.gen !== dive.gen) {
        ensureLevels();
        return;
    }
    dive.requested.delete(msg.level);
    if (!dive.levels.has(msg.level)) {
        const canvas = makeCanvas(msg.size, msg.size);
        canvas.getContext('2d').putImageData(
            new ImageData(new Uint8ClampedArray(msg.pixels), msg.size, msg.size), 0, 0);
        adoptLevel(msg.level, canvas, new Float32Array(msg.heights),
            { nuLo: msg.nuLo, W: msg.W });
    }
    ensureLevels();
}

/** The deepest level reachable from the viewpoint with no gaps: the
 *  dive can only advance into rendered content, so this (plus a little
 *  headroom) is the live "in" limit while the pool catches up. The walk
 *  first drops to the deepest READY level at or below the viewpoint
 *  (the current level may still be rendering; starting the upward walk
 *  from a missing level would re-grant headroom on every level crossed
 *  and let a persistent zoom ratchet past unrendered content), then
 *  climbs the contiguous ready run above it. */
function contentDepthLimit() {
    let level = Math.max(0, Math.floor(dive.z));
    while (level > 0 && !dive.levels.has(level)) level--;
    while (dive.levels.has(level + 1)) level++;
    return Math.min(dive.floor, level + 1.6);
}

/** The mirror gate for the way OUT: the shallowest level reachable from
 *  the current one with no gaps. Shallow levels evicted on the way down
 *  re-render on the way up (ensureLevels), and the dive must not outrun
 *  them: retreating past missing planes leaves the visible stack a
 *  shrinking square adrift in raw space. */
function contentShallowLimit() {
    let level = Math.max(0, Math.floor(dive.z));
    while (level > 0 && dive.levels.has(level - 1)) level--;
    return level;
}

// ---- Public dive API (main.js wires the shared controls to these) ----------

/** Nudge the dive by a signed number of doublings (positive = deeper).
 *  Comes from the shared pan part's zoom delegate: buttons and keys
 *  stream speed * dt, a pinch sends log2 of its spread factor. */
export function diveBy(deltaDoublings) {
    if (typeof deltaDoublings !== 'number' || !isFinite(deltaDoublings)) return;
    dive.targetZ = Math.min(dive.floor, Math.max(0, dive.targetZ + deltaDoublings));
}

/** Snap the dive straight back to the surface (the reset button):
 *  magnification 1, the tunnel hidden again (the reveal eases itself
 *  out over the next few frames, so the monument fades back in rather
 *  than popping), and the touchpoints awake. Levels and caches are
 *  deliberately left alone: the keep-window evicts whatever no longer
 *  matters on its own, and a later dive replays its cached exposure. */
export function resetDive() {
    dive.z = 0;
    dive.targetZ = 0;
    dive.vel = 0;
}

/** Dive status for the chip, the button dimming, and the telemetry. */
export function getDiveState() {
    const limit = contentDepthLimit();
    return {
        z: dive.z,
        magnification: Math.pow(2, dive.z),
        maxZ: dive.maxZ,
        diving: Math.abs(dive.vel) > 0.02 || Math.abs(dive.targetZ - dive.z) > 0.01,
        atFloor: dive.z >= dive.floor - 0.05,
        atIn: dive.targetZ >= limit - 1e-3,
        atOut: dive.targetZ <= (dive.z >= dive.revealZ
            ? contentShallowLimit() : 0) + 1e-3
    };
}

// ---- The touchpoints -------------------------------------------------------

/** The glowing rings on the resting monument: one per configured dive
 *  target, each sitting on the exact boundary point it names. Visible
 *  only at magnification 1; a tap re-aims the whole dive. */
function createTouchpoints(ringTexture) {
    const f = MANDELBROT_CONFIG.fractal;
    dive.markersGroup = new THREE.Group();
    dive.markersGroup.name = 'touchpoints';
    dive.markers = [];
    f.targets.forEach((t, index) => {
        const material = new THREE.SpriteMaterial({
            map: ringTexture,
            transparent: true,
            opacity: 0.75,
            depthWrite: false,
            fog: false
        });
        const sprite = new THREE.Sprite(material);
        sprite.renderOrder = 200;
        const holder = new THREE.Group();
        holder.add(sprite);
        holder.userData.targetIndex = index;
        registerOutdoorProp(holder, 'touchpoint');
        dive.markersGroup.add(holder);
        dive.markers.push({ sprite, holder, index, selected: false });
    });
    dive.group.add(dive.markersGroup);
    layoutTouchpoints();
}

/** Position each marker relative to the CURRENT target (the tunnel's
 *  axis) and highlight the selected one. With the resting slide, each
 *  marker lands exactly on its boundary point in the monument picture.
 *  The palette deliberately leaves orange to the fractal: unselected
 *  rings are cool ice blue (nothing on the burning edge is blue, so
 *  they read as UI, not artifacts), and the selected one is the mint
 *  green the site uses everywhere for an engaged control. */
function layoutTouchpoints() {
    const f = MANDELBROT_CONFIG.fractal;
    const k0 = LAYOUT.fractal.size / f.span;
    dive.markers.forEach((m) => {
        const t = f.targets[m.index];
        m.holder.position.set(
            (t.re - dive.target.re) * k0,
            -(t.im - dive.target.im) * k0,
            0
        );
        m.selected = m.index === dive.targetIndex;
        m.sprite.material.color.setHex(m.selected ? 0xaef0c8 : 0x8fd2ff);
        m.baseScale = m.selected ? 0.2 : 0.14;
        m.sprite.scale.setScalar(m.baseScale);
    });
}

/** The touchpoint prop groups, for main.js's tap raycast. */
export function getTouchpointGroups() {
    return dive.markers.map((m) => m.holder);
}

/** Re-aim the whole dive at another configured target (a touchpoint
 *  tap; only reachable at the surface, where the markers live). The
 *  monument never changes: it is target-independent, and the tunnel
 *  levels simply evict and re-render around the new point, with frames
 *  still in flight for the old one dropped by the generation stamp.
 *  Returns the target's label, or null if unknown or already current. */
export function selectDiveTarget(index) {
    const f = MANDELBROT_CONFIG.fractal;
    const t = f.targets[index];
    if (!t || index === dive.targetIndex) return null;
    dive.targetIndex = index;
    dive.target = t;
    dive.gen++;
    [...dive.levels.keys()].filter((level) => level !== 0).forEach(evictLevel);
    dive.requested.clear();
    // Keep level 0's exposure ramp (target-independent); everything
    // deeper was exposed for the old target's path.
    const zeroNorm = dive.normCache.get(0);
    dive.normCache = new Map(zeroNorm ? [[0, zeroNorm]] : []);
    layoutTouchpoints();
    ensureLevels();
    return t.label;
}

// ---- The dust field --------------------------------------------------------

/** The motes the dive streams through: invisible at rest, streaming past
 *  the camera (with real depth attenuation, reinforcing the tunnel's own
 *  motion parallax) whenever the dive has velocity. */
function createDust(dotTexture) {
    const D = LAYOUT.dust;
    const makeField = (count, color, size) => {
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() * 2 - 1) * D.x;
            positions[i * 3 + 1] = LAYOUT.fractal.y + (Math.random() * 2 - 1) * D.y;
            positions[i * 3 + 2] = D.zFar + Math.random() * (D.zNear - D.zFar);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color,
            size,
            sizeAttenuation: true,
            map: dotTexture,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            fog: false
        });
        const points = new THREE.Points(geometry, material);
        points.visible = false;
        cosmosGroup.add(points);
        return { points, positions, material };
    };
    dive.dust = {
        blue: makeField(110, PALETTE.dustBlue, 0.045),
        ember: makeField(26, PALETTE.dustEmber, 0.06)
    };
}

/** Stream the dust past the camera at the dive's velocity. Diving in
 *  pulls the motes toward the camera; backing out pushes them away. */
function updateDust(deltaTime) {
    if (!dive.dust || _reducedMotion.matches) return;
    const D = LAYOUT.dust;
    const speed = dive.vel * 1.35;
    const targetOpacity = Math.min(0.55, Math.abs(dive.vel) * 0.6);

    [dive.dust.blue, dive.dust.ember].forEach((field) => {
        const mat = field.material;
        mat.opacity += (targetOpacity * (field === dive.dust.ember ? 0.8 : 1) - mat.opacity) *
            Math.min(1, deltaTime * 5);
        field.points.visible = mat.opacity > 0.01;
        if (!field.points.visible || speed === 0) return;

        const positions = field.positions;
        for (let i = 2; i < positions.length; i += 3) {
            positions[i] += speed * deltaTime;
            if (positions[i] > D.zNear) {
                positions[i] = D.zFar;
                positions[i - 2] = (Math.random() * 2 - 1) * D.x;
                positions[i - 1] = LAYOUT.fractal.y + (Math.random() * 2 - 1) * D.y;
            } else if (positions[i] < D.zFar) {
                positions[i] = D.zNear;
                positions[i - 2] = (Math.random() * 2 - 1) * D.x;
                positions[i - 1] = LAYOUT.fractal.y + (Math.random() * 2 - 1) * D.y;
            }
        }
        field.points.geometry.attributes.position.needsUpdate = true;
    });
}

// ---- The per-frame dive pass -----------------------------------------------

function updateDive(deltaTime) {
    // The depth chases its target with a short ease, so button releases
    // glide instead of stopping dead, and pinch bursts feel weighted.
    // Both directions gate on rendered content: in against the deep
    // prefetch, out against the shallow re-renders. The out gate only
    // matters once the tunnel is revealed: below the reveal depth the
    // monument covers the whole frame by itself.
    const limit = contentDepthLimit();
    const outGate = dive.z >= dive.revealZ ? contentShallowLimit() : 0;
    dive.targetZ = Math.min(limit, Math.max(outGate, dive.targetZ));
    const previousZ = dive.z;
    const diff = dive.targetZ - dive.z;
    dive.z += Math.abs(diff) < 1e-4 ? diff : diff * Math.min(1, deltaTime * 4);
    dive.z = Math.max(0, Math.min(limit, dive.z));
    dive.vel = deltaTime > 0 ? (dive.z - previousZ) / deltaTime : 0;
    dive.maxZ = Math.max(dive.maxZ, dive.z);

    // The set stays a flat 2D picture until the dive reaches the reveal
    // magnification; then the tunnel layers crossfade in (and back out
    // again on the way home). Scaling the monument in place is
    // projectively identical to the tunnel placement, so the handoff
    // never jumps.
    const wantReveal = dive.z >= dive.revealZ ? 1 : 0;
    dive.reveal += (wantReveal - dive.reveal) * Math.min(1, deltaTime * 3);

    ensureLevels();

    const f = MANDELBROT_CONFIG.fractal;
    const k0 = LAYOUT.fractal.size / f.span;

    // Every tunnel level is centered on the dive target, and the
    // monument scales about that same point, so the target rides the
    // camera axis. At rest, slide the whole stack so the SET is
    // centered instead (the composed monument); the slide eases out
    // over the first couple of doublings, letting the target take the
    // middle of the frame as the dive begins.
    const tx = (dive.target.re - f.center.re) * k0;
    const ty = -(dive.target.im - f.center.im) * k0;
    const fall = Math.max(0, 1 - dive.z / 2.5);
    const gx = tx * fall;
    const gy = ty * fall;

    // The whole tunnel floats on the gentle bob and corkscrews slowly
    // with depth: every level rolls together about the shared view axis,
    // so the tiling between levels is untouched.
    const bob = _reducedMotion.matches ? 0 : Math.sin(elapsed * 0.45) * 0.035;
    dive.group.position.set(LAYOUT.fractal.x + gx, LAYOUT.fractal.y + gy + bob, 0);
    dive.group.rotation.z = dive.z * f.rollDegPerDoubling * Math.PI / 180;

    // Place every level down the tunnel. The camera's live z (the
    // portrait dolly moves it) keeps the 2:1 distance ratios anchored to
    // the true viewpoint, which is what makes the levels tile exactly.
    const camera = getCamera();
    const camZ = camera ? camera.position.z : MANDELBROT_CONFIG.camera.position.z;
    const refDist = camZ - LAYOUT.fractal.z;
    const reliefH = f.relief.height;
    const glowPulse = _reducedMotion.matches ? 1 : 1 + 0.14 * Math.sin(elapsed * 0.8);
    const baseLevel = Math.floor(dive.z);

    [...dive.levels.values()].forEach((record) => {
        // The keep-window is generous on the shallow side (a missing
        // shallow plane in a tunnel is a visible ring of empty space,
        // not just blur) and level 0 always survives for the ride home.
        if (record.level !== 0 &&
            (record.level < baseLevel - 4 || record.level > baseLevel + 5)) {
            evictLevel(record.level);
            return;
        }

        // Level 0 is the MONUMENT: the one target-independent frame (the
        // classic full set, centered on f.center), holding the whole
        // pre-reveal phase as a flat 2D picture. It scales up ABOUT THE
        // DIVE TARGET's pixel, which keeps that pixel on the camera
        // axis where the tunnel levels are centered. Scaling at a fixed
        // distance is projectively identical to the tunnel's
        // move-closer placement (a plane point (sx, sy, d) and
        // (x, y, d/s) project to the same screen position), so when the
        // tunnel layers crossfade in at the reveal depth, nothing
        // shifts: the blurry flat picture simply resolves into sharp
        // terrain around whichever touchpoint was chosen.
        if (record.level === 0) {
            const opacity = 1 - dive.reveal;
            const visible = opacity > 0.01;
            record.plane.visible = visible;
            if (!visible) {
                if (record.halo) record.halo.visible = false;
                return;
            }
            const s = Math.pow(2, dive.z);
            record.plane.position.set(-tx * s, -ty * s, camZ - refDist);
            record.plane.scale.set(s, s, reliefH);
            record.plane.material.opacity = opacity;
            if (record.halo) {
                // The monument's bloom belongs to the resting composition;
                // it dims over the first stretch of the dive.
                const haloBand = Math.min(1, Math.max(0, 1.5 - dive.z));
                record.halo.position.set(-tx * s, -ty * s, camZ - refDist - 0.03);
                record.halo.scale.set(s * 1.05, s * 1.05, 1);
                record.halo.material.opacity = opacity * 0.6 * glowPulse * haloBand;
                record.halo.visible = record.halo.material.opacity > 0.005;
            }
            return;
        }

        // The tunnel layers. rel > 0: deeper, farther down the tunnel.
        // rel < 0: behind us, grown huge, on the way past the camera. A
        // passing plane must survive until the NEXT level fully covers
        // the frame corners (about 1.2 doublings behind the viewpoint
        // on a 16:9 frame), so the fade-out waits until 2.4 behind and
        // finishes by 3. All of it scales with dive.reveal, so the
        // tunnel only exists once the dive is past the reveal depth.
        const rel = record.level - dive.z;
        const visible = rel > -3.05 && rel < 4.6 && dive.reveal > 0.01;
        record.plane.visible = visible;
        if (record.halo) record.halo.visible = visible;
        if (!visible) return;

        const dist = refDist * Math.pow(2, rel);
        const z = camZ - dist;
        record.fade = Math.min(1, record.fade + deltaTime / 0.35);
        const nearFade = Math.min(1, Math.max(0, (rel + 3.0) / 0.6));
        const opacity = record.fade * nearFade * dive.reveal;

        record.plane.position.set(0, 0, z);
        // Relief scales with distance so its APPARENT height matches
        // across levels (h/dist constant): overlapping copies of the
        // same ridges then agree, and a passing plane flattens away.
        record.plane.scale.set(1, 1, Math.max(0.02, reliefH * Math.pow(2, rel)));
        record.plane.material.opacity = opacity;
        if (record.halo) {
            // The bloom lives in a band around the current level only:
            // stacking a full additive halo per visible plane washes the
            // whole frame out toward white.
            const haloBand = Math.min(1, Math.max(0, 1.5 - Math.abs(rel)));
            record.halo.position.set(0, 0, z - 0.03 * Math.pow(2, Math.max(0, rel)));
            record.halo.scale.set(1.05, 1.05, 1);
            record.halo.material.opacity = opacity * 0.6 * glowPulse * haloBand;
            record.halo.visible = record.halo.material.opacity > 0.005;
        }
    });

    // The touchpoints live only at magnification 1: the moment the dive
    // moves they sleep, and they wake again when it fully surfaces.
    // The unselected rings BREATHE (scale and brightness together, each
    // on its own phase) so they read as tappable rather than as round
    // artifacts on the edge; the selected ring holds a steadier glow,
    // since it states the current choice instead of inviting one.
    if (dive.markersGroup) {
        const atRest = dive.z < 0.05 && dive.targetZ < 0.05;
        dive.markersGroup.visible = atRest;
        if (atRest) {
            dive.markersGroup.position.z = camZ - refDist + 0.02;
            dive.markers.forEach((m, i) => {
                if (_reducedMotion.matches) {
                    m.sprite.material.opacity = m.selected ? 0.95 : 0.8;
                    m.sprite.scale.setScalar(m.baseScale);
                    return;
                }
                const wave = Math.sin(elapsed * 2.6 + i * 1.1);
                if (m.selected) {
                    m.sprite.material.opacity = 0.92 + 0.08 * wave;
                    m.sprite.scale.setScalar(m.baseScale * (1 + 0.04 * wave));
                } else {
                    m.sprite.material.opacity = 0.72 + 0.28 * wave;
                    m.sprite.scale.setScalar(m.baseScale * (1 + 0.12 * wave));
                }
            });
        }
    }

    updateDust(deltaTime);
}

// ============================================
// INIT AND ANIMATION
// ============================================

/**
 * Build the whole cosmos. Called once from main.js after initScene.
 */
export function initStore() {
    const scene = getScene();
    if (!scene) return;

    starLayers = [];
    elapsed = 0;

    clearSharedSky(scene);
    cosmosGroup = initWorld(MANDELBROT_CONFIG);

    const dotTexture = createStarDotTexture();
    createStarfield(dotTexture);
    createNebulae();

    // The dive: reset state, build the tunnel's group, render level 0 on
    // the spot, and hire the worker pool for everything deeper.
    const f = MANDELBROT_CONFIG.fractal;
    dive.z = 0;
    dive.targetZ = 0;
    dive.vel = 0;
    dive.maxZ = 0;
    dive.reveal = 0;
    dive.levels = new Map();
    dive.normCache = new Map();
    dive.workers = [];
    dive.requested = new Set();
    dive.workerDead = false;
    dive.floor = f.floorDoublings;
    // The reveal threshold, converted once from the config's
    // magnification units into doublings (log2).
    dive.revealZ = Math.log2(f.revealMagnification);
    dive.target = f.targets[0];
    dive.targetIndex = 0;
    dive.gen = 0;
    dive.markers = [];
    dive.markersGroup = null;

    dive.group = new THREE.Group();
    dive.group.name = 'mandelbrot';
    dive.group.position.set(LAYOUT.fractal.x, LAYOUT.fractal.y, 0);
    registerOutdoorProp(dive.group, 'mandelbrot');
    cosmosGroup.add(dive.group);

    haloGeometry = new THREE.PlaneGeometry(LAYOUT.fractal.size, LAYOUT.fractal.size);

    // Level 0 is target-independent (the classic full-set view), so it
    // renders once here and survives every touchpoint change.
    const level0 = renderFrame(
        { re: f.center.re, im: f.center.im }, f.span, textureSize(), maxIterFor(0),
        reliefGrid(), hueForLevel(0));
    const record = adoptLevel(0, level0.canvas, level0.heights,
        { nuLo: level0.nuLo, W: level0.W });
    record.fade = 1;

    createTouchpoints(createRingTexture());
    createDust(dotTexture);

    // The pool that renders every deeper frame: 2-4 workers by core
    // count, each taking whole levels. If none can start (exotic
    // browser, file:// preview), the dive gracefully caps at the depth
    // level 0 can carry, and everything else still works.
    const poolSize = Math.min(4, Math.max(2,
        ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4) - 2));
    for (let i = 0; i < poolSize; i++) {
        try {
            const worker = new Worker('js/fractal-worker.min.js');
            const slot = { worker, busy: false, level: -1 };
            worker.onmessage = (event) => onWorkerMessage(slot, event);
            worker.onerror = () => {
                // Release the dead worker's claim so another can take
                // its level; with the whole pool gone the dive just
                // caps at the depth level 0 carries.
                dive.requested.delete(slot.level);
                dive.workers = dive.workers.filter((w) => w !== slot);
                if (!dive.workers.length) dive.workerDead = true;
            };
            dive.workers.push(slot);
        } catch (e) {
            break;
        }
    }
    if (!dive.workers.length) dive.workerDead = true;
}

/**
 * Animate the cosmos. Called every frame from main.js with deltaTime.
 * The ambience is gentle on purpose; the dive only ever moves when the
 * visitor asks it to.
 */
export function updateCosmos(deltaTime) {
    if (!_reducedMotion.matches) {
        elapsed += deltaTime;

        // The whole starfield turns imperceptibly slowly, one revolution
        // in about half an hour, so a long look drifts like a real night
        // sky, and a fraction faster while the dive is moving.
        const starDrift = 0.0035 * (1 + Math.min(2.5, Math.abs(dive.vel) * 1.5));
        starLayers.forEach((layer) => {
            layer.points.rotation.y += starDrift * deltaTime;
            layer.material.opacity = layer.baseOpacity +
                0.08 * Math.sin(elapsed * layer.speed + layer.phase);
        });

    }

    // The dive runs regardless of the reduced-motion setting: it moves
    // only on the visitor's own input, and updateDive keeps the
    // decorative parts (bob, pulse, dust) still for them.
    if (dive.group) updateDive(deltaTime);
}

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = {
    boundaryColor, glowOf, hexToRgba, hslToRgb, rampForHue, hueForLevel,
    renderFrame, maxIterFor, LAYOUT, NEBULAE, dive
};
