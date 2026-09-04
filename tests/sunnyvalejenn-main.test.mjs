// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Boot-and-drive smoke for Jenn's home office experience's main.js.
 *
 * Same recipe as gavin-main.test.mjs and jamar-main.test.mjs: install
 * THREE and the DOM stand-ins FIRST, then import main.js so it auto-boots
 * the way a real page load does. Two local overrides on top of the shared
 * stubs:
 *
 * - THREE.Raycaster is replaced with a test-controlled one whose
 *   intersectObjects returns a queue the test fills, so taps can land on
 *   specific props (jenn, desk, mug...) and open the dialog card for
 *   real, including the cta variant and the every-fourth-story reach-out
 *   invitation. With the queue empty, taps take the miss/tolerance paths.
 * - document.contains is provided (the shared stub omits it) so the
 *   focus-restore path in the close functions runs instead of throwing.
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
  // in closePropDialog/closeNudgeModal needs a truthy answer.
  dom.documentStub.contains = (el) => !!el;
});

afterEach(() => {
  dom.uninstall();
  jest.useRealTimers();
});

async function bootJenn() {
  // Mirror the real HTML's initial state: the two cards and the dialog's
  // cta link start hidden (auto-vivified stubs start with an empty
  // classList otherwise).
  for (const id of ['dialog-modal', 'nudge-modal', 'dialog-cta']) {
    dom.el(id).classList.add('hidden');
  }
  const main = await import('../www/sunnyvalejenn/js/main.js');
  await flushAsync();                       // let the async init() settle
  await jest.advanceTimersByTimeAsync(500); // the 400ms loading-screen reveal
  return main;
}

test('auto-boots through the loading screen with the site links wired', async () => {
  const main = await bootJenn();

  const state = main.getState();
  expect(state.isRunning).toBe(true);
  expect(state.isLoaded).toBe(true);
  expect(state.isMobile).toBe(false);

  // The loading screen was walked to 100% and then hidden.
  expect(dom.el('load-progress').style.width).toBe('100%');
  expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);

  // applySiteLinks wired every outward link from SVJ_CONFIG.site.
  expect(dom.el('home-btn').href).toBe('/');
  expect(dom.el('biz-btn').href).toBe('https://sunnyvalejenn.com/');
  expect(dom.el('biz-btn').title).toContain('Sunnyvale Jenn Consulting');
  expect(dom.el('dialog-cta').href).toBe('https://sunnyvalejenn.com/');
  expect(dom.el('nudge-site').href).toBe('https://sunnyvalejenn.com/');
  expect(dom.el('nudge-contact').href).toBe('/contact.html');

  // The animate loop runs without throwing for a few simulated seconds
  // (the frozen-noon day/night pass, the window view, and the office all
  // update inside it).
  expect(dom.loops.length).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < 120; i++) {
    jest.advanceTimersByTime(16);
    dom.loops[0]();
  }

  // No 2D fallback redirect happened.
  expect(dom.replaced).toHaveLength(0);
});

test('welcome overlay dismisses by key, then ignores repeat dismissals', async () => {
  await bootJenn();
  const blocker = dom.el('blocker');
  expect(blocker.classList.contains('hidden')).toBe(false);

  // Space lets the visitor in.
  fire(dom.documentStub, 'keydown', { code: 'Space' });
  expect(blocker.classList.contains('hidden')).toBe(true);

  // A second dismissal (click and Enter) is a quiet no-op.
  fire(blocker, 'click', {});
  fire(dom.documentStub, 'keydown', { code: 'Enter' });
  expect(blocker.classList.contains('hidden')).toBe(true);
});

test('prop taps open the dialog card, with the cta lead for Jenn herself', async () => {
  await bootJenn();
  const canvas = dom.el('game-canvas');
  const modal = dom.el('dialog-modal');
  const cta = dom.el('dialog-cta');
  const dismiss = modal.querySelector('.dialog-primary');

  // Jenn's own card leads with the link to her website.
  ray.hits = [propHit('jenn')];
  tap(canvas);
  expect(modal.classList.contains('hidden')).toBe(false);
  expect(dom.el('dialog-title').textContent).toBe('Jenn');
  expect(cta.classList.contains('hidden')).toBe(false);
  expect(dismiss.classList.contains('piece-cancel')).toBe(true);
  const firstLine = dom.el('dialog-message').textContent;
  expect(firstLine.length).toBeGreaterThan(0);

  // While the card is up, further taps are ignored.
  ray.hits = [propHit('desk')];
  tap(canvas);
  expect(dom.el('dialog-title').textContent).toBe('Jenn');

  // Escape closes it; a plain prop hides the cta and rotates its line.
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(modal.classList.contains('hidden')).toBe(true);
  ray.hits = [propHit('desk')];
  tap(canvas);
  expect(dom.el('dialog-title').textContent).toBe('The Desk');
  expect(cta.classList.contains('hidden')).toBe(true);
  expect(dismiss.classList.contains('piece-enter')).toBe(true);
  expect(dom.el('dialog-message').textContent).not.toBe(firstLine);
  fire(dom.documentStub, 'keydown', { code: 'Escape' });

  // An unknown prop kind is politely ignored, as is a miss.
  ray.hits = [propHit('mystery-prop')];
  tap(canvas);
  ray.hits = [];
  tap(canvas);
  fire(canvas, 'touchend', { changedTouches: [{ clientX: 10, clientY: 10 }] });
  fire(canvas, 'touchend', { changedTouches: [] });
  expect(modal.classList.contains('hidden')).toBe(true);

  // Two stories so far: no reach-out invitation yet.
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(true);
});

test('every fourth story earns the reach-out invitation once its card closes', async () => {
  await bootJenn();
  const canvas = dom.el('game-canvas');
  const modal = dom.el('dialog-modal');
  const nudge = dom.el('nudge-modal');

  // Three stories come and go without the invitation.
  for (const kind of ['desk', 'chair', 'mug']) {
    ray.hits = [propHit(kind)];
    tap(canvas);
    expect(modal.classList.contains('hidden')).toBe(false);
    fire(dom.documentStub, 'keydown', { code: 'Escape' });
    expect(nudge.classList.contains('hidden')).toBe(true);
  }

  // The fourth story closes and the invitation follows, never stacking.
  ray.hits = [propHit('plant')];
  tap(canvas);
  expect(modal.classList.contains('hidden')).toBe(false);
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(modal.classList.contains('hidden')).toBe(true);
  expect(nudge.classList.contains('hidden')).toBe(false);

  // While the invitation is up, scene taps are ignored.
  ray.hits = [propHit('desk')];
  tap(canvas);
  expect(modal.classList.contains('hidden')).toBe(true);

  // Escape closes the invitation first, and again with nothing open is a
  // no-op (as is a non-Escape key).
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(nudge.classList.contains('hidden')).toBe(true);
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  fire(dom.documentStub, 'keydown', { code: 'ArrowRight' });
});

test('survives resize, gestures, visibility loss, and page hide', async () => {
  const main = await bootJenn();

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
  await import('../www/sunnyvalejenn/js/main.js');
  await flushAsync();
  await jest.advanceTimersByTimeAsync(3000);
  expect(dom.replaced).toEqual(['/']);
});
