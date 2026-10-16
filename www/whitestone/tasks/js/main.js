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
 * FINISHING (M5 piece 2): Finish visit shows the report and the bill
 * before anything is sent, and takes the cleaner's first name, time on site
 * and a note. Send keeps the report on the device first (the outbox), then
 * sends it, sealed, once; with no signal it waits and tries again on its
 * own (a growing pause, the connection coming back, the page in view, the
 * page opened again). Sent, the page shows the report and nothing more is
 * marked. A new booking of the same checklist is a new visit.
 *
 * PROOF PHOTOS (M5 piece 4): a marked task takes up to two "after" photos,
 * made small and stripped of their details as the studio's are
 * (photos.js preparePhoto), kept on the device with the sealed copies until
 * the report goes, and sent sealed just before it.
 *
 * OFFLINE (M4 piece 4): the sealed checklist and its photos are kept on
 * this device as they arrive (still sealed, in IndexedDB), for as long as
 * the visit pass lasts, so a cleaner with no signal still opens the
 * checklist, and the page says it is the copy kept here. The page's own
 * files are kept by its service worker (sw.js). A refused pass (the PIN
 * changed, or the checklist unpublished) clears the copy at once.
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
import { openIdbBackend, createMemoryBackend, preparePhoto } from '../../js/photos.min.js';
import { createSealer, contextFor } from '../../js/seal.min.js';
import { loadSheet } from '../../js/sheet.min.js';
import { quoteChecklist } from '../../js/pricing.min.js';
import { PUBLISHED_FORMAT } from '../../js/sync.min.js';
import { renderChecklist, renderReport, renderNoVisit, showPhoto, findIn } from './view.min.js';
import { dayLabel, clockLabel } from '../../js/booking.min.js';
import { applyMark, cleanProgress, emptyProgress, buildReport, visitKeyOf, cleanProofs } from './visit.min.js';
import { sendReport, reportBill, sendProof, proofIdsOf, REPORT_LIMITS } from '../../js/report.min.js';
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

/** Where the device keeps the sealed checklist and photos for reopening
 *  offline (PLANNING 8.2). */
export const CACHE_DATABASE = 'scenexp-whitestone-tasks';

/**
 * The sealed copies kept for one checklist, over a four-method backend
 * (photos.js), each until the visit pass's end: `{ get(name), put(name,
 * bytes, until), drop(name), forget() }`, `name` 'checklist', 'thumb/<id>'
 * or 'photo/<id>'; and the cleaner's own proof photos ('proof/<id>',
 * 'proofthumb/<id>', M5) until their report is sent. Never throws: a full
 * or broken store only means no copy.
 */
export function createKeeper(backend, checklistId, now) {
    const prefix = `${checklistId}/`;
    const safe = async (act, fallback = null) => {
        try {
            return backend ? await act() : fallback;
        } catch (e) {
            return fallback;
        }
    };
    return {
        get: (name) => safe(async () => {
            const kept = await backend.get(prefix + name);
            if (!kept || !(kept.bytes instanceof Uint8Array)) return null;
            if (!(Date.parse(kept.until) > now())) {
                await backend.delete(prefix + name);
                return null;
            }
            return kept.bytes;
        }),
        /** Resolves to whether it was kept. */
        put: (name, bytes, until) => safe(async () => {
            await backend.put(prefix + name, { bytes, until });
            return true;
        }, false),
        drop: (name) => safe(() => backend.delete(prefix + name)),
        forget: () => safe(async () => {
            for (const key of await backend.keys()) if (String(key).startsWith(prefix)) await backend.delete(key);
        })
    };
}

/** Every copy past its visit pass forgotten, whatever checklist it is. */
export async function sweepKept(backend, now) {
    if (!backend) return;
    try {
        for (const key of await backend.keys()) {
            const kept = await backend.get(key);
            if (!kept || !(Date.parse(kept.until) > now())) await backend.delete(key);
        }
    } catch (e) {
        // A broken store keeps nothing worth sweeping.
    }
}

/** The page's own files, for the service worker to keep: the page itself
 *  and what it loaded, from this site only, never the API. */
export function offlineUrls(href, origin, entries) {
    const page = String(href).split('#')[0];
    const loaded = (entries || []).map((e) => e && e.name).filter((u) => typeof u === 'string');
    return [...new Set([page, ...loaded])].filter((u) => u.startsWith(`${origin}/`) && !u.startsWith(`${origin}/api/`));
}

/** Whether the API refused (or no longer has) a checklist, so no copy kept
 *  here may stand in for it. Anything else (no signal, a server in
 *  trouble) and the copy opens. */
const refused = (error) => error === 'denied' || error === 'not-found';

/** The words for an API error while sending an add-on. */
function addOnError(error) {
    if (error === 'offline') return COPY.addOnOffline;
    if (error === 'too-many') return COPY.addOnFull;
    if (error === 'closed') return COPY.addOnClosed;
    if (error === 'denied') return COPY.addOnExpired;
    return COPY.addOnTrouble;
}

/** A quantity as typed, kept to 1 to 50. */
function readQuantity(value) {
    const n = Number.parseInt(String(value), 10);
    return Number.isInteger(n) ? Math.min(50, Math.max(1, n)) : 1;
}

/** The cleaner's fields as kept: `{ cleaner, hours, minutes, note }`. */
export function cleanDraft(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const hours = Number.parseInt(r.hours, 10);
    const minutes = Number.parseInt(r.minutes, 10);
    return {
        cleaner: String(r.cleaner || '').slice(0, 40),
        hours: Number.isInteger(hours) && hours >= 0 && hours <= 16 ? hours : 0,
        minutes: [0, 15, 30, 45].includes(minutes) ? minutes : 0,
        note: String(r.note || '').slice(0, 500)
    };
}

/** How long a proof photo waits on the device for its report, in days. */
export const PROOF_DAYS = 30;

/** The words for an API error while opening, from copy.js. */
function errorLine(error) {
    if (error === 'not-found') return COPY.gone;
    if (error === 'offline') return COPY.offline;
    return COPY.trouble;
}

/**
 * Run the page. `env`: `{ doc, href, history, storage, api, sealer,
 * fetchJson, now, makeUrl, setTimer, clearTimer, newId, cache, print }` (`cache` a
 * four-method backend for the sealed copies, or null). Resolves to the
 * page's state, for tests: `{ phase, id, form, quote, ... }`.
 */
export async function boot(env) {
    const { doc, history, storage, api, sealer, fetchJson } = env;
    const now = env.now || (() => Date.now());
    const makeUrl = env.makeUrl || ((blob) => URL.createObjectURL(blob));
    const setTimer = env.setTimer || ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = env.clearTimer || ((t) => clearTimeout(t));
    const newId = env.newId || newAddOnId;
    const printPage = env.print || (() => globalThis.print());
    await sweepKept(env.cache || null, now);
    const el = (id) => doc.getElementById(id);
    const form = el('pin-form');
    const input = el('pin-input');
    const status = el('pin-status');
    const gate = el('tasks-gate');
    const view = el('tasks-view');
    const state = {
        phase: 'start', id: null, form: null, quote: null, sheet: null, notice: '', thumbs: new Map(), progress: null, skipping: null, skipNote: '',
        visitId: null, addOns: [], proposing: null,
        // The visit as the API has it (QA, 2026-10-15): the checklist's
        // version read last, no visit to work on (`{ kind, booking }`), a
        // move said once, and a start on its way.
        version: null, noVisit: null, moved: '', starting: null, formTimer: null,
        // Finishing (M5): the report's view open, the fields as typed, a send
        // on its way, what it said, and the tries so far.
        finishing: false, draft: null, sendingReport: false, reportNote: '', reportProblem: false, retries: 0, retryTimer: null
    };
    // One listener each for the page coming into view and the connection
    // coming back, calling whatever the open checklist set (a PIN asked
    // again opens it afresh).
    const win = env.win || (typeof window !== 'undefined' ? window : null);
    if (typeof doc.addEventListener === 'function') {
        doc.addEventListener('visibilitychange', () => { if (state.onVisible) state.onVisible(); });
    }
    if (win && typeof win.addEventListener === 'function') {
        win.addEventListener('online', () => { if (state.onOnline) state.onOnline(); });
    }

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
    const keeper = createKeeper(env.cache || null, here.id, now);
    state.progress = cleanProgress(entry.progress);
    state.visitId = typeof entry.visitId === 'string' && ID.test(entry.visitId) ? entry.visitId : null;
    state.addOns = state.visitId ? cleanKept(entry.addOns) : [];
    state.draft = cleanDraft(entry.draft);
    state.proofs = cleanProofs(entry.proofs);
    state.proofThumbs = new Map();
    state.proofNote = null;
    const prepare = env.preparePhoto || preparePhoto;

    const askPin = (line = '', problem = false) => {
        state.phase = 'pin';
        if (form) form.hidden = false;
        if (gate) gate.hidden = false;
        setStatus(line, problem);
    };

    /** A sealed file from the API, or the copy kept on the device when the
     *  API cannot be reached; kept when it arrives. */
    async function sealedFile(name, ask) {
        const got = await ask();
        if (got.ok) {
            await keeper.put(name, got.bytes, entry.expiresAt);
            return got.bytes;
        }
        return refused(got.error) ? null : keeper.get(name);
    }

    /** The sheet the checklist's quote was locked on (the one in hand when
     *  it is the same), the quote by it, and what to say of either. */
    async function price(opened, fromDevice) {
        const version = opened.quote && opened.quote.sheetVersion;
        if (!state.sheet || state.sheet.version !== version) {
            try {
                state.sheet = version ? await loadSheet(version, fetchJson, '../data/prices/') : null;
            } catch (e) {
                state.sheet = null;
            }
        }
        state.quote = state.sheet ? quoteChecklist(state.sheet, opened) : null;
        const given = opened.quote ? opened.quote.totalCents : null;
        state.notice = [
            fromDevice ? COPY.keptCopy : '',
            !state.sheet ? COPY.noSheet : given !== null && state.quote.totalCents !== given ? COPY.quoteChanged : ''
        ].filter(Boolean).join(' ');
        state.fromDevice = fromDevice;
    }

    /** Unseal what the API gave (or the device kept), and draw it. */
    async function show(bytes, fromDevice = false) {
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
        // A report sent for another booking: this is a new visit, begun
        // afresh (the cleaner's name kept).
        if (entry.sent && entry.sent.visitKey !== visitKeyOf(opened)) {
            state.progress = emptyProgress();
            state.visitId = null;
            state.addOns = [];
            state.draft = { ...cleanDraft(null), cleaner: state.draft.cleaner };
            state.proofs = {};
            remember({ sent: null, outbox: null, progress: state.progress, visitId: null, addOns: [], draft: state.draft, proofs: {} });
        }
        await price(opened, fromDevice);
        // No visit booked: cancelled since this device last saw it, else none.
        state.noVisit = opened.booking ? null : { kind: entry.booking ? 'canceled' : 'none', booking: entry.booking || null };
        if (opened.booking) remember({ booking: { date: opened.booking.date, time: opened.booking.time } });
        /** The report as it would be sent now. */
        const currentReport = (at = null) => buildReport(state.form, state.progress, state.addOns, {
            cleaner: state.draft.cleaner, minutesOnSite: state.draft.hours * 60 + state.draft.minutes, note: state.draft.note, proofs: state.proofs
        }, at);
        /** Sent, waiting to send, finishing, or the checklist. */
        const modeNow = () => (entry.sent ? 'sent' : entry.outbox ? 'pending' : state.finishing ? 'finish' : null);
        const draw = () => {
            const mode = modeNow();
            if (!mode && state.noVisit) {
                renderNoVisit(view, state.noVisit);
                return;
            }
            if (mode) {
                const report = mode === 'finish' ? currentReport() : (entry.sent || entry.outbox).report;
                renderReport(view, {
                    form: state.form, sheet: state.sheet, report, bill: reportBill(state.sheet, state.form.quote, state.form, report),
                    mode, draft: state.draft, note: state.reportNote, problem: state.reportProblem, sending: state.sendingReport,
                    on: { send: () => sendFinal(), back: backToList, retry: () => trySend(), draft: keepDraft }
                });
                return;
            }
            renderChecklist(view, {
                form: state.form, quote: state.quote, sheet: state.sheet, thumbs: state.thumbs, notice: [state.notice, state.moved].filter(Boolean).join(' '),
                progress: state.progress, skipping: state.skipping, skipNote: state.skipNote,
                addOns: state.addOns, proposing: state.proposing,
                proofs: state.proofs, proofThumbs: state.proofThumbs, proofNote: state.proofNote,
                on: { photo: openPhoto, mark, skip, propose, pick, quantity, send, addOnDone, finish, proof, unproof, print: () => printPage() }
            });
        };
        /** Drawn again for news from the API, keeping what is being typed
         *  and where the keyboard is. */
        const redraw = () => {
            const typed = all(view).filter((n) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(n.tagName) && n.id).map((n) => [n.id, n.value]);
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
            if (next) ensureStarted();
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
                // Cancelled since: the checklist read again says so.
                if (r.error === 'no-booking') {
                    await readForm();
                    if (state.noVisit) return;
                }
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
        /** Asked after again in a few seconds, while one is waiting, the
         *  page is in view and the report is not yet on its way. */
        function ask() {
            if (state.timer || !waitingCount(state.addOns) || doc.visibilityState === 'hidden' || modeNow() === 'sent' || modeNow() === 'pending') return;
            state.timer = setTimer(() => {
                state.timer = null;
                state.polled = refresh().then(ask);
                return state.polled;
            }, CONFIG.api.pollSeconds * 1000);
        }
        state.onVisible = () => {
            if (doc.visibilityState === 'hidden') {
                if (state.timer) clearTimer(state.timer);
                state.timer = null;
                if (state.formTimer) clearTimer(state.formTimer);
                state.formTimer = null;
                return;
            }
            // Back in view: a report waiting goes now, else the checklist
            // and the add-ons.
            if (entry.outbox) trySend();
            else if (!entry.sent) {
                state.formPolled = readForm().then(watchForm);
                state.polled = refresh().then(ask);
            }
        };
        state.onOnline = () => {
            if (entry.outbox) trySend();
            else if (hasMarks()) ensureStarted();
        };

        // ---- The visit as the customer has it (QA, 2026-10-15) -------------------

        const hasMarks = () => Object.keys(state.progress.marks).length > 0;
        /**
         * The visit begun on the API at the cleaner's first piece of work (a
         * mark, a photo, Finish; an add-on begins it itself), so the customer
         * can no longer move or cancel it. Once: a try that does not reach
         * the API is made again at the next piece of work or when the
         * connection is back. Refused for want of a booking, the visit was
         * cancelled, which the checklist read now shows.
         */
        function ensureStarted() {
            if (state.visitId || !entry.visitToken || state.noVisit) return Promise.resolve();
            if (state.starting) return state.starting;
            state.starting = (async () => {
                const r = await api.startVisit(here.id, entry.visitToken);
                if (r.ok && r.data && ID.test(String(r.data.visitId))) {
                    if (!state.visitId) {
                        state.visitId = r.data.visitId;
                        remember({ visitId: state.visitId });
                    }
                } else if (r.error === 'no-booking') {
                    await readForm();
                }
            })().finally(() => { state.starting = null; });
            return state.starting;
        }
        /** Asked after again in a few seconds, while the page is in view and
         *  the visit is not yet reported. */
        function watchForm() {
            if (state.formTimer || state.phase !== 'open' || doc.visibilityState === 'hidden' || modeNow() === 'sent' || modeNow() === 'pending') return;
            state.formTimer = setTimer(() => {
                state.formTimer = null;
                state.formPolled = readForm().then(watchForm);
                return state.formPolled;
            }, CONFIG.api.checklistPollSeconds * 1000);
        }
        /** The checklist read again, and shown if it changed. Refused (the
         *  pass run out, the PIN changed, or no longer shared, which the API
         *  answers alike), the PIN is asked for again as on opening; offline,
         *  the next try. */
        async function readForm() {
            if (state.phase !== 'open' || !entry.visitToken) return;
            const got = await api.getChecklist(here.id, entry.visitToken);
            if (!got.ok) {
                if (refused(got.error)) await shut(got.error === 'not-found' ? COPY.gone : COPY.again);
                return;
            }
            if (got.version && got.version === state.version) return;
            let next = null;
            try {
                next = await sealer.openJson(key, got.bytes, contextFor(here.id, 'checklist'));
            } catch (e) {
                next = null;
            }
            if (!next || next.format !== PUBLISHED_FORMAT || next.id !== here.id || state.phase !== 'open') return;
            await keeper.put('checklist', got.bytes, entry.expiresAt);
            state.version = got.version;
            await applyForm(next);
        }
        /**
         * A new version of the checklist shown: cancelled, nothing to mark
         * (the time it had said); a booking again or moved, its time, and a
         * new time is a new visit; the customer's changes, as they are now.
         * What is being typed and where the keyboard is are kept.
         */
        async function applyForm(next) {
            const was = state.form;
            const before = visitKeyOf(was);
            const after = visitKeyOf(next);
            state.form = next;
            await price(next, false);
            const wasOff = Boolean(state.noVisit);
            if (!next.booking) {
                const last = was.booking || entry.booking || null;
                state.noVisit = { kind: last ? 'canceled' : 'none', booking: last ? { date: last.date, time: last.time } : null };
                state.finishing = false;
                state.skipping = null;
                state.proposing = null;
                state.moved = '';
            } else {
                state.noVisit = null;
                if (before && after !== before) state.moved = COPY.moved(dayLabel(next.booking.date), clockLabel(next.booking.time));
                if (after !== before) {
                    state.visitId = null;
                    state.addOns = [];
                    remember({ visitId: null, addOns: [] });
                }
                remember({ booking: { date: next.booking.date, time: next.booking.time } });
            }
            redraw();
            if (state.noVisit && !wasOff) focusOn('novisit-heading');
        }
        /** Refused while open: the asking stopped, the copy kept here let
         *  go, the marks kept, and the PIN asked for again, saying `line`. */
        async function shut(line) {
            for (const t of ['timer', 'formTimer']) {
                if (state[t]) clearTimer(state[t]);
                state[t] = null;
            }
            await keeper.forget();
            remember({ visitToken: null, expiresAt: null });
            if (view) view.hidden = true;
            askPin(line, line === COPY.gone);
        }

        // ---- Proof photos (M5 piece 4) -------------------------------------------

        /** A photo added to a marked task: made small, kept on the device
         *  (the full size and its thumbnail), and shown. */
        async function proofNow(itemId, file) {
            const ids = state.proofs[itemId] || [];
            if (ids.length >= REPORT_LIMITS.photos) return;
            state.proofNote = null;
            let kept = false;
            const photoId = newId();
            let prepared = null;
            try {
                prepared = await prepare(file, CONFIG);
                const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
                const until = new Date(now() + PROOF_DAYS * 86400000).toISOString();
                kept = (await keeper.put(`proof/${photoId}`, await bytes(prepared.full), until))
                    && (await keeper.put(`proofthumb/${photoId}`, await bytes(prepared.thumb), until));
            } catch (e) {
                kept = false;
            }
            if (!kept) {
                await keeper.drop(`proof/${photoId}`);
                state.proofNote = { itemId, text: COPY.proofFailed };
                draw();
                focusOn(`done-${itemId}`);
                return;
            }
            state.proofs = { ...state.proofs, [itemId]: [...ids, photoId] };
            remember({ proofs: state.proofs });
            state.proofThumbs.set(photoId, makeUrl(prepared.thumb));
            draw();
            ensureStarted();
            focusOn(`proof-remove-${photoId}`);
        }
        function proof(itemId, file) {
            state.pending = proofNow(itemId, file);
            return state.pending;
        }
        /** A photo taken off a task, and off the device. */
        function unproof(itemId, photoId) {
            const left = (state.proofs[itemId] || []).filter((p) => p !== photoId);
            const next = { ...state.proofs };
            if (left.length) next[itemId] = left;
            else delete next[itemId];
            state.proofs = next;
            state.proofThumbs.delete(photoId);
            remember({ proofs: state.proofs });
            state.pending = Promise.all([keeper.drop(`proof/${photoId}`), keeper.drop(`proofthumb/${photoId}`)]);
            draw();
            focusOn(`done-${itemId}`);
            return state.pending;
        }

        // ---- Finishing the visit (M5 piece 2) ----------------------------------

        /** The fields as typed, kept on the device (nothing is redrawn, so
         *  the keyboard stays put). */
        function keepDraft() {
            const value = (id) => {
                const node = findIn(view, id);
                return node ? node.value : undefined;
            };
            if (!findIn(view, 'report-cleaner')) return;
            state.draft = cleanDraft({ cleaner: value('report-cleaner'), hours: value('report-hours'), minutes: value('report-minutes'), note: value('report-note') });
            remember({ draft: state.draft });
        }
        /** The report and the bill before sending, with the add-ons asked
         *  after once more, since an answer may be on its way. */
        function finish() {
            state.finishing = true;
            state.reportNote = '';
            state.reportProblem = false;
            state.skipping = null;
            state.proposing = null;
            draw();
            focusOn('report-title');
            ensureStarted();
            state.polled = refresh();
            return state.polled;
        }
        function backToList() {
            keepDraft();
            state.finishing = false;
            state.reportNote = '';
            draw();
            focusOn('tasks-finish');
        }
        /** Send: the add-ons as they stand now, the report kept on the
         *  device (from here it waits to send, never lost), then sent. */
        async function sendFinalNow() {
            if (state.sendingReport || entry.outbox || entry.sent) return;
            keepDraft();
            state.sendingReport = true;
            draw();
            await refresh();
            state.sendingReport = false;
            remember({ outbox: { report: currentReport(new Date(now()).toISOString()), visitKey: visitKeyOf(state.form) } });
            state.finishing = false;
            await trySend();
        }
        function sendFinal() {
            state.reportSend = sendFinalNow();
            return state.reportSend;
        }
        /** One try at sending the report waiting on the device. */
        async function trySendNow() {
            if (!entry.outbox || state.sendingReport) return;
            if (state.retryTimer) clearTimer(state.retryTimer);
            state.retryTimer = null;
            state.sendingReport = true;
            draw();
            const r = await sendAll();
            state.sendingReport = false;
            if (r.visitId && r.visitId !== state.visitId) {
                state.visitId = r.visitId;
                remember({ visitId: r.visitId });
            }
            if (r.ok) {
                // The photos went with it: off the device now.
                for (const photoId of proofIdsOf(entry.outbox.report)) {
                    await keeper.drop(`proof/${photoId}`);
                    await keeper.drop(`proofthumb/${photoId}`);
                }
                state.proofs = {};
                remember({ sent: { ...entry.outbox, visitId: r.visitId }, outbox: null, proofs: {} });
                state.retries = 0;
                state.reportNote = '';
                state.reportProblem = false;
                for (const t of ['timer', 'formTimer']) {
                    if (state[t]) clearTimer(state[t]);
                    state[t] = null;
                }
                draw();
                focusOn('report-title');
                return;
            }
            if (r.error === 'denied') {
                // The pass has ended: the PIN again, and the report goes
                // once the checklist is open.
                remember({ visitToken: null, expiresAt: null });
                if (view) view.hidden = true;
                askPin(COPY.reportNeedsPin, true);
                return;
            }
            if (r.error === 'no-booking') {
                // Cancelled before the visit could begin (marked with no
                // signal): nothing to report, and the checklist says so.
                remember({ outbox: null });
                await readForm();
                if (state.noVisit) return;
            }
            if (r.error === 'bad-request') {
                // Too long to send: back to the fields to shorten it.
                remember({ outbox: null });
                state.finishing = true;
                state.reportNote = COPY.reportTooLong;
                state.reportProblem = true;
                draw();
                focusOn('report-note');
                return;
            }
            state.reportNote = r.error === 'offline' ? COPY.reportOffline : COPY.reportTrouble;
            state.reportProblem = true;
            draw();
            const steps = CONFIG.api.reportRetrySeconds;
            const wait = steps[Math.min(state.retries, steps.length - 1)];
            state.retries++;
            state.retryTimer = setTimer(() => {
                state.retryTimer = null;
                return trySend();
            }, wait * 1000);
        }
        /** The visit started if it has not been, each photo the report names
         *  sent (once: a photo gone from the device is passed over, and the
         *  customer is told it was not received), then the report. */
        async function sendAll() {
            let visitId = state.visitId;
            const photos = proofIdsOf(entry.outbox.report);
            if (!visitId && photos.length) {
                const started = await api.startVisit(here.id, entry.visitToken);
                if (!started.ok) return { ok: false, visitId: null, error: started.error };
                visitId = started.data.visitId;
                state.visitId = visitId;
                remember({ visitId });
            }
            for (const photoId of photos) {
                const sent = entry.outbox.proofsSent || [];
                if (sent.includes(photoId)) continue;
                const full = await keeper.get(`proof/${photoId}`);
                const thumb = await keeper.get(`proofthumb/${photoId}`);
                if (full && thumb) {
                    const p = await sendProof({ api, sealer, key, id: here.id, token: entry.visitToken, visitId, photoId, full, thumb });
                    // Refused as closed: the report is in already (an answer
                    // lost on the way), which the report's own send settles.
                    if (!p.ok && p.error !== 'closed') return { ok: false, visitId, error: p.error };
                }
                remember({ outbox: { ...entry.outbox, proofsSent: [...sent, photoId] } });
            }
            return sendReport({ api, sealer, key, id: here.id, token: entry.visitToken, visitId, report: entry.outbox.report });
        }
        function trySend() {
            state.reportSend = trySendNow();
            return state.reportSend;
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
            const sealed = await sealedFile(`photo/${photoId}`, () => api.getPhoto(here.id, entry.visitToken, photoId));
            if (!sealed) return;
            try {
                const bytes = await sealer.open(key, sealed, contextFor(here.id, 'photo', photoId));
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
        // A report waiting from before (a closed tab, no signal, a pass that
        // ran out) goes now; one sent leaves nothing more to do.
        if (entry.outbox) {
            await trySend();
            return state;
        }
        if (entry.sent) return state;
        // The proof photos kept on the device, their thumbnails shown again.
        for (const photoId of Object.values(state.proofs).flat()) {
            const bytes = await keeper.get(`proofthumb/${photoId}`);
            if (bytes) state.proofThumbs.set(photoId, makeUrl(new Blob([bytes], { type: 'image/jpeg' })));
        }
        if (state.proofThumbs.size) redraw();
        // The thumbnails, then drawn again with them.
        const photoIds = [...new Set((opened.items || []).flatMap((i) => (Array.isArray(i.photos) ? i.photos : [])))];
        for (const photoId of photoIds) {
            const sealed = await sealedFile(`thumb/${photoId}`, () => api.getThumb(here.id, entry.visitToken, photoId));
            if (!sealed) continue;
            try {
                const bytes = await sealer.open(key, sealed, contextFor(here.id, 'thumb', photoId));
                state.thumbs.set(photoId, makeUrl(new Blob([bytes], { type: 'image/jpeg' })));
            } catch (e) {
                // Left as its place.
            }
        }
        if (state.thumbs.size) redraw();
        // The full photos too, kept for a visit with no signal (each opens
        // from the device then).
        if (!fromDevice) {
            for (const photoId of photoIds) {
                if (!(await keeper.get(`photo/${photoId}`))) await sealedFile(`photo/${photoId}`, () => api.getPhoto(here.id, entry.visitToken, photoId));
            }
        }
        // The visit's add-ons as they stand now, then asked after, and the
        // checklist too. Marks made before the visit could begin (no signal)
        // begin it now.
        await refresh();
        ask();
        watchForm();
        if (hasMarks()) await ensureStarted();
        return state;
    }

    /** The visit's report sent, and the checklist no longer shared (the
     *  customer's page closes it once the report is in): nothing more to
     *  open, said plainly rather than asking for a PIN that cannot work. */
    async function visitOver() {
        await keeper.forget();
        remember({ visitToken: null, expiresAt: null });
        askPin(COPY.visitOver);
        if (form) form.hidden = true;
        state.phase = 'over';
        return state;
    }

    /** With a visit token: fetch and show, or ask for the PIN again. */
    async function fetchAndShow() {
        state.phase = 'opening';
        setStatus(COPY.opening);
        const got = await api.getChecklist(here.id, entry.visitToken);
        if (got.ok) {
            await keeper.put('checklist', got.bytes, entry.expiresAt);
            state.version = got.version;
            return show(got.bytes);
        }
        if (entry.sent && refused(got.error)) return visitOver();
        if (got.error === 'denied') {
            // The token ran out or the PIN was changed: ask again, and keep
            // no copy the pass no longer opens.
            await keeper.forget();
            remember({ visitToken: null, expiresAt: null });
            askPin(COPY.again);
            return state;
        }
        if (got.error === 'not-found') await keeper.forget();
        const copy = refused(got.error) ? null : await keeper.get('checklist');
        if (copy) return show(copy, true);
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
            if (entry.sent) return visitOver();
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

/** The service worker that keeps this page for a visit with no signal
 *  (sw.js), and the files this first visit loaded before it was in charge. */
function keepForOffline() {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : null;
    // Service workers need a secure context (https, or this machine).
    if (!sw || !globalThis.isSecureContext) return;
    sw.register('sw.min.js').then(() => sw.ready).then((reg) => {
        const entries = typeof performance !== 'undefined' && performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
        if (reg.active) reg.active.postMessage({ type: 'keep', urls: offlineUrls(location.href, location.origin, entries) });
    }).catch((err) => {
        console.warn('[Whitestone] This page will not open offline:', err);
    });
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
    let cache = null;
    try {
        cache = await openIdbBackend(CONFIG, globalThis.indexedDB, { database: CACHE_DATABASE, store: 'cache' });
    } catch (e) {
        cache = null;
    }
    await boot({
        doc: document, href: location.href, history, storage: browserStorage,
        api, sealer: createSealer(), fetchJson, cache
    });
    keepForOffline();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.__whitestoneTasksTest) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
}
