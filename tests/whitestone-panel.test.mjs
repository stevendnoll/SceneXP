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
import { selectFromHit, stepOut, reconcile, suggestions, panelView, CHIPS, COMMON, homeSuggestions } from '../www/whitestone/js/panel.js';
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
        // The kind of home first, which Your home can change.
        expect(v.summary).toMatch(/^A house\. 13 rooms, 27 tasks, \$\d+/);
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
    main.__test__.onHostButton('kind-house');
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
        t.onHostButton('kind-house');
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
        main.__test__.onHostButton('kind-house');
        main.__test__.tapModel('main');
        fire(chip('kitchen'), 'click');
        expect(main.__test__.active().rooms).toHaveLength(0);
        expect(said()).toBe(UI.sheetLoading);
        expect(roomName('cleaning', { area: 'kitchen', label: '' })).toBe('Kitchen');
    });
});

// ---- Bath types on the page (M2 step 4b) ------------------------------------------

describe('a bathroom\'s type of bath, on the page', () => {
    const bathButtons = () => dom.el('panel-baths-list').children;
    const bathButton = (key) => bathButtons().find((b) => b.id === `panel-bath-${key}`);
    const tasksIn = (main, roomId) => checklist(main).items.filter((i) => !i.deletedAt && i.roomId === roomId).map((i) => i.task);

    /** The second floor open, a bathroom added from its chip and shown. */
    async function bathroom() {
        const main = await bootHome();
        main.__test__.tapModel('second');
        fire(chip('bathroom'), 'click');
        const room = checklist(main).rooms.find((r) => r.area === 'bathroom');
        return { main, room };
    }

    test('a chip adds a full bath with its bathtub, and the panel offers its three types', async () => {
        const { main, room } = await bathroom();
        expect(room.bath).toBe('tub');
        expect(tasksIn(main, room.id)).toContain('bathtub');
        expect(dom.el('panel-baths').hidden).toBe(false);
        expect(dom.el('panel-baths-label').textContent).toBe(PANEL.bathHeading);
        expect(bathButtons().map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
            ['Full bath', 'true'], ['Shower bath', 'false'], ['Half bath', 'false']
        ]);
        // A floor has no types of bath.
        fire(dom.el('panel-back'), 'click');
        expect(dom.el('panel-baths').hidden).toBe(true);
    });

    test('Shower bath takes the bathtub off, says so, keeps the keyboard there, and Undo puts it back', async () => {
        const { main, room } = await bathroom();
        const before = tasksIn(main, room.id);
        fire(bathButton('shower'), 'click');
        const now = checklist(main).rooms.find((r) => r.id === room.id);
        expect(now.bath).toBe('shower');
        expect(tasksIn(main, room.id)).toEqual(before.filter((t) => t !== 'bathtub'));
        expect(said()).toBe('The bathroom is now a shower bath. Took off the bathtub.');
        expect(bathButton('shower').getAttribute('aria-pressed')).toBe('true');
        expect(document.activeElement).toBe(bathButton('shower'));
        expect(rows().map((r) => r.children[0].textContent)).not.toContain('Bathtub');
        // The pressed type again does nothing.
        const doc = main.__test__.state.doc;
        fire(bathButton('shower'), 'click');
        expect(main.__test__.state.doc).toBe(doc);
        fire(dom.el('ws-undo'), 'click');
        expect(checklist(main).rooms.find((r) => r.id === room.id).bath).toBe('tub');
        expect(tasksIn(main, room.id)).toEqual(before);
    });

    test('Half bath makes it the half bath, and Full bath brings its shower and tub back', async () => {
        const { main, room } = await bathroom();
        fire(bathButton('half'), 'click');
        expect(checklist(main).rooms.find((r) => r.id === room.id)).toMatchObject({ area: 'powder-room', bath: null });
        expect(title()).toBe('Half bath');
        expect(tasksIn(main, room.id)).not.toContain('shower');
        expect(main.__test__.ui.selected).toMatchObject({ scope: 'room', roomId: room.id });
        fire(bathButton('tub'), 'click');
        expect(title()).toBe('Bathroom');
        expect(tasksIn(main, room.id)).toEqual(expect.arrayContaining(['shower', 'bathtub']));
        expect(said()).toBe('The half bath is now a full bath. Added the shower and the bathtub.');
    });

    test('the room card offers the types, and a new type comes off with one undo, the name with it', async () => {
        const { main, room } = await bathroom();
        main.__test__.openRoom(room.id);
        const radios = dom.el('room-bath-list').children.map((r) => r.children[0]);
        expect(dom.el('room-bath-row').hidden).toBe(false);
        expect(radios.map((r) => [r.value, r.checked])).toEqual([['tub', true], ['shower', false], ['half', false]]);
        expect(dom.el('room-area').value).toBe('bathroom');
        radios.forEach((r) => { r.checked = r.value === 'shower'; });
        dom.el('room-label').value = 'Guest bath';
        main.__test__.submitRoom();
        const now = checklist(main).rooms.find((r) => r.id === room.id);
        expect(now).toMatchObject({ bath: 'shower', label: 'Guest bath' });
        expect(tasksIn(main, room.id)).not.toContain('bathtub');
        expect(said()).toBe('Guest bath is now a shower bath. Took off the bathtub.');
        fire(dom.el('ws-undo'), 'click');
        expect(checklist(main).rooms.find((r) => r.id === room.id)).toMatchObject({ bath: 'tub', label: '' });
        expect(tasksIn(main, room.id)).toContain('bathtub');
    });

    test('a half bath\'s card shows it as a bathroom of the half type; a kitchen\'s shows no types', async () => {
        const { main, room } = await bathroom();
        fire(bathButton('half'), 'click');
        main.__test__.openRoom(room.id);
        expect(dom.el('room-area').value).toBe('bathroom');
        expect(dom.el('room-bath-list').children.map((r) => r.children[0]).filter((r) => r.checked).map((r) => r.value)).toEqual(['half']);
        // No half bath in the kinds of room: it is a bathroom's type.
        expect(dom.el('room-area').children.map((o) => o.value)).not.toContain('powder-room');
        main.__test__.openRoom(null);
        expect(dom.el('room-bath-row').hidden).toBe(true);
        dom.el('room-area').value = 'kitchen';
        fire(dom.el('room-area'), 'change');
        expect(dom.el('room-bath-row').hidden).toBe(true);
        dom.el('room-area').value = 'primary-bathroom';
        fire(dom.el('room-area'), 'change');
        expect(dom.el('room-bath-list').children.map((r) => r.children[0].value)).toEqual(['tub', 'shower']);
        expect(dom.el('room-preset-list').textContent).toMatch(/Bathtub/);
        dom.el('room-bath-list').children.forEach((r) => { r.children[0].checked = r.children[0].value === 'shower'; });
        fire(dom.el('room-bath-list'), 'change');
        expect(dom.el('room-preset-list').textContent).not.toMatch(/Bathtub/);
    });

    test('a shower bath is not offered the bathtub, on its task card or on the service menu', async () => {
        const { main, room } = await bathroom();
        fire(bathButton('shower'), 'click');
        main.__test__.openTask(room.id, null);
        expect(dom.el('task-task').children.map((o) => o.value)).not.toContain('bathtub');
        expect(dom.el('task-task').children.map((o) => o.value)).toContain('shower');
        main.__test__.openMenu();
        dom.el('menu-area').value = 'bathroom';
        fire(dom.el('menu-area'), 'change');
        const menuRow = (name) => dom.el('menu-list').children.find((r) => r.children[0].children[0].textContent === name);
        expect(menuRow('Bathtub').children).toHaveLength(1);   // no "Add to"
        expect(menuRow('Shower').children[1].children.map((b) => b.textContent)).toEqual(['Add to Bathroom']);
    });

    test('before the sheet, a type waits and says so', async () => {
        const { main, room } = await bathroom();
        const sheet = main.__test__.state.sheet;
        main.__test__.state.sheet = null;
        fire(bathButton('shower'), 'click');
        expect(checklist(main).rooms.find((r) => r.id === room.id).bath).toBe('tub');
        expect(said()).toBe(UI.sheetLoading);
        main.__test__.state.sheet = sheet;
    });
});

// ---- Choose a time, publish, the receipt (M3 against the stand-in) ------------------

describe('choosing a time and publishing, on the page', () => {
    const action = (id) => dom.el('panel-actions').children.find((b) => b.id === `panel-${id}`);
    const dayButton = (date) => dom.el('booking-days').children.flatMap((row) => row.children).find((b) => b.id === `booking-day-${date}`);

    async function kitchenHome() {
        jest.setSystemTime(new Date('2026-10-14T16:00:00Z'));   // a Wednesday, 9:00 am in Seattle
        const main = await bootHome();
        main.__test__.tapModel('main');
        fire(chip('kitchen'), 'click');
        fire(dom.el('hud-rooms'), 'click');
        return main;
    }

    test('the whole house offers Choose a time, which opens on the earliest day with a time free', async () => {
        const main = await kitchenHome();
        expect(action('book').textContent).toBe(PANEL.book);
        await main.__test__.openBooking();
        expect(dom.el('booking').hidden).toBe(false);
        expect(dom.el('booking-month').textContent).toBe('October 2026');
        expect(dom.el('booking-summary').textContent).toMatch(/^Your visit takes about .+\. Your quote is \$\d+\.$/);
        // Tomorrow is the first day the notice allows; Sunday is closed.
        const b = main.__test__.ui.booking;
        expect(b.selected).toBe('2026-10-15');
        expect(dayButton('2026-10-15').getAttribute('aria-pressed')).toBe('true');
        expect(dayButton('2026-10-18').disabled).toBe(true);
        expect(dayButton('2026-10-18').getAttribute('aria-label')).toBe('Sunday, October 18, Closed');
        expect(dom.el('booking-day-title').textContent).toBe('Start times on Thursday, October 15');
        const times = dom.el('booking-times').children;
        expect(times.length).toBeGreaterThan(3);
        expect(times[0].children[0].checked).toBe(true);
        expect(dom.el('booking-confirm').disabled).toBe(false);
        // Another day, and the month after.
        fire(dayButton('2026-10-16'), 'click');
        expect(dom.el('booking-day-title').textContent).toBe('Start times on Friday, October 16');
        expect(dom.el('booking-prev').disabled).toBe(true);
    });

    test('Book and publish ends on the receipt: the time, the quote, the link, the PIN, a QR code, the edit link', async () => {
        const main = await kitchenHome();
        await main.__test__.openBooking();
        const result = await main.__test__.confirmBooking();
        expect(result.ok).toBe(true);
        expect(dom.el('booking').hidden).toBe(true);
        expect(dom.el('receipt').hidden).toBe(false);
        expect(dom.el('receipt-when').textContent).toMatch(/^Thursday, October 15, \d+:\d\d (am|pm) to about \d+:\d\d (am|pm)$/);
        expect(dom.el('receipt-pin').textContent).toMatch(/^\d{6}$/);
        expect(dom.el('receipt-link').value).toMatch(/^http:\/\/localhost:8000\/whitestone\/tasks\/\?c=[A-Za-z0-9_-]{22}#k=[A-Za-z0-9_-]{43}$/);
        expect(dom.el('receipt-edit-link').value).toMatch(/^http:\/\/localhost:8000\/whitestone\/\?edit=/);
        const svg = dom.el('receipt-qr-box').children[0];
        expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
        expect(svg.getAttribute('aria-label')).toBe('Scan to open the checklist');
        expect(dom.el('receipt-standin').hidden).toBe(false);
        expect(dom.el('receipt-calendar').getAttribute('download')).toBe('whitestone-visit-2026-10-15.ics');
        const c = main.__test__.active();
        expect(c.published.at).not.toBeNull();
        expect(c.booking.date).toBe('2026-10-15');
        // Saved with it, and Undo cannot take it back.
        expect(JSON.parse(localStorage.getItem(CONFIG.storage.key)).checklists[0].published.pin).toBe(c.published.pin);
        fire(dom.el('ws-undo'), 'click');
        expect(main.__test__.active().published.id).toBe(c.published.id);
        // The whole house now offers the visit, and opens the receipt again.
        fire(dom.el('receipt-done'), 'click');
        fire(dom.el('hud-rooms'), 'click');
        expect(action('visit').textContent).toBe(PANEL.visit);
        expect(action('book')).toBeUndefined();
        fire(action('visit'), 'click');
        await flushAsync(20);
        expect(dom.el('receipt').hidden).toBe(false);
    });

    test('a time just taken by someone else: said, the next opening chosen, and booked on the second try', async () => {
        const main = await kitchenHome();
        await main.__test__.openBooking();
        const { api } = await main.__test__.connect();
        const other = (await api.reserve()).data;
        // The first time the page offers, taken a moment before Confirm.
        const offered = main.__test__.ui.booking.days.find((d) => d.date === '2026-10-15').times[0];
        expect((await api.book(other.id, other.ownerToken, { date: '2026-10-15', time: offered, minutes: 60 })).ok).toBe(true);
        const first = await main.__test__.confirmBooking();
        expect(first.error).toBe('taken');
        expect(dom.el('booking-error').textContent).toMatch(/^That time was just taken\. Here are the next openings\. Friday, October 16 at 8:00 am/);
        expect(main.__test__.ui.booking.selected).toBe('2026-10-16');
        expect(dayButton('2026-10-15').disabled).toBe(true);
        expect((await main.__test__.confirmBooking()).ok).toBe(true);
    });

    test('the example offers no time to choose, and says why when asked', async () => {
        const main = await bootHome();
        main.__test__.showExample();
        fire(dom.el('hud-rooms'), 'click');
        expect(action('book')).toBeUndefined();
        await main.__test__.openBooking();
        expect(dom.el('booking').hidden).toBe(true);
    });
});

// ---- Arriving by the edit link (PLANNING 7.3) --------------------------------------------

describe('arriving by the edit link', () => {
    async function published() {
        jest.setSystemTime(new Date('2026-10-14T16:00:00Z'));
        const main = await bootHome();
        main.__test__.tapModel('main');
        fire(chip('kitchen'), 'click');
        await main.__test__.openBooking();
        await main.__test__.confirmBooking();
        const c = main.__test__.active();
        return { main, link: { id: c.published.id, key: c.published.key, ownerToken: c.published.ownerToken }, c };
    }

    test('on this device: that checklist opened, and Maya says how it was opened', async () => {
        const { main, link, c } = await published();
        main.__test__.state.doc = (await import('../www/whitestone/js/store.js')).setSettings(main.__test__.state.doc, { activeId: null }).doc;
        expect(await main.__test__.arriveByEditLink(link)).toBe(true);
        expect(main.__test__.active().id).toBe(c.id);
        expect(main.__test__.state.viaEdit).toBe(true);
    });

    test('after Start over (as on another device): brought back from the API, its PIN set anew on request', async () => {
        const { main, link, c } = await published();
        main.__test__.startOver();
        expect(main.__test__.state.doc.checklists).toEqual([]);
        expect(await main.__test__.arriveByEditLink(link)).toBe(true);
        const here = main.__test__.active();
        expect(here.id).not.toBe(c.id);
        expect(here).toMatchObject({ title: c.title, booking: c.booking });
        expect(here.published).toMatchObject({ id: link.id, pin: null });
        expect(JSON.parse(localStorage.getItem(CONFIG.storage.key)).checklists).toHaveLength(1);
        // Its receipt offers a new PIN, asked first.
        await main.__test__.openReceipt();
        expect(dom.el('receipt-new-pin').hidden).toBe(false);
        expect(dom.el('receipt-copy-pin').hidden).toBe(true);
        main.__test__.confirmNewPin();
        expect(dom.el('confirm').hidden).toBe(false);
        // The PIN is stretched on a real thread: real time to wait for it.
        jest.useRealTimers();
        fire(dom.el('confirm-actions').children[1], 'click');
        for (let i = 0; i < 200 && !main.__test__.active().published.pin; i++) await new Promise((r) => setTimeout(r, 10));
        expect(main.__test__.active().published.pin).toMatch(/^\d{6}$/);
    });

    test('a link that opens nothing changes nothing, and is said', async () => {
        const { main } = await published();
        const before = main.__test__.state.doc;
        expect(await main.__test__.arriveByEditLink({ id: 'Z'.repeat(22), key: 'k'.repeat(43), ownerToken: 'o'.repeat(43) })).toBe(false);
        expect(main.__test__.state.doc).toBe(before);
        expect(main.__test__.state.editLinkFailed).toBe(true);
    });
});


// ---- The common rooms (QA, 2026-10-14) -------------------------------------------------

describe('the common rooms only, each on its usual floor', () => {
    const home = (levels, rooms = []) => ({ levels, rooms: rooms.map(([area, level], i) => ({ id: `r${i}`, area, level })) });

    test('a floor\'s chips are the common kinds; the rest wait under Another kind of room', () => {
        const all = Object.values(CHIPS).flat();
        for (const rare of ['mudroom', 'pantry', 'closet', 'hallway', 'gym', 'nursery', 'playroom', 'stairs', 'patio', 'entry']) expect(all).not.toContain(rare);
        expect(suggestions('main', home(['main']))).toEqual(['kitchen', 'living', 'dining', 'powder-room', 'office', 'laundry']);
    });

    test('Maya\'s chips: most common first, on the floor each usually goes, six at most', () => {
        expect(homeSuggestions(home(['main']))).toEqual([
            { area: 'kitchen', level: 'main' }, { area: 'living', level: 'main' }, { area: 'primary-bedroom', level: 'main' },
            { area: 'primary-bathroom', level: 'main' }, { area: 'bedroom', level: 'main' }, { area: 'bathroom', level: 'main' }
        ]);
        const two = homeSuggestions(home(['basement', 'main', 'second', 'garage']), 12);
        const at = (area) => (two.find((x) => x.area === area) || {}).level;
        expect([at('kitchen'), at('primary-bedroom'), at('bedroom'), at('family'), at('garage'), at('laundry')]).toEqual(['main', 'second', 'second', 'basement', 'garage', 'main']);
        // A garage only where there is one.
        expect(homeSuggestions(home(['main']), 12).map((x) => x.area)).not.toContain('garage');
        expect(homeSuggestions(home(['main']), 12)).toHaveLength(COMMON.length - 1);
        // A condo (no main floor): its first.
        expect(homeSuggestions(home(['second']))[0]).toEqual({ area: 'kitchen', level: 'second' });
    });

    test('a kind a home has its one of is not offered again; a bedroom always is', () => {
        const h = home(['main', 'second'], [['kitchen', 'main'], ['primary-bedroom', 'second'], ['bedroom', 'second']]);
        const areas = homeSuggestions(h, 12).map((x) => x.area);
        expect(areas).not.toContain('kitchen');
        expect(areas).not.toContain('primary-bedroom');
        expect(areas).toContain('bedroom');
        // A garage already in the garage is not offered twice.
        expect(homeSuggestions(home(['main', 'garage'], [['garage', 'garage']]), 12).map((x) => x.area)).not.toContain('garage');
        // Removed rooms do not count.
        expect(homeSuggestions({ levels: ['main'], rooms: [{ id: 'k', area: 'kitchen', level: 'main', deletedAt: 'x' }] })[0].area).toBe('kitchen');
    });
});

describe('Maya\'s room chips on the page', () => {
    test('Your rooms: a chip adds the room on its usual floor, opens that floor, and the ringed kitchen chip keeps its ring through a redraw', async () => {
        const main = await bootHome();
        const t = main.__test__;
        // Back into the build at Your rooms, with a second floor.
        t.ui.guide = { ...t.ui.guide, scene: 'firstRoom', reached: 2 };
        t.showGuide();
        const chipOf = (area) => (dom.el('host-choices').children[0] || { children: [] }).children.find((b) => b.id === `host-chip-${area}`);
        expect(chipOf('kitchen').classList.contains('has-halo')).toBe(true);
        t.refresh();
        expect(chipOf('kitchen').classList.contains('has-halo')).toBe(true);
        t.ui.guide = { ...t.ui.guide, scene: 'rooms', reached: 3, rooms: 0 };
        t.showGuide();
        fire(chipOf('primary-bedroom'), 'click');
        const bed = t.active().rooms.find((r) => r.area === 'primary-bedroom');
        expect(bed.level).toBe('second');
        expect(t.model().lifted).toBe('second');
        expect(t.ui.guide).toMatchObject({ scene: 'rooms', rooms: 1 });
        // Not offered twice.
        expect(chipOf('primary-bedroom')).toBeUndefined();
    });
});
