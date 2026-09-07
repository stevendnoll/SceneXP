// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Boot-and-drive smoke for the karaoke bar experience's main.js conductor.
 *
 * Same recipe as gavin-main.test.mjs: install THREE and the DOM stand-ins
 * FIRST, then import main.js so it auto-boots the way a real page load
 * does. On top of the shared stubs this suite adds two local overrides:
 *
 * - THREE.Raycaster is replaced with a test-controlled one whose
 *   intersectObjects returns a queue the test fills. That lets taps land
 *   on specific props (stage, jukebox, tv) so the dialog card, the
 *   jukebox picker, and the karaoke screen close-up all open for real.
 *   With the queue empty, taps exercise the miss/tolerance-ring paths.
 * - document.contains is provided (the shared stub omits it) so the
 *   focus-restore path in each close function runs instead of throwing.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';

let dom;
let ray; // test-controlled raycaster hits: ray.hits is what intersectObjects returns

/** Wrap the installed THREE so main.js's raycaster answers from ray.hits. */
function installRaycasterOverride() {
  const base = globalThis.THREE;
  const control = { hits: [] };
  globalThis.THREE = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'Raycaster') {
        return function Raycaster() {
          this.setFromCamera = () => {};
          this.intersectObjects = () => control.hits.slice();
        };
      }
      return base[prop];
    },
  });
  return control;
}

/** A minimal hit whose object resolves to a visible prop root of `kind`. */
function propHit(kind) {
  return { object: { visible: true, parent: null, userData: { isProp: true, propKind: kind } } };
}

/** Tap the scene at a screen point (click path; the touch path is separate). */
function tap(canvas, x = 400, y = 300) {
  fire(canvas, 'click', { clientX: x, clientY: y, button: 0 });
}

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  installThree();
  dom = installDom();
  ray = installRaycasterOverride();
  // The shared stub's document has no contains(); the focus-restore path
  // in closePropDialog/closeTvView/closeJukebox needs a truthy answer.
  dom.documentStub.contains = (el) => !!el;
  // The stub's elements lack append(); buildJukeboxSongList uses it to
  // assemble each song button, so grant it to created elements here.
  const origCreate = dom.documentStub.createElement;
  dom.documentStub.createElement = (tag) => {
    const el = origCreate(tag);
    el.append = (...nodes) => nodes.forEach((n) => el.appendChild(n));
    return el;
  };
});

afterEach(() => {
  dom.uninstall();
  jest.useRealTimers();
});

async function bootJamar() {
  // Mirror the real HTML's initial state: the three overlays start hidden
  // (the auto-vivified stubs start with an empty classList otherwise).
  for (const id of ['dialog-modal', 'jukebox-modal', 'tv-view']) {
    dom.el(id).classList.add('hidden');
  }
  const main = await import('../www/jamar/js/main.js');
  await flushAsync();                       // let the async init() settle
  await jest.advanceTimersByTimeAsync(500); // the 400ms loading-screen reveal
  return main;
}

test('auto-boots through the loading screen into the running state', async () => {
  const main = await bootJamar();

  const state = main.getState();
  expect(state.isRunning).toBe(true);
  expect(state.isLoaded).toBe(true);
  expect(state.isMobile).toBe(false);

  // The loading screen was walked to 100% and then hidden.
  expect(dom.el('load-progress').style.width).toBe('100%');
  expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);

  // (There is no Home button to check any more, and no applySiteLinks() to
  // wire one. This page has no floating controls at all now.
  // tests/home-button-removed.test.mjs guards its absence in the markup.)

  // The jukebox song list was built at startup (one button per song).
  expect(dom.el('jukebox-songs').children.length).toBe(3);

  // The animate loop runs without throwing for a few simulated seconds.
  expect(dom.loops.length).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < 120; i++) {
    jest.advanceTimersByTime(16);
    dom.loops[0]();
  }

  // No 2D fallback redirect happened.
  expect(dom.replaced).toHaveLength(0);
});

test('welcome overlay dismisses by key, then ignores repeat dismissals', async () => {
  await bootJamar();
  const blocker = dom.el('blocker');
  expect(blocker.classList.contains('hidden')).toBe(false);

  // Enter lets the visitor in.
  fire(dom.documentStub, 'keydown', { code: 'Enter' });
  expect(blocker.classList.contains('hidden')).toBe(true);

  // A second dismissal (click and Space) is a quiet no-op.
  fire(blocker, 'click', {});
  fire(dom.documentStub, 'keydown', { code: 'Space' });
  expect(blocker.classList.contains('hidden')).toBe(true);
});

test('prop taps open the dialog card and rotate its lines', async () => {
  await bootJamar();
  const canvas = dom.el('game-canvas');
  const modal = dom.el('dialog-modal');

  // A tap that hits the corner stage opens its story.
  ray.hits = [propHit('stage')];
  tap(canvas);
  expect(modal.classList.contains('hidden')).toBe(false);
  expect(dom.el('dialog-title').textContent).toBe('The Corner Stage');
  const firstLine = dom.el('dialog-message').textContent;
  expect(firstLine.length).toBeGreaterThan(0);

  // While the card is up, further taps are ignored.
  ray.hits = [propHit('bar')];
  tap(canvas);
  expect(dom.el('dialog-title').textContent).toBe('The Corner Stage');

  // Escape closes it, and a second tap on the stage gives the OTHER line.
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(modal.classList.contains('hidden')).toBe(true);
  ray.hits = [propHit('stage')];
  tap(canvas);
  expect(dom.el('dialog-message').textContent).not.toBe(firstLine);
  fire(dom.documentStub, 'keydown', { code: 'Escape' });

  // An unknown prop kind is politely ignored.
  ray.hits = [propHit('mystery-prop')];
  tap(canvas);
  expect(modal.classList.contains('hidden')).toBe(true);

  // And a miss (empty hit queue) walks the tolerance rings and gives up.
  ray.hits = [];
  tap(canvas);
  fire(canvas, 'touchend', { changedTouches: [{ clientX: 10, clientY: 10 }] });
  fire(canvas, 'touchend', { changedTouches: [] });
  expect(modal.classList.contains('hidden')).toBe(true);
});

test('the jukebox opens from a tap and a song choice closes it', async () => {
  await bootJamar();
  const canvas = dom.el('game-canvas');
  const jukebox = dom.el('jukebox-modal');
  const songs = dom.el('jukebox-songs');

  ray.hits = [propHit('jukebox')];
  tap(canvas);
  expect(jukebox.classList.contains('hidden')).toBe(false);

  // While the picker is up, scene taps are ignored.
  ray.hits = [propHit('stage')];
  tap(canvas);
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(true);

  // Picking the second song hands it to the store and closes the picker.
  const button = songs.children[1];
  expect(button.children[0].textContent).toBe("That's The Way It Is");
  fire(button, 'click', {});
  expect(jukebox.classList.contains('hidden')).toBe(true);

  // Reopen and dismiss with Escape instead.
  ray.hits = [propHit('jukebox')];
  tap(canvas);
  expect(jukebox.classList.contains('hidden')).toBe(false);
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(jukebox.classList.contains('hidden')).toBe(true);
});

test('the lyrics screen close-up opens, mirrors frames, resizes, and closes', async () => {
  await bootJamar();
  const canvas = dom.el('game-canvas');
  const tvView = dom.el('tv-view');
  const tvCanvas = dom.el('tv-canvas');

  const loopsBefore = dom.loops.length;
  ray.hits = [propHit('tv')];
  tap(canvas);
  expect(tvView.classList.contains('hidden')).toBe(false);
  expect(dom.el('tv-caption').textContent.length).toBeGreaterThan(0);

  // The close-up canvas was sized to its displayed box at device pixels.
  expect(tvCanvas.width).toBe(800);
  expect(tvCanvas.height).toBe(600);

  // The RAF mirror loop was queued; stepping it paints and re-queues.
  expect(dom.loops.length).toBeGreaterThan(loopsBefore);
  for (let i = 0; i < 5; i++) {
    jest.advanceTimersByTime(16);
    dom.loops[dom.loops.length - 1]();
  }

  // A resize while the overlay is up re-measures its canvas.
  fire(dom.windowStub, 'resize');

  // Escape closes the close-up; the orphaned RAF callback exits quietly.
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(tvView.classList.contains('hidden')).toBe(true);
  dom.loops[dom.loops.length - 1]();

  // Escape with nothing open is a no-op, as is a non-Escape key.
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  fire(dom.documentStub, 'keydown', { code: 'ArrowLeft' });
});

test('survives resize, gestures, visibility loss, and page hide', async () => {
  const main = await bootJamar();
  const canvas = dom.el('game-canvas');

  // Rotate to portrait: the resize path re-derives the fixed camera
  // (the portrait dolly), then back to landscape.
  dom.windowStub.innerWidth = 390;
  dom.windowStub.innerHeight = 844;
  fire(dom.windowStub, 'resize');
  dom.windowStub.innerWidth = 1280;
  dom.windowStub.innerHeight = 800;
  fire(dom.windowStub, 'resize');
  fire(dom.documentStub, 'gesturestart');
  fire(dom.documentStub, 'gesturechange');
  fire(dom.documentStub, 'gestureend');

  // A few frames after the interactions.
  for (let i = 0; i < 30; i++) {
    jest.advanceTimersByTime(16);
    dom.loops[0]();
  }

  // Tab away, then leave: the session-end path must be idempotent, and
  // pagehide's cleanup stops the loop.
  dom.documentStub.visibilityState = 'hidden';
  fire(dom.documentStub, 'visibilitychange');
  fire(dom.windowStub, 'pagehide');
  fire(dom.windowStub, 'pagehide');
  expect(main.getState().isRunning).toBe(false);

  // The animate loop respects the stopped state.
  dom.loops[0]();
});

test('falls back to the 2D site when WebGL is unavailable', async () => {
  // Break WebGL before import: boot() must route to the fallback.
  delete dom.windowStub.WebGLRenderingContext;
  await import('../www/jamar/js/main.js');
  await flushAsync();
  await jest.advanceTimersByTimeAsync(3000);
  expect(dom.replaced).toEqual(['/']);
});
