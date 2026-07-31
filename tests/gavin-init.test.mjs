// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for the bug patrol experience's world build, exercising
 * the gavin store.js orchestration of the shared parts library (world,
 * scene, people, scenery) plus the experience-specific builders: the patio
 * and fence, the backyard trees, the cedar planter and its ant line, the
 * vine-on-post jasmine with its instanced leaves and pinwheel flowers, the
 * bugs of both shifts, the solar lights, and the three kids.
 *
 * Under the chainable THREE proxy nothing renders, but every function that
 * would run during a real page load runs here, so a missing import or a
 * reference left behind by a refactor throws and fails this suite instead
 * of the live site.
 *
 * The layout is pure numbers composed for one fixed camera, so the pure
 * half asserts the composition the way the camera would see it, including
 * the regression that matters most: the leaf-free peek window must always
 * contain the sight line to Gavin's face.
 */
import { jest } from '@jest/globals';
import { readFile } from 'node:fs/promises';
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

test('the full garden builds and ticks through day, dusk, and night', async () => {
  jest.resetModules();
  // Import the BUILT shared modules: gavin store.js resolves its imports to
  // the .min.js files, and module state must be shared with what we drive
  // here. This is why `npm run build` must run before `npm test` after any
  // shared edit.
  const scene = await import('../www/shared/js/scene-1.0.0.min.js');
  const world = await import('../www/shared/js/world-1.0.0.min.js');
  const store = await import('../www/gavin/js/store.js');
  const { GAVIN_CONFIG } = await import('../www/gavin/js/config.js');

  // Same order main.js uses.
  scene.initScene({}, GAVIN_CONFIG);
  const garden = store.initStore();
  expect(garden).toBeTruthy();
  expect(world.getWorldGroup()).not.toBeNull();
  expect(world.getWorldConfig().rootName).toBe('garden');

  // Mantis Watch's contract: exactly three mantises, every one tagged for
  // the tap test's walk-up.
  const mantises = store.getMantisMeshes();
  expect(mantises).toHaveLength(3);

  // The prop registry is populated (the storytelling click targets):
  // ladybugs, ants, bees, plants, lights, night critters, and the kids.
  expect(world.getOutdoorPropMeshes().length).toBeGreaterThanOrEqual(30);

  // Several seconds of daytime: the plant sways, ladybugs walk their
  // vines, mantises scan, ants march, bees commute, kids lean and peer.
  expect(scene.getNightFactor()).toBe(0);
  for (let i = 0; i < 300; i++) store.updateGarden(0.02);

  // A found mantis celebrates without derailing the loop; a bogus group
  // is politely ignored.
  store.celebrateMantisFound(mantises[0]);
  store.celebrateMantisFound(null);
  for (let i = 0; i < 30; i++) store.updateGarden(0.02);

  // Sunset: drive the shared sky from noon past dusk, then run the night
  // shift (fireflies, snails, slugs, bats, solar lights) for a while.
  for (let i = 0; i < 200; i++) scene.updateDayNightCycle(1);
  expect(scene.getNightFactor()).toBe(1);
  for (let i = 0; i < 300; i++) store.updateGarden(0.02);
});

test('every registered prop kind has dialog content, and vice versa', async () => {
  // The kinds registered in store.js and the PROP_CONTENT table in main.js
  // are matched by source text: the build stub absorbs userData writes, so
  // the wiring can only be read where it is written.
  const storeText = await readFile(new URL('../www/gavin/js/store.js', import.meta.url), 'utf8');
  const mainText = await readFile(new URL('../www/gavin/js/main.js', import.meta.url), 'utf8');

  const registered = new Set([
    ...[...storeText.matchAll(/registerOutdoorProp\(.+?, '(\w+)'\)/g)].map((m) => m[1]),
    ...[...storeText.matchAll(/kind: '(\w+)'/g)].map((m) => m[1]),   // the kids, via placeKid
  ]);
  expect(registered.size).toBeGreaterThanOrEqual(19);

  const contentBlock = mainText.match(/const PROP_CONTENT = \{([\s\S]*?)\n\};/);
  expect(contentBlock).not.toBeNull();
  const contentKinds = new Set(
    [...contentBlock[1].matchAll(/^ {4}(\w+): \{/gm)].map((m) => m[1])
  );

  // Every clickable thing tells a story, and no story is orphaned.
  expect([...registered].sort()).toEqual([...contentKinds].sort());

  // Two lines per prop, so a second click gives something new.
  const lineCounts = [...contentBlock[1].matchAll(/lines: \[/g)];
  expect(lineCounts.length).toBe(contentKinds.size);
});

describe('the composition and config (pure)', () => {
  let T;
  let CFG;

  beforeEach(async () => {
    jest.resetModules();
    const store = await import('../www/gavin/js/store.js');
    T = store.__test__;
    CFG = (await import('../www/gavin/js/config.js')).GAVIN_CONFIG;
  });

  test('the config is frozen all the way down', () => {
    expect(Object.isFrozen(CFG)).toBe(true);
    expect(Object.isFrozen(CFG.camera)).toBe(true);
    expect(Object.isFrozen(CFG.camera.portrait)).toBe(true);
    expect(Object.isFrozen(CFG.site.share)).toBe(true);
  });

  test('the passive contract: no walking, no clamps, no checklist', () => {
    // The first passive experience carries none of the walkable knobs. If
    // one appears, someone has started bolting controls back on and this
    // test is the conversation.
    expect(CFG.spawn).toBeUndefined();
    expect(CFG.worldBounds).toBeUndefined();
    expect(CFG.checklist).toBeUndefined();
    expect(CFG.rootName).toBe('garden');
  });

  test('the fixed camera and its portrait reframe are sane', () => {
    const cam = CFG.camera;
    [cam.position, cam.lookAt].forEach((v) => {
      [v.x, v.y, v.z].forEach((n) => expect(Number.isFinite(n)).toBe(true));
    });
    // Looking into the scene: the camera sits on the positive-Z side of
    // the planter and faces it
    expect(cam.position.z).toBeGreaterThan(T.LAYOUT.plantZ);
    expect(cam.lookAt.z).toBeLessThan(cam.position.z);
    expect(cam.fov).toBeGreaterThanOrEqual(30);
    expect(cam.fov).toBeLessThanOrEqual(90);
    // Portrait: a wider FOV and a dolly target near the kids' plane
    expect(cam.portrait.fov).toBeGreaterThanOrEqual(cam.fov);
    expect(cam.portrait.minHalfWidth).toBeGreaterThan(0);
    expect(cam.portrait.focusZ).toBeLessThan(T.LAYOUT.plantZ);
  });

  test('the proof-of-work cache is shared across experiences', () => {
    expect(CFG.proofOfWork.storageKey).toBe('gallery-pow');
    expect(CFG.proofOfWork.prefix).toBe('11');
  });

  test('the site block honors Gavin and funnels root-relative', () => {
    expect(CFG.site.honoree.label).toBe('Gavin');
    expect(CFG.site.home.path).toBe('/');
    expect(CFG.site.builder.contactPath).toBe('/contact.html');
    expect(CFG.site.share.title).toContain('Gavin');
  });

  test('the canopy profile pinches at the soil and post top, bulges between', () => {
    const { postH, maxR } = T.LAYOUT.jasmine;
    expect(T.canopyRadiusAt(0)).toBeCloseTo(0.16, 6);
    expect(T.canopyRadiusAt(postH)).toBeCloseTo(0.16, 6);
    expect(T.canopyRadiusAt(postH / 2)).toBeCloseTo(maxR, 6);
    // Never wider than the declared max, never thinner than the base
    for (let y = 0; y <= postH; y += postH / 20) {
      const r = T.canopyRadiusAt(y);
      expect(r).toBeGreaterThanOrEqual(0.16 - 1e-9);
      expect(r).toBeLessThanOrEqual(maxR + 1e-9);
    }
  });

  test('the peek window is a genuine rectangle around its center', () => {
    const w = T.LAYOUT.peekWindow;
    expect(T.inPeekWindow(w.cx, w.cy)).toBe(true);
    expect(T.inPeekWindow(w.cx + w.halfW + 0.01, w.cy)).toBe(false);
    expect(T.inPeekWindow(w.cx - w.halfW - 0.01, w.cy)).toBe(false);
    expect(T.inPeekWindow(w.cx, w.cy + w.halfH + 0.01)).toBe(false);
    expect(T.inPeekWindow(w.cx, w.cy - w.halfH - 0.01)).toBe(false);
  });

  test('the kids stand behind the planter, Gavin between his friends', () => {
    const { kids, planter, plantZ } = T.LAYOUT;
    expect(kids.left.x).toBeLessThan(kids.gavin.x);
    expect(kids.gavin.x).toBeLessThan(kids.right.x);
    // All three beyond the planter's far face, clear of the wood
    Object.values(kids).forEach((kid) => {
      expect(kid.z).toBeLessThan(plantZ - planter.size / 2);
      expect(kid.scale).toBeGreaterThan(0.7);   // eleven-year-olds,
      expect(kid.scale).toBeLessThan(0.95);     // not rig-sized adults
    });
    // The friends stand clear of the canopy's widest reach, so their
    // faces read beside the plant, not through it
    expect(Math.abs(kids.left.x)).toBeGreaterThan(T.LAYOUT.jasmine.maxR);
    expect(Math.abs(kids.right.x)).toBeGreaterThan(T.LAYOUT.jasmine.maxR);
  });

  test("the peek window contains the sight line to Gavin's face (regression)", () => {
    // The one promise the whole composition makes: from the fixed camera,
    // Gavin's face reads through the plant. Computed exactly the way
    // main.js and the leaf pass do, so moving Gavin, the camera, or the
    // window without keeping them agreeing fails here first.
    const { kids, planter, plantZ, peekWindow } = T.LAYOUT;
    const cam = CFG.camera.position;
    const pivotY = planter.height + 0.04;              // plantGroup's world lift
    const g = kids.gavin;

    // Gavin's head center, in plant-local coords: the rig's head sits at
    // 1.5 with a 0.05 sole lift, all scaled, plus his tiptoe lift
    const headWorldY = 1.5 * g.scale + 0.05 * g.scale + g.lift;
    const headLocalY = headWorldY - pivotY;

    // Where the camera-to-head sight line crosses the plant's midplane
    const camZ = cam.z - plantZ;
    const headZ = g.z - plantZ;
    const u = camZ / (camZ - headZ);                   // fraction at plant z = 0
    const sightX = cam.x + (g.x - cam.x) * u;
    const camLocalY = cam.y - pivotY;
    const sightY = camLocalY + (headLocalY - camLocalY) * u;

    expect(T.inPeekWindow(sightX, sightY)).toBe(true);
  });
});
