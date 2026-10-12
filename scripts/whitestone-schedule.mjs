// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * whitestone-schedule.mjs - Check and build Whitestone's schedule
 * (PLANNING 5.7, PRD 10.1).
 *
 *   node scripts/whitestone-schedule.mjs check
 *   node scripts/whitestone-schedule.mjs build
 *
 * THE SOURCE IS THREE CSV FILES Steve edits in Numbers or Excel, in
 * scripts/whitestone/schedule/: settings.csv, hours.csv and holidays.csv.
 * `build` writes www/whitestone/data/schedule.json, which the studio's
 * calendar reads.
 *
 * NOT VERSIONED, unlike the price sheets: a schedule change applies to new
 * bookings only, so the file is simply replaced. (Warning about existing
 * bookings that would no longer fit waits for the server, which keeps them.)
 *
 * Holidays more than 30 days past are reported as safe to remove, but never
 * fail the check.
 *
 * The validation is schedule.js `validateSchedule`, the same function the
 * pages run. Run `npm run build` first: schedule.js imports the built zoned.js.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readTable } from './whitestone/csv.mjs';
import { validateSchedule, SCHEDULE_FORMAT } from '../www/whitestone/js/schedule.js';
import { WEEKDAYS, daysBetween, todayIn } from '../www/whitestone/js/zoned.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_PATHS = Object.freeze({
    sources: path.join(ROOT, 'scripts', 'whitestone', 'schedule'),
    out: path.join(ROOT, 'www', 'whitestone', 'data', 'schedule.json')
});

export const FILES = Object.freeze({
    settings: ['key', 'value'],
    hours: ['day', 'open', 'close'],
    holidays: ['date', 'name', 'open', 'close']
});

/** Each setting, the property it becomes, and how its text is read. */
const SETTINGS = Object.freeze({
    timezone: ['timezone', (v) => v],
    cleaners: ['cleaners', Number],
    mode: ['mode', (v) => v.toLowerCase()],
    gap_minutes: ['gapMinutes', Number],
    slot_step_minutes: ['slotStepMinutes', Number],
    lead_hours: ['leadHours', Number],
    horizon_days: ['horizonDays', Number],
    cancel_hours: ['cancelHours', Number]
});

/** "8:00" and "08:00" are both 08:00. Blank stays blank. */
export function normalizeTime(text) {
    const s = String(text).trim();
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : s;
}

/**
 * Build a schedule from the three CSV texts. Returns { schedule, problems },
 * with each problem naming its file and line, then the schedule's own
 * validation.
 */
export function scheduleFromCsv(texts) {
    const problems = [];
    const tables = {};
    for (const [name, columns] of Object.entries(FILES)) {
        const table = readTable(texts[name] === undefined ? '' : texts[name], columns);
        table.problems.forEach((p) => problems.push(`${name}.csv ${p}`));
        tables[name] = table;
    }
    if (problems.length) return { schedule: null, problems };
    const at = (file, row, what) => problems.push(`${file}.csv line ${row.line}: ${what}`);

    const schedule = { format: SCHEDULE_FORMAT };
    const seen = new Set();
    for (const row of tables.settings.rows) {
        const key = row.values.key.toLowerCase();
        if (!(key in SETTINGS)) { at('settings', row, `unknown setting "${row.values.key}"`); continue; }
        if (seen.has(key)) { at('settings', row, `${key} is set twice`); continue; }
        seen.add(key);
        const [prop, read] = SETTINGS[key];
        const text = row.values.value.trim();
        if (read === Number && !/^\d+$/.test(text)) { at('settings', row, `${key} "${text}" is not a whole number`); continue; }
        schedule[prop] = read(text);
    }
    for (const key of Object.keys(SETTINGS)) if (!seen.has(key)) problems.push(`settings.csv: missing setting ${key}`);

    schedule.hours = {};
    for (const row of tables.hours.rows) {
        const day = row.values.day.trim().toLowerCase();
        if (!WEEKDAYS.includes(day)) { at('hours', row, `"${row.values.day}" is not a day of the week`); continue; }
        if (day in schedule.hours) { at('hours', row, `${day} is listed twice`); continue; }
        const open = normalizeTime(row.values.open);
        const close = normalizeTime(row.values.close);
        if (!open && !close) schedule.hours[day] = null;
        else if (!open || !close) at('hours', row, 'give both open and close, or leave both blank for closed');
        else schedule.hours[day] = { open, close };
    }
    for (const day of WEEKDAYS) {
        if (!(day in schedule.hours) && !problems.some((p) => p.startsWith('hours.csv'))) {
            problems.push(`hours.csv: missing ${day} (leave its hours blank for closed)`);
        }
    }

    schedule.holidays = [];
    for (const row of tables.holidays.rows) {
        const v = row.values;
        const open = normalizeTime(v.open);
        const close = normalizeTime(v.close);
        if (Boolean(open) !== Boolean(close)) { at('holidays', row, 'give both open and close, or leave both blank for closed'); continue; }
        schedule.holidays.push({ date: v.date.trim(), name: v.name.trim(), open: open || null, close: close || null });
    }
    schedule.holidays.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    if (problems.length) return { schedule: null, problems };
    const invalid = validateSchedule(schedule);
    invalid.forEach((p) => problems.push(`schedule ${p}`));
    return { schedule: invalid.length ? null : schedule, problems };
}

/** Holidays more than `days` days before today in the business zone. */
export function staleHolidays(schedule, now, days = 30) {
    const today = todayIn(now, schedule.timezone);
    return schedule.holidays.filter((h) => daysBetween(h.date, today) > days);
}

export function serializeSchedule(schedule) {
    return `${JSON.stringify(schedule, null, 2)}\n`;
}

async function load(paths, log) {
    const texts = {};
    for (const name of Object.keys(FILES)) {
        const file = path.join(paths.sources, `${name}.csv`);
        if (!existsSync(file)) {
            log(`Missing ${path.relative(ROOT, file) || file}.`);
            return null;
        }
        texts[name] = await readFile(file, 'utf8');
    }
    const { schedule, problems } = scheduleFromCsv(texts);
    if (problems.length) {
        log(`The schedule has ${problems.length} problem${problems.length > 1 ? 's' : ''}:`);
        problems.forEach((p) => log(`  ${p}`));
        return null;
    }
    return schedule;
}

function describe(schedule, now, log) {
    const open = WEEKDAYS.filter((d) => schedule.hours[d]).length;
    log(`The schedule is valid: ${schedule.timezone}, ${schedule.cleaners} cleaner${schedule.cleaners > 1 ? 's' : ''}, `
        + `${schedule.mode} mode, open ${open} days a week, ${schedule.holidays.length} holidays.`);
    const stale = staleHolidays(schedule, now);
    if (stale.length) log(`These holidays are past and can be removed: ${stale.map((h) => `${h.date} ${h.name}`).join(', ')}.`);
}

/** Run one command. Returns the exit code. `paths`, `log` and `now` are
 *  for tests. */
export async function run(argv, { paths = DEFAULT_PATHS, log = (line) => console.log(line), now = Date.now() } = {}) {
    const [command, ...rest] = argv;
    if (rest.length || !['check', 'build'].includes(command)) {
        log('Usage:');
        log('  node scripts/whitestone-schedule.mjs check');
        log('  node scripts/whitestone-schedule.mjs build');
        return 2;
    }
    const schedule = await load(paths, log);
    if (!schedule) return 1;
    describe(schedule, now, log);
    if (command === 'build') {
        await mkdir(path.dirname(paths.out), { recursive: true });
        const json = serializeSchedule(schedule);
        const same = existsSync(paths.out) && (await readFile(paths.out, 'utf8')) === json;
        if (same) log('schedule.json is already up to date.');
        else {
            await writeFile(paths.out, json);
            log(`Built ${path.relative(ROOT, paths.out) || paths.out}. It applies to new bookings only.`);
        }
    }
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    process.exitCode = await run(process.argv.slice(2));
}
