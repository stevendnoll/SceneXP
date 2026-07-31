// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for the Interstate Tire shop experience's world build:
 * interstate store.js orchestrating the shared parts library (world, people,
 * scenery, npcs, pedestrians, lighting), plus the experience-specific pieces:
 * the channel-flipping waiting-room TV, the whiteboard checklist mirror,
 * Railroad Ave, and the 1892 freight depot.
 *
 * Under the chainable THREE proxy nothing renders, but every function that
 * would run during a real page load runs here, so a reference to something
 * that stayed behind in the carve from another theme (or an import that never
 * got wired) throws and fails this suite instead of the live site.
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

test('the full shop builds and ticks without throwing', async () => {
  jest.resetModules();
  // Import the BUILT shared modules: interstate store.js resolves its imports
  // to the .min.js files, and module state must be shared with what we drive
  // here (the source files would be separate module instances). This is why
  // `npm run build` must run before `npm test` after any shared edit.
  const scene = await import('../www/shared/js/scene-1.0.0.min.js');
  const world = await import('../www/shared/js/world-1.0.0.min.js');
  const store = await import('../www/interstate/js/store.js');
  const listings = await import('../www/interstate/js/listings.js');
  const { INTERSTATE_CONFIG } = await import('../www/interstate/js/config.js');

  // Same order main.js uses.
  scene.initScene({}, INTERSTATE_CONFIG);
  const colliders = store.initStore();
  expect(Array.isArray(colliders)).toBe(true);
  expect(colliders.length).toBeGreaterThan(0);
  expect(world.getWorldGroup()).not.toBeNull();
  expect(world.getWorldConfig().rootName).toBe('store');
  expect(store.getStoreGroup()).not.toBeNull();

  // listings.js is a stub here: the conductor's import block stays stable,
  // and every call is a safe no-op.
  listings.initListings(scene.getScene());
  expect(listings.getListingColliders()).toEqual([]);
  expect(listings.SAMPLE_LISTINGS).toEqual([]);
  expect(listings.resolveListingPodium()).toBeNull();

  // The host took his post behind the counter, and the outdoor-prop registry
  // carries the street furniture plus the historic west side (the freight
  // depot and the Railroad Ave street sign register through the same path).
  // Under the chainable THREE stub userData writes are swallowed, so kind
  // tags can't be read back here; the registry count is the smoke signal.
  expect(store.getGalleryHost()).toBeTruthy();
  expect(store.getOutdoorPropMeshes().length).toBeGreaterThan(0);

  // The waiting-room cast: waypoints first (initGalleryVisitors spawns no one
  // without them, same as main.js), then the customers waiting on their cars.
  // Two representative stops from the conductor's real list.
  store.setGalleryWaypoints([
    { x: -5.8, z: 16.4, lookAtX: -5.8, lookAtZ: 19.2 },  // chairs + magazines
    { x: -9.0, z: 12.4, lookAtX: -9.0, lookAtZ: 10.4 },  // service counter
  ]);
  store.initGalleryVisitors(INTERSTATE_CONFIG.indoorVisitors.count);
  expect(store.getVisitorMeshes().length).toBe(INTERSTATE_CONFIG.indoorVisitors.count);

  // The whiteboard repaint path main.js drives on every checklist change,
  // including the nine-item list with the depot discovery.
  const items = INTERSTATE_CONFIG.checklist.items.map((item, i) => ({ ...item, done: i < 2 }));
  store.updateWhiteboardChecklist(items, { done: 2, total: items.length, complete: false });
  store.drawWhiteboardTo(chainable(), 768, 448);

  // The waiting-room TV flips through its whole channel lineup: 0.25s steps
  // across ~32 seconds covers all four channels, every static transition,
  // and plenty of live race repaints.
  for (let i = 0; i < 128; i++) store.updateWaitingRoomTV(0.25);

  // The interior lighting rig (the clickable switch + dimmer) is wired.
  expect(store.getLightSwitchMesh()).toBeTruthy();
  store.setInteriorLightScale(0.4);
  expect(store.getInteriorLightScale()).toBeCloseTo(0.4);

  // A few frames of street life outside the bay.
  for (let i = 0; i < 5; i++) {
    store.updateSidewalkPedestrians({ x: -10, z: 24 }, 0.016, 6.5);
  }
  expect(typeof store.arePedestriansZombies()).toBe('boolean');
});

describe('the shop core (pure)', () => {
  let store;

  beforeEach(async () => {
    jest.resetModules();
    store = await import('../www/interstate/js/store.js');
  });

  test('shuffled returns a permutation and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const before = input.slice();
    const out = store.__test__.shuffled(input);
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
    const three = store.__test__.pickBalanced(pool, 3, (p) => p.g);
    expect(new Set(three.map((p) => p.g)).size).toBe(3);
    expect(store.__test__.pickBalanced(pool, 99, (p) => p.g)).toHaveLength(6);
  });
});

describe('the Interstate Tire config', () => {
  let INTERSTATE_CONFIG;

  beforeEach(async () => {
    jest.resetModules();
    ({ INTERSTATE_CONFIG } = await import('../www/interstate/js/config.js'));
  });

  test('is deeply frozen (nothing mutates it at runtime)', () => {
    expect(Object.isFrozen(INTERSTATE_CONFIG)).toBe(true);
    expect(Object.isFrozen(INTERSTATE_CONFIG.site.business)).toBe(true);
    expect(Object.isFrozen(INTERSTATE_CONFIG.checklist.items[0])).toBe(true);
  });

  test('the discovery list is well-formed and includes the depot', () => {
    const ids = INTERSTATE_CONFIG.checklist.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('depot');
    expect(INTERSTATE_CONFIG.checklist.storageKey).toBe('interstate-checklist');
    INTERSTATE_CONFIG.checklist.items.forEach((item) => {
      expect(typeof item.label).toBe('string');
      expect(typeof item.short).toBe('string');
    });
  });

  test('the walkable clamp reaches Railroad Ave and the depot', () => {
    const wb = INTERSTATE_CONFIG.worldBounds;
    // The depot's front apron (its center is x -34, z -3) must be reachable,
    // and the avenue (x -21.5 to -28.5) must sit fully inside the clamp.
    expect(wb.minX).toBeLessThanOrEqual(-38);
    expect(wb.minZ).toBeLessThanOrEqual(-12);
    // The sidewalk pedestrians stay inside the clamp too.
    expect(INTERSTATE_CONFIG.pedestrians.minX).toBeGreaterThanOrEqual(wb.minX);
    expect(INTERSTATE_CONFIG.pedestrians.maxX).toBeLessThanOrEqual(wb.maxX);
  });

  test('the business funnel points at the real shop', () => {
    const business = INTERSTATE_CONFIG.site.business;
    expect(business.websiteUrl).toBe('https://www.interstatetireco.com/');
    expect(business.name).toBe('Interstate Tire');
    expect(INTERSTATE_CONFIG.site.home.path).toBe('/');
    expect(INTERSTATE_CONFIG.site.builder.contactPath).toBe('/contact.html');
  });

  test('the autopilot route stays inside the walkable clamp', () => {
    // The tour drives the camera through the controls setters, bypassing the
    // input pipeline, so every node must sit on ground the clamp allows.
    const wb = INTERSTATE_CONFIG.worldBounds;
    expect(INTERSTATE_CONFIG.autopilot.route.length).toBeGreaterThan(4);
    INTERSTATE_CONFIG.autopilot.route.forEach((node) => {
      expect(node.x).toBeGreaterThanOrEqual(wb.minX);
      expect(node.x).toBeLessThanOrEqual(wb.maxX);
      expect(node.z).toBeGreaterThanOrEqual(wb.minZ);
      expect(node.z).toBeLessThanOrEqual(wb.maxZ);
    });
  });

  test('the proof of work shares the visitor-wide storage key', () => {
    // Returning visitors' cached proofs stay valid across experiences on the
    // same serving domain.
    expect(INTERSTATE_CONFIG.proofOfWork.storageKey).toBe('gallery-pow');
    expect(INTERSTATE_CONFIG.proofOfWork.prefix).toBe('11');
  });
});
