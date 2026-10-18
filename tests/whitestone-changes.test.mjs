// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Changing things after publishing (M3 3d, PLANNING 10.2, PRD 10.4 and
 * 13.2), against the stand-in in memory on a pinned clock:
 *   - what was sent is fingerprinted, so an edit since shows as unsent, and
 *     an edit undone (or a reload) does not;
 *   - Send my changes: re-quoted, the booking's minutes kept in step, new
 *     photos sent and removed ones deleted; a visit that no longer fits its
 *     time stops before anything is sent; inside the change window a
 *     longer visit is refused and a shorter one keeps its booking;
 *   - moving the visit, canceling it (still published), unpublishing (the
 *     server's copy gone), each refused inside the window;
 *   - the receipt, the calendar, the panel and My checklists saying so.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../www/whitestone/js/config.js';
import { visitMinutes, calendarView, firstOpen } from '../www/whitestone/js/booking.js';
import { publish, republish, cancelVisit, unpublish, quoteToSend, publishedForm } from '../www/whitestone/js/sync.js';
import { receiptView } from '../www/whitestone/js/receipt.js';
import { panelView } from '../www/whitestone/js/panel.js';
import { createApi } from '../www/whitestone/js/api.js';
import { createStandin } from '../www/whitestone/js/standin.js';
import { createMemoryBackend, createPhotoStore } from '../www/whitestone/js/photos.js';
import { createSealer, contextFor } from '../www/whitestone/js/seal.js';
import {
    emptyDoc, createChecklist, addRoom, updateItem, deleteItem, addPhoto, removePhoto, setPublication, keepServerFacts, findChecklist,
    validate, importPublished, hasUnsent, contentPrint, publishedContent
} from '../www/whitestone/js/store.js';
import { checkChoice, presetFor } from '../www/whitestone/js/sheet.js';
import { quoteChecklist } from '../www/whitestone/js/pricing.js';
import { BOOKING_ERRORS, CHANGES, DAY_STATUS, PANEL, RECEIPT, allCopy } from '../www/whitestone/js/copy.js';

const WS = join(process.cwd(), 'www', 'whitestone');
const SCHEDULE = JSON.parse(readFileSync(join(WS, 'data', 'schedule.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(WS, 'data', 'prices', 'index.json'), 'utf8'));
const SHEET = JSON.parse(readFileSync(join(WS, 'data', 'prices', `${index.cleaning}.json`), 'utf8'));
// Wednesday, October 14, 9:00 am in Los Angeles.
const START = Date.parse('2026-10-14T16:00:00Z');
const HOUR = 3600000;
const check = (choice, area, bath) => checkChoice(SHEET, choice, area, bath);
const ID = 'checklist-1';
const PHOTO = 'photo-aaaaaaaaaaaaaaaa';
const PHOTO2 = 'photo-bbbbbbbbbbbbbbbb';

/** A kitchen with a photo on its stovetop, published and booked for Friday
 *  at `time`, against the stand-in. `edit(fn)` changes the document as the
 *  page does, so the tests read like a visitor's steps. */
async function booked(time = '09:00') {
    let t = START;
    const at = () => new Date(t);
    let doc = emptyDoc(CONFIG, at());
    doc = createChecklist(doc, { title: 'Maple Street' }, CONFIG, at(), { id: ID }).doc;
    doc = addRoom(doc, ID, { level: 'main', area: 'kitchen' }, CONFIG, at(), { id: 'kitchen-1', check, presetItems: presetFor(SHEET, 'kitchen') }).doc;
    const stove = findChecklist(doc, ID).items.find((i) => i.task === 'stovetop');
    doc = addPhoto(doc, ID, stove.id, PHOTO, CONFIG, at()).doc;
    const photos = createPhotoStore(createMemoryBackend(), CONFIG);
    await photos.put(PHOTO, { full: new Blob([new Uint8Array([1, 2, 3])]), thumb: new Blob([new Uint8Array([4])]) });
    await photos.put(PHOTO2, { full: new Blob([new Uint8Array([5, 6])]), thumb: new Blob([new Uint8Array([7])]) });
    const standin = createStandin({ backend: createMemoryBackend(), config: CONFIG, schedule: SCHEDULE, now: () => t });
    const calls = [];
    const api = createApi(async (req) => { calls.push(`${req.method} ${req.path.replace(/[A-Za-z0-9_-]{22}/g, ':id')}`); return standin.handle(req); });
    const w = {
        doc, api, photos, calls, stove: stove.id, sealer: createSealer(),
        now: () => at().toISOString(),
        advance: (ms) => { t += ms; },
        c: () => findChecklist(w.doc, ID),
        edit: (fn) => { const r = fn(w.doc, at()); if (r.error) throw new Error(r.error); w.doc = r.doc; },
        record: async (patch) => {
            const r = setPublication(w.doc, ID, patch, CONFIG, at());
            if (r.error) throw new Error(r.error);
            w.doc = r.doc;
            return r.record;
        },
        args: () => ({ checklist: w.c(), api: w.api, sealer: w.sealer, photos: w.photos, sheet: SHEET, at: w.now(), record: w.record }),
        /** The published form as the cleaner would open it, with the PIN. */
        async opened() {
            const c = w.c();
            const key = await w.sealer.importKey(c.published.key);
            const visit = (await w.api.open(c.published.id, c.published.pin)).data.visitToken;
            const got = await w.api.getChecklist(c.published.id, visit);
            return { form: await w.sealer.openJson(key, got.bytes, contextFor(c.published.id, 'checklist')), version: Number(got.version) };
        }
    };
    const minutes = visitMinutes(quoteChecklist(SHEET, w.c()).minutes);
    const r = await publish({ ...w.args(), slot: { date: '2026-10-16', time, minutes } });
    if (!r.ok) throw new Error(`publish: ${r.error}`);
    calls.length = 0;
    return w;
}

/** The kitchen's last start time on Friday for its own length: a visit that
 *  ends at closing, so any longer one cannot stay. */
async function lastStart() {
    const w = await booked();
    const minutes = visitMinutes(quoteChecklist(SHEET, w.c()).minutes);
    const days = (await w.api.availability('2026-10', minutes)).data.days;
    // Friday is taken by the first booking here; Saturday's hours differ,
    // so read Friday's from the next week, which keeps the same hours.
    const times = days.find((d) => d.date === '2026-10-23').times;
    return times[times.length - 1];
}

const addBathroom = (w) => w.edit((d, at) => addRoom(d, ID, { level: 'main', area: 'bathroom' }, CONFIG, at, { check, presetItems: presetFor(SHEET, 'bathroom') }));
const noteOnStove = (w, notes) => w.edit((d, at) => updateItem(d, ID, w.stove, { notes }, CONFIG, at, { check }));

describe('what was sent is remembered (store.js contentPrint, hasUnsent)', () => {
    test('published: nothing unsent; an edit is; undone, or reloaded, it is not', async () => {
        const w = await booked();
        expect(w.c().published.sent).toBe(contentPrint(w.c()));
        expect(hasUnsent(w.c())).toBe(false);
        const before = w.doc;
        noteOnStove(w, 'Behind the kettle');
        expect(hasUnsent(w.c())).toBe(true);
        // Undo keeps the server's facts, the fingerprint among them, so the
        // edit undone is nothing to send.
        w.doc = keepServerFacts(before, w.doc);
        expect(hasUnsent(w.c())).toBe(false);
        // Saved and loaded again, the same.
        const back = validate(JSON.parse(JSON.stringify(w.doc)), CONFIG, new Date(START)).doc;
        expect(hasUnsent(findChecklist(back, ID))).toBe(false);
        // A draft, or nothing, is never "unsent"; a publication from before
        // fingerprints were kept counts as changed, so sending it settles it.
        expect(hasUnsent({ ...w.c(), published: null })).toBe(false);
        expect(hasUnsent(null)).toBe(false);
        expect(hasUnsent({ ...w.c(), published: { ...w.c().published, sent: null } })).toBe(true);
    });

    test('only what the cleaner reads counts: the quote, the booking and the stamps do not', async () => {
        const w = await booked();
        const c = w.c();
        expect(contentPrint({ ...c, updatedAt: 'later', quote: null, booking: null })).toBe(contentPrint(c));
        expect(contentPrint({ ...c, title: 'Elm Street' })).not.toBe(contentPrint(c));
        // A removed task is not content.
        const gone = { ...c, items: c.items.map((i, n) => (n === 0 ? { ...i, deletedAt: 'now' } : i)) };
        expect(contentPrint(gone)).not.toBe(contentPrint(c));
        expect(publishedContent(gone).items).toHaveLength(c.items.length - 1);
        // The published form is that content, with the quote and the booking.
        const form = publishedForm(c, c.quote);
        expect(form).toMatchObject({ ...publishedContent(c), quote: c.quote, booking: c.booking, format: 1, id: c.published.id });
    });

    test('a checklist brought by its edit link arrives with nothing to send', async () => {
        const w = await booked();
        const { form } = await w.opened();
        const r = importPublished(emptyDoc(CONFIG, new Date(START)), form, { id: form.id, key: w.c().published.key, ownerToken: w.c().published.ownerToken, version: 1 }, CONFIG, new Date(START)).record;
        expect(r.published.sent).toBe(contentPrint(r));
        expect(hasUnsent(r)).toBe(false);
    });
});

describe('Send my changes (sync.js republish)', () => {
    test('a note: only the checklist is sent, the link, the PIN and the booking unchanged', async () => {
        const w = await booked();
        const was = w.c();
        noteOnStove(w, 'Behind the kettle');
        const r = await republish(w.args());
        expect(r.ok).toBe(true);
        expect(w.calls).toEqual(['PUT checklists/:id']);
        const c = w.c();
        expect(c.published).toMatchObject({ id: was.published.id, key: was.published.key, pin: was.published.pin, version: 2 });
        expect(c.booking).toEqual(was.booking);
        expect(hasUnsent(c)).toBe(false);
        const { form, version } = await w.opened();
        expect(version).toBe(2);
        expect(form.items.find((i) => i.id === w.stove).notes).toBe('Behind the kettle');
        // Re-quoted on the current sheet: the same price, locked again now.
        expect(c.quote.totalCents).toBe(was.quote.totalCents);
    });

    test('a longer visit: the booking grows first, at the same start', async () => {
        const w = await booked();
        addBathroom(w);
        const want = visitMinutes(quoteChecklist(SHEET, w.c()).minutes);
        expect(want).toBeGreaterThan(w.c().booking.minutes);
        const r = await republish(w.args());
        expect(r.ok).toBe(true);
        expect(w.calls).toEqual(['PUT checklists/:id/booking', 'PUT checklists/:id']);
        expect(w.c().booking).toMatchObject({ date: '2026-10-16', time: '09:00', minutes: want });
        expect(w.c().quote.minutes).toBe(quoteChecklist(SHEET, w.c()).minutes);
        expect((await w.opened()).form.booking.minutes).toBe(want);
    });

    test('photos: a new one sent with its thumbnail, a removed one deleted', async () => {
        const w = await booked();
        w.edit((d, at) => addPhoto(d, ID, w.stove, PHOTO2, CONFIG, at));
        w.edit((d, at) => removePhoto(d, ID, w.stove, PHOTO, CONFIG, at));
        expect((await republish(w.args())).ok).toBe(true);
        expect(w.calls).toEqual([
            'PUT checklists/:id/photos/:id', 'PUT checklists/:id/photos/:id/thumb', 'DELETE checklists/:id/photos/:id', 'PUT checklists/:id'
        ]);
        expect(w.c().published.photos).toEqual([PHOTO2]);
        const { id, ownerToken } = w.c().published;
        expect((await w.api.getPhoto(id, ownerToken, PHOTO)).status).toBe(404);
        expect((await w.api.getThumb(id, ownerToken, PHOTO)).status).toBe(404);
        expect((await w.api.getPhoto(id, ownerToken, PHOTO2)).ok).toBe(true);
    });

    test('a visit that no longer fits its time: nothing sent, and a new time is asked for', async () => {
        const w = await booked(await lastStart());
        const was = w.c();
        addBathroom(w);
        const r = await republish(w.args());
        expect(r).toMatchObject({ ok: false, error: 'no-longer-fits' });
        expect(w.calls).toEqual(['PUT checklists/:id/booking']);
        expect(w.c().booking).toEqual(was.booking);
        expect(hasUnsent(w.c())).toBe(true);
        // A new time, and the changes go with it.
        w.calls.length = 0;
        const moved = await republish({ ...w.args(), slot: { date: '2026-10-19', time: '09:00' } });
        expect(moved.ok).toBe(true);
        expect(w.c().booking).toMatchObject({ date: '2026-10-19', time: '09:00', minutes: visitMinutes(quoteChecklist(SHEET, w.c()).minutes) });
        expect(hasUnsent(w.c())).toBe(false);
        expect((await w.opened()).form.booking.date).toBe('2026-10-19');
    });

    test('inside the change window: longer is refused, shorter keeps its booking and is sent', async () => {
        const w = await booked();
        w.advance(25 * HOUR);   // Thursday, 10:00 am: under a day before Friday at 9
        addBathroom(w);
        expect(await republish(w.args())).toMatchObject({ ok: false, error: 'too-late' });
        expect(hasUnsent(w.c())).toBe(true);
        // Shorter instead: the longer booking stands, and the checklist goes.
        const w2 = await booked();
        w2.advance(25 * HOUR);
        const booked2 = w2.c().booking;
        for (const item of w2.c().items.filter((i) => i.id !== w2.stove).slice(0, 4)) w2.edit((d, at) => deleteItem(d, ID, item.id, CONFIG, at));
        expect(visitMinutes(quoteChecklist(SHEET, w2.c()).minutes)).toBeLessThan(booked2.minutes);
        const r = await republish(w2.args());
        expect(r.ok).toBe(true);
        expect(w2.calls).toEqual(['PUT checklists/:id/booking', 'PUT checklists/:id']);
        expect(w2.c().booking).toEqual(booked2);
        expect(hasUnsent(w2.c())).toBe(false);
    });

    test('the quote: kept as locked while nothing changed, fresh once something has', async () => {
        const w = await booked();
        const later = new Date(START + 10 * 86400000).toISOString();
        const kept = quoteToSend(w.c(), SHEET, later);
        expect(kept).toMatchObject({ changed: false, quote: w.c().quote });
        noteOnStove(w, 'x');
        const fresh = quoteToSend(w.c(), SHEET, later);
        expect(fresh.changed).toBe(true);
        expect(fresh.quote.lockedAt).toBe(later);
        // Changed into something that cannot be priced: no quote.
        const unpriced = { ...w.c(), items: [] };
        expect(quoteToSend(unpriced, SHEET, later).quote).toBeNull();
        expect((await republish({ ...w.args(), checklist: unpriced })).error).toBe('unpriced');
        expect((await republish({ ...w.args(), checklist: { ...w.c(), published: null } })).error).toBe('not-published');
    });

    test('stopped part way, it is still unsent, and a second send finishes', async () => {
        const w = await booked();
        noteOnStove(w, 'x');
        const r = await republish({ ...w.args(), api: { ...w.api, putChecklist: async () => ({ ok: false, status: 0, error: 'offline' }) } });
        expect(r.error).toBe('offline');
        expect(hasUnsent(w.c())).toBe(true);
        expect((await republish(w.args())).ok).toBe(true);
        expect(hasUnsent(w.c())).toBe(false);
    });
});

describe('moving, canceling and unpublishing', () => {
    test('a move keeps the locked quote when nothing else changed, and a taken time offers others', async () => {
        const w = await booked();
        const quote = w.c().quote;
        w.advance(HOUR);
        const r = await republish({ ...w.args(), slot: { date: '2026-10-20', time: '10:00' } });
        expect(r.ok).toBe(true);
        expect(w.calls).toEqual(['PUT checklists/:id/booking', 'PUT checklists/:id']);
        expect(w.c().booking).toMatchObject({ date: '2026-10-20', time: '10:00' });
        expect(w.c().quote).toEqual(quote);
        // Someone else takes Thursday; moving there is refused with others.
        const other = (await w.api.reserve()).data;
        await w.api.book(other.id, other.ownerToken, { date: '2026-10-22', time: '09:00', minutes: 60 });
        const taken = await republish({ ...w.args(), slot: { date: '2026-10-22', time: '09:00' } });
        expect(taken).toMatchObject({ ok: false, error: 'taken' });
        expect(taken.next.length).toBeGreaterThan(0);
        expect(w.c().booking.date).toBe('2026-10-20');
    });

    test('cancel: the time given back, the checklist still published and opening with its PIN', async () => {
        const w = await booked();
        const r = await cancelVisit(w.args());
        expect(r.ok).toBe(true);
        expect(w.calls).toEqual(['DELETE checklists/:id/booking', 'PUT checklists/:id']);
        expect(w.c().booking).toBeNull();
        expect(w.c().published.at).toBeTruthy();
        const { form } = await w.opened();
        expect(form.booking).toBeNull();
        // Friday is open again.
        const days = (await w.api.availability('2026-10', 60)).data.days;
        expect(days.find((d) => d.date === '2026-10-16').times).toContain('09:00');
        // Booked again, at a new time, the same link.
        const again = await republish({ ...w.args(), slot: { date: '2026-10-16', time: '10:00' } });
        expect(again.ok).toBe(true);
        expect(w.c().booking).toMatchObject({ date: '2026-10-16', time: '10:00' });
        // Nothing booked to cancel.
        expect((await cancelVisit({ ...w.args(), checklist: { ...w.c(), booking: null } })).error).toBe('no-booking');
    });

    test('cancel with changes not sent: the booking goes, the changes wait for their own send', async () => {
        const w = await booked();
        noteOnStove(w, 'x');
        expect((await cancelVisit(w.args())).ok).toBe(true);
        expect(w.calls).toEqual(['DELETE checklists/:id/booking']);
        expect(hasUnsent(w.c())).toBe(true);
    });

    test('inside the change window, neither a move, a cancel nor an unpublish', async () => {
        const w = await booked();
        w.advance(25 * HOUR);
        const was = w.c();
        expect((await republish({ ...w.args(), slot: { date: '2026-10-20', time: '10:00' } })).error).toBe('too-late');
        expect((await cancelVisit(w.args())).error).toBe('too-late');
        expect((await unpublish(w.args())).error).toBe('too-late');
        expect(w.c()).toMatchObject({ booking: was.booking, published: was.published });
        expect((await w.opened()).form.title).toBe('Maple Street');
    });

    test('unpublish: the server\'s copy gone, the booking with it, and a draft here again', async () => {
        const w = await booked();
        const { id, ownerToken, pin } = w.c().published;
        const r = await unpublish(w.args());
        expect(r.ok).toBe(true);
        expect(w.c()).toMatchObject({ published: null, booking: null, quote: null });
        expect((await w.api.getChecklist(id, ownerToken)).error).toBe('denied');
        expect((await w.api.open(id, pin)).error).toBe('denied');
        expect((await w.api.availability('2026-10', 60)).data.days.find((d) => d.date === '2026-10-16').times).toContain('09:00');
        // A copy already gone (expired) is unpublished here all the same.
        const w2 = await booked();
        w2.advance((CONFIG.api.publishedDays + 1) * 86400000);
        expect((await unpublish(w2.args())).ok).toBe(true);
        expect(w2.c().published).toBeNull();
        // Offline: nothing changes here.
        const w3 = await booked();
        expect((await unpublish({ ...w3.args(), api: { ...w3.api, deleteChecklist: async () => ({ ok: false, status: 0, error: 'offline' }) } })).error).toBe('offline');
        expect(w3.c().published).not.toBeNull();
    });
});

describe('what the page says (receipt.js, booking.js, panel.js, panels.js, copy.js)', () => {
    const opts = (now) => ({ origin: 'http://localhost:8000', config: CONFIG, timezone: SCHEDULE.timezone, now, schedule: SCHEDULE });

    test('the receipt: changes offered while the window allows, why not after, and a canceled visit', async () => {
        const w = await booked();
        let v = receiptView(w.c(), opts(START));
        expect(v).toMatchObject({ booked: true, title: RECEIPT.title, unsent: false, changeable: true, locked: '' });
        noteOnStove(w, 'x');
        expect(receiptView(w.c(), opts(START)).unsent).toBe(true);
        v = receiptView(w.c(), opts(START + 25 * HOUR));
        expect(v).toMatchObject({ changeable: false, locked: RECEIPT.locked(24) });
        // Canceled: published, no visit, no calendar file.
        await cancelVisit(w.args());
        v = receiptView(w.c(), opts(START));
        expect(v).toMatchObject({ booked: false, title: RECEIPT.titlePublished, when: RECEIPT.noVisit, ics: '', icsName: '', changeable: true });
        // Without the schedule, changes are offered.
        expect(receiptView(w.c(), { ...opts(START), schedule: undefined }).changeable).toBe(true);
    });

    test('the calendar: after the quote\'s 90 days, and the visit\'s own day, say so', () => {
        const days = [
            { date: '2026-10-16', status: 'full', times: [] },
            { date: '2026-10-19', status: 'open', times: ['09:00'] },
            { date: '2026-10-20', status: 'open', times: ['09:00'] }
        ];
        const cells = calendarView('2026-10', days, null, { until: '2026-10-19', current: '2026-10-16' }).weeks.flat().filter(Boolean);
        expect(cells.find((c) => c.date === '2026-10-19')).toMatchObject({ open: true });
        expect(cells.find((c) => c.date === '2026-10-20')).toMatchObject({ open: false, status: 'beyond-quote', label: `Tuesday, October 20, ${DAY_STATUS['beyond-quote']}` });
        expect(cells.find((c) => c.date === '2026-10-16')).toMatchObject({ open: false, status: 'yours', label: `Friday, October 16, ${DAY_STATUS.yours}` });
        expect(firstOpen(days, '2026-10-18')).toBeNull();
        expect(firstOpen(days, '2026-10-19')).toBe('2026-10-19');
        // Without either, as before.
        expect(calendarView('2026-10', days).weeks.flat().find((c) => c && c.date === '2026-10-20').open).toBe(true);
    });

    test('the whole house leads with what to do next', async () => {
        const w = await booked();
        const house = (c) => panelView({ scope: 'house' }, c, SHEET).actions.map((a) => `${a.id}${a.primary ? '*' : ''}`);
        expect(house(w.c())).toEqual(['visit*', 'checklist', 'home']);
        noteOnStove(w, 'x');
        expect(house(w.c())).toEqual(['send*', 'visit', 'checklist', 'home']);
        await republish(w.args());
        await cancelVisit(w.args());
        expect(house(w.c())).toEqual(['book*', 'visit', 'checklist', 'home']);
        expect(panelView({ scope: 'house' }, w.c(), SHEET).actions.find((a) => a.id === 'visit').label).toBe(PANEL.link);
        await unpublish(w.args());
        expect(house(w.c())).toEqual(['book*', 'checklist', 'home']);
    });

    test('every new line is in the house sweep, and every refusal has words', () => {
        const swept = allCopy().map((c) => c.where);
        for (const key of Object.keys(CHANGES)) expect(swept.some((w) => w.startsWith(`copy.CHANGES.${key}`))).toBe(true);
        for (const code of ['no-longer-fits', 'not-published', 'too-late', 'taken', 'offline', 'denied', 'unpriced']) expect(BOOKING_ERRORS[code]).toBeTruthy();
    });
});
