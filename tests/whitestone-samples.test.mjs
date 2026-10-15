// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The example home (www/whitestone/js/samples.js): the home PRD 8.8 asks for,
 * valid by the store's own rules, fully priced by the shipped sheet, entirely
 * sample-tagged so clearing it touches nothing else, and the same home every
 * time it is built.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../www/whitestone/js/config.js';
import { withExample, EXAMPLE_ID } from '../www/whitestone/js/samples.js';
import { emptyDoc, validate, clearSamples, createChecklist, deleteChecklist, liveRooms, liveItems, findChecklist } from '../www/whitestone/js/store.js';
import { checkChoice } from '../www/whitestone/js/sheet.js';
import { quoteChecklist } from '../www/whitestone/js/pricing.js';

const NOW = new Date('2026-10-12T16:00:00Z');
const prices = join(process.cwd(), 'www', 'whitestone', 'data', 'prices');
const SHEET = JSON.parse(readFileSync(join(prices, 'cleaning-2026-10.json'), 'utf8'));
const check = (choice, area) => checkChoice(SHEET, choice, area);

const built = withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, check);
const example = built.doc && findChecklist(built.doc, EXAMPLE_ID);

test('replaces an example from before, removed or not, rather than building a second of its id', () => {
    const removed = deleteChecklist(built.doc, EXAMPLE_ID, CONFIG, NOW).doc;
    const mine = createChecklist(removed, { title: 'Ours' }, CONFIG, NOW, { id: 'checklist-mine' }).doc;
    for (const before of [mine, built.doc]) {
        const again = withExample(before, CONFIG, NOW, check);
        expect(again.error).toBeNull();
        const copies = again.doc.checklists.filter((c) => c.id === EXAMPLE_ID);
        expect(copies).toHaveLength(1);
        expect(copies[0].deletedAt).toBeNull();
        expect(again.doc.settings.activeId).toBe(EXAMPLE_ID);
    }
    // The visitor's own checklist is untouched.
    expect(findChecklist(withExample(mine, CONFIG, NOW, check).doc, 'checklist-mine').title).toBe('Ours');
});

test('builds without a refusal, every choice allowed by the shipped sheet, and goes on the plinth', () => {
    expect(built.error).toBeNull();
    expect(built.doc.settings.activeId).toBe(EXAMPLE_ID);
});

test('is the home PRD 8.8 describes: four bedrooms on three levels, a dog, a home office, about 25 tasks', () => {
    expect(example.levels).toEqual(['basement', 'main', 'second']);
    const rooms = liveRooms(example);
    expect(new Set(rooms.map((r) => r.level))).toEqual(new Set(['basement', 'main', 'second']));
    expect(rooms.filter((r) => r.area === 'primary-bedroom' || r.area === 'bedroom')).toHaveLength(4);
    expect(rooms.some((r) => r.area === 'office')).toBe(true);
    expect(example.preferences.keys).toEqual(['pet-safe', 'pets-home']);
    const items = liveItems(example);
    expect(items.length).toBeGreaterThanOrEqual(22);
    expect(items.length).toBeLessThanOrEqual(30);
    // It shows off what a checklist can hold.
    expect(items.some((i) => i.important)).toBe(true);
    expect(items.some((i) => i.options.length)).toBe(true);
    expect(items.some((i) => i.size)).toBe(true);
    expect(items.some((i) => i.quantity > 1)).toBe(true);
    expect(items.some((i) => i.notes) && items.some((i) => i.avoid)).toBe(true);
});

test('is priced in full by the shipped sheet, above the visit minimum', () => {
    const q = quoteChecklist(SHEET, { rooms: example.rooms, items: liveItems(example) });
    expect(q.errors).toEqual([]);
    expect(q.lines).toHaveLength(liveItems(example).length);
    expect(q.topUpCents).toBe(0);
    expect(q.totalCents).toBeGreaterThan(SHEET.visitMinimumCents);
});

test('is a document the store accepts as saved, exactly', () => {
    expect(validate(JSON.parse(JSON.stringify(built.doc)), CONFIG, NOW)).toEqual({ ok: true, doc: built.doc, dropped: 0 });
});

test('is sample-tagged throughout, so clearing it leaves the visitor\'s own home alone', () => {
    expect(example.sample).toBe(true);
    expect(example.rooms.every((r) => r.sample)).toBe(true);
    expect(example.items.every((i) => i.sample)).toBe(true);
    const mine = createChecklist(built.doc, { title: 'Mine' }, CONFIG, NOW, { id: 'my-home-1' }).doc;
    expect(clearSamples(mine).doc.checklists.map((c) => c.id)).toEqual(['my-home-1']);
});

test('is the same home every time, ids included', () => {
    expect(withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, check).doc).toEqual(built.doc);
});

test('its words keep house style', () => {
    const words = [example.title, example.household, example.preferences.note,
        ...example.rooms.map((r) => r.label), ...example.items.flatMap((i) => [i.notes, i.avoid])].filter(Boolean);
    for (const w of words) {
        expect(w).not.toMatch(/—|;/);
        expect(w).not.toMatch(/\b(grey|colour|favourite|centre)\b/i);
    }
});

test('a refusal leaves the document untouched', () => {
    const refuse = () => 'not-offered';
    const doc = emptyDoc(CONFIG, NOW);
    const out = withExample(doc, CONFIG, NOW, refuse);
    expect(out.error).toBeTruthy();
    expect(out.doc).toBe(doc);
});

describe('the example\'s last visit (M5 piece 4)', () => {
    test('a report kept as any is, already seen: the microwave skipped for time, the basement not reached, the oven added and done', async () => {
        const { EXAMPLE_VISIT } = await import('../www/whitestone/js/samples.js');
        const { reportBill } = await import('../www/whitestone/js/report.js');
        const { lockQuote, priceItem, priceAddOn } = await import('../www/whitestone/js/pricing.js');
        const c = findChecklist(withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, check).doc, EXAMPLE_ID);
        expect(c.visits).toHaveLength(1);
        const v = c.visits[0];
        expect(v).toMatchObject({ visitId: EXAMPLE_VISIT.visitId, seen: true, bill: null });
        expect(v.report.results).toHaveLength(liveItems(c).length);
        const statusOf = (id) => v.report.results.find((r) => r.itemId === id).status;
        expect(statusOf(EXAMPLE_VISIT.skipped.itemId)).toBe('skipped');
        const basement = liveRooms(c).find((r) => r.level === 'basement');
        const below = liveItems(c).filter((i) => i.roomId === basement.id);
        expect(below.every((i) => statusOf(i.id) === 'not-reached')).toBe(true);
        expect(v.report.results.filter((r) => r.status === 'done')).toHaveLength(liveItems(c).length - 1 - below.length);
        expect(v.report.addOns).toEqual([expect.objectContaining({ task: 'oven-interior', status: 'approved', done: true })]);
        // What it came to: the quote, less the skip and the basement, with
        // the oven, which the guarantee allows since it was approved.
        const quote = lockQuote(quoteChecklist(SHEET, c), null);
        const price = (id) => priceItem(SHEET, liveItems(c).find((i) => i.id === id), c.rooms).cents;
        const oven = priceAddOn(SHEET, v.report.addOns[0], c.rooms, new Map()).cents;
        const bill = reportBill(SHEET, quote, c, v.report);
        expect(bill.billedCents).toBe(quote.totalCents - price(EXAMPLE_VISIT.skipped.itemId) - below.reduce((n, i) => n + price(i.id), 0) + oven);
        expect(bill.errors).toEqual([]);
        // The example's report goes with it.
        expect(clearSamples(withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, check).doc).doc.checklists).toEqual([]);
    });
});
