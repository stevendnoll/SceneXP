// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * main.js - The cleaner's page (PRD 12, PLANNING 8 and 10.3).
 *
 * THE LINK CARRIES THE KEY, THE PIN OPENS THE DOOR. A shared link is
 * `tasks/?c=<id>#k=<key>`: the id says which checklist, and the key in the
 * fragment (never sent to any server) unlocks it. On arrival the key is
 * kept on this device and taken off the address bar at once, so it is not
 * left in the history or a screenshot. The PIN asks the API for a visit
 * token (12 hours), kept with the key, so a reload or a second look within
 * the visit opens straight to the checklist.
 *
 * WHAT OPENS: the sealed checklist, unsealed here with the key, then the
 * price sheet it was quoted on (by its version), and the quote worked out
 * again from them. If that differs from the quote the customer was given,
 * the page says so and shows the new figures. Then the view (view.js), and
 * the photos' thumbnails as they arrive.
 *
 * THE VISIT (M4 piece 2): the cleaner marks each task Done, or Skipped with
 * a reason, and every mark is kept on this device at once, with the key, so
 * a closed tab, a reload or a flat battery loses nothing (visit.js).
 *
 * ADD-ONS (M4 piece 3): proposed from a room, sealed and sent (the first one
 * starts the visit on the API), then asked after every few seconds while
 * one is waiting and the page is in view, so an approval appears in place
 * (addons.js). The visit and its add-ons are kept on the device too.
 *
 * WRONG PINS: the API answers every failed try the same way ("denied"),
 * locked or not, so nothing is learned by guessing. The page counts the
 * tries on this device and, after a few, says the checklist may need a
 * rest before it opens.
 *
 * `boot(env)` takes everything the browser gives (the document, the
 * address, history, storage, the API, the sealer, fetch, timers), so tests run it
 * against the stand-in in memory. The bottom of the file wires it to the
 * real page.
 */

// Every visitor sentence lives in copy.js, where one test sweeps them all.
import { TASKS_PAGE as COPY } from '../../js/copy.min.js';
import { CONFIG } from '../../js/config.min.js';
import { parseShare, withoutFragment, ID } from '../../js/links.min.js';
import { createApi } from '../../js/api.min.js';
import { createStandin } from '../../js/standin.min.js';
import { openIdbBackend, createMemoryBackend } from '../../js/photos.min.js';
import { createSealer, contextFor } from '../../js/seal.min.js';
import { loadSheet } from '../../js/sheet.min.js';
import { quoteChecklist } from '../../js/pricing.min.js';
import { PUBLISHED_FORMAT } from '../../js/sync.min.js';
import { renderChecklist, showPhoto, findIn } from './view.min.js';
import { applyMark, cleanProgress } from './visit.min.js';
import { choicesFor, proposeAddOn, fetchAddOns, cleanKept, takenKeys, waitingCount, newAddOnId } from './addons.min.js';

export { COPY };

/** This device's memory of shared checklists (PLANNING 8.2): per id, the
 *  key, the visit token and its expiry, wrong PINs in a row, and the
 *  visit's marks. */
export const STORAGE_KEY = 'scenexp-whitestone-tasks-v1';

/** After this many wrong PINs in a row the page warns that the checklist
 *  may need a rest (the API locks it at its own count, unseen). */
export const WARN_AFTER = 3;

/** The digits of a PIN as typed, or null when it is not exactly six of
 *  them. Spaces and dashes are forgiven, since people copy PINs from
 *  messages that group them ("482 913"). */
export function readPin(value) {
    const digits = String(value == null ? '' : value).replace(/[\s-]/g, '');
    return /^\d{6}$/.test(digits) ? digits : null;
}

/**
 * The device's storage, for the real page. It names `localStorage` by its
 * global name on purpose: tests/privacy.test.mjs finds writers by reading
 * the source for exactly that (store.js does the same).
 */
export const browserStorage = {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value)
};

/** The device's record, read safely: `{ checklists: { [id]: entry } }`. */
export function readMemory(storage) {
    try {
        const raw = storage && storage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed.checklists === 'object' && parsed.checklists ? parsed : { checklists: {} };
    } catch (e) {
        return { checklists: {} };
    }
}

function writeMemory(storage, memory) {
    try {
        if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(memory));
    } catch (e) {
        // A private window: it still opens, it only forgets sooner.
    }
}

/**
 * Which checklist this visit is about, and its key: from a share link
 * (the key then kept), or from the address alone (`?c=` after the key was
 * taken off) and the key kept before. `{ id, key }`, or null.
 */
export function arrival(href, memory, config) {
    const link = parseShare(href, config);
    if (link) return { id: link.id, key: link.key, fromLink: true };
    let id = null;
    try {
        id = new URL(href).searchParams.get('c');
    } catch (e) {
        id = null;
    }
    const kept = id && ID.test(id) ? memory.checklists[id] : null;
    return kept && kept.key ? { id, key: kept.key, fromLink: false } : null;
}

/** Whether a kept visit token still opens the checklist at `now` (ms). */
export function tokenValid(entry, now) {
    return Boolean(entry && entry.visitToken && Date.parse(entry.expiresAt) > now);
}

/** The words for an API error while sending an add-on. */
function addOnError(error) {
    if (error === 'offline') return COPY.addOnOffline;
    if (error === 'too-many') return COPY.addOnFull;
    if (error === 'denied') return COPY.addOnExpired;
    return COPY.addOnTrouble;
}

/** A quantity as typed, kept to 1 to 50. */
function readQuantity(value) {
    const n = Number.parseInt(String(value), 10);
    return Number.isInteger(n) ? Math.min(50, Math.max(1, n)) : 1;
}

/** The words for an API error while opening, from copy.js. */
function errorLine(error) {
    if (error === 'not-found') return COPY.gone;
    if (error === 'offline') return COPY.offline;
    return COPY.trouble;
}

/**
 * Run the page. `env`: `{ doc, href, history, storage, api, sealer,
 * fetchJson, now, makeUrl, setTimer, clearTimer, newId }`. Resolves to the
 * page's state, for tests: `{ phase, id, form, quote, ... }`.
 */
export async function boot(env) {
    const { doc, history, storage, api, sealer, fetchJson } = env;
    const now = env.now || (() => Date.now());
    const makeUrl = env.makeUrl || ((blob) => URL.createObjectURL(blob));
    const setTimer = env.setTimer || ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = env.clearTimer || ((t) => clearTimeout(t));
    const newId = env.newId || newAddOnId;
    const el = (id) => doc.getElementById(id);
    const form = el('pin-form');
    const input = el('pin-input');
    const status = el('pin-status');
    const gate = el('tasks-gate');
    const view = el('tasks-view');
    const state = { phase: 'start', id: null, form: null, quote: null, sheet: null, notice: '', thumbs: new Map(), progress: null, skipping: null, skipNote: '', visitId: null, addOns: [], proposing: null };

    const setStatus = (text, problem = false) => {
        if (!status) return;
        status.textContent = text;
        status.classList.toggle('is-problem', Boolean(problem));
    };
    const memory = readMemory(storage);
    const here = arrival(env.href, memory, CONFIG);
    if (here && here.fromLink && history && typeof history.replaceState === 'function') {
        // The key leaves the address bar at once (it stays on this device).
        const at = new URL(env.href);
        history.replaceState(null, '', withoutFragment({ pathname: at.pathname, search: at.search }));
    }
    if (!here) {
        state.phase = 'no-link';
        if (form) form.hidden = true;
        setStatus(COPY.badLink, true);
        return state;
    }
    state.id = here.id;
    const entry = { fails: 0, ...(memory.checklists[here.id] || {}), key: here.key };
    const remember = (patch) => {
        Object.assign(entry, patch);
        memory.checklists[here.id] = entry;
        writeMemory(storage, memory);
    };
    remember({});
    state.progress = cleanProgress(entry.progress);
    state.visitId = typeof entry.visitId === 'string' && ID.test(entry.visitId) ? entry.visitId : null;
    state.addOns = state.visitId ? cleanKept(entry.addOns) : [];

    const askPin = (line = '', problem = false) => {
        state.phase = 'pin';
        if (form) form.hidden = false;
        if (gate) gate.hidden = false;
        setStatus(line, problem);
    };

    /** Unseal what the API gave, and draw it. */
    async function show(bytes) {
        let key;
        let opened;
        try {
            key = await sealer.importKey(entry.key);
            opened = await sealer.openJson(key, bytes, contextFor(here.id, 'checklist'));
        } catch (e) {
            opened = null;
        }
        if (!opened || opened.format !== PUBLISHED_FORMAT || opened.id !== here.id) {
            // Another PIN would not help: the link itself is wrong.
            askPin(COPY.unreadable, true);
            if (form) form.hidden = true;
            state.phase = 'unreadable';
            return state;
        }
        state.form = opened;
        try {
            const version = opened.quote && opened.quote.sheetVersion;
            state.sheet = version ? await loadSheet(version, fetchJson, '../data/prices/') : null;
        } catch (e) {
            state.sheet = null;
        }
        state.quote = state.sheet ? quoteChecklist(state.sheet, opened) : null;
        const given = opened.quote ? opened.quote.totalCents : null;
        state.notice = !state.sheet ? COPY.noSheet
            : given !== null && state.quote.totalCents !== given ? COPY.quoteChanged : '';
        const draw = () => renderChecklist(view, {
            form: state.form, quote: state.quote, sheet: state.sheet, thumbs: state.thumbs, notice: state.notice,
            progress: state.progress, skipping: state.skipping, skipNote: state.skipNote,
            addOns: state.addOns, proposing: state.proposing,
            on: { photo: openPhoto, mark, skip, propose, pick, quantity, send, addOnDone }
        });
        /** Drawn again for news from the API, keeping what is being typed
         *  and where the keyboard is. */
        const redraw = () => {
            const typed = all(view).filter((n) => n.tagName === 'INPUT' && n.id).map((n) => [n.id, n.value]);
            const focused = doc.activeElement && doc.activeElement.id;
            draw();
            for (const [id, value] of typed) {
                const node = findIn(view, id);
                if (node) node.value = value;
            }
            if (focused) focusOn(focused);
        };
        const focusOn = (id) => {
            const node = findIn(view, id);
            if (node && typeof node.focus === 'function') node.focus();
        };
        /** A task marked (null clears it): kept on the device at once, and
         *  the keyboard left on the button that did it. */
        function mark(itemId, next) {
            const was = state.progress;
            state.progress = applyMark(state.progress, itemId, next);
            if (state.progress === was) {
                // A skip with no reason and no words: the picker asks for one.
                state.skipNote = COPY.skipNeedsWhy;
                draw();
                focusOn(`words-${itemId}`);
                return;
            }
            remember({ progress: state.progress });
            state.skipping = null;
            state.skipNote = '';
            draw();
            const now = state.progress.marks[itemId];
            focusOn(now && now.status === 'done' ? `done-${itemId}` : `skip-${itemId}`);
        }
        /** An approved add-on marked done, or cleared. */
        function addOnDone(addonId) {
            const was = state.progress.marks[addonId];
            state.progress = applyMark(state.progress, addonId, was ? null : { status: 'done' });
            remember({ progress: state.progress });
            draw();
            focusOn(`addon-done-${addonId}`);
        }
        /** The words typed in the open picker, kept across a redraw. */
        const keepWords = (roomId) => {
            const node = findIn(view, `addon-words-${roomId}`);
            if (node && state.proposing) state.proposing.words = String(node.value || '');
        };
        /** A room's add-on picker opened (or, with null, closed). */
        function propose(roomId) {
            const closing = state.proposing && state.proposing.roomId;
            state.proposing = roomId ? { roomId, key: '', quantity: 1, words: '', note: '', sending: false } : null;
            draw();
            focusOn(roomId ? `addon-choice-${roomId}` : `propose-${closing}`);
        }
        function pick(roomId, choice) {
            if (!state.proposing || state.proposing.roomId !== roomId) return;
            keepWords(roomId);
            Object.assign(state.proposing, { key: choice, quantity: 1, note: '' });
            draw();
            focusOn(`addon-choice-${roomId}`);
        }
        function quantity(roomId, value) {
            if (!state.proposing || state.proposing.roomId !== roomId) return;
            keepWords(roomId);
            state.proposing.quantity = readQuantity(value);
            draw();
            focusOn(`addon-qty-${roomId}`);
        }
        /** The picker's add-on sealed and sent, and then asked after. */
        async function sendNow(roomId) {
            const p = state.proposing;
            if (!p || p.roomId !== roomId || p.sending) return;
            keepWords(roomId);
            const choice = choicesFor(state.sheet, state.form, roomId, takenKeys(state.addOns)).find((c) => c.key === p.key);
            if (!choice) {
                p.note = COPY.addOnPickFirst;
                draw();
                focusOn(`addon-choice-${roomId}`);
                return;
            }
            const addOn = choice.addOn.quantity ? { ...choice.addOn, quantity: p.quantity } : choice.addOn;
            p.sending = true;
            p.note = '';
            draw();
            const r = await proposeAddOn({ api, sealer, key, id: here.id, token: entry.visitToken, visitId: state.visitId, addOn, words: p.words, newId });
            if (r.visitId && r.visitId !== state.visitId) {
                state.visitId = r.visitId;
                remember({ visitId: r.visitId });
            }
            if (!r.ok) {
                p.sending = false;
                p.note = addOnError(r.error);
                draw();
                focusOn(`addon-send-${roomId}`);
                return;
            }
            state.addOns = [...state.addOns, r.addOn];
            remember({ addOns: state.addOns });
            state.proposing = null;
            draw();
            focusOn(`propose-${roomId}`);
            ask();
        }
        function send(roomId) {
            state.pending = sendNow(roomId);
            return state.pending;
        }
        /** The visit's add-ons as the API has them now, drawn when they
         *  changed. */
        async function refresh() {
            if (!state.visitId) return;
            const got = await fetchAddOns({ api, sealer, key, id: here.id, token: entry.visitToken, visitId: state.visitId });
            if (!got.ok || JSON.stringify(got.addOns) === JSON.stringify(state.addOns)) return;
            state.addOns = got.addOns;
            remember({ addOns: state.addOns });
            redraw();
        }
        /** Asked after again in a few seconds, while one is waiting and the
         *  page is in view. */
        function ask() {
            if (state.timer || !waitingCount(state.addOns) || doc.visibilityState === 'hidden') return;
            state.timer = setTimer(() => {
                state.timer = null;
                state.polled = refresh().then(ask);
                return state.polled;
            }, CONFIG.api.pollSeconds * 1000);
        }
        if (typeof doc.addEventListener === 'function') {
            doc.addEventListener('visibilitychange', () => {
                if (doc.visibilityState === 'hidden') {
                    if (state.timer) clearTimer(state.timer);
                    state.timer = null;
                    return;
                }
                state.polled = refresh().then(ask);
            });
        }
        /** A task's skip picker opened (or, with null, closed). */
        function skip(itemId) {
            const closing = state.skipping;
            state.skipping = itemId;
            state.skipNote = '';
            draw();
            focusOn(itemId ? `reason-${itemId}-no-time` : `skip-${closing}`);
        }
        async function openPhoto(photoId, label) {
            const from = doc.activeElement;
            const got = await api.getPhoto(here.id, entry.visitToken, photoId);
            if (!got.ok) return;
            try {
                const bytes = await sealer.open(key, got.bytes, contextFor(here.id, 'photo', photoId));
                showPhoto(doc, makeUrl(new Blob([bytes], { type: 'image/jpeg' })), label, from);
            } catch (e) {
                // A photo that will not open stays a thumbnail.
            }
        }
        if (gate) gate.hidden = true;
        if (view) view.hidden = false;
        doc.title = `${COPY.heading} | ${COPY.pageTitle}`;
        draw();
        state.phase = 'open';
        // The thumbnails, then drawn again with them.
        const photoIds = [...new Set((opened.items || []).flatMap((i) => (Array.isArray(i.photos) ? i.photos : [])))];
        for (const photoId of photoIds) {
            const got = await api.getThumb(here.id, entry.visitToken, photoId);
            if (!got.ok) continue;
            try {
                const bytes = await sealer.open(key, got.bytes, contextFor(here.id, 'thumb', photoId));
                state.thumbs.set(photoId, makeUrl(new Blob([bytes], { type: 'image/jpeg' })));
            } catch (e) {
                // Left as its place.
            }
        }
        if (state.thumbs.size) redraw();
        // The visit's add-ons as they stand now, then asked after.
        await refresh();
        ask();
        return state;
    }

    /** With a visit token: fetch and show, or ask for the PIN again. */
    async function fetchAndShow() {
        state.phase = 'opening';
        setStatus(COPY.opening);
        const got = await api.getChecklist(here.id, entry.visitToken);
        if (got.ok) return show(got.bytes);
        if (got.error === 'denied') {
            // The token ran out or the PIN was changed: ask again.
            remember({ visitToken: null, expiresAt: null });
            askPin(COPY.again);
            return state;
        }
        askPin(errorLine(got.error), true);
        return state;
    }

    async function tryPin(pin) {
        setStatus(COPY.opening);
        const opened = await api.open(here.id, pin);
        if (!opened.ok) {
            if (opened.error !== 'denied') {
                askPin(errorLine(opened.error), true);
                return state;
            }
            remember({ fails: (entry.fails || 0) + 1 });
            askPin(entry.fails >= WARN_AFTER ? COPY.deniedMany : COPY.denied, true);
            if (input && typeof input.focus === 'function') input.focus();
            return state;
        }
        remember({ fails: 0, visitToken: opened.data.visitToken, expiresAt: opened.data.expiresAt });
        return fetchAndShow();
    }

    if (form && input) {
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const pin = readPin(input.value);
            if (!pin) {
                setStatus(COPY.incomplete, true);
                input.focus();
                return;
            }
            state.pending = tryPin(pin);
        });
    }
    if (tokenValid(entry, now())) return fetchAndShow();
    askPin();
    return state;
}

/** Every element under a node, depth first. */
function all(node, out = []) {
    for (const child of Array.from((node && node.children) || [])) {
        out.push(child);
        all(child, out);
    }
    return out;
}

/** The API as this device has it: the stand-in in this browser, shared
 *  with the studio, until the server runs (config.js `api`). */
async function realApi(fetchJson) {
    if (CONFIG.api.mode !== 'standin') return null;
    const schedule = await fetchJson('../data/schedule.json');
    let backend = null;
    try {
        backend = await openIdbBackend(CONFIG, globalThis.indexedDB, { database: CONFIG.api.database, store: 'standin' });
    } catch (e) {
        backend = null;
    }
    const standin = createStandin({ backend: backend || createMemoryBackend(), config: CONFIG, schedule });
    return createApi((request) => standin.handle(request));
}

async function start() {
    const fetchJson = async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${response.status} for ${url}`);
        return response.json();
    };
    let api = null;
    try {
        api = await realApi(fetchJson);
    } catch (err) {
        console.error('[Whitestone] The checklist service could not start:', err);
    }
    if (!api) {
        const status = document.getElementById('pin-status');
        if (status) status.textContent = COPY.offline;
        return;
    }
    await boot({
        doc: document, href: location.href, history, storage: browserStorage,
        api, sealer: createSealer(), fetchJson
    });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.__whitestoneTasksTest) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
}
