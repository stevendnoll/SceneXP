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
import { installThree, keepPropRecords } from './helpers/three-stub.mjs';
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

// ---- Every story has a route without a pointer ------------------------------
// Until 2026-09-22 a card opened only from a raycast off a click or a tap. The
// list of the garden's things (shared proplist part) is the keyboard's route,
// and because the garden runs a day every eight minutes, its rows have to
// follow the crews: a tap cannot reach a bat at noon, so neither can a row.

describe("the list of the garden's things", () => {
  async function bootWithList() {
    keepPropRecords();
    dom.el('prop-panel').hidden = true;   // as the markup ships it
    await bootGavin();
    const items = () => dom.el('prop-list').children;
    const shown = () => items().filter((li) => !li.hidden).map((li) => li.children[0].textContent);
    const row = (label) => items().map((li) => li.children[0]).find((b) => b.textContent === label);
    const frames = (n, ms = 16) => {
      for (let i = 0; i < n; i++) { jest.advanceTimersByTime(ms); dom.loops[0](); }
    };
    return { items, shown, row, frames };
  }

  test('Gavin leads, every card has a row, and the mantises have none', async () => {
    const { items } = await bootWithList();
    const labels = items().map((li) => li.children[0].textContent);
    expect(labels[0]).toBe('Gavin');
    expect(labels).toContain('The Confederate Jasmine');
    expect(new Set(labels).size).toBe(labels.length);
    // Sixteen props and three kids registered, every one with a card.
    expect(labels).toHaveLength(19);
    // Mantis Watch is a spotting game. A row per mantis would be the answer key.
    expect(labels.some((l) => /mantis/i.test(l))).toBe(false);
  });

  test('offers the day crew at noon and the night crew after dusk', async () => {
    const { shown, frames } = await bootWithList();
    frames(40);   // past the first half-second check
    const DAY = ['A Working Bee', 'A Ladybug on Patrol', 'The Ant Line'];
    const NIGHT = ['The Night Fliers', 'A Night Snail', 'A Slug on Rounds'];
    const noon = shown();
    expect(noon).toEqual(expect.arrayContaining(DAY));
    NIGHT.forEach((l) => expect(noon).not.toContain(l));

    // Run the eight-minute day on to midnight, a tenth of a second a frame.
    frames(2500, 100);
    const night = shown();
    expect(night).toEqual(expect.arrayContaining(NIGHT));
    DAY.forEach((l) => expect(night).not.toContain(l));
    expect(night).toContain('Gavin');
  });

  test('waits for the welcome card, then opens exactly what a tap would', async () => {
    const { row } = await bootWithList();
    const modal = dom.el('dialog-modal');
    modal.classList.add('hidden');   // as the markup ships it

    fire(row('Gavin'), 'click');
    expect(modal.classList.contains('hidden')).toBe(true);

    fire(dom.documentStub, 'keydown', { code: 'Enter' });
    expect(dom.el('prop-panel').hidden).toBe(false);

    fire(row('Gavin'), 'click');
    expect(modal.classList.contains('hidden')).toBe(false);
    expect(dom.el('dialog-title').textContent).toBe('Gavin');
  });
});
