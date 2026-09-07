// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/boot-1.0.0.js — the proof-of-work load gate.
 *
 * Runs against Node's real Web Crypto (crypto.subtle / crypto.randomUUID),
 * so the mining, the stored-proof re-derivation, and the forgery rejection
 * below are the genuine article, not mocks. A low-difficulty prefix keeps
 * the mining tests fast.
 */
import { jest } from '@jest/globals';

function makeStorage({ seed = {}, failing = false } = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem(k) { if (failing) throw new Error('blocked'); return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { if (failing) throw new Error('blocked'); data.set(k, String(v)); },
    _raw: (k) => data.get(k),
  };
}

async function load({ storage, crypto = true } = {}) {
  globalThis.window = crypto ? { crypto: globalThis.crypto } : {};
  if (storage) globalThis.sessionStorage = storage;
  jest.resetModules();
  return import('../www/shared/js/boot-1.0.0.js');
}

// Mine a proof for `prefix` with the module's own hasher, so a re-derivation
// of the stored seed/nonce reproduces the hash exactly.
async function mineProof(sha256Hex, prefix, { seed = 'unit-seed', timestamp = Date.now() } = {}) {
  for (let nonce = 0; ; nonce++) {
    const hash = await sha256Hex(`${seed}:${nonce}`);
    if (hash.startsWith(prefix)) return { seed, nonce, hash, timestamp };
  }
}

afterEach(() => {
  jest.restoreAllMocks();
  delete globalThis.window;
  delete globalThis.sessionStorage;
});

describe('the hex and hash primitives', () => {
  test('bufToHex writes lower-case, zero-padded hex per byte', async () => {
    const { bufToHex } = await load();
    expect(bufToHex(new Uint8Array([0, 15, 16, 255]))).toBe('000f10ff');
    expect(bufToHex(new Uint8Array([]))).toBe('');
  });

  test('sha256Hex matches the known NIST vectors', async () => {
    const { sha256Hex } = await load();
    expect(await sha256Hex('abc'))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256Hex(''))
      .toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('getProofOfWork', () => {
  test('mines a genuine proof and persists it under the configured key', async () => {
    const storage = makeStorage();
    const { getProofOfWork, sha256Hex } = await load({ storage });
    const proof = await getProofOfWork({ prefix: '1', storageKey: 'unit-pow' });
    expect(proof.hash.startsWith('1')).toBe(true);
    expect(Number.isInteger(proof.nonce)).toBe(true);
    // The hash is honestly derived from the seed and nonce.
    expect(await sha256Hex(`${proof.seed}:${proof.nonce}`)).toBe(proof.hash);
    expect(JSON.parse(storage._raw('unit-pow')).hash).toBe(proof.hash);
  });

  test('reuses a valid stored proof instead of re-solving', async () => {
    const first = await load({ storage: makeStorage() });
    const stored = await mineProof(first.sha256Hex, '1');
    const storage = makeStorage({ seed: { 'unit-pow': JSON.stringify(stored) } });
    const { getProofOfWork } = await load({ storage });
    const proof = await getProofOfWork({ prefix: '1', storageKey: 'unit-pow' });
    // The distinctive hand-mined seed proves no fresh solve happened (a fresh
    // seed is `${Date.now()}-${randomUUID()}`).
    expect(proof.seed).toBe('unit-seed');
    expect(proof.nonce).toBe(stored.nonce);
  });

  test('rejects a forged entry whose hash does not re-derive, and solves honestly', async () => {
    const forged = { seed: 'liar', nonce: 1, hash: '1'.repeat(64), timestamp: Date.now() };
    const storage = makeStorage({ seed: { 'unit-pow': JSON.stringify(forged) } });
    const { getProofOfWork, sha256Hex } = await load({ storage });
    const proof = await getProofOfWork({ prefix: '1', storageKey: 'unit-pow' });
    expect(proof.seed).not.toBe('liar');
    expect(await sha256Hex(`${proof.seed}:${proof.nonce}`)).toBe(proof.hash);
  });

  test('rejects stale, future-dated, and malformed stored proofs', async () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const first = await load({ storage: makeStorage() });
    const stale = await mineProof(first.sha256Hex, '1', { timestamp: Date.now() - dayMs - 1000 });
    for (const bad of [stale, { ...stale, timestamp: Date.now() + 60000 }, { nonsense: true }, 'not even an object']) {
      const storage = makeStorage({ seed: { 'unit-pow': JSON.stringify(bad) } });
      const { getProofOfWork } = await load({ storage });
      const proof = await getProofOfWork({ prefix: '1', storageKey: 'unit-pow' });
      expect(proof.seed).not.toBe('unit-seed'); // freshly mined, not the reject
      expect(proof.hash.startsWith('1')).toBe(true);
    }
  });

  test('returns null without Web Crypto instead of trapping the visitor', async () => {
    const { getProofOfWork } = await load({ storage: makeStorage(), crypto: false });
    expect(await getProofOfWork({ prefix: '1', storageKey: 'unit-pow' })).toBeNull();
  });

  test('still returns a proof when sessionStorage is unavailable', async () => {
    const { getProofOfWork } = await load({ storage: makeStorage({ failing: true }) });
    const proof = await getProofOfWork({ prefix: '1', storageKey: 'unit-pow' });
    expect(proof).not.toBeNull();
    expect(proof.hash.startsWith('1')).toBe(true);
  });
});

describe('shieldOverlayControl', () => {
  /** A stand-in for a link on a welcome overlay, recording what was wired and
   *  letting a test dispatch to it. Deliberately hand-built rather than taken
   *  from the DOM stub: the property under test is which listeners get added
   *  and what they do to the event, and the stub's auto-vivifying proxy would
   *  answer "yes" to anything. */
  function makeEl() {
    const listeners = new Map();
    return {
      listeners,
      addEventListener(type, fn, opts) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push({ fn, opts });
      },
      fire(type) {
        let stopped = false;
        let defaultPrevented = false;
        const event = {
          type,
          stopPropagation() { stopped = true; },
          preventDefault() { defaultPrevented = true; },
        };
        (listeners.get(type) || []).forEach(({ fn }) => fn(event));
        return { stopped, defaultPrevented };
      },
    };
  }

  test('stops the three events a welcome overlay starts a scene on', async () => {
    const { shieldOverlayControl } = await load();
    const el = makeEl();
    expect(shieldOverlayControl(el)).toBe(true);
    // click for the mouse, touchstart because the garden arms on it, and
    // touchend because that is the one the walkable scenes start from.
    expect([...el.listeners.keys()].sort()).toEqual(['click', 'touchend', 'touchstart']);
    for (const type of ['click', 'touchstart', 'touchend']) {
      expect(`${type} stopped: ${el.fire(type).stopped}`).toBe(`${type} stopped: true`);
    }
  });

  test('does NOT preventDefault, or the anchor would never follow its href', async () => {
    // The one difference from Earth Defense's briefing button, which does this
    // inline WITH a preventDefault because it is a <button> and has no default
    // worth keeping. Getting this wrong is silent: the link stops starting the
    // scene, which looks like the fix working, and stops navigating too.
    const { shieldOverlayControl } = await load();
    const el = makeEl();
    shieldOverlayControl(el);
    for (const type of ['click', 'touchstart', 'touchend']) {
      expect(`${type} prevented: ${el.fire(type).defaultPrevented}`)
        .toBe(`${type} prevented: false`);
    }
  });

  test('passes an AbortSignal through so the wiring comes off at teardown', async () => {
    const { shieldOverlayControl } = await load();
    const el = makeEl();
    const signal = new AbortController().signal;
    shieldOverlayControl(el, { signal });
    for (const [, entries] of el.listeners) {
      entries.forEach(({ opts }) => expect(opts).toEqual({ signal }));
    }
  });

  test('reports false for a missing element rather than throwing', async () => {
    // Every caller passes getElementById(...) straight in, so a page that has
    // not added the link yet hands this a null. A throw here would take the
    // whole scene down during setup.
    const { shieldOverlayControl } = await load();
    expect(shieldOverlayControl(null)).toBe(false);
    expect(shieldOverlayControl(undefined)).toBe(false);
    expect(shieldOverlayControl({})).toBe(false);
  });
});
