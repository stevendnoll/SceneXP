// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Choosing a time and publishing (M3 against the stand-in, PRD 10.3 and 13,
 * PLANNING 10.1): how the calendar reads (booking.js, pure), the publish
 * steps in the plan's order, resumable and sealed (sync.js), the published
 * form that never carries a key, a token, a PIN or the example's tags, the
 * store's record of it and undo that cannot take it back (store.js), and
 * every line of the receipt (receipt.js).
 *
 * Runs on Node's WebCrypto and the stand-in in memory, on a pinned clock.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../www/whitestone/js/config.js';
import {
    clockLabel, dayLabel, monthLabel, shiftMonth, visitMinutes, finishOf, calendarView, timesView, firstOpen
} from '../www/whitestone/js/booking.js';
import { publish, publishedForm, photoIdsOf, openPublished } from '../www/whitestone/js/sync.js';
import { receiptView } from '../www/whitestone/js/receipt.js';
import { createApi } from '../www/whitestone/js/api.js';
import { createStandin } from '../www/whitestone/js/standin.js';
import { createMemoryBackend, createPhotoStore } from '../www/whitestone/js/photos.js';
import { createSealer, contextFor } from '../www/whitestone/js/seal.js';
import {
    emptyDoc, createChecklist, addRoom, addItem, addPhoto, setPublication, keepServerFacts, findChecklist, validate,
    normalizePublished, normalizeBooking, duplicateChecklist, updateChecklist, importPublished
} from '../www/whitestone/js/store.js';
import { checkChoice, presetFor } from '../www/whitestone/js/sheet.js';
import { withExample } from '../www/whitestone/js/samples.js';
import { BOOKING, RECEIPT, DAY_STATUS } from '../www/whitestone/js/copy.js';
import { parseShare, parseEdit } from '../www/whitestone/js/links.js';

const WS = join(process.cwd(), 'www', 'whitestone');
const SCHEDULE = JSON.parse(readFileSync(join(WS, 'data', 'schedule.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(WS, 'data', 'prices', 'index.json'), 'utf8'));
const SHEET = JSON.parse(readFileSync(join(WS, 'data', 'prices', `${index.cleaning}.json`), 'utf8'));
const START = Date.parse('2026-10-14T16:00:00Z');
const NOW = new Date(START);
const check = (choice, area, bath) => checkChoice(SHEET, choice, area, bath);
const SLOT = { date: '2026-10-16', time: '09:00', minutes: 120 };

describe('how the calendar reads (pure)', () => {
    test('times, days and months in words', () => {
        expect(['08:00', '12:00', '12:30', '13:05', '00:00', '19:30'].map(clockLabel)).toEqual(['8:00 am', '12:00 pm', '12:30 pm', '1:05 pm', '12:00 am', '7:30 pm']);
        expect(dayLabel('2026-10-16')).toBe('Friday, October 16');
        expect(monthLabel('2026-10')).toBe('October 2026');
        expect([shiftMonth('2026-12', 1), shiftMonth('2026-01', -1), shiftMonth('2026-10', 0)]).toEqual(['2027-01', '2025-12', '2026-10']);
        expect([visitMinutes(0), visitMinutes(10), visitMinutes(31), visitMinutes(61), visitMinutes(undefined)]).toEqual([30, 30, 45, 75, 30]);
        expect(finishOf('09:00', 150)).toBe('11:30');
    });

    test('a month in weeks from Sunday, each day open or saying why not', () => {
        const days = [
            { date: '2026-10-16', status: 'open', times: ['09:00', '09:30'] },
            { date: '2026-10-17', status: 'full', times: [] },
            { date: '2026-11-26', status: 'holiday', holiday: 'Thanksgiving', times: [] }
        ];
        const v = calendarView('2026-10', days, '2026-10-16');
        expect(v.title).toBe('October 2026');
        expect(v.weeks.every((w) => w.length === 7)).toBe(true);
        expect(v.weeks[0].slice(0, 4)).toEqual([null, null, null, null]);   // October 2026 begins on a Thursday
        const cells = v.weeks.flat().filter(Boolean);
        expect(cells).toHaveLength(31);
        const fri = cells.find((c) => c.date === '2026-10-16');
        expect(fri).toMatchObject({ day: 16, open: true, selected: true, status: 'open', label: `Friday, October 16, ${BOOKING.times(2)}` });
        expect(cells.find((c) => c.date === '2026-10-17')).toMatchObject({ open: false, label: `Saturday, October 17, ${DAY_STATUS.full}` });
        // A day the API did not mention is closed.
        expect(cells.find((c) => c.date === '2026-10-01')).toMatchObject({ open: false, status: 'closed' });
        expect(calendarView('2026-11', days).weeks.flat().find((c) => c && c.date === '2026-11-26').label).toBe('Thursday, November 26, closed for Thanksgiving');
        // An "open" day with no times left is not a day to choose.
        expect(calendarView('2026-10', [{ date: '2026-10-19', status: 'open', times: [] }]).weeks.flat().find((c) => c && c.date === '2026-10-19').open).toBe(false);
    });

    test('a day\'s times, each with its finish, the earliest chosen unless another is', () => {
        const day = { date: '2026-10-16', times: ['08:00', '08:30'] };
        expect(timesView(day, 150)).toEqual([
            { time: '08:00', label: '8:00 am', until: '10:30 am', selected: true },
            { time: '08:30', label: '8:30 am', until: '11:00 am', selected: false }
        ]);
        expect(timesView(day, 150, '08:30').map((t) => t.selected)).toEqual([false, true]);
        expect(timesView(day, 150, '17:00').map((t) => t.selected)).toEqual([true, false]);
        expect(timesView(null, 60)).toEqual([]);
        expect(firstOpen([{ date: 'a', status: 'open', times: [] }, { date: 'b', status: 'closed', times: [] }, { date: 'c', status: 'open', times: ['09:00'] }])).toBe('c');
        expect(firstOpen([])).toBeNull();
    });
});

/** A home with a kitchen and a photo on its stovetop, the stand-in, and a
 *  `record` that writes to the store as main.js does. */
async function world() {
    let doc = emptyDoc(CONFIG, NOW);
    doc = createChecklist(doc, { title: 'Maple Street' }, CONFIG, NOW, { id: 'checklist-1' }).doc;
    doc = addRoom(doc, 'checklist-1', { level: 'main', area: 'kitchen' }, CONFIG, NOW, { id: 'kitchen-1', check, presetItems: presetFor(SHEET, 'kitchen') }).doc;
    const stove = findChecklist(doc, 'checklist-1').items.find((i) => i.task === 'stovetop');
    doc = addPhoto(doc, 'checklist-1', stove.id, 'photo-aaaaaaaaaaaaaaaa', CONFIG, NOW).doc;
    const photos = createPhotoStore(createMemoryBackend(), CONFIG);
    await photos.put('photo-aaaaaaaaaaaaaaaa', { full: new Blob([new Uint8Array([1, 2, 3])]), thumb: new Blob([new Uint8Array([4])]) });
    const backend = createMemoryBackend();
    let t = START;
    const standin = createStandin({ backend, config: CONFIG, schedule: SCHEDULE, now: () => t });
    const calls = [];
    const api = createApi(async (req) => { calls.push(`${req.method} ${req.path.replace(/[A-Za-z0-9_-]{22}/g, ':id')}`); return standin.handle(req); });
    const box = { doc };
    const record = async (patch) => {
        const r = setPublication(box.doc, 'checklist-1', patch, CONFIG, new Date(t));
        if (r.error) throw new Error(r.error);
        box.doc = r.doc;
        return r.record;
    };
    return { box, api, photos, backend, record, calls, sealer: createSealer(), advance: (ms) => { t += ms; } };
}

describe('publishing (sync.js)', () => {
    test('in the plan\'s order: reserve, book, the photo and its thumbnail, then the checklist, its quote locked', async () => {
        const w = await world();
        const c = findChecklist(w.box.doc, 'checklist-1');
        const r = await publish({ checklist: c, api: w.api, sealer: w.sealer, photos: w.photos, sheet: SHEET, slot: SLOT, at: NOW.toISOString(), record: w.record });
        expect(r.ok).toBe(true);
        expect(w.calls).toEqual(['POST checklists', 'POST checklists/:id/booking', 'PUT checklists/:id/photos/:id', 'PUT checklists/:id/photos/:id/thumb', 'PUT checklists/:id']);
        const done = findChecklist(w.box.doc, 'checklist-1');
        expect(done.published).toMatchObject({ at: NOW.toISOString(), version: 1, photos: ['photo-aaaaaaaaaaaaaaaa'] });
        expect(done.booking).toMatchObject({ date: '2026-10-16', time: '09:00', minutes: 120, start: '2026-10-16T09:00:00-07:00' });
        expect(done.quote).toMatchObject({ sheetVersion: SHEET.version, lockedAt: NOW.toISOString() });
        expect(done.quote.totalCents).toBeGreaterThan(0);
    });

    test('what is sent opens with the key alone, and carries no key, token, PIN or removed record', async () => {
        const w = await world();
        await publish({ checklist: findChecklist(w.box.doc, 'checklist-1'), api: w.api, sealer: w.sealer, photos: w.photos, sheet: SHEET, slot: SLOT, at: NOW.toISOString(), record: w.record });
        const c = findChecklist(w.box.doc, 'checklist-1');
        const key = await w.sealer.importKey(c.published.key);
        const visit = (await w.api.open(c.published.id, c.published.pin)).data.visitToken;
        const sent = await w.sealer.openJson(key, (await w.api.getChecklist(c.published.id, visit)).bytes, contextFor(c.published.id, 'checklist'));
        expect(sent).toMatchObject({ format: 1, id: c.published.id, title: 'Maple Street', booking: c.booking, quote: c.quote });
        expect(sent.items).toHaveLength(c.items.length);
        const text = JSON.stringify(sent);
        for (const secret of [c.published.key, c.published.ownerToken, c.published.pin]) expect(text).not.toContain(secret);
        expect(text).not.toMatch(/"sample"|"deletedAt"|"published"/);
        // The photo, sealed under its own context.
        const photo = await w.api.getPhoto(c.published.id, visit, 'photo-aaaaaaaaaaaaaaaa');
        expect([...(await w.sealer.open(key, photo.bytes, contextFor(c.published.id, 'photo', 'photo-aaaaaaaaaaaaaaaa')))]).toEqual([1, 2, 3]);
        const thumb = await w.api.getThumb(c.published.id, visit, 'photo-aaaaaaaaaaaaaaaa');
        expect([...(await w.sealer.open(key, thumb.bytes, contextFor(c.published.id, 'thumb', 'photo-aaaaaaaaaaaaaaaa')))]).toEqual([4]);
        await expect(w.sealer.open(key, photo.bytes, contextFor(c.published.id, 'thumb', 'photo-aaaaaaaaaaaaaaaa'))).rejects.toThrow();
    });

    test('a time just taken: nothing sent, the reservation kept, the next openings offered, and a second try books', async () => {
        const w = await world();
        // Someone else takes Friday first.
        const other = (await w.api.reserve()).data;
        await w.api.book(other.id, other.ownerToken, SLOT);
        const r = await publish({ checklist: findChecklist(w.box.doc, 'checklist-1'), api: w.api, sealer: w.sealer, photos: w.photos, sheet: SHEET, slot: SLOT, at: NOW.toISOString(), record: w.record });
        expect(r).toMatchObject({ ok: false, error: 'taken' });
        expect(r.next[0]).toEqual({ date: '2026-10-17', time: '08:00' });
        const mid = findChecklist(w.box.doc, 'checklist-1');
        expect(mid.published).toMatchObject({ at: null, photos: [] });
        expect(mid.booking).toBeNull();
        const again = await publish({ checklist: mid, api: w.api, sealer: w.sealer, photos: w.photos, sheet: SHEET, slot: { ...SLOT, ...r.next[0] }, at: NOW.toISOString(), record: w.record });
        expect(again.ok).toBe(true);
        // The same reservation, not a second one.
        expect(findChecklist(w.box.doc, 'checklist-1').published.id).toBe(mid.published.id);
    });

    test('stopped part way, it picks up where it was; a reservation that lapsed starts over', async () => {
        const w = await world();
        // The connection drops when the photos are sent, after the booking.
        const drops = { ...w.api, putPhoto: async () => ({ ok: false, status: 0, error: 'offline' }) };
        const first = await publish({ checklist: findChecklist(w.box.doc, 'checklist-1'), api: drops, sealer: w.sealer, photos: w.photos, sheet: SHEET, slot: SLOT, at: NOW.toISOString(), record: w.record });
        expect(first.error).toBe('offline');
        const paused = findChecklist(w.box.doc, 'checklist-1');
        expect(paused.booking).not.toBeNull();
        w.calls.length = 0;
        const resumed = await publish({ checklist: paused, api: w.api, sealer: w.sealer, photos: w.photos, sheet: SHEET, slot: SLOT, at: NOW.toISOString(), record: w.record });
        expect(resumed.ok).toBe(true);
        expect(w.calls).toEqual(['PUT checklists/:id/photos/:id', 'PUT checklists/:id/photos/:id/thumb', 'PUT checklists/:id']);
        // Stopped after its photos: they are not sent twice.
        const w3 = await world();
        const late = await publish({ checklist: findChecklist(w3.box.doc, 'checklist-1'), api: { ...w3.api, putChecklist: async () => ({ ok: false, error: 'offline' }) }, sealer: w3.sealer, photos: w3.photos, sheet: SHEET, slot: SLOT, at: NOW.toISOString(), record: w3.record });
        expect(late.error).toBe('offline');
        expect(findChecklist(w3.box.doc, 'checklist-1').published.photos).toEqual(['photo-aaaaaaaaaaaaaaaa']);
        w3.calls.length = 0;
        expect((await publish({ checklist: findChecklist(w3.box.doc, 'checklist-1'), api: w3.api, sealer: w3.sealer, photos: w3.photos, sheet: SHEET, slot: SLOT, at: NOW.toISOString(), record: w3.record })).ok).toBe(true);
        expect(w3.calls).toEqual(['PUT checklists/:id']);
        // A reservation left an hour unsent lapses: cleared, and said.
        const w2 = await world();
        await publish({ checklist: findChecklist(w2.box.doc, 'checklist-1'), api: { ...w2.api, putPhoto: async () => ({ ok: false, error: 'offline' }) }, sealer: w2.sealer, photos: w2.photos, sheet: SHEET, slot: SLOT, at: NOW.toISOString(), record: w2.record });
        w2.advance(CONFIG.api.reservationMinutes * 60000);
        const lapsed = await publish({ checklist: findChecklist(w2.box.doc, 'checklist-1'), api: w2.api, sealer: w2.sealer, photos: w2.photos, sheet: SHEET, slot: SLOT, at: NOW.toISOString(), record: w2.record });
        expect(lapsed.error).toBe('expired');
        expect(findChecklist(w2.box.doc, 'checklist-1')).toMatchObject({ published: null, booking: null });
    });

    test('the example, an empty home, or a task the menu no longer offers is never published', async () => {
        const w = await world();
        const go = (checklist) => publish({ checklist, api: w.api, sealer: w.sealer, photos: w.photos, sheet: SHEET, slot: SLOT, at: NOW.toISOString(), record: w.record });
        const example = withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, null).doc.checklists[0];
        expect((await go(example)).error).toBe('sample');
        expect((await go({ ...findChecklist(w.box.doc, 'checklist-1'), items: [] })).error).toBe('unpriced');
        const c = findChecklist(w.box.doc, 'checklist-1');
        expect((await go({ ...c, items: [...c.items, { ...c.items[0], id: 'item-gone-1', task: 'no-such-task' }] })).error).toBe('unpriced');
        expect(w.calls).toEqual([]);
        expect(photoIdsOf(c)).toEqual(['photo-aaaaaaaaaaaaaaaa']);
        expect(publishedForm({ ...c, published: null }, null).id).toBeNull();
    });
});

describe('the store keeps it (store.js)', () => {
    test('a publication and a booking read back, and anything malformed is dropped', () => {
        const good = { id: 'A'.repeat(22), key: 'k'.repeat(43), ownerToken: 'o'.repeat(43), pin: '012345', at: NOW.toISOString(), version: 2, expiresAt: NOW.toISOString(), photos: ['photo-aaaaaaaaaaaaaaaa', '../x'] };
        expect(normalizePublished(good)).toEqual({ ...good, photos: ['photo-aaaaaaaaaaaaaaaa'], sent: null });
        // The fingerprint of what was sent is kept, and anything else is not one.
        expect(normalizePublished({ ...good, sent: 'k3j9x0a' }).sent).toBe('k3j9x0a');
        for (const sent of [undefined, 'Not-One', 12345, 'x'.repeat(17)]) expect(normalizePublished({ ...good, sent }).sent).toBeNull();
        for (const bad of [{ ...good, key: 'short' }, { ...good, id: 'x' }, { ...good, ownerToken: null }, null]) expect(normalizePublished(bad)).toBeNull();
        // A PIN this device does not know (opened by its edit link) is null, the keys kept.
        expect(normalizePublished({ ...good, pin: '12345' })).toMatchObject({ id: good.id, pin: null });
        expect(normalizePublished({ ...good, pin: undefined }).pin).toBeNull();
        expect(normalizePublished({ ...good, version: -1, at: 'nope' })).toMatchObject({ version: 0, at: null });
        const b = { date: '2026-10-16', time: '09:00', minutes: 120, start: '2026-10-16T09:00:00-07:00', end: '2026-10-16T11:00:00-07:00' };
        expect(normalizeBooking(b)).toEqual(b);
        for (const bad of [{ ...b, minutes: 0 }, { ...b, date: 'soon' }, { ...b, start: 'x' }, null]) expect(normalizeBooking(bad)).toBeNull();
        // Saved and loaded again.
        let doc = createChecklist(emptyDoc(CONFIG, NOW), {}, CONFIG, NOW, { id: 'checklist-1' }).doc;
        doc = setPublication(doc, 'checklist-1', { published: good, booking: b }, CONFIG, NOW).doc;
        const back = validate(JSON.parse(JSON.stringify(doc)), CONFIG, NOW).doc.checklists[0];
        expect(back.published.pin).toBe('012345');
        expect(back.booking).toEqual(b);
        // A copy is a new draft, never the published one.
        expect(duplicateChecklist(doc, 'checklist-1', CONFIG, NOW).record).toMatchObject({ published: null, booking: null });
    });

    test('undo cannot take back a publication or a booking', () => {
        let doc = createChecklist(emptyDoc(CONFIG, NOW), { title: 'Before' }, CONFIG, NOW, { id: 'checklist-1' }).doc;
        const before = doc;
        doc = updateChecklist(doc, 'checklist-1', { title: 'After' }, CONFIG, NOW).doc;
        const pub = { id: 'A'.repeat(22), key: 'k'.repeat(43), ownerToken: 'o'.repeat(43), pin: '012345' };
        doc = setPublication(doc, 'checklist-1', { published: pub }, CONFIG, NOW).doc;
        const undone = keepServerFacts(before, doc).checklists[0];
        expect(undone.title).toBe('Before');
        expect(undone.published.id).toBe(pub.id);
        // A checklist the restored document has that the current one does not stays as it was.
        expect(keepServerFacts({ ...before, checklists: [...before.checklists, { id: 'other', published: null }] }, doc).checklists[1]).toEqual({ id: 'other', published: null });
    });

    test('the example cannot be published', () => {
        const doc = withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, null).doc;
        expect(setPublication(doc, doc.checklists[0].id, { booking: null }, CONFIG, NOW).error).toMatch(/example home/);
    });
});

describe('the receipt (receipt.js)', () => {
    test('every line, from the checklist as published, and links that parse back', async () => {
        const w = await world();
        await publish({ checklist: findChecklist(w.box.doc, 'checklist-1'), api: w.api, sealer: w.sealer, photos: w.photos, sheet: SHEET, slot: SLOT, at: NOW.toISOString(), record: w.record });
        const c = findChecklist(w.box.doc, 'checklist-1');
        const v = receiptView(c, { origin: 'http://localhost:8000', config: CONFIG, timezone: SCHEDULE.timezone, now: START });
        expect(v.when).toBe('Friday, October 16, 9:00 am to about 11:00 am');
        expect(v.quote).toMatch(/^\$\d+ for about /);
        expect(v.pin).toBe(c.published.pin);
        expect(parseShare(v.link, CONFIG)).toEqual({ id: c.published.id, key: c.published.key });
        expect(parseEdit(v.edit, CONFIG)).toEqual({ id: c.published.id, key: c.published.key, ownerToken: c.published.ownerToken });
        expect(v.expires).toBe(RECEIPT.expires('Tuesday, January 12'));
        expect(v.ics).toMatch(/BEGIN:VCALENDAR/);
        expect(v.icsName).toBe('whitestone-visit-2026-10-16.ics');
        expect(v.standin).toBe(true);
        // Not yet published, no receipt.
        expect(receiptView({ ...c, published: { ...c.published, at: null } }, { origin: 'http://localhost:8000', config: CONFIG, timezone: SCHEDULE.timezone, now: START })).toBeNull();
        expect(receiptView(null, {})).toBeNull();
    });
});

describe('opening by the edit link (sync.js openPublished, store.js importPublished)', () => {
    test('fetched with the owner token, opened with the key, its photos brought back, and made a checklist of this device', async () => {
        const w = await world();
        await publish({ checklist: findChecklist(w.box.doc, 'checklist-1'), api: w.api, sealer: w.sealer, photos: w.photos, sheet: SHEET, slot: SLOT, at: NOW.toISOString(), record: w.record });
        const c = findChecklist(w.box.doc, 'checklist-1');
        const link = { id: c.published.id, key: c.published.key, ownerToken: c.published.ownerToken };
        const elsewhere = createPhotoStore(createMemoryBackend(), CONFIG);
        const opened = await openPublished({ api: w.api, sealer: w.sealer, photos: elsewhere, link });
        expect(opened).toMatchObject({ ok: true, version: 1, error: null });
        expect(opened.form.title).toBe('Maple Street');
        expect([...new Uint8Array(await (await elsewhere.get('photo-aaaaaaaaaaaaaaaa', 'full')).arrayBuffer())]).toEqual([1, 2, 3]);
        const imported = importPublished(emptyDoc(CONFIG, NOW), opened.form, { ...link, version: opened.version }, CONFIG, NOW, { id: 'checklist-here' });
        expect(imported.error).toBeNull();
        const r = imported.record;
        expect(r).toMatchObject({ id: 'checklist-here', title: 'Maple Street', sample: false, booking: c.booking, quote: c.quote });
        expect(r.published).toMatchObject({ id: link.id, key: link.key, ownerToken: link.ownerToken, pin: null, version: 1, photos: ['photo-aaaaaaaaaaaaaaaa'] });
        // The rooms and tasks keep their ids, so the photos still match.
        expect(r.rooms.map((x) => x.id)).toEqual(c.rooms.map((x) => x.id));
        expect(r.items.map((x) => x.id).sort()).toEqual(c.items.map((x) => x.id).sort());
        // Its receipt knows it does not know the PIN.
        const v = receiptView(r, { origin: 'http://localhost:8000', config: CONFIG, timezone: SCHEDULE.timezone, now: START });
        expect([v.pin, v.pinUnknown]).toEqual(['', true]);
    });

    test('a wrong key, a wrong token, another checklist\'s, or a full device opens nothing', async () => {
        const w = await world();
        await publish({ checklist: findChecklist(w.box.doc, 'checklist-1'), api: w.api, sealer: w.sealer, photos: w.photos, sheet: SHEET, slot: SLOT, at: NOW.toISOString(), record: w.record });
        const c = findChecklist(w.box.doc, 'checklist-1');
        const link = { id: c.published.id, key: c.published.key, ownerToken: c.published.ownerToken };
        const photos = createPhotoStore(createMemoryBackend(), CONFIG);
        const otherKey = await w.sealer.exportKey(await w.sealer.generateKey());
        expect((await openPublished({ api: w.api, sealer: w.sealer, photos, link: { ...link, key: otherKey } })).error).toBe('denied');
        expect((await openPublished({ api: w.api, sealer: w.sealer, photos, link: { ...link, key: 'short' } })).error).toBe('denied');
        expect((await openPublished({ api: w.api, sealer: w.sealer, photos, link: { ...link, ownerToken: 'x'.repeat(43) } })).error).toBe('denied');
        // A form that is not the published form, or names another checklist.
        const key = await w.sealer.importKey(link.key);
        const forged = { ...w.api, getChecklist: async () => ({ ok: true, bytes: await w.sealer.sealJson(key, { format: 1, id: 'B'.repeat(22) }, contextFor(link.id, 'checklist')) }) };
        expect((await openPublished({ api: forged, sealer: w.sealer, photos, link })).error).toBe('denied');
        // A photo that will not open is left out, and the rest goes on.
        const broken = { ...w.api, getThumb: async () => ({ ok: true, bytes: new Uint8Array([9, 9, 9]) }) };
        const partial = await openPublished({ api: broken, sealer: w.sealer, photos, link });
        expect(partial.ok).toBe(true);
        expect(await photos.get('photo-aaaaaaaaaaaaaaaa', 'full')).toBeNull();
        let full = emptyDoc(CONFIG, NOW);
        for (let i = 0; i < CONFIG.limits.checklists; i++) full = createChecklist(full, {}, CONFIG, NOW).doc;
        expect(importPublished(full, partial.form, link, CONFIG, NOW).error).toMatch(/up to/);
        expect(importPublished(emptyDoc(CONFIG, NOW), partial.form, { ...link, key: 'short' }, CONFIG, NOW).error).toBeTruthy();
    });
});
