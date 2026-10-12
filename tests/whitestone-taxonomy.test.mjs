// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Whitestone's taxonomy (www/whitestone/js/taxonomy.js): every service type
 * is well formed, its keys are stable identifiers, and the lookups answer
 * for what exists and refuse what does not.
 */
import {
    TAXONOMY, KEY_PATTERN, serviceType, levelOf, areaOf, preferenceKeys, preferenceOf, roomName
} from '../www/whitestone/js/taxonomy.js';

const TYPES = Object.keys(TAXONOMY);

test('cleaning ships, and landscaping proves the shape holds for another trade', () => {
    expect(TYPES).toEqual(['cleaning', 'landscaping']);
});

describe.each(TYPES)('%s', (type) => {
    const t = TAXONOMY[type];

    test('levels and areas have unique, well-formed keys and names', () => {
        for (const list of [t.levels, t.areas]) {
            expect(list.length).toBeGreaterThan(0);
            const keys = list.map((x) => x.key);
            expect(new Set(keys).size).toBe(keys.length);
            for (const x of list) {
                expect(`${x.key}: ${KEY_PATTERN.test(x.key)}`).toBe(`${x.key}: true`);
                expect(x.name.trim().length).toBeGreaterThan(0);
            }
        }
    });

    test('every area has a positive layout weight for the house model', () => {
        for (const a of t.areas) expect(`${a.key}: ${a.weight > 0}`).toBe(`${a.key}: true`);
    });

    test('preference keys are unique across groups', () => {
        const keys = preferenceKeys(type);
        expect(new Set(keys).size).toBe(keys.length);
        keys.forEach((k) => expect(KEY_PATTERN.test(k)).toBe(true));
    });

    test('every name keeps house style', () => {
        const names = [t.name, ...t.levels.map((x) => x.name), ...t.areas.map((x) => x.name),
            ...t.preferences.flatMap((g) => [g.name, ...g.items.map((i) => i.name)])];
        for (const n of names) expect(`${n}: ${/—|;/.test(n)}`).toBe(`${n}: false`);
    });
});

test('cleaning covers the levels and rooms the PRD names', () => {
    expect(TAXONOMY.cleaning.levels.map((l) => l.key)).toEqual(
        ['basement', 'main', 'second', 'third', 'attic', 'garage', 'detached-garage']);
    expect(TAXONOMY.cleaning.areas).toHaveLength(24);
    // A kitchen outweighs a bathroom, and a bathroom a closet (PLANNING 6.2).
    expect(areaOf('cleaning', 'kitchen').weight).toBeGreaterThan(areaOf('cleaning', 'bathroom').weight);
    expect(areaOf('cleaning', 'bathroom').weight).toBeGreaterThan(areaOf('cleaning', 'closet').weight);
    // The two garages are annexes, never stacked as stories.
    expect(TAXONOMY.cleaning.levels.filter((l) => l.annex).map((l) => l.key)).toEqual(['garage', 'detached-garage']);
});

test('the care preferences are the PRD 11.8 list, and none of them is about health', () => {
    expect(preferenceKeys('cleaning')).toEqual(['fragrance-free', 'no-bleach', 'no-ammonia', 'eco-products',
        'pet-safe', 'own-products', 'shoe-covers', 'pets-home', 'leave-items']);
    const words = TAXONOMY.cleaning.preferences.flatMap((g) => g.items.map((i) => i.name)).join(' ');
    expect(words).not.toMatch(/allerg|asthma|medical|health|sensitiv/i);
});

test('lookups answer for what exists and refuse what does not', () => {
    expect(serviceType('cleaning')).toBe(TAXONOMY.cleaning);
    expect(serviceType('constructor')).toBeNull();   // never reaches Object.prototype
    expect(serviceType('toString')).toBeNull();
    expect(levelOf('cleaning', 'main').name).toBe('Main floor');
    expect(levelOf('cleaning', 'lawn')).toBeNull();
    expect(levelOf('nope', 'main')).toBeNull();
    expect(areaOf('landscaping', 'lawn').name).toBe('Lawn');
    expect(areaOf('cleaning', 'lawn')).toBeNull();
    expect(preferenceOf('cleaning', 'pet-safe')).toEqual({ key: 'pet-safe', name: 'Pet-safe products only', group: 'products' });
    expect(preferenceOf('cleaning', 'nope')).toBeNull();
    expect(preferenceOf('nope', 'pet-safe')).toBeNull();
    expect(preferenceKeys('nope')).toEqual([]);
});

test('a room is called by its label, or else by its area', () => {
    expect(roomName('cleaning', { area: 'bedroom', label: "  Emma's room " })).toBe("Emma's room");
    expect(roomName('cleaning', { area: 'bedroom', label: '   ' })).toBe('Bedroom');
    expect(roomName('cleaning', { area: 'bedroom' })).toBe('Bedroom');
    expect(roomName('cleaning', { area: 'moat' })).toBe('');
    expect(roomName('cleaning', null)).toBe('');
});

test('the taxonomy cannot be changed at run time', () => {
    expect(Object.isFrozen(TAXONOMY.cleaning.areas[0])).toBe(true);
    expect(() => { TAXONOMY.cleaning.areas[0].weight = 99; }).toThrow();
});
