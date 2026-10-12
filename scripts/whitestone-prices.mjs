// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * whitestone-prices.mjs - Check, build and adjust Whitestone's price sheets
 * (PLANNING 5.4, PRD 9.7).
 *
 *   node scripts/whitestone-prices.mjs check  <version>
 *   node scripts/whitestone-prices.mjs build  <version>
 *   node scripts/whitestone-prices.mjs adjust <from> <to> <percent> [--round 0.25]
 *
 * THE SOURCE IS A FOLDER OF CSV FILES Steve edits in Numbers or Excel, one
 * folder per version under scripts/whitestone/prices/. They live outside
 * www/, so the spreadsheets are never served. Only the built JSON is.
 *
 * DOLLARS ARE READ AS TEXT. "10.25" becomes 1025 cents by reading the digits,
 * never through parseFloat, so no price is ever a cent off.
 *
 * A PUBLISHED VERSION NEVER CHANGES. Locked quotes name their version, and an
 * old quote must always recompute exactly, so `build` refuses to overwrite a
 * version whose content would differ. A change of price is a new version,
 * which is what `adjust` makes: a copy of a version's CSVs with every price
 * raised by a percent and rounded to a friendly step, for Steve to review
 * before he builds it.
 *
 * The validation is sheet.js `validateSheet`, the same function the pages
 * run, so the build and the studio agree on what a valid sheet is. Run
 * `npm run build` first: sheet.js imports the built taxonomy.
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readTable, toCsv } from './whitestone/csv.mjs';
import { validateSheet, SHEET_FORMAT, VERSION_PATTERN } from '../www/whitestone/js/sheet.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_DIRS = Object.freeze({
    sources: path.join(ROOT, 'scripts', 'whitestone', 'prices'),
    out: path.join(ROOT, 'www', 'whitestone', 'data', 'prices')
});

/** Each source file and the columns it must have. */
export const FILES = Object.freeze({
    settings: ['key', 'value'],
    tasks: ['key', 'name', 'description', 'unit', 'price', 'minutes', 'areas'],
    options: ['key', 'name', 'description'],
    task_options: ['task', 'option', 'price', 'minutes'],
    presets: ['area', 'task', 'options', 'size', 'quantity']
});

const SETTINGS = ['service_type', 'version', 'effective', 'currency', 'tax_included', 'visit_minimum',
    'size_small', 'size_medium', 'size_large'];

// ---- Reading values ---------------------------------------------------------

/** "10.25", "$10.25", "10", "1,250.00" as whole cents, or null. */
export function parseDollars(text) {
    const s = String(text).trim().replace(/^\$/, '');
    if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s)) return null;
    const [whole, frac = ''] = s.replace(/,/g, '').split('.');
    if (whole.length > 7) return null;
    return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/** Whole cents as the CSV writes them: "10.25", "186.00". */
export function formatDollars(cents) {
    return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/** A whole number written as digits only, or null. */
export function parseWhole(text) {
    const s = String(text).trim();
    return /^\d{1,6}$/.test(s) ? Number(s) : null;
}

export function parseBool(text) {
    const s = String(text).trim().toLowerCase();
    if (['true', 'yes'].includes(s)) return true;
    if (['false', 'no'].includes(s)) return false;
    return null;
}

/** "3", "3.5", "-2" as basis points (hundredths of a percent), or null. */
export function parsePercent(text) {
    const m = /^(-?)(\d{1,3})(?:\.(\d{1,2}))?$/.exec(String(text).trim());
    if (!m) return null;
    const bp = Number(m[2]) * 100 + Number((m[3] || '').padEnd(2, '0'));
    return m[1] ? -bp : bp;
}

/** cents raised by `bp` basis points and rounded half up to a multiple of
 *  `step` cents. Never below zero. */
export function adjustCents(cents, bp, step) {
    if (cents === 0) return 0;
    const n = cents * (10000 + bp);
    if (n <= 0) return 0;
    const d = 10000 * step;
    return Math.floor((2 * n + d) / (2 * d)) * step;
}

// ---- CSV to sheet -----------------------------------------------------------

/**
 * Build a sheet from the five CSV texts ({ settings, tasks, options,
 * task_options, presets }). Returns { sheet, problems }, where every problem
 * names its file and line, and the sheet's own validation follows.
 */
export function sheetFromCsv(texts) {
    const problems = [];
    const tables = {};
    for (const [name, columns] of Object.entries(FILES)) {
        const table = readTable(texts[name] === undefined ? '' : texts[name], columns);
        table.problems.forEach((p) => problems.push(`${name}.csv ${p}`));
        tables[name] = table;
    }
    if (problems.length) return { sheet: null, problems };
    const at = (file, row, what) => problems.push(`${file}.csv line ${row.line}: ${what}`);

    const settings = {};
    for (const row of tables.settings.rows) {
        const key = row.values.key.toLowerCase();
        if (!SETTINGS.includes(key)) { at('settings', row, `unknown setting "${row.values.key}"`); continue; }
        if (key in settings) { at('settings', row, `${key} is set twice`); continue; }
        settings[key] = { value: row.values.value, row };
    }
    for (const key of SETTINGS) {
        if (!(key in settings)) problems.push(`settings.csv: missing setting ${key}`);
    }
    const setting = (key, parse, what) => {
        if (!settings[key]) return undefined;
        const v = parse(settings[key].value);
        if (v === null) at('settings', settings[key].row, `${key} "${settings[key].value}" is not ${what}`);
        return v;
    };

    const sheet = {
        format: SHEET_FORMAT,
        serviceType: settings.service_type ? settings.service_type.value : undefined,
        version: settings.version ? settings.version.value : undefined,
        effective: settings.effective ? settings.effective.value : undefined,
        currency: settings.currency ? settings.currency.value : undefined,
        taxIncluded: setting('tax_included', parseBool, 'true or false'),
        visitMinimumCents: setting('visit_minimum', parseDollars, 'a dollar amount'),
        sizes: {
            small: setting('size_small', parseWhole, 'a whole percent'),
            medium: setting('size_medium', parseWhole, 'a whole percent'),
            large: setting('size_large', parseWhole, 'a whole percent')
        },
        options: [],
        tasks: [],
        presets: {}
    };

    for (const row of tables.options.rows) {
        const v = row.values;
        sheet.options.push({ key: v.key, name: v.name, description: v.description });
    }

    const tasks = new Map();
    for (const row of tables.tasks.rows) {
        const v = row.values;
        const cents = parseDollars(v.price);
        const minutes = parseWhole(v.minutes);
        if (cents === null) at('tasks', row, `price "${v.price}" is not a dollar amount`);
        if (minutes === null) at('tasks', row, `minutes "${v.minutes}" is not a whole number`);
        const task = {
            key: v.key,
            name: v.name,
            description: v.description,
            unit: v.unit,
            cents,
            minutes,
            areas: v.areas.split(/\s+/).filter(Boolean),
            options: []
        };
        if (tasks.has(v.key)) at('tasks', row, `task ${v.key} is listed twice`);
        else tasks.set(v.key, task);
        sheet.tasks.push(task);
    }

    for (const row of tables.task_options.rows) {
        const v = row.values;
        const task = tasks.get(v.task);
        if (!task) { at('task_options', row, `task "${v.task}" is not in tasks.csv`); continue; }
        const cents = parseDollars(v.price);
        const minutes = parseWhole(v.minutes);
        if (cents === null) at('task_options', row, `price "${v.price}" is not a dollar amount`);
        if (minutes === null) at('task_options', row, `minutes "${v.minutes}" is not a whole number`);
        task.options.push({ key: v.option, cents, minutes });
    }

    for (const row of tables.presets.rows) {
        const v = row.values;
        const entry = { task: v.task, options: v.options.split(/\s+/).filter(Boolean) };
        if (v.size) entry.size = v.size;
        if (v.quantity) {
            const q = parseWhole(v.quantity);
            if (q === null) at('presets', row, `quantity "${v.quantity}" is not a whole number`);
            else entry.quantity = q;
        }
        (sheet.presets[v.area] ||= []).push(entry);
    }

    if (problems.length) return { sheet: null, problems };
    const invalid = validateSheet(sheet);
    invalid.forEach((p) => problems.push(`sheet ${p}`));
    return { sheet: invalid.length ? null : sheet, problems };
}

/** The built JSON, byte for byte the same for the same sheet. */
export function serializeSheet(sheet) {
    return `${JSON.stringify(sheet, null, 2)}\n`;
}

// ---- Commands ---------------------------------------------------------------

async function readSources(dir) {
    const texts = {};
    for (const name of Object.keys(FILES)) {
        const file = path.join(dir, `${name}.csv`);
        texts[name] = existsSync(file) ? await readFile(file, 'utf8') : undefined;
    }
    return texts;
}

async function loadVersion(version, dirs, log) {
    if (!VERSION_PATTERN.test(String(version))) {
        log(`"${version}" is not a version name such as cleaning-2026-10.`);
        return null;
    }
    const dir = path.join(dirs.sources, version);
    if (!existsSync(dir)) {
        log(`There is no folder ${path.relative(ROOT, dir) || dir}.`);
        return null;
    }
    const texts = await readSources(dir);
    const missing = Object.keys(FILES).filter((n) => texts[n] === undefined);
    if (missing.length) {
        log(`${version} is missing ${missing.map((n) => `${n}.csv`).join(', ')}.`);
        return null;
    }
    const { sheet, problems } = sheetFromCsv(texts);
    if (!problems.length && sheet.version !== version) {
        problems.push(`settings.csv: version is ${sheet.version}, but the folder is ${version}`);
    }
    if (problems.length) {
        log(`${version} has ${problems.length} problem${problems.length > 1 ? 's' : ''}:`);
        problems.forEach((p) => log(`  ${p}`));
        return null;
    }
    return { sheet, texts };
}

async function check(version, dirs, log) {
    const loaded = await loadVersion(version, dirs, log);
    if (!loaded) return 1;
    const { sheet } = loaded;
    log(`${version} is valid: ${sheet.tasks.length} tasks, ${sheet.options.length} options, `
        + `${Object.keys(sheet.presets).length} presets.`);
    return 0;
}

async function build(version, dirs, log) {
    const loaded = await loadVersion(version, dirs, log);
    if (!loaded) return 1;
    const { sheet } = loaded;
    const json = serializeSheet(sheet);
    const out = path.join(dirs.out, `${version}.json`);
    await mkdir(dirs.out, { recursive: true });
    if (existsSync(out)) {
        const existing = await readFile(out, 'utf8');
        if (existing !== json) {
            log(`${version} is already published with different prices or tasks, and a published `
                + 'version never changes, because saved quotes name it. Make a new version instead '
                + '(adjust, or copy the folder under a new name).');
            return 1;
        }
        log(`${version} is already built and unchanged.`);
    } else {
        await writeFile(out, json);
        log(`Built ${path.relative(ROOT, out) || out}.`);
    }
    const indexFile = path.join(dirs.out, 'index.json');
    const index = existsSync(indexFile) ? JSON.parse(await readFile(indexFile, 'utf8')) : {};
    index[sheet.serviceType] = version;
    const sorted = Object.fromEntries(Object.keys(index).sort().map((k) => [k, index[k]]));
    await writeFile(indexFile, `${JSON.stringify(sorted, null, 2)}\n`);
    log(`index.json now sells ${version} for ${sheet.serviceType}.`);
    return 0;
}

async function adjust(from, to, percentText, stepText, dirs, log) {
    const bp = parsePercent(percentText);
    if (bp === null || bp <= -10000) {
        log(`"${percentText}" is not a percent such as 3 or 3.5.`);
        return 1;
    }
    const step = parseDollars(stepText);
    if (!step) {
        log(`"${stepText}" is not a rounding step such as 0.25.`);
        return 1;
    }
    if (!VERSION_PATTERN.test(String(to))) {
        log(`"${to}" is not a version name such as cleaning-2027-01.`);
        return 1;
    }
    const loaded = await loadVersion(from, dirs, log);
    if (!loaded) return 1;
    if (!to.startsWith(`${loaded.sheet.serviceType}-`)) {
        log(`${to} must begin with ${loaded.sheet.serviceType}-, like ${from}.`);
        return 1;
    }
    const dest = path.join(dirs.sources, to);
    if (existsSync(dest)) {
        log(`${to} already exists. Choose a new version name.`);
        return 1;
    }

    const raise = (text) => formatDollars(adjustCents(parseDollars(text), bp, step));
    const rewrite = (name, change) => {
        const table = readTable(loaded.texts[name], FILES[name]);
        const rows = [table.columns, ...table.rows.map((r) => table.columns.map((c) => change(c, r.values)))];
        return toCsv(rows);
    };

    await mkdir(dest, { recursive: true });
    await writeFile(path.join(dest, 'settings.csv'), rewrite('settings', (c, v) => {
        if (c !== 'value') return v[c];
        const key = v.key.toLowerCase();
        if (key === 'version') return to;
        if (key === 'visit_minimum') return raise(v.value);
        return v.value;
    }));
    await writeFile(path.join(dest, 'tasks.csv'), rewrite('tasks', (c, v) => (c === 'price' ? raise(v.price) : v[c])));
    await writeFile(path.join(dest, 'task_options.csv'), rewrite('task_options', (c, v) => (c === 'price' ? raise(v.price) : v[c])));
    await writeFile(path.join(dest, 'options.csv'), loaded.texts.options);
    await writeFile(path.join(dest, 'presets.csv'), loaded.texts.presets);

    const made = await loadVersion(to, dirs, () => {});
    log(`Wrote ${path.relative(ROOT, dest) || dest} with every price ${bp >= 0 ? 'raised' : 'lowered'} by `
        + `${Math.abs(bp) / 100}% and rounded to $${formatDollars(step)}. Minutes are unchanged.`);
    log(made ? 'Please review it, update effective in settings.csv, then run build.'
        : 'It does not validate yet. Run check on it to see why.');
    return 0;
}

/** Run one command. Returns the exit code. `dirs` and `log` are for tests. */
export async function run(argv, { dirs = DEFAULT_DIRS, log = (line) => console.log(line) } = {}) {
    const [command, ...rest] = argv;
    if (command === 'check' && rest.length === 1) return check(rest[0], dirs, log);
    if (command === 'build' && rest.length === 1) return build(rest[0], dirs, log);
    if (command === 'adjust') {
        const roundAt = rest.indexOf('--round');
        let stepText = '0.25';
        if (roundAt !== -1) {
            stepText = rest[roundAt + 1];
            rest.splice(roundAt, 2);
        }
        if (rest.length === 3 && stepText !== undefined) return adjust(rest[0], rest[1], rest[2], stepText, dirs, log);
    }
    log('Usage:');
    log('  node scripts/whitestone-prices.mjs check  <version>');
    log('  node scripts/whitestone-prices.mjs build  <version>');
    log('  node scripts/whitestone-prices.mjs adjust <from> <to> <percent> [--round 0.25]');
    if (dirs === DEFAULT_DIRS && existsSync(dirs.sources)) {
        const versions = (await readdir(dirs.sources, { withFileTypes: true }))
            .filter((e) => e.isDirectory()).map((e) => e.name).sort();
        if (versions.length) log(`Versions: ${versions.join(', ')}`);
    }
    return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    process.exitCode = await run(process.argv.slice(2));
}
