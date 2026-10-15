// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The whole loop, both pages on one stand-in (M5 piece 4; TASKS M7's demo
 * script, steps 3 to 9): a home built and booked in the studio, opened on
 * the cleaner's page by its link and PIN, an add-on proposed there and
 * approved by Maya here, the tasks marked (one skipped), the visit
 * finished and sent, the report shown here with the house lit and the bill
 * under the quote plus the approved add-on, and the next visit booked,
 * which the cleaner's page takes as a new visit.
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
import { GUIDE, TASKS_PAGE } from '../www/whitestone/js/copy.js';
import { createSealer } from '../www/whitestone/js/seal.js';
import { createMemoryBackend } from '../www/whitestone/js/photos.js';
import { priceItem, priceAddOn, formatMoney } from '../www/whitestone/js/pricing.js';

const WS = join(process.cwd(), 'www', 'whitestone');
const index = JSON.parse(readFileSync(join(WS, 'data', 'prices', 'index.json'), 'utf8'));
const SHEET = JSON.parse(readFileSync(join(WS, 'data', 'prices', `${index.cleaning}.json`), 'utf8'));
const REAL_IMMEDIATE = globalThis.setImmediate;

let dom;
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
function all(node, out = []) {
    for (const c of node.children || []) {
        out.push(c);
        all(c, out);
    }
    return out;
}

test('the demo, end to end: book, open, propose, approve, mark, send, report, book again', async () => {
    // ---- The studio: a kitchen, booked (demo steps 3 to 5) ----
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
    const quote = s.active().quote.totalCents;

    // ---- The cleaner opens it with the link and the PIN (step 6) ----
    globalThis.window.__whitestoneTasksTest = true;
    const tasks = await import('../www/whitestone/tasks/js/main.js');
    const timers = [];
    const view = dom.el('tasks-view');
    const find = (id) => all(view).find((e) => e.id === id);
    dom.el('pin-form').hidden = true;
    view.hidden = true;
    const env = {
        doc: globalThis.document, storage: globalThis.localStorage, history: { replaceState() {} },
        api: svc.api, sealer: createSealer(), now: () => Date.now(), cache: createMemoryBackend(),
        fetchJson: async (url) => JSON.parse(readFileSync(join(WS, 'tasks', url), 'utf8')),
        makeUrl: () => 'blob:test', setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: (n) => { if (timers[n - 1]) timers[n - 1].cleared = true; }
    };
    const page = await tasks.boot({ ...env, href: link });
    dom.el('pin-input').value = pin;
    fire(dom.el('pin-form'), 'submit', { preventDefault() {} });
    await page.pending;
    expect(page.phase).toBe('open');
    const form = page.form;
    const kitchen = form.rooms[0];
    const stove = form.items.find((i) => i.task === 'stovetop');

    // ---- An add-on: proposed there, asked and approved here (step 7) ----
    fire(find(`propose-${kitchen.id}`), 'click');
    const select = find(`addon-choice-${kitchen.id}`);
    select.value = 'task:oven-interior';
    fire(select, 'change');
    find(`addon-words-${kitchen.id}`).value = 'Baked-on grease from a spill.';
    fire(find(`addon-send-${kitchen.id}`), 'click');
    await page.pending;
    await jest.advanceTimersByTimeAsync(CONFIG.api.ownerPollSeconds * 1000 + 10);
    expect(await until(() => s.ui.guide.scene === 'addOn')).toBe(true);
    expect(dom.el('host-line').textContent).toMatch(/^Your cleaner would like to add something in the kitchen\. Oven interior, for \$\d+ more/);
    fire(dom.el('host-actions').children.find((b) => b.id === 'host-approve'), 'click');
    expect(await until(() => s.ui.guide.scene === 'done')).toBe(true);
    // The cleaner's page asks again on its own pace, and it turns approved.
    const poll = timers.find((t) => !t.cleared && !t.ran);
    poll.ran = true;
    await poll.fn();
    const oven = page.addOns[0];
    expect(oven.status).toBe('approved');

    // ---- The visit: marked, one skipped, finished and sent (step 8) ----
    for (const item of form.items) fire(find(`done-${item.id}`), 'click');
    fire(find(`skip-${stove.id}`), 'click');
    fire(find(`reason-${stove.id}-no-time`), 'click');
    fire(find(`addon-done-${oven.id}`), 'click');
    fire(find('tasks-finish'), 'click');
    await page.polled;
    fire(find('report-send'), 'click');
    await page.reportSend;
    expect(find('report-title').textContent).toBe(TASKS_PAGE.sentTitle);

    // ---- The payoff: the report here, the house lit, the bill (step 9) ----
    const paint = jest.spyOn(s.model(), 'report');
    await jest.advanceTimersByTimeAsync(CONFIG.api.ownerPollSeconds * 1000 + 10);
    expect(await until(() => s.ui.guide.scene === 'report')).toBe(true);
    const ovenCents = priceAddOn(SHEET, oven, form.rooms, new Map()).cents;
    const billed = quote - priceItem(SHEET, stove, form.rooms).cents + ovenCents;
    expect(s.active().visits[0].bill).toMatchObject({ billedCents: billed, quoteCents: quote, addOnCents: ovenCents });
    expect(dom.el('host-line').textContent).toContain(GUIDE.reportBilled(formatMoney(billed), formatMoney(quote)));
    expect(paint.mock.calls[paint.mock.calls.length - 1][0].get(stove.id)).toBe('skipped');

    // ---- Book your next visit, and the cleaner's page starts afresh ----
    fire((dom.el('host-choices').children[0] || { children: [] }).children.find((b) => b.id === 'host-bookNext'), 'click');
    expect(await until(() => !dom.el('booking').hidden)).toBe(true);
    s.ui.booking.selected = '2026-10-20';
    expect((await s.confirmBooking()).ok).toBe(true);
    fire(dom.el('receipt-done'), 'click');
    expect(await until(() => s.ui.guide.outcome === 'booked')).toBe(true);
    const again = await tasks.boot({ ...env, href: link.split('#')[0] });
    expect(again.phase).toBe('open');
    expect(again.form.booking.date).not.toBe(form.booking.date);
    expect(find('tasks-finish')).toBeTruthy();
    expect(find(`done-${stove.id}`).getAttribute('aria-pressed')).toBe('false');
}, 30000);
