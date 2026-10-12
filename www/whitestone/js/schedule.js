// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * schedule.js - When a visit can be booked (PRD 10, PLANNING 5.5).
 *
 * Pure, given the schedule (built from Steve's spreadsheet into
 * data/schedule.json), the bookings already made, and `now`. The studio's
 * calendar runs it to draw open days and times, and a server will run the
 * very same file as the authority on bookings.
 *
 * ONE RULE, TWO QUESTIONS. `openStarts` lists the times a day offers, and
 * `checkBooking` says whether one requested time can be booked. The second
 * accepts exactly the times the first lists (a test holds this over every
 * start on many days), so the calendar never offers a time the booking would
 * refuse.
 *
 * Two modes:
 *   day  one visit per cleaner per date, so an overrun never makes a cleaner
 *        late for the next home (the launch setting)
 *   gap  any number of visits per cleaner, each at least `gapMinutes` clear
 *        of the next
 * A visit goes to the lowest-numbered cleaner who fits, so capacity grows
 * by raising `cleaners`.
 *
 * Everything is on the business's wall clock (zoned.js). Opening and closing
 * are wall times, and a visit must END by the closing INSTANT, so a day the
 * clocks change has its true length.
 */

import {
    isValidZone, isDate, isTime, minutesOf, timeOf, addDays, weekdayOf, daysBetween,
    toInstant, toWall, isRealWallTime, isoWithOffset, parseInstant, todayIn, WEEKDAYS
} from './zoned.min.js';

export const SCHEDULE_FORMAT = 1;
export const MODES = Object.freeze(['day', 'gap']);
const HOUR_MS = 3600000;
const MINUTE_MS = 60000;

// ---- Validation -------------------------------------------------------------

function isCount(n, min, max) {
    return Number.isInteger(n) && n >= min && n <= max;
}

/** Every problem with a schedule, as plain sentences. Empty means valid. */
export function validateSchedule(s) {
    const problems = [];
    const add = (where, what) => problems.push(`${where}: ${what}`);
    if (!s || typeof s !== 'object' || Array.isArray(s)) return ['the schedule is not an object'];

    if (s.format !== SCHEDULE_FORMAT) add('format', `must be ${SCHEDULE_FORMAT}`);
    if (!isValidZone(s.timezone)) add('timezone', `"${s.timezone}" is not a time zone such as America/Los_Angeles`);
    if (!isCount(s.cleaners, 1, 50)) add('cleaners', 'must be a whole number from 1 to 50');
    if (!MODES.includes(s.mode)) add('mode', 'must be day or gap');
    if (!isCount(s.gapMinutes, 0, 720)) add('gapMinutes', 'must be whole minutes from 0 to 720');
    if (!isCount(s.slotStepMinutes, 5, 60) || 60 % s.slotStepMinutes !== 0) {
        add('slotStepMinutes', 'must divide the hour evenly (5, 10, 15, 20, 30 or 60)');
    }
    if (!isCount(s.leadHours, 0, 720)) add('leadHours', 'must be whole hours from 0 to 720');
    if (!isCount(s.horizonDays, 1, 365)) add('horizonDays', 'must be whole days from 1 to 365');
    if (!isCount(s.cancelHours, 0, 720)) add('cancelHours', 'must be whole hours from 0 to 720');

    const span = (where, h) => {
        if (!isTime(h.open) || !isTime(h.close)) { add(where, 'open and close must be times such as 08:00'); return; }
        if (minutesOf(h.open) >= minutesOf(h.close)) add(where, 'must open before it closes');
    };

    const hours = s.hours && typeof s.hours === 'object' ? s.hours : null;
    if (!hours) add('hours', 'must give every weekday');
    else {
        for (const day of WEEKDAYS) {
            if (!(day in hours)) { add(`hours.${day}`, 'is missing (use null for closed)'); continue; }
            if (hours[day] === null) continue;
            if (!hours[day] || typeof hours[day] !== 'object') add(`hours.${day}`, 'open and close must be times such as 08:00');
            else span(`hours.${day}`, hours[day]);
        }
        for (const day of Object.keys(hours)) if (!WEEKDAYS.includes(day)) add(`hours.${day}`, 'is not a weekday');
        if (WEEKDAYS.every((d) => !hours[d])) add('hours', 'are closed every day of the week');
    }

    if (!Array.isArray(s.holidays)) add('holidays', 'must be a list');
    else {
        const seen = new Set();
        for (const h of s.holidays) {
            const where = `holiday ${h && h.date}`;
            if (!h || !isDate(h.date)) { add('holidays', `"${h && h.date}" is not a date such as 2026-12-25`); continue; }
            if (seen.has(h.date)) add(where, 'is listed twice');
            seen.add(h.date);
            if (typeof h.name !== 'string' || !h.name.trim() || h.name.length > 60) add(where, 'needs a name of 1 to 60 characters');
            const open = h.open === null || h.open === undefined;
            const close = h.close === null || h.close === undefined;
            if (open !== close) add(where, 'needs both open and close, or neither (closed all day)');
            else if (!open) span(where, h);
        }
    }
    return problems;
}

// ---- One day ----------------------------------------------------------------

/** The hours a date keeps: { open, close, holiday } or null if closed. A
 *  holiday with hours replaces the weekday's hours for that date. */
export function hoursOn(schedule, date) {
    const holiday = schedule.holidays.find((h) => h.date === date);
    if (holiday) return holiday.open ? { open: holiday.open, close: holiday.close, holiday: holiday.name } : null;
    const h = schedule.hours[weekdayOf(date)];
    return h ? { open: h.open, close: h.close, holiday: null } : null;
}

/**
 * Whether a date can take bookings at all:
 *   { status: 'closed' }                       a weekday it never opens
 *   { status: 'holiday', holiday }             closed for a holiday
 *   { status: 'too-soon', opens, closes }      not even its closing time
 *                                              clears the notice needed
 *   { status: 'too-far', opens, closes }       past the booking horizon
 *   { status: 'open', opens, closes, holiday } bookable, perhaps only its
 *                                              later starts (lead time)
 */
export function dayStatus(schedule, date, now) {
    const zone = schedule.timezone;
    const holiday = schedule.holidays.find((h) => h.date === date);
    const hours = hoursOn(schedule, date);
    if (!hours) return holiday ? { status: 'holiday', holiday: holiday.name } : { status: 'closed' };
    const span = { opens: hours.open, closes: hours.close, holiday: hours.holiday };
    if (daysBetween(todayIn(now, zone), date) > schedule.horizonDays) return { status: 'too-far', ...span };
    if (toInstant(date, hours.close, zone) < now + schedule.leadHours * HOUR_MS) return { status: 'too-soon', ...span };
    return { status: 'open', ...span };
}

// ---- Cleaners and bookings --------------------------------------------------

/** The bookings that block: parsed, and never a cancelled one. */
function live(bookings) {
    return (bookings || [])
        .filter((b) => b && b.status !== 'cancelled')
        .map((b) => ({ ...b, startMs: parseInstant(b.start), endMs: parseInstant(b.end) }))
        .filter((b) => b.startMs !== null && b.endMs !== null);
}

/**
 * Whether a new visit [start, end) fits beside one cleaner's existing
 * bookings. `day` mode: none of them on the same date (in the business
 * zone). `gap` mode: each is at least `gapMinutes` clear of it.
 */
export function fits(schedule, cleanerBookings, start, end) {
    if (schedule.mode === 'day') {
        const date = toWall(start, schedule.timezone).date;
        return cleanerBookings.every((b) => toWall(b.startMs, schedule.timezone).date !== date);
    }
    const gap = schedule.gapMinutes * MINUTE_MS;
    return cleanerBookings.every((b) => b.endMs + gap <= start || end + gap <= b.startMs);
}

/** The lowest-numbered cleaner free for [start, end), or null. */
export function assignCleaner(schedule, bookings, start, end) {
    const all = live(bookings);
    for (let c = 1; c <= schedule.cleaners; c++) {
        if (fits(schedule, all.filter((b) => b.cleaner === c), start, end)) return c;
    }
    return null;
}

// ---- Asking about times -----------------------------------------------------

/**
 * Whether one start time can be booked for a visit of `minutes`:
 *   { ok: true, cleaner, start, end }   (ISO with offset)
 *   { ok: false, error }  where error is one of
 *     bad-request  not a date, a time or a visit length
 *     closed / holiday / too-far        the day itself
 *     before-open  before the day's opening
 *     off-step     not one of the offered start times
 *     no-such-time a time the clocks skip, or repeat, that day
 *     too-soon     inside the notice needed
 *     after-close  the visit would run past closing
 *     taken        every cleaner is busy
 */
export function checkBooking(schedule, bookings, date, time, minutes, now) {
    if (!isDate(date) || !isTime(time) || !isCount(minutes, 1, 24 * 60)) return { ok: false, error: 'bad-request' };
    const zone = schedule.timezone;
    const day = dayStatus(schedule, date, now);
    if (day.status === 'closed' || day.status === 'holiday' || day.status === 'too-far') return { ok: false, error: day.status };

    const offset = minutesOf(time) - minutesOf(day.opens);
    if (offset < 0) return { ok: false, error: 'before-open' };
    if (offset % schedule.slotStepMinutes !== 0) return { ok: false, error: 'off-step' };
    if (!isRealWallTime(date, time, zone)) return { ok: false, error: 'no-such-time' };

    const start = toInstant(date, time, zone);
    if (start < now + schedule.leadHours * HOUR_MS) return { ok: false, error: 'too-soon' };
    const end = start + minutes * MINUTE_MS;
    if (end > toInstant(date, day.closes, zone)) return { ok: false, error: 'after-close' };

    const cleaner = assignCleaner(schedule, bookings, start, end);
    if (!cleaner) return { ok: false, error: 'taken' };
    return { ok: true, cleaner, start: isoWithOffset(start, zone), end: isoWithOffset(end, zone) };
}

/** Every start time a date offers for a visit of `minutes`, as 'HH:MM'. */
export function openStarts(schedule, bookings, date, minutes, now) {
    const day = dayStatus(schedule, date, now);
    if (day.status !== 'open' || !isCount(minutes, 1, 24 * 60)) return [];
    const out = [];
    for (let m = minutesOf(day.opens); m < minutesOf(day.closes); m += schedule.slotStepMinutes) {
        const time = timeOf(m);
        if (checkBooking(schedule, bookings, date, time, minutes, now).ok) out.push(time);
    }
    return out;
}

/**
 * A month for the calendar ('YYYY-MM'): one entry per date with its status,
 * how many starts it offers, and the first of them.
 */
export function monthView(schedule, bookings, month, minutes, now) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) return [];
    const days = [];
    for (let date = `${month}-01`; date.startsWith(month); date = addDays(date, 1)) {
        const day = dayStatus(schedule, date, now);
        const starts = day.status === 'open' ? openStarts(schedule, bookings, date, minutes, now) : [];
        days.push({
            date,
            weekday: weekdayOf(date),
            status: day.status === 'open' && !starts.length ? 'full' : day.status,
            holiday: day.holiday || null,
            starts: starts.length,
            first: starts[0] || null
        });
    }
    return days;
}

/** Whether a booking can still be changed or cancelled online: until
 *  `cancelHours` before it starts. */
export function canChange(schedule, booking, now) {
    const start = booking && parseInstant(booking.start);
    if (start === null || start === undefined) return false;
    return now <= start - schedule.cancelHours * HOUR_MS;
}
