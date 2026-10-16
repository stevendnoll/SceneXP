// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Cancelling a visit, both pages on one stand-in (QA, 2026-10-15):
 *   - the cleaner's first piece of work begins the visit, and from then on
 *     the studio neither moves nor cancels it, nor unshares the checklist
 *     (the receipt says why; a refusal the studio had not heard of yet is
 *     learned at once);
 *   - a visit cancelled before the cleaner begins reaches the cleaner's
 *     page within seconds, open or reopened: nothing to mark, and a new
 *     time brings the checklist back;
 *   - a checklist no longer shared says so on the cleaner's page.
 * The add-ons of a visit begun under another booking are left out by
 * report.js readVisits (whitestone-visit-report).
 *
 * The studio runs on the fake clock and its own timers; the cleaner's page
 * on timers held here and run by hand, as in its own suite.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import { GUIDE, TASKS_PAGE, BOOKING_ERRORS, HELP, CHANGES } from '../www/whitestone/js/copy.js';
import { dayLabel, clockLabel } from '../www/whitestone/js/booking.js';
import { createSealer } from '../www/whitestone/js/seal.js';
import { createMemoryBackend } from '../www/whitestone/js/photos.js';

const WS = join(process.cwd(), 'www', 'whitestone');
const REAL_IMMEDIATE = globalThis.setImmediate;
const FORM_POLL = CONFIG.api.checklistPollSeconds * 1000;

let dom;
beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    installThree();
    dom = installDom();
});
afterEach(() => {
    fire(dom.windowStub, 'pagehide');
    dom.uninstall();
    jest.useRealTimers();
    delete globalThis.fetch;
});

async function until(test) {
    for (let i = 0; i < 3000 && !(await test()); i++) await new Promise((r) => REAL_IMMEDIATE(r));
    return test();
}
function all(node, out = []) {
    for (const c of node.children || []) {
        out.push(c);
        all(c, out);
    }
    return out;
}

/** A kitchen booked in the studio, Maya standing by, and the cleaner's
 *  page open on it by its link and PIN. `reopen()` boots the cleaner's page
 *  again on the same device; `poll()` runs its checklist timer once. */
async function bothPages() {
    jest.setSystemTime(new Date('2026-10-14T16:00:00Z'));
    globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(WS, String(url)), 'utf8')) });
    for (const id of ['ws-host', 'ws-panel']) dom.el(id).hidden = true;
    const studio = await import('../www/whitestone/js/main.js');
    await flushAsync(20);
    await jest.advanceTimersByTimeAsync(CONFIG.loadingReveal + CONFIG.guide.delay * 1000 + 200);
    const s = studio.__test__;
    s.state.reducedMotion = true;
    s.onHostButton('start');
    s.onHostButton('kind-house');
    s.addRoomOf('kitchen', 'main');
    await s.openBooking();
    expect((await s.confirmBooking()).ok).toBe(true);
    const link = dom.el('receipt-link').value;
    const pin = dom.el('receipt-pin').textContent;
    fire(dom.el('receipt-done'), 'click');
    s.ui.guide = { ...s.ui.guide, scene: 'done', minimized: false, away: null, outcome: null };
    s.showGuide();
    const svc = await s.connect();
    const booked = { ...s.active().booking };

    globalThis.window.__whitestoneTasksTest = true;
    const tasks = await import('../www/whitestone/tasks/js/main.js');
    const timers = [];
    const view = dom.el('tasks-view');
    const env = {
        doc: globalThis.document, storage: globalThis.localStorage, history: { replaceState() {} },
        api: svc.api, sealer: createSealer(), now: () => Date.now(), cache: createMemoryBackend(),
        fetchJson: async (url) => JSON.parse(readFileSync(join(WS, 'tasks', url), 'utf8')),
        makeUrl: () => 'blob:test', setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: (n) => { if (timers[n - 1]) timers[n - 1].cleared = true; }
    };
    const boot = async () => {
        dom.el('pin-form').hidden = true;
        view.hidden = true;
        return tasks.boot({ ...env, href: link });
    };
    const page = await boot();
    dom.el('pin-input').value = pin;
    fire(dom.el('pin-form'), 'submit', { preventDefault() {} });
    await page.pending;
    expect(page.phase).toBe('open');
    const poll = async () => {
        const t = timers.find((x) => !x.cleared && !x.ran && x.ms === FORM_POLL);
        if (!t) return false;
        t.ran = true;
        await t.fn();
        return true;
    };
    return { s, svc, page, view, find: (id) => all(view).find((e) => e.id === id), timers, poll, reopen: boot, booked };
}

/** Yes on the confirm card that is open. */
const confirmYes = () => fire(dom.el('confirm-actions').children[1], 'click');
const toastText = () => dom.el('toast-text').textContent;
const fact = (key) => dom.el('host-facts').children.find((b) => b.id === `host-fact-${key}`);

describe('begun by the cleaner, the visit stays', () => {
    test('the first mark begins it, and the studio stops offering to move or cancel it', async () => {
        const w = await bothPages();
        // Opening it begins nothing: a cleaner may read it the night before.
        expect(w.page.visitId).toBeNull();
        const item = w.page.form.items[0];
        fire(w.find(`done-${item.id}`), 'click');
        expect(await until(() => Boolean(w.page.visitId))).toBe(true);
        expect(await w.s.pollVisits()).toBe(true);
        expect(w.s.visits.started).toMatchObject({ visitId: w.page.visitId });
        // At a glance, under way.
        expect(fact('visit').children[2].textContent).toBe(GUIDE.factUnderWay);
        // The receipt: no Change the time, no Cancel, no Unpublish, and why.
        await w.s.openReceipt();
        for (const id of ['receipt-reschedule', 'receipt-cancel-visit', 'receipt-unpublish']) expect(dom.el(id).hidden).toBe(true);
        expect(dom.el('receipt-locked').hidden).toBe(false);
        expect(dom.el('receipt-locked').textContent).toMatch(/^Your cleaner started this visit today at \d{1,2}:\d{2} (am|pm), so it can’t be moved or canceled now\.$/);
        fire(dom.el('receipt-done'), 'click');
        // Choose a time and Start over say so too.
        expect(await w.s.openBooking()).toBeNull();
        expect(toastText()).toBe(BOOKING_ERRORS.started);
        await w.s.confirmStartOver();
        expect(toastText()).toBe(HELP.resetStarted);
        expect(dom.el('confirm').hidden).toBe(true);
        // And the booking is as it was.
        expect(w.s.active().booking).toMatchObject({ date: w.booked.date, time: w.booked.time });
    });

    test('cancelled before the studio had heard: refused, said, and the receipt catches up at once', async () => {
        const w = await bothPages();
        fire(w.find(`done-${w.page.form.items[0].id}`), 'click');
        expect(await until(() => Boolean(w.page.visitId))).toBe(true);
        // The studio has not asked since, so it still offers Cancel.
        await w.s.openReceipt();
        expect(dom.el('receipt-cancel-visit').hidden).toBe(false);
        fire(dom.el('receipt-cancel-visit'), 'click');
        confirmYes();
        expect(await until(() => toastText() === BOOKING_ERRORS.started)).toBe(true);
        expect(await until(() => dom.el('receipt-cancel-visit').hidden)).toBe(true);
        expect(w.s.active().booking).toMatchObject({ date: w.booked.date, time: w.booked.time });
        // The cleaner's page carries on.
        expect(await w.poll()).toBe(true);
        expect(w.find('tasks-novisit')).toBeUndefined();
    });

    test('learned with the receipt open: it stops offering to move or cancel as it stands', async () => {
        const w = await bothPages();
        await w.s.openReceipt();
        expect(dom.el('receipt-cancel-visit').hidden).toBe(false);
        fire(w.find(`done-${w.page.form.items[0].id}`), 'click');
        expect(await until(() => Boolean(w.page.visitId))).toBe(true);
        await w.s.pollVisits();
        expect(dom.el('receipt-cancel-visit').hidden).toBe(true);
        expect(dom.el('receipt-reschedule').hidden).toBe(true);
    });

    test('changes sent once begun: a longer visit is refused, saying why; a shorter one keeps its booking', async () => {
        const w = await bothPages();
        fire(w.find(`done-${w.page.form.items[0].id}`), 'click');
        expect(await until(() => Boolean(w.page.visitId))).toBe(true);
        await w.s.pollVisits();
        const minutes = w.s.active().booking.minutes;
        // Longer: a bathroom more.
        w.s.addRoomOf('bathroom', 'main');
        // The quote moves, so it is asked first.
        w.s.sendChanges();
        expect(await until(() => !dom.el('confirm').hidden)).toBe(true);
        confirmYes();
        expect(await until(() => toastText() === CHANGES.startedLonger)).toBe(true);
        expect(await until(() => !w.s.state.sending)).toBe(true);
        expect(w.s.active().booking.minutes).toBe(minutes);
        // Shorter: the bathroom and most of the kitchen taken off again.
        const c = w.s.active();
        const bath = c.rooms.find((r) => r.area === 'bathroom' && !r.deletedAt);
        for (const i of c.items.filter((x) => !x.deletedAt && (x.roomId === bath.id || x !== c.items[0]))) w.s.removeTask(i.id);
        // (Asked first only if the quote moves: the visit minimum may hold it.)
        w.s.sendChanges();
        await until(() => !dom.el('confirm').hidden || toastText() === CHANGES.sent);
        if (!dom.el('confirm').hidden) confirmYes();
        expect(await until(() => toastText() === CHANGES.sent)).toBe(true);
        expect(w.s.active().booking.minutes).toBe(minutes);
    });

    test('a second phone, or a retry, joins the visit under way', async () => {
        const w = await bothPages();
        fire(w.find(`done-${w.page.form.items[0].id}`), 'click');
        expect(await until(() => Boolean(w.page.visitId))).toBe(true);
        const token = JSON.parse(localStorage.getItem('scenexp-whitestone-tasks-v1')).checklists[w.s.active().published.id].visitToken;
        const again = await w.svc.api.startVisit(w.s.active().published.id, token);
        expect(again.data.visitId).toBe(w.page.visitId);
    });
});

describe('cancelled before the cleaner begins', () => {
    test('the cleaner\'s page says so within seconds, with nothing to mark; reopened, still; a new time brings it back', async () => {
        const w = await bothPages();
        await w.s.openReceipt();
        fire(dom.el('receipt-cancel-visit'), 'click');
        confirmYes();
        expect(await until(() => !w.s.active().booking)).toBe(true);
        // Within the checklist's own pace, once the cancel has reached the API.
        expect(await until(async () => (await w.poll()) && Boolean(w.find('tasks-novisit')))).toBe(true);
        const box = w.find('tasks-novisit');
        expect(box).toBeDefined();
        expect(w.find('novisit-heading').textContent).toBe(TASKS_PAGE.canceledHeading);
        expect(box.children[1].textContent).toBe(TASKS_PAGE.canceledLine(dayLabel(w.booked.date), clockLabel(w.booked.time)));
        expect(w.find('novisit-heading').focused).toBe(true);
        expect(all(w.view).some((e) => /^done-/.test(e.id || ''))).toBe(false);
        expect(w.find('tasks-finish')).toBeUndefined();
        // Still asked after, for a new time.
        expect(w.timers.some((t) => !t.cleared && !t.ran && t.ms === FORM_POLL)).toBe(true);

        // Reopened on the same phone (the first tab closed): still
        // cancelled, with its old time.
        w.timers.forEach((t) => { t.cleared = true; });
        const again = await w.reopen();
        expect(again.phase).toBe('open');
        expect(w.find('novisit-heading').textContent).toBe(TASKS_PAGE.canceledHeading);
        expect(w.find('tasks-novisit').children[1].textContent).toBe(TASKS_PAGE.canceledLine(dayLabel(w.booked.date), clockLabel(w.booked.time)));

        // Booked again in the studio: the checklist is back, with its time.
        fire(dom.el('receipt-done'), 'click');
        await w.s.openBooking();
        expect((await w.s.confirmBooking()).ok).toBe(true);
        const now = w.s.active().booking;
        expect(await w.poll()).toBe(true);
        expect(w.find('tasks-novisit')).toBeUndefined();
        expect(all(w.view).find((e) => e.className === 'tasks-visit').textContent).toBe(TASKS_PAGE.visitLine(dayLabel(now.date), clockLabel(now.time)));
        // And the cleaner can begin.
        fire(w.find(`done-${again.form.items[0].id}`), 'click');
        expect(await until(() => Boolean(again.visitId))).toBe(true);
    });

    test('moved before the cleaner begins: the new time, said once', async () => {
        const w = await bothPages();
        await w.s.openBooking();
        const b = w.s.ui.booking;
        const day = b.days.find((d) => d.times.length && d.date !== w.booked.date);
        b.selected = day.date;
        b.time = day.times[0];
        expect((await w.s.confirmBooking()).ok).toBe(true);
        expect(await w.poll()).toBe(true);
        const notice = all(w.view).find((e) => e.className === 'tasks-notice');
        expect(notice.textContent).toBe(TASKS_PAGE.moved(dayLabel(day.date), clockLabel(day.times[0])));
        expect(all(w.view).find((e) => e.className === 'tasks-visit').textContent).toBe(TASKS_PAGE.visitLine(dayLabel(day.date), clockLabel(day.times[0])));
    });

    test('an add-on sent after the cancel shows the cancel, not an error', async () => {
        const w = await bothPages();
        const kitchen = w.page.form.rooms[0];
        await w.s.openReceipt();
        fire(dom.el('receipt-cancel-visit'), 'click');
        confirmYes();
        expect(await until(() => !w.s.active().booking)).toBe(true);
        fire(w.find(`propose-${kitchen.id}`), 'click');
        const select = w.find(`addon-choice-${kitchen.id}`);
        select.value = 'task:oven-interior';
        fire(select, 'change');
        fire(w.find(`addon-send-${kitchen.id}`), 'click');
        await w.page.pending;
        expect(w.find('novisit-heading').textContent).toBe(TASKS_PAGE.canceledHeading);
    });

    test('no longer shared: refused as an ended pass is (the API tells no more), the PIN asked again, the asking stopped', async () => {
        const w = await bothPages();
        await w.s.openReceipt();
        fire(dom.el('receipt-unpublish'), 'click');
        confirmYes();
        expect(await until(() => !w.s.active().published)).toBe(true);
        expect(await w.poll()).toBe(true);
        expect(w.page.phase).toBe('pin');
        expect(dom.el('pin-status').textContent).toBe(TASKS_PAGE.again);
        expect(w.view.hidden).toBe(true);
        expect(w.timers.some((t) => !t.cleared && !t.ran && t.ms === FORM_POLL)).toBe(false);
    });
});
