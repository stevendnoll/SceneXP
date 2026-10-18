// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The pricing engine (www/whitestone/js/pricing.js).
 *
 * Exact arithmetic first, on a small fixture sheet whose odd amounts make the
 * rounding rule show. Then THE GUARANTEE as properties (PLANNING 5.2), on the
 * sheet the studio really ships, across thousands of random homes and visits:
 *
 *   - the bill never exceeds the locked quote plus approved add-ons,
 *   - marking any task skipped never raises the bill,
 *   - nothing done costs nothing,
 *   - the quote ignores order, notes, photos, preferences and stars,
 *   - an item the sheet cannot price is an error, never a silent price,
 *   - every preset builds a priced room.
 *
 * Each trial draws from its own well-mixed seed, not from one stream or from
 * neighboring seeds, which can correlate (a house lesson from X's and O's).
 * A failure names its trial, and `trial(n)` replays exactly that home.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    roundHalfUp, isLive, priceChoice, priceItem, roundMinutes, quoteChecklist, lockQuote,
    billVisit, priceAddOn, formatMoney, spokenMoney, formatMinutes
} from '../www/whitestone/js/pricing.js';
import { tasksFor, presetFor, taskOf } from '../www/whitestone/js/sheet.js';
import { TAXONOMY } from '../www/whitestone/js/taxonomy.js';

// ---- A small sheet with awkward numbers -------------------------------------

const FIX = {
    format: 1, serviceType: 'cleaning', version: 'cleaning-2026-10', effective: '2026-10-01', currency: 'USD',
    taxIncluded: false, visitMinimumCents: 5000,
    sizes: { small: 75, medium: 100, large: 150 },
    options: [{ key: 'deep-clean', name: 'Deep clean', description: '' }, { key: 'edges', name: 'Edges', description: '' }],
    tasks: [
        { key: 'stovetop', name: 'Stovetop', description: '', unit: 'each', cents: 1000, minutes: 5,
            areas: ['kitchen'], options: [{ key: 'deep-clean', cents: 500, minutes: 5 }] },
        { key: 'windows', name: 'Windows', description: '', unit: 'count', cents: 499, minutes: 4,
            areas: ['kitchen', 'bedroom'], options: [] },
        { key: 'mop', name: 'Mop', description: '', unit: 'room', cents: 333, minutes: 7,
            areas: ['kitchen', 'bedroom'], options: [{ key: 'edges', cents: 2, minutes: 1 }] }
    ],
    presets: { kitchen: [{ task: 'stovetop' }] }
};

const ROOMS = [{ id: 'k', level: 'main', area: 'kitchen' }, { id: 'b', level: 'second', area: 'bedroom' }];

describe('arithmetic', () => {
    test('half up, in whole numbers', () => {
        expect(roundHalfUp(3, 2)).toBe(2);       // 1.5
        expect(roundHalfUp(5, 2)).toBe(3);       // 2.5
        expect(roundHalfUp(24975, 100)).toBe(250);
        expect(roundHalfUp(24949, 100)).toBe(249);
        expect(roundHalfUp(0, 7)).toBe(0);
    });

    test('a task, its options, its size and its quantity', () => {
        expect(priceChoice(FIX, { task: 'stovetop' }, 'kitchen')).toEqual({ cents: 1000, minutes: 5 });
        expect(priceChoice(FIX, { task: 'stovetop', options: ['deep-clean'] }, 'kitchen')).toEqual({ cents: 1500, minutes: 10 });
        expect(priceChoice(FIX, { task: 'windows', quantity: 3 }, 'kitchen')).toEqual({ cents: 1497, minutes: 12 });
        // Medium is the size when none is chosen.
        expect(priceChoice(FIX, { task: 'mop' }, 'kitchen')).toEqual({ cents: 333, minutes: 7 });
        // 333 at 75% is 249.75 cents, and 7 minutes is 5.25: rounded, not truncated.
        expect(priceChoice(FIX, { task: 'mop', size: 'small' }, 'kitchen')).toEqual({ cents: 250, minutes: 5 });
        // The option joins the unit before the size factor: (333 + 2) at 150% is 502.5.
        expect(priceChoice(FIX, { task: 'mop', size: 'large', options: ['edges'] }, 'kitchen')).toEqual({ cents: 503, minutes: 12 });
    });

    test('an item is priced in its own room, and an item in no room is an error', () => {
        expect(priceItem(FIX, { task: 'stovetop', roomId: 'k' }, ROOMS)).toEqual({ cents: 1000, minutes: 5 });
        expect(priceItem(FIX, { task: 'stovetop', roomId: 'b' }, ROOMS)).toEqual({ error: 'not-offered' });
        expect(priceItem(FIX, { task: 'stovetop', roomId: 'x' }, ROOMS)).toEqual({ error: 'unknown-room' });
        expect(priceItem(FIX, { task: 'stovetop', roomId: 'k' }, undefined)).toEqual({ error: 'unknown-room' });
    });

    test('display minutes round to the nearest 5, and any work shows at least 5', () => {
        expect([0, 1, 2, 3, 7, 8, 152, 153, 155].map(roundMinutes)).toEqual([0, 5, 5, 5, 5, 10, 150, 155, 155]);
    });
});

describe('the quote', () => {
    const doc = (items) => ({ rooms: ROOMS, items });

    test('totals live items only, and tops up to the visit minimum', () => {
        const q = quoteChecklist(FIX, doc([
            { id: 'a', roomId: 'k', task: 'stovetop', options: ['deep-clean'] },
            { id: 'b', roomId: 'b', task: 'windows', quantity: 2 },
            { id: 'c', roomId: 'k', task: 'mop', deletedAt: '2026-10-12T10:00:00Z' }
        ]));
        expect(q.lines).toEqual([{ itemId: 'a', cents: 1500, minutes: 10 }, { itemId: 'b', cents: 998, minutes: 8 }]);
        expect(q.errors).toEqual([]);
        expect(q.subtotalCents).toBe(2498);
        expect(q.topUpCents).toBe(2502);
        expect(q.totalCents).toBe(5000);
        expect(q.minutes).toBe(18);
        expect(q.displayMinutes).toBe(20);
        expect(q.sheetVersion).toBe('cleaning-2026-10');
    });

    test('no top-up once the minimum is met, and none on an empty checklist', () => {
        const big = quoteChecklist(FIX, doc([{ id: 'a', roomId: 'b', task: 'windows', quantity: 20 }]));
        expect(big.topUpCents).toBe(0);
        expect(big.totalCents).toBe(9980);
        const empty = quoteChecklist(FIX, doc([]));
        expect([empty.subtotalCents, empty.topUpCents, empty.totalCents]).toEqual([0, 0, 0]);
        expect(quoteChecklist(FIX, null).totalCents).toBe(0);
    });

    test('an item the sheet cannot price is listed as an error and left out of the totals', () => {
        const q = quoteChecklist(FIX, doc([
            { id: 'ok', roomId: 'k', task: 'stovetop' },
            { id: 'opt', roomId: 'k', task: 'stovetop', options: ['edges'] },
            { id: 'size', roomId: 'k', task: 'stovetop', size: 'large' },
            { id: 'task', roomId: 'k', task: 'chandelier' },
            { id: 'room', roomId: 'b', task: 'stovetop' }
        ]));
        expect(q.errors).toEqual([
            { itemId: 'opt', error: 'unknown-option' },
            { itemId: 'size', error: 'size-not-allowed' },
            { itemId: 'task', error: 'unknown-task' },
            { itemId: 'room', error: 'not-offered' }
        ]);
        expect(q.subtotalCents).toBe(1000);
    });

    test('locking keeps the totals and the version, and nothing else', () => {
        const q = quoteChecklist(FIX, doc([{ id: 'a', roomId: 'k', task: 'stovetop' }]));
        expect(lockQuote(q, '2026-10-12T10:00:00Z')).toEqual({
            sheetVersion: 'cleaning-2026-10', subtotalCents: 1000, topUpCents: 4000, totalCents: 5000,
            minutes: 5, lockedAt: '2026-10-12T10:00:00Z'
        });
    });

    test('isLive', () => {
        expect(isLive({})).toBe(true);
        expect(isLive({ deletedAt: null })).toBe(true);
        expect(isLive({ deletedAt: 'x' })).toBe(false);
        expect(isLive(null)).toBe(false);
    });
});

describe('the bill', () => {
    const published = {
        rooms: ROOMS,
        items: [
            { id: 'a', roomId: 'k', task: 'stovetop' },
            { id: 'b', roomId: 'b', task: 'windows', quantity: 2 },
            { id: 'gone', roomId: 'k', task: 'mop', deletedAt: 'x' }
        ]
    };
    const quote = lockQuote(quoteChecklist(FIX, published), 'now');

    test('done tasks plus the agreed top-up', () => {
        const bill = billVisit(FIX, quote, published, { results: [{ itemId: 'a', status: 'done' }, { itemId: 'b', status: 'skipped' }] });
        expect(bill).toEqual({ doneCents: 1000, addOnCents: 0, topUpCents: quote.topUpCents, billedCents: 1000 + quote.topUpCents, errors: [] });
    });

    test('nothing done is nothing billed, top-up included', () => {
        const bill = billVisit(FIX, quote, published, { results: [{ itemId: 'a', status: 'skipped' }, { itemId: 'b', status: 'not-reached' }] });
        expect(bill.billedCents).toBe(0);
        expect(bill.topUpCents).toBe(0);
        expect(billVisit(FIX, quote, published, {}).billedCents).toBe(0);
    });

    test('a task reported done twice is billed once, and a removed or unknown task not at all', () => {
        const bill = billVisit(FIX, quote, published, { results: [
            { itemId: 'a', status: 'done' }, { itemId: 'a', status: 'done' },
            { itemId: 'gone', status: 'done' }, { itemId: 'ghost', status: 'done' }, null
        ] });
        expect(bill.doneCents).toBe(1000);
        expect(bill.errors).toEqual([{ itemId: 'gone', error: 'unknown-item' }, { itemId: 'ghost', error: 'unknown-item' }]);
    });

    test('only approved add-ons that were done are billed, each once', () => {
        const visit = { results: [], addOns: [
            { id: 'x1', roomId: 'k', task: 'mop', size: 'large', status: 'approved', done: true },
            { id: 'x1', roomId: 'k', task: 'mop', size: 'large', status: 'approved', done: true },
            { id: 'x2', roomId: 'k', task: 'mop', status: 'approved', done: false },
            { id: 'x3', roomId: 'k', task: 'mop', status: 'proposed', done: true },
            { id: 'x4', roomId: 'k', task: 'mop', status: 'declined', done: true },
            { id: 'x5', itemId: 'a', options: ['deep-clean'], status: 'approved', done: true }
        ] };
        const bill = billVisit(FIX, quote, published, visit);
        // Mop large is 333 at 150%, 499.5, so 500. The deep clean upgrade adds 500.
        expect(bill.addOnCents).toBe(1000);
        // An add-on done counts as work done, so the agreed top-up applies.
        expect(bill.topUpCents).toBe(quote.topUpCents);
        expect(bill.billedCents).toBe(1000 + quote.topUpCents);
    });

    test('an add-on the sheet cannot price is an error, never a charge', () => {
        const items = new Map(published.items.map((i) => [i.id, i]));
        expect(priceAddOn(FIX, { itemId: 'a', options: [] }, ROOMS, items)).toEqual({ error: 'empty-upgrade' });
        expect(priceAddOn(FIX, { itemId: 'zz', options: ['deep-clean'] }, ROOMS, items)).toEqual({ error: 'unknown-item' });
        expect(priceAddOn(FIX, { itemId: 'a', options: ['edges'] }, ROOMS, items)).toEqual({ error: 'unknown-option' });
        expect(priceAddOn(FIX, { itemId: 'a', options: ['deep-clean'] }, ROOMS, null)).toEqual({ error: 'unknown-item' });
        expect(priceAddOn(FIX, { roomId: 'nope', task: 'mop' }, ROOMS, items)).toEqual({ error: 'unknown-room' });
        const bill = billVisit(FIX, quote, published, { addOns: [{ id: 'y', roomId: 'b', task: 'stovetop', status: 'approved', done: true }] });
        expect(bill.billedCents).toBe(0);
        expect(bill.errors).toEqual([{ addOnId: 'y', error: 'not-offered' }]);
    });

    test('a bill is only ever priced on the locked quote\'s own sheet', () => {
        const other = { ...FIX, version: 'cleaning-2026-11' };
        const bill = billVisit(other, quote, published, { results: [{ itemId: 'a', status: 'done' }] });
        expect(bill.billedCents).toBe(0);
        expect(bill.errors).toEqual([{ error: 'wrong-sheet' }]);
        expect(billVisit(FIX, null, published, {}).errors).toEqual([{ error: 'wrong-sheet' }]);
    });
});

describe('on screen', () => {
    test('money', () => {
        expect(formatMoney(1250)).toBe('$12.50');
        expect(formatMoney(18600)).toBe('$186');
        expect(formatMoney(5)).toBe('$0.05');
        expect(formatMoney(0)).toBe('$0');
        expect(formatMoney(123456789)).toBe('$1,234,567.89');
        expect(formatMoney(-500)).toBe('-$5');
    });

    test('money as a screen reader says it', () => {
        expect(spokenMoney(18600)).toBe('186 dollars');
        expect(spokenMoney(1250)).toBe('12 dollars and 50 cents');
        expect(spokenMoney(100)).toBe('1 dollar');
        expect(spokenMoney(101)).toBe('1 dollar and 1 cent');
        expect(spokenMoney(50)).toBe('50 cents');
        expect(spokenMoney(0)).toBe('0 dollars');
        expect(spokenMoney(150000)).toBe('1,500 dollars');
        expect(spokenMoney(-500)).toBe('minus 5 dollars');
    });

    test('time', () => {
        expect(formatMinutes(155)).toBe('about 2 hours 35 minutes');
        expect(formatMinutes(152)).toBe('about 2 hours 30 minutes');
        expect(formatMinutes(60)).toBe('about 1 hour');
        expect(formatMinutes(63)).toBe('about 1 hour 5 minutes');
        expect(formatMinutes(44)).toBe('about 45 minutes');
        expect(formatMinutes(1)).toBe('about 5 minutes');
        expect(formatMinutes(0)).toBe('0 minutes');
    });

    test('nothing printed here breaks house style', () => {
        const lines = [formatMinutes(155), spokenMoney(1250), formatMoney(1250)];
        for (const l of lines) expect(l).not.toMatch(/—|;/);
    });
});

// ---- The guarantee, as properties, on the shipped sheet ----------------------

const prices = join(process.cwd(), 'www', 'whitestone', 'data', 'prices');
const SHEET = JSON.parse(readFileSync(join(prices, `${JSON.parse(readFileSync(join(prices, 'index.json'), 'utf8')).cleaning}.json`), 'utf8'));
const AREAS = TAXONOMY.cleaning.areas.map((a) => a.key);
const TRIALS = 2000;

/** A well-mixed 32-bit seed for trial n (splitmix32's finalizer), so trial
 *  seeds share no structure. */
function seedFor(n) {
    let z = (n + 0x9E3779B9) >>> 0;
    z = Math.imul(z ^ (z >>> 16), 0x85EBCA6B) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xC2B2AE35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
}

/** mulberry32: a small, good generator for one trial's stream. */
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

/** One random home, its quote, and one random visit, for trial n. */
function trial(n) {
    const r = rng(seedFor(n));
    const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    const pick = (list) => list[int(0, list.length - 1)];

    const rooms = [];
    const roomCount = int(1, 8);
    for (let i = 0; i < roomCount; i++) rooms.push({ id: `r${i}`, level: 'main', area: pick(AREAS) });
    const items = [];
    const itemCount = int(0, 30);
    for (let i = 0; i < itemCount; i++) {
        const room = pick(rooms);
        const task = pick(tasksFor(SHEET, room.area));
        const item = { id: `i${i}`, roomId: room.id, task: task.key, options: task.options.filter(() => r() < 0.4).map((o) => o.key) };
        if (task.unit === 'room' && r() < 0.7) item.size = pick(['small', 'medium', 'large']);
        if (task.unit === 'count') item.quantity = int(1, 6);
        if (r() < 0.3) item.important = true;
        if (r() < 0.3) item.notes = 'Please use the blue cloth';
        if (r() < 0.2) item.photos = ['p1'];
        if (r() < 0.1) item.deletedAt = '2026-10-12T10:00:00Z';
        items.push(item);
    }
    const doc = { rooms, items, preferences: { keys: r() < 0.5 ? ['pet-safe'] : [], note: '' } };
    const quote = quoteChecklist(SHEET, doc);

    const statuses = ['done', 'skipped', 'not-reached'];
    const results = items.filter(() => r() < 0.9).map((i) => ({ itemId: i.id, status: pick(statuses) }));
    if (r() < 0.2 && results.length) results.push({ ...pick(results) });      // a duplicate report
    if (r() < 0.1) results.push({ itemId: 'ghost', status: 'done' });
    const addOns = [];
    const addOnCount = int(0, 3);
    for (let i = 0; i < addOnCount; i++) {
        const status = pick(['proposed', 'approved', 'declined', 'lapsed']);
        const live = items.filter(isLive);
        if (r() < 0.5 && live.length) {
            const item = pick(live);
            const spare = taskOf(SHEET, item.task).options.map((o) => o.key).filter((k) => !item.options.includes(k));
            addOns.push({ id: `a${i}`, itemId: item.id, options: spare.slice(0, 1), status, done: r() < 0.7 });
        } else {
            const room = pick(rooms);
            const task = pick(tasksFor(SHEET, room.area));
            addOns.push({ id: `a${i}`, roomId: room.id, task: task.key, options: [],
                quantity: task.unit === 'count' ? int(1, 3) : undefined, status, done: r() < 0.7 });
        }
    }
    return { doc, quote, visit: { results, addOns } };
}

describe(`the guarantee, across ${TRIALS} random homes and visits`, () => {
    const trials = Array.from({ length: TRIALS }, (_, n) => ({ n, ...trial(n) }));

    test('every random home prices cleanly, so the properties below are about real quotes', () => {
        const broken = trials.filter((t) => t.quote.errors.length).map((t) => t.n);
        expect(broken).toEqual([]);
        expect(trials.filter((t) => t.quote.lines.length > 5).length).toBeGreaterThan(TRIALS / 2);
    });

    test('the bill never exceeds the locked quote plus approved add-ons', () => {
        const over = [];
        for (const t of trials) {
            const bill = billVisit(SHEET, t.quote, t.doc, t.visit);
            if (bill.billedCents > t.quote.totalCents + bill.addOnCents) over.push(t.n);
            if (bill.doneCents > t.quote.subtotalCents) over.push(t.n);
        }
        expect(over).toEqual([]);
    });

    test('marking any one task skipped never raises the bill', () => {
        const raised = [];
        let checked = 0;
        for (const t of trials) {
            const before = billVisit(SHEET, t.quote, t.doc, t.visit).billedCents;
            t.visit.results.forEach((res, k) => {
                if (res.status !== 'done') return;
                const results = t.visit.results.map((x, j) => (j === k ? { ...x, status: 'skipped' } : x));
                const after = billVisit(SHEET, t.quote, t.doc, { ...t.visit, results }).billedCents;
                checked++;
                if (after > before) raised.push(t.n);
            });
        }
        expect(checked).toBeGreaterThan(TRIALS);
        expect(raised).toEqual([]);
    });

    test('nothing done costs nothing', () => {
        const charged = [];
        for (const t of trials) {
            const visit = {
                results: t.visit.results.map((x) => ({ ...x, status: x.status === 'done' ? 'not-reached' : x.status })),
                addOns: t.visit.addOns.map((a) => ({ ...a, done: false }))
            };
            if (billVisit(SHEET, t.quote, t.doc, visit).billedCents !== 0) charged.push(t.n);
        }
        expect(charged).toEqual([]);
    });

    test('the quote ignores item order, notes, photos, stars and preferences', () => {
        const moved = [];
        for (const t of trials.slice(0, 500)) {
            const r = rng(seedFor(t.n + 1e6));
            const items = t.doc.items
                .map((i) => ({ ...i, notes: 'changed', photos: [], important: !i.important }))
                .map((i) => [r(), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
            const again = quoteChecklist(SHEET, { ...t.doc, items, preferences: { keys: ['no-bleach', 'shoe-covers'], note: 'x' } });
            const keep = (q) => [q.subtotalCents, q.topUpCents, q.totalCents, q.minutes];
            if (JSON.stringify(keep(again)) !== JSON.stringify(keep(t.quote))) moved.push(t.n);
        }
        expect(moved).toEqual([]);
    });

    test('a choice the task does not allow is always an error, never a price', () => {
        const silent = [];
        for (const t of trials.slice(0, 500)) {
            const live = t.doc.items.filter(isLive);
            if (!live.length) continue;
            const victim = live[0];
            const task = taskOf(SHEET, victim.task);
            const bad = task.unit === 'room' ? { ...victim, quantity: 2 }
                : task.unit === 'count' ? { ...victim, size: 'large' }
                    : { ...victim, size: 'small' };
            for (const wrong of [bad, { ...victim, task: 'no-such-task' }, { ...victim, options: [...victim.options, 'not-an-option'] }]) {
                const q = quoteChecklist(SHEET, { ...t.doc, items: t.doc.items.map((i) => (i === victim ? wrong : i)) });
                const priced = q.lines.some((l) => l.itemId === victim.id);
                const flagged = q.errors.some((e) => e.itemId === victim.id);
                if (priced || !flagged) silent.push(t.n);
            }
        }
        expect(silent).toEqual([]);
    });
});

test('every preset in the shipped sheet builds a priced room', () => {
    for (const area of AREAS) {
        const preset = presetFor(SHEET, area);
        const doc = {
            rooms: [{ id: 'r', level: 'main', area }],
            items: preset.map((p, i) => ({ id: `p${i}`, roomId: 'r', ...p }))
        };
        const q = quoteChecklist(SHEET, doc);
        expect(`${area}: ${JSON.stringify(q.errors)}`).toBe(`${area}: []`);
        expect(q.lines).toHaveLength(preset.length);
        expect(q.subtotalCents).toBeGreaterThan(0);
    }
});
