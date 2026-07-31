// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * fractal-worker.js - Deep Mandelbrot frames, off the main thread
 *
 * The infinite dive re-renders the set at ever smaller spans around one
 * fixed target point, and the deeper it goes the more iterations each
 * pixel needs. Running that on the main thread would hitch the render
 * loop, so store.js runs a small POOL of these workers (2-4, by core
 * count) and hands each one a whole level: levels are independent, so
 * per-level parallelism needs no tile reassembly, and the pool
 * precomputes the next few levels while the visitor is still crossing
 * the current one.
 *
 * This is a classic (non-module) worker on purpose: module workers are
 * newer than some Safari versions this site still serves, and the CSP
 * (script-src 'self') is happiest with a plain same-origin file. That
 * means it cannot import store.js, so the escape-time iteration and the
 * glow ramp below are deliberate copies of the ones there. If the look
 * of the boundary changes in store.js, change it here to match: level 0
 * is rendered by store.js at init, every deeper level by this pool, and
 * the two must tile seamlessly.
 *
 * Request:  { gen, level, re, im, span, size, maxIter, grid,
 *             hue (this level's glow hue, degrees; the color cycle),
 *             feather (soften the frame's outer border),
 *             fixedNuLo, fixedW (optional: reuse this exact ramp),
 *             parentNuLo, parentW (optional: the parent frame's ramp) }
 * Response: { gen, level, re, im, span, size, maxIter, grid,
 *             pixels: ArrayBuffer (RGBA, transferred),
 *             heights: ArrayBuffer (Float32 (grid+1)^2, transferred),
 *             nuLo, W (the ramp this frame actually used) }
 *
 * `gen` is echoed verbatim: store.js bumps it when the visitor picks a
 *  different dive target, so frames rendered for the old target are
 *  recognized and dropped when they arrive.
 *
 * `heights` is the level's RELIEF: the exposure-normalized glow value g
 * sampled on a (grid+1) x (grid+1) lattice, row 0 at the top of the
 * frame, matching THREE.PlaneGeometry's vertex order. store.js displaces
 * each level's plane with it so the burning boundary rises as ridges
 * that loom and shear while the tunnel streams past.
 *
 * ADAPTIVE EXPOSURE (nuLo / W): deep frames sit entirely against the
 * boundary, so every pixel's escape count is enormous and a fixed ramp
 * would wash the whole frame white-hot. Each frame therefore anchors
 * its ramp to its own statistics: nuLo is the 5th percentile of the
 * escaped counts (the frame's darkest ember) and W scales with their
 * spread, then both are EMA-blended with the parent frame's values so
 * consecutive levels shift exposure gently, like an eye adjusting. At
 * level 0 the formula lands on the same numbers as the original fixed
 * ramp, so the resting monument look is unchanged.
 *
 * When fixedNuLo/fixedW arrive, all of that is skipped and the given
 * ramp is used verbatim: store.js caches every level's ramp, so a level
 * re-rendered on the way back OUT reproduces its way-in look exactly
 * (re-deriving it against whatever neighbor happens to survive eviction
 * is how a zoom-out once turned a whole plane flat white-hot cream).
 */

'use strict';

var INV_LOG2 = 1 / Math.LN2;

/** Plain HSL -> {r,g,b} 0-255 (copy of store.js hslToRgb). */
function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var hp = h / 60;
    var x = c * (1 - Math.abs((hp % 2) - 1));
    var r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else { r = c; b = x; }
    var m = l - c / 2;
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/** The three anchor colors of the glow ramp for one hue (copy of
 *  store.js rampForHue): dark ember, bright neon edge, near-white hot
 *  core. At hue 25 this is the classic orange the scene launched with. */
function rampForHue(hue) {
    return {
        ember: hslToRgb(hue - 9, 0.93, 0.12),
        neon: hslToRgb(hue, 1, 0.55),
        hot: hslToRgb(hue + 10, 1, 0.81)
    };
}

/** The glow ramp for escaped points (copy of store.js boundaryColor):
 *  deep ember far out, the ramp's neon color approaching the edge,
 *  near-white hot on it. */
function boundaryColor(g, ramp) {
    var neonAt = 0.75;
    var r, grn, b, t;
    if (g < neonAt) {
        t = g / neonAt;
        r = ramp.ember.r + t * (ramp.neon.r - ramp.ember.r);
        grn = ramp.ember.g + t * (ramp.neon.g - ramp.ember.g);
        b = ramp.ember.b + t * (ramp.neon.b - ramp.ember.b);
    } else {
        t = (g - neonAt) / (1 - neonAt);
        r = ramp.neon.r + t * (ramp.hot.r - ramp.neon.r);
        grn = ramp.neon.g + t * (ramp.hot.g - ramp.neon.g);
        b = ramp.neon.b + t * (ramp.hot.b - ramp.neon.b);
    }
    return { r: r, g: grn, b: b };
}

/** Exposure-normalized glow value for one smooth escape count. */
function glowOf(nu, nuLo, W) {
    return Math.pow(Math.min(1, Math.max(0, (nu - nuLo) / W)), 1.35);
}

/** Render one square frame of the set: black opaque interior, transparent
 *  far field, glowing boundary. Three passes: iterate and store the
 *  smooth escape counts, derive this frame's adaptive ramp from them,
 *  then colorize and sample the relief lattice. */
function renderFrame(req) {
    var size = req.size;
    var maxIter = req.maxIter;
    var reMin = req.re - req.span / 2;
    var imMin = req.im - req.span / 2;
    var step = req.span / size;

    // Pass 1: escape counts. -1 marks interior. A sparse subsample (every
    // 4th pixel each axis) feeds the percentile estimate.
    var nus = new Float32Array(size * size);
    var sample = [];

    for (var py = 0; py < size; py++) {
        var ci = imMin + py * step;
        for (var px = 0; px < size; px++) {
            var cr = reMin + px * step;
            var zr = 0, zi = 0, zr2 = 0, zi2 = 0, n = 0;
            while (zr2 + zi2 <= 4 && n < maxIter) {
                zi = 2 * zr * zi + ci;
                zr = zr2 - zi2 + cr;
                zr2 = zr * zr;
                zi2 = zi * zi;
                n++;
            }

            var at = py * size + px;
            if (n >= maxIter) {
                nus[at] = -1;
            } else {
                var logZn = Math.log(zr2 + zi2) / 2;
                var nu = n + 1 - Math.log(logZn * INV_LOG2) * INV_LOG2;
                nus[at] = nu;
                if ((py & 3) === 0 && (px & 3) === 0) sample.push(nu);
            }
        }
    }

    // The frame's ramp. A cached ramp (a level rendered before) is used
    // verbatim. Otherwise: floor at the 5th percentile of escaped
    // counts, width from their spread, EMA-blended with the parent
    // frame's ramp so consecutive levels never jump exposure. The
    // fallback (an all-interior frame) inherits the parent outright.
    var nuLo = 0;
    var W = maxIter * 0.45;
    if (typeof req.fixedNuLo === 'number' && isFinite(req.fixedNuLo) &&
        typeof req.fixedW === 'number' && req.fixedW > 0) {
        nuLo = req.fixedNuLo;
        W = req.fixedW;
    } else {
        if (sample.length >= 50) {
            sample.sort(function (a, b) { return a - b; });
            var p05 = sample[Math.floor(sample.length * 0.05)];
            var p99 = sample[Math.min(sample.length - 1, Math.floor(sample.length * 0.99))];
            nuLo = p05;
            W = Math.max(40, (p99 - p05) * 1.3);
        } else if (typeof req.parentNuLo === 'number' && isFinite(req.parentNuLo)) {
            nuLo = req.parentNuLo;
            W = req.parentW;
        }
        if (sample.length >= 50 &&
            typeof req.parentNuLo === 'number' && isFinite(req.parentNuLo)) {
            nuLo = 0.5 * nuLo + 0.5 * req.parentNuLo;
            W = 0.5 * W + 0.5 * req.parentW;
        }
    }

    // The border feather: deep frames are dense glow wall to wall, so a
    // raw frame ends in a hard square edge. Fading the outer ~5% lets a
    // frame melt into its parent (which draws the same mathematics
    // behind it) instead of cutting a visible seam across it.
    var featherPx = req.feather ? size * 0.05 : 0;
    function featherAt(px2, py2) {
        if (!featherPx) return 1;
        var edge = Math.min(Math.min(px2, size - 1 - px2), Math.min(py2, size - 1 - py2));
        return Math.min(1, edge / featherPx);
    }

    // Pass 2: colorize from the stored counts, in this level's hue.
    var ramp = rampForHue(typeof req.hue === 'number' ? req.hue : 25);
    var pixels = new Uint8ClampedArray(size * size * 4);
    for (var py2 = 0; py2 < size; py2++) {
        for (var px2 = 0; px2 < size; px2++) {
            var i = py2 * size + px2;
            var idx = i * 4;
            var value = nus[i];
            var fe = featherAt(px2, py2);
            if (value < 0) {
                // Inside the set: opaque black (alpha only; rgb stay 0).
                pixels[idx + 3] = Math.round(255 * fe);
            } else {
                var g = glowOf(value, nuLo, W);
                var c = boundaryColor(g, ramp);
                pixels[idx] = c.r;
                pixels[idx + 1] = c.g;
                pixels[idx + 2] = c.b;
                pixels[idx + 3] = Math.round(Math.min(255, g * 640) * fe);
            }
        }
    }

    // Pass 3: the relief lattice. Interior and empty space stay at zero;
    // the glowing boundary rises, feathered flat at the border so no
    // displaced ridge silhouette pokes past the faded edge.
    var grid = req.grid;
    var heights = new Float32Array((grid + 1) * (grid + 1));
    for (var gy = 0; gy <= grid; gy++) {
        var sy = Math.min(size - 1, Math.round(gy * (size - 1) / grid));
        for (var gx = 0; gx <= grid; gx++) {
            var sx = Math.min(size - 1, Math.round(gx * (size - 1) / grid));
            var nuv = nus[sy * size + sx];
            heights[gy * (grid + 1) + gx] = nuv < 0
                ? 0
                : glowOf(nuv, nuLo, W) * featherAt(sx, sy);
        }
    }

    return {
        pixels: pixels.buffer,
        heights: heights.buffer,
        nuLo: nuLo,
        W: W
    };
}

self.onmessage = function (event) {
    var req = event.data;
    if (!req || typeof req.size !== 'number') return;
    var frame = renderFrame(req);
    self.postMessage({
        gen: req.gen,
        level: req.level,
        re: req.re,
        im: req.im,
        span: req.span,
        size: req.size,
        maxIter: req.maxIter,
        grid: req.grid,
        pixels: frame.pixels,
        heights: frame.heights,
        nuLo: frame.nuLo,
        W: frame.W
    }, [frame.pixels, frame.heights]);
};
