// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for the karaoke night experience's world build,
 * exercising the jamar store.js orchestration of the shared parts library
 * (world, scene, people) plus the experience-specific builders: the
 * windowless room, the corner stage, the lyrics screen, the speakers and
 * console, the birthday booth with Steve and Mike seated, Jamar himself
 * mid-song, the bar and its keeper, and the decor from neon to jukebox.
 *
 * Under the chainable THREE proxy nothing renders, but every function that
 * would run during a real page load runs here, so a missing import or a
 * reference left behind by a refactor throws and fails this suite instead
 * of the live site.
 *
 * The layout is pure numbers composed for one fixed stool's-eye camera,
 * so the pure half asserts the composition the way the camera would see
 * it: Jamar centered on the stage, the room around him, and the config's
 * passive contract intact. The songbook check guards a cross-file mirror:
 * store.js's boot-time song must match main.js's SONGBOOK opener, since
 * the two are maintained by hand in different files.
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

test('the full bar builds and holds karaoke night', async () => {
  jest.resetModules();
  // Import the BUILT shared modules: jamar store.js resolves its imports to
  // the .min.js files, and module state must be shared with what we drive
  // here. This is why `npm run build` must run before `npm test` after any
  // shared edit.
  const scene = await import('../www/shared/js/scene-1.0.0.min.js');
  const world = await import('../www/shared/js/world-1.0.0.min.js');
  const store = await import('../www/jamar/js/store.js');
  const { JAMAR_CONFIG } = await import('../www/jamar/js/config.js');

  // Same order main.js uses.
  scene.initScene({}, JAMAR_CONFIG);
  const bar = store.initStore();
  expect(bar).toBeTruthy();
  expect(world.getWorldGroup()).not.toBeNull();
  expect(world.getWorldConfig().rootName).toBe('bar');
  expect(store.getBarGroup()).toBe(bar);

  // The speaker cones thump to an exported beat main.js can rely on.
  expect(store.BEAT_HZ).toBeGreaterThan(0);

  // The prop registry is populated (the storytelling tap targets): the
  // stage crew, the furniture, the people, and the decor.
  expect(world.getOutdoorPropMeshes().length).toBeGreaterThanOrEqual(23);

  // Several seconds of the show: Jamar sways, cones thump, the disco ball
  // turns, the lyrics sweep and roll, and the shadow-map refresh clock
  // (the stage uplight's silhouette) comes up many times.
  for (let i = 0; i < 300; i++) store.updateBar(0.02);

  // The lyrics screen accepts a jukebox pick and keeps playing.
  store.setNowPlaying({
    singer: 'JAMAR',
    title: "That's The Way It Is  •  Celine Dion",
    lines: ['One', 'Two', 'Three', 'Four'],
    secondsPerLine: 4.4
  });
  for (let i = 0; i < 100; i++) store.updateBar(0.02);

  // Bogus picks are politely ignored rather than blanking the screen.
  store.setNowPlaying(null);
  store.setNowPlaying({ lines: [] });
  for (let i = 0; i < 30; i++) store.updateBar(0.02);

  // The close-up overlay painter draws into any context at any size.
  const ctx = globalThis.document.createElement('canvas').getContext('2d');
  store.drawTvTo(ctx, 1024, 576);
});

test('every registered prop kind has dialog content, and vice versa', async () => {
  // The kinds registered in store.js and the PROP_CONTENT table in main.js
  // are matched by source text: the build stub absorbs userData writes, so
  // the wiring can only be read where it is written.
  const storeText = await readFile(new URL('../www/jamar/js/store.js', import.meta.url), 'utf8');
  const mainText = await readFile(new URL('../www/jamar/js/main.js', import.meta.url), 'utf8');

  const registered = new Set(
    [...storeText.matchAll(/registerOutdoorProp\(.+?, '(\w+)'\)/g)].map((m) => m[1])
  );
  expect(registered.size).toBeGreaterThanOrEqual(20);

  // One deliberate exemption: tapping the jukebox opens the song-picker
  // modal instead of a storytelling dialog, so it carries no PROP_CONTENT
  // entry. (The tv opens a close-up overlay but keeps its entry: those
  // lines rotate as the overlay's caption.)
  expect(registered.delete('jukebox')).toBe(true);

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

test("store.js's boot song mirrors main.js's SONGBOOK opener", async () => {
  // The screen boots mid-song before the jukebox is ever touched, so
  // store.js carries its own copy of the opening song. The two are
  // maintained by hand in different files and must stay identical, or the
  // queue chip and the screen would disagree about what is playing.
  const storeText = await readFile(new URL('../www/jamar/js/store.js', import.meta.url), 'utf8');
  const mainText = await readFile(new URL('../www/jamar/js/main.js', import.meta.url), 'utf8');

  const bootBlock = storeText.match(/let nowPlaying = \{([\s\S]*?)\n\};/)[1];
  const openerBlock = mainText.match(/const SONGBOOK = \[\s*\{([\s\S]*?)\n {4}\},/)[1];

  const title = (block) => block.match(/title: (['"])([\s\S]*?)\1/)[2];
  const lines = (block) => [...block.match(/lines: \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const pace = (block) => Number(block.match(/secondsPerLine: ([\d.]+)/)[1]);

  expect(title(bootBlock)).toBe(title(openerBlock));
  expect(lines(bootBlock)).toEqual(lines(openerBlock));
  expect(pace(bootBlock)).toBe(pace(openerBlock));
});

describe('the composition and config (pure)', () => {
  let T;
  let CFG;

  beforeEach(async () => {
    jest.resetModules();
    const store = await import('../www/jamar/js/store.js');
    T = store.__test__;
    CFG = (await import('../www/jamar/js/config.js')).JAMAR_CONFIG;
  });

  test('the config is frozen all the way down', () => {
    expect(Object.isFrozen(CFG)).toBe(true);
    expect(Object.isFrozen(CFG.camera)).toBe(true);
    expect(Object.isFrozen(CFG.camera.portrait)).toBe(true);
    expect(Object.isFrozen(CFG.site.share)).toBe(true);
  });

  test('the passive contract: no walking, no sky, no checklist', () => {
    // The second passive experience carries none of the walkable knobs,
    // and being windowless it opts out of the sky as well. If one of
    // these reappears, someone has started bolting controls back on and
    // this test is the conversation.
    expect(CFG.spawn).toBeUndefined();
    expect(CFG.worldBounds).toBeUndefined();
    expect(CFG.checklist).toBeUndefined();
    expect(CFG.rootName).toBe('bar');
    expect(CFG.dayNight.enabled).toBe(false);
    expect(CFG.comet.enabled).toBe(false);
    expect(CFG.scenery.clouds).toBe(false);
    expect(CFG.zombiesAtNight).toBe(false);
  });

  test('the fixed camera holds a seat in the room, aimed at Jamar', () => {
    const cam = CFG.camera;
    const R = T.LAYOUT.room;
    [cam.position, cam.lookAt].forEach((v) => {
      [v.x, v.y, v.z].forEach((n) => expect(Number.isFinite(n)).toBe(true));
    });
    // Seated inside the room, facing the back-left corner stage
    expect(cam.position.x).toBeGreaterThan(R.minX);
    expect(cam.position.x).toBeLessThan(R.maxX);
    expect(cam.position.z).toBeGreaterThan(T.LAYOUT.stage.z);
    expect(cam.position.z).toBeLessThan(R.maxZ);
    expect(cam.lookAt.z).toBeLessThan(cam.position.z);
    // Aimed squarely at the man of the hour
    expect(Math.abs(cam.lookAt.x - T.LAYOUT.jamar.x)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(cam.lookAt.z - T.LAYOUT.jamar.z)).toBeLessThanOrEqual(0.2);
    expect(cam.fov).toBeGreaterThanOrEqual(30);
    expect(cam.fov).toBeLessThanOrEqual(90);
    // Portrait: a wider FOV, a focus at the stage's distance, and a
    // dolly-back cap that stays inside the front wall
    expect(cam.portrait.fov).toBeGreaterThanOrEqual(cam.fov);
    expect(cam.portrait.minHalfWidth).toBeGreaterThan(0);
    expect(Math.abs(cam.portrait.focusZ - T.LAYOUT.jamar.z)).toBeLessThanOrEqual(0.2);
    expect(cam.portrait.maxZ).toBeLessThan(R.maxZ);
  });

  test('Jamar stands on the stage, and the room holds its layout', () => {
    const L = T.LAYOUT;
    const S = L.stage;
    // The man of the hour is on the platform
    expect(Math.abs(L.jamar.x - S.x)).toBeLessThanOrEqual(S.w / 2);
    expect(Math.abs(L.jamar.z - S.z)).toBeLessThanOrEqual(S.d / 2);
    // The corner stage is in the back-left quadrant
    expect(S.x).toBeLessThan(0);
    expect(S.z).toBeLessThan(0);
    // The wall fixtures hang on the back wall
    [L.tv, L.banner, L.neon].forEach((f) => {
      expect(Math.abs(f.z - L.room.minZ)).toBeLessThanOrEqual(0.1);
    });
    // The furniture stays inside the room
    [L.micStand, L.console, L.hightop, L.jukebox, ...L.speakers].forEach((p) => {
      expect(p.x).toBeGreaterThanOrEqual(L.room.minX);
      expect(p.x).toBeLessThanOrEqual(L.room.maxX);
      expect(p.z).toBeGreaterThanOrEqual(L.room.minZ);
      expect(p.z).toBeLessThanOrEqual(L.room.maxZ);
    });
    // The bar hugs the right wall
    expect(L.bar.frontX).toBeGreaterThan(0);
    expect(L.bar.frontX + L.bar.depth).toBeLessThanOrEqual(L.room.maxX);
  });

  test('seated figures land their hips just above the cushion', () => {
    // seatHeightY drops a feet-origin rig so the fold lands on the seat:
    // seatTop + a small hover - the leg length times the figure's scale.
    expect(T.seatHeightY(0.46, 1)).toBeCloseTo(0.46 + 0.05 - 0.75, 6);
    expect(T.seatHeightY(0.46, 1.08)).toBeLessThan(T.seatHeightY(0.46, 1));
  });

  test('the proof-of-work cache is shared across experiences', () => {
    expect(CFG.proofOfWork.storageKey).toBe('gallery-pow');
    expect(CFG.proofOfWork.prefix).toBe('11');
  });

  test('the site block honors Jamar and funnels root-relative', () => {
    expect(CFG.site.honoree.label).toBe('Jamar');
    expect(CFG.site.home.path).toBe('/');
    expect(CFG.site.builder.contactPath).toBe('/contact.html');
    expect(CFG.site.share.title).toContain('Jamar');
  });
});
