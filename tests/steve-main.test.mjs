// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Boot-and-drive smoke for the home office experience's main.js orchestrator.
 *
 * Follows the gavin-main pattern: install THREE then the DOM stand-ins, import
 * main.js so it auto-boots the way a real page load does, and drive the wiring
 * by hand -- the welcome card, taps and clicks on the room, every office
 * dialog, the light switch's floating dimmer panel, the dashboard by both of
 * its routes, the list of the room's things, the discovery checklist through
 * to the nudge and the (deferred) completion celebration, the settings and nav
 * panels, and the lifecycle events.
 *
 * THE ROOM STOPPED BEING WALKED THROUGH ON 2026-09-18. This suite used to drive
 * pointer lock, a hover crosshair and a pair of joysticks. The eye is fixed now
 * and the visitor looks around with the shared pan part, so a click is read at
 * the pointer rather than at a crosshair, and the welcome card simply lets the
 * visitor in. Whether Steve is actually IN the fixed view is a question for real
 * geometry: tests/steve-view.test.mjs answers it through real three.js, along
 * with the full list of the room's things, which needs real prop registrations
 * that the stub here swallows.
 *
 * Local additions on top of the shared stubs (helpers stay untouched):
 * - a steerable THREE.Raycaster whose intersectObjects returns whatever the
 *   test staged in rayHits, so clicks can land on Steve, the cat, or a prop
 * - a MutationObserver recorder (main.js watches panel class changes)
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  'dialog-modal', 'analytics-view', 'complete-modal', 'nudge-modal',
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

  // document.contains lets the modal-close focus restore run its happy path.
  dom.documentStub.contains = () => true;

  HIDDEN_AT_BOOT.forEach((id) => dom.el(id).classList.add('hidden'));
  // The list of the room's things carries the `hidden` ATTRIBUTE in the
  // markup (it is a tab stop to keep out of reach, not a card to toggle).
  dom.el('prop-panel').hidden = true;
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

/** Dismiss the welcome card the way a desktop visitor does. */
function enterRoom() {
  fire(dom.el('blocker'), 'click');
}

/** Stage rayHits and click the room at a point. */
function clickScene(userData, extra) {
  rayHits = userData ? [hitFor(userData, extra)] : [];
  fire(dom.el('game-canvas'), 'click', { clientX: 640, clientY: 400 });
}

/** Stage rayHits and tap the room with a finger. */
function tapScene(userData) {
  rayHits = userData ? [hitFor(userData)] : [];
  fire(dom.el('game-canvas'), 'touchend', { changedTouches: [{ clientX: 200, clientY: 300 }] });
}

/** Escape out of the open dialog, then let the resume timers run. Any nudge
 *  or celebration that surfaces from the resume gets escaped too, so the
 *  driver always lands back in the room with nothing open. */
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

const isOpen = (id) => !dom.el(id).classList.contains('hidden');

async function checklistDone(id) {
  const checklist = await import('../www/shared/js/checklist-1.0.0.min.js');
  return checklist.getChecklistItems().find((it) => it.id === id).done;
}

test('auto-boots through the loading screen into the running state', async () => {
  const main = await bootSteve();

  const state = main.getState();
  expect(state.isRunning).toBe(true);
  expect(state.isLoaded).toBe(true);
  expect(state.isMobile).toBe(false);
  expect(state.isPaused).toBe(true); // welcome card still up

  expect(dom.el('load-progress').style.width).toBe('100%');
  expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);

  // The welcome screen's directory link got its config-driven href. It
  // replaced the Home button, and needs no label from config: unlike an
  // icon-only button, it says SceneXP.com in its own text.
  expect(dom.el('explore-link').href).toBe('/');

  // The view controls were built, at every screen size.
  const row = dom.documentStub.querySelector('.pan-controls');
  expect(row).toBeTruthy();
  expect(row.classList.contains('always-on')).toBe(true);

  expect(dom.loops.length).toBeGreaterThanOrEqual(1);
  stepFrames(120);
  expect(dom.replaced).toHaveLength(0);
});

test('survives resize, gestures, visibility loss, and page hide', async () => {
  await bootSteve();

  dom.windowStub.innerWidth = 390;
  dom.windowStub.innerHeight = 844;
  fire(dom.windowStub, 'resize');   // placeCamera re-derives the portrait lens
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

test('the welcome card lets the visitor in on a click, and the room waits until then', async () => {
  const main = await bootSteve();

  // Before the card is dismissed, the room does not answer taps, and the list
  // of its things is not yet a tab stop hiding behind the card.
  clickScene({ isShopkeeper: true });
  expect(isOpen('help-modal')).toBe(false);
  expect(dom.el('prop-panel').hidden).toBe(true);

  enterRoom();
  expect(main.getState().isPaused).toBe(false);
  expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
  expect(dom.el('prop-panel').hidden).toBe(false);

  // A second dismissal is a quiet no-op.
  enterRoom();
  expect(main.getState().isPaused).toBe(false);
});

test('Enter or Space lets a keyboard visitor in too', async () => {
  const main = await bootSteve();
  fire(dom.documentStub, 'keydown', { code: 'Tab' });     // not a dismissal
  expect(main.getState().isPaused).toBe(true);
  fire(dom.documentStub, 'keydown', { code: 'Enter' });
  expect(main.getState().isPaused).toBe(false);
  expect(dom.el('prop-panel').hidden).toBe(false);
});

test('How this works puts the welcome card back, and stands down while it is up', async () => {
  // THE ROOM'S ONLY EXPLANATION OF ITSELF is on the welcome card, and until
  // now one click dismissed it for good: a visitor who clicked through it was
  // left in an office with no hint that anything in it could be opened. The
  // button in the corner brings the same card back (the garden's answer, and
  // for the same reason: a second copy of those sentences would be two texts
  // to keep in step). What is easy to get wrong is everything AROUND the card,
  // so that is what this holds.
  const main = await bootSteve();
  const help = dom.el('help-btn');
  const gear = dom.el('settings-btn');
  const blocker = dom.el('blocker');

  // On arrival: the card is up, so nothing in the corner is offered. The
  // button that summons the card would do nothing, and the gear is chrome over
  // the only sentences the room gets to introduce itself with. `.ui-float` is
  // display:none without `.visible`, which takes each one off the screen and
  // out of the tab order in one act. The skip link goes with them, because it
  // points at the gear.
  expect(help.classList.contains('visible')).toBe(false);
  expect(gear.classList.contains('visible')).toBe(false);
  expect(dom.documentStub.querySelector('.skip-link').hidden).toBe(true);
  expect(dom.el('begin-prompt').textContent).toBe('Click to step inside');

  enterRoom();
  expect(help.classList.contains('visible')).toBe(true);
  expect(gear.classList.contains('visible')).toBe(true);
  expect(dom.documentStub.querySelector('.skip-link').hidden).toBe(false);

  // A settings panel left open behind the card would float over it with the
  // gear that opened it gone from under it, so opening the card closes it.
  fire(gear, 'click');
  expect(isOpen('settings-panel')).toBe(true);

  fire(help, 'click');
  expect(isOpen('settings-panel')).toBe(false);
  expect(blocker.classList.contains('hidden')).toBe(false);
  expect(help.classList.contains('visible')).toBe(false);
  expect(gear.classList.contains('visible')).toBe(false);
  // The room waits behind it exactly as it does on arrival: taps are held,
  // and the list of the room's things is not a tab stop behind the card.
  expect(main.getState().isPaused).toBe(true);
  expect(dom.el('prop-panel').hidden).toBe(true);
  // The card knows the visitor has been in already...
  expect(dom.el('begin-prompt').textContent).toBe('Click to come back to the office');
  // ...and it has focus, so a screen reader reads the card rather than the
  // button that just vanished from under the cursor.
  expect(blocker.focused).toBe(true);

  // Escape closes it, the way it closes every other panel in the room.
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(blocker.classList.contains('hidden')).toBe(true);
  expect(main.getState().isPaused).toBe(false);
  expect(dom.el('prop-panel').hidden).toBe(false);
  expect(help.classList.contains('visible')).toBe(true);
  // And focus lands back on the button that opened it.
  expect(help.focused).toBe(true);

  // A second press opens it again, and the room answers taps once it is
  // dismissed a third time: nothing here is one-shot.
  fire(help, 'click');
  expect(blocker.classList.contains('hidden')).toBe(false);
  enterRoom();
  expect(main.getState().isPaused).toBe(false);
  clickScene({ isShopkeeper: true });
  expect(isOpen('help-modal')).toBe(true);
});

test('the room offers itself to a visitor who has not touched anything', async () => {
  // EVERY STORY IN THE OFFICE OPENS FROM A CLICK ON A 3D SURFACE, and once the
  // welcome card is gone nothing on screen says so. This is the only thing in
  // the scene that teaches that, so the parts worth holding are: it waits, it
  // asks again in different words, it never lands on top of something the
  // visitor is already reading, and it stops for good the moment the room is
  // opened.
  const main = await bootSteve();
  const toast = dom.el('office-toast');

  // Nothing while the welcome card is up, however long it stands there.
  await jest.advanceTimersByTimeAsync(30000);
  expect(toast.classList.contains('visible')).toBe(false);

  enterRoom();
  await jest.advanceTimersByTimeAsync(6000);
  expect(toast.classList.contains('visible')).toBe(false);   // still waiting
  await jest.advanceTimersByTimeAsync(1500);
  expect(toast.classList.contains('visible')).toBe(true);
  expect(toast.textContent).toContain('Click the desk, the cat, or Steve himself');

  // It goes on its own, and the next one is different: a line repeated
  // verbatim reads as a stuck screen rather than as a hint.
  await jest.advanceTimersByTimeAsync(6000);
  expect(toast.classList.contains('visible')).toBe(false);
  await jest.advanceTimersByTimeAsync(13000);
  expect(toast.classList.contains('visible')).toBe(true);
  expect(toast.textContent).toContain('even the litter box');

  // Opening anything ends it, and clears whatever is on screen with it.
  clickScene({ isShopkeeper: true });
  expect(isOpen('help-modal')).toBe(true);
  expect(toast.classList.contains('visible')).toBe(false);
  const said = toast.textContent;
  await escapeAndSettle();
  await jest.advanceTimersByTimeAsync(60000);
  expect(toast.classList.contains('visible')).toBe(false);
  expect(toast.textContent).toBe(said);   // the third line was never spent
  expect(main.getState().isPaused).toBe(false);
});

test('a hint says Tap on a phone, and waits out a panel rather than queueing', async () => {
  globalThis.navigator.maxTouchPoints = 5;
  await bootSteve();
  const toast = dom.el('office-toast');
  fire(dom.el('blocker'), 'touchend');

  await jest.advanceTimersByTimeAsync(7500);
  expect(toast.textContent).toContain('Tap the desk');   // a finger, not a mouse

  // Settings open when the next line comes due. It would land on the panel on
  // a narrow screen, and on a busy visitor at any width, so the round is SPENT
  // rather than queued: nobody gets followed around by a hint they dodged.
  fire(dom.el('settings-btn'), 'click');
  expect(isOpen('settings-panel')).toBe(true);
  const said = toast.textContent;
  await jest.advanceTimersByTimeAsync(22500);
  expect(toast.classList.contains('visible')).toBe(false);
  expect(toast.textContent).toBe(said);

  // And the last line still comes, once the panel is out of the way.
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(isOpen('settings-panel')).toBe(false);
  await jest.advanceTimersByTimeAsync(18000);
  expect(toast.classList.contains('visible')).toBe(true);
  expect(toast.textContent).toContain('The big screen behind Steve');

  // Three and no more. The room has said its piece.
  await jest.advanceTimersByTimeAsync(120000);
  expect(toast.classList.contains('visible')).toBe(false);
});

test('a tour by click: every office dialog, the nudge, the deferred celebration', async () => {
  const main = await bootSteve();
  enterRoom();

  // Discovery 1: say hi to Steve.
  clickScene({ isShopkeeper: true });
  expect(isOpen('help-modal')).toBe(true);
  expect(dom.el('checklist-btn').classList.contains('pulse')).toBe(true);
  await escapeAndSettle();
  expect(isOpen('help-modal')).toBe(false);
  expect(main.getState().isPaused).toBe(false); // still in the room

  // The dancer seam stays wired even with no ambient NPCs: the shared dialog
  // opens with the office title, and Escape closes it.
  clickScene({ isDancer: true });
  expect(isOpen('dialog-modal')).toBe(true);
  expect(dom.el('dialog-title').textContent).toBe('Between Tasks');
  await escapeAndSettle();
  expect(isOpen('dialog-modal')).toBe(false);

  // Discoveries 2-5: the desk, the cat, the closet, the litter box. Crossing
  // four discoveries queues the partway nudge, which escapeAndSettle closes.
  for (const kind of ['standDesk', 'cat', 'closet', 'litter']) {
    clickScene({ isProp: true, propKind: kind });
    expect(isOpen('dialog-modal')).toBe(true);
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

  // An unknown prop kind opens nothing, and neither does a click on nothing.
  clickScene({ isProp: true, propKind: 'not-a-real-prop' });
  expect(isOpen('dialog-modal')).toBe(false);
  clickScene(null);
  expect(main.getState()._modalOpen).toBe(false);

  // The light switch opens the floating dimmer panel instead of a dialog.
  clickScene({ isProp: true, propKind: 'lightswitch' }, { getWorldPosition: (v) => v });
  expect(isOpen('light-panel')).toBe(true);
  expect(dom.el('light-slider').focused).toBe(true);
  const dimmer = dom.el('light-slider');
  dimmer.value = '0.3';
  fire(dimmer, 'input');
  fire(dimmer, 'change');
  expect(dom.el('light-value').textContent).toBe('30%');
  expect(dom.el('settings-light-value').textContent).toBe('30%'); // both controls stay in sync
  fire(dom.documentStub, 'keydown', { code: 'Escape' }); // closeActiveModal's dimmer branch
  expect(isOpen('light-panel')).toBe(false);
  await jest.advanceTimersByTimeAsync(700);

  // Reopen the dimmer, then a press outside the floating panel closes it.
  clickScene({ isProp: true, propKind: 'lightswitch' }, { getWorldPosition: (v) => v });
  expect(isOpen('light-panel')).toBe(true);
  fire(dom.documentStub, 'pointerdown', { target: dom.el('game-canvas') });
  expect(isOpen('light-panel')).toBe(false);
  await jest.advanceTimersByTimeAsync(700);

  // Discovery 6: the wall display's dashboard completes the list while a modal
  // is up, so the celebration defers until the overlay closes.
  clickScene({ isProp: true, propKind: 'dashboard' });
  expect(isOpen('analytics-view')).toBe(true);
  stepFrames(5); // analyticsOpen skips the 3D render
  const checklist = await import('../www/shared/js/checklist-1.0.0.min.js');
  expect(checklist.getChecklistProgress().complete).toBe(true);
  expect(isOpen('complete-modal')).toBe(false); // deferred

  fire(dom.documentStub, 'keydown', { code: 'Escape' }); // close the dashboard
  await jest.advanceTimersByTimeAsync(300);
  expect(isOpen('complete-modal')).toBe(true);
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

  // THE CLIPBOARD CARRIES THE SENTENCE AS WELL AS THE LINK, and the button is
  // NOT disabled while it says so: disabling the focused element throws
  // keyboard focus out of the dialog. (shared/js/share-1.0.0.js)
  delete globalThis.navigator.share;
  globalThis.navigator.clipboard = { writeText: async () => {} };
  fire(dom.el('complete-share'), 'click');
  await flushAsync();
  expect(dom.el('complete-share').textContent).toBe('Link copied');
  await jest.advanceTimersByTimeAsync(2000);
  expect(dom.el('complete-share').disabled).toBe(false);
  delete globalThis.navigator.clipboard;

  await escapeAndSettle(); // close the celebration
  expect(isOpen('complete-modal')).toBe(false);

  // Escape with nothing open leaves the visitor in the room. (It used to drop
  // the pointer lock and put the welcome card back up.)
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(main.getState().isPaused).toBe(false);
  expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
  expect(dom.replaced).toHaveLength(0);
});

test('a gallery piece click opens the piece modal with its link wired', async () => {
  const main = await bootSteve();
  enterRoom();

  clickScene({
    isGalleryPiece: true, galleryId: 'g1', galleryTitle: 'Test Wing',
    gallerySubtitle: 'A quick test', galleryUrl: '/wing/',
  });
  expect(isOpen('piece-modal')).toBe(true);
  expect(dom.el('piece-title').textContent).toBe('Test Wing');
  expect(dom.el('piece-subtitle').textContent).toBe('A quick test');
  expect(dom.el('piece-enter').getAttribute('href')).toBe('/wing/');
  expect(dom.el('piece-enter').textContent).toContain('Test Wing');
  await escapeAndSettle();
  expect(isOpen('piece-modal')).toBe(false);
  expect(main.getState().isPaused).toBe(false);
});

test('a nudge left pending by a previous page surfaces once the welcome card closes', async () => {
  await bootSteve();
  globalThis.sessionStorage.setItem('gallery-nudge-pending', '1');
  enterRoom();
  await jest.advanceTimersByTimeAsync(500);
  expect(isOpen('nudge-modal')).toBe(true);
  expect(globalThis.sessionStorage.getItem('steve-nudged')).toBe('1');
  await escapeAndSettle();
  expect(isOpen('nudge-modal')).toBe(false);
});

test('the list of the room\'s things opens what a click would, and only once the room is entered', async () => {
  const main = await bootSteve();
  const rows = () => dom.el('prop-list').children.map((li) => li.children[0]);

  // Steve leads the list, under his own name, as a real button.
  expect(rows()[0].textContent).toBe('Steve');
  expect(rows()[0].tagName).toBe('BUTTON');

  // Choosing a row before the room is entered does nothing.
  fire(rows()[0], 'click');
  expect(isOpen('help-modal')).toBe(false);

  enterRoom();
  fire(rows()[0], 'click');
  expect(isOpen('help-modal')).toBe(true);
  expect(await checklistDone('hello')).toBe(true);

  // A row chosen while a card is open is ignored rather than stacking a card.
  fire(rows()[0], 'click');
  expect(main.getState()._modalOpen).toBe(true);
  await escapeAndSettle();
  expect(isOpen('help-modal')).toBe(false);
});

test('settings (brightness only now), nav menu, and checklist panels open, tune, and close', async () => {
  await bootSteve();
  const fireAllMO = () => moCallbacks.forEach((cb) => cb([]));

  // The gear opens the settings panel; the class observer syncs aria state.
  fire(dom.el('settings-btn'), 'click');
  const panel = dom.el('settings-panel');
  expect(panel.classList.contains('hidden')).toBe(false);
  fireAllMO();
  expect(dom.el('settings-btn').getAttribute('aria-expanded')).toBe('true');

  // Brightness: live input plus a committed change persisted to sessionStorage.
  const light = dom.el('settings-light-slider');
  light.value = '0.5';
  fire(light, 'input');
  fire(light, 'change');
  expect(dom.el('settings-light-value').textContent).toBe('50%');
  expect(dom.el('light-value').textContent).toBe('50%'); // dimmer panel mirrors it
  const stored = JSON.parse(globalThis.sessionStorage.getItem('steve-settings'));
  expect(stored).toMatchObject({ brightness: 0.5 });
  // The walking-era settings are gone rather than silently still saved.
  expect(stored).not.toHaveProperty('walk');
  expect(stored).not.toHaveProperty('look');

  // The close button hides it and hands focus back to the gear.
  fire(dom.el('settings-close'), 'click');
  expect(panel.classList.contains('hidden')).toBe(true);
  expect(dom.el('settings-btn').focused).toBe(true);

  // A press outside the open panel closes it (capture-phase listener).
  fire(dom.el('settings-btn'), 'click');
  fireAllMO();
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

test('a brightness remembered earlier this visit is put back on load', async () => {
  globalThis.sessionStorage.setItem('steve-settings', JSON.stringify({ brightness: 0.7 }));
  await bootSteve();
  expect(dom.el('settings-light-value').textContent).toBe('70%');
});

test('mobile: tap to start, forgiving taps, the wall dashboard', async () => {
  globalThis.navigator.maxTouchPoints = 5;
  const main = await bootSteve();
  expect(main.getState().isMobile).toBe(true);
  expect(dom.el('begin-prompt').textContent).toBe('Tap to step inside');

  fire(dom.el('blocker'), 'touchend');
  expect(main.getState().isPaused).toBe(false);

  // A miss: the tolerance sampling walks its rings and finds nothing.
  tapScene(null);
  expect(main.getState()._modalOpen).toBe(false);

  // Tap Steve: his greeting opens. (Its "tap" wording is set on children the
  // stub never builds, so it is not observable here.)
  tapScene({ isShopkeeper: true });
  expect(isOpen('help-modal')).toBe(true);
  await escapeAndSettle();
  expect(main.getState().isPaused).toBe(false);

  // The wall display opens the dashboard overlay on a tap too.
  tapScene({ isProp: true, propKind: 'dashboard' });
  expect(isOpen('analytics-view')).toBe(true);
  await escapeAndSettle();
  expect(isOpen('analytics-view')).toBe(false);
});

test('a touch cancels the compatibility click it would spawn', async () => {
  // The first of the two belts that keep a card from opening under a finger
  // AND acting on the same tap. (The second, the capture-phase swallow, is
  // shared with www/automan and www/sunnyvalejenn.)
  await bootSteve();
  enterRoom();
  rayHits = [];
  const ev = fire(dom.el('game-canvas'), 'touchend', {
    cancelable: true, changedTouches: [{ clientX: 10, clientY: 10 }],
  });
  expect(ev.defaultPrevented).toBe(true);
});

test('asks the shared pan part for a view that wraps, at every screen size', () => {
  // The room surrounds the eye, so the turn goes all the way round instead of
  // stopping at a clamp. And `alwaysOn` plus the `always-on` class are ONE
  // setting in two places: the flag makes the inputs live at every aspect and
  // the class is what the shared CSS keys the row's visibility off, so one
  // without the other is a scene that answers the keyboard and shows no
  // buttons (the state www/gavin was once found in).
  const src = readFileSync(join(process.cwd(), 'www', 'steve', 'js', 'main.js'), 'utf8');
  const call = src.match(/initPortraitControls\(\{[\s\S]*?\n {4}\}\)/);
  expect(call).not.toBeNull();
  expect(call[0]).toMatch(/alwaysOn:\s*true/);
  expect(call[0]).toMatch(/extraClass:\s*'always-on'/);
  expect(call[0]).toMatch(/landscapeFov:/);
  expect(call[0]).toMatch(/surface:\s*canvas/);
  expect(call[0]).toMatch(/pan:\s*cam\.portrait\.pan/);
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
  expect(readNumericSetting({ brightness: 0.8 }, 'brightness', 0, 1.5, 1)).toBe(0.8);
  expect(readNumericSetting({ brightness: 9 }, 'brightness', 0, 1.5, 1)).toBe(1);    // out of range
  expect(readNumericSetting({ brightness: 'x' }, 'brightness', 0, 1.5, 1)).toBe(1);  // wrong type
  expect(readNumericSetting({}, 'brightness', 0, 1.5, 1)).toBe(1);                  // absent
  expect(pickLine(['a', 'b', 'c'], 4)).toBe('b');
  expect(pickLine([], 1)).toBe('');
  expect(pickLine(null, 0)).toBe('');
  expect(bufToHex(new Uint8Array([0, 255, 16]).buffer)).toBe('00ff10');
});
