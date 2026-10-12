// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * zoned.js - Wall-clock time in the business's time zone (PLANNING 5.6).
 *
 * A booking is an appointment on a wall clock, "9:00 am Tuesday in
 * Pacific time", wherever the customer's own computer happens to be. So every
 * schedule rule works in the business zone, and every moment is stored as an
 * ISO date-time WITH ITS OFFSET (2026-11-03T09:00:00-08:00), which names the
 * same instant everywhere and still reads as the time on the wall.
 *
 * NO LIBRARIES. The zone rules come from the browser's own Intl data (and
 * Node's full ICU, the default since Node 13).
 *
 * THE CLOCK CHANGES ARE THE TRAP, and both are decided here, once:
 *   - A wall time the spring change skips (2:30 am on 2026-03-08 in Pacific
 *     time never happens) moves forward by the gap, to 3:30 am, as a clock
 *     would.
 *   - A wall time the fall change repeats (1:30 am on 2026-11-01 happens
 *     twice) means the first one, before the clocks go back.
 * `isRealWallTime` says whether a wall time exists exactly once, so the
 * schedule can refuse to offer one that does not.
 *
 * Dates are 'YYYY-MM-DD' and times 'HH:MM' (24-hour), as strings. Instants
 * are milliseconds since the epoch.
 *
 * Pure.
 */

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const WEEKDAYS = Object.freeze(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);
const DAY_MS = 86400000;

const formatters = new Map();

/** One reused formatter per zone: building one is the slow part. */
function formatterFor(zone) {
    let f = formatters.get(zone);
    if (!f) {
        f = new Intl.DateTimeFormat('en-US', {
            timeZone: zone,
            hourCycle: 'h23',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        formatters.set(zone, f);
    }
    return f;
}

/** Whether `zone` is a time zone this browser knows (an IANA name). */
export function isValidZone(zone) {
    if (typeof zone !== 'string' || !zone) return false;
    try {
        formatterFor(zone);
        return true;
    } catch (e) {
        return false;
    }
}

export function isDate(text) {
    const m = DATE.exec(String(text));
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function isTime(text) {
    return TIME.test(String(text));
}

/** 'HH:MM' as minutes after midnight. */
export function minutesOf(time) {
    const m = TIME.exec(String(time));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minutes after midnight as 'HH:MM'. */
export function timeOf(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** The calendar date `n` days after `date`. */
export function addDays(date, n) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

/** 'monday' through 'sunday'. */
export function weekdayOf(date) {
    const [y, m, d] = date.split('-').map(Number);
    return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Whole days from `a` to `b` (negative if b is earlier). */
export function daysBetween(a, b) {
    const ms = (date) => { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((ms(b) - ms(a)) / DAY_MS);
}

/** What the wall clock says at an instant: { date, time, seconds, weekday }. */
export function toWall(instant, zone) {
    const parts = {};
    for (const p of formatterFor(zone).formatToParts(new Date(instant))) parts[p.type] = p.value;
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    return { date, time: `${parts.hour}:${parts.minute}`, seconds: Number(parts.second), weekday: weekdayOf(date) };
}

/** The zone's offset from UTC at an instant, in minutes (Pacific in
 *  winter is -480). */
export function offsetAt(instant, zone) {
    const w = toWall(instant, zone);
    const [y, m, d] = w.date.split('-').map(Number);
    const asUtc = Date.UTC(y, m - 1, d, ...w.time.split(':').map(Number), w.seconds);
    return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60000);
}

function wallAsUtc(date, time) {
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    return Date.UTC(y, m - 1, d, hh, mm);
}

/**
 * The instant a wall time names in a zone. A skipped time moves forward by
 * the gap, and a repeated time means the earlier one (see the top of this
 * file).
 */
export function toInstant(date, time, zone) {
    const naive = wallAsUtc(date, time);
    // The two offsets in play on either side of any change near this time.
    const before = offsetAt(naive - DAY_MS, zone);
    const after = offsetAt(naive + DAY_MS, zone);
    const candidates = [...new Set([before, after])]
        .map((offset) => naive - offset * 60000)
        .filter((t) => { const w = toWall(t, zone); return w.date === date && w.time === time; })
        .sort((a, b) => a - b);
    if (candidates.length) return candidates[0];
    // A time the clocks skip: read it on the old offset, which lands the
    // same distance past the change.
    return naive - before * 60000;
}

/** Whether a wall time happens exactly once in a zone on that date. */
export function isRealWallTime(date, time, zone) {
    if (!isDate(date) || !isTime(time)) return false;
    const naive = wallAsUtc(date, time);
    const offsets = new Set([offsetAt(naive - DAY_MS, zone), offsetAt(naive + DAY_MS, zone)]);
    const hits = [...offsets].filter((o) => {
        const w = toWall(naive - o * 60000, zone);
        return w.date === date && w.time === time;
    });
    return hits.length === 1;
}

/** An instant as an ISO date-time with the zone's offset at that moment:
 *  2026-11-03T09:00:00-08:00. */
export function isoWithOffset(instant, zone) {
    const w = toWall(instant, zone);
    const off = offsetAt(instant, zone);
    const sign = off < 0 ? '-' : '+';
    const abs = Math.abs(off);
    const hh = String(Math.floor(abs / 60)).padStart(2, '0');
    const mm = String(abs % 60).padStart(2, '0');
    return `${w.date}T${w.time}:${String(w.seconds).padStart(2, '0')}${sign}${hh}:${mm}`;
}

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** An ISO date-time that carries its offset, as an instant. null for
 *  anything else, including a date-time with no offset, which would be read
 *  in whatever zone the reader happens to be in. */
export function parseInstant(iso) {
    if (typeof iso !== 'string' || !ISO_WITH_OFFSET.test(iso)) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
}

/** Today's date on the business's wall clock. */
export function todayIn(instant, zone) {
    return toWall(instant, zone).date;
}
