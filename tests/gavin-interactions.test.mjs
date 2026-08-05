// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The bug patrol experience's interaction layer: Mantis Watch, the garden's
 * prop dialogs, and the welcome overlay.
 *
 * gavin-main.test.mjs boots the orchestrator and proves the wiring holds.
 * This suite drives what happens AFTER a visitor touches the scene, which
 * the boot smoke cannot reach: with the stubbed Three.js, every raycast
 * finds nothing, so the tap handlers always take their miss path.
 *
 * The fix is a controllable Raycaster installed over the stub before main.js
 * is imported (main.js builds its raycaster at module scope). Tests queue up
 * what the next intersectObjects() calls should return, which lets them
 * script a direct hit, a miss that a tolerance ring recovers, or a hit on
 * something hidden. Hits are plain objects with the three fields the walks
 * read: visible, parent, and userData.
 *
 * Nothing here reaches into store.js. The mantis groups and garden props it
 * built during boot stay where they are; these tests only control what the
 * ray reports finding, which is main.js's own input.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';

let dom;
let pick;
let beacons;

/** Telemetry sends an image beacon (new Image().src = url). Without an Image
 *  global the send throws and is swallowed as best-effort, so tests that want
 *  to see what was reported install a recorder. */
function installBeaconCapture() {
  const urls = [];
  globalThis.Image = function Image() {
    return { set src(value) { urls.push(String(value)); } };
  };
  return urls;
}

/** The action names telemetry was asked to report, in order. */
function reported() {
  return beacons.map((url) => new URL(url, 'http://localhost/').searchParams.get('action'));
}

/**
 * Replace THREE.Raycaster with one whose hits the test scripts, and
 * THREE.Vector2 with a real one so the tolerance-ring offsets are honest
 * arithmetic rather than absorbed by the chainable stub.
 *
 * pick.answers is consumed one entry per intersectObjects() call, so
 * [[], [], [hit]] means "the direct ray misses, and the third sample finds
 * it". Once drained, every further call reports nothing.
 */
function installPickControl() {
  const base = globalThis.THREE;
  const control = { answers: [], calls: 0 };
  globalThis.THREE = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'Raycaster') {
        return function Raycaster() {
          return {
            setFromCamera() {},
            intersectObjects() {
              control.calls++;
              return control.answers.length ? control.answers.shift() : [];
            },
          };
        };
      }
      if (prop === 'Vector2') {
        return function Vector2(x = 0, y = 0) {
          return { x, y, set(nx, ny) { this.x = nx; this.y = ny; return this; } };
        };
      }
      return base[prop];
    },
  });
  return control;
}

/** A raycast hit. `parent` chains upward and must end at null, the way a real
 *  Object3D ancestry does. */
function hit(userData = {}, { visible = true, parent = null } = {}) {
  return { object: { visible, parent, userData } };
}

/** A mesh whose mantis (or prop) root is an ancestor rather than itself, so
 *  the upward walks in main.js actually have to walk. */
function child(root, { visible = true } = {}) {
  return { object: { visible, parent: root.object, userData: {} } };
}

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  installThree();
  dom = installDom();
  // main.js restores focus through document.contains(); the stub has no
  // document-level containment, and every element it hands out is live.
  dom.documentStub.contains = () => true;
  pick = installPickControl();
  beacons = installBeaconCapture();
});

afterEach(() => {
  dom.uninstall();
  delete globalThis.Image;
  jest.useRealTimers();
});

async function bootGavin() {
  const main = await import('../www/gavin/js/main.js');
  await flushAsync();
  await jest.advanceTimersByTimeAsync(500);   // the 400ms loading-screen reveal
  return main;
}

/** Tap the scene at a point the tests do not otherwise care about. */
function tapCanvas(clientX = 400, clientY = 300) {
  fire(dom.el('game-canvas'), 'click', { clientX, clientY, button: 0 });
}

// ---- Mantis Watch ---------------------------------------------------------

describe('Mantis Watch', () => {
  test('a tap on a mantis marks it spotted and pulses the chip', async () => {
    await bootGavin();
    const mantis = hit({ isMantis: true });
    pick.answers = [[mantis]];

    tapCanvas();

    const chip = dom.el('mantis-chip');
    expect(chip.textContent).toBe('Mantis watch: 1 of 3 spotted');
    expect(chip.classList.contains('pulse')).toBe(true);
    expect(chip.classList.contains('complete')).toBe(false);
    expect(reported()).toContain('mantis-found');
  });

  test('resolves a mantis from a tapped child mesh', async () => {
    await bootGavin();
    const root = hit({ isMantis: true });
    pick.answers = [[child(root)]];

    tapCanvas();

    expect(dom.el('mantis-chip').textContent).toBe('Mantis watch: 1 of 3 spotted');
  });

  test('tapping the same mantis twice counts it once', async () => {
    await bootGavin();
    const mantis = hit({ isMantis: true });
    pick.answers = [[mantis], [mantis]];

    tapCanvas();
    tapCanvas();

    expect(dom.el('mantis-chip').textContent).toBe('Mantis watch: 1 of 3 spotted');
  });

  test('all three spotted turns the chip complete, and a fourth is ignored', async () => {
    await bootGavin();
    const mantises = [hit({ isMantis: true }), hit({ isMantis: true }), hit({ isMantis: true })];
    const extra = hit({ isMantis: true });
    pick.answers = [[mantises[0]], [mantises[1]], [mantises[2]], [extra]];

    tapCanvas();
    tapCanvas();
    tapCanvas();

    const chip = dom.el('mantis-chip');
    expect(chip.textContent).toBe('You spotted all three mantises! Gavin salutes you.');
    expect(chip.classList.contains('complete')).toBe(true);

    // The cap holds: a fourth mantis changes nothing.
    tapCanvas();
    expect(chip.textContent).toBe('You spotted all three mantises! Gavin salutes you.');
  });

  test('a tolerance ring finds a mantis just off the fingertip', async () => {
    await bootGavin();
    const mantis = hit({ isMantis: true });
    // The direct ray and the first two ring samples miss; the third finds it.
    pick.answers = [[], [], [mantis]];

    tapCanvas();

    expect(dom.el('mantis-chip').textContent).toBe('Mantis watch: 1 of 3 spotted');
    expect(pick.calls).toBe(3);
  });

  test('a hidden mantis does not answer taps', async () => {
    await bootGavin();
    // The nearest hit hangs off a hidden ancestor (the day and night crews
    // toggle visibility), so the ray keeps looking and finds the prop behind.
    const hiddenRoot = { object: { visible: false, parent: null, userData: { isMantis: true } } };
    const hidden = child(hiddenRoot);
    const behind = hit({ isProp: true, propKind: 'jasmine' });
    pick.answers = [[hidden, behind]];

    tapCanvas();

    expect(dom.el('mantis-chip').textContent).toBe('Mantis watch: 0 of 3 spotted');
    expect(dom.el('dialog-title').textContent).toBe('The Confederate Jasmine');
  });

  test('a tap that finds nothing at all is harmless', async () => {
    await bootGavin();
    pick.answers = [];

    tapCanvas();

    expect(dom.el('mantis-chip').textContent).toBe('Mantis watch: 0 of 3 spotted');
    expect(dom.el('dialog-title').textContent).toBe('');
  });

  test('a tap on untagged scenery is neither a mantis nor a story', async () => {
    await bootGavin();
    // Plenty of the garden is just scenery: it answers the ray, but carries
    // neither an isMantis nor an isProp ancestor, so both walks come up empty.
    pick.answers = [[hit({})]];

    tapCanvas();

    expect(dom.el('mantis-chip').textContent).toBe('Mantis watch: 0 of 3 spotted');
    expect(dom.el('dialog-title').textContent).toBe('');
  });

  test('a touch tap goes through the same path, and an empty touch list does not', async () => {
    await bootGavin();
    const mantis = hit({ isMantis: true });
    pick.answers = [[mantis]];

    const canvas = dom.el('game-canvas');
    fire(canvas, 'touchend', { changedTouches: [] });          // nothing to read
    expect(dom.el('mantis-chip').textContent).toBe('Mantis watch: 0 of 3 spotted');

    fire(canvas, 'touchend', { changedTouches: [{ clientX: 120, clientY: 240 }] });
    expect(dom.el('mantis-chip').textContent).toBe('Mantis watch: 1 of 3 spotted');
  });
});

// ---- The garden's prop dialogs --------------------------------------------

describe('prop dialogs', () => {
  test('a tap on a prop opens its story, and a second tap gives a new line', async () => {
    await bootGavin();
    const jasmine = hit({ isProp: true, propKind: 'jasmine' });
    pick.answers = [[jasmine], [jasmine]];

    tapCanvas();
    const dialog = dom.el('dialog-modal');
    expect(dom.el('dialog-title').textContent).toBe('The Confederate Jasmine');
    expect(dialog.classList.contains('hidden')).toBe(false);
    const firstLine = dom.el('dialog-message').textContent;
    expect(firstLine.length).toBeGreaterThan(0);

    // Taps are ignored while a dialog is up, so close before the second one.
    fire(dom.documentStub, 'keydown', { code: 'Escape' });
    expect(dialog.classList.contains('hidden')).toBe(true);

    tapCanvas();
    expect(dom.el('dialog-message').textContent).not.toBe(firstLine);
  });

  test('resolves the nearest prop root from a tapped child mesh', async () => {
    await bootGavin();
    const root = hit({ isProp: true, propKind: 'ladybug' });
    pick.answers = [[child(root)]];

    tapCanvas();

    expect(dom.el('dialog-title').textContent).toBe('A Ladybug on Patrol');
  });

  test('a prop with no story stays quiet', async () => {
    await bootGavin();
    pick.answers = [[hit({ isProp: true, propKind: 'not-a-real-kind' })]];

    tapCanvas();

    expect(dom.el('dialog-title').textContent).toBe('');
  });

  test('taps are ignored while a dialog is open', async () => {
    await bootGavin();
    pick.answers = [
      [hit({ isProp: true, propKind: 'jasmine' })],
      [hit({ isMantis: true })],
    ];

    tapCanvas();
    tapCanvas();                                  // swallowed by the open dialog

    expect(dom.el('mantis-chip').textContent).toBe('Mantis watch: 0 of 3 spotted');
    expect(pick.calls).toBe(1);
  });

  test('the close control dismisses the dialog and hands focus back', async () => {
    // The close buttons are found with querySelectorAll('[data-close]'), which
    // the element stub answers with an empty list by default.
    const closeBtn = dom.documentStub.createElement('button');
    dom.el('dialog-modal').querySelectorAll = () => [closeBtn];

    await bootGavin();

    // Something on the page holds focus when the visitor taps.
    const opener = dom.documentStub.createElement('a');
    opener.focus();
    expect(dom.documentStub.activeElement).toBe(opener);

    pick.answers = [[hit({ isProp: true, propKind: 'planter' })]];
    tapCanvas();
    expect(dom.el('dialog-title').textContent).toBe('The Cedar Planter');
    // Opening moves focus into the card, onto its dismiss button.
    expect(dom.documentStub.activeElement).not.toBe(opener);

    fire(closeBtn, 'click');
    expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(true);
    expect(dom.documentStub.activeElement).toBe(opener);
  });

  test('Escape does nothing when no dialog is open', async () => {
    await bootGavin();

    fire(dom.documentStub, 'keydown', { code: 'Escape' });

    expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(false);
  });
});

// ---- The welcome overlay --------------------------------------------------

describe('the welcome overlay', () => {
  test('a click lets the visitor in', async () => {
    await bootGavin();
    const blocker = dom.el('blocker');
    expect(blocker.classList.contains('hidden')).toBe(false);

    const event = fire(blocker, 'click');

    expect(event.defaultPrevented).toBe(true);
    expect(blocker.classList.contains('hidden')).toBe(true);
  });

  test('a touch lets the visitor in', async () => {
    await bootGavin();
    const blocker = dom.el('blocker');

    fire(blocker, 'touchend');

    expect(blocker.classList.contains('hidden')).toBe(true);
  });

  test('Enter and Space let the visitor in, and other keys do not', async () => {
    await bootGavin();
    const blocker = dom.el('blocker');

    fire(dom.documentStub, 'keydown', { code: 'KeyQ' });
    expect(blocker.classList.contains('hidden')).toBe(false);

    fire(dom.documentStub, 'keydown', { code: 'Enter' });
    expect(blocker.classList.contains('hidden')).toBe(true);

    // Re-open it to prove Space works on its own.
    blocker.classList.remove('hidden');
    fire(dom.documentStub, 'keydown', { code: 'Space' });
    expect(blocker.classList.contains('hidden')).toBe(true);
  });

  test('a key press does nothing once the overlay is already gone', async () => {
    await bootGavin();
    const blocker = dom.el('blocker');
    fire(blocker, 'click');
    expect(blocker.classList.contains('hidden')).toBe(true);

    // Second dismissal is a no-op rather than a second telemetry ping.
    fire(dom.documentStub, 'keydown', { code: 'Enter' });
    expect(blocker.classList.contains('hidden')).toBe(true);
  });
});

// ---- A portrait phone -----------------------------------------------------

describe('a portrait phone', () => {
  test('reframes the composed view and reports the first pan once', async () => {
    // The garden is composed for a landscape frame, so below an aspect of 1
    // placeCamera() widens the FOV and dollies straight back until the kids
    // and the flanking pots fit again.
    dom.windowStub.innerWidth = 390;
    dom.windowStub.innerHeight = 844;

    await bootGavin();

    // The shared pan part built its bottom-center row into the page.
    expect(dom.documentStub.body.children.length).toBeGreaterThan(0);

    // Keyboard panning is live only in portrait, and the first use of each
    // control is reported so the log can show whether the row gets touched.
    fire(dom.windowStub, 'keydown', { code: 'KeyA' });
    expect(reported()).toContain('portrait-pan');

    // Only the FIRST pan is reported, however much the visitor pans after.
    fire(dom.windowStub, 'keyup', { code: 'KeyA' });
    fire(dom.windowStub, 'keydown', { code: 'KeyD' });
    expect(reported().filter((action) => action === 'portrait-pan')).toHaveLength(1);
  });

  test('a rotation into portrait brings the view controls to life', async () => {
    await bootGavin();                          // starts landscape

    // Landscape needs no pan row: the composed frame already fits, and the
    // keyboard controls stay inert.
    fire(dom.windowStub, 'keydown', { code: 'KeyA' });
    expect(reported()).not.toContain('portrait-pan');

    dom.windowStub.innerWidth = 390;
    dom.windowStub.innerHeight = 844;
    fire(dom.windowStub, 'resize');

    // The same key now pans, which is what proves the resize reached the
    // portrait controls rather than only resizing the renderer.
    fire(dom.windowStub, 'keyup', { code: 'KeyA' });
    fire(dom.windowStub, 'keydown', { code: 'KeyA' });
    expect(reported()).toContain('portrait-pan');
  });
});

// ---- Boot paths -----------------------------------------------------------

describe('boot', () => {
  test('waits for DOMContentLoaded when the document is still parsing', async () => {
    dom.documentStub.readyState = 'loading';

    const main = await import('../www/gavin/js/main.js');
    await flushAsync();
    expect(main.getState().isRunning).toBe(false);   // nothing booted yet

    fire(dom.documentStub, 'DOMContentLoaded');
    await flushAsync();
    await jest.advanceTimersByTimeAsync(500);

    expect(main.getState().isRunning).toBe(true);
  });

  test('stops early when the page has no canvas', async () => {
    const realGet = dom.documentStub.getElementById.bind(dom.documentStub);
    dom.documentStub.getElementById = (id) => (id === 'game-canvas' ? null : realGet(id));

    const main = await bootGavin();

    expect(main.getState().isRunning).toBe(false);
    expect(dom.replaced).toHaveLength(0);           // not a failure, just nothing to do
  });

  test('falls back to the 2D site when the WebGL probe throws', async () => {
    dom.documentStub.createElement = () => { throw new Error('no canvas for you'); };

    await import('../www/gavin/js/main.js');
    await flushAsync();
    await jest.advanceTimersByTimeAsync(3000);

    expect(dom.replaced).toEqual(['/']);
  });

  test('falls back to the 2D site when init throws', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    dom.documentStub.getElementById = () => { throw new Error('DOM went away'); };

    await import('../www/gavin/js/main.js');
    await flushAsync();
    await jest.advanceTimersByTimeAsync(3000);

    expect(errors).toHaveBeenCalled();
    expect(dom.replaced).toEqual(['/']);
    errors.mockRestore();
  });
});
