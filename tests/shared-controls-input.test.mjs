// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for the input pipelines of www/shared/js/controls-1.0.0.js: the
 * dual touch joysticks, the tap zone, pointer-lock mouse look, Quest wheel
 * input, gamepad polling, the guard that no WebXR session is ever requested,
 * and the camera follow that ties them all to the renderer.
 *
 * Stubbing approach (extends tests/shared-controls.test.mjs): THREE stays a
 * chainable proxy, but Vector3/Euler are real component-holding stubs so the
 * movement math runs for real. PerspectiveCamera and WebGLRenderer are also
 * overridden so scene-1.0.0.min.js's initScene() hands the controls module a
 * camera we can read.
 * document/window record their listeners so tests fire synthetic keydown,
 * mousemove, wheel, touch, and gamepad events by hand; requestAnimationFrame
 * queues into an array the tests flush explicitly; performance.now is spied
 * per test, so every timing check (tap duration, wheel staleness) is
 * deterministic.
 */
import { jest } from '@jest/globals';

// ---- Chainable proxy (same shape as tests/helpers/three-stub.mjs) ---------

function chainable() {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive || prop === 'valueOf') return () => 0;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'then' || prop === 'parent') return undefined;
      return chainable();
    },
    set() { return true; },
    apply() { return chainable(); },
    construct() { return chainable(); },
  });
}

// Plain object with real fields, chainable for everything else. Lets a stub
// camera hold a real position while absorbing the rest of the THREE API.
function withChainableFallback(target) {
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === Symbol.toPrimitive || prop === 'valueOf') return () => 0;
      if (prop === 'then' || prop === 'parent') return undefined;
      return chainable();
    },
  });
}

// ---- Real-math stubs -------------------------------------------------------

class StubVector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new StubVector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  normalize() {
    const l = Math.hypot(this.x, this.y, this.z);
    if (l > 0) { this.x /= l; this.y /= l; this.z /= l; }
    return this;
  }
  // Y-only rotation, matching the module's horizontal-plane movement math.
  applyEuler(e) {
    const c = Math.cos(e.y);
    const s = Math.sin(e.y);
    const x = this.x * c + this.z * s;
    this.z = -this.x * s + this.z * c;
    this.x = x;
    return this;
  }
  length() { return Math.hypot(this.x, this.y, this.z); }
}

class StubEuler {
  constructor(x = 0, y = 0, z = 0, order = 'XYZ') { this.x = x; this.y = y; this.z = z; this.order = order; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(e) { this.x = e.x; this.y = e.y; this.z = e.z; return this; }
  clone() { return new StubEuler(this.x, this.y, this.z, this.order); }
}

// ---- Controllable renderer/camera the scene module will construct ----------

// state.cameras records every camera initScene creates.
let state;

class StubPerspectiveCamera {
  constructor() {
    const cam = withChainableFallback({
      position: new StubVector3(),
      rotation: new StubEuler(0, 0, 0, 'YXZ'),
    });
    state.cameras.push(cam);
    return cam;
  }
}

class StubGroup {
  constructor() {
    return withChainableFallback({
      position: new StubVector3(),
      rotation: new StubEuler(0, 0, 0, 'YXZ'),
    });
  }
}

class StubWebGLRenderer {
  constructor() {
    return withChainableFallback({
      shadowMap: {},
      xr: { enabled: false },
      setSize() {},
      setPixelRatio() {},
    });
  }
}

function installThreeStubs() {
  state = {
    cameras: [],
  };
  globalThis.THREE = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'Vector3') return StubVector3;
      if (prop === 'Euler') return StubEuler;
      if (prop === 'PerspectiveCamera') return StubPerspectiveCamera;
      if (prop === 'Group') return StubGroup;
      if (prop === 'WebGLRenderer') return StubWebGLRenderer;
      if (prop === Symbol.toPrimitive) return () => 0;
      return chainable();
    },
  });
}

// ---- Recording DOM ----------------------------------------------------------

let docListeners = {};
let winListeners = {};
let els = {};
let rafQueue = [];

// Both joystick zones share this geometry: a 70px base whose center is (55, 535).
const BASE_RECT = { left: 20, top: 500, width: 70, height: 70 };
const CX = 55;
const CY = 535;

function makeZone(withFixed) {
  const listeners = {};
  const base = withFixed
    ? { getBoundingClientRect: () => ({ ...BASE_RECT }) }
    : null;
  const thumb = withFixed ? { style: {} } : null;
  return {
    base,
    thumb,
    addEventListener(type, fn) { listeners[type] = fn; },
    querySelector(sel) { return sel.includes('base') ? base : thumb; },
    fire(type, event = {}) { if (listeners[type]) listeners[type](event); },
  };
}

function installDom({ zoneFixed = true } = {}) {
  docListeners = {};
  winListeners = {};
  rafQueue = [];
  els = {
    'joystick-zone': makeZone(zoneFixed),
    'look-joystick-zone': makeZone(zoneFixed),
    'tap-zone': makeZone(false),
  };
  globalThis.document = {
    addEventListener(type, fn) { docListeners[type] = fn; },
    removeEventListener() {},
    getElementById(id) { return els[id] || null; },
    querySelector() { return null; }, // no open dialog by default
    pointerLockElement: null,
    createElement() { return { width: 0, height: 0, style: {}, getContext() { return chainable(); } }; },
  };
  globalThis.window = {
    addEventListener(type, fn) { winListeners[type] = fn; },
    removeEventListener() {},
    innerWidth: 1024,
    innerHeight: 768,
    devicePixelRatio: 1,
  };
  globalThis.navigator = {};
  globalThis.requestAnimationFrame = (cb) => rafQueue.push(cb);
}

function flushRaf() {
  const queue = rafQueue;
  rafQueue = [];
  queue.forEach((cb) => cb());
}

// ---- Harness ----------------------------------------------------------------

async function load(domOptions) {
  installThreeStubs();
  installDom(domOptions);
  jest.resetModules();
  const m = await import('../www/shared/js/controls-1.0.0.js');
  const scene = await import('../www/shared/js/scene-1.0.0.min.js');
  return { m, scene };
}

// Same, but with the scene initialized so getCamera()/getRenderer() are live.
async function loadWithScene(domOptions) {
  const { m, scene } = await load(domOptions);
  scene.initScene({}, {});
  return { m, scene };
}

const T = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
const noop = () => {};
const zone = (id) => els[id];
const press = (code) => docListeners.keydown({ code });
const release = (code) => docListeners.keyup({ code });
const mockNow = (t) => jest.spyOn(globalThis.performance, 'now').mockReturnValue(t);

const SPEED = 6.5;
const LOOK_SENS = 1.2;

afterEach(() => {
  jest.restoreAllMocks();
  delete globalThis.THREE;
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.navigator;
  delete globalThis.requestAnimationFrame;
});

// ---- Movement joystick (left touch zone) -------------------------------------

describe('the movement joystick', () => {
  test('touchstart anchors to the fixed base center and offsets the thumb', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    zone('joystick-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(1, CX + 5, CY - 5)] });
    expect(zone('joystick-zone').thumb.style.transform).toBe('translate(5px, -5px)');
  });

  test('a full-right drag strafes at full speed and clamps the thumb to 35px', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    zone('joystick-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(1, CX, CY)] });
    zone('joystick-zone').fire('touchmove', { preventDefault: noop, touches: [T(1, CX + 300, CY)] });
    flushRaf();
    expect(zone('joystick-zone').thumb.style.transform).toBe('translate(35px, 0px)');
    m.updateControls(0.1, false);
    const p = m.getPlayerPosition();
    expect(p.x).toBeCloseTo(SPEED * 0.1, 6); // input clamps to 1, full stride
    expect(p.z).toBeCloseTo(0, 6);
  });

  test('a forward drag walks forward and bypasses pause', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    zone('joystick-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(1, CX, CY)] });
    zone('joystick-zone').fire('touchmove', { preventDefault: noop, touches: [T(1, CX, CY - 65)] });
    m.updateControls(0.2, true); // paused, but an active joystick keeps moving
    const p = m.getPlayerPosition();
    expect(p.z).toBeCloseTo(-SPEED * 0.2, 6);
    expect(p.y).toBeCloseTo(1.7, 6);
  });

  test('touchmove visuals batch to one rAF per burst, last position wins', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    zone('joystick-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(1, CX, CY)] });
    zone('joystick-zone').fire('touchmove', { preventDefault: noop, touches: [T(1, CX + 10, CY)] });
    zone('joystick-zone').fire('touchmove', { preventDefault: noop, touches: [T(1, CX + 21, CY)] });
    expect(rafQueue).toHaveLength(1);
    flushRaf();
    expect(zone('joystick-zone').thumb.style.transform).toBe('translate(21px, 0px)');
  });

  test('only the tracked finger steers; other identifiers are ignored', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    zone('joystick-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(1, CX, CY)] });
    zone('joystick-zone').fire('touchmove', { preventDefault: noop, touches: [T(9, CX + 300, CY)] });
    m.updateControls(0.1, false);
    expect(m.getPlayerPosition().x).toBeCloseTo(0, 6);
    // A second finger lifting doesn't release the stick either.
    zone('joystick-zone').fire('touchend', { changedTouches: [T(9, 0, 0)] });
    zone('joystick-zone').fire('touchmove', { preventDefault: noop, touches: [T(1, CX + 35, CY)] });
    m.updateControls(0.1, false);
    expect(m.getPlayerPosition().x).toBeCloseTo(SPEED * 0.1, 6);
  });

  test('touchend recenters the thumb and stops the walk', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    zone('joystick-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(1, CX, CY)] });
    zone('joystick-zone').fire('touchmove', { preventDefault: noop, touches: [T(1, CX + 35, CY)] });
    m.updateControls(0.1, false);
    zone('joystick-zone').fire('touchend', { changedTouches: [T(1, CX + 35, CY)] });
    expect(zone('joystick-zone').thumb.style.transform).toBe('translate(0, 0)');
    const before = m.getPlayerPosition();
    m.updateControls(0.5, false);
    expect(m.getPlayerPosition().x).toBeCloseTo(before.x, 6);
  });

  test('without fixed joystick elements the touch point itself is the center', async () => {
    const { m } = await load({ zoneFixed: false });
    m.initControls({ spawn: { x: 0, z: 0 } });
    zone('joystick-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(1, 100, 300)] });
    zone('joystick-zone').fire('touchmove', { preventDefault: noop, touches: [T(1, 135, 300)] });
    flushRaf(); // visual update with no thumb element must not throw
    m.updateControls(0.1, false);
    expect(m.getPlayerPosition().x).toBeCloseTo(SPEED * 0.1, 6);
    zone('joystick-zone').fire('touchend', { changedTouches: [T(1, 135, 300)] });
    m.updateControls(0.1, false);
    expect(m.getPlayerPosition().x).toBeCloseTo(SPEED * 0.1, 6);
  });

  test('an empty touchstart and a move without a start are both ignored', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    zone('joystick-zone').fire('touchmove', { preventDefault: noop, touches: [T(1, CX + 35, CY)] });
    zone('joystick-zone').fire('touchstart', { preventDefault: noop, changedTouches: [] });
    zone('joystick-zone').fire('touchend', { changedTouches: [T(1, 0, 0)] });
    m.updateControls(0.5, false);
    const p = m.getPlayerPosition();
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });
});

// ---- Look joystick (right touch zone) ----------------------------------------

describe('the look joystick', () => {
  test('dragging right yaws the view right, scaled by sensitivity and dt', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    zone('look-joystick-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(2, CX, CY)] });
    zone('look-joystick-zone').fire('touchmove', { preventDefault: noop, touches: [T(2, CX + 35, CY)] });
    m.updateControls(0.5, false);
    expect(m.getPlayerRotation().y).toBeCloseTo(-1 * LOOK_SENS * 0.5, 6);
    expect(m.getPlayerRotation().x).toBeCloseTo(0, 6);
  });

  test('dragging down pitches down and clamps at straight down', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    zone('look-joystick-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(2, CX, CY)] });
    zone('look-joystick-zone').fire('touchmove', { preventDefault: noop, touches: [T(2, CX, CY + 65)] });
    flushRaf();
    // The thumb visual clamps to the 35px base ring even on an over-drag.
    expect(zone('look-joystick-zone').thumb.style.transform).toBe('translate(0px, 35px)');
    m.updateControls(10, false); // way past the vertical clamp
    expect(m.getPlayerRotation().x).toBeCloseTo(-Math.PI / 2, 6);
  });

  test('the thumb visual follows the drag and recenters on release', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    zone('look-joystick-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(2, CX, CY)] });
    zone('look-joystick-zone').fire('touchmove', { preventDefault: noop, touches: [T(2, CX + 21, CY - 21)] });
    flushRaf();
    expect(zone('look-joystick-zone').thumb.style.transform).toBe('translate(21px, -21px)');
    m.updateControls(0.5, false);
    const yaw = m.getPlayerRotation().y;
    zone('look-joystick-zone').fire('touchend', { changedTouches: [T(2, CX + 21, CY - 21)] });
    expect(zone('look-joystick-zone').thumb.style.transform).toBe('translate(0, 0)');
    m.updateControls(0.5, false);
    expect(m.getPlayerRotation().y).toBeCloseTo(yaw, 6); // held view, no drift
  });

  test('the look joystick bypasses pause', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    zone('look-joystick-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(2, CX, CY)] });
    zone('look-joystick-zone').fire('touchmove', { preventDefault: noop, touches: [T(2, CX + 35, CY)] });
    m.updateControls(0.5, true);
    expect(m.getPlayerRotation().y).toBeCloseTo(-0.6, 6);
  });

  test('a move for a different finger leaves the view alone', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    zone('look-joystick-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(2, CX, CY)] });
    zone('look-joystick-zone').fire('touchmove', { preventDefault: noop, touches: [T(8, CX + 35, CY)] });
    m.updateControls(0.5, false);
    expect(m.getPlayerRotation().y).toBeCloseTo(0, 6);
  });

  test('without a fixed base the touch point is the rotation center', async () => {
    const { m } = await load({ zoneFixed: false });
    m.initControls({ spawn: { x: 0, z: 0 } });
    zone('look-joystick-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(2, 200, 400)] });
    zone('look-joystick-zone').fire('touchmove', { preventDefault: noop, touches: [T(2, 235, 400)] });
    m.updateControls(0.5, false);
    expect(m.getPlayerRotation().y).toBeCloseTo(-0.6, 6);
  });
});

// ---- Tap zone -----------------------------------------------------------------

describe('the tap zone', () => {
  test('a quick, still tap reports its starting screen coordinates', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    const onTap = jest.fn();
    m.setTapCallback(onTap);
    const now = mockNow(1000);
    zone('tap-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(3, 120, 240)] });
    now.mockReturnValue(1300);
    zone('tap-zone').fire('touchend', { changedTouches: [T(3, 124, 243)] });
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onTap).toHaveBeenCalledWith(120, 240);
  });

  test('a long press or a far drag is not a tap', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    const onTap = jest.fn();
    m.setTapCallback(onTap);
    const now = mockNow(1000);
    zone('tap-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(3, 100, 100)] });
    now.mockReturnValue(1600); // 600ms > the 500ms tap window
    zone('tap-zone').fire('touchend', { changedTouches: [T(3, 100, 100)] });
    now.mockReturnValue(2000);
    zone('tap-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(4, 100, 100)] });
    now.mockReturnValue(2100);
    zone('tap-zone').fire('touchend', { changedTouches: [T(4, 150, 100)] }); // 50px > the 30px window
    expect(onTap).not.toHaveBeenCalled();
  });

  test('touchend without a tracked touch (or for another finger) does nothing', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    const onTap = jest.fn();
    m.setTapCallback(onTap);
    const now = mockNow(1000);
    zone('tap-zone').fire('touchend', { changedTouches: [T(3, 10, 10)] }); // never started
    zone('tap-zone').fire('touchstart', { preventDefault: noop, changedTouches: [T(3, 10, 10)] });
    zone('tap-zone').fire('touchmove', {}); // tracked but intentionally inert
    now.mockReturnValue(1100);
    zone('tap-zone').fire('touchend', { changedTouches: [T(7, 10, 10)] }); // wrong finger
    expect(onTap).not.toHaveBeenCalled();
  });
});

// ---- Pointer-lock mouse look ----------------------------------------------------

describe('pointer-lock mouse look', () => {
  test('locked mouse movement rotates the view once, then is consumed', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    globalThis.document.pointerLockElement = {};
    docListeners.mousemove({ movementX: 100, movementY: 50 });
    m.updateControls(0.016, false);
    let r = m.getPlayerRotation();
    expect(r.y).toBeCloseTo(-100 * 0.002, 6);
    expect(r.x).toBeCloseTo(-50 * 0.002, 6);
    m.updateControls(0.016, false); // deltas were reset after the frame
    r = m.getPlayerRotation();
    expect(r.y).toBeCloseTo(-0.2, 6);
    expect(r.x).toBeCloseTo(-0.1, 6);
  });

  test('without pointer lock the mouse is ignored', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    docListeners.mousemove({ movementX: 500, movementY: 500 });
    m.updateControls(0.016, false);
    expect(m.getPlayerRotation().y).toBeCloseTo(0, 6);
  });

  test('pause discards pending mouse deltas instead of banking them', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    globalThis.document.pointerLockElement = {};
    docListeners.mousemove({ movementX: 100, movementY: 0 });
    m.updateControls(0.016, true);
    expect(m.getPlayerRotation().y).toBeCloseTo(0, 6);
    m.updateControls(0.016, false); // resuming must not replay the old delta
    expect(m.getPlayerRotation().y).toBeCloseTo(0, 6);
  });
});

// ---- Quest wheel input ------------------------------------------------------------

describe('Quest thumbstick wheel input', () => {
  test('wheel deltas walk and strafe, then stop dead after the stale window', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    const now = mockNow(1000);
    const preventDefault = jest.fn();
    docListeners.wheel({ preventDefault, deltaX: 50, deltaY: -100, deltaMode: 0 });
    expect(preventDefault).toHaveBeenCalled();
    now.mockReturnValue(1040); // within the 80ms stale threshold
    m.updateControls(0.1, false);
    // moveX = 50*0.004 = 0.2, moveZ = 100*0.004 = 0.4, then normalized
    const norm = Math.hypot(0.2, 0.4);
    const p = m.getPlayerPosition();
    expect(p.x).toBeCloseTo((0.2 / norm) * SPEED * 0.1, 6);
    expect(p.z).toBeCloseTo(-(0.4 / norm) * SPEED * 0.1, 6);
    now.mockReturnValue(1500); // stick released long ago
    m.updateControls(0.1, false);
    expect(m.getPlayerPosition().x).toBeCloseTo(p.x, 6);
    expect(m.getPlayerPosition().z).toBeCloseTo(p.z, 6);
  });

  test('line-mode deltas are scaled to pixels (45-degree diagonal)', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    const now = mockNow(1000);
    docListeners.wheel({ preventDefault: noop, deltaX: 5, deltaY: -5, deltaMode: 1 });
    now.mockReturnValue(1010);
    m.updateControls(0.1, false);
    const p = m.getPlayerPosition();
    expect(p.x).toBeCloseTo(-p.z, 6); // equal strafe and stride
    expect(p.x).toBeGreaterThan(0);
  });

  test('page-mode deltas are scaled and clamped to the -1..1 stick range', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    const now = mockNow(1000);
    docListeners.wheel({ preventDefault: noop, deltaX: 1, deltaY: -10, deltaMode: 2 });
    now.mockReturnValue(1010);
    m.updateControls(0.1, false);
    // moveX = 100*0.004 = 0.4; moveZ would be 4 but clamps to 1
    const norm = Math.hypot(0.4, 1);
    const p = m.getPlayerPosition();
    expect(p.x).toBeCloseTo((0.4 / norm) * SPEED * 0.1, 6);
    expect(p.z).toBeCloseTo(-(1 / norm) * SPEED * 0.1, 6);
  });

  test('an open dialog wins: the wheel scrolls the dialog and halts the player', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    const now = mockNow(1000);
    docListeners.wheel({ preventDefault: noop, deltaX: 0, deltaY: -100, deltaMode: 0 });
    globalThis.document.querySelector = () => ({}); // a visible [role="dialog"]
    const preventDefault = jest.fn();
    docListeners.wheel({ preventDefault, deltaX: 0, deltaY: -100, deltaMode: 0 });
    expect(preventDefault).not.toHaveBeenCalled();
    now.mockReturnValue(1010);
    m.updateControls(0.1, false); // prior wheel input was zeroed by the dialog
    expect(m.getPlayerPosition().z).toBeCloseTo(0, 6);
  });

  test('under pointer lock the wheel belongs to the desktop browser', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    globalThis.document.pointerLockElement = {};
    const preventDefault = jest.fn();
    docListeners.wheel({ preventDefault, deltaX: 0, deltaY: -100, deltaMode: 0 });
    expect(preventDefault).not.toHaveBeenCalled();
    m.updateControls(0.1, false);
    expect(m.getPlayerPosition().z).toBeCloseTo(0, 6);
  });
});

// ---- Keyboard release edges -------------------------------------------------------

describe('keyboard release edges', () => {
  test('releasing ArrowRight and ArrowDown stops the diagonal', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    press('ArrowRight');
    press('ArrowDown');
    m.updateControls(0.1, false);
    const step = (SPEED * 0.1) / Math.SQRT2;
    let p = m.getPlayerPosition();
    expect(p.x).toBeCloseTo(step, 6);
    expect(p.z).toBeCloseTo(step, 6);
    release('ArrowRight');
    release('ArrowDown');
    m.updateControls(0.5, false);
    p = m.getPlayerPosition();
    expect(p.x).toBeCloseTo(step, 6);
    expect(p.z).toBeCloseTo(step, 6);
  });

  test('ShiftRight sprints and drops back to walking speed on release', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    press('KeyW');
    press('ShiftRight');
    m.updateControls(0.1, false);
    expect(m.getPlayerPosition().z).toBeCloseTo(-SPEED * 1.8 * 0.1, 6);
    release('ShiftRight');
    m.updateControls(0.1, false);
    expect(m.getPlayerPosition().z).toBeCloseTo(-SPEED * 1.8 * 0.1 - SPEED * 0.1, 6);
  });
});

// ---- Gamepad polling -----------------------------------------------------------

function makePad({ id = 'Generic Gamepad', axes = [0, 0], buttons = [] } = {}) {
  const btns = Array.from({ length: 8 }, (_, i) => ({ pressed: buttons.includes(i) }));
  return { id, connected: true, axes, buttons: btns };
}

describe('gamepad polling', () => {
  test('the left stick of a single pad drives movement', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    globalThis.navigator.getGamepads = () => [null, makePad({ axes: [0.6, -0.8] })];
    m.updateControls(0.1, false);
    expect(m.isGamepadActive()).toBe(true);
    const p = m.getPlayerPosition();
    expect(p.x).toBeCloseTo(0.6 * SPEED * 0.1, 6); // (0.6, 0.8) is already unit length
    expect(p.z).toBeCloseTo(-0.8 * SPEED * 0.1, 6);
  });

  test('the right stick of a four-axis pad looks around', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    globalThis.navigator.getGamepads = () => [makePad({ axes: [0, 0, 0.5, -0.25] })];
    m.updateControls(0.1, false);
    const r = m.getPlayerRotation();
    expect(r.y).toBeCloseTo(-0.5 * LOOK_SENS * 0.1, 6);
    expect(r.x).toBeCloseTo(0.25 * LOOK_SENS * 0.1, 6);
    expect(m.getPlayerPosition().x).toBeCloseTo(0, 6);
  });

  test('stick noise inside the deadzone neither moves nor rotates', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    globalThis.navigator.getGamepads = () => [makePad({ axes: [0.1, -0.14, 0.05, 0.12] })];
    m.updateControls(0.1, false);
    expect(m.isGamepadActive()).toBe(true);
    expect(m.getPlayerPosition().x).toBeCloseTo(0, 6);
    expect(m.getPlayerPosition().z).toBeCloseTo(0, 6);
    expect(m.getPlayerRotation().y).toBeCloseTo(0, 6);
  });

  test('the trigger reports just-pressed for exactly one frame per press', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    let pressed = [7];
    globalThis.navigator.getGamepads = () => [makePad({ axes: [0, 0], buttons: pressed })];
    m.updateControls(0.016, false);
    expect(m.isGamepadTriggerJustPressed()).toBe(true);
    m.updateControls(0.016, false); // still held
    expect(m.isGamepadTriggerJustPressed()).toBe(false);
    pressed = [];
    m.updateControls(0.016, false); // released
    expect(m.isGamepadTriggerJustPressed()).toBe(false);
    pressed = [0]; // face button counts too
    m.updateControls(0.016, false);
    expect(m.isGamepadTriggerJustPressed()).toBe(true);
  });

  test('separate left/right controllers split movement and look', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    globalThis.navigator.getGamepads = () => [
      makePad({ id: 'Oculus Touch (Left)', axes: [1, 0] }),          // 2-axis fallback
      makePad({ id: 'Oculus Touch (Right)', axes: [0, 0, 0, 0.6], buttons: [0] }),
    ];
    m.updateControls(0.1, false);
    expect(m.isGamepadActive()).toBe(true);
    expect(m.getPlayerPosition().x).toBeCloseTo(SPEED * 0.1, 6);     // pure strafe
    expect(m.getPlayerRotation().x).toBeCloseTo(-0.6 * LOOK_SENS * 0.1, 6);
    expect(m.getPlayerRotation().y).toBeCloseTo(0, 6);
    expect(m.isGamepadTriggerJustPressed()).toBe(true);
    m.updateControls(0.1, false);
    expect(m.isGamepadTriggerJustPressed()).toBe(false);
  });

  test('disconnecting the last pad deactivates; others keep it alive', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    let pads = [makePad({ axes: [0.6, -0.8] })];
    globalThis.navigator.getGamepads = () => pads;
    winListeners.gamepadconnected({ gamepad: pads[0] });
    m.updateControls(0.1, false);
    expect(m.isGamepadActive()).toBe(true);
    winListeners.gamepaddisconnected({ gamepad: {} }); // one still connected
    expect(m.isGamepadActive()).toBe(true);
    pads = [null];
    winListeners.gamepaddisconnected({ gamepad: {} }); // none left
    expect(m.isGamepadActive()).toBe(false);
    m.updateControls(0.1, false); // polling an empty pad list stays inactive
    expect(m.isGamepadActive()).toBe(false);
    expect(m.isGamepadTriggerJustPressed()).toBe(false);
  });

  test('gamepad input bypasses pause', async () => {
    const { m } = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    globalThis.navigator.getGamepads = () => [makePad({ axes: [0, -1] })];
    m.updateControls(0.1, true);
    expect(m.getPlayerPosition().z).toBeCloseTo(-SPEED * 0.1, 6);
  });
});

// ---- No WebXR --------------------------------------------------------------------

describe('no WebXR', () => {
  test('a browser that offers XR is never asked for a session', async () => {
    const { m } = await loadWithScene();
    const xr = { isSessionSupported: jest.fn(async () => true), requestSession: jest.fn() };
    globalThis.navigator.xr = xr;
    m.initControls({ spawn: { x: 0, z: 0 } });
    await new Promise((resolve) => setImmediate(resolve)); // let any promise chain settle
    m.updateControls(0.016, false);
    expect(xr.isSessionSupported).not.toHaveBeenCalled();
    expect(xr.requestSession).not.toHaveBeenCalled();
  });
});

// ---- Camera follow ---------------------------------------------------------------

describe('camera follow (initScene + controls)', () => {
  test('initControls aims the scene camera at the spawn point', async () => {
    const { m } = await loadWithScene();
    m.initControls({ spawn: { x: -3, z: 8 }, rotation: { yaw: 1.1 } });
    const camera = state.cameras[0];
    expect(camera.position.x).toBe(-3);
    expect(camera.position.y).toBeCloseTo(1.7, 6);
    expect(camera.position.z).toBe(8);
    expect(camera.rotation.y).toBeCloseTo(1.1, 6);
  });

  test('walking drives the camera to the player every frame', async () => {
    const { m } = await loadWithScene();
    m.initControls({ spawn: { x: 0, z: 0 } });
    press('KeyW');
    m.updateControls(0.1, false);
    release('KeyW');
    const camera = state.cameras[0];
    const p = m.getPlayerPosition();
    expect(p.z).toBeCloseTo(-SPEED * 0.1, 6);
    expect(camera.position.z).toBeCloseTo(p.z, 6);
    expect(camera.position.y).toBeCloseTo(1.7, 6);
    expect(camera.rotation.y).toBeCloseTo(m.getPlayerRotation().y, 6);
  });
});
