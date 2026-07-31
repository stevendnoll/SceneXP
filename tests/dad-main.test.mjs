// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Boot-and-drive smoke for the NCR Trail experience's main.js orchestrator.
 *
 * Follows the gavin-main pattern: install THREE and the DOM stand-ins first,
 * then import main.js so it auto-boots exactly like a real page load. On top
 * of the shared stubs this suite adds three local seams main.js needs that
 * the bug patrol experience does not:
 *
 * - a pointer-lock contract on the canvas (requestPointerLock /
 *   exitPointerLock / pointerlockchange), so the welcome blocker, the modals'
 *   pause-resume dance, and the Escape key all run their real paths;
 * - a controllable THREE.Raycaster, so clicks and the crosshair hover can be
 *   aimed at Dad, a rider, a walker, each outdoor prop kind, the sun and
 *   moon, and a gallery piece in turn;
 * - a recording MutationObserver, so the settings and nav panels'
 *   visibility-driven side effects can be pumped by hand.
 *
 * Assertions stay loose on purpose (classList flips, no-throw frame
 * stepping, dom.replaced empty): deep scene checks live in dad-init.test.mjs.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';

let dom;
let observers; // element -> MutationObserver callbacks registered on it

// Test-aimed raycast results. `hit` is returned (wrapped) by intersectObjects
// for both the click and the hover rays; `sky` matches by identity in
// intersectObject so the sun and moon can be targeted separately.
const ray = { hit: null, sky: null };

class FakeRaycaster {
  constructor() { this.far = Infinity; }
  setFromCamera() {}
  intersectObjects() { return ray.hit ? [{ object: ray.hit, distance: 1 }] : []; }
  intersectObject(obj) { return (ray.sky && obj === ray.sky) ? [{ object: obj, distance: 1 }] : []; }
}

class FakeMutationObserver {
  constructor(cb) { this.cb = cb; }
  observe(el) {
    if (!observers.has(el)) observers.set(el, []);
    observers.get(el).push(this.cb);
  }
  disconnect() {}
}

/** Run the MutationObserver callbacks registered on an element (the stub
 *  classList does not emit real mutations). */
function mutate(el) { (observers.get(el) || []).forEach((cb) => cb([], null)); }

// Overlays that ship with class="hidden" in the real HTML; the auto-vivified
// stubs start bare, and the Escape handler and closeActiveModal() rely on the
// hidden state to route correctly.
const HIDDEN_AT_LOAD = [
  'settings-panel', 'nav-menu', 'checklist', 'piece-modal', 'help-modal',
  'dialog-modal', 'whiteboard-view', 'complete-modal', 'nudge-modal',
];

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  ray.hit = null;
  ray.sky = null;
  installThree();
  dom = installDom();

  // Local seam: a deterministic Raycaster (main.js is its only consumer).
  const three = globalThis.THREE;
  globalThis.THREE = new Proxy({}, {
    get: (_t, prop) => (prop === 'Raycaster' ? FakeRaycaster : three[prop]),
  });

  observers = new Map();
  globalThis.MutationObserver = FakeMutationObserver;

  // Local seam: the pointer-lock contract main.js drives via the canvas.
  const canvas = dom.el('game-canvas');
  dom.documentStub.pointerLockElement = null;
  dom.documentStub.contains = () => true;
  canvas.requestPointerLock = () => {
    dom.documentStub.pointerLockElement = canvas;
    fire(dom.documentStub, 'pointerlockchange');
    return Promise.resolve();
  };
  dom.documentStub.exitPointerLock = () => {
    dom.documentStub.pointerLockElement = null;
    fire(dom.documentStub, 'pointerlockchange');
  };

  HIDDEN_AT_LOAD.forEach((id) => dom.el(id).classList.add('hidden'));
});

afterEach(() => {
  dom.uninstall();
  delete globalThis.MutationObserver;
  jest.useRealTimers();
});

async function bootDad() {
  const main = await import('../www/dad/js/main.js');
  await flushAsync();                       // let the async init() settle
  await jest.advanceTimersByTimeAsync(500); // the 400ms loading-screen reveal
  return main;
}

/** Dismiss the welcome blocker the desktop way (click -> pointer lock). */
function startDesktop() {
  fire(dom.el('blocker'), 'click');
}

/** Step the captured animation loop with 16ms of fake time per frame. */
function stepFrames(n) {
  for (let i = 0; i < n; i++) {
    jest.advanceTimersByTime(16);
    dom.loops[0]();
  }
}

/** Click the canvas (crosshair-style while pointer locked). */
function clickCanvas() {
  fire(dom.el('game-canvas'), 'click', { clientX: 400, clientY: 300, button: 0 });
}

/** Press Escape (closes the top modal / panel, else exits pointer lock). */
function pressEscape() {
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
}

// Plain raycast stand-ins: main.js only walks userData/parent on these.
const HOST = { userData: { isShopkeeper: true }, parent: null };
const CYCLIST = { userData: { isCyclist: true }, parent: null };
const WALKER = { userData: { isCustomer: true }, parent: null };
const prop = (propKind) => ({ userData: { isProp: true, propKind }, parent: null });
const PIECE = {
  userData: {
    isGalleryPiece: true, galleryId: 'g1', galleryTitle: 'The River Room',
    gallerySubtitle: 'A quiet study', galleryUrl: '/river/',
  },
  parent: null,
};

test('auto-boots through the loading screen and survives a session teardown', async () => {
  const main = await bootDad();

  const state = main.getState();
  expect(state.isRunning).toBe(true);
  expect(state.isLoaded).toBe(true);
  expect(state.isMobile).toBe(false);

  expect(dom.el('load-progress').style.width).toBe('100%');
  expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);
  expect(dom.loops.length).toBeGreaterThanOrEqual(1);

  // A few simulated seconds of the paused welcome state must not throw.
  stepFrames(120);

  // Rotate to portrait and pinch (the iOS gesture blockers).
  dom.windowStub.innerWidth = 390;
  dom.windowStub.innerHeight = 844;
  fire(dom.windowStub, 'resize');
  fire(dom.documentStub, 'gesturestart');

  // Start play, run a bit, then tear the session down twice (idempotent).
  startDesktop();
  expect(main.getState().isPaused).toBe(false);
  stepFrames(30);
  dom.documentStub.visibilityState = 'hidden';
  fire(dom.documentStub, 'visibilitychange');
  fire(dom.windowStub, 'pagehide');
  fire(dom.windowStub, 'pagehide');
  expect(main.getState().isRunning).toBe(false);
  dom.loops[0](); // the animate loop is now a guarded no-op

  expect(dom.replaced).toHaveLength(0);
});

test('pointer lock starts play, the crosshair hover cycles targets, and Escape pauses', async () => {
  const main = await bootDad();
  const canvas = dom.el('game-canvas');

  startDesktop();
  expect(dom.documentStub.pointerLockElement).toBe(canvas);
  expect(main.getState().isPaused).toBe(false);
  expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
  expect(dom.el('hud').classList.contains('visible')).toBe(true);

  // Hover Dad: the label invites a chat and the HUD marks a target.
  ray.hit = HOST;
  stepFrames(10);
  expect(dom.el('look-label').textContent).toContain('Say hello?');
  expect(dom.el('look-label').classList.contains('visible')).toBe(true);
  expect(dom.el('hud').classList.contains('targeting')).toBe(true);

  // Hover a rider, then a walker, then nothing.
  ray.hit = CYCLIST;
  stepFrames(10);
  expect(dom.el('look-label').textContent).toContain('greet the rider');
  ray.hit = WALKER;
  stepFrames(10);
  expect(dom.el('look-label').textContent).toContain('chat with the customer');
  ray.hit = null;
  stepFrames(10);
  expect(dom.el('look-label').classList.contains('visible')).toBe(false);
  expect(dom.el('hud').classList.contains('targeting')).toBe(false);

  // Click Dad: the hello modal opens, pointer lock releases, play pauses.
  ray.hit = HOST;
  clickCanvas();
  expect(dom.el('help-modal').classList.contains('hidden')).toBe(false);
  expect(main.getState().isPaused).toBe(true);
  expect(dom.el('blocker').classList.contains('hidden')).toBe(true); // modal, not welcome

  // Escape closes it and the 200ms resume re-locks the pointer.
  pressEscape();
  expect(dom.el('help-modal').classList.contains('hidden')).toBe(true);
  await jest.advanceTimersByTimeAsync(250);
  expect(main.getState().isPaused).toBe(false);

  // T toggles the autopilot tour; any movement key hands controls back.
  fire(dom.documentStub, 'keydown', { code: 'KeyT' });
  expect(dom.el('autopilot-btn').getAttribute('aria-pressed')).toBe('true');
  stepFrames(10); // updateAutopilot steers a few frames
  fire(dom.documentStub, 'keydown', { code: 'KeyW' });
  expect(dom.el('autopilot-btn').getAttribute('aria-pressed')).toBe('false');
  fire(dom.documentStub, 'keyup', { code: 'KeyW' });

  // The tour button toggles it too.
  fire(dom.el('autopilot-btn'), 'click');
  expect(dom.el('autopilot-btn').getAttribute('aria-pressed')).toBe('true');
  fire(dom.el('autopilot-btn'), 'click');
  expect(dom.el('autopilot-btn').getAttribute('aria-pressed')).toBe('false');

  // Escape with nothing open exits pointer lock back to the welcome screen.
  pressEscape();
  expect(main.getState().isPaused).toBe(true);
  expect(dom.el('blocker').classList.contains('hidden')).toBe(false);
  expect(dom.replaced).toHaveLength(0);
});

test('clicks open every dialog kind, and four discoveries surface the nudge', async () => {
  const scene = await import('../www/shared/js/scene-1.0.0.min.js');
  await bootDad();
  startDesktop();

  const dialog = dom.el('dialog-modal');
  const title = dom.el('dialog-title');
  const message = dom.el('dialog-message');

  // A rider on the trail (discovery 1), left via "Back to the Trail".
  ray.hit = CYCLIST;
  clickCanvas();
  expect(dialog.classList.contains('hidden')).toBe(false);
  expect(title.textContent).toBe('A Rider on the Trail');
  expect(dom.el('dialog-return-btn').classList.contains('hidden')).toBe(false);
  fire(dom.el('dialog-return-btn'), 'click'); // returnToGallery teleports home
  expect(dialog.classList.contains('hidden')).toBe(true);
  await jest.advanceTimersByTimeAsync(250);

  // A walker out for a stroll (no discovery, no return shortcut).
  ray.hit = WALKER;
  clickCanvas();
  expect(title.textContent).toBe('Out for a Walk');
  expect(dom.el('dialog-return-btn').classList.contains('hidden')).toBe(true);
  pressEscape();
  await jest.advanceTimersByTimeAsync(250);

  // A bench (discovery 2).
  ray.hit = prop('bench');
  clickCanvas();
  expect(title.textContent).toBe('Have a Seat');
  pressEscape();
  await jest.advanceTimersByTimeAsync(250);

  // The trailhead kiosk opens the notice-board close-up (discovery 3).
  ray.hit = prop('kiosk');
  clickCanvas();
  expect(dom.el('whiteboard-view').classList.contains('hidden')).toBe(false);
  expect(dom.el('whiteboard-caption').textContent).not.toBe('');
  stepFrames(3); // render is skipped while the board is up; must not throw
  pressEscape();
  expect(dom.el('whiteboard-view').classList.contains('hidden')).toBe(true);
  await jest.advanceTimersByTimeAsync(250);

  // The little waterfall (discovery 4) reports the no-WebAudio quiet path...
  ray.hit = prop('falls');
  clickCanvas();
  expect(title.textContent).toBe('The Little Waterfall');
  expect(message.textContent).toContain('quiet');
  pressEscape();

  // ...and closing the fourth discovery's dialog surfaces the contact nudge.
  await jest.advanceTimersByTimeAsync(250);
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(false);
  pressEscape();
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(true);
  await jest.advanceTimersByTimeAsync(250);

  // The sun and the moon, on the long sky ray.
  ray.hit = null;
  ray.sky = scene.getSun();
  clickCanvas();
  expect(title.textContent).toBe('The Sun');
  pressEscape();
  await jest.advanceTimersByTimeAsync(250);
  ray.sky = scene.getMoon();
  clickCanvas();
  expect(title.textContent).toBe('The Moon');
  pressEscape();
  await jest.advanceTimersByTimeAsync(250);

  // A gallery piece opens the piece modal with its link wired.
  ray.sky = null;
  ray.hit = PIECE;
  clickCanvas();
  expect(dom.el('piece-modal').classList.contains('hidden')).toBe(false);
  expect(dom.el('piece-title').textContent).toBe('The River Room');
  expect(dom.el('piece-enter').getAttribute('href')).toBe('/river/');
  pressEscape();
  expect(dom.el('piece-modal').classList.contains('hidden')).toBe(true);

  // A pointer lock the browser refuses drops the visitor back on the welcome
  // screen instead of leaving a hidden blocker.
  dom.el('game-canvas').requestPointerLock = () => Promise.reject(new Error('denied'));
  await jest.advanceTimersByTimeAsync(250);
  expect(dom.el('blocker').classList.contains('hidden')).toBe(false);
  expect(dom.replaced).toHaveLength(0);
});

test('a nudge left pending from a prior page surfaces after the welcome closes', async () => {
  sessionStorage.setItem('gallery-nudge-pending', '1');
  await bootDad();
  startDesktop();
  await jest.advanceTimersByTimeAsync(450);
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(false);
  expect(sessionStorage.getItem('dad-nudged')).toBe('1');
  pressEscape();
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(true);
});

test('completing every discovery celebrates once and the share button covers its fallbacks', async () => {
  const checklist = await import('../www/shared/js/checklist-1.0.0.min.js');
  await bootDad();
  startDesktop();

  // Open a dialog first so the celebration has to wait its turn.
  ray.hit = CYCLIST;
  clickCanvas();
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(false);

  for (const item of checklist.getChecklistItems()) checklist.markChecklistItem(item.id);
  await flushAsync();
  expect(dom.el('complete-modal').classList.contains('hidden')).toBe(true); // waiting

  // Closing the dialog lets the pending celebration surface.
  pressEscape();
  await jest.advanceTimersByTimeAsync(250);
  expect(dom.el('complete-modal').classList.contains('hidden')).toBe(false);
  expect(dom.el('checklist-btn').classList.contains('pulse')).toBe(true);
  expect(sessionStorage.getItem('dad-celebrated')).toBe('1');

  const shareBtn = dom.el('complete-share');

  // Native share sheet succeeds; a dismissal (AbortError) returns quietly.
  globalThis.navigator.share = jest.fn(async () => {});
  fire(shareBtn, 'click');
  await flushAsync();
  expect(globalThis.navigator.share).toHaveBeenCalledWith(
    expect.objectContaining({ url: 'http://localhost:8000/test/' }));
  globalThis.navigator.share = jest.fn(async () => {
    const e = new Error('dismissed');
    e.name = 'AbortError';
    throw e;
  });
  fire(shareBtn, 'click');
  await flushAsync();
  expect(shareBtn.textContent).toBe('');

  // Share: the clipboard path flashes a confirmation on the button.
  delete globalThis.navigator.share;
  globalThis.navigator.clipboard = { writeText: jest.fn(async () => {}) };
  fire(shareBtn, 'click');
  await flushAsync();
  expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:8000/test/');
  expect(shareBtn.textContent).toBe('Link copied ✓');
  expect(shareBtn.disabled).toBe(true);
  await jest.advanceTimersByTimeAsync(1900);
  expect(shareBtn.disabled).toBe(false);

  // Without a share sheet or clipboard the last resort is a mailto link.
  delete globalThis.navigator.clipboard;
  fire(shareBtn, 'click');
  await flushAsync();
  expect(dom.windowStub.location.href.startsWith('mailto:')).toBe(true);

  pressEscape();
  expect(dom.el('complete-modal').classList.contains('hidden')).toBe(true);
});

test('settings restore from sessionStorage and the panels open, sync, and close', async () => {
  sessionStorage.setItem('dad-settings', JSON.stringify({ walk: 8, look: 2 }));
  const controls = await import('../www/shared/js/controls-1.0.0.min.js');
  const main = await bootDad();

  // The stored walk speed was validated and applied.
  expect(controls.CONTROLS_CONFIG.moveSpeed).toBe(8);
  expect(dom.el('walk-speed-slider').value).toBe(8);
  expect(String(dom.el('walk-speed-value').textContent)).toBe('8');
  expect(dom.el('look-speed-value').textContent).toBe('2.0');

  // Dragging a slider applies live; the commit persists.
  const walkSlider = dom.el('walk-speed-slider');
  walkSlider.value = '3';
  fire(walkSlider, 'input');
  expect(controls.CONTROLS_CONFIG.moveSpeed).toBe(3);
  fire(walkSlider, 'change');
  const lookSlider = dom.el('look-speed-slider');
  lookSlider.value = '1.5';
  fire(lookSlider, 'input');
  expect(dom.el('look-speed-value').textContent).toBe('1.5');
  fire(lookSlider, 'change');
  const saved = JSON.parse(sessionStorage.getItem('dad-settings'));
  expect(saved.walk).toBe(3);
  expect(saved.look).toBe(1.5);

  // Settings panel: gear opens, visibility observer syncs aria, an outside
  // pointerdown closes.
  const settingsPanel = dom.el('settings-panel');
  fire(dom.el('settings-btn'), 'click');
  expect(settingsPanel.classList.contains('hidden')).toBe(false);
  mutate(settingsPanel);
  expect(dom.el('settings-btn').getAttribute('aria-expanded')).toBe('true');
  fire(dom.documentStub, 'pointerdown', { target: {} });
  expect(settingsPanel.classList.contains('hidden')).toBe(true);
  mutate(settingsPanel);
  expect(dom.el('settings-btn').getAttribute('aria-expanded')).toBe('false');

  // Escape also closes a reopened settings panel.
  fire(dom.el('settings-btn'), 'click');
  pressEscape();
  expect(settingsPanel.classList.contains('hidden')).toBe(true);

  // Nav menu: button toggles, skip link opens with focus, Escape closes.
  const navMenu = dom.el('nav-menu');
  fire(dom.el('menu-btn'), 'click');
  expect(navMenu.classList.contains('hidden')).toBe(false);
  mutate(navMenu); // arms the outside-close listener
  fire(dom.documentStub, 'pointerdown', { target: {} });
  expect(navMenu.classList.contains('hidden')).toBe(true);
  mutate(navMenu);
  fire(dom.documentStub.querySelector('.skip-link'), 'click');
  expect(navMenu.classList.contains('hidden')).toBe(false);
  pressEscape();
  expect(navMenu.classList.contains('hidden')).toBe(true);
  expect(dom.el('menu-btn').getAttribute('aria-expanded')).toBe('false');
  fire(dom.el('menu-btn'), 'click'); // open...
  fire(dom.el('menu-btn'), 'click'); // ...and the button also toggles closed
  expect(navMenu.classList.contains('hidden')).toBe(true);
  fire(dom.el('menu-btn'), 'click');
  fire(dom.el('nav-close'), 'click');
  expect(navMenu.classList.contains('hidden')).toBe(true);

  // Checklist dropdown: toggle open (closing the others), outside tap closes.
  const panel = dom.el('checklist');
  fire(dom.el('checklist-btn'), 'click');
  expect(panel.classList.contains('hidden')).toBe(false);
  expect(dom.el('checklist-btn').getAttribute('aria-expanded')).toBe('true');
  fire(dom.documentStub, 'pointerdown', { target: {} });
  expect(panel.classList.contains('hidden')).toBe(true);
  expect(dom.el('checklist-btn').getAttribute('aria-expanded')).toBe('false');

  // The tiny pure helpers exposed for tests.
  expect(main.__test__.readNumericSetting({ walk: 99 }, 'walk', 2, 14, 5)).toBe(5);
  expect(main.__test__.readNumericSetting({ walk: 4 }, 'walk', 2, 14, 5)).toBe(4);
  expect(main.__test__.pickLine(['a', 'b'], 3)).toBe('b');
  expect(main.__test__.pickLine([], 3)).toBe('');
});

test('mobile boot uses the touch flow: tap to explore, tap targets, joystick tuck', async () => {
  globalThis.navigator.maxTouchPoints = 5;
  // Corrupt stored settings fall back to the gentler mobile defaults.
  sessionStorage.setItem('dad-settings', '{not json');
  const main = await bootDad();
  expect(dom.el('look-speed-value').textContent).toBe('0.9');

  expect(main.getState().isMobile).toBe(true);
  expect(dom.documentStub.body.classList.contains('is-touch-device')).toBe(true);
  expect(dom.documentStub.querySelector('.click-prompt').textContent).toBe('Tap to explore');
  expect(dom.el('touch-controls').classList.contains('visible')).toBe(true);

  // The blocker's touchend starts play without pointer lock.
  fire(dom.el('blocker'), 'touchend');
  expect(main.getState().isPaused).toBe(false);
  expect(dom.el('hud').classList.contains('visible')).toBe(true);

  // A canvas tap on Dad opens the hello; closing resumes the mobile way.
  ray.hit = HOST;
  fire(dom.el('game-canvas'), 'touchend', { changedTouches: [{ clientX: 120, clientY: 200 }] });
  expect(dom.el('help-modal').classList.contains('hidden')).toBe(false);
  pressEscape();
  await jest.advanceTimersByTimeAsync(250);
  expect(main.getState().isPaused).toBe(false);
  expect(dom.documentStub.pointerLockElement).toBe(null);

  // The kiosk close-up takes its phone panning branch.
  ray.hit = prop('kiosk');
  fire(dom.el('tap-zone'), 'click', { clientX: 200, clientY: 240 });
  expect(dom.el('whiteboard-view').classList.contains('hidden')).toBe(false);
  pressEscape();
  await jest.advanceTimersByTimeAsync(250);

  // A miss path tap, and a windowed (unlocked) canvas click.
  ray.hit = null;
  fire(dom.el('tap-zone'), 'click', { clientX: 10, clientY: 10 });
  fire(dom.el('game-canvas'), 'click', { clientX: 30, clientY: 40 });

  // A quick tap on the tap zone routes through the controls tap callback.
  ray.hit = HOST;
  const tap = { identifier: 9, clientX: 150, clientY: 220 };
  fire(dom.el('tap-zone'), 'touchstart', { changedTouches: [tap], touches: [tap] });
  fire(dom.el('tap-zone'), 'touchend', { changedTouches: [tap], touches: [] });
  expect(dom.el('help-modal').classList.contains('hidden')).toBe(false);
  pressEscape();
  await jest.advanceTimersByTimeAsync(250);
  ray.hit = null;

  // Opening settings tucks the joysticks away; closing brings them back.
  const settingsPanel = dom.el('settings-panel');
  fire(dom.el('settings-btn'), 'click');
  mutate(settingsPanel);
  expect(dom.el('touch-controls').classList.contains('visible')).toBe(false);
  fire(dom.el('settings-btn'), 'click');
  mutate(settingsPanel);
  expect(dom.el('touch-controls').classList.contains('visible')).toBe(true);

  // Joystick input hands the autopilot back to the visitor. (The shared
  // controls module listens on the same zone, so give it a real touch.)
  fire(dom.documentStub, 'keydown', { code: 'KeyT' });
  const touch = { identifier: 1, clientX: 60, clientY: 500 };
  fire(dom.el('joystick-zone'), 'touchstart', { changedTouches: [touch], touches: [touch] });
  expect(dom.el('autopilot-btn').getAttribute('aria-pressed')).toBe('false');
  stepFrames(5); // walk a few frames on the joystick
  fire(dom.el('joystick-zone'), 'touchend', { changedTouches: [touch], touches: [] });

  stepFrames(30);
  expect(dom.replaced).toHaveLength(0);
});

test('falls back to the 2D site when WebGL is unavailable', async () => {
  delete dom.windowStub.WebGLRenderingContext;
  await import('../www/dad/js/main.js');
  await flushAsync();
  await jest.advanceTimersByTimeAsync(3000);
  expect(dom.replaced).toEqual(['/']);
});
