// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Every sentence in Whitestone Home Care (www/whitestone/js/copy.js), held
 * to house style, and every code a module can return given its sentence, so
 * a visitor never meets a blank or a raw code.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    allCopy, BRAND, ITEM_ERRORS, BOOKING_ERRORS, DAY_STATUS, GUARDS, STORE
} from '../www/whitestone/js/copy.js';

const COPY = allCopy();
const BRITISH = /\b(colours?|favourites?|centres?|behaviours?|neighbours?|grey|metres?|licence|cheques?|catalogue|programmes?|travelled|cancelled|organis\w*|realis\w*|recognis\w*|apologis\w*|personalis\w*|rubbish|queues?|storeys?|fortnight\w*)\b/i;

test('the sweep reads every sentence, functions included', () => {
    expect(COPY.length).toBeGreaterThan(50);
    expect(COPY.find((c) => c.where === 'copy.STORE.tooManyRooms').text).toBe('A checklist can have up to 12 rooms.');
});

test.each(COPY.map((c) => [c.where, c.text]))('%s keeps house style', (_where, text) => {
    expect(text.trim()).toBe(text);
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/—|;/);
    expect(text).not.toMatch(BRITISH);
    expect(text).not.toMatch(/!/);   // a calm host, never an exclamation
});

/** Codes read out of a module's own source, so a new code cannot be added
 *  there without a sentence here. */
function codesIn(file, pattern) {
    const src = readFileSync(join(process.cwd(), 'www', 'whitestone', 'js', file), 'utf8');
    return [...new Set([...src.matchAll(pattern)].map((m) => m[1]))].sort();
}

test("every code sheet.js's checkChoice and pricing.js return has a sentence", () => {
    const sheet = codesIn('sheet.js', /return '([a-z-]+)';/g);
    const pricing = codesIn('pricing.js', /error: '([a-z-]+)'/g);
    expect(sheet.length).toBeGreaterThanOrEqual(9);
    for (const code of [...sheet, ...pricing]) expect(`${code}: ${code in ITEM_ERRORS}`).toBe(`${code}: true`);
});

test("every code schedule.js's checkBooking returns, and every day status, has words", () => {
    const booking = codesIn('schedule.js', /error: '([a-z-]+)'/g);
    expect(booking.length).toBeGreaterThanOrEqual(7);
    for (const code of [...booking, 'closed', 'holiday', 'too-far']) expect(`${code}: ${code in BOOKING_ERRORS}`).toBe(`${code}: true`);
    const statuses = codesIn('schedule.js', /status: '([a-z-]+)'/g);
    for (const s of [...statuses, 'full']) expect(`${s}: ${s in DAY_STATUS}`).toBe(`${s}: true`);
});

test('every hint guards.js can give has a sentence', () => {
    const hints = codesIn('guards.js', /\['([a-z-]+)', /g);
    expect(hints).toEqual(['code', 'health', 'hidden-key']);
    hints.forEach((h) => expect(h in GUARDS).toBe(true));
});

test('every refusal store.js names exists', () => {
    const used = codesIn('store.js', /STORE\.([A-Za-z]+)/g);
    expect(used.length).toBeGreaterThan(10);
    used.forEach((k) => expect(`${k}: ${k in STORE}`).toBe(`${k}: true`));
});

test('the honesty line is the one the PRD gives, word for word, while bookings are examples', () => {
    expect(BRAND.honesty).toBe('Whitestone Home Care is a SceneXP concept studio. Prices and bookings are examples.');
    expect(BRAND.exampleBooking).toBe('This is an example booking. No one will arrive.');
    // And the studio's no-JavaScript fallback says the same.
    const page = readFileSync(join(process.cwd(), 'www', 'whitestone', 'index.html'), 'utf8').replace(/\s+/g, ' ');
    expect(page).toContain(BRAND.honesty);
});

test('nothing in the copy asks about health', () => {
    for (const { text } of COPY) {
        if (text === GUARDS.health) continue;    // the one line that says there is no need
        expect(text).not.toMatch(/allerg|asthma|medical|health|condition/i);
    }
});

test('no sentence sends the visitor to Help for the checklist: that is Maya\'s (Steve, 2026-10-15)', () => {
    for (const { where, text } of COPY) {
        if (where.startsWith('copy.HELP.')) continue;   // Help's own words
        expect(`${where}: ${/\bHelp\b|Help menu|My checklists|Show me again/.test(text)}`).toBe(`${where}: false`);
    }
});
