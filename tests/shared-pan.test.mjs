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

  test('setPanLimit moves the clamp for an experience whose eye moves', async () => {
    // The clamp is set once at init, which is right for a scene whose camera
    // never moves and wrong for www/garden, whose zoom is a DOLLY: the same
    // subject subtends 35 degrees from the composed viewpoint and 108 from the
    // near end of the track, so one number is generous at one end and confining
    // at the other. QA: "hard to zoom in on the front corners because my side
    // pan range is limited, which is fine while zoomed out".
    const { m, buttons } = await setup();
    press(buttons['Pan right']);
    m.updatePortraitControls(10);              // way past the clamp
    expect(m.getPanAngle()).toBeCloseTo(PAN.maxAngle, 10);
    expect(buttons['Pan right'].classList.contains('at-limit')).toBe(true);
    release(buttons['Pan right']);

    // Widen it, and the travel that was used up is available again.
    m.setPanLimit(PAN.maxAngle * 2);
    expect(buttons['Pan right'].classList.contains('at-limit')).toBe(false);
    press(buttons['Pan right']);
    m.updatePortraitControls(10);
    expect(m.getPanAngle()).toBeCloseTo(PAN.maxAngle * 2, 10);
    release(buttons['Pan right']);

    // ---- AND A LIMIT THAT SHRINKS BRINGS THE VIEW BACK INSIDE IT --------
    // Otherwise the visitor is left beyond a range they can no longer reach,
    // with the pan buttons refusing to move in either direction. In garden this
    // is what makes pulling the dolly back re-compose the aim.
    m.setPanLimit(PAN.maxAngle);
    expect(m.getPanAngle()).toBeCloseTo(PAN.maxAngle, 10);
    expect(buttons['Pan right'].classList.contains('at-limit')).toBe(true);

    // A no-op when nothing moved, because the caller is a render loop and
    // syncing the dimming is DOM work. Rubbish is refused rather than stored:
    // a negative clamp would invert the comparison and pin the yaw to nonsense.
    m.setPanLimit(PAN.maxAngle);
    m.setPanLimit(-1);
    m.setPanLimit(NaN);
    expect(m.getPanAngle()).toBeCloseTo(PAN.maxAngle, 10);
    m.disposePortraitControls();
  });

  test('resetPortraitAim consumes the offset for an experience that re-aims', async () => {
    // ---- THE BUG THIS SEAM EXISTS FOR, AND IT SHIPPED ------------------
    // The yaw and tilt are an OFFSET FROM the `lookAt` object the experience
    // handed over, and that object is allowed to move: www/garden turns the
    // composed aim onto a newly planted tree. The offset then rode on top of
    // the new aim, so the scene centred the tree and added the visitor's 31.5
    // degrees of pan back on. On a portrait phone, whose frame is 18.7 degrees
    // wide either side, that put the new tree clean off the screen.
    const { m, camera, buttons } = await setup();
    press(buttons['Pan right']);
    m.updatePortraitControls(1);
    release(buttons['Pan right']);
    expect(m.getPanAngle()).toBeCloseTo(0.4, 10);
    expect(buttons['Pan right'].classList.contains('at-limit')).toBe(false);

    m.resetPortraitAim();
    expect(m.getPanAngle()).toBe(0);
    expect(m.getTiltAngle()).toBe(0);

    // AND THE COMPOSED AIM IS WHAT THE CAMERA GETS FROM THE NEXT FRAME ON,
    // which is the half that makes it a reset rather than a bookkeeping
    // change. The caller is expected to have moved `lookAt` itself, which is
    // why garden folds this into an eased move rather than calling it alone.
    m.updatePortraitControls(1);
    expect(lastLookAt(camera)).toEqual(LOOK_AT);

    // The zoom is a separate axis and is deliberately left alone: it is not
    // part of the aim, and an experience re-aiming has said nothing about how
    // close the visitor wanted to be.
    m.disposePortraitControls();
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

// ---- Mouse drag ------------------------------------------------------------
//
// The part used to return early on `pointerType === 'mouse'`, so on every
// machine without a touchscreen the on-canvas drag did nothing at all. Four
// experiences shipped with legends telling desktop visitors to drag.

const mouse = (surface, type, id, x, y, extra = {}) =>
  surface.fire(type, {
    pointerId: id, pointerType: 'mouse', button: 0, clientX: x, clientY: y,
    cancelable: true, preventDefault() { this.defaultPrevented = true; }, ...extra
  });

describe('mouse drag', () => {
  test('A MOUSE DRAG LOOKS AROUND, on the same axes a swipe uses', async () => {
    const surface = makeSurface();
    const { m } = await setup({ surface, zoom: ZOOM, pan: { ...PAN, maxTilt: 0.4 } });

    mouse(surface, 'pointerdown', 1, 200, 400);
    // The tap slop is spent first, so a wobbly click never nudges the view.
    mouse(surface, 'pointermove', 1, 203, 402);
    expect(m.getPanAngle()).toBe(0);
    expect(m.getTiltAngle()).toBe(0);

    // Past the slop it drags, scene-follows-pointer: dragging left reveals
    // what was cropped off the right, so the camera turns the other way.
    mouse(surface, 'pointermove', 1, 260, 400);
    mouse(surface, 'pointermove', 1, 320, 400);
    expect(m.getPanAngle()).toBeLessThan(0);

    // And vertical drags tilt, the axis the keys share.
    const yawOnly = m.getPanAngle();
    mouse(surface, 'pointermove', 1, 320, 300);
    expect(m.getTiltAngle()).toBeLessThan(0);
    expect(m.getPanAngle()).toBe(yawOnly);
    mouse(surface, 'pointerup', 1, 320, 300);
  });

  test('a mouse drag scales the same way a finger drag does', async () => {
    // Same pixels, same result, or the two input paths have drifted and a
    // desktop visitor gets a different scene from a phone one.
    const a = makeSurface();
    const withMouse = await setup({ surface: a, zoom: ZOOM, pan: { ...PAN, maxTilt: 0.4 } });
    mouse(a, 'pointerdown', 1, 200, 400);
    mouse(a, 'pointermove', 1, 220, 400);
    mouse(a, 'pointermove', 1, 300, 340);

    const b = makeSurface();
    const withTouch = await setup({ surface: b, zoom: ZOOM, pan: { ...PAN, maxTilt: 0.4 } });
    touch(b, 'pointerdown', 1, 200, 400);
    touch(b, 'pointermove', 1, 220, 400);
    touch(b, 'pointermove', 1, 300, 340);

    expect(withMouse.m.getPanAngle()).toBeCloseTo(withTouch.m.getPanAngle(), 12);
    expect(withMouse.m.getTiltAngle()).toBeCloseTo(withTouch.m.getTiltAngle(), 12);
  });

  test('a plain click is not a drag, and is never claimed', async () => {
    // The experiences ask gestureClaimedTap() before opening a prop or
    // planting a tree. If a click claimed itself, nothing would ever open.
    const surface = makeSurface();
    const { m } = await setup({ surface, zoom: ZOOM });
    mouse(surface, 'pointerdown', 1, 200, 400);
    mouse(surface, 'pointermove', 1, 202, 401);   // inside the slop
    mouse(surface, 'pointerup', 1, 202, 401);
    expect(m.gestureClaimedTap()).toBe(false);
    expect(m.getPanAngle()).toBe(0);

    // A real drag does claim it, so the release does not also plant a tree.
    mouse(surface, 'pointerdown', 2, 200, 400);
    mouse(surface, 'pointermove', 2, 260, 400);
    mouse(surface, 'pointermove', 2, 300, 400);
    mouse(surface, 'pointerup', 2, 300, 400);
    expect(m.gestureClaimedTap()).toBe(true);
  });

  test('only the primary button drags, and it stops the text selection', async () => {
    const surface = makeSurface();
    const { m } = await setup({ surface, zoom: ZOOM });

    // A right-button drag belongs to the browser.
    mouse(surface, 'pointerdown', 1, 200, 400, { button: 2 });
    mouse(surface, 'pointermove', 1, 300, 400);
    expect(m.getPanAngle()).toBe(0);

    // The primary press cancels its default, or dragging across a canvas
    // starts a selection in the page and the cursor turns into an I-beam.
    const event = {
      pointerId: 2, pointerType: 'mouse', button: 0, clientX: 200, clientY: 400,
      cancelable: true, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }
    };
    surface.fire('pointerdown', event);
    expect(event.defaultPrevented).toBe(true);
  });
});

// ---- Zoom without the looking around ---------------------------------------

describe('an axis switched off with a zero', () => {
  /* WHAT THIS IS FOR. automan wants the zoom and not the pan: the showroom is
   * composed for one view, and once nothing in the room answers a tap (D43)
   * a drag was offering work with no reward and a way to end up facing a
   * wall. A scene says so by passing a zero.
   *
   * maxTilt has always honoured 0. maxAngle required `> 0` and so IGNORED a
   * zero silently, leaving the 0.5 default in place and the scene panning
   * anyway, while `setPanLimit(0)` two hundred lines below accepted it
   * happily. That inconsistency is what this covers.
   */
  const OFF = { speed: 0.4, maxAngle: 0, maxTilt: 0 };

  test('a drag moves neither the yaw nor the tilt', async () => {
    const surface = makeSurface();
    const { m, camera } = await setup({ pan: OFF, zoom: ZOOM, surface });
    touch(surface, 'pointerdown', 1, 200, 400);
    touch(surface, 'pointermove', 1, 189, 400);    // past the slop leg
    touch(surface, 'pointermove', 1, 20, 700);     // a long drag, both axes
    expect(m.getPanAngle()).toBe(0);
    expect(m.getTiltAngle()).toBe(0);

    // AND THE PART NEVER TOUCHES THE AIM AT ALL, which is stronger than
    // "aims at the composed point" and is what the code actually does:
    // `camera.lookAt` is called only while the yaw or tilt is off centre,
    // so with both axes off the camera is left entirely to the experience.
    // Asserted this way round because the first draft of this test looked
    // for a lookAt call, found none, and read as a failure.
    m.updatePortraitControls(1);
    expect(camera.lookAtCalls).toHaveLength(0);
  });

  test('held arrow keys and buttons move nothing either', async () => {
    // The arrows are still BUILT: automan hides them with a class rather than
    // suppressing them, because the +/- zoom keys are gated on the zoom
    // buttons existing. So they have to be inert rather than absent.
    const { m, buttons } = await setup({ pan: OFF, zoom: ZOOM });
    expect(buttons['Pan left']).toBeDefined();
    press(buttons['Pan left']);
    m.updatePortraitControls(1);
    release(buttons['Pan left']);
    expect(m.getPanAngle()).toBe(0);
  });

  test('BUT THE ZOOM IS UNTOUCHED, which is the whole point', async () => {
    const surface = makeSurface();
    const { m, camera } = await setup({ pan: OFF, zoom: ZOOM, surface });

    // A pinch still zooms.
    touch(surface, 'pointerdown', 1, 150, 400);
    touch(surface, 'pointerdown', 2, 250, 400);
    touch(surface, 'pointermove', 2, 250, 400);
    touch(surface, 'pointermove', 2, 260, 400);
    expect(m.getZoomOffset()).toBeLessThan(0);

    // And so does the wheel, in both directions.
    const inAt = m.getZoomOffset();
    surface.fire('wheel', { deltaY: 100, deltaMode: 0, cancelable: true, preventDefault() {} });
    expect(m.getZoomOffset()).toBeGreaterThan(inAt);

    m.updatePortraitControls(1);
    expect(camera.fov).not.toBe(BASE_FOV);
  });
});

// ---- Wheel zoom ------------------------------------------------------------

describe('wheel zoom', () => {
  const wheel = (surface, deltaY, extra = {}) => {
    const event = {
      deltaY, deltaMode: 0, cancelable: true, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...extra
    };
    surface.fire('wheel', event);
    return event;
  };

  test('SCROLL UP ZOOMS IN, scroll down zooms out', async () => {
    const surface = makeSurface();
    const { m } = await setup({ surface, zoom: ZOOM });
    wheel(surface, -100);
    // Zooming in narrows the FOV, so the offset goes negative.
    expect(m.getZoomOffset()).toBeLessThan(0);
    const inAt = m.getZoomOffset();
    wheel(surface, 100);
    expect(m.getZoomOffset()).toBeGreaterThan(inAt);
  });

  test('the page must not scroll out from under the scene', async () => {
    const surface = makeSurface();
    await setup({ surface, zoom: ZOOM });
    expect(wheel(surface, -100).defaultPrevented).toBe(true);
  });

  test('deltaMode is honoured, or a line-mode wheel does nothing', async () => {
    // Firefox reports LINES on some platforms, where a raw 3 taken as pixels
    // is three hundredths of a notch: a wheel that appears not to work.
    const lines = makeSurface();
    const byLine = await setup({ surface: lines, zoom: ZOOM });
    wheel(lines, -3, { deltaMode: 1 });

    const pixels = makeSurface();
    const byPixel = await setup({ surface: pixels, zoom: ZOOM });
    wheel(pixels, -48, { deltaMode: 0 });   // 3 lines at 16 px each

    expect(byLine.m.getZoomOffset()).toBeCloseTo(byPixel.m.getZoomOffset(), 12);
    expect(byLine.m.getZoomOffset()).toBeLessThan(0);
  });

  test('page-mode deltas are honoured too', async () => {
    // deltaMode 2 is rare, but it is documented as handled and an undocumented
    // "handled" is how a wheel comes to do nothing on one browser.
    const pages = makeSurface();
    const byPage = await setup({ surface: pages, zoom: ZOOM }, { width: 400, height: 800 });
    wheel(pages, -1, { deltaMode: 2 });
    expect(byPage.m.getZoomOffset()).toBeLessThan(0);
  });

  test('one fling cannot cross the whole travel', async () => {
    // A trackpad fling can report thousands of pixels in a single event, and
    // one frame that crosses the range reads as a teleport rather than a zoom.
    const surface = makeSurface();
    const { m } = await setup({ surface, zoom: ZOOM });
    wheel(surface, -100);
    const oneNotch = -m.getZoomOffset();
    const huge = makeSurface();
    const flung = await setup({ surface: huge, zoom: ZOOM });
    wheel(huge, -40000);
    expect(-flung.m.getZoomOffset()).toBeLessThan(oneNotch * 4);
  });

  test('the wheel reaches a zoom delegate in the units a pinch speaks', async () => {
    // One path for every zoom input, so a delegate needs no wheel-specific
    // code and cannot disagree with the pinch about which way is in.
    const surface = makeSurface();
    const deltas = [];
    await setup({
      surface,
      zoom: { ...ZOOM, wheel: 0.25 },
      zoomDelegate: { onDelta: (d) => deltas.push(d), limits: () => ({ atIn: false, atOut: false }) }
    });
    wheel(surface, -100);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toBeCloseTo(0.25, 9);
    wheel(surface, 200);
    expect(deltas[1]).toBeCloseTo(-0.5, 9);
  });

  test('a scene with no zoom ignores the wheel entirely', async () => {
    const surface = makeSurface();
    const { m } = await setup({ surface });     // no zoom options
    expect(wheel(surface, -100).defaultPrevented).toBe(false);
    expect(m.getZoomOffset()).toBe(0);
  });
});

// ---- The tilt buttons ------------------------------------------------------

describe('tilt buttons', () => {
  test('a scene that does not ask for them gets the row it always had', async () => {
    // Four experiences were shipped against this layout before the option
    // existed, and none of them may grow a button because the garden wanted
    // two.
    const { container } = await setup({ zoom: ZOOM });
    expect(container.children.map((b) => b.attrs['aria-label']))
      .toEqual(['Pan left', 'Zoom out', 'Zoom in', 'Pan right']);
  });

  test('the pair sits between the arrows, so the look controls read together', async () => {
    const { container } = await setup({ zoom: ZOOM, tiltButtons: true, pan: { ...PAN, maxTilt: 0.4 } });
    expect(container.children.map((b) => b.attrs['aria-label']))
      .toEqual(['Pan left', 'Look up', 'Look down', 'Zoom out', 'Zoom in', 'Pan right']);
  });

  test('a scene with the tilt axis switched off gets no tilt buttons', async () => {
    // A button that cannot move anything is worse than no button.
    const { container } = await setup({ zoom: ZOOM, tiltButtons: true, pan: { ...PAN, maxTilt: 0 } });
    expect(container.children.map((b) => b.attrs['aria-label']))
      .toEqual(['Pan left', 'Zoom out', 'Zoom in', 'Pan right']);
  });

  test('W AND S LIGHT THE BUTTONS THEY MOVE, and let go of them', async () => {
    // The reported symptom: A and D highlighted their arrows and W and S
    // moved the view without highlighting anything, because the tilt holds
    // resolved their button to null.
    const { m, buttons } = await setup({ zoom: ZOOM, tiltButtons: true, pan: { ...PAN, maxTilt: 0.4 } });
    const up = buttons['Look up'];
    const down = buttons['Look down'];

    globalThis.window.fire('keydown', { code: 'KeyW', repeat: false });
    expect(up.classList.contains('held')).toBe(true);
    m.updatePortraitControls(0.2);
    expect(m.getTiltAngle()).toBeGreaterThan(0);

    // Releasing has to clear the class as well as the hold. KEY_HOLDS has no
    // entry for W, so the keyup path returns before it reaches the generic
    // clear, and the button would stay lit forever.
    globalThis.window.fire('keyup', { code: 'KeyW' });
    expect(up.classList.contains('held')).toBe(false);
    const held = m.getTiltAngle();
    m.updatePortraitControls(0.2);
    expect(m.getTiltAngle()).toBe(held);

    globalThis.window.fire('keydown', { code: 'KeyS', repeat: false });
    expect(down.classList.contains('held')).toBe(true);
    globalThis.window.fire('keyup', { code: 'KeyS' });
    expect(down.classList.contains('held')).toBe(false);

    // And Shift with the arrows reaches the same pair.
    globalThis.window.fire('keydown', { code: 'ArrowUp', shiftKey: true, repeat: false });
    expect(up.classList.contains('held')).toBe(true);
    globalThis.window.fire('keyup', { code: 'ArrowUp' });
    expect(up.classList.contains('held')).toBe(false);
  });

  test('pressing a tilt button tilts, and it dims at its own clamp', async () => {
    const maxTilt = 0.4;
    const { m, buttons } = await setup({ zoom: ZOOM, tiltButtons: true, pan: { ...PAN, maxTilt } });
    const up = buttons['Look up'];

    press(up);
    expect(up.classList.contains('held')).toBe(true);
    m.updatePortraitControls(0.5);
    expect(m.getTiltAngle()).toBeGreaterThan(0);
    expect(m.getTiltAngle()).toBeLessThan(maxTilt);

    m.updatePortraitControls(5);
    expect(m.getTiltAngle()).toBeCloseTo(maxTilt, 9);
    expect(up.classList.contains('at-limit')).toBe(true);
    release(up);
  });
});

// ---- The zoom pair in its own group ----------------------------------------

describe('zoomContainerClass', () => {
  test('the pair moves out, PLUS ON TOP, and the row keeps the rest', async () => {
    const { container } = await setup({
      zoom: ZOOM, tiltButtons: true, pan: { ...PAN, maxTilt: 0.4 },
      zoomContainerClass: 'my-zoom'
    });
    expect(container.children.map((b) => b.attrs['aria-label']))
      .toEqual(['Pan left', 'Look up', 'Look down', 'Pan right']);

    const stack = globalThis.document.body.children[1];
    expect(stack.classList.contains('ui-float')).toBe(true);
    expect(stack.classList.contains('my-zoom')).toBe(true);
    // Stacked vertically, in on top: the map idiom, and it agrees with the
    // direction it moves the view.
    expect(stack.children.map((b) => b.attrs['aria-label'])).toEqual(['Zoom in', 'Zoom out']);
  });

  test('the moved pair still carries the zoom, the keys and the pinch', async () => {
    const surface = makeSurface();
    const { m, container } = await setup({
      surface, zoom: ZOOM, zoomContainerClass: 'my-zoom'
    });
    const stack = globalThis.document.body.children[1];
    const [zoomIn] = stack.children;

    press(zoomIn);
    m.updatePortraitControls(0.5);
    expect(m.getZoomOffset()).toBeLessThan(0);
    release(zoomIn);

    // The arrow keys and the pinch both gate on the buttons existing, so a
    // scene that moved them must not have lost either.
    globalThis.window.fire('keydown', { code: 'ArrowUp', repeat: false });
    m.updatePortraitControls(0.5);
    globalThis.window.fire('keyup', { code: 'ArrowUp' });
    const afterKeys = m.getZoomOffset();
    expect(afterKeys).toBeLessThan(0);

    touch(surface, 'pointerdown', 1, 100, 400);
    touch(surface, 'pointerdown', 2, 300, 400);
    touch(surface, 'pointermove', 1, 80, 400);
    touch(surface, 'pointermove', 2, 320, 400);
    expect(m.getZoomOffset()).not.toBe(afterKeys);

    // And the row itself is unchanged apart from the two that left.
    expect(container.children.map((b) => b.attrs['aria-label']))
      .toEqual(['Pan left', 'Pan right']);
  });

  test('re-initialising does not leave a second zoom group behind', async () => {
    // The part rebuilds its DOM when an experience re-inits, and a container
    // it forgot to remove would stack duplicates in the corner.
    const { m } = await setup({ zoom: ZOOM, zoomContainerClass: 'my-zoom' });
    expect(globalThis.document.body.children).toHaveLength(2);
    m.initPortraitControls({
      getCamera: () => makeCamera(), lookAt: LOOK_AT, baseFov: BASE_FOV,
      pan: PAN, zoom: ZOOM, zoomContainerClass: 'my-zoom'
    });
    expect(globalThis.document.body.children).toHaveLength(2);
    m.disposePortraitControls();
    expect(globalThis.document.body.children).toHaveLength(0);
  });
});

// ---- A key belongs to the button it looks like ------------------------------

/**
 * WHY THE ZOOM MOVED OFF THE ARROWS.
 *
 * Up and Down carried the zoom from before this part could draw tilt buttons.
 * Once `tiltButtons: true` existed, a scene could show an up arrow, a down
 * arrow, a plus and a minus on screen, and then answer the arrow KEYS with the
 * plus and minus BUTTONS. Nothing about that is guessable, and QA on the garden
 * said so.
 *
 * The rule now is that a key does what the button under the same glyph does.
 * Plus and minus carry the zoom everywhere, and the plain arrows follow
 * whichever arrows are actually on screen.
 */
describe('the keys follow the buttons that exist', () => {
  test('plus and minus zoom, on the main row and the numpad', async () => {
    const { m, camera } = await setup({ zoom: ZOOM });
    globalThis.window.fire('keydown', { code: 'Equal' });
    m.updatePortraitControls(1);
    globalThis.window.fire('keyup', { code: 'Equal' });
    const zoomedIn = camera.fov;
    expect(zoomedIn).toBeLessThan(BASE_FOV);

    globalThis.window.fire('keydown', { code: 'Minus' });
    m.updatePortraitControls(1);
    globalThis.window.fire('keyup', { code: 'Minus' });
    expect(camera.fov).toBeCloseTo(BASE_FOV, 10);

    // `Equal` and `Minus` are the PHYSICAL keys, so they answer whether or not
    // Shift is down. Requiring Shift for the plus would mean the key printed on
    // the cap only worked with a modifier.
    globalThis.window.fire('keydown', { code: 'NumpadAdd' });
    m.updatePortraitControls(1);
    globalThis.window.fire('keyup', { code: 'NumpadAdd' });
    expect(camera.fov).toBeCloseTo(zoomedIn, 10);
    globalThis.window.fire('keydown', { code: 'NumpadSubtract' });
    m.updatePortraitControls(1);
    globalThis.window.fire('keyup', { code: 'NumpadSubtract' });
    expect(camera.fov).toBeCloseTo(BASE_FOV, 10);
  });

  test('WITH tilt buttons, the arrows tilt and leave the lens alone', async () => {
    const { m, camera, buttons } = await setup({ zoom: ZOOM, tiltButtons: true });
    expect(buttons['Look up']).toBeTruthy();

    globalThis.window.fire('keydown', { code: 'ArrowUp' });
    // The on-screen button it belongs to lights up, which is the visible half
    // of the same claim.
    expect(buttons['Look up'].classList.contains('held')).toBe(true);
    m.updatePortraitControls(1);
    globalThis.window.fire('keyup', { code: 'ArrowUp' });
    expect(buttons['Look up'].classList.contains('held')).toBe(false);
    expect(m.getTiltAngle()).toBeGreaterThan(0);
    // AND THE LENS DID NOT MOVE. This is the assertion that fails against the
    // old mapping, where ArrowUp was the zoom. Read off the offset rather than
    // the fov: the part only writes to the camera once a zoom has happened, so
    // an untouched lens still carries whatever fov the camera was made with.
    expect(m.getZoomOffset()).toBe(0);

    const up = m.getTiltAngle();
    globalThis.window.fire('keydown', { code: 'ArrowDown' });
    expect(buttons['Look down'].classList.contains('held')).toBe(true);
    m.updatePortraitControls(1);
    globalThis.window.fire('keyup', { code: 'ArrowDown' });
    expect(m.getTiltAngle()).toBeLessThan(up);
    expect(m.getZoomOffset()).toBe(0);

    // The zoom is still reachable, from the keys that look like it.
    globalThis.window.fire('keydown', { code: 'Equal' });
    m.updatePortraitControls(1);
    globalThis.window.fire('keyup', { code: 'Equal' });
    expect(camera.fov).toBeLessThan(BASE_FOV);
  });

  test('WITHOUT tilt buttons the arrows keep the zoom, so no old scene moves', async () => {
    // `tiltButtons` is used by exactly one experience, so this is the path
    // every other scene on the site takes and it must be untouched.
    const { m, camera, buttons } = await setup({ zoom: ZOOM });
    expect(buttons['Look up']).toBeUndefined();
    globalThis.window.fire('keydown', { code: 'ArrowUp' });
    expect(buttons['Zoom in'].classList.contains('held')).toBe(true);
    m.updatePortraitControls(1);
    globalThis.window.fire('keyup', { code: 'ArrowUp' });
    expect(camera.fov).toBeLessThan(BASE_FOV);
    expect(m.getTiltAngle()).toBe(0);

    // And Shift+Up still reaches the tilt there, which is the only route those
    // scenes have ever had to it from the arrows.
    globalThis.window.fire('keydown', { code: 'ArrowUp', shiftKey: true });
    m.updatePortraitControls(1);
    globalThis.window.fire('keyup', { code: 'ArrowUp' });
    expect(m.getTiltAngle()).toBeGreaterThan(0);
  });
});
