// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for Jenn's home office experience's world build,
 * exercising the sunnyvalejenn store.js orchestration of the shared parts
 * library (world, scene, structures, people, lighting, scenery) plus the
 * experience-specific builders: the bright room with its window, the desk
 * and its gear, Jenn seated and facing the doorway, the yoga corner, the
 * whiteboard, the sideboard and plants, and the exterior the window frames
 * (lawn, fence, trees, the neighbor's house, and the fence birds).
 *
 * Under the chainable THREE proxy nothing renders, but every function that
 * would run during a real page load runs here, so a missing import or a
 * reference left behind by a refactor throws and fails this suite instead
 * of the live site.
 *
 * The layout is pure numbers composed for one fixed doorway camera, so
 * the pure half asserts the composition the way the camera would see it:
 * Jenn behind her desk facing the doorway, the window in the back wall,
 * the furniture inside the room, and the config's passive contract intact
 * (with the sky ON, unlike the windowless bar: this room has a view).
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

test('the full office builds and holds a sunny workday', async () => {
  jest.resetModules();
  // Import the BUILT shared modules: sunnyvalejenn store.js resolves its
  // imports to the .min.js files, and module state must be shared with what
  // we drive here. This is why `npm run build` must run before `npm test` after
  // any shared edit.
  const scene = await import('../www/shared/js/scene-1.0.0.min.js');
  const world = await import('../www/shared/js/world-1.0.0.min.js');
  const store = await import('../www/sunnyvalejenn/js/store.js');
  const { SVJ_CONFIG } = await import('../www/sunnyvalejenn/js/config.js');

  // Same order main.js uses.
  scene.initScene({}, SVJ_CONFIG);
  const office = store.initStore();
  expect(office).toBeTruthy();
  expect(world.getWorldGroup()).not.toBeNull();
  expect(world.getWorldConfig().rootName).toBe('office');
  expect(store.getOfficeGroup()).toBe(office);

  // The prop registry is populated (the storytelling tap targets): Jenn,
  // her desk and gear, the yoga corner, the plants, and the room's decor.
  expect(world.getOutdoorPropMeshes().length).toBeGreaterThanOrEqual(15);

  // Half a minute of the workday: Jenn types, pauses to wave at the
  // doorway, and gets back to it, the birds swoop in and away, and the
  // monitor's cursor blinks through many cycles.
  for (let i = 0; i < 1500; i++) store.updateOffice(0.02);
});

test('every registered prop kind has dialog content, and vice versa', async () => {
  // The kinds registered in store.js and the PROP_CONTENT table in main.js
  // are matched by source text: the build stub absorbs userData writes, so
  // the wiring can only be read where it is written.
  const storeText = await readFile(new URL('../www/sunnyvalejenn/js/store.js', import.meta.url), 'utf8');
  const mainText = await readFile(new URL('../www/sunnyvalejenn/js/main.js', import.meta.url), 'utf8');

  const registered = new Set(
    [...storeText.matchAll(/registerOutdoorProp\(.+?, '(\w+)'\)/g)].map((m) => m[1])
  );
  expect(registered.size).toBeGreaterThanOrEqual(14);

  const contentBlock = mainText.match(/const PROP_CONTENT = \{([\s\S]*?)\n\};/);
  expect(contentBlock).not.toBeNull();
  const contentKinds = new Set(
    [...contentBlock[1].matchAll(/^ {4}(\w+): \{/gm)].map((m) => m[1])
  );

  // Every tappable thing tells a story, and no story is orphaned.
  expect([...registered].sort()).toEqual([...contentKinds].sort());

  // Two lines per prop, so a second tap gives something new.
  const lineCounts = [...contentBlock[1].matchAll(/lines: \[/g)];
  expect(lineCounts.length).toBe(contentKinds.size);
});

test('the CTAs lead onward to Jenn: her dialog link and the every-fourth-story invitation', async () => {
  const mainText = await readFile(new URL('../www/sunnyvalejenn/js/main.js', import.meta.url), 'utf8');
  const htmlText = await readFile(new URL('../www/sunnyvalejenn/index.html', import.meta.url), 'utf8');

  // Jenn's own card is flagged to lead with her website, and every
  // fourth prop story queues the reach-out invitation.
  expect(mainText).toMatch(/jenn: \{\s*\n\s*title: 'Jenn',\s*\n\s*cta: true/);
  expect(mainText).toMatch(/const NUDGE_EVERY = 4/);

  // The markup carries both CTAs, and the outbound links open in a new
  // tab with the safe rel pair (noscript, biz button, dialog, invitation).
  expect(htmlText).toContain('id="dialog-cta"');
  expect(htmlText).toContain('id="nudge-modal"');
  const outbound = (htmlText.match(/https:\/\/sunnyvalejenn\.com\//g) || []).length;
  expect(outbound).toBeGreaterThanOrEqual(4);
  const safeRels = (htmlText.match(/rel="noopener noreferrer"/g) || []).length;
  expect(safeRels).toBeGreaterThanOrEqual(4);
});

describe('the composition and config (pure)', () => {
  let T;
  let CFG;

  beforeEach(async () => {
    jest.resetModules();
    const store = await import('../www/sunnyvalejenn/js/store.js');
    T = store.__test__;
    CFG = (await import('../www/sunnyvalejenn/js/config.js')).SVJ_CONFIG;
  });

  test('the config is frozen all the way down', () => {
    expect(Object.isFrozen(CFG)).toBe(true);
    expect(Object.isFrozen(CFG.camera)).toBe(true);
    expect(Object.isFrozen(CFG.camera.portrait)).toBe(true);
    expect(Object.isFrozen(CFG.site.share)).toBe(true);
  });

  test('the passive contract: no walking, a frozen noon sky', () => {
    // The third passive experience carries none of the walkable knobs.
    // Unlike the windowless bar it keeps the sky (the window frames it),
    // but frozen at noon: it is a bright morning in here at every hour.
    expect(CFG.spawn).toBeUndefined();
    expect(CFG.worldBounds).toBeUndefined();
    expect(CFG.checklist).toBeUndefined();
    expect(CFG.rootName).toBe('office');
    expect(CFG.dayNight.enabled).toBe(false);
    expect(CFG.comet.enabled).toBe(false);
    expect(CFG.zombiesAtNight).toBe(false);
  });

  test('the shared cloud layer is off, because this window cannot pass it', () => {
    // THIS USED TO ASSERT `clouds === true`, which restated the config and
    // proved nothing about the screen. The layer was enabled from the first
    // commit and never rendered once: the window is the aperture, and it
    // caps how high a ray can leave this room no matter where the camera
    // aims, because elevation is constant along a straight ray.
    //
    // So the check is the GEOMETRY, and it fails if anybody turns the
    // shared layer back on or moves the window somewhere it could work.
    const R = T.LAYOUT.room;
    const win = T.LAYOUT.window;
    const eye = CFG.camera.position;
    const ceilingDeg = Math.atan2(win.topY - eye.y, eye.z - R.minZ) * 180 / Math.PI;

    // The shared bank's own lowest cloud, from www/shared/js/scenery-1.0.0.js.
    const lowestCloud = { y: 45, z: -140 };
    const cloudDeg = Math.atan2(lowestCloud.y - eye.y, eye.z - lowestCloud.z) * 180 / Math.PI;

    expect(ceilingDeg).toBeLessThan(10);
    expect(cloudDeg).toBeGreaterThan(ceilingDeg);
    expect(CFG.scenery.clouds).toBe(false);
  });

  test('the building block mirrors the room for the shared lighting rig', () => {
    const R = T.LAYOUT.room;
    expect(CFG.building.width).toBeCloseTo(R.maxX - R.minX, 6);
    expect(CFG.building.depth).toBeCloseTo(R.maxZ - R.minZ, 6);
    expect(CFG.building.height).toBeCloseTo(R.height, 6);
    expect(CFG.building.positionX).toBeCloseTo((R.minX + R.maxX) / 2, 6);
    expect(CFG.building.positionZ).toBeCloseTo((R.minZ + R.maxZ) / 2, 6);
  });

  test('the fixed camera stands in the doorway, aimed at Jenn', () => {
    const cam = CFG.camera;
    const R = T.LAYOUT.room;
    [cam.position, cam.lookAt].forEach((v) => {
      [v.x, v.y, v.z].forEach((n) => expect(Number.isFinite(n)).toBe(true));
    });
    // Standing inside the room, facing the desk at the back
    expect(cam.position.x).toBeGreaterThan(R.minX);
    expect(cam.position.x).toBeLessThan(R.maxX);
    expect(cam.position.z).toBeGreaterThan(T.LAYOUT.desk.z);
    expect(cam.position.z).toBeLessThan(R.maxZ);
    expect(cam.lookAt.z).toBeLessThan(cam.position.z);
    // Aimed squarely at the consultant at her desk
    expect(Math.abs(cam.lookAt.x - T.LAYOUT.jenn.x)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(cam.lookAt.z - T.LAYOUT.jenn.z)).toBeLessThanOrEqual(0.4);
    expect(cam.fov).toBeGreaterThanOrEqual(30);
    expect(cam.fov).toBeLessThanOrEqual(90);
    // Portrait: a wider FOV, a focus at the desk's distance, and a
    // dolly-back cap that stays inside the front wall
    expect(cam.portrait.fov).toBeGreaterThanOrEqual(cam.fov);
    expect(cam.portrait.minHalfWidth).toBeGreaterThan(0);
    expect(Math.abs(cam.portrait.focusZ - T.LAYOUT.jenn.z)).toBeLessThanOrEqual(0.4);
    expect(cam.portrait.maxZ).toBeLessThan(R.maxZ);
  });

  test('Jenn sits behind her desk facing the doorway, and the room holds its layout', () => {
    const L = T.LAYOUT;
    // Jenn is behind the desk (farther from the camera), close enough to work at it
    expect(L.jenn.z).toBeLessThan(L.desk.z);
    expect(L.jenn.z - (L.desk.z - L.desk.d / 2)).toBeLessThan(0.4);
    expect(Math.abs(L.jenn.x - L.desk.x)).toBeLessThanOrEqual(L.desk.w / 2);
    // Facing the doorway (positive Z), not the wall
    expect(Math.abs(L.jenn.yaw)).toBeLessThan(Math.PI / 2);
    // The window lives in the back wall, clear of Jenn's silhouette
    const winLeft = L.window.x - L.window.width / 2;
    expect(L.window.sillY).toBeGreaterThan(0);
    expect(L.window.topY).toBeLessThan(L.room.height);
    expect(L.jenn.x).toBeLessThan(winLeft);
    // The wall clock hangs whole on the pier between the window casing
    // and the west corner, up above the monitor's height
    expect(L.clock.x + L.clock.r).toBeLessThan(winLeft);
    expect(L.clock.x - L.clock.r).toBeGreaterThan(L.room.minX);
    expect(L.clock.y - L.clock.r).toBeGreaterThan(1.5);
    expect(L.clock.y + L.clock.r).toBeLessThan(L.room.height);
    // The furniture stays inside the room
    [L.desk, L.yogaMat, L.swissBall, L.sideboard, L.monstera, L.snakePlant, L.rug].forEach((p) => {
      expect(p.x).toBeGreaterThanOrEqual(L.room.minX);
      expect(p.x).toBeLessThanOrEqual(L.room.maxX);
      expect(p.z).toBeGreaterThanOrEqual(L.room.minZ);
      expect(p.z).toBeLessThanOrEqual(L.room.maxZ);
    });
    // The yoga corner keeps to the back-left, out of the walk line
    expect(L.yogaMat.x).toBeLessThan(0);
    expect(L.yogaMat.z).toBeLessThan(0);
  });

  test('seated figures land their hips just above the cushion', () => {
    // seatHeightY drops a feet-origin rig so the fold lands on the seat:
    // seatTop + a small hover - the leg length times the figure's scale.
    expect(T.seatHeightY(0.47, 1)).toBeCloseTo(0.47 + 0.05 - 0.75, 6);
    expect(T.seatHeightY(0.47, 1.08)).toBeLessThan(T.seatHeightY(0.47, 1));
  });

  test('the proof-of-work cache is shared across experiences', () => {
    expect(CFG.proofOfWork.storageKey).toBe('gallery-pow');
    expect(CFG.proofOfWork.prefix).toBe('11');
  });

  test('the site block honors Jenn and links her business outward', () => {
    expect(CFG.site.honoree.label).toBe('Jenn');
    expect(CFG.site.honoree.business).toBe('Sunnyvale Jenn Consulting');
    expect(CFG.site.business.websiteUrl).toBe('https://sunnyvalejenn.com/');
    expect(CFG.site.home.path).toBe('/');
    expect(CFG.site.builder.contactPath).toBe('/contact.html');
    expect(CFG.site.share.title).toContain('Jenn');
  });
});
