// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Coverage sweep over the shared parts library's builder modules: textures,
 * structures, furniture, street, lighting, scenery, doors, world, and people.
 *
 * The experience init suites already drive these paths through the BUILT
 * .min.js bundles; this file imports the SOURCE modules directly so the
 * hand-written code is what executes (and what the coverage report measures).
 * Under the chainable THREE proxy nothing renders, so most builder tests
 * assert "builds and returns something" — the value is that every line of
 * geometry assembly actually runs. Where a part does real arithmetic on
 * plain objects (doors, easing), the tests assert real behavior.
 *
 * Module state is shared through the min bundles the sources import (world
 * config, scene), so one world is initialized for the whole file, with a
 * doorOffsetX added for the door part.
 */
import { jest } from '@jest/globals';
import { installThree, installCanvas, installBrowserGlobals, uninstallAll } from './helpers/three-stub.mjs';

function chainable() {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive || prop === 'valueOf') return () => 0;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'then') return undefined;
      return chainable();
    },
    set() { return true; },
    apply() { return chainable(); },
    construct() { return chainable(); },
  });
}

let scene, world, textures, structures, furniture, street, lighting, scenery, doors, people, worldSrc;

beforeAll(async () => {
  installThree();
  installCanvas();
  installBrowserGlobals();
  globalThis.document.addEventListener = () => {};
  globalThis.document.removeEventListener = () => {};
  globalThis.document.getElementById = () => null;
  globalThis.window.AudioContext = chainable();
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };

  jest.resetModules();
  const { ROQUI_CONFIG } = await import('../www/roqui/js/config.js');
  // The studio config, plus the door offset the door part expects indoors.
  const config = { ...ROQUI_CONFIG, building: { ...ROQUI_CONFIG.building, doorOffsetX: 0 } };

  scene = await import('../www/shared/js/scene-1.0.0.min.js');
  world = await import('../www/shared/js/world-1.0.0.min.js');
  scene.initScene({}, config);
  world.initWorld(config);

  textures = await import('../www/shared/js/textures-1.0.0.js');
  structures = await import('../www/shared/js/structures-1.0.0.js');
  furniture = await import('../www/shared/js/furniture-1.0.0.js');
  street = await import('../www/shared/js/street-1.0.0.js');
  lighting = await import('../www/shared/js/lighting-1.0.0.js');
  scenery = await import('../www/shared/js/scenery-1.0.0.js');
  doors = await import('../www/shared/js/doors-1.0.0.js');
  people = await import('../www/shared/js/people-1.0.0.js');
  worldSrc = await import('../www/shared/js/world-1.0.0.js');
});

afterAll(() => {
  uninstallAll();
  delete globalThis.sessionStorage;
});

test('every procedural texture builds', () => {
  expect(textures.createTileFloorTexture()).toBeTruthy();
  expect(textures.createConcreteFloorTexture()).toBeTruthy();
  expect(textures.createStuccoTexture()).toBeTruthy();
  expect(textures.createWoodFloorTexture()).toBeTruthy();
});

test('every structural piece builds into the world', () => {
  // The builders add straight to the world group (no return value); the
  // observable effect is the collider registry growing behind them.
  const material = new globalThis.THREE.MeshStandardMaterial();
  const before = world.getColliders().length;
  structures.createWall(4, 3, 0.2, 0, 1.5, 0, 0, material, 'test-wall');
  structures.createWallSegment(2, 3, 0.2, 1, 1.5, 0, material, 'test-segment');
  structures.createWindowFrame(1.5, 1.2, 0, 1.5, 2, material, 'test-window');
  structures.createDoorFrame(1.2, 2.2, 0, 3, material);
  expect(world.getColliders().length).toBeGreaterThan(before);
});

test('every furniture piece builds', () => {
  expect(furniture.createTallPlant()).toBeTruthy();
  expect(furniture.createSmallPlant()).toBeTruthy();
  expect(furniture.createSnakePlant()).toBeTruthy();
  expect(furniture.createFernPlant()).toBeTruthy();
  expect(furniture.createSofa()).toBeTruthy();
  expect(furniture.createLoungeChair()).toBeTruthy();
  expect(furniture.createVendingMachine()).toBeTruthy();
});

test('every street prop builds without throwing', () => {
  street.createTree(1, 2);
  street.createTree(-1, 2, 1.4);
  street.createStreetLamp(-2, 3);
  street.createBench(0, 4, Math.PI / 2);
  street.createPlanter(2, 2);
});

test('the interior lighting rig builds and its knobs respond', () => {
  lighting.createCeilingLights();
  lighting.createInteriorAmbientLight();
  lighting.updateInteriorAmbientLight();
  lighting.setInteriorLightScale(0.5);
  expect(lighting.getInteriorLightScale()).toBe(0.5);
  lighting.setCeilingLights(true, 0.8);
  lighting.setCeilingLights(false);
  lighting.createLightSwitch();
  expect(lighting.getLightSwitchMesh()).toBeTruthy();
  lighting.createExitSign();
  expect(lighting.createExitSignTexture()).toBeTruthy();
});

test('the background scenery builds and animates', () => {
  scenery.createBackgroundScenery();
  scenery.createClouds();
  expect(scenery.createCloud(1)).toBeTruthy();
  scenery.updateBackgroundAnimations(0.016);
});

test('the automatic doors open for an approaching visitor and close behind them', () => {
  // Plain objects instead of meshes: the door math is real arithmetic on
  // position.x and userData.closedX, so it is fully assertable.
  const left = { position: { x: -0.6 }, userData: { closedX: -0.6 } };
  const right = { position: { x: 0.6 }, userData: { closedX: 0.6 } };
  doors.registerDoors(left, right, { triggerDistance: 3, maxSlide: 1, openSpeed: 5 });
  doors.initDoorAudio();

  expect(doors.getDoorsOpen()).toBe(false);
  // The door sits at (positionX + doorOffsetX, positionZ + depth/2) = (0, 7).
  const atDoor = { x: 0, y: 1.7, z: 7 };
  for (let i = 0; i < 5; i++) doors.updateDoors(atDoor, 0.1);
  expect(doors.getDoorsOpen()).toBe(true);
  expect(left.position.x).toBeCloseTo(-1.6);  // slid fully aside
  expect(right.position.x).toBeCloseTo(1.6);

  const farAway = { x: 0, y: 1.7, z: 20 };
  for (let i = 0; i < 5; i++) doors.updateDoors(farAway, 0.1);
  expect(doors.getDoorsOpen()).toBe(false);
  expect(left.position.x).toBeCloseTo(-0.6);  // back home
  expect(right.position.x).toBeCloseTo(0.6);

  doors.playDoorSound(true);
  doors.playDoorSound(false);
});

test('easeInOutQuad is the standard smooth-step curve', () => {
  expect(doors.easeInOutQuad(0)).toBe(0);
  expect(doors.easeInOutQuad(0.25)).toBeCloseTo(0.125);
  expect(doors.easeInOutQuad(0.5)).toBeCloseTo(0.5);
  expect(doors.easeInOutQuad(0.75)).toBeCloseTo(0.875);
  expect(doors.easeInOutQuad(1)).toBe(1);
});

test('the world context source keeps its registries', () => {
  const { ROQUI_CONFIG } = { ROQUI_CONFIG: worldSrc.getWorldConfig() };
  worldSrc.initWorld({ rootName: 'test-root', building: { width: 4, depth: 4 } });
  expect(worldSrc.getWorldGroup()).toBeTruthy();
  expect(worldSrc.getWorldConfig().rootName).toBe('test-root');
  const before = worldSrc.getColliders().length;
  worldSrc.addCollider({ box: chainable(), type: 'wall' });
  expect(worldSrc.getColliders().length).toBe(before + 1);
  worldSrc.addColliderForMesh(new globalThis.THREE.Mesh());
  expect(worldSrc.getColliders().length).toBe(before + 2);
  const props = worldSrc.getOutdoorPropMeshes().length;
  worldSrc.registerOutdoorProp(new globalThis.THREE.Group(), 'test-prop');
  expect(worldSrc.getOutdoorPropMeshes().length).toBe(props + 1);
  expect(typeof worldSrc.isMobileDevice()).toBe('boolean');
  void ROQUI_CONFIG;
});

test('every person variant builds (each flag walks its own branch)', () => {
  expect(people.createPerson({})).toBeTruthy();
  expect(people.createPerson({ role: 'shopkeeper', hasApron: true })).toBeTruthy();
  expect(people.createPerson({ hairStyle: 'long', hasSkirt: true })).toBeTruthy();
  expect(people.createPerson({ bald: true, muscular: true })).toBeTruthy();
  expect(people.createPerson({ hasSuit: true, tieColor: 0x8c1d2c })).toBeTruthy();
  expect(people.createPerson({ dressShirt: true })).toBeTruthy();
});

test('the people helpers behave (source parity with the min-bundle tests)', () => {
  const input = [1, 2, 3, 4, 5];
  const out = people.shuffled(input);
  expect([...out].sort((a, b) => a - b)).toEqual(input);
  const pool = [{ g: 'a' }, { g: 'a' }, { g: 'b' }];
  const picked = people.pickBalanced(pool, 2, (p) => p.g);
  expect(new Set(picked.map((p) => p.g)).size).toBe(2);
});
