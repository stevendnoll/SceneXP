// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * What a visit under way holds (held.js, QA 2026-10-16): the customer adds,
 * never takes away. A task or room the cleaner already has (in the
 * checklist as last sent) is not removed, and what it is (a task's options,
 * size, quantity; a room's floor and type of bath) does not change. Its
 * notes, photos, star and name may. Driven through both pages in
 * whitestone-cancel.
 */
import { holdOf, isHeld, changesHeldTask, changesHeldRoom, heldChanges } from '../www/whitestone/js/held.js';

const sent = {
    rooms: [
        { id: 'k', level: 'main', area: 'kitchen', bath: null },
        { id: 'b', level: 'second', area: 'bathroom', bath: 'tub' },
        { id: 'gone', level: 'main', area: 'office', bath: null, deletedAt: 'then' }
    ],
    items: [
        { id: 'stove', roomId: 'k', task: 'stovetop', options: ['deep-clean', 'grates'], size: null, quantity: null, notes: 'Grates too.' },
        { id: 'floor', roomId: 'k', task: 'floor', options: [], size: 'large', quantity: null },
        { id: 'windows', roomId: 'b', task: 'windows', options: [], size: null, quantity: 4 }
    ]
};
const copy = (x) => JSON.parse(JSON.stringify(x));

describe('what the cleaner already has (held.js)', () => {
    test('the live tasks and rooms of the copy as sent; nothing for no copy', () => {
        const hold = holdOf(sent);
        expect([...hold.items.keys()]).toEqual(['stove', 'floor', 'windows']);
        expect([...hold.rooms.keys()]).toEqual(['k', 'b']);
        expect(isHeld(hold, 'item', 'stove')).toBe(true);
        expect(isHeld(hold, 'room', 'b')).toBe(true);
        expect(isHeld(hold, 'room', 'gone')).toBe(false);
        expect(isHeld(hold, 'item', 'new-one')).toBe(false);
        expect(isHeld(hold, 'item', null)).toBe(false);
        expect(isHeld(null, 'item', 'stove')).toBe(false);
        expect(holdOf(null)).toEqual({ items: new Map(), rooms: new Map() });
    });

    test('a held task keeps what it is; its notes, photos and star may change; options in any order are the same', () => {
        const hold = holdOf(sent);
        const stove = sent.items[0];
        expect(changesHeldTask(hold, stove, { options: ['grates', 'deep-clean'], notes: 'Under them too.', important: true, photos: ['p1'] })).toBe(false);
        expect(changesHeldTask(hold, stove, { options: ['grates'] })).toBe(true);
        expect(changesHeldTask(hold, sent.items[1], { size: 'small' })).toBe(true);
        expect(changesHeldTask(hold, sent.items[2], { quantity: 3 })).toBe(true);
        // A task the cleaner does not have yet changes freely.
        expect(changesHeldTask(hold, { id: 'new-one', roomId: 'k', task: 'oven', options: [] }, { options: ['x'] })).toBe(false);
    });

    test('a held room keeps its floor and type of bath; its name may change', () => {
        const hold = holdOf(sent);
        const bath = sent.rooms[1];
        expect(changesHeldRoom(hold, bath, { label: 'Kids’ bath' })).toBe(false);
        expect(changesHeldRoom(hold, bath, { bath: 'shower' })).toBe(true);
        expect(changesHeldRoom(hold, bath, { level: 'main' })).toBe(true);
        expect(changesHeldRoom(hold, { id: 'new', level: 'main', area: 'den' }, { level: 'second' })).toBe(false);
    });

    test('a send that only adds holds nothing back; one that takes away or changes says what', () => {
        const added = copy(sent);
        added.rooms.push({ id: 'l', level: 'main', area: 'laundry', bath: null });
        added.items.push({ id: 'wash', roomId: 'l', task: 'washer', options: [] });
        added.items[0].notes = 'New words.';
        added.items[0].important = true;
        expect(heldChanges(sent, added)).toEqual([]);
        const taken = copy(sent);
        taken.items = taken.items.filter((i) => i.id !== 'floor');
        taken.items.find((i) => i.id === 'windows').quantity = 2;
        taken.rooms.find((r) => r.id === 'b').bath = 'shower';
        expect(heldChanges(sent, taken)).toEqual([
            { kind: 'room', id: 'b', change: 'changed' },
            { kind: 'item', id: 'floor', change: 'removed' },
            { kind: 'item', id: 'windows', change: 'changed' }
        ]);
        // Removed here as the store removes (deletedAt), the same.
        const marked = copy(sent);
        marked.items.find((i) => i.id === 'stove').deletedAt = 'now';
        marked.rooms.find((r) => r.id === 'k').deletedAt = 'now';
        expect(heldChanges(sent, marked)).toEqual([{ kind: 'room', id: 'k', change: 'removed' }, { kind: 'item', id: 'stove', change: 'removed' }]);
    });
});
