// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * ids.js - Record ids.
 *
 * Pure. `newId` takes its randomness as an argument so a test can hand it a
 * fake crypto and get a predictable id. Copied from Prospect City (branch
 * `job`), less the facade hash the office has no use for.
 */

const UUID_TEMPLATE = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';

/**
 * A fresh record id. Uses `crypto.randomUUID` where the browser offers it, and
 * a Math.random UUID of the same shape everywhere else, so an id is always 36
 * characters and never collides with another in the same document in practice.
 */
export function newId(cryptoLike = globalThis.crypto, random = Math.random) {
    if (cryptoLike && typeof cryptoLike.randomUUID === 'function') {
        try {
            return cryptoLike.randomUUID();
        } catch (e) {
            // An insecure context throws here on some browsers. Fall through.
        }
    }
    return UUID_TEMPLATE.replace(/[xy]/g, (c) => {
        const r = Math.floor(random() * 16);
        const v = c === 'x' ? r : ((r & 0x3) | 0x8);
        return v.toString(16);
    });
}
