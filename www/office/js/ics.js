// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * ics.js - Interviews and follow-ups as a calendar file.
 *
 * THIS IS HOW THE OFFICE REACHES A VISITOR WITH THE TAB CLOSED. Prospect City
 * was abandoned partly because it was never opened, and a page cannot remind
 * anybody of anything once it is shut (notifications would need a service
 * worker and a permission prompt, which the PRD leaves out). So the office
 * writes a standard iCalendar file the visitor imports into the calendar they
 * already look at every day, with a reminder on each item.
 *
 * TIMES ARE FLOATING, like everything in the office: "2:00 PM on the 26th"
 * with no zone, which every calendar reads as local time. That is exactly how
 * the office stores them (dates.js).
 *
 * UIDS ARE STABLE, one per record, so importing the file again updates the
 * items already there instead of doubling them.
 *
 * NOTES STAY BEHIND. A calendar is often synced to somebody's cloud and seen
 * by assistants and colleagues, so only the company, the role, the kind of
 * event and its short description go in, never the visitor's notes.
 *
 * Pure. RFC 5545: CRLF line endings, text escaped, lines folded at 75 octets.
 */

import { parseLocal, formatDate, formatDateTime, addDays, today } from './dates.min.js';
import { buildIndex, isUpcoming } from './derive.min.js';
import { applicationName, eventName } from './labels.min.js';

const encoder = new TextEncoder();

/** Escape text for a property value. */
export function icsEscape(text) {
    return String(text == null ? '' : text)
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

/** Fold a content line at 75 octets, never inside a character. */
export function foldLine(line) {
    if (encoder.encode(line).length <= 75) return line;
    const out = [];
    let cur = '';
    let len = 0;
    for (const ch of line) {
        const size = encoder.encode(ch).length;
        if (len + size > 75) {
            out.push(cur);
            cur = ` ${ch}`;
            len = 1 + size;
        } else {
            cur += ch;
            len += size;
        }
    }
    out.push(cur);
    return out.join('\r\n');
}

/** "20260926T140000" from a local "2026-09-26T14:00". */
export function localStamp(dateTime) {
    return `${dateTime.slice(0, 10).replace(/-/g, '')}T${dateTime.slice(11, 13)}${dateTime.slice(14, 16)}00`;
}

/** "20260924T170000Z" from a Date. */
export function utcStamp(date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function eventLines(ev, app, stamp) {
    const start = parseLocal(ev.at);
    const end = new Date(start.getTime() + (ev.durationMinutes || 60) * 60000);
    const summary = `${eventName(ev)}: ${applicationName(app)}`;
    const lines = [
        'BEGIN:VEVENT',
        `UID:${ev.id}@office.scenexp.com`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${localStamp(ev.at)}`,
        `DTEND:${localStamp(formatDateTime(end))}`,
        `SUMMARY:${icsEscape(summary)}`
    ];
    const description = [ev.title, 'Kept in Corner Office at scenexp.com'].filter(Boolean).join('\n');
    lines.push(`DESCRIPTION:${icsEscape(description)}`);
    if (app.url) lines.push(`URL:${app.url}`);
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(summary)}`, 'TRIGGER:-PT30M', 'END:VALARM');
    lines.push('END:VEVENT');
    return lines;
}

function taskLines(task, app, stamp) {
    const next = formatDate(addDays(parseLocal(task.due), 1));
    const summary = task.text;
    const lines = [
        'BEGIN:VEVENT',
        `UID:${task.id}@office.scenexp.com`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${task.due.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${next.replace(/-/g, '')}`,
        `SUMMARY:${icsEscape(summary)}`,
        `DESCRIPTION:${icsEscape([app ? applicationName(app) : '', 'A follow-up from Corner Office at scenexp.com'].filter(Boolean).join('\n'))}`,
        'TRANSP:TRANSPARENT',
        // Nine in the morning on the day.
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(summary)}`, 'TRIGGER:PT9H', 'END:VALARM',
        'END:VEVENT'
    ];
    return lines;
}

/**
 * A calendar file for a list of items, each `{ kind: 'event' | 'task',
 * record, app }`. `now` stamps it.
 */
export function icsFile(items, now) {
    const stamp = utcStamp(now);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SceneXP//Corner Office//EN', 'CALSCALE:GREGORIAN'];
    for (const item of items) {
        if (item.kind === 'event' && item.record.at) lines.push(...eventLines(item.record, item.app, stamp));
        if (item.kind === 'task' && item.record.due) lines.push(...taskLines(item.record, item.app, stamp));
    }
    lines.push('END:VCALENDAR');
    return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/**
 * Everything worth a reminder: events still ahead and follow-ups still to do
 * that are due from today, within `days`. Oldest first.
 */
export function upcomingItems(doc, now, days = 60) {
    const index = buildIndex(doc);
    const apps = new Map(doc.applications.map((a) => [a.id, a]));
    const first = today(now);
    const last = formatDate(addDays(now, days));
    const items = [];
    for (const list of index.eventsByApp.values()) {
        for (const ev of list) {
            if (isUpcoming(ev, now) && ev.at.slice(0, 10) <= last) {
                items.push({ kind: 'event', record: ev, app: apps.get(ev.applicationId), when: ev.at });
            }
        }
    }
    for (const list of index.tasksByApp.values()) {
        for (const t of list) {
            if (!t.doneAt && t.due && t.due >= first && t.due <= last) {
                items.push({ kind: 'task', record: t, app: t.applicationId ? apps.get(t.applicationId) : null, when: t.due });
            }
        }
    }
    return items.sort((a, b) => a.when.localeCompare(b.when));
}

/** The name a calendar file is offered under. */
export function icsFilename(now, what = 'coming-up') {
    return `corner-office-${what}-${today(now)}.ics`;
}
