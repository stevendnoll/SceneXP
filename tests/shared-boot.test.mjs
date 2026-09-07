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

describe('installCardScrollReset', () => {
  /* THE BUG, reported from QA on automan and true of twelve other scenes:
   * open a card, scroll down, close it, open it again, and it comes back
   * where it was left. The cards scroll because the shared `.piece-card` caps
   * at 85vh with `overflow-y: auto`, and whether a browser keeps that offset
   * across `display: none` is an engine decision, so it cannot be left to
   * chance in either direction.
   *
   * These drive the observer by hand, the same way the scene suites do:
   * MutationObserver does not exist under Node. */

  /** A card stub: a class list that records, a scroller, and a layout read
   *  the reset is required to make before it writes. */
  function makeCard({ scrollTop = 0, childScrollTop = 0 } = {}) {
    const classes = new Set(['hidden']);
    const child = { scrollTop: childScrollTop, scrollLeft: 0 };
    let layoutReads = 0;
    const card = {
      scrollTop, scrollLeft: 0,
      attrs: {},
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        contains: (c) => classes.has(c),
      },
      hasAttribute: (a) => a in card.attrs,
      get offsetHeight() { layoutReads += 1; return 400; },
      querySelectorAll: () => [child],
      child,
      get layoutReads() { return layoutReads; },
    };
    return card;
  }

  /** Install the fake observer and a document that serves `cards`. */
  async function withCards(cards) {
    const fired = [];
    class FakeMutationObserver {
      constructor(cb) { this.cb = cb; }
      observe(target, opts) { fired.push({ target, opts, cb: this.cb }); }
      disconnect() { this.disconnected = true; }
    }
    globalThis.MutationObserver = FakeMutationObserver;
    globalThis.document = { querySelectorAll: () => cards };
    globalThis.window = { crypto: globalThis.crypto };
    jest.resetModules();
    const m = await import('../www/shared/js/boot-1.0.0.js');
    return { m, fired };
  }

  afterEach(() => {
    delete globalThis.MutationObserver;
  });

  test('a card that opens is put back to the top, inside and out', async () => {
    const card = makeCard({ scrollTop: 320, childScrollTop: 180 });
    const { m, fired } = await withCards([card]);
    expect(m.installCardScrollReset()).toBe(1);
    expect(fired).toHaveLength(1);
    expect(fired[0].opts).toEqual({ attributes: true, attributeFilter: ['class', 'hidden'] });

    card.classList.remove('hidden');   // the card opens
    fired[0].cb();
    expect(card.scrollTop).toBe(0);
    // The scroller is usually the .modal-container inside, not the dialog.
    expect(card.child.scrollTop).toBe(0);
  });

  test('it reads layout BEFORE writing, or the write is dropped', async () => {
    /* THE PART THAT IS EASY TO LOSE. A card goes from `display: none` to
     * shown by a class change, and this runs in the microtask after that
     * mutation, before style and layout are recomputed. Writing scrollTop to
     * a box that does not exist yet is silently ignored, so the reset has to
     * force the flush first. Nothing else in the suite would notice if the
     * `offsetHeight` read were tidied away as a useless statement. */
    const card = makeCard({ scrollTop: 200 });
    const { m, fired } = await withCards([card]);
    m.installCardScrollReset();
    expect(card.layoutReads).toBe(0);
    card.classList.remove('hidden');
    fired[0].cb();
    expect(card.layoutReads).toBeGreaterThan(0);
  });

  test('closing does not reset, and a no-op class change does nothing', async () => {
    // The reset belongs on the OPEN. Doing it on close as well would be two
    // mechanisms for one job, and a class change that does not move the card
    // (a theme toggling something else on the same element) is not an open.
    const card = makeCard({ scrollTop: 90 });
    const { m, fired } = await withCards([card]);
    m.installCardScrollReset();

    card.classList.add('some-theme-flag');   // still hidden
    fired[0].cb();
    expect(card.scrollTop).toBe(90);

    card.classList.remove('hidden');          // now it opens
    fired[0].cb();
    expect(card.scrollTop).toBe(0);

    card.scrollTop = 55;                      // scrolled again
    fired[0].cb();                            // a spurious callback, still open
    expect(card.scrollTop).toBe(55);
  });

  test('the `hidden` attribute counts as hidden too', async () => {
    const card = makeCard({ scrollTop: 140 });
    card.classList.remove('hidden');
    card.attrs.hidden = '';
    const { m, fired } = await withCards([card]);
    m.installCardScrollReset();
    delete card.attrs.hidden;                 // opened by dropping the attribute
    fired[0].cb();
    expect(card.scrollTop).toBe(0);
  });

  test('an AbortSignal disconnects every observer', async () => {
    const cards = [makeCard(), makeCard(), makeCard()];
    const { m, fired } = await withCards(cards);
    const controller = new AbortController();
    expect(m.installCardScrollReset({ signal: controller.signal })).toBe(3);
    controller.abort();
    expect(fired.every((f) => f.cb)).toBe(true);
  });

  test('no cards, or no MutationObserver, and it does nothing rather than throw', async () => {
    // Every scene calls this during setup, and highwater has no dialogs at
    // all. A throw here would take a whole page down at boot.
    const { m } = await withCards([]);
    expect(m.installCardScrollReset()).toBe(0);

    delete globalThis.MutationObserver;
    jest.resetModules();
    globalThis.document = { querySelectorAll: () => [makeCard()] };
    const m2 = await import('../www/shared/js/boot-1.0.0.js');
    expect(m2.installCardScrollReset()).toBe(0);
  });
});
