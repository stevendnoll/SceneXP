// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The price sheet (www/whitestone/js/sheet.js): what makes one valid, the
 * rule for a single task as chosen, the lookups, and loading a version. Plus
 * the sheet the studio actually ships with, held to the same rules and to
 * house style, since its names and descriptions are copy a visitor reads.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    validateSheet, checkChoice, taskOf, optionOf, optionsFor, tasksFor, presetFor,
    loadSheet, currentVersion, VERSION_PATTERN
} from '../www/whitestone/js/sheet.js';
import { TAXONOMY } from '../www/whitestone/js/taxonomy.js';

const ALL_AREAS = TAXONOMY.cleaning.areas.map((a) => a.key);

/** The smallest valid sheet: one task of each unit, two options. */
function fixture() {
    return {
        format: 1,
        serviceType: 'cleaning',
        version: 'cleaning-2026-10',
        effective: '2026-10-01',
        currency: 'USD',
        taxIncluded: false,
        visitMinimumCents: 12000,
        sizes: { small: 75, medium: 100, large: 150 },
        options: [
            { key: 'deep-clean', name: 'Deep clean', description: 'Extra time.' },
            { key: 'tracks', name: 'Tracks', description: 'Window tracks.' }
        ],
        tasks: [
            { key: 'stovetop', name: 'Stovetop', description: 'Burners.', unit: 'each', cents: 1000, minutes: 5,
                areas: ['kitchen'], options: [{ key: 'deep-clean', cents: 500, minutes: 5 }] },
            { key: 'windows', name: 'Windows', description: 'Per window.', unit: 'count', cents: 500, minutes: 4,
                areas: ['kitchen', 'bedroom'], options: [{ key: 'tracks', cents: 200, minutes: 2 }] },
            { key: 'vacuum', name: 'Vacuum', description: 'Floors.', unit: 'room', cents: 800, minutes: 6,
                areas: ALL_AREAS, options: [] }
        ],
        presets: {
            kitchen: [{ task: 'stovetop', options: ['deep-clean'] }, { task: 'vacuum', options: [], size: 'medium' }],
            bedroom: [{ task: 'windows', options: [], quantity: 2 }]
        }
    };
}

/** The fixture with one change, and the problems it then has. */
function problemsAfter(change) {
    const sheet = fixture();
    change(sheet);
    return validateSheet(sheet);
}

test('the fixture is valid, so every case below fails for its own reason', () => {
    expect(validateSheet(fixture())).toEqual([]);
});

describe('validateSheet refuses', () => {
    test.each([
        ['a sheet that is not an object', null, /not an object/],
        ['an array', [], /not an object/]
    ])('%s', (_name, sheet, pattern) => {
        expect(validateSheet(sheet).join(' ')).toMatch(pattern);
    });

    test.each([
        ['a future format', (s) => { s.format = 2; }, /^format/],
        ['an unknown service type', (s) => { s.serviceType = 'roofing'; s.version = 'roofing-2026-10'; }, /serviceType/],
        ['a version that is a path', (s) => { s.version = '../cleaning-2026-10'; }, /^version/],
        ['a version for another service', (s) => { s.version = 'landscaping-2026-10'; }, /begin with cleaning-/],
        ['a date that does not exist', (s) => { s.effective = '2026-02-30'; }, /^effective/],
        ['another currency', (s) => { s.currency = 'EUR'; }, /^currency/],
        ['tax as text', (s) => { s.taxIncluded = 'no'; }, /^taxIncluded/],
        ['a fractional minimum', (s) => { s.visitMinimumCents = 120.5; }, /^visitMinimumCents/],
        ['a negative minimum', (s) => { s.visitMinimumCents = -1; }, /^visitMinimumCents/],
        ['a missing size', (s) => { delete s.sizes.large; }, /^sizes\.large/],
        ['a size of zero', (s) => { s.sizes.small = 0; }, /^sizes\.small/],
        ['sizes that shrink as the room grows', (s) => { s.sizes.small = 120; }, /must not shrink/],
        ['an option with a bad key', (s) => { s.options[0].key = 'Deep Clean'; }, /is not a key/],
        ['an option listed twice', (s) => { s.options.push({ ...s.options[1] }); }, /option tracks: appears twice/],
        ['an option with no name', (s) => { s.options[0].name = ' '; }, /option deep-clean: needs a name/],
        ['a description too long', (s) => { s.options[0].description = 'x'.repeat(161); }, /needs a description/],
        ['an option no task uses', (s) => { s.options.push({ key: 'spare', name: 'Spare', description: '' }); }, /option spare: is not attached/],
        ['no tasks at all', (s) => { s.tasks = []; }, /^tasks/],
        ['a task listed twice', (s) => { s.tasks.push({ ...s.tasks[0] }); }, /task stovetop: appears twice/],
        ['a task with an unknown unit', (s) => { s.tasks[0].unit = 'hour'; }, /unit "hour"/],
        ['a price in dollars instead of cents', (s) => { s.tasks[0].cents = 10.5; }, /task stovetop: price/],
        ['a negative price', (s) => { s.tasks[0].cents = -100; }, /task stovetop: price/],
        ['a task that takes no time', (s) => { s.tasks[0].minutes = 0; }, /task stovetop: minutes/],
        ['a task offered nowhere', (s) => { s.tasks[0].areas = []; }, /at least one area/],
        ['a task in a room that does not exist', (s) => { s.tasks[0].areas = ['kitchen', 'moat']; }, /"moat" is not an area/],
        ['an area named twice', (s) => { s.tasks[0].areas = ['kitchen', 'kitchen']; }, /names an area twice/],
        ['an option not in the list', (s) => { s.tasks[0].options.push({ key: 'sparkle', cents: 1, minutes: 1 }); }, /"sparkle" is not in the options list/],
        ['an option attached twice', (s) => { s.tasks[0].options.push({ ...s.tasks[0].options[0] }); }, /option deep-clean appears twice/],
        ['an option with a fractional price', (s) => { s.tasks[0].options[0].cents = 4.99; }, /option deep-clean: price/],
        ['an option with negative minutes', (s) => { s.tasks[0].options[0].minutes = -1; }, /option deep-clean: minutes/],
        ['an area with nothing to order', (s) => { s.tasks[2].areas = ['kitchen']; }, /area bedroom: has no tasks|area entry: has no tasks/],
        ['presets that are a list', (s) => { s.presets = []; }, /^presets/],
        ['a preset for a room that does not exist', (s) => { s.presets.moat = [{ task: 'vacuum' }]; }, /preset moat: is not an area/],
        ['an empty preset', (s) => { s.presets.bedroom = []; }, /preset bedroom: must list/],
        ['a preset task not offered in its room', (s) => { s.presets.bedroom.push({ task: 'stovetop' }); }, /preset bedroom task stovetop: not-offered/],
        ['a preset with an option its task refuses', (s) => { s.presets.kitchen[0].options = ['tracks']; }, /unknown-option/],
        ['a preset sized per each', (s) => { s.presets.kitchen[0].size = 'large'; }, /size-not-allowed/],
        ['a preset with two of an each task', (s) => { s.presets.kitchen[0].quantity = 2; }, /quantity-not-allowed/],
        ['a preset task twice', (s) => { s.presets.kitchen.push({ task: 'stovetop' }); }, /preset kitchen task stovetop: appears twice/]
    ])('%s', (_name, change, pattern) => {
        const problems = problemsAfter(change);
        expect(problems.join('\n')).toMatch(pattern);
    });
});

describe('checkChoice', () => {
    const sheet = fixture();

    test('accepts a task as the sheet offers it', () => {
        expect(checkChoice(sheet, { task: 'stovetop', options: ['deep-clean'] }, 'kitchen')).toBeNull();
        expect(checkChoice(sheet, { task: 'windows', quantity: 3 }, 'bedroom')).toBeNull();
        expect(checkChoice(sheet, { task: 'vacuum', size: 'large' }, 'garage')).toBeNull();
        // A quantity of 1 is what every task means anyway.
        expect(checkChoice(sheet, { task: 'stovetop', quantity: 1 }, 'kitchen')).toBeNull();
        // Without an area, the room rule is not asked.
        expect(checkChoice(sheet, { task: 'stovetop' })).toBeNull();
    });

    test.each([
        [{ task: 'oven' }, 'kitchen', 'unknown-task'],
        [null, 'kitchen', 'unknown-task'],
        [{ task: 'stovetop' }, 'bedroom', 'not-offered'],
        [{ task: 'stovetop', options: 'deep-clean' }, 'kitchen', 'bad-options'],
        [{ task: 'stovetop', options: ['tracks'] }, 'kitchen', 'unknown-option'],
        [{ task: 'stovetop', options: ['deep-clean', 'deep-clean'] }, 'kitchen', 'repeated-option'],
        [{ task: 'windows', size: 'small' }, 'kitchen', 'size-not-allowed'],
        [{ task: 'vacuum', size: 'huge' }, 'kitchen', 'bad-size'],
        [{ task: 'stovetop', quantity: 2 }, 'kitchen', 'quantity-not-allowed'],
        [{ task: 'windows', quantity: 0 }, 'kitchen', 'bad-quantity'],
        [{ task: 'windows', quantity: 51 }, 'kitchen', 'bad-quantity'],
        [{ task: 'windows', quantity: 1.5 }, 'kitchen', 'bad-quantity']
    ])('%j in %s is %s', (choice, area, code) => {
        expect(checkChoice(sheet, choice, area)).toBe(code);
    });
});

describe('lookups', () => {
    const sheet = fixture();

    test('find tasks and options by key, and nothing for unknown keys', () => {
        expect(taskOf(sheet, 'stovetop').name).toBe('Stovetop');
        expect(taskOf(sheet, 'oven')).toBeNull();
        expect(optionOf(sheet, 'tracks').name).toBe('Tracks');
        expect(optionOf(sheet, 'sparkle')).toBeNull();
    });

    test("a task's options carry their names and that task's own amounts", () => {
        expect(optionsFor(sheet, 'stovetop')).toEqual([
            { key: 'deep-clean', name: 'Deep clean', description: 'Extra time.', cents: 500, minutes: 5 }
        ]);
        expect(optionsFor(sheet, 'oven')).toEqual([]);
    });

    test('tasks for a room, and its preset', () => {
        expect(tasksFor(sheet, 'bedroom').map((t) => t.key)).toEqual(['windows', 'vacuum']);
        expect(presetFor(sheet, 'bedroom')).toEqual([{ task: 'windows', options: [], quantity: 2 }]);
        expect(presetFor(sheet, 'garage')).toEqual([]);
        expect(presetFor(sheet, 'constructor')).toEqual([]);
    });
});

describe('loading', () => {
    const fetcher = (files) => {
        const asked = [];
        const fetchJson = async (url) => {
            asked.push(url);
            if (!(url in files)) throw new Error(`404 ${url}`);
            return JSON.parse(JSON.stringify(files[url]));
        };
        return { fetchJson, asked };
    };

    test('a valid version loads frozen, from its own address', async () => {
        const { fetchJson, asked } = fetcher({ 'data/prices/cleaning-2026-10.json': fixture() });
        const sheet = await loadSheet('cleaning-2026-10', fetchJson);
        expect(asked).toEqual(['data/prices/cleaning-2026-10.json']);
        expect(Object.isFrozen(sheet.tasks[0].options[0])).toBe(true);
    });

    test('a version name that could reach another file is refused before any fetch', async () => {
        const { fetchJson, asked } = fetcher({});
        for (const bad of ['../secret', 'cleaning-2026-10.json', 'cleaning-2026-10/x', '', null]) {
            await expect(loadSheet(bad, fetchJson)).rejects.toThrow(/is not a price sheet version/);
        }
        expect(asked).toEqual([]);
    });

    test('an invalid sheet, or a file holding another version, is refused with its problems', async () => {
        const broken = { ...fixture(), currency: 'EUR' };
        await expect(loadSheet('cleaning-2026-10', fetcher({ 'data/prices/cleaning-2026-10.json': broken }).fetchJson))
            .rejects.toThrow(/currency: must be USD/);
        await expect(loadSheet('cleaning-2026-11', fetcher({ 'data/prices/cleaning-2026-11.json': fixture() }).fetchJson))
            .rejects.toThrow(/the file says cleaning-2026-10/);
    });

    test('the current version comes from index.json, and only a real version is accepted', async () => {
        expect(await currentVersion('cleaning', fetcher({ 'data/prices/index.json': { cleaning: 'cleaning-2026-10' } }).fetchJson))
            .toBe('cleaning-2026-10');
        for (const index of [{}, { cleaning: '../x' }, { cleaning: 'landscaping-2026-10' }, null]) {
            await expect(currentVersion('cleaning', fetcher({ 'data/prices/index.json': index }).fetchJson))
                .rejects.toThrow(/No current price sheet/);
        }
    });

    test('versions look like cleaning-2026-10', () => {
        expect(VERSION_PATTERN.test('cleaning-2026-10')).toBe(true);
        expect(VERSION_PATTERN.test('cleaning-2026-10-b')).toBe(true);
        expect(VERSION_PATTERN.test('cleaning-26-10')).toBe(false);
    });
});

describe('the sheet the studio ships with', () => {
    const dir = join(process.cwd(), 'www', 'whitestone', 'data', 'prices');
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
    const sheet = JSON.parse(readFileSync(join(dir, `${index.cleaning}.json`), 'utf8'));

    test('is valid, and is the version index.json sells', () => {
        expect(validateSheet(sheet)).toEqual([]);
        expect(sheet.version).toBe(index.cleaning);
    });

    test('has a preset for every room, and roughly the menu the plan asked for', () => {
        expect(Object.keys(sheet.presets).sort()).toEqual([...ALL_AREAS].sort());
        expect(sheet.tasks.length).toBeGreaterThanOrEqual(40);
        expect(sheet.options.length).toBe(8);
    });

    test('its names and descriptions keep house style', () => {
        const copy = [...sheet.tasks, ...sheet.options].flatMap((x) => [x.name, x.description]);
        const british = /\b(colours?|favourites?|centres?|grey|metres?|organis\w*|cheques?|rubbish|tyres?)\b/i;
        for (const line of copy) {
            expect(`${line}: ${/—|;/.test(line)}`).toBe(`${line}: false`);
            expect(`${line}: ${british.test(line)}`).toBe(`${line}: false`);
        }
    });
});
