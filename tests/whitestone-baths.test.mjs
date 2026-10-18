// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Bath types (M2 step 4b, PRD 8.10): a bathroom is a full bath (a tub with
 * its shower), a shower bath (a stall, no tub), or a half bath (the
 * powder-room area). The rule is the taxonomy's, by task key, so the price
 * sheet is unchanged: the bathtub task comes with a full bath, in its
 * standard tasks, and never in a shower bath. Then the store's `bath` field
 * and its migration, a change of type in one step, what the panel offers,
 * the service menu, and the example home.
 *
 * Every check runs on the sheet the studio ships with, since the rule is
 * only right if it is right for the real presets.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../www/whitestone/js/config.js';
import {
    TAXONOMY, bathOf, bathAllows, bathTasks, bathChoices, bathChoiceOf, listedArea, areaOf
} from '../www/whitestone/js/taxonomy.js';
import { checkChoice, tasksFor, presetFor, presetGains, validateSheet } from '../www/whitestone/js/sheet.js';
import {
    emptyDoc, createChecklist, addRoom, addItem, updateItem, setBath, validate, itemsIn, findChecklist, duplicateChecklist
} from '../www/whitestone/js/store.js';
import { panelView } from '../www/whitestone/js/panel.js';
import { withExample } from '../www/whitestone/js/samples.js';
import { layoutKey, bathsOf } from '../www/whitestone/js/model.js';
import { UI, STORE, ITEM_ERRORS, theList, allCopy } from '../www/whitestone/js/copy.js';

const WS = join(process.cwd(), 'www', 'whitestone');
const index = JSON.parse(readFileSync(join(WS, 'data', 'prices', 'index.json'), 'utf8'));
const SHEET = JSON.parse(readFileSync(join(WS, 'data', 'prices', `${index.cleaning}.json`), 'utf8'));
const NOW = new Date('2026-10-14T16:00:00Z');
const LATER = new Date('2026-10-14T17:00:00Z');
const check = (choice, area, bath) => checkChoice(SHEET, choice, area, bath);
const tasks = (list) => list.map((p) => p.task);
const live = (c, roomId) => itemsIn(c, roomId).map((i) => i.task);

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.keys(value)) deepFreeze(value[key]);
    }
    return value;
}

/** A home with a room of `area` (and `bath`) and its standard tasks, on a
 *  frozen document, so a mutation that changed its input would throw. */
function homeWith(area, bath, level = 'second') {
    let doc = emptyDoc(CONFIG, NOW);
    doc = createChecklist(doc, { levels: ['main', 'second'] }, CONFIG, NOW, { id: 'checklist-1' }).doc;
    const out = addRoom(doc, 'checklist-1', { level, area, bath }, CONFIG, NOW,
        { id: 'bath-room-1', check, presetItems: presetFor(SHEET, area, bath) });
    expect(out.error).toBeNull();
    return deepFreeze(out.doc);
}
const listOf = (doc) => findChecklist(doc, 'checklist-1');
const roomOf = (doc) => listOf(doc).rooms.find((r) => r.id === 'bath-room-1');

/** setBath as the page calls it: what the new type brings that the room
 *  lacks, checked by the sheet. */
function makeIt(doc, key, at = LATER) {
    const room = roomOf(doc);
    const to = bathChoices('cleaning', room.area).find((x) => x.key === key);
    const presetItems = to ? presetGains(SHEET, room, to, live(listOf(doc), room.id)) : [];
    return setBath(doc, 'checklist-1', room.id, key, CONFIG, at, { check, presetItems });
}

describe('the rule (taxonomy.js)', () => {
    test('a bathroom and a primary bathroom have bath types, a full bath by default; no other room does', () => {
        expect(TAXONOMY.cleaning.baths.areas).toEqual(['primary-bathroom', 'bathroom']);
        for (const area of ['bathroom', 'primary-bathroom']) {
            expect(bathOf('cleaning', area, undefined)).toBe('tub');
            expect(bathOf('cleaning', area, null)).toBe('tub');
            expect(bathOf('cleaning', area, 'shower')).toBe('shower');
            expect(bathOf('cleaning', area, 'tub')).toBe('tub');
            expect(bathOf('cleaning', area, 'jacuzzi')).toBe('tub');
        }
        for (const area of ['kitchen', 'powder-room', 'bedroom', 'garage']) expect(bathOf('cleaning', area, 'shower')).toBeNull();
        // A service type without baths, or none at all.
        expect(bathOf('landscaping', 'lawn', 'shower')).toBeNull();
        expect(bathOf('nonsense', 'bathroom', 'shower')).toBeNull();
    });

    test('the bathtub comes with a full bath alone; every other task is the sheet\'s to decide', () => {
        expect(bathAllows('cleaning', 'bathroom', 'shower', 'bathtub')).toBe(false);
        expect(bathAllows('cleaning', 'primary-bathroom', 'shower', 'bathtub')).toBe(false);
        expect(bathAllows('cleaning', 'bathroom', 'tub', 'bathtub')).toBe(true);
        expect(bathAllows('cleaning', 'bathroom', undefined, 'bathtub')).toBe(true);
        // A shower bath keeps its shower, and a full bath has one too.
        expect(bathAllows('cleaning', 'bathroom', 'shower', 'shower')).toBe(true);
        expect(bathAllows('cleaning', 'bathroom', 'tub', 'shower')).toBe(true);
        // Not a bath type's rule outside a bathroom (the sheet refuses it there).
        expect(bathAllows('cleaning', 'kitchen', 'shower', 'bathtub')).toBe(true);
        expect(bathAllows('landscaping', 'lawn', null, 'bathtub')).toBe(true);
        expect(bathTasks('cleaning', 'bathroom', 'tub')).toEqual([{ task: 'bathtub', after: 'shower' }]);
        expect(bathTasks('cleaning', 'bathroom', 'shower')).toEqual([]);
        expect(bathTasks('cleaning', 'kitchen', 'tub')).toEqual([]);
    });

    test('a bathroom or a half bath can be any of three types; a primary bathroom, two; any other room, none', () => {
        const full = { key: 'tub', area: 'bathroom', bath: 'tub', name: 'Full bath' };
        const shower = { key: 'shower', area: 'bathroom', bath: 'shower', name: 'Shower bath' };
        const half = { key: 'half', area: 'powder-room', bath: null, name: 'Half bath' };
        expect(bathChoices('cleaning', 'bathroom')).toEqual([full, shower, half]);
        expect(bathChoices('cleaning', 'powder-room')).toEqual([full, shower, half]);
        expect(bathChoices('cleaning', 'primary-bathroom')).toEqual([
            { ...full, area: 'primary-bathroom' }, { ...shower, area: 'primary-bathroom' }
        ]);
        for (const area of ['kitchen', 'bedroom', 'closet', '']) expect(bathChoices('cleaning', area)).toEqual([]);
        expect(bathChoices('landscaping', 'lawn')).toEqual([]);
        // Which one a room is now.
        expect(bathChoiceOf('cleaning', { area: 'bathroom', bath: 'shower' })).toBe('shower');
        expect(bathChoiceOf('cleaning', { area: 'bathroom', bath: null })).toBe('tub');
        expect(bathChoiceOf('cleaning', { area: 'powder-room', bath: null })).toBe('half');
        expect(bathChoiceOf('cleaning', { area: 'kitchen', bath: null })).toBeNull();
        expect(bathChoiceOf('cleaning', null)).toBeNull();
    });

    test('the half bath is the powder-room key under its new name, and a form lists it as a bathroom', () => {
        expect(areaOf('cleaning', 'powder-room').name).toBe('Half bath');
        expect(listedArea('cleaning', 'powder-room')).toBe('bathroom');
        expect(listedArea('cleaning', 'bathroom')).toBe('bathroom');
        expect(listedArea('cleaning', 'kitchen')).toBe('kitchen');
        expect(listedArea('landscaping', 'lawn')).toBe('lawn');
    });

    test('every task a bath type names is on the sheet, offered in every bathroom area, after a task its preset has', () => {
        for (const type of TAXONOMY.cleaning.baths.types) {
            for (const t of type.tasks) {
                const task = SHEET.tasks.find((x) => x.key === t.task);
                expect(task).toBeDefined();
                for (const area of TAXONOMY.cleaning.baths.areas) {
                    expect(task.areas).toContain(area);
                    expect(tasks(SHEET.presets[area])).toContain(t.after);
                }
            }
        }
    });
});

describe('the sheet, by type of bath (sheet.js)', () => {
    test('the bathtub is refused in a shower bath, and only there', () => {
        expect(check({ task: 'bathtub' }, 'bathroom', 'shower')).toBe('not-with-bath');
        expect(check({ task: 'bathtub' }, 'primary-bathroom', 'shower')).toBe('not-with-bath');
        expect(check({ task: 'bathtub' }, 'bathroom', 'tub')).toBeNull();
        expect(check({ task: 'bathtub' }, 'bathroom')).toBeNull();
        // The sheet's own rule still comes first: no bathtub in a half bath.
        expect(check({ task: 'bathtub' }, 'powder-room', null)).toBe('not-offered');
        // Without an area, as for an add-on to an item already placed.
        expect(check({ task: 'bathtub' })).toBeNull();
        expect(ITEM_ERRORS['not-with-bath']).toMatch(/full bath/);
    });

    test('the tasks offered follow the type', () => {
        const keys = (bath) => tasksFor(SHEET, 'bathroom', bath).map((t) => t.key);
        const full = keys('tub');
        const shower = keys('shower');
        expect(full).toContain('bathtub');
        expect(full).toContain('shower');
        expect(shower).not.toContain('bathtub');
        expect(shower).toContain('shower');
        expect(full.filter((k) => k !== 'bathtub')).toEqual(shower);
        expect(keys(undefined)).toEqual(full);
        expect(tasksFor(SHEET, 'powder-room', null).map((t) => t.key)).not.toContain('bathtub');
    });

    test('a full bath\'s standard tasks have its bathtub after its shower; a shower bath\'s, none; the sheet is unchanged', () => {
        const before = JSON.stringify(SHEET.presets);
        for (const area of ['bathroom', 'primary-bathroom']) {
            const sheetPreset = tasks(SHEET.presets[area]);
            expect(sheetPreset).not.toContain('bathtub');
            const full = tasks(presetFor(SHEET, area, 'tub'));
            const at = full.indexOf('shower');
            expect(full[at + 1]).toBe('bathtub');
            expect(full.filter((k) => k !== 'bathtub')).toEqual(sheetPreset);
            expect(tasks(presetFor(SHEET, area))).toEqual(full);
            expect(tasks(presetFor(SHEET, area, 'shower'))).toEqual(sheetPreset);
            // Every standard task is one the type allows, and the sheet prices.
            for (const bath of ['tub', 'shower']) {
                for (const p of presetFor(SHEET, area, bath)) expect(`${area}/${bath} ${p.task} ${check(p, area, bath)}`).toBe(`${area}/${bath} ${p.task} null`);
            }
        }
        // A half bath, and every other kind of room, as the sheet has it.
        for (const area of Object.keys(SHEET.presets).filter((a) => !['bathroom', 'primary-bathroom'].includes(a))) {
            expect(presetFor(SHEET, area)).toEqual(SHEET.presets[area]);
        }
        expect(presetFor(SHEET, 'no-such-area')).toEqual([]);
        expect(JSON.stringify(SHEET.presets)).toBe(before);
        expect(validateSheet(SHEET)).toEqual([]);
    });

    test('a preset with its bathtub already, or no shower to follow, still has one bathtub', () => {
        const withTub = { ...SHEET, presets: { ...SHEET.presets, bathroom: [{ task: 'bathtub', options: [] }, { task: 'toilet', options: [] }] } };
        expect(tasks(presetFor(withTub, 'bathroom', 'tub'))).toEqual(['bathtub', 'toilet']);
        expect(tasks(presetFor(withTub, 'bathroom', 'shower'))).toEqual(['toilet']);
        const noShower = { ...SHEET, presets: { ...SHEET.presets, bathroom: [{ task: 'toilet', options: [] }] } };
        expect(tasks(presetFor(noShower, 'bathroom', 'tub'))).toEqual(['toilet', 'bathtub']);
        // A sheet that does not offer the bathtub there adds none.
        const noTub = { ...SHEET, tasks: SHEET.tasks.filter((t) => t.key !== 'bathtub') };
        expect(tasks(presetFor(noTub, 'bathroom', 'tub'))).toEqual(tasks(SHEET.presets.bathroom));
    });

    test('a change of type gains only what the new type brings and the room lacks', () => {
        const at = (area, bath) => ({ area, bath });
        expect(tasks(presetGains(SHEET, at('bathroom', 'shower'), at('bathroom', 'tub')))).toEqual(['bathtub']);
        expect(tasks(presetGains(SHEET, at('bathroom', 'tub'), at('bathroom', 'shower')))).toEqual([]);
        expect(tasks(presetGains(SHEET, at('powder-room', null), at('bathroom', 'tub')))).toEqual(['shower', 'bathtub']);
        expect(tasks(presetGains(SHEET, at('powder-room', null), at('bathroom', 'shower')))).toEqual(['shower']);
        expect(tasks(presetGains(SHEET, at('bathroom', 'tub'), at('powder-room', null)))).toEqual([]);
        // What the room has already is never added twice.
        expect(tasks(presetGains(SHEET, at('powder-room', null), at('bathroom', 'tub'), ['shower']))).toEqual(['bathtub']);
    });
});

describe('the store (store.js)', () => {
    test('a bathroom saved before bath types is a full bath; a type is kept; any other room has none', () => {
        const raw = {
            schema: 1,
            checklists: [{
                id: 'checklist-1', serviceType: 'cleaning', levels: ['second'],
                rooms: [
                    { id: 'room-old-1', level: 'second', area: 'bathroom' },
                    { id: 'room-shower', level: 'second', area: 'primary-bathroom', bath: 'shower' },
                    { id: 'room-odd-1', level: 'second', area: 'bathroom', bath: 'hot-tub' },
                    { id: 'room-bed-1', level: 'second', area: 'bedroom', bath: 'shower' },
                    { id: 'room-half-1', level: 'second', area: 'powder-room', bath: 'tub' }
                ],
                items: []
            }],
            settings: {},
            meta: {}
        };
        const out = validate(raw, CONFIG, NOW);
        expect(out.ok).toBe(true);
        expect(out.dropped).toBe(0);
        expect(out.doc.checklists[0].rooms.map((r) => [r.id, r.bath])).toEqual([
            ['room-old-1', 'tub'], ['room-shower', 'shower'], ['room-odd-1', 'tub'], ['room-bed-1', null], ['room-half-1', null]
        ]);
        // No new schema: a field with a default needs none.
        expect(out.doc.schema).toBe(1);
    });

    test('a room is added as its type, with that type\'s standard tasks', () => {
        const full = homeWith('bathroom', undefined);
        expect(roomOf(full).bath).toBe('tub');
        expect(live(listOf(full), 'bath-room-1')).toContain('bathtub');
        const shower = homeWith('bathroom', 'shower');
        expect(roomOf(shower).bath).toBe('shower');
        expect(live(listOf(shower), 'bath-room-1')).not.toContain('bathtub');
        const half = homeWith('powder-room', null, 'main');
        expect(roomOf(half).bath).toBeNull();
        expect(live(listOf(half), 'bath-room-1')).toEqual(tasks(SHEET.presets['powder-room']));
        // A preset with a bathtub is refused for a shower bath, as one step.
        const doc = createChecklist(emptyDoc(CONFIG, NOW), {}, CONFIG, NOW, { id: 'checklist-1' }).doc;
        const refused = addRoom(doc, 'checklist-1', { level: 'main', area: 'bathroom', bath: 'shower' }, CONFIG, NOW,
            { check, presetItems: presetFor(SHEET, 'bathroom', 'tub') });
        expect(refused.error).toBe(ITEM_ERRORS['not-with-bath']);
        expect(refused.doc).toBe(doc);
    });

    test('a shower bath refuses the bathtub, as a new task or a changed one; a full bath takes it', () => {
        const shower = homeWith('bathroom', 'shower');
        const refused = addItem(shower, 'checklist-1', { roomId: 'bath-room-1', task: 'bathtub' }, CONFIG, LATER, { check });
        expect(refused.error).toBe(ITEM_ERRORS['not-with-bath']);
        expect(refused.doc).toBe(shower);
        const ok = addItem(shower, 'checklist-1', { roomId: 'bath-room-1', task: 'toilet' }, CONFIG, LATER, { check });
        expect(ok.error).toBeNull();
        const full = homeWith('bathroom', 'tub');
        const tub = itemsIn(listOf(full), 'bath-room-1').find((i) => i.task === 'bathtub');
        expect(updateItem(full, 'checklist-1', tub.id, { options: ['descale'] }, CONFIG, LATER, { check }).error).toBeNull();
    });

    test('a full bath made a shower bath loses its bathtub, under one stamp, and the rest stay as they were', () => {
        const full = homeWith('bathroom', 'tub');
        const before = itemsIn(listOf(full), 'bath-room-1');
        const out = makeIt(full, 'shower');
        expect(out.error).toBeNull();
        expect(roomOf(out.doc)).toMatchObject({ area: 'bathroom', bath: 'shower', updatedAt: LATER.toISOString() });
        expect(out.record.room.bath).toBe('shower');
        expect(out.record.removed.map((i) => i.task)).toEqual(['bathtub']);
        expect(out.record.added).toEqual([]);
        const gone = listOf(out.doc).items.find((i) => i.task === 'bathtub');
        expect(gone.deletedAt).toBe(LATER.toISOString());
        expect(itemsIn(listOf(out.doc), 'bath-room-1')).toEqual(before.filter((i) => i.task !== 'bathtub'));
        expect(listOf(out.doc).updatedAt).toBe(LATER.toISOString());
    });

    test('a shower bath made full gains its bathtub, last in the room\'s order', () => {
        const shower = homeWith('bathroom', 'shower');
        const out = makeIt(shower, 'tub');
        expect(out.error).toBeNull();
        expect(roomOf(out.doc).bath).toBe('tub');
        expect(out.record.added.map((i) => i.task)).toEqual(['bathtub']);
        expect(out.record.removed).toEqual([]);
        const list = itemsIn(listOf(out.doc), 'bath-room-1');
        expect(list[list.length - 1].task).toBe('bathtub');
        expect(list.map((i) => i.order)).toEqual([...list.map((i) => i.order)].sort((a, b) => a - b));
        expect(new Set(list.map((i) => i.order)).size).toBe(list.length);
    });

    test('a full bath made half loses what a half bath cannot have; made full again, gains its shower and tub', () => {
        let doc = homeWith('bathroom', 'tub');
        doc = deepFreeze(addItem(doc, 'checklist-1', { roomId: 'bath-room-1', task: 'cabinet-fronts', size: 'small' }, CONFIG, NOW, { check }).doc);
        const half = makeIt(doc, 'half');
        expect(half.error).toBeNull();
        expect(roomOf(half.doc)).toMatchObject({ area: 'powder-room', bath: null });
        expect(half.record.removed.map((i) => i.task).sort()).toEqual(['bathtub', 'cabinet-fronts', 'shower']);
        for (const i of itemsIn(listOf(half.doc), 'bath-room-1')) expect(checkChoice(SHEET, i, 'powder-room', null)).toBeNull();
        const full = makeIt(deepFreeze(half.doc), 'tub', new Date('2026-10-14T18:00:00Z'));
        expect(full.error).toBeNull();
        expect(roomOf(full.doc)).toMatchObject({ area: 'bathroom', bath: 'tub' });
        expect(full.record.added.map((i) => i.task)).toEqual(['shower', 'bathtub']);
        // What a full bath does not bring by itself stays off.
        expect(live(listOf(full.doc), 'bath-room-1')).not.toContain('cabinet-fronts');
    });

    test('the same type again changes nothing; a primary bath is never half; other rooms have no type', () => {
        const full = homeWith('bathroom', 'tub');
        const same = makeIt(full, 'tub');
        expect(same.error).toBeNull();
        expect(same.doc).toBe(full);
        const primary = homeWith('primary-bathroom', 'tub');
        const halfPrimary = setBath(primary, 'checklist-1', 'bath-room-1', 'half', CONFIG, LATER, { check });
        expect(halfPrimary.error).toBe(STORE.notABath);
        expect(halfPrimary.doc).toBe(primary);
        expect(makeIt(primary, 'shower').error).toBeNull();
        const kitchen = homeWith('kitchen', undefined, 'main');
        expect(setBath(kitchen, 'checklist-1', 'bath-room-1', 'shower', CONFIG, LATER, { check }).error).toBe(STORE.notABath);
        expect(setBath(full, 'checklist-1', 'no-such-room', 'shower', CONFIG, LATER, { check }).error).toBe(STORE.noRoom);
        expect(setBath(full, 'no-such-list', 'bath-room-1', 'shower', CONFIG, LATER, { check }).error).toBe(STORE.noChecklist);
    });

    test('a task the new type brings that the sheet refuses stops the change, and the task limit holds', () => {
        const shower = homeWith('bathroom', 'shower');
        const bad = setBath(shower, 'checklist-1', 'bath-room-1', 'tub', CONFIG, LATER, { check, presetItems: [{ task: 'stovetop' }] });
        expect(bad.error).toBe(ITEM_ERRORS['not-offered']);
        expect(bad.doc).toBe(shower);
        const full = { ...CONFIG, limits: { ...CONFIG.limits, items: itemsIn(listOf(shower), 'bath-room-1').length } };
        const over = setBath(shower, 'checklist-1', 'bath-room-1', 'tub', full, LATER, { check, presetItems: [{ task: 'bathtub' }] });
        expect(over.error).toBe(STORE.tooManyItems(full.limits.items));
        // One out and one in fits the same limit.
        const tub = homeWith('bathroom', 'tub');
        const tight = { ...CONFIG, limits: { ...CONFIG.limits, items: itemsIn(listOf(tub), 'bath-room-1').length } };
        expect(setBath(tub, 'checklist-1', 'bath-room-1', 'half', tight, LATER, { check }).error).toBeNull();
        // Three out and one in, at the limit: the ones going make the room.
        const swap = setBath(tub, 'checklist-1', 'bath-room-1', 'half', tight, LATER, { check, presetItems: [{ task: 'fresh-towels' }] });
        expect(swap.error).toBeNull();
        expect(swap.record.added.map((i) => i.task)).toEqual(['fresh-towels']);
    });

    test('a duplicate keeps each bathroom\'s type', () => {
        const shower = homeWith('bathroom', 'shower');
        const copy = duplicateChecklist(shower, 'checklist-1', CONFIG, LATER);
        expect(copy.record.rooms[0].bath).toBe('shower');
    });
});

describe('what the panel offers (panel.js)', () => {
    const sel = (doc) => ({ scope: 'room', level: roomOf(doc).level, roomId: 'bath-room-1', itemId: null });

    test('a bathroom offers its three types, the one it is pressed', () => {
        const doc = homeWith('bathroom', 'shower');
        const view = panelView(sel(doc), listOf(doc), SHEET);
        expect(view.baths).toEqual([
            { key: 'tub', label: 'Full bath', pressed: false },
            { key: 'shower', label: 'Shower bath', pressed: true },
            { key: 'half', label: 'Half bath', pressed: false }
        ]);
        const half = homeWith('powder-room', null, 'main');
        const halfView = panelView(sel(half), listOf(half), SHEET);
        expect(halfView.title).toBe('Half bath');
        expect(halfView.baths.filter((b) => b.pressed).map((b) => b.key)).toEqual(['half']);
    });

    test('a primary bath offers two; a kitchen, a floor and the house none', () => {
        const primary = homeWith('primary-bathroom', 'tub');
        expect(panelView(sel(primary), listOf(primary), SHEET).baths.map((b) => b.key)).toEqual(['tub', 'shower']);
        const kitchen = homeWith('kitchen', undefined, 'main');
        expect(panelView(sel(kitchen), listOf(kitchen), SHEET).baths).toBeNull();
        expect(panelView({ scope: 'floor', level: 'main', roomId: null, itemId: null }, listOf(kitchen), SHEET).baths).toBeNull();
        expect(panelView({ scope: 'house' }, listOf(kitchen), SHEET).baths).toBeNull();
        const item = itemsIn(listOf(primary), 'bath-room-1')[0];
        expect(panelView({ ...sel(primary), scope: 'task', itemId: item.id }, listOf(primary), SHEET).baths).toBeNull();
    });
});

describe('the example home and the model', () => {
    test('the example\'s primary bath is a shower bath, its hall bath a full bath with its tub', () => {
        const c = withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, (choice, area, bath) => checkChoice(SHEET, choice, area, bath)).doc.checklists[0];
        const primary = c.rooms.find((r) => r.area === 'primary-bathroom');
        const hall = c.rooms.find((r) => r.label === 'Hall bath');
        expect(primary.bath).toBe('shower');
        expect(hall.bath).toBe('tub');
        expect(live(c, hall.id)).toContain('bathtub');
        expect(c.rooms.filter((r) => r.bath).length).toBe(2);
    });

    test('a change of type is a change to the model, which draws each bath by its type', () => {
        const doc = homeWith('bathroom', 'tub');
        const made = makeIt(doc, 'shower').doc;
        expect(layoutKey(listOf(made))).not.toBe(layoutKey(listOf(doc)));
        expect(bathsOf(listOf(made))).toEqual(new Map([['bath-room-1', 'shower']]));
        const kitchen = homeWith('kitchen', undefined, 'main');
        expect(bathsOf(listOf(kitchen))).toEqual(new Map());
        // The type alone, with the very same tasks, is a change too.
        const c = listOf(doc);
        const asShower = { ...c, rooms: c.rooms.map((r) => ({ ...r, bath: 'shower' })) };
        expect(layoutKey(asShower)).not.toBe(layoutKey(c));
        // A room from before bath types (no field at all) keys as none.
        expect(layoutKey({ id: 'x', levels: ['main'], rooms: [{ id: 'r', level: 'main', area: 'bathroom' }], items: [] }))
            .toBe(layoutKey({ id: 'x', levels: ['main'], rooms: [{ id: 'r', level: 'main', area: 'bathroom', bath: null }], items: [] }));
    });
});

describe('the words', () => {
    test('a change of type says what it is now, and what came off and on, by name', () => {
        expect(UI.bathChanged('The bathroom', 'Shower bath', ['Bathtub'], [])).toBe('The bathroom is now a shower bath. Took off the bathtub.');
        expect(UI.bathChanged('Guest bath', 'Full bath', [], ['Shower', 'Bathtub'])).toBe('Guest bath is now a full bath. Added the shower and the bathtub.');
        expect(UI.bathChanged('The bathroom', 'Half bath', ['Shower', 'Bathtub', 'Cabinet fronts'], []))
            .toBe('The bathroom is now a half bath. Took off the shower, the bathtub and the cabinet fronts.');
        expect(UI.bathChanged('The bathroom', 'Full bath')).toBe('The bathroom is now a full bath.');
        expect(theList(['Toilet'])).toBe('the toilet');
        expect(theList([])).toBe('');
        // In the house-style sweep.
        expect(allCopy().some((c) => c.where === 'copy.UI.bathChanged')).toBe(true);
        expect(allCopy().some((c) => c.where === 'copy.PANEL.bathHeading')).toBe(true);
    });
});
