// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The Choose a time card and the receipt drawn from their own source
 * (booking.js createBooking, receipt.js createReceipt and qrSvg), since the
 * page imports the built copies and a page test never reaches these lines
 * (".min imports hide coverage"): what each draws, what each button calls,
 * and the calendar file let go of when the receipt closes.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire } from './helpers/dom-stub.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import { BOOKING, RECEIPT } from '../www/whitestone/js/copy.js';

let dom;
beforeEach(() => {
    installThree();
    dom = installDom();
});
afterEach(() => dom.uninstall());

const DAYS = [
    { date: '2026-10-15', status: 'open', times: ['09:30', '10:00'] },
    { date: '2026-10-16', status: 'full', times: [] }
];

describe('the Choose a time card (booking.js)', () => {
    test('draws the month, the days, the chosen day\'s times, and calls back for each', async () => {
        const { createBooking } = await import('../www/whitestone/js/booking.js');
        const on = { month: jest.fn(), day: jest.fn(), time: jest.fn(), confirm: jest.fn() };
        const b = createBooking({ on });
        b.show({ month: '2026-10', days: DAYS, selected: '2026-10-15', time: null, minutes: 90, summary: 'Your visit', canPrev: false, canNext: true });
        expect(dom.el('booking-month').textContent).toBe('October 2026');
        expect(dom.el('booking-summary').textContent).toBe('Your visit');
        expect([dom.el('booking-prev').disabled, dom.el('booking-next').disabled]).toEqual([true, false]);
        const rows = dom.el('booking-days').children;
        expect(rows).toHaveLength(5);
        const cells = rows.flatMap((r) => r.children);
        const day = (date) => cells.find((c) => c.id === `booking-day-${date}`);
        expect(day('2026-10-15')).toMatchObject({ disabled: false, textContent: '15' });
        expect(day('2026-10-15').getAttribute('aria-pressed')).toBe('true');
        expect(day('2026-10-16').disabled).toBe(true);
        expect(cells.filter((c) => c.getAttribute && c.getAttribute('aria-hidden') === 'true')).toHaveLength(4);
        expect(dom.el('booking-day-title').textContent).toBe(BOOKING.startsOn('Thursday, October 15'));
        const times = dom.el('booking-times').children;
        expect(times.map((t) => [t.children[1].textContent, t.children[2].textContent, t.children[0].checked])).toEqual([
            ['9:30 am', BOOKING.until('11:00 am'), true], ['10:00 am', BOOKING.until('11:30 am'), false]
        ]);
        expect([dom.el('booking-confirm').disabled, dom.el('booking-confirm').textContent]).toEqual([false, BOOKING.confirm]);
        expect(dom.el('booking-status').hidden).toBe(true);
        expect(dom.el('booking-error').hidden).toBe(true);
        fire(dom.el('booking-next'), 'click');
        fire(dom.el('booking-prev'), 'click');
        expect(on.month.mock.calls).toEqual([[1], [-1]]);
        fire(day('2026-10-15'), 'click');
        expect(on.day).toHaveBeenCalledWith('2026-10-15');
        fire(times[1].children[0], 'change');
        expect(on.time).toHaveBeenCalledWith('10:00');
        fire(dom.el('booking-confirm'), 'click');
        expect(on.confirm).toHaveBeenCalled();
        // Focus goes to the chosen day.
        expect(b.focusDay()).toBe(day('2026-10-15'));
    });

    test('loading, a month with nothing, an error, and the button while booking', async () => {
        const { createBooking } = await import('../www/whitestone/js/booking.js');
        const b = createBooking();
        b.show({ month: '2026-10', days: [], selected: null, minutes: 60, loading: true });
        expect(dom.el('booking-status').textContent).toBe(BOOKING.loading);
        expect(dom.el('booking-times').hidden).toBe(true);
        expect(dom.el('booking-confirm').disabled).toBe(true);
        expect(b.focusDay()).toBeNull();
        b.show({ month: '2026-10', days: DAYS, selected: null, minutes: 60 });
        expect(dom.el('booking-status').hidden).toBe(true);
        expect(b.focusDay().id).toBe('booking-day-2026-10-15');
        b.show({ month: '2026-10', days: [DAYS[1]], selected: null, minutes: 60 });
        expect(dom.el('booking-status').textContent).toBe(BOOKING.noneThisMonth);
        b.show({ month: '2026-10', days: DAYS, selected: '2026-10-15', minutes: 60, busy: true, error: 'Oops.' });
        expect([dom.el('booking-confirm').disabled, dom.el('booking-confirm').textContent]).toEqual([true, BOOKING.working]);
        expect([dom.el('booking-error').hidden, dom.el('booking-error').textContent]).toEqual([false, 'Oops.']);
    });
});

describe('the receipt (receipt.js)', () => {
    const VIEW = {
        when: 'Thursday, October 15, 9:30 am to about 11:00 am', quote: '$120 for about 1 hr 30 min',
        link: 'http://localhost:8000/whitestone/tasks/?c=AbCdEfGhIjKlMnOpQrStUv#k=0123456789abcdefghijklmnopqrstuvwxyzABCDEFG',
        edit: 'http://localhost:8000/whitestone/?edit=x', pin: '012345', expires: 'Kept until then.',
        ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', icsName: 'whitestone-visit-2026-10-15.ics', standin: true
    };

    test('fills every line, draws the QR code, offers the calendar file, and lets it go', async () => {
        const { createReceipt } = await import('../www/whitestone/js/receipt.js');
        const made = [];
        const revoked = [];
        const realCreate = URL.createObjectURL;
        const realRevoke = URL.revokeObjectURL;
        URL.createObjectURL = (blob) => { made.push(blob); return `blob:test/${made.length}`; };
        URL.revokeObjectURL = (u) => revoked.push(u);
        try {
            const on = { copy: jest.fn(), share: jest.fn(), done: jest.fn() };
            const r = createReceipt({ on });
            r.show(VIEW);
            expect(dom.el('receipt-when').textContent).toBe(VIEW.when);
            expect(dom.el('receipt-quote').textContent).toBe(VIEW.quote);
            expect(dom.el('receipt-pin').textContent).toBe('012345');
            expect(dom.el('receipt-link').value).toBe(VIEW.link);
            expect(dom.el('receipt-edit-link').value).toBe(VIEW.edit);
            expect([dom.el('receipt-standin').hidden, dom.el('receipt-standin').textContent]).toEqual([false, RECEIPT.standin]);
            const svg = dom.el('receipt-qr-box').children[0];
            expect(svg.children.map((c) => c.tagName ? c.tagName.toLowerCase() : c.tag)).toHaveLength(2);
            expect(svg.children[1].getAttribute('d')).toMatch(/^M\d+ \d+h\d+/);
            expect(dom.el('receipt-calendar').getAttribute('href')).toBe('blob:test/1');
            expect(dom.el('receipt-calendar').getAttribute('download')).toBe(VIEW.icsName);
            // Shown again, the old file is let go of first.
            r.show({ ...VIEW, standin: false });
            expect(revoked).toEqual(['blob:test/1']);
            expect(dom.el('receipt-standin').hidden).toBe(true);
            r.release();
            expect(revoked).toEqual(['blob:test/1', 'blob:test/2']);
            for (const [id, args] of [['receipt-copy-link', ['link']], ['receipt-copy-pin', ['pin']], ['receipt-copy-edit', ['edit']]]) {
                fire(dom.el(id), 'click');
                expect(on.copy).toHaveBeenLastCalledWith(...args, dom.el(id));
            }
            fire(dom.el('receipt-share'), 'click');
            expect(on.share).toHaveBeenCalledWith(dom.el('receipt-share'));
            fire(dom.el('receipt-done'), 'click');
            expect(on.done).toHaveBeenCalled();
        } finally {
            URL.createObjectURL = realCreate;
            URL.revokeObjectURL = realRevoke;
        }
        expect(CONFIG.api.mode).toBe('standin');
    });
});
