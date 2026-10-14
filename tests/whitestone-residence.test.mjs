// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Kinds of residence (M2 step 4c, PRD 8.9), the words and the data: a house,
 * a townhome (an end unit, or between two neighbors), or a condo or
 * apartment. The kind decides the levels a home can have: a condo one or
 * two, a townhome no detached garage. The store's `residence` and its
 * migration (none is a house), a change of kind that takes its unused
 * levels with it and refuses while one still has rooms, and the levels and
 * rooms held to the kind.
 */
import { CONFIG } from '../www/whitestone/js/config.js';
import { TAXONOMY, residencesOf, residenceOf, levelsAllowed, residenceLine } from '../www/whitestone/js/taxonomy.js';
import {
    emptyDoc, createChecklist, setLevels, setResidence, addRoom, updateRoom, deleteRoom, validate, findChecklist, duplicateChecklist
} from '../www/whitestone/js/store.js';
import { STORE, allCopy } from '../www/whitestone/js/copy.js';

const NOW = new Date('2026-10-14T16:00:00Z');
const LATER = new Date('2026-10-14T17:00:00Z');
const ALL_LEVELS = TAXONOMY.cleaning.levels.map((l) => l.key);

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.keys(value)) deepFreeze(value[key]);
    }
    return value;
}

/** A frozen home on `levels`, `residence` its kind, with a room on each of
 *  `roomsOn`. */
function home(levels, residence = null, roomsOn = []) {
    let doc = emptyDoc(CONFIG, NOW);
    doc = createChecklist(doc, { levels, residence }, CONFIG, NOW, { id: 'checklist-1' }).doc;
    roomsOn.forEach((level, i) => {
        const out = addRoom(doc, 'checklist-1', { level, area: 'bedroom' }, CONFIG, NOW, { id: `room-${level}-${i}` });
        expect(out.error).toBeNull();
        doc = out.doc;
    });
    return deepFreeze(doc);
}
const listOf = (doc) => findChecklist(doc, 'checklist-1');

describe('the kinds (taxonomy.js)', () => {
    test('a house, a townhome and a condo or apartment, a house first; a yard has none', () => {
        expect(residencesOf('cleaning').map((k) => [k.key, k.name])).toEqual([
            ['house', 'A house'], ['townhome', 'A townhome'], ['condo', 'A condo or apartment']
        ]);
        expect(residencesOf('cleaning')[1].attached.map((a) => [a.key, a.name])).toEqual([
            ['end', 'An end unit'], ['middle', 'Between two neighbors']
        ]);
        expect(residencesOf('landscaping')).toEqual([]);
        expect(residencesOf('nonsense')).toEqual([]);
    });

    test('untrusted input becomes a known kind, a townhome always with its neighbors and nothing else with any', () => {
        expect(residenceOf('cleaning', undefined)).toEqual({ kind: 'house', attached: null });
        expect(residenceOf('cleaning', { kind: 'castle' })).toEqual({ kind: 'house', attached: null });
        expect(residenceOf('cleaning', { kind: 'house', attached: 'middle' })).toEqual({ kind: 'house', attached: null });
        expect(residenceOf('cleaning', { kind: 'townhome' })).toEqual({ kind: 'townhome', attached: 'end' });
        expect(residenceOf('cleaning', { kind: 'townhome', attached: 'middle' })).toEqual({ kind: 'townhome', attached: 'middle' });
        expect(residenceOf('cleaning', { kind: 'townhome', attached: 'both' })).toEqual({ kind: 'townhome', attached: 'end' });
        expect(residenceOf('cleaning', { kind: 'condo', attached: 'end' })).toEqual({ kind: 'condo', attached: null });
        expect(residenceOf('landscaping', { kind: 'house' })).toBeNull();
    });

    test('the levels each kind can have, in the stack\'s order', () => {
        expect(levelsAllowed('cleaning', { kind: 'house' })).toEqual(ALL_LEVELS);
        expect(levelsAllowed('cleaning', null)).toEqual(ALL_LEVELS);
        expect(levelsAllowed('cleaning', { kind: 'townhome' })).toEqual(ALL_LEVELS.filter((l) => l !== 'detached-garage'));
        expect(levelsAllowed('cleaning', { kind: 'condo' })).toEqual(['main', 'second']);
        expect(levelsAllowed('landscaping', null)).toEqual(TAXONOMY.landscaping.levels.map((l) => l.key));
        expect(levelsAllowed('nonsense', null)).toEqual([]);
    });

    test('in a line, as the cleaner reads it', () => {
        expect(residenceLine('cleaning', { kind: 'house', attached: null })).toBe('A house');
        expect(residenceLine('cleaning', { kind: 'townhome', attached: 'end' })).toBe('A townhome, end unit');
        expect(residenceLine('cleaning', { kind: 'townhome', attached: 'middle' })).toBe('A townhome, between two neighbors');
        expect(residenceLine('cleaning', { kind: 'condo', attached: null })).toBe('A condo or apartment');
        expect(residenceLine('cleaning', null)).toBe('');
    });
});

describe('the store (store.js)', () => {
    test('a checklist saved before kinds of home is a house; a kind is kept; one that cannot be is a house', () => {
        const raw = (residence, levels = ['main']) => ({
            schema: 1, settings: {}, meta: {},
            checklists: [{ id: 'checklist-1', serviceType: 'cleaning', levels, residence, rooms: [], items: [] }]
        });
        const read = (r, levels) => validate(raw(r, levels), CONFIG, NOW).doc.checklists[0];
        expect(read(undefined).residence).toEqual({ kind: 'house', attached: null });
        expect(read({ kind: 'townhome', attached: 'middle' }).residence).toEqual({ kind: 'townhome', attached: 'middle' });
        expect(read({ kind: 'condo' }, ['main', 'second']).residence).toEqual({ kind: 'condo', attached: null });
        // A condo with a basement, from a hand edit: read as a house, so the
        // basement and its rooms are kept.
        const odd = read({ kind: 'condo' }, ['basement', 'main']);
        expect(odd.residence).toEqual({ kind: 'house', attached: null });
        expect(odd.levels).toEqual(['basement', 'main']);
        expect(validate(raw({ kind: 'condo' }), CONFIG, NOW).doc.schema).toBe(1);
    });

    test('a new checklist takes its kind, and a duplicate keeps it', () => {
        const doc = home(['main'], { kind: 'townhome', attached: 'middle' });
        expect(listOf(doc).residence).toEqual({ kind: 'townhome', attached: 'middle' });
        expect(duplicateChecklist(doc, 'checklist-1', CONFIG, LATER).record.residence).toEqual({ kind: 'townhome', attached: 'middle' });
        expect(listOf(home(['main'])).residence).toEqual({ kind: 'house', attached: null });
    });

    test('a change of kind takes the levels it cannot have, when they are empty', () => {
        const doc = home(['basement', 'main', 'second', 'garage', 'detached-garage']);
        const condo = setResidence(doc, 'checklist-1', { kind: 'condo' }, CONFIG, LATER);
        expect(condo.error).toBeNull();
        expect(listOf(condo.doc)).toMatchObject({ residence: { kind: 'condo', attached: null }, levels: ['main', 'second'], updatedAt: LATER.toISOString() });
        const townhome = setResidence(doc, 'checklist-1', { kind: 'townhome', attached: 'middle' }, CONFIG, LATER);
        expect(listOf(townhome.doc)).toMatchObject({ residence: { kind: 'townhome', attached: 'middle' }, levels: ['basement', 'main', 'second', 'garage'] });
        // Back to a house: nothing comes back on its own.
        const house = setResidence(deepFreeze(condo.doc), 'checklist-1', { kind: 'house' }, CONFIG, LATER);
        expect(listOf(house.doc).levels).toEqual(['main', 'second']);
        // A condo of a basement alone keeps a main floor.
        const low = setResidence(home(['basement']), 'checklist-1', { kind: 'condo' }, CONFIG, LATER);
        expect(listOf(low.doc).levels).toEqual(['main']);
    });

    test('a change of kind is refused while a level it cannot have has rooms, and says which', () => {
        const doc = home(['basement', 'main'], null, ['basement', 'main']);
        const out = setResidence(doc, 'checklist-1', { kind: 'condo' }, CONFIG, LATER);
        expect(out.error).toBe(STORE.residenceLevelInUse('Basement'));
        expect(out.error).toBe('Your basement still has rooms. Please move or remove them before changing the kind of home.');
        expect(out.doc).toBe(doc);
        // A removed room does not hold its level, and is kept for its undo.
        const gone = deepFreeze(deleteRoom(doc, 'checklist-1', 'room-basement-0', CONFIG, LATER).doc);
        const ok = setResidence(gone, 'checklist-1', { kind: 'condo' }, CONFIG, LATER);
        expect(ok.error).toBeNull();
        expect(listOf(ok.doc).rooms.find((r) => r.id === 'room-basement-0')).toMatchObject({ level: 'main' });
        expect(listOf(ok.doc).rooms.find((r) => r.id === 'room-basement-0').deletedAt).not.toBeNull();
        expect(setResidence(doc, 'no-such-list', { kind: 'condo' }, CONFIG, LATER).error).toBe(STORE.noChecklist);
    });

    test('the levels and the rooms keep to the kind', () => {
        const condo = home(['main'], { kind: 'condo' });
        expect(listOf(setLevels(condo, 'checklist-1', ['basement', 'main', 'second', 'garage'], CONFIG, LATER).doc).levels).toEqual(['main', 'second']);
        expect(setLevels(condo, 'checklist-1', ['attic'], CONFIG, LATER).error).toBe(STORE.noLevels);
        const room = addRoom(condo, 'checklist-1', { level: 'basement', area: 'bedroom' }, CONFIG, LATER);
        expect(room.error).toBe(STORE.badLevel);
        expect(room.doc).toBe(condo);
        const townhome = home(['main'], { kind: 'townhome' }, ['main']);
        expect(addRoom(townhome, 'checklist-1', { level: 'detached-garage', area: 'garage' }, CONFIG, LATER).error).toBe(STORE.badLevel);
        expect(updateRoom(townhome, 'checklist-1', 'room-main-0', { level: 'detached-garage' }, CONFIG, LATER).error).toBe(STORE.badLevel);
        expect(updateRoom(townhome, 'checklist-1', 'room-main-0', { level: 'garage' }, CONFIG, LATER).error).toBeNull();
    });

    test('the refusal is in the house-style sweep', () => {
        expect(allCopy().some((c) => c.where === 'copy.STORE.residenceLevelInUse')).toBe(true);
    });
});
