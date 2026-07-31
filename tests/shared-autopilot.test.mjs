// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/autopilot-1.0.0.js — the hands-free guided
 * tour that walks the camera along an experience-authored route.
 *
 * Autopilot drives the camera purely through the controls part's public
 * setters, and it imports controls-1.0.0.min.js, so the tests import the same
 * built module to share its player state (importing the controls source would
 * create a separate instance the tour never touches). The THREE stub follows
 * shared-controls.test.mjs: Vector3/Euler hold real components so positions
 * and rotations are assertable; everything else stays a chainable proxy.
 */
import { jest } from '@jest/globals';
import { installThree, uninstallAll } from './helpers/three-stub.mjs';

class StubVector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new StubVector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  normalize() { return this; }
  applyEuler() { return this; }
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
  installThree();
  const proxy = globalThis.THREE;
  globalThis.THREE = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'Vector3') return StubVector3;
      if (prop === 'Euler') return StubEuler;
      return proxy[prop];
    },
  });
}

function installDom() {
  globalThis.document = {
    addEventListener() {},
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

// Module constants mirrored for assertions (kept in one place here so a
// deliberate retune over there fails loudly in exactly one spot).
const TURN_RATE = 2.2;
const DEFAULT_SPEED = 2.1;

async function load(config) {
  installRicherThree();
  installDom();
  jest.resetModules();
  const controls = await import('../www/shared/js/controls-1.0.0.min.js');
  const ap = await import('../www/shared/js/autopilot-1.0.0.js');
  if (config !== undefined) ap.initAutopilot(config);
  return { ap, controls };
}

afterEach(uninstallAll);

describe('yaw and turn math (pure)', () => {
  test('yawToward follows the controls convention (0 faces -Z, east is -PI/2)', async () => {
    const { ap } = await load();
    const T = ap.__test__;
    expect(T.yawToward(0, 0, 0, -5)).toBeCloseTo(0);
    expect(T.yawToward(0, 0, 5, 0)).toBeCloseTo(-Math.PI / 2);
    expect(T.yawToward(0, 0, -5, 0)).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(T.yawToward(0, 0, 0, 5))).toBeCloseTo(Math.PI);
  });

  test('shortestTurn always takes the short way around', async () => {
    const { ap } = await load();
    const T = ap.__test__;
    expect(T.shortestTurn(1, 1.5)).toBeCloseTo(0.5);
    expect(T.shortestTurn(0, Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2);
    expect(T.shortestTurn(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(T.shortestTurn(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2);
  });

  test('the default stroll speed is the documented one', async () => {
    const { ap } = await load();
    expect(ap.__test__.DEFAULT_SPEED).toBe(DEFAULT_SPEED);
  });
});

describe('engaging and disengaging', () => {
  test('will not engage without a route', async () => {
    const { ap } = await load({ route: [] });
    expect(ap.setAutopilotEnabled(true)).toBe(false);
    expect(ap.isAutopilotEnabled()).toBe(false);
  });

  test('toggling notifies subscribers with the new state', async () => {
    const { ap } = await load({ route: [{ x: 0, z: -5 }] });
    const seen = [];
    ap.onAutopilotChange((on) => seen.push(on));
    expect(ap.toggleAutopilot()).toBe(true);
    expect(ap.isAutopilotEnabled()).toBe(true);
    expect(ap.toggleAutopilot()).toBe(false);
    expect(ap.isAutopilotEnabled()).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  test('update is a no-op while disengaged', async () => {
    const { ap, controls } = await load({ route: [{ x: 0, z: -5 }] });
    controls.setPlayerPosition(1, 0, 2);
    ap.updateAutopilot(0.5);
    const pos = controls.getPlayerPosition();
    expect(pos.x).toBeCloseTo(1);
    expect(pos.z).toBeCloseTo(2);
  });
});

describe('walking the route', () => {
  test('strides toward the node once roughly facing it (bad speed falls back to the default)', async () => {
    const { ap, controls } = await load({ route: [{ x: 0, z: -5 }], speed: -3 });
    controls.setPlayerPosition(0, 0, 0);
    controls.setPlayerRotation(0, 0); // already facing the node down -Z
    ap.setAutopilotEnabled(true);
    ap.updateAutopilot(0.1);
    const pos = controls.getPlayerPosition();
    expect(pos.x).toBeCloseTo(0);
    expect(pos.z).toBeCloseTo(-DEFAULT_SPEED * 0.1);
    // The stride pins the camera at standing eye height.
    expect(pos.y).toBeCloseTo(controls.CONTROLS_CONFIG.eyeHeight);
  });

  test('turns in place before striding when facing away', async () => {
    const { ap, controls } = await load({ route: [{ x: 0, z: -5 }] });
    controls.setPlayerPosition(0, 0, 0);
    controls.setPlayerRotation(Math.PI, 0); // facing +Z, away from the node
    ap.setAutopilotEnabled(true);
    ap.updateAutopilot(0.1);
    const pos = controls.getPlayerPosition();
    expect(pos.x).toBeCloseTo(0); // held the walk
    expect(pos.z).toBeCloseTo(0);
    // ...but eased toward the path at the turn rate.
    expect(controls.getPlayerRotation().y).toBeCloseTo(Math.PI - TURN_RATE * 0.1);
  });

  test('joining near a stop starts its visit in place (no shuffle-walk)', async () => {
    const { ap, controls } = await load({
      route: [
        { x: 0, z: 0, lookAt: { x: 0, z: -5, y: 1.2 }, pause: 5 },
        { x: 10, z: 0, lookAt: { x: 10, z: -5, y: 1.2 }, pause: 5 },
      ],
    });
    // 0.6m from the second stop, facing the first: a nearest-node join with
    // the grace radius means dwell here, not a march to either exact spot.
    controls.setPlayerPosition(9.4, 0, 0);
    controls.setPlayerRotation(Math.PI / 2, 0);
    ap.setAutopilotEnabled(true);
    ap.updateAutopilot(0.1);
    const pos = controls.getPlayerPosition();
    expect(pos.x).toBeCloseTo(9.4);
    expect(pos.z).toBeCloseTo(0);
  });

  test('dwells at a sight, gazes at it, then moves on', async () => {
    const { ap, controls } = await load({
      route: [
        { x: 0, z: 0, lookAt: { x: 0, z: -5, y: 3 }, pause: 0.3 },
        { x: 0, z: 5 },
      ],
    });
    controls.setPlayerPosition(0, 0, 0);
    controls.setPlayerRotation(0, 0);
    ap.setAutopilotEnabled(true);

    // Arrived at the sight: the gaze tilts up toward the lookAt (clamped by
    // the per-frame turn rate) while the feet stay planted.
    ap.updateAutopilot(0.1);
    expect(controls.getPlayerRotation().x).toBeCloseTo(TURN_RATE * 0.1);
    expect(controls.getPlayerPosition().z).toBeCloseTo(0);

    // Sit out the rest of the dwell, then walk on: the tour turns around and
    // makes real progress toward the second stop.
    for (let i = 0; i < 60; i++) ap.updateAutopilot(0.1);
    expect(controls.getPlayerPosition().z).toBeGreaterThan(1);
  });

  test('a single-stop route loops on itself without wedging', async () => {
    const { ap, controls } = await load({ route: [{ x: 0, z: 0, pause: 0.1 }] });
    controls.setPlayerPosition(0, 0, 0);
    controls.setPlayerRotation(0, 0);
    ap.setAutopilotEnabled(true);
    for (let i = 0; i < 20; i++) ap.updateAutopilot(0.05);
    const pos = controls.getPlayerPosition();
    expect(pos.x).toBeCloseTo(0);
    expect(pos.z).toBeCloseTo(0);
    expect(ap.isAutopilotEnabled()).toBe(true);
  });
});
