// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The calendar file for a booked visit (www/whitestone/js/ics.js): RFC 5545
 * shape, the visit at its true instant in UTC, a stable UID, and nothing of
 * the home in it.
 */
import { bookingIcs, icsFilename, icsEscape, foldLine, utcStamp } from '../www/whitestone/js/ics.js';
import { BRAND, CALENDAR } from '../www/whitestone/js/copy.js';

const NOW = Date.parse('2026-10-12T16:00:00Z');
const booking = { id: 'bk_0123456789', start: '2026-11-03T17:00:00-08:00', end: '2026-11-03T19:30:00-08:00' };

test('one event, at its real instant in UTC, with a reminder two hours ahead', () => {
    const ics = bookingIcs(booking, NOW);
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(lines).toContain('DTSTART:20261104T010000Z');   // 5 pm Pacific is 1 am UTC the next day
    expect(lines).toContain('DTEND:20261104T033000Z');
    expect(lines).toContain('DTSTAMP:20261012T160000Z');
    expect(lines).toContain('UID:bk_0123456789@whitestone.scenexp.com');
    expect(lines).toContain('TRIGGER:-PT2H');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(ics).not.toMatch(/[^\r]\n/);   // CRLF throughout
});

test('it names a Whitestone visit and nothing about the home, with the example line while bookings are examples', () => {
    // Read unfolded: a long line is folded at 75 octets (RFC 5545 3.1).
    const unfold = (text) => text.replace(/\r\n /g, '');
    const ics = unfold(bookingIcs(booking, NOW));
    expect(ics).toContain(`SUMMARY:${CALENDAR.summary}`);
    expect(ics).toContain(icsEscape(BRAND.exampleBooking));
    expect(ics).not.toMatch(/LOCATION|URL|ATTENDEE|#k=/);
    expect(unfold(bookingIcs(booking, NOW, { example: false }))).not.toContain(icsEscape(BRAND.exampleBooking));
});

test('a booking it cannot place in time is refused', () => {
    expect(() => bookingIcs({ ...booking, start: '2026-11-03T17:00:00' }, NOW)).toThrow('not a booking');
    expect(() => bookingIcs({ ...booking, end: booking.start }, NOW)).toThrow('not a booking');
    expect(() => bookingIcs({ ...booking, id: 'a b' }, NOW)).toThrow('not a booking');
    expect(() => bookingIcs(null, NOW)).toThrow('not a booking');
});

test('text is escaped, and long lines fold at 75 octets without splitting a character', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    const line = `DESCRIPTION:${'é'.repeat(60)}`;
    const folded = foldLine(line);
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(line);
    expect(foldLine('SHORT:x')).toBe('SHORT:x');
    expect(utcStamp(Date.parse('2026-01-02T03:04:05.678Z'))).toBe('20260102T030405Z');
});

test('the file is named for the visit\'s own day', () => {
    expect(icsFilename(booking)).toBe('whitestone-visit-2026-11-03.ics');
    expect(icsFilename({ start: 'soon' })).toBe('whitestone-visit-visit.ics');
});
