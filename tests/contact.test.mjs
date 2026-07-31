// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/js/contact.js — the proof-of-work gate that reveals the
 * contact address.
 *
 * contact.js exposes its internals via a `__test__` export and only auto-runs
 * reveal() when a document exists, so importing it under Node is safe. The
 * browser globals it touches (document, window.crypto, sessionStorage) are
 * stubbed per-test AFTER the import, so the auto-run never fires and each test
 * drives reveal() itself.
 *
 * The proof of work is not mocked: reveal() runs against the real shared
 * boot-1.0.0 solver using Node's Web Crypto, so the success-path test proves
 * the genuine article — a mined SHA-256 proof meeting the '000' prefix —
 * gates the reveal. The address itself is asserted with a pattern, never a
 * literal, so no email string ever appears in this (public) repo.
 */
import { jest } from '@jest/globals';
import { sha256Hex } from '../www/shared/js/boot-1.0.0.js';

function makeStorage({ seed = {}, failing = false } = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem(k) { if (failing) throw new Error('blocked'); return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { if (failing) throw new Error('blocked'); data.set(k, String(v)); },
    _raw: (k) => data.get(k),
  };
}

// Stub elements shaped like the three nodes reveal() looks up on contact.html.
function makeElements() {
  return {
    box: { hidden: true },
    status: { textContent: '' },
    target: {
      textContent: 'placeholder',
      children: [],
      appendChild(el) { this.children.push(el); },
    },
  };
}

// Install a document stub. With no elements, getElementById returns null for
// everything, matching a page without the contact-reveal markup.
function installDocument(els = null) {
  const byId = els ? {
    'contact-reveal': els.box,
    'contact-reveal-status': els.status,
    'contact-reveal-link': els.target,
  } : {};
  globalThis.document = {
    getElementById: (id) => byId[id] ?? null,
    createElement: jest.fn(() => ({ href: '', textContent: '' })),
  };
  return globalThis.document;
}

// Give the boot solver what it feature-detects: window.crypto plus the bare
// crypto/sessionStorage globals (crypto.subtle is Node's real Web Crypto).
function installCrypto() {
  globalThis.window = { crypto: globalThis.crypto };
}

async function load() {
  jest.resetModules();
  const mod = await import('../www/js/contact.js');
  return mod.__test__;
}

// Mine a genuine proof for the module's difficulty prefix, using the same
// sha256Hex the solver recomputes on read, so boot accepts it as stored.
async function mineProof(prefix, { seed = 'unit-seed', timestamp = Date.now() } = {}) {
  for (let nonce = 0; ; nonce++) {
    const hash = await sha256Hex(`${seed}:${nonce}`);
    if (hash.startsWith(prefix)) return { seed, nonce, hash, timestamp };
  }
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

afterEach(() => {
  jest.restoreAllMocks();
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.sessionStorage;
});

describe('assembleAddress', () => {
  test('assembles a plausible email address from the split parts', async () => {
    const { assembleAddress } = await load();
    const address = assembleAddress();
    expect(address).toMatch(EMAIL_RE);
    // The mailbox lives at the LLC's domain (scenexp.com has no email
    // hosting). The local part stays out of this assertion on purpose.
    expect(address).toContain('@continuumcommercellc.');
  });
});

describe('reveal on a page without the contact markup', () => {
  test('returns quietly and never builds a link', async () => {
    const { reveal } = await load();
    const doc = installDocument(null);
    await expect(reveal()).resolves.toBeUndefined();
    expect(doc.createElement).not.toHaveBeenCalled();
  });
});

describe('reveal without Web Crypto (insecure context)', () => {
  test('shows the graceful https explanation instead of a dead end', async () => {
    const { reveal } = await load();
    const els = makeElements();
    installDocument(els); // no window.crypto installed
    await reveal();
    expect(els.box.hidden).toBe(false);
    expect(els.status.textContent).toMatch(/secure connection \(https\)/);
    expect(els.target.children).toEqual([]);
  });
});

describe('reveal with real Web Crypto', () => {
  test('mines a proof, persists it, and reveals the mailto link', async () => {
    const t = await load();
    const els = makeElements();
    installDocument(els);
    installCrypto();
    const storage = makeStorage();
    globalThis.sessionStorage = storage;

    await t.reveal();

    expect(els.box.hidden).toBe(false);
    expect(els.status.textContent).toMatch(/Thank you for waiting/);

    const [link] = els.target.children;
    expect(els.target.children).toHaveLength(1);
    expect(els.target.textContent).toBe(''); // placeholder cleared before append
    expect(link.textContent).toMatch(EMAIL_RE);
    expect(link.textContent).toBe(t.assembleAddress());

    // The subject carries a Ref: the first 6 hex chars of the proof that
    // was actually solved and persisted.
    const stored = JSON.parse(storage._raw(t.STORAGE_KEY));
    expect(link.href).toBe('mailto:' + t.assembleAddress()
      + '?subject=' + encodeURIComponent(`A custom 3D experience (Ref ${stored.hash.slice(0, 6)})`));
    expect(stored.hash.startsWith(t.PREFIX)).toBe(true);
    expect(await sha256Hex(`${stored.seed}:${stored.nonce}`)).toBe(stored.hash);
  });

  test('reuses a valid stored proof instead of mining a new one', async () => {
    const t = await load();
    const proof = await mineProof(t.PREFIX);
    const storage = makeStorage({ seed: { [t.STORAGE_KEY]: JSON.stringify(proof) } });
    globalThis.sessionStorage = storage;
    const els = makeElements();
    installDocument(els);
    installCrypto();

    await t.reveal();

    // Same nonce and hash still stored: the cached proof was accepted as-is.
    const stored = JSON.parse(storage._raw(t.STORAGE_KEY));
    expect(stored.nonce).toBe(proof.nonce);
    expect(stored.hash).toBe(proof.hash);
    expect(els.target.children).toHaveLength(1);
    // And the Ref in the subject comes from that reused proof.
    expect(els.target.children[0].href).toContain(encodeURIComponent(`Ref ${proof.hash.slice(0, 6)}`));
  });

  test('still reveals when sessionStorage is unavailable', async () => {
    const t = await load();
    globalThis.sessionStorage = makeStorage({ failing: true });
    const els = makeElements();
    installDocument(els);
    installCrypto();

    await t.reveal();

    expect(els.status.textContent).toMatch(/Thank you for waiting/);
    expect(els.target.children).toHaveLength(1);
  });
});
