// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * calendar.js - The wall calendar's month, and what falls on each day.
 *
 * Pure. The painted calendar on the wall and the calendar card both draw
 * from `monthGrid` and `agenda`, so the dots on the wall and the rows in the
 * card cannot disagree.
 *
 * Weeks start on Monday, like the weekly goal (dates.js).
 */

import { formatDate, addDays, weekStart, parseLocal } from './dates.min.js';
import { buildIndex } from './derive.min.js';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const LONG_DAY = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/** A month moved by `delta` months: `{ year, month }`, month 0 to 11. */
export function shiftMonth(year, month, delta) {
    const d = new Date(year, month + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
}

/**
 * The weeks that show a month, Monday first, including the days of the
 * months either side that fill the first and last week. Each day is
 * `{ key, day, inMonth }`.
 */
export function monthGrid(year, month) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    let day = weekStart(first);
    const weeks = [];
    while (day <= last) {
        const week = [];
        for (let i = 0; i < 7; i++) {
            week.push({ key: formatDate(day), day: day.getDate(), inMonth: day.getMonth() === month });
            day = addDays(day, 1);
        }
        weeks.push(week);
    }
    return { year, month, title: MONTH.format(first), weeks };
}

/** "Thursday, September 24". */
export function longDay(key) {
    const d = parseLocal(key);
    return d ? LONG_DAY.format(d) : '';
}

/**
 * What falls on each day from `fromKey` to `toKey` (inclusive), as a Map of
 * day key to `{ events, tasks }`. Only live records of live applications,
 * and only follow-ups still to do. Events are in time order.
 */
export function agenda(doc, fromKey, toKey) {
    const index = buildIndex(doc);
    const days = new Map();
    const slot = (key) => {
        if (!days.has(key)) days.set(key, { events: [], tasks: [] });
        return days.get(key);
    };
    for (const list of index.eventsByApp.values()) {
        for (const ev of list) {
            const key = ev.at ? ev.at.slice(0, 10) : null;
            if (key && key >= fromKey && key <= toKey) slot(key).events.push(ev);
        }
    }
    for (const list of index.tasksByApp.values()) {
        for (const t of list) {
            if (!t.doneAt && t.due && t.due >= fromKey && t.due <= toKey) slot(t.due).tasks.push(t);
        }
    }
    for (const day of days.values()) day.events.sort((a, b) => a.at.localeCompare(b.at));
    return days;
}

/** The agenda for every day a month grid shows. */
export function monthAgenda(doc, grid) {
    const first = grid.weeks[0][0].key;
    const lastWeek = grid.weeks[grid.weeks.length - 1];
    return agenda(doc, first, lastWeek[6].key);
}

/** A day button's accessible name: "Thursday, September 24, 2 events and
 *  1 follow-up". */
export function dayLabel(key, items) {
    const parts = [];
    const n = (count, one) => `${count} ${one}${count === 1 ? '' : 's'}`;
    if (items && items.events.length) parts.push(n(items.events.length, 'event'));
    if (items && items.tasks.length) parts.push(n(items.tasks.length, 'follow-up'));
    return parts.length ? `${longDay(key)}, ${parts.join(' and ')}` : longDay(key);
}
