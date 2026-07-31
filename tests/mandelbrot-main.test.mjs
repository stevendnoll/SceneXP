// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Boot-and-drive smoke for the Mandelbrot experience's main.js conductor,
 * following the gavin-main pattern: install THREE and the browser DOM
 * stand-ins FIRST, then import main.js so it auto-boots the way a real
 * page load does. Two extras are specific to this experience:
 *
 * - A recording FakeWorker stands in for the fractal render pool, and the
 *   test answers each postMessage with a fabricated frame (echoed header
 *   plus empty pixel/relief buffers), so the store's content gate lifts
 *   and the autozoom can genuinely fly the dive all the way to the
 *   double-precision floor: the depth chip narrates the magnification,
 *   the floor dialog takes the stage, and the flight pauses itself.
 *
 * - main.js keeps a module-scope THREE.Raycaster for tap picking, so the
 *   suite wraps the stubbed THREE with a controllable Raycaster whose
 *   hits the tests script directly: touchpoint taps launch the dive, the
 *   set opens its help dialog, and the iPhone ghost-click dedupe holds.
 *
 * The store driven here is the same store.min.js instance main.js
 * imports, so getDiveState() assertions read the live dive.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';

jest.setTimeout(90000);

let dom;
let ray;   // ray.hits: what the fake Raycaster returns next

// ---- The recording worker pool ----------------------------------------------

class FakeWorker {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this.posted = [];
    FakeWorker.instances.push(this);
  }
  postMessage(data) {
    this.posted.push(data);
    FakeWorker.pending.push({ worker: this, data });
  }
  terminate() {}
}
FakeWorker.instances = [];
FakeWorker.pending = [];

// Reused response buffers (the store copies them on adoption, so sharing
// one ArrayBuffer per shape keeps a 40-level ride cheap).
const bufCache = new Map();
function sharedBuffer(key, byteLength) {
  if (!bufCache.has(key)) bufCache.set(key, new ArrayBuffer(byteLength));
  return bufCache.get(key);
}

/** Answer every queued render request with a fabricated finished frame. */
function pumpWorkers() {
  const batch = FakeWorker.pending.splice(0);
  for (const { worker, data } of batch) {
    if (!worker.onmessage) continue;
    worker.onmessage({
      data: {
        gen: data.gen,
        level: data.level,
        re: data.re,
        im: data.im,
        span: data.span,
        size: data.size,
        maxIter: data.maxIter,
        grid: data.grid,
        pixels: sharedBuffer(`p${data.size}`, data.size * data.size * 4),
        heights: sharedBuffer(`h${data.grid}`, (data.grid + 1) * (data.grid + 1) * 4),
        nuLo: typeof data.fixedNuLo === 'number' ? data.fixedNuLo : 10,
        W: typeof data.fixedW === 'number' && data.fixedW > 0 ? data.fixedW : 120,
      },
    });
  }
}

// ---- Local stub overrides ------------------------------------------------------

/** A callable, constructable, everything-absorbing proxy (local copy of the
 *  helpers' chainable, which they keep private). */
function absorber() {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive || prop === 'valueOf') return () => 0;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'then' || prop === 'parent') return undefined;
      return absorber();
    },
    set: () => true,
    apply: () => absorber(),
    construct: () => absorber(),
  });
}

/** The shared dom-stub's 2D context returns undefined from createImageData,
 *  but the store's level-0 monument render writes into
 *  ctx.createImageData(...).data. Give canvases a fully absorbing context
 *  instead (the same shape three-stub's installCanvas provides). */
function patchCanvasContexts() {
  const original = dom.documentStub.createElement;
  dom.documentStub.createElement = (tag) => {
    const el = original(tag);
    if (String(tag).toLowerCase() === 'canvas') {
      el.getContext = () => absorber();
    }
    return el;
  };
}

// ---- The scriptable raycaster ------------------------------------------------

/** Wrap the installed THREE so main.js's module-scope Raycaster returns
 *  whatever hits the current test staged in ray.hits. Everything else
 *  falls through to the chainable stub. */
function installRaycasterControl() {
  const base = globalThis.THREE;
  const control = { hits: [] };
  globalThis.THREE = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'Raycaster') {
        return class FakeRaycaster {
          setFromCamera() {}
          intersectObjects() { return control.hits; }
        };
      }
      return base[prop];
    },
  });
  return control;
}

// ---- Suite plumbing -----------------------------------------------------------

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  installThree();
  dom = installDom();
  // closePropDialog restores focus behind document.contains, which the
  // shared stub does not model; a local override keeps that path honest.
  dom.documentStub.contains = () => true;
  patchCanvasContexts();
  ray = installRaycasterControl();
  FakeWorker.instances = [];
  FakeWorker.pending = [];
});

afterEach(() => {
  delete globalThis.Worker;
  delete globalThis.ImageData;
  dom.uninstall();
  jest.useRealTimers();
});

/** Import main.js (it auto-boots), walk init through its PoW await, the
 *  paint-yield rAF, and the loading reveal, then hand back the animate
 *  loop and the four autozoom buttons the module built. */
async function bootMandelbrot() {
  const main = await import('../www/mandelbrot/js/main.js');
  let released = 0;
  for (let i = 0; i < 30 && !main.getState().isRunning; i++) {
    await flushAsync();
    // Release any pending requestAnimationFrame callbacks (init's
    // nextFrame yield) exactly once each.
    while (released < dom.loops.length && !main.getState().isRunning) {
      dom.loops[released++]();
    }
    await jest.advanceTimersByTimeAsync(50);
  }
  await flushAsync();
  await jest.advanceTimersByTimeAsync(500);   // the 400ms loading reveal
  const animate = dom.loops[dom.loops.length - 1];
  const row = dom.documentStub.body.children.find(
    (c) => typeof c.className === 'string' && c.className.includes('autozoom-controls'));
  const [dirBtn, playBtn, speedBtn, resetBtn] = row ? row.children : [];
  return { main, animate, row, dirBtn, playBtn, speedBtn, resetBtn };
}

/** Step the render loop: advance the fake clock, run a frame, feed the pool. */
function step(animate, frames, ms = 100) {
  for (let i = 0; i < frames; i++) {
    jest.advanceTimersByTime(ms);
    animate();
    pumpWorkers();
  }
}

// ---- The full ride -------------------------------------------------------------

test('boots, and the autozoom flies the dive to the precision floor and home again', async () => {
  globalThis.Worker = FakeWorker;
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
  };

  const { main, animate, row, dirBtn, playBtn, speedBtn, resetBtn } = await bootMandelbrot();
  const store = await import('../www/mandelbrot/js/store.min.js');

  // Booted clean: running, loaded, desktop, loading screen retired.
  expect(main.getState()).toMatchObject({ isRunning: true, isLoaded: true, isMobile: false });
  expect(dom.el('load-progress').style.width).toBe('100%');
  expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);
  expect(dom.replaced).toHaveLength(0);

  // The Home button was wired from config (same-tab, root-relative).
  expect(dom.el('home-btn').href).toBe('/');
  expect(dom.el('home-btn').attributes['aria-label']).toBeTruthy();

  // The autozoom row: [direction] [play] [speed] [reset], defaults shown.
  expect(row.attributes['aria-label']).toBe('Auto zoom controls');
  expect(row.children).toHaveLength(4);
  expect(speedBtn.textContent).toBe('1×');
  expect(playBtn.attributes['aria-pressed']).toBe('false');

  // The pool was hired with the classic worker script.
  expect(FakeWorker.instances.length).toBeGreaterThanOrEqual(2);
  expect(FakeWorker.instances[0].url).toContain('fractal-worker');

  // Enter dismisses the welcome overlay; a second key is a quiet no-op.
  fire(dom.documentStub, 'keydown', { code: 'Enter' });
  expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
  fire(dom.documentStub, 'keydown', { code: 'Space' });

  // Speed cycles 1x -> 2x; the direction toggle flips out and back in.
  fire(speedBtn, 'click');
  expect(speedBtn.textContent).toBe('2×');
  fire(dirBtn, 'click');
  expect(dirBtn.attributes['aria-label']).toContain('surfacing out');
  fire(dirBtn, 'click');
  expect(dirBtn.attributes['aria-label']).toContain('diving in');

  // Play, and let the flight run. The pumped worker pool keeps the
  // content gate fed, so the dive genuinely reaches the floor.
  fire(playBtn, 'click');
  expect(playBtn.attributes['aria-pressed']).toBe('true');
  let s = null;
  for (let i = 0; i < 900; i++) {
    jest.advanceTimersByTime(100);
    animate();
    pumpWorkers();
    s = store.getDiveState();
    if (s.atFloor && dom.el('dialog-title').textContent) break;
  }
  expect(s.atFloor).toBe(true);

  // The chip narrates the depth, the floor earns its dialog, and the
  // flight pauses itself.
  const chip = dom.el('depth-chip');
  expect(chip.classList.contains('visible')).toBe(true);
  expect(chip.textContent).toContain('Magnification');
  expect(chip.textContent).toContain('billion');
  expect(chip.textContent).toContain('most of the way to the Sun');
  expect(dom.el('dialog-title').textContent).toBe('The Bottom That Is Not There');
  expect(dom.el('dialog-message').textContent).toContain('floating hundreds of billions');
  expect(playBtn.attributes['aria-pressed']).toBe('false');

  // Escape closes the story.
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(true);

  // The reset button snaps home: magnification 1, chip hidden again.
  fire(resetBtn, 'click');
  step(animate, 10);
  expect(store.getDiveState().z).toBe(0);
  expect(chip.classList.contains('visible')).toBe(false);

  // A pause moments after launch drifts the rest of the way home (the
  // touchpoint rings only live at the surface).
  fire(playBtn, 'click');
  step(animate, 3);
  const hover = store.getDiveState().z;
  expect(hover).toBeGreaterThan(0);
  expect(hover).toBeLessThan(0.5);
  fire(playBtn, 'click');
  step(animate, 60);
  expect(store.getDiveState().z).toBe(0);

  // Surfacing from the surface pauses itself on the first frame.
  fire(dirBtn, 'click');
  fire(playBtn, 'click');
  step(animate, 3);
  expect(playBtn.attributes['aria-pressed']).toBe('false');

  // Tab still visible: no session end yet. Then hidden, then pagehide
  // twice: endSession is idempotent and cleanup stops the loop.
  fire(dom.documentStub, 'visibilitychange');
  dom.documentStub.visibilityState = 'hidden';
  fire(dom.documentStub, 'visibilitychange');
  fire(dom.windowStub, 'pagehide');
  fire(dom.windowStub, 'pagehide');
  expect(main.getState().isRunning).toBe(false);
  animate();   // the early-return branch after cleanup
});

// ---- Taps, dialogs, and the ghost-click dedupe ----------------------------------

test('taps launch touchpoints, the set explains itself, and ghost clicks are deduped', async () => {
  // No Worker global here: the pool fails to hire and the store takes its
  // designed dead-pool fallback, which is exactly what Node gives a page.
  const { animate, playBtn } = await bootMandelbrot();
  const canvas = dom.el('game-canvas');

  // Dismiss the welcome overlay with a click; a repeat dismissal no-ops.
  fire(dom.el('blocker'), 'click');
  expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
  fire(dom.el('blocker'), 'touchend');
  jest.advanceTimersByTime(1000);

  // A miss: no hits under the tap or any of its tolerance rings.
  ray.hits = [];
  fire(canvas, 'click', { clientX: 640, clientY: 400 });
  expect(dom.el('dialog-title').textContent).toBe('');

  // The set itself: an invisible mesh in front is skipped, the visible
  // one behind opens the help dialog.
  const setProp = { visible: true, parent: null, userData: { isProp: true, propKind: 'mandelbrot' } };
  ray.hits = [
    { object: { visible: false, parent: null, userData: {} } },
    { object: setProp },
  ];
  fire(canvas, 'click', { clientX: 600, clientY: 380 });
  expect(dom.el('dialog-title').textContent).toBe('How to Explore');
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(false);
  const firstLine = dom.el('dialog-message').textContent;
  expect(firstLine.length).toBeGreaterThan(0);

  // Taps while the story is on stage are ignored.
  fire(canvas, 'click', { clientX: 600, clientY: 380 });
  expect(dom.el('dialog-title').textContent).toBe('How to Explore');

  // Escape closes; a second visit tells the other line and hands focus back.
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(true);
  fire(canvas, 'click', { clientX: 600, clientY: 380 });
  expect(dom.el('dialog-message').textContent).not.toBe(firstLine);
  fire(dom.documentStub, 'keydown', { code: 'Escape' });
  fire(dom.documentStub, 'keydown', { code: 'Escape' });   // no dialog: no-op

  // A touchpoint reached through a child mesh (getPropRoot walks up):
  // choosing a destination launches the dive on its own.
  const ring5 = { visible: true, parent: null, userData: { isProp: true, propKind: 'touchpoint', targetIndex: 5 } };
  ray.hits = [{ object: { visible: true, parent: ring5, userData: {} } }];
  fire(canvas, 'click', { clientX: 500, clientY: 300 });
  expect(playBtn.attributes['aria-pressed']).toBe('true');
  fire(playBtn, 'click');   // pause for the next scenario
  step(animate, 5);

  // A finger tap on a ring: touchend launches, and the synthetic click
  // that follows the same tap must not fall through to the set.
  const ring2 = { visible: true, parent: null, userData: { isProp: true, propKind: 'touchpoint', targetIndex: 2 } };
  ray.hits = [{ object: ring2 }];
  const touch = fire(canvas, 'touchend', {
    cancelable: true,
    changedTouches: [{ clientX: 640, clientY: 360 }],
  });
  expect(touch.defaultPrevented).toBe(true);
  expect(playBtn.attributes['aria-pressed']).toBe('true');
  ray.hits = [{ object: setProp }];
  fire(canvas, 'click', { clientX: 640, clientY: 360 });
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(true);

  // Re-tapping the already-selected ring still launches (label null path).
  fire(playBtn, 'click');   // pause first
  jest.advanceTimersByTime(1000);
  ray.hits = [{ object: ring2 }];
  fire(canvas, 'touchend', { cancelable: true, changedTouches: [{ clientX: 640, clientY: 360 }] });
  expect(playBtn.attributes['aria-pressed']).toBe('true');

  // A touchend with no touches left, and taps on props nobody scripted.
  fire(canvas, 'touchend', { cancelable: false, changedTouches: [] });
  jest.advanceTimersByTime(1000);
  ray.hits = [{ object: { visible: true, parent: null, userData: {} } }];
  fire(canvas, 'click', { clientX: 100, clientY: 100 });          // no prop root
  ray.hits = [{ object: { visible: true, parent: null, userData: { isProp: true, propKind: 'comet' } } }];
  fire(canvas, 'click', { clientX: 100, clientY: 100 });          // unknown kind
  expect(dom.el('dialog-modal').classList.contains('hidden')).toBe(true);
  ray.hits = [];

  // Rotate to portrait and back (placeCamera's portrait dolly), and the
  // Safari pinch gestures stay blocked.
  dom.windowStub.innerWidth = 390;
  dom.windowStub.innerHeight = 844;
  fire(dom.windowStub, 'resize');
  dom.windowStub.innerWidth = 1280;
  dom.windowStub.innerHeight = 800;
  fire(dom.windowStub, 'resize');
  const gesture = fire(dom.documentStub, 'gesturestart');
  expect(gesture.defaultPrevented).toBe(true);

  // With the pool dead the dive gates at the depth level 0 carries, and
  // a few more frames of the running flight must not throw.
  step(animate, 30);

  dom.documentStub.visibilityState = 'hidden';
  fire(dom.documentStub, 'visibilitychange');
  fire(dom.windowStub, 'pagehide');
});

// ---- The 2D fallback -------------------------------------------------------------

test('falls back to the 2D site when WebGL is unavailable', async () => {
  delete dom.windowStub.WebGLRenderingContext;
  await import('../www/mandelbrot/js/main.js');
  await flushAsync();
  expect(dom.el('load-status').textContent).toContain("can't run the 3D view");
  await jest.advanceTimersByTimeAsync(3000);
  expect(dom.replaced).toEqual(['/']);
});

test('defers boot until DOMContentLoaded when the document is still loading', async () => {
  dom.documentStub.readyState = 'loading';
  delete dom.windowStub.WebGLRenderingContext;   // keep the deferred boot cheap
  await import('../www/mandelbrot/js/main.js');
  await flushAsync();
  expect(dom.replaced).toHaveLength(0);          // nothing booted yet
  fire(dom.documentStub, 'DOMContentLoaded');
  await jest.advanceTimersByTimeAsync(3000);
  expect(dom.replaced).toEqual(['/']);
});

test('a crashing canvas probe reads as missing WebGL', async () => {
  const original = dom.documentStub.createElement;
  dom.documentStub.createElement = () => { throw new Error('no canvas here'); };
  await import('../www/mandelbrot/js/main.js');
  await flushAsync();
  await jest.advanceTimersByTimeAsync(3000);
  expect(dom.replaced).toEqual(['/']);
  dom.documentStub.createElement = original;
});

test('a hard init failure lands on the 2D fallback, not a blank page', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  // getElementById exploding takes init down on its first line, and also
  // exercises fallbackTo2D's own best-effort guard around the status text.
  dom.documentStub.getElementById = () => { throw new Error('DOM gone'); };
  await import('../www/mandelbrot/js/main.js');
  await flushAsync();
  await jest.advanceTimersByTimeAsync(3000);
  expect(dom.replaced).toEqual(['/']);
  expect(errSpy).toHaveBeenCalledWith(
    expect.stringContaining('3D init failed'), expect.any(Error));
  errSpy.mockRestore();
});
