// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Sealing (www/whitestone/js/seal.js) on Node's own WebCrypto: round trips,
 * and every way an envelope can be wrong failing the same way, so the server
 * (which holds the envelopes) can never read, swap or alter one.
 */
import { webcrypto } from 'node:crypto';
import { createSealer, contextFor, toBase64url, fromBase64url, FORMAT } from '../www/whitestone/js/seal.js';

const sealer = createSealer({ subtle: webcrypto.subtle, getRandomValues: (a) => webcrypto.getRandomValues(a) });
const id = 'AbCdEfGhIjKlMnOpQrStUv';
const ctx = contextFor(id, 'checklist');
const bytes = new TextEncoder().encode('Kitchen: stovetop, deep clean');

describe('base64url', () => {
    test('round trips every byte, with no padding or URL-unsafe characters', () => {
        const all = new Uint8Array(256).map((_, i) => i);
        const text = toBase64url(all);
        expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(fromBase64url(text)).toEqual(all);
        expect(fromBase64url('')).toEqual(new Uint8Array(0));
    });

    test('refuses what is not base64url', () => {
        for (const bad of ['a+b/', 'abc=', 'a', '%%%%', null, 7]) expect(fromBase64url(bad)).toBeNull();
    });
});

describe('contexts', () => {
    test('name a checklist, a kind and a name', () => {
        expect(ctx).toBe(`whitestone/1/${id}/checklist/main`);
        expect(contextFor(id, 'photo', 'p3XkF')).toBe(`whitestone/1/${id}/photo/p3XkF`);
    });

    test('refuse anything that could blur two of them together', () => {
        expect(() => contextFor(`${id}/photo`, 'checklist')).toThrow();
        expect(() => contextFor(id, 'invoice')).toThrow();
        expect(() => contextFor(id, 'photo', '../report')).toThrow();
        expect(() => contextFor('', 'photo')).toThrow();
    });
});

describe('sealing', () => {
    let key;
    beforeAll(async () => { key = await sealer.generateKey(); });

    test('round trips bytes and JSON', async () => {
        expect(await sealer.open(key, await sealer.seal(key, bytes, ctx), ctx)).toEqual(bytes);
        const doc = { rooms: [{ area: 'kitchen' }], note: 'Café, naïve, 🙂' };
        expect(await sealer.openJson(key, await sealer.sealJson(key, doc, ctx), ctx)).toEqual(doc);
    });

    test('the envelope is the version, a fresh IV, then the ciphertext and its tag', async () => {
        const a = await sealer.seal(key, bytes, ctx);
        const b = await sealer.seal(key, bytes, ctx);
        expect(a[0]).toBe(FORMAT);
        expect(a.length).toBe(1 + 12 + bytes.length + 16);
        expect(toBase64url(a.slice(1, 13))).not.toBe(toBase64url(b.slice(1, 13)));   // never the same IV twice
        expect(toBase64url(a)).not.toBe(toBase64url(b));
    });

    test('a key travels as 43 characters and comes back the same key', async () => {
        const text = await sealer.exportKey(key);
        expect(text).toMatch(/^[A-Za-z0-9_-]{43}$/);
        const again = await sealer.importKey(text);
        expect(await sealer.open(again, await sealer.seal(key, bytes, ctx), ctx)).toEqual(bytes);
    });

    test('a key that is not 43 base64url characters of 32 bytes is refused', async () => {
        for (const bad of ['', 'x'.repeat(42), 'x'.repeat(44), '+'.repeat(43), null]) {
            await expect(sealer.importKey(bad)).rejects.toThrow('not a checklist key');
        }
    });

    describe('everything wrong fails, and fails alike', () => {
        let sealed;
        beforeAll(async () => { sealed = await sealer.seal(key, bytes, ctx); });
        const fails = (p) => expect(p).rejects.toThrow('could not open');

        test('another key', async () => {
            await fails(sealer.open(await sealer.generateKey(), sealed, ctx));
        });

        test('the same bytes opened as something else: another kind, name or checklist', async () => {
            await fails(sealer.open(key, sealed, contextFor(id, 'report')));
            await fails(sealer.open(key, sealed, contextFor(id, 'checklist', 'other')));
            await fails(sealer.open(key, sealed, contextFor('ZZZZZZZZZZZZZZZZZZZZZZ', 'checklist')));
        });

        test('any one byte changed, anywhere', async () => {
            for (const at of [0, 1, 12, 13, sealed.length - 1]) {
                const bent = sealed.slice();
                bent[at] ^= 0x01;
                await fails(sealer.open(key, bent, ctx));
            }
        });

        test('cut short, or nothing at all', async () => {
            await fails(sealer.open(key, sealed.slice(0, 20), ctx));
            await fails(sealer.open(key, null, ctx));
        });

        test('sealed bytes that are not JSON', async () => {
            await fails(sealer.openJson(key, await sealer.seal(key, new Uint8Array([0xff, 0xfe]), ctx), ctx));
            await fails(sealer.openJson(key, await sealer.seal(key, new TextEncoder().encode('{not json'), ctx), ctx));
        });
    });
});
