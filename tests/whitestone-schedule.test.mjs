// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The availability engine (www/whitestone/js/schedule.js).
 *
 * Exact cases first, on a fixture with the launch hours and a pinned clock
 * (Monday 2026-10-12, 9:00 am Pacific), including the PRD's own gap example.
 * Then the PLANNING 5.8 invariants across seeded random booking runs: no
 * cleaner double-booked, every visit inside its hours, notice and horizon, no
 * more than N at once, and above all that `openStarts` is exactly the set of
 * starts a booking would accept.
 *
 * Never the real date: every `now` here is pinned (a test on the real date
 * rots, a house lesson).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    validateSchedule, hoursOn, dayStatus, fits, assignCleaner, checkBooking, openStarts, monthView, canChange
} from '../www/whitestone/js/schedule.js';
import { toInstant, toWall, addDays, isoWithOffset, minutesOf, timeOf, todayIn, daysBetween } from '../www/whitestone/js/zoned.js';

const LA = 'America/Los_Angeles';
const NOW = Date.parse('2026-10-12T16:00:00Z');   // Monday 9:00 am PDT

function fixture(overrides = {}) {
    const weekday = { open: '08:00', close: '20:00' };
    return {
        format: 1, timezone: LA, cleaners: 1, mode: 'day', gapMinutes: 120, slotStepMinutes: 30,
        leadHours: 24, horizonDays: 60, cancelHours: 24,
        hours: { monday: weekday, tuesday: weekday, wednesday: weekday, thursday: weekday, friday: weekday,
            saturday: { open: '08:00', close: '16:00' }, sunday: null },
        holidays: [
            { date: '2026-11-26', name: 'Thanksgiving', open: null, close: null },
            { date: '2026-12-24', name: 'Christmas Eve', open: '08:00', close: '12:00' }
        ],
        ...overrides
    };
}

/** A booking on the wall clock. */
function booking(date, time, minutes, cleaner = 1, status = 'booked') {
    const start = toInstant(date, time, LA);
    return { id: `${date}T${time}`, start: isoWithOffset(start, LA), end: isoWithOffset(start + minutes * 60000, LA), cleaner, status };
}

const steps = (from, to, step = 30) => {
    const out = [];
    for (let m = minutesOf(from); m <= minutesOf(to); m += step) out.push(timeOf(m));
    return out;
};

test('the fixture is valid, and so is the schedule the studio ships', () => {
    expect(validateSchedule(fixture())).toEqual([]);
    const shipped = JSON.parse(readFileSync(join(process.cwd(), 'www', 'whitestone', 'data', 'schedule.json'), 'utf8'));
    expect(validateSchedule(shipped)).toEqual([]);
    // The launch settings Steve decided on 2026-10-12 (PRD 10.1).
    expect(shipped).toMatchObject({ timezone: LA, cleaners: 1, mode: 'day', gapMinutes: 240, slotStepMinutes: 30,
        leadHours: 24, horizonDays: 60, cancelHours: 24, hours: { sunday: null, saturday: { open: '08:00', close: '16:00' } } });
});

describe('validateSchedule refuses', () => {
    test.each([
        ['a future format', { format: 2 }, /^format/],
        ['a made-up zone', { timezone: 'Pacific Time' }, /^timezone/],
        ['no cleaners', { cleaners: 0 }, /^cleaners/],
        ['an unknown mode', { mode: 'week' }, /^mode/],
        ['a gap of over 12 hours', { gapMinutes: 1000 }, /^gapMinutes/],
        ['a step that does not divide the hour', { slotStepMinutes: 45 }, /^slotStepMinutes/],
        ['a step too fine', { slotStepMinutes: 1 }, /^slotStepMinutes/],
        ['negative notice', { leadHours: -1 }, /^leadHours/],
        ['no horizon', { horizonDays: 0 }, /^horizonDays/],
        ['fractional cancel hours', { cancelHours: 2.5 }, /^cancelHours/],
        ['a missing weekday', { hours: { ...fixture().hours, sunday: undefined } }, /hours\.sunday: open and close/],
        ['a weekday left out altogether', { hours: (({ sunday, ...rest }) => rest)(fixture().hours) }, /hours\.sunday: is missing/],
        ['a day that closes before it opens', { hours: { ...fixture().hours, monday: { open: '20:00', close: '08:00' } } }, /hours\.monday: must open before/],
        ['a time in words', { hours: { ...fixture().hours, monday: { open: 'eight', close: '20:00' } } }, /hours\.monday: open and close must be times/],
        ['a day that is not a weekday', { hours: { ...fixture().hours, funday: null } }, /hours\.funday: is not a weekday/],
        ['a week that never opens', { hours: Object.fromEntries(Object.keys(fixture().hours).map((d) => [d, null])) }, /closed every day/],
        ['holidays that are not a list', { holidays: {} }, /^holidays/],
        ['a holiday that is not a date', { holidays: [{ date: '2026-02-30', name: 'X', open: null, close: null }] }, /"2026-02-30" is not a date/],
        ['a holiday twice', { holidays: [...fixture().holidays, fixture().holidays[0]] }, /holiday 2026-11-26: is listed twice/],
        ['a holiday with no name', { holidays: [{ date: '2026-12-25', name: ' ', open: null, close: null }] }, /needs a name/],
        ['a holiday with half its hours', { holidays: [{ date: '2026-12-25', name: 'X', open: '08:00', close: null }] }, /both open and close, or neither/],
        ['a short day that closes before it opens', { holidays: [{ date: '2026-12-25', name: 'X', open: '12:00', close: '08:00' }] }, /must open before/]
    ])('%s', (_name, overrides, pattern) => {
        expect(validateSchedule(fixture(overrides)).join('\n')).toMatch(pattern);
    });

    test('something that is not a schedule', () => {
        expect(validateSchedule(null)).toEqual(['the schedule is not an object']);
        expect(validateSchedule([])).toEqual(['the schedule is not an object']);
        expect(validateSchedule(fixture({ hours: null })).join(' ')).toMatch(/must give every weekday/);
    });
});

describe('a single day', () => {
    const s = fixture({ horizonDays: 120 });

    test('a holiday with hours replaces the weekday for that date', () => {
        expect(hoursOn(s, '2026-12-24')).toEqual({ open: '08:00', close: '12:00', holiday: 'Christmas Eve' });
        expect(hoursOn(s, '2026-12-23')).toEqual({ open: '08:00', close: '20:00', holiday: null });
        expect(hoursOn(s, '2026-11-26')).toBeNull();
        expect(hoursOn(s, '2026-10-18')).toBeNull();
    });

    test.each([
        ['2026-10-12', 'too-soon'],        // today: nothing clears a day's notice
        ['2026-10-13', 'open'],            // tomorrow: its later starts do
        ['2026-10-18', 'closed'],          // a Sunday
        ['2026-11-26', 'holiday'],
        ['2026-12-24', 'open'],            // a short day is still a day
        ['2026-10-01', 'too-soon']         // the past
    ])('%s is %s', (date, status) => {
        expect(dayStatus(s, date, NOW).status).toBe(status);
    });

    test('the horizon counts days on the business clock, 60 in, 61 out', () => {
        const f = fixture();
        expect(dayStatus(f, '2026-12-11', NOW).status).toBe('open');
        expect(dayStatus(f, '2026-12-12', NOW).status).toBe('too-far');
        expect(dayStatus(s, '2026-11-26', NOW)).toEqual({ status: 'holiday', holiday: 'Thanksgiving' });
    });
});

describe('open starts', () => {
    test('a full weekday offers every half hour that still ends by closing', () => {
        expect(openStarts(fixture(), [], '2026-10-14', 120, NOW)).toEqual(steps('08:00', '18:00'));
    });

    test('tomorrow offers only the starts a full day away', () => {
        expect(openStarts(fixture(), [], '2026-10-13', 120, NOW)).toEqual(steps('09:00', '18:00'));
    });

    test('a short holiday offers its own short hours', () => {
        expect(openStarts(fixture({ horizonDays: 120 }), [], '2026-12-24', 90, NOW)).toEqual(steps('08:00', '10:30'));
    });

    test('a visit longer than the day offers nothing, and so does nonsense', () => {
        expect(openStarts(fixture(), [], '2026-10-17', 9 * 60, NOW)).toEqual([]);   // Saturday is 8 hours
        expect(openStarts(fixture(), [], '2026-10-14', 0, NOW)).toEqual([]);
        expect(openStarts(fixture(), [], '2026-10-14', 2.5, NOW)).toEqual([]);
        expect(openStarts(fixture(), [], '2026-10-18', 60, NOW)).toEqual([]);
    });

    test('day mode: one visit takes the whole day for its cleaner', () => {
        const taken = [booking('2026-10-14', '10:00', 120)];
        expect(openStarts(fixture(), taken, '2026-10-14', 60, NOW)).toEqual([]);
        expect(openStarts(fixture(), taken, '2026-10-15', 60, NOW)).toEqual(steps('08:00', '19:00'));
        // A second cleaner takes the day's other visit.
        expect(openStarts(fixture({ cleaners: 2 }), taken, '2026-10-14', 60, NOW)).toEqual(steps('08:00', '19:00'));
        expect(checkBooking(fixture({ cleaners: 2 }), taken, '2026-10-14', '08:00', 60, NOW).cleaner).toBe(2);
    });

    test("gap mode, the PRD's example: a 2-hour gap and a visit from 10 to noon make 2 pm the earliest next start", () => {
        const s = fixture({ mode: 'gap', gapMinutes: 120 });
        const taken = [booking('2026-10-14', '10:00', 120)];
        expect(openStarts(s, taken, '2026-10-14', 60, NOW)).toEqual(steps('14:00', '19:00'));
        // Before 10 am nothing fits, since a visit must end by 8 am. Around a
        // visit at 2 pm, a 1 hour visit fits if it ends by noon or starts at 5.
        expect(openStarts(s, [booking('2026-10-14', '14:00', 60)], '2026-10-14', 60, NOW))
            .toEqual([...steps('08:00', '11:00'), ...steps('17:00', '19:00')]);
    });

    test('a cancelled booking never blocks, and a booking that cannot be read is ignored', () => {
        const cancelled = [booking('2026-10-14', '10:00', 120, 1, 'cancelled'), { start: 'soon', end: 'later', cleaner: 1 }, null];
        expect(openStarts(fixture(), cancelled, '2026-10-14', 60, NOW)).toEqual(steps('08:00', '19:00'));
    });

    test('a day the clocks go back is an hour longer, and its visits may use it', () => {
        // Open overnight on Sunday 2026-11-01, when 1 am happens twice.
        const s = fixture({ hours: { ...fixture().hours, sunday: { open: '00:00', close: '06:00' } } });
        // Six wall hours hold seven real ones that night, so a 6.5 hour visit fits from midnight...
        expect(checkBooking(s, [], '2026-11-01', '00:00', 390, NOW)).toMatchObject({ ok: true, end: '2026-11-01T05:30:00-08:00' });
        // ...and on the next Sunday, an ordinary one, it does not.
        expect(checkBooking(s, [], '2026-11-08', '00:00', 390, NOW).error).toBe('after-close');
        // 1:30 am that night is two different moments, so it is never offered.
        expect(openStarts(s, [], '2026-11-01', 60, NOW)).not.toContain('01:30');
        expect(checkBooking(s, [], '2026-11-01', '01:30', 60, NOW).error).toBe('no-such-time');
    });

    test('a time the spring change skips is never offered', () => {
        const now = Date.parse('2027-03-01T18:00:00Z');
        const s = fixture({ hours: { ...fixture().hours, sunday: { open: '00:00', close: '06:00' } } });
        expect(openStarts(s, [], '2027-03-14', 30, now)).toEqual(['00:00', '00:30', '01:00', '01:30', '03:00', '03:30', '04:00', '04:30', '05:00', '05:30']);
    });
});

describe('checkBooking', () => {
    const s = fixture();

    test('a good request is booked to a cleaner, in ISO with its offset', () => {
        expect(checkBooking(s, [], '2026-11-03', '17:00', 90, NOW)).toEqual({
            ok: true, cleaner: 1, start: '2026-11-03T17:00:00-08:00', end: '2026-11-03T18:30:00-08:00'
        });
    });

    test.each([
        ['x', '09:00', 60, 'bad-request'],
        ['2026-10-14', '9:00', 60, 'bad-request'],
        ['2026-10-14', '09:00', 0, 'bad-request'],
        ['2026-10-14', '09:00', 1441, 'bad-request'],
        ['2026-10-18', '09:00', 60, 'closed'],
        ['2026-11-26', '09:00', 60, 'holiday'],
        ['2026-12-14', '09:00', 60, 'too-far'],
        ['2026-10-14', '07:30', 60, 'before-open'],
        ['2026-10-14', '09:15', 60, 'off-step'],
        ['2026-10-13', '08:30', 60, 'too-soon'],
        ['2026-10-12', '19:00', 60, 'too-soon'],
        ['2026-10-17', '15:00', 120, 'after-close'],
        ['2026-10-14', '19:30', 60, 'after-close']
    ])('%s %s for %i minutes is %s', (date, time, minutes, error) => {
        expect(checkBooking(s, [], date, time, minutes, NOW)).toEqual({ ok: false, error });
    });

    test('taken, when every cleaner is busy', () => {
        expect(checkBooking(s, [booking('2026-10-14', '15:00', 60)], '2026-10-14', '09:00', 60, NOW))
            .toEqual({ ok: false, error: 'taken' });
    });
});

describe('cleaners', () => {
    const bookingsOf = (list) => list.map((b) => ({ ...b, startMs: Date.parse(b.start), endMs: Date.parse(b.end) }));

    test('fits, in both modes', () => {
        const start = toInstant('2026-10-14', '15:00', LA);
        const end = start + 3600000;
        const morning = bookingsOf([booking('2026-10-14', '09:00', 60)]);
        expect(fits(fixture(), morning, start, end)).toBe(false);
        expect(fits(fixture({ mode: 'gap', gapMinutes: 240 }), morning, start, end)).toBe(true);    // 10 am + 4 h = 2 pm
        expect(fits(fixture({ mode: 'gap', gapMinutes: 301 }), morning, start, end)).toBe(false);
        expect(fits(fixture(), [], start, end)).toBe(true);
    });

    test('the lowest-numbered cleaner who fits gets the visit', () => {
        const s = fixture({ cleaners: 3 });
        const start = toInstant('2026-10-14', '09:00', LA);
        expect(assignCleaner(s, [booking('2026-10-14', '12:00', 60, 1)], start, start + 3600000)).toBe(2);
        expect(assignCleaner(s, [booking('2026-10-14', '12:00', 60, 2)], start, start + 3600000)).toBe(1);
        expect(assignCleaner(s, [1, 2, 3].map((c) => booking('2026-10-14', '12:00', 60, c)), start, start + 3600000)).toBeNull();
    });
});

describe('the month and the cancel window', () => {
    test('a month view gives each date its status, its starts and the first of them', () => {
        const days = monthView(fixture(), [booking('2026-10-14', '10:00', 60)], '2026-10', 120, NOW);
        expect(days).toHaveLength(31);
        const day = (d) => days.find((x) => x.date === d);
        expect(day('2026-10-12')).toMatchObject({ status: 'too-soon', starts: 0, first: null });
        expect(day('2026-10-13')).toMatchObject({ status: 'open', starts: 19, first: '09:00' });
        expect(day('2026-10-14')).toMatchObject({ status: 'full', starts: 0 });
        expect(day('2026-10-18')).toMatchObject({ status: 'closed', weekday: 'sunday' });
        expect(monthView(fixture(), [], '2026-11', 120, NOW).find((x) => x.date === '2026-11-26'))
            .toMatchObject({ status: 'holiday', holiday: 'Thanksgiving' });
        expect(monthView(fixture(), [], '2026-13', 60, NOW)).toEqual([]);
        expect(monthView(fixture(), [], '2026-02', 60, NOW)).toHaveLength(28);
    });

    test('a booking can be changed online until 24 hours before it starts', () => {
        const b = booking('2026-10-14', '10:00', 60);
        expect(canChange(fixture(), b, NOW)).toBe(true);
        expect(canChange(fixture(), b, Date.parse('2026-10-13T17:00:00Z'))).toBe(true);    // exactly 24 hours before
        expect(canChange(fixture(), b, Date.parse('2026-10-13T17:01:00Z'))).toBe(false);
        expect(canChange(fixture(), { start: 'soon' }, NOW)).toBe(false);
        expect(canChange(fixture(), null, NOW)).toBe(false);
    });
});

// ---- The invariants, across seeded random booking runs ----------------------

const mix = (n) => {
    let z = (n + 0x9E3779B9) >>> 0;
    z = Math.imul(z ^ (z >>> 16), 0x85EBCA6B) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xC2B2AE35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
};
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const RUNS = 40;

/** One run: a random schedule, and a stream of random requests booked
 *  wherever checkBooking accepts them (with a few cancellations). */
function run(n) {
    const r = rng(mix(n));
    const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    const pick = (list) => list[int(0, list.length - 1)];
    const s = fixture({
        mode: pick(['day', 'gap']),
        cleaners: int(1, 3),
        gapMinutes: pick([0, 30, 60, 120, 240]),
        slotStepMinutes: pick([15, 30, 60]),
        leadHours: pick([0, 24, 48]),
        horizonDays: pick([14, 30, 60])
    });
    const bookings = [];
    const requests = int(40, 80);
    for (let i = 0; i < requests; i++) {
        const date = addDays('2026-10-12', int(-1, 70));
        const time = timeOf(int(24, 87) * 15);   // 06:00 to 21:45
        const minutes = pick([30, 60, 90, 120, 180, 240, 300]);
        const result = checkBooking(s, bookings, date, time, minutes, NOW);
        if (result.ok) bookings.push({ id: `b${i}`, start: result.start, end: result.end, cleaner: result.cleaner, status: 'booked', date, time, minutes });
        if (bookings.length && r() < 0.05) pick(bookings).status = 'cancelled';
    }
    return { n, s, bookings, r, int };
}

describe(`the invariants, across ${RUNS} random runs of booking`, () => {
    const runs = Array.from({ length: RUNS }, (_, n) => run(n));
    const booked = (x) => x.bookings.filter((b) => b.status === 'booked');

    test('the runs really book things, in both modes', () => {
        expect(runs.reduce((sum, x) => sum + booked(x).length, 0)).toBeGreaterThan(RUNS * 5);
        expect(new Set(runs.filter((x) => booked(x).length).map((x) => x.s.mode))).toEqual(new Set(['day', 'gap']));
    });

    test('no cleaner is ever double-booked: one visit a date in day mode, the gap kept in gap mode', () => {
        const broken = [];
        for (const x of runs) {
            const list = booked(x);
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    const a = list[i];
                    const b = list[j];
                    if (a.cleaner !== b.cleaner) continue;
                    const [as, ae, bs, be] = [a.start, a.end, b.start, b.end].map(Date.parse);
                    const clash = x.s.mode === 'day'
                        ? toWall(as, LA).date === toWall(bs, LA).date
                        : !(ae + x.s.gapMinutes * 60000 <= bs || be + x.s.gapMinutes * 60000 <= as);
                    if (clash) broken.push(`run ${x.n}: ${a.id} and ${b.id}`);
                }
            }
        }
        expect(broken).toEqual([]);
    });

    test('every visit is inside its hours, its notice and its horizon, on a day that is open', () => {
        const broken = [];
        for (const x of runs) {
            for (const b of booked(x)) {
                const start = Date.parse(b.start);
                const end = Date.parse(b.end);
                const hours = hoursOn(x.s, b.date);
                const ok = hours
                    && start >= toInstant(b.date, hours.open, LA)
                    && end <= toInstant(b.date, hours.close, LA)
                    && start >= NOW + x.s.leadHours * 3600000
                    && daysBetween(todayIn(NOW, LA), b.date) <= x.s.horizonDays
                    && toWall(start, LA).date === b.date
                    && b.cleaner >= 1 && b.cleaner <= x.s.cleaners;
                if (!ok) broken.push(`run ${x.n}: ${b.id}`);
            }
        }
        expect(broken).toEqual([]);
    });

    test('never more than N visits at once in gap mode, or on one date in day mode', () => {
        const broken = [];
        for (const x of runs) {
            const list = booked(x);
            if (x.s.mode === 'day') {
                const perDate = {};
                list.forEach((b) => { perDate[b.date] = (perDate[b.date] || 0) + 1; });
                Object.entries(perDate).forEach(([d, c]) => { if (c > x.s.cleaners) broken.push(`run ${x.n}: ${d}`); });
            } else {
                for (const b of list) {
                    const t = Date.parse(b.start);
                    const at = list.filter((o) => Date.parse(o.start) <= t && t < Date.parse(o.end)).length;
                    if (at > x.s.cleaners) broken.push(`run ${x.n}: ${b.id}`);
                }
            }
        }
        expect(broken).toEqual([]);
    });

    test('OPEN STARTS ARE EXACTLY THE STARTS A BOOKING ACCEPTS, so the calendar never offers a refused time', () => {
        const mismatched = [];
        for (const x of runs.slice(0, 20)) {
            for (let k = 0; k < 3; k++) {
                const date = addDays('2026-10-12', x.int(0, 65));
                const minutes = [30, 90, 240][k];
                const offered = openStarts(x.s, x.bookings, date, minutes, NOW);
                const accepted = [];
                for (let m = 0; m < 24 * 60; m += 15) {
                    if (checkBooking(x.s, x.bookings, date, timeOf(m), minutes, NOW).ok) accepted.push(timeOf(m));
                }
                if (JSON.stringify(offered) !== JSON.stringify(accepted)) mismatched.push(`run ${x.n}: ${date} ${minutes}`);
            }
        }
        expect(mismatched).toEqual([]);
    });
});
