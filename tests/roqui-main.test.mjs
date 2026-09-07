// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Boot-and-drive smoke for the Zumba studio experience's main.js orchestrator.
 *
 * Follows the gavin-main pattern: install THREE then the DOM stand-ins, import
 * main.js so it auto-boots the way a real page load does, and drive the wiring
 * by hand -- pointer lock, hover raycasts, every dialog, the discovery
 * checklist through to the nudge and the completion celebration, the autopilot
 * tour, the settings and nav panels, and the lifecycle events.
 *
 * Local additions on top of the shared stubs (helpers stay untouched):
 * - a steerable THREE.Raycaster whose intersectObjects returns whatever the
 *   test staged in rayHits, so clicks can land on Roqui, a dancer, or a prop
 * - a pointer-lock contract on the canvas/document stubs
 * - a MutationObserver recorder (main.js watches panel class changes)
 * - play()/pause() on <audio> plus a chainable AudioContext so the playlist
 *   toggle can take its "music on" path
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

  // The studio playlist: WebAudio absorbed by a chainable constructor, and
  // the iOS keep-alive <audio> needs play/pause.
  dom.windowStub.AudioContext = globalThis.THREE.AudioContext;
  const origCreateElement = dom.documentStub.createElement;
  dom.documentStub.createElement = (tag) => {
    const el = origCreateElement(tag);
    if (tag === 'audio') {
      el.play = () => ({ catch() {} });
      el.pause = () => {};
    }
    return el;
  };

  HIDDEN_AT_BOOT.forEach((id) => dom.el(id).classList.add('hidden'));
});

afterEach(() => {
  dom.uninstall();
  delete globalThis.MutationObserver;
  jest.useRealTimers();
});

async function bootRoqui() {
  const main = await import('../www/roqui/js/main.js');
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
  const main = await bootRoqui();

  const state = main.getState();
  expect(state.isRunning).toBe(true);
  expect(state.isLoaded).toBe(true);
  expect(state.isMobile).toBe(false);
  expect(state.isPaused).toBe(true); // welcome blocker still up

  expect(dom.el('load-progress').style.width).toBe('100%');
  expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);

  // The welcome screen's directory link got its config-driven href. It
  // replaced the Home button, and needs no label from config: unlike an
  // icon-only button, it says SceneXP.com in its own text.
  expect(dom.el('explore-link').href).toBe('/');

  expect(dom.loops.length).toBeGreaterThanOrEqual(1);
  stepFrames(120);
  expect(dom.replaced).toHaveLength(0);
});

test('survives resize, gestures, visibility loss, and page hide', async () => {
  await bootRoqui();

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

test('desktop tour: pointer lock, hover labels, every dialog, nudge, celebration, share', async () => {
  const main = await bootRoqui();

  // Click the welcome blocker: pointer lock engages and play begins.
  fire(dom.el('blocker'), 'click');
  expect(main.getState().isPaused).toBe(false);
  expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
  expect(dom.el('hud').classList.contains('visible')).toBe(true);

  // Hover: Roqui first, then a dancer, then a clear crosshair.
  rayHits = [hitFor({ isShopkeeper: true })];
  stepFrames(10);
  expect(dom.el('look-label').classList.contains('visible')).toBe(true);
  expect(dom.el('look-label').textContent).toContain('hola');
  expect(dom.el('hud').classList.contains('targeting')).toBe(true);
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
  expect(dom.el('hud').classList.contains('targeting')).toBe(false);

  // Discovery 1: say hola to Roqui.
  clickScene({ isShopkeeper: true });
  expect(dom.el('help-modal').classList.contains('hidden')).toBe(false);
  expect(dom.el('checklist-btn').classList.contains('pulse')).toBe(true);
  await escapeAndSettle();
  expect(dom.el('help-modal').classList.contains('hidden')).toBe(true);
  expect(main.getState().isPaused).toBe(false); // resume re-locked the pointer

  // Discovery 2: a dancer in the class. The dialog's teleport shortcut
  // (plumbed but hidden in this room) returns to spawn and closes it.
  clickScene({ isDancer: true });
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(false);
  expect(dom.el('dialog-title').textContent).toBe('Between Songs');
  expect(dom.el('dialog-message').textContent.length).toBeGreaterThan(0);
  fire(dom.el('dialog-return-btn'), 'click'); // returnToSpawn
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(true);
  await jest.advanceTimersByTimeAsync(700);

  // Discoveries 3-5: mirror, disco ball, water table. Crossing four
  // discoveries queues the partway nudge, which escapeAndSettle closes.
  for (const kind of ['mirror', 'disco', 'water']) {
    clickScene({ isProp: true, propKind: kind });
    expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(false);
    await escapeAndSettle();
  }
  expect(globalThis.sessionStorage.getItem('roqui-nudged')).toBe('1');

  // A poster has no checklist entry; an unknown prop kind opens nothing.
  clickScene({ isProp: true, propKind: 'poster' });
  expect(dom.el('dialog-title').textContent).toBe('On the Wall');
  await escapeAndSettle();
  clickScene({ isProp: true, propKind: 'not-a-real-prop' });
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(true);

  // Discovery 6: the schedule board opens the close-up overlay.
  clickScene({ isProp: true, propKind: 'board' });
  expect(dom.el('whiteboard-view').classList.contains('hidden')).toBe(false);
  expect(dom.el('whiteboard-caption').textContent.length).toBeGreaterThan(0);
  stepFrames(5); // whiteboardOpen skips the 3D render
  await escapeAndSettle();
  expect(dom.el('whiteboard-view').classList.contains('hidden')).toBe(true);

  // Discovery 7: the speakers start the playlist.
  clickScene({ isProp: true, propKind: 'speakers' });
  expect(dom.el('dialog-title').textContent).toBe('The Speakers');
  expect(dom.el('dialog-message').textContent).toContain('There it is');
  stepFrames(10); // the music scheduler ticks a few frames
  await escapeAndSettle();

  // Discovery 8: the iPhone pauses the playlist and completes the list --
  // the celebration fires immediately.
  clickScene({ isProp: true, propKind: 'iphone' });
  expect(dom.el('complete-modal').classList.contains('hidden')).toBe(false);
  expect(dom.el('dialog-message').textContent).toContain('paused');

  // The checklist module instance main.js drives agrees it is complete.
  const checklist = await import('../www/shared/js/checklist-1.0.0.min.js');
  expect(checklist.getChecklistProgress().complete).toBe(true);
  expect(globalThis.sessionStorage.getItem('roqui-celebrated')).toBe('1');

  // Share: the clipboard path flashes the button, then the mailto fallback.
  globalThis.navigator.clipboard = { writeText: async () => {} };
  fire(dom.el('complete-share'), 'click');
  await flushAsync();
  expect(dom.el('complete-share').textContent).toBe('Link copied ✓');
  await jest.advanceTimersByTimeAsync(2000);
  expect(dom.el('complete-share').disabled).toBe(false);
  delete globalThis.navigator.clipboard;
  fire(dom.el('complete-share'), 'click');
  await flushAsync();
  expect(dom.windowStub.location.href.startsWith('mailto:')).toBe(true);

  await escapeAndSettle(); // close the celebration
  expect(dom.el('complete-modal').classList.contains('hidden')).toBe(true);

  // Escape during play with nothing open exits pointer lock to the welcome.
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(main.getState().isPaused).toBe(true);
  expect(dom.el('blocker').classList.contains('hidden')).toBe(false);
  expect(dom.replaced).toHaveLength(0);
});

test('a gallery piece click opens the piece modal with its link wired', async () => {
  const main = await bootRoqui();
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
  expect(globalThis.sessionStorage.getItem('roqui-nudged')).toBe('1');
  await escapeAndSettle();
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(true);
});

test('settings, nav menu, and checklist panels open, tune, and close', async () => {
  await bootRoqui();
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
  const stored = JSON.parse(globalThis.sessionStorage.getItem('roqui-settings'));
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

test('autopilot: T key and button engage the tour, movement hands control back', async () => {
  await bootRoqui();
  fire(dom.el('blocker'), 'click'); // lock in and play
  const btn = dom.el('autopilot-btn');

  fire(dom.documentStub, 'keydown', { code: 'KeyT' });
  expect(btn.getAttribute('aria-pressed')).toBe('true');
  stepFrames(60); // the tour strolls a while without throwing

  fire(dom.documentStub, 'keydown', { code: 'KeyW' });
  expect(btn.getAttribute('aria-pressed')).toBe('false');
  fire(dom.documentStub, 'keyup', { code: 'KeyW' });

  // Typing into a form control never toggles the tour.
  fire(dom.documentStub, 'keydown', { code: 'KeyT', target: { tagName: 'INPUT' } });
  expect(btn.getAttribute('aria-pressed')).toBe('false');

  fire(btn, 'click');
  expect(btn.getAttribute('aria-pressed')).toBe('true');
  stepFrames(30);
  fire(btn, 'click');
  expect(btn.getAttribute('aria-pressed')).toBe('false');
});

test('mobile: tap to start, forgiving taps, whiteboard close-up, tucked joysticks', async () => {
  globalThis.navigator.maxTouchPoints = 5;
  const main = await bootRoqui();
  expect(main.getState().isMobile).toBe(true);
  expect(dom.el('touch-controls').classList.contains('visible')).toBe(true);
  expect(dom.documentStub.querySelector('.click-prompt').textContent).toBe('Tap to join the class');
  expect(String(dom.el('walk-speed-slider').value)).toBe('5'); // gentler joystick default

  fire(dom.el('blocker'), 'touchend');
  expect(main.getState().isPaused).toBe(false);
  expect(dom.el('hud').classList.contains('visible')).toBe(true);

  // A miss: the tolerance sampling walks its rings and finds nothing.
  rayHits = [];
  fire(dom.el('game-canvas'), 'touchend', { changedTouches: [{ clientX: 200, clientY: 300 }] });
  expect(main.getState()._modalOpen).toBe(false);

  // Tap Roqui: the hola dialog opens, phrased for touch.
  rayHits = [hitFor({ isShopkeeper: true })];
  fire(dom.el('game-canvas'), 'touchend', { changedTouches: [{ clientX: 200, clientY: 300 }] });
  expect(dom.el('help-modal').classList.contains('hidden')).toBe(false);
  await escapeAndSettle();
  expect(main.getState().isPaused).toBe(false);
  expect(dom.el('touch-controls').classList.contains('visible')).toBe(true);

  // The schedule-board close-up pans to center on phones.
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
  await import('../www/roqui/js/main.js');
  await flushAsync();
  await jest.advanceTimersByTimeAsync(3000);
  expect(dom.replaced).toEqual(['/']);
});

test('__test__ seams: readNumericSetting, pickLine, bufToHex', async () => {
  const main = await import('../www/roqui/js/main.js');
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
