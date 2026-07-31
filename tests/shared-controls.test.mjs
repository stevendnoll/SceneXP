// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/controls-1.0.0.js — the shared engine's input part
 * and its per-experience config plumbing (spawn / worldBounds / speeds).
 *
 * The pure-helper and getter tests mirror tests/controls.test.mjs (which covers
 * the untouched www/js copy). The initControls(options) tests install a THREE
 * stub whose Vector3/Euler are real enough to hold x/y/z, so the applied spawn
 * is observable through getPlayerPosition(); everything else stays a chainable
 * proxy. document/window are stubbed just enough for the listener setup
 * (addEventListener no-ops, getElementById finds no touch zones).
 */
import { jest } from '@jest/globals';
import { installThree, uninstallAll } from './helpers/three-stub.mjs';

// Vector3/Euler that actually store their components (so spawn is assertable).
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
  // Y-only rotation: all the movement math applies (movement stays on the
  // horizontal plane), and it keeps the controls yaw convention testable.
  applyEuler(e) {
    const c = Math.cos(e.y);
    const s = Math.sin(e.y);
    const x = this.x * c + this.z * s;
    this.z = -this.x * s + this.z * c;
    this.x = x;
    return this;
  }
  applyQuaternion() { return this; }
  setFromMatrixPosition() { return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
}
class StubEuler {
  constructor(x = 0, y = 0, z = 0, order = 'XYZ') { this.x = x; this.y = y; this.z = z; this.order = order; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(e) { this.x = e.x; this.y = e.y; this.z = e.z; return this; }
  clone() { return new StubEuler(this.x, this.y, this.z, this.order); }
  setFromQuaternion() { return this; }
}

function installRicherThree() {
  installThree(); // chainable proxy for everything...
  const proxy = globalThis.THREE;
  // ...wrapped so Vector3/Euler come back as real component-holding stubs.
  globalThis.THREE = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'Vector3') return StubVector3;
      if (prop === 'Euler') return StubEuler;
      return proxy[prop];
    },
  });
}

// Document listeners captured by the last installDom(), so the movement
// tests can feed synthetic keydown/keyup events straight to the handlers.
let docListeners = {};

function installDom() {
  docListeners = {};
  globalThis.document = {
    addEventListener(type, fn) { docListeners[type] = fn; },
    removeEventListener() {},
    getElementById() { return null; },
    createElement() { return { style: {}, getContext() { return null; } }; },
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1024,
    innerHeight: 768,
  };
  globalThis.navigator = {};
}

async function load() {
  installRicherThree();
  installDom();
  jest.resetModules();
  return import('../www/shared/js/controls-1.0.0.js');
}

afterEach(uninstallAll);

describe('pure helpers and getters (parity with the www/js copy)', () => {
  test('findTouchById returns the matching touch or null', async () => {
    const { __test__ } = await load();
    const list = [{ identifier: 1 }, { identifier: 7 }];
    expect(__test__.findTouchById(list, 7)).toBe(list[1]);
    expect(__test__.findTouchById(list, 99)).toBeNull();
    expect(__test__.findTouchById([], 1)).toBeNull();
  });

  test('getPlayerRadius returns the configured collision radius', async () => {
    const m = await load();
    expect(m.getPlayerRadius()).toBeCloseTo(0.4, 10);
  });

  test('VR / gamepad / head-tracking default to inactive', async () => {
    const m = await load();
    expect(m.isVRActive()).toBe(false);
    expect(m.isGamepadActive()).toBe(false);
    expect(m.isHeadTrackingActive()).toBe(false);
  });
});

describe('minimized-world defaults', () => {
  test('worldBounds default to the small ±20 walkable square', async () => {
    const m = await load();
    expect(m.CONTROLS_CONFIG.worldBounds).toEqual({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 });
  });

  test('player spawns at the origin at eye height before initControls', async () => {
    const m = await load();
    const p = m.getPlayerPosition();
    expect(p.x).toBe(0);
    expect(p.y).toBeCloseTo(1.7, 10);
    expect(p.z).toBe(0);
  });
});

describe('initControls(options) config plumb', () => {
  test('applies the experience spawn point (y defaults to eye height)', async () => {
    const m = await load();
    m.initControls({ spawn: { x: -10, z: 17 } });
    const p = m.getPlayerPosition();
    expect(p.x).toBe(-10);
    expect(p.y).toBeCloseTo(1.7, 10);
    expect(p.z).toBe(17);
  });

  test('applies asymmetric worldBounds overrides', async () => {
    const m = await load();
    m.initControls({ worldBounds: { minX: -58, maxX: 58, minZ: -10, maxZ: 44 } });
    expect(m.CONTROLS_CONFIG.worldBounds).toEqual({ minX: -58, maxX: 58, minZ: -10, maxZ: 44 });
  });

  test('partial worldBounds override keeps the other defaults', async () => {
    const m = await load();
    m.initControls({ worldBounds: { maxZ: 44 } });
    expect(m.CONTROLS_CONFIG.worldBounds).toEqual({ minX: -20, maxX: 20, minZ: -20, maxZ: 44 });
  });

  test('applies speed/sensitivity overrides and ignores non-numbers', async () => {
    const m = await load();
    m.initControls({ moveSpeed: 4.5, mouseSensitivity: 0.001, lookJoystickSensitivity: 2 });
    expect(m.CONTROLS_CONFIG.moveSpeed).toBe(4.5);
    expect(m.CONTROLS_CONFIG.mouseSensitivity).toBe(0.001);
    expect(m.CONTROLS_CONFIG.lookJoystickSensitivity).toBe(2);

    const m2 = await load();
    m2.initControls({ moveSpeed: 'fast' });
    expect(m2.CONTROLS_CONFIG.moveSpeed).toBe(6.5);
  });

  test('initControls with no options leaves the defaults intact', async () => {
    const m = await load();
    m.initControls();
    const p = m.getPlayerPosition();
    expect(p.x).toBe(0);
    expect(p.z).toBe(0);
    expect(m.CONTROLS_CONFIG.worldBounds.maxX).toBe(20);
  });
});

const press = (code) => docListeners.keydown({ code });
const release = (code) => docListeners.keyup({ code });

describe('the keyboard movement pipeline (updateControls)', () => {
  test('W walks forward at moveSpeed, pinned to eye height', async () => {
    const m = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    press('KeyW');
    m.updateControls(0.5, false);
    const p = m.getPlayerPosition();
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(-6.5 * 0.5); // yaw 0 faces -Z
    expect(p.y).toBeCloseTo(1.7);
  });

  test('releasing the key stops the walk', async () => {
    const m = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    press('KeyW');
    m.updateControls(0.1, false);
    release('KeyW');
    const after = m.getPlayerPosition();
    m.updateControls(0.5, false);
    expect(m.getPlayerPosition().z).toBeCloseTo(after.z);
  });

  test('arrow keys are synonyms for WASD', async () => {
    const m = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    press('ArrowUp');
    m.updateControls(0.1, false);
    expect(m.getPlayerPosition().z).toBeCloseTo(-0.65);
  });

  test('S walks backward, A and D strafe', async () => {
    const m = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    press('KeyS');
    m.updateControls(0.1, false);
    expect(m.getPlayerPosition().z).toBeCloseTo(0.65);
    release('KeyS');
    press('KeyA');
    m.updateControls(0.1, false);
    expect(m.getPlayerPosition().x).toBeCloseTo(-0.65);
    release('KeyA');
    press('KeyD');
    m.updateControls(0.2, false);
    expect(m.getPlayerPosition().x).toBeCloseTo(-0.65 + 1.3);
  });

  test('diagonals are normalized (no speed advantage)', async () => {
    const m = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    press('KeyW');
    press('KeyD');
    m.updateControls(0.1, false);
    const p = m.getPlayerPosition();
    const step = 0.65 / Math.SQRT2;
    expect(p.x).toBeCloseTo(step);
    expect(p.z).toBeCloseTo(-step);
  });

  test('shift sprints at the configured multiplier', async () => {
    const m = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    press('KeyW');
    press('ShiftLeft');
    m.updateControls(0.1, false);
    expect(m.getPlayerPosition().z).toBeCloseTo(-6.5 * 1.8 * 0.1);
  });

  test('movement follows the yaw (facing east walks east)', async () => {
    const m = await load();
    // Yaw -PI/2 faces due east (+X), same convention the autopilot documents.
    m.initControls({ spawn: { x: 0, z: 0 }, rotation: { yaw: -Math.PI / 2 } });
    press('KeyW');
    m.updateControls(0.1, false);
    const p = m.getPlayerPosition();
    expect(p.x).toBeCloseTo(0.65);
    expect(p.z).toBeCloseTo(0);
  });

  test('pause freezes the keyboard walk until play resumes', async () => {
    const m = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    press('KeyW');
    m.updateControls(0.5, true);
    expect(m.getPlayerPosition().z).toBeCloseTo(0);
    m.updateControls(0.1, false);
    expect(m.getPlayerPosition().z).toBeCloseTo(-0.65);
  });

  test('the world bounds clamp the walk at the edge', async () => {
    const m = await load();
    m.initControls({ spawn: { x: 0, z: 19 } });
    press('KeyS');
    m.updateControls(1, false); // 6.5m of stride into a 1m gap
    expect(m.getPlayerPosition().z).toBeCloseTo(20);
  });

  test('the collision callback gets the final say on the move', async () => {
    const m = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    // The hot path reuses its vectors, so the (oldPos, attemptedPos, radius)
    // arguments must be read inside the callback, not off the mock afterward.
    const seen = {};
    const callback = jest.fn((oldPos, attempted, radius) => {
      Object.assign(seen, { oldZ: oldPos.z, attemptedZ: attempted.z, radius });
      return { x: 5, y: 1.7, z: -5 };
    });
    m.setCollisionCallback(callback);
    press('KeyW');
    m.updateControls(0.1, false);
    const p = m.getPlayerPosition();
    expect(p.x).toBeCloseTo(5);
    expect(p.z).toBeCloseTo(-5);
    expect(seen.oldZ).toBeCloseTo(0);
    expect(seen.attemptedZ).toBeCloseTo(-0.65);
    expect(seen.radius).toBeCloseTo(0.4);
  });
});

describe('the remaining setters and getters', () => {
  test('setMoveSpeed changes the stride immediately', async () => {
    const m = await load();
    m.initControls({ spawn: { x: 0, z: 0 } });
    m.setMoveSpeed(2);
    press('KeyW');
    m.updateControls(0.5, false);
    expect(m.getPlayerPosition().z).toBeCloseTo(-1);
  });

  test('copyPlayerPositionTo fills the target without allocating', async () => {
    const m = await load();
    m.setPlayerPosition(3, 1.7, -4);
    const target = new globalThis.THREE.Vector3();
    expect(m.copyPlayerPositionTo(target)).toBe(target);
    expect(target.x).toBe(3);
    expect(target.z).toBe(-4);
  });

  test('setPlayerRotation clamps the pitch to straight up and down', async () => {
    const m = await load();
    m.setPlayerRotation(1.2, 9);
    const r = m.getPlayerRotation();
    expect(r.y).toBeCloseTo(1.2);
    expect(r.x).toBeCloseTo(Math.PI / 2);
    m.setPlayerRotation(0, -9);
    expect(m.getPlayerRotation().x).toBeCloseTo(-Math.PI / 2);
  });

  test('the sensitivity knobs and tap callback accept values', async () => {
    const m = await load();
    m.setMouseSensitivity(0.005);
    expect(m.CONTROLS_CONFIG.mouseSensitivity).toBe(0.005);
    m.setLookJoystickSensitivity(3);
    expect(m.CONTROLS_CONFIG.lookJoystickSensitivity).toBe(3);
    expect(() => m.setTapCallback(() => {})).not.toThrow();
  });

  test('trigger edge detectors default to released', async () => {
    const m = await load();
    expect(m.isVRTriggerJustPressed()).toBe(false);
    expect(m.isGamepadTriggerJustPressed()).toBe(false);
  });
});
