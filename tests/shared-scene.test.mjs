// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/scene-1.0.0.js — the shared engine's sky/day-night
 * part and its per-experience config plumbing.
 *
 * Two stubbing strategies, matching what each group needs:
 *  - The time-of-day functions are pure reads of the internal cycleTime and
 *    never touch THREE while scene objects are null (initScene not called), so
 *    a two-constructor THREE stub suffices (same approach as tests/scene.test.mjs,
 *    which covers the untouched www/js copy).
 *  - The config-plumb tests DO call initScene, so they use the full chainable
 *    THREE proxy from helpers/three-stub.mjs plus canvas/window/navigator stubs.
 */
import { jest } from '@jest/globals';
import { installThree as installThreeProxy, installCanvas, installBrowserGlobals, uninstallAll } from './helpers/three-stub.mjs';

const CYCLE_DURATION = 480; // DAY_NIGHT_CONFIG.cycleDuration default

// Minimal THREE for the pure time-of-day tests (module import only).
function installThreeMinimal() {
  globalThis.THREE = {
    Color: class { setHex() { return this; } lerp() { return this; } copy() { return this; } },
    SphereGeometry: class {},
  };
}

// Fresh module with cycleTime driven to T in [0, 1). Importing resets cycleTime
// to 0.5 (noon), then we advance forward (wrapping once) to land on T.
async function atTime(T) {
  jest.resetModules();
  const mod = await import('../www/shared/js/scene-1.0.0.js');
  const delta = (((T - 0.5) % 1) + 1) % 1 * CYCLE_DURATION;
  if (delta !== 0) mod.updateDayNightCycle(delta);
  return mod;
}

afterEach(() => {
  uninstallAll();
});

describe('time-of-day reads (pure, no initScene)', () => {
  beforeEach(installThreeMinimal);

  test('isNightTime: false through daylight, true deep into the night', async () => {
    expect((await atTime(0.5)).isNightTime()).toBe(false);  // noon
    expect((await atTime(0.35)).isNightTime()).toBe(false); // mid-morning
    expect((await atTime(0.95)).isNightTime()).toBe(true);  // late night
    expect((await atTime(0.05)).isNightTime()).toBe(true);  // pre-dawn
  });

  test('getNightFactor saturates and ramps through the transitions', async () => {
    expect((await atTime(0.5)).getNightFactor()).toBe(0);   // full day
    expect((await atTime(0.05)).getNightFactor()).toBe(1);  // full night
    const sunset = (await atTime(0.75)).getNightFactor();   // mid-sunset
    expect(sunset).toBeGreaterThan(0);
    expect(sunset).toBeLessThan(1);
  });

  test('getInteriorLightState: on at night, off during the day', async () => {
    expect((await atTime(0.95)).getInteriorLightState()).toEqual({ shouldBeOn: true, intensity: 1 });
    expect((await atTime(0.5)).getInteriorLightState()).toEqual({ shouldBeOn: false, intensity: 0 });
  });

  test('a full default cycle wraps back to the starting time of day', async () => {
    const mod = await atTime(0.5);
    const before = mod.isNightTime();
    mod.updateDayNightCycle(CYCLE_DURATION);
    expect(mod.isNightTime()).toBe(before);
  });
});

describe('comet config plumb', () => {
  beforeEach(() => {
    installThreeProxy();
    installCanvas();
    installBrowserGlobals();
  });

  async function loadAndInit(options) {
    jest.resetModules();
    const mod = await import('../www/shared/js/scene-1.0.0.js');
    mod.initScene({}, options);
    return mod;
  }

  test('comet is OFF by default: no group is built, updateComet no-ops', async () => {
    const mod = await loadAndInit({});
    expect(mod.getComet()).toBeNull();
    expect(() => mod.updateComet(12)).not.toThrow();
  });

  test('comet builds when the experience opts in', async () => {
    const mod = await loadAndInit({ comet: { enabled: true } });
    expect(mod.getComet()).not.toBeNull();
  });

  test('getCometBase returns the default resting position as a copy', async () => {
    jest.resetModules();
    const mod = await import('../www/shared/js/scene-1.0.0.js');
    const base = mod.getCometBase();
    expect(base).toEqual({ x: 60, y: 150, z: 130 });
    base.x = 999; // mutating the copy must not leak back
    expect(mod.getCometBase().x).toBe(60);
  });

  test('an experience can override the comet base position', async () => {
    const mod = await loadAndInit({ comet: { enabled: true, base: { x: 1, y: 2, z: 3 } } });
    expect(mod.getCometBase()).toEqual({ x: 1, y: 2, z: 3 });
  });
});

describe('day/night config plumb', () => {
  beforeEach(() => {
    installThreeProxy();
    installCanvas();
    installBrowserGlobals();
  });

  test('dayNight.enabled: false freezes the sky at noon', async () => {
    jest.resetModules();
    const mod = await import('../www/shared/js/scene-1.0.0.js');
    mod.initScene({}, { dayNight: { enabled: false } });
    mod.updateDayNightCycle(CYCLE_DURATION * 0.45); // would reach night if running
    expect(mod.isNightTime()).toBe(false);
  });

  test('dayNight.cycleDuration shortens the cycle', async () => {
    jest.resetModules();
    const mod = await import('../www/shared/js/scene-1.0.0.js');
    mod.initScene({}, { dayNight: { cycleDuration: 100 } });
    mod.updateDayNightCycle(45); // 0.5 + 0.45 = 0.95 of the cycle: late night
    expect(mod.isNightTime()).toBe(true);
  });
});
