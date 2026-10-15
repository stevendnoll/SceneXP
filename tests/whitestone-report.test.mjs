// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The visit report (M5 piece 2, PRD 11.7, 12.4 and 9.6), pure and against
 * the stand-in:
 *   - visit.js buildReport: every task as marked (unmarked "not reached"),
 *     every add-on as answered (waiting lapses, approved counts only when
 *     marked done), nothing that reads as a timeline;
 *   - report.js: a report made safe, what it bills (never more than the
 *     quote plus approved add-ons, whatever was marked), and the send:
 *     the visit started when needed, sealed under the visit's own report
 *     context, once;
 *   - view.js reportLines and billLines: the report in words.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../www/whitestone/js/config.js';
import { REPORT_FORMAT, REPORT_LIMITS, cleanReport, cleanMinutes, reportBill, reportCounts, sendReport } from '../www/whitestone/js/report.js';
import { ADDON_FORMAT } from '../www/whitestone/js/addons.js';
import { buildReport, visitKeyOf, emptyProgress, applyMark } from '../www/whitestone/tasks/js/visit.js';
import { createApi } from '../www/whitestone/js/api.js';
import { createStandin } from '../www/whitestone/js/standin.js';
import { createMemoryBackend } from '../www/whitestone/js/photos.js';
import { createSealer, contextFor } from '../www/whitestone/js/seal.js';
import { emptyDoc, createChecklist, addRoom } from '../www/whitestone/js/store.js';
import { presetFor, checkChoice } from '../www/whitestone/js/sheet.js';
import { quoteChecklist, lockQuote, priceItem, priceAddOn, formatMoney } from '../www/whitestone/js/pricing.js';
import { publishedForm } from '../www/whitestone/js/sync.js';
import { TASKS_PAGE as COPY } from '../www/whitestone/js/copy.js';

const WS = join(process.cwd(), 'www', 'whitestone');
const SCHEDULE = JSON.parse(readFileSync(join(WS, 'data', 'schedule.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(WS, 'data', 'prices', 'index.json'), 'utf8'));
const SHEET = JSON.parse(readFileSync(join(WS, 'data', 'prices', `${index.cleaning}.json`), 'utf8'));
const NOW = new Date('2026-10-14T16:00:00Z');
const ID = 'AbCdEfGhIjKlMnOpQrStUv';
const check = (choice, area, bath) => checkChoice(SHEET, choice, area, bath);

/** A kitchen and a bathroom, published as the cleaner receives them. */
function form() {
    let doc = emptyDoc(CONFIG, NOW);
    doc = createChecklist(doc, { title: 'Maple Street', levels: ['main'] }, CONFIG, NOW, { id: 'checklist-1' }).doc;
    doc = addRoom(doc, 'checklist-1', { level: 'main', area: 'kitchen' }, CONFIG, NOW, { id: 'kitchen-1', check, presetItems: presetFor(SHEET, 'kitchen') }).doc;
    doc = addRoom(doc, 'checklist-1', { level: 'main', area: 'bathroom' }, CONFIG, NOW, { id: 'bathroom-1', check, presetItems: presetFor(SHEET, 'bathroom') }).doc;
    const c = doc.checklists[0];
    const quote = lockQuote(quoteChecklist(SHEET, c), NOW.toISOString());
    return {
        ...publishedForm({ ...c, published: { id: ID }, booking: { date: '2026-10-16', time: '09:00', minutes: 120, start: 'x', end: 'y' } }, quote)
    };
}
const proposal = (n, extra) => ({ format: ADDON_FORMAT, id: `addon${String(n).padStart(17, '0')}`, words: '', options: [], ...extra });

describe('the report as the cleaner builds it (visit.js buildReport)', () => {
    test('every task as marked, an unmarked one not reached, in the checklist\'s order', () => {
        const f = form();
        const [a, b] = f.items;
        let p = applyMark(emptyProgress(), a.id, { status: 'done' });
        p = applyMark(p, b.id, { status: 'skipped', reason: 'no-time', words: 'Out of spray' });
        const r = buildReport(f, p, [], { cleaner: '  Steve ', minutesOnSite: 150, note: 'All good.' }, '2026-10-16T19:00:00.000Z');
        expect(r).toMatchObject({ format: REPORT_FORMAT, id: ID, booking: { date: '2026-10-16', time: '09:00' }, cleaner: 'Steve', minutesOnSite: 150, note: 'All good.', submittedAt: '2026-10-16T19:00:00.000Z' });
        expect(r.results.map((x) => x.itemId)).toEqual(f.items.map((i) => i.id));
        expect(r.results[0]).toEqual({ itemId: a.id, status: 'done' });
        expect(r.results[1]).toEqual({ itemId: b.id, status: 'skipped', reason: 'no-time', words: 'Out of spray' });
        expect(r.results.slice(2).every((x) => x.status === 'not-reached')).toBe(true);
        // Outcomes, never a timeline: nothing about when or in what order.
        for (const x of r.results) expect(Object.keys(x).every((k) => ['itemId', 'status', 'reason', 'words'].includes(k))).toBe(true);
        expect(Object.keys(r).sort()).toEqual(['addOns', 'booking', 'cleaner', 'format', 'id', 'minutesOnSite', 'note', 'results', 'submittedAt']);
        expect(reportCounts(r)).toEqual({ done: 1, skipped: 1, notReached: f.items.length - 2 });
        expect(visitKeyOf(f)).toBe('2026-10-16 09:00');
        expect(visitKeyOf({ booking: null })).toBe('');
    });

    test('add-ons: waiting lapses, declined stays declined, approved is done only when marked', () => {
        const f = form();
        const oven = proposal(1, { roomId: 'kitchen-1', task: 'oven-interior', status: 'approved' });
        const micro = proposal(2, { roomId: 'kitchen-1', task: 'microwave', status: 'approved' });
        const waiting = proposal(3, { roomId: 'kitchen-1', task: 'refrigerator', status: 'waiting' });
        const no = proposal(4, { roomId: 'kitchen-1', task: 'dishwasher', status: 'declined' });
        let p = applyMark(emptyProgress(), oven.id, { status: 'done' });
        p = applyMark(p, no.id, { status: 'done' });
        const r = buildReport(f, p, [oven, micro, waiting, no]);
        expect(r.addOns.map((x) => [x.id, x.status, x.done])).toEqual([
            [oven.id, 'approved', true], [micro.id, 'approved', false], [waiting.id, 'lapsed', false], [no.id, 'declined', false]
        ]);
        expect(r.minutesOnSite).toBeNull();
        expect(buildReport({ ...f, id: null }, p, [])).toBeNull();
        expect(buildReport({ ...f, booking: null }, p, []).booking).toBeNull();
    });
});

describe('a report made safe (report.js cleanReport)', () => {
    test('its own checklist and format only; each task and add-on once; the limits kept', () => {
        const base = { format: REPORT_FORMAT, id: ID, results: [], addOns: [] };
        expect(cleanReport(base, ID)).toMatchObject({ id: ID, results: [], addOns: [], cleaner: '', note: '', minutesOnSite: null, booking: null, submittedAt: null });
        expect(cleanReport(base, 'BbCdEfGhIjKlMnOpQrStUv')).toBeNull();
        expect(cleanReport({ ...base, format: 2 }, ID)).toBeNull();
        expect(cleanReport({ ...base, id: 'short' }, 'short')).toBeNull();
        expect(cleanReport(null, ID)).toBeNull();
        const r = cleanReport({
            ...base,
            cleaner: 'x'.repeat(80), note: 'n'.repeat(900), minutesOnSite: 2000, submittedAt: 'not a time',
            booking: { date: '2026-10-16', time: '9am' },
            results: [
                { itemId: 'a', status: 'done' }, { itemId: 'a', status: 'skipped', reason: 'no-time' },
                { itemId: 'b', status: 'finished' }, null, { itemId: 'c', status: 'skipped', reason: 'r'.repeat(90), words: 'w'.repeat(300) }
            ],
            addOns: [
                proposal(1, { roomId: 'k', task: 't', status: 'declined', done: true }),
                proposal(1, { roomId: 'k', task: 't', status: 'approved', done: true }),
                proposal(2, { roomId: 'k', task: 't', status: 'waiting' }),
                proposal(3, { roomId: 'k', task: 't', status: 'approved', done: true })
            ]
        }, ID);
        expect(r.cleaner).toHaveLength(REPORT_LIMITS.cleaner);
        expect(r.note).toHaveLength(REPORT_LIMITS.note);
        expect(r.minutesOnSite).toBe(REPORT_LIMITS.maxMinutes);
        expect(r.submittedAt).toBeNull();
        expect(r.booking).toBeNull();
        expect(r.results.map((x) => [x.itemId, x.status])).toEqual([['a', 'done'], ['c', 'skipped']]);
        expect(r.results[1].reason).toHaveLength(REPORT_LIMITS.reason);
        expect(r.results[1].words).toHaveLength(REPORT_LIMITS.words);
        // A declined add-on is never done; one listed twice counts once;
        // a waiting one is not an outcome.
        expect(r.addOns.map((x) => [x.id, x.status, x.done])).toEqual([[proposal(1).id, 'declined', false], [proposal(3).id, 'approved', true]]);
        expect(cleanMinutes(5)).toBe(REPORT_LIMITS.minMinutes);
        expect(cleanMinutes(0)).toBeNull();
        expect(cleanMinutes('90')).toBe(90);
        expect(cleanMinutes(1.5)).toBeNull();
    });
});

describe('what a report bills (report.js reportBill, PRD 9.6)', () => {
    const price = (f, item) => priceItem(SHEET, item, f.rooms).cents;

    test('all done is the quote; a skip comes off; nothing done is nothing', () => {
        const f = form();
        const all = f.items.reduce((p, i) => applyMark(p, i.id, { status: 'done' }), emptyProgress());
        expect(reportBill(SHEET, f.quote, f, buildReport(f, all, []))).toMatchObject({ billedCents: f.quote.totalCents, quoteCents: f.quote.totalCents });
        const skip = applyMark(all, f.items[0].id, { status: 'skipped', reason: 'no-time' });
        expect(reportBill(SHEET, f.quote, f, buildReport(f, skip, [])).billedCents).toBe(f.quote.totalCents - price(f, f.items[0]));
        expect(reportBill(SHEET, f.quote, f, buildReport(f, emptyProgress(), []))).toMatchObject({ billedCents: 0, topUpCents: 0 });
        // Another sheet, or none, bills nothing here.
        expect(reportBill({ ...SHEET, version: 'other' }, f.quote, f, buildReport(f, all, []))).toBeNull();
        expect(reportBill(null, f.quote, f, buildReport(f, all, []))).toBeNull();
    });

    test('never more than the quote plus the approved add-ons, however it was marked', () => {
        const f = form();
        const addOns = [
            proposal(1, { roomId: 'kitchen-1', task: 'oven-interior', status: 'approved' }),
            proposal(2, { roomId: 'kitchen-1', task: 'microwave', status: 'declined' }),
            proposal(3, { roomId: 'kitchen-1', task: 'refrigerator', status: 'waiting' })
        ];
        const approved = priceAddOn(SHEET, addOns[0], f.rooms, new Map()).cents;
        let seed = 7;
        const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
        for (let trial = 0; trial < 300; trial++) {
            let p = emptyProgress();
            for (const id of [...f.items.map((i) => i.id), ...addOns.map((a) => a.id)]) {
                const x = rand();
                if (x < 0.4) p = applyMark(p, id, { status: 'done' });
                else if (x < 0.6) p = applyMark(p, id, { status: 'skipped', reason: 'no-time' });
            }
            const bill = reportBill(SHEET, f.quote, f, buildReport(f, p, addOns));
            expect(bill.billedCents).toBeLessThanOrEqual(f.quote.totalCents + approved);
            expect(bill.billedCents).toBe(bill.doneCents + bill.addOnCents + bill.topUpCents);
        }
    });
});

describe('sending it (report.js sendReport)', () => {
    async function opened() {
        const standin = createStandin({ backend: createMemoryBackend(), config: CONFIG, schedule: SCHEDULE, now: () => NOW.getTime() });
        const api = createApi((req) => standin.handle(req));
        const sealer = createSealer();
        const r = (await api.reserve()).data;
        await api.putChecklist(r.id, r.ownerToken, new Uint8Array([1]));
        const token = (await api.open(r.id, r.pin)).data.visitToken;
        const key = await sealer.generateKey();
        const report = { format: REPORT_FORMAT, id: r.id, results: [{ itemId: 'a', status: 'done' }], addOns: [], note: 'Done and dusted.' };
        return { api, sealer, key, id: r.id, owner: r.ownerToken, token, report };
    }

    test('the visit started when there is none, the report sealed under its visit, once', async () => {
        const w = await opened();
        const sent = await sendReport({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.token, report: w.report });
        expect(sent).toMatchObject({ ok: true, error: null });
        const got = await w.api.getReport(w.id, w.owner, sent.visitId);
        const read = await w.sealer.openJson(w.key, got.bytes, contextFor(w.id, 'report', sent.visitId));
        expect(read).toEqual(cleanReport(w.report, w.id));
        // Under another visit's name it does not open.
        await expect(w.sealer.openJson(w.key, got.bytes, contextFor(w.id, 'report', 'B'.repeat(22)))).rejects.toThrow();
        // Sent again (an answer lost on the way): as good as sent.
        expect(await sendReport({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.token, visitId: sent.visitId, report: { ...w.report, note: 'Changed' } })).toMatchObject({ ok: true });
        expect(await w.sealer.openJson(w.key, (await w.api.getReport(w.id, w.owner, sent.visitId)).bytes, contextFor(w.id, 'report', sent.visitId))).toMatchObject({ note: 'Done and dusted.' });
    });

    test('what stops it: no pass, a report not its own, a refusal', async () => {
        const w = await opened();
        expect(await sendReport({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: 'C'.repeat(43), report: w.report })).toEqual({ ok: false, visitId: null, error: 'denied' });
        const v = (await w.api.startVisit(w.id, w.token)).data.visitId;
        expect((await sendReport({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.token, visitId: v, report: { ...w.report, id: 'other' } })).error).toBe('bad-request');
        expect((await sendReport({ api: { ...w.api, putReport: async () => ({ ok: false, error: 'offline' }) }, sealer: w.sealer, key: w.key, id: w.id, token: w.token, visitId: v, report: w.report }))).toEqual({ ok: false, visitId: v, error: 'offline' });
    });
});

describe('the report in words (view.js reportLines, billLines)', () => {
    test('skips with why and what they take off, the not reached, and the add-ons\' outcomes', async () => {
        const { reportLines, billLines } = await import('../www/whitestone/tasks/js/view.js');
        const f = form();
        const stove = f.items.find((i) => i.task === 'stovetop');
        const oven = proposal(1, { roomId: 'kitchen-1', task: 'oven-interior', status: 'approved' });
        let p = f.items.reduce((acc, i) => applyMark(acc, i.id, { status: 'done' }), emptyProgress());
        p = applyMark(p, stove.id, { status: 'skipped', reason: 'no-time', words: 'Ran long' });
        p = applyMark(p, f.items[1].id, null);
        p = applyMark(p, oven.id, { status: 'done' });
        const r = buildReport(f, p, [oven, proposal(2, { roomId: 'kitchen-1', task: 'microwave', status: 'waiting' })]);
        const lines = reportLines(SHEET, f, r);
        expect(lines.skipped).toEqual([{ id: stove.id, label: 'Stovetop, in the kitchen', why: `${COPY.reasons['no-time']}. Ran long`, off: COPY.lineOff(formatMoney(priceItem(SHEET, stove, f.rooms).cents)) }]);
        expect(lines.notReached.map((t) => t.id)).toEqual([f.items[1].id]);
        expect(lines.addOns.map((a) => [a.label, a.outcome, a.money !== ''])).toEqual([
            ['Oven interior', COPY.addOnOutcome.done, true], ['Microwave', COPY.addOnOutcome.lapsed, false]
        ]);
        // Without the sheet, the names stay and the amounts go.
        expect(reportLines(null, f, r).skipped[0].off).toBe('');
        const bill = reportBill(SHEET, f.quote, f, r);
        const words = billLines(bill);
        expect(words.line).toBe(COPY.billLine(formatMoney(bill.billedCents), formatMoney(f.quote.totalCents)));
        expect(words.parts[0]).toBe(COPY.billDone(formatMoney(bill.doneCents)));
        expect(words.parts).toContain(COPY.billAddOns(formatMoney(bill.addOnCents)));
        expect(billLines(null)).toEqual({ line: COPY.billNoSheet, parts: [] });
        expect(billLines({ billedCents: 0 })).toEqual({ line: COPY.billNothing, parts: [] });
        expect(billLines({ billedCents: 15000, doneCents: 10000, addOnCents: 0, topUpCents: 5000, quoteCents: 15000 }).parts).toEqual([COPY.billDone('$100'), COPY.billMinimum('$50')]);
    });
});

describe('proof photos (M5 piece 4, PRD 11.7)', () => {
    const P = (n) => `photo${String(n).padStart(17, '0')}`;

    test('a result keeps up to two photos, each once, of the API\'s shape; a report names them all once', async () => {
        const { cleanProofs } = await import('../www/whitestone/tasks/js/visit.js');
        const { proofIdsOf } = await import('../www/whitestone/js/report.js');
        const r = cleanReport({
            format: REPORT_FORMAT, id: ID,
            results: [
                { itemId: 'a', status: 'done', photos: [P(1), P(1), 'bad', P(2), P(3)] },
                { itemId: 'b', status: 'skipped', reason: 'no-time', photos: [P(4)] },
                { itemId: 'c', status: 'done', photos: 'nope' }
            ]
        }, ID);
        expect(r.results[0].photos).toEqual([P(1), P(2)]);
        expect(r.results[1].photos).toEqual([P(4)]);
        expect('photos' in r.results[2]).toBe(false);
        expect(proofIdsOf(r)).toEqual([P(1), P(2), P(4)]);
        expect(proofIdsOf(null)).toEqual([]);
        expect(cleanProofs({ a: [P(1), P(2), P(3)], b: ['bad'], c: 'x' })).toEqual({ a: [P(1), P(2)] });
        expect(cleanProofs(null)).toEqual({});
        // Only a task marked done or skipped carries its photos.
        const f = form();
        let p = applyMark(emptyProgress(), f.items[0].id, { status: 'done' });
        p = applyMark(p, f.items[1].id, { status: 'skipped', reason: 'no-access' });
        const built = buildReport(f, p, [], { proofs: { [f.items[0].id]: [P(1)], [f.items[1].id]: [P(2)], [f.items[2].id]: [P(3)] } });
        expect(built.results.slice(0, 3).map((x) => x.photos)).toEqual([[P(1)], [P(2)], undefined]);
    });

    async function visit() {
        const standin = createStandin({ backend: createMemoryBackend(), config: CONFIG, schedule: SCHEDULE, now: () => NOW.getTime() });
        const api = createApi((req) => standin.handle(req));
        const sealer = createSealer();
        const r = (await api.reserve()).data;
        await api.putChecklist(r.id, r.ownerToken, new Uint8Array([1]));
        const token = (await api.open(r.id, r.pin)).data.visitToken;
        const visitId = (await api.startVisit(r.id, token)).data.visitId;
        return { api, sealer, key: await sealer.generateKey(), id: r.id, owner: r.ownerToken, token, visitId };
    }

    test('sent sealed before the report, read back by the customer, each size under its own name', async () => {
        const { sendProof, fetchProofs } = await import('../www/whitestone/js/report.js');
        const w = await visit();
        const full = new Uint8Array([1, 2, 3]);
        const thumb = new Uint8Array([4]);
        expect(await sendProof({ ...w, photoId: P(1), full, thumb })).toEqual({ ok: true, error: null });
        // Again (an answer lost on the way): as good as sent.
        expect((await sendProof({ ...w, photoId: P(1), full, thumb })).ok).toBe(true);
        const report = cleanReport({ format: REPORT_FORMAT, id: w.id, results: [{ itemId: 'a', status: 'done', photos: [P(1), P(2)] }] }, w.id);
        const got = await fetchProofs({ ...w, token: w.owner, report });
        expect(got).toEqual([{ photoId: P(1), full, thumb }]);
        // The full size does not open as the thumbnail, nor the other way.
        const raw = await w.api.getProof(w.id, w.owner, w.visitId, P(1));
        await expect(w.sealer.open(w.key, raw.bytes, contextFor(w.id, 'proof', `${P(1)}-thumb`))).rejects.toThrow();
        const rawThumb = await w.api.getProofThumb(w.id, w.owner, w.visitId, P(1));
        await expect(w.sealer.open(w.key, rawThumb.bytes, contextFor(w.id, 'proof', P(1)))).rejects.toThrow();
        // A refusal says so.
        expect(await sendProof({ ...w, token: 'C'.repeat(43), photoId: P(3), full, thumb })).toEqual({ ok: false, error: 'denied' });
        const other = await w.sealer.generateKey();
        expect(await fetchProofs({ ...w, key: other, token: w.owner, report })).toEqual([]);
    });

    test('the stand-in: the cleaner sends, the customer reads, not after the report, not too many, not too large', async () => {
        const w = await visit();
        const put = (token, photoId, bytes, thumb = false) => (thumb ? w.api.putProofThumb : w.api.putProof)(w.id, token, w.visitId, photoId, bytes);
        expect((await put(w.owner, P(1), new Uint8Array([1]))).error).toBe('denied');
        expect((await put(w.token, P(1), null)).error).toBe('bad-request');
        expect((await put(w.token, P(1), new Uint8Array(CONFIG.api.maxProofBytes + 1))).error).toBe('bad-request');
        expect((await put(w.token, P(1), new Uint8Array([1]))).status).toBe(201);
        expect((await put(w.token, P(1), new Uint8Array([2]))).error).toBe('exists');
        expect((await put(w.token, P(1), new Uint8Array([3]), true)).status).toBe(201);
        expect((await w.api.getProof(w.id, w.token, w.visitId, P(1))).error).toBe('denied');
        expect((await w.api.getProof(w.id, w.owner, w.visitId, P(9))).status).toBe(404);
        expect((await w.api.getProofThumb(w.id, w.owner, w.visitId, P(1))).bytes).toEqual(new Uint8Array([3]));
        for (let n = 2; n <= CONFIG.api.maxProofs - 1; n++) await put(w.token, P(n), new Uint8Array([1]));
        expect((await put(w.token, P(500), new Uint8Array([1]))).error).toBe('too-many');
        const fresh = await visit();
        await fresh.api.putReport(fresh.id, fresh.token, fresh.visitId, new Uint8Array([1]));
        expect((await fresh.api.putProof(fresh.id, fresh.token, fresh.visitId, P(1), new Uint8Array([1]))).error).toBe('closed');
        expect((await fresh.api.putProof(fresh.id, fresh.token, 'B'.repeat(22), P(1), new Uint8Array([1]))).status).toBe(404);
    });
});
