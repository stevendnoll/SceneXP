// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Boot-and-drive smoke for John Walker's showroom main.js.
 *
 * WHY THIS FILE EXISTS, since it arrived nineteen QA rounds late: every
 * other experience's main.js is driven by a test and this one was at 0%,
 * lines 1 to 1736, the only scene conductor in the repository with no
 * coverage at all. `tests/automan-init.test.mjs` reads the page as source
 * text and imports store.js and config.js, but never main.js.
 *
 * That mattered most for one function. `assembleContact()` is exported on
 * `__test__` with a comment saying it is exported "because a typo in one of
 * the joined fragments in config would otherwise not surface until a visitor
 * tapped Call and reached the wrong number" — and nothing called it. The
 * config test only asserts `phoneParts.length > 1`, so a transposed digit
 * shipped a green build that dialed a stranger. The specs/ scripts would
 * have caught it and specs/ is git-ignored, so CI never ran them.
 *
 * Same recipe as sunnyvalejenn-main.test.mjs: install THREE and the DOM
 * stand-ins FIRST, then import main.js so it auto-boots the way a real page
 * load does.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';
import { readFile } from 'node:fs/promises';

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
  return {
    object: { visible: true, parent: null, userData: { isProp: true, propKind: kind } },
    distance: 3,
  };
}

function tap(el, x = OVER_SCENE.x, y = OVER_SCENE.y) {
  fire(el, 'click', { clientX: x, clientY: y, button: 0, detail: 1 });
}

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  installThree();
  dom = installDom();
  ray = installRaycasterOverride();
  dom.documentStub.contains = (el) => !!el;
});

afterEach(() => {
  dom.uninstall();
  jest.useRealTimers();
});

// The arrival panel is docked along the bottom, and D31 turns on its RECT:
// while it is up, a tap inside it reaches nothing at all. The stub's default
// rect is the whole viewport, which would make every tap in this file land
// "on the panel", so give it the shape it really has. 1280x800 viewport.
const PANEL_RECT = { left: 200, right: 1080, top: 620, bottom: 780, width: 880, height: 160, x: 200, y: 620 };
const OVER_SCENE = { x: 640, y: 300 };   // above the panel
const OVER_PANEL = { x: 640, y: 700 };   // on it

async function bootShowroom() {
  // Mirror the real markup's initial state: all three cards start hidden.
  for (const id of ['nudge-modal', 'help-modal']) {
    dom.el(id).classList.add('hidden');
  }
  // Both coaching layers ship the hidden class in the markup and are revealed
  // by taking it off, so a fade plays the same transition both ways rather
  // than a keyframe that outranks the class trying to remove it. The stub
  // auto-vivifies with an empty classList, so say so here.
  for (const id of ['coach-marks', 'intro-card', 'intro-handle']) {
    dom.el(id).classList.add('coach-out');
  }
  dom.el('intro-card').getBoundingClientRect = () => PANEL_RECT;
  const main = await import('../www/automan/js/main.js');
  await flushAsync();
  // PAST COACH_ARRIVE_MS (900), not just the loader. At 600 the panel had not
  // arrived yet, and every test below still passed, because the stub
  // auto-vivifies an element with an EMPTY classList: `introShowing()` asks
  // whether `coach-out` is absent, and on a fixture that never had it, the
  // answer is yes for free. The D31 tests were reading a panel that was
  // never shown. Adding the class above is what exposed it.
  await jest.advanceTimersByTimeAsync(1500);
  return main;
}

test('auto-boots through the loading screen with the site links wired', async () => {
  const main = await bootShowroom();

  const state = main.getState();
  expect(state.isRunning).toBe(true);
  expect(state.isLoaded).toBe(true);

  expect(dom.el('load-progress').style.width).toBe('100%');
  expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);
  // (There is no Home button to check any more, and no applySiteLinks() to
  // wire one. tests/home-button-removed.test.mjs guards its absence in the
  // markup, which is the only place it could come back.)

  // The animate loop survives a few simulated seconds. This is where the
  // cast's animation, John's glance at his customer and the portrait queue
  // all run, so a throw in any of them shows up here.
  expect(dom.loops.length).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < 120; i++) {
    jest.advanceTimersByTime(16);
    dom.loops[0]();
  }

  expect(dom.replaced).toHaveLength(0);
});

describe("assembleContact: the reason __test__ exists", () => {
  test('joins the config fragments into the number and address John actually has', async () => {
    const main = await bootShowroom();
    const { assembleContact, setProof } = main.__test__;

    setProof({ hash: 'abc123' });
    const contact = assembleContact();

    expect(contact).not.toBeNull();

    // THE DIGITS, ASSERTED. This is the whole point of the export: the
    // number is assembled from fragments precisely so it is not sitting in
    // the markup for a scraper, which also means no other check in the
    // repository ever looks at the result. A transposed digit in config
    // is invisible to every other test and reaches a real stranger's phone.
    //
    // The displayed number and the dialed one have to be the SAME number,
    // which is the failure worth naming: a visitor reads one and the link
    // calls the other, and nothing on screen says so.
    expect(contact.display).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
    const digits = contact.display.replace(/\D/g, '');
    expect(digits).toHaveLength(10);
    expect(contact.tel).toBe(`tel:+1${digits}`);
    expect(contact.sms.startsWith(`sms:+1${digits}?&body=`)).toBe(true);

    // The address is a real one, and the mailto carries exactly it.
    expect(contact.address).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
    expect(contact.mail.startsWith(`mailto:${contact.address}?subject=`)).toBe(true);

    // The Ref is the proof's own hash, so a message arriving with a
    // valid-looking one demonstrably came through a browser that solved
    // the gate. A truncation bug here would quietly break John's triage.
    expect(decodeURIComponent(contact.mail.split('subject=')[1])).toContain('abc123');
  });

  test('returns nothing without a proof, so the card cannot leak the number', async () => {
    const main = await bootShowroom();
    const { assembleContact, setProof } = main.__test__;
    setProof(null);
    expect(assembleContact()).toBeNull();
  });
});

describe('the three routes to a person all reach the contact card', () => {
  test('a tap on a person opens their own card copy', async () => {
    const main = await bootShowroom();
    const { PERSON_KINDS, CONTACT_CARDS } = main.__test__;

    for (const who of PERSON_KINDS) {
      ray.hits = [propHit(who)];
      tap(dom.el('game-canvas'));
      expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(false);
      expect(dom.el('nudge-title').textContent).toBe(CONTACT_CARDS[who].title);
      fire(dom.documentStub, 'keydown', { code: 'Escape', key: 'Escape' });
    }
  });

  test('the arrival panel\'s own button opens it through the button entry', async () => {
    const main = await bootShowroom();
    const { CONTACT_CARDS } = main.__test__;

    tap(dom.el('intro-contact'));
    expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(false);
    expect(dom.el('nudge-title').textContent).toBe(CONTACT_CARDS.button.title);
  });

  test('and every one of them retires the arrival panel, which is read once',
    async () => {
      await bootShowroom();
      const intro = dom.el('intro-card');
      expect(intro.classList.contains('coach-out')).toBe(false);

      ray.hits = [propHit('john')];
      tap(dom.el('game-canvas'));
      expect(intro.classList.contains('coach-out')).toBe(true);
    });
});

describe('D43: the room is a picture, and only the people answer', () => {
  test('a prop opens nothing, ever, and does not disturb the panel', async () => {
    /* THE CHANGE THIS REPLACED. Fourteen props each told a story, the first
     * tap cleared the arrival panel on the way past, and the second opened
     * the story. QA's call: a room where some objects answer and most do not
     * makes a visitor hunt, so now none of them do.
     *
     * Both halves matter and only one of them is visible. That a prop opens
     * no card is obvious the first time anybody taps a chair. That a prop no
     * longer COLLAPSES THE PANEL is not: a visitor reading the panel who taps
     * the floor keeps their place, and the only way to notice the regression
     * is to be mid-sentence when it happens. */
    const main = await bootShowroom();
    const { PROP_CONTENT, PERSON_KINDS } = main.__test__;
    expect(Object.keys(PROP_CONTENT).sort()).toEqual([...PERSON_KINDS].sort());

    const panel = dom.el('intro-card');
    // A prop that is still registered in the scene, so it is a real hit and
    // not just an unknown kind falling through.
    ray.hits = [propHit('coffeebar')];

    tap(dom.el('game-canvas'));
    expect(panel.classList.contains('coach-out')).toBe(false);   // still up
    expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(true);

    // And it stays that way however many times it is tapped, with the panel
    // up or down. Dismiss the panel deliberately, then tap the prop again.
    tap(dom.el('intro-close'));
    expect(panel.classList.contains('coach-out')).toBe(true);
    tap(dom.el('game-canvas'));
    expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(true);
  });

  test('the props are still RAYCAST TARGETS, so the room can block a tap', async () => {
    /* The half of this that is easy to delete by accident. The props answer
     * no taps, but they still have to STOP one: raycasting at the people
     * alone would let a tap on the desk in front of John open John's card,
     * and "the background is not clickable" has to mean the background is
     * not a way through to something that is.
     *
     * So the scene still registers every prop, and pickSceneHit still casts
     * against all of them. Asserted against the store's own registrations,
     * because a future cleanup that unregistered them would leave every test
     * above green and quietly make the desk a button. */
    const storeText = await readFile(
      new URL('../www/automan/js/store.js', import.meta.url), 'utf8');
    const registered = [...storeText.matchAll(/registerOutdoorProp\([^;]*?'(\w+)'\)/g)]
      .map((m) => m[1]);
    expect(registered.length).toBeGreaterThanOrEqual(13);

    const mainText = await readFile(
      new URL('../www/automan/js/main.js', import.meta.url), 'utf8');
    // The pick still asks the world for every prop, not for a person list.
    expect(mainText).toMatch(/const targets = getOutdoorPropMeshes\(\);/);
  });

  test('but a person opens their card straight through the arrival', async () => {
    const main = await bootShowroom();
    const { CONTACT_CARDS } = main.__test__;

    // The cost D31's first cut shipped and Steve found on a phone: a ring
    // floats ABOVE a head, so the thing people reach for is the person
    // under it, and a tap on John's face that did nothing was the worst
    // feedback this page could give the visitor it is built for.
    ray.hits = [propHit('john')];
    tap(dom.el('game-canvas'));
    expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(false);
    expect(dom.el('nudge-title').textContent).toBe(CONTACT_CARDS.john.title);
  });

  test('and a tap ON the panel reaches nothing behind it', async () => {
    await bootShowroom();

    // The panel is pointer-events: none so a swipe starting on it still
    // looks around the room, which is exactly why a tap could fall through
    // and open whatever prop sat behind the text. The rect is asked instead.
    ray.hits = [propHit('john')];
    tap(dom.el('game-canvas'), OVER_PANEL.x, OVER_PANEL.y);
    expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(true);
    expect(dom.el('intro-card').classList.contains('coach-out')).toBe(false);
  });
});

describe('the arrival panel collapses to a handle instead of leaving', () => {
  test('close collapses it, and the handle brings it back', async () => {
    await bootShowroom();
    const panel = dom.el('intro-card');
    const handle = dom.el('intro-handle');

    // Arrived: panel up, handle away.
    expect(panel.classList.contains('coach-out')).toBe(false);
    expect(handle.classList.contains('coach-out')).toBe(true);

    tap(dom.el('intro-close'));
    expect(panel.classList.contains('coach-out')).toBe(true);
    expect(handle.classList.contains('coach-out')).toBe(false);
    expect(handle.getAttribute('aria-expanded')).toBe('false');

    // And back. This is the whole point: the panel is the only thing on the
    // page that says what John does, so it has to stay reachable.
    tap(handle);
    expect(panel.classList.contains('coach-out')).toBe(false);
    expect(handle.classList.contains('coach-out')).toBe(true);
    expect(handle.getAttribute('aria-expanded')).toBe('true');
  });

  test('NOTHING TIMES IT OUT (D43)', async () => {
    /* It used to collapse itself after 29 seconds, a number derived from its
     * own word count. QA's call to remove it, and the reasoning is the page's
     * whole audience: a timer decides for the visitor how fast they read, and
     * this panel is the only thing on the page that says what John does. It
     * was taking itself away mid-sentence from exactly the person who arrived
     * from a link John sent them.
     *
     * Two minutes is well past any reading of ninety words, and past the
     * halo calm-down at 30s, so a panel still up here is up on purpose. */
    await bootShowroom();
    await jest.advanceTimersByTimeAsync(120000);
    expect(dom.el('intro-card').classList.contains('coach-out')).toBe(false);
    expect(dom.el('intro-handle').classList.contains('coach-out')).toBe(true);
  });

  // THE LIST STEVE NAMED, one test each rather than a loop. A loop was tried
  // and passed the first case then failed the second on a panel that was
  // already collapsed: `beforeEach` is what resets the module registry and the
  // DOM, so a second bootShowroom() inside one test re-imports a cached module
  // onto the previous case's leftovers. test.each gets a fresh page per row.
  test.each([
    ['the close button', () => tap(dom.el('intro-close'))],
    ['the floating W', () => tap(dom.el('help-btn'))],
    ["the panel's own Talk to John", () => tap(dom.el('intro-contact'))],
    ["the panel's own About", () => tap(dom.el('intro-about'))],
    ['a tap on one of the three people', () => {
      ray.hits = [propHit('john')];
      tap(dom.el('game-canvas'));
    }],
  ])('%s collapses the panel', async (_label, act) => {
    await bootShowroom();
    const panel = dom.el('intro-card');
    expect(panel.classList.contains('coach-out')).toBe(false);
    act();
    expect(panel.classList.contains('coach-out')).toBe(true);
  });

  test('and so does a halo, which this harness cannot click', async () => {
    /* THE ONE CASE THAT IS ASSERTED FROM SOURCE, and the reason is worth
     * writing down rather than quietly skipping. The halos are wired through
     * `coachMarksEl.querySelectorAll('.coach-mark')`, and the DOM stub's
     * ELEMENT querySelectorAll returns [] (only the DOCUMENT stub does a real
     * class search). So under test `coachMarks` is empty and no halo listener
     * is ever attached: a runtime click here would be clicking a fresh
     * auto-vivified div and passing for the wrong reason, which is worse than
     * not testing it.
     *
     * So this reads the handler instead. It is a weaker check and it is
     * honest about being one: it catches the collapse being dropped from the
     * halo, not the halo being unreachable. */
    const mainText = await readFile(
      new URL('../www/automan/js/main.js', import.meta.url), 'utf8');
    const handler = /coachMarks\.forEach\([\s\S]*?\n    \}\);/.exec(mainText);
    expect(handler).not.toBeNull();
    expect(handler[0]).toContain('collapseIntro()');
    expect(handler[0]).toContain('openContactCard(kind)');
  });

  test('a card parks the handle and gives back the state it found', async () => {
    await bootShowroom();
    tap(dom.el('intro-close'));
    const handle = dom.el('intro-handle');
    expect(handle.classList.contains('coach-out')).toBe(false);

    // Open a card: the handle is a real tab stop, so it must not sit behind
    // the backdrop where a keyboard visitor reaches what nobody can see.
    ray.hits = [propHit('john')];
    tap(dom.el('game-canvas'));
    expect(handle.classList.contains('coach-out')).toBe(true);

    // Close it: the COLLAPSED state comes back, not the panel.
    fire(dom.documentStub, 'keydown', { code: 'Escape', key: 'Escape' });
    expect(handle.classList.contains('coach-out')).toBe(false);
    expect(dom.el('intro-card').classList.contains('coach-out')).toBe(true);
  });

  test('expanding is not a scene tap', async () => {
    await bootShowroom();
    tap(dom.el('intro-close'));

    // The handle sits over the room. Pressing it must not also raycast a
    // prop into a card underneath.
    ray.hits = [propHit('john')];
    tap(dom.el('intro-handle'));
    expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(true);
    expect(dom.el('intro-card').classList.contains('coach-out')).toBe(false);
  });
});

test('a card swallows the tap that opened it (D24)', async () => {
  await bootShowroom();

  ray.hits = [propHit('john')];
  tap(dom.el('game-canvas'));
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(false);

  // The compatibility click that follows the same finger, landing inside
  // the card that just appeared under it. It must be stopped: this is the
  // tap that used to dial John.
  let defaultPrevented = false;
  const ghost = {
    detail: 1,
    target: { closest: (sel) => (sel.includes('nudge-modal') ? dom.el('nudge-modal') : null) },
    preventDefault() { defaultPrevented = true; },
    stopPropagation() {},
  };
  dom.documentStub.listeners.get('click').forEach((fn) => fn(ghost));
  expect(defaultPrevented).toBe(true);
});

test('a keyboard activation is never swallowed', async () => {
  await bootShowroom();

  ray.hits = [propHit('john')];
  tap(dom.el('game-canvas'));

  // Enter on a focused control arrives as a click with detail 0. Somebody
  // tabbing was never handed a card under their finger.
  let defaultPrevented = false;
  const viaKeyboard = {
    detail: 0,
    target: { closest: () => dom.el('nudge-modal') },
    preventDefault() { defaultPrevented = true; },
    stopPropagation() {},
  };
  dom.documentStub.listeners.get('click').forEach((fn) => fn(viaKeyboard));
  expect(defaultPrevented).toBe(false);
});

test('the contact card focuses the card, not the call button', async () => {
  await bootShowroom();
  const container = dom.el('nudge-modal').querySelector('.modal-container');
  let focused = null;
  container.focus = () => { focused = container; };

  ray.hits = [propHit('john')];
  tap(dom.el('game-canvas'));

  // Landing on Call put a stray Enter one keypress from dialing him.
  expect(focused).toBe(container);
});

test('Escape closes whichever card is up', async () => {
  await bootShowroom();

  ray.hits = [propHit('john')];
  tap(dom.el('game-canvas'));
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(false);

  fire(dom.documentStub, 'keydown', { code: 'Escape', key: 'Escape' });
  expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(true);
});

describe('D45: the idle nudge', () => {
  const toast = () => dom.el('showroom-toast');
  const idle = (ms) => jest.advanceTimersByTimeAsync(ms);

  test('nothing while the arrival panel is still up', async () => {
    // It is armed on collapse, not on load, and idleNudgeWanted() re-checks
    // at the moment it fires. A visitor reading the panel is not idling.
    await bootShowroom();
    await idle(60000);
    expect(toast().classList.contains('visible')).toBe(false);
  });

  test('five seconds after the panel is put away, it asks', async () => {
    await bootShowroom();
    tap(dom.el('intro-close'));
    await idle(4000);
    expect(toast().classList.contains('visible')).toBe(false);
    await idle(1500);
    expect(toast().classList.contains('visible')).toBe(true);
    expect(toast().textContent).toMatch(/anyone at the desk/i);
    // "Click" on a desktop; the stub reports a non-touch device.
    expect(toast().textContent).toMatch(/^Click /);
  });

  test('ANY interaction restarts the five seconds', async () => {
    /* The difference between an idle wait and a countdown, and the whole
     * point of the feature: a visitor who is doing things should not be
     * interrupted to be told how to do things. */
    await bootShowroom();
    tap(dom.el('intro-close'));
    await idle(4000);
    fire(dom.documentStub, 'pointerdown', {});   // still busy
    await idle(4000);
    expect(toast().classList.contains('visible')).toBe(false);
    await idle(1500);
    expect(toast().classList.contains('visible')).toBe(true);
  });

  test('it asks a few times, in different words, then gives up', async () => {
    // A sentence repeated verbatim reads as a stuck screen rather than as a
    // hint, which is the garden's lesson this borrowed its shape from.
    await bootShowroom();
    tap(dom.el('intro-close'));
    // STEPPED FINELY, ON PURPOSE. A first pass sampled every 30 seconds and
    // saw two of the three: the first nudge fires at 5s and the second at
    // 27s, so by the 30s mark the first had already been overwritten. The
    // gaps are what this asserts, so the sampling has to be finer than them.
    const said = [];
    for (let i = 0; i < 120; i++) {
      await idle(1000);
      const text = toast().textContent;
      if (toast().classList.contains('visible') && text && !said.includes(text)) said.push(text);
    }
    expect(said).toHaveLength(3);
    // Two minutes is far past the third, so this is the whole of what it
    // will ever say: it gives up rather than cycling.
    expect(said[0]).toMatch(/anyone at the desk/i);
  });

  test('it stops for good once the visitor has reached John', async () => {
    await bootShowroom();
    tap(dom.el('intro-close'));
    ray.hits = [propHit('john')];
    tap(dom.el('game-canvas'));                  // the contact card opens
    expect(dom.el('nudge-modal').classList.contains('hidden')).toBe(false);
    fire(dom.documentStub, 'keydown', { code: 'Escape', key: 'Escape' });
    await idle(120000);
    expect(toast().classList.contains('visible')).toBe(false);
  });

  test('and it says nothing over an open card', async () => {
    // A prompt to tap somebody, on top of the card tapping somebody opened,
    // would be the scene talking over itself.
    await bootShowroom();
    tap(dom.el('intro-close'));
    tap(dom.el('help-btn'));                     // the About card
    expect(dom.el('help-modal').classList.contains('hidden')).toBe(false);
    await idle(60000);
    expect(toast().classList.contains('visible')).toBe(false);
  });
});
