// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * sw.js - The cleaner's page, kept for reopening offline (PRD 12.3, M4
 * piece 4; Steve, 2026-10-15: a service worker scoped to whitestone/tasks/).
 *
 * A cleaner opens the checklist at a home with a weak signal, or none. The
 * page's own files (its markup, modules, styles, wordmark, the schedule and
 * the price sheet it was quoted on) are kept here as they arrive, so a
 * reload with no signal still opens the page, and the page then opens the
 * checklist from this device.
 *
 * NETWORK FIRST, ALWAYS. Every request goes to the network, and the copy
 * kept here answers only when the network fails, or keeps the cleaner
 * waiting longer than `WAIT_MS` (the network's answer, when it comes,
 * still refreshes the copy). So a change to the page arrives on the next
 * load with a signal, and nothing here can serve a stale page over a
 * working connection.
 *
 * NOTHING PRIVATE. Only this site's own files are kept. The API is never
 * kept here (the checklist is sealed with its key and kept by the page
 * itself), nor a usage beacon, nor anything from another origin, nor
 * anything but a GET with a whole, ordinary answer. The page is kept once,
 * without its `?c=`, so no checklist's id is written here.
 *
 * A classic script, with no imports, so it runs in every browser that has
 * service workers. tests/whitestone-sw.test.mjs runs it against fakes.
 */

/* global self, caches, fetch */

/** This worker's cache. A new name (with its version) clears the old ones
 *  when it takes over. v2 (2026-10-17): the page kept once, not once per
 *  checklist, so v1's copies (each under a checklist's id) are cleared. */
const CACHE = 'whitestone-tasks-v2';
const CACHE_PREFIX = 'whitestone-tasks-';

/** How long the network may keep the cleaner waiting before the kept copy
 *  answers instead. Milliseconds. */
const WAIT_MS = 4000;

/** Whether a request may be answered from, and kept in, this cache. Never
 *  the API, nor a usage beacon (telemetry's `api.html?action=...`, from any
 *  folder: a new address every tap, worth nothing offline). */
function keepable(url, method) {
    let at;
    try {
        at = new URL(url);
    } catch (e) {
        return false;
    }
    return method === 'GET' && at.origin === self.location.origin
        && (at.protocol === 'https:' || at.protocol === 'http:')
        && !at.pathname.startsWith('/api/') && !at.pathname.endsWith('/api.html');
}

/** Where a request is kept. A page (an address ending in `/` or `.html`) is
 *  kept once, without its query: every checklist's `?c=` is the same page,
 *  and its id is not written here. Anything else, under its own address.
 *  Only for an address `keepable` has passed. */
function keyOf(url) {
    const at = new URL(url);
    return at.pathname.endsWith('/') || at.pathname.endsWith('.html') ? `${at.origin}${at.pathname}` : url;
}

/** The kept copy of a request, or undefined. */
function kept(cache, request) {
    return cache.match(keyOf(request.url));
}

/** The network's answer, kept when it is whole and ordinary. */
async function fromNetwork(cache, request) {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') await cache.put(keyOf(request.url), response.clone());
    return response;
}

/** Network first; the kept copy if it fails, or is slower than WAIT_MS. */
async function respond(request) {
    const cache = await caches.open(CACHE);
    const network = fromNetwork(cache, request);
    const SLOW = {};
    let timer = null;
    const slow = new Promise((resolve) => {
        timer = setTimeout(() => resolve(SLOW), WAIT_MS);
    });
    try {
        const first = await Promise.race([network, slow]);
        if (first !== SLOW) return first;
        const hit = await kept(cache, request);
        if (hit) {
            // The network may still finish, and refresh the copy.
            network.catch(() => {});
            return hit;
        }
        return await network;
    } catch (e) {
        const hit = await kept(cache, request);
        if (hit) return hit;
        throw e;
    } finally {
        clearTimeout(timer);
    }
}

/** The files the page says it loaded before this worker was in charge (its
 *  first visit), kept so the very next reload works offline. */
async function keepAll(urls) {
    const cache = await caches.open(CACHE);
    for (const url of Array.isArray(urls) ? urls.slice(0, 200) : []) {
        if (typeof url !== 'string' || !keepable(url, 'GET')) continue;
        try {
            if (!(await cache.match(keyOf(url)))) await fromNetwork(cache, new Request(url));
        } catch (e) {
            // Offline already: kept on a later visit.
        }
    }
}

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        for (const name of await caches.keys()) {
            if (name.startsWith(CACHE_PREFIX) && name !== CACHE) await caches.delete(name);
        }
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (!keepable(request.url, request.method)) return;
    event.respondWith(respond(request));
});

self.addEventListener('message', (event) => {
    const data = event.data;
    // Only this site's own pages can reach a worker, and keepAll keeps only
    // this site's own files.
    if (data && data.type === 'keep') event.waitUntil(keepAll(data.urls));
});
