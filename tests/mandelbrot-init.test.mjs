// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for the Mandelbrot experience's cosmos build,
 * exercising the mandelbrot store.js orchestration of the shared parts
 * (world, scene) plus the experience's own machinery: the cleared sky,
 * the starfield and nebulae, the level-0 monument render, the touchpoint
 * rings, and the dive engine (depth gates, reset, target selection).
 *
 * Under the chainable THREE proxy nothing renders, but every function
 * that would run during a real page load runs here, so a missing import
 * or a reference left behind by a refactor throws and fails this suite
 * instead of the live site. The worker pool cannot start under Node (no
 * global Worker), which exercises the designed fallback: the dive
 * content-gates itself to the depth level 0 carries.
 *
 * Two guards are specific to this experience:
 *
 * TARGET HEALTH. Every dive target must be an EXACTLY-known boundary
 * point: coordinates truncated by a well-meaning edit drift off the
 * boundary and land the zoom in featureless black around depth 20 (it
 * happened twice during development, to the textbook Seahorse Valley
 * value and to a remembered Feigenbaum constant). The health test
 * re-renders a small frame around every configured target at depth 26,
 * with its own independent escape-time code, and fails if any frame has
 * gone featureless.
 *
 * WORKER SYNC. store.js renders level 0; js/fractal-worker.js renders
 * every deeper level with a deliberate COPY of the same math (a classic
 * worker cannot import the module). The sync test asserts the shared
 * magic numbers appear in both files, so editing one side alone trips
 * the alarm.
 */
import { jest } from '@jest/globals';
import { readFile } from 'node:fs/promises';
import { installThree, installCanvas, installBrowserGlobals, uninstallAll } from './helpers/three-stub.mjs';

beforeEach(() => {
  installThree();
  installCanvas();
  installBrowserGlobals();
});

afterEach(() => {
  uninstallAll();
});

// ---- Independent escape-time probe (deliberately NOT the store's code) -----

const INV_LOG2 = 1 / Math.LN2;

/** Frame stats around a point: interior pixel count and the smooth
 *  escape counts of the rest, from a fresh implementation of the
 *  iteration so a bug in the store's copy cannot hide itself. */
function probeFrame(re, im, span, maxIter, size) {
  const reMin = re - span / 2;
  const imMin = im - span / 2;
  const step = span / size;
  let interior = 0;
  const nus = [];
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
      if (n >= maxIter) { interior++; continue; }
      nus.push(n + 1 - Math.log((Math.log(zr2 + zi2) / 2) * INV_LOG2) * INV_LOG2);
    }
  }
  nus.sort((a, b) => a - b);
  const spread = nus.length
    ? nus[Math.floor(nus.length * 0.95)] - nus[Math.floor(nus.length * 0.05)]
    : 0;
  return { interior, total: size * size, escaped: nus.length, spread };
}

// ---- The build-and-tick smoke ----------------------------------------------

test('the full cosmos builds and the dive flies, gates, resets, and retargets', async () => {
  jest.resetModules();
  // Import the BUILT shared modules: mandelbrot store.js resolves its
  // imports to the .min.js files, and module state must be shared with
  // what we drive here. This is why `npm run build` must run before
  // `npm test` after any shared edit.
  const scene = await import('../www/shared/js/scene-1.0.0.min.js');
  const world = await import('../www/shared/js/world-1.0.0.min.js');
  const store = await import('../www/mandelbrot/js/store.js');
  const { MANDELBROT_CONFIG } = await import('../www/mandelbrot/js/config.js');
  const targets = MANDELBROT_CONFIG.fractal.targets;

  // Same order main.js uses. initStore renders level 0 synchronously
  // (the real 1024px escape-time pass) and tries to hire the worker
  // pool, which cannot start under Node: the designed fallback engages.
  scene.initScene({}, MANDELBROT_CONFIG);
  store.initStore();
  expect(world.getWorldGroup()).not.toBeNull();
  expect(world.getWorldConfig().rootName).toBe('cosmos');

  // The tap registry: the set itself plus one touchpoint per target.
  expect(world.getOutdoorPropMeshes().length).toBe(1 + targets.length);
  expect(store.getTouchpointGroups().length).toBe(targets.length);

  // Level 0 adopted with a real exposure ramp; the pool is dead (no
  // Worker in Node), which the engine records rather than throwing.
  const dive = store.__test__.dive;
  expect(dive.levels.size).toBe(1);
  expect(dive.workerDead).toBe(true);
  const level0 = dive.levels.get(0);
  expect(level0.norm.nuLo).toBeGreaterThanOrEqual(0);
  expect(level0.norm.W).toBeGreaterThanOrEqual(40);

  // At rest: magnification 1, nothing moving, out travel spent.
  let s = store.getDiveState();
  expect(s.z).toBe(0);
  expect(s.magnification).toBe(1);
  expect(s.diving).toBe(false);
  expect(s.atFloor).toBe(false);
  expect(s.atOut).toBe(true);

  // A quiet minute of idling holds the surface.
  for (let i = 0; i < 120; i++) store.updateCosmos(0.02);
  expect(store.getDiveState().z).toBe(0);

  // Ask for a deep dive. With the pool dead, the content gate must cap
  // the flight at the headroom level 0 carries (about 1.6 doublings),
  // never at the requested depth.
  store.diveBy(10);
  for (let i = 0; i < 400; i++) store.updateCosmos(0.02);
  s = store.getDiveState();
  expect(s.z).toBeGreaterThan(1);
  expect(s.z).toBeLessThanOrEqual(1.6 + 1e-6);
  expect(s.magnification).toBeCloseTo(Math.pow(2, s.z), 6);
  expect(s.maxZ).toBeCloseTo(s.z, 6);
  expect(s.atIn).toBe(true);
  expect(s.atFloor).toBe(false);

  // Zooming out can never leave the surface behind.
  store.diveBy(-50);
  for (let i = 0; i < 400; i++) store.updateCosmos(0.02);
  expect(store.getDiveState().z).toBe(0);

  // The reset snaps home from anywhere, and maxZ keeps the deep mark.
  store.diveBy(10);
  for (let i = 0; i < 200; i++) store.updateCosmos(0.02);
  store.resetDive();
  store.updateCosmos(0.02);
  s = store.getDiveState();
  expect(s.z).toBe(0);
  expect(s.diving).toBe(false);
  expect(s.maxZ).toBeGreaterThan(1);

  // Touchpoint selection: a new target answers with its label, keeps
  // the target-independent monument, and orphans nothing (level 0's
  // exposure ramp survives the cache clear).
  expect(store.selectDiveTarget(3)).toBe(targets[3].label);
  expect(dive.targetIndex).toBe(3);
  expect(dive.target.re).toBe(targets[3].re);
  expect(dive.levels.size).toBe(1);
  expect(dive.levels.has(0)).toBe(true);
  expect(dive.normCache.get(0)).toEqual(level0.norm);

  // Re-selecting the current target and asking for nonsense both no-op.
  expect(store.selectDiveTarget(3)).toBeNull();
  expect(store.selectDiveTarget(999)).toBeNull();
  expect(store.selectDiveTarget(-1)).toBeNull();

  // The show goes on after a retarget.
  for (let i = 0; i < 60; i++) store.updateCosmos(0.02);
});

// ---- The target digits guard -----------------------------------------------

test('every dive target still sits on richly structured boundary at depth', async () => {
  // Depth 26 is past where truncated coordinates fail (the textbook
  // Seahorse value went all-interior at 24). A healthy frame either
  // mixes interior with exterior or spreads its escape counts wide;
  // a featureless frame means someone shortened the digits.
  jest.resetModules();
  const { MANDELBROT_CONFIG } = await import('../www/mandelbrot/js/config.js');
  const f = MANDELBROT_CONFIG.fractal;
  const level = 26;
  const span = f.span / Math.pow(2, level);
  const maxIter = f.maxIter + f.iterPerLevel * level;

  f.targets.forEach((t) => {
    const p = probeFrame(t.re, t.im, span, maxIter, 16);
    const mixed = p.interior > 0 && p.interior < p.total;
    const structured = p.escaped > 0 && p.spread > 25;
    if (!(mixed || structured)) {
      throw new Error(
        `"${t.label}" (${t.re}, ${t.im}) is featureless at depth ${level}: ` +
        `interior ${p.interior}/${p.total}, spread ${p.spread.toFixed(1)}. ` +
        'Its digits were probably truncated; restore the full-precision value.');
    }
  });
});

// ---- The worker sync guard --------------------------------------------------

test('store.js and fractal-worker.js agree on the copied rendering math', async () => {
  const storeText = await readFile(new URL('../www/mandelbrot/js/store.js', import.meta.url), 'utf8');
  const workerText = await readFile(new URL('../www/mandelbrot/js/fractal-worker.js', import.meta.url), 'utf8');

  // The numbers that define the shared look. If one file changes and
  // the other does not, level 0 and the deep levels stop tiling.
  const SHARED = [
    'g * 640',            // the boundary alpha ramp
    '1.35',               // the glow gamma
    '* 0.45',             // the fallback exposure knee
    'neonAt = 0.75',      // where ember hands off to neon
    '- 9, 0.93, 0.12',    // the ember anchor of rampForHue
    '1, 0.55',            // the neon anchor
    '+ 10, 1, 0.81',      // the hot anchor
    'Math.floor(sample.length * 0.05)',   // the exposure floor percentile
    'Math.max(40, (p',    // the exposure width floor
  ];
  SHARED.forEach((token) => {
    expect(storeText).toContain(token);
    expect(workerText).toContain(token);
  });

  // Both sides declare the pact explicitly.
  expect(storeText).toContain('KEEP IN SYNC');
  expect(workerText).toContain('copies');
});

// ---- Prop wiring -------------------------------------------------------------

test('registered prop kinds and dialog content line up', async () => {
  const storeText = await readFile(new URL('../www/mandelbrot/js/store.js', import.meta.url), 'utf8');
  const mainText = await readFile(new URL('../www/mandelbrot/js/main.js', import.meta.url), 'utf8');

  const registered = new Set(
    [...storeText.matchAll(/registerOutdoorProp\(.+?, '(\w+)'\)/g)].map((m) => m[1])
  );
  expect(registered).toEqual(new Set(['mandelbrot', 'touchpoint']));

  const contentBlock = mainText.match(/const PROP_CONTENT = \{([\s\S]*?)\n\};/);
  expect(contentBlock).not.toBeNull();
  const contentKinds = new Set(
    [...contentBlock[1].matchAll(/^ {4}(\w+): \{/gm)].map((m) => m[1])
  );

  // 'touchpoint' taps select a destination instead of opening a dialog,
  // and 'divefloor' is dialog-only (shown by the depth chip at the
  // precision floor, never registered as a tap target).
  expect(contentKinds).toEqual(new Set(['mandelbrot', 'divefloor']));

  // Two lines apiece, so a second visit says something new.
  const lineCounts = [...contentBlock[1].matchAll(/lines: \[/g)];
  expect(lineCounts.length).toBe(contentKinds.size);

  // The mandelbrot dialog is the scene's help menu by design.
  expect(mainText).toContain("title: 'How to Explore'");
});

// ---- The composition and config (pure) ---------------------------------------

describe('the composition and config (pure)', () => {
  let T;
  let CFG;

  beforeEach(async () => {
    jest.resetModules();
    const store = await import('../www/mandelbrot/js/store.js');
    T = store.__test__;
    CFG = (await import('../www/mandelbrot/js/config.js')).MANDELBROT_CONFIG;
  });

  test('the config is frozen all the way down', () => {
    expect(Object.isFrozen(CFG)).toBe(true);
    expect(Object.isFrozen(CFG.fractal)).toBe(true);
    expect(Object.isFrozen(CFG.fractal.targets)).toBe(true);
    expect(Object.isFrozen(CFG.fractal.targets[0])).toBe(true);
    expect(Object.isFrozen(CFG.autozoom)).toBe(true);
  });

  test('the passive contract: no walking, no day, no checklist', () => {
    expect(CFG.spawn).toBeUndefined();
    expect(CFG.worldBounds).toBeUndefined();
    expect(CFG.checklist).toBeUndefined();
    expect(CFG.rootName).toBe('cosmos');
    expect(CFG.dayNight.enabled).toBe(false);
  });

  test('the dive targets: eleven named places, spread out, mirrors exact', () => {
    const targets = CFG.fractal.targets;
    expect(targets.length).toBe(11);
    expect(targets[0].label).toBe('Seahorse Valley');

    // Every label unique, every coordinate finite.
    expect(new Set(targets.map((t) => t.label)).size).toBe(targets.length);
    targets.forEach((t) => {
      expect(Number.isFinite(t.re)).toBe(true);
      expect(Number.isFinite(t.im)).toBe(true);
    });

    // No two rings crowd each other on the monument (complex units;
    // a ring is about 0.06 wide there).
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        const d = Math.hypot(targets[i].re - targets[j].re, targets[i].im - targets[j].im);
        expect(d).toBeGreaterThan(0.1);
      }
    }

    // The south-side places are exact conjugates of their north twins,
    // and the exactly-known anchors carry their exact values.
    const byLabel = Object.fromEntries(targets.map((t) => [t.label, t]));
    [['Seahorse Valley', 'Seahorse Valley South'],
     ['Elephant Valley', 'Elephant Valley South'],
     ['The North Dendrite', 'The South Dendrite'],
     ['The Northern Valley', 'The Southern Valley']].forEach(([north, south]) => {
      expect(byLabel[south].re).toBe(byLabel[north].re);
      expect(byLabel[south].im).toBe(-byLabel[north].im);
    });
    expect(byLabel['The North Dendrite']).toMatchObject({ re: 0, im: 1 });
    expect(byLabel['The Western Fork'].im).toBe(0);
  });

  test('the dive knobs: floor under double precision, sane reveal and autozoom', () => {
    const f = CFG.fractal;
    // Doubles run out around 2^53; the floor must stop well short so
    // pixel grids never collapse on screen.
    expect(f.floorDoublings).toBeGreaterThan(30);
    expect(f.floorDoublings).toBeLessThan(45);
    expect(f.revealMagnification).toBeGreaterThanOrEqual(2);
    expect(f.maxIter).toBeGreaterThan(0);
    expect(f.iterPerLevel).toBeGreaterThan(0);
    expect(f.relief.height).toBeGreaterThan(0);
    expect(f.relief.grid).toBeGreaterThan(f.relief.gridMobile);

    const a = CFG.autozoom;
    expect(a.speeds.length).toBeGreaterThanOrEqual(2);
    a.speeds.forEach((sp, i) => {
      expect(sp).toBeGreaterThan(0);
      if (i) expect(sp).toBeGreaterThan(a.speeds[i - 1]);
    });
    expect(a.defaultIndex).toBeGreaterThanOrEqual(0);
    expect(a.defaultIndex).toBeLessThan(a.speeds.length);
  });

  test('the color cycle: classic orange at rest, gentle steps, never green or blue', () => {
    const cc = CFG.fractal.colorCycle;
    expect(cc.minHue).toBeLessThan(cc.baseHue);
    expect(cc.maxHue).toBeGreaterThan(cc.baseHue);

    // The monument and the whole pre-reveal phase hold the base hue.
    for (let level = 0; level <= cc.startLevel; level++) {
      expect(T.hueForLevel(level)).toBe(cc.baseHue);
    }

    let previous = T.hueForLevel(0);
    for (let level = 1; level <= 40; level++) {
      const hue = T.hueForLevel(level);
      // Inside the band, stepping gently: a bounce, never a wheel wrap.
      expect(hue).toBeGreaterThanOrEqual(cc.minHue - 1e-9);
      expect(hue).toBeLessThanOrEqual(cc.maxHue + 1e-9);
      expect(Math.abs(hue - previous)).toBeLessThanOrEqual(cc.degreesPerLevel + 1e-9);
      // Normalized to the wheel, the warm band skips green through blue.
      const wheel = ((hue % 360) + 360) % 360;
      expect(wheel < 60 || wheel > 270).toBe(true);
      previous = hue;
    }
  });

  test('the hue-25 ramp reproduces the launch orange', () => {
    const ramp = T.rampForHue(25);
    const near = (c, [r, g, b]) => {
      expect(Math.abs(c.r - r)).toBeLessThanOrEqual(2.5);
      expect(Math.abs(c.g - g)).toBeLessThanOrEqual(2.5);
      expect(Math.abs(c.b - b)).toBeLessThanOrEqual(2.5);
    };
    near(ramp.ember, [58, 17, 2]);
    near(ramp.neon, [255, 122, 26]);
    near(ramp.hot, [255, 216, 160]);

    // The ramp's shape: ember at the far field, neon at the handoff,
    // hot on the boundary itself.
    const at = (g) => T.boundaryColor(g, ramp);
    expect(at(0)).toEqual(ramp.ember);
    near(at(0.75), [ramp.neon.r, ramp.neon.g, ramp.neon.b]);
    expect(at(1)).toEqual(ramp.hot);
  });

  test('glowOf clamps and climbs', () => {
    expect(T.glowOf(0, 10, 100)).toBe(0);
    expect(T.glowOf(110, 10, 100)).toBe(1);
    expect(T.glowOf(500, 10, 100)).toBe(1);
    const mid = T.glowOf(60, 10, 100);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(T.glowOf(80, 10, 100)).toBeGreaterThan(mid);
  });

  test('the iteration budget climbs with depth', () => {
    expect(T.maxIterFor(0)).toBe(CFG.fractal.maxIter);
    expect(T.maxIterFor(10)).toBeGreaterThan(T.maxIterFor(0));
    expect(T.maxIterFor(20)).toBeGreaterThan(T.maxIterFor(10));
  });

  test('renderFrame returns a live exposure ramp and a bounded relief lattice', () => {
    const f = CFG.fractal;
    const out = T.renderFrame({ re: f.center.re, im: f.center.im }, f.span, 48, f.maxIter, 8, 25);
    expect(out.nuLo).toBeGreaterThanOrEqual(0);
    expect(out.W).toBeGreaterThanOrEqual(40);
    expect(out.heights.length).toBe(9 * 9);
    let peak = 0;
    out.heights.forEach((h) => {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
      peak = Math.max(peak, h);
    });
    // The full-set frame contains boundary, so some ridge must rise.
    expect(peak).toBeGreaterThan(0);
  });

  test('the site block honors Benoit Mandelbrot and funnels root-relative', () => {
    expect(CFG.site.honoree.label).toBe('Benoit Mandelbrot');
    expect(CFG.site.home.path).toBe('/');
    expect(CFG.site.builder.contactPath).toBe('/contact.html');
    expect(CFG.proofOfWork.storageKey).toBe('gallery-pow');
  });
});
