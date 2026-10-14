// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * receipt.js - The receipt (PRD 13.1): what publishing ends on. The
 * appointment with Add to calendar, the quote and its guarantee, the link
 * for the cleaner with Copy and Share, the PIN, a QR code of the link, when
 * the checklist expires, and the private edit link set apart.
 *
 * AFTERWARD IT IS WHERE THE VISIT IS CHANGED (PRD 10.4): changes not sent
 * yet come first, with Send my changes; Change the time and Cancel my visit
 * beside the appointment while the change window allows (after it, a line
 * says why they are gone); Choose a time once a visit is cancelled; and
 * Unpublish apart, by Done.
 *
 * `receiptView` is pure: every line from the checklist as published (its
 * `published`, `booking` and locked `quote`). `createReceipt` fills
 * index.html's #receipt card, the QR code drawn as one SVG path built with
 * createElementNS (qr.js), never markup from a string.
 */

import { clear } from './cards.min.js';
import { RECEIPT } from './copy.min.js';
import { buildShare, buildEdit } from './links.min.js';
import { formatMoney, formatMinutes, roundMinutes } from './pricing.min.js';
import { bookingIcs, icsFilename } from './ics.min.js';
import { toWall, parseInstant } from './zoned.min.js';
import { dayLabel, clockLabel, finishOf } from './booking.min.js';
import { qrMatrix, qrSvgPath } from './qr.min.js';
import { canChange } from './schedule.min.js';
import { hasUnsent } from './store.min.js';

const SVG = 'http://www.w3.org/2000/svg';
const QUIET = 4;

/**
 * Every line of the receipt, or null for a checklist not published.
 * `origin` is the site's (location.origin), `timezone` the business's, `now`
 * for the calendar file's stamp and the change window, `schedule` (the
 * built schedule.json) for that window: without it, changes are offered.
 */
export function receiptView(checklist, { origin, config, timezone, now, schedule = null }) {
    const pub = checklist && checklist.published;
    const booking = checklist && checklist.booking;
    if (!pub || !pub.at) return null;
    const quote = checklist.quote;
    const expires = parseInstant(pub.expiresAt);
    const changeable = !booking || !schedule || canChange(schedule, booking, now);
    return {
        booked: Boolean(booking),
        title: booking ? RECEIPT.title : RECEIPT.titlePublished,
        unsent: hasUnsent(checklist),
        changeable,
        locked: changeable ? '' : RECEIPT.locked(schedule.cancelHours),
        when: booking ? RECEIPT.when(dayLabel(booking.date), clockLabel(booking.time), clockLabel(finishOf(booking.time, booking.minutes))) : RECEIPT.noVisit,
        quote: quote ? RECEIPT.quote(formatMoney(quote.totalCents), formatMinutes(roundMinutes(quote.minutes))) : '',
        link: buildShare(origin, config, pub.id, pub.key),
        edit: buildEdit(origin, config, pub.id, pub.key, pub.ownerToken),
        pin: pub.pin || '',
        pinUnknown: !pub.pin,
        expires: expires === null ? '' : RECEIPT.expires(dayLabel(toWall(expires, timezone).date)),
        ics: booking ? bookingIcs({ id: pub.id, start: booking.start, end: booking.end }, now) : '',
        icsName: booking ? icsFilename(booking) : '',
        standin: config.api.mode === 'standin'
    };
}

/** The QR code of `text` as an <svg>, dark modules in one path. */
export function qrSvg(text) {
    const m = qrMatrix(text);
    const side = m.size + QUIET * 2;
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${side} ${side}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', RECEIPT.qrLabel);
    svg.setAttribute('shape-rendering', 'crispEdges');
    const back = document.createElementNS(SVG, 'rect');
    back.setAttribute('width', String(side));
    back.setAttribute('height', String(side));
    back.setAttribute('fill', '#FFFFFF');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', qrSvgPath(m, QUIET));
    path.setAttribute('fill', '#1F2124');
    svg.appendChild(back);
    svg.appendChild(path);
    return svg;
}

/**
 * Drive the #receipt card. `on` holds copy(what, button), share(button),
 * newPin(), send(), reschedule(), cancelVisit(), book(), unpublish() and
 * done(). `show(view)` fills it; `release()` lets go of the calendar file.
 */
export function createReceipt({ on = {}, signal } = {}) {
    const byId = (id) => document.getElementById(id);
    const call = (name, ...args) => { if (typeof on[name] === 'function') on[name](...args); };
    let fileUrl = null;
    const wire = (id, fn) => {
        const el = byId(id);
        if (el) el.addEventListener('click', () => fn(el), { signal });
    };
    wire('receipt-copy-link', (b) => call('copy', 'link', b));
    wire('receipt-copy-pin', (b) => call('copy', 'pin', b));
    wire('receipt-copy-edit', (b) => call('copy', 'edit', b));
    wire('receipt-share', (b) => call('share', b));
    wire('receipt-new-pin', () => call('newPin'));
    wire('receipt-send', () => call('send'));
    wire('receipt-reschedule', () => call('reschedule'));
    wire('receipt-cancel-visit', () => call('cancelVisit'));
    wire('receipt-book', () => call('book'));
    wire('receipt-unpublish', () => call('unpublish'));
    wire('receipt-done', () => call('done'));

    function release() {
        if (fileUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(fileUrl);
        fileUrl = null;
    }

    function show(v) {
        const text = (id, value) => { const el = byId(id); if (el) el.textContent = value; };
        const shown = (id, on) => { const el = byId(id); if (el) el.hidden = !on; };
        text('receipt-title', v.title);
        shown('receipt-unsent', v.unsent);
        text('receipt-when', v.when);
        shown('receipt-calendar', v.booked);
        shown('receipt-reschedule', v.booked && v.changeable);
        shown('receipt-cancel-visit', v.booked && v.changeable);
        shown('receipt-book', !v.booked);
        text('receipt-locked', v.locked);
        shown('receipt-locked', Boolean(v.locked));
        shown('receipt-unpublish', v.changeable);
        text('receipt-quote', v.quote);
        // A PIN this device never saw (opened by the edit link): a new one
        // can be set instead.
        text('receipt-pin', v.pinUnknown ? RECEIPT.pinUnknown : v.pin);
        const pinNote = byId('receipt-pin-note');
        if (pinNote) pinNote.textContent = v.pinUnknown ? RECEIPT.pinUnknownAdvice : RECEIPT.pinAdvice;
        const copyPin = byId('receipt-copy-pin');
        if (copyPin) copyPin.hidden = Boolean(v.pinUnknown);
        const newPin = byId('receipt-new-pin');
        if (newPin) newPin.hidden = !v.pinUnknown;
        text('receipt-expires', v.expires);
        const link = byId('receipt-link');
        if (link) link.value = v.link;
        const edit = byId('receipt-edit-link');
        if (edit) edit.value = v.edit;
        const box = byId('receipt-qr-box');
        if (box) {
            clear(box);
            box.appendChild(qrSvg(v.link));
        }
        const standin = byId('receipt-standin');
        if (standin) {
            standin.textContent = v.standin ? RECEIPT.standin : '';
            standin.hidden = !v.standin;
        }
        const cal = byId('receipt-calendar');
        release();
        if (cal && v.ics && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
            fileUrl = URL.createObjectURL(new Blob([v.ics], { type: 'text/calendar' }));
            cal.setAttribute('href', fileUrl);
            cal.setAttribute('download', v.icsName);
        }
    }

    return { show, release };
}
