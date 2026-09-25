// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's M2 pure modules: the calendar month and agenda, the
 * calendar file, the light from the clock, and the sticky notes' layout.
 */
import { CONFIG } from '../www/office/js/config.js';
import {
    emptyDoc, addApplication, addEvent, addTask, setTaskDone, deleteRecord
} from '../www/office/js/store.js';
import {
    monthGrid, shiftMonth, agenda, monthAgenda, dayLabel, longDay, WEEKDAYS, WEEKDAY_NAMES
} from '../www/office/js/calendar.js';
import {
    icsEscape, foldLine, localStamp, utcStamp, icsFile, upcomingItems, icsFilename
} from '../www/office/js/ics.js';
import { dayOfYear, sunTimes, lightAt, lighting, mix, css, isDaylightSaving } from '../www/office/js/daylight.js';
import {
    stickyNotes, notesKey, noteWords, noteColor, quadCorners, cellUvs, NOTE_SLOTS, NOTE_SIZE, ATLAS, NOTE_COLORS
} from '../www/office/js/notes.js';

// Thursday, September 24, 2026, 10 AM.
const NOW = new Date(2026, 8, 24, 10, 0);

function office() {
    let doc = emptyDoc(CONFIG, NOW);
    doc = addApplication(doc, { company: 'Acme, Inc.', role: 'Designer', url: 'https://acme.example/job' }, CONFIG, NOW, { id: 'a' }).doc;
    doc = addApplication(doc, { company: 'Binned' }, CONFIG, NOW, { id: 'b' }).doc;
    const ev = (fields, id) => { doc = addEvent(doc, { applicationId: 'a', ...fields }, CONFIG, NOW, { id }).doc; };
    ev({ type: 'interview', at: '2026-09-26T14:00', durationMinutes: 90, title: 'Panel; with the team', notes: 'SECRET salary thoughts' }, 'e-soon');
    ev({ type: 'screen', at: '2026-09-20T10:00' }, 'e-past');
    ev({ type: 'call', at: '2026-10-02T09:30' }, 'e-october');
    ev({ type: 'call', at: '2027-01-15T09:30' }, 'e-far');
    doc = addEvent(doc, { applicationId: 'b', type: 'call', at: '2026-09-25T09:00' }, CONFIG, NOW, { id: 'e-binned' }).doc;
    doc = deleteRecord(doc, 'applications', 'b', CONFIG, NOW).doc;
    const task = (fields, id) => { doc = addTask(doc, { applicationId: 'a', ...fields }, CONFIG, NOW, { id }).doc; };
    task({ text: 'Send thanks', due: '2026-09-27' }, 't-due');
    task({ text: 'Old one', due: '2026-09-10' }, 't-old');
    task({ text: 'Done one', due: '2026-09-28' }, 't-done');
    doc = setTaskDone(doc, 't-done', true, CONFIG, NOW).doc;
    task({ text: 'Someday' }, 't-undated');
    return doc;
}

// ---- The calendar -----------------------------------------------------------------

describe('the month', () => {
    test('September 2026 starts on the Monday before, in five weeks', () => {
        const g = monthGrid(2026, 8);
        expect(g.title).toBe('September 2026');
        expect(g.weeks).toHaveLength(5);
        expect(g.weeks[0][0]).toEqual({ key: '2026-08-31', day: 31, inMonth: false });
        expect(g.weeks[0][1]).toEqual({ key: '2026-09-01', day: 1, inMonth: true });
        expect(g.weeks[4][6]).toEqual({ key: '2026-10-04', day: 4, inMonth: false });
        expect(g.weeks.every((w) => w.length === 7)).toBe(true);
    });

    test('a February that starts on Monday fits in four weeks, and a long month takes six', () => {
        expect(monthGrid(2027, 1).weeks).toHaveLength(4);
        expect(monthGrid(2026, 7).weeks).toHaveLength(6);
    });

    test('months turn across the year', () => {
        expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
        expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    });

    test('the agenda holds live events and open follow-ups, in time order', () => {
        const days = agenda(office(), '2026-09-01', '2026-09-30');
        expect([...days.keys()].sort()).toEqual(['2026-09-10', '2026-09-20', '2026-09-26', '2026-09-27']);
        expect(days.get('2026-09-26').events.map((e) => e.id)).toEqual(['e-soon']);
        expect(days.get('2026-09-27').tasks.map((t) => t.id)).toEqual(['t-due']);
        const month = monthAgenda(office(), monthGrid(2026, 8));
        expect(month.get('2026-10-02').events).toHaveLength(1);
    });

    test('day labels read naturally', () => {
        expect(longDay('2026-09-24')).toBe('Thursday, September 24');
        expect(longDay('nope')).toBe('');
        expect(dayLabel('2026-09-24', null)).toBe('Thursday, September 24');
        expect(dayLabel('2026-09-24', { events: [1, 2], tasks: [1] })).toBe('Thursday, September 24, 2 events and 1 follow-up');
        expect(dayLabel('2026-09-24', { events: [], tasks: [1, 2] })).toBe('Thursday, September 24, 2 follow-ups');
        expect(WEEKDAYS).toHaveLength(7);
        expect(WEEKDAY_NAMES[0]).toBe('Monday');
    });
});

// ---- The calendar file ---------------------------------------------------------------

describe('the calendar file', () => {
    test('text is escaped and long lines are folded without splitting a character', () => {
        expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
        expect(icsEscape(null)).toBe('');
        expect(foldLine('short')).toBe('short');
        const long = `SUMMARY:${'é'.repeat(60)}`;
        const folded = foldLine(long);
        const parts = folded.split('\r\n');
        expect(parts.length).toBeGreaterThan(1);
        for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
        expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
        expect(parts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(long);
    });

    test('stamps', () => {
        expect(localStamp('2026-09-26T14:05')).toBe('20260926T140500');
        expect(utcStamp(new Date(Date.UTC(2026, 8, 24, 17, 3, 9)))).toBe('20260924T170309Z');
    });

    test('what is coming up: future events and open dated follow-ups, soonest first', () => {
        const items = upcomingItems(office(), NOW, 60);
        expect(items.map((i) => i.record.id)).toEqual(['e-soon', 't-due', 'e-october']);
        expect(upcomingItems(office(), NOW, 200).map((i) => i.record.id)).toContain('e-far');
    });

    test('a file of them, in floating local time, with reminders, and never the notes', () => {
        const text = icsFile(upcomingItems(office(), NOW, 60), NOW);
        const lines = text.split('\r\n');
        expect(text.endsWith('\r\n')).toBe(true);
        expect(lines[0]).toBe('BEGIN:VCALENDAR');
        expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(3);
        expect(lines.filter((l) => l === 'BEGIN:VALARM')).toHaveLength(3);
        expect(text).toContain('UID:e-soon@office.scenexp.com');
        expect(text).toContain('DTSTART:20260926T140000');
        expect(text).toContain('DTEND:20260926T153000');
        expect(text).toContain('SUMMARY:Interview\\, round 1: Acme\\, Inc.\\, Designer');
        expect(text).toContain('DESCRIPTION:Panel\\; with the team\\nKept in Corner Office at scenexp.com');
        expect(text).toContain('URL:https://acme.example/job');
        expect(text).toContain('TRIGGER:-PT30M');
        expect(text).toContain('DTSTART;VALUE=DATE:20260927');
        expect(text).toContain('DTEND;VALUE=DATE:20260928');
        expect(text).toContain('TRIGGER:PT9H');
        expect(text).not.toContain('SECRET');
        // Floating: no zone on any start or end.
        expect(lines.filter((l) => /^DT(START|END):/.test(l)).every((l) => !l.endsWith('Z'))).toBe(true);
        expect(icsFilename(NOW)).toBe('corner-office-coming-up-2026-09-24.ics');
        expect(icsFilename(NOW, 'event')).toBe('corner-office-event-2026-09-24.ics');
    });

    test('an event with no length lasts an hour, and items with no date are skipped', () => {
        const ev = { id: 'x', type: 'call', at: '2026-09-26T23:30', round: null };
        const text = icsFile([
            { kind: 'event', record: ev, app: { company: 'A', role: '' } },
            { kind: 'task', record: { id: 'y', text: 'Undated', due: null }, app: null },
            { kind: 'event', record: { ...ev, at: null }, app: {} }
        ], NOW);
        expect(text).toContain('DTEND:20260927T003000');
        expect(text.split('BEGIN:VEVENT')).toHaveLength(2);
    });
});

// ---- The light --------------------------------------------------------------------

describe('the light through the windows', () => {
    test('days are longer in June than in December, and noon sits between sunrise and sunset', () => {
        expect(dayOfYear(new Date(2026, 0, 1))).toBe(0);
        expect(dayOfYear(new Date(2026, 11, 31))).toBe(364);
        const june = sunTimes(new Date(2026, 5, 21));
        const december = sunTimes(new Date(2026, 11, 21));
        expect(june.sunset - june.sunrise).toBeGreaterThan(december.sunset - december.sunrise + 4);
        expect(june.sunrise).toBeGreaterThan(4);
        expect(december.sunset).toBeLessThan(19);
        expect(typeof isDaylightSaving(NOW)).toBe('boolean');
    });

    test('noon is day, three in the morning is night, and dusk is golden', () => {
        const at = (h) => lightAt(NOW, h);
        expect(at(12)).toMatchObject({ phase: 'day', daylight: 1 });
        expect(at(3)).toMatchObject({ phase: 'night', daylight: 0 });
        const { sunset, sunrise } = sunTimes(NOW);
        expect(at(sunset).phase).toBe('dusk');
        expect(at(sunrise).phase).toBe('dawn');
        expect(at(12).key).not.toBe(at(sunset).key);
        // Unpinned, it reads the Date's own hour.
        expect(lightAt(new Date(2026, 8, 24, 12, 30)).phase).toBe('day');
    });

    test('night is darker than day, and lights the city', () => {
        const day = lighting(lightAt(NOW, 12));
        const night = lighting(lightAt(NOW, 2));
        const dusk = lighting(lightAt(NOW, sunTimes(NOW).sunset));
        expect(night.sun).toBeLessThan(day.sun);
        expect(night.hemi).toBeLessThan(day.hemi);
        expect(night.cityLights).toBe(1);
        expect(day.cityLights).toBe(0);
        expect(dusk.cityLights).toBeGreaterThan(0);
        expect(dusk.cityLights).toBeLessThan(1);
        // Dusk's sun is warmer than noon's: more red than blue.
        expect((dusk.sunColor >> 16) - (dusk.sunColor & 255)).toBeGreaterThan((day.sunColor >> 16) - (day.sunColor & 255));
    });

    test('colors mix and print', () => {
        expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
        expect(mix(0x102030, 0x405060, 0)).toBe(0x102030);
        expect(mix(0x102030, 0x405060, 5)).toBe(0x405060);
        expect(css(0x0a0b0c)).toBe('#0a0b0c');
    });
});

// ---- The sticky notes ---------------------------------------------------------------

describe('the sticky notes', () => {
    const task = (id, text = `Task ${id}`) => ({ id, text });

    test('overdue first, then today, with a last note for the rest', () => {
        const due = { overdue: [task('o1')], today: [task('t1'), task('t2')] };
        expect(stickyNotes(due).map((n) => [n.task.id, n.overdue])).toEqual([['o1', true], ['t1', false], ['t2', false]]);
        const many = { overdue: [], today: Array.from({ length: 9 }, (_, i) => task(`t${i}`)) };
        const notes = stickyNotes(many);
        expect(notes).toHaveLength(NOTE_SLOTS.length);
        expect(notes.at(-1)).toEqual({ kind: 'more', count: 4 });
        expect(noteWords(notes.at(-1))).toEqual({ text: '4 more', small: 'on the Today list' });
        expect(noteColor(notes.at(-1))).toBe(NOTE_COLORS.more);
        expect(stickyNotes({ overdue: [], today: [] })).toEqual([]);
    });

    test('words, colors, and a key that changes when the words do', () => {
        const a = stickyNotes({ overdue: [task('o1', 'Call')], today: [] });
        const b = stickyNotes({ overdue: [task('o1', 'Call back')], today: [] });
        expect(noteWords(a[0])).toEqual({ text: 'Call', small: 'Overdue' });
        expect(noteColor(a[0])).toBe(NOTE_COLORS.overdue);
        expect(notesKey(a)).not.toBe(notesKey(b));
        expect(notesKey([{ kind: 'more', count: 3 }])).toBe('+3');
        expect(noteColor({ kind: 'task', overdue: false })).toBe(NOTE_COLORS.today);
    });

    test('a note is a square of its size, turned about its own center', () => {
        const flat = quadCorners({ x: 0, y: 0, tilt: 0 });
        expect(flat).toEqual([[-NOTE_SIZE / 2, -NOTE_SIZE / 2], [NOTE_SIZE / 2, -NOTE_SIZE / 2], [NOTE_SIZE / 2, NOTE_SIZE / 2], [-NOTE_SIZE / 2, NOTE_SIZE / 2]]);
        for (const slot of NOTE_SLOTS) {
            const q = quadCorners(slot);
            const cx = q.reduce((s, p) => s + p[0], 0) / 4;
            const cy = q.reduce((s, p) => s + p[1], 0) / 4;
            expect(cx).toBeCloseTo(slot.x, 9);
            expect(cy).toBeCloseTo(slot.y, 9);
            expect(Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1])).toBeCloseTo(NOTE_SIZE, 9);
        }
    });

    test('each note has its own cell of the atlas, and together they tile it', () => {
        const cells = NOTE_SLOTS.map((_, i) => cellUvs(i));
        expect(cells[0]).toEqual([[0, 0.5], [1 / 3, 0.5], [1 / 3, 1], [0, 1]]);
        const area = cells.reduce((s, c) => s + (c[1][0] - c[0][0]) * (c[2][1] - c[1][1]), 0);
        expect(area).toBeCloseTo(1, 9);
        const keys = new Set(cells.map((c) => c[0].join()));
        expect(keys.size).toBe(ATLAS.cols * ATLAS.rows);
    });
});

describe('the offices’ lights through the night (Steve, 2026-09-24)', () => {
    let officesLit;
    let lighting;
    let lightAt;
    beforeAll(async () => {
        ({ officesLit, lighting, lightAt } = await import('../www/office/js/daylight.js'));
    });

    test('fewer and fewer from eight in the evening to three in the morning', () => {
        let last = officesLit(20);
        for (let h = 20.25; h <= 27; h += 0.25) {
            const now = officesLit(h);
            expect(now).toBeLessThanOrEqual(last + 1e-12);
            last = now;
        }
        expect(officesLit(20)).toBeGreaterThan(officesLit(3) * 4);
    });

    test('a quiet hour, then the early risers from four, before the sun', () => {
        expect(officesLit(3.5)).toBeCloseTo(officesLit(3), 9);
        expect(officesLit(4)).toBeLessThan(0.08);
        expect(officesLit(6)).toBeGreaterThan(officesLit(4) * 3);
        expect(officesLit(6)).toBeLessThan(officesLit(9));
        // By day most are on, but the sun outshines them (cityLights).
        expect(officesLit(12)).toBeGreaterThan(0.35);
        const noon = lighting(lightAt(new Date(2026, 8, 24), 12));
        expect(noon.cityLights).toBe(0);
        expect(noon.offices).toBeCloseTo(officesLit(12), 9);
    });

    test('round the clock without a jump, whatever hour it is given', () => {
        expect(officesLit(24)).toBeCloseTo(officesLit(0), 9);
        expect(officesLit(-1)).toBeCloseTo(officesLit(23), 9);
        expect(officesLit(49)).toBeCloseTo(officesLit(1), 9);
        for (let h = 0; h < 24; h += 0.1) expect(Math.abs(officesLit(h + 0.1) - officesLit(h))).toBeLessThan(0.02);
        expect(officesLit(12, [[0, 0.5]])).toBe(0.5);
    });
});
