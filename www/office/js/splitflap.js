// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * splitflap.js - The departures board over the door.
 *
 * An airport's split-flap board, listing the week's interviews and calls as
 * departures: when, what, and with whom. Each character is a flap that turns
 * through the alphabet to its letter, so a change clatters into place the way
 * the real thing does. Under reduced motion the letters simply change.
 *
 * Pure: events in, rows of fixed-width text out, and one step of the flaps at
 * a time. paint.js draws the tiles and main.js ticks the steps.
 */

import { fold } from './query.min.js';
import { EVENT_LABELS } from './labels.min.js';
import { parseLocal, daysBetween } from './dates.min.js';

/** Every character a flap carries, in the order a flap turns through them. */
export const FLAP_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.-&/'";

/** What each kind of event is called on the board: one word that fits its
 *  column, the way a board says BOARDING rather than a sentence. */
export const FLAP_WHAT = {
    screen: 'SCREEN',
    interview: 'INTERVIEW',
    assessment: 'ASSESSMENT',
    offer: 'OFFER',
    call: 'CALL',
    email: 'EMAIL',
    other: 'OTHER'
};

/** Column widths: WHEN, WHAT, WITH, with one blank between each. */
export const FLAP_COLUMNS = { when: 11, what: 10, with: 12 };
export const FLAP_WIDTH = FLAP_COLUMNS.when + FLAP_COLUMNS.what + FLAP_COLUMNS.with + 2;
export const FLAP_ROWS = 5;

/** Text as the flaps can show it: folded, upper case, anything a flap does
 *  not carry turned to a space, cut or padded to `width`. */
export function fit(text, width) {
    const up = fold(text).toUpperCase().split('').map((ch) => (FLAP_CHARS.includes(ch) ? ch : ' ')).join('');
    return up.slice(0, width).padEnd(width, ' ');
}

const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** "TODAY 2:00P", "TMRW 10:30A", "THU 9:00A", or "OCT 2 9:00A" further out. */
export function whenText(at, now) {
    const d = parseLocal(at);
    if (!d) return '';
    const h = d.getHours();
    const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}${h < 12 ? 'A' : 'P'}`;
    const days = daysBetween(now, d);
    let day;
    if (days === 0) day = 'TODAY';
    else if (days === 1) day = 'TMRW';
    else if (days < 7) day = WEEKDAY[d.getDay()];
    else day = `${d.toLocaleString('en-US', { month: 'short' }).toUpperCase()} ${d.getDate()}`;
    return `${day} ${time}`;
}

/** The board's rows for the events ahead (derive.upcomingEvents), soonest
 *  first, at most five, each exactly FLAP_WIDTH characters. `names` maps an
 *  application id to the company the row names. */
export function departureRows(events, names, now) {
    if (!events.length) {
        const rows = blankRows();
        const note = 'NO DEPARTURES THIS WEEK';
        rows[1] = fit(`${' '.repeat(Math.floor((FLAP_WIDTH - note.length) / 2))}${note}`, FLAP_WIDTH);
        return rows;
    }
    const rows = events.slice(0, FLAP_ROWS).map((ev) => [
        fit(whenText(ev.at, now), FLAP_COLUMNS.when),
        fit(FLAP_WHAT[ev.type] || FLAP_WHAT.other, FLAP_COLUMNS.what),
        fit(names.get(ev.applicationId) || '', FLAP_COLUMNS.with)
    ].join(' '));
    while (rows.length < FLAP_ROWS) rows.push(' '.repeat(FLAP_WIDTH));
    return rows;
}

/** A blank board, which the flaps turn from when the board is first seen. */
export function blankRows() {
    return Array.from({ length: FLAP_ROWS }, () => ' '.repeat(FLAP_WIDTH));
}

/**
 * One turn of every flap: each character that is not yet its target moves
 * on by one through FLAP_CHARS, wrapping round. Returns the new rows and
 * whether every flap has arrived.
 */
export function stepFlaps(current, target) {
    let done = true;
    const rows = target.map((goal, r) => {
        const now = (current[r] || '').padEnd(goal.length, ' ');
        let out = '';
        for (let i = 0; i < goal.length; i++) {
            if (now[i] === goal[i]) {
                out += now[i];
                continue;
            }
            done = false;
            const at = FLAP_CHARS.indexOf(now[i]);
            out += FLAP_CHARS[(at + 1) % FLAP_CHARS.length];
        }
        return out;
    });
    return { rows, done };
}

/** The same rows as a person reads them, for the sheet's table and a screen
 *  reader: `{ when, what, with }` in ordinary case, or null for a blank row. */
export function readableRow(ev, names, now) {
    const d = parseLocal(ev.at);
    const days = d ? daysBetween(now, d) : 0;
    const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow'
        : d.toLocaleString('en-US', days < 7 ? { weekday: 'long' } : { month: 'short', day: 'numeric' });
    const time = d ? d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    return { when: `${day}, ${time}`, what: EVENT_LABELS[ev.type], with: names.get(ev.applicationId) || '' };
}
