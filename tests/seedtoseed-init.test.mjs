// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for the Seed to Seed garden experience's world build,
 * exercising the Phase 4/5 seam: seedtoseed store.js orchestrating the shared
 * parts library (world, people, scenery, npcs), plus the experience-specific
 * greenhouse discovery zone, garden chalkboard, and landscape lights.
 *
 * Under the chainable THREE proxy nothing renders, but every function that
 * would run during a real page load runs here, so a reference to something
 * that stayed behind in the carve from another theme (or an import that never
 * got wired) throws and fails this suite instead of the live site.
 *
 * The pure helpers (shuffled, pickBalanced) and the layout/config contracts
 * the conductor and the shared autopilot rely on get direct coverage below.
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

test('the full garden builds and ticks without throwing', async () => {
  jest.resetModules();
  // Import the BUILT shared modules: seedtoseed store.js resolves its imports
  // to the .min.js files, and module state must be shared with what we drive
  // here (the source files would be separate module instances). This is why
  // `npm run build` must run before `npm test` after any shared edit.
  const scene = await import('../www/shared/js/scene-1.0.0.min.js');
  const world = await import('../www/shared/js/world-1.0.0.min.js');
  const store = await import('../www/seedtoseed/js/store.js');
  const listings = await import('../www/seedtoseed/js/listings.js');
  const { SEED_CONFIG } = await import('../www/seedtoseed/js/config.js');

  // Same order main.js uses.
  scene.initScene({}, SEED_CONFIG);
  const colliders = store.initStore();
  expect(Array.isArray(colliders)).toBe(true);
  expect(colliders.length).toBeGreaterThan(0);
  expect(world.getWorldGroup()).not.toBeNull();
  expect(world.getWorldConfig().rootName).toBe('garden');
  expect(store.getStoreGroup()).not.toBeNull();

  // listings.js is a stub here (same as the other gallery experiences): the conductor's
  // import block stays stable, and every call is a safe no-op.
  listings.initListings(scene.getScene());
  expect(listings.getListingColliders()).toEqual([]);
  expect(listings.getListingWaypoints()).toEqual([]);
  expect(listings.SAMPLE_LISTINGS).toEqual([]);
  expect(listings.resolveListingPodium()).toBeNull();

  // The gardener took his post among the beds, and the greenhouse registered
  // with the shared outdoor-prop registry.
  expect(store.getGalleryHost()).toBeTruthy();
  expect(store.getOutdoorPropMeshes().length).toBeGreaterThan(0);

  // The strolling visitor cast: waypoints first (initGalleryVisitors spawns
  // no one without them, same as main.js), then the guests, dressed for the
  // garden. Two representative stops from the conductor's real list.
  store.setGalleryWaypoints([
    { x: -8, z: 6.6, lookAtX: -8, lookAtZ: 8.6 },   // the garden chalkboard
    { x: 0, z: 3.5, lookAtX: 0, lookAtZ: 1.5 },     // between the raised beds
  ]);
  store.initGalleryVisitors(SEED_CONFIG.walkers.count);
  expect(store.getVisitorMeshes().length).toBe(SEED_CONFIG.walkers.count);

  // The chalkboard repaint path main.js drives on every checklist change.
  const items = SEED_CONFIG.checklist.items.map((item, i) => ({ ...item, done: i < 2 }));
  store.updateKioskChecklist(items, { done: 2, total: items.length, complete: false });
  store.drawKioskTo(chainable(), 768, 448);

  // A few frames of garden life (butterflies over the borders), and the
  // landscape lights across the whole day/night sweep.
  for (let i = 0; i < 5; i++) store.updateGarden(0.016);
  store.updateGardenLights(0);     // noon: the spotlights sleep
  store.updateGardenLights(0.5);   // dusk
  store.updateGardenLights(1);     // midnight: the spotlights keep watch

  // The greenhouse discovery zone main.js polls from the player position:
  // the tour's seedling-table stop is inside, the spawn lawn is not.
  const insideStop = SEED_CONFIG.autopilot.route.find((n) => store.isInsideGreenhouse(n));
  expect(insideStop).toBeTruthy();
  expect(store.isInsideGreenhouse(SEED_CONFIG.spawn)).toBe(false);
});

describe('the garden core (pure)', () => {
  let store;
  let SEED_CONFIG;
  let T;

  beforeEach(async () => {
    jest.resetModules();
    store = await import('../www/seedtoseed/js/store.js');
    ({ SEED_CONFIG } = await import('../www/seedtoseed/js/config.js'));
    T = store.__test__;
  });

  test('the layout holds together', () => {
    // The signature planter boxes: 2 rows x 2 columns, all four crops.
    expect(T.LAYOUT.beds).toHaveLength(4);
    expect(new Set(T.LAYOUT.beds.map((bed) => bed.crop)).size).toBe(4);
    // No bed may sit in the main mulch path's corridor (the path is 2.2 wide
    // and runs up x = gateX + 2). Regression: the middle column once did.
    const pathX = T.LAYOUT.gateX + 2;
    T.LAYOUT.beds.forEach((bed) => {
      expect(Math.abs(bed.x - pathX)).toBeGreaterThan(1.1 + T.LAYOUT.bedWidth / 2);
    });
    // The greenhouse sits inside the walkable clamp, so a visitor can always
    // step in for the 'greenhouse' discovery.
    const gh = T.LAYOUT.greenhouse;
    const wb = SEED_CONFIG.worldBounds;
    expect(gh.minX).toBeGreaterThan(wb.minX);
    expect(gh.maxX).toBeLessThan(wb.maxX);
    expect(gh.minZ).toBeGreaterThan(wb.minZ);
    expect(gh.maxZ).toBeLessThan(wb.maxZ);
    // The owner stands inside his can-see-you rectangle, so the greeter
    // look-at behavior can ever trigger.
    const b = SEED_CONFIG.building;
    expect(Math.abs(T.LAYOUT.ownerSpot.x - b.positionX)).toBeLessThan(b.width / 2);
    expect(Math.abs(T.LAYOUT.ownerSpot.z - b.positionZ)).toBeLessThan(b.depth / 2);
  });

  test('the visitor spawns on the main path, facing the owner', () => {
    // The spawn sits on the path centerline, inside the garden.
    expect(SEED_CONFIG.spawn.x).toBe(T.LAYOUT.gateX + 2);
    expect(SEED_CONFIG.spawn.z).toBeLessThan(T.LAYOUT.fenceSouthZ);
    expect(SEED_CONFIG.spawn.z).toBeGreaterThan(T.LAYOUT.fenceNorthZ);
    // And the opening gaze lands on the owner (yaw 0 faces -Z, the same
    // convention the controls and autopilot suites document).
    const expectedYaw = Math.atan2(
      -(T.LAYOUT.ownerSpot.x - SEED_CONFIG.spawn.x),
      -(T.LAYOUT.ownerSpot.z - SEED_CONFIG.spawn.z)
    );
    expect(SEED_CONFIG.rotation.yaw).toBeCloseTo(expectedYaw, 1);
  });

  test('the greenhouse zone excludes the walls and the doorway apron', () => {
    const gh = T.LAYOUT.greenhouse;
    const cx = (gh.minX + gh.maxX) / 2;
    const cz = (gh.minZ + gh.maxZ) / 2;
    expect(store.isInsideGreenhouse({ x: cx, z: cz })).toBe(true);
    expect(store.isInsideGreenhouse({ x: gh.minX + 0.1, z: cz })).toBe(false);
    expect(store.isInsideGreenhouse({ x: gh.maxX - 0.1, z: cz })).toBe(false);
    expect(store.isInsideGreenhouse({ x: cx, z: gh.maxZ - 0.1 })).toBe(false);
  });

  test('shuffled returns a permutation and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const before = input.slice();
    const out = T.shuffled(input);
    expect(out).toHaveLength(input.length);
    expect([...out].sort((a, b) => a - b)).toEqual(before);
    expect(input).toEqual(before);
  });

  test('pickBalanced covers every group before repeating any', () => {
    const pool = [
      { g: 'a', id: 1 }, { g: 'a', id: 2 }, { g: 'a', id: 3 },
      { g: 'b', id: 4 }, { g: 'b', id: 5 },
      { g: 'c', id: 6 },
    ];
    // n equal to the group count: exactly one from each group.
    const three = T.pickBalanced(pool, 3, (p) => p.g);
    expect(new Set(three.map((p) => p.g)).size).toBe(3);
    // A larger n never picks the same item twice and still covers every group.
    const five = T.pickBalanced(pool, 5, (p) => p.g);
    expect(five).toHaveLength(5);
    expect(new Set(five.map((p) => p.id)).size).toBe(5);
    ['a', 'b', 'c'].forEach((g) => expect(five.some((p) => p.g === g)).toBe(true));
    // Asking past the pool returns the whole pool, once each.
    expect(T.pickBalanced(pool, 99, (p) => p.g)).toHaveLength(6);
  });

  test("the gardener's beard builds under the stub", () => {
    expect(T.createBeard('#5a4632')).toBeTruthy();
  });
});

describe('the Seed to Seed config', () => {
  let SEED_CONFIG;

  beforeEach(async () => {
    jest.resetModules();
    ({ SEED_CONFIG } = await import('../www/seedtoseed/js/config.js'));
  });

  test('is deeply frozen (nothing mutates it at runtime)', () => {
    expect(Object.isFrozen(SEED_CONFIG)).toBe(true);
    expect(Object.isFrozen(SEED_CONFIG.site.business)).toBe(true);
    expect(Object.isFrozen(SEED_CONFIG.autopilot.route[0])).toBe(true);
  });

  test('the autopilot route stays inside the walkable clamp', () => {
    // The tour drives the camera through the controls setters, bypassing the
    // input pipeline, so every node must sit on ground the clamp allows.
    const wb = SEED_CONFIG.worldBounds;
    SEED_CONFIG.autopilot.route.forEach((node) => {
      expect(node.x).toBeGreaterThanOrEqual(wb.minX);
      expect(node.x).toBeLessThanOrEqual(wb.maxX);
      expect(node.z).toBeGreaterThanOrEqual(wb.minZ);
      expect(node.z).toBeLessThanOrEqual(wb.maxZ);
    });
  });

  test('the discovery list is well-formed', () => {
    const ids = SEED_CONFIG.checklist.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SEED_CONFIG.checklist.storageKey).toBe('seedtoseed-checklist');
    SEED_CONFIG.checklist.items.forEach((item) => {
      expect(typeof item.label).toBe('string');
      expect(typeof item.short).toBe('string');
    });
  });

  test('the guest cast keeps real variety in its weighted skin tones', () => {
    const tones = SEED_CONFIG.visitors.skinTones;
    expect(Array.isArray(tones)).toBe(true);
    // Weighted is fine; monochrome is not. At least three distinct tones.
    expect(new Set(tones).size).toBeGreaterThanOrEqual(3);
    // The mobile crowd is the conservative one, never the bigger one.
    expect(SEED_CONFIG.walkers.mobileCount).toBeGreaterThanOrEqual(1);
    expect(SEED_CONFIG.walkers.count).toBeGreaterThanOrEqual(SEED_CONFIG.walkers.mobileCount);
  });

  test('the proof of work shares the visitor-wide storage key', () => {
    // Returning visitors' cached proofs stay valid across experiences on the
    // same serving domain.
    expect(SEED_CONFIG.proofOfWork.storageKey).toBe('gallery-pow');
    expect(SEED_CONFIG.proofOfWork.prefix).toBe('11');
  });
});
