// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Boot-and-drive smoke for the Seed to Seed garden experience's main.js
 * conductor.
 *
 * Same recipe as gavin-main.test.mjs and interstate-main.test.mjs: install
 * THREE and the DOM stand-ins FIRST, then import main.js so it auto-boots
 * the way a real page load does. Local overrides on top of the shared stubs
 * (the shared helpers stay untouched):
 *
 * - THREE.Raycaster is replaced with a test-controlled one. intersectObjects
 *   answers from ray.hits so clicks land on the gardener, a garden guest,
 *   each outdoor prop kind, the chalkboard kiosk, and the services sign;
 *   intersectObject answers from a shift queue so the long sky ray can hit
 *   the sun or the moon on demand. Empty queues exercise the miss paths.
 * - MutationObserver does not exist under Node, so a recording stub stands
 *   in; tests invoke the captured callbacks to run the settings/nav panels'
 *   visibility side effects.
 * - Pointer lock is modeled for real: canvas.requestPointerLock sets
 *   document.pointerLockElement and fires pointerlockchange synchronously,
 *   exitPointerLock reverses it. That drives the welcome-screen dismissal,
 *   the one-shot autopilot auto-start, and the modal open/close resume loop.
 * - document.contains is provided so the focus-restore path in the modal
 *   close plumbing runs instead of throwing.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';

let dom;
let ray;       // test-controlled raycaster: ray.hits + ray.singleQueue
let observers; // captured MutationObserver instances

/** Wrap the installed THREE so main.js's raycasters answer from the queues. */
function installRaycasterOverride() {
  const base = globalThis.THREE;
  const control = { hits: [], singleQueue: [] };
  globalThis.THREE = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'Raycaster') {
        return function Raycaster() {
          this.setFromCamera = () => {};
          this.intersectObjects = () => control.hits.slice();
          this.intersectObject = () =>
            (control.singleQueue.length ? control.singleQueue.shift() : []);
        };
      }
      return base[prop];
    },
  });
  return control;
}

/** A minimal hit whose object carries the given userData at its root. */
function hit(userData) {
  return { object: { visible: true, parent: null, userData } };
}

/** Click the scene at a screen point (the windowed-cursor click path). */
function tap(canvas, x = 400, y = 300) {
  fire(canvas, 'click', { clientX: x, clientY: y, button: 0 });
}

/** Run every captured MutationObserver callback (class flips don't auto-fire). */
function runObservers() {
  observers.forEach((o) => o.cb([], o));
}

// Overlays that page markup ships hidden; the auto-vivified stubs start bare,
// so seed the class before import to keep closeActiveModal's ordering honest.
const START_HIDDEN = [
  'settings-panel', 'nav-menu', 'checklist', 'piece-modal', 'help-modal',
  'dialog-modal', 'whiteboard-view', 'complete-modal', 'nudge-modal',
];

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  installThree();
  dom = installDom();
  ray = installRaycasterOverride();

  observers = [];
  globalThis.MutationObserver = class {
    constructor(cb) { this.cb = cb; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() {}
  };

  START_HIDDEN.forEach((id) => dom.el(id).classList.add('hidden'));

  // Shared parts may arm audio on the first document click/keydown and
  // construct window.AudioContext; give it a bare stand-in.
  dom.windowStub.AudioContext = class { constructor() {} };

  // Pointer lock contract: request sets pointerLockElement and announces the
  // change synchronously (close enough for the state machine), exit reverses.
  dom.documentStub.contains = (el) => !!el;
  dom.documentStub.pointerLockElement = null;
  dom.documentStub.exitPointerLock = () => {
    dom.documentStub.pointerLockElement = null;
    fire(dom.documentStub, 'pointerlockchange');
  };
  const canvas = dom.el('game-canvas');
  canvas.requestPointerLock = () => {
    dom.documentStub.pointerLockElement = canvas;
    fire(dom.documentStub, 'pointerlockchange');
    return Promise.resolve();
  };
});

afterEach(() => {
  dom.uninstall();
  delete globalThis.MutationObserver;
  jest.useRealTimers();
});

async function bootGarden() {
  const main = await import('../www/seedtoseed/js/main.js');
  await flushAsync();                       // let the async init() settle
  await jest.advanceTimersByTimeAsync(500); // the 400ms loading-screen reveal
  return main;
}

/** Dismiss the welcome screen the desktop way (blocker click -> pointer lock). */
function enterWorld() {
  fire(dom.el('blocker'), 'click');
}

/** Step the captured animation loop n frames, 16ms apart. */
function stepFrames(n) {
  for (let i = 0; i < n; i++) {
    jest.advanceTimersByTime(16);
    dom.loops[0]();
  }
}

/** Close the open modal with Escape and let the 200ms resume re-lock. */
async function escapeAndResume() {
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  await jest.advanceTimersByTimeAsync(250);
}

test('auto-boots through the loading screen and wires the site links', async () => {
  const main = await bootGarden();
  const { SEED_CONFIG } = await import('../www/seedtoseed/js/config.min.js');

  const state = main.getState();
  expect(state.isRunning).toBe(true);
  expect(state.isLoaded).toBe(true);
  expect(state.isMobile).toBe(false);
  expect(state.isPaused).toBe(true); // welcome screen still up

  expect(dom.el('load-progress').style.width).toBe('100%');
  expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);

  // Home, business, services, and builder links come from SEED_CONFIG.site.
  expect(dom.el('home-btn').href).toBe(SEED_CONFIG.site.home.path);
  expect(dom.el('biz-btn').href).toBe(SEED_CONFIG.site.business.websiteUrl);
  expect(dom.el('hello-services').href).toBe(SEED_CONFIG.site.business.servicesUrl);
  expect(dom.el('complete-contact').href).toBe(SEED_CONFIG.site.builder.contactPath);

  // The animate loop was captured; a few simulated seconds must not throw.
  expect(dom.loops.length).toBeGreaterThanOrEqual(1);
  stepFrames(120);

  // No 2D fallback redirect happened.
  expect(dom.replaced).toHaveLength(0);
});

test('welcome dismissal starts the tour once; inputs hand back control', async () => {
  const main = await bootGarden();
  const autopilot = await import('../www/shared/js/autopilot-1.0.0.min.js');

  // Stepping through the welcome screen locks the pointer and auto-starts
  // the tour (one-shot).
  enterWorld();
  expect(main.getState().isPaused).toBe(false);
  expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
  expect(dom.el('hud').classList.contains('visible')).toBe(true);
  expect(autopilot.isAutopilotEnabled()).toBe(true);
  expect(dom.el('autopilot-btn').attributes['aria-pressed']).toBe('true');
  expect(dom.el('touch-controls').classList.contains('autopilot-live')).toBe(true);

  // The tour actually drives frames without throwing.
  stepFrames(60);

  // A tiny mouse nudge is forgiven; a deliberate sweep takes the wheel back.
  fire(dom.documentStub, 'mousemove', { movementX: 2, movementY: 0, timeStamp: 1000 });
  expect(autopilot.isAutopilotEnabled()).toBe(true);
  fire(dom.documentStub, 'mousemove', { movementX: 500, movementY: 60, timeStamp: 1016 });
  expect(autopilot.isAutopilotEnabled()).toBe(false);
  expect(dom.el('autopilot-btn').attributes['aria-pressed']).toBe('false');

  // T re-engages, a movement key disengages, the tour button re-engages.
  fire(dom.documentStub, 'keydown', { code: 'KeyT' });
  expect(autopilot.isAutopilotEnabled()).toBe(true);
  fire(dom.documentStub, 'keydown', { code: 'ArrowUp' });
  fire(dom.documentStub, 'keyup', { code: 'ArrowUp' });
  expect(autopilot.isAutopilotEnabled()).toBe(false);
  fire(dom.el('autopilot-btn'), 'click');
  expect(autopilot.isAutopilotEnabled()).toBe(true);
  stepFrames(30);

  // Escape back to the welcome screen is a clear stop: paused, blocker up,
  // tour ended.
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(main.getState().isPaused).toBe(true);
  expect(dom.el('blocker').classList.contains('hidden')).toBe(false);
  expect(autopilot.isAutopilotEnabled()).toBe(false);

  // Re-entering does NOT re-enroll in the tour (the auto-start is one-shot).
  enterWorld();
  expect(main.getState().isPaused).toBe(false);
  expect(autopilot.isAutopilotEnabled()).toBe(false);
});

test('settings, nav, and checklist panels open, adjust, and close', async () => {
  await bootGarden();
  const settingsBtn = dom.el('settings-btn');
  const settingsPanel = dom.el('settings-panel');

  // Gear opens the panel; the visibility observer syncs aria and installs
  // the outside-tap closer.
  fire(settingsBtn, 'click');
  expect(settingsPanel.classList.contains('hidden')).toBe(false);
  runObservers();
  expect(settingsBtn.attributes['aria-expanded']).toBe('true');

  // Sliders update live and persist on commit.
  fire(dom.el('walk-speed-slider'), 'input', { target: { value: '7' } });
  expect(dom.el('walk-speed-value').textContent).toBe(7);
  fire(dom.el('walk-speed-slider'), 'change', { target: { value: '7' } });
  fire(dom.el('look-speed-slider'), 'input', { target: { value: '1.5' } });
  expect(dom.el('look-speed-value').textContent).toBe('1.5');
  fire(dom.el('look-speed-slider'), 'change', { target: { value: '1.5' } });
  const saved = JSON.parse(sessionStorage.getItem('seedtoseed-settings'));
  expect(saved).toEqual({ walk: 7, look: 1.5 });

  // An outside press closes the panel.
  fire(dom.documentStub, 'pointerdown', { target: dom.el('hud') });
  expect(settingsPanel.classList.contains('hidden')).toBe(true);
  runObservers();
  expect(settingsBtn.attributes['aria-expanded']).toBe('false');

  // The close button works too.
  fire(settingsBtn, 'click');
  fire(dom.el('settings-close'), 'click');
  expect(settingsPanel.classList.contains('hidden')).toBe(true);
  expect(settingsBtn.focused).toBe(true);

  // Escape closes an open settings panel before anything else.
  fire(settingsBtn, 'click');
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(settingsPanel.classList.contains('hidden')).toBe(true);

  // Nav menu: button toggles, outside press closes, skip link opens with focus.
  const menuBtn = dom.el('menu-btn');
  const navMenu = dom.el('nav-menu');
  fire(menuBtn, 'click');
  expect(navMenu.classList.contains('hidden')).toBe(false);
  expect(menuBtn.attributes['aria-expanded']).toBe('true');
  runObservers(); // arms the outside-press closer
  fire(dom.documentStub, 'pointerdown', { target: dom.el('hud') });
  expect(navMenu.classList.contains('hidden')).toBe(true);
  runObservers(); // disarms it

  fire(dom.documentStub.querySelector('.skip-link'), 'click');
  expect(navMenu.classList.contains('hidden')).toBe(false);
  expect(navMenu.querySelector('a, button').focused).toBe(true);
  fire(dom.el('nav-close'), 'click');
  expect(navMenu.classList.contains('hidden')).toBe(true);
  expect(menuBtn.focused).toBe(true);

  // Escape closes an open nav menu.
  fire(menuBtn, 'click');
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(navMenu.classList.contains('hidden')).toBe(true);

  // Discovery checklist dropdown: toggle open, outside press closes.
  const clBtn = dom.el('checklist-btn');
  const clPanel = dom.el('checklist');
  fire(clBtn, 'click');
  expect(clPanel.classList.contains('hidden')).toBe(false);
  expect(clBtn.attributes['aria-expanded']).toBe('true');
  fire(dom.documentStub, 'pointerdown', { target: dom.el('hud') });
  expect(clPanel.classList.contains('hidden')).toBe(true);
  expect(clBtn.attributes['aria-expanded']).toBe('false');
});

test('garden interactions: hover labels, guests, props, and the sky', async () => {
  const main = await bootGarden();
  // Keep the partway nudge quiet: this test racks up several discoveries.
  sessionStorage.setItem('seedtoseed-nudged', '1');
  const checklist = await import('../www/shared/js/checklist-1.0.0.min.js');
  const { SEED_CONFIG } = await import('../www/seedtoseed/js/config.min.js');
  const canvas = dom.el('game-canvas');
  enterWorld();

  // Hover the gardener, then a strolling guest, then clear.
  ray.hits = [hit({ isShopkeeper: true })];
  stepFrames(10);
  expect(dom.el('look-label').classList.contains('visible')).toBe(true);
  expect(dom.el('look-label').textContent).toContain('Say hello?');
  expect(dom.el('hud').classList.contains('targeting')).toBe(true);
  ray.hits = [hit({ isCustomer: true })];
  stepFrames(10);
  expect(dom.el('look-label').textContent).toContain('chat with a visitor');
  ray.hits = [];
  stepFrames(10);
  expect(dom.el('look-label').classList.contains('visible')).toBe(false);
  expect(dom.el('hud').classList.contains('targeting')).toBe(false);

  // Click the gardener: the hello dialog opens and ticks its discovery.
  ray.hits = [hit({ isShopkeeper: true })];
  tap(canvas);
  expect(dom.el('help-modal').classList.contains('hidden')).toBe(false);
  expect(main.getState()._modalOpen).toBe(true);
  // While a modal is up, further clicks are ignored.
  tap(canvas);
  await escapeAndResume();
  expect(main.getState()._modalOpen).toBe(false);
  expect(main.getState().isPaused).toBe(false); // resume re-locked the pointer

  // Chat with a garden guest.
  ray.hits = [hit({ isCustomer: true })];
  tap(canvas);
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(false);
  expect(dom.el('dialog-title').textContent).toBe('A Garden Guest');
  expect(dom.el('dialog-message').textContent.length).toBeGreaterThan(0);
  expect(dom.el('dialog-return-btn').classList.contains('hidden')).toBe(true);
  await escapeAndResume();

  // Outdoor props show their titles; discovery props tick the checklist, and
  // the far-corner shortcut teleports home and closes the card.
  const propCases = [
    ['planter', 'A Raised Bed'],
    ['pumpkin', 'The Pumpkin Patch'],
    ['compost', 'The Compost Bins'],
    ['corn', 'The Corn Block'],
  ];
  for (const [kind, title] of propCases) {
    ray.hits = [hit({ isProp: true, propKind: kind })];
    tap(canvas);
    expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(false);
    expect(dom.el('dialog-title').textContent).toBe(title);
    expect(dom.el('dialog-return-btn').classList.contains('hidden')).toBe(false);
    await escapeAndResume();
  }

  // A second click on the same prop kind rotates to its other line.
  ray.hits = [hit({ isProp: true, propKind: 'corn' })];
  tap(canvas);
  const cornLine = dom.el('dialog-message').textContent;
  fire(dom.el('dialog-return-btn'), 'click'); // returnToGallery shortcut
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(true);
  await jest.advanceTimersByTimeAsync(250);
  expect(typeof cornLine).toBe('string');

  // An unknown prop kind is politely ignored.
  ray.hits = [hit({ isProp: true, propKind: 'gnome' })];
  tap(canvas);
  expect(main.getState()._modalOpen).toBe(false);

  // The chalkboard kiosk opens the notice-board close-up.
  ray.hits = [hit({ isProp: true, propKind: 'kiosk' })];
  tap(canvas);
  expect(dom.el('whiteboard-view').classList.contains('hidden')).toBe(false);
  expect(dom.el('whiteboard-canvas').width).toBe(800);
  expect(dom.el('whiteboard-caption').textContent.length).toBeGreaterThan(0);
  await escapeAndResume();

  // The services sign opens the outbound services card in piece-card form.
  ray.hits = [hit({ isProp: true, propKind: 'services' })];
  tap(canvas);
  expect(dom.el('piece-modal').classList.contains('hidden')).toBe(false);
  expect(dom.el('piece-title').textContent).toBe('Seed to Seed Services');
  expect(dom.el('piece-enter').href).toBe(SEED_CONFIG.site.business.servicesUrl);
  expect(dom.el('piece-enter').attributes.target).toBe('_blank');
  expect(dom.el('piece-enter').attributes.rel).toBe('noopener');
  expect(dom.el('piece-enter').textContent).toBe('See the services →');
  await escapeAndResume();

  // A regular (internal) gallery piece uses the same-tab wording.
  ray.hits = [hit({
    isGalleryPiece: true, galleryId: 'g1', galleryTitle: 'Test Piece',
    gallerySubtitle: 'A test', galleryUrl: '/test-piece/',
  })];
  tap(canvas);
  expect(dom.el('piece-enter').href).toBe('/test-piece/');
  expect(dom.el('piece-enter').textContent).toBe('Enter Test Piece →');
  expect(dom.el('piece-enter').attributes.target).toBeUndefined();
  await escapeAndResume();

  // The sun and the moon answer on the long sky ray.
  ray.hits = [];
  ray.singleQueue = [[{ object: {} }]]; // sun answers first
  tap(canvas);
  expect(dom.el('dialog-title').textContent).toBe('The Sun');
  await escapeAndResume();
  ray.singleQueue = [[], [{ object: {} }]]; // sun misses, moon answers
  tap(canvas);
  expect(dom.el('dialog-title').textContent).toBe('The Moon');
  await escapeAndResume();

  const done = checklist.getChecklistItems().filter((i) => i.done).map((i) => i.id).sort();
  expect(done).toEqual(['compost', 'hello', 'kiosk', 'planter', 'pumpkin', 'services', 'sky']);

  // Misses walk the tolerance rings and give up, on all three tap paths.
  ray.hits = [];
  tap(canvas);
  fire(dom.el('tap-zone'), 'click', { clientX: 120, clientY: 90 });
  fire(canvas, 'touchend', { changedTouches: [{ clientX: 10, clientY: 10 }] });
  expect(main.getState()._modalOpen).toBe(false);
  stepFrames(10);
});

test('partway nudge waits for a quiet moment; completion celebrates and shares', async () => {
  const main = await bootGarden();
  const checklist = await import('../www/shared/js/checklist-1.0.0.min.js');
  const { SEED_CONFIG } = await import('../www/seedtoseed/js/config.min.js');
  const ids = SEED_CONFIG.checklist.items.map((i) => i.id);
  enterWorld();

  // Four discoveries queue the low-key nudge (never mid-play)…
  ids.slice(0, 4).forEach((id) => checklist.markChecklistItem(id));
  expect(sessionStorage.getItem('gallery-nudge-pending')).toBe('1');
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(true);
  // …and a fresh tick pulses the checklist button while its panel is closed.
  expect(dom.el('checklist-btn').classList.contains('pulse')).toBe(true);

  // Leaving to the welcome screen and stepping back in surfaces the nudge
  // after the 400ms settle.
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  enterWorld();
  await jest.advanceTimersByTimeAsync(450);
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(false);
  expect(sessionStorage.getItem('seedtoseed-nudged')).toBe('1');

  // Completing every discovery while the nudge is still up defers the
  // celebration until that modal closes (no stacking).
  ids.forEach((id) => checklist.markChecklistItem(id));
  expect(checklist.getChecklistProgress().complete).toBe(true);
  expect(dom.el('complete-modal').classList.contains('hidden')).toBe(true);
  fire(dom.documentStub, 'keydown', { code: 'Escape' }); // close the nudge
  await jest.advanceTimersByTimeAsync(250);              // resume surfaces it
  expect(dom.el('complete-modal').classList.contains('hidden')).toBe(false);
  expect(main.getState()._modalOpen).toBe(true);

  // Share: the native sheet when available, respecting a dismissal…
  const shareBtn = dom.el('complete-share');
  navigator.share = jest.fn(async () => {});
  fire(shareBtn, 'click');
  await flushAsync();
  expect(navigator.share).toHaveBeenCalled();
  navigator.share = async () => { const e = new Error('nope'); e.name = 'AbortError'; throw e; };
  fire(shareBtn, 'click');
  await flushAsync();

  // …the clipboard next, with the button flashing its confirmation…
  delete navigator.share;
  navigator.clipboard = { writeText: jest.fn(async () => {}) };
  shareBtn.textContent = 'Share this';
  fire(shareBtn, 'click');
  await flushAsync();
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:8000/test/');
  expect(shareBtn.textContent).toBe('Link copied ✓');
  expect(shareBtn.disabled).toBe(true);
  await jest.advanceTimersByTimeAsync(1900);
  expect(shareBtn.textContent).toBe('Share this');
  expect(shareBtn.disabled).toBe(false);

  // …and a mailto as the last resort.
  delete navigator.clipboard;
  fire(shareBtn, 'click');
  await flushAsync();
  expect(dom.windowStub.location.href.startsWith('mailto:')).toBe(true);

  await escapeAndResume();
  expect(dom.el('complete-modal').classList.contains('hidden')).toBe(true);
});

test('survives resize, gestures, visibility loss, and page hide', async () => {
  const main = await bootGarden();
  enterWorld();
  stepFrames(30);

  dom.windowStub.innerWidth = 390;
  dom.windowStub.innerHeight = 844;
  fire(dom.windowStub, 'resize');
  fire(dom.documentStub, 'gesturestart');
  fire(dom.documentStub, 'gesturechange');
  fire(dom.documentStub, 'gestureend');
  stepFrames(10);

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

test('touch devices get the tap-to-explore flow and joystick takeover', async () => {
  navigator.maxTouchPoints = 5; // makes isTouchDevice() true before import
  const main = await bootGarden();
  const autopilot = await import('../www/shared/js/autopilot-1.0.0.min.js');

  expect(main.getState().isMobile).toBe(true);
  expect(dom.el('touch-controls').classList.contains('visible')).toBe(true);
  expect(dom.documentStub.querySelector('.click-prompt').textContent).toBe('Tap to explore');
  expect(dom.documentStub.body.classList.contains('is-touch-device')).toBe(true);

  // Tapping the welcome screen starts play (no pointer lock on touch) and
  // the tour auto-starts.
  fire(dom.el('blocker'), 'click');
  expect(main.getState().isPaused).toBe(false);
  expect(autopilot.isAutopilotEnabled()).toBe(true);
  stepFrames(30);

  // A thumb landing on a joystick zone takes the controls back.
  fire(dom.el('look-joystick-zone'), 'touchstart', {
    touches: [{ clientX: 320, clientY: 700, identifier: 1 }],
    changedTouches: [{ clientX: 320, clientY: 700, identifier: 1 }],
  });
  expect(autopilot.isAutopilotEnabled()).toBe(false);

  // A canvas tap opens the hello dialog via the touch path, and the mobile
  // resume brings the joysticks back after closing.
  ray.hits = [hit({ isShopkeeper: true })];
  fire(dom.el('game-canvas'), 'touchend', { changedTouches: [{ clientX: 200, clientY: 150 }] });
  expect(dom.el('help-modal').classList.contains('hidden')).toBe(false);
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  await jest.advanceTimersByTimeAsync(250);
  expect(main.getState().isPaused).toBe(false);
  expect(dom.el('touch-controls').classList.contains('visible')).toBe(true);

  // A second welcome tap while already playing is a quiet no-op.
  fire(dom.el('blocker'), 'touchend', {});
});

test('falls back to the 2D site when WebGL is unavailable', async () => {
  // Break WebGL before import: boot() must route to the fallback.
  delete dom.windowStub.WebGLRenderingContext;
  await import('../www/seedtoseed/js/main.js');
  await flushAsync();
  await jest.advanceTimersByTimeAsync(3000);
  expect(dom.replaced).toEqual(['/']);
});

describe('the pure helpers on the __test__ seam', () => {
  let main;
  beforeEach(async () => { main = await bootGarden(); });

  test('readNumericSetting guards range and type', () => {
    const { readNumericSetting } = main.__test__;
    expect(readNumericSetting({ look: 2 }, 'look', 0.5, 4, 1)).toBe(2);
    expect(readNumericSetting({ look: 40 }, 'look', 0.5, 4, 1)).toBe(1);
    expect(readNumericSetting({ look: 'high' }, 'look', 0.5, 4, 1)).toBe(1);
    expect(readNumericSetting({}, 'look', 0.5, 4, 1)).toBe(1);
  });

  test('pickLine cycles deterministically and survives empty lists', () => {
    const { pickLine } = main.__test__;
    expect(pickLine(['a', 'b', 'c'], 4)).toBe('b');
    expect(pickLine(['a'], 12)).toBe('a');
    expect(pickLine([], 3)).toBe('');
    expect(pickLine(null, 3)).toBe('');
  });

  test('bufToHex renders bytes as lowercase hex', () => {
    expect(main.__test__.bufToHex(new Uint8Array([0, 15, 255]).buffer)).toBe('000fff');
  });
});
