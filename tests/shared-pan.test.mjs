// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/pan-1.0.0.js — the portrait view controls
 * the view-only experiences (gavin, jamar) mount at the bottom center of
 * the screen: pan arrows that yaw the fixed camera, and an optional zoom
 * pair that offsets the FOV, both clamped and both portrait-only.
 *
 * The module builds real DOM and does real vector math, so unlike the
 * chainable proxy in helpers/three-stub.mjs these tests install a tiny
 * REAL Vector3 (set/copy/sub/add/applyAxisAngle) plus a recording
 * document/window, and then drive the captured event listeners by hand:
 * press a button, tick updatePortraitControls(dt), and assert on what the
 * stub camera was told.
 *
 * Geometry used throughout: camera at the origin looking down -Z at
 * (0, 0, -10). "Pan right" must therefore move the lookAt target toward
 * +X (the camera's right), the regression the sign convention comment in
 * the source exists to protect.
 */
import { jest } from '@jest/globals';

// ---- Stub THREE: just enough real math for the module's one rotation ----

class StubVector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  applyAxisAngle(axis, angle) {
    // Full Rodrigues rotation about a unit axis: the module rotates about
    // +Y for the yaw and about a computed right-hand axis for the tilt.
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const { x: kx, y: ky, z: kz } = axis;
    const { x, y, z } = this;
    const dot = kx * x + ky * y + kz * z;
    this.x = x * cos + (ky * z - kz * y) * sin + kx * dot * (1 - cos);
    this.y = y * cos + (kz * x - kx * z) * sin + ky * dot * (1 - cos);
    this.z = z * cos + (kx * y - ky * x) * sin + kz * dot * (1 - cos);
    return this;
  }
}

// ---- Stub DOM ------------------------------------------------------------

function makeEl(tag) {
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    parentNode: null,
    attrs: {},
    listeners: {},
    classes: new Set(),
    innerHTML: '',
    type: '',
    title: '',
  };
  Object.defineProperty(el, 'className', {
    get() { return [...el.classes].join(' '); },
    set(value) { el.classes = new Set(String(value).split(/\s+/).filter(Boolean)); },
  });
  el.classList = {
    add: (...cs) => cs.forEach((c) => el.classes.add(c)),
    remove: (...cs) => cs.forEach((c) => el.classes.delete(c)),
    toggle: (c, force) => {
      const on = force === undefined ? !el.classes.has(c) : !!force;
      if (on) el.classes.add(c); else el.classes.delete(c);
      return on;
    },
    contains: (c) => el.classes.has(c),
  };
  el.setAttribute = (k, v) => { el.attrs[k] = String(v); };
  el.getAttribute = (k) => (k in el.attrs ? el.attrs[k] : null);
  el.addEventListener = (type, fn) => { (el.listeners[type] ||= []).push(fn); };
  el.fire = (type, event = {}) => { (el.listeners[type] || []).forEach((fn) => fn(event)); };
  el.appendChild = (child) => { child.parentNode = el; el.children.push(child); return child; };
  el.removeChild = (child) => { el.children = el.children.filter((c) => c !== child); child.parentNode = null; };
  el.setPointerCapture = jest.fn();
  return el;
}

function installGlobals({ width = 400, height = 800 } = {}) {
  globalThis.THREE = { Vector3: StubVector3 };
  globalThis.document = {
    body: makeEl('body'),
    createElement: (tag) => makeEl(tag),
  };
  const winListeners = {};
  globalThis.window = {
    innerWidth: width,
    innerHeight: height,
    addEventListener(type, fn) { (winListeners[type] ||= []).push(fn); },
    fire(type, event = {}) { (winListeners[type] || []).forEach((fn) => fn(event)); },
  };
}

function makeCamera() {
  return {
    position: { x: 0, y: 0, z: 0 },
    fov: 60,
    lookAtCalls: [],
    lookAt(...args) {
      this.lookAtCalls.push(args.length === 1
        ? { x: args[0].x, y: args[0].y, z: args[0].z }
        : { x: args[0], y: args[1], z: args[2] });
    },
    projectionUpdates: 0,
    updateProjectionMatrix() { this.projectionUpdates++; },
  };
}

// ---- Harness ---------------------------------------------------------------

const LOOK_AT = { x: 0, y: 0, z: -10 };
const PAN = { speed: 0.4, maxAngle: 0.6 };
const ZOOM = { speed: 18, maxIn: 26, maxOut: 8 };
const BASE_FOV = 72;

/** Import a fresh module instance and init it against the stub globals.
 *  Returns the module, the stub camera, the container, and the buttons
 *  keyed by their aria-labels ('Pan left', 'Zoom in', ...). */
async function setup(options = {}, { width = 400, height = 800 } = {}) {
  installGlobals({ width, height });
  const camera = makeCamera();
  jest.resetModules();
  const m = await import('../www/shared/js/pan-1.0.0.js');
  m.initPortraitControls({
    getCamera: () => camera,
    lookAt: LOOK_AT,
    baseFov: BASE_FOV,
    pan: PAN,
    ...options,
  });
  const container = globalThis.document.body.children[0];
  const buttons = {};
  (container ? container.children : []).forEach((btn) => { buttons[btn.attrs['aria-label']] = btn; });
  return { m, camera, container, buttons };
}

const press = (btn) => btn.fire('pointerdown', { preventDefault: () => {}, pointerId: 1 });
const release = (btn) => btn.fire('pointerup', {});
const lastLookAt = (camera) => camera.lookAtCalls[camera.lookAtCalls.length - 1];

// Touch gesture helpers: a surface stub (the renderer canvas in real life)
// plus per-finger pointer events. Pointer ids stand in for fingers.
const makeSurface = () => Object.assign(makeEl('canvas'), { style: {} });
const touch = (surface, type, id, x, y) =>
  surface.fire(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y });

/** Radians of yaw one dragged pixel produces, mirroring the module's
 *  scene-follows-finger scaling: the visible horizontal angle (from the
 *  camera's vertical FOV and the viewport aspect) spread over the width. */
const radPerPixel = (vfovDeg, width, height) =>
  2 * Math.atan(Math.tan(vfovDeg * Math.PI / 360) * (width / height)) / width;

/** Radians of tilt per vertical pixel: the vertical FOV spans the height. */
const tiltPerPixel = (vfovDeg, height) => vfovDeg * (Math.PI / 180) / height;

afterEach(() => {
  delete globalThis.THREE;
  delete globalThis.document;
  delete globalThis.window;
});

// ---- Construction ----------------------------------------------------------

describe('construction', () => {
  test('pan-only init builds a .ui-float.pan-controls group with two arrows', async () => {
    const { container, buttons } = await setup({ zoom: undefined, baseFov: undefined });
    expect(container.classList.contains('ui-float')).toBe(true);
    expect(container.classList.contains('pan-controls')).toBe(true);
    expect(container.attrs.role).toBe('group');
    expect(container.children).toHaveLength(2);
    expect(Object.keys(buttons).sort()).toEqual(['Pan left', 'Pan right']);
  });

  test('zoom + baseFov adds the zoom pair in the middle: [◀][−][+][▶]', async () => {
    const { container } = await setup({ zoom: ZOOM });
    expect(container.children.map((b) => b.attrs['aria-label']))
      .toEqual(['Pan left', 'Zoom out', 'Zoom in', 'Pan right']);
  });

  test('zoom config without a baseFov stays pan-only (no half-configured zoom)', async () => {
    const { container } = await setup({ zoom: ZOOM, baseFov: undefined });
    expect(container.children).toHaveLength(2);
  });

  test('extraClass lands on the container; re-init never duplicates it', async () => {
    const { m, container } = await setup({ zoom: ZOOM, extraClass: 'my-variant' });
    expect(container.classList.contains('my-variant')).toBe(true);
    m.initPortraitControls({ getCamera: () => makeCamera(), lookAt: LOOK_AT, pan: PAN });
    expect(globalThis.document.body.children).toHaveLength(1);
  });

  test('dispose removes the container and zeroes the offsets', async () => {
    const { m, buttons } = await setup({ zoom: ZOOM });
    press(buttons['Pan right']);
    m.updatePortraitControls(1);
    m.disposePortraitControls();
    expect(globalThis.document.body.children).toHaveLength(0);
    expect(m.getPanAngle()).toBe(0);
    expect(m.getZoomOffset()).toBe(0);
  });
});

// ---- Panning ----------------------------------------------------------------

describe('panning', () => {
  test('holding "Pan right" yaws the view toward +X (the camera\'s right)', async () => {
    const { m, camera, buttons } = await setup();
    press(buttons['Pan right']);
    m.updatePortraitControls(1);          // 1s at 0.4 rad/s
    expect(m.getPanAngle()).toBeCloseTo(0.4, 10);
    const target = lastLookAt(camera);
    expect(target.x).toBeCloseTo(10 * Math.sin(0.4), 10);   // rightward
    expect(target.y).toBeCloseTo(0, 10);
    expect(target.z).toBeCloseTo(-10 * Math.cos(0.4), 10);
  });

  test('holding "Pan left" mirrors to -X', async () => {
    const { m, camera, buttons } = await setup();
    press(buttons['Pan left']);
    m.updatePortraitControls(0.5);
    expect(m.getPanAngle()).toBeCloseTo(-0.2, 10);
    expect(lastLookAt(camera).x).toBeCloseTo(-10 * Math.sin(0.2), 10);
  });

  test('the yaw clamps at maxAngle and dims only that arrow', async () => {
    const { m, buttons } = await setup();
    press(buttons['Pan right']);
    m.updatePortraitControls(10);         // way past the clamp
    expect(m.getPanAngle()).toBeCloseTo(PAN.maxAngle, 10);
    expect(buttons['Pan right'].classList.contains('at-limit')).toBe(true);
    expect(buttons['Pan left'].classList.contains('at-limit')).toBe(false);
  });

  test('releasing holds the view where it is (no snap back)', async () => {
    const { m, buttons } = await setup();
    press(buttons['Pan right']);
    m.updatePortraitControls(1);
    release(buttons['Pan right']);
    m.updatePortraitControls(1);
    m.updatePortraitControls(1);
    expect(m.getPanAngle()).toBeCloseTo(0.4, 10);
  });

  test('panning back to dead center restores the composed aim exactly once', async () => {
    const { m, camera, buttons } = await setup();
    press(buttons['Pan right']);
    m.updatePortraitControls(1);          // +0.4
    release(buttons['Pan right']);
    press(buttons['Pan left']);
    m.updatePortraitControls(1);          // back to exactly 0
    release(buttons['Pan left']);
    expect(m.getPanAngle()).toBe(0);
    const restored = lastLookAt(camera);
    expect(restored).toEqual(LOOK_AT);
    const calls = camera.lookAtCalls.length;
    m.updatePortraitControls(1);          // idle: the camera is left alone
    m.updatePortraitControls(1);
    expect(camera.lookAtCalls.length).toBe(calls);
  });

  test('in landscape a held arrow does nothing', async () => {
    const { m, camera, buttons } = await setup({}, { width: 800, height: 400 });
    press(buttons['Pan right']);
    m.updatePortraitControls(1);
    expect(m.getPanAngle()).toBe(0);
    expect(camera.lookAtCalls).toHaveLength(0);
  });

  test('rotating to landscape mid-pan resets without touching the camera', async () => {
    const { m, camera, buttons } = await setup();
    press(buttons['Pan right']);
    m.updatePortraitControls(1);
    const calls = camera.lookAtCalls.length;
    globalThis.window.innerWidth = 800;
    globalThis.window.innerHeight = 400;
    globalThis.window.fire('resize');     // placeCamera owns the landscape restore
    expect(m.getPanAngle()).toBe(0);
    m.updatePortraitControls(1);
    expect(camera.lookAtCalls.length).toBe(calls);
  });
});

// ---- Zooming ----------------------------------------------------------------

describe('zooming', () => {
  test('holding "Zoom in" narrows the FOV from baseFov and updates the projection', async () => {
    const { m, camera, buttons } = await setup({ zoom: ZOOM });
    press(buttons['Zoom in']);
    m.updatePortraitControls(1);          // 1s at 18 deg/s
    expect(m.getZoomOffset()).toBeCloseTo(-18, 10);
    expect(camera.fov).toBeCloseTo(BASE_FOV - 18, 10);
    expect(camera.projectionUpdates).toBeGreaterThan(0);
  });

  test('zoom clamps at maxIn / maxOut and dims the spent button', async () => {
    const { m, camera, buttons } = await setup({ zoom: ZOOM });
    press(buttons['Zoom in']);
    m.updatePortraitControls(10);
    expect(camera.fov).toBeCloseTo(BASE_FOV - ZOOM.maxIn, 10);
    expect(buttons['Zoom in'].classList.contains('at-limit')).toBe(true);
    release(buttons['Zoom in']);
    press(buttons['Zoom out']);
    m.updatePortraitControls(10);
    expect(camera.fov).toBeCloseTo(BASE_FOV + ZOOM.maxOut, 10);
    expect(buttons['Zoom out'].classList.contains('at-limit')).toBe(true);
    expect(buttons['Zoom in'].classList.contains('at-limit')).toBe(false);
  });

  test('zooming back to dead center restores baseFov exactly once', async () => {
    const { m, camera, buttons } = await setup({ zoom: ZOOM });
    press(buttons['Zoom in']);
    m.updatePortraitControls(1);          // -18
    release(buttons['Zoom in']);
    press(buttons['Zoom out']);
    m.updatePortraitControls(1);          // back to exactly 0
    release(buttons['Zoom out']);
    expect(m.getZoomOffset()).toBe(0);
    expect(camera.fov).toBe(BASE_FOV);
    const updates = camera.projectionUpdates;
    m.updatePortraitControls(1);          // idle: the projection is left alone
    expect(camera.projectionUpdates).toBe(updates);
  });

  test('pan and zoom compose in the same frame', async () => {
    const { m, camera, buttons } = await setup({ zoom: ZOOM });
    press(buttons['Pan right']);
    press(buttons['Zoom in']);
    m.updatePortraitControls(1);
    expect(lastLookAt(camera).x).toBeCloseTo(10 * Math.sin(0.4), 10);
    expect(camera.fov).toBeCloseTo(BASE_FOV - 18, 10);
  });
});

// ---- Input paths -------------------------------------------------------------

describe('keyboard and telemetry', () => {
  test('arrow keys drive the holds while portrait: Right pans, Up zooms in', async () => {
    const { m, camera, buttons } = await setup({ zoom: ZOOM });
    globalThis.window.fire('keydown', { code: 'ArrowRight' });
    expect(buttons['Pan right'].classList.contains('held')).toBe(true);
    m.updatePortraitControls(1);
    globalThis.window.fire('keyup', { code: 'ArrowRight' });
    expect(buttons['Pan right'].classList.contains('held')).toBe(false);
    expect(m.getPanAngle()).toBeCloseTo(0.4, 10);
    globalThis.window.fire('keydown', { code: 'ArrowUp' });
    m.updatePortraitControls(1);
    globalThis.window.fire('keyup', { code: 'ArrowUp' });
    expect(camera.fov).toBeCloseTo(BASE_FOV - 18, 10);
    m.updatePortraitControls(1);          // both released: nothing advances
    expect(m.getPanAngle()).toBeCloseTo(0.4, 10);
  });

  test('arrow keys are ignored in landscape, and zoom keys when zoom is off', async () => {
    const landscape = await setup({ zoom: ZOOM }, { width: 800, height: 400 });
    globalThis.window.fire('keydown', { code: 'ArrowRight' });
    landscape.m.updatePortraitControls(1);
    expect(landscape.m.getPanAngle()).toBe(0);

    const panOnly = await setup({ zoom: undefined, baseFov: undefined });
    globalThis.window.fire('keydown', { code: 'ArrowUp' });
    panOnly.m.updatePortraitControls(1);
    expect(panOnly.m.getZoomOffset()).toBe(0);
  });

  test('Space held on a focused button pans; key repeats do not re-trigger', async () => {
    const { m, buttons } = await setup();
    const preventDefault = jest.fn();
    buttons['Pan left'].fire('keydown', { code: 'Space', repeat: false, preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    buttons['Pan left'].fire('keydown', { code: 'Space', repeat: true, preventDefault });
    m.updatePortraitControls(1);
    buttons['Pan left'].fire('keyup', { code: 'Space' });
    expect(m.getPanAngle()).toBeCloseTo(-0.4, 10);
    m.updatePortraitControls(1);
    expect(m.getPanAngle()).toBeCloseTo(-0.4, 10);
  });

  test('blur releases a held button (no stuck pan after tabbing away)', async () => {
    const { m, buttons } = await setup();
    press(buttons['Pan right']);
    buttons['Pan right'].fire('blur');
    m.updatePortraitControls(1);
    expect(m.getPanAngle()).toBe(0);
  });

  test('A and D drive the pan holds, lighting the arrow buttons', async () => {
    const { m, buttons } = await setup();
    globalThis.window.fire('keydown', { code: 'KeyA' });
    expect(buttons['Pan left'].classList.contains('held')).toBe(true);
    m.updatePortraitControls(1);
    globalThis.window.fire('keyup', { code: 'KeyA' });
    expect(buttons['Pan left'].classList.contains('held')).toBe(false);
    expect(m.getPanAngle()).toBeCloseTo(-0.4, 10);
    globalThis.window.fire('keydown', { code: 'KeyD' });
    m.updatePortraitControls(2);              // back through center to +0.4
    globalThis.window.fire('keyup', { code: 'KeyD' });
    expect(m.getPanAngle()).toBeCloseTo(0.4, 10);
  });

  test('W and S hold the tilt at the pan speed, clamped like the swipe', async () => {
    const { m } = await setup();
    globalThis.window.fire('keydown', { code: 'KeyW' });
    m.updatePortraitControls(0.5);            // 0.5s at 0.4 rad/s
    globalThis.window.fire('keyup', { code: 'KeyW' });
    expect(m.getTiltAngle()).toBeCloseTo(0.2, 10);
    m.updatePortraitControls(1);              // released: nothing advances
    expect(m.getTiltAngle()).toBeCloseTo(0.2, 10);
    globalThis.window.fire('keydown', { code: 'KeyS' });
    m.updatePortraitControls(10);             // way past: clamps at the default 0.3
    expect(m.getTiltAngle()).toBeCloseTo(-0.3, 10);
  });

  test('Shift+ArrowUp tilts instead of zooming, and stops on the bare arrow keyup', async () => {
    const { m } = await setup({ zoom: ZOOM });
    globalThis.window.fire('keydown', { code: 'ArrowUp', shiftKey: true });
    m.updatePortraitControls(0.5);
    expect(m.getTiltAngle()).toBeCloseTo(0.2, 10);
    expect(m.getZoomOffset()).toBe(0);        // the zoom pair never engaged
    globalThis.window.fire('keyup', { code: 'ArrowUp' });   // Shift already lifted
    m.updatePortraitControls(1);
    expect(m.getTiltAngle()).toBeCloseTo(0.2, 10);
  });

  test('tilt keys are ignored when maxTilt is 0', async () => {
    const { m } = await setup({ pan: { ...PAN, maxTilt: 0 } });
    globalThis.window.fire('keydown', { code: 'KeyW' });
    m.updatePortraitControls(1);
    expect(m.getTiltAngle()).toBe(0);
  });

  test('onFirstUse tags keyboard tilt as tilt, once', async () => {
    const onFirstUse = jest.fn();
    await setup({ onFirstUse });
    globalThis.window.fire('keydown', { code: 'KeyW' });
    globalThis.window.fire('keyup', { code: 'KeyW' });
    globalThis.window.fire('keydown', { code: 'KeyS' });
    expect(onFirstUse.mock.calls).toEqual([['tilt']]);
  });

  test('onFirstUse fires once per kind, tagged pan or zoom', async () => {
    const onFirstUse = jest.fn();
    const { buttons } = await setup({ zoom: ZOOM, onFirstUse });
    press(buttons['Pan right']);
    release(buttons['Pan right']);
    press(buttons['Pan left']);
    release(buttons['Pan left']);
    press(buttons['Zoom in']);
    release(buttons['Zoom in']);
    expect(onFirstUse.mock.calls).toEqual([['pan'], ['zoom']]);
  });
});

// ---- Touch gestures on the scene surface -------------------------------------
//
// The stub camera boots at fov 60 and the default viewport is 400x800
// portrait, so one dragged pixel is radPerPixel(60, 400, 800) radians of
// yaw until a zoom changes the lens.

describe('swipe and pinch gestures', () => {
  test('a leftward drag pans the view right (the scene follows the finger)', async () => {
    const surface = makeSurface();
    const { m, camera } = await setup({ surface });
    expect(surface.style.touchAction).toBe('none');
    touch(surface, 'pointerdown', 1, 200, 400);
    touch(surface, 'pointermove', 1, 189, 400);   // 11px: the slop leg, no pan yet
    expect(m.getPanAngle()).toBe(0);
    touch(surface, 'pointermove', 1, 89, 400);    // then a 100px pull left
    expect(m.getPanAngle()).toBeCloseTo(100 * radPerPixel(60, 400, 800), 10);
    m.updatePortraitControls(1);
    expect(lastLookAt(camera).x).toBeGreaterThan(0);   // aimed right of center
  });

  test('touchstart on the surface is canceled (no Safari smart zoom or selection)', async () => {
    const surface = makeSurface();
    await setup({ surface });
    const preventDefault = jest.fn();
    surface.fire('touchstart', { cancelable: true, preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    const nonCancelable = jest.fn();
    surface.fire('touchstart', { cancelable: false, preventDefault: nonCancelable });
    expect(nonCancelable).not.toHaveBeenCalled();
  });

  test('movement within the tap slop neither pans nor claims the tap', async () => {
    const surface = makeSurface();
    const { m } = await setup({ surface });
    touch(surface, 'pointerdown', 1, 200, 400);
    touch(surface, 'pointermove', 1, 205, 403);   // ~5.8px of wobble
    touch(surface, 'pointerup', 1, 205, 403);
    expect(m.getPanAngle()).toBe(0);
    expect(m.gestureClaimedTap()).toBe(false);
  });

  test('the drag clamps at maxAngle and dims the spent arrow', async () => {
    const surface = makeSurface();
    const { m, buttons } = await setup({ surface });
    touch(surface, 'pointerdown', 1, 390, 400);
    touch(surface, 'pointermove', 1, 380, 400);
    touch(surface, 'pointermove', 1, -2000, 400);
    expect(m.getPanAngle()).toBeCloseTo(PAN.maxAngle, 10);
    expect(buttons['Pan right'].classList.contains('at-limit')).toBe(true);
  });

  test('a finished drag claims the tap that ends it; the next press clears it', async () => {
    const surface = makeSurface();
    const { m } = await setup({ surface });
    touch(surface, 'pointerdown', 1, 200, 400);
    touch(surface, 'pointermove', 1, 150, 400);
    expect(m.gestureClaimedTap()).toBe(false);    // still mid-gesture
    touch(surface, 'pointerup', 1, 150, 400);
    expect(m.gestureClaimedTap()).toBe(true);     // the touchend tap is the drag's
    touch(surface, 'pointerdown', 1, 150, 400);   // a fresh, clean tap...
    expect(m.gestureClaimedTap()).toBe(false);
    touch(surface, 'pointerup', 1, 150, 400);
    expect(m.gestureClaimedTap()).toBe(false);    // ...still reaches the props
  });

  test('a mouse press is never a gesture and clears a stale claim', async () => {
    const surface = makeSurface();
    const { m } = await setup({ surface });
    touch(surface, 'pointerdown', 1, 200, 400);
    touch(surface, 'pointermove', 1, 100, 400);
    touch(surface, 'pointerup', 1, 100, 400);
    expect(m.gestureClaimedTap()).toBe(true);
    surface.fire('pointerdown', { pointerId: 9, pointerType: 'mouse', clientX: 50, clientY: 50 });
    expect(m.gestureClaimedTap()).toBe(false);    // hybrid devices keep their clicks
    const angle = m.getPanAngle();
    surface.fire('pointermove', { pointerId: 9, pointerType: 'mouse', clientX: 300, clientY: 50 });
    expect(m.getPanAngle()).toBe(angle);          // mouse drags stay untracked
  });

  test('spreading a pinch zooms in, tan-scaled, and clamps at maxIn', async () => {
    const surface = makeSurface();
    const { m, camera, buttons } = await setup({ zoom: ZOOM, surface });
    touch(surface, 'pointerdown', 1, 150, 400);
    touch(surface, 'pointerdown', 2, 250, 400);
    touch(surface, 'pointermove', 2, 250, 400);   // primes the 100px spread
    expect(m.getZoomOffset()).toBe(0);
    touch(surface, 'pointermove', 2, 260, 400);   // spread grows 1.1x
    const expected = (360 / Math.PI) * Math.atan(Math.tan(BASE_FOV * Math.PI / 360) / 1.1) - BASE_FOV;
    expect(m.getZoomOffset()).toBeCloseTo(expected, 10);
    touch(surface, 'pointermove', 2, 850, 400);   // a huge spread hits the clamp
    expect(m.getZoomOffset()).toBeCloseTo(-ZOOM.maxIn, 10);
    expect(buttons['Zoom in'].classList.contains('at-limit')).toBe(true);
    m.updatePortraitControls(1);
    expect(camera.fov).toBeCloseTo(BASE_FOV - ZOOM.maxIn, 10);
    // Lifting one finger hands the gesture to the survivor as a plain pan.
    touch(surface, 'pointerup', 2, 850, 400);
    const before = m.getPanAngle();
    touch(surface, 'pointermove', 1, 100, 400);   // finger 1 pulls 50px left
    expect(m.getPanAngle()).toBeCloseTo(before + 50 * radPerPixel(camera.fov, 400, 800), 10);
  });

  test('without zoom enabled a pinch never zooms, but its centroid still pans', async () => {
    const surface = makeSurface();
    const { m } = await setup({ zoom: undefined, baseFov: undefined, surface });
    touch(surface, 'pointerdown', 1, 150, 400);
    touch(surface, 'pointerdown', 2, 250, 400);
    touch(surface, 'pointermove', 2, 250, 400);
    touch(surface, 'pointermove', 2, 270, 400);   // finger 2 drifts 20px right
    expect(m.getZoomOffset()).toBe(0);
    expect(m.getPanAngle()).toBeCloseTo(-10 * radPerPixel(60, 400, 800), 10);
  });

  test('gestures are inert in landscape unless the scene is alwaysOn', async () => {
    const surface = makeSurface();
    const landscape = await setup({ surface }, { width: 800, height: 400 });
    touch(surface, 'pointerdown', 1, 400, 200);
    touch(surface, 'pointermove', 1, 100, 200);
    touch(surface, 'pointerup', 1, 100, 200);
    expect(landscape.m.getPanAngle()).toBe(0);
    expect(landscape.m.gestureClaimedTap()).toBe(false);   // taps stay taps

    const surface2 = makeSurface();
    const alwaysOn = await setup({ surface: surface2, alwaysOn: true }, { width: 800, height: 400 });
    touch(surface2, 'pointerdown', 1, 400, 200);
    touch(surface2, 'pointermove', 1, 389, 200);
    touch(surface2, 'pointermove', 1, 289, 200);
    expect(alwaysOn.m.getPanAngle()).toBeCloseTo(100 * radPerPixel(60, 800, 400), 10);
  });

  test('a downward drag tilts the view up (the scene follows the finger)', async () => {
    const surface = makeSurface();
    const { m, camera } = await setup({ surface });
    touch(surface, 'pointerdown', 1, 200, 400);
    touch(surface, 'pointermove', 1, 200, 411);   // 11px: the slop leg
    expect(m.getTiltAngle()).toBe(0);
    touch(surface, 'pointermove', 1, 200, 511);   // then a 100px pull down
    const tilt = 100 * tiltPerPixel(60, 800);
    expect(m.getTiltAngle()).toBeCloseTo(tilt, 10);
    m.updatePortraitControls(1);
    expect(lastLookAt(camera).y).toBeCloseTo(10 * Math.sin(tilt), 10);   // aimed up
    expect(lastLookAt(camera).x).toBeCloseTo(0, 10);                    // no yaw drift
  });

  test('an upward drag tilts the view down', async () => {
    const surface = makeSurface();
    const { m, camera } = await setup({ surface });
    touch(surface, 'pointerdown', 1, 200, 400);
    touch(surface, 'pointermove', 1, 200, 389);
    touch(surface, 'pointermove', 1, 200, 339);   // a 50px pull up
    expect(m.getTiltAngle()).toBeCloseTo(-50 * tiltPerPixel(60, 800), 10);
    m.updatePortraitControls(1);
    expect(lastLookAt(camera).y).toBeLessThan(0);
  });

  test('the tilt clamps at maxTilt (default 0.3); maxTilt 0 turns it off', async () => {
    const surface = makeSurface();
    const { m } = await setup({ surface });
    touch(surface, 'pointerdown', 1, 200, 100);
    touch(surface, 'pointermove', 1, 200, 110);
    touch(surface, 'pointermove', 1, 200, 5000);
    expect(m.getTiltAngle()).toBeCloseTo(0.3, 10);

    const surface2 = makeSurface();
    const off = await setup({ surface: surface2, pan: { ...PAN, maxTilt: 0 } });
    touch(surface2, 'pointerdown', 1, 200, 400);
    touch(surface2, 'pointermove', 1, 211, 400);
    touch(surface2, 'pointermove', 1, 111, 300);  // a diagonal pull
    expect(off.m.getTiltAngle()).toBe(0);         // tilt disabled...
    expect(off.m.getPanAngle()).not.toBe(0);      // ...the yaw still answers
  });

  test('a diagonal drag pans and tilts together', async () => {
    const surface = makeSurface();
    const { m } = await setup({ surface });
    touch(surface, 'pointerdown', 1, 200, 400);
    touch(surface, 'pointermove', 1, 211, 400);   // slop spent sideways
    touch(surface, 'pointermove', 1, 111, 350);   // 100px left, 50px up
    expect(m.getPanAngle()).toBeCloseTo(100 * radPerPixel(60, 400, 800), 10);
    expect(m.getTiltAngle()).toBeCloseTo(-50 * tiltPerPixel(60, 800), 10);
  });

  test('tilting back to dead center restores the composed aim once', async () => {
    const surface = makeSurface();
    const { m, camera } = await setup({ surface });
    touch(surface, 'pointerdown', 1, 200, 300);
    touch(surface, 'pointermove', 1, 200, 311);
    touch(surface, 'pointermove', 1, 200, 411);   // 100px down...
    m.updatePortraitControls(1);
    touch(surface, 'pointermove', 1, 200, 311);   // ...and exactly back
    expect(m.getTiltAngle()).toBe(0);
    m.updatePortraitControls(1);
    expect(lastLookAt(camera)).toEqual(LOOK_AT);
    const calls = camera.lookAtCalls.length;
    m.updatePortraitControls(1);                  // idle: camera left alone
    expect(camera.lookAtCalls.length).toBe(calls);
  });

  test('a two-finger centroid drift tilts too', async () => {
    const surface = makeSurface();
    const { m } = await setup({ surface });
    touch(surface, 'pointerdown', 1, 200, 300);
    touch(surface, 'pointerdown', 2, 200, 500);
    touch(surface, 'pointermove', 2, 200, 500);   // primes the spread
    touch(surface, 'pointermove', 2, 200, 560);   // finger 2 drifts 60px down
    expect(m.getTiltAngle()).toBeCloseTo(30 * tiltPerPixel(60, 800), 10);
  });

  test('rotating to landscape mid-tilt resets it', async () => {
    const surface = makeSurface();
    const { m } = await setup({ surface });
    touch(surface, 'pointerdown', 1, 200, 400);
    touch(surface, 'pointermove', 1, 200, 411);
    touch(surface, 'pointermove', 1, 200, 511);
    expect(m.getTiltAngle()).not.toBe(0);
    globalThis.window.innerWidth = 800;
    globalThis.window.innerHeight = 400;
    globalThis.window.fire('resize');
    expect(m.getTiltAngle()).toBe(0);
  });

  test('onFirstUse tags the gestures swipe and pinch, once each', async () => {
    const onFirstUse = jest.fn();
    const surface = makeSurface();
    await setup({ zoom: ZOOM, surface, onFirstUse });
    touch(surface, 'pointerdown', 1, 200, 400);   // drag...
    touch(surface, 'pointermove', 1, 150, 400);
    touch(surface, 'pointerup', 1, 150, 400);
    touch(surface, 'pointerdown', 1, 200, 400);   // ...and again
    touch(surface, 'pointermove', 1, 150, 400);
    touch(surface, 'pointerup', 1, 150, 400);
    touch(surface, 'pointerdown', 1, 150, 400);   // then a pinch
    touch(surface, 'pointerdown', 2, 250, 400);
    touch(surface, 'pointermove', 2, 250, 400);
    touch(surface, 'pointermove', 2, 300, 400);
    expect(onFirstUse.mock.calls).toEqual([['swipe'], ['pinch']]);
  });
});

// ---- Zoom delegation (the mandelbrot infinite dive) ------------------------

describe('zoom delegation', () => {
  const delegate = (limits) => ({
    onDelta: jest.fn(),
    ...(limits ? { limits } : {}),
  });

  test('held buttons stream speed * dt to onDelta and never touch the FOV', async () => {
    const d = delegate();
    const { m, camera, buttons } = await setup({ zoom: { speed: 2 }, zoomDelegate: d });
    press(buttons['Zoom in']);
    m.updatePortraitControls(0.5);
    release(buttons['Zoom in']);
    press(buttons['Zoom out']);
    m.updatePortraitControls(0.25);
    release(buttons['Zoom out']);
    expect(d.onDelta.mock.calls.map(([v]) => v)).toEqual([1, -0.5]);
    expect(m.getZoomOffset()).toBe(0);
    expect(camera.fov).toBe(60);              // the stub camera's own value
    expect(camera.projectionUpdates).toBe(0); // the lens was never re-derived
  });

  test('a delegate needs no baseFov: the zoom pair still renders', async () => {
    const { container } = await setup({
      zoom: { speed: 1 }, baseFov: undefined, zoomDelegate: delegate(),
    });
    expect(container.children.map((b) => b.attrs['aria-label']))
      .toEqual(['Pan left', 'Zoom out', 'Zoom in', 'Pan right']);
  });

  test('the arrow keys drive the delegate: Up positive, Down negative', async () => {
    const d = delegate();
    const { m } = await setup({ zoom: { speed: 1 }, zoomDelegate: d });
    globalThis.window.fire('keydown', { code: 'ArrowUp' });
    m.updatePortraitControls(1);
    globalThis.window.fire('keyup', { code: 'ArrowUp' });
    globalThis.window.fire('keydown', { code: 'ArrowDown' });
    m.updatePortraitControls(1);
    globalThis.window.fire('keyup', { code: 'ArrowDown' });
    expect(d.onDelta.mock.calls.map(([v]) => v)).toEqual([1, -1]);
  });

  test('a pinch hands over log2 of its spread factor, FOV untouched', async () => {
    const d = delegate();
    const surface = makeSurface();
    const { m, camera } = await setup({ zoom: { speed: 1 }, zoomDelegate: d, surface });
    touch(surface, 'pointerdown', 1, 150, 400);
    touch(surface, 'pointerdown', 2, 250, 400);
    touch(surface, 'pointermove', 2, 250, 400);   // primes the 100px spread
    touch(surface, 'pointermove', 2, 350, 400);   // spread doubles: one doubling in
    expect(d.onDelta).toHaveBeenCalledTimes(1);
    expect(d.onDelta.mock.calls[0][0]).toBeCloseTo(1, 10);
    m.updatePortraitControls(1);
    expect(camera.fov).toBe(60);
    expect(m.getZoomOffset()).toBe(0);
  });

  test('limits() is polled every frame and dims the zoom buttons', async () => {
    const lim = { atIn: false, atOut: true };
    const { m, buttons } = await setup({
      zoom: { speed: 1 }, zoomDelegate: delegate(() => lim),
    });
    m.updatePortraitControls(0.016);
    expect(buttons['Zoom in'].classList.contains('at-limit')).toBe(false);
    expect(buttons['Zoom out'].classList.contains('at-limit')).toBe(true);
    lim.atIn = true;                          // content ran out mid-flight...
    lim.atOut = false;
    m.updatePortraitControls(0.016);          // ...and the next frame catches it
    expect(buttons['Zoom in'].classList.contains('at-limit')).toBe(true);
    expect(buttons['Zoom out'].classList.contains('at-limit')).toBe(false);
  });

  test('an orientation flip resets the aim but never emits a delta: depth is world state', async () => {
    const d = delegate();
    const { m, buttons } = await setup({ zoom: { speed: 1 }, zoomDelegate: d });
    press(buttons['Pan right']);
    m.updatePortraitControls(1);
    release(buttons['Pan right']);
    globalThis.window.innerWidth = 800;       // rotate to landscape
    globalThis.window.innerHeight = 400;
    globalThis.window.fire('resize');
    expect(m.getPanAngle()).toBe(0);          // the aim reset as always
    expect(d.onDelta).not.toHaveBeenCalled(); // the dive was left alone
  });
});
