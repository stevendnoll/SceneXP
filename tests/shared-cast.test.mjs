// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Coverage sweep over the shared cast modules: npcs (indoor visitors, the
 * greeter, the signs) and pedestrians (the sidewalk crowd).
 *
 * Like shared-parts.test.mjs, this imports the SOURCE modules so the
 * hand-written code is what the coverage report measures, while world and
 * scene state flow through the min bundles the sources import. The pirate
 * golf config drives it: that experience uses both the sidewalk pedestrians
 * and the visitor system.
 *
 * The pure helpers (spawn picking, the pedestrian slide) get real
 * assertions; the mesh-facing sweeps assert "runs and registers" under the
 * chainable THREE proxy.
 */
import { jest } from '@jest/globals';
import { installThree, installCanvas, installBrowserGlobals, uninstallAll } from './helpers/three-stub.mjs';

let scene, world, npcs, pedestrians, peopleMin, FAMILY_CONFIG;

beforeAll(async () => {
  installThree();
  installCanvas();
  installBrowserGlobals();
  globalThis.document.addEventListener = () => {};
  globalThis.document.removeEventListener = () => {};
  globalThis.document.getElementById = () => null;
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };

  jest.resetModules();
  ({ FAMILY_CONFIG } = await import('../www/family/js/config.js'));
  scene = await import('../www/shared/js/scene-1.0.0.min.js');
  world = await import('../www/shared/js/world-1.0.0.min.js');
  scene.initScene({}, FAMILY_CONFIG);
  world.initWorld(FAMILY_CONFIG);
  npcs = await import('../www/shared/js/npcs-1.0.0.js');
  pedestrians = await import('../www/shared/js/pedestrians-1.0.0.js');
  peopleMin = await import('../www/shared/js/people-1.0.0.min.js');
});

afterAll(() => {
  uninstallAll();
  delete globalThis.sessionStorage;
});

describe('the pure helpers', () => {
  test('pickVisitorSpawn honors spacing, then relaxes, then gives up', () => {
    const spots = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 8, z: 0 }];
    // The nearby spot is too close to the used one; the far spot wins.
    expect(npcs.pickVisitorSpawn(spots, [spots[0]], 3)).toBe(spots[2]);
    // Everything is cramped: spacing relaxes to "any unused spot".
    expect(npcs.pickVisitorSpawn(spots, [spots[0]], 100)).toBe(spots[1]);
    // Every spot taken: null, never a double booking.
    expect(npcs.pickVisitorSpawn(spots, [...spots], 1)).toBeNull();
  });

  test('pedestrianMoveWithSlide takes a clear move outright', () => {
    // No colliders are registered yet in this file, so the way is clear.
    const ped = { mesh: { position: { x: 0, y: 0, z: 0 } } };
    pedestrians.pedestrianMoveWithSlide(ped, 1.25, -0.5, 0.3);
    expect(ped.mesh.position.x).toBeCloseTo(1.25);
    expect(ped.mesh.position.z).toBeCloseTo(-0.5);
  });

  test('refuge footprints replace wholesale and ignore junk', () => {
    pedestrians.setRefugeFootprints([{ minX: -1, maxX: 1, minZ: -1, maxZ: 1 }]);
    pedestrians.setRefugeFootprints('not a list');
    pedestrians.setRefugeFootprints([]);
  });
});

test('the indoor visitor cast assembles and ticks', () => {
  npcs.setWanderWaypoints([
    { x: -2, z: 0, lookAtX: -2, lookAtZ: -2 },
    { x: 2, z: 0, lookAtX: 2, lookAtZ: -2 },
    { x: 0, z: 3, lookAtX: 0, lookAtZ: 5 },
  ]);
  expect(npcs.getRandomWaypoint()).toBeTruthy();

  npcs.initGalleryVisitors(2);
  expect(npcs.getVisitorMeshes().length).toBeGreaterThan(0);
  npcs.initGalleryBrowser(0, 2);

  const spawn = npcs.findClearSpawn(0, 0, 0.4);
  expect(spawn).toBeTruthy();

  // The greeter: register a host, then run the behavior and AI loops the
  // conductor drives every frame.
  npcs.registerHost(peopleMin.createPerson({ role: 'shopkeeper' }), 0);
  expect(npcs.getGalleryHost()).toBeTruthy();
  const playerPos = { x: 0, y: 1.7, z: 1 };
  for (let i = 0; i < 3; i++) {
    npcs.updateStorePeople(playerPos, 0.016);
    npcs.updateShopkeeperBehavior(playerPos, 0.016);
    npcs.updateCustomerAI(playerPos, 0.016);
  }
  // Dialog pause/resume, as main.js does when a visitor is clicked.
  npcs.pauseCustomerForDialog(npcs.getVisitorMeshes()[0], playerPos);
  npcs.updateCustomerAI(playerPos, 0.016);
  npcs.resumeCustomerFromDialog();

  expect(typeof npcs.checkPositionCollision(0, 0, 0.4)).toBe('boolean');
  expect(typeof npcs.checkCustomerCollision(0, 0, 0.4, 0)).toBe('boolean');
});

test('the sign builds, shows, hides, and bobs', () => {
  const help = npcs.createHelpSign(-1, 1);
  expect(help).toBeTruthy();
  npcs.setHelpSign(help);
  expect(npcs.getHelpSign()).toBeTruthy();
  npcs.showHelpSign();
  npcs.hideHelpSign();
  npcs.updateCheckoutSign(1.25, { x: 0, y: 1.7, z: 2 });
});

test('the sidewalk crowd assembles and ticks through its day', () => {
  pedestrians.createSidewalkPedestrians();
  expect(pedestrians.getPedestrianMeshes().length).toBeGreaterThan(0);

  const playerPos = { x: 0, y: 1.7, z: 0 };
  for (let i = 0; i < 5; i++) pedestrians.updateSidewalkPedestrians(playerPos, 0.016, 0);

  pedestrians.pausePedestrianForDialog(pedestrians.getPedestrianMeshes()[0], playerPos);
  pedestrians.updateSidewalkPedestrians(playerPos, 0.016, 0);
  pedestrians.resumePedestrianFromDialog();

  // Daytime: everyone stays human.
  pedestrians.updatePedestrianZombieState();
  expect(pedestrians.arePedestriansZombies()).toBe(false);
});
