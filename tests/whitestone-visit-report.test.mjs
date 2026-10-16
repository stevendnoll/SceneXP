// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The visit's report in the studio (M5 piece 3, PRD 12.4, 9.6 and 10.4):
 *   - report.js: a report settled by the customer's own answers (an add-on
 *     the customer never approved is never billed, whatever the report
 *     says), and the visits read in one look (open add-ons, new reports);
 *   - store.js: reports kept with the checklist, newest first, at most 20,
 *     seen or not, kept through undo, and the booking a report closes let
 *     go; the stand-in lets the checklist be booked again;
 *   - model.js: the dots by outcome; guide.js: Maya's `report` scene;
 *     panels.js: the report's card;
 *   - the studio end to end: the report arrives, Maya leads with the bill
 *     and the skips, the house lit, the full report, Not now, and Book your
 *     next visit.
 *
 * Runs on Node's WebCrypto and the stand-in in memory.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import { GUIDE, REPORT } from '../www/whitestone/js/copy.js';
import { ADDON_FORMAT } from '../www/whitestone/js/addons.js';
import { REPORT_FORMAT, settleReport, readVisits, sendReport, sendProof, reportLines } from '../www/whitestone/js/report.js';
import { proposeAddOn } from '../www/whitestone/tasks/js/addons.js';
import { buildReport, emptyProgress, applyMark } from '../www/whitestone/tasks/js/visit.js';
import { step, viewFor, savedForm } from '../www/whitestone/js/guide.js';
import { markerPaintKey } from '../www/whitestone/js/model.js';
import { createApi } from '../www/whitestone/js/api.js';
import { createStandin } from '../www/whitestone/js/standin.js';
import { createMemoryBackend } from '../www/whitestone/js/photos.js';
import { createSealer, contextFor } from '../www/whitestone/js/seal.js';
import {
    emptyDoc, createChecklist, setPublication, addVisits, markVisitSeen, keepServerFacts, findChecklist, validate, normalizeVisit, MAX_VISITS, photoIdsInUse
} from '../www/whitestone/js/store.js';
import { priceItem, formatMoney } from '../www/whitestone/js/pricing.js';

const WS = join(process.cwd(), 'www', 'whitestone');
const SCHEDULE = JSON.parse(readFileSync(join(WS, 'data', 'schedule.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(WS, 'data', 'prices', 'index.json'), 'utf8'));
const SHEET = JSON.parse(readFileSync(join(WS, 'data', 'prices', `${index.cleaning}.json`), 'utf8'));
const NOW = new Date('2026-10-14T16:00:00Z');
const PID = 'AbCdEfGhIjKlMnOpQrStUv';
const addonId = (n) => `addon${String(n).padStart(17, '0')}`;
const proposal = (n, extra = {}) => ({ format: ADDON_FORMAT, id: addonId(n), roomId: 'kitchen-1', task: 'oven-interior', options: [], words: '', ...extra });
const report = (extra = {}) => ({ format: REPORT_FORMAT, id: PID, booking: { date: '2026-10-16', time: '09:00' }, cleaner: '', submittedAt: null, minutesOnSite: null, note: '', results: [], addOns: [], ...extra });

// ---- report.js ---------------------------------------------------------------------------

describe('a report settled by the customer\'s own answers (report.js settleReport)', () => {
    test('the customer\'s answer wins; no answer lapses; done only when approved and marked', () => {
        const r = report({
            addOns: [
                { ...proposal(1), status: 'approved', done: true },
                { ...proposal(2), status: 'approved', done: true },
                { ...proposal(3), status: 'lapsed', done: false },
                { ...proposal(9), status: 'approved', done: true }
            ]
        });
        const fromApi = [
            { ...proposal(1), status: 'approved' },
            { ...proposal(2), status: 'declined' },
            { ...proposal(3), status: 'approved' },
            { ...proposal(4), status: 'waiting' }
        ];
        const s = settleReport(r, fromApi);
        expect(s.addOns.map((a) => [a.id, a.status, a.done])).toEqual([
            // approved by the customer and marked done
            [addonId(1), 'approved', true],
            // the report says approved and done, the customer declined: not
            [addonId(2), 'declined', false],
            // approved, but the cleaner did not mark it done
            [addonId(3), 'approved', false],
            // never answered: lapsed (and one the API never had is gone)
            [addonId(4), 'lapsed', false]
        ]);
        expect(s.results).toBe(r.results);
        expect(settleReport(null, [])).toBeNull();
        expect(settleReport(r, [{ id: 'bad' }]).addOns).toEqual([]);
    });
});

const SLOT = { date: '2026-10-16', time: '09:00', minutes: 60 };

/** A checklist reserved on the stand-in, published (one byte will do for
 *  these), booked, opened by the cleaner. */
async function onStandin() {
    const standin = createStandin({ backend: createMemoryBackend(), config: CONFIG, schedule: SCHEDULE, now: () => NOW.getTime() });
    const api = createApi((req) => standin.handle(req));
    const sealer = createSealer();
    const r = (await api.reserve()).data;
    await api.putChecklist(r.id, r.ownerToken, new Uint8Array([1]));
    // Booked: a visit begins only under a booking (QA, 2026-10-15).
    await api.book(r.id, r.ownerToken, SLOT);
    const token = (await api.open(r.id, r.pin)).data.visitToken;
    const key = await sealer.generateKey();
    return { api, sealer, key, id: r.id, owner: r.ownerToken, token };
}

describe('the visits read in one look (report.js readVisits)', () => {
    test('open visits give their add-ons; a reported one its report, settled, once', async () => {
        const w = await onStandin();
        const p = await proposeAddOn({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.token, addOn: { roomId: 'kitchen-1', task: 'oven-interior', options: [] } });
        // Read under the booking it began under: under way, with its add-on.
        const first = await readVisits({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.owner, booking: SLOT });
        expect(first.open.map((a) => [a.id, a.visitId, a.status])).toEqual([[p.addOn.id, p.visitId, 'waiting']]);
        expect(first.started).toEqual({ visitId: p.visitId, at: NOW.toISOString() });
        // Under no booking, or another (QA, 2026-10-15): nothing under way.
        for (const booking of [null, { ...SLOT, time: '11:00' }]) {
            expect(await readVisits({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.owner, booking })).toMatchObject({ ok: true, started: null, open: [] });
        }
        expect(first.reports).toEqual([]);
        const sent = { format: REPORT_FORMAT, id: w.id, results: [{ itemId: 'a', status: 'done' }], addOns: [{ ...p.addOn, status: 'approved', done: true }] };
        expect((await sendReport({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.token, visitId: p.visitId, report: sent })).ok).toBe(true);
        const second = await readVisits({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.owner });
        expect(second.open).toEqual([]);
        expect(second.started).toBeNull();
        expect(second.reports).toHaveLength(1);
        expect(second.reports[0]).toMatchObject({ visitId: p.visitId, reportAt: NOW.toISOString() });
        // The customer never approved it, so it lapsed, whatever was sent.
        expect(second.reports[0].report.addOns[0]).toMatchObject({ id: p.addOn.id, status: 'lapsed', done: false });
        expect(second.reports[0].report.results).toEqual([{ itemId: 'a', status: 'done' }]);
        // Known here already: not fetched again.
        const get = jest.spyOn(w.api, 'getReport');
        expect((await readVisits({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.owner, known: [p.visitId] })).reports).toEqual([]);
        expect(get).not.toHaveBeenCalled();
    });

    test('a report that will not open, or will not come, is left to try again; a refusal says so', async () => {
        const w = await onStandin();
        const v = (await w.api.startVisit(w.id, w.token)).data.visitId;
        const other = await w.sealer.generateKey();
        await sendReport({ api: w.api, sealer: w.sealer, key: other, id: w.id, token: w.token, visitId: v, report: { format: REPORT_FORMAT, id: w.id, results: [] } });
        expect((await readVisits({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.owner })).reports).toEqual([]);
        const missing = { ...w.api, getReport: async () => ({ ok: false, error: 'offline' }) };
        expect(await readVisits({ api: missing, sealer: w.sealer, key: w.key, id: w.id, token: w.owner })).toMatchObject({ ok: true, reports: [] });
        expect((await readVisits({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.token })).error).toBe('denied');
        const noAddOns = { ...w.api, listAddOns: async () => ({ ok: false, error: 'server' }) };
        expect((await readVisits({ api: noAddOns, sealer: w.sealer, key: w.key, id: w.id, token: w.owner })).error).toBe('server');
    });

    test('the report lets the booking go, so the checklist can be booked again', async () => {
        const w = await onStandin();
        const slot = SLOT;
        expect((await w.api.book(w.id, w.owner, { ...slot, date: '2026-10-19' })).error).toBe('already-booked');
        await sendReport({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.token, report: { format: REPORT_FORMAT, id: w.id, results: [] } });
        expect((await w.api.book(w.id, w.owner, { ...slot, date: '2026-10-19' })).ok).toBe(true);
    });
});

// ---- store.js --------------------------------------------------------------------------

describe('reports kept with the checklist (store.js)', () => {
    const at = (n) => new Date(Date.UTC(2026, 9, 16, 12, n)).toISOString();
    const visit = (n, extra = {}) => ({ visitId: `visit${String(n).padStart(17, '0')}`, reportAt: at(n), report: report(), bill: null, ...extra });
    function published() {
        let doc = emptyDoc(CONFIG, NOW);
        doc = createChecklist(doc, { title: 'Maple Street' }, CONFIG, NOW, { id: 'checklist-1' }).doc;
        doc = setPublication(doc, 'checklist-1', {
            published: { id: PID, key: 'A'.repeat(43), ownerToken: 'B'.repeat(43), pin: '123456', at: NOW.toISOString(), version: 1, photos: [] },
            booking: { date: '2026-10-16', time: '09:00', minutes: 60, start: '2026-10-16T09:00:00-07:00', end: '2026-10-16T10:00:00-07:00' }
        }, CONFIG, NOW).doc;
        return doc;
    }

    test('added newest first and unseen, the visit\'s booking let go, one already here kept as it is', () => {
        let doc = published();
        doc = addVisits(doc, 'checklist-1', [visit(1, { bill: { doneCents: 100, addOnCents: 0, topUpCents: 50, billedCents: 150, quoteCents: 200 } })], CONFIG, NOW).doc;
        let c = findChecklist(doc, 'checklist-1');
        expect(c.visits).toHaveLength(1);
        expect(c.visits[0]).toMatchObject({ seen: false, bill: { billedCents: 150 } });
        expect(c.booking).toBeNull();
        doc = markVisitSeen(doc, 'checklist-1', c.visits[0].visitId).doc;
        doc = addVisits(doc, 'checklist-1', [visit(1, { seen: false }), visit(2)], CONFIG, NOW).doc;
        c = findChecklist(doc, 'checklist-1');
        expect(c.visits.map((v) => [v.visitId.slice(-1), v.seen])).toEqual([['2', false], ['1', true]]);
        // Nothing new: the same document.
        expect(addVisits(doc, 'checklist-1', [visit(2)], CONFIG, NOW).doc).toBe(doc);
        expect(markVisitSeen(doc, 'checklist-1', 'nope').doc).toBe(doc);
    });

    test('a report for another booking leaves the booking be; at most twenty, the oldest dropped', () => {
        let doc = published();
        doc = addVisits(doc, 'checklist-1', [visit(1, { report: report({ booking: { date: '2026-10-02', time: '09:00' } }) })], CONFIG, NOW).doc;
        expect(findChecklist(doc, 'checklist-1').booking).not.toBeNull();
        doc = addVisits(doc, 'checklist-1', Array.from({ length: 25 }, (_, n) => visit(n + 2)), CONFIG, NOW).doc;
        const c = findChecklist(doc, 'checklist-1');
        expect(c.visits).toHaveLength(MAX_VISITS);
        expect(c.visits[0].visitId.endsWith('26')).toBe(true);
    });

    test('malformed visits and bills are dropped; saved and loaded, the same; undo keeps them', () => {
        expect(normalizeVisit(visit(1, { visitId: 'short' }))).toBeNull();
        expect(normalizeVisit(visit(1, { reportAt: 'never' }))).toBeNull();
        expect(normalizeVisit(visit(1, { report: { ...report(), format: 9 } }))).toBeNull();
        expect(normalizeVisit(visit(1, { bill: { doneCents: 1, addOnCents: 0, topUpCents: 0, billedCents: 5, quoteCents: 9 } })).bill).toBeNull();
        const before = published();
        const after = addVisits(before, 'checklist-1', [visit(1)], CONFIG, NOW).doc;
        const back = validate(JSON.parse(JSON.stringify(after)), CONFIG, NOW).doc;
        expect(findChecklist(back, 'checklist-1').visits).toEqual(findChecklist(after, 'checklist-1').visits);
        // Undo to before the report: the report stays, and so does the
        // booking it let go.
        const undone = keepServerFacts(before, after);
        expect(findChecklist(undone, 'checklist-1').visits).toHaveLength(1);
        expect(findChecklist(undone, 'checklist-1').booking).toBeNull();
    });
});

// ---- model.js, guide.js --------------------------------------------------------------

describe('the report on the house and in Maya\'s words (model.js, guide.js)', () => {
    test('dots green, amber or gray by outcome, the chosen one darker, else blue', () => {
        const results = new Map([['a', 'done'], ['b', 'skipped'], ['c', 'not-reached']]);
        expect(['a', 'b', 'c', 'd'].map((itemId) => markerPaintKey({ itemId }, results))).toEqual(['markerDone', 'markerSkipped', 'markerNotReached', 'marker']);
        expect(markerPaintKey({ itemId: 'a', selected: true }, results)).toBe('markerSelected');
        expect(markerPaintKey({ itemId: 'a' }, null)).toBe('marker');
    });

    const at = (scene, extra = {}) => ({ scene, back: null, resume: null, reached: 4, ...extra });
    const show = (g, extra = {}) => step(g, { type: 'visitReport', visitId: 'v1', ...extra });

    test('Maya shows it as she asks about an add-on: where she is free to, or when asked', () => {
        for (const scene of ['done', 'welcome', 'saved', 'hint', 'addOn']) expect(show(at(scene))).toMatchObject({ scene: 'report', visitId: 'v1' });
        for (const scene of ['rooms', 'example1', 'hello']) expect(show(at(scene)).scene).toBe(scene);
        expect(show(at('rooms'), { asked: true })).toMatchObject({ scene: 'report', back: 'rooms' });
        expect(show(at('done', { away: { to: 'receipt' } })).scene).toBe('done');
        const shown = show(at('done'));
        expect(show(shown)).toBe(shown);
        expect(step(shown, { type: 'proposal', addonId: 'a1' })).toMatchObject({ scene: 'addOn', back: 'done' });
        expect(step(shown, { type: 'visitReport' })).toBe(shown);
    });

    test('Not now goes back where she was; Book your next visit steps her aside; saved as the scene beneath', () => {
        expect(step(show(at('rooms'), { asked: true }), { type: 'reportDone' })).toMatchObject({ scene: 'rooms', visitId: null });
        expect(step(show(at('done')), { type: 'reportDone' })).toMatchObject({ scene: 'done', outcome: null, minimized: false });
        expect(step(show(at('done')), { type: 'away', to: 'booking', was: null })).toMatchObject({ scene: 'done', away: { to: 'booking' } });
        expect(step(at('done'), { type: 'reportDone' }).scene).toBe('done');
        expect(savedForm(show(at('rooms'), { asked: true })).scene).toBe('rooms');
        const v = viewFor(show(at('done')), { report: { text: 'In.' } });
        expect(v).toMatchObject({ text: 'In.', small: GUIDE.reportColors, choices: 'report', buttons: [], halo: null });
        expect(viewFor(show(at('done'))).text).toBe(GUIDE.reportPlain);
    });
});

// ---- The report's card (panels.js) -------------------------------------------------------

describe('the report\'s card (panels.js renderVisitReport)', () => {
    let dom;
    beforeEach(() => {
        installThree();
        dom = installDom();
    });
    afterEach(() => dom.uninstall());

    test('when, who and how long, the bill first, then the skips, the not reached, the add-ons and the note', async () => {
        const { renderVisitReport } = await import('../www/whitestone/js/panels.js');
        const form = {
            serviceType: 'cleaning',
            rooms: [{ id: 'kitchen-1', level: 'main', area: 'kitchen' }],
            items: [{ id: 'stove', roomId: 'kitchen-1', task: 'stovetop', options: [] }, { id: 'sink', roomId: 'kitchen-1', task: 'kitchen-sink', options: [] }]
        };
        const r = report({
            cleaner: 'Steve', minutesOnSite: 150, note: 'The gate sticks.',
            results: [{ itemId: 'stove', status: 'skipped', reason: 'no-time', words: '' }, { itemId: 'sink', status: 'not-reached' }],
            addOns: [{ ...proposal(1), status: 'declined', done: false }]
        });
        renderVisitReport({ visit: { report: r, bill: { doneCents: 0, addOnCents: 0, topUpCents: 0, billedCents: 0, quoteCents: 12000 } }, form, sheet: SHEET });
        expect(dom.el('visit-report-when').textContent).toBe(`${REPORT.visitOn('Friday, October 16')} ${REPORT.cleanedBy('Steve')} ${REPORT.onSite(150)}`);
        expect(REPORT.onSite(150)).toBe('Time on site: 2 hours 30 minutes.');
        const text = dom.el('visit-report-body').textContent;
        expect(text.indexOf(REPORT.billNothing)).toBeLessThan(text.indexOf(REPORT.skippedHeading));
        expect(text).toContain(`Stovetop, in the kitchen (${REPORT.reasons['no-time']})${REPORT.lineOff(formatMoney(priceItem(SHEET, form.items[0], form.rooms).cents))}`);
        expect(text).toContain(REPORT.notReachedHeading);
        expect(text).toContain(`Oven interior (${REPORT.addOnOutcome.declined})`);
        expect(text).toContain('The gate sticks.');
        // (The stub's getElementById sees only the markup, so look inside.)
        expect(dom.el('visit-report-body').children.find((n) => n.id === 'visit-report-counts').textContent).toBe(REPORT.counts(0, 1, 1));
        // Nothing to say, nothing said; a task removed since is named so.
        renderVisitReport({ visit: { report: report({ results: [{ itemId: 'gone', status: 'not-reached' }] }), bill: null }, form, sheet: SHEET });
        expect(dom.el('visit-report-when').textContent).toBe(REPORT.visitOn('Friday, October 16'));
        expect(dom.el('visit-report-body').textContent).toContain(REPORT.removedSince);
        expect(dom.el('visit-report-body').textContent).toContain(REPORT.billNoSheet);
    });
});

// ---- The studio ----------------------------------------------------------------------------

let dom;
const REAL_IMMEDIATE = globalThis.setImmediate;

describe('the studio shows the report (main.js)', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.useFakeTimers();
        installThree();
        dom = installDom();
    });
    afterEach(() => {
        dom.uninstall();
        jest.useRealTimers();
        delete globalThis.fetch;
    });

    async function until(test) {
        for (let i = 0; i < 3000 && !(await test()); i++) await new Promise((r) => REAL_IMMEDIATE(r));
        return test();
    }
    const line = () => dom.el('host-line').textContent;
    const picks = () => (dom.el('host-choices').children[0] || { children: [] }).children;
    const pick = (id) => fire(picks().find((b) => b.id === `host-${id}`), 'click');
    const fact = (key) => dom.el('host-facts').children.find((b) => b.id === `host-fact-${key}`);

    /** The studio with a kitchen published and booked, Maya standing by,
     *  and the cleaner's side: the published form, and a way to report. */
    async function bookedStudio({ upstairs = false } = {}) {
        jest.setSystemTime(new Date('2026-10-14T16:00:00Z'));
        globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(WS, String(url)), 'utf8')) });
        for (const id of ['ws-host', 'ws-panel']) dom.el(id).hidden = true;
        const main = await import('../www/whitestone/js/main.js');
        await flushAsync(20);
        await jest.advanceTimersByTimeAsync(CONFIG.loadingReveal + CONFIG.guide.delay * 1000 + 200);
        const t = main.__test__;
        t.state.reducedMotion = true;
        t.onHostButton('start');
        t.onHostButton('kind-house');
        t.onFloor('second', true);
        t.addRoomOf('kitchen', 'main');
        if (upstairs) t.addRoomOf('bedroom', 'second');
        await t.openBooking();
        expect((await t.confirmBooking()).ok).toBe(true);
        fire(dom.el('receipt-done'), 'click');
        t.ui.guide = { ...t.ui.guide, scene: 'done', minimized: false, away: null, outcome: null };
        t.showGuide();
        const svc = await t.connect();
        const pub = t.active().published;
        const key = await svc.sealer.importKey(pub.key);
        const token = (await svc.api.open(pub.id, pub.pin)).data.visitToken;
        const got = await svc.api.getChecklist(pub.id, token);
        const form = await svc.sealer.openJson(key, got.bytes, contextFor(pub.id, 'checklist'));
        let visitId = null;
        const cleaner = {
            async propose(addOn) {
                const p = await proposeAddOn({ api: svc.api, sealer: svc.sealer, key, id: pub.id, token, visitId, addOn });
                visitId = p.visitId;
                return p.addOn;
            },
            /** A proof photo sent ahead of the report. */
            async proof(photoId) {
                if (!visitId) visitId = (await svc.api.startVisit(pub.id, token)).data.visitId;
                const sent = await sendProof({ api: svc.api, sealer: svc.sealer, key, id: pub.id, token, visitId, photoId, full: new Uint8Array([9, 9]), thumb: new Uint8Array([9]) });
                if (!sent.ok) throw new Error(sent.error);
            },
            /** Marks as given, every other task done, and the report sent. */
            async report(marks = {}, extra = {}) {
                let p = form.items.reduce((acc, i) => applyMark(acc, i.id, { status: 'done' }), emptyProgress());
                for (const [id, mark] of Object.entries(marks)) p = applyMark(p, id, mark);
                const r = { ...buildReport(form, p, extra.addOns || [], extra), ...(extra.override || {}) };
                const sent = await sendReport({ api: svc.api, sealer: svc.sealer, key, id: pub.id, token, visitId, report: r });
                if (!sent.ok) throw new Error(sent.error);
                return r;
            }
        };
        return { main, t, svc, pub, key, form, cleaner, stove: form.items.find((i) => i.task === 'stovetop') };
    }

    test('it arrives: Maya leads with the bill and the skip, the house lit, the floor open, the booking done with', async () => {
        const w = await bookedStudio();
        const paint = jest.spyOn(w.t.model(), 'report');
        await w.cleaner.report({ [w.stove.id]: { status: 'skipped', reason: 'no-time' } }, { note: 'The gate sticks.' });
        await jest.advanceTimersByTimeAsync(CONFIG.api.ownerPollSeconds * 1000 + 10);
        expect(await until(() => w.t.ui.guide.scene === 'report')).toBe(true);
        const c = w.t.active();
        const stovePrice = priceItem(SHEET, w.stove, w.form.rooms).cents;
        const quote = w.form.quote.totalCents;
        expect(c.visits[0].bill).toMatchObject({ billedCents: quote - stovePrice, quoteCents: quote });
        expect(line()).toBe([
            GUIDE.reportLead,
            GUIDE.reportBilled(formatMoney(quote - stovePrice), formatMoney(quote)),
            GUIDE.reportSkipped(GUIDE.reportSkipItem('Stovetop, in the kitchen', REPORT.reasons['no-time'], REPORT.lineOff(formatMoney(stovePrice)))),
            GUIDE.reportHasNote
        ].join(' '));
        expect(dom.el('host-small').textContent).toBe(GUIDE.reportColors);
        // No booking pitch here (QA, 2026-10-15): the full report, or Done.
        expect(picks().map((b) => b.textContent)).toEqual([GUIDE.fullReport, GUIDE.reportLater]);
        // The house: every dot by outcome, the skip's floor open.
        const results = paint.mock.calls[paint.mock.calls.length - 1][0];
        expect(results.get(w.stove.id)).toBe('skipped');
        expect([...results.values()].filter((s) => s === 'done')).toHaveLength(w.form.items.length - 1);
        expect(w.t.model().lifted).toBe('main');
        // Seen now; the booking it closes is done with; at a glance.
        expect(c.visits[0].seen).toBe(true);
        expect(c.booking).toBeNull();
        expect(fact('report').children[1].textContent).toBe(GUIDE.factBilled(formatMoney(quote - stovePrice)));
        expect(fact('report').children[2]).toBeUndefined();
        // Done with, the checklist is no longer shared: its own draft again,
        // the report kept, and no visit at a glance (QA, 2026-10-15).
        expect(await until(() => w.t.active().published === null)).toBe(true);
        expect(fact('visit')).toBeUndefined();
        expect((await w.svc.api.getChecklist(w.pub.id, w.pub.ownerToken)).error).toBe('denied');
    });

    test('See the full report opens its card; Done puts it away; a tap at a glance brings it back', async () => {
        const w = await bookedStudio();
        await w.cleaner.report();
        await w.t.pollVisits();
        expect(line()).toBe(`${GUIDE.reportLead} ${GUIDE.reportBilled(formatMoney(w.form.quote.totalCents), formatMoney(w.form.quote.totalCents))} ${GUIDE.reportAllDone}`);
        pick('fullReport');
        expect(dom.el('visit-report').hidden).toBe(false);
        fire(dom.el('visit-report-done'), 'click');
        expect(dom.el('visit-report').hidden).toBe(true);
        expect(w.t.ui.guide.scene).toBe('report');
        const paint = jest.spyOn(w.t.model(), 'report');
        pick('reportLater');
        expect(w.t.ui.guide.scene).toBe('done');
        expect(paint).toHaveBeenLastCalledWith(null);
        expect(w.t.model().lifted).toBeNull();
        // Not asked again of her own accord, but a tap brings it back.
        await w.t.pollVisits();
        expect(w.t.ui.guide.scene).toBe('done');
        fire(fact('report'), 'click');
        expect(w.t.ui.guide.scene).toBe('report');
        // Tapped while showing it: the full report.
        fire(fact('report'), 'click');
        expect(dom.el('visit-report').hidden).toBe(false);
    });

    test('after a visit, standing by: how it went, then Plan my next cleaning or See my last report', async () => {
        const w = await bookedStudio();
        await w.cleaner.report();
        await w.t.pollVisits();
        pick('reportLater');
        const billed = formatMoney(w.t.active().visits[0].bill.billedCents);
        expect(line()).toBe(`${GUIDE.homeVisited('Thursday, October 15')} ${GUIDE.homeBilled(billed)} ${GUIDE.returningLegend}`);
        expect(picks().map((b) => b.textContent)).toEqual([GUIDE.nextCleaning, GUIDE.lastReport]);
        pick('lastReport');
        expect(w.t.ui.guide.scene).toBe('report');
        pick('reportLater');
        // A welcome back says the same.
        w.t.ui.guide = { ...w.t.ui.guide, scene: 'welcome', resume: null };
        w.t.showGuide();
        expect(line()).toBe(`${GUIDE.welcomeBack} ${GUIDE.homeVisited('Thursday, October 15')} ${GUIDE.homeBilled(billed)} ${GUIDE.returningLegend}`);
    });

    test('Plan my next cleaning: the same home in Your rooms, then Review, Save and a time, with a new link and PIN', async () => {
        const w = await bookedStudio();
        await w.cleaner.report();
        await w.t.pollVisits();
        pick('reportLater');
        const before = w.t.active();
        pick('nextCleaning');
        expect(w.t.ui.guide).toMatchObject({ scene: 'rooms', nextVisit: true });
        expect(line()).toBe(GUIDE.roomsNextVisit);
        expect(w.t.model().lifted).toBe('main');
        expect(w.t.active().id).toBe(before.id);
        expect(w.t.active().items.length).toBe(before.items.length);
        w.t.onHostButton('review');
        w.t.onHostButton('save');
        expect(w.t.ui.guide.scene).toBe('saved');
        w.t.onHostButton('chooseTime');
        expect(await until(() => !dom.el('booking').hidden)).toBe(true);
        expect((await w.t.confirmBooking()).ok).toBe(true);
        const after = w.t.active();
        expect(after.published.id).not.toBe(w.pub.id);
        expect(after.published.pin).toMatch(/^\d{6}$/);
        expect(after.booking).not.toBeNull();
        // The last visit's report stays with the home.
        expect(after.visits).toHaveLength(1);
    });

    test('an add-on is billed only when the customer approved it and it was done', async () => {
        const w = await bookedStudio();
        const oven = await w.cleaner.propose({ roomId: w.form.rooms[0].id, task: 'oven-interior', options: [] });
        const micro = await w.cleaner.propose({ roomId: w.form.rooms[0].id, task: 'microwave', options: [] });
        await w.t.pollVisits();
        await w.t.decide('approved');
        await w.t.decide('declined');
        // The report claims both approved and done.
        const claimed = [{ ...oven, status: 'approved' }, { ...micro, status: 'approved' }];
        await w.cleaner.report({ [oven.id]: { status: 'done' }, [micro.id]: { status: 'done' } }, { addOns: claimed });
        await w.t.pollVisits();
        const v = w.t.active().visits[0];
        const ovenCents = priceItem(SHEET, { ...oven, quantity: 1 }, w.form.rooms).cents;
        expect(v.report.addOns.map((a) => [a.task, a.status, a.done])).toEqual([['oven-interior', 'approved', true], ['microwave', 'declined', false]]);
        expect(v.bill).toMatchObject({ addOnCents: ovenCents, billedCents: w.form.quote.totalCents + ovenCents });
        expect(reportLines(SHEET, w.form, v.report).addOns.map((a) => a.outcome)).toEqual([REPORT.addOnOutcome.done, REPORT.addOnOutcome.declined]);
    });

    test('the floor opened is the first skip\'s, wherever it is', async () => {
        const w = await bookedStudio({ upstairs: true });
        const bedroom = w.form.rooms.find((r) => r.level === 'second');
        const task = w.form.items.find((i) => i.roomId === bedroom.id);
        await w.cleaner.report({ [task.id]: { status: 'skipped', reason: 'no-access' } });
        await w.t.pollVisits();
        expect(w.t.ui.guide.scene).toBe('report');
        expect(w.t.model().lifted).toBe('second');
    });

    test('a report for an earlier booking leaves this one booked, and the checklist shared', async () => {
        const w = await bookedStudio();
        await w.cleaner.report({}, { override: { booking: { date: '2026-10-02', time: '09:00' } } });
        await w.t.pollVisits();
        expect(w.t.ui.guide.scene).toBe('report');
        expect(w.t.active().booking).not.toBeNull();
        expect(w.t.active().published).not.toBeNull();
        expect(picks().map((b) => b.textContent)).toEqual([GUIDE.fullReport, GUIDE.reportLater]);
    });

    test('the cleaner\'s photos: kept in this device\'s photo store, never tidied away, shown in the full report', async () => {
        const w = await bookedStudio();
        const photoId = 'photo0000000000000001A';
        await w.cleaner.proof(photoId);
        await w.cleaner.report({}, { proofs: { [w.stove.id]: [photoId] } });
        await w.t.pollVisits();
        const store = w.t.photoStore();
        expect(await store.get(photoId, 'thumb')).toBeTruthy();
        expect(photoIdsInUse(w.t.state.doc).has(photoId)).toBe(true);
        expect(await store.prune(photoIdsInUse(w.t.state.doc))).toBe(0);
        const made = jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:proof');
        const freed = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        await w.t.openVisitReport();
        const photos = dom.el('visit-report-body').children.find((n) => n.className === 'visit-report-photos');
        expect(photos.textContent).toContain(REPORT.photosHeading);
        expect(photos.textContent).toContain(REPORT.photoOf('Stovetop'));
        fire(dom.el('visit-report-close'), 'click');
        expect(freed).toHaveBeenCalledWith('blob:proof');
        made.mockRestore();
        freed.mockRestore();
    });

    test('never over the build of her own accord: the report waits at a glance, marked new', async () => {
        const w = await bookedStudio();
        w.t.onHostButton('editRooms');
        await w.cleaner.report();
        await w.t.pollVisits();
        expect(w.t.ui.guide.scene).toBe('rooms');
        expect(fact('report').children[2].textContent).toBe(GUIDE.factNew);
        expect(fact('report').getAttribute('aria-label')).toMatch(/A new report\.$/);
        fire(fact('report'), 'click');
        expect(w.t.ui.guide).toMatchObject({ scene: 'report', back: 'rooms' });
        pick('reportLater');
        expect(w.t.ui.guide.scene).toBe('rooms');
    });
});
