// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The cleaner's page's service worker (www/whitestone/tasks/sw.js, M4 piece
 * 4): network first, the kept copy only when the network fails or is slow,
 * nothing kept from the API or another site, old caches cleared when a new
 * one takes over, and the files of a first visit kept when the page asks.
 *
 * The worker is a classic script, so it runs here in a sandbox against a
 * fake `self`, Cache Storage and fetch.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ORIGIN = 'https://www.scenexp.com';
const PAGE = `${ORIGIN}/whitestone/tasks/`;
const SOURCE = readFileSync(join(process.cwd(), 'www', 'whitestone', 'tasks', 'sw.js'), 'utf8');
const BUILT = readFileSync(join(process.cwd(), 'www', 'whitestone', 'tasks', 'sw.min.js'), 'utf8');

const CACHE = 'whitestone-tasks-v2';

const withoutSearch = (url) => url.split('?')[0];

/** Cache Storage, in memory: caches by name, each a map of url to body. */
function fakeCaches(start = {}) {
    const store = new Map(Object.entries(start).map(([name, entries]) => [name, new Map(Object.entries(entries))]));
    const cacheOf = (name) => {
        if (!store.has(name)) store.set(name, new Map());
        const map = store.get(name);
        const urlOf = (r) => (typeof r === 'string' ? r : r.url);
        return {
            map,
            async match(r, opts = {}) {
                const url = urlOf(r);
                if (map.has(url)) return map.get(url);
                if (opts.ignoreSearch) {
                    for (const [k, v] of map) if (withoutSearch(k) === withoutSearch(url)) return v;
                }
                return undefined;
            },
            async put(r, response) { map.set(urlOf(r), response); }
        };
    };
    return {
        store,
        open: async (name) => cacheOf(name),
        keys: async () => [...store.keys()],
        delete: async (name) => store.delete(name)
    };
}

const response = (body, extra = {}) => {
    const r = { body, ok: true, type: 'basic', status: 200, ...extra };
    r.clone = () => ({ ...r, cloned: true });
    return r;
};

/** The worker, running: its listeners, and what it was handed. */
function worker({ source = SOURCE, caches = fakeCaches(), fetch = async (r) => response(`net:${r.url}`), setTimeout: st = setTimeout, clearTimeout: ct = clearTimeout } = {}) {
    const listeners = {};
    const self = {
        location: new URL(`${PAGE}sw.min.js`),
        addEventListener: (type, fn) => { listeners[type] = fn; },
        skipWaiting: jest.fn(),
        clients: { claim: jest.fn(async () => {}) }
    };
    const context = { self, caches, fetch, URL, setTimeout: st, clearTimeout: ct, Request: function Request(url) { this.url = url; this.method = 'GET'; this.mode = 'cors'; }, console };
    vm.runInNewContext(source, context);
    /** A fetch event: `{ answered, response }`, the answer awaited. */
    const fetchEvent = async (url, { method = 'GET', mode = 'cors' } = {}) => {
        let answer = null;
        listeners.fetch({ request: { url, method, mode }, respondWith: (p) => { answer = p; } });
        return { answered: answer !== null, response: answer ? await answer : undefined };
    };
    const extendable = async (type, data) => {
        const waits = [];
        listeners[type]({ data, waitUntil: (p) => waits.push(p) });
        await Promise.all(waits);
    };
    return { self, listeners, caches, fetchEvent, extendable };
}

const kept = async (caches, url) => (await (await caches.open(CACHE)).match(url));

describe('what it answers', () => {
    test('never the API, a usage beacon, another site, or anything but a GET: those go straight to the network', async () => {
        const w = worker();
        for (const [url, opts] of [
            [`${ORIGIN}/api/whitestone/checklists/abc`, {}],
            [`${ORIGIN}/api.html?action=cleaner-open&timestamp=1`, { mode: 'no-cors' }],
            // a beacon in any folder (telemetry's default `../api.html` from a page two deep)
            [`${ORIGIN}/whitestone/api.html?action=cleaner-open&timestamp=2`, { mode: 'no-cors' }],
            ['https://elsewhere.example/x.js', {}],
            [`${PAGE}js/main.min.js`, { method: 'POST' }],
            ['not a url', {}]
        ]) expect((await w.fetchEvent(url, opts)).answered).toBe(false);
    });

    test('network first: the answer is served and kept', async () => {
        const w = worker();
        const got = await w.fetchEvent(`${PAGE}js/main.min.js`);
        expect(got.response.body).toBe(`net:${PAGE}js/main.min.js`);
        expect((await kept(w.caches, `${PAGE}js/main.min.js`)).cloned).toBe(true);
    });

    test('an answer that is not whole and ordinary is served but never kept', async () => {
        for (const extra of [{ ok: false, status: 404 }, { type: 'opaque' }]) {
            const w = worker({ fetch: async (r) => response('x', extra) });
            await w.fetchEvent(`${PAGE}js/main.min.js`);
            expect(await kept(w.caches, `${PAGE}js/main.min.js`)).toBeUndefined();
        }
    });

    test('the page is kept once, under its address without a checklist id', async () => {
        const w = worker();
        await w.fetchEvent(`${PAGE}?c=first`, { mode: 'navigate' });
        await w.fetchEvent(`${PAGE}?c=second`, { mode: 'navigate' });
        await w.fetchEvent(`${PAGE}index.html?c=third`, { mode: 'navigate' });
        await w.fetchEvent(`${PAGE}js/main.min.js`);
        const keys = [...(await w.caches.open(CACHE)).map.keys()];
        expect(keys.sort()).toEqual([PAGE, `${PAGE}index.html`, `${PAGE}js/main.min.js`]);
        expect((await kept(w.caches, PAGE)).body).toBe(`net:${PAGE}?c=second`);
    });

    test('no signal: the kept copy, and for the page itself, the one copy under any checklist', async () => {
        const caches = fakeCaches({ [CACHE]: { [`${PAGE}js/main.min.js`]: 'kept-main', [PAGE]: 'kept-page' } });
        const w = worker({ caches, fetch: async () => { throw new TypeError('offline'); } });
        expect((await w.fetchEvent(`${PAGE}js/main.min.js`)).response).toBe('kept-main');
        expect((await w.fetchEvent(`${PAGE}?c=second`, { mode: 'navigate' })).response).toBe('kept-page');
        // A module is not a page: no near match for it.
        await expect(w.fetchEvent(`${PAGE}js/main.min.js?v=9`)).rejects.toThrow('offline');
        await expect(w.fetchEvent(`${PAGE}js/never.min.js`)).rejects.toThrow('offline');
    });

    test('a slow network: the kept copy after the wait, and the late answer still refreshes it', async () => {
        jest.useFakeTimers();
        try {
            let finish;
            const caches = fakeCaches({ [CACHE]: { [`${PAGE}css/tasks.min.css`]: 'old' } });
            const w = worker({ caches, fetch: () => new Promise((r) => { finish = r; }), setTimeout, clearTimeout });
            let answer;
            w.listeners.fetch({ request: { url: `${PAGE}css/tasks.min.css`, method: 'GET', mode: 'no-cors' }, respondWith: (p) => { answer = p; } });
            await jest.advanceTimersByTimeAsync(3999);
            let settled = false;
            answer.then(() => { settled = true; });
            await Promise.resolve();
            expect(settled).toBe(false);
            await jest.advanceTimersByTimeAsync(1);
            expect(await answer).toBe('old');
            finish(response('new'));
            await jest.advanceTimersByTimeAsync(0);
            expect((await kept(caches, `${PAGE}css/tasks.min.css`)).body).toBe('new');
        } finally {
            jest.useRealTimers();
        }
    });

    test('slow with nothing kept: it waits for the network', async () => {
        jest.useFakeTimers();
        try {
            let finish;
            const w = worker({ fetch: () => new Promise((r) => { finish = r; }), setTimeout, clearTimeout });
            let answer;
            w.listeners.fetch({ request: { url: `${PAGE}js/view.min.js`, method: 'GET', mode: 'cors' }, respondWith: (p) => { answer = p; } });
            await jest.advanceTimersByTimeAsync(5000);
            finish(response('late'));
            expect((await answer).body).toBe('late');
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('its life', () => {
    test('installed, it takes over at once; activated, it clears its old caches only, and claims the open pages', async () => {
        const caches = fakeCaches({ 'whitestone-tasks-v0': {}, 'whitestone-tasks-v1': {}, [CACHE]: {}, 'someone-else': {} });
        const w = worker({ caches });
        w.listeners.install({});
        expect(w.self.skipWaiting).toHaveBeenCalled();
        await w.extendable('activate');
        expect([...caches.store.keys()].sort()).toEqual(['someone-else', CACHE]);
        expect(w.self.clients.claim).toHaveBeenCalled();
    });

    test('asked to keep a first visit\'s files: this site\'s only, never the API, and nothing fetched twice', async () => {
        const fetched = [];
        const caches = fakeCaches({ [CACHE]: { [`${PAGE}js/view.min.js`]: 'already' } });
        const w = worker({ caches, fetch: async (r) => { fetched.push(r.url); return response(r.url); } });
        await w.extendable('message', { type: 'keep', urls: [`${PAGE}?c=abc`, `${PAGE}js/view.min.js`, `${ORIGIN}/api/whitestone/health`, `${ORIGIN}/api.html?action=x`, 'https://elsewhere.example/a.js', 42] });
        expect(fetched).toEqual([`${PAGE}?c=abc`]);
        // The page as offlineUrls hands it over (with its `?c=`), kept without the id.
        expect([...(await caches.open(CACHE)).map.keys()].sort()).toEqual([PAGE, `${PAGE}js/view.min.js`]);
        expect((await kept(caches, PAGE)).body).toBe(`${PAGE}?c=abc`);
        // Asked again, the page is already kept under any checklist.
        await w.extendable('message', { type: 'keep', urls: [`${PAGE}?c=other`] });
        expect(fetched).toEqual([`${PAGE}?c=abc`]);
        // Anything else said to it is ignored.
        await w.extendable('message', { type: 'other', urls: [`${PAGE}x`] });
        await w.extendable('message', null);
        expect(fetched).toEqual([`${PAGE}?c=abc`]);
    });

    test('a file it cannot fetch while keeping is left for a later visit', async () => {
        const w = worker({ fetch: async () => { throw new TypeError('offline'); } });
        await w.extendable('message', { type: 'keep', urls: [PAGE] });
        expect(await kept(w.caches, PAGE)).toBeUndefined();
    });

    test('the built worker the page registers behaves the same', async () => {
        const w = worker({ source: BUILT });
        expect(Object.keys(w.listeners).sort()).toEqual(['activate', 'fetch', 'install', 'message']);
        expect((await w.fetchEvent(`${PAGE}js/main.min.js`)).response.body).toBe(`net:${PAGE}js/main.min.js`);
        expect((await w.fetchEvent(`${ORIGIN}/api/whitestone/health`)).answered).toBe(false);
        expect((await w.fetchEvent(`${ORIGIN}/whitestone/api.html?action=x`)).answered).toBe(false);
        await w.fetchEvent(`${PAGE}?c=abc`, { mode: 'navigate' });
        expect((await kept(w.caches, PAGE)).body).toBe(`net:${PAGE}?c=abc`);
    });
});
