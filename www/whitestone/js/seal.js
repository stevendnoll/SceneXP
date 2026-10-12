// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * seal.js - Encrypting what a published checklist sends to the server
 * (PRD 13.2, PLANNING 7.2).
 *
 * THE SERVER STORES ONLY WHAT IT CANNOT READ. The customer's browser makes a
 * random key for each checklist and seals the checklist, its photos, every
 * add-on and every report with it. The key travels only in the link's
 * fragment (links.js), which browsers never send to a server.
 *
 * AES-GCM with a 256-bit key, from the browser's own WebCrypto. Nothing here
 * is invented: a fresh random 96-bit IV for every seal, and the GCM tag
 * checked on every open.
 *
 *   envelope   [1 byte format = 1][12 byte IV][ciphertext and 16 byte tag]
 *   context    whitestone/1/<checklistId>/<kind>/<name>, bound in as
 *              additional authenticated data
 *
 * THE CONTEXT IS WHAT STOPS A SWAP. A sealed photo opened as another photo,
 * or a proposal opened as a report, or anything opened under another
 * checklist, fails exactly as a tampered byte does.
 *
 * `subtle` and the random source are handed in, so the suite runs this on
 * Node's own WebCrypto.
 */

export const FORMAT = 1;
export const KINDS = Object.freeze(['checklist', 'photo', 'thumb', 'addon', 'decision', 'report', 'proof']);
const IV_BYTES = 12;
const NAME = /^[A-Za-z0-9_-]{1,64}$/;

// ---- base64url --------------------------------------------------------------

export function toBase64url(bytes) {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url text to bytes, or null if it is not base64url. */
export function fromBase64url(text) {
    if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

// ---- Contexts ---------------------------------------------------------------

/** The additional authenticated data naming what some bytes are. */
export function contextFor(checklistId, kind, name = 'main') {
    if (!NAME.test(String(checklistId)) || !KINDS.includes(kind) || !NAME.test(String(name))) {
        throw new Error('not a seal context');
    }
    return `whitestone/${FORMAT}/${checklistId}/${kind}/${name}`;
}

// ---- The sealer -------------------------------------------------------------

/**
 * Seal and open with an injected WebCrypto:
 *   createSealer({ subtle, getRandomValues })
 * Both default to the browser's own `crypto`.
 */
export function createSealer({ subtle = globalThis.crypto && globalThis.crypto.subtle,
    getRandomValues = (a) => globalThis.crypto.getRandomValues(a) } = {}) {
    const encoder = new TextEncoder();
    const aad = (context) => encoder.encode(context);

    /** A fresh checklist key. */
    async function generateKey() {
        return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    }

    /** A key as the 43 characters that travel in a link. */
    async function exportKey(key) {
        return toBase64url(new Uint8Array(await subtle.exportKey('raw', key)));
    }

    /** The 43 characters back into a key. Rejects anything else. */
    async function importKey(text) {
        const raw = typeof text === 'string' && text.length === 43 ? fromBase64url(text) : null;
        if (!raw || raw.length !== 32) throw new Error('not a checklist key');
        return subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }

    /** Bytes sealed under a key and a context (from contextFor). */
    async function seal(key, bytes, context) {
        const iv = getRandomValues(new Uint8Array(IV_BYTES));
        const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(context) }, key, bytes));
        const out = new Uint8Array(1 + IV_BYTES + ct.length);
        out[0] = FORMAT;
        out.set(iv, 1);
        out.set(ct, 1 + IV_BYTES);
        return out;
    }

    /** The bytes inside a sealed envelope. Throws on a wrong key, a wrong
     *  context, a changed byte or an unknown format, without saying which. */
    async function open(key, sealed, context) {
        const bytes = sealed instanceof Uint8Array ? sealed : new Uint8Array(sealed || []);
        if (bytes.length < 1 + IV_BYTES + 16 || bytes[0] !== FORMAT) throw new Error('could not open');
        try {
            const plain = await subtle.decrypt(
                { name: 'AES-GCM', iv: bytes.slice(1, 1 + IV_BYTES), additionalData: aad(context) },
                key, bytes.slice(1 + IV_BYTES));
            return new Uint8Array(plain);
        } catch (e) {
            throw new Error('could not open');
        }
    }

    async function sealJson(key, value, context) {
        return seal(key, encoder.encode(JSON.stringify(value)), context);
    }

    async function openJson(key, sealed, context) {
        const bytes = await open(key, sealed, context);
        try {
            return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        } catch (e) {
            throw new Error('could not open');
        }
    }

    return { generateKey, exportKey, importKey, seal, open, sealJson, openJson };
}
