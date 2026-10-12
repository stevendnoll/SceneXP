// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * ics.js - A booked visit as a calendar file, for Add to calendar (PRD 10.3).
 *
 * Adapted from Corner Office's ics.js, with one change that matters: the
 * office's times float ("2:00 PM", read as local time wherever the file is
 * opened), but a Whitestone visit is an instant in the business's zone. So
 * the start and end are written in UTC, and a customer travelling with their
 * phone still sees the visit at the right moment.
 *
 * THE CALENDAR NEVER HOLDS THE HOME. A calendar is often synced to a cloud
 * and seen by assistants and colleagues, so the file says only that a
 * Whitestone visit is booked: no rooms, no notes, no address, no link (the
 * share link carries the checklist's key).
 *
 * UIDS ARE STABLE, one per booking, so importing the file again after a
 * reschedule moves the visit instead of adding a second one.
 *
 * Pure. RFC 5545: CRLF line endings, text escaped, lines folded at 75 octets.
 */

import { CALENDAR, BRAND } from './copy.min.js';
import { parseInstant } from './zoned.min.js';

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

/** "20261103T170000Z" from an instant. */
export function utcStamp(instant) {
    return new Date(instant).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * The calendar file for one booking: { id, start, end } with ISO times that
 * carry their offset. `example` adds the honesty line while bookings are
 * examples (PRD 4). Throws on a booking it cannot place in time.
 */
export function bookingIcs(booking, now, { example = true } = {}) {
    const start = parseInstant(booking && booking.start);
    const end = parseInstant(booking && booking.end);
    if (start === null || end === null || end <= start || !/^[A-Za-z0-9_-]{1,64}$/.test(String(booking.id))) {
        throw new Error('not a booking');
    }
    const description = [CALENDAR.description, example ? BRAND.exampleBooking : ''].filter(Boolean).join('\n');
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//SceneXP//Whitestone Home Care//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${booking.id}@whitestone.scenexp.com`,
        `DTSTAMP:${utcStamp(now)}`,
        `DTSTART:${utcStamp(start)}`,
        `DTEND:${utcStamp(end)}`,
        `SUMMARY:${icsEscape(CALENDAR.summary)}`,
        `DESCRIPTION:${icsEscape(description)}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsEscape(CALENDAR.summary)}`,
        'TRIGGER:-PT2H',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR'
    ];
    return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** The name the file is offered under, dated by the visit's own day. */
export function icsFilename(booking) {
    const date = typeof booking.start === 'string' ? booking.start.slice(0, 10) : 'visit';
    return `whitestone-visit-${/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : 'visit'}.ics`;
}
