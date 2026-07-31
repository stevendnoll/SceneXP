// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for the home office experience's world build, exercising
 * the steve store.js orchestration of the shared parts library (world,
 * textures, structures, lighting, people, scenery, npcs) plus the
 * experience-specific builders: the room and closet, the furniture, the
 * screens, Steve himself, the sleeping cat, and the fence birds.
 *
 * Under the chainable THREE proxy nothing renders, but every function that
 * would run during a real page load runs here, so a missing import or a
 * reference left behind by a refactor throws and fails this suite instead
 * of the live site (exactly the failure mode that once shipped: createPerson
 * used without its import, crashing init and bouncing visitors to the 2D
 * site).
 *
 * The floor plan is pure numbers derived from real measurements, so the
 * second half asserts the geometry the way a tape measure would.
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

beforeEach(() => {
  installThree();
  installCanvas();
  installBrowserGlobals();
  globalThis.document.addEventListener = () => {};
  globalThis.document.removeEventListener = () => {};
  globalThis.document.getElementById = () => null;
  // checklist/persistence guards read sessionStorage.
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
});

afterEach(() => {
  uninstallAll();
  delete globalThis.sessionStorage;
});

test('the full office builds and ticks without throwing', async () => {
  jest.resetModules();
  // Import the BUILT shared modules: steve store.js resolves its imports to
  // the .min.js files, and module state must be shared with what we drive
  // here (the source files would be separate module instances). This is why
  // `npm run build` must run before `npm test` after any shared edit.
  const scene = await import('../www/shared/js/scene-1.0.0.min.js');
  const world = await import('../www/shared/js/world-1.0.0.min.js');
  const store = await import('../www/steve/js/store.js');
  const { STEVE_CONFIG } = await import('../www/steve/js/config.js');

  // Same order main.js uses.
  scene.initScene({}, STEVE_CONFIG);
  const colliders = store.initStore();
  expect(Array.isArray(colliders)).toBe(true);
  expect(colliders.length).toBeGreaterThan(0);
  expect(world.getWorldGroup()).not.toBeNull();
  expect(world.getWorldConfig().rootName).toBe('office');

  // Steve is at his desk (getRoquiMesh is the host seam's legacy name),
  // and there are no ambient NPCs in the office
  expect(store.getRoquiMesh()).not.toBeNull();
  expect(store.getDancerMeshes()).toEqual([]);

  // No floating greeter sign in a room this small
  expect(STEVE_CONFIG.greeterSign.enabled).toBe(false);
  expect(store.getHelpSign()).toBeFalsy();

  // The whiteboard paths main.js drives: the (static-content) repaint hook
  // and the click-to-enlarge overlay painter
  store.updateStudioBoard(STEVE_CONFIG.checklist.items, { done: 1, total: 6, complete: false });
  store.drawStudioBoardTo(chainable(), 800, 460);

  // Several seconds of the office ticking: the cat breathing, Steve
  // typing, the editor cursor blinking past its period, and the fence
  // birds advancing through their wait/fly/perch state machine
  const playerPos = { x: 1.2, y: 1.7, z: 1.0 };
  for (let i = 0; i < 300; i++) store.updateStudio(playerPos, 0.02);

  // A dialog pauses the typing and turns Steve toward the visitor;
  // closing it sends him back to work. The dancer seams stay callable
  // no-ops for the import contract.
  store.pauseRoquiForDialog();
  for (let i = 0; i < 5; i++) store.updateStudio(playerPos, 0.016);
  store.resumeRoquiFromDialog();
  store.pauseDancerForDialog(null);
  store.resumeDancerFromDialog();

  // The brightness dial, and the music stubs (no sound rig in the office)
  store.setStudioBrightness(0.8);
  expect(store.toggleStudioMusic()).toBe(false);
  expect(store.isMusicPlaying()).toBe(false);
});

describe('the floor plan and config (pure)', () => {
  let T;
  let CFG;

  beforeEach(async () => {
    jest.resetModules();
    const store = await import('../www/steve/js/store.js');
    T = store.__test__;
    CFG = (await import('../www/steve/js/config.js')).STEVE_CONFIG;
  });

  test('the plan and vertical feet derive from the honest foot', () => {
    expect(T.FT).toBeCloseTo(0.3048, 4);
    expect(T.PFT).toBeCloseTo(T.FT * T.PLAN_SCALE, 6);
    expect(T.VFT).toBeCloseTo(T.FT * T.VERT_SCALE, 6);
    // Camera-comfort factors: generous, but never taller than it is wide
    expect(T.PLAN_SCALE).toBeGreaterThan(1);
    expect(T.VERT_SCALE).toBeGreaterThan(1);
    expect(T.VERT_SCALE).toBeLessThanOrEqual(T.PLAN_SCALE);
  });

  test('the floor plan closes, matching the real room measurements', () => {
    const { room, closet, closetOpening, door, window: win } = T.LAYOUT;

    // 10 plan-ft across, 13 deep, 8 vertical-ft ceiling
    expect(room.maxX - room.minX).toBeCloseTo(10 * T.PFT, 6);
    expect(room.maxZ - room.minZ).toBeCloseTo(13 * T.PFT, 6);
    expect(room.height).toBeCloseTo(8 * T.VFT, 6);

    // The closet takes 7 ft of the south wall; the walkway is the other 3
    expect(closet.maxX - closet.minX).toBeCloseTo(7 * T.PFT, 6);
    expect(room.maxX - closet.maxX).toBeCloseTo(3 * T.PFT, 6);

    // Closet depth is 3 ft; the west wall's exposed run is the other 10
    expect(closet.maxZ - closet.minZ).toBeCloseTo(3 * T.PFT, 6);
    expect(closet.minZ - room.minZ).toBeCloseTo(10 * T.PFT, 6);
    expect(closet.maxZ).toBeCloseTo(room.maxZ, 6);

    // The window's east edge sits about a foot from the NE corner
    expect(room.maxX - (win.x + win.width / 2)).toBeCloseTo(1 * T.PFT, 6);

    // The door is centered in the walkway and keeps 30 x 80 in proportions
    expect(door.x).toBeCloseTo((closet.maxX + room.maxX) / 2, 6);
    expect(door.width / door.height).toBeCloseTo(30 / 80, 3);

    // The closet opening: 5 ft wide, centered in the front wall, at door
    // height, leaving a foot of green pier at either side
    expect(closetOpening.maxX - closetOpening.minX).toBeCloseTo(5 * T.PFT, 6);
    expect((closetOpening.minX + closetOpening.maxX) / 2)
      .toBeCloseTo((closet.minX + closet.maxX) / 2, 6);
    expect(closetOpening.height).toBeCloseTo(door.height, 6);
    expect(closetOpening.minX - closet.minX).toBeCloseTo(1 * T.PFT, 6);
  });

  test("the config's building envelope matches the layout", () => {
    const { room } = T.LAYOUT;
    expect(CFG.building.width).toBeCloseTo(room.maxX - room.minX, 1);
    expect(CFG.building.depth).toBeCloseTo(room.maxZ - room.minZ, 1);
    expect(CFG.building.height).toBeCloseTo(room.height, 1);
  });

  test('the walkable clamp keeps a player radius off every wall face', () => {
    const { room } = T.LAYOUT;
    const r = 0.4;   // CONTROLS_CONFIG.playerRadius
    const b = CFG.worldBounds;
    expect(b.maxX).toBeLessThanOrEqual(room.maxX - room.wallT / 2 - r);
    expect(b.minX).toBeGreaterThanOrEqual(room.minX + room.wallT / 2 + r);
    expect(b.maxZ).toBeLessThanOrEqual(room.maxZ - room.wallT / 2 - r);
    expect(b.minZ).toBeGreaterThanOrEqual(room.minZ + room.wallT / 2 + r);
  });

  test('the spawn stands inside the clamp, in the entry end of the room', () => {
    const b = CFG.worldBounds;
    expect(CFG.spawn.x).toBeGreaterThan(b.minX);
    expect(CFG.spawn.x).toBeLessThan(b.maxX);
    expect(CFG.spawn.z).toBeGreaterThan(b.minZ);
    expect(CFG.spawn.z).toBeLessThan(b.maxZ);
    // South of center: the visitor arrives from the doorway side
    expect(CFG.spawn.z).toBeGreaterThan(0);
  });

  test('every discovery on the checklist is a wired, unique id', () => {
    const ids = CFG.checklist.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The six discoveries: the greeter and whiteboard special paths plus
    // the checklistId-carrying props in main.js's PROP_CONTENT
    expect(ids).toEqual(['hello', 'desk', 'cat', 'board', 'closet', 'litter']);
    CFG.checklist.items.forEach((item) => {
      expect(typeof item.label).toBe('string');
      expect(typeof item.short).toBe('string');
    });
  });
});
