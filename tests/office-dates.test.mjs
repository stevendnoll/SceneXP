// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's local wall-clock dates and record ids, imported from source.
 * Every other module reaches these through their .min builds, which the
 * coverage report does not count against the source, so they are held here.
 */
import {
    isValidDate, parseLocal, formatDate, formatDateTime, ceilToMinutes, isDateString, isDateTimeString,
    today, startOfDay, addDays, daysBetween, weekStart, weekKey, monthKey, displayDate, displayDateTime
} from '../www/office/js/dates.js';
import { newId } from '../www/office/js/ids.js';

describe('dates', () => {
    test('parses local dates and date-times, and refuses a day that does not exist', () => {
        expect(parseLocal('2026-09-24')).toEqual(new Date(2026, 8, 24));
        expect(parseLocal('2026-09-24T14:30')).toEqual(new Date(2026, 8, 24, 14, 30));
        expect(parseLocal('2026-09-24T14:30:15')).toEqual(new Date(2026, 8, 24, 14, 30, 15));
        expect(parseLocal('2026-02-30')).toBeNull();
        expect(parseLocal('2026-09-24T25:00')).toBeNull();
        expect(parseLocal('next Tuesday')).toBeNull();
        expect(parseLocal(20260924)).toBeNull();
    });

    test('shape checks', () => {
        expect(isDateString('2026-09-24')).toBe(true);
        expect(isDateString('2026-09-24T10:00')).toBe(false);
        expect(isDateTimeString('2026-09-24T10:00')).toBe(true);
        expect(isDateTimeString('2026-09-24')).toBe(false);
        expect(isValidDate(new Date('nope'))).toBe(false);
        expect(isValidDate('2026-09-24')).toBe(false);
    });

    test('formats, and rounds a time up to the next half hour', () => {
        const d = new Date(2026, 8, 4, 9, 5);
        expect(formatDate(d)).toBe('2026-09-04');
        expect(formatDateTime(d)).toBe('2026-09-04T09:05');
        expect(today(d)).toBe('2026-09-04');
        expect(formatDateTime(ceilToMinutes(d))).toBe('2026-09-04T09:30');
        expect(formatDateTime(ceilToMinutes(new Date(2026, 8, 4, 9, 30)))).toBe('2026-09-04T09:30');
        expect(formatDateTime(ceilToMinutes(new Date(2026, 8, 4, 23, 45)))).toBe('2026-09-05T00:00');
    });

    test('days are calendar days, so a clock change does not lose one', () => {
        // US daylight saving ends on November 1, 2026.
        expect(daysBetween(new Date(2026, 9, 31, 12), new Date(2026, 10, 2, 12))).toBe(2);
        expect(daysBetween(new Date(2026, 8, 24, 23), new Date(2026, 8, 25, 1))).toBe(1);
        expect(formatDate(addDays(new Date(2026, 8, 30), 1))).toBe('2026-10-01');
        expect(startOfDay(new Date(2026, 8, 24, 15, 20))).toEqual(new Date(2026, 8, 24));
    });

    test('weeks start on Monday', () => {
        expect(formatDate(weekStart(new Date(2026, 8, 27)))).toBe('2026-09-21');   // a Sunday
        expect(weekKey(new Date(2026, 8, 21))).toBe('2026-09-21');                  // a Monday
        expect(monthKey(new Date(2026, 8, 24))).toBe('2026-09');
    });

    test('dates for the eye, and nothing for a bad one', () => {
        expect(displayDate('2026-09-24')).toBe('Sep 24, 2026');
        expect(displayDateTime('2026-09-24T14:00')).toMatch(/^Sep 24, 2026, 2:00\sPM$/);
        expect(displayDate('soon')).toBe('');
        expect(displayDateTime('soon')).toBe('');
    });
});

describe('ids', () => {
    test('uses the browser’s own UUID when there is one', () => {
        expect(newId({ randomUUID: () => 'from-crypto' })).toBe('from-crypto');
    });

    test('falls back to a UUID of the same shape when there is not, or when it throws', () => {
        const shape = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
        expect(newId(null, () => 0.5)).toMatch(shape);
        expect(newId({ randomUUID() { throw new Error('insecure context'); } }, () => 0.99)).toMatch(shape);
        expect(newId()).toMatch(shape);
    });
});
