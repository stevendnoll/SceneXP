// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Boot-and-drive smoke for the Interstate Tire experience's main.js conductor.
 *
 * Same recipe as gavin-main.test.mjs and jamar-main.test.mjs: install THREE
 * and the DOM stand-ins FIRST, then import main.js so it auto-boots the way
 * a real page load does. On top of the shared stubs this suite adds local
 * overrides (the shared helpers stay untouched):
 *
 * - THREE.Raycaster is replaced with a test-controlled one whose
 *   intersectObjects answers from a queue the test fills, so clicks land on
 *   the light switch, the host, a waiting customer, each scenery kind, and
 *   a gallery piece. With the queue empty, clicks walk the tolerance rings
 *   and miss. (The player camera reads as standing inside the shop under
 *   the chainable stubs, so the interior interaction set is what's in play.)
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
let ray;       // test-controlled raycaster: ray.hits feeds intersectObjects
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
  'dialog-modal', 'monitor-view', 'whiteboard-view', 'complete-modal',
  'card-modal', 'nudge-modal', 'light-panel',
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

  // The shared doors part arms its audio on the first document click or
  // keydown and constructs window.AudioContext; give it a bare stand-in.
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

async function bootShop() {
  const main = await import('../www/interstate/js/main.js');
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
  const main = await bootShop();
  const { INTERSTATE_CONFIG } = await import('../www/interstate/js/config.min.js');

  const state = main.getState();
  expect(state.isRunning).toBe(true);
  expect(state.isLoaded).toBe(true);
  expect(state.isMobile).toBe(false);
  expect(state.isPaused).toBe(true); // welcome screen still up

  expect(dom.el('load-progress').style.width).toBe('100%');
  expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);

  // Home/business links come from INTERSTATE_CONFIG.site.
  expect(dom.el('home-btn').href).toBe(INTERSTATE_CONFIG.site.home.path);
  expect(dom.el('biz-btn').href).toBe(INTERSTATE_CONFIG.site.business.websiteUrl);
  expect(dom.el('card-site').href).toBe(INTERSTATE_CONFIG.site.business.websiteUrl);
  expect(dom.el('complete-contact').href).toBe(INTERSTATE_CONFIG.site.builder.contactPath);

  // The animate loop was captured; a few simulated seconds must not throw.
  expect(dom.loops.length).toBeGreaterThanOrEqual(1);
  stepFrames(120);

  // No 2D fallback redirect happened.
  expect(dom.replaced).toHaveLength(0);
});

test('welcome dismissal starts the tour once; inputs hand back control', async () => {
  const main = await bootShop();
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
  fire(dom.documentStub, 'keydown', { code: 'KeyW' });
  fire(dom.documentStub, 'keyup', { code: 'KeyW' });
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
  await bootShop();
  const settingsBtn = dom.el('settings-btn');
  const settingsPanel = dom.el('settings-panel');

  // Gear opens the panel; the visibility observer syncs aria and installs
  // the outside-tap closer.
  fire(settingsBtn, 'click');
  expect(settingsPanel.classList.contains('hidden')).toBe(false);
  runObservers();
  expect(settingsBtn.attributes['aria-expanded']).toBe('true');

  // Sliders update live and persist on commit.
  fire(dom.el('walk-speed-slider'), 'input', { target: { value: '8' } });
  expect(dom.el('walk-speed-value').textContent).toBe(8);
  fire(dom.el('walk-speed-slider'), 'change', { target: { value: '8' } });
  fire(dom.el('look-speed-slider'), 'input', { target: { value: '2.5' } });
  expect(dom.el('look-speed-value').textContent).toBe('2.5');
  fire(dom.el('look-speed-slider'), 'change', { target: { value: '2.5' } });
  fire(dom.el('settings-light-slider'), 'input', { target: { value: '0.8' } });
  expect(dom.el('settings-light-value').textContent).toBe('80%');
  fire(dom.el('settings-light-slider'), 'change', { target: { value: '0.8' } });
  const saved = JSON.parse(sessionStorage.getItem('interstate-settings'));
  expect(saved).toEqual({ walk: 8, look: 2.5, brightness: 0.8 });

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

test('interior interactions: hover labels, modals, and the light switch', async () => {
  const main = await bootShop();
  // Keep the partway nudge quiet: this test racks up several discoveries.
  sessionStorage.setItem('interstate-nudged', '1');
  const checklist = await import('../www/shared/js/checklist-1.0.0.min.js');
  const canvas = dom.el('game-canvas');
  enterWorld();

  // Hover the host: the crosshair label invites a chat.
  ray.hits = [hit({ isShopkeeper: true })];
  stepFrames(10);
  expect(dom.el('look-label').classList.contains('visible')).toBe(true);
  expect(dom.el('look-label').textContent).toContain('Need help?');
  expect(dom.el('hud').classList.contains('targeting')).toBe(true);

  // Hover a waiting customer, then the business card, then clear.
  ray.hits = [hit({ isCustomer: true })];
  stepFrames(10);
  expect(dom.el('look-label').textContent).toContain('chat with the customer');
  ray.hits = [hit({ isScenery: true, sceneryKind: 'businesscard' })];
  stepFrames(10);
  expect(dom.el('look-label').textContent).toContain("read the shop's card");
  ray.hits = [];
  stepFrames(10);
  expect(dom.el('look-label').classList.contains('visible')).toBe(false);
  expect(dom.el('hud').classList.contains('targeting')).toBe(false);

  // Click the host: the help dialog opens and ticks its discovery.
  ray.hits = [hit({ isShopkeeper: true })];
  tap(canvas);
  expect(dom.el('help-modal').classList.contains('hidden')).toBe(false);
  expect(main.getState()._modalOpen).toBe(true);
  expect(checklist.getChecklistProgress().done).toBe(1);
  // While a modal is up, further clicks are ignored.
  tap(canvas);
  await escapeAndResume();
  expect(main.getState()._modalOpen).toBe(false);
  expect(main.getState().isPaused).toBe(false); // resume re-locked the pointer

  // Click the light switch: the floating dimmer panel opens over the switch.
  ray.hits = [hit({ isLightSwitch: true })];
  tap(canvas);
  const lightPanel = dom.el('light-panel');
  expect(lightPanel.classList.contains('hidden')).toBe(false);
  expect(dom.el('light-slider').focused).toBe(true);
  fire(dom.el('light-slider'), 'input', { target: { value: '0.6' } });
  expect(dom.el('light-value').textContent).toBe('60%');
  fire(dom.el('light-slider'), 'change', { target: { value: '0.6' } });
  // A press anywhere outside the panel closes it.
  fire(dom.documentStub, 'pointerdown', { target: dom.el('hud') });
  expect(lightPanel.classList.contains('hidden')).toBe(true);
  await jest.advanceTimersByTimeAsync(250);

  // Chat with a waiting customer; the shortcut home stays hidden indoors,
  // but pressing it still teleports and closes.
  ray.hits = [hit({ isCustomer: true })];
  tap(canvas);
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(false);
  expect(dom.el('dialog-title').textContent).toBe('A Waiting Customer');
  expect(dom.el('dialog-message').textContent.length).toBeGreaterThan(0);
  expect(dom.el('dialog-return-btn').classList.contains('hidden')).toBe(true);
  fire(dom.el('dialog-return-btn'), 'click'); // returnToGallery
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(true);
  await jest.advanceTimersByTimeAsync(250);

  // Scenery: the TV, the lift, and the tire racks tick discoveries and use
  // their fixed titles; a plant introduces itself by its punny name.
  const sceneryCases = [
    [{ isScenery: true, sceneryKind: 'tv' }, 'The Waiting Room TV'],
    [{ isScenery: true, sceneryKind: 'lift' }, 'Up on the Lift'],
    [{ isScenery: true, sceneryKind: 'tires' }, 'The Tire Racks'],
    [{ isScenery: true, sceneryKind: 'plant', sceneryIndex: 2 }, 'Rosemary Radial'],
  ];
  for (const [userData, title] of sceneryCases) {
    ray.hits = [hit(userData)];
    tap(canvas);
    expect(dom.el('dialog-title').textContent).toBe(title);
    await escapeAndResume();
  }
  const done = checklist.getChecklistItems().filter((i) => i.done).map((i) => i.id).sort();
  expect(done).toEqual(['host', 'lift', 'switch', 'tires', 'tv']);

  // The desk opens the enlarged studio monitor with its own RAF mirror loop.
  const loopsBefore = dom.loops.length;
  ray.hits = [hit({ isScenery: true, sceneryKind: 'desk' })];
  tap(canvas);
  expect(dom.el('monitor-view').classList.contains('hidden')).toBe(false);
  expect(dom.el('monitor-canvas').width).toBe(800);
  expect(dom.el('monitor-caption').textContent.length).toBeGreaterThan(0);
  expect(dom.loops.length).toBeGreaterThan(loopsBefore);
  for (let i = 0; i < 5; i++) {
    jest.advanceTimersByTime(16);
    dom.loops[dom.loops.length - 1]();
  }
  await escapeAndResume();
  expect(dom.el('monitor-view').classList.contains('hidden')).toBe(true);
  dom.loops[dom.loops.length - 1](); // orphaned mirror frame exits quietly

  // The whiteboard opens its static close-up.
  ray.hits = [hit({ isScenery: true, sceneryKind: 'whiteboard' })];
  tap(canvas);
  expect(dom.el('whiteboard-view').classList.contains('hidden')).toBe(false);
  expect(dom.el('whiteboard-canvas').width).toBe(800);
  await escapeAndResume();

  // The business card on the counter opens the shop's card.
  ray.hits = [hit({ isScenery: true, sceneryKind: 'businesscard' })];
  tap(canvas);
  expect(dom.el('card-modal').classList.contains('hidden')).toBe(false);
  await escapeAndResume();

  // A gallery piece opens the piece card with its link.
  ray.hits = [hit({
    isGalleryPiece: true, galleryId: 'g1', galleryTitle: 'Test Piece',
    gallerySubtitle: 'A test', galleryUrl: '/test-piece/',
  })];
  tap(canvas);
  expect(dom.el('piece-modal').classList.contains('hidden')).toBe(false);
  expect(dom.el('piece-title').textContent).toBe('Test Piece');
  expect(dom.el('piece-enter').href).toBe('/test-piece/');
  expect(dom.el('piece-enter').textContent).toBe('Enter Test Piece →');
  await escapeAndResume();

  // Misses walk the tolerance rings and give up, on all three tap paths.
  ray.hits = [];
  tap(canvas);
  fire(dom.el('tap-zone'), 'click', { clientX: 120, clientY: 90 });
  fire(canvas, 'touchend', { changedTouches: [{ clientX: 10, clientY: 10 }] });
  expect(main.getState()._modalOpen).toBe(false);
  stepFrames(10);
});

test('partway nudge waits for a quiet moment; completion celebrates and shares', async () => {
  const main = await bootShop();
  const checklist = await import('../www/shared/js/checklist-1.0.0.min.js');
  const { INTERSTATE_CONFIG } = await import('../www/interstate/js/config.min.js');
  const ids = INTERSTATE_CONFIG.checklist.items.map((i) => i.id);
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
  expect(sessionStorage.getItem('interstate-nudged')).toBe('1');

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
  const main = await bootShop();
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
  const main = await bootShop();
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
  fire(dom.el('joystick-zone'), 'touchstart', {
    touches: [{ clientX: 60, clientY: 700, identifier: 1 }],
    changedTouches: [{ clientX: 60, clientY: 700, identifier: 1 }],
  });
  expect(autopilot.isAutopilotEnabled()).toBe(false);

  // A canvas tap opens the help dialog via the touch path, and the mobile
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
  await import('../www/interstate/js/main.js');
  await flushAsync();
  await jest.advanceTimersByTimeAsync(3000);
  expect(dom.replaced).toEqual(['/']);
});

describe('the pure helpers on the __test__ seam', () => {
  let main;
  beforeEach(async () => { main = await bootShop(); });

  test('readNumericSetting guards range and type', () => {
    const { readNumericSetting } = main.__test__;
    expect(readNumericSetting({ walk: 8 }, 'walk', 2, 14, 5)).toBe(8);
    expect(readNumericSetting({ walk: 99 }, 'walk', 2, 14, 5)).toBe(5);
    expect(readNumericSetting({ walk: 'fast' }, 'walk', 2, 14, 5)).toBe(5);
    expect(readNumericSetting({}, 'walk', 2, 14, 5)).toBe(5);
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
