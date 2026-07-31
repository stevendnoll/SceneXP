// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for the Mandelbrot experience's fractal-worker.js.
 *
 * The worker is a classic (non-module) script that reads self.onmessage
 * and posts rendered frames back with self.postMessage, so this suite
 * installs a recording `self` stub BEFORE importing the file, then
 * drives the captured onmessage handler directly with realistic level
 * requests. The escape-time math is pure, so the assertions are real:
 * interior pixels come back opaque black, escaped pixels glow, the
 * relief lattice stays in [0, 1], and every branch of the adaptive
 * exposure ramp (fixed, percentile, parent inheritance, EMA blend, and
 * the small-sample default) is pinned to exact numbers.
 */
import { jest } from '@jest/globals';

let posted;     // messages handed to self.postMessage
let transfers;  // the transfer lists that rode along

beforeAll(async () => {
  posted = [];
  transfers = [];
  globalThis.self = {
    onmessage: null,
    postMessage(msg, transfer) {
      posted.push(msg);
      transfers.push(transfer);
    },
  };
  await import('../www/mandelbrot/js/fractal-worker.js');
});

afterAll(() => {
  delete globalThis.self;
});

beforeEach(() => {
  posted.length = 0;
  transfers.length = 0;
});

/** Post one request into the worker and return its response (or undefined). */
function send(req) {
  globalThis.self.onmessage({ data: req });
  return posted[posted.length - 1];
}

/** The RGBA quad at pixel (px, py) of a size-wide frame. */
function pixelAt(res, px, py) {
  const data = new Uint8ClampedArray(res.pixels);
  const idx = (py * res.size + px) * 4;
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] };
}

test('the handler was installed and ignores malformed requests', () => {
  expect(typeof globalThis.self.onmessage).toBe('function');
  send(null);
  send('hello');
  send({ size: '128' });      // size must be a number
  send({ level: 3 });         // no size at all
  expect(posted).toHaveLength(0);
});

test('a full-set frame: echoed header, transferred buffers, black interior, glowing boundary', () => {
  const res = send({
    gen: 7, level: 3, re: -0.5, im: 0, span: 3,
    size: 32, maxIter: 120, grid: 8, hue: 25,
  });

  // The request header comes back verbatim so store.js can file the frame.
  expect(res).toMatchObject({
    gen: 7, level: 3, re: -0.5, im: 0, span: 3, size: 32, maxIter: 120, grid: 8,
  });

  // Both payloads are ArrayBuffers of the documented shapes, and both ride
  // the transfer list (zero-copy back to the main thread). instanceof
  // would cross the Jest module realm, so check the constructor name.
  expect(res.pixels.constructor.name).toBe('ArrayBuffer');
  expect(res.heights.constructor.name).toBe('ArrayBuffer');
  expect(res.pixels.byteLength).toBe(32 * 32 * 4);
  expect(res.heights.byteLength).toBe(9 * 9 * 4);
  expect(transfers[0]).toEqual([res.pixels, res.heights]);

  // The frame center lands exactly on c = -0.5 + 0i, deep inside the set:
  // opaque black (alpha only, rgb stay zero).
  const center = pixelAt(res, 16, 16);
  expect(center).toEqual({ r: 0, g: 0, b: 0, a: 255 });

  // The boundary glows somewhere: colored pixels with nonzero alpha exist.
  const data = new Uint8ClampedArray(res.pixels);
  let glowing = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0 && data[i] + data[i + 1] + data[i + 2] > 0) glowing++;
  }
  expect(glowing).toBeGreaterThan(0);

  // The relief lattice: normalized, ridged over the boundary, flat at the
  // interior center sample.
  const heights = new Float32Array(res.heights);
  let peak = 0;
  heights.forEach((h) => {
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(1);
    peak = Math.max(peak, h);
  });
  expect(peak).toBeGreaterThan(0);
  expect(heights[4 * 9 + 4]).toBe(0);   // lattice center samples the interior
});

test('a rich frame derives its ramp from its own percentiles', () => {
  const res = send({
    gen: 1, level: 0, re: -0.7, im: 0, span: 2.8,
    size: 64, maxIter: 120, grid: 8,
  });
  // Enough escaped subsamples (>= 50), no parent: floor at the 5th
  // percentile (a real positive escape count) and a spread-scaled width
  // that never dips under the 40-count floor.
  expect(res.nuLo).toBeGreaterThan(0);
  expect(res.W).toBeGreaterThanOrEqual(40);
});

test('a cached ramp (fixedNuLo/fixedW) is used verbatim', () => {
  const res = send({
    gen: 2, level: 5, re: -0.7, im: 0, span: 2.8,
    size: 32, maxIter: 120, grid: 8, fixedNuLo: 3.5, fixedW: 77,
  });
  expect(res.nuLo).toBe(3.5);
  expect(res.W).toBe(77);
});

test('the parent ramp EMA-blends 50/50 with a rich frame\'s own statistics', () => {
  const base = {
    gen: 3, level: 1, re: -0.7, im: 0, span: 2.8,
    size: 64, maxIter: 120, grid: 8,
  };
  const own = send(base);                       // this frame's own ramp
  const blended = send({ ...base, parentNuLo: own.nuLo + 10, parentW: own.W + 20 });
  expect(blended.nuLo).toBeCloseTo(0.5 * own.nuLo + 0.5 * (own.nuLo + 10), 10);
  expect(blended.W).toBeCloseTo(0.5 * own.W + 0.5 * (own.W + 20), 10);
});

test('an all-interior frame inherits the parent ramp outright and stays flat', () => {
  const res = send({
    gen: 4, level: 9, re: -0.15, im: 0, span: 0.05,
    size: 16, maxIter: 60, grid: 4, parentNuLo: 12, parentW: 99,
  });
  // No escaped samples at all: the parent's ramp is adopted unchanged.
  expect(res.nuLo).toBe(12);
  expect(res.W).toBe(99);

  // Every pixel is interior: opaque black, and the relief never rises.
  const data = new Uint8ClampedArray(res.pixels);
  for (let i = 0; i < data.length; i += 4) {
    expect(data[i]).toBe(0);
    expect(data[i + 3]).toBe(255);
  }
  new Float32Array(res.heights).forEach((h) => expect(h).toBe(0));
});

test('a sparse frame with no parent falls back to the default ramp', () => {
  // An 8x8 far-field frame yields only 4 subsamples (< 50) and carries
  // no parent, so the original fixed ramp applies: nuLo 0, W = 45% of
  // the iteration budget.
  const res = send({
    gen: 5, level: 2, re: 1.5, im: 1.5, span: 0.5,
    size: 8, maxIter: 60, grid: 2,
  });
  expect(res.nuLo).toBe(0);
  expect(res.W).toBe(60 * 0.45);
});

test('the feather fades the border of a frame and its relief', () => {
  const base = {
    gen: 6, level: 7, re: -0.15, im: 0, span: 0.05,
    size: 16, maxIter: 60, grid: 4, parentNuLo: 12, parentW: 99,
  };
  const hard = send(base);
  const soft = send({ ...base, feather: true });

  // Without the feather the interior frame is opaque wall to wall; with
  // it the outermost ring fades to nothing while the center stays solid.
  expect(pixelAt(hard, 0, 0).a).toBe(255);
  expect(pixelAt(soft, 0, 0).a).toBe(0);      // corner: edge distance 0
  expect(pixelAt(soft, 0, 8).a).toBe(0);      // mid-edge, still on the rim
  expect(pixelAt(soft, 8, 8).a).toBe(255);    // center: past the feather band
});

test('the glow ramp\'s hot end: a saturated frame renders the near-white core color', () => {
  // fixedW far below every escape count clamps g to 1 everywhere, so all
  // pixels take the ramp's hot anchor. At the default hue 25 that is the
  // launch palette's near-white orange (~255, 216, 160), at full alpha.
  const res = send({
    gen: 8, level: 4, re: 1.5, im: 1.5, span: 0.5,
    size: 8, maxIter: 60, grid: 2, fixedNuLo: 0, fixedW: 0.5,
  });
  const p = pixelAt(res, 4, 4);
  expect(p.a).toBe(255);
  expect(Math.abs(p.r - 255)).toBeLessThanOrEqual(3);
  expect(Math.abs(p.g - 216)).toBeLessThanOrEqual(3);
  expect(Math.abs(p.b - 160)).toBeLessThanOrEqual(3);
});

test('the glow ramp\'s dark end: a floor above every count renders the ember, invisible', () => {
  // fixedNuLo far above every escape count clamps g to 0: the pixel is
  // written in the deep ember color (~58, 17, 2 at hue 25) but its alpha
  // (g * 640) is zero, so the far field stays transparent.
  const res = send({
    gen: 9, level: 4, re: 1.5, im: 1.5, span: 0.5,
    size: 8, maxIter: 60, grid: 2, fixedNuLo: 1e6, fixedW: 1,
  });
  const p = pixelAt(res, 4, 4);
  expect(p.a).toBe(0);
  expect(Math.abs(p.r - 58)).toBeLessThanOrEqual(3);
  expect(Math.abs(p.g - 17)).toBeLessThanOrEqual(3);
  expect(Math.abs(p.b - 2)).toBeLessThanOrEqual(3);
});

test('the glow ramp\'s middle: a wide window lands between ember and neon', () => {
  const res = send({
    gen: 10, level: 4, re: 1.5, im: 1.5, span: 0.5,
    size: 8, maxIter: 60, grid: 2, fixedNuLo: 0, fixedW: 8,
  });
  const p = pixelAt(res, 4, 4);
  expect(p.a).toBeGreaterThan(0);
  expect(p.a).toBeLessThan(255);
  expect(p.r).toBeGreaterThan(58);    // brighter than the ember anchor
  expect(p.r).toBeLessThan(255);      // but not yet the hot core
});

test('the warm-band hues all render (every arc of the HSL wheel the cycle can reach)', () => {
  // The color cycle bounces between -75 and +50 degrees, and rampForHue
  // samples hue - 9, hue, and hue + 10, so requests across (and beyond)
  // that band walk hslToRgb through all six of its sextant branches.
  const seen = new Set();
  [25, 100, 150, 205, 265, 330, -40].forEach((hue, i) => {
    const res = send({
      gen: 20 + i, level: 1, re: 1.5, im: 1.5, span: 0.5,
      size: 8, maxIter: 60, grid: 2, hue, fixedNuLo: 0, fixedW: 0.5,
    });
    const p = pixelAt(res, 4, 4);
    seen.add(`${p.r},${p.g},${p.b}`);
  });
  expect(posted).toHaveLength(7);
  expect(seen.size).toBeGreaterThan(3);   // different hues, different glows
});
