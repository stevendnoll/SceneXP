// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The saved document (www/whitestone/js/store.js) and undo (history.js).
 *
 * EVERY MUTATION HERE RUNS ON A DEEP-FROZEN DOCUMENT, so one that changed its
 * input in place would throw rather than pass: the immutability undo depends
 * on is checked by every test, not by one.
 *
 * Storage runs on a Map. The three save guards each get a test of the bug
 * they were written for.
 */
import { CONFIG } from '../www/whitestone/js/config.js';
import {
    newId, emptyDoc, validate, migrate, createChecklist, updateChecklist, setLevels, setPreferences,
    deleteChecklist, restoreChecklist, addRoom, updateRoom, deleteRoom, restoreRoom, addItem, updateItem,
    deleteItem, restoreItem, addPhoto, removePhoto, photoIdsInUse, clearSamples, hasSamples, setSettings,
    touchVisit, storageUse, liveRooms, liveItems, itemsIn, photoCount, findChecklist, createStore, ID_PATTERN
} from '../www/whitestone/js/store.js';
import { createHistory } from '../www/whitestone/js/history.js';
import { checkChoice, presetFor } from '../www/whitestone/js/sheet.js';
import { allCopy } from '../www/whitestone/js/copy.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NOW = new Date('2026-10-12T16:00:00Z');
const LATER = new Date('2026-10-12T17:00:00Z');
const prices = join(process.cwd(), 'www', 'whitestone', 'data', 'prices');
const SHEET = JSON.parse(readFileSync(join(prices, 'cleaning-2026-10.json'), 'utf8'));
const check = (choice, area) => checkChoice(SHEET, choice, area);
// Every copy.js sentence, numbers masked, since a limit fills in its own.
const masked = (t) => t.replace(/\d+/g, '#');
const SENTENCES = new Set(allCopy().map((c) => masked(c.text)));

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.keys(value)) deepFreeze(value[key]);
    }
    return value;
}

/** Apply a mutation to a frozen copy, and insist a refusal says something
 *  from copy.js and leaves the document as it was. */
function apply(doc, fn) {
    const frozen = deepFreeze(JSON.parse(JSON.stringify(doc)));
    const out = fn(frozen);
    if (out.error) {
        expect(`${out.error}: ${SENTENCES.has(masked(out.error))}`).toBe(`${out.error}: true`);
        expect(out.doc).toBe(frozen);
    }
    return out;
}

/** A home: one checklist with a kitchen (its preset) and a bedroom. */
function home() {
    let doc = emptyDoc(CONFIG, NOW);
    doc = createChecklist(doc, {}, CONFIG, NOW, { id: 'checklist-1' }).doc;
    doc = addRoom(doc, 'checklist-1', { level: 'main', area: 'kitchen' }, CONFIG, NOW,
        { id: 'kitchen-1', check, presetItems: presetFor(SHEET, 'kitchen') }).doc;
    doc = addRoom(doc, 'checklist-1', { level: 'second', area: 'bedroom', label: "Emma's room" }, CONFIG, NOW,
        { id: 'bedroom-1', check }).doc;
    return doc;
}
const C = (doc) => findChecklist(doc, 'checklist-1');

describe('ids', () => {
    test('22 base64url characters from 16 random bytes', () => {
        const id = newId();
        expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(ID_PATTERN.test(id)).toBe(true);
        expect(newId()).not.toBe(id);
    });

    test('a given random source makes a given id, and Math.random stands in without crypto', () => {
        const zeros = { getRandomValues: (a) => a.fill(0) };
        expect(newId(zeros)).toBe('AAAAAAAAAAAAAAAAAAAAAA');
        expect(newId(null, () => 0.999)).toBe('_____________________w');
    });
});

describe('checklists', () => {
    test('a new one is "Our home" on the main floor, with nothing in it', () => {
        const { doc, record } = apply(emptyDoc(CONFIG, NOW), (d) => createChecklist(d, {}, CONFIG, NOW));
        expect(record).toMatchObject({ title: 'Our home', serviceType: 'cleaning', levels: ['main'], rooms: [], items: [],
            preferences: { keys: [], note: '' }, quote: null, sample: false });
        expect(doc.checklists).toHaveLength(1);
    });

    test('an unknown service type is refused, and so is a 21st checklist', () => {
        expect(apply(emptyDoc(CONFIG, NOW), (d) => createChecklist(d, { serviceType: 'roofing' }, CONFIG, NOW)).error).toBeTruthy();
        let doc = emptyDoc(CONFIG, NOW);
        for (let i = 0; i < CONFIG.limits.checklists; i++) doc = createChecklist(doc, {}, CONFIG, NOW).doc;
        expect(apply(doc, (d) => createChecklist(d, {}, CONFIG, NOW)).error).toBe('You can keep up to 20 checklists on this device.');
    });

    test('title, frequency and household are kept within their limits', () => {
        const { record } = apply(home(), (d) => updateChecklist(d, 'checklist-1', {
            title: `  ${'x'.repeat(100)}  `, visitFrequency: 'fortnightly', household: 'Parking on the street.'
        }, CONFIG, LATER));
        expect(record.title).toHaveLength(80);
        expect(record.visitFrequency).toBeNull();
        expect(record.household).toBe('Parking on the street.');
        expect(record.updatedAt).toBe(LATER.toISOString());
        expect(apply(home(), (d) => updateChecklist(d, 'checklist-1', { title: '  ' }, CONFIG, LATER)).record.title).toBe('Our home');
    });

    test('levels are kept in stacking order, and one with rooms cannot go', () => {
        const doc = home();
        expect(C(doc).levels).toEqual(['main', 'second']);   // the bedroom added the second floor
        expect(apply(doc, (d) => setLevels(d, 'checklist-1', ['attic', 'main', 'second', 'basement', 'moat'], CONFIG, LATER)).record.levels)
            .toEqual(['basement', 'main', 'second', 'attic']);
        expect(apply(doc, (d) => setLevels(d, 'checklist-1', ['main'], CONFIG, LATER)).error).toBe(STOREtext('levelInUse'));
        expect(apply(doc, (d) => setLevels(d, 'checklist-1', [], CONFIG, LATER)).error).toBe(STOREtext('noLevels'));
    });

    test('preferences keep only known keys, in the taxonomy\'s order, and a capped note', () => {
        const { record } = apply(home(), (d) => setPreferences(d, 'checklist-1', {
            keys: ['pets-home', 'no-bleach', 'invented', 'no-bleach', 7], note: 'n'.repeat(400)
        }, CONFIG, LATER));
        expect(record.preferences).toEqual({ keys: ['no-bleach', 'pets-home'], note: 'n'.repeat(300) });
    });

    test('a removed checklist refuses changes until restored, and stops being the active one', () => {
        let doc = setSettings(home(), { activeId: 'checklist-1' }).doc;
        doc = apply(doc, (d) => deleteChecklist(d, 'checklist-1', CONFIG, LATER)).doc;
        expect(doc.settings.activeId).toBeNull();
        expect(apply(doc, (d) => updateChecklist(d, 'checklist-1', { title: 'x' }, CONFIG, LATER)).error).toBe(STOREtext('checklistRemoved'));
        expect(apply(doc, (d) => updateChecklist(d, 'nope-nope-1', { title: 'x' }, CONFIG, LATER)).error).toBe(STOREtext('noChecklist'));
        doc = apply(doc, (d) => restoreChecklist(d, 'checklist-1', CONFIG, LATER)).doc;
        expect(C(doc).deletedAt).toBeNull();
        expect(apply(doc, (d) => restoreChecklist(d, 'checklist-1', CONFIG, LATER)).doc).toEqual(doc);
    });
});

// copy.js STORE sentences without importing them twice.
function STOREtext(key) {
    return allCopy().find((c) => c.where === `copy.STORE.${key}`).text;
}

describe('rooms', () => {
    test('a room and its preset arrive together, in the preset\'s order', () => {
        const doc = home();
        const kitchen = itemsIn(C(doc), 'kitchen-1');
        expect(kitchen.map((i) => i.task)).toEqual(presetFor(SHEET, 'kitchen').map((p) => p.task));
        expect(kitchen.map((i) => i.order)).toEqual(kitchen.map((_, i) => i + 1));
        expect(kitchen.find((i) => i.task === 'countertops').options).toEqual(['disinfect']);
        expect(liveRooms(C(doc)).map((r) => r.label)).toEqual(['', "Emma's room"]);
    });

    test('an unknown level or kind of room is refused, and so is a preset the sheet would not price', () => {
        const doc = home();
        expect(apply(doc, (d) => addRoom(d, 'checklist-1', { level: 'roof', area: 'kitchen' }, CONFIG, NOW)).error).toBe(STOREtext('badLevel'));
        expect(apply(doc, (d) => addRoom(d, 'checklist-1', { level: 'main', area: 'moat' }, CONFIG, NOW)).error).toBe(STOREtext('badArea'));
        expect(apply(doc, (d) => addRoom(d, 'checklist-1', { level: 'main', area: 'bedroom' }, CONFIG, NOW,
            { check, presetItems: [{ task: 'stovetop' }] })).error).toBe('That task is not offered in this kind of room.');
    });

    test('at most 40 rooms, and a preset that would pass 200 tasks is refused whole', () => {
        let doc = home();
        for (let i = liveRooms(C(doc)).length; i < CONFIG.limits.rooms; i++) {
            doc = addRoom(doc, 'checklist-1', { level: 'main', area: 'closet' }, CONFIG, NOW).doc;
        }
        expect(apply(doc, (d) => addRoom(d, 'checklist-1', { level: 'main', area: 'closet' }, CONFIG, NOW)).error)
            .toBe('A checklist can have up to 40 rooms.');
        let big = home();
        const many = Array.from({ length: CONFIG.limits.items - liveItems(C(big)).length + 1 }, () => ({ task: 'mirrors', quantity: 1 }));
        expect(apply(big, (d) => addRoom(d, 'checklist-1', { level: 'main', area: 'bathroom' }, CONFIG, NOW, { presetItems: many })).error)
            .toBe('A checklist can have up to 200 tasks.');
    });

    test('a room keeps its kind, but its label and level can change', () => {
        const { record, doc } = apply(home(), (d) => updateRoom(d, 'checklist-1', 'bedroom-1', { label: 'Guest room', level: 'attic', area: 'garage' }, CONFIG, LATER));
        expect(record).toMatchObject({ label: 'Guest room', level: 'attic', area: 'bedroom' });
        expect(C(doc).levels).toEqual(['main', 'second', 'attic']);
    });

    test('removing a room takes its tasks with it, and restoring brings back exactly those', () => {
        let doc = home();
        const kitchenItems = itemsIn(C(doc), 'kitchen-1');
        doc = deleteItem(doc, 'checklist-1', kitchenItems[0].id, CONFIG, NOW).doc;           // removed on its own first
        doc = apply(doc, (d) => deleteRoom(d, 'checklist-1', 'kitchen-1', CONFIG, LATER)).doc;
        expect(itemsIn(C(doc), 'kitchen-1')).toEqual([]);
        expect(apply(doc, (d) => addItem(d, 'checklist-1', { roomId: 'kitchen-1', task: 'stovetop' }, CONFIG, LATER)).error).toBe(STOREtext('roomRemoved'));
        expect(apply(doc, (d) => restoreItem(d, 'checklist-1', kitchenItems[1].id, CONFIG, LATER)).error).toBe(STOREtext('roomOfRemovedRoom'));
        doc = apply(doc, (d) => restoreRoom(d, 'checklist-1', 'kitchen-1', CONFIG, LATER)).doc;
        const back = itemsIn(C(doc), 'kitchen-1').map((i) => i.id);
        expect(back).toEqual(kitchenItems.slice(1).map((i) => i.id));
    });
});

describe('items', () => {
    test('a task joins the end of its room, and its choices are checked through the sheet', () => {
        const doc = home();
        const { record } = apply(doc, (d) => addItem(d, 'checklist-1', { roomId: 'bedroom-1', task: 'make-bed', quantity: 2, important: true,
            notes: 'Hospital corners, please.' }, CONFIG, LATER, { check }));
        expect(record).toMatchObject({ task: 'make-bed', quantity: 2, important: true, order: 1, size: null, photos: [] });
        expect(apply(doc, (d) => addItem(d, 'checklist-1', { roomId: 'bedroom-1', task: 'stovetop' }, CONFIG, LATER, { check })).error)
            .toBe('That task is not offered in this kind of room.');
        expect(apply(doc, (d) => addItem(d, 'checklist-1', { roomId: 'bedroom-1', task: 'make-bed', size: 'large' }, CONFIG, LATER, { check })).error)
            .toBe('This task is not priced by room size.');
        expect(apply(doc, (d) => addItem(d, 'checklist-1', { roomId: 'nowhere-1', task: 'make-bed' }, CONFIG, LATER, { check })).error)
            .toBe(STOREtext('noRoom'));
    });

    test('changing a task keeps the task itself, and still checks the choices', () => {
        const doc = home();
        const stove = itemsIn(C(doc), 'kitchen-1').find((i) => i.task === 'stovetop');
        const up = apply(doc, (d) => updateItem(d, 'checklist-1', stove.id, { task: 'oven-interior', options: ['deep-clean'], avoid: 'No steel wool.' }, CONFIG, LATER, { check }));
        expect(up.record).toMatchObject({ task: 'stovetop', options: ['deep-clean'], avoid: 'No steel wool.' });
        expect(apply(doc, (d) => updateItem(d, 'checklist-1', stove.id, { options: ['tracks'] }, CONFIG, LATER, { check })).error)
            .toBe('That option is not available for this task.');
    });

    test('a removed task can be restored, and changes to it wait until then', () => {
        let doc = home();
        const id = itemsIn(C(doc), 'kitchen-1')[0].id;
        doc = apply(doc, (d) => deleteItem(d, 'checklist-1', id, CONFIG, LATER)).doc;
        expect(apply(doc, (d) => updateItem(d, 'checklist-1', id, { notes: 'x' }, CONFIG, LATER)).error).toBe(STOREtext('itemRemoved'));
        expect(apply(doc, (d) => deleteItem(d, 'checklist-1', id, CONFIG, LATER)).error).toBe(STOREtext('itemRemoved'));
        doc = apply(doc, (d) => restoreItem(d, 'checklist-1', id, CONFIG, LATER)).doc;
        expect(liveItems(C(doc)).some((i) => i.id === id)).toBe(true);
        expect(apply(doc, (d) => deleteItem(d, 'checklist-1', 'nope-nope-1', CONFIG, LATER)).error).toBe(STOREtext('noItem'));
    });

    test('photos: up to 5 a task and 60 a checklist, added once each', () => {
        let doc = home();
        const items = itemsIn(C(doc), 'kitchen-1');
        const id = items[0].id;
        for (let p = 0; p < 5; p++) doc = addPhoto(doc, 'checklist-1', id, `photo-${p}-xx`, CONFIG, NOW).doc;
        expect(apply(doc, (d) => addPhoto(d, 'checklist-1', id, 'photo-0-xx', CONFIG, NOW)).doc.checklists[0].items
            .find((i) => i.id === id).photos).toHaveLength(5);
        expect(apply(doc, (d) => addPhoto(d, 'checklist-1', id, 'photo-9-xx', CONFIG, NOW)).error).toBe('A task can have up to 5 photos.');
        doc = apply(doc, (d) => removePhoto(d, 'checklist-1', id, 'photo-0-xx', CONFIG, NOW)).doc;
        expect(photoCount(C(doc))).toBe(4);
        expect(photoIdsInUse(doc).has('photo-1-xx')).toBe(true);

        for (const item of items.slice(1)) {
            for (let p = 0; p < 5 && photoCount(C(doc)) < 60; p++) {
                doc = addPhoto(doc, 'checklist-1', item.id, `p-${item.id.slice(0, 8)}-${p}`, CONFIG, NOW).doc;
            }
        }
        // Nine kitchen tasks hold at most 45, so top up in the bedroom's own tasks.
        for (let n = 0; photoCount(C(doc)) < 60; n++) {
            const made = addItem(doc, 'checklist-1', { roomId: 'bedroom-1', task: 'mirrors', quantity: 1 }, CONFIG, NOW);
            doc = made.doc;
            for (let p = 0; p < 5 && photoCount(C(doc)) < 60; p++) doc = addPhoto(doc, 'checklist-1', made.record.id, `q-${n}-${p}-xxx`, CONFIG, NOW).doc;
        }
        const spare = addItem(doc, 'checklist-1', { roomId: 'bedroom-1', task: 'mirrors' }, CONFIG, NOW);
        expect(apply(spare.doc, (d) => addPhoto(d, 'checklist-1', spare.record.id, 'one-too-many', CONFIG, NOW)).error)
            .toBe('A checklist can have up to 60 photos.');
    });

    test('tasks in a removed room are not live, wherever they are counted', () => {
        const doc = deleteRoom(home(), 'checklist-1', 'kitchen-1', CONFIG, NOW).doc;
        expect(liveItems(C(doc)).some((i) => i.roomId === 'kitchen-1')).toBe(false);
    });
});

describe('the rest of the document', () => {
    test('the example home is cleared on its own', () => {
        let doc = home();
        doc = createChecklist(doc, { title: 'Example' }, CONFIG, NOW, { id: 'sample-1', sample: true }).doc;
        doc = setSettings(doc, { activeId: 'sample-1' }).doc;
        expect(hasSamples(doc)).toBe(true);
        const cleared = apply(doc, (d) => clearSamples(d)).doc;
        expect(cleared.checklists.map((c) => c.id)).toEqual(['checklist-1']);
        expect(cleared.settings.activeId).toBeNull();
        expect(hasSamples(cleared)).toBe(false);
    });

    test('settings take only what makes sense', () => {
        const doc = home();
        expect(setSettings(doc, { coached: 5, activeId: 'checklist-1' }).doc.settings).toEqual({ coached: 5, activeId: 'checklist-1' });
        expect(setSettings(doc, { coached: -1, activeId: 'ghost-ghost' }).doc.settings).toEqual({ coached: 0, activeId: null });
        expect(touchVisit(doc, LATER).doc.meta.lastVisitAt).toBe(LATER.toISOString());
    });

    test('storage use is measured against the budget', () => {
        const use = storageUse(home(), CONFIG);
        expect(use.chars).toBe(JSON.stringify(home()).length);
        expect(use.nearlyFull).toBe(false);
        expect(storageUse(home(), { storage: { budgetChars: 100, warnAt: 0.8 } }).nearlyFull).toBe(true);
    });
});

describe('validate: whatever another tab or an older build wrote', () => {
    test('a saved document comes back exactly as it was', () => {
        const doc = home();
        const back = validate(JSON.parse(JSON.stringify(doc)), CONFIG, LATER);
        expect(back).toEqual({ ok: true, doc, dropped: 0 });
    });

    test('a newer schema is left alone, and a missing one is unreadable', () => {
        expect(migrate({ schema: 2 }, CONFIG)).toEqual({ ok: false, reason: 'newer' });
        expect(validate({ schema: 2 }, CONFIG, NOW)).toEqual({ ok: false, reason: 'newer' });
        expect(validate({ checklists: [] }, CONFIG, NOW)).toEqual({ ok: false, reason: 'invalid' });
        expect(validate({ schema: 0 }, CONFIG, NOW)).toEqual({ ok: false, reason: 'invalid' });
        expect(validate(null, CONFIG, NOW)).toEqual({ ok: false, reason: 'invalid' });
    });

    test('hostile and broken records are dropped and counted, and every string is capped', () => {
        const doc = JSON.parse(JSON.stringify(home()));
        const c = doc.checklists[0];
        c.title = 'T'.repeat(500);
        c.evil = '<script>';
        c.rooms.push({ id: 'bad', level: 'main', area: 'kitchen' });                  // id too short
        c.rooms.push({ id: 'cellar-1', level: 'basement', area: 'kitchen' });         // a level the home lacks
        c.rooms.push({ id: 'kitchen-1', level: 'main', area: 'kitchen' });            // a repeated id
        c.items.push({ id: 'orphan-11', roomId: 'nowhere-1', task: 'stovetop' });     // no such room
        c.items.push({ id: 'shout-111', roomId: 'kitchen-1', task: 'STOVETOP' });     // not a key
        c.items.push({ id: 'big-notes', roomId: 'kitchen-1', task: 'stovetop', notes: 'n'.repeat(900),
            quantity: 9999, size: 'huge', options: ['deep-clean', 'deep-clean', '<b>'], photos: ['ok-photo-1', '../etc'] });
        doc.checklists.push({ id: 'roofing-1', serviceType: 'roofing' });
        doc.checklists.push({ id: 'checklist-1', serviceType: 'cleaning' });           // a repeated checklist
        doc.settings = { coached: 'all', activeId: 'ghost-ghost' };

        const out = validate(doc, CONFIG, LATER);
        expect(out.ok).toBe(true);
        expect(out.dropped).toBe(7);
        const back = out.doc.checklists[0];
        expect(out.doc.checklists).toHaveLength(1);
        expect(back.title).toHaveLength(80);
        expect(back.evil).toBeUndefined();
        const big = back.items.find((i) => i.id === 'big-notes');
        expect(big).toMatchObject({ quantity: null, size: null, options: ['deep-clean'], photos: ['ok-photo-1'] });
        expect(big.notes).toHaveLength(500);
        expect(out.doc.settings).toEqual({ coached: 0, activeId: null });
    });

    test('removed records are forgotten after 30 days, and kept before', () => {
        let doc = home();
        doc = deleteRoom(doc, 'checklist-1', 'bedroom-1', CONFIG, NOW).doc;
        const day = (n) => new Date(NOW.getTime() + n * 86400000);
        expect(validate(doc, CONFIG, day(29)).doc.checklists[0].rooms.some((r) => r.id === 'bedroom-1')).toBe(true);
        const later = validate(doc, CONFIG, day(31));
        expect(later.doc.checklists[0].rooms.some((r) => r.id === 'bedroom-1')).toBe(false);
        expect(later.dropped).toBe(1);
    });
});

describe('createStore and its three guards', () => {
    function memory() {
        const map = new Map();
        return {
            map,
            getItem: (k) => (map.has(k) ? map.get(k) : null),
            setItem: (k, v) => map.set(k, String(v)),
            removeItem: (k) => map.delete(k)
        };
    }

    test('fresh, then saved, then restored', () => {
        const storage = memory();
        const store = createStore(storage, CONFIG);
        expect(store.load(NOW).status).toBe('fresh');
        const saved = home();
        expect(store.save(saved)).toBe(true);
        const again = createStore(storage, CONFIG).load(LATER);
        expect(again.status).toBe('restored');
        expect(again.doc).toEqual(saved);
    });

    test('GUARD 1: nothing is written after teardown', () => {
        const storage = memory();
        const store = createStore(storage, CONFIG);
        store.load(NOW);
        store.save(home());
        store.tearDown();
        expect(store.save(emptyDoc(CONFIG, NOW))).toBe(false);
        expect(JSON.parse(storage.map.get(CONFIG.storage.key)).checklists).toHaveLength(1);
        expect(store.writable).toBe(false);
    });

    test('GUARD 2: a browser that refused once is never asked again', () => {
        let writes = 0;
        const storage = { getItem: () => null, setItem: () => { writes++; throw new Error('QuotaExceeded'); }, removeItem() {} };
        const store = createStore(storage, CONFIG);
        store.load(NOW);
        expect(store.save(home())).toBe(false);
        expect(store.save(home())).toBe(false);
        expect(writes).toBe(1);
        expect(store.available).toBe(false);

        const refusing = createStore({ getItem: () => { throw new Error('denied'); }, setItem() {}, removeItem() {} }, CONFIG);
        expect(refusing.load(NOW).status).toBe('unavailable');
        expect(refusing.load(NOW).status).toBe('unavailable');
    });

    test('GUARD 3: a key another tab cleared is not brought back', () => {
        const storage = memory();
        const store = createStore(storage, CONFIG);
        store.load(NOW);
        store.save(home());
        storage.removeItem(CONFIG.storage.key);          // the other tab
        expect(store.save(home())).toBe(false);
        expect(storage.map.has(CONFIG.storage.key)).toBe(false);
        // Following the change resets the guard, and saving works again.
        expect(store.load(LATER).status).toBe('fresh');
        expect(store.save(home())).toBe(true);
    });

    test('a newer build\'s document, or text that is not one, is left untouched', () => {
        for (const [saved, status] of [[JSON.stringify({ schema: 9 }), 'newer'], ['{not json', 'unreadable'], [JSON.stringify({ schema: 'x' }), 'unreadable']]) {
            const storage = memory();
            storage.setItem(CONFIG.storage.key, saved);
            const store = createStore(storage, CONFIG);
            expect(store.load(NOW).status).toBe(status);
            expect(store.save(home())).toBe(false);
            expect(storage.map.get(CONFIG.storage.key)).toBe(saved);
        }
    });

    test('clearing removes everything, and saving works again after', () => {
        const storage = memory();
        storage.setItem(CONFIG.storage.key, '{not json');
        const store = createStore(storage, CONFIG);
        store.load(NOW);
        store.clear();
        expect(storage.map.has(CONFIG.storage.key)).toBe(false);
        expect(store.status).toBe('fresh');
        expect(store.save(home())).toBe(true);
    });
});

describe('undo', () => {
    test('steps come back newest first, with their labels, and the oldest fall off', () => {
        const h = createHistory(2);
        expect(h.canUndo).toBe(false);
        expect(h.undo()).toBeNull();
        h.push('a', 'Added the kitchen');
        h.push('b', 'Removed Stovetop');
        h.push('c', null);
        expect(h.size).toBe(2);
        expect(h.label).toBe('');
        expect(h.undo()).toEqual({ doc: 'c', label: '' });
        expect(h.label).toBe('Removed Stovetop');
        expect(h.undo().doc).toBe('b');
        expect(h.undo()).toBeNull();
        h.push('d', 'x');
        h.clear();
        expect(h.canUndo).toBe(false);
        expect(createHistory().size).toBe(0);
    });
});
