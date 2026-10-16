// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The customer answers the cleaner's add-ons (M5 piece 1, PRD 9.5, PLANNING
 * 10.4):
 *   - addons.js, the side both pages read alike: a visit's add-ons opened
 *     with the key, the open visits' add-ons for the customer, and the
 *     answer sealed and sent once;
 *   - guide.js's `addOn` scene: Maya asks of her own accord only where she
 *     is free to, from anywhere when the add-on is tapped, and goes back
 *     where she was, or stands by saying what came of it;
 *   - the studio: its published checklist asked after every few seconds,
 *     Maya asking with the price and the cleaner's words, the room shown on
 *     the house, Approve and Decline reaching the cleaner's page, never over
 *     a card or the build, and an answer given elsewhere let go.
 *
 * Runs on Node's WebCrypto and the stand-in in memory.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import { GUIDE, ADDON_LIST } from '../www/whitestone/js/copy.js';
import {
    ADDON_FORMAT, WORDS_MAX, addOnName, priceOf, cleanProposal, cleanDecision, fetchAddOns, openAddOns, decideAddOn, roomOf, waitingCount
} from '../www/whitestone/js/addons.js';
import { proposeAddOn } from '../www/whitestone/tasks/js/addons.js';
import { step, viewFor, savedForm, CHANGED } from '../www/whitestone/js/guide.js';
import { createApi } from '../www/whitestone/js/api.js';
import { createStandin } from '../www/whitestone/js/standin.js';
import { createMemoryBackend } from '../www/whitestone/js/photos.js';
import { createSealer, contextFor, toBase64url } from '../www/whitestone/js/seal.js';
import { formatMoney, formatMinutes } from '../www/whitestone/js/pricing.js';

const WS = join(process.cwd(), 'www', 'whitestone');
const SCHEDULE = JSON.parse(readFileSync(join(WS, 'data', 'schedule.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(WS, 'data', 'prices', 'index.json'), 'utf8'));
const SHEET = JSON.parse(readFileSync(join(WS, 'data', 'prices', `${index.cleaning}.json`), 'utf8'));
const KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// ---- addons.js: both sides --------------------------------------------------------------

describe('add-ons as both sides read them (addons.js)', () => {
    const form = {
        serviceType: 'cleaning',
        rooms: [{ id: 'kitchen-1', level: 'main', area: 'kitchen' }],
        items: [{ id: 'stove-1', roomId: 'kitchen-1', task: 'stovetop', options: [], quantity: 1 }]
    };

    test('a name and a price from the sheet, for a new task and an upgrade', () => {
        const oven = { roomId: 'kitchen-1', task: 'oven-interior', options: [] };
        const deep = { itemId: 'stove-1', options: ['deep-clean'] };
        expect(addOnName(SHEET, form, oven)).toBe('Oven interior');
        expect(addOnName(SHEET, form, deep)).toBe('Stovetop: Deep clean');
        expect(priceOf(SHEET, form, oven).cents).toBeGreaterThan(0);
        expect(priceOf(SHEET, form, deep).cents).toBeGreaterThan(0);
        expect(priceOf(null, form, oven)).toEqual({ error: 'no-sheet' });
        expect(roomOf(form, oven)).toBe('kitchen-1');
        expect(roomOf(form, deep)).toBe('kitchen-1');
        expect(roomOf(form, { itemId: 'gone', options: ['x'] })).toBeNull();
        expect(waitingCount([{ status: 'waiting' }, { status: 'approved' }, { status: 'waiting' }])).toBe(2);
        expect(waitingCount(null)).toBe(0);
    });

    test('a proposal and a decision made safe', () => {
        const id = 'A'.repeat(22);
        expect(cleanProposal({ format: ADDON_FORMAT, id, roomId: 'r', task: 't', options: [], words: `  ${'w'.repeat(200)} ` }).words).toHaveLength(WORDS_MAX);
        expect(cleanProposal({ format: 2, id, roomId: 'r', task: 't' })).toBeNull();
        expect(cleanDecision({ format: ADDON_FORMAT, id, status: 'approved', decidedAt: 'then' }, id)).toEqual({ format: ADDON_FORMAT, id, status: 'approved', decidedAt: 'then' });
        expect(cleanDecision({ format: ADDON_FORMAT, id, status: 'maybe' }, id)).toBeNull();
        expect(cleanDecision({ format: ADDON_FORMAT, id, status: 'declined' }, 'B'.repeat(22))).toBeNull();
    });

    /** A checklist reserved and published on the stand-in, opened by the
     *  cleaner with its PIN, and an add-on proposed. */
    async function proposed() {
        const standin = createStandin({ backend: createMemoryBackend(), config: CONFIG, schedule: SCHEDULE, now: () => Date.parse('2026-10-14T16:00:00Z') });
        const api = createApi((req) => standin.handle(req));
        const sealer = createSealer();
        const r = (await api.reserve()).data;
        expect((await api.putChecklist(r.id, r.ownerToken, new Uint8Array([1]))).ok).toBe(true);
        expect((await api.book(r.id, r.ownerToken, { date: '2026-10-16', time: '09:00', minutes: 60 })).ok).toBe(true);
        const visitToken = (await api.open(r.id, r.pin)).data.visitToken;
        const key = await sealer.importKey(KEY);
        const p = await proposeAddOn({ api, sealer, key, id: r.id, token: visitToken, addOn: { roomId: 'kitchen-1', task: 'oven-interior', options: [] }, words: 'Spill' });
        expect(p.ok).toBe(true);
        return { api, sealer, key, id: r.id, owner: r.ownerToken, visitToken, visitId: p.visitId, addonId: p.addOn.id };
    }

    test('the customer sees every open visit\'s add-ons, and answers once', async () => {
        const w = await proposed();
        const open = await openAddOns({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.owner });
        expect(open.ok).toBe(true);
        expect(open.addOns).toEqual([expect.objectContaining({ id: w.addonId, visitId: w.visitId, task: 'oven-interior', words: 'Spill', status: 'waiting' })]);
        // Only the owner lists visits.
        expect((await openAddOns({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.visitToken })).error).toBe('denied');
        const at = '2026-10-14T17:00:00.000Z';
        const d = await decideAddOn({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.owner, visitId: w.visitId, addonId: w.addonId, status: 'approved', at });
        expect(d).toEqual({ ok: true, error: null, decision: { format: ADDON_FORMAT, id: w.addonId, status: 'approved', decidedAt: at } });
        // The cleaner reads it, sealed under the decision's own context.
        const seen = await fetchAddOns({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.visitToken, visitId: w.visitId });
        expect(seen.addOns[0]).toMatchObject({ status: 'approved', decidedAt: at });
        // Once only, and only approved or declined.
        expect((await decideAddOn({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.owner, visitId: w.visitId, addonId: w.addonId, status: 'declined', at })).error).toBe('decided');
        expect((await decideAddOn({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.owner, visitId: w.visitId, addonId: w.addonId, status: 'maybe', at })).error).toBe('bad-request');
        expect((await decideAddOn({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.owner, visitId: 'short', addonId: w.addonId, status: 'approved', at })).error).toBe('bad-request');
        // A cleaner cannot decide.
        const other = await proposeAddOn({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.visitToken, visitId: w.visitId, addOn: { roomId: 'kitchen-1', task: 'microwave', options: [] } });
        expect((await decideAddOn({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.visitToken, visitId: w.visitId, addonId: other.addOn.id, status: 'approved', at })).error).toBe('denied');
    });

    test('a visit with a report is no longer open; a list that fails says why', async () => {
        const w = await proposed();
        const listed = (visits) => ({
            ...w.api,
            listVisits: async () => ({ ok: true, data: { visits } }),
            listAddOns: w.api.listAddOns
        });
        const done = await openAddOns({ api: listed([{ visitId: w.visitId, reportAt: '2026-10-14T18:00:00.000Z' }]), sealer: w.sealer, key: w.key, id: w.id, token: w.owner });
        expect(done).toEqual({ ok: true, addOns: [], error: null });
        const junk = await openAddOns({ api: listed([null, { visitId: 'nope' }]), sealer: w.sealer, key: w.key, id: w.id, token: w.owner });
        expect(junk.addOns).toEqual([]);
        const failing = { ...listed([{ visitId: w.visitId, reportAt: null }]), listAddOns: async () => ({ ok: false, error: 'offline' }) };
        expect(await openAddOns({ api: failing, sealer: w.sealer, key: w.key, id: w.id, token: w.owner })).toEqual({ ok: false, addOns: [], error: 'offline' });
    });

    test('an add-on that will not open is left out, and a decision under another\'s context is not read', async () => {
        const w = await proposed();
        const wrongKey = await w.sealer.importKey('B'.repeat(43));
        expect((await fetchAddOns({ api: w.api, sealer: w.sealer, key: wrongKey, id: w.id, token: w.owner, visitId: w.visitId })).addOns).toEqual([]);
        // A decision sealed for another add-on is refused by its context.
        const sealed = await w.sealer.sealJson(w.key, { format: ADDON_FORMAT, id: w.addonId, status: 'approved' }, contextFor(w.id, 'decision', 'C'.repeat(22)));
        expect((await w.api.decideAddOn(w.id, w.owner, w.visitId, w.addonId, sealed)).ok).toBe(true);
        expect((await fetchAddOns({ api: w.api, sealer: w.sealer, key: w.key, id: w.id, token: w.owner, visitId: w.visitId })).addOns).toEqual([]);
        expect(toBase64url(new Uint8Array([1]))).toBe('AQ');
    });
});

// ---- guide.js: Maya asks --------------------------------------------------------------

describe('Maya asks about an add-on (guide.js)', () => {
    const at = (scene, extra = {}) => ({ scene, back: null, resume: null, reached: 4, ...extra });
    const ask = (g, extra = {}) => step(g, { type: 'proposal', addonId: 'a1', ...extra });

    test('of her own accord where she is free to, never in the build, the example, the greeting or while away', () => {
        for (const scene of ['done', 'welcome', 'hint']) {
            expect(ask(at(scene))).toMatchObject({ scene: 'addOn', addonId: 'a1', minimized: false });
        }
        for (const scene of ['rooms', 'review', 'floors', 'example2', 'hello']) {
            const g = at(scene);
            expect(ask(g)).toBe(g);
        }
        const away = at('done', { away: { to: 'receipt', was: null } });
        expect(ask(away)).toBe(away);
        // Without an add-on, nothing.
        expect(step(at('done'), { type: 'proposal' }).scene).toBe('done');
    });

    test('asked (a tap on it) from the build too, but never the example or the greeting', () => {
        expect(ask(at('rooms'), { asked: true })).toMatchObject({ scene: 'addOn', back: 'rooms' });
        expect(ask(at('done', { away: { to: 'receipt' } }), { asked: true }).scene).toBe('addOn');
        expect(ask(at('example3'), { asked: true }).scene).toBe('example3');
        expect(ask(at('hello'), { asked: true }).scene).toBe('hello');
    });

    test('a second add-on keeps where she came from; a hint is passed over; the same one is no change', () => {
        const first = ask(at('rooms'), { asked: true });
        const second = step(first, { type: 'proposal', addonId: 'a2' });
        expect(second).toMatchObject({ scene: 'addOn', addonId: 'a2', back: 'rooms' });
        expect(step(second, { type: 'proposal', addonId: 'a2' })).toBe(second);
        expect(ask(at('hint', { back: 'welcome' })).back).toBe('welcome');
    });

    test('answered: back into the build or a welcome that resumes it; else standing by with what came of it', () => {
        const fromRooms = ask(at('rooms'), { asked: true });
        expect(step(fromRooms, { type: 'decided', status: 'approved' })).toMatchObject({ scene: 'rooms', addonId: null, back: null });
        const resume = ask(at('welcome', { resume: 'rooms' }));
        expect(step(resume, { type: 'decided', status: 'declined' })).toMatchObject({ scene: 'welcome', resume: 'rooms' });
        for (const scene of ['done', 'welcome']) {
            expect(step(ask(at(scene)), { type: 'decided', status: 'declined' })).toMatchObject({ scene: 'done', outcome: 'declined', minimized: false, away: null });
        }
        expect(step(ask(at('done')), { type: 'decided', status: 'gone' }).outcome).toBeNull();
        // Only from the asking.
        const g = at('done');
        expect(step(g, { type: 'decided', status: 'approved' })).toBe(g);
        expect(CHANGED).toEqual(expect.arrayContaining(['approved', 'declined']));
    });

    test('the bubble: her words, Approve and Decline, the promise in small print, no Back', () => {
        const v = viewFor(ask(at('done')), { addOn: { text: 'Your cleaner would like to add something.' } });
        expect(v.text).toBe('Your cleaner would like to add something.');
        expect(v.buttons).toEqual([{ id: 'approve', label: GUIDE.approve, primary: true }, { id: 'decline', label: GUIDE.decline, primary: false }]);
        expect(v.small).toBe(GUIDE.addOnPromise);
        expect(v.again).toBe(GUIDE.addOnAgain);
        expect(v.stepBack).toBe(false);
        expect(viewFor(ask(at('done'))).text).toBe(GUIDE.addOnPlain);
    });

    test('with more than one waiting, the whole list a tap away', () => {
        const v = viewFor(ask(at('done')), { addOn: { text: 'x', waiting: 2 } });
        expect(v.buttons.map((b) => b.id)).toEqual(['approve', 'decline', 'allAddOns']);
        expect(v.buttons[2]).toEqual({ id: 'allAddOns', label: GUIDE.seeAllAddOns(2), primary: false });
        expect(viewFor(ask(at('done')), { addOn: { text: 'x', waiting: 1 } }).buttons.map((b) => b.id)).toEqual(['approve', 'decline']);
    });

    test('saved as the scene beneath it, so a reload mid-build still resumes', () => {
        expect(savedForm(ask(at('rooms'), { asked: true })).scene).toBe('rooms');
        expect(savedForm(ask(at('welcome', { resume: 'review' }))).scene).toBe('review');
        expect(savedForm(ask(at('done'))).scene).toBe('done');
    });
});

// ---- The studio -------------------------------------------------------------------------

let dom;
/** The real setImmediate, kept before the fake timers stand in for it. */
const REAL_IMMEDIATE = globalThis.setImmediate;

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

/** Wait for an answer that crosses the stand-in (its PIN is stretched on a
 *  real thread), turning the real event loop while the clock stays pinned. */
async function until(test) {
    for (let i = 0; i < 3000 && !(await test()); i++) await new Promise((r) => REAL_IMMEDIATE(r));
    return test();
}

const line = () => dom.el('host-line').textContent;
const buttons = () => dom.el('host-actions').children.map((b) => b.textContent);
const press = (id) => fire(dom.el('host-actions').children.find((b) => b.id === `host-${id}`), 'click');
const fact = (key) => dom.el('host-facts').children.find((b) => b.id === `host-fact-${key}`);
const factValue = (key) => (fact(key) ? fact(key).children[1].textContent : undefined);
/** The add-ons card's rows, waiting and answered, and a row's button. */
const rowsIn = (id) => {
    const section = dom.el('addons-body').children.find((c) => c.id === id);
    return section ? section.children[1].children : [];
};
const waitingRows = () => rowsIn('addons-waiting');
const answeredRows = () => rowsIn('addons-answered');
const listButton = (kind, i) => waitingRows()[i].children.at(-1).children[kind === 'approve' ? 0 : 1];

/** The studio with a kitchen published and booked, Maya standing by, and
 *  the cleaner's side: the PIN opened, the key, and a way to propose. */
async function bookedStudio() {
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
    await t.openBooking();
    expect((await t.confirmBooking()).ok).toBe(true);
    fire(dom.el('receipt-done'), 'click');
    t.ui.guide = { ...t.ui.guide, scene: 'done', minimized: false, away: null, outcome: null };
    t.showGuide();
    const svc = await t.connect();
    const pub = t.active().published;
    const key = await svc.sealer.importKey(pub.key);
    const visitToken = (await svc.api.open(pub.id, pub.pin)).data.visitToken;
    const c = t.active();
    const kitchen = c.rooms.find((r) => r.area === 'kitchen');
    const stove = c.items.find((i) => i.task === 'stovetop');
    let visitId = null;
    const cleaner = {
        async propose(addOn, words = '') {
            const p = await proposeAddOn({ api: svc.api, sealer: svc.sealer, key, id: pub.id, token: visitToken, visitId, addOn, words });
            if (!p.ok) throw new Error(p.error);
            visitId = p.visitId;
            return p.addOn;
        },
        async seen() {
            return (await fetchAddOns({ api: svc.api, sealer: svc.sealer, key, id: pub.id, token: visitToken, visitId })).addOns;
        }
    };
    return { main, t, svc, pub, key, c, kitchen, stove, cleaner, oven: { roomId: kitchen.id, task: 'oven-interior', options: [] } };
}

describe('the studio answers the cleaner (main.js)', () => {
    test('asked after every few seconds: Maya asks, with the room, the price and their words, and the room shown', async () => {
        const w = await bookedStudio();
        const select = jest.spyOn(w.t.model(), 'select');
        await w.cleaner.propose(w.oven, 'Baked-on grease from a spill');
        // The regular pace, not a call from the test.
        await jest.advanceTimersByTimeAsync(CONFIG.api.ownerPollSeconds * 1000 + 10);
        expect(await until(() => w.t.ui.guide.scene === 'addOn')).toBe(true);
        const price = priceOf(SHEET, w.c, w.oven);
        expect(line()).toBe(`Your cleaner would like to add something in the kitchen. Oven interior, for ${formatMoney(price.cents)} more, ${formatMinutes(price.minutes)}. They say, “Baked-on grease from a spill.” Shall they go ahead?`);
        expect(buttons()).toEqual([GUIDE.approve, GUIDE.decline]);
        expect(dom.el('host-small').textContent).toBe(GUIDE.addOnPromise);
        expect(factValue('addons')).toBe('1 waiting');
        expect(fact('addons').getAttribute('aria-label')).toBe(GUIDE.factAddOnsSpoken(1));
        // The kitchen's floor open and the kitchen outlined; no panel over her.
        expect(w.t.model().lifted).toBe('main');
        expect(select).toHaveBeenLastCalledWith({ roomId: w.kitchen.id, itemId: null });
        expect(dom.el('ws-panel').hidden).toBe(true);
    });

    test('Approve reaches the cleaner, and Maya says so and stands by; the house is whole again', async () => {
        const w = await bookedStudio();
        await w.cleaner.propose(w.oven);
        await w.t.pollVisits();
        press('approve');
        expect(await until(async () => (await w.cleaner.seen())[0].status === 'approved')).toBe(true);
        expect(await until(() => w.t.ui.guide.scene === 'done')).toBe(true);
        expect(w.t.ui.guide.outcome).toBe('approved');
        expect(line()).toBe(`${GUIDE.afterApproved('Oven interior')} ${GUIDE.whatNext}`);
        // Still at a glance, answered, until the visit's report.
        expect(factValue('addons')).toBe('1 answered');
        expect(fact('addons').getAttribute('aria-label')).toBe(GUIDE.factAnsweredSpoken(1));
        expect(w.t.model().lifted).toBeNull();
        // Asked again later, it is not asked again.
        await w.t.pollVisits();
        expect(w.t.ui.guide.scene).toBe('done');
    });

    test('Decline, for an upgrade: named by its task, and the next one asked at once', async () => {
        const w = await bookedStudio();
        const select = jest.spyOn(w.t.model(), 'select');
        const deep = await w.cleaner.propose({ itemId: w.stove.id, options: ['deep-clean'] });
        await w.cleaner.propose(w.oven);
        await w.t.pollVisits();
        // Two waiting (QA, 2026-10-15): how many, then the first.
        expect(line()).toMatch(/^Your cleaner would like to add 2 things\. The first is in the kitchen\. Stovetop: Deep clean, for \$\d+ more, about \d+ minutes\. Shall they go ahead\?$/);
        expect(buttons()).toEqual([GUIDE.approve, GUIDE.decline, GUIDE.seeAllAddOns(2)]);
        expect(select).toHaveBeenLastCalledWith({ roomId: w.kitchen.id, itemId: w.stove.id });
        expect(factValue('addons')).toBe('2 waiting');
        press('decline');
        expect(await until(() => w.t.ui.guide.addonId && w.t.ui.guide.addonId !== deep.id)).toBe(true);
        // The answer, then the next.
        expect(line()).toMatch(/^Declined: Stovetop: Deep clean\. The next one is in the kitchen\. Oven interior, for \$\d+ more,/);
        expect(buttons()).toEqual([GUIDE.approve, GUIDE.decline]);
        expect(factValue('addons')).toBe('1 waiting');
        expect((await w.cleaner.seen()).map((a) => a.status)).toEqual(['declined', 'waiting']);
        press('approve');
        expect(await until(() => w.t.ui.guide.scene === 'done')).toBe(true);
        expect(line()).toBe(`${GUIDE.afterApproved('Oven interior')} ${GUIDE.whatNext}`);
    });

    test('never over a card: the count at a glance waits, and she asks once it closes', async () => {
        const w = await bookedStudio();
        await w.t.openReceipt();
        expect(dom.el('receipt').hidden).toBe(false);
        await w.cleaner.propose(w.oven);
        await w.t.pollVisits();
        expect(w.t.ui.guide.scene).toBe('done');
        expect(factValue('addons')).toBe('1 waiting');
        fire(dom.el('receipt-done'), 'click');
        await w.t.pollVisits();
        expect(w.t.ui.guide.scene).toBe('addOn');
    });

    test('back from a card she sent the visitor to, she asks at once, without waiting to ask the API again', async () => {
        const w = await bookedStudio();
        w.t.onHostButton('visit');
        expect(await until(() => !dom.el('receipt').hidden)).toBe(true);
        await w.cleaner.propose(w.oven);
        await w.t.pollVisits();
        expect(w.t.ui.guide.away).toMatchObject({ to: 'receipt' });
        const list = jest.spyOn(w.svc.api, 'listVisits');
        fire(dom.el('receipt-done'), 'click');
        await flushAsync(5);
        expect(w.t.ui.guide).toMatchObject({ scene: 'addOn', back: 'done' });
        expect(list).not.toHaveBeenCalled();
    });

    test('never in the build of her own accord, but a tap on the count opens the list, and the build goes on', async () => {
        const w = await bookedStudio();
        w.t.onHostButton('editRooms');
        expect(w.t.ui.guide.scene).toBe('rooms');
        await w.cleaner.propose(w.oven);
        await w.t.pollVisits();
        expect(w.t.ui.guide.scene).toBe('rooms');
        fire(fact('addons'), 'click');
        expect(await until(() => !dom.el('addons').hidden)).toBe(true);
        expect(w.t.ui.guide.scene).toBe('rooms');
        fire(listButton('decline', 0), 'click');
        expect(await until(async () => (await w.cleaner.seen())[0].status === 'declined')).toBe(true);
        expect(await until(() => waitingRows().length === 0)).toBe(true);
        expect(w.t.ui.guide.scene).toBe('rooms');
        expect(dom.el('addons-status').textContent).toBe(GUIDE.afterDeclined('Oven interior'));
        expect(answeredRows().map((li) => li.children[2].textContent)).toEqual(['Declined']);
        expect(dom.el('addons-lead').textContent).toBe(ADDON_LIST.leadAnswered);
    });

    test('the list: every add-on, each priced, with their words, answered in place, the sum approved', async () => {
        const w = await bookedStudio();
        const deep = await w.cleaner.propose({ itemId: w.stove.id, options: ['deep-clean'] });
        const oven = await w.cleaner.propose(w.oven, 'Baked-on grease');
        await w.t.pollVisits();
        expect(w.t.ui.guide).toMatchObject({ scene: 'addOn', addonId: deep.id });
        press('allAddOns');
        expect(await until(() => !dom.el('addons').hidden)).toBe(true);
        expect(dom.el('addons-lead').textContent).toBe(ADDON_LIST.leadWaiting(2));
        const ovenPrice = priceOf(SHEET, w.c, w.oven);
        const deepPrice = priceOf(SHEET, w.c, { itemId: w.stove.id, options: ['deep-clean'] });
        const rows = waitingRows();
        expect(rows.map((li) => li.children[0].children.map((s) => s.textContent))).toEqual([
            ['Stovetop: Deep clean', formatMoney(deepPrice.cents)],
            ['Oven interior', formatMoney(ovenPrice.cents)]
        ]);
        expect(rows[1].children[1].textContent).toBe(`Kitchen, ${formatMinutes(ovenPrice.minutes)}`);
        expect(rows[1].children[2].textContent).toBe('“Baked-on grease”');
        expect(listButton('approve', 1).getAttribute('aria-label')).toBe(ADDON_LIST.approveLabel('Oven interior'));
        // The second answered in the list: Maya, asking about the first, keeps asking about it.
        fire(listButton('approve', 1), 'click');
        expect(await until(() => waitingRows().length === 1)).toBe(true);
        expect((await w.cleaner.seen()).find((a) => a.id === oven.id).status).toBe('approved');
        expect(w.t.ui.guide).toMatchObject({ scene: 'addOn', addonId: deep.id });
        expect(dom.el('addons-body').children.find((c) => c.id === 'addons-sum').textContent).toBe(ADDON_LIST.approvedSum(formatMoney(ovenPrice.cents)));
        // The first answered in the list: Maya, beneath, lets it go.
        fire(listButton('decline', 0), 'click');
        expect(await until(() => waitingRows().length === 0)).toBe(true);
        expect(w.t.ui.guide).toMatchObject({ scene: 'done', outcome: 'declined' });
        expect(answeredRows().map((li) => li.children[2].textContent)).toEqual(['Declined', 'Approved']);
        expect(factValue('addons')).toBe('2 answered');
        // Done closes it; a tap on the count opens it again, answered.
        fire(dom.el('addons-done'), 'click');
        expect(dom.el('addons').hidden).toBe(true);
        fire(fact('addons'), 'click');
        expect(await until(() => !dom.el('addons').hidden)).toBe(true);
        expect(waitingRows()).toHaveLength(0);
        // Nothing to answer twice.
        expect(await w.t.decide('approved', oven.id)).toBeNull();
    });

    test('the list keeps up with the cleaner: a new add-on appears while it is open', async () => {
        const w = await bookedStudio();
        await w.cleaner.propose(w.oven);
        await w.t.pollVisits();
        expect(await w.t.openAddOnList()).toBe(true);
        expect(waitingRows()).toHaveLength(1);
        await w.cleaner.propose({ itemId: w.stove.id, options: ['deep-clean'] });
        await w.t.pollVisits();
        expect(waitingRows()).toHaveLength(2);
        expect(dom.el('addons-lead').textContent).toBe(ADDON_LIST.leadWaiting(2));
    });

    test('no add-ons, no list', async () => {
        const w = await bookedStudio();
        await w.t.pollVisits();
        expect(fact('addons')).toBeUndefined();
        expect(await w.t.openAddOnList()).toBe(false);
        expect(dom.el('addons').hidden).toBe(true);
    });

    test('answered on another device: let go, saying what it was', async () => {
        const w = await bookedStudio();
        const a = await w.cleaner.propose(w.oven);
        await w.t.pollVisits();
        const visitId = w.t.visits.addOns[0].visitId;
        expect((await decideAddOn({ api: w.svc.api, sealer: w.svc.sealer, key: w.key, id: w.pub.id, token: w.pub.ownerToken, visitId, addonId: a.id, status: 'approved', at: 'x' })).ok).toBe(true);
        await w.t.pollVisits();
        expect(w.t.ui.guide).toMatchObject({ scene: 'done', outcome: 'approved' });
        expect(line()).toBe(`${GUIDE.afterApproved('Oven interior')} ${GUIDE.whatNext}`);
    });

    test('answered on another device while this one was answering: the other answer stands', async () => {
        const w = await bookedStudio();
        const a = await w.cleaner.propose(w.oven);
        await w.t.pollVisits();
        const visitId = w.t.visits.addOns[0].visitId;
        expect((await decideAddOn({ api: w.svc.api, sealer: w.svc.sealer, key: w.key, id: w.pub.id, token: w.pub.ownerToken, visitId, addonId: a.id, status: 'declined', at: 'x' })).ok).toBe(true);
        const r = await w.t.decide('approved');
        expect(r.error).toBe('decided');
        expect(w.t.ui.guide).toMatchObject({ scene: 'done', outcome: 'declined' });
        expect(line()).toBe(`${GUIDE.afterDeclined('Oven interior')} ${GUIDE.whatNext}`);
    });

    test('an answer that cannot be sent says so, and she keeps asking', async () => {
        const w = await bookedStudio();
        await w.cleaner.propose(w.oven);
        await w.t.pollVisits();
        const real = w.svc.api.decideAddOn;
        w.svc.api.decideAddOn = async () => ({ ok: false, error: 'offline' });
        expect((await w.t.decide('approved')).error).toBe('offline');
        expect(dom.el('toast-text').textContent).toBe(GUIDE.addOnOffline);
        w.svc.api.decideAddOn = async () => ({ ok: false, error: 'server' });
        await w.t.decide('approved');
        expect(dom.el('toast-text').textContent).toBe(GUIDE.addOnTrouble);
        expect(w.t.ui.guide.scene).toBe('addOn');
        w.svc.api.decideAddOn = real;
        expect((await w.t.decide('approved')).ok).toBe(true);
        // Nothing to answer, nothing sent.
        expect(await w.t.decide('approved')).toBeNull();
    });

    test('asked after only while published, in view and running', async () => {
        const w = await bookedStudio();
        const list = jest.spyOn(w.svc.api, 'listVisits');
        await jest.advanceTimersByTimeAsync(CONFIG.api.ownerPollSeconds * 1000 + 10);
        expect(await until(() => list.mock.calls.length >= 1)).toBe(true);
        const calls = list.mock.calls.length;
        // A hidden tab asks nothing.
        dom.documentStub.visibilityState = 'hidden';
        fire(dom.documentStub, 'visibilitychange');
        await jest.advanceTimersByTimeAsync(CONFIG.api.ownerPollSeconds * 3000);
        expect(list.mock.calls.length).toBe(calls);
        // Back in view, at once.
        dom.documentStub.visibilityState = 'visible';
        fire(dom.documentStub, 'visibilitychange');
        await jest.advanceTimersByTimeAsync(10);
        expect(await until(() => list.mock.calls.length > calls)).toBe(true);
        // A draft asks nothing.
        expect(await w.t.pollVisits()).toBe(true);
        w.t.mutate((d) => ({ doc: { ...d, checklists: d.checklists.map((c) => ({ ...c, published: null })) }, record: null, error: null }));
        expect(await w.t.pollVisits()).toBe(false);
        expect(w.t.offerAddOn({ asked: true })).toBe(false);
    });
});
