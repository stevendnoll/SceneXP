// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Audio-path tests for www/shared/js/doors-1.0.0.js — the whoosh side the
 * builder sweep (tests/shared-parts.test.mjs) leaves dark: it drives the
 * slide animation with no AudioContext, so initDoorAudio's unlock listener,
 * the synthesized whoosh in playDoorSound, and its silent-failure catch never
 * run. Here a recording document captures the click/keydown unlock listeners
 * and a hand-rolled StubAudioContext records every node playDoorSound builds,
 * so the tests assert the actual sound design: an 800→400Hz band-passed noise
 * burst on open, 600→300Hz on close, a 0→0.4→0.001 gain envelope, and exactly
 * one whoosh per swing (none when a half-open door reverses).
 *
 * The world config comes from initWorld on the shared min bundle (the same
 * module instance doors imports), placing the door at (0, 5). Noise samples
 * come from Math.random, so the buffer assertions are invariants (bounds and
 * non-silence), never exact values. All deltas are explicit.
 */
import { jest } from '@jest/globals';
import { installThree, installBrowserGlobals, uninstallAll } from './helpers/three-stub.mjs';

// ---- Recording Web Audio ----------------------------------------------------

class StubAudioContext {
  constructor() {
    this.currentTime = 2;
    this.sampleRate = 1000; // 0.3s whoosh => 300-sample buffer
    this.destination = { id: 'speakers' };
    this.buffers = [];
    this.sources = [];
    this.filters = [];
    this.gains = [];
    StubAudioContext.instances.push(this);
  }
  createBuffer(channels, size, rate) {
    const data = new Float32Array(size);
    const buffer = { channels, size, rate, data, getChannelData: () => data };
    this.buffers.push(buffer);
    return buffer;
  }
  createBufferSource() {
    const source = {
      buffer: null, connectedTo: null, started: null, stopped: null,
      connect(node) { this.connectedTo = node; },
      start(t) { this.started = t; },
      stop(t) { this.stopped = t; },
    };
    this.sources.push(source);
    return source;
  }
  createBiquadFilter() {
    const filter = {
      type: '', Q: { value: 0 }, connectedTo: null,
      frequency: {
        setCalls: [], rampCalls: [],
        setValueAtTime(v, t) { this.setCalls.push([v, t]); },
        exponentialRampToValueAtTime(v, t) { this.rampCalls.push([v, t]); },
      },
      connect(node) { this.connectedTo = node; },
    };
    this.filters.push(filter);
    return filter;
  }
  createGain() {
    const gainNode = {
      connectedTo: null,
      gain: {
        setCalls: [], linearCalls: [], expCalls: [],
        setValueAtTime(v, t) { this.setCalls.push([v, t]); },
        linearRampToValueAtTime(v, t) { this.linearCalls.push([v, t]); },
        exponentialRampToValueAtTime(v, t) { this.expCalls.push([v, t]); },
      },
      connect(node) { this.connectedTo = node; },
    };
    this.gains.push(gainNode);
    return gainNode;
  }
}
StubAudioContext.instances = [];

class BrokenAudioContext extends StubAudioContext {
  createBuffer() { throw new Error('no audio hardware'); }
}

// ---- Harness ------------------------------------------------------------------

// Door center = (positionX + doorOffsetX, positionZ + depth / 2) = (0, 5).
const BUILDING = { positionX: 0, positionZ: 0, depth: 10, doorOffsetX: 0 };
const NEAR = { x: 0, z: 5 };
const FAR = { x: 0, z: 30 };

/** Fresh doors module (and its world instance) against recording globals. */
async function setup({ AudioContextClass = StubAudioContext, webkit = false } = {}) {
  installThree();
  installBrowserGlobals();
  StubAudioContext.instances.length = 0;
  if (webkit) globalThis.window.webkitAudioContext = AudioContextClass;
  else globalThis.window.AudioContext = AudioContextClass;
  const docListeners = {};
  const removed = [];
  globalThis.document = {
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) {
      removed.push(type);
      docListeners[type] = (docListeners[type] || []).filter((f) => f !== fn);
    },
    getElementById: () => null,
  };
  jest.resetModules();
  const world = await import('../www/shared/js/world-1.0.0.min.js');
  world.initWorld({ building: BUILDING });
  const doors = await import('../www/shared/js/doors-1.0.0.js');
  return { doors, docListeners, removed };
}

/** Simulate the first user gesture so the module creates its AudioContext. */
function unlock({ doors, docListeners }, type = 'click') {
  doors.initDoorAudio();
  const listener = docListeners[type][0];
  listener();
  return { context: StubAudioContext.instances[0], listener };
}

function registerPanes(doors) {
  const left = { position: { x: -0.6 }, userData: { closedX: -0.6 } };
  const right = { position: { x: 0.6 }, userData: { closedX: 0.6 } };
  doors.registerDoors(left, right, { triggerDistance: 3, maxSlide: 1, openSpeed: 5 });
  return { left, right };
}

afterEach(() => {
  uninstallAll();
});

// ---- Audio unlock -------------------------------------------------------------

test('the first click creates exactly one AudioContext and retires both unlock listeners', async () => {
  const env = await setup();
  const { listener } = unlock(env);
  expect(StubAudioContext.instances).toHaveLength(1);
  expect(env.removed.sort()).toEqual(['click', 'keydown']);
  listener(); // a stray re-fire must not build a second context
  expect(StubAudioContext.instances).toHaveLength(1);
});

test('keydown unlocks too, falling back to webkitAudioContext where needed', async () => {
  const env = await setup({ webkit: true });
  unlock(env, 'keydown');
  expect(StubAudioContext.instances).toHaveLength(1);
});

// ---- The whoosh itself ----------------------------------------------------------

test('the opening whoosh is a bounded noise burst swept 800→400Hz through a bandpass', async () => {
  const env = await setup();
  const { context } = unlock(env);

  env.doors.playDoorSound(true);

  // Noise buffer: 0.3s at the context sample rate, samples inside ±0.3, not silence.
  const buffer = context.buffers[0];
  expect(buffer.size).toBe(300);
  const samples = [...buffer.data];
  expect(Math.max(...samples.map(Math.abs))).toBeLessThanOrEqual(0.3);
  expect(samples.some((s) => s !== 0)).toBe(true);

  // Bandpass sweep: 800Hz now, ramping to 400Hz over the 0.3s tail.
  const filter = context.filters[0];
  expect(filter.type).toBe('bandpass');
  expect(filter.Q.value).toBe(1.5);
  expect(filter.frequency.setCalls).toEqual([[800, 2]]);
  expect(filter.frequency.rampCalls[0][0]).toBe(400);
  expect(filter.frequency.rampCalls[0][1]).toBeCloseTo(2.3, 10);

  // Volume envelope: silent, up to 0.4 in 50ms, decaying to near zero.
  const { gain } = context.gains[0];
  expect(gain.setCalls).toEqual([[0, 2]]);
  expect(gain.linearCalls[0][0]).toBe(0.4);
  expect(gain.linearCalls[0][1]).toBeCloseTo(2.05, 10);
  expect(gain.expCalls[0][0]).toBe(0.001);

  // Graph: noise → filter → gain → speakers, played for exactly 0.3s.
  const source = context.sources[0];
  expect(source.buffer).toBe(buffer);
  expect(source.connectedTo).toBe(filter);
  expect(filter.connectedTo).toBe(context.gains[0]);
  expect(context.gains[0].connectedTo).toBe(context.destination);
  expect(source.started).toBe(2);
  expect(source.stopped).toBeCloseTo(2.3, 10);
});

test('the closing whoosh sweeps lower, 600→300Hz', async () => {
  const env = await setup();
  const { context } = unlock(env);
  env.doors.playDoorSound(false);
  expect(context.filters[0].frequency.setCalls).toEqual([[600, 2]]);
  expect(context.filters[0].frequency.rampCalls[0][0]).toBe(300);
});

test('no context means silence, and a broken context fails silently', async () => {
  const quiet = await setup();
  expect(() => quiet.doors.playDoorSound(true)).not.toThrow();
  expect(StubAudioContext.instances).toHaveLength(0);

  const broken = await setup({ AudioContextClass: BrokenAudioContext });
  unlock(broken);
  expect(() => broken.doors.playDoorSound(true)).not.toThrow();
});

// ---- Whoosh choreography during the swing ----------------------------------------

test('each swing whooshes exactly once, and a half-open reversal stays silent', async () => {
  const env = await setup();
  const { context } = unlock(env);
  const { doors } = env;
  const { left, right } = registerPanes(doors);

  // Approach: the opening whoosh fires on the first opening frame only.
  doors.updateDoors(NEAR, 0.05); // openAmount 0.25
  expect(context.sources).toHaveLength(1);
  expect(context.filters[0].frequency.setCalls[0][0]).toBe(800);
  expect(left.position.x).toBeCloseTo(-0.6 - doors.easeInOutQuad(0.25), 10);
  expect(right.position.x).toBeCloseTo(0.6 + doors.easeInOutQuad(0.25), 10);
  doors.updateDoors(NEAR, 0.05); // still opening: no second whoosh
  expect(context.sources).toHaveLength(1);

  // Change of heart at half-open: the doors reverse without a closing whoosh
  // (that sound only plays when leaving a fully open door).
  for (let i = 0; i < 5; i++) doors.updateDoors(FAR, 0.1);
  expect(context.sources).toHaveLength(1);
  expect(doors.getDoorsOpen()).toBe(false);
  expect(left.position.x).toBeCloseTo(-0.6, 10);
  expect(right.position.x).toBeCloseTo(0.6, 10);

  // Fresh approach from fully closed: a new opening whoosh, doors fully aside.
  for (let i = 0; i < 5; i++) doors.updateDoors(NEAR, 0.1);
  expect(context.sources).toHaveLength(2);
  expect(context.filters[1].frequency.setCalls[0][0]).toBe(800);
  expect(doors.getDoorsOpen()).toBe(true);
  expect(left.position.x).toBeCloseTo(-1.6, 10);
  expect(right.position.x).toBeCloseTo(1.6, 10);

  // Walking away from fully open: one closing whoosh, pitched lower.
  doors.updateDoors(FAR, 0.05);
  expect(context.sources).toHaveLength(3);
  expect(context.filters[2].frequency.setCalls[0][0]).toBe(600);
  doors.updateDoors(FAR, 0.05); // still closing: no repeat
  expect(context.sources).toHaveLength(3);
});

test('updateDoors is a safe no-op before any panes are registered', async () => {
  const env = await setup();
  const { context } = unlock(env);
  expect(() => env.doors.updateDoors(NEAR, 0.1)).not.toThrow();
  expect(context.sources).toHaveLength(0);
  expect(env.doors.getDoorsOpen()).toBe(false);
});
