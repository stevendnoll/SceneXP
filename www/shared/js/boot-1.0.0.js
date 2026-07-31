// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * boot.js - Proof-of-work load gate (shared engine part)
 *
 * A deliberately tiny client-side proof of work run before the scene builds:
 * the browser hashes `${seed}:${nonce}` with SHA-256 until the hex digest
 * starts with the configured prefix. At a ~1-in-256 target a real visitor
 * clears it in a few milliseconds, while the simplest no-JS / no-crypto
 * crawlers never start the scene at all. With no backend to verify the result
 * this is a soft deterrent, not access control — a JavaScript-capable bot
 * will solve it like any browser.
 *
 * The solved proof ({ seed, nonce, hash, timestamp }) is cached in
 * sessionStorage and reused so reloads within a visit don't re-solve. Because
 * there is no server, a visitor could hand-write a bogus entry; we defend by
 * re-deriving the hash from the stored seed/nonce on read and rejecting
 * anything that doesn't reproduce the stored hash or no longer meets the
 * difficulty target.
 *
 * Usage: getProofOfWork({ prefix: '11', storageKey: 'gallery-pow',
 * maxAgeMs: 86400000 }) — all optional, defaults shown except the storage key
 * (default 'experience-pow'; experiences with cached visitor proofs under a
 * legacy key should keep passing it).
 */

// Effective settings, installed on each getProofOfWork call so the helper
// functions below don't need them threaded through.
let _prefix = '11';
let _storageKey = 'experience-pow';
let _maxAgeMs = 24 * 60 * 60 * 1000;

const _powEncoder = new TextEncoder();

export function bufToHex(buf) {
    const bytes = new Uint8Array(buf);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return hex;
}

/** SHA-256 of a string, returned as a lowercase hex digest. Assumes the caller
 *  has already confirmed crypto.subtle is available. */
export async function sha256Hex(message) {
    const digest = await crypto.subtle.digest('SHA-256', _powEncoder.encode(message));
    return bufToHex(digest);
}

async function solveProofOfWork() {
    // crypto.subtle needs a secure context (https or localhost). If it is not
    // available, skip the gate rather than block a legitimate visitor.
    if (!(window.crypto && crypto.subtle && typeof crypto.randomUUID === 'function')) {
        return null;
    }
    const seed = `${Date.now()}-${crypto.randomUUID()}`;
    // Safety cap so a visitor is never trapped if the target is mis-set.
    for (let nonce = 0; nonce < 5_000_000; nonce++) {
        const hash = await sha256Hex(`${seed}:${nonce}`);
        if (hash.startsWith(_prefix)) {
            return { seed, nonce, hash, timestamp: Date.now() };
        }
        // Yield occasionally so the loading screen can paint.
        if ((nonce & 255) === 255) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return null;
}

/** Re-derive the hash from a stored proof and confirm it is genuine: well-formed,
 *  fresh, still meets the difficulty target, and reproduces the stored hash
 *  from its own seed/nonce. Guards against a forged sessionStorage entry. */
async function isStoredProofValid(proof) {
    if (!proof || typeof proof.seed !== 'string' || !Number.isInteger(proof.nonce) ||
        typeof proof.hash !== 'string' || typeof proof.timestamp !== 'number') {
        return false;
    }
    const age = Date.now() - proof.timestamp;
    if (age < 0 || age > _maxAgeMs) return false;             // stale or future-dated
    if (!proof.hash.startsWith(_prefix)) return false;        // doesn't meet the target
    if (!(window.crypto && crypto.subtle)) return false;
    return (await sha256Hex(`${proof.seed}:${proof.nonce}`)) === proof.hash;
}

function readStoredProof() {
    try {
        const raw = sessionStorage.getItem(_storageKey);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null; // unparseable / sessionStorage unavailable
    }
}

function persistProof(proof) {
    try {
        sessionStorage.setItem(_storageKey, JSON.stringify(proof));
    } catch (e) {
        // sessionStorage can be unavailable (private mode, quota); the proof
        // still works for this load, it just won't be reused on the next one.
    }
}

/** Return a valid proof of work, reusing a fresh one from sessionStorage when
 *  available, otherwise solving a new one and persisting it for next time. */
export async function getProofOfWork(options = {}) {
    if (typeof options.prefix === 'string' && options.prefix) _prefix = options.prefix;
    if (typeof options.storageKey === 'string' && options.storageKey) _storageKey = options.storageKey;
    if (typeof options.maxAgeMs === 'number' && options.maxAgeMs > 0) _maxAgeMs = options.maxAgeMs;

    const stored = readStoredProof();
    if (await isStoredProofValid(stored)) return stored;
    const proof = await solveProofOfWork();
    if (proof) persistProof(proof);
    return proof;
}
