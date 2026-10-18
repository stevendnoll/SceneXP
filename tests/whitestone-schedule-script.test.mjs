// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The schedule build script (scripts/whitestone-schedule.mjs): the three
 * CSVs into a schedule, problems pointing at their file and line, and the two
 * commands against a temporary copy. The committed schedule.json is held to
 * its source, so neither can be edited without the other.
 */
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    scheduleFromCsv, serializeSchedule, normalizeTime, staleHolidays, run, FILES
} from '../scripts/whitestone-schedule.mjs';

const SOURCE = join(process.cwd(), 'scripts', 'whitestone', 'schedule');
const BUILT = join(process.cwd(), 'www', 'whitestone', 'data', 'schedule.json');
const readSource = () => Object.fromEntries(Object.keys(FILES).map((n) => [n, readFileSync(join(SOURCE, `${n}.csv`), 'utf8')]));
const NOW = Date.parse('2026-10-12T16:00:00Z');

test('the committed schedule.json is exactly what build makes from the committed CSVs', () => {
    const { schedule, problems } = scheduleFromCsv(readSource());
    expect(problems).toEqual([]);
    expect(serializeSchedule(schedule)).toBe(readFileSync(BUILT, 'utf8'));
});

test('a time typed without its leading zero is still a time', () => {
    expect(normalizeTime('8:00')).toBe('08:00');
    expect(normalizeTime(' 08:00 ')).toBe('08:00');
    expect(normalizeTime('')).toBe('');
    expect(normalizeTime('noon')).toBe('noon');
});

test('holidays are sorted by date, whatever order the spreadsheet has them in', () => {
    const texts = readSource();
    texts.holidays = 'date,name,open,close\r\n2026-12-25,Christmas Day,,\r\n2026-11-26,Thanksgiving,,\r\n';
    expect(scheduleFromCsv(texts).schedule.holidays.map((h) => h.date)).toEqual(['2026-11-26', '2026-12-25']);
});

describe('problems are reported where they are', () => {
    test.each([
        ['an unknown setting', 'settings', (t) => `${t}colour,blue\r\n`, /settings\.csv line 10: unknown setting "colour"/],
        ['a setting in words', 'settings', (t) => t.replace('cleaners,1', 'cleaners,one'), /cleaners "one" is not a whole number/],
        ['a setting twice', 'settings', (t) => `${t}mode,gap\r\n`, /mode is set twice/],
        ['a missing setting', 'settings', (t) => t.replace(/lead_hours,[^\r\n]*\r\n/, ''), /missing setting lead_hours/],
        ['a day that is not a weekday', 'hours', (t) => `${t}funday,08:00,20:00\r\n`, /hours\.csv line 9: "funday" is not a day/],
        ['a weekday twice', 'hours', (t) => `${t}monday,09:00,17:00\r\n`, /monday is listed twice/],
        ['a weekday missing', 'hours', (t) => t.replace(/sunday,,\r\n/, ''), /missing sunday/],
        ['half a day', 'hours', (t) => t.replace('saturday,08:00,16:00', 'saturday,08:00,'), /hours\.csv line 7: give both open and close/],
        ['half a holiday', 'holidays', (t) => `${t}2027-12-25,Christmas Day,08:00,\r\n`, /holidays\.csv line \d+: give both/],
        ['a problem only the schedule rules see', 'settings', (t) => t.replace('America/Los_Angeles', 'Pacific Time'), /^schedule timezone: "Pacific Time"/m],
        ['a renamed column', 'hours', (t) => t.replace('day,open,close', 'weekday,open,close'), /hours\.csv line 1: missing column day/]
    ])('%s', (_name, file, change, pattern) => {
        const texts = readSource();
        texts[file] = change(texts[file]);
        const { schedule, problems } = scheduleFromCsv(texts);
        expect(schedule).toBeNull();
        expect(problems.join('\n')).toMatch(pattern);
    });
});

test('holidays more than 30 days past can be removed, and nothing else is flagged', () => {
    const { schedule } = scheduleFromCsv(readSource());
    expect(staleHolidays(schedule, NOW)).toEqual([]);
    const later = Date.parse('2027-02-15T20:00:00Z');
    expect(staleHolidays(schedule, later).map((h) => h.date)).toEqual(['2026-11-26', '2026-11-27', '2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01']);
});

describe('the commands', () => {
    let root;
    let paths;
    let lines;
    const log = (line) => lines.push(line);
    const said = () => lines.join('\n');

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'whitestone-schedule-'));
        paths = { sources: join(root, 'schedule'), out: join(root, 'out', 'schedule.json') };
        cpSync(SOURCE, paths.sources, { recursive: true });
        lines = [];
    });

    afterEach(() => rmSync(root, { recursive: true, force: true }));

    test('check describes a valid schedule and writes nothing', async () => {
        expect(await run(['check'], { paths, log, now: NOW })).toBe(0);
        expect(said()).toMatch(/valid: America\/Los_Angeles, 1 cleaner, day mode, open 6 days a week, 9 holidays/);
        expect(existsSync(paths.out)).toBe(false);
    });

    test('build writes schedule.json, and says so only when it changed', async () => {
        expect(await run(['build'], { paths, log, now: NOW })).toBe(0);
        expect(readFileSync(paths.out, 'utf8')).toBe(readFileSync(BUILT, 'utf8'));
        expect(said()).toMatch(/applies to new bookings only/);
        lines = [];
        expect(await run(['build'], { paths, log, now: NOW })).toBe(0);
        expect(said()).toMatch(/already up to date/);
    });

    test('a schedule is not versioned, so a change simply replaces the file', async () => {
        expect(await run(['build'], { paths, log, now: NOW })).toBe(0);
        const file = join(paths.sources, 'settings.csv');
        writeFileSync(file, readFileSync(file, 'utf8').replace('cleaners,1', 'cleaners,2'));
        expect(await run(['build'], { paths, log, now: NOW })).toBe(0);
        expect(JSON.parse(readFileSync(paths.out, 'utf8')).cleaners).toBe(2);
    });

    test('a schedule with problems lists them, exits 1, and writes nothing', async () => {
        const file = join(paths.sources, 'hours.csv');
        writeFileSync(file, readFileSync(file, 'utf8').replace('monday,08:00,20:00', 'monday,20:00,08:00'));
        expect(await run(['build'], { paths, log, now: NOW })).toBe(1);
        expect(said()).toMatch(/1 problem:\n {2}schedule hours\.monday: must open before it closes/);
        expect(existsSync(paths.out)).toBe(false);
    });

    test('past holidays are mentioned, but never fail the check', async () => {
        expect(await run(['check'], { paths, log, now: Date.parse('2027-02-15T20:00:00Z') })).toBe(0);
        expect(said()).toMatch(/past and can be removed: 2026-11-26 Thanksgiving/);
    });

    test('a missing file, and anything but check or build', async () => {
        rmSync(join(paths.sources, 'holidays.csv'));
        expect(await run(['check'], { paths, log, now: NOW })).toBe(1);
        expect(said()).toMatch(/Missing .*holidays\.csv/);
        expect(await run([], { paths, log })).toBe(2);
        expect(await run(['build', 'now'], { paths, log })).toBe(2);
        expect(await run(['deploy'], { paths, log })).toBe(2);
    });
});
