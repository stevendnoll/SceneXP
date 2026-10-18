// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The price sheet build script (scripts/whitestone-prices.mjs): dollars read
 * as text, the CSVs turned into a sheet with every problem pointing at its
 * file and line, and the three commands run against a temporary copy of the
 * real sources. Above all, a published version is never overwritten.
 *
 * It also holds the committed sheet to its source: the JSON in www/ must be
 * exactly what `build` makes from the CSVs, or somebody edited one without
 * the other.
 */
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    parseDollars, formatDollars, parseWhole, parseBool, parsePercent, adjustCents,
    sheetFromCsv, serializeSheet, run, FILES
} from '../scripts/whitestone-prices.mjs';

const SOURCE = join(process.cwd(), 'scripts', 'whitestone', 'prices', 'cleaning-2026-10');
const BUILT = join(process.cwd(), 'www', 'whitestone', 'data', 'prices', 'cleaning-2026-10.json');
const readSource = () => Object.fromEntries(Object.keys(FILES).map((n) => [n, readFileSync(join(SOURCE, `${n}.csv`), 'utf8')]));

describe('reading values', () => {
    test('dollars are read as text, never as a float', () => {
        expect(parseDollars('10.00')).toBe(1000);
        expect(parseDollars('10.5')).toBe(1050);
        expect(parseDollars('$10.25')).toBe(1025);
        expect(parseDollars(' 7 ')).toBe(700);
        expect(parseDollars('1,250.00')).toBe(125000);
        expect(parseDollars('0.29')).toBe(29);      // 0.29 * 100 is 28.999... as a float
        expect(parseDollars('4.35')).toBe(435);     // and 4.35 * 100 is 434.999...
        for (const bad of ['', 'ten', '10.255', '-5', '1,25', '10.', '.5', '12345678']) {
            expect(`${bad}: ${parseDollars(bad)}`).toBe(`${bad}: null`);
        }
    });

    test('cents are written back the way a spreadsheet shows them', () => {
        expect(formatDollars(1025)).toBe('10.25');
        expect(formatDollars(18600)).toBe('186.00');
        expect(formatDollars(5)).toBe('0.05');
    });

    test('whole numbers, yes and no, and percents', () => {
        expect(parseWhole('15')).toBe(15);
        expect(parseWhole('1.5')).toBeNull();
        expect(parseWhole('-1')).toBeNull();
        expect(parseBool('TRUE')).toBe(true);
        expect(parseBool('no')).toBe(false);
        expect(parseBool('maybe')).toBeNull();
        expect(parsePercent('3')).toBe(300);
        expect(parsePercent('3.5')).toBe(350);
        expect(parsePercent('-2.25')).toBe(-225);
        expect(parsePercent('3%')).toBeNull();
    });

    test('a raise rounds half up to the friendly step, and nothing goes below zero', () => {
        expect(adjustCents(1000, 300, 25)).toBe(1025);   // $10.30 to the nearest quarter
        expect(adjustCents(1000, 500, 25)).toBe(1050);
        expect(adjustCents(1000, 125, 25)).toBe(1025);   // exactly $10.125 rounds up
        expect(adjustCents(999, 0, 25)).toBe(1000);
        expect(adjustCents(1000, 300, 100)).toBe(1000);
        expect(adjustCents(0, 500, 25)).toBe(0);         // a free option stays free
        expect(adjustCents(1000, -2000, 25)).toBe(800);
    });
});

describe('the CSVs into a sheet', () => {
    test('the committed JSON is exactly what build makes from the committed CSVs', () => {
        const { sheet, problems } = sheetFromCsv(readSource());
        expect(problems).toEqual([]);
        expect(serializeSheet(sheet)).toBe(readFileSync(BUILT, 'utf8'));
    });

    test.each([
        ['a price that is not dollars', 'tasks', (t) => t.replace('stovetop,Stovetop,"Burners, grates and the surface around them, wiped clean.",each,10.00',
            'stovetop,Stovetop,"Burners, grates and the surface around them, wiped clean.",each,ten'), /^tasks\.csv line 2: price "ten"/],
        ['an unknown setting', 'settings', (t) => `${t}colour,blue\r\n`, /settings\.csv line 11: unknown setting "colour"/],
        ['a missing setting', 'settings', (t) => t.replace(/visit_minimum,[^\r\n]*\r\n/, ''), /missing setting visit_minimum/],
        ['a setting given twice', 'settings', (t) => `${t}currency,USD\r\n`, /currency is set twice/],
        ['a bad setting value', 'settings', (t) => t.replace('tax_included,false', 'tax_included,sometimes'), /tax_included "sometimes"/],
        ['an option on a task that does not exist', 'task_options', (t) => `${t}oven,deep-clean,1.00,1\r\n`, /task_options\.csv line \d+: task "oven"/],
        ['a preset quantity in words', 'presets', (t) => `${t}gym,mirrors,,,two\r\n`, /presets\.csv line \d+: quantity "two"/],
        ['a renamed column', 'options', (t) => t.replace('key,name,description', 'key,title,description'), /options\.csv line 1: missing column name/],
        ['a task twice', 'tasks', (t) => `${t}toilet,Toilet,Again,each,1.00,1,bathroom\r\n`, /task toilet is listed twice/],
        ['a problem only the sheet rules see', 'tasks', (t) => t.replace(',each,30.00,25,kitchen', ',each,30.00,25,moat'), /^sheet task oven-interior: "moat" is not an area/m]
    ])('%s is reported where it is', (_name, file, change, pattern) => {
        const texts = readSource();
        texts[file] = change(texts[file]);
        const { sheet, problems } = sheetFromCsv(texts);
        expect(sheet).toBeNull();
        expect(problems.join('\n')).toMatch(pattern);
    });

    test('a missing file is a problem, not a crash', () => {
        const texts = readSource();
        delete texts.presets;
        expect(sheetFromCsv(texts).problems).toEqual(['presets.csv the file is empty']);
    });
});

describe('the commands', () => {
    let root;
    let dirs;
    let lines;
    const log = (line) => lines.push(line);
    const said = () => lines.join('\n');

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'whitestone-prices-'));
        dirs = { sources: join(root, 'sources'), out: join(root, 'out') };
        mkdirSync(dirs.sources);
        cpSync(SOURCE, join(dirs.sources, 'cleaning-2026-10'), { recursive: true });
        lines = [];
    });

    afterEach(() => rmSync(root, { recursive: true, force: true }));

    test('check passes the real sheet and says what is in it', async () => {
        expect(await run(['check', 'cleaning-2026-10'], { dirs, log })).toBe(0);
        expect(said()).toMatch(/cleaning-2026-10 is valid: 48 tasks, 8 options, 24 presets/);
    });

    test('check lists every problem and exits 1', async () => {
        const file = join(dirs.sources, 'cleaning-2026-10', 'tasks.csv');
        writeFileSync(file, readFileSync(file, 'utf8').replace(',each,10.00,5,kitchen', ',each,ten,5,kitchen'));
        expect(await run(['check', 'cleaning-2026-10'], { dirs, log })).toBe(1);
        expect(said()).toMatch(/1 problem:\n {2}tasks\.csv line 2: price "ten"/);
    });

    test('check refuses a folder that is not the version its settings name', async () => {
        cpSync(join(dirs.sources, 'cleaning-2026-10'), join(dirs.sources, 'cleaning-2026-11'), { recursive: true });
        expect(await run(['check', 'cleaning-2026-11'], { dirs, log })).toBe(1);
        expect(said()).toMatch(/version is cleaning-2026-10, but the folder is cleaning-2026-11/);
    });

    test('check refuses a name that is not a version, and a version with no folder', async () => {
        expect(await run(['check', '../etc'], { dirs, log })).toBe(1);
        expect(await run(['check', 'cleaning-2030-01'], { dirs, log })).toBe(1);
        expect(said()).toMatch(/is not a version name[\s\S]*There is no folder/);
    });

    test('build writes the version and points index.json at it, and building again changes nothing', async () => {
        expect(await run(['build', 'cleaning-2026-10'], { dirs, log })).toBe(0);
        const built = readFileSync(join(dirs.out, 'cleaning-2026-10.json'), 'utf8');
        expect(built).toBe(readFileSync(BUILT, 'utf8'));
        expect(JSON.parse(readFileSync(join(dirs.out, 'index.json'), 'utf8'))).toEqual({ cleaning: 'cleaning-2026-10' });
        expect(await run(['build', 'cleaning-2026-10'], { dirs, log })).toBe(0);
        expect(said()).toMatch(/already built and unchanged/);
    });

    test('A PUBLISHED VERSION IS NEVER OVERWRITTEN', async () => {
        expect(await run(['build', 'cleaning-2026-10'], { dirs, log })).toBe(0);
        const before = readFileSync(join(dirs.out, 'cleaning-2026-10.json'), 'utf8');
        const file = join(dirs.sources, 'cleaning-2026-10', 'tasks.csv');
        writeFileSync(file, readFileSync(file, 'utf8').replace(',each,10.00,5,kitchen', ',each,11.00,5,kitchen'));
        expect(await run(['build', 'cleaning-2026-10'], { dirs, log })).toBe(1);
        expect(said()).toMatch(/already published with different prices/);
        expect(readFileSync(join(dirs.out, 'cleaning-2026-10.json'), 'utf8')).toBe(before);
    });

    test('build keeps the other service types in index.json', async () => {
        mkdirSync(dirs.out);
        writeFileSync(join(dirs.out, 'index.json'), JSON.stringify({ landscaping: 'landscaping-2026-09' }));
        expect(await run(['build', 'cleaning-2026-10'], { dirs, log })).toBe(0);
        expect(JSON.parse(readFileSync(join(dirs.out, 'index.json'), 'utf8')))
            .toEqual({ cleaning: 'cleaning-2026-10', landscaping: 'landscaping-2026-09' });
    });

    test('a build that fails its check writes nothing', async () => {
        const file = join(dirs.sources, 'cleaning-2026-10', 'settings.csv');
        writeFileSync(file, readFileSync(file, 'utf8').replace('currency,USD', 'currency,EUR'));
        expect(await run(['build', 'cleaning-2026-10'], { dirs, log })).toBe(1);
        expect(existsSync(dirs.out)).toBe(false);
    });

    test('adjust makes a new version with every price raised, and nothing else changed', async () => {
        expect(await run(['adjust', 'cleaning-2026-10', 'cleaning-2027-01', '3', '--round', '0.25'], { dirs, log })).toBe(0);
        expect(said()).toMatch(/raised by 3% and rounded to \$0\.25\. Minutes are unchanged/);
        expect(said()).toMatch(/Please review it/);

        const old = sheetFromCsv(readSource()).sheet;
        const texts = Object.fromEntries(Object.keys(FILES).map((n) =>
            [n, readFileSync(join(dirs.sources, 'cleaning-2027-01', `${n}.csv`), 'utf8')]));
        const { sheet, problems } = sheetFromCsv(texts);
        expect(problems).toEqual([]);
        expect(sheet.version).toBe('cleaning-2027-01');
        expect(sheet.visitMinimumCents).toBe(adjustCents(old.visitMinimumCents, 300, 25));
        sheet.tasks.forEach((t, i) => {
            expect(t.cents).toBe(adjustCents(old.tasks[i].cents, 300, 25));
            expect(t.minutes).toBe(old.tasks[i].minutes);
            t.options.forEach((o, j) => expect(o.cents).toBe(adjustCents(old.tasks[i].options[j].cents, 300, 25)));
        });
        expect(sheet.presets).toEqual(old.presets);
        expect(sheet.options).toEqual(old.options);
        // The old version is untouched.
        expect(sheetFromCsv(readSource()).sheet).toEqual(old);
    });

    test('adjust refuses an existing version, a bad percent, a bad step, and another service type', async () => {
        expect(await run(['adjust', 'cleaning-2026-10', 'cleaning-2026-10', '3'], { dirs, log })).toBe(1);
        expect(await run(['adjust', 'cleaning-2026-10', 'cleaning-2027-01', '3%'], { dirs, log })).toBe(1);
        expect(await run(['adjust', 'cleaning-2026-10', 'cleaning-2027-01', '3', '--round', 'nickel'], { dirs, log })).toBe(1);
        expect(await run(['adjust', 'cleaning-2026-10', 'landscaping-2027-01', '3'], { dirs, log })).toBe(1);
        expect(await run(['adjust', 'cleaning-2026-10', 'not a version', '3'], { dirs, log })).toBe(1);
        expect(existsSync(join(dirs.sources, 'cleaning-2027-01'))).toBe(false);
        expect(existsSync(join(dirs.sources, 'landscaping-2027-01'))).toBe(false);
    });

    test('anything else prints the usage and exits 2', async () => {
        expect(await run([], { dirs, log })).toBe(2);
        expect(await run(['build'], { dirs, log })).toBe(2);
        expect(await run(['adjust', 'cleaning-2026-10', 'cleaning-2027-01', '3', '--round'], { dirs, log })).toBe(2);
        expect(said()).toMatch(/Usage:/);
    });
});
