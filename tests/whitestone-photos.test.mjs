// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Photos on the device (www/whitestone/js/photos.js): the resize rule, the
 * store over its four-method backend, pruning what the document no longer
 * uses, the IndexedDB backend against a small fake, and preparePhoto with
 * the browser's pieces handed in.
 *
 * Whether a re-encoded JPEG really carries no location can only be seen in a
 * browser, so that half is Steve's QA (a photo with GPS in, then the saved
 * one checked for metadata).
 */
import { CONFIG } from '../www/whitestone/js/config.js';
import { fitWithin, createMemoryBackend, createPhotoStore, openIdbBackend, preparePhoto } from '../www/whitestone/js/photos.js';

const blob = (size) => ({ size });

describe('fitWithin', () => {
    test.each([
        [4032, 3024, 1600, { width: 1600, height: 1200 }],
        [3024, 4032, 1600, { width: 1200, height: 1600 }],
        [1000, 500, 1600, { width: 1000, height: 500 }],     // never enlarged
        [4000, 1, 320, { width: 320, height: 1 }],           // never below a pixel
        [1601, 1601, 1600, { width: 1600, height: 1600 }],
        [0, 0, 320, { width: 1, height: 1 }]
    ])('%i by %i within %i', (w, h, max, size) => {
        expect(fitWithin(w, h, max)).toEqual(size);
    });
});

describe('the photo store', () => {
    let store;
    beforeEach(() => { store = createPhotoStore(createMemoryBackend(), CONFIG); });

    test('keeps both sizes of each photo, and removes them together', async () => {
        await store.put('photo-one-1', { full: blob(300000), thumb: blob(20000) });
        expect(await store.get('photo-one-1')).toEqual(blob(300000));
        expect(await store.get('photo-one-1', 'thumb')).toEqual(blob(20000));
        expect(await store.ids()).toEqual(['photo-one-1']);
        await store.remove('photo-one-1');
        expect(await store.get('photo-one-1')).toBeNull();
        expect(await store.ids()).toEqual([]);
    });

    test('refuses a photo too large to be one this page made, and anything that is not a photo id or size', async () => {
        await expect(store.put('photo-one-1', { full: blob(CONFIG.photos.maxFullBytes + 1), thumb: blob(10) })).rejects.toThrow('too large');
        await expect(store.put('photo-one-1', { full: blob(10), thumb: blob(CONFIG.photos.maxThumbBytes + 1) })).rejects.toThrow('too large');
        await expect(store.put('photo-one-1', { full: null, thumb: blob(10) })).rejects.toThrow();
        await expect(store.put('../etc', { full: blob(10), thumb: blob(10) })).rejects.toThrow('not a photo id');
        await expect(store.get('photo-one-1', 'original')).rejects.toThrow('not a photo size');
    });

    test('pruning deletes exactly the photos the document no longer refers to', async () => {
        for (const id of ['keep-me-111', 'drop-me-111', 'drop-me-222']) await store.put(id, { full: blob(10), thumb: blob(10) });
        expect(await store.prune(new Set(['keep-me-111']))).toBe(2);
        expect(await store.ids()).toEqual(['keep-me-111']);
    });
});

describe('the IndexedDB backend, against a small fake', () => {
    /** Just enough of IndexedDB: open, upgrade, one store, transactions that
     *  complete on the next turn. */
    function fakeIdb() {
        const data = new Map();
        const stores = new Set();
        const db = {
            objectStoreNames: { contains: (n) => stores.has(n) },
            createObjectStore: (n) => { stores.add(n); },
            transaction() {
                const tx = {};
                const store = {
                    get: (k) => { const r = { result: data.get(k) }; return r; },
                    put: (v, k) => { data.set(k, v); },
                    delete: (k) => { data.delete(k); },
                    getAllKeys: () => ({ result: [...data.keys()] })
                };
                tx.objectStore = () => store;
                setTimeout(() => tx.oncomplete && tx.oncomplete(), 0);
                return tx;
            }
        };
        return {
            opened: [],
            open(name, version) {
                this.opened.push([name, version]);
                const req = { result: db };
                setTimeout(() => { req.onupgradeneeded(); req.onsuccess(); }, 0);
                return req;
            }
        };
    }

    test('opens the Whitestone database, and works as a backend', async () => {
        const idb = fakeIdb();
        const backend = await openIdbBackend(CONFIG, idb);
        expect(idb.opened).toEqual([['scenexp-whitestone', 1]]);
        const store = createPhotoStore(backend, CONFIG);
        await store.put('photo-one-1', { full: blob(5), thumb: blob(5) });
        expect(await store.get('photo-one-1', 'thumb')).toEqual(blob(5));
        expect(await store.ids()).toEqual(['photo-one-1']);
        await store.remove('photo-one-1');
        expect(await store.get('photo-one-1')).toBeNull();
    });

    test('no IndexedDB, or one that refuses, means no backend, never a crash', async () => {
        expect(await openIdbBackend(CONFIG, null)).toBeNull();
        expect(await openIdbBackend(CONFIG, { open() { throw new Error('SecurityError'); } })).toBeNull();
        const failing = { open() { const req = {}; setTimeout(() => req.onerror(), 0); return req; } };
        expect(await openIdbBackend(CONFIG, failing)).toBeNull();
    });
});

describe('preparePhoto', () => {
    test('draws both sizes onto fresh canvases and saves each as a JPEG at the configured quality', async () => {
        const drawn = [];
        const env = {
            decode: async (file) => ({ width: 4032, height: 3024, file, closed: false, close() { this.closed = true; } }),
            canvas: (width, height) => ({ width, height, getContext: () => ({ drawImage: (img, x, y, w, h) => drawn.push([w, h]) }) }),
            toBlob: async (canvas, type, quality) => ({ type, quality, width: canvas.width, size: canvas.width * 10 })
        };
        const out = await preparePhoto({ name: 'IMG_0001.HEIC' }, CONFIG, env);
        expect(drawn).toEqual([[1600, 1200], [320, 240]]);
        expect(out.full).toEqual({ type: 'image/jpeg', quality: 0.8, width: 1600, size: 16000 });
        expect(out.thumb).toMatchObject({ type: 'image/jpeg', width: 320 });
        expect([out.width, out.height]).toEqual([1600, 1200]);
    });
});
