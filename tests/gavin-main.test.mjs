// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Boot-and-drive smoke for the bug patrol experience's main.js orchestrator.
 *
 * Under Node, importing main.js is side-effect-free unless a `document`
 * exists, so this suite installs the browser stand-ins from dom-stub.mjs
 * FIRST and then imports: the module auto-boots exactly the way a real page
 * load does. hasWebGL() passes (the stub canvas yields a truthy 'webgl'
 * context), the proof of work takes its graceful no-crypto path, and
 * renderer.setAnimationLoop lands in dom.loops so the test can step frames
 * by hand. Nothing renders, but every wiring line runs: a missing element
 * hook or a listener left dangling by a refactor fails here, not on the
 * live site.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';

let dom;

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  installThree();
  dom = installDom();
});

afterEach(() => {
  dom.uninstall();
  jest.useRealTimers();
});

async function bootGavin() {
  const main = await import('../www/gavin/js/main.js');
  await flushAsync();                       // let the async init() settle
  await jest.advanceTimersByTimeAsync(500); // the 400ms loading-screen reveal
  return main;
}

test('auto-boots through the loading screen into the running state', async () => {
  const main = await bootGavin();

  const state = main.getState();
  expect(state.isRunning).toBe(true);
  expect(state.isLoaded).toBe(true);
  expect(state.isMobile).toBe(false);

  // The loading screen was walked to 100% and then hidden.
  expect(dom.el('load-progress').style.width).toBe('100%');
  expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);

  // The animate loop was handed to renderer.setAnimationLoop, and stepping
  // it for a few simulated seconds must not throw.
  expect(dom.loops.length).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < 120; i++) {
    jest.advanceTimersByTime(16);
    dom.loops[0]();
  }

  // No 2D fallback redirect happened.
  expect(dom.replaced).toHaveLength(0);
});

test('survives resize, taps, visibility loss, and page hide', async () => {
  await bootGavin();
  const canvas = dom.el('game-canvas');

  // Rotate to portrait: the resize path re-derives the fixed camera.
  dom.windowStub.innerWidth = 390;
  dom.windowStub.innerHeight = 844;
  fire(dom.windowStub, 'resize');
  fire(dom.documentStub, 'gesturestart');

  // Tap the scene a few times (the chainable raycaster returns no hits, so
  // this exercises the miss path and the tolerance sampling).
  for (const target of [canvas, dom.documentStub, dom.windowStub]) {
    fire(target, 'pointerdown', { clientX: 200, clientY: 150, pointerId: 1, button: 0 });
    fire(target, 'pointerup', { clientX: 200, clientY: 150, pointerId: 1, button: 0 });
    fire(target, 'click', { clientX: 200, clientY: 150, button: 0 });
  }
  fire(dom.documentStub, 'keydown', { key: 'Escape' });

  // A few more frames after the interactions.
  for (let i = 0; i < 30; i++) {
    jest.advanceTimersByTime(16);
    dom.loops[0]();
  }

  // Tab away, then leave: the session-end path must be idempotent.
  dom.documentStub.visibilityState = 'hidden';
  fire(dom.documentStub, 'visibilitychange');
  fire(dom.windowStub, 'pagehide');
  fire(dom.windowStub, 'pagehide');
});

test('falls back to the 2D site when WebGL is unavailable', async () => {
  // Break WebGL before import: boot() must route to the fallback.
  delete dom.windowStub.WebGLRenderingContext;
  await import('../www/gavin/js/main.js');
  await flushAsync();
  await jest.advanceTimersByTimeAsync(3000);
  expect(dom.replaced).toEqual(['/']);
});
