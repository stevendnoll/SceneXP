// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Boot-and-drive smoke for the home office experience's main.js orchestrator.
 *
 * Follows the gavin-main pattern: install THREE then the DOM stand-ins, import
 * main.js so it auto-boots the way a real page load does, and drive the wiring
 * by hand -- pointer lock, hover raycasts, every office dialog, the light
 * switch's floating dimmer panel, the discovery checklist through to the nudge
 * and the (deferred) completion celebration, the settings and nav panels, and
 * the lifecycle events. There is no autopilot here: the office is one small
 * room, and main.js deliberately does not import the shared tour part.
 *
 * Local additions on top of the shared stubs (helpers stay untouched):
 * - a steerable THREE.Raycaster whose intersectObjects returns whatever the
 *   test staged in rayHits, so clicks can land on Steve, the cat, or a prop
 * - a pointer-lock contract on the canvas/document stubs
 * - a MutationObserver recorder (main.js watches panel class changes)
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';

let dom;
let rayHits;      // intersections the local Raycaster stub hands back
let moCallbacks;  // MutationObserver callbacks, fired by hand after class flips

// Panels and dialogs that start hidden in the real markup. The auto-vivified
// element stubs need the class up front so open/close logic sees the same
// initial state the page has.
const HIDDEN_AT_BOOT = [
  'settings-panel', 'nav-menu', 'checklist', 'piece-modal', 'help-modal',
  'dialog-modal', 'whiteboard-view', 'complete-modal', 'nudge-modal',
  'light-panel',
];

/** A raycast intersection whose object carries the given userData flags. */
function hitFor(userData, extra = {}) {
  return { object: { userData, parent: null, ...extra }, distance: 2 };
}

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  installThree();
  dom = installDom();
  rayHits = [];
  moCallbacks = [];

  // Steerable raycaster: only main.js constructs Raycasters, so the override
  // routes every pick through rayHits. Everything else on THREE keeps the
  // stack's chainable / animation-loop-capturing behavior.
  const baseThree = globalThis.THREE;
  globalThis.THREE = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'Raycaster') {
        return function Raycaster() {
          return { far: 0, setFromCamera() {}, intersectObjects: () => rayHits.slice() };
        };
      }
      return baseThree[prop];
    },
  });

  // main.js observes the settings/nav panels' class attribute.
  globalThis.MutationObserver = class {
    constructor(cb) { moCallbacks.push(cb); }
    observe() {}
    disconnect() {}
  };

  // Pointer-lock contract: request marks the canvas locked and fires the
  // change event, exit clears it. document.contains lets the modal-close
  // focus restore run its happy path.
  const canvas = dom.el('game-canvas');
  dom.documentStub.pointerLockElement = null;
  dom.documentStub.contains = () => true;
  dom.documentStub.exitPointerLock = () => {
    dom.documentStub.pointerLockElement = null;
    fire(dom.documentStub, 'pointerlockchange');
  };
  canvas.requestPointerLock = () => {
    dom.documentStub.pointerLockElement = canvas;
    fire(dom.documentStub, 'pointerlockchange');
    return Promise.resolve();
  };

  HIDDEN_AT_BOOT.forEach((id) => dom.el(id).classList.add('hidden'));
});

afterEach(() => {
  dom.uninstall();
  delete globalThis.MutationObserver;
  jest.useRealTimers();
});

async function bootSteve() {
  const main = await import('../www/steve/js/main.js');
  await flushAsync();                       // let the async init() settle
  await jest.advanceTimersByTimeAsync(500); // the 400ms loading-screen reveal
  return main;
}

/** Step captured animation frames with simulated 16ms ticks between them. */
function stepFrames(n) {
  for (let i = 0; i < n; i++) {
    jest.advanceTimersByTime(16);
    dom.loops[0]();
  }
}

/** Stage rayHits and click the canvas (crosshair pick while pointer-locked). */
function clickScene(userData, extra) {
  rayHits = userData ? [hitFor(userData, extra)] : [];
  fire(dom.el('game-canvas'), 'click', { clientX: 640, clientY: 400 });
}

/** Escape out of the open dialog, then let the resume timers run. Any nudge
 *  or celebration that surfaces from the resume gets escaped too, so the
 *  driver always lands back in locked-and-playing state. */
async function escapeAndSettle() {
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  for (let i = 0; i < 4; i++) {
    await jest.advanceTimersByTimeAsync(700);
    const surfaced = ['complete-modal', 'nudge-modal']
      .filter((id) => !dom.el(id).classList.contains('hidden'));
    if (!surfaced.length) break;
    fire(dom.documentStub, 'keydown', { code: 'Escape' });
  }
}

test('auto-boots through the loading screen into the running state', async () => {
  const main = await bootSteve();

  const state = main.getState();
  expect(state.isRunning).toBe(true);
  expect(state.isLoaded).toBe(true);
  expect(state.isMobile).toBe(false);
  expect(state.isPaused).toBe(true); // welcome blocker still up

  expect(dom.el('load-progress').style.width).toBe('100%');
  expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);

  // The Home button got its config-driven link and label.
  expect(dom.el('home-btn').title.length).toBeGreaterThan(0);
  expect(dom.el('home-btn').getAttribute('aria-label')).toBe(dom.el('home-btn').title);

  expect(dom.loops.length).toBeGreaterThanOrEqual(1);
  stepFrames(120);
  expect(dom.replaced).toHaveLength(0);
});

test('survives resize, gestures, visibility loss, and page hide', async () => {
  await bootSteve();

  dom.windowStub.innerWidth = 390;
  dom.windowStub.innerHeight = 844;
  fire(dom.windowStub, 'resize');
  const g = fire(dom.documentStub, 'gesturestart');
  expect(g.defaultPrevented).toBe(true);
  stepFrames(30);

  dom.documentStub.visibilityState = 'hidden';
  fire(dom.documentStub, 'visibilitychange');
  fire(dom.windowStub, 'pagehide');
  fire(dom.windowStub, 'pagehide'); // endSession/cleanup must be idempotent

  // cleanup stopped the loop; one more call must be a quiet no-op
  dom.loops[0]();
  expect(dom.replaced).toHaveLength(0);
});

test('desktop tour: pointer lock, hover, every office dialog, nudge, deferred celebration', async () => {
  const main = await bootSteve();

  // Click the welcome blocker: pointer lock engages and play begins.
  fire(dom.el('blocker'), 'click');
  expect(main.getState().isPaused).toBe(false);
  expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
  expect(dom.el('hud').classList.contains('visible')).toBe(true);

  // Hover: Steve in the crosshair, then a clear crosshair.
  rayHits = [hitFor({ isShopkeeper: true })];
  stepFrames(10);
  expect(dom.el('look-label').classList.contains('visible')).toBe(true);
  expect(dom.el('look-label').textContent).toContain('Steve');
  expect(dom.el('hud').classList.contains('targeting')).toBe(true);
  // The dancer-hover seam stays wired even with no ambient NPCs built.
  rayHits = [hitFor({ isDancer: true })];
  stepFrames(10);
  expect(dom.el('look-label').textContent).toContain('say hi');
  // A gallery-piece hit resolves but matches no built piece (no wall art in
  // this theme), so no highlight lands.
  rayHits = [hitFor({ isGalleryPiece: true, galleryId: 'g1', galleryTitle: 'X' })];
  stepFrames(10);
  expect(dom.el('look-label').classList.contains('visible')).toBe(false);
  rayHits = [];
  stepFrames(10);
  expect(dom.el('look-label').classList.contains('visible')).toBe(false);

  // Discovery 1: say hi to Steve.
  clickScene({ isShopkeeper: true });
  expect(dom.el('help-modal').classList.contains('hidden')).toBe(false);
  expect(dom.el('checklist-btn').classList.contains('pulse')).toBe(true);
  await escapeAndSettle();
  expect(dom.el('help-modal').classList.contains('hidden')).toBe(true);
  expect(main.getState().isPaused).toBe(false); // resume re-locked the pointer

  // The dancer seam stays wired even with no ambient NPCs: the shared dialog
  // opens with the office title, and its teleport shortcut returns to spawn.
  clickScene({ isDancer: true });
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(false);
  expect(dom.el('dialog-title').textContent).toBe('Between Tasks');
  fire(dom.el('dialog-return-btn'), 'click'); // returnToSpawn closes the dialog
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(true);
  await jest.advanceTimersByTimeAsync(700);

  // Discoveries 2-5: the desk, the cat, the closet, the litter box. Crossing
  // four discoveries queues the partway nudge, which escapeAndSettle closes.
  for (const kind of ['standDesk', 'cat', 'closet', 'litter']) {
    clickScene({ isProp: true, propKind: kind });
    expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(false);
    await escapeAndSettle();
  }
  expect(globalThis.sessionStorage.getItem('steve-nudged')).toBe('1');

  // A prop with no checklist entry rotates its two lines across clicks.
  clickScene({ isProp: true, propKind: 'monitor' });
  const firstLine = dom.el('dialog-message').textContent;
  expect(dom.el('dialog-title').textContent).toBe('The Samsung Monitor');
  await escapeAndSettle();
  clickScene({ isProp: true, propKind: 'monitor' });
  expect(dom.el('dialog-message').textContent).not.toBe(firstLine);
  await escapeAndSettle();

  // An unknown prop kind opens nothing.
  clickScene({ isProp: true, propKind: 'not-a-real-prop' });
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(true);

  // The light switch opens the floating dimmer panel instead of a dialog.
  clickScene({ isProp: true, propKind: 'lightswitch' }, { getWorldPosition: (v) => v });
  expect(dom.el('light-panel').classList.contains('hidden')).toBe(false);
  expect(dom.el('light-slider').focused).toBe(true);
  const dimmer = dom.el('light-slider');
  dimmer.value = '0.3';
  fire(dimmer, 'input');
  fire(dimmer, 'change');
  expect(dom.el('light-value').textContent).toBe('30%');
  expect(dom.el('settings-light-value').textContent).toBe('30%'); // both controls stay in sync
  fire(dom.documentStub, 'keydown', { code: 'Escape' }); // closeActiveModal's dimmer branch
  expect(dom.el('light-panel').classList.contains('hidden')).toBe(true);
  await jest.advanceTimersByTimeAsync(700);

  // Reopen the dimmer, then a press outside the floating panel closes it.
  clickScene({ isProp: true, propKind: 'lightswitch' }, { getWorldPosition: (v) => v });
  expect(dom.el('light-panel').classList.contains('hidden')).toBe(false);
  fire(dom.documentStub, 'pointerdown', { target: dom.el('game-canvas') });
  expect(dom.el('light-panel').classList.contains('hidden')).toBe(true);
  await jest.advanceTimersByTimeAsync(700);

  // Discovery 6: the whiteboard close-up completes the list while a modal is
  // up, so the celebration defers until the overlay closes.
  clickScene({ isProp: true, propKind: 'board' });
  expect(dom.el('whiteboard-view').classList.contains('hidden')).toBe(false);
  expect(dom.el('whiteboard-caption').textContent.length).toBeGreaterThan(0);
  stepFrames(5); // whiteboardOpen skips the 3D render
  const checklist = await import('../www/shared/js/checklist-1.0.0.min.js');
  expect(checklist.getChecklistProgress().complete).toBe(true);
  expect(dom.el('complete-modal').classList.contains('hidden')).toBe(true); // deferred

  fire(dom.documentStub, 'keydown', { code: 'Escape' }); // close the whiteboard
  await jest.advanceTimersByTimeAsync(300);
  expect(dom.el('complete-modal').classList.contains('hidden')).toBe(false);
  expect(globalThis.sessionStorage.getItem('steve-celebrated')).toBe('1');

  // Share: the native share sheet, then a dismissed sheet (AbortError).
  const share = jest.fn(async () => {});
  globalThis.navigator.share = share;
  fire(dom.el('complete-share'), 'click');
  await flushAsync();
  expect(share).toHaveBeenCalledTimes(1);
  globalThis.navigator.share = async () => {
    const e = new Error('dismissed');
    e.name = 'AbortError';
    throw e;
  };
  fire(dom.el('complete-share'), 'click');
  await flushAsync();
  expect(dom.windowStub.location.href.startsWith('mailto:')).toBe(false);

  // And the clipboard path when no share sheet exists.
  delete globalThis.navigator.share;
  globalThis.navigator.clipboard = { writeText: async () => {} };
  fire(dom.el('complete-share'), 'click');
  await flushAsync();
  expect(dom.el('complete-share').textContent).toBe('Link copied ✓');
  await jest.advanceTimersByTimeAsync(2000);
  expect(dom.el('complete-share').disabled).toBe(false);
  delete globalThis.navigator.clipboard;

  await escapeAndSettle(); // close the celebration
  expect(dom.el('complete-modal').classList.contains('hidden')).toBe(true);

  // Escape during play with nothing open exits pointer lock to the welcome.
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(main.getState().isPaused).toBe(true);
  expect(dom.el('blocker').classList.contains('hidden')).toBe(false);
  expect(dom.replaced).toHaveLength(0);
});

test('a gallery piece click opens the piece modal with its link wired', async () => {
  const main = await bootSteve();
  fire(dom.el('blocker'), 'click');

  clickScene({
    isGalleryPiece: true, galleryId: 'g1', galleryTitle: 'Test Wing',
    gallerySubtitle: 'A quick test', galleryUrl: '/wing/',
  });
  expect(dom.el('piece-modal').classList.contains('hidden')).toBe(false);
  expect(dom.el('piece-title').textContent).toBe('Test Wing');
  expect(dom.el('piece-subtitle').textContent).toBe('A quick test');
  expect(dom.el('piece-enter').getAttribute('href')).toBe('/wing/');
  expect(dom.el('piece-enter').textContent).toContain('Test Wing');
  await escapeAndSettle();
  expect(dom.el('piece-modal').classList.contains('hidden')).toBe(true);
  expect(main.getState().isPaused).toBe(false);

  // A miss (no staged hits under the crosshair) opens nothing.
  clickScene(null);
  expect(main.getState()._modalOpen).toBe(false);

  // A nudge left pending from a prior page surfaces shortly after the
  // welcome screen closes again.
  fire(dom.documentStub, 'keydown', { code: 'Escape' }); // unlock to the welcome
  expect(main.getState().isPaused).toBe(true);
  globalThis.sessionStorage.setItem('gallery-nudge-pending', '1');
  fire(dom.el('blocker'), 'click'); // lock back in
  await jest.advanceTimersByTimeAsync(500);
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(false);
  expect(globalThis.sessionStorage.getItem('steve-nudged')).toBe('1');
  await escapeAndSettle();
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(true);
});

test('settings, nav menu, and checklist panels open, tune, and close', async () => {
  await bootSteve();
  const fireAllMO = () => moCallbacks.forEach((cb) => cb([]));

  // The gear opens the settings panel; the class observer syncs aria state.
  fire(dom.el('settings-btn'), 'click');
  const panel = dom.el('settings-panel');
  expect(panel.classList.contains('hidden')).toBe(false);
  fireAllMO();
  expect(dom.el('settings-btn').getAttribute('aria-expanded')).toBe('true');

  // Sliders: live input plus a committed change persisted to sessionStorage.
  const walk = dom.el('walk-speed-slider');
  walk.value = '8';
  fire(walk, 'input');
  fire(walk, 'change');
  expect(String(dom.el('walk-speed-value').textContent)).toBe('8');
  const look = dom.el('look-speed-slider');
  look.value = '2';
  fire(look, 'input');
  fire(look, 'change');
  expect(dom.el('look-speed-value').textContent).toBe('2.0');
  const light = dom.el('settings-light-slider');
  light.value = '0.5';
  fire(light, 'input');
  fire(light, 'change');
  expect(dom.el('settings-light-value').textContent).toBe('50%');
  expect(dom.el('light-value').textContent).toBe('50%'); // dimmer panel mirrors it
  const stored = JSON.parse(globalThis.sessionStorage.getItem('steve-settings'));
  expect(stored).toMatchObject({ walk: 8, look: 2, brightness: 0.5 });

  // A press outside the open panel closes it (capture-phase listener).
  fire(dom.documentStub, 'pointerdown', { target: dom.el('game-canvas') });
  expect(panel.classList.contains('hidden')).toBe(true);
  fireAllMO();
  expect(dom.el('settings-btn').getAttribute('aria-expanded')).toBe('false');

  // Menu button opens the nav menu; Escape closes it and refocuses.
  fire(dom.el('menu-btn'), 'click');
  expect(dom.el('nav-menu').classList.contains('hidden')).toBe(false);
  fireAllMO();
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(dom.el('nav-menu').classList.contains('hidden')).toBe(true);
  expect(dom.el('menu-btn').getAttribute('aria-expanded')).toBe('false');
  expect(dom.el('menu-btn').focused).toBe(true);

  // The skip link opens the menu and focuses its first control.
  fire(dom.documentStub.querySelector('.skip-link'), 'click');
  expect(dom.el('nav-menu').classList.contains('hidden')).toBe(false);
  fire(dom.el('nav-close'), 'click');
  expect(dom.el('nav-menu').classList.contains('hidden')).toBe(true);

  // Menu open, then a press outside closes it too.
  fire(dom.el('menu-btn'), 'click');
  fireAllMO();
  fire(dom.documentStub, 'pointerdown', { target: dom.el('game-canvas') });
  expect(dom.el('nav-menu').classList.contains('hidden')).toBe(true);

  // Checklist dropdown: toggle open, aria synced, outside tap closes.
  fire(dom.el('checklist-btn'), 'click');
  expect(dom.el('checklist').classList.contains('hidden')).toBe(false);
  expect(dom.el('checklist-btn').getAttribute('aria-expanded')).toBe('true');
  fire(dom.documentStub, 'pointerdown', { target: dom.el('game-canvas') });
  expect(dom.el('checklist').classList.contains('hidden')).toBe(true);
  expect(dom.el('checklist-btn').getAttribute('aria-expanded')).toBe('false');

  // Escape with the settings panel open hides just the panel.
  fire(dom.el('settings-btn'), 'click');
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(dom.el('settings-panel').classList.contains('hidden')).toBe(true);
});

test('mobile: tap to start, forgiving taps, whiteboard close-up, tucked joysticks', async () => {
  globalThis.navigator.maxTouchPoints = 5;
  const main = await bootSteve();
  expect(main.getState().isMobile).toBe(true);
  expect(dom.el('touch-controls').classList.contains('visible')).toBe(true);
  expect(dom.documentStub.querySelector('.click-prompt').textContent).toBe('Tap to step inside');
  expect(String(dom.el('walk-speed-slider').value)).toBe('5'); // gentler joystick default

  fire(dom.el('blocker'), 'touchend');
  expect(main.getState().isPaused).toBe(false);
  expect(dom.el('hud').classList.contains('visible')).toBe(true);

  // A miss: the tolerance sampling walks its rings and finds nothing.
  rayHits = [];
  fire(dom.el('game-canvas'), 'touchend', { changedTouches: [{ clientX: 200, clientY: 300 }] });
  expect(main.getState()._modalOpen).toBe(false);

  // Tap Steve: his greeting opens, phrased for touch.
  rayHits = [hitFor({ isShopkeeper: true })];
  fire(dom.el('game-canvas'), 'touchend', { changedTouches: [{ clientX: 200, clientY: 300 }] });
  expect(dom.el('help-modal').classList.contains('hidden')).toBe(false);
  await escapeAndSettle();
  expect(main.getState().isPaused).toBe(false);
  expect(dom.el('touch-controls').classList.contains('visible')).toBe(true);

  // The whiteboard close-up pans to center on phones.
  rayHits = [hitFor({ isProp: true, propKind: 'board' })];
  fire(dom.el('game-canvas'), 'touchend', { changedTouches: [{ clientX: 200, clientY: 300 }] });
  expect(dom.el('whiteboard-view').classList.contains('hidden')).toBe(false);
  await escapeAndSettle();
  expect(dom.el('whiteboard-view').classList.contains('hidden')).toBe(true);

  // Opening settings tucks the joysticks away; closing brings them back.
  fire(dom.el('settings-btn'), 'click');
  moCallbacks.forEach((cb) => cb([]));
  expect(dom.el('touch-controls').classList.contains('visible')).toBe(false);
  fire(dom.documentStub, 'pointerdown', { target: dom.el('game-canvas') });
  moCallbacks.forEach((cb) => cb([]));
  expect(dom.el('touch-controls').classList.contains('visible')).toBe(true);
});

test('falls back to the 2D site when WebGL is unavailable', async () => {
  delete dom.windowStub.WebGLRenderingContext;
  await import('../www/steve/js/main.js');
  await flushAsync();
  await jest.advanceTimersByTimeAsync(3000);
  expect(dom.replaced).toEqual(['/']);
});

test('__test__ seams: readNumericSetting, pickLine, bufToHex', async () => {
  const main = await import('../www/steve/js/main.js');
  await flushAsync();
  const { readNumericSetting, pickLine, bufToHex } = main.__test__;
  expect(readNumericSetting({ walk: 8 }, 'walk', 2, 14, 5)).toBe(8);
  expect(readNumericSetting({ walk: 99 }, 'walk', 2, 14, 5)).toBe(5);   // out of range
  expect(readNumericSetting({ walk: 'x' }, 'walk', 2, 14, 5)).toBe(5);  // wrong type
  expect(readNumericSetting({}, 'walk', 2, 14, 5)).toBe(5);             // absent
  expect(pickLine(['a', 'b', 'c'], 4)).toBe('b');
  expect(pickLine([], 1)).toBe('');
  expect(pickLine(null, 0)).toBe('');
  expect(bufToHex(new Uint8Array([0, 255, 16]).buffer)).toBe('00ff10');
});
