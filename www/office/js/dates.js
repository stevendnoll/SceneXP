// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * dates.js - Local wall-clock dates for the job search.
 *
 * Copied from Prospect City (branch `job`), where it was written and tested.
 *
 * EVERY DATE IN THE DOCUMENT IS A LOCAL STRING WITH NO ZONE. A `date` input
 * yields "2026-09-16" and a `datetime-local` input yields "2026-09-16T14:30",
 * and that is exactly what is stored. A job seeker's week is their local week,
 * an interview at 2pm is at 2pm, and none of it shifts when the laptop flies
 * somewhere else. Reading a record in a different zone from the one it was
 * written in is a problem for a later version, not this one.
 *
 * NOTHING HERE READS THE CLOCK. Every function that needs "now" is handed a
 * Date, so the week math is testable and the rest of the scene reads the clock
 * in exactly one place (main.js).
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n) {
    return String(n).padStart(2, '0');
}

/** Whether a Date holds a real moment. */
export function isValidDate(date) {
    return date instanceof Date && !Number.isNaN(date.getTime());
}

/**
 * Parse a local date or date-time string. Returns null for anything else,
 * including a well-formed string naming a day that does not exist, which the
 * round trip below catches (February 30th rolls to March 2nd and no longer
 * matches).
 */
export function parseLocal(text) {
    if (typeof text !== 'string') return null;
    let m = DATETIME_RE.exec(text);
    if (m) {
        const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
        return isValidDate(d) && formatDateTime(d) === text.slice(0, 16) ? d : null;
    }
    m = DATE_RE.exec(text);
    if (m) {
        const d = new Date(+m[1], +m[2] - 1, +m[3]);
        return isValidDate(d) && formatDate(d) === text ? d : null;
    }
    return null;
}

/** "YYYY-MM-DD" in local time. */
export function formatDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "YYYY-MM-DDTHH:mm" in local time, the shape a datetime-local input takes. */
export function formatDateTime(date) {
    return `${formatDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The same moment or the next one on a `step`-minute boundary, seconds
 * dropped. An event form opened at 2:01 PM offers 2:30 PM, not 2:01,
 * because nobody schedules an interview at 2:01 and the visitor who only
 * changes the date would otherwise keep the odd minute.
 */
export function ceilToMinutes(date, step = 30) {
    const minutes = date.getHours() * 60 + date.getMinutes();
    const rounded = Math.ceil(minutes / step) * step;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, rounded);
}

export function isDateString(text) {
    return parseLocal(text) !== null && DATE_RE.test(text);
}

export function isDateTimeString(text) {
    return parseLocal(text) !== null && DATETIME_RE.test(text);
}

/** Today's date string, from a Date handed in. */
export function today(now) {
    return formatDate(now);
}

/** Local midnight at the start of the given day. */
export function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** A new Date `n` days later, at the same local wall-clock time. */
export function addDays(date, n) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n,
        date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}

/**
 * Whole days from `a` to `b`, by calendar day rather than by 24-hour span, so
 * a clock change in between does not turn 21 days into 20.
 */
export function daysBetween(a, b) {
    return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

/**
 * Local midnight on the Monday that starts the given date's week. Weeks start
 * on Monday, which is when a job seeker's fresh start lands.
 */
export function weekStart(date) {
    const day = startOfDay(date);
    const offset = (day.getDay() + 6) % 7;   // Monday 0 ... Sunday 6
    return addDays(day, -offset);
}

/**
 * A key naming the week a date falls in, as the Monday's date string. Two
 * dates share a key exactly when they share a week, which is all the counters
 * need from it.
 */
export function weekKey(date) {
    return formatDate(weekStart(date));
}

/** "YYYY-MM" for the month a date falls in. */
export function monthKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

// ---- For the eye ------------------------------------------------------------

const DISPLAY_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const DISPLAY_DATETIME = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
});

/** "Sep 17, 2026" from a stored date string, or empty for anything else. */
export function displayDate(text) {
    const d = parseLocal(text);
    return d ? DISPLAY_DATE.format(d) : '';
}

/** "Sep 17, 2026, 2:00 PM" from a stored date-time string, or empty. */
export function displayDateTime(text) {
    const d = parseLocal(text);
    return d ? DISPLAY_DATETIME.format(d) : '';
}
