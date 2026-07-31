// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Locks the shared engine's built-in defaults to the Phase 4 minimized world,
 * so a future edit can't silently flip what a bare-config experience gets:
 * a small walkable area, no comet, day/night + night zombies on, and a
 * two-pedestrian sidewalk. An experience wanting more opts in via config.
 */
import { jest } from '@jest/globals';
import { installThree, installCanvas, installBrowserGlobals, uninstallAll } from './helpers/three-stub.mjs';

beforeEach(() => {
  installThree();
  installCanvas();
  installBrowserGlobals();
  globalThis.document.addEventListener = () => {};
  globalThis.document.removeEventListener = () => {};
  globalThis.document.getElementById = () => null;
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
});

afterEach(() => {
  uninstallAll();
  delete globalThis.sessionStorage;
});

test('controls default to the small ±20 walkable square', async () => {
  jest.resetModules();
  const { CONTROLS_CONFIG } = await import('../www/shared/js/controls-1.0.0.js');
  expect(CONTROLS_CONFIG.worldBounds).toEqual({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 });
});

test('the comet is off unless an experience enables it', async () => {
  jest.resetModules();
  const scene = await import('../www/shared/js/scene-1.0.0.js');
  scene.initScene({}, {});
  expect(scene.getComet()).toBeNull();
});

test('the day/night cycle runs by default (night arrives on schedule)', async () => {
  jest.resetModules();
  const scene = await import('../www/shared/js/scene-1.0.0.js');
  scene.initScene({}, {});
  scene.updateDayNightCycle(480 * 0.45); // noon + 0.45 of a cycle = late night
  expect(scene.isNightTime()).toBe(true);
});

test('the checklist starts empty under the neutral storage key', async () => {
  jest.resetModules();
  const checklist = await import('../www/shared/js/checklist-1.0.0.js');
  checklist.initChecklist();
  expect(checklist.getChecklistItems()).toEqual([]);
});

test('a bare config yields two pedestrians who are human by day', async () => {
  jest.resetModules();
  // Built modules: world/pedestrians share state through the .min.js graph.
  const scene = await import('../www/shared/js/scene-1.0.0.min.js');
  const world = await import('../www/shared/js/world-1.0.0.min.js');
  const peds = await import('../www/shared/js/pedestrians-1.0.0.min.js');

  scene.initScene({}, {});   // noon
  world.initWorld({});       // bare config: every default applies
  peds.createSidewalkPedestrians();

  expect(peds.getPedestrianMeshes().length).toBe(2);
  expect(peds.arePedestriansZombies()).toBe(false);

  // Night falls; the default keeps the zombie transformation on.
  scene.updateDayNightCycle(480 * 0.45);
  peds.updateSidewalkPedestrians({ x: 0, y: 1.7, z: 0 }, 0.016, 6.5);
  expect(peds.arePedestriansZombies()).toBe(true);
});
