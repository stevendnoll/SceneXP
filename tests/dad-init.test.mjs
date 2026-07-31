// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for the NCR Trail experience's world build, exercising
 * the Phase 4/5 seam: dad store.js orchestrating the shared parts library
 * (world, people, scenery, npcs), plus the experience-specific river, the
 * little waterfall, and the passing cyclists.
 *
 * Under the chainable THREE proxy nothing renders, but every function that
 * would run during a real page load runs here, so a reference to something
 * that stayed behind in a carve (or an import that never got wired) throws
 * and fails this suite instead of the live site.
 *
 * The layout contracts (the river beyond the fence, the clamp keeping
 * visitors on dry land) get direct coverage via the __test__ exports.
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

let savedCreateObjectURL;

beforeEach(() => {
  installThree();
  installCanvas();
  installBrowserGlobals();
  globalThis.document.addEventListener = () => {};
  globalThis.document.removeEventListener = () => {};
  globalThis.document.getElementById = () => null;

  // The river ambience's iOS keep-alive spins up a hidden <audio> element;
  // give the stubbed document a functional one (the canvas stub handles
  // 'canvas'), same as the family suite's ocean setup.
  const origCreateElement = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => {
    if (tag === 'audio') {
      return {
        loop: false,
        src: '',
        setAttribute() {},
        play() { return { catch() {} }; },
        pause() {}
      };
    }
    return origCreateElement(tag);
  };

  // The keep-alive wav is served from a blob URL.
  savedCreateObjectURL = globalThis.URL.createObjectURL;
  globalThis.URL.createObjectURL = () => 'blob:stub';

  // The river synthesizes its rumble, burble, and hiss through WebAudio.
  globalThis.window.AudioContext = chainable();

  // checklist/persistence guards read sessionStorage.
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
});

afterEach(() => {
  uninstallAll();
  globalThis.URL.createObjectURL = savedCreateObjectURL;
  delete globalThis.sessionStorage;
});

test('the full trail builds and ticks without throwing', async () => {
  jest.resetModules();
  // Import the BUILT shared modules: dad store.js resolves its imports to the
  // .min.js files, and module state must be shared with what we drive here.
  // This is why `npm run build` must run before `npm test` after any shared edit.
  const scene = await import('../www/shared/js/scene-1.0.0.min.js');
  const world = await import('../www/shared/js/world-1.0.0.min.js');
  const store = await import('../www/dad/js/store.js');
  const { DAD_CONFIG } = await import('../www/dad/js/config.js');

  // Same order main.js uses.
  scene.initScene({}, DAD_CONFIG);
  const colliders = store.initStore();
  expect(Array.isArray(colliders)).toBe(true);
  expect(colliders.length).toBeGreaterThan(0);
  expect(world.getWorldGroup()).not.toBeNull();
  expect(world.getWorldConfig().rootName).toBe('trail');
  expect(store.getStoreGroup()).not.toBeNull();

  // The walkers out enjoying the trail: waypoints first (initGalleryVisitors
  // spawns no one without them, same as main.js), then the trail dress code.
  store.setGalleryWaypoints([
    { x: -4, z: 0.5, lookAtX: 0, lookAtZ: 2 },
    { x: 4, z: 0.5, lookAtX: 0, lookAtZ: -2 },
  ]);
  store.initGalleryVisitors(DAD_CONFIG.walkers.count);
  expect(store.getVisitorMeshes().length).toBeGreaterThan(0);
  store.dressWalkersForTheTrail();

  // The kiosk repaint path main.js drives on every checklist change.
  const items = DAD_CONFIG.checklist.items.map((item, i) => ({ ...item, done: i === 0 }));
  store.updateKioskChecklist(items, { done: 1, total: items.length, complete: false });
  store.drawKioskTo(chainable(), 768, 448);

  // The cyclists came out for a ride, and the river keeps flowing (the same
  // per-frame calls main.js makes), including a rider pausing for a chat.
  expect(store.getCyclistMeshes().length).toBeGreaterThan(0);
  const playerPos = { x: 0, y: 1.7, z: 2 };
  for (let i = 0; i < 5; i++) {
    store.updateRiver(0.016);
    store.updateTrailCyclists(playerPos, 0.016);
  }
  store.pauseCyclistForDialog(store.getCyclistMeshes()[0]);
  store.updateTrailCyclists(playerPos, 0.016);
  store.resumeCyclistFromDialog();
  store.updateTrailCyclists(playerPos, 0.016);

  // The river ambience toggles on (stubbed AudioContext) and back off, and
  // the render loop keeps ticking in both states (flutter shaping included).
  expect(store.isRiverAudioOn()).toBe(false);
  expect(store.toggleRiverAudio()).toBe(true);
  expect(store.isRiverAudioOn()).toBe(true);
  for (let i = 0; i < 3; i++) store.updateRiverAudio(0.016);
  expect(store.toggleRiverAudio()).toBe(false);
  expect(store.isRiverAudioOn()).toBe(false);
  store.updateRiverAudio(0.016);
});

describe('the trail core (pure)', () => {
  let store;
  let DAD_CONFIG;
  let T;

  beforeEach(async () => {
    jest.resetModules();
    store = await import('../www/dad/js/store.js');
    ({ DAD_CONFIG } = await import('../www/dad/js/config.js'));
    T = store.__test__;
  });

  test('the layout reads like the real place, south to north', () => {
    // Rails, then the trail, then the fence, the bank, and the river.
    expect(T.LAYOUT.railsZ).toBeLessThan(T.LAYOUT.trailZ);
    expect(T.LAYOUT.trailZ).toBeLessThan(T.LAYOUT.fenceZ);
    expect(T.LAYOUT.fenceZ).toBeLessThan(T.LAYOUT.bankTopZ);
    expect(T.LAYOUT.bankTopZ).toBeLessThan(T.LAYOUT.riverNearZ);
    expect(T.LAYOUT.riverNearZ).toBeLessThan(T.LAYOUT.riverFarZ);
    expect(T.LAYOUT.riverFarZ).toBeLessThan(T.LAYOUT.farBankZ);
    // The water below the falls sits lower than the water above them.
    expect(T.LAYOUT.lowerWaterY).toBeLessThan(T.LAYOUT.upperWaterY);
    // The falls are within the visible ground.
    expect(Math.abs(T.LAYOUT.fallsX)).toBeLessThan(T.LAYOUT.groundLength / 2);
  });

  test('the walkable clamp keeps every visitor on dry land', () => {
    expect(DAD_CONFIG.worldBounds.maxZ).toBeLessThanOrEqual(T.LAYOUT.bankTopZ);
    // And the spawn is on the trail side of the fence.
    expect(DAD_CONFIG.spawn.z).toBeLessThan(T.LAYOUT.fenceZ);
  });

  test("the cyclists' bikes and dad's glasses build under the stub", () => {
    expect(T.createHybridBike()).toBeTruthy();
    expect(T.createGlasses()).toBeTruthy();
  });
});

describe('the NCR Trail config', () => {
  let DAD_CONFIG;

  beforeEach(async () => {
    jest.resetModules();
    ({ DAD_CONFIG } = await import('../www/dad/js/config.js'));
  });

  test('is deeply frozen (nothing mutates it at runtime)', () => {
    expect(Object.isFrozen(DAD_CONFIG)).toBe(true);
    expect(Object.isFrozen(DAD_CONFIG.checklist.items[0])).toBe(true);
  });

  test('the autopilot route stays inside the walkable clamp', () => {
    const wb = DAD_CONFIG.worldBounds;
    DAD_CONFIG.autopilot.route.forEach((node) => {
      expect(node.x).toBeGreaterThanOrEqual(wb.minX);
      expect(node.x).toBeLessThanOrEqual(wb.maxX);
      expect(node.z).toBeGreaterThanOrEqual(wb.minZ);
      expect(node.z).toBeLessThanOrEqual(wb.maxZ);
    });
  });

  test('the discovery list is well-formed', () => {
    const ids = DAD_CONFIG.checklist.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(typeof id).toBe('string'));
  });

  test('a peaceful place: no zombies on this trail, and the shared PoW key', () => {
    expect(DAD_CONFIG.zombiesAtNight).toBe(false);
    expect(DAD_CONFIG.proofOfWork.storageKey).toBe('gallery-pow');
  });
});
