// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * booking.js - The Choose a time card (PRD 10.3, PLANNING 3.3): a month
 * calendar of the days a visit can be booked, the chosen day's open start
 * times with the earliest chosen, and Confirm.
 *
 * THE ANSWER COMES FROM THE API, THE WORDS FROM HERE. The days and their
 * times are the API's (`availability`, schedule.js underneath, whoever
 * answers), so the card never offers a time the booking would refuse. What
 * this file adds is how they read: "Friday, October 16", "8:00 am to 10:30
 * am", a day that cannot be chosen saying why.
 *
 * `calendarView`, `timesView` and the labels are pure. `createBooking`
 * draws them into index.html's #booking card and calls back into main.js.
 * Every time is the business's wall clock (America/Los_Angeles), which is
 * what the customer reads on the receipt too.
 */

import { h, clear } from './cards.min.js';
import { BOOKING, DAY_STATUS } from './copy.min.js';
import { WEEKDAYS, addDays, minutesOf, timeOf, weekdayOf } from './zoned.min.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** '14:30' as '2:30 pm'; '12:00' as '12:00 pm'. */
export function clockLabel(time) {
    const m = minutesOf(time);
    const hour = Math.floor(m / 60) % 24;
    const minute = String(m % 60).padStart(2, '0');
    return `${hour % 12 || 12}:${minute} ${hour < 12 ? 'am' : 'pm'}`;
}

/** '2026-10-16' as 'Friday, October 16'. */
export function dayLabel(date) {
    const [, mo, d] = date.split('-').map(Number);
    return `${cap(weekdayOf(date))}, ${MONTHS[mo - 1]} ${d}`;
}

/** '2026-10' as 'October 2026'. */
export function monthLabel(month) {
    const [y, mo] = month.split('-').map(Number);
    return `${MONTHS[mo - 1]} ${y}`;
}

/** The month before or after 'YYYY-MM'. */
export function shiftMonth(month, by) {
    const [y, mo] = month.split('-').map(Number);
    const n = y * 12 + (mo - 1) + by;
    return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
}

/** How long to book: the quote's minutes rounded up to the quarter hour,
 *  never under half an hour. */
export function visitMinutes(quoteMinutes) {
    return Math.max(30, Math.ceil(Math.max(0, quoteMinutes || 0) / 15) * 15);
}

/** When a visit of `minutes` from `time` ends, on the same wall clock. */
export function finishOf(time, minutes) {
    return timeOf(minutesOf(time) + minutes);
}

/**
 * The month as the calendar draws it, weeks from Sunday: `{ title, weeks }`,
 * each cell `{ date, day, status, open, selected, label }` or null for the
 * days before the 1st and after the last. `days` are the API's
 * (`availability`), `selected` the chosen date. When a booked visit is
 * moved: `until`, the last date it may move to (a quote is honored for 90
 * days, PRD 10.3), and `current`, the day it is on now, which says so
 * rather than "Fully booked" (the visit itself fills it).
 */
export function calendarView(month, days, selected = null, { until = null, current = null } = {}) {
    const byDate = new Map((days || []).map((d) => [d.date, d]));
    const first = `${month}-01`;
    const cells = Array.from({ length: WEEKDAYS.indexOf(weekdayOf(first)) }, () => null);
    for (let date = first; date.startsWith(month); date = addDays(date, 1)) {
        const listed = byDate.get(date) || { status: 'closed', times: [] };
        const d = until && date > until && listed.status === 'open' ? { status: 'beyond-quote', times: [] } : listed;
        const open = d.status === 'open' && (d.times || []).length > 0;
        let status = open ? 'open' : d.status;
        if (date === current && !open) status = 'yours';
        const why = open ? BOOKING.times((d.times || []).length)
            : status === 'yours' ? DAY_STATUS.yours
                : (d.status === 'holiday' && d.holiday ? BOOKING.holiday(d.holiday) : DAY_STATUS[d.status] || DAY_STATUS.closed);
        cells.push({
            date, day: Number(date.slice(8)), status, open, selected: date === selected,
            label: `${dayLabel(date)}, ${why}`
        });
    }
    while (cells.length % 7) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { title: monthLabel(month), weeks };
}

/** A day's start times, each with when the visit would end, `chosen`
 *  marked (else the earliest): `[{ time, label, until, selected }]`. */
export function timesView(day, minutes, chosen = null) {
    const times = (day && day.times) || [];
    const pick = times.includes(chosen) ? chosen : times[0];
    return times.map((time) => ({
        time, label: clockLabel(time), until: clockLabel(finishOf(time, minutes)), selected: time === pick
    }));
}

/** The first date in `days` that can be chosen (on or before `until`, if
 *  given), or null. */
export function firstOpen(days, until = null) {
    const d = (days || []).find((x) => x.status === 'open' && (x.times || []).length && !(until && x.date > until));
    return d ? d.date : null;
}

// ---- Drawing it ---------------------------------------------------------------------

/**
 * Drive the #booking card. `on` holds month(by), day(date), time(time) and
 * confirm(). `show({ month, days, selected, time, minutes, summary, error,
 * busy, canPrev, canNext, loading, title, confirmLabel, until, current })`
 * draws it.
 */
export function createBooking({ on = {}, signal } = {}) {
    const byId = (id) => document.getElementById(id);
    const call = (name, ...args) => { if (typeof on[name] === 'function') on[name](...args); };
    const prev = byId('booking-prev');
    const next = byId('booking-next');
    const confirm = byId('booking-confirm');
    if (prev) prev.addEventListener('click', () => call('month', -1), { signal });
    if (next) next.addEventListener('click', () => call('month', 1), { signal });
    if (confirm) confirm.addEventListener('click', () => call('confirm'), { signal });
    let dayButtons = [];

    function show(v) {
        // Choose a time, or Choose a new time when moving a booked visit.
        const heading = byId('booking-title');
        if (heading) heading.textContent = v.title || BOOKING.title;
        const title = byId('booking-month');
        if (title) title.textContent = monthLabel(v.month);
        const summary = byId('booking-summary');
        if (summary) summary.textContent = v.summary || '';
        if (prev) prev.disabled = !v.canPrev;
        if (next) next.disabled = !v.canNext;
        const grid = byId('booking-days');
        dayButtons = [];
        if (grid) {
            clear(grid);
            const cal = calendarView(v.month, v.days, v.selected, { until: v.until || null, current: v.current || null });
            for (const week of cal.weeks) {
                const row = h('div', { className: 'booking-week' });
                for (const cell of week) {
                    if (!cell) {
                        row.appendChild(h('span', { className: 'booking-day is-blank', attrs: { 'aria-hidden': 'true' } }));
                        continue;
                    }
                    const btn = h('button', {
                        type: 'button', id: `booking-day-${cell.date}`,
                        className: `booking-day is-${cell.status}${cell.selected ? ' is-selected' : ''}`,
                        text: String(cell.day),
                        attrs: { 'aria-label': cell.label, title: cell.label, 'aria-pressed': cell.selected ? 'true' : 'false' }
                    });
                    btn.disabled = !cell.open;
                    btn.addEventListener('click', () => call('day', cell.date), { signal });
                    dayButtons.push(btn);
                    row.appendChild(btn);
                }
                grid.appendChild(row);
            }
        }
        const status = byId('booking-status');
        if (status) {
            status.textContent = v.loading ? BOOKING.loading : (!firstOpen(v.days, v.until || null) ? BOOKING.noneThisMonth : '');
            status.hidden = !status.textContent;
        }
        const dayTitle = byId('booking-day-title');
        const day = (v.days || []).find((d) => d.date === v.selected && !(v.until && d.date > v.until)) || null;
        if (dayTitle) {
            dayTitle.textContent = day ? BOOKING.startsOn(dayLabel(day.date)) : '';
            dayTitle.hidden = !day;
        }
        const list = byId('booking-times');
        if (list) {
            clear(list);
            list.hidden = !day;
            for (const t of timesView(day, v.minutes, v.time)) {
                const id = `booking-time-${t.time.replace(':', '')}`;
                const input = h('input', { type: 'radio', name: 'booking-time', id, value: t.time });
                input.checked = t.selected;
                input.addEventListener('change', () => call('time', t.time), { signal });
                list.appendChild(h('label', { className: 'booking-time', attrs: { for: id } }, [
                    input, h('span', { className: 'booking-time-start', text: t.label }), h('span', { className: 'booking-time-until', text: BOOKING.until(t.until) })
                ]));
            }
        }
        const error = byId('booking-error');
        if (error) {
            error.textContent = v.error || '';
            error.hidden = !v.error;
        }
        if (confirm) {
            confirm.disabled = Boolean(v.busy) || !day || !(day.times || []).length;
            confirm.textContent = v.busy ? BOOKING.working : (v.confirmLabel || BOOKING.confirm);
        }
    }

    return {
        show,
        /** Focus on the chosen day, else the first that can be chosen. */
        focusDay() {
            const btn = dayButtons.find((b) => b.getAttribute('aria-pressed') === 'true') || dayButtons.find((b) => !b.disabled);
            if (btn && typeof btn.focus === 'function') btn.focus();
            return btn || null;
        }
    };
}
