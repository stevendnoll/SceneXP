// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The panel beside the house (www/whitestone/js/panel.js, M2 step 3): what a
 * tap selects, one step back at a time, what is left of a selection when the
 * home changes, the rooms a floor is offered, and what the panel says for
 * the whole house, a floor, a room and a task. Then the panel driven through
 * the page: chips that add a room with its tasks, stars, removing a task,
 * the Rooms chip and the arrow keys, Escape, and Maya stepping aside.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import { PANEL, UI, withArticle } from '../www/whitestone/js/copy.js';
import { selectFromHit, stepOut, reconcile, suggestions, panelView, CHIPS } from '../www/whitestone/js/panel.js';
import { withExample } from '../www/whitestone/js/samples.js';
import { emptyDoc } from '../www/whitestone/js/store.js';
import { priceChoice, formatMoney } from '../www/whitestone/js/pricing.js';
import { roomName } from '../www/whitestone/js/taxonomy.js';

const WS = join(process.cwd(), 'www', 'whitestone');
const index = JSON.parse(readFileSync(join(WS, 'data', 'prices', 'index.json'), 'utf8'));
const SHEET = JSON.parse(readFileSync(join(WS, 'data', 'prices', `${index.cleaning}.json`), 'utf8'));
const NOW = new Date('2026-10-12T16:00:00Z');
const example = () => withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, null).doc.checklists[0];

describe('what a tap selects (pure)', () => {
    test('inside the open floor: a dot its task, anything else in a room its room; elsewhere the floor', () => {
        expect(selectFromHit({ level: 'main', roomId: 'r', itemId: 'i' }, 'main')).toEqual({ scope: 'task', level: 'main', roomId: 'r', itemId: 'i' });
        expect(selectFromHit({ level: 'main', roomId: 'r', itemId: null }, 'main')).toEqual({ scope: 'room', level: 'main', roomId: 'r', itemId: null });
        expect(selectFromHit({ level: 'main', roomId: null, itemId: null }, 'main')).toEqual({ scope: 'floor', level: 'main', roomId: null, itemId: null });
        // A closed floor, or another: the floor first.
        expect(selectFromHit({ level: 'second', roomId: 'r', itemId: 'i' }, 'main').scope).toBe('floor');
        expect(selectFromHit({ level: 'main', roomId: 'r', itemId: null }, null).scope).toBe('floor');
        expect(selectFromHit(null, 'main')).toBeNull();
        expect(selectFromHit({ level: null }, 'main')).toBeNull();
    });

    test('one step back at a time, to nothing', () => {
        const task = { scope: 'task', level: 'main', roomId: 'r', itemId: 'i' };
        expect(stepOut(task)).toEqual({ scope: 'room', level: 'main', roomId: 'r', itemId: null });
        expect(stepOut(stepOut(task))).toEqual({ scope: 'floor', level: 'main', roomId: null, itemId: null });
        expect(stepOut(stepOut(stepOut(task)))).toBeNull();
        expect(stepOut({ scope: 'house' })).toBeNull();
        expect(stepOut(null)).toBeNull();
    });

    test('a changed home keeps what is left of a selection', () => {
        const c = example();
        const room = c.rooms.find((r) => r.level === 'main');
        const item = c.items.find((i) => i.roomId === room.id);
        const task = { scope: 'task', level: 'main', roomId: room.id, itemId: item.id };
        expect(reconcile(task, c)).toBe(task);
        const gone = (list, id) => list.map((x) => (x.id === id ? { ...x, deletedAt: '2026-10-12T17:00:00.000Z' } : x));
        expect(reconcile(task, { ...c, items: gone(c.items, item.id) })).toEqual({ ...task, scope: 'room', itemId: null });
        expect(reconcile(task, { ...c, rooms: gone(c.rooms, room.id) })).toEqual({ scope: 'floor', level: 'main', roomId: null, itemId: null });
        expect(reconcile(task, { ...c, levels: c.levels.filter((l) => l !== 'main') })).toBeNull();
        // A room moved to another floor drops back to the floor selected.
        expect(reconcile({ ...task, level: 'second' }, c).scope).toBe('floor');
        expect(reconcile({ scope: 'house' }, c)).toEqual({ scope: 'house' });
        expect(reconcile(task, null)).toBeNull();
        expect(reconcile(null, c)).toBeNull();
    });
});

describe('the rooms a floor is offered (pure)', () => {
    const home = (rooms) => ({ rooms: rooms.map(([level, area], i) => ({ id: `r${i}`, level, area, deletedAt: null })) });

    test('the floor kind\'s usual rooms, in order, at most six', () => {
        expect(suggestions('main', home([]))).toEqual(CHIPS.main.slice(0, 6));
        expect(suggestions('garage', home([]))).toEqual(['garage']);
        expect(suggestions('nowhere', home([]))).toEqual(['bedroom', 'bathroom', 'closet']);
        expect(suggestions('main', home([]), 3)).toHaveLength(3);
    });

    test('one kitchen a home, one garage a garage, and as many bedrooms as you like', () => {
        expect(suggestions('main', home([['main', 'kitchen']]))).not.toContain('kitchen');
        expect(suggestions('basement', home([['main', 'laundry']]))).not.toContain('laundry');
        expect(suggestions('garage', home([['garage', 'garage']]))).toEqual([]);
        expect(suggestions('detached-garage', home([['garage', 'garage']]))).toEqual(['garage']);
        expect(suggestions('second', home([['second', 'bedroom'], ['second', 'bedroom']]))).toContain('bedroom');
        // A removed room is offered again.
        expect(suggestions('main', { rooms: [{ id: 'k', level: 'main', area: 'kitchen', deletedAt: 'x' }] })).toContain('kitchen');
    });

    test('every chip is a kind of room the taxonomy has', async () => {
        const { TAXONOMY } = await import('../www/whitestone/js/taxonomy.js');
        const areas = new Set(TAXONOMY.cleaning.areas.map((a) => a.key));
        for (const list of Object.values(CHIPS)) for (const a of list) expect(areas.has(a)).toBe(true);
        expect(Object.keys(CHIPS).sort()).toEqual(TAXONOMY.cleaning.levels.map((l) => l.key).sort());
    });
});

describe('what the panel says (pure)', () => {
    const c = example();
    const room = c.rooms.find((r) => r.level === 'main' && r.area === 'kitchen');
    const tasks = c.items.filter((i) => i.roomId === room.id && !i.deletedAt).sort((a, b) => a.order - b.order);
    const money = (items, area) => formatMoney(items.reduce((n, i) => n + priceChoice(SHEET, i, area).cents, 0));

    test('the whole house: its floors and how many rooms each has, and the checklist and home to open', () => {
        const v = panelView({ scope: 'house' }, c, SHEET);
        expect(v.title).toBe(c.title);
        expect(v.back).toBe(PANEL.close);
        expect(v.rows.map((r) => r.id)).toEqual(c.levels);
        expect(v.rows[0]).toMatchObject({ kind: 'floor', label: 'Basement', detail: PANEL.rooms(c.rooms.filter((r) => r.level === 'basement').length) });
        expect(v.actions.map((a) => a.id)).toEqual(['checklist', 'home']);
        expect(v.summary).toMatch(/^13 rooms, 27 tasks, \$\d+/);
    });

    test('a floor: its rooms with their tasks and price, rooms to add, and back to the whole house', () => {
        const v = panelView({ scope: 'floor', level: 'main' }, c, SHEET);
        expect(v.title).toBe('Main floor');
        expect(v.back).toBe(PANEL.back(PANEL.wholeHouse));
        const kitchenRow = v.rows.find((r) => r.id === room.id);
        expect(kitchenRow).toMatchObject({ kind: 'room', label: 'Kitchen', detail: `${PANEL.tasks(tasks.length)}, ${money(tasks, 'kitchen')}` });
        // The example has its kitchen: not offered again.
        expect(v.chips.map((ch) => ch.area)).not.toContain('kitchen');
        const office = panelView({ scope: 'floor', level: 'main' }, { ...c, rooms: [], items: [] }, SHEET).chips.find((ch) => ch.area === 'office');
        expect(office).toEqual({ area: 'office', label: 'Office', aria: 'Add an office with its standard tasks' });
        expect(v.empty).toBeNull();
        expect(panelView({ scope: 'floor', level: 'main' }, { ...c, rooms: [], items: [] }, SHEET).empty).toBe(PANEL.noRooms);
    });

    test('a room: its tasks in order with prices and stars, the time, and back to its floor', () => {
        const v = panelView({ scope: 'room', level: 'main', roomId: room.id }, c, SHEET);
        expect(v.title).toBe('Kitchen');
        expect(v.back).toBe(PANEL.back('the main floor'));
        expect(v.rows.map((r) => r.id)).toEqual(tasks.map((t) => t.id));
        expect(v.rows.map((r) => r.starred)).toEqual(tasks.map((t) => Boolean(t.important)));
        expect(v.rows[0].detail).toBe(formatMoney(priceChoice(SHEET, tasks[0], 'kitchen').cents));
        expect(v.summary).toMatch(new RegExp(`^${PANEL.tasks(tasks.length)}, \\$\\d+, about `));
        expect(v.actions.map((a) => a.id)).toEqual(['addTask', 'editRoom']);
    });

    test('a task: its price and time, what was chosen, its notes, and edit, star, remove', () => {
        const item = tasks.find((t) => t.notes) || tasks[0];
        const v = panelView({ scope: 'task', level: 'main', roomId: room.id, itemId: item.id }, c, SHEET);
        expect(v.back).toBe(PANEL.back('the kitchen'));
        expect(v.summary).toMatch(/^\$\d+, about /);
        if (item.notes) expect(v.detail).toContain(PANEL.notes(item.notes));
        expect(v.actions.map((a) => a.id)).toEqual(['editTask', 'starTask', 'removeTask']);
        expect(v.actions[1].label).toBe(item.important ? PANEL.unstar : PANEL.star);
    });

    test("a named room is what you go back to by its own name", () => {
        const named = c.rooms.find((r) => r.label);
        const item = c.items.find((i) => i.roomId === named.id);
        expect(panelView({ scope: 'task', level: named.level, roomId: named.id, itemId: item.id }, c, SHEET).back).toBe(PANEL.back(named.label));
    });

    test('without a sheet it says the counts and no prices', () => {
        const v = panelView({ scope: 'room', level: 'main', roomId: room.id }, c, null);
        expect(v.summary).toBe(PANEL.tasks(tasks.length));
        expect(v.rows.every((r) => r.detail === '')).toBe(true);
    });

    test('nothing selected, a room or task that is gone, or no checklist: no panel', () => {
        expect(panelView(null, c, SHEET)).toBeNull();
        expect(panelView({ scope: 'room', level: 'main', roomId: 'gone' }, c, SHEET)).toBeNull();
        expect(panelView({ scope: 'task', level: 'main', roomId: room.id, itemId: 'gone' }, c, SHEET)).toBeNull();
        expect(panelView({ scope: 'house' }, null, SHEET)).toBeNull();
    });

    test('the articles read right', () => {
        expect(withArticle('Office')).toBe('an office');
        expect(withArticle('Kitchen')).toBe('a kitchen');
        expect(withArticle('Entry')).toBe('an entry');
    });
});

// ---- Driven through the page ------------------------------------------------------------

let dom;

beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    installThree();
    dom = installDom();
});

afterEach(() => {
    dom.uninstall();
    jest.useRealTimers();
    delete globalThis.fetch;
});

/** Boot with the sheet, start a home with Maya, open its second floor too,
 *  and put her away, so the panel is what is being tried. */
async function bootHome() {
    globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(WS, String(url)), 'utf8')) });
    for (const id of ['ws-host', 'ws-panel', 'hud-rooms', 'ws-help-menu']) dom.el(id).hidden = true;
    const main = await import('../www/whitestone/js/main.js');
    await flushAsync(20);
    await jest.advanceTimersByTimeAsync(CONFIG.loadingReveal + CONFIG.guide.delay * 1000 + 200);
    main.__test__.state.reducedMotion = true;
    main.__test__.onHostButton('start');
    main.__test__.onFloor('second', true);
    main.__test__.onHostButton('skip');
    return main;
}

const shown = () => !dom.el('ws-panel').hidden;
const title = () => dom.el('panel-title').textContent;
const rows = () => dom.el('panel-list').children.map((li) => li.children[0]);
const stars = () => dom.el('panel-list').children.map((li) => li.children[1]);
const chip = (area) => dom.el('panel-chips').children.find((b) => b.id === `panel-chip-${area}`);
const action = (id) => dom.el('panel-actions').children.find((b) => b.id === `panel-${id}`);
const said = () => {
    jest.advanceTimersByTime(50);
    return dom.el('ws-live').textContent;
};
const checklist = (main) => main.__test__.active();

describe('the panel on the page', () => {
    test('a chip adds that room with its standard tasks, and shows them', async () => {
        const main = await bootHome();
        main.__test__.tapModel('main');
        expect(title()).toBe('Main floor');
        expect(dom.el('panel-empty').textContent).toBe(PANEL.noRooms);
        fire(chip('kitchen'), 'click');
        const c = checklist(main);
        expect(c.rooms).toHaveLength(1);
        expect(c.items.filter((i) => !i.deletedAt)).toHaveLength(9);
        expect(main.__test__.ui.selected.scope).toBe('room');
        expect(title()).toBe('Kitchen');
        expect(rows()).toHaveLength(9);
        // Back on the floor, no second kitchen is offered.
        fire(dom.el('panel-back'), 'click');
        expect(chip('kitchen')).toBeUndefined();
        expect(rows().map((r) => r.children[0].textContent)).toEqual(['Kitchen']);
    });

    test('a star stars a task, says so, and Undo takes it back', async () => {
        const main = await bootHome();
        main.__test__.tapModel('main');
        fire(chip('kitchen'), 'click');
        const star = stars()[0];
        expect(star.getAttribute('aria-pressed')).toBe('false');
        fire(star, 'click');
        const first = checklist(main).items.filter((i) => !i.deletedAt).sort((a, b) => a.order - b.order)[0];
        expect(first.important).toBe(true);
        expect(said()).toBe(PANEL.starred('Stovetop'));
        expect(stars()[0].getAttribute('aria-pressed')).toBe('true');
        fire(dom.el('ws-undo'), 'click');
        expect(checklist(main).items.find((i) => i.id === first.id).important).toBe(false);
        // Starred twice is starred no more.
        fire(stars()[0], 'click');
        fire(stars()[0], 'click');
        expect(checklist(main).items.find((i) => i.id === first.id).important).toBe(false);
        expect(said()).toBe(PANEL.unstarred('Stovetop'));
    });

    test("a room's tasks are listed in the order they will be done, and move as they are moved", async () => {
        const main = await bootHome();
        main.__test__.tapModel('main');
        fire(chip('kitchen'), 'click');
        const names = () => rows().map((r) => r.children[0].textContent);
        const before = names();
        const first = checklist(main).items.filter((i) => !i.deletedAt).sort((a, b) => a.order - b.order)[0];
        main.__test__.moveTask(first.id, 1);
        expect(names()).toEqual([before[1], before[0], ...before.slice(2)]);
    });

    test('a task: edit opens its card, star from its own button, remove steps back to the room with an undo', async () => {
        const main = await bootHome();
        main.__test__.tapModel('main');
        fire(chip('kitchen'), 'click');
        fire(rows()[1], 'click');
        expect(main.__test__.ui.selected.scope).toBe('task');
        const id = main.__test__.ui.selected.itemId;
        fire(action('starTask'), 'click');
        expect(checklist(main).items.find((i) => i.id === id).important).toBe(true);
        expect(action('starTask').textContent).toBe(PANEL.unstar);
        fire(action('editTask'), 'click');
        expect(dom.el('task').hidden).toBe(false);
        const { closeCard } = await import('../www/whitestone/js/cards.min.js');
        closeCard('task');
        fire(action('removeTask'), 'click');
        expect(checklist(main).items.find((i) => i.id === id).deletedAt).toBeTruthy();
        expect(main.__test__.ui.selected.scope).toBe('room');
        expect(rows()).toHaveLength(8);
        fire(dom.el('ws-undo'), 'click');
        expect(rows()).toHaveLength(9);
    });

    test('Another kind of room opens the room card on this floor; Add a task the task card for this room', async () => {
        const main = await bootHome();
        main.__test__.tapModel('second');
        fire(action('anotherRoom'), 'click');
        expect(dom.el('room').hidden).toBe(false);
        expect(dom.el('room-level').value).toBe('second');
        const { closeCard } = await import('../www/whitestone/js/cards.min.js');
        closeCard('room');
        fire(chip('bedroom'), 'click');
        fire(action('addTask'), 'click');
        expect(dom.el('task').hidden).toBe(false);
    });

    test('the Rooms chip opens the whole house, and the keyboard moves through its floors and into one', async () => {
        const main = await bootHome();
        expect(dom.el('hud-rooms').hidden).toBe(false);
        fire(dom.el('hud-rooms'), 'click');
        expect(shown()).toBe(true);
        expect(title()).toBe(checklist(main).title);
        expect(rows().map((r) => r.children[0].textContent)).toEqual(['Main floor', 'Second floor']);
        // The keyboard picks up on the first floor, and the arrows move on.
        expect(dom.documentStub.activeElement).toBe(rows()[0]);
        const ev = fire(dom.el('panel-list'), 'keydown', { key: 'ArrowDown', target: rows()[0] });
        expect(dom.documentStub.activeElement).toBe(rows()[1]);
        // The house does not turn for an arrow the list has answered.
        const yaw = main.__test__.turntable().yaw;
        fire(dom.documentStub, 'keydown', { ...ev, target: rows()[1] });
        expect(main.__test__.turntable().yaw).toBe(yaw);
        fire(rows()[1], 'click');
        expect(title()).toBe('Second floor');
        expect(main.__test__.model().lifted).toBe('second');
        // Back to the whole house closes it, and focus goes to the Rooms chip.
        fire(dom.el('panel-back'), 'click');
        expect(shown()).toBe(false);
        expect(dom.el('hud-rooms').focused).toBe(true);
    });

    test('Escape steps back through the selection, one step a press', async () => {
        const main = await bootHome();
        main.__test__.tapModel('main');
        fire(chip('kitchen'), 'click');
        fire(rows()[0], 'click');
        const key = () => fire(dom.documentStub, 'keydown', { key: 'Escape', target: dom.documentStub.body });
        const scopes = [];
        for (let i = 0; i < 3; i++) {
            key();
            scopes.push(main.__test__.ui.selected && main.__test__.ui.selected.scope);
        }
        expect(scopes).toEqual(['room', 'floor', null]);
        expect(main.__test__.model().lifted).toBeNull();
    });

    test("a room removed while selected leaves its floor selected; another checklist leaves nothing", async () => {
        const main = await bootHome();
        main.__test__.tapModel('main');
        fire(chip('kitchen'), 'click');
        fire(action('editRoom'), 'click');
        fire(dom.el('room-remove'), 'click');
        expect(main.__test__.ui.selected.scope).toBe('floor');
        expect(title()).toBe('Main floor');
        // A different checklist opened (My checklists): the selection goes,
        // even though it has a main floor too.
        main.__test__.duplicate(checklist(main).id);
        const copy = main.getDoc().checklists.find((x) => x.id !== main.__test__.ui.selected.checklistId);
        expect(copy.levels).toContain('main');
        main.__test__.openChecklist(copy.id);
        expect(main.__test__.ui.selected).toBeNull();
        expect(shown()).toBe(false);
    });

    test("Maya steps aside while the panel is open, and the guide counts rooms added from it", async () => {
        globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(WS, String(url)), 'utf8')) });
        for (const id of ['ws-host', 'ws-panel']) dom.el(id).hidden = true;
        const main = await import('../www/whitestone/js/main.js');
        await flushAsync(20);
        await jest.advanceTimersByTimeAsync(CONFIG.loadingReveal + CONFIG.guide.delay * 1000 + 200);
        main.__test__.state.reducedMotion = true;
        const t = main.__test__;
        t.onHostButton('start');
        t.onHostButton('next');
        t.onHostButton('kitchen');
        t.onHostButton('next');
        t.onHostButton('gotIt');
        expect(t.ui.guide.scene).toBe('rooms');
        t.tapModel('main');
        const loop = dom.loops[dom.loops.length - 1];
        jest.advanceTimersByTime(16);
        loop();
        expect(dom.el('ws-host').hidden).toBe(true);
        fire(chip('living'), 'click');
        expect(t.ui.guide.rooms).toBe(1);
        for (let i = 0; i < 2; i++) fire(dom.el('panel-back'), 'click');
        jest.advanceTimersByTime(16);
        loop();
        expect(dom.el('ws-host').hidden).toBe(false);
        expect(dom.el('host-actions').children.map((b) => b.textContent)).toContain('Review my checklist');
    });

    test('the panel goes beside Maya where there is room, and runs down toward the bottom', async () => {
        const main = await bootHome();
        main.__test__.tapModel('main');
        const p = main.__test__.panel();
        const el = dom.el('ws-panel');
        expect(p.anchor(500, 300, 1280, 800)).toBe(true);
        expect(el.classList.contains('is-anchored')).toBe(true);
        expect([el.style.left, el.style.top, el.style.maxHeight]).toEqual(['518px', '272px', `${800 - 272 - 16}px`]);
        // Never lower than four tenths down, so the list has room.
        p.anchor(500, 700, 1280, 800);
        expect(el.style.top).toBe('320px');
        expect(p.anchor(1100, 300, 1280, 800)).toBe(false);
        expect(el.style.left).toBe('');
        expect(el.style.maxHeight).toBe('');
    });

    test('before the sheet, a chip waits and says so', async () => {
        for (const id of ['ws-host', 'ws-panel']) dom.el(id).hidden = true;
        const main = await import('../www/whitestone/js/main.js');
        await flushAsync(20);
        await jest.advanceTimersByTimeAsync(CONFIG.loadingReveal + CONFIG.guide.delay * 1000 + 200);
        main.__test__.onHostButton('start');
        main.__test__.tapModel('main');
        fire(chip('kitchen'), 'click');
        expect(main.__test__.active().rooms).toHaveLength(0);
        expect(said()).toBe(UI.sheetLoading);
        expect(roomName('cleaning', { area: 'kitchen', label: '' })).toBe('Kitchen');
    });
});
