// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Boot-and-drive smoke for the pirate mini golf experience's main.js
 * orchestrator (the family's course on Coastal Highway).
 *
 * Same recipe as dad-main.test.mjs: install THREE and the DOM stand-ins,
 * import main.js so it auto-boots, then drive the wiring end to end. The
 * three local seams (pointer lock on the canvas, a controllable
 * THREE.Raycaster, a recording MutationObserver) let the suite aim clicks at
 * each family member, a passerby, the background pair, every special prop
 * (scoreboard close-up, ticket booth welcome, conch shell), the sun and
 * moon, and a gallery piece, and pump the panel visibility observers by
 * hand. Assertions stay loose (classList flips, no-throw frame stepping,
 * dom.replaced empty): deep scene checks live in family-init.test.mjs.
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

async function bootFamily() {
  const main = await import('../www/family/js/main.js');
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
const golfer = (golferKey) => ({ userData: { isGolfer: true, golferKey }, parent: null });
const PASSERBY = { userData: { isPedestrian: true }, parent: null };
const BG_GOLFER = { userData: { isBgGolfer: true }, parent: null };
const prop = (propKind) => ({ userData: { isProp: true, propKind }, parent: null });
const PIECE = {
  userData: {
    isGalleryPiece: true, galleryId: 'g1', galleryTitle: 'The Lagoon Room',
    gallerySubtitle: 'A quiet study', galleryUrl: '/lagoon/',
  },
  parent: null,
};

test('auto-boots through the loading screen and survives a session teardown', async () => {
  const main = await bootFamily();

  const state = main.getState();
  expect(state.isRunning).toBe(true);
  expect(state.isLoaded).toBe(true);
  expect(state.isMobile).toBe(false);

  expect(dom.el('load-progress').style.width).toBe('100%');
  expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);
  expect(dom.loops.length).toBeGreaterThanOrEqual(1);

  // A few simulated seconds (also crosses the 0.5s deck/plank zone throttle).
  stepFrames(120);

  // Rotate to portrait and pinch (the iOS gesture blockers).
  dom.windowStub.innerWidth = 390;
  dom.windowStub.innerHeight = 844;
  fire(dom.windowStub, 'resize');
  fire(dom.documentStub, 'gesturestart');

  // Start play, run a bit, then tear the session down twice (idempotent).
  startDesktop();
  expect(main.getState().isPaused).toBe(false);
  stepFrames(40);
  dom.documentStub.visibilityState = 'hidden';
  fire(dom.documentStub, 'visibilitychange');
  fire(dom.windowStub, 'pagehide');
  fire(dom.windowStub, 'pagehide');
  expect(main.getState().isRunning).toBe(false);
  dom.loops[0](); // the animate loop is now a guarded no-op

  expect(dom.replaced).toHaveLength(0);
});

test('pointer lock starts play, the crosshair hover cycles targets, and Escape pauses', async () => {
  const main = await bootFamily();
  const canvas = dom.el('game-canvas');

  startDesktop();
  expect(dom.documentStub.pointerLockElement).toBe(canvas);
  expect(main.getState().isPaused).toBe(false);
  expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
  expect(dom.el('hud').classList.contains('visible')).toBe(true);

  // Hover young Steve, then Mom (each family member gets a name).
  ray.hit = golfer('steve');
  stepFrames(10);
  expect(dom.el('look-label').textContent).toContain('say hi to young Steve');
  expect(dom.el('hud').classList.contains('targeting')).toBe(true);
  ray.hit = golfer('mom');
  stepFrames(10);
  expect(dom.el('look-label').textContent).toContain('say hi to Mom');

  // Hover a passerby, one of the background pair, then nothing.
  ray.hit = PASSERBY;
  stepFrames(10);
  expect(dom.el('look-label').textContent).toContain('greet the passerby');
  ray.hit = BG_GOLFER;
  stepFrames(10);
  expect(dom.el('look-label').textContent).toContain('say hi');
  ray.hit = null;
  stepFrames(10);
  expect(dom.el('look-label').classList.contains('visible')).toBe(false);
  expect(dom.el('hud').classList.contains('targeting')).toBe(false);

  // Click Mom: the dialog opens, pointer lock releases, play pauses.
  ray.hit = golfer('mom');
  clickCanvas();
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(false);
  expect(dom.el('dialog-title').textContent).toBe('Mom');
  expect(dom.el('dialog-message').textContent).not.toBe('');
  expect(main.getState().isPaused).toBe(true);

  // Escape closes it and the 200ms resume re-locks the pointer.
  pressEscape();
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(true);
  await jest.advanceTimersByTimeAsync(250);
  expect(main.getState().isPaused).toBe(false);

  // T toggles the autopilot tour; any movement key hands controls back.
  fire(dom.documentStub, 'keydown', { code: 'KeyT' });
  expect(dom.el('autopilot-btn').getAttribute('aria-pressed')).toBe('true');
  stepFrames(10);
  fire(dom.documentStub, 'keydown', { code: 'ArrowUp' });
  expect(dom.el('autopilot-btn').getAttribute('aria-pressed')).toBe('false');
  fire(dom.documentStub, 'keyup', { code: 'ArrowUp' });

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
  await bootFamily();
  startDesktop();

  const dialog = dom.el('dialog-modal');
  const title = dom.el('dialog-title');
  const message = dom.el('dialog-message');

  // Young Steve (discovery 1: tee), left via "Back to the First Tee".
  ray.hit = golfer('steve');
  clickCanvas();
  expect(dialog.classList.contains('hidden')).toBe(false);
  expect(title.textContent).toBe('Young Steve');
  expect(dom.el('dialog-return-btn').classList.contains('hidden')).toBe(false);
  fire(dom.el('dialog-return-btn'), 'click'); // returnToGallery teleports home
  expect(dialog.classList.contains('hidden')).toBe(true);
  await jest.advanceTimersByTimeAsync(250);

  // Dad (the fallback golfer name), closed the ordinary way.
  ray.hit = golfer('dad');
  clickCanvas();
  expect(title.textContent).toBe('Dad');
  pressEscape();
  await jest.advanceTimersByTimeAsync(250);

  // A sidewalk passerby (no discovery, no return shortcut).
  ray.hit = PASSERBY;
  clickCanvas();
  expect(title.textContent).toBe('Out on the Sidewalk');
  expect(dom.el('dialog-return-btn').classList.contains('hidden')).toBe(true);
  pressEscape();
  await jest.advanceTimersByTimeAsync(250);

  // The pair on the far hole.
  ray.hit = BG_GOLFER;
  clickCanvas();
  expect(title.textContent).toBe('On the Eighth Hole');
  pressEscape();
  await jest.advanceTimersByTimeAsync(250);

  // A cannon (discovery 2).
  ray.hit = prop('cannon');
  clickCanvas();
  expect(title.textContent).toBe('The Cannon');
  pressEscape();
  await jest.advanceTimersByTimeAsync(250);

  // The treasure chest (discovery 3).
  ray.hit = prop('treasure');
  clickCanvas();
  expect(title.textContent).toBe('The Treasure Chest');
  pressEscape();
  await jest.advanceTimersByTimeAsync(250);

  // The conch shell (discovery 4) reports the no-WebAudio quiet path...
  ray.hit = prop('conch');
  clickCanvas();
  expect(title.textContent).toBe('The Conch Shell');
  expect(message.textContent).toContain('set the shell down');
  pressEscape();

  // ...and closing the fourth discovery's dialog surfaces the contact nudge.
  await jest.advanceTimersByTimeAsync(250);
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(false);
  pressEscape();
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(true);
  await jest.advanceTimersByTimeAsync(250);

  // The scoreboard opens the scorecard close-up.
  ray.hit = prop('scoreboard');
  clickCanvas();
  expect(dom.el('whiteboard-view').classList.contains('hidden')).toBe(false);
  expect(dom.el('whiteboard-caption').textContent).not.toBe('');
  stepFrames(3); // render is skipped while the board is up; must not throw
  pressEscape();
  expect(dom.el('whiteboard-view').classList.contains('hidden')).toBe(true);
  await jest.advanceTimersByTimeAsync(250);

  // The ticket booth routes to the welcome dialog.
  ray.hit = prop('booth');
  clickCanvas();
  expect(dom.el('help-modal').classList.contains('hidden')).toBe(false);
  pressEscape();
  expect(dom.el('help-modal').classList.contains('hidden')).toBe(true);
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
  expect(dom.el('piece-title').textContent).toBe('The Lagoon Room');
  expect(dom.el('piece-enter').getAttribute('href')).toBe('/lagoon/');
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
  await bootFamily();
  startDesktop();
  await jest.advanceTimersByTimeAsync(450);
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(false);
  expect(sessionStorage.getItem('family-nudged')).toBe('1');
  pressEscape();
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(true);
});

test('completing every discovery celebrates once and share covers every fallback', async () => {
  const checklist = await import('../www/shared/js/checklist-1.0.0.min.js');
  await bootFamily();
  startDesktop();

  // Open a dialog first so the celebration has to wait its turn.
  ray.hit = golfer('mom');
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
  expect(sessionStorage.getItem('family-celebrated')).toBe('1');

  const shareBtn = dom.el('complete-share');

  // Native share sheet succeeds.
  globalThis.navigator.share = jest.fn(async () => {});
  fire(shareBtn, 'click');
  await flushAsync();
  expect(globalThis.navigator.share).toHaveBeenCalledWith(
    expect.objectContaining({ url: 'http://localhost:8000/test/' }));

  // The visitor dismisses the sheet (AbortError): quiet return.
  globalThis.navigator.share = jest.fn(async () => {
    const e = new Error('dismissed');
    e.name = 'AbortError';
    throw e;
  });
  fire(shareBtn, 'click');
  await flushAsync();
  expect(shareBtn.textContent).toBe('');

  // No share sheet, clipboard works: the button flashes a confirmation.
  delete globalThis.navigator.share;
  globalThis.navigator.clipboard = { writeText: jest.fn(async () => {}) };
  fire(shareBtn, 'click');
  await flushAsync();
  expect(shareBtn.textContent).toBe('Link copied ✓');
  expect(shareBtn.disabled).toBe(true);
  await jest.advanceTimersByTimeAsync(1900);
  expect(shareBtn.disabled).toBe(false);

  // No clipboard either: the last resort is a mailto link.
  delete globalThis.navigator.clipboard;
  fire(shareBtn, 'click');
  await flushAsync();
  expect(dom.windowStub.location.href.startsWith('mailto:')).toBe(true);

  pressEscape();
  expect(dom.el('complete-modal').classList.contains('hidden')).toBe(true);
});

test('settings restore from sessionStorage and the panels open, sync, and close', async () => {
  sessionStorage.setItem('family-settings', JSON.stringify({ walk: 8, look: 2 }));
  const controls = await import('../www/shared/js/controls-1.0.0.min.js');
  const main = await bootFamily();

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
  const saved = JSON.parse(sessionStorage.getItem('family-settings'));
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
  sessionStorage.setItem('family-settings', '{not json');
  const main = await bootFamily();
  expect(dom.el('look-speed-value').textContent).toBe('0.9');

  expect(main.getState().isMobile).toBe(true);
  expect(dom.documentStub.body.classList.contains('is-touch-device')).toBe(true);
  expect(dom.documentStub.querySelector('.click-prompt').textContent).toBe('Tap to explore');
  expect(dom.el('touch-controls').classList.contains('visible')).toBe(true);

  // The blocker's touchend starts play without pointer lock.
  fire(dom.el('blocker'), 'touchend');
  expect(main.getState().isPaused).toBe(false);
  expect(dom.el('hud').classList.contains('visible')).toBe(true);

  // A canvas tap on Mom opens the dialog; closing resumes the mobile way.
  ray.hit = golfer('mom');
  fire(dom.el('game-canvas'), 'touchend', { changedTouches: [{ clientX: 120, clientY: 200 }] });
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(false);
  pressEscape();
  await jest.advanceTimersByTimeAsync(250);
  expect(main.getState().isPaused).toBe(false);
  expect(dom.documentStub.pointerLockElement).toBe(null);

  // The scorecard close-up takes its phone panning branch.
  ray.hit = prop('scoreboard');
  fire(dom.el('tap-zone'), 'click', { clientX: 200, clientY: 240 });
  expect(dom.el('whiteboard-view').classList.contains('hidden')).toBe(false);
  pressEscape();
  await jest.advanceTimersByTimeAsync(250);

  // A miss path tap, and a windowed (unlocked) canvas click.
  ray.hit = null;
  fire(dom.el('tap-zone'), 'click', { clientX: 10, clientY: 10 });
  fire(dom.el('game-canvas'), 'click', { clientX: 30, clientY: 40 });

  // A quick tap on the tap zone routes through the controls tap callback.
  ray.hit = PASSERBY;
  const tap = { identifier: 9, clientX: 150, clientY: 220 };
  fire(dom.el('tap-zone'), 'touchstart', { changedTouches: [tap], touches: [tap] });
  fire(dom.el('tap-zone'), 'touchend', { changedTouches: [tap], touches: [] });
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(false);
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
  fire(dom.el('look-joystick-zone'), 'touchstart', { changedTouches: [touch], touches: [touch] });
  expect(dom.el('autopilot-btn').getAttribute('aria-pressed')).toBe('false');
  stepFrames(5); // look around a few frames on the joystick
  fire(dom.el('look-joystick-zone'), 'touchend', { changedTouches: [touch], touches: [] });

  stepFrames(30);
  expect(dom.replaced).toHaveLength(0);
});

test('falls back to the 2D site when WebGL is unavailable', async () => {
  delete dom.windowStub.WebGLRenderingContext;
  await import('../www/family/js/main.js');
  await flushAsync();
  await jest.advanceTimersByTimeAsync(3000);
  expect(dom.replaced).toEqual(['/']);
});
