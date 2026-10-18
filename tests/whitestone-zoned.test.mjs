// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Wall-clock time in a business's zone (www/whitestone/js/zoned.js).
 *
 * The clock changes are the trap, so the four Pacific changes inside the
 * booking window of the first year are pinned by date (PLANNING 5.6): the
 * days that lose an hour (2026-03-08, 2027-03-14) and the days that gain one
 * (2026-11-01, 2027-11-07). Then round trips over many instants and zones,
 * including India's half-hour offset and Lord Howe Island, whose clocks move
 * by only thirty minutes.
 */
import {
    isValidZone, isDate, isTime, minutesOf, timeOf, addDays, weekdayOf, daysBetween,
    toWall, offsetAt, toInstant, isRealWallTime, isoWithOffset, parseInstant, todayIn
} from '../www/whitestone/js/zoned.js';

const LA = 'America/Los_Angeles';
const HOUR = 3600000;
const utc = (iso) => Date.parse(iso);

describe('the four Pacific clock changes of 2026 and 2027', () => {
    test.each([
        ['2026-03-08', 23], ['2026-11-01', 25], ['2027-03-14', 23], ['2027-11-07', 25]
    ])('%s is %i hours long', (date, hours) => {
        expect((toInstant(addDays(date, 1), '00:00', LA) - toInstant(date, '00:00', LA)) / HOUR).toBe(hours);
    });

    test('the offset is -8 in winter and -7 in summer, switching at 2 am', () => {
        expect(offsetAt(utc('2026-03-08T09:59:00Z'), LA)).toBe(-480);   // 1:59 am PST
        expect(offsetAt(utc('2026-03-08T10:00:00Z'), LA)).toBe(-420);   // 3:00 am PDT
        expect(offsetAt(utc('2026-11-01T08:59:00Z'), LA)).toBe(-420);   // 1:59 am PDT
        expect(offsetAt(utc('2026-11-01T09:00:00Z'), LA)).toBe(-480);   // 1:00 am PST, again
    });

    test('a time the spring change skips moves forward by the gap, as a clock would', () => {
        expect(isRealWallTime('2026-03-08', '02:30', LA)).toBe(false);
        expect(isoWithOffset(toInstant('2026-03-08', '02:30', LA), LA)).toBe('2026-03-08T03:30:00-07:00');
        expect(isRealWallTime('2027-03-14', '02:00', LA)).toBe(false);
        expect(isoWithOffset(toInstant('2027-03-14', '02:00', LA), LA)).toBe('2027-03-14T03:00:00-07:00');
    });

    test('a time the fall change repeats means the first one, and is not a real time to offer', () => {
        expect(isRealWallTime('2026-11-01', '01:30', LA)).toBe(false);
        expect(isoWithOffset(toInstant('2026-11-01', '01:30', LA), LA)).toBe('2026-11-01T01:30:00-07:00');
        expect(isoWithOffset(toInstant('2027-11-07', '01:00', LA), LA)).toBe('2027-11-07T01:00:00-07:00');
    });

    test('times either side of each change are ordinary', () => {
        expect(isoWithOffset(toInstant('2026-03-08', '01:30', LA), LA)).toBe('2026-03-08T01:30:00-08:00');
        expect(isoWithOffset(toInstant('2026-03-08', '03:30', LA), LA)).toBe('2026-03-08T03:30:00-07:00');
        expect(isoWithOffset(toInstant('2026-11-01', '00:30', LA), LA)).toBe('2026-11-01T00:30:00-07:00');
        expect(isoWithOffset(toInstant('2026-11-01', '02:30', LA), LA)).toBe('2026-11-01T02:30:00-08:00');
        expect(isRealWallTime('2026-11-01', '02:30', LA)).toBe(true);
    });
});

test('an evening visit that crosses midnight in UTC stays on its own date on the wall', () => {
    const start = toInstant('2026-11-03', '17:00', LA);
    expect(new Date(start).toISOString()).toBe('2026-11-04T01:00:00.000Z');
    expect(toWall(start, LA)).toEqual({ date: '2026-11-03', time: '17:00', seconds: 0, weekday: 'tuesday' });
    expect(todayIn(start, LA)).toBe('2026-11-03');
});

describe('round trips', () => {
    // A well-mixed seed per draw (splitmix32's finalizer), so no two draws share structure.
    const mix = (n) => {
        let z = (n + 0x9E3779B9) >>> 0;
        z = Math.imul(z ^ (z >>> 16), 0x85EBCA6B) >>> 0;
        z = Math.imul(z ^ (z >>> 13), 0xC2B2AE35) >>> 0;
        return (z ^ (z >>> 16)) >>> 0;
    };
    const from = utc('2026-01-01T00:00:00Z');
    const span = utc('2028-01-01T00:00:00Z') - from;

    test.each([LA, 'America/New_York', 'Asia/Kolkata', 'Australia/Lord_Howe', 'Europe/London', 'UTC'])('%s', (zone) => {
        let checked = 0;
        for (let n = 0; n < 3000; n++) {
            // Whole minutes, since the wall clock here shows minutes.
            const instant = from + Math.floor((mix(n) / 4294967296) * span / 60000) * 60000;
            const w = toWall(instant, zone);
            const back = toInstant(w.date, w.time, zone);
            if (isRealWallTime(w.date, w.time, zone)) {
                expect(back).toBe(instant);
                checked++;
            } else {
                // A repeated time comes back as its first occurrence.
                expect(back).toBeLessThanOrEqual(instant);
                expect(toWall(back, zone)).toMatchObject({ date: w.date, time: w.time });
            }
            // The ISO form names the same instant.
            expect(parseInstant(isoWithOffset(instant, zone))).toBe(instant);
        }
        expect(checked).toBeGreaterThan(2900);
    });

    test('half-hour offsets survive', () => {
        expect(offsetAt(utc('2026-06-01T00:00:00Z'), 'Asia/Kolkata')).toBe(330);
        expect(isoWithOffset(toInstant('2026-06-01', '09:00', 'Asia/Kolkata'), 'Asia/Kolkata')).toBe('2026-06-01T09:00:00+05:30');
    });
});

describe('calendar arithmetic', () => {
    test('days are added across months, years and a leap day', () => {
        expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
        expect(addDays('2026-03-07', 2)).toBe('2026-03-09');   // straight through a clock change
    });

    test('weekdays and the days between', () => {
        expect(weekdayOf('2026-10-12')).toBe('monday');
        expect(weekdayOf('2026-11-01')).toBe('sunday');
        expect(daysBetween('2026-10-12', '2026-12-11')).toBe(60);
        expect(daysBetween('2026-10-12', '2026-10-11')).toBe(-1);
        expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    });

    test('times and minutes', () => {
        expect(minutesOf('08:30')).toBe(510);
        expect(minutesOf('8:30')).toBeNull();
        expect(minutesOf('24:00')).toBeNull();
        expect(timeOf(510)).toBe('08:30');
        expect(timeOf(0)).toBe('00:00');
    });
});

describe('what counts as a date, a time, a zone and an instant', () => {
    test('dates and times', () => {
        expect(isDate('2026-02-28')).toBe(true);
        expect(isDate('2026-02-29')).toBe(false);
        expect(isDate('2026-13-01')).toBe(false);
        expect(isDate('26-10-12')).toBe(false);
        expect(isDate(null)).toBe(false);
        expect(isTime('23:59')).toBe(true);
        expect(isTime('24:00')).toBe(false);
        expect(isTime('7:00')).toBe(false);
        expect(isRealWallTime('2026-02-30', '09:00', LA)).toBe(false);
    });

    test('zones are IANA names this runtime knows', () => {
        expect(isValidZone(LA)).toBe(true);
        expect(isValidZone('Pacific Time')).toBe(false);
        expect(isValidZone('')).toBe(false);
        expect(isValidZone(undefined)).toBe(false);
    });

    test('an instant must carry its offset, or it would be read in the reader\'s own zone', () => {
        expect(parseInstant('2026-11-03T09:00:00-08:00')).toBe(utc('2026-11-03T17:00:00Z'));
        expect(parseInstant('2026-11-03T17:00:00Z')).toBe(utc('2026-11-03T17:00:00Z'));
        expect(parseInstant('2026-11-03T09:00-08:00')).toBe(utc('2026-11-03T17:00:00Z'));
        expect(parseInstant('2026-11-03T09:00:00')).toBeNull();
        expect(parseInstant('2026-11-03')).toBeNull();
        expect(parseInstant('tomorrow')).toBeNull();
        expect(parseInstant(1700000000000)).toBeNull();
    });
});
