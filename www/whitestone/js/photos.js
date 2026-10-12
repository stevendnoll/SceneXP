// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * photos.js - Photos of a home, kept on the customer's device (PRD 11.6).
 *
 * RE-ENCODED, NEVER COPIED. A phone photo carries its GPS location, and a
 * checklist of interior photos plus a location is a burglar's catalog (PRD
 * 15). So every photo is decoded and drawn onto a canvas at a sensible size
 * (1600 pixels on the long edge, and a 320 pixel thumbnail), then saved as a
 * fresh JPEG. A canvas carries no metadata at all, so none survives.
 *
 * INDEXEDDB, BECAUSE localStorage IS FAR TOO SMALL. The store works over any
 * backend with four methods (get, put, delete, keys), so the suite runs it on
 * a Map and the page on IndexedDB. `openIdbBackend` is the one place that
 * opens the database, and tests/privacy.test.mjs names this file for it.
 *
 * Pure apart from `openIdbBackend` and `preparePhoto`, which take the browser
 * as an argument where they can.
 */

import { ID_PATTERN } from './store.min.js';

const KINDS = Object.freeze(['full', 'thumb']);

/** The size a w by h picture becomes with its long edge at most `max`.
 *  Never enlarged, never below one pixel. */
export function fitWithin(width, height, max) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const scale = Math.min(1, max / Math.max(w, h));
    return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** A backend in memory, for tests and for a browser with no IndexedDB. */
export function createMemoryBackend() {
    const map = new Map();
    return {
        async get(key) { return map.has(key) ? map.get(key) : null; },
        async put(key, value) { map.set(key, value); },
        async delete(key) { map.delete(key); },
        async keys() { return [...map.keys()]; }
    };
}

function sizeOf(blob) {
    return blob && typeof blob.size === 'number' ? blob.size : -1;
}

/**
 * Photos by id, over a backend. Each photo is two entries, `<id>:full` and
 * `<id>:thumb`.
 */
export function createPhotoStore(backend, config) {
    const limits = config.photos;
    const keyOf = (id, kind) => `${id}:${kind}`;
    const check = (id) => {
        if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new Error('not a photo id');
    };

    return {
        /** Save both sizes. Refuses a photo too large to be one made here. */
        async put(id, { full, thumb }) {
            check(id);
            const f = sizeOf(full);
            const t = sizeOf(thumb);
            if (f <= 0 || f > limits.maxFullBytes) throw new Error('the photo is too large');
            if (t <= 0 || t > limits.maxThumbBytes) throw new Error('the thumbnail is too large');
            await backend.put(keyOf(id, 'full'), full);
            await backend.put(keyOf(id, 'thumb'), thumb);
        },
        async get(id, kind = 'full') {
            check(id);
            if (!KINDS.includes(kind)) throw new Error('not a photo size');
            return backend.get(keyOf(id, kind));
        },
        async remove(id) {
            check(id);
            await backend.delete(keyOf(id, 'full'));
            await backend.delete(keyOf(id, 'thumb'));
        },
        /** Every photo id stored. */
        async ids() {
            const out = new Set();
            for (const key of await backend.keys()) {
                const m = /^(.+):(full|thumb)$/.exec(String(key));
                if (m && ID_PATTERN.test(m[1])) out.add(m[1]);
            }
            return [...out];
        },
        /** Delete every stored photo the document no longer refers to
         *  (store.js `photoIdsInUse`). Returns how many went. */
        async prune(inUse) {
            let removed = 0;
            for (const id of await this.ids()) {
                if (!inUse.has(id)) {
                    await this.remove(id);
                    removed++;
                }
            }
            return removed;
        }
    };
}

/**
 * The IndexedDB backend: one database, one object store. Resolves to null
 * where IndexedDB is missing or refused (a private window, for instance),
 * and the page then keeps photos in memory for the visit and says so.
 */
export function openIdbBackend(config, indexedDB = globalThis.indexedDB) {
    // The parameter is named for the global on purpose, so the call below
    // reads `indexedDB.open(` as tests/privacy.test.mjs searches for it, and a
    // test can still hand in its own.
    return new Promise((resolve) => {
        if (!indexedDB) { resolve(null); return; }
        let request;
        try {
            request = indexedDB.open(config.photos.database, 1);
        } catch (e) {
            resolve(null);
            return;
        }
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains('photos')) request.result.createObjectStore('photos');
        };
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
            const db = request.result;
            const run = (mode, act) => new Promise((done, fail) => {
                const tx = db.transaction('photos', mode);
                const req = act(tx.objectStore('photos'));
                tx.oncomplete = () => done(req ? req.result : undefined);
                tx.onerror = () => fail(tx.error);
                tx.onabort = () => fail(tx.error);
            });
            resolve({
                get: (key) => run('readonly', (s) => s.get(key)).then((v) => (v === undefined ? null : v)),
                put: (key, value) => run('readwrite', (s) => { s.put(value, key); return null; }),
                delete: (key) => run('readwrite', (s) => { s.delete(key); return null; }),
                keys: () => run('readonly', (s) => s.getAllKeys())
            });
        };
    });
}

/**
 * Decode a picked file and make both sizes as fresh JPEGs, which drops all
 * metadata. `env` holds the browser pieces, so a test can hand in fakes:
 *   decode(file)            to an image with width and height, upright
 *   canvas(width, height)   a canvas with getContext('2d')
 *   toBlob(canvas, type, q) to a Blob
 * Resolves to { full, thumb, width, height }.
 */
export async function preparePhoto(file, config, env = browserEnv()) {
    const image = await env.decode(file);
    const make = async (max) => {
        const size = fitWithin(image.width, image.height, max);
        const canvas = env.canvas(size.width, size.height);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, size.width, size.height);
        return { blob: await env.toBlob(canvas, 'image/jpeg', config.photos.quality), size };
    };
    const full = await make(config.photos.fullMax);
    const thumb = await make(config.photos.thumbMax);
    if (typeof image.close === 'function') image.close();
    return { full: full.blob, thumb: thumb.blob, width: full.size.width, height: full.size.height };
}

/** The real browser: createImageBitmap, which applies the photo's own
 *  rotation, and a canvas element. */
function browserEnv() {
    return {
        decode: (file) => createImageBitmap(file, { imageOrientation: 'from-image' }),
        canvas: (width, height) => {
            const c = document.createElement('canvas');
            c.width = width;
            c.height = height;
            return c;
        },
        toBlob: (canvas, type, quality) => new Promise((resolve, reject) => {
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('the photo could not be saved'))), type, quality);
        })
    };
}
